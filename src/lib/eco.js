/**
 * Economy model for game update v0.27 (employees replace the job market).
 *
 * Sources: the v0.27 update article, the game config (skills, upgrades,
 * recipes), community guides, and the game's own tooltips (checked against a
 * player's employees, 2026-10-26):
 *   employee output / day = production (as the card shows it) ÷ 4 × 24 × (1 + bonus)
 *   bonus = Management (2% × the skill's value, which is level + 1) + manager
 *           + tool + core region (+5%) + specialization (+1%/day, max 20%)
 *           + traits/events + (happiness − 50)%
 *   wage: taken from the game's payroll figure (it depends on base and
 *   trained production, which the card doesn't show).
 * Automated Engine: 24 PP a day per level. Self-work: 10 energy each, giving the
 * Production skill's value in PP. Energy refills a tenth of the bar an hour.
 *
 * Everything is pure (no I/O) so it can be checked and reused.
 */

export const ECO_SKILLS = ['companies', 'management', 'energy', 'production', 'leadership'];

const HOURS = 24;
const ENERGY_PER_ACTION = 10;

/** Skill value at a level, from the game config. */
export function ecoValue(skills, skill, level) {
  return skills[skill]?.levels?.[String(level)]?.value ?? 0;
}
export const ecoCost = (skills, skill, level) => skills[skill]?.levels?.[String(level)]?.totalCost ?? (level * (level + 1)) / 2;
export const ecoMaxLevel = (skills, skill, playerLevel) => Math.max(0, ...Object.entries(skills[skill]?.levels ?? {})
  .filter(([, l]) => (l.unlockAtLevel ?? 0) <= playerLevel).map(([n]) => Number(n)));

/**
 * Value of 1 production point, as the game shows it in an employee's
 * "Estimated profit" tooltip (2026-10-27). The game averages raw-material
 * trades over 7 days, so it drifts; a newer number can be typed in.
 */
export const GAME_POINT_VALUE = 0.1012;
export const GAME_POINT_VALUE_NOTE = "the game's value on Oct 27";

/** Profit per production point for every good: (price − inputs) ÷ PP. */
export function goodsProfit(items, prices) {
  const out = [];
  for (const [code, it] of Object.entries(items)) {
    if ((it.type !== 'raw' && it.type !== 'product') || !it.productionPoints || !Number.isFinite(prices[code])) continue;
    const inputs = Object.entries(it.productionNeeds ?? {}).reduce((sum, [c, n]) => sum + n * (prices[c] ?? NaN), 0);
    if (!Number.isFinite(inputs)) continue;
    out.push({ code, type: it.type, price: prices[code], inputs, pp: it.productionPoints, perPoint: (prices[code] - inputs) / it.productionPoints });
  }
  return out.sort((a, b) => b.perPoint - a.perPoint);
}

/**
 * One employee's day, from what the game's card shows: production (⛏), the
 * production bonus % (⛏ +x%) and the payroll per day. The bonus is shown
 * with the owner's current Management; for another Management value the
 * difference is swapped in (2% per point).
 */
export function employeeDay(e, { managementValue, currentManagementValue = managementValue, goodPerPoint }) {
  const bonus = ((e.bonusPercent ?? 0) + 2 * (managementValue - currentManagementValue)) / 100;
  const points = ((e.production ?? 0) / 4) * HOURS * (1 + bonus);
  const wage = Math.max(0, e.payroll ?? 0);
  return { points, wage, bonus, value: points * goodPerPoint, profit: points * goodPerPoint - wage };
}

/** Automated Engine output per day at a level. */
export const engineDaily = (upgrades, level) => upgrades.automatedEngine?.levels?.[String(level)]?.stats?.dailyProd ?? 0;

/**
 * Hired managers (game update v0.27): pay per hour = their rate × their
 * Management value (level + 1); they add 2% per value point, up to +22%, to
 * every employee's output, and once a day give one employee +5 happiness for
 * 48 hours (about two at any time). Paid every hour, employees or not.
 */
export const MANAGER_MAX_VALUE = 11;
const MANAGER_CARE = 5;

/**
 * What a manager with this bonus adds a day in one company: the bonus on each
 * employee's output before bonuses, and their care. staff: [{ points (a day,
 * bonuses in), bonusPercent (their total) }]. G a day at perPoint.
 */
export function managerGain(staff, bonusPercent, perPoint) {
  const base = staff.map((s) => s.points / (1 + (s.bonusPercent ?? 0) / 100));
  const bonus = base.reduce((t, b) => t + b, 0) * (bonusPercent / 100);
  const cared = [...base].sort((a, b) => b - a).slice(0, 2).reduce((t, b) => t + b, 0) * (MANAGER_CARE / 100);
  return (bonus + cared) * perPoint;
}

