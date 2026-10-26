#!/usr/bin/env node
/**
 * CPU estimate for one job run on the heaviest items (free Workers allow 10 ms
 * per run). Times the per-item work the job does: parse the stored trades,
 * merge a page of 100 new trades, check coverage, prune, price, serialize.
 *
 *   node tools/bench-job.mjs <trade-store.json> <game-config.json>
 *
 * The store is a local file of { codes: { <code>: { trades: [{ id, at, price, skills }] } } };
 * the game config is the { items } object the job stores.
 */
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { toTrade, isSatisfied, prune, priceItem, rollKey } from '../worker/prices.js';

const file = process.argv[2];
if (!file) { console.error('Usage: bench-job.mjs <trade-store.json>'); process.exit(2); }
const store = JSON.parse(fs.readFileSync(file, 'utf8'));
// Mirrors worker/job.js: items are grouped into runs of about 350 KB of stored trades.
const BYTES_PER_RUN = 350 * 1024;
const MAX_CODES_PER_RUN = 6;
const config = JSON.parse(fs.readFileSync(process.argv[3] ?? new URL('../../warera-local/data/game-config.json', import.meta.url), 'utf8'));
const items = Object.entries(config.items).filter(([, i]) => i.dynamicStats && (i.type === 'weapon' || i.type === 'equipment'));

const now = Date.now();
const costs = [];
for (const [code, { dynamicStats }] of items) {
  const trades = store.codes[code]?.trades ?? [];
  const stored = JSON.stringify(trades.map((t) => [t.id, t.at, t.price, rollKey(t.skills)]));
  // Worst case for a ready item: a full page of new trades, so the trades are rewritten.
  const pageText = JSON.stringify({ items: trades.slice(0, 100).map((t, i) => ({ _id: `new${i}`, createdAt: new Date(t.at).toISOString(), money: t.price, item: { skills: t.skills } })) });
  const runs = 20;
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) {
    const entry = { trades: JSON.parse(stored) };
    const fresh = JSON.parse(pageText).items.map(toTrade);
    entry.trades = prune([...fresh, ...entry.trades], now);
    const prices = priceItem(code, dynamicStats, entry.trades, now);
    JSON.stringify(entry.trades);
    JSON.stringify(prices);
  }
  costs.push({ code, bytes: stored.length, ms: (performance.now() - t0) / runs });
}

// Backfilling also runs the coverage check; time it on the largest item.
const big = costs.reduce((a, b) => (b.bytes > a.bytes ? b : a));
const bigTrades = (store.codes[big.code].trades).map((t) => [t.id, t.at, t.price, rollKey(t.skills)]);
const t1 = performance.now();
for (let i = 0; i < 20; i++) isSatisfied({ trades: bigTrades, exhausted: false, oldestAt: now - 30 * 864e5 }, config.items[big.code].dynamicStats, now);
const coverageMs = (performance.now() - t1) / 20;

const runs = [];
let run = { codes: [], bytes: 0, ms: 0 };
for (const c of costs) {
  if (run.codes.length && (run.bytes + c.bytes > BYTES_PER_RUN || run.codes.length >= MAX_CODES_PER_RUN)) { runs.push(run); run = { codes: [], bytes: 0, ms: 0 }; }
  run.codes.push(c.code); run.bytes += c.bytes; run.ms += c.ms;
}
runs.push(run);
const worst = runs.reduce((a, b) => (b.ms > a.ms ? b : a));
console.log(`${costs.length} items in ${runs.length} runs; heaviest item ${big.code} ${(big.bytes / 1024).toFixed(0)} KB: ${big.ms.toFixed(2)} ms`);
console.log(`worst run: ${worst.codes.join(', ')} = ${worst.ms.toFixed(2)} ms (limit 10 ms)`);
console.log(`coverage check while backfilling ${big.code}: +${coverageMs.toFixed(2)} ms`);
