import test from 'node:test';
import assert from 'node:assert/strict';
import { assignTools, trainingPlan, toolKindFor } from '../src/lib/staffing.js';

const worker = (id, good, production, traits = [], tool = null) => ({ id, name: id, company: 'c', good, perPoint: 0.1, production, traits, tool });

test('the best tool goes to the highest output, and only to a matching good', () => {
  const workers = [worker('low', 'lead', 2), worker('high', 'lead', 6), worker('paper', 'paper', 9)];
  const r = assignTools(workers, [{ id: 'a', code: 'pickaxe2', percent: 10 }, { id: 'b', code: 'pickaxe3', percent: 18 }]);
  const holder = (id) => r.assigned.find((a) => a.tool.id === id)?.worker.id;
  assert.equal(holder('b'), 'high');
  assert.equal(holder('a'), 'low');
  assert.equal(toolKindFor('paper'), 'flask');
});

test('a held tool can move to someone it helps more; spare tools with no taker stay idle', () => {
  const workers = [worker('a', 'lead', 2, [], { id: 't', code: 'pickaxe3', percent: 18 }), worker('b', 'lead', 7)];
  const r = assignTools(workers, [{ id: 's', code: 'sickle2', percent: 9 }]);
  assert.equal(r.assigned.find((x) => x.tool.id === 't').worker.id, 'b');
  assert.ok(r.total > r.current);
  assert.equal(r.idle[0].id, 's');
});

test('Handy gets more from a tool; Improviser only from a good one', () => {
  const r = assignTools([worker('h', 'lead', 3, ['handy']), worker('p', 'lead', 5)], [{ id: 'x', code: 'pickaxe1', percent: 5 }]);
  assert.equal(r.assigned[0].worker.id, 'h');
  const imp = assignTools([worker('i', 'lead', 5, ['improviser'])], [{ id: 'y', code: 'pickaxe1', percent: 5 }]);
  assert.equal(imp.assigned.length, 0);
});

test('train who earns per Production point, negotiate the overpaid, replace the hopeless', () => {
  const base = { company: 'c', perPoint: 0.1, production: 4, bonusPercent: 20, potential: 1, potentialMax: 6 };
  const plan = trainingPlan([
    { ...base, id: 'cheap', name: 'cheap', wageExpectation: 0.8, payroll: 0.6 * 4 * 0.8, profit: 1 },
    { ...base, id: 'dear', name: 'dear', wageExpectation: 1.3, payroll: 0.6 * 4 * 1.3, profit: -0.3 },
    { ...base, id: 'hopeless', name: 'hopeless', perPoint: 0.05, wageExpectation: 1.3, payroll: 0.6 * 4 * 1.3, profit: -2 },
  ], 0.6, (w) => (w.id === 'hopeless' ? 1.5 : 0));
  const v = Object.fromEntries(plan.map((p) => [p.worker.id, p.verdict]));
  assert.deepEqual(v, { cheap: 'train', dear: 'negotiate', hopeless: 'replace' });
});
