/**
 * The page's side of worker.js: one worker, started on first use. The market
 * is sent once (it's the biggest part); later searches reuse it.
 */
let worker = null;
let sentMarket = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      if (data.progress) { p.onProgress?.(data.progress); return; }
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error)); else p.resolve(data.result);
    };
  }
  return worker;
}

/** A skill-layout search in the worker (see worker.js for args). `signal` stops it after the current step. */
export function searchLayout(market, args, { onProgress, signal } = {}) {
  const w = getWorker();
  const id = nextId++;
  const withMarket = market === sentMarket ? args : { ...args, market };
  sentMarket = market;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    signal?.addEventListener('abort', () => w.postMessage({ id, op: 'stop' }), { once: true });
    w.postMessage({ id, op: 'layout', args: JSON.parse(JSON.stringify(withMarket)) });
  });
}
