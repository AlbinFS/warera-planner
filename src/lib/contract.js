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

/** Every build worth listing across the damage range for one skill layout (prestige: its ranks, if not the planned ones). */
export async function collectBuilds(market, planner, settings, skills, onProgress, prestige) {
  const prep = prepare(market, { lockedFood: settings.food === 'any' ? undefined : settings.food });
  const all = buildFrontier(prep, skills, playerOf(planner, prestige), fightOptions(settings));
  onProgress?.(1);
  if (!all.length) throw new Error('No build can fight with these settings (missing prices?).');
  // One build per 0.5% of damage (the frontier is very fine-grained), always keeping the strongest.
  const builds = [];
  for (const [i, b] of all.entries()) {
    if (!builds.length || i === all.length - 1 || b.damage >= builds.at(-1).damage * 1.005) builds.push(b);
  }
  return builds.map((b) => ({
    damage: b.damage, cost: b.cost, food: b.food ?? 'none', equipment: toEquipment(market, b.gear), armor: b.armor, dodge: b.dodge,
    debuff: b.debuff ? { equipment: toEquipment(market, b.debuff.gear), food: b.debuff.food ?? 'none', hits: Math.floor(b.debuff.swings), damage: b.debuff.damage, cost: b.debuff.cost } : null,
  }));
}

/** Income per day for economy-skill layouts (the Eco page's model), with the planned prestige ranks. */
export async function incomeModel(market, planner) {
  const model = await incomePlan(market, planner);
  return (levels, prestige = planner.player?.prestige) => incomeOf(model, levels, prestige);
}

/**
 * Skill layout and gear with the most damage while the net stays at or above
 * −maxLoss. options: { terms: { bounty, poolLoot, loot, economy }, maxLoss,
 * economySearch, deep, onStep, signal }. Leadership earns nothing, so searching
 * economy skills sets it to 0 and frees its points. deep: the debuff build's
 * profit may be spent on the pill build's gear (16 h sessions).
 */
export async function searchSkills(market, planner, settings, options) {
  const { terms, maxLoss, economySearch, onStep, signal, deep = false } = options;
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
      step: s.steps ?? s.step ?? 0, levels: { ...start, ...s.levels }, prestige: s.prestige ?? planner.player?.prestige ?? {}, checked: s.checked, budget: s.budget, used: s.used, trying: s.trying ?? null,
      best: best && { ...evaluate({ damage: best.damage, cost: best.cost }, { ...terms, economy: (terms.economy ?? 0) + (best.incomeChange ?? 0) }), armor: best.armor, dodge: best.dodge },
      incomeChange: best?.incomeChange ?? 0,
    };
  };
  const r = await searchLayout(market, {
    lockedFood: settings.food === 'any' ? undefined : settings.food, start, searched, budget,
    player: playerOf(planner), opts: fightOptions(settings), deep,
    objective: { kind: 'damage', terms: engineTerms, limit: Number.isFinite(maxLoss) ? maxLoss : null }, income,
  }, { onProgress: (s) => onStep?.(report(s)), signal });
  return report(r);
}
