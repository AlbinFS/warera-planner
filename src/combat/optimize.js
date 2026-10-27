/**
 * Our own optimizer on top of model.js.
 *
 * Gear for fixed skills:
 * - Armor and dodge come in breakpoints (whole percents), so for each percent
 *   only the cheapest gear that just reaches it is kept: chest + pants for
 *   armor, boots for dodge. Anything in between pays for nothing.
 * - Offense (weapon, ammo, helmet, gloves) keeps only combinations no other
 *   beats on both damage per swing and cost per swing.
 * - Every offense × defense × food option is then solved exactly: damage and
 *   cost are linear in the number of swings (food bought only past the free
 *   health), so each question has a closed-form answer per option.
 * Skills: a climb over skill layouts (raise one, lower one or two to pay)
 * from a few starts, each layout scored with its best gear. Offense and
 * defense options are cached per stat values.
 */
import { playerStats, wearPerSwing, itemPrice, softCapPercent, FOODS, AMMOS, HEALTH_COST } from './model.js';

// Offense options closer than this in cost per swing (G) count as one: the strongest is kept.
// The coarse size is for quick comparisons between neighbouring skill layouts.
const COST_BUCKET = 0.0005;
const COARSE_BUCKET = 0.004;
// Neighbours scored in full per climb step, after the quick comparison of all of them.
const FULL_SCORES_PER_STEP = 3;
const SLOTS = ['weapon', 'helmet', 'chest', 'pants', 'boots', 'gloves'];
export const FIGHT = ['attack', 'precision', 'criticalChance', 'criticalDamages', 'armor', 'dodge', 'health', 'lootChance', 'hunger'];

/** The model's config from market data. */
export const configOf = (market) => ({ items: market.gameConfigItems, skills: market.gameConfigSkills });

/** Market price of an equipment roll, or the median of that item's rolls when the exact roll has none. */
export function rollPrice(market, code, skills, priceKey) {
  const exact = market.equipmentPrices[priceKey(code, skills ?? {})];
  if (Number.isFinite(exact)) return exact;
  const prices = market.equipmentMarketRolls.filter((r) => r.code === code && r.averagePrice > 0).map((r) => r.averagePrice).sort((a, b) => a - b);
  return prices.length ? prices[prices.length >> 1] : null;
}

/** Keep items no other beats on every stat (higher is better) and on cost (lower). */
function pareto(list, stats, cost) {
  const sorted = [...list].sort((a, b) => cost(a) - cost(b));
  const kept = [];
  for (const x of sorted) if (!kept.some((k) => stats.every((s) => s(k) >= s(x)))) kept.push(x);
  return kept;
}

/** 2D frontier: higher value, lower cost. */
export function frontier2(list, value, cost) {
  const sorted = [...list].sort((a, b) => cost(a) - cost(b) || value(b) - value(a));
  const kept = [];
  let best = -Infinity;
  for (const x of sorted) if (value(x) > best + 1e-9) { kept.push(x); best = value(x); }
  return kept;
}

/**
 * Prepared market: per-slot frontiers that don't depend on the skills.
 * `locked`: slots fixed to a roll ({ code, skills, price }) or null (empty);
 * `lockedFood`: a food code, 'none', or undefined (free choice).
 */
