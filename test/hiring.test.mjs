import test from 'node:test';
import assert from 'node:assert/strict';
import { companyModel, hireValue, bestHires, traitChance, rankTraits, tierOf, rateCandidate } from '../src/lib/hiring.js';
import { trainingCards } from '../src/lib/training.js';

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
  const { cards } = trainingCards(companyModel(team, place, opts), 0);
  assert.ok(cards.find((c) => c.card === 'rehab' && c.trait === 'xenophobe').total > 0);
});

test('a trait that matches the team comes before the tier list', () => {
  const model = companyModel([emp('A', 'se', 'female', []), emp('B', 'se', 'female', [])], place, opts);
  const r = rankTraits(model, { nationality: 'se', gender: 'female' });
  assert.equal(r.matches[0].trait, 'girlPower');
  assert.ok(!r.lookFor.some((t) => t.trait === 'girlPower'));
});

test('a foreigner next to a Xenophobe clashes; otherwise traits follow the tiers', () => {
  const model = companyModel([emp('X', 'se', 'male', ['xenophobe']), emp('B', 'se', 'male', [])], place, opts);
  const r = rankTraits(model, { nationality: 'se', gender: 'male' });
  assert.ok(r.clashes.length === 0);
  const tiers = r.lookFor.map((t) => tierOf(t.trait));
  assert.deepEqual(tiers, [...tiers].sort((a, b) => 'SABCDEF'.indexOf(a) - 'SABCDEF'.indexOf(b)));
  // Cosmopolitan matches a team of mixed nationalities, not one where everyone is from one country.
  const mixed = rankTraits(companyModel([emp('C', 'se', 'male', []), emp('D', 'fi', 'male', [])], place, opts), { nationality: 'de', gender: 'male' });
  assert.ok(mixed.matches.some((t) => t.trait === 'cosmopolitan'));
  const swedes = rankTraits(companyModel([emp('C', 'se', 'male', []), emp('D', 'se', 'male', [])], place, opts), { nationality: 'de', gender: 'male' });
  assert.ok(!swedes.matches.some((t) => t.trait === 'cosmopolitan'));
  // A Misogynist next to women clashes.
  const women = rankTraits(companyModel([emp('A', 'se', 'female', []), emp('B', 'se', 'female', [])], place, opts), { nationality: 'se', gender: 'male' });
  assert.ok(women.clashes.some((t) => t.trait === 'misogynist'));
});

test('a real candidate: more Production and a lower wage hint score higher; a full company replaces its weakest', () => {
  const model = companyModel([emp('A', 'se', 'male', [], { production: 4 })], place, opts);
  const card = (production, expectation, extra = {}) => rateCandidate(model, { nationality: 'se', gender: 'male', trait: null, production, responsibility: 2, expectation, ...extra });
  assert.ok(card(4, 0.8).value > card(2, 0.8).value);
  assert.ok(card(3, 0.75).value > card(3, 1.25).value);
  // Wage follows Production × expectation.
  assert.ok(Math.abs(card(3, 1.1).wage - 0.6 * 3 * 1.1) < 1e-9);
  const full = companyModel([emp('Weak', 'se', 'male', [], { production: 1 }), emp('Strong', 'se', 'male', [], { production: 4 })], place, opts);
  assert.equal(rateCandidate(full, { nationality: 'se', gender: 'male', trait: null, production: 4, responsibility: 2, expectation: 0.8 }, { full: true }).replaces, 'Weak');
});

test('age-based traits follow the candidate\'s age', () => {
  const model = companyModel([emp('A', 'se', 'male', [])], place, opts);
  const at = (age, trait) => rateCandidate(model, { nationality: 'se', gender: 'male', trait, production: 3, responsibility: 2, expectation: 1, age }).value;
  // A Late Bloomer gains Production once past 40; a young one gets there later.
  assert.ok(at(44, 'lateBloomer') > at(20, 'lateBloomer'));
  assert.ok(at(56, 'wornOut') < at(20, 'wornOut'));
});

test('a Specialist counts their own good when it is known', async () => {
  const { canGain } = await import('../src/lib/hiring.js');
  const at = { ...place, good: 'iron' };
  const own = companyModel([emp('S', 'se', 'male', [])], at, opts);
  const match = hireValue(own, { nationality: 'se', gender: 'male', trait: 'specialist', specialistGood: 'iron' });
  const miss = hireValue(own, { nationality: 'se', gender: 'male', trait: 'specialist', specialistGood: 'steel' });
  const unknown = hireValue(own, { nationality: 'se', gender: 'male', trait: 'specialist' });
  assert.ok(match.value > unknown.value && unknown.value > miss.value);
  // The game's clashes: no Modest for the Greedy, no Handy for a Scavenger; gender traits by gender.
  assert.equal(canGain('modest', ['greedy'], 'male'), false);
  assert.equal(canGain('handy', ['scavenger'], 'male'), false);
  assert.equal(canGain('girlPower', [], 'male'), false);
  assert.equal(canGain('loyal', ['greedy', 'xenophobe'], 'male'), true);
});

test('firing costs every coworker 5 happiness for a day, once; a recent firing or move is not part of their worth', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const team = [emp('A', 'se', 'male', []), emp('B', 'se', 'male', []), emp('C', 'se', 'male', [])];
  const model = companyModel(team, place, { ...opts, now });
  const r = hireValue(model, { nationality: 'se', gender: 'male', trait: null }, { replace: 0 });
  // Two coworkers stay, each 5 happiness down (Responsibility 2 shields a fifth): 4 points of bonus on 24 points a day, at 0.1 G.
  assert.ok(Math.abs(r.fireCost - 2 * 24 * 0.04 * 0.1) < 1e-6, String(r.fireCost));
  assert.equal(hireValue(model, { nationality: 'se', gender: 'male', trait: null }).fireCost, 0);

  // 12 hours into an earlier firing: firing again restarts the timer, so it costs only the 12 hours added.
  const until = new Date(now + 12 * 3600e3).toISOString();
  const fired = (e) => ({ ...e, bonusPercent: e.bonusPercent - 4, happiness: { value: 46, reasons: [{ reason: 'coworkerFired', delta: -5, until }] } });
  const after = companyModel(team.map(fired), place, { ...opts, now });
  const again = hireValue(after, { nationality: 'se', gender: 'male', trait: null }, { replace: 0 });
  assert.ok(Math.abs(again.fireCost - r.fireCost / 2) < 1e-6);
  // And the −5 they carry today isn't held against them: same worth as before the firing.
  assert.ok(Math.abs(again.value - r.value) < 1e-6);

  // Moved an hour ago: can't be fired yet, so not the one replaced.
  const moved = { ...team[0], name: 'M', production: 1, happiness: { value: 46, reasons: [{ reason: 'recentlyMoved', delta: -5, until: new Date(now + 7 * 864e5 - 3600e3).toISOString() }] } };
  const m = companyModel([moved, team[1], team[2]], place, { ...opts, now });
  assert.equal(m.team[0].fireBlocked, true);
  assert.notEqual(rateCandidate(m, { nationality: 'se', gender: 'male', production: 4 }, { full: true }).replaces, 'M');
});
