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
import { minPoints, maxRank } from '../lib/prestige.js';

// Offense options closer than this in cost per swing (G) count as one: the strongest is kept.
// (0.005 gave the same best builds as 0.0005, to the unit, in every test case, in a third less time.)
const COST_BUCKET = 0.004;
// Helmet and gloves wear only on hits taken, so an offense option's cost depends on the dodge %.
// Options are kept if they're on the frontier at any of this many dodge %s across the range
// (5: the same best layouts as pricing every dodge % exactly, at under half the time).
const KEEP_STEPS = 5;
// Gold the limit may be missed by from rounding alone: the fast loop and fillForDamage add the
// same numbers in another order, so a limit used to the last gold can come out a hair either side.
const ROUNDING = 1e-6;
const SLOTS =['weapon', 'helmet', 'chest', 'pants', 'boots', 'gloves'];
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
 * 2D frontier that also keeps equal-cost items with lower values: armor and
 * dodge only count in whole percents, so a roll that costs the same but sits
 * lower can be the one landing exactly on a step.
 */
function frontierTies(list, value, cost) {
  const sorted = [...list].sort((a, b) => cost(a) - cost(b) || value(b) - value(a));
  const kept = [];
  let best = -Infinity, group = -Infinity, groupCost = NaN;
  for (const x of sorted) {
    if (!(Math.abs(cost(x) - groupCost) <= 1e-9)) { best = Math.max(best, group); group = -Infinity; groupCost = cost(x); }
    if (value(x) > best + 1e-9) { kept.push(x); group = Math.max(group, value(x)); }
  }
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
    chest: pick('chest', frontierTies(rolls.chest, stat('armor'), (r) => wearOf(r, 'chest'))),
    pants: pick('pants', frontierTies(rolls.pants, stat('armor'), (r) => wearOf(r, 'pants'))),
    boots: pick('boots', frontierTies(rolls.boots, stat('dodge'), (r) => wearOf(r, 'boots'))),
  };
  const ammos = 'ammo' in locked ? [locked.ammo] : [null, ...AMMOS.filter((a) => itemPrice(market, a) != null)];
  const foods = lockedFood === 'none' ? [null] : lockedFood ? [lockedFood] : [null, ...FOODS.filter((f) => itemPrice(market, f) != null)];
  // Armor from chest + pants: the cheapest pair per armor value.
  const pairs = new Map();
  for (const c of slots.chest) for (const p of slots.pants) {
    const value = (c?.skills.armor ?? 0) + (p?.skills.armor ?? 0);
    const cost = wearOf(c, 'chest') + wearOf(p, 'pants');
    const prev = pairs.get(value);
    if (!prev || cost < prev.cost - 1e-9) pairs.set(value, { chest: c, pants: p, value, cost });
  }
  // Most a helmet and gloves can wear per hit taken: bounds what a dodge % can save on them.
  const maxOffArmor = Math.max(0, ...slots.helmet.map((r) => wearOf(r, 'helmet'))) + Math.max(0, ...slots.gloves.map((r) => wearOf(r, 'gloves')));
  // The least share of hits taken any build can have (the most dodge: skill and boots at their top).
  const dodgeLevels = config.skills.dodge?.levels ?? {};
  const topDodge = Math.max(0, ...Object.values(dodgeLevels).map((l) => l.value ?? 0)) + Math.max(0, ...slots.boots.map((b) => b?.skills.dodge ?? 0));
  const minKeep = 1 - softCapPercent(topDodge, config.skills.dodge?.softCap ?? 40) / 100;
  return {
    market, config, slots, ammos, foods, armorPairs: [...pairs.values()], wearOf, maxOffArmor, minKeep,
    pairCache: new Map(), defCache: new Map(), offCache: new Map(), offByDodge: new Map(), profitCache: new Map(),
  };
}

// Caches by stat values grow with every layout a search tries: on the real market 150 layouts
// kept 330 MB, and each of a search's workers keeps its own (the page crashed). Past these many
// entries the least recently used go (a climb mostly comes back to nearby stats).
const KEEP = { pairCache: 400, defCache: 200, offCache: 40, offByDodge: 400, profitCache: 100 };
function remembered(prep, name, key, make) {
  const map = prep[name];
  let v = map.get(key);
  if (v !== undefined) {
    map.delete(key);
  } else {
    v = make();
    if (map.size >= KEEP[name]) map.delete(map.keys().next().value);
  }
  map.set(key, v);
  return v;
}

