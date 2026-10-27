/**
 * Scores skill layouts off the page's thread; client.js runs several of these
 * as a pool and climbs over layouts itself. Messages:
 *   { id, op: 'context', ctx, args } → { id, result: true }   (set up a search)
 *   { id, op: 'score', ctx, layouts } → { id, result: [score per layout] }
 * args: { market?, locked, lockedFood, start, player, opts,
 *         objective: { kind: 'damage', terms, limit } | { kind: 'range', targets },
 *         income?: { plan, config } (economy skills searched: their income counts) }
 */
import { prepare, strongest, cheapestMany, FIGHT } from './optimize.js';
import { dailyIncome } from '../lib/eco.js';

const ECONOMY = ['production', 'energy', 'companies', 'management', 'leadership'];
let market = null;
let prep = null;
let prepKey = '';
const contexts = new Map();

/** The scoring function for a search. */
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
  return (l) => {
    const income = incomeChange(l);
    const terms = { ...objective.terms, economy: (objective.terms.economy ?? 0) + income };
    const r = strongest(p, l, player, opts, terms, objective.limit ?? Infinity);
    return r && { ...r, incomeChange: income };
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
      postMessage({ id, result: plain(data.layouts.map(score)) });
    }
  } catch (err) {
    postMessage({ id, error: err.message ?? String(err) });
  }
};