export function prepare(market, { locked = {}, lockedFood } = {}) {
  const config = configOf(market);
  const rolls = Object.fromEntries(SLOTS.map((s) => [s, []]));
  for (const r of market.equipmentMarketRolls) {
    const slot = config.items[r.code]?.usage;
    if (rolls[slot] && r.averagePrice > 0) rolls[slot].push({ code: r.code, skills: r.skills, price: r.averagePrice });
  }
  const wearCache = new Map();
  const wearOf = (r, slot) => {
    if (!r) return 0;
    if (!wearCache.has(r)) wearCache.set(r, wearPerSwing(market, config, slot === 'weapon' ? 'weapon' : 'armor', r));
    return wearCache.get(r);
  };
  const stat = (k) => (r) => r.skills?.[k] ?? 0;
  const pick = (slot, list) => (slot in locked ? [locked[slot]] : [null, ...list]);
  const slots = {
    weapon: pick('weapon', pareto(rolls.weapon, [stat('attack'), stat('criticalChance')], (r) => wearOf(r, 'weapon'))),
    helmet: pick('helmet', frontier2(rolls.helmet, stat('criticalDamages'), (r) => wearOf(r, 'helmet'))),
    gloves: pick('gloves', frontier2(rolls.gloves, stat('precision'), (r) => wearOf(r, 'gloves'))),
    chest: pick('chest', frontier2(rolls.chest, stat('armor'), (r) => wearOf(r, 'chest'))),
    pants: pick('pants', frontier2(rolls.pants, stat('armor'), (r) => wearOf(r, 'pants'))),
    boots: pick('boots', frontier2(rolls.boots, stat('dodge'), (r) => wearOf(r, 'boots'))),
  };
  const ammos = 'ammo' in locked ? [locked.ammo] : [null, ...AMMOS.filter((a) => itemPrice(market, a) != null)];
  const foods = lockedFood === 'none' ? [null] : lockedFood ? [lockedFood] : [null, ...FOODS.filter((f) => itemPrice(market, f) != null)];
  // Armor from chest + pants: the cheapest pair per armor value.
  const pairs = new Map();
  for (const c of slots.chest) for (const p of slots.pants) {
    const value = (c?.skills.armor ?? 0) + (p?.skills.armor ?? 0);
    const cost = wearOf(c, 'chest') + wearOf(p, 'pants');
    const prev = pairs.get(value);
    if (!prev || cost < prev.cost) pairs.set(value, { chest: c, pants: p, value, cost });
  }
  return { market, config, slots, ammos, foods, armorPairs: [...pairs.values()], wearOf, pairCache: new Map(), cache: new Map() };
}

/** Defense options for the armor/dodge skill values: the cheapest gear per breakpoint, then the frontier. */
function defenseOptions(prep, stats) {
  const byArmor = new Map();
  for (const a of prep.armorPairs) {
    const pct = softCapPercent(stats.armor + a.value, stats.armorCap);
    const prev = byArmor.get(pct);
    if (!prev || a.cost < prev.cost) byArmor.set(pct, { ...a, pct });
  }
  const byDodge = new Map();
  for (const b of prep.slots.boots) {
    const pct = softCapPercent(stats.dodge + (b?.skills.dodge ?? 0), stats.dodgeCap);
    const cost = prep.wearOf(b, 'boots');
    const prev = byDodge.get(pct);
    if (!prev || cost < prev.cost) byDodge.set(pct, { boots: b, pct, cost });
  }
  const armors = frontier2([...byArmor.values()], (a) => a.pct, (a) => a.cost);
  const dodges = frontier2([...byDodge.values()], (d) => d.pct, (d) => d.cost);
  const combos = [];
  for (const a of armors) for (const d of dodges) {
    combos.push({ chest: a.chest, pants: a.pants, boots: d.boots, armor: a.pct, dodge: d.pct, hp: HEALTH_COST * (1 - a.pct / 100) * (1 - d.pct / 100), cost: a.cost + d.cost });
  }
  return frontier2(combos, (c) => -c.hp, (c) => c.cost);
}

/**
 * Offense options for the offense stats: frontier on (damage per swing, cost
 * per swing). Helmet and gloves meet the weapon only through its crit chance,
 * so their best pairs are found once per crit value; each weapon is tried
 * with those only.
 */