/**
 * Defense options for the armor/dodge skill values: the cheapest gear per
 * breakpoint, then the combinations worth keeping. Armor wears only on hits
 * taken, so a combination's wear per swing is (1 − dodge %) × its armor wear,
 * and its dodge also spares the helmet and gloves: a combination is dropped
 * only when another loses no more health and costs no more with any helmet
 * and gloves (checked at none and at the most they can wear).
 */
function defenseOptions(prep, stats) {
  const byArmor = new Map();
  for (const a of prep.armorPairs) {
    const pct = softCapPercent(stats.armor + a.value, stats.armorCap);
    const prev = byArmor.get(pct);
    // Cheapest per step; at the same cost the lower value, so no point sits above the step.
    if (!prev || a.cost < prev.cost - 1e-9 || (a.cost <= prev.cost + 1e-9 && a.value < prev.value)) byArmor.set(pct, { ...a, pct });
  }
  const byDodge = new Map();
  for (const b of prep.slots.boots) {
    const pct = softCapPercent(stats.dodge + (b?.skills.dodge ?? 0), stats.dodgeCap);
    const cost = prep.wearOf(b, 'boots');
    const value = b?.skills.dodge ?? 0;
    const prev = byDodge.get(pct);
    if (!prev || cost < prev.cost - 1e-9 || (cost <= prev.cost + 1e-9 && value < prev.value)) byDodge.set(pct, { boots: b, pct, cost, value });
  }
  const armors = frontier2([...byArmor.values()], (a) => a.pct, (a) => a.cost);
  const dodges = frontier2([...byDodge.values()], (d) => d.pct, (d) => d.cost);
  const combos = [];
  for (const a of armors) for (const d of dodges) {
    const keep = 1 - d.pct / 100;
    combos.push({ chest: a.chest, pants: a.pants, boots: d.boots, armor: a.pct, dodge: d.pct, keep, hp: HEALTH_COST * (1 - a.pct / 100) * keep, cost: keep * (a.cost + d.cost) });
  }
  const X = prep.maxOffArmor;
  combos.sort((a, b) => a.hp - b.hp || a.cost - b.cost);
  const kept = [];
  for (const c of combos) {
    if (!kept.some((k) => k.hp <= c.hp + 1e-12 && k.cost <= c.cost + 1e-12 && k.cost + k.keep * X <= c.cost + c.keep * X + 1e-12)) kept.push(c);
  }
  return kept;
}

/**
 * Offense options for the offense stats at a dodge %: frontier on (damage per
 * swing, cost per swing). Helmet and gloves are armor, so they wear only on
 * hits taken (`keep` = 1 − dodge %). They meet the weapon only through its
 * crit chance, so their best pairs are found once per crit value; each weapon
 * is tried with those only.
 */
