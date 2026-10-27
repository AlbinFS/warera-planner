/**
 * Contract optimizer: the builds that pay best under a bounty contract.
 *
 * net = (bounty + pool loot) × damage / 1000 + economy income − cost
 *
 * - Gear only: every exact build the optimizer offers across the player's
 *   damage range, kept when no other build beats it on both damage and cost.
 * - Skills + gear: a hill climb over skill layouts for the one whose best
 *   build reaches the most damage while net stays at or above −willing to lose.
 *   Optionally the economy skills are searched too, with the income change
 *   from the Eco page's income model (companies and employees).
 */
import { getEngine } from '../engine/browser.js';
import { buildInput, FIGHT_SKILLS, ECONOMY_SKILLS, ALL_SKILLS } from '../engine/inputs.js';
import { setupFor, costOf, optimizeSkills } from './compute.js';
import { loadCompanies, ecoEmployees, ecoSettings } from './eco.svelte.js';
import { dailyIncome, goodsProfit, ecoValue } from './eco.js';

// Damage steps between targets when listing builds (each run returns about ±6% around its target).
const TARGET_STEP = 1.1;
// Bisection on the damage target stops when the bracket is this tight: coarse
// while comparing layouts in the climb, fine for the layout it ends on.
const BISECT_PRECISION = 1.004;
const BISECT_COARSE = 1.03;
// Neighbours fully scored per step, after a one-run screen of all of them.
const SCREEN_KEEP = 4;
// Daily damage ranges the seeding tries with the original's skill optimizer, and its time limit per run.
const SEED_DAILY_DAMAGE = [400e3, 1e6, 2.5e6];
const SEED_TIME_MS = 8000;

/** A build's result under the contract terms; break-even is the bounty rate where net is 0. */
export function evaluate(p, { bounty, poolLoot, economy }) {
  const income = ((bounty + poolLoot) * p.damage) / 1000;
  const net = income + economy - p.cost;
  const breakEven = p.damage > 0 ? ((p.cost - economy) / p.damage) * 1000 - poolLoot : Infinity;
  return { ...p, income, net, breakEven };
}

/** Builds no other build beats on both damage and cost. */
export function frontier(points) {
  const sorted = [...points].sort((a, b) => b.damage - a.damage || a.cost - b.cost);
  const kept = [];
  let cheapest = Infinity;
  for (const p of sorted) {
    if (p.cost < cheapest - 1e-9) {
      kept.push(p);
      cheapest = p.cost;
    }
  }
  return kept;
}

const pointOf = (point, build, market, settings) => ({
  damage: point.damagePerDay, cost: costOf(point, market, settings), food: build.foodCode, equipment: build.equipment,
});

function buildKey(p) {
  return JSON.stringify([p.food, Object.entries(p.equipment ?? {}).map(([slot, it]) => [slot, typeof it === 'string' ? it : it && [it.code, it.skills]])]);
}

/** Every exact build across the damage range of one skill layout. */
export async function collectBuilds(market, planner, settings, skills, onProgress) {
  const engine = getEngine();
  const input = buildInput(market, setupFor(planner, settings, { locked: false, skills }));
  const run = (target, graph) => engine.optimize({ mode: 'damage', input, target, maxBudget: Infinity, graph }).then((r) => r.result);
  const [cheapest, strongest] = await Promise.all([run(0, false), run(1e12, false)]);
  if (!cheapest || !strongest) throw new Error('The optimizer found no feasible build (missing prices?).');
  const min = Math.max(1, cheapest.selectedDamageCostPoint.damagePerDay);
  const max = strongest.selectedDamageCostPoint.damagePerDay;
  const targets = [];
  for (let t = min; t < max; t *= TARGET_STEP) targets.push(Math.round(t));
  targets.push(Math.round(max));

  const points = new Map();
  const add = (p) => p && Number.isFinite(p.damage) && Number.isFinite(p.cost) && points.set(buildKey(p), p);
  add(pointOf(cheapest.selectedDamageCostPoint, cheapest.build, market, settings));
  add(pointOf(strongest.selectedDamageCostPoint, strongest.build, market, settings));
  let finished = 0;
  const results = await Promise.all(targets.map(async (target) => {
    const r = await run(target, undefined);
    onProgress?.(++finished / targets.length);
    return r;
  }));
  for (const r of results) {
    if (!r) continue;
    add(pointOf(r.selectedDamageCostPoint, r.build, market, settings));
    for (const f of r.foodDamageCostResults ?? []) add(pointOf(f, { foodCode: f.foodCode, equipment: f.equipment }, market, settings));
  }
  return [...points.values()];
}