function offenseOptions(prep, stats, opts, bucket = COST_BUCKET) {
  const { market, config, slots, ammos } = prep;
  const pct = (code) => (code ? (config.items[code]?.flatStats?.percentAttack ?? 0) / 100 : 0);
  const mult = (1 + (opts.militaryRankPercent ?? 0) / 100) * (opts.multiplier ?? 1) * (1 + (opts.battleBonusPercent ?? 0) / 100);
  // model.js swingDamage, inlined: this runs tens of thousands of times per layout.
  const damage = (wAttack, wCrit, hCritDamage, gPrecision, ammoPct) => {
    let precision = stats.precision + gPrecision;
    let attack = stats.attack + wAttack;
    let crit = stats.criticalChance + wCrit;
    let critDamage = stats.criticalDamages + hCritDamage;
    if (precision > 100) { attack += (precision - 100) * stats.precisionOverflow; precision = 100; }
    if (crit > 100) { critDamage += (crit - 100) * stats.critOverflow; crit = 100; }
    const hit = precision / 100;
    return attack * mult * (1 + ammoPct) * ((1 - hit) * 0.5 + hit * (1 + (crit / 100) * (critDamage / 100)));
  };
  const v = (r, k) => r?.skills[k] ?? 0;
  const pairsFor = (crit) => {
    const key = `${stats.precision}|${stats.criticalDamages}|${stats.criticalChance + crit}`;
    if (!prep.pairCache.has(key)) {
      const pairs = [];
      for (const h of slots.helmet) for (const g of slots.gloves) {
        pairs.push({ h, g, f: damage(100, crit, v(h, 'criticalDamages'), v(g, 'precision'), 0), cost: prep.wearOf(h, 'helmet') + prep.wearOf(g, 'gloves') });
      }
      prep.pairCache.set(key, frontier2(pairs, (x) => x.f, (x) => x.cost));
    }
    return prep.pairCache.get(key);
  };
  const buckets = new Map();
  for (const w of slots.weapon) {
    const wCost = prep.wearOf(w, 'weapon');
    const pairs = pairsFor(v(w, 'criticalChance'));
    // A knife (or no weapon) fires no ammo: any ammo set is simply not used.
    const usable = [...new Set(ammos.map((a) => (a && w && w.code !== 'knife' ? a : null)))];
    for (const ammo of usable) {
      const aCost = ammo ? itemPrice(market, ammo) : 0;
      const aPct = pct(ammo);
      for (const pair of pairs) {
        const cost = wCost + aCost + pair.cost;
        const d = damage(v(w, 'attack'), v(w, 'criticalChance'), v(pair.h, 'criticalDamages'), v(pair.g, 'precision'), aPct);
        const key = Math.round(cost / bucket);
        const prev = buckets.get(key);
        if (!prev || d > prev.dmg) buckets.set(key, { weapon: w, ammo, helmet: pair.h, gloves: pair.g, dmg: d, cost });
      }
    }
  }
  return frontier2([...buckets.values()], (o) => o.dmg, (o) => o.cost);
}

/**
 * The phases of a fight: each with a damage multiplier and the health and food
 * it offers. A window (with or without the pill) is one phase: the full bar
 * plus its hours of regen. A session longer than the pill's buff (8 h) goes
 * on in the debuff at its malus, on regen only.
 * opts: { pill, hours, buffHours?, debuffMultiplier?, supply?, multiplier? }
 *   supply: { health, foodMax } replaces it all with one phase (current bars).
 */
export function phasesFor(config, stats, food, opts) {
  const pill = (config.items.cocain?.flatStats?.percentAttack ?? 60) / 100;
  const heal = food ? stats.health * ((config.items[food]?.flatStats?.healthRegenPercent ?? 0) / 100) : 0;
  const regen = (hours, fullBar) => ({ health: stats.health * ((fullBar ? 1 : 0) + hours / 10), foodMax: food ? Math.floor(stats.hunger * ((fullBar ? 1 : 0) + hours / 10)) : 0, heal });
  if (opts.supply) return [{ multiplier: opts.multiplier ?? 1, health: opts.supply.health, foodMax: food ? opts.supply.foodMax : 0, heal }];
  const hours = opts.hours ?? 8;
  if (!opts.pill) return [{ multiplier: 1, ...regen(hours, true) }];
  const buff = Math.min(hours, opts.buffHours ?? config.items.cocain?.flatStats?.buffDurationHours ?? 8);
  const phases = [{ multiplier: 1 + pill, ...regen(buff, true) }];
  if (hours > buff) phases.push({ multiplier: opts.debuffMultiplier ?? 1 - pill, ...regen(hours - buff, false) });
  return phases;
}