function offenseCandidates(prep, stats, opts) {
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
    return remembered(prep, 'pairCache', key, () => {
      const pairs = [];
      for (const h of slots.helmet) for (const g of slots.gloves) {
        pairs.push({ h, g, f: damage(100, crit, v(h, 'criticalDamages'), v(g, 'precision'), 0), cost: prep.wearOf(h, 'helmet') + prep.wearOf(g, 'gloves') });
      }
      return frontier2(pairs, (x) => x.f, (x) => x.cost);
    });
  };
  // Cost per swing is fixed + keep × armor (keep = 1 − dodge %, between minKeep and 1). The options
  // kept are those on the frontier at any of a few keeps across that range (KEEP_STEPS), bucketed
  // as COST_BUCKET does; each dodge % then prices them exactly (offenseOptions).
  // Ammo only scales damage, so each weapon and pair is worked out once for all ammo.
  const keeps = Array.from({ length: KEEP_STEPS }, (_, i) => prep.minKeep + ((1 - prep.minKeep) * i) / (KEEP_STEPS - 1));
  const ends = keeps.map(() => new Map());
  const ammoInfo = new Map([null, ...ammos].map((a) => [a, { ammo: a, cost: a ? itemPrice(market, a) : 0, factor: 1 + pct(a) }]));
  for (const w of slots.weapon) {
    const wCost = prep.wearOf(w, 'weapon');
    const wAttack = v(w, 'attack'), wCrit = v(w, 'criticalChance');
    const pairs = pairsFor(wCrit);
    // A knife (or no weapon) fires no ammo; every other weapon needs ammo to shoot at all.
    const usable = w && w.code !== 'knife' ? ammos.filter(Boolean).map((a) => ammoInfo.get(a)) : [ammoInfo.get(null)];
    for (const pair of pairs) {
      const base = damage(wAttack, wCrit, v(pair.h, 'criticalDamages'), v(pair.g, 'precision'), 0);
      for (const u of usable) {
        const fixed = wCost + u.cost;
        const d = base * u.factor;
        for (let e = 0; e < keeps.length; e++) {
          const key = Math.round((fixed + keeps[e] * pair.cost) / COST_BUCKET);
          const prev = ends[e].get(key);
          if (!prev || d > prev.dmg) ends[e].set(key, { weapon: w, ammo: u.ammo, helmet: pair.h, gloves: pair.g, dmg: d, fixed, armor: pair.cost });
        }
      }
    }
  }
  const kept = new Set();
  for (const [e, cells] of ends.entries()) for (const c of frontier2([...cells.values()], (o) => o.dmg, (o) => o.fixed + keeps[e] * o.armor)) kept.add(c);
  return [...kept];
}

/** Offense options at a dodge % (`keep` = 1 − dodge %): frontier on (damage, cost per swing). */
function offenseOptions(candidates, keep) {
  const buckets = new Map();
  for (const c of candidates) {
    const cost = c.fixed + keep * c.armor;
    const key = Math.round(cost / COST_BUCKET);
    const prev = buckets.get(key);
    if (!prev || c.dmg > prev.dmg) buckets.set(key, { weapon: c.weapon, ammo: c.ammo, helmet: c.helmet, gloves: c.gloves, dmg: c.dmg, cost });
  }
  return frontier2([...buckets.values()], (o) => o.dmg, (o) => o.cost);
}

/**
 * The phases of a fight: each with a damage multiplier and the health and food
 * it offers. A window (with or without the pill) is one phase: the full bar
 * plus its hours of regen. A session longer than the pill's buff (8 h) goes
 * on in the debuff at its malus, on regen only.
 * opts: { pill, hours, buffHours?, debuffMultiplier?, supply?, multiplier?, phase? }
 *   supply: { health, foodMax } replaces it all with one phase (current bars).
 *   phase: 'pill' or 'debuff' keeps only that phase (a build per phase).
 */
export function phasesFor(config, stats, food, opts) {
  const pill = (config.items.cocain?.flatStats?.percentAttack ?? 60) / 100;
  const heal = food ? stats.health * ((config.items[food]?.flatStats?.healthRegenPercent ?? 0) / 100) : 0;
  // Food is counted whole over the session so far, so splitting it into phases loses none to rounding.
  let bars = 0, foodSoFar = 0;
  const regen = (hours, fullBar) => {
    bars += (fullBar ? 1 : 0) + hours / 10;
    const foodMax = food ? Math.floor(stats.hunger * bars + 1e-9) - foodSoFar : 0;
    foodSoFar += foodMax;
    return { hours, health: stats.health * ((fullBar ? 1 : 0) + hours / 10), foodMax, heal };
  };
  if (opts.supply) return [{ multiplier: opts.multiplier ?? 1, health: opts.supply.health, foodMax: food ? opts.supply.foodMax : 0, heal }];
  const hours = opts.hours ?? 8;
  if (!opts.pill) return [{ multiplier: 1, ...regen(hours, true) }];
  const buff = Math.min(hours, opts.buffHours ?? config.items.cocain?.flatStats?.buffDurationHours ?? 8);
  const phases = [{ multiplier: 1 + pill, ...regen(buff, true) }];
  // The debuff lasts its own hours (15.5); a longer session ends at full strength again.
  const debuff = Math.min(hours - buff, config.items.cocain?.flatStats?.debuffDurationHours ?? Infinity);
  if (debuff > 0) phases.push({ multiplier: opts.debuffMultiplier ?? 1 - pill, ...regen(debuff, false) });
  if (hours - buff - debuff > 0) phases.push({ multiplier: 1, ...regen(hours - buff - debuff, false) });
  if (opts.phase === 'pill') return phases.slice(0, 1);
  if (opts.phase === 'debuff') return phases.slice(1);
  return phases;
}

