import test from 'node:test';
import assert from 'node:assert/strict';
import { companyModel, hireValue, bestHires, trainingCards, traitChance } from '../src/lib/hiring.js';

const place = { raw: false, storage: 3, country: 'se', homeCountry: 'se', tax: 0 };
const opts = { perPoint: 0.1, fairWage: 0.6 };
// An employee as eco.svelte.js loads them, with today's effects already in.
const emp = (name, nationality, gender, traits, { production = 4, bonus = 11, happiness = 50 } = {}) => ({
  name, nationality, gender, traits, production, bonusPercent: bonus, payroll: 0.6 * production,
  wageExpectation: 1, happiness: { value: happiness }, stats: { responsibility: { total: 2 } },
  bonus: [{ source: 'management', percent: 6 }, { source: 'coreRegion', percent: 5 }],
});

test('a Xenophobe coworker makes a compatriot the better hire', () => {
  const model = companyModel([emp('X', 'se', 'male', ['xenophobe'])], place, opts);
  const same = hireValue(model, { nationality: 'se', gender: 'male', trait: null });
  const other = hireValue(model, { nationality: 'fi', gender: 'male', trait: null });
  assert.ok(same.value > other.value);
  assert.ok(other.coworkers[0].change < 0);
  assert.equal(same.coworkers[0].change, 0);
});

test('a Cosmopolitan coworker gains from a new nationality', () => {
  const model = companyModel([emp('C', 'se', 'female', ['cosmopolitan'])], place, opts);
  const other = hireValue(model, { nationality: 'fi', gender: 'male', trait: null });
  assert.ok(other.coworkers[0].change > 0);
});

test('effects already in today\'s numbers are not counted twice', () => {
  // A Xenophobe already next to a foreigner: hiring a compatriot changes nothing for them.
  const team = [emp('X', 'se', 'male', ['xenophobe'], { production: 2, happiness: 45 }), emp('F', 'fi', 'male', [])];
  const model = companyModel(team, place, opts);
  const r = hireValue(model, { nationality: 'se', gender: 'male', trait: null });
  assert.ok(Math.abs(r.coworkers[0].change) < 1e-9);
});

test('a Loner alone loses their bonus when anyone is hired', () => {
  const model = companyModel([emp('L', 'se', 'male', ['loner'], { bonus: 116, happiness: 55 })], place, opts);
  assert.ok(hireValue(model, { nationality: 'se', gender: 'male', trait: null }).coworkers[0].change < 0);
});

test('the best hire beats a plain one, and gendered traits fit the gender', () => {
  const model = companyModel([emp('A', 'se', 'female', []), emp('B', 'se', 'female', [])], place, opts);
  const all = bestHires(model);
  assert.ok(all[0].value >= all.find((h) => !h.trait && h.nationality === 'se').value);
  assert.ok(all.every((h) => h.trait !== 'girlPower' || h.gender === 'female'));
  assert.equal(traitChance('girlPower', 'male'), 0);
});

test('rehab of a hurting trait is worth something', () => {
  const team = [emp('X', 'se', 'male', ['xenophobe'], { production: 2, happiness: 45 }), emp('F', 'fi', 'male', [])];
  const cards = trainingCards(companyModel(team, place, opts), 0);
  assert.ok(cards.find((c) => c.card === 'Rehab' && c.trait === 'xenophobe').value > 0);
});
