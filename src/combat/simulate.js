/**
 * Hit-by-hit simulation of a build over a session, many times over, to show
 * the spread luck gives around the model's averages.
 *
 * Each swing: a miss (1 − precision) does half damage; a landed swing crits
 * with the crit chance for + crit damage; a dodge costs no health, otherwise
 * the swing costs 10 × (1 − armor) health. When the health left can't pay for
 * a swing, food is eaten (if any is left in that phase) or the phase ends.
 * Case drops are rolled per swing; wear, ammo and scraps follow the swings.
 */
import { playerStats, swingDamage, wearPerSwing, itemPrice, softCapPercent, usableAmmo, HEALTH_COST, ARMOR_SLOTS } from './model.js';
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
 * build: { levels, prestige, militaryRankPercent, gear (engine rolls), food }
 * session: { pill, hours } or { burst: true } (the bars as they are full, no regen)
 * terms: { bounty, perK, flat } · runs: how many fights.
 */
export function simulate(market, build, session, { battleBonusPercent = 0, terms = {}, runs = 5000, seed = 1 } = {}) {
  const config = configOf(market);
  const stats = playerStats(config, build.levels, build.prestige);
  const opts = { battleBonusPercent, militaryRankPercent: build.militaryRankPercent };
  const phases = session.burst
    ? [{ multiplier: session.pill ? 1 + (config.items.cocain?.flatStats?.percentAttack ?? 60) / 100 : 1, health: stats.health, foodMax: build.food ? stats.hunger : 0, heal: build.food ? stats.health * ((config.items[build.food]?.flatStats?.healthRegenPercent ?? 0) / 100) : 0 }]
    : phasesFor(config, stats, build.food, { pill: session.pill, hours: session.hours });
  const swing = swingDamage(stats, build.gear, { ...opts, pill: false }, config);
  const armor = softCapPercent(stats.armor + (build.gear.chest?.skills?.armor ?? 0) + (build.gear.pants?.skills?.armor ?? 0), stats.armorCap) / 100;
  const dodge = softCapPercent(stats.dodge + (build.gear.boots?.skills?.dodge ?? 0), stats.dodgeCap) / 100;
  const hitCost = HEALTH_COST * (1 - armor);
  const hit = swing.precision / 100;
  const crit = swing.crit / 100;
  const critMult = 1 + swing.critDamage / 100;
  const lootChance = stats.lootChance / 100;

  const price = (code) => itemPrice(market, code) ?? 0;
  const ammo = usableAmmo(build.gear) ? price(build.gear.ammo) : 0;
  const wear = { weapon: wearPerSwing(market, config, 'weapon', build.gear.weapon), armor: ARMOR_SLOTS.reduce((t, s) => t + wearPerSwing(market, config, 'armor', build.gear[s]), 0) };
  const foodPrice = build.food ? price(build.food) : 0;
  const pill = session.pill && !session.burst ? price('cocain') : 0;
  const rate = ((terms.bounty ?? 0) + (terms.perK ?? 0)) / 1000;

  const rnd = random(seed);
  const out = { damage: new Float64Array(runs), net: new Float64Array(runs), swings: new Float64Array(runs) };
  let misses = 0, crits = 0, landed = 0, dodged = 0, totalSwings = 0, totalFood = 0, totalCase1 = 0, totalCase2 = 0, minHit = Infinity, maxHit = 0;
  for (let r = 0; r < runs; r++) {
    let damage = 0, swings = 0, food = 0, case1 = 0, case2 = 0;
    for (const p of phases) {
      let health = p.health;
      let foodLeft = p.foodMax;
      const base = swing.base * p.multiplier;
      for (;;) {
        if (health < hitCost) {
          if (foodLeft > 0 && p.heal > 0) { foodLeft--; food++; health += p.heal; continue; }
          break;
        }
        swings++;
        let d;
        if (rnd() >= hit) { d = base * 0.5; misses++; } else if (rnd() < crit) { d = base * critMult; crits++; } else { d = base; landed++; }
        if (d < minHit) minHit = d;
        if (d > maxHit) maxHit = d;
        damage += d;
        if (rnd() < dodge) dodged++; else health -= hitCost;
        if (rnd() < lootChance) { case1++; if (rnd() < 0.01) case2++; }
      }
    }
    const cost = swings * (ammo + wear.weapon + wear.armor) + food * foodPrice + pill - case1 * price('case1') - case2 * price('case2');
    out.damage[r] = damage;
    out.swings[r] = swings;
    out.net[r] = rate * damage + (terms.flat ?? 0) - cost;
    totalSwings += swings; totalFood += food; totalCase1 += case1; totalCase2 += case2;
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const swingsMean = totalSwings / runs;
  const all = misses + crits + landed;
  return {
    runs, damage: out.damage, net: out.net, swings: out.swings,
    rates: { miss: misses / all, crit: crits / all, hit: landed / all, dodged: dodged / all },
    hitRange: [minHit, maxHit], armor, dodge, phases,
    // Averages per fight, for the cost and income lists.
    avg: {
      damage: mean(out.damage), net: mean(out.net), swings: swingsMean, food: totalFood / runs,
      costs: { weapon: swingsMean * wear.weapon, armor: swingsMean * wear.armor, ammo: swingsMean * ammo, food: (totalFood / runs) * foodPrice, pill },
      income: { case1: (totalCase1 / runs) * price('case1'), case2: (totalCase2 / runs) * price('case2'), bounty: rate * mean(out.damage), loot: terms.flat ?? 0 },
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
