import test from 'node:test';
import assert from 'node:assert/strict';
import { managerGain, dailyIncome } from '../src/lib/eco.js';

test('a manager adds their bonus on each employee\'s output before bonuses, plus care', () => {
  // Two employees making 30 and 15 points a day with a 50% bonus: 20 and 10 before it.
  const staff = [{ points: 30, bonusPercent: 50 }, { points: 15, bonusPercent: 50 }];
  const gain = managerGain(staff, 16, 0.1);
  // 16% of 30 base points, plus +5% care on both (the two best), at 0.1 G a point.
  assert.ok(Math.abs(gain - (30 * 0.16 + 30 * 0.05) * 0.1) < 1e-9);
  assert.equal(managerGain([], 22, 0.1), 0);
});

test('managers are paid out of company income, running or not', () => {
  const config = { skills: { companies: { levels: { 0: { value: 2 } } }, energy: { levels: { 0: { value: 0 } } }, management: { levels: { 0: { value: 0 } } }, production: { levels: { 0: { value: 0 } } } }, upgrades: {} };
  const plan = { companies: [{ id: 'a', good: 'x', engine: 0, employees: [], manager: { wageDay: 1.6 } }], perPoint: { x: 0.1 }, currentManagementValue: 0 };
  const without = dailyIncome({}, { ...plan, companies: [{ ...plan.companies[0], manager: null }] }, config);
  const withManager = dailyIncome({}, plan, config);
  assert.ok(Math.abs(without.total - withManager.total - 1.6) < 1e-9);
  assert.equal(withManager.managers, 1.6);
});
