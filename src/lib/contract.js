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
 *   from the original's income model.
 */
import { getEngine } from '../engine/browser.js';
import { buildInput, skillsMarket, FIGHT_SKILLS, ECONOMY_SKILLS, ALL_SKILLS } from '../engine/inputs.js';
import { setupFor, costOf, loadEconomy } from './compute.js';

// Damage steps between targets when listing builds (each run returns about ±6% around its target).
const TARGET_STEP = 1.1;
// Bisection on the damage target stops when the bracket is this tight.
const BISECT_PRECISION = 1.004;

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
 * Income per day for economy-skill layouts, from the original skill optimizer
 * run with every skill locked (fight skills at 0, which don't change income).
 */
export function incomeModel(market, planner, settings, economy) {
  const cache = new Map();
  const level = planner.player?.level ?? 1;
  return (levels) => {
    const key = ECONOMY_SKILLS.map((s) => levels[s]).join(',');
    if (!cache.has(key)) {
      const skills = { ...Object.fromEntries(FIGHT_SKILLS.map((s) => [s, 0])), ...Object.fromEntries(ECONOMY_SKILLS.map((s) => [s, levels[s]])) };
      const setup = setupFor(planner, settings, { locked: false });
      const request = {
        market: skillsMarket(market, setup.dailyContext.debuffBuild),
        player: { level, totalSkillPoints: level * 4, militaryRankPercent: setup.militaryRankPercent, skills },
        combat: { pillEnabled: settings.pill, battleBonusPercent: setup.battleBonusPercent, scraps: true, debuffBuild: setup.dailyContext.debuffBuild },
        economy,
        range: { min: 1e6, max: 1e6, steps: 1 },
        locks: skills,
        resetCostPerPoint: null,
      };
      cache.set(key, getEngine().optimizeSkills(request, { timeLimitMs: 20000 }).then((r) => {
        const income = r?.result?.best?.income;
        if (!Number.isFinite(income)) throw new Error('The income model gave no result.');
        return income;
      }));
    }
    return cache.get(key);
  };
}

/** Point cost of each skill level and the highest level unlocked, from the game config. */
function skillRules(market, playerLevel) {
  const rules = {};
  for (const s of ALL_SKILLS) {
    const levels = market.gameConfigSkills[s]?.levels ?? {};
    const total = (n) => levels[String(n)]?.totalCost ?? (n * (n + 1)) / 2;
    // A skill the game config doesn't list (entrepreneurship was removed) stays where it is.
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
async function scoreLayout(levels, ctx, floor) {
  const key = fightKey(levels);
  let curve = ctx.curves.get(key);
  if (!curve) {
    curve = { input: buildInput(ctx.market, setupFor(ctx.planner, ctx.settings, { locked: false, skills: levels })), runs: new Map(), done: [] };
    ctx.curves.set(key, curve);
  }
  const terms = { ...ctx.terms, economy: ctx.terms.economy + await ctx.incomeChange(levels) };
  const ok = (p) => p && p.net >= -ctx.maxLoss - 1e-9;
  const at = async (target) => {
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
  };
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
    lo = null;
    for (const share of [0.2, 0.4, 0.6]) {
      const p = await at(strongest.damage * share);
      if (ok(p)) lo = p;
    }
    if (!lo) return null;
  }
  let hi = strongest.damage;
  for (const { point } of curve.done) {
    const p = point && evaluate(point, terms);
    if (ok(p) && p.damage > lo.damage) lo = p;
  }
  for (const { target, point } of curve.done) {
    if (target > lo.damage && target < hi && !ok(point && evaluate(point, terms))) hi = target;
  }
  while (hi / Math.max(1, lo.damage) > BISECT_PRECISION) {
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

/** More damage within the loss limit wins; ties go to the better net. */
const better = (a, b) => !!a && (!b || a.damage > b.damage * (1 + 1e-6) || (Math.abs(a.damage - b.damage) <= b.damage * 1e-6 && a.net > b.net + 1e-6));

/**
 * Hill climb over skill layouts from the planned one, scoring neighbours in
 * parallel. options: { terms, maxLoss, economySearch, onStep, signal }.
 */
export async function searchSkills(market, planner, settings, options) {
  const { terms, maxLoss, economySearch, onStep, signal } = options;
  const start = { ...planner.skills };
  const ctx = { market, planner, settings, terms, maxLoss, engine: getEngine(), curves: new Map(), incomeChange: async () => 0 };
  if (economySearch) {
    if (!planner.player) throw new Error('Load a player first: the economy search needs their companies.');
    const income = incomeModel(market, planner, settings, await loadEconomy(planner.player.id, market.itemPrices));
    const base = await income(start);
    ctx.incomeChange = async (l) => (await income(l)) - base;
    ctx.baseIncome = base;
  }
  const rules = skillRules(market, planner.player?.level ?? 1);
  const searched = economySearch ? ALL_SKILLS : FIGHT_SKILLS;
  const keptPoints = ALL_SKILLS.filter((s) => !searched.includes(s)).reduce((sum, s) => sum + rules[s].total(start[s]), 0);
  const budget = (planner.player?.level ?? 1) * 4 - keptPoints;
  const used = (l) => searched.reduce((sum, s) => sum + rules[s].total(l[s]), 0);
  const scored = new Map();
  const score = (levels, floor) => {
    const key = layoutKey(levels);
    if (!scored.has(key)) scored.set(key, scoreLayout(levels, ctx, floor).catch(() => null));
    return scored.get(key);
  };

  // Start from the planned layout; trim the highest fight skills if it's over budget.
  let levels = { ...start };
  while (used(levels) > budget) {
    const top = FIGHT_SKILLS.reduce((a, b) => (levels[b] > levels[a] ? b : a));
    levels[top] -= 1;
  }
  let best = await score(levels);
  let step = 0;
  const report = async () => ({ step, levels, best, checked: scored.size, budget, used: used(levels), incomeChange: await ctx.incomeChange(levels), baseIncome: ctx.baseIncome });
  onStep?.(await report());
  for (;;) {
    if (signal?.aborted) break;
    const results = await Promise.all(neighbours(levels, rules, budget, searched).map(async (l) => ({ levels: l, result: await score(l, best?.damage) })));
    const winner = results.reduce((a, b) => (better(b.result, a?.result) ? b : a), null);
    if (!winner || !better(winner.result, best)) break;
    levels = winner.levels;
    best = winner.result;
    step++;
    onStep?.(await report());
  }
  return report();
}
