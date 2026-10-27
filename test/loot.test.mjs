import test from 'node:test';
import assert from 'node:assert/strict';
import { lootPrices, keepRecent, DAY_MS } from '../worker/prices.js';

const now = Date.UTC(2026, 9, 27, 12);
// `n` trades at `price`, `day` days back (0 = the last 24 h), as [minute, price].
const day = (d, price, n = 10) => Array.from({ length: n }, (_, i) => [Math.floor((now - d * DAY_MS - (i + 1) * 60000) / 60000), price]);

test('loot is the last 24 h median on a normal day', () => {
  const trades = [...day(0, 62), ...day(1, 58), ...day(2, 60), ...day(3, 59)];
  const r = lootPrices({ epic: trades }, now).epic;
  assert.equal(r.basis, 'day');
  assert.equal(r.price, 62);
});

test('a manipulated last day falls back to 7 days without the off days', () => {
  // Day 0 pumped to 120, day 4 dumped to 20: both are left out.
  const trades = [...day(0, 120), ...day(1, 58), ...day(2, 60), ...day(3, 59), ...day(4, 20), ...day(5, 61)];
  const r = lootPrices({ epic: trades }, now).epic;
  assert.equal(r.basis, 'week');
  assert.equal(r.excluded, 2);
  assert.equal(r.price, 59.5);
});

test('too few trades in the last 24 h use the 7-day median', () => {
  const trades = [...day(0, 90, 2), ...day(1, 58), ...day(2, 60)];
  const r = lootPrices({ epic: trades }, now).epic;
  assert.equal(r.basis, 'week');
  assert.equal(r.excluded, 0);
});

test('recent trades older than 7 days are dropped', () => {
  const old = [[Math.floor((now - 8 * DAY_MS) / 60000), 50]];
  const kept = keepRecent(old, [['id', now - 1000, 70, 'armor=20']], now);
  assert.deepEqual(kept.map((t) => t[1]), [70]);
});