/**
 * Income per day for economy-skill layouts, from the Eco page's v0.27 model:
 * the player's companies with their engines and the employees entered on the
 * Eco page, at today's prices, and the Eco page's training and self-work settings.
 * (No job income: wages aren't part of the eco update's model.)
 */
export async function incomeModel(market, upgrades, planner) {
  const companies = await loadCompanies(planner.player.id);
  const config = { skills: market.gameConfigSkills, upgrades, items: market.gameConfigItems };
  const perPoint = Object.fromEntries(goodsProfit(config.items, market.itemPrices).map((g) => [g.code, g.perPoint]));
  const plan = {
    companies: companies.map((c) => ({ ...c, employees: ecoEmployees[c.id] ?? [] })),
    perPoint,
    // The employees' shown bonus includes the owner's Management as it is in the game.
    currentManagementValue: ecoValue(config.skills, 'management', planner.player.ecoLevels?.management ?? 0),
    selfWork: ecoSettings.selfWork,
    trainingsPerDay: Number(ecoSettings.trainingsPerDay) || 0,
  };
  return (levels) => dailyIncome(Object.fromEntries(ECONOMY_SKILLS.map((s) => [s, levels[s] ?? 0])), plan, config).total;
}

/** Point cost of each skill level and the highest level unlocked, from the game config. */
function skillRules(market, playerLevel) {
  const rules = {};
  for (const s of ALL_SKILLS) {
    const levels = market.gameConfigSkills[s]?.levels ?? {};
    const total = (n) => levels[String(n)]?.totalCost ?? (n * (n + 1)) / 2;
    const max = Math.max(0, ...Object.keys(levels).map(Number).filter((n) => (levels[String(n)]?.unlockAtLevel ?? 0) <= playerLevel));
    rules[s] = { total, max };
  }
  return rules;
}

const layoutKey = (levels) => ALL_SKILLS.map((s) => levels[s]).join(',');
const fightKey = (levels) => FIGHT_SKILLS.map((s) => levels[s]).join(',');

/**
 * The most damage a layout reaches while net stays at or above −maxLoss:
 * bisect on the damage target, each step asking for the cheapest build that
 * reaches it. Runs are cached per fight layout, so layouts that differ only in
 * economy skills start from a tight bracket. With `floor` (the best damage so
 * far), a layout that can't beat it is dropped after one run; the floor only
 * rises, so a cached null stays correct.
 */
function curveOf(levels, ctx) {
  const key = fightKey(levels);
  let curve = ctx.curves.get(key);
  if (!curve) {
    curve = { input: buildInput(ctx.market, setupFor(ctx.planner, ctx.settings, { locked: false, skills: levels })), runs: new Map(), done: [] };
    ctx.curves.set(key, curve);
  }
  return curve;
}

/** The cheapest build of a layout reaching `target` damage, under the contract terms (one optimizer run, cached). */
async function probe(levels, ctx, target) {
  const terms = { ...ctx.terms, economy: ctx.terms.economy + await ctx.incomeChange(levels) };
  return runAt(curveOf(levels, ctx), ctx, terms, target);
}

async function runAt(curve, ctx, terms, target) {
  target = Math.round(target);
  if (!curve.runs.has(target)) {
    curve.runs.set(target, ctx.engine.optimize({ mode: 'damage', input: curve.input, target, maxBudget: Infinity, graph: false }).then(({ result: r }) => {
      const p = r && pointOf(r.selectedDamageCostPoint, r.build, ctx.market, ctx.settings);
      const point = p && Number.isFinite(p.cost) ? p : null;
      curve.done.push({ target, point });
      return point;
    }));
  }
  const p = await curve.runs.get(target);
  return p && evaluate(p, terms);
}

