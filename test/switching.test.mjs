import test from 'node:test';
import assert from 'node:assert/strict';
import { companyModel } from '../src/lib/hiring.js';
import { switchValue, toolSwitchPlan, SWITCH_DAYS } from '../src/lib/switching.js';

const place = { good: 'paper', raw: false, storage: 3, country: 'se', homeCountry: 'se', tax: 0 };
// Production 4, Management 6 %, specialized 20 % in paper, a 10 % flask.
const emp = (name, extra = {}) => ({
  name, nationality: 'se', gender: 'male', traits: [], production: 4, bonusPercent: 36, payroll: 2.4, wageExpectation: 1,
  happiness: { value: 50 }, stats: { responsibility: { total: 2 } }, hasTool: true, tool: { id: name, code: 'flask3', percent: 10 },
  bonus: [{ source: 'management', percent: 6 }, { source: 'specialization', percent: 20 }, { source: 'tool', percent: 10 }],
  specializations: { paper: 20 }, ...extra,
});

test('switching good: specialization starts over, old tools stop, a spare tool of the new kind is used, the cost comes off', () => {
  const team = [emp('A'), emp('B')];
  const model = companyModel(team, place, { perPoint: 0.1, fairWage: 0.6 });
  const perPoint = { paper: 0.1, cookedFish: 0.1 };
  const r = switchValue(model, { employees: team, good: 'cookedFish', perPoint, spare: [{ id: 's', code: 'skillet4', percent: 22 }], cost: 5 });
  // Day 1: A loses 20 % specialization and the flask, gains the 22 % pan; B loses both. 24 points a day each at 100 %.
  assert.ok(Math.abs(r.first - 0.1 * 24 * ((-20 - 10 + 22) + (-20 - 10)) / 100) < 1e-9, String(r.first));
  // At full specialization: only the tools differ (A +12, B −10).
  assert.ok(Math.abs(r.full - 0.1 * 24 * (12 - 10) / 100) < 1e-9, String(r.full));
  assert.equal(r.tools.length, 1);
  assert.equal(r.tools[0].percent, 22);
  assert.ok(r.total < 0);
  assert.equal(SWITCH_DAYS, 30);
});

test('a better-paying good pays for the switch, and says when', () => {
  const team = [emp('A', { tool: null, hasTool: false, bonus: [{ source: 'management', percent: 6 }], bonusPercent: 6, specializations: {} })];
  const model = companyModel(team, place, { perPoint: 0.1, fairWage: 0.6 });
  const r = switchValue(model, { employees: team, good: 'cookedFish', perPoint: { paper: 0.1, cookedFish: 0.2 }, spare: [{ id: 's', code: 'skillet4', percent: 22 }], cost: 10 });
  assert.ok(r.first > 0);
  assert.ok(r.payback >= 1 && r.payback <= SWITCH_DAYS);
  assert.ok(r.total > 0);
});

test('tool switches: the best for income first (not the biggest earner), never more than the tools fill', () => {
  // Each company: one employee, so one tool each. Net over the days weighed, the switch's cost off.
  const companies = [{ id: 'top', net: 2 }, { id: 'small', net: 3 }, { id: 'third', net: 1 }];
  const options = (c, left) => [{ good: 'cookedFish', total: c.net, tools: left.slice(0, 1).map((t) => ({ ...t, spare: true })) }];
  const two = toolSwitchPlan(companies, [{ id: 'p1' }, { id: 'p2' }], options);
  assert.deepEqual(two.plan.map((o) => o.company.id), ['small', 'top']);
  assert.equal(two.unused.length, 0);
  const one = toolSwitchPlan(companies, [{ id: 'p1' }], options);
  assert.deepEqual(one.plan.map((o) => o.company.id), ['small']);
  // A switch that loses money isn't suggested, and its tool stays unused.
  const none = toolSwitchPlan([{ id: 'x', net: -1 }], [{ id: 'p1' }], options);
  assert.equal(none.plan.length, 0);
  assert.equal(none.unused.length, 1);
});

test('specialization climbs a percent a day from day 1: the average and payback count every day, not the full rate', () => {
  const team = [emp('A', { tool: null, hasTool: false, bonus: [{ source: 'management', percent: 6 }, { source: 'specialization', percent: 20 }], bonusPercent: 26 })];
  const model = companyModel(team, place, { perPoint: 0.1, fairWage: 0.6 });
  const r = switchValue(model, { employees: team, good: 'cookedFish', perPoint: { paper: 0.1, cookedFish: 0.11 }, cost: 1 });
  // Day d (0-based) at d % specialization against 20 % now: 24 points × (0.11 × (1.06 + d/100) − 0.1 × 1.26).
  const day = (d) => 24 * (0.11 * (1 + (6 + Math.min(20, d)) / 100) - 0.1 * 1.26);
  let total = -1, payback = null, run = -1;
  for (let d = 0; d < SWITCH_DAYS; d++) { total += day(d); run += day(d); if (payback == null && run >= 0) payback = d + 1; }
  assert.ok(Math.abs(r.first - day(0)) < 1e-9);
  assert.ok(Math.abs(r.total - total) < 1e-9);
  assert.ok(Math.abs(r.average - (total + 1) / SWITCH_DAYS) < 1e-9);
  assert.equal(r.payback, payback);
  assert.ok(r.average < r.full && r.average > r.first);
});
