import test from 'node:test';
import assert from 'node:assert/strict';
import { companyModel } from '../src/lib/hiring.js';
import { moveValue, bestMoves } from '../src/lib/moving.js';

const place = (good) => ({ raw: false, storage: 3, country: 'se', homeCountry: 'se', tax: 0, good });
const opts = { perPoint: 0.1, fairWage: 0.6 };
const emp = (id, traits = [], { production = 4, traitArgs = {} } = {}) => ({
  id, name: id, nationality: 'se', gender: 'female', traits, traitArgs, production, bonusPercent: 11, payroll: 0.6 * production,
  wageExpectation: 1, happiness: { value: 50 }, stats: { responsibility: { total: 2 } },
  bonus: [{ source: 'management', percent: 6 }, { source: 'coreRegion', percent: 5 }],
});
const side = (id, employees, capacity, good = 'cookedFish') => ({ id, name: id, employees, capacity, model: companyModel(employees, place(good), opts) });

test('moving the old friend over turns the holder\'s +15 % on, for the 7 days\' happiness', () => {
  const c9 = side('C9', [emp('Ellen'), emp('Anna'), emp('Bo')], 3);
  const c10 = side('C10', [emp('Pernilla', ['oldFriends'], { traitArgs: { oldFriends: 'Ellen' } }), emp('Cia')], 3);
  const v = moveValue(c9, 0, c10);
  const pernilla = v.changes.find((c) => c.name === 'Pernilla');
  assert.ok(pernilla.change > 0, 'Pernilla gains');
  // The move's −5 happiness costs Ellen a little the first week, so day 1 is below the settled gain.
  assert.ok(v.first < v.full);
  assert.ok(v.total > 0);
  assert.equal(bestMoves([c9, c10])[0].name, 'Ellen');
});

test('a full company takes someone only as a swap', () => {
  const a = side('A', [emp('X')], 1);
  const b = side('B', [emp('Y')], 1);
  assert.equal(moveValue(a, 0, b), null);
  assert.ok(moveValue(a, 0, b, { swap: 0 }));
});

test('moving to another good starts specialization over, day by day', () => {
  const specialist = { ...emp('S'), bonusPercent: 31, bonus: [{ source: 'management', percent: 6 }, { source: 'coreRegion', percent: 5 }, { source: 'specialization', percent: 20 }], specializations: { cookedFish: 20 } };
  const a = side('A', [specialist], 2);
  const b = side('B', [], 2, 'bread');
  const v = moveValue(a, 0, b);
  assert.ok(v.first < v.full && v.full <= 0);
});

test('a hired manager\'s bonus stays with their company', () => {
  const managed = (id) => ({ ...emp(id), bonusPercent: 23, bonus: [{ source: 'management', percent: 6 }, { source: 'coreRegion', percent: 5 }, { source: 'manager', percent: 12 }] });
  const a = { ...side('A', [managed('M'), managed('N')], 3), manager: 12 };
  const b = side('B', [emp('O')], 3);
  const moved = moveValue(a, 0, b);
  assert.ok(moved.changes[0].change < 0, 'leaving the manager costs the one moved');
});
