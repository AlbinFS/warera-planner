import test from 'node:test';
import assert from 'node:assert/strict';
import { rarityWeights, handValue, cardPool, trainingCards, cardValues } from '../src/lib/training.js';
import { companyModel } from '../src/lib/hiring.js';

const place = { good: 'iron', raw: true, storage: 3, country: 'se', homeCountry: 'se', tax: 0 };
const emp = (name, traits, extra = {}) => ({
  name, nationality: 'se', gender: 'male', traits, production: 4, bonusPercent: 11, payroll: 0.6 * 4, wageExpectation: 1,
  happiness: { value: 50 }, stats: { responsibility: { total: 2 }, luck: { total: 2 } }, potential: 1, potentialMax: 8, trainingsPerDay: 1, age: 30,
  ...extra,
});
const model = (employees) => companyModel(employees, place, { perPoint: 0.1, fairWage: 0.5, now: 0 });

test('Management and Luck move weight from common cards to rarer ones, as the game does', () => {
  assert.deepEqual(rarityWeights(10, 0), { common: 35, uncommon: 35, rare: 19, epic: 8, legendary: 3 });
  const w = rarityWeights(0, 4);
  assert.ok(Math.abs(Object.values(w).reduce((t, x) => t + x, 0) - 100) < 1e-9);
  assert.ok(Math.abs(w.uncommon - 27) < 1e-9 && Math.abs(w.common - 55 + 4) < 1e-9);
});

test('a session is worth the best of 3 cards', () => {
  // Half the draws are worth 10: the best of 3 is 10 unless all three miss.
  assert.ok(Math.abs(handValue([0, 10], [0.5, 0.5]) - 10 * (1 - 0.5 ** 3)) < 1e-9);
});

test('the card pool follows the game: clashes, potential cap, wage floor, Rehab All', () => {
  const pool = cardPool({ traits: ['greedy', 'xenophobe'], gender: 'male', potentialMax: 12, wageExpectation: 0.8 });
  assert.ok(pool.some((c) => c.card === 'rehabAll'));
  assert.ok(!pool.some((c) => c.card === 'habit' && c.trait === 'modest'), 'Modest clashes with Greedy');
  assert.ok(!pool.some((c) => c.card === 'habit' && c.trait === 'cosmopolitan'), 'Cosmopolitan clashes with Xenophobe');
  assert.deepEqual(pool.filter((c) => c.card === 'secondWind').map((c) => c.delta), [2, 3]);
  assert.deepEqual(pool.filter((c) => c.card === 'negotiation').map((c) => c.delta), [0.05, 0.1]);
  assert.ok(!pool.some((c) => c.card === 'habit' && c.trait === 'girlPower'), 'gendered');
});

test('card values: bigger drills more, a Greedy rehab pays its wage back, all over the days left', () => {
  const m = model([emp('A', ['greedy'], { payroll: 0.6 * 4 * 1.2 }), emp('B', [])]);
  const { cards, days } = trainingCards(m, 0, { now: 0 });
  const get = (pred) => cards.find(pred);
  const drill = (d) => get((c) => c.card === 'drill' && c.stat === 'production' && c.delta === d);
  assert.equal(days, 35);
  assert.ok(drill(4).total > drill(1).total);
  assert.ok(Math.abs(drill(1).total - drill(1).perDay * days) < 1e-9);
  assert.ok(get((c) => c.card === 'rehab' && c.trait === 'greedy').perDay > 0);
  // Cards come best first.
  for (let i = 1; i < cards.length; i++) assert.ok(cards[i - 1].total >= cards[i].total);
});

test('Better training cards from Management add value while employees still train, more with each level', () => {
  const m = model([emp('A', []), emp('B', [], { potential: 8 })]);
  const v = cardValues([m], 10, 0);
  assert.equal(v[0], 0);
  for (let l = 1; l <= 10; l++) assert.ok(v[l] > v[l - 1]);
  // Nobody training: better cards add nothing.
  assert.ok(cardValues([model([emp('C', [], { potential: 8 })])], 3, 0).every((x) => x === 0));
});
