/**
 * Runs skill-layout searches off the page's thread. Messages:
 *   { id, op: 'layout', args }  → { id, progress } … then { id, result } or { id, error }
 *   { id, op: 'stop' }          → stops search `id` after its current step
 * args: { market, locked, lockedFood, start, searched, budget, player, opts,
 *         objective: { kind: 'damage', terms, limit } | { kind: 'range', targets },
 *         income?: { plan, config } (economy skills searched: their income counts) }
 */
import { prepare, strongest, cheapest, bestLayout } from './optimize.js';
import { dailyIncome } from '../lib/eco.js';

const ECONOMY = ['production', 'energy', 'companies', 'management', 'leadership'];
const stopped = new Set();
let lastMarket = null;
let lastPrep = null;
let lastKey = '';

function prepFor(args) {
  const key = JSON.stringify([args.locked ?? {}, args.lockedFood ?? null]);
  if (args.market !== undefined) lastMarket = args.market;
  if (!lastPrep || key !== lastKey || args.market !== undefined) {
    lastPrep = prepare(lastMarket, { locked: args.locked ?? {}, lockedFood: args.lockedFood });
    lastKey = key;
  }
  return lastPrep;
}

function run(id, args) {
  const prep = prepFor(args);
  const { player, opts, objective } = args;
  // Income change of an economy layout against the start (G per day), when economy skills are searched.
  let incomeChange = () => 0;
  if (args.income) {
    const eco = (l) => Object.fromEntries(ECONOMY.map((s) => [s, l[s] ?? 0]));
    const base = dailyIncome(eco(args.start), args.income.plan, args.income.config).total;
    const memo = new Map();
    incomeChange = (l) => {
      const key = ECONOMY.map((s) => l[s] ?? 0).join(',');
      if (!memo.has(key)) memo.set(key, dailyIncome(eco(l), args.income.plan, args.income.config).total - base);
      return memo.get(key);
    };
  }
  let score;
  let isBetter;
  if (objective.kind === 'range') {
    // Lowest mean cost of the cheapest build at each damage target (minus any income gained).
    score = (l) => {
      let total = 0;
      for (const t of objective.targets) {
        const b = cheapest(prep, l, player, opts, t);
        if (!b?.reachedTarget) return { cost: Infinity, unreachable: true };
        total += b.cost;
      }
      return { cost: total / objective.targets.length - incomeChange(l), income: incomeChange(l) };
    };
    isBetter = (a, b) => !!a && (!b || a.cost < b.cost - 1e-6);
  } else {
    score = (l) => {
      const terms = { ...objective.terms, economy: (objective.terms.economy ?? 0) + incomeChange(l) };
      const r = strongest(prep, l, player, opts, terms, objective.limit ?? Infinity);
      return r && { ...r, incomeChange: incomeChange(l) };
    };
  }
  const result = bestLayout(prep, {
    start: args.start, searched: args.searched, budget: args.budget, playerLevel: player.level, score, isBetter,
    onStep: (s) => postMessage({ id, progress: strip(s) }),
    shouldStop: () => stopped.has(id),
  });
  stopped.delete(id);
  return strip(result);
}

/** Results go back as plain data. */
const strip = (x) => JSON.parse(JSON.stringify(x, (k, v) => (v === Infinity ? null : v)));

onmessage = ({ data }) => {
  const { id, op, args } = data;
  if (op === 'stop') { stopped.add(id); return; }
  try {
    postMessage({ id, result: run(id, args) });
  } catch (err) {
    postMessage({ id, error: err.message ?? String(err) });
  }
};