// Kinds of swing a fight can have: up to 3 phases, each on free health and on food.
const KINDS = 8;

/** Hours the pill's buff lasts. */
const buffHours = (config) => config.items.cocain?.flatStats?.buffDurationHours ?? 8;

/** Whether this fight uses a second build for the pill's debuff. */
export const isSplit = (config, opts) => !!(opts.splitDebuff && opts.pill && !opts.supply && !opts.phase && (opts.hours ?? 8) > buffHours(config));

/** Everything a layout needs to be solved: options and per-option economics. */
function layout(prep, levels, prestige, opts) {
  const { market, config } = prep;
  const stats = playerStats(config, levels, prestige);
  // Offense is scored at ×1; each phase scales it by its multiplier.
  const fightOpts = { ...opts, multiplier: 1 };
  const offKey = `o${stats.attack}|${stats.precision}|${stats.criticalChance}|${stats.criticalDamages}|${opts.militaryRankPercent}|${opts.battleBonusPercent}`;
  const defKey = `d${stats.armor}|${stats.dodge}`;
  const defs = remembered(prep, 'defCache', defKey, () => defenseOptions(prep, stats));
  // Offense depends on the dodge % (it spares the helmet and gloves): one list per dodge %.
  const offsFor = (d) => {
    const key = `${offKey}|${d.dodge}`;
    return remembered(prep, 'offByDodge', key, () => offenseOptions(remembered(prep, 'offCache', offKey, () => offenseCandidates(prep, stats, fightOpts)), d.keep));
  };
  const foods = prep.foods.map((food) => ({ food, price: food ? itemPrice(market, food) : 0, phases: phasesFor(config, stats, food, opts) }));
  const cases = (stats.lootChance / 100) * ((itemPrice(market, 'case1') ?? 0) + 0.01 * (itemPrice(market, 'case2') ?? 0));
  // The pill is bought once: with the pill phase, never with the debuff's own build.
  const pill = opts.pill && !opts.supply && opts.phase !== 'debuff' ? itemPrice(market, 'cocain') ?? 0 : 0;
  return { stats, offsFor, defs, foods, cases, pill };
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
  if (room < -ROUNDING) return null;
  room = Math.max(0, room);
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
  const phases = f.phases.map((p, i) => ({ multiplier: p.multiplier, hours: p.hours, ...totals(fill.filter((x) => x.seg.phase === i)) }));
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
  if (isSplit(prep.config, opts)) return strongestSplit(prep, levels, player, opts, terms, limit);
  const L = ctxOf(prep, levels, player, opts);
  const rate = ((terms.bounty ?? 0) + (terms.perK ?? 0)) / 1000;
  const fixed = (terms.flat ?? 0) + (terms.economy ?? 0) - L.pill;
  // The same fill as fillForDamage, in plain numbers (this loop runs ~10^5 times per layout).
  const cap = new Float64Array(KINDS), mult = new Float64Array(KINDS), extra = new Float64Array(KINDS), dmg = new Float64Array(KINDS), loss = new Float64Array(KINDS);
  const order = new Array(KINDS).fill(0);
  let best = null;
  for (const f of L.foods) for (const d of L.defs) {
    let n = 0;
    for (const p of f.phases) {
      cap[n] = p.health / d.hp; mult[n] = p.multiplier; extra[n] = 0; n++;
      if (p.foodMax > 0 && p.heal > 0) { cap[n] = (p.foodMax * p.heal) / d.hp; mult[n] = p.multiplier; extra[n] = f.price * (d.hp / p.heal); n++; }
    }
    // Strongest offense first: once even every swing at its damage can't beat the best, none after can.
    let reach = 0;
    let top = 0;
    for (let i = 0; i < n; i++) { reach += cap[i] * mult[i]; top = Math.max(top, mult[i]); }
    // Swings at the top multiplier (the pill phase's, free and food) and the rest, for the bound below.
    let topCap = 0, restCap = 0, second = 0;
    for (let i = 0; i < n; i++) if (mult[i] === top) topCap += cap[i]; else { restCap += cap[i]; second = Math.max(second, mult[i]); }
    const offs = L.offsFor(d);
    for (let j = offs.length - 1; j >= 0; j--) {
      const o = offs[j];
      if (best && o.dmg * reach < best.damage * (1 - 1e-6)) break;
      const base = o.cost + d.cost - L.cases;
      // Under a limit, the gold caps the damage: a swing loses at least base − rate × its damage
      // (food only adds), and stronger swings give more per gold. So at most: the gold spent on the
      // top multiplier's swings, then on the rest at the next multiplier. Far cheaper than the fill.
      if (best && limit !== Infinity) {
        const least = base - rate * o.dmg * top;
        if (least > 0) {
          const gold = fixed + limit;
          const most = gold <= topCap * least ? (gold * o.dmg * top) / least
            : topCap * o.dmg * top + Math.min(restCap, (gold - topCap * least) / (base - rate * o.dmg * second)) * o.dmg * second;
          if (most < best.damage * (1 - 1e-6)) continue;
        }
      }
      let room = fixed + limit;
      let gains = 0;
      let damage = 0;
      let m = 0;
      for (let i = 0; i < n; i++) {
        dmg[i] = o.dmg * mult[i];
        const gain = rate * dmg[i] - base - extra[i];
        if (gain >= 0) { room += gain * cap[i]; gains += gain * cap[i]; damage += dmg[i] * cap[i]; } else { loss[i] = -gain; order[m++] = i; }
      }
      if (room < -ROUNDING) continue;
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
 * The best net any build of this layout can make: every swing that pays for
 * itself and no other. For layouts no build keeps within a limit, how far off
 * they are (a skill search climbs on it towards the limit).
 */
export function bestNet(prep, levels, player, opts, terms = {}) {
  // Two builds a day: the pill build alone keeps the limit (the debuff build's profit is on top).
  if (isSplit(prep.config, opts)) return bestNet(prep, levels, player, phaseOpts(opts, 'pill'), terms);
  const L = ctxOf(prep, levels, player, opts);
  const rate = ((terms.bounty ?? 0) + (terms.perK ?? 0)) / 1000;
  const fixed = (terms.flat ?? 0) + (terms.economy ?? 0) - L.pill;
  let best = -Infinity;
  for (const f of L.foods) for (const d of L.defs) for (const o of L.offsFor(d)) {
    let net = fixed;
    for (const seg of segmentsOf(L, o, d, f)) net += Math.max(0, rate * seg.dmg - seg.cost) * seg.cap;
    if (net > best) best = net;
  }
  return best;
}

/**
 * The build that makes the most money: every kind of swing that pays for
 * itself (case drops and income beat ammo, wear and food), none that doesn't;
 * at the same net, the one with more damage. For the pill's debuff, where cheap
 * gear's case drops outearn its wear. null when no swing pays.
 */
export function mostProfit(prep, levels, player, opts, terms = {}) {
  const L = ctxOf(prep, levels, player, opts);
  const rate = ((terms.bounty ?? 0) + (terms.perK ?? 0)) / 1000;
  const fixed = (terms.flat ?? 0) + (terms.economy ?? 0) - L.pill;
  let best = null;
  for (const f of L.foods) for (const d of L.defs) for (const o of L.offsFor(d)) {
    let net = 0, damage = 0;
    for (const seg of segmentsOf(L, o, d, f)) {
      const gain = rate * seg.dmg - seg.cost;
      if (gain > 0) { net += gain * seg.cap; damage += seg.dmg * seg.cap; }
    }
    if (net > 0 && (!best || net > best.net + 1e-9 || (Math.abs(net - best.net) <= 1e-9 && damage > best.damage))) best = { net, damage, o, d, f };
  }
  if (!best) return null;
  const fill = segmentsOf(L, best.o, best.d, best.f).filter((seg) => rate * seg.dmg - seg.cost > 0).map((seg) => ({ seg, x: seg.cap }));
  return buildOf(L, best.o, best.d, best.f, fill, { ...terms, flat: (terms.flat ?? 0) });
}

/**
 * Cheapest builds reaching each of `targets` damage (one pass over the
 * options for all targets). Per option the kinds of swing are taken cheapest
 * per damage first (those that earn, i.e. cost below 0, always). Returns one
 * build per target; a target no option reaches gets the strongest build,
 * marked reachedTarget: false.
 */
export function cheapestMany(prep, levels, player, opts, targets) {
  if (isSplit(prep.config, opts)) return cheapestSplit(prep, levels, player, opts, targets);
  const L = ctxOf(prep, levels, player, opts);
  const cap = new Float64Array(KINDS), mult = new Float64Array(KINDS), extra = new Float64Array(KINDS), dmg = new Float64Array(KINDS), cost = new Float64Array(KINDS);
  const order = Array.from({ length: KINDS }, (_, i) => i);
  const best = targets.map(() => null);
  let top = null;
  for (const f of L.foods) for (const d of L.defs) {
    let n = 0;
    for (const p of f.phases) {
      cap[n] = p.health / d.hp; mult[n] = p.multiplier; extra[n] = 0; n++;
      if (p.foodMax > 0 && p.heal > 0) { cap[n] = (p.foodMax * p.heal) / d.hp; mult[n] = p.multiplier; extra[n] = f.price * (d.hp / p.heal); n++; }
    }
    let topMult = 0;
    for (let i = 0; i < n; i++) topMult = Math.max(topMult, mult[i]);
    for (const o of L.offsFor(d)) {
      const base = o.cost + d.cost - L.cases;
      let maxDamage = 0;
      for (let i = 0; i < n; i++) { dmg[i] = o.dmg * mult[i]; cost[i] = base + extra[i]; order[i] = i; maxDamage += dmg[i] * cap[i]; }
      if (!top || maxDamage > top.damage) top = { damage: maxDamage, o, d, f };
      for (let a = 1; a < n; a++) for (let b = a; b > 0 && cost[order[b]] / dmg[order[b]] < cost[order[b - 1]] / dmg[order[b - 1]]; b--) [order[b], order[b - 1]] = [order[b - 1], order[b]];
      for (let t = 0; t < targets.length; t++) {
        if (maxDamage < targets[t]) continue;
        // At least target / (best damage per swing) swings, each costing at least `base`.
        if (best[t] && base > 0 && (base * targets[t]) / (o.dmg * topMult) >= best[t].spent - 1e-9) continue;
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
  if (isSplit(prep.config, opts)) return frontierSplit(prep, levels, player, opts);
  const L = ctxOf(prep, levels, player, opts);
  const all = [];
  for (const f of L.foods) for (const d of L.defs) for (const o of L.offsFor(d)) {
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

// Random starts on top of the planned ones (and kicks, below): none. On the real market (8 h, a
// limit, economy skills searched) the morning's three starts found as much damage in a ninth of the time.
const EXTRA_STARTS = 0;

/** Random numbers in [0, 1) from a fixed seed: the same starts, so the same answer, every run. */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The space a skill search moves in: which layouts fit the budget, the
 * neighbours of a layout (raise one level, lowering one or two others to pay),
 * and the starting layouts: the given one (with `zeroed` skills at 0, then
 * trimmed to the budget), two that spread the points (unless `spreads` is
 * false), and EXTRA_STARTS random fight layouts.
 */
export function layoutSpace(config, { start, searched = FIGHT, budget, playerLevel, zeroed = [], extraStarts = EXTRA_STARTS, spreads = true, prestigePoints = 0 }) {
  // With prestige points the layouts are effective levels (level + ranks; prestige.js): a rank saves
  // the skill points of a level, and lets a skill past 10.
  const unlocked = Object.fromEntries(searched.map((s) => [s, maxLevel(config, s, playerLevel)]));
  const cost = (s, n) => levelCost(config, s, n);
  const used = prestigePoints > 0
    ? (l) => minPoints(searched, l, prestigePoints, cost, (s) => unlocked[s])
    : (l) => searched.reduce((t, s) => t + levelCost(config, s, l[s] ?? 0), 0);
  const max = Object.fromEntries(searched.map((s) => [s, unlocked[s] + (unlocked[s] > 0 ? maxRank(prestigePoints) : 0)]));
  const fits = (l) => used(l) <= budget && searched.every((s) => l[s] >= 0 && l[s] <= max[s]);
  const keyOf = (l) => searched.map((s) => l[s]).join(',');
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
  const random = seeded(0x5eed);
  const scatter = () => {
    const pool = searched.filter((s) => FIGHT.includes(s));
    let l = { ...start, ...Object.fromEntries(searched.map((s) => [s, 0])) };
    for (let miss = 0; miss < 40 && pool.length;) {
      const s = pool[Math.floor(random() * pool.length)];
      const next = { ...l, [s]: l[s] + 1 };
      if (fits(next)) { l = next; miss = 0; } else miss++;
    }
    return l;
  };
  const even = Object.fromEntries(FIGHT.map((s) => [s, 1]));
  const first = trim({ ...start, ...Object.fromEntries(zeroed.filter((s) => searched.includes(s)).map((s) => [s, 0])) });
  const starts = [first, ...(spreads ? [spread(even), spread({ ...even, attack: 1.3, lootChance: 0.8, hunger: 0.6 })] : []), ...Array.from({ length: extraStarts }, scatter)];
  return { used, fits, keyOf, neighbours, starts };
}

// A step scores its neighbours roughly first (scoreQuick) and only this many of the best exactly.
// On the real market (1,800 gear rolls, two builds, battle loot, a tight limit) a layout takes
// 0.1–0.5 s to score exactly and a step has up to ~1,000 neighbours.
const SCREEN = 24;
// After the starts: this many kicks of KICK_STEPS random steps from the best, each climbed again.
const KICKS = 0;
const KICK_STEPS = 4;

/**
 * Best skill layout, with the scoring done elsewhere (a pool of workers):
 * scoreMany(layouts, hint) → Promise of results in the same order. Each step's
 * neighbours are scored together, so they run in parallel; hint: the result of
 * the layout they are next to (a close guess for theirs). scoreQuick (same
 * shape, optional): a cheaper score that ranks layouts about as the exact one
 * does; with it, only a step's SCREEN best neighbours by it are scored exactly.
 */
export async function bestLayoutAsync(config, { start, searched = FIGHT, budget, playerLevel, zeroed, extraStarts, spreads, prestigePoints = 0, scoreMany, scoreQuick = null, screen = SCREEN, kicks = KICKS, isBetter = better, onStep, shouldStop }) {
  const space = layoutSpace(config, { start, searched, budget, playerLevel, zeroed, extraStarts, spreads, prestigePoints });
  const cached = (score) => {
    const memo = new Map();
    const all = async (list, hint = null) => {
      const fresh = [...new Map(list.map((l) => [space.keyOf(l), l])).entries()].filter(([k]) => !memo.has(k));
      if (fresh.length) {
        const results = await score(fresh.map(([, l]) => l), hint);
        fresh.forEach(([k], i) => memo.set(k, results[i]));
      }
      return list.map((l) => memo.get(space.keyOf(l)));
    };
    all.memo = memo;
    return all;
  };
  const scoreAll = cached(scoreMany);
  const quickAll = scoreQuick && cached(scoreQuick);
  const scored = scoreAll.memo;
  const order = (a, b) => (isBetter(a, b) ? -1 : isBetter(b, a) ? 1 : 0);
  let steps = 0;
  const climb = async (levels) => {
    let [best] = await scoreAll([levels]);
    // Before stopping, a screened climb looks 4× wider: the rough score's ranking can miss the move.
    let width = screen;
    for (;;) {
      if (shouldStop?.()) break;
      const near = space.neighbours(levels);
      let all = near;
      if (quickAll && near.length > width) {
        const rough = await quickAll(near, best);
        all = near.map((l, i) => [l, rough[i]]).sort((a, b) => order(a[1], b[1])).slice(0, width).map(([l]) => l);
      }
      const results = await scoreAll(all, best);
      let winner = null;
      let winnerLevels = null;
      results.forEach((r, i) => { if (isBetter(r, winner)) { winner = r; winnerLevels = all[i]; } });
      if (!isBetter(winner, best)) {
        if (quickAll && width === screen && near.length > width) { width = screen * 4; continue; }
        break;
      }
      width = screen;
      levels = winnerLevels;
      best = winner;
      steps++;
      onStep?.({ step: steps, levels, best, checked: scored.size, budget, used: space.used(levels) });
    }
    return { levels, best };
  };
  // The starts are independent, but each climb's steps already fill the pool.
  let result = null;
  for (const s of space.starts) {
    if (shouldStop?.()) break;
    const r = await climb(s);
    if (!result || isBetter(r.best, result.best)) result = r;
  }
  // Kicks: a few random steps away from the best and climb again, for a better hill close by.
  const random = seeded(0xc1a3b);
  for (let k = 0; k < kicks && result && !shouldStop?.(); k++) {
    let l = result.levels;
    for (let m = 0; m < KICK_STEPS; m++) {
      const near = space.neighbours(l);
      if (near.length) l = near[Math.floor(random() * near.length)];
    }
    const r = await climb(l);
    if (isBetter(r.best, result.best)) result = r;
  }
  return { ...result, steps, checked: scored.size, budget, used: space.used(result.levels) };
}

/*
 * Two builds a day: one for the pill's 8 hours, one for its debuff. The pill
 * build is chosen on its own (its limit, its target); the debuff build is the
 * one that makes the most money in the debuff hours (mostProfit: cheap gear,
 * every hit whose case drops and income beat its cost), added on top. Its
 * profit is profit: it never pays for dearer pill gear. prepDebuff: the
 * prepared market for the debuff build (another locked gear); without it both
 * builds come from the same market.
 */
const phaseOpts = (opts, phase) => ({ ...opts, phase, splitDebuff: false });

/** The pill build with the debuff build added: totals of both, the debuff's own build kept. */
export function joined(a, b, terms = {}) {
  const damage = a.damage + (b?.damage ?? 0);
  const cost = a.cost + (b?.cost ?? 0);
  const income = ((terms.bounty ?? 0) + (terms.perK ?? 0)) * damage / 1000 + (terms.flat ?? 0);
  return {
    ...a, damage, cost, income, net: income + (terms.economy ?? 0) - cost,
    swings: a.swings + (b?.swings ?? 0), foodEaten: a.foodEaten + (b?.foodEaten ?? 0),
    phases: [...a.phases, ...(b?.phases ?? [])], debuff: b ?? null,
  };
}

/** The debuff build for a layout: the most profit in the debuff hours (null: no hit pays). Kept per layout. */
function debuffBuild(prep, levels, player, opts, terms) {
  const rate = (terms.bounty ?? 0) + (terms.perK ?? 0);
  const key = JSON.stringify([levels, player.militaryRankPercent, player.prestige, opts, rate]);
  return remembered(prep, 'profitCache', key, () => mostProfit(prep, levels, player, phaseOpts(opts, 'debuff'), { bounty: terms.bounty ?? 0, perK: terms.perK ?? 0 }) ?? false) || null;
}

/** Most damage with the pill build's net ≥ −limit, and the debuff build's profit on top. */
export function strongestSplit(prep, levels, player, opts, terms = {}, limit = Infinity, prepDebuff = null) {
  const b = debuffBuild(prepDebuff ?? prep, levels, player, opts, terms);
  // Deep (opts.fundDebuff): the debuff build's profit is gold the pill build may spend too.
  const fund = opts.fundDebuff && b ? Math.max(0, b.net) : 0;
  const a = strongest(prep, levels, player, phaseOpts(opts, 'pill'), terms, limit + fund);
  if (!a) return null;
  return joined(a, b, terms);
}

/** Cheapest pill build reaching each target with the debuff build's damage, the debuff build added. */
export function cheapestSplit(prep, levels, player, opts, targets, prepDebuff = null) {
  const b = debuffBuild(prepDebuff ?? prep, levels, player, opts, {});
  const pills = cheapestMany(prep, levels, player, phaseOpts(opts, 'pill'), targets.map((t) => Math.max(1, t - (b?.damage ?? 0))));
  return pills.map((a) => a && { ...joined(a, b), reachedTarget: a.reachedTarget });
}

/** The pill builds no other beats on both damage and cost, each with the debuff build added. */
export function frontierSplit(prep, levels, player, opts, prepDebuff = null) {
  const b = debuffBuild(prepDebuff ?? prep, levels, player, opts, {});
  return buildFrontier(prep, levels, player, phaseOpts(opts, 'pill')).map((a) => joined(a, b));
}
