/**
 * Planner calculations on top of the engine: evaluate the planned build,
 * find cheaper/stronger alternatives, optimize gear and skills.
 */
import { getEngine } from '../engine/browser.js';
import { buildInput, debuffEquipment, skillsMarket, SLOTS, ALL_SKILLS, ECONOMY_SKILLS } from '../engine/inputs.js';
import { cached } from './warera.js';

// The original page's default net job salary, used by its income model.
const DEFAULT_JOB_SALARY = 0.123;

/** A plain copy: the planner's reactive state can't be posted to a worker as it is. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** The engine setup for a planned build. `windowHours` 24 means the full-day model. */
export function setupFor(planner, settings, { locked = true, windowHours = settings.windowHours } = {}) {
  const p = planner.player;
  return plain({
    level: p?.level ?? 1,
    militaryRankPercent: p?.militaryRankPercent ?? 0,
    skills: planner.skills,
    prestige: p?.prestige ?? {},
    pill: settings.pill,
    battleBonusPercent: Number(settings.battleBonus) || 0,
    windowHours: windowHours === 24 ? null : windowHours,
    // Credits counted like the original page; the gear worn now is what the pill debuff phase uses.
    dailyContext: {
      settings: { scraps: true, cases: true, income: false, dailyWeekly: false },
      incomeCredit: 0,
      rewardCredit: 0,
      debuffBuild: { equipment: debuffEquipment(p?.currentGear), foodCode: 'none' },
    },
    ...(locked
      ? { lockedEquipment: Object.fromEntries(SLOTS.map((s) => [s, planner.gear[s] ?? null])), lockedFood: planner.food }
      : { lockedFood: settings.food === 'any' ? undefined : settings.food }),
  });
}

/** A result point's cost: per window (the pill added, since the window cost leaves it out) or per day. */
export function costOf(point, market, settings) {
  if (settings.windowHours !== 24 && point.roundNetCost != null) {
    return point.roundNetCost + (settings.pill ? market.itemPrices.cocain ?? 0 : 0);
  }
  return point.dailyNetCost;
}

/** Damage and cost of the planned build, or { error } when it can't fight (e.g. a gun without ammo). */
export async function evaluateBuild(market, planner, settings) {
  const input = buildInput(market, setupFor(planner, settings));
  const reply = await getEngine().optimize({ mode: 'damage', input, target: 0, maxBudget: Infinity, graph: false });
  const r = reply.result;
  if (!r) return { error: reasonText(reply.reason) };
  const point = r.selectedDamageCostPoint;
  return {
    damage: point.damagePerDay,
    cost: costOf(point, market, settings),
    build: r.build,
  };
}

/**
 * Cheaper build with the same damage and stronger build for the same cost.
 * Each is null when the planned build is already best.
 *
 * The hints worker only knows the full-day model, so it is used for that
 * setting; for a fight window the main optimizer answers instead, which
 * handles the window exactly.
 */
export async function findHints(market, planner, settings, evaluated) {
  const input = buildInput(market, setupFor(planner, settings, { locked: false }));
  if (settings.windowHours !== 24) return windowHints(market, settings, input, evaluated);
  const points = await getEngine().hints(input, plain({ equipment: evaluated.build.equipment, foodCode: evaluated.build.foodCode }));
  let cheaper = null;
  let stronger = null;
  for (const p of points) {
    const option = { damage: p.damagePerDay, cost: costOf(p, market, settings), equipment: p.equipment, food: p.foodCode };
    if (option.damage >= evaluated.damage * 0.999 && option.cost < evaluated.cost - 0.05 && (!cheaper || option.cost < cheaper.cost)) cheaper = option;
    if (option.damage > evaluated.damage * 1.001 && option.cost <= evaluated.cost + 0.05 && (!stronger || option.damage > stronger.damage)) stronger = option;
  }
  return { cheaper, stronger };
}

// Stronger-for-the-same-cost search: stop when the damage bracket is this tight.
const BISECT_PRECISION = 1.005;

/**
 * Window hints from the main optimizer: the cheapest build reaching the
 * planned damage, and (by bisection on the damage target) the strongest
 * build that costs no more than the planned one.
 */
