import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCost, maxRank, prestigeUsed, minPoints, splitPrestige } from '../src/lib/prestige.js';
import { ecoValue, optimizeEcoSkills } from '../src/lib/eco.js';
import { layoutSpace } from '../src/combat/optimize.js';

const tri = (n) => (n * (n + 1)) / 2;
const table = (base, step, top = 10) => ({ levels: Object.fromEntries(Array.from({ length: top + 1 }, (_, n) => [n, { value: base + step * n, totalCost: tri(n), unlockAtLevel: 1 }])) });

test('a skill\'s ranks cost 1, 2, 4, 8 points one after another', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(rankCost), [0, 1, 3, 7, 15]);
  assert.deepEqual([0, 1, 2, 3, 6, 7].map(maxRank), [0, 1, 1, 2, 2, 3]);
  assert.equal(prestigeUsed({ attack: 1, lootChance: 1 }), 2);
});

test('prestige ranks take the place of the dearest levels', () => {
  const cost = (s, n) => tri(n);
  const max = () => 10;
  // Attack 7, loot 5 with one point: the rank goes on attack (saves 7, not 5).
  assert.equal(minPoints(['attack', 'lootChance'], { attack: 7, lootChance: 5 }, 1, cost, max), tri(6) + tri(5));
  const split = splitPrestige(['attack', 'lootChance'], { attack: 7, lootChance: 5 }, 1, { levelCost: cost, maxLevel: max });
  assert.deepEqual(split.ranks, { attack: 1, lootChance: 0 });
  assert.deepEqual(split.levels, { attack: 6, lootChance: 5 });
  // Past level 10 only with ranks; without points it can't be reached.
  assert.equal(minPoints(['attack'], { attack: 11 }, 0, cost, max), Infinity);
  assert.equal(minPoints(['attack'], { attack: 11 }, 1, cost, max), tri(10));
  // A tie keeps the ranks where they are (no skill reset).
  const tie = splitPrestige(['a', 'b'], { a: 5, b: 5 }, 1, { levelCost: cost, maxLevel: max, prefer: { b: 1 } });
  assert.deepEqual(tie.ranks, { a: 0, b: 1 });
});

test('eco values go on past level 10 with prestige, as the game\'s do', () => {
  const skills = { energy: table(100, 10), companies: table(2, 1) };
  assert.equal(ecoValue(skills, 'energy', 10, 1), 210);
  assert.equal(ecoValue(skills, 'companies', 10, 1), 13);
  assert.equal(ecoValue(skills, 'energy', 6, 1), 170);
});

test('the eco optimizer places prestige points, and they save skill points', () => {
  const config = {
    skills: { companies: table(2, 1), management: table(1, 1), energy: table(100, 10), production: table(30, 3) },
    upgrades: { automatedEngine: { levels: { 1: { stats: { dailyProd: 24 } } } } },
  };
  const plan = { companies: [{ id: 'a', good: 'x', engine: 1, employees: [] }], perPoint: { x: 0.1 }, currentManagementValue: 1, selfWork: true, trainingsPerDay: 0 };
  const without = optimizeEcoSkills(plan, config, { budget: 20, playerLevel: 30 });
  const withRank = optimizeEcoSkills(plan, config, { budget: 20, playerLevel: 30, prestigePoints: 1 });
  assert.ok(withRank.result.total > without.result.total);
  assert.equal(prestigeUsed(withRank.ranks), 1);
  for (const s of Object.keys(withRank.levels)) assert.equal(withRank.levels[s] + withRank.ranks[s], withRank.effective[s]);
});

test('the skill search reaches past level 10 with prestige points', () => {
  const config = { skills: { attack: table(100, 25), precision: table(50, 5) } };
  const plain = layoutSpace(config, { start: { attack: 10, precision: 0 }, searched: ['attack', 'precision'], budget: 60, playerLevel: 30, spreads: false });
  assert.ok(!plain.fits({ attack: 11, precision: 0 }));
  const pres = layoutSpace(config, { start: { attack: 10, precision: 0 }, searched: ['attack', 'precision'], budget: 60, playerLevel: 30, spreads: false, prestigePoints: 1 });
  assert.ok(pres.fits({ attack: 11, precision: 0 }));
  assert.equal(pres.used({ attack: 11, precision: 0 }), tri(10));
});
