import test from 'node:test';
import assert from 'node:assert/strict';
import { companyModel } from '../src/lib/hiring.js';
import { checkChance, rateEvent, EVENTS } from '../src/lib/events.js';

const place = { good: 'paper', raw: false, storage: 3, country: 'se', homeCountry: 'se', tax: 0 };
const opts = { perPoint: 0.1, fairWage: 0.6 };
const emp = (name, extra = {}) => ({
  id: name, name, nationality: 'se', gender: 'male', traits: [], production: 4, bonusPercent: 6, payroll: 2.4, wageExpectation: 1,
  happiness: { value: 50 }, stats: { responsibility: { total: 2 }, luck: { total: 3 } }, bonus: [{ source: 'management', percent: 6 }],
  potential: 3, potentialMax: 6, age: 30, ...extra,
});

test('a check: base, traits, Management, Luck and happiness, held in 5–90 %', () => {
  const check = { type: 'standard', base: 45, traitMods: { quickStudy: 10 } };
  // Luck counts from the first point since v0.27.3: Luck 3 is +6 on a standard check.
  assert.ok(Math.abs(checkChance(check, { who: emp('A') }) - 0.51) < 1e-9);
  // Quick Study +10, Management 3 (+6), Luck 5 (+2 a point on a standard check), happiness 70 (+4).
  const who = emp('A', { traits: ['quickStudy'], happiness: { value: 70 }, stats: { luck: { total: 5 } } });
  assert.ok(Math.abs(checkChance(check, { who, management: 3 }) - 0.75) < 1e-9);
  // A Luck check counts Luck at 4 % a point.
  assert.ok(Math.abs(checkChance({ type: 'luck', base: 50 }, { who: emp('A', { stats: { luck: { total: 5 } } }) }) - 0.70) < 1e-9);
  assert.equal(checkChance({ type: 'standard', base: 99 }, { who: emp('A') }), 0.9);
  assert.equal(checkChance({ type: 'standard', base: 0 }, { who: emp('A', { happiness: { value: 0 } }) }), 0.05);
});

test('On fire: letting the streak run beats sending them home, by its odds and output', () => {
  const team = [emp('A', { happiness: { value: 70 } }), emp('B')];
  const model = companyModel(team, place, opts);
  const answers = rateEvent('onFire', { model, employees: team, self: 0 });
  assert.equal(answers[0].key, EVENTS.onFire.options[0].key);
  const run = answers.find((a) => a.key === EVENTS.onFire.options[0].key);
  // Chance 55 % base + 4 for happiness 70 + 6 for Luck 3; the results' chances add up to 1.
  assert.ok(Math.abs(run.chance - 0.65) < 1e-9);
  assert.ok(Math.abs(run.results.reduce((s, r) => s + r.p, 0) - 1) < 1e-9);
  // +30 % for 24 h on 24 points a day at 0.1 G is 0.72 G.
  assert.ok(Math.abs(run.results.find((r) => r.kind === 'success').value - 0.72) < 1e-9);
});

test('an answer only for some employees is marked, and paying gold counts as a cost', () => {
  const team = [emp('A')];
  const model = companyModel(team, place, opts);
  const answers = rateEvent('burningOut', { model, employees: team, self: 0 });
  const doctor = answers.find((a) => a.key === 'doctor' || a.costs.some((c) => /wage/.test(c.text)) && !a.available);
  assert.ok(doctor && !doctor.available);
  assert.ok(answers.every((a) => Number.isFinite(a.ev)));
});

test('every event can be worked out for one or two employees without an error', () => {
  const team = [emp('A', { traits: ['gambler'] }), emp('B', { traits: ['loyal'] })];
  const model = companyModel(team, place, opts);
  for (const code of Object.keys(EVENTS)) {
    const answers = rateEvent(code, { model, employees: team, self: 0, partner: EVENTS[code].participants === 2 ? 1 : null, prices: { scraps: 1, case1: 3 }, toolboxValue: 5, selfWork: 2 });
    assert.ok(answers.length, code);
    for (const a of answers) assert.ok(Number.isFinite(a.ev), `${code} ${a.key}`);
  }
});