/** Everything a layout needs to be solved: options and per-option economics. */
function layout(prep, levels, prestige, opts) {
  const { market, config } = prep;
  const stats = playerStats(config, levels, prestige);
  // Offense is scored at ×1; each phase scales it by its multiplier.
  const fightOpts = { ...opts, multiplier: 1 };
  const bucket = opts.coarse ? COARSE_BUCKET : COST_BUCKET;
  const offKey = `o${bucket}|${stats.attack}|${stats.precision}|${stats.criticalChance}|${stats.criticalDamages}|${opts.militaryRankPercent}|${opts.battleBonusPercent}`;
  const defKey = `d${stats.armor}|${stats.dodge}`;
  if (!prep.cache.has(offKey)) prep.cache.set(offKey, offenseOptions(prep, stats, fightOpts, bucket));
  if (!prep.cache.has(defKey)) prep.cache.set(defKey, defenseOptions(prep, stats));
  const foods = prep.foods.map((food) => ({ food, price: food ? itemPrice(market, food) : 0, phases: phasesFor(config, stats, food, opts) }));
  const cases = (stats.lootChance / 100) * ((itemPrice(market, 'case1') ?? 0) + 0.01 * (itemPrice(market, 'case2') ?? 0));
  const pill = opts.pill && !opts.supply ? itemPrice(market, 'cocain') ?? 0 : 0;
  return { stats, offs: prep.cache.get(offKey), defs: prep.cache.get(defKey), foods, cases, pill };
}

/**
 * The kinds of swing one option offers: per phase, swings on free health and
 * swings paid for with food. Each: how many, damage per swing, cost per swing
 * (net of case drops), food per swing.
 */
function segmentsOf(L, o, d, f) {
  const base = o.cost + d.cost - L.cases;
  const out = [];
  f.phases.forEach((p, phase) => {
    const dmg = o.dmg * p.multiplier;
    out.push({ phase, food: 0, cap: p.health / d.hp, dmg, cost: base });
    if (p.foodMax > 0 && p.heal > 0) out.push({ phase, food: d.hp / p.heal, cap: (p.foodMax * p.heal) / d.hp, dmg, cost: base + f.price * (d.hp / p.heal) });
  });
  return out;
}

/** Totals of a fill: [{ seg, x }]. */
function totals(fill) {
  let damage = 0, cost = 0, swings = 0, foodEaten = 0;
  for (const { seg, x } of fill) { damage += x * seg.dmg; cost += x * seg.cost; swings += x; foodEaten += x * seg.food; }
  return { damage, cost, swings, foodEaten };
}

/**
 * Most damage with income − cost + fixed ≥ −limit: every swing that pays for
 * itself, then the others by damage per gold lost (exact, since everything is
 * linear in the swings).
 */
function fillForDamage(segs, rate, fixed, limit) {
  const fill = [];
  let room = fixed + limit;
  const losing = [];
  for (const seg of segs) {
    const gain = rate * seg.dmg - seg.cost;
    if (gain >= 0) { fill.push({ seg, x: seg.cap }); room += gain * seg.cap; } else losing.push({ seg, loss: -gain });
  }
  if (room < 0) return null;
  losing.sort((a, b) => b.seg.dmg / b.loss - a.seg.dmg / a.loss);
  for (const { seg, loss } of losing) {
    if (room <= 0) break;
    const x = Math.min(seg.cap, room / loss);
    fill.push({ seg, x });
    room -= x * loss;
  }
  return fill;
}

/** Cheapest fill reaching `target` damage: swings that earn first, then by cost per damage. */
function fillForTarget(segs, target) {
  const sorted = [...segs].sort((a, b) => a.cost / a.dmg - b.cost / b.dmg);
  const fill = [];
  let need = target;
  for (const seg of sorted) {
    if (seg.cost < 0) { fill.push({ seg, x: seg.cap }); need -= seg.cap * seg.dmg; continue; }
    if (need <= 0) break;
    const x = Math.min(seg.cap, need / seg.dmg);
    fill.push({ seg, x });
    need -= x * seg.dmg;
  }
  return need > 1e-6 ? null : fill;
}

/** A fill as a build: gear, food, swings, damage, cost (net of credits), net under the terms. */
function buildOf(L, o, d, f, fill, terms) {
  const t = totals(fill);
  const cost = t.cost + L.pill;
  const income = ((terms.bounty ?? 0) + (terms.perK ?? 0)) * t.damage / 1000 + (terms.flat ?? 0);
  const phases = f.phases.map((p, i) => ({ multiplier: p.multiplier, ...totals(fill.filter((x) => x.seg.phase === i)) }));
  return {
    damage: t.damage, cost, income, net: income + (terms.economy ?? 0) - cost, swings: t.swings, foodEaten: t.foodEaten, food: f.food,
    perSwing: o.dmg, healthPerSwing: d.hp, armor: d.armor, dodge: d.dodge, phases, cases: L.cases, stats: L.stats,
    gear: { weapon: o.weapon, ammo: o.ammo, helmet: o.helmet, gloves: o.gloves, chest: d.chest, pants: d.pants, boots: d.boots },
  };
}