async function scoreLayout(levels, ctx, floor, precision = BISECT_PRECISION) {
  const curve = curveOf(levels, ctx);
  const terms = { ...ctx.terms, economy: ctx.terms.economy + await ctx.incomeChange(levels) };
  const ok = (p) => p && p.net >= -ctx.maxLoss - 1e-9;
  const at = (target) => runAt(curve, ctx, terms, target);
  let lo = null;
  if (floor) {
    lo = await at(floor);
    if (!ok(lo)) return null;
  }
  const strongest = await at(1e12);
  if (!strongest) return null;
  if (ok(strongest)) return strongest;
  lo ??= await at(0);
  if (!ok(lo)) {
    const tried = [lo, strongest];
    lo = null;
    for (const share of [0.2, 0.4, 0.6]) {
      const p = await at(strongest.damage * share);
      tried.push(p);
      if (ok(p)) lo = p;
    }
    // Nothing within the limit: report the smallest loss, so a climb can head towards the limit.
    if (!lo) return { ...tried.filter(Boolean).reduce((a, b) => (b.net > a.net ? b : a)), outside: true };
  }
  let hi = strongest.damage;
  for (const { point } of curve.done) {
    const p = point && evaluate(point, terms);
    if (ok(p) && p.damage > lo.damage) lo = p;
  }
  for (const { target, point } of curve.done) {
    if (target > lo.damage && target < hi && !ok(point && evaluate(point, terms))) hi = target;
  }
  while (hi / Math.max(1, lo.damage) > precision) {
    const mid = Math.sqrt(Math.max(1, lo.damage) * hi);
    const p = await at(mid);
    if (ok(p) && p.damage > lo.damage) lo = p;
    else hi = mid;
  }
  return lo;
}

/** Raise one searched skill a level, paid from unused points or by lowering one or two others. */
function neighbours(levels, rules, budget, searched) {
  const used = (l) => searched.reduce((sum, s) => sum + rules[s].total(l[s]), 0);
  const out = [];
  const seen = new Set();
  const push = (l) => {
    const key = layoutKey(l);
    if (!seen.has(key) && used(l) <= budget) { seen.add(key); out.push(l); }
  };
  for (const up of searched) {
    if (levels[up] >= rules[up].max) continue;
    const raised = { ...levels, [up]: levels[up] + 1 };
    if (used(raised) <= budget) { push(raised); continue; }
    for (const a of searched) {
      if (a === up || raised[a] <= 0) continue;
      const one = { ...raised, [a]: raised[a] - 1 };
      if (used(one) <= budget) { push(one); continue; }
      for (const b of searched) {
        if (b === up || b <= a || one[b] <= 0) continue;
        push({ ...one, [b]: one[b] - 1 });
      }
    }
  }
  return out;
}

/**
 * More damage within the loss limit wins; ties go to the better net. A layout
 * outside the limit loses to any inside it; between two outside, the smaller loss wins.
 */
const better = (a, b) => {
  if (!a) return false;
  if (!b) return true;
  if (a.outside || b.outside) return !a.outside ? true : !b.outside ? false : a.net > b.net + 1e-6;
  return a.damage > b.damage * (1 + 1e-6) || (Math.abs(a.damage - b.damage) <= b.damage * 1e-6 && a.net > b.net + 1e-6);
};
// The pruning floor only applies once a layout inside the limit is known.
const floorOf = (best) => (best && !best.outside ? best.damage : undefined);

/**
 * Hill climb over skill layouts from the planned one, scoring neighbours in parallel.
 * options: { terms, maxLoss, economySearch, upgrades, onStep, signal }.
 */
