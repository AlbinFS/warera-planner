/**
 * The page's side of worker.js: a pool of workers (one per spare core) that
 * score skill layouts in parallel, while the climb over layouts runs here.
 * The market is sent to each worker once; later searches reuse it.
 */
import { bestLayoutAsync, better, configOf, FIGHT } from './optimize.js';

const SIZE = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));
let pool = null;
let sentMarket = null;
let nextId = 1;
let nextCtx = 1;
const pending = new Map();

function getPool() {
  if (!pool) {
    pool = Array.from({ length: SIZE }, () => {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }) => {
        const p = pending.get(data.id);
        if (!p) return;
        pending.delete(data.id);
        if (data.error) p.reject(new Error(data.error)); else p.resolve(data.result);
      };
      return w;
    });
  }
  return pool;
}

function call(worker, message) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...message });
  });
}

/** Results compare as worker.js scores them: most damage (contract), or lowest mean cost (range). */
const rangeBetter = (a, b) => !!a && a.cost != null && (!b || b.cost == null || a.cost < b.cost - 1e-6);

/**
 * A skill-layout search (args as worker.js describes, plus searched, budget,
 * and zeroed: skills the first start sets to 0).
 * onProgress gets each step; `signal` stops it after the current step.
 */
export async function searchLayout(market, args, { onProgress, signal } = {}) {
  const workers = getPool();
  const ctx = nextCtx++;
  const { searched, budget, zeroed, ...context } = JSON.parse(JSON.stringify(args));
  const withMarket = market === sentMarket ? context : { ...context, market: JSON.parse(JSON.stringify(market)) };
  sentMarket = market;
  await Promise.all(workers.map((w) => call(w, { op: 'context', ctx, args: withMarket })));
  // Split each batch of layouts over the pool, keeping their order. A worker
  // caches fights by the fight skills, so layouts with the same fight skills
  // (they differ in economy skills only) go to the worker that has it; each
  // new fight goes to the worker with the fewest new fights in this batch.
  const fightKey = (l) => FIGHT.map((s) => l[s] ?? 0).join(',');
  const owner = new Map();
  const scoreMany = async (layouts, hint = null, quick = false) => {
    const parts = workers.map(() => []);
    const fresh = workers.map(() => 0);
    const where = layouts.map((l) => {
      const key = fightKey(l);
      let w = owner.get(key);
      if (w == null) {
        w = fresh.reduce((best, n, i) => (n < fresh[best] ? i : best), 0);
        owner.set(key, w);
        fresh[w]++;
      }
      parts[w].push(l);
      return [w, parts[w].length - 1];
    });
    // The neighbours' layout's damage: where the battle loot step can start (worker.js).
    const near = hint && !hint.infeasible && hint.damage > 0 ? hint.damage : null;
    const results = await Promise.all(parts.map((part, w) => (part.length ? call(workers[w], { op: 'score', ctx, layouts: part, near, quick }) : [])));
    return where.map(([w, i]) => results[w][i]);
  };
  return bestLayoutAsync(configOf(market), {
    start: args.start, searched, budget, zeroed, playerLevel: args.player.level, scoreMany,
    // Most damage: neighbours are screened with one build all session and the loot counted once.
    scoreQuick: args.objective.kind === 'damage' ? (layouts, hint) => scoreMany(layouts, hint, true) : null,
    isBetter: args.objective.kind === 'range' ? rangeBetter : better,
    onStep: onProgress, shouldStop: () => signal?.aborted,
  });
}
