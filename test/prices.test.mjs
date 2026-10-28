import test from 'node:test';
import assert from 'node:assert/strict';
import { priceItem } from '../worker/prices.js';

const now = Date.parse('2026-10-28T14:00:00Z');
// Stored trades: [id, at, price, roll].
const trades = (roll, prices) => prices.map((p, i) => [`${roll}-${i}`, now - (i + 1) * 60e3, p, roll]);

test('a weapon roll is never priced below a worse roll that sells (one seller\'s cheap listings)', () => {
  const list = [
    ...trades('attack=103|criticalChance=20', [42, 42, 41.8, 48.3, 48.3, 42, 42, 42.7]),
    ...trades('attack=102|criticalChance=20', [48.2, 48.2, 48.2, 48.2, 48]),
    ...trades('attack=104|criticalChance=20', [49.3, 49.3, 49.3]),
    // A worse roll with a single dear sale doesn't set the floor.
    ...trades('attack=100|criticalChance=19', [70]),
  ];
  const prices = priceItem('sniper', { attack: [100, 130], criticalChance: [10, 20] }, list, now);
  const of = (a, c) => prices.find((e) => e.skills.attack === a && e.skills.criticalChance === c).averagePrice;
  assert.equal(of(103, 20), 48.2);
  assert.equal(of(104, 20), 49.3);
  assert.equal(of(102, 20), 48.2);
});