/** "More damage within the limit wins; ties go to the better net." */
export const better = (a, b) => !!a && (!b || a.damage > b.damage * (1 + 1e-6) || (Math.abs(a.damage - b.damage) <= b.damage * 1e-6 && a.net > b.net + 1e-6));

const ctxOf = (prep, levels, player, opts) => layout(prep, levels, player.prestige, { ...opts, militaryRankPercent: player.militaryRankPercent });

/**
 * Most damage with net ≥ −limit (limit Infinity: most damage at all; with no
 * terms, net = −cost, so `limit` is then a budget). Swings stop short of the
 * bars when that keeps the net inside the limit.
 */
export function strongest(prep, levels, player, opts, terms = {}, limit = Infinity) {
  const L = ctxOf(prep, levels, player, opts);
  const rate = ((terms.bounty ?? 0) + (terms.perK ?? 0)) / 1000;
  const fixed = (terms.flat ?? 0) + (terms.economy ?? 0) - L.pill;
  // The same fill as fillForDamage, in plain numbers (this loop runs ~10^5 times per layout).
  const cap = new Float64Array(4), mult = new Float64Array(4), extra = new Float64Array(4), dmg = new Float64Array(4), loss = new Float64Array(4);
  const order = [0, 0, 0, 0];
  let best = null;
  for (const f of L.foods) for (const d of L.defs) {
    let n = 0;
    for (const p of f.phases) {
      cap[n] = p.health / d.hp; mult[n] = p.multiplier; extra[n] = 0; n++;
      if (p.foodMax > 0 && p.heal > 0) { cap[n] = (p.foodMax * p.heal) / d.hp; mult[n] = p.multiplier; extra[n] = f.price * (d.hp / p.heal); n++; }
    }
    for (const o of L.offs) {
      const base = o.cost + d.cost - L.cases;
      let room = fixed + limit;
      let gains = 0;
      let damage = 0;
      let m = 0;
      for (let i = 0; i < n; i++) {
        dmg[i] = o.dmg * mult[i];
        const gain = rate * dmg[i] - base - extra[i];
        if (gain >= 0) { room += gain * cap[i]; gains += gain * cap[i]; damage += dmg[i] * cap[i]; } else { loss[i] = -gain; order[m++] = i; }
      }
      if (room < 0) continue;
      // Losing kinds by damage per gold lost (at most 4: insertion sort).
      for (let a = 1; a < m; a++) for (let b = a; b > 0 && dmg[order[b]] / loss[order[b]] > dmg[order[b - 1]] / loss[order[b - 1]]; b--) [order[b], order[b - 1]] = [order[b - 1], order[b]];
      let spent = 0;
      for (let k = 0; k < m && room > spent; k++) {
        const i = order[k];
        const x = Math.min(cap[i], (room - spent) / loss[i]);
        damage += x * dmg[i];
        spent += x * loss[i];
      }
      const net = fixed + gains - spent;
      if (best && !(damage > best.damage * (1 + 1e-6) || (Math.abs(damage - best.damage) <= best.damage * 1e-6 && net > best.net + 1e-6))) continue;
      best = { damage, net, o, d, f };
    }
  }
  if (!best) return null;
  const fill = fillForDamage(segmentsOf(L, best.o, best.d, best.f), rate, fixed, limit);
  return buildOf(L, best.o, best.d, best.f, fill, terms);
}

/**
 * Cheapest builds reaching each of `targets` damage (one pass over the
 * options for all targets). Per option the kinds of swing are taken cheapest
 * per damage first (those that earn, i.e. cost below 0, always). Returns one
 * build per target; a target no option reaches gets the strongest build,
 * marked reachedTarget: false.
 */
