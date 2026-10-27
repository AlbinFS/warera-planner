import test from 'node:test';
import assert from 'node:assert/strict';
import { addRanking, merge, bandOf, MIN_DAMAGE } from '../worker/battleLoot.js';
import { expectedLoot } from '../src/lib/battleLoot.js';

const rarity = { helmet4: 'epic', pants3: 'rare', rifle: 'uncommon' };
const rarityOf = (code) => rarity[code];
// A ranking: [damage, item code or null].
const ranking = (rows) => rows.map(([value, code]) => ({ value, lootItem: code ? { code } : null }));

test('a ranking counts players and items per damage band', () => {
  const counts = addRanking({}, ranking([[2e6, 'helmet4'], [2.1e6, 'pants3'], [50e3, null]]), rarityOf);
  const top = counts[bandOf(2e6)];
  assert.equal(top[0], 2);
  assert.equal(top[1 + 3], 1); // epic
  assert.equal(top[1 + 2], 1); // rare
  assert.equal(counts[bandOf(50e3)][0], 1);
  assert.ok(MIN_DAMAGE >= 5e6);
});

test('battles come into and leave the running totals exactly', () => {
  const a = { rounds: 2, round: addRanking({}, ranking([[1e6, 'helmet4']]), rarityOf), battle: addRanking({}, ranking([[2e6, 'pants3']]), rarityOf) };
  const b = { rounds: 3, round: addRanking({}, ranking([[1e6, null]]), rarityOf), battle: {} };
  const total = merge(merge({}, a, 1), b, 1);
  assert.equal(total.battles, 2);
  assert.equal(total.round[bandOf(1e6)][0], 2);
  merge(total, a, -1);
  assert.equal(total.battles, 1);
  assert.equal(total.round[bandOf(1e6)][0], 1);
  assert.equal(total.round[bandOf(1e6)][1 + 3], 0);
  assert.ok(!total.battle[bandOf(2e6)]);
});

test('more damage expects more and better loot; split over the rounds', () => {
  const rows = (dmg, epic) => ranking([...Array(10)].map((_, i) => [dmg, i < epic ? 'helmet4' : 'rifle']));
  const data = merge({}, {
    rounds: 2,
    round: addRanking(addRanking({}, rows(200e3, 1), rarityOf), rows(1e6, 6), rarityOf),
    battle: addRanking(addRanking({}, rows(400e3, 1), rarityOf), rows(2e6, 6), rarityOf),
  }, 1);
  const prices = { epic: 57, uncommon: 4 };
  const low = expectedLoot(data, 400e3, prices);
  const high = expectedLoot(data, 2e6, prices);
  assert.equal(high.rounds, 2);
  // 2M: battle loot at 2M, and two rounds at 1M each: one item from each.
  assert.ok(Math.abs(high.items - 3) < 1e-9);
  assert.ok(high.epicPlus > low.epicPlus && high.value > low.value);
  assert.equal(expectedLoot(null, 1e6, prices), null);
});