export async function searchSkills(market, planner, settings, options) {
  const { terms, maxLoss, economySearch, onStep, signal } = options;
  const start = { ...planner.skills };
  const ctx = { market, planner, settings, terms, maxLoss, engine: getEngine(), curves: new Map(), incomeChange: async () => 0 };
  if (economySearch) {
    if (!planner.player) throw new Error('Load a player first: the economy search needs their companies.');
    const income = await incomeModel(market, options.upgrades, planner);
    const base = income(start);
    ctx.incomeChange = async (l) => income(l) - base;
    ctx.baseIncome = base;
  }
  const rules = skillRules(market, planner.player?.level ?? 1);
  // Searching economy skills means every point is in play (Leadership too: it earns nothing here, so it's the first to give up).
  const searched = economySearch ? ALL_SKILLS : FIGHT_SKILLS;
  const keptPoints = ALL_SKILLS.filter((s) => !searched.includes(s)).reduce((sum, s) => sum + rules[s].total(start[s]), 0);
  const budget = (planner.player?.level ?? 1) * 4 - keptPoints;
  const used = (l) => searched.reduce((sum, s) => sum + rules[s].total(l[s]), 0);
  const scored = new Map();
  const score = (levels, floor) => {
    const key = layoutKey(levels);
    if (!scored.has(key)) scored.set(key, scoreLayout(levels, ctx, floor, BISECT_COARSE).catch(() => null));
    return scored.get(key);
  };

  const fits = (l) => used(l) <= budget && searched.every((s) => l[s] >= 0 && l[s] <= rules[s].max);
  const step = { n: 0 };
  const report = async (levels, best) => ({ step: step.n, levels, best: best?.outside ? null : best, checked: scored.size, budget, used: used(levels), incomeChange: await ctx.incomeChange(levels), baseIncome: ctx.baseIncome });

  async function bestSeed(planned) {
    let seed = { levels: planned, result: await score(planned) };
    const tried = new Set();
    // The original's optimizer runs one at a time (one skills worker); scoring its
    // layouts uses the build optimizers, so it runs alongside the next seed.
    const seedFor = async (daily) => {
      const key = Math.round(daily);
      if (tried.has(key) || signal?.aborted) return null;
      tried.add(key);
      const r = await optimizeSkills(market, planner, settings, {
        min: daily / 1.25, max: daily, keepEconomy: !economySearch, jobIncome: false, timeLimitMs: SEED_TIME_MS, signal,
      }).catch(() => null);
      if (!r?.skills) return null;
      const levels = { ...start, ...Object.fromEntries(searched.map((s) => [s, r.skills[s] ?? 0])) };
      return fits(levels) ? { levels, daily, scoring: score(levels) } : null;
    };
    const keepBest = async (list) => {
      for (const c of list.filter(Boolean)) {
        const result = await c.scoring;
        if (better(result, seed.result)) seed = { levels: c.levels, result, daily: c.daily };
      }
      onStep?.({ ...(await report(seed.levels, seed.result)), seeding: true });
    };
    const first = [];
    for (const daily of SEED_DAILY_DAMAGE) first.push(await seedFor(daily));
    await keepBest(first);
    // A strong player: keep going up while the highest range wins.
    const top = SEED_DAILY_DAMAGE.at(-1);
    for (let daily = top * 2.5; seed.daily && seed.daily * 2.5 >= daily && daily <= 50e6; daily *= 2.5) await keepBest([await seedFor(daily)]);
    // Refine around the best range found.
    if (seed.daily) {
      const more = [];
      for (const f of [0.63, 1.58]) more.push(await seedFor(seed.daily * f));
      await keepBest(more);
    }
    return seed.levels;
  }

  /** Hill climb from one layout; a winning move is repeated while it keeps helping. */
  async function climb(levels) {
    let best = await score(levels);
    onStep?.(await report(levels, best));
    for (;;) {
      if (signal?.aborted) break;
      const options = neighbours(levels, rules, budget, searched);
      const pick = async (list) => (await Promise.all(list.map(async (l) => ({ levels: l, result: await score(l, floorOf(best)) }))))
        .reduce((a, b) => (better(b.result, a?.result) ? b : a), null);
      let winner = null;
      if (best && !best.outside) {
        // Screen with one run each at the current best damage: the layouts with the
        // most money to spare there have the most room for more. Only the top few get scored.
        const screened = await Promise.all(options.map(async (l) => ({ l, p: await probe(l, ctx, best.damage) })));
        winner = await pick(screened.filter(({ p }) => p && p.net >= -maxLoss - 1e-9).sort((a, b) => b.p.net - a.p.net).slice(0, SCREEN_KEEP).map(({ l }) => l));
      }
      // Nothing from the screen (or no layout inside the limit yet): score every neighbour before giving up.
      if (!better(winner?.result, best)) winner = await pick(options);
      if (!winner || !better(winner.result, best)) break;
      const move = Object.fromEntries(searched.map((s) => [s, winner.levels[s] - levels[s]]));
      levels = winner.levels;
      best = winner.result;
      // Repeat the move while it helps, doubling each time (1, 2, 4… more), halving back on a miss.
      for (let times = 1; times >= 1;) {
        const again = { ...levels };
        for (const s of searched) again[s] += move[s] * times;
        const r = !signal?.aborted && fits(again) ? await score(again, floorOf(best)) : null;
        if (better(r, best)) { levels = again; best = r; times *= 2; } else times = Math.floor(times / 2);
      }
      step.n++;
      onStep?.(await report(levels, best));
    }
    return { levels, best };
  }

  // Start from the planned layout, trimming the highest fight skills if it's over budget.
  const planned = { ...start };
  while (used(planned) > budget) {
    const top = FIGHT_SKILLS.reduce((a, b) => (planned[b] > planned[a] ? b : a));
    planned[top] -= 1;
  }
  // Seeds from the original's skill optimizer (a few seconds each): its cheapest
  // layout for a spread of daily damage ranges. The best-scoring one, or the
  // planned layout if that's better, is where the climb starts; from there it
  // usually needs only a few steps. (A start from all zeros ends on lopsided layouts.)
  const result = await climb(await bestSeed(planned));
  // The climb compared layouts roughly; pin down the one it ended on.
  if (result.best && !result.best.outside) result.best = (await scoreLayout(result.levels, ctx)) ?? result.best;
  return report(result.levels, result.best);
}
