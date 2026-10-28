/**
 * Scores skill layouts off the page's thread; client.js runs several of these
 * as a pool and climbs over layouts itself. Messages:
 *   { id, op: 'context', ctx, args } → { id, result: true }   (set up a search)
 *   { id, op: 'score', ctx, layouts, near?, quick? } → { id, result: [score per layout] }
 *     near: damage a layout next to these makes (where the battle loot step starts)
 *     quick: a rough score to screen layouts with (most damage only): one build
 *       all session, the loot at `near` counted once
 * args: { market?, locked, lockedFood, start, player, opts, deep?,
 *         objective: { kind: 'damage', terms, limit } | { kind: 'range', targets },
 *           terms.lootCurve: [damage, G] points of battle loot by damage (counted per build),
 *         income?: { plan, config } (economy skills searched: their income counts) }
 *   With a debuff build (16 h and full days), layouts are scored by the pill
 *   build alone: the debuff build is profit on top, worked out once the skills
 *   are chosen. deep: the debuff build's profit may be spent on pill gear
 *   (the Optimizer's deep mode, a lot slower).
 */
import { prepare, strongest, bestNet, cheapestMany, isSplit, FIGHT } from './optimize.js';
import { dailyIncome } from '../lib/eco.js';

const ECONOMY = ['production', 'energy', 'companies', 'management', 'leadership'];
// Where the loot step starts, as a share of the neighbouring layout's damage.
const NEAR_SHARE = 0.95;
let market = null;
let prep = null;
let prepKey = '';
const contexts = new Map();

/**
 * Battle loot (G) at a damage, from sampled [damage, G] points: the point at or
 * below it. Loot never falls with damage, so this never counts more than the
 * page will (a straight line between points could, and break the limit there).
 */
function lootFrom(curve) {
  return (damage) => {
    let lo = -1;
    for (let hi = curve.length; hi - lo > 1;) {
      const mid = (lo + hi) >> 1;
      if (curve[mid][0] <= damage) lo = mid; else hi = mid;
    }
    return lo < 0 ? 0 : curve[lo][1];
  };
}

function contextFor(args) {
  if (args.market) { market = args.market; prep = null; }
  const key = JSON.stringify([args.locked ?? {}, args.lockedFood ?? null]);
  if (!prep || key !== prepKey) {
    prep = prepare(market, { locked: args.locked ?? {}, lockedFood: args.lockedFood });
    prepKey = key;
  }
  const { player, opts, objective } = args;
  // Income change of an economy layout against the start (G per day), when economy skills are searched.
  let incomeChange = () => 0;
  if (args.income) {
    const eco = (l) => Object.fromEntries(ECONOMY.map((s) => [s, l[s] ?? 0]));
    const base = dailyIncome(eco(args.start), args.income.plan, args.income.config).total;
    incomeChange = (l) => dailyIncome(eco(l), args.income.plan, args.income.config).total - base;
  }
  const p = prep;
  if (objective.kind === 'range') {
    // Mean cost of the cheapest build at each damage target, minus any income
    // gained. The fight only depends on the fight skills, so it's cached by them:
    // layouts that differ in economy skills only reuse it.
    const fights = new Map();
    const fightCost = (l) => {
      const key = FIGHT.map((s) => l[s] ?? 0).join(',');
      if (!fights.has(key)) {
        let total = 0;
        for (const b of cheapestMany(p, l, player, opts, objective.targets)) {
          if (!b?.reachedTarget) { total = null; break; }
          total += b.cost;
        }
        fights.set(key, total == null ? null : total / objective.targets.length);
      }
      return fights.get(key);
    };
    return (l) => {
      const cost = fightCost(l);
      if (cost == null) return { cost: null, unreachable: true };
      const income = incomeChange(l);
      return { cost: cost - income, income };
    };
  }
  const lootAt = objective.terms.lootCurve ? lootFrom(objective.terms.lootCurve) : null;
  const pillOnly = !args.deep && isSplit(p.config, opts);
  const single = pillOnly ? { ...opts, phase: 'pill', splitDebuff: false } : { ...opts, splitDebuff: false };
  const exact = pillOnly ? single : args.deep ? { ...opts, fundDebuff: true } : opts;
  return (l, near = null, quick = false) => {
    const income = incomeChange(l);
    const terms = { ...objective.terms, lootCurve: undefined, economy: (objective.terms.economy ?? 0) + income };
    const limit = objective.limit ?? Infinity;
    if (quick) {
      const flat = (terms.flat ?? 0) + (lootAt && near > 0 ? lootAt(near * NEAR_SHARE) : 0);
      const r = strongest(p, l, player, single, { ...terms, flat }, limit);
      return r ? { damage: r.damage, net: r.net } : { infeasible: true, damage: 0, net: income };
    }
    let r = null;
    let counted = 0;
    // Start the loot step from a damage close to this layout's (its neighbour's, a little under):
    // if the build reaches it, that damage's loot is earned and the steps from 0 are saved.
    if (lootAt && near > 0 && Number.isFinite(limit)) {
      const guess = near * NEAR_SHARE;
      const at = strongest(p, l, player, exact, { ...terms, flat: (terms.flat ?? 0) + lootAt(guess) }, limit);
      if (at && at.damage >= guess) { r = at; counted = lootAt(guess); }
    }
    if (!r) r = strongest(p, l, player, exact, terms, limit);
    if (r && lootAt) {
      // Battle loot grows with damage: count what this damage earns and go again while that
      // buys more damage. More damage only earns more loot, so each step stays within the limit.
      for (let step = 0; step < 4; step++) {
        const earned = lootAt(r.damage);
        if (earned <= counted + 0.5) break;
        const next = strongest(p, l, player, exact, { ...terms, flat: (terms.flat ?? 0) + earned }, limit);
        if (!next || next.damage <= r.damage * (1 + 1e-6)) break;
        counted = earned;
        r = next;
      }
      const loot = lootAt(r.damage);
      r = { ...r, income: r.income - counted + loot, net: r.net - counted + loot, loot };
    }
    // No build keeps this layout within the limit. Still scored, by the best net it can make (below
    // −limit, so under any layout that keeps within it), so a climb from such a start (economy
    // skills at 0, say) moves towards the limit.
    if (!r) return { infeasible: true, damage: 0, net: bestNet(p, l, player, exact, terms), incomeChange: income };
    // Only what the climb and its report read: whole builds would be copied back for every layout.
    return { damage: r.damage, cost: r.cost, net: r.net, income: r.income, loot: r.loot, armor: r.armor, dodge: r.dodge, incomeChange: income };
  };
}

/** Results go back as plain data. */
const plain = (x) => JSON.parse(JSON.stringify(x, (k, v) => (v === Infinity ? null : v)));

onmessage = ({ data }) => {
  const { id, op } = data;
  try {
    if (op === 'context') {
      contexts.clear();
      contexts.set(data.ctx, contextFor(data.args));
      postMessage({ id, result: true });
    } else if (op === 'score') {
      const score = contexts.get(data.ctx);
      if (!score) throw new Error('This search was replaced by a newer one.');
      postMessage({ id, result: plain(data.layouts.map((l) => score(l, data.near, !!data.quick))) });
    }
  } catch (err) {
    postMessage({ id, error: err.message ?? String(err) });
  }
};