export function cheapestMany(prep, levels, player, opts, targets) {
  const L = ctxOf(prep, levels, player, opts);
  const cap = new Float64Array(4), mult = new Float64Array(4), extra = new Float64Array(4), dmg = new Float64Array(4), cost = new Float64Array(4);
  const order = [0, 1, 2, 3];
  const best = targets.map(() => null);
  let top = null;
  for (const f of L.foods) for (const d of L.defs) {
    let n = 0;
    for (const p of f.phases) {
      cap[n] = p.health / d.hp; mult[n] = p.multiplier; extra[n] = 0; n++;
      if (p.foodMax > 0 && p.heal > 0) { cap[n] = (p.foodMax * p.heal) / d.hp; mult[n] = p.multiplier; extra[n] = f.price * (d.hp / p.heal); n++; }
    }
    for (const o of L.offs) {
      const base = o.cost + d.cost - L.cases;
      let maxDamage = 0;
      for (let i = 0; i < n; i++) { dmg[i] = o.dmg * mult[i]; cost[i] = base + extra[i]; order[i] = i; maxDamage += dmg[i] * cap[i]; }
      if (!top || maxDamage > top.damage) top = { damage: maxDamage, o, d, f };
      for (let a = 1; a < n; a++) for (let b = a; b > 0 && cost[order[b]] / dmg[order[b]] < cost[order[b - 1]] / dmg[order[b - 1]]; b--) [order[b], order[b - 1]] = [order[b - 1], order[b]];
      for (let t = 0; t < targets.length; t++) {
        if (maxDamage < targets[t]) continue;
        let need = targets[t];
        let spent = 0;
        for (let k = 0; k < n; k++) {
          const i = order[k];
          if (cost[i] < 0) { spent += cost[i] * cap[i]; need -= dmg[i] * cap[i]; continue; }
          if (need <= 0) break;
          const x = Math.min(cap[i], need / dmg[i]);
          spent += x * cost[i];
          need -= x * dmg[i];
        }
        if (need > 1e-6) continue;
        if (!best[t] || spent < best[t].spent - 1e-9) best[t] = { spent, o, d, f };
      }
    }
  }
  return targets.map((target, t) => {
    const b = best[t];
    if (b) return { ...buildOf(L, b.o, b.d, b.f, fillForTarget(segmentsOf(L, b.o, b.d, b.f), target), {}), reachedTarget: true };
    if (!top) return null;
    return { ...buildOf(L, top.o, top.d, top.f, segmentsOf(L, top.o, top.d, top.f).map((seg) => ({ seg, x: seg.cap })), {}), reachedTarget: false };
  });
}

/** Cheapest build reaching `target` damage (or the strongest, if none can). */
export function cheapest(prep, levels, player, opts, target) {
  return cheapestMany(prep, levels, player, opts, [target])[0];
}

/** Builds across the damage range that no other beats on both damage and cost. */
export function buildFrontier(prep, levels, player, opts) {
  const L = ctxOf(prep, levels, player, opts);
  const all = [];
  for (const f of L.foods) for (const d of L.defs) for (const o of L.offs) {
    // Each option filled cheapest-first, with a point at every kind of swing it adds.
    const sorted = segmentsOf(L, o, d, f).sort((a, b) => a.cost / a.dmg - b.cost / b.dmg);
    const fill = [];
    let damage = 0, cost = L.pill;
    for (const seg of sorted) {
      fill.push({ seg, x: seg.cap });
      damage += seg.cap * seg.dmg;
      cost += seg.cap * seg.cost;
      all.push({ o, d, f, n: fill.length, damage, cost, sorted });
    }
  }
  return frontier2(all, (x) => x.damage, (x) => x.cost)
    .map((x) => buildOf(L, x.o, x.d, x.f, x.sorted.slice(0, x.n).map((seg) => ({ seg, x: seg.cap })), {}));
}

/** Point cost of a level of a skill, from the game config. */
export const levelCost = (config, skill, level) => config.skills[skill]?.levels?.[level]?.totalCost ?? (level * (level + 1)) / 2;

/** Highest level of a skill the player can have at their level. */
export function maxLevel(config, skill, playerLevel) {
  const levels = config.skills[skill]?.levels ?? {};
  return Math.max(0, ...Object.keys(levels).map(Number).filter((n) => (levels[n]?.unlockAtLevel ?? 0) <= playerLevel));
}

