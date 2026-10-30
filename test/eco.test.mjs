import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingsFromEmployees, trainingsPerDayOf, optimizeEcoSkills } from '../src/lib/eco.js';

const levels = (values) => ({ levels: Object.fromEntries(values.map((value, n) => [n, { value, totalCost: (n * (n + 1)) / 2 }])) });

test('trainings a day come from the employees: one each while they have potential left, Trainer included', () => {
  const employees = [
    { potential: 2, potentialMax: 10, trainingsPerDay: 1 },
    { potential: 10, potentialMax: 10, trainingsPerDay: 1 }, // done
    { potential: 3, potentialMax: 7, trainingsPerDay: 2 }, // a Trainer coworker
    { potential: 6, potentialMax: 7, trainingsPerDay: 2 }, // only one left
  ];
  assert.equal(trainingsFromEmployees(employees), 1 + 0 + 2 + 1);
  assert.equal(trainingsPerDayOf(null, employees), 4);
  assert.equal(trainingsPerDayOf('', employees), 4);
  assert.equal(trainingsPerDayOf(0, employees), 0);
  assert.equal(trainingsPerDayOf(7, employees), 7);
});

test('eco skills: with too many trainings for any layout, the one with the most energy', () => {
  const config = {
    skills: { companies: levels([2, 3]), management: levels([1, 2]), energy: levels([100, 110, 120]), production: levels([30, 33]) },
    upgrades: { automatedEngine: { levels: { 1: { stats: { dailyProd: 24 } } } } },
  };
  const plan = { companies: [{ id: 'a', good: 'x', engine: 1, employees: [] }], perPoint: { x: 0.1 }, currentManagementValue: 1, selfWork: true, trainingsPerDay: 40 };
  const best = optimizeEcoSkills(plan, config, { budget: 3, playerLevel: 10 });
  assert.equal(best.levels.energy, 2);
  assert.ok(best.result.energyShort);
  // Enough energy: self-work takes what the trainings leave.
  const fits = optimizeEcoSkills({ ...plan, trainingsPerDay: 2 }, config, { budget: 3, playerLevel: 10 });
  assert.ok(!fits.result.energyShort && fits.result.selfWorkActions > 0);
});

test('economy steps: the best-earning layout per number of points, each earning more than the last', async () => {
  const { incomeSteps } = await import('../src/lib/eco.js');
  const config = {
    skills: { companies: levels([2, 3, 4]), management: levels([1, 2, 3]), energy: levels([100, 110]), production: levels([30, 33]) },
    upgrades: { automatedEngine: { levels: { 1: { stats: { dailyProd: 24 } } } } },
  };
  const plan = { companies: Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, good: 'x', engine: 1, employees: [{ production: 4, bonusPercent: 10, payroll: 1 }] })), perPoint: { x: 0.1 }, currentManagementValue: 1, selfWork: false, trainingsPerDay: 0 };
  const steps = incomeSteps(plan, config, { skills: ['companies', 'management'], budget: 6, playerLevel: 10 });
  assert.deepEqual(steps[0].levels, { companies: 0, management: 0 });
  assert.equal(steps[0].points, 0);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].points > steps[i - 1].points && steps[i].income > steps[i - 1].income);
  // One point: a third company earns more than +2 % on the two running.
  assert.deepEqual(steps[1].levels, { companies: 1, management: 0 });
});

test('the game values a manufactured good\'s point minus its inputs, from its value per point of everything', async () => {
  const { gamePointValues, pointValues } = await import('../src/lib/eco.js');
  const items = { fish: { productionPoints: 40 }, cookedFish: { productionPoints: 40, productionNeeds: { fish: 1 } }, wood: { productionPoints: 40 } };
  const v = gamePointValues(items, { cookedFish: 0.1093, fish: 0.0924, wood: 0.0943 });
  assert.equal(Math.round(v.cookedFish * 1e4) / 1e4, 0.1262);
  assert.equal(v.wood, 0.0943);
  // Goods the game has no value for keep the one from prices.
  const all = pointValues({ ...items, bread: { type: 'product', productionPoints: 10 } }, { bread: 2 }, { wood: 0.0943 });
  assert.equal(all.bread, 0.2);
  assert.equal(all.wood, 0.0943);
});

test('the market value of a point: each good weighted by the points made of it, as the game shows it', async () => {
  const { marketPointValue } = await import('../src/lib/eco.js');
  const companies = [{ id: 'a', good: 'x', engine: 7 }, { id: 'b', good: 'y', engine: 7 }, { id: 'off', good: 'z', engine: 7, disabled: true }];
  // Employees only, as the game counts it: 100 points at 0.1 and 300 at 0.2.
  const v = marketPointValue(companies, { a: [{ pointsPerDay: 100 }], b: [{ pointsPerDay: 300 }], off: [{ pointsPerDay: 50 }] }, { x: 0.1, y: 0.2, z: 9 });
  assert.ok(Math.abs(v - 0.175) < 1e-9);
  assert.equal(marketPointValue([], {}, {}), null);
});