async function windowHints(market, settings, input, evaluated) {
  const engine = getEngine();
  const at = async (target) => {
    const r = await engine.cheapestBuild(input, Math.round(target));
    if (!r) return null;
    return { damage: r.selectedDamageCostPoint.damagePerDay, cost: costOf(r.selectedDamageCostPoint, market, settings), equipment: r.build.equipment, food: r.build.foodCode };
  };
  const affordable = (o) => o && o.cost <= evaluated.cost + 0.05;

  const [same, top] = await Promise.all([at(Math.ceil(evaluated.damage)), at(1e12)]);
  const cheaper = same && same.damage >= evaluated.damage * 0.999 && same.cost < evaluated.cost - 0.05 ? same : null;

  let best = affordable(top) ? top : null;
  if (!best && top) {
    let lo = evaluated.damage;
    let hi = top.damage;
    while (hi / lo > BISECT_PRECISION) {
      const mid = Math.sqrt(lo * hi);
      const o = await at(mid);
      if (affordable(o)) { best = !best || o.damage > best.damage ? o : best; lo = Math.max(mid, o.damage); } else hi = mid;
    }
  }
  const stronger = best && best.damage > evaluated.damage * 1.001 ? best : null;
  return { cheaper, stronger };
}

/** Cheapest gear (and food, unless fixed in settings) reaching a damage target. */
export async function optimizeEquipment(market, planner, settings, target) {
  const input = buildInput(market, setupFor(planner, settings, { locked: false }));
  const reply = await getEngine().optimize({ mode: 'damage', input, target: Math.round(target), maxBudget: Infinity, graph: false });
  if (!reply.result) return { error: reasonText(reply.reason) };
  const r = reply.result;
  return {
    damage: r.selectedDamageCostPoint.damagePerDay,
    cost: costOf(r.selectedDamageCostPoint, market, settings),
    reachedTarget: r.reachedTarget,
    equipment: r.build.equipment,
    food: r.build.foodCode,
  };
}

/** The player's companies in the shape the skill optimizer's income model expects. */
export async function loadEconomy(playerId, itemPrices) {
  const list = await cached('company.getCompanies', { userId: playerId, perPage: 100 });
  const ids = (list.items ?? []).map((c) => (typeof c === 'string' ? c : c._id)).filter(Boolean);
  const companies = await Promise.all(ids.map(async (companyId) => {
    const [company, bonus] = await Promise.all([
      cached('company.getById', { companyId }),
      cached('company.getProductionBonus', { companyId }).catch(() => null),
    ]);
    return {
      company: {
        _id: company._id,
        itemCode: company.itemCode,
        disabled: company.disabled === true,
        activeUpgradeLevels: { automatedEngine: company.activeUpgradeLevels?.automatedEngine ?? 0 },
      },
      productionBonus: bonus ? { total: bonus.total ?? 0 } : null,
    };
  }));
  return { netJobSalary: DEFAULT_JOB_SALARY, companies, itemPrices };
}

/**
 * Skill layout search over a daily-damage range (full-day model, like the
 * original). With keepEconomy the economy skills stay as they are.
 */
export async function optimizeSkills(market, planner, settings, { min, max, keepEconomy, onProgress, signal }) {
  const p = planner.player;
  const debuffBuild = plain({ equipment: debuffEquipment(p?.currentGear), foodCode: 'none' });
  const economy = p ? await loadEconomy(p.id, market.itemPrices).catch(() => null) : null;
  const level = p?.level ?? 1;
  const request = {
    market: skillsMarket(market, debuffBuild),
    player: { level, totalSkillPoints: level * 4, militaryRankPercent: p?.militaryRankPercent ?? 0, skills: plain(planner.skills) },
    combat: { pillEnabled: settings.pill, battleBonusPercent: Number(settings.battleBonus) || 0, scraps: true, debuffBuild },
    economy: economy ?? { netJobSalary: 0, companies: [], itemPrices: market.itemPrices },
    range: { min: Math.round(min), max: Math.round(max), steps: 4 },
    locks: keepEconomy ? plain(Object.fromEntries(ECONOMY_SKILLS.map((s) => [s, planner.skills[s]]))) : {},
    resetCostPerPoint: null,
  };
  const response = await getEngine().optimizeSkills(request, { onProgress, signal });
  if (!response?.result) return { error: reasonText(response?.reason) };
  const { best, elapsedMs } = response.result;
  return { skills: Object.fromEntries(ALL_SKILLS.map((s) => [s, best.skills[s] ?? 0])), income: best.income, cost: best.meanDailyNetCost, steps: best.steps, elapsedMs, hadEconomy: !!economy };
}

function reasonText(reason) {
  if (!reason) return 'No build can do this with these settings.';
  return String(reason).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}