/**
 * Is a manager worth it in this company? With one: what they add against their
 * pay. Without: a full one (+22%) at the market's pay per point (G an hour).
 * { has, gain, cost, net } a day, or null with no employees to manage.
 */
export function managerAdvice(manager, staff, perPoint, marketRatePerPoint) {
  if (manager) {
    const gain = managerGain(staff, manager.bonusPercent, perPoint);
    return { has: true, gain, cost: manager.wageDay, net: gain - manager.wageDay };
  }
  if (!staff.length || !(marketRatePerPoint > 0)) return null;
  const cost = marketRatePerPoint * MANAGER_MAX_VALUE * 24;
  const gain = managerGain(staff, 2 * MANAGER_MAX_VALUE, perPoint);
  return { has: false, gain, cost, net: gain - cost };
}

/**
 * Money per day for one eco skill layout.
 * plan: { companies: [{ id, good, engine, employees: [...], manager? }], perPoint: {good: G},
 *         currentManagementValue (the one the employees' shown bonus includes),
 *         selfWork (bool), trainingsPerDay }
 * Companies run in order of profit, up to the Companies skill's limit. Managers'
 * pay comes off the total: they are paid every hour, whether the company runs.
 */
export function dailyIncome(levels, plan, config) {
  const { skills, upgrades } = config;
  const limit = ecoValue(skills, 'companies', levels.companies);
  const runs = plan.companies.map((c) => {
    const perPoint = plan.perPoint[c.good] ?? 0;
    const enginePoints = engineDaily(upgrades, c.engine);
    const staff = (c.employees ?? []).map((e) => employeeDay(e, {
      managementValue: ecoValue(skills, 'management', levels.management),
      currentManagementValue: plan.currentManagementValue,
      goodPerPoint: perPoint,
    }));
    const employeeProfit = staff.reduce((s, x) => s + x.profit, 0);
    return { id: c.id, good: c.good, enginePoints, engineProfit: enginePoints * perPoint, employeeProfit, perPoint, total: enginePoints * perPoint + employeeProfit };
  }).sort((a, b) => b.total - a.total);
  const active = runs.slice(0, limit);
  const companies = active.reduce((s, r) => s + r.total, 0);
  const managers = plan.companies.reduce((s, c) => s + (c.manager?.wageDay ?? 0), 0);

  // Energy: a tenth of the bar per hour. Trainings and hiring come first; the rest can go to self-work.
  const energyPerDay = (ecoValue(skills, 'energy', levels.energy) / 10) * HOURS;
  const trainingEnergy = (plan.trainingsPerDay ?? 0) * ENERGY_PER_ACTION;
  const spare = Math.max(0, energyPerDay - trainingEnergy);
  const selfWorkActions = plan.selfWork ? Math.floor(spare / ENERGY_PER_ACTION) : 0;
  const bestPerPoint = Math.max(0, ...active.map((r) => r.perPoint));
  const selfWorkPoints = selfWorkActions * ecoValue(skills, 'production', levels.production);
  const selfWork = selfWorkPoints * bestPerPoint;

  return {
    total: companies + selfWork - managers,
    companies, selfWork, selfWorkActions, selfWorkPoints, managers,
    energyPerDay, trainingEnergy, energyShort: trainingEnergy > energyPerDay,
    activeCount: active.length, limit, owned: runs.length,
    runs, active,
  };
}

/**
 * The eco skill layout with the most money per day within a point budget.
 * Exhaustive over the five eco skills (small search). Options: minimum
 * levels per skill (e.g. Leadership while training) and the player level
 * for unlocks. Ties go to the cheaper layout, then to more Energy.
 */
export function optimizeEcoSkills(plan, config, { budget, playerLevel, minimum = {} }) {
  const { skills } = config;
  const max = Object.fromEntries(ECO_SKILLS.map((s) => [s, ecoMaxLevel(skills, s, playerLevel)]));
  let best = null;
  const levels = {};
  const walk = (i, spent) => {
    if (i === ECO_SKILLS.length) {
      const r = dailyIncome(levels, plan, config);
      if (r.energyShort) return;
      if (!best || r.total > best.result.total + 1e-9 || (Math.abs(r.total - best.result.total) <= 1e-9 && spent < best.spent)) {
        best = { levels: { ...levels }, result: r, spent };
      }
      return;
    }
    const s = ECO_SKILLS[i];
    for (let n = minimum[s] ?? 0; n <= max[s]; n++) {
      const cost = ecoCost(skills, s, n);
      if (spent + cost > budget) break;
      levels[s] = n;
      walk(i + 1, spent + cost);
    }
  };
  walk(0, 0);
  return best;
}
