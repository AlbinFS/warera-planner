/**
 * Contract optimizer: the builds that pay best under a bounty contract.
 *
 * net = bounty × damage / 1000 + loot + economy income − cost
 *
 * - Gear only: the builds across the player's damage range that no other
 *   beats on both damage and cost, for the planned skills.
 * - Skills + gear: the skill layout and gear with the most damage while net
 *   stays at or above −willing to lose (our own engine, src/combat; the
 *   search runs in a worker). Optionally the economy skills move too, with
 *   the income change from the Eco page's income model.
 */
import { FIGHT_SKILLS, ECONOMY_SKILLS } from '../engine/inputs.js';
import { prepare, buildFrontier } from '../combat/optimize.js';
import { searchLayout } from '../combat/client.js';
import { fightOptions, playerOf, toEquipment, keptPoints } from './compute.js';
import { incomePlan, incomeOf } from './income.js';
import { incomeSteps } from './eco.js';

export { evaluate, lootCurve } from './contractMath.js';
import { evaluate } from './contractMath.js';

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

/** Every build worth listing across the damage range for one skill layout. */
export async function collectBuilds(market, planner, settings, skills, onProgress) {
  const prep = prepare(market, { lockedFood: settings.food === 'any' ? undefined : settings.food });
  const all = buildFrontier(prep, skills, playerOf(planner), fightOptions(settings));
  onProgress?.(1);
  if (!all.length) throw new Error('No build can fight with these settings (missing prices?).');
  // One build per 0.5% of damage (the frontier is very fine-grained), always keeping the strongest.
  const builds = [];
  for (const [i, b] of all.entries()) {
    if (!builds.length || i === all.length - 1 || b.damage >= builds.at(-1).damage * 1.005) builds.push(b);
  }
  return builds.map((b) => ({
    damage: b.damage, cost: b.cost, food: b.food ?? 'none', equipment: toEquipment(market, b.gear), armor: b.armor, dodge: b.dodge,
    debuff: b.debuff ? { equipment: toEquipment(market, b.debuff.gear), food: b.debuff.food ?? 'none' } : null,
  }));
}

/** Income per day for economy-skill layouts (the Eco page's model). */
export async function incomeModel(market, planner) {
  const model = await incomePlan(market, planner);
  return (levels) => incomeOf(model, levels);
}

/**
 * Skill layout and gear with the most damage while the net stays at or above
 * −maxLoss. options: { terms: { bounty, poolLoot, loot, economy }, maxLoss,
 * economySearch, onStep, signal }. Leadership earns nothing, so searching
 * economy skills sets it to 0 and frees its points.
 */
export async function searchSkills(market, planner, settings, options) {
  const { terms, maxLoss, economySearch, onStep, signal } = options;
  if (economySearch && !planner.player) throw new Error('Load a player first: the economy search needs their companies.');
  const searched = economySearch ? [...FIGHT_SKILLS, ...ECONOMY_SKILLS.filter((s) => s !== 'leadership')] : FIGHT_SKILLS;
  const start = { ...planner.skills, ...(economySearch ? { leadership: 0 } : {}) };
  const income = economySearch ? await incomePlan(market, planner) : null;
  const budget = (planner.player?.level ?? 1) * 4 - keptPoints(market, start, searched);
  const engineTerms = {
    bounty: terms.bounty, perK: terms.poolLoot ?? 0, flat: typeof terms.loot === 'number' ? terms.loot : 0, economy: terms.economy ?? 0,
    lootCurve: terms.lootCurve ?? null,
  };
  const report = (s) => {
    // A layout no build keeps within the limit (worker.js scores it to climb on) is no answer.
    const best = s.best?.infeasible ? null : s.best;
    return {
      step: s.steps ?? s.step ?? 0, levels: { ...start, ...s.levels }, checked: s.checked, budget: s.budget, used: s.used,
      best: best && { ...evaluate({ damage: best.damage, cost: best.cost }, { ...terms, economy: (terms.economy ?? 0) + (best.incomeChange ?? 0) }), armor: best.armor, dodge: best.dodge },
      incomeChange: best?.incomeChange ?? 0,
    };
  };
  // Economy skills searched: they start at 0, their points free for fighting, and come back a
  // number of points at a time, each the layout earning most for them (optimize.js bestLayoutEconomy).
  // From a full economy spec a joint climb would trade them for fight levels one step at a time.
  const zeroed = economySearch ? ECONOMY_SKILLS : [];
  const economy = income ? {
    skills: searched.filter((s) => ECONOMY_SKILLS.includes(s)),
    steps: incomeSteps(income.plan, income.config, { skills: searched.filter((s) => ECONOMY_SKILLS.includes(s)), budget, playerLevel: planner.player?.level ?? 1 }),
  } : null;
  const r = await searchLayout(market, {
    lockedFood: settings.food === 'any' ? undefined : settings.food, start, searched, budget, zeroed, economy,
    player: playerOf(planner), opts: fightOptions(settings),
    objective: { kind: 'damage', terms: engineTerms, limit: Number.isFinite(maxLoss) ? maxLoss : null }, income,
  }, { onProgress: (s) => onStep?.(report(s)), signal });
  return report(r);
}