/**
 * Best skill layout. score(levels) → result; isBetter(a, b) compares results.
 * searched: the skills to move; budget: points for them (the rest of `start`
 * stays). Climbs from `start` and from spread layouts; keeps the best.
 */
export function bestLayout(prep, { start, searched = FIGHT, budget, playerLevel, score, quickScore = null, isBetter = better, onStep, shouldStop }) {
  const { config } = prep;
  const scored = new Map();
  const used = (l) => searched.reduce((t, s) => t + levelCost(config, s, l[s] ?? 0), 0);
  const max = Object.fromEntries(searched.map((s) => [s, maxLevel(config, s, playerLevel)]));
  const fits = (l) => used(l) <= budget && searched.every((s) => l[s] >= 0 && l[s] <= max[s]);
  const keyOf = (l) => searched.map((s) => l[s]).join(',');
  const scoreOf = (l) => {
    const key = keyOf(l);
    if (!scored.has(key)) scored.set(key, score(l));
    return scored.get(key);
  };
  const quick = new Map();
  const quickOf = (l) => {
    const key = keyOf(l);
    if (scored.has(key)) return scored.get(key);
    if (!quick.has(key)) quick.set(key, quickScore(l));
    return quick.get(key);
  };
  const neighbours = (l) => {
    const out = [];
    for (const up of searched) {
      if (l[up] >= max[up]) continue;
      const raised = { ...l, [up]: l[up] + 1 };
      if (fits(raised)) { out.push(raised); continue; }
      for (const a of searched) {
        if (a === up || raised[a] <= 0) continue;
        const one = { ...raised, [a]: raised[a] - 1 };
        if (fits(one)) { out.push(one); continue; }
        for (const b of searched) {
          if (b === up || b <= a || one[b] <= 0) continue;
          const two = { ...one, [b]: one[b] - 1 };
          if (fits(two)) out.push(two);
        }
      }
    }
    return out;
  };
  let steps = 0;
  const climb = (levels) => {
    let best = scoreOf(levels);
    for (;;) {
      if (shouldStop?.()) break;
      let winner = null;
      let winnerLevels = null;
      let candidates = neighbours(levels);
      if (quickScore) {
        // Rank every neighbour quickly; score the most promising few in full.
        const ranked = candidates.map((l) => ({ l, r: quickOf(l) })).filter((x) => x.r);
        ranked.sort((a, b) => (isBetter(a.r, b.r) ? -1 : isBetter(b.r, a.r) ? 1 : 0));
        candidates = ranked.slice(0, FULL_SCORES_PER_STEP).map((x) => x.l);
      }
      for (const l of candidates) {
        const r = scoreOf(l);
        if (isBetter(r, winner)) { winner = r; winnerLevels = l; }
      }
      if (!isBetter(winner, best)) break;
      levels = winnerLevels;
      best = winner;
      steps++;
      onStep?.({ step: steps, levels, best, checked: scored.size, budget, used: used(levels) });
    }
    return { levels, best };
  };
  const trim = (l) => {
    l = { ...l };
    while (used(l) > budget) {
      const top = searched.reduce((a, b) => ((l[b] ?? 0) > (l[a] ?? 0) ? b : a));
      l[top]--;
    }
    return l;
  };
  const spread = (weights) => {
    let l = { ...start, ...Object.fromEntries(searched.map((s) => [s, 0])) };
    for (let grew = true; grew;) {
      grew = false;
      const order = searched.filter((s) => (weights[s] ?? 0) > 0).sort((a, b) => l[a] / weights[a] - l[b] / weights[b]);
      for (const s of order) {
        const next = { ...l, [s]: l[s] + 1 };
        if (fits(next)) { l = next; grew = true; break; }
      }
    }
    return l;
  };
  const even = Object.fromEntries(FIGHT.map((s) => [s, 1]));
  const starts = [trim(start), spread(even), spread({ ...even, attack: 1.3, lootChance: 0.8, hunger: 0.6 })];
  let result = null;
  for (const s of starts) {
    if (shouldStop?.()) break;
    const r = climb(s);
    if (!result || isBetter(r.best, result.best)) result = r;
  }
  return { ...result, steps, checked: scored.size, budget, used: used(result.levels) };
}
