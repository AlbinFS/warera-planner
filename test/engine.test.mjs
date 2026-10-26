/**
 * Replays the reference suite (answers recorded from the original optimizer
 * site) through the engine and checks every answer is reproduced exactly.
 *
 * The suite lives outside this repository (it holds real player data). Point
 * REFERENCE_DIR at it; by default ../warera-remake/reference is used, and the
 * tests are skipped when it isn't there. Skill cases take up to a minute
 * each, so only a few run unless FULL=1.
 *
 *   node --test test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../src/engine/engine.js';
import { buildInput, buildMarket, skillsMarket } from '../src/engine/inputs.js';
import { spawnNodeWorker } from './node-workers.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REF = path.resolve(root, process.env.REFERENCE_DIR ?? '../warera-remake/reference');
const available = fs.existsSync(path.join(REF, 'cases', 'equipment.jsonl'));
const skip = available ? false : `reference suite not found at ${REF} (set REFERENCE_DIR)`;

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(REF, file), 'utf8'));
const readCases = (file) => fs.readFileSync(path.join(REF, 'cases', file), 'utf8').trim().split('\n').map(JSON.parse);

let market;
let harness;
if (available) {
  market = buildMarket(readJson('data/game-config.json'), readJson('data/item-prices.json'), readJson('data/equipment-prices.json').items);
  harness = createRequire(import.meta.url)(path.join(REF, 'harness.js'));
}

/** A recorded scenario as engine setup: the suite names the page's daily context instead of storing it per case. */
const setup = (scenario) => ({
  ...scenario,
  dailyContext: scenario.dailyContext === 'page' ? harness.PAGE_DAILY_CONTEXT : scenario.dailyContext,
});

const engine = createEngine({ spawn: spawnNodeWorker, optimizers: 1, scorers: 6 });

test('inputs match the harness the suite was recorded with', { skip }, () => {
  const scenarios = readCases('equipment.jsonl').map((c) => c.scenario);
  const harnessMarket = harness.marketData();
  for (const s of scenarios) {
    assert.deepEqual(buildInput(market, setup(s)), harness.buildInput(harnessMarket, s));
  }
});

for (const [file, label] of [['equipment.jsonl', 'equipment optimizer'], ['profile.jsonl', 'profile presets']]) {
  test(`${label}: every recorded case reproduces`, { skip }, async () => {
    const cases = readCases(file);
    const different = [];
    for (const c of cases) {
      const reply = await engine.optimize({ ...c.request, input: buildInput(market, setup(c.scenario)) });
      if (JSON.stringify(reply.result ?? null) !== JSON.stringify(c.result) || (reply.reason ?? null) !== c.reason) different.push(c.id);
    }
    assert.deepEqual(different, [], `${different.length} of ${cases.length} cases differ`);
  });
}

test('improvement hints: every recorded case reproduces', { skip }, async () => {
  const cases = readCases('hints.jsonl');
  const different = [];
  for (const c of cases) {
    const points = await engine.hints(buildInput(market, setup(c.scenario)), c.build);
    if (JSON.stringify(points) !== JSON.stringify(c.points ?? [])) different.push(c.id);
  }
  assert.deepEqual(different, [], `${different.length} of ${cases.length} cases differ`);
});

test('skill optimizer: recorded cases reproduce (all with FULL=1)', { skip, timeout: 60 * 60 * 1000 }, async () => {
  const all = readCases('skills.jsonl');
  const cases = process.env.FULL ? all : all.filter((_, i) => i % 10 === 0);
  // The search reports how long it took; everything else must match.
  const strip = (r) => JSON.stringify(r, (k, v) => (k === 'elapsedMs' ? undefined : v));
  const different = [];
  for (const c of cases) {
    const response = await engine.optimizeSkills({ ...c.request, market: skillsMarket(market, c.request.combat.debuffBuild) });
    if (strip({ response }) !== strip(c.response)) different.push(c.id);
  }
  assert.deepEqual(different, [], `${different.length} of ${cases.length} cases differ`);
});
