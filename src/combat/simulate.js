/**
 * Hit-by-hit simulation of a build over a session, many times over, to show
 * the spread luck gives around the model's averages.
 *
 * Each swing: a miss (1 − precision) does half damage; a landed swing crits
 * with the crit chance for + crit damage; a dodge costs no health, otherwise
 * the swing costs 10 × (1 − armor) health. When the health left can't pay for
 * a swing, food is eaten (if any is left in that phase) or the phase ends.
 * Case drops are rolled per swing; weapon wear, ammo and scraps follow the
 * swings, armor wear the hits taken. With a debuff build (build.debuff:
 * { gear, food }), the hours after the pill are fought in it.
 */
import { playerStats, swingDamage, wearPerSwing, itemPrice, softCapPercent, usableAmmo, canFight, HEALTH_COST, ARMOR_SLOTS } from './model.js';
import { phasesFor, configOf } from './optimize.js';

/** Small fast seeded random numbers (mulberry32), so a run can be repeated. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * build: { levels, prestige, militaryRankPercent, gear (engine rolls), food, debuff? }
 * session: { pill, hours }
 * terms: { bounty, perK, flat, economy, lootAt? (damage → G) } · runs: how many fights.
 */
export function simulate(market, build, session, { battleBonusPercent = 0, terms = {}, runs = 5000, seed = 1 } = {}) {
  const config = configOf(market);
  const stats = playerStats(config, build.levels, build.prestige);
  const opts = { battleBonusPercent, militaryRankPercent: build.militaryRankPercent };
  const price = (code) => itemPrice(market, code) ?? 0;
  const lootChance = stats.lootChance / 100;
  // What one build fights with: its swing, defense and costs.
  const kit = (gear, food) => {
    if (!canFight(gear)) throw new Error(`A ${gear.weapon.code} can’t shoot without ammo: pick ammo or a knife.`);
    const swing = swingDamage(stats, gear, { ...opts, pill: false }, config);
    const armor = softCapPercent(stats.armor + (gear.chest?.skills?.armor ?? 0) + (gear.pants?.skills?.armor ?? 0), stats.armorCap) / 100;
    const dodge = softCapPercent(stats.dodge + (gear.boots?.skills?.dodge ?? 0), stats.dodgeCap) / 100;
    return {
      swing, armor, dodge, hitCost: HEALTH_COST * (1 - armor), hit: swing.precision / 100, crit: swing.crit / 100, critMult: 1 + swing.critDamage / 100,
      ammo: usableAmmo(gear) ? price(gear.ammo) : 0,
      wear: { weapon: wearPerSwing(market, config, 'weapon', gear.weapon), armor: ARMOR_SLOTS.reduce((t, s) => t + wearPerSwing(market, config, 'armor', gear[s]), 0) },
      foodPrice: food ? price(food) : 0,
    };
  };
  const main = kit(build.gear, build.food);
  const split = !!build.debuff && session.pill && (session.hours ?? 8) > 8;
  const phases = split
    ? [
      ...phasesFor(config, stats, build.food, { pill: true, hours: session.hours, phase: 'pill' }).map((p) => ({ ...p, kit: main })),
      ...phasesFor(config, stats, build.debuff.food, { pill: true, hours: session.hours, phase: 'debuff' }).map((p) => ({ ...p, kit: kit(build.debuff.gear, build.debuff.food) })),
    ]
    : phasesFor(config, stats, build.food, { pill: session.pill, hours: session.hours }).map((p) => ({ ...p, kit: main }));
  const { armor, dodge } = main;
  const pill = session.pill ? price('cocain') : 0;
  const rate = ((terms.bounty ?? 0) + (terms.perK ?? 0)) / 1000;

  const rnd = random(seed);
  const out = { damage: new Float64Array(runs), net: new Float64Array(runs), swings: new Float64Array(runs) };
  let misses = 0, crits = 0, landed = 0, dodged = 0, totalSwings = 0, totalTaken = 0, totalFood = 0, totalCase1 = 0, totalCase2 = 0, minHit = Infinity, maxHit = 0;
  // Costs summed over the run, by kind (each build has its own prices); and per phase (the pill build, the debuff one).
  const spent = { weapon: 0, armor: 0, ammo: 0, food: 0 };
  const perPhase = phases.map(() => ({ damage: 0, swings: 0, cost: 0 }));
  let lootTotal = 0;
  for (let r = 0; r < runs; r++) {
    let damage = 0, swings = 0, food = 0, case1 = 0, case2 = 0, cost = pill;
    for (const p of phases) {
      const k = p.kit;
      let health = p.health;
      let foodLeft = p.foodMax;
      const base = k.swing.base * p.multiplier;
      let pSwings = 0, pTaken = 0, pFood = 0;
      const damageBefore = damage;
      for (;;) {
        if (health < k.hitCost) {
          if (foodLeft > 0 && p.heal > 0) { foodLeft--; pFood++; health += p.heal; continue; }
          break;
        }
        pSwings++;
        let d;
        if (rnd() >= k.hit) { d = base * 0.5; misses++; } else if (rnd() < k.crit) { d = base * k.critMult; crits++; } else { d = base; landed++; }
        if (d < minHit) minHit = d;
        if (d > maxHit) maxHit = d;
        damage += d;
        if (rnd() < k.dodge) dodged++; else { health -= k.hitCost; pTaken++; }
        if (rnd() < lootChance) { case1++; if (rnd() < 0.01) case2++; }
      }
      swings += pSwings; food += pFood; totalTaken += pTaken;
      spent.weapon += pSwings * k.wear.weapon; spent.ammo += pSwings * k.ammo; spent.armor += pTaken * k.wear.armor; spent.food += pFood * k.foodPrice;
      const pCost = pSwings * (k.ammo + k.wear.weapon) + pTaken * k.wear.armor + pFood * k.foodPrice;
      cost += pCost;
      const t = perPhase[phases.indexOf(p)];
      t.damage += damage - damageBefore; t.swings += pSwings; t.cost += pCost;
    }
    cost -= case1 * price('case1') + case2 * price('case2');
    out.damage[r] = damage;
    out.swings[r] = swings;
    const loot = (terms.flat ?? 0) + (terms.lootAt ? terms.lootAt(damage) : 0);
    lootTotal += loot;
    out.net[r] = rate * damage + loot + (terms.economy ?? 0) - cost;
    totalSwings += swings; totalFood += food; totalCase1 += case1; totalCase2 += case2;
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const swingsMean = totalSwings / runs;
  const all = misses + crits + landed;
  return {
    runs, damage: out.damage, net: out.net, swings: out.swings,
    rates: { miss: misses / all, crit: crits / all, hit: landed / all, dodged: dodged / all },
    hitRange: [minHit, maxHit], armor, dodge, phases,
    // Averages per phase: [{ multiplier, damage, swings, cost }] (the pill's price in the first).
    byPhase: perPhase.map((t, i) => ({ multiplier: phases[i].multiplier, hours: phases[i].hours, damage: t.damage / runs, swings: t.swings / runs, cost: t.cost / runs + (i === 0 ? pill : 0), debuffBuild: split && i > 0 })),
    // Averages per fight, for the cost and income lists.
    avg: {
      damage: mean(out.damage), net: mean(out.net), swings: swingsMean, food: totalFood / runs,
      costs: { weapon: spent.weapon / runs, armor: spent.armor / runs, ammo: spent.ammo / runs, food: spent.food / runs, pill },
      income: {
        case1: (totalCase1 / runs) * price('case1'), case2: (totalCase2 / runs) * price('case2'),
        bounty: ((terms.bounty ?? 0) / 1000) * mean(out.damage), lootPerK: ((terms.perK ?? 0) / 1000) * mean(out.damage), loot: lootTotal / runs, companies: terms.economy ?? 0,
      },
      cases: { case1: totalCase1 / runs, case2: totalCase2 / runs },
    },
  };
}

/** The value at quantile q (0–1) of a sample. */
export function quantile(values, q) {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

/** A histogram: `bins` equal bins between the 0.5% and 99.5% quantiles. */
export function histogram(values, bins = 30) {
  const lo = quantile(values, 0.005);
  const hi = quantile(values, 0.995);
  const width = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / width)))]++;
  return counts.map((n, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, n }));
}
