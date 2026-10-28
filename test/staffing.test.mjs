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

test('train when a session beats self-work, else skip; replace the hopeless', () => {
  const base = { company: 'c', perPoint: 0.1, production: 4, bonusPercent: 20, potential: 1, potentialMax: 6, daysLeft: 30 };
  const plan = trainingPlan([
    { ...base, id: 'cheap', name: 'cheap', wageExpectation: 0.8, payroll: 0.6 * 4 * 0.8, profit: 1 },
    { ...base, id: 'dear', name: 'dear', wageExpectation: 1.3, payroll: 0.6 * 4 * 1.3, profit: -0.3 },
    { ...base, id: 'hopeless', name: 'hopeless', perPoint: 0.05, wageExpectation: 1.3, payroll: 0.6 * 4 * 1.3, profit: -2 },
    { ...base, id: 'old', name: 'old', wageExpectation: 0.8, payroll: 0.6 * 4 * 0.8, profit: 1, daysLeft: 1 },
  ], 0.6, (w) => (w.id === 'hopeless' ? 1.5 : 0), { selfWork: 3 });
  const v = Object.fromEntries(plan.map((p) => [p.worker.id, p.verdict]));
  // 'old' retires tomorrow: a session's +1.5 Production pays for a day, less than self-work.
  assert.deepEqual(v, { cheap: 'train', dear: 'skip', hopeless: 'replace', old: 'skip' });
});

test('a toolbox is worth a tool to whoever lacks one, for as long as it lasts', async () => {
  const { toolboxValue } = await import('../src/lib/staffing.js');
  const all = [worker('a', 'lead', 4, [], { id: 't', code: 'pickaxe3', percent: 18 }), worker('b', 'lead', 4)];
  // b lacks a pickaxe: 18 % of 4 ÷ 4 × 24 points a day at 0.1 G, for 500 h (20.8 days), one kind in 6.
  assert.ok(Math.abs(toolboxValue(all) - (0.18 * 24 * 0.1 * (500 / 24)) / 6) < 1e-9);
  assert.equal(toolboxValue([all[0]]), 0);
});

test('Handy takes the weakest tool: its +40 % comes with any tool, so the strong one goes to a bigger producer', () => {
  // Greedy best-first would give Handy the 30 % tool (70 % for them) and the other the 10 %: 85 in all.
  const workers = [worker('h', 'lead', 4, ['handy']), worker('n', 'lead', 6)];
  const r = assignTools(workers, [{ id: 'big', code: 'pickaxe4', percent: 30 }, { id: 'small', code: 'pickaxe2', percent: 10 }]);
  const holder = (id) => r.assigned.find((a) => a.tool.id === id)?.worker.id;
  assert.equal(holder('big'), 'n');
  assert.equal(holder('small'), 'h');
});

test('the exact assignment beats or matches every other on random cases', async () => {
  const { bestAssignment } = await import('../src/lib/staffing.js');
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const best = (g, row = 0, used = new Set()) => {
    if (row === g.length) return 0;
    let top = best(g, row + 1, used);
    for (let j = 0; j < g[0].length; j++) if (!used.has(j)) { used.add(j); top = Math.max(top, g[row][j] + best(g, row + 1, used)); used.delete(j); }
    return top;
  };
  for (let k = 0; k < 40; k++) {
    const rows = 1 + Math.floor(rand() * 5), cols = 1 + Math.floor(rand() * 5);
    const g = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < 0.2 ? 0 : Math.round(rand() * 100) / 10)));
    const a = bestAssignment(g);
    assert.equal(new Set(a.filter((j) => j >= 0)).size, a.filter((j) => j >= 0).length);
    const total = a.reduce((t, j, i) => t + (j >= 0 ? g[i][j] : 0), 0);
    assert.ok(Math.abs(total - best(g)) < 1e-9, `${total} vs ${best(g)}`);
  }
});

test('a Greedy employee earns less per trained point: their wage per point is 20 % higher', () => {
  const base = { id: 'a', name: 'a', company: 'c', perPoint: 0.1, production: 4, bonusPercent: 20, payroll: 2.4, wageExpectation: 1, potential: 1, potentialMax: 8, profit: 0.5, traits: [] };
  const [plain] = trainingPlan([base], 0.6);
  const [greedy] = trainingPlan([{ ...base, traits: ['greedy'] }], 0.6);
  assert.ok(Math.abs(plain.margin - greedy.margin - 0.6 * 0.2) < 1e-9);
});
