/**
 * Economy model for game update v0.27 (employees replace the job market).
 *
 * Sources: the v0.27 update article, the game config (skills, upgrades,
 * recipes) and community guides for the formulas the game doesn't publish:
 *   employee output / hour = (paid production + trait/event production) ÷ 4 × (1 + bonus)
 *   wage / hour            = paid production ÷ 4 × value of 1 PP × wage expectation
 *   bonus = Management (+2%/point) + manager + tool + core region (+5%)
 *           + specialization (+1%/day, max 20%) + traits/events + (happiness − 50)%
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
 * Value of 1 production point: the game uses raw-material trades over 7 days;
 * this estimate averages the raw materials' current price per PP.
 */
export function estimatePointValue(items, prices) {
  const values = Object.entries(items)
    .filter(([code, it]) => it.type === 'raw' && it.productionPoints > 0 && Number.isFinite(prices[code]))
    .map(([code, it]) => prices[code] / it.productionPoints);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0.1;
}

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

/** One employee's day: points made, wage, and profit at a good's value per point. */
export function employeeDay(e, { managementLevel, managerPercent = 0, corePercent = 0, pointValue, goodPerPoint }) {
  const bonus = (2 * managementLevel + managerPercent + corePercent + (e.toolPercent ?? 0) + Math.min(20, e.specialization ?? 0)
    + (e.bonusPercent ?? 0) + ((e.happiness ?? 50) - 50)) / 100;
  const paid = e.production ?? 0;
  const points = ((paid + (e.traitProduction ?? 0)) / 4) * (1 + bonus) * HOURS;
  const wage = e.wagePerDay > 0 ? e.wagePerDay : (paid / 4) * pointValue * ((e.expectation ?? 100) / 100) * HOURS;
  return { points, wage, bonus, value: points * goodPerPoint, profit: points * goodPerPoint - wage };
}

/** Automated Engine output per day at a level. */
export const engineDaily = (upgrades, level) => upgrades.automatedEngine?.levels?.[String(level)]?.stats?.dailyProd ?? 0;

/**
 * Money per day for one eco skill layout.
 * plan: { companies: [{ id, good, engine, employees: [...] }], perPoint: {good: G},
 *         pointValue, selfWork (bool), trainingsPerDay, managerPercent, corePercent }
 * Companies run in order of profit, up to the Companies skill's limit.
 */
export function dailyIncome(levels, plan, config) {
  const { skills, upgrades } = config;
  const limit = ecoValue(skills, 'companies', levels.companies);
  const runs = plan.companies.map((c) => {
    const perPoint = plan.perPoint[c.good] ?? 0;
    const enginePoints = engineDaily(upgrades, c.engine);
    const staff = (c.employees ?? []).map((e) => employeeDay(e, {
      managementLevel: levels.management, managerPercent: plan.managerPercent, corePercent: plan.corePercent,
      pointValue: plan.pointValue, goodPerPoint: perPoint,
    }));
    const employeeProfit = staff.reduce((s, x) => s + x.profit, 0);
    return { id: c.id, good: c.good, enginePoints, engineProfit: enginePoints * perPoint, employeeProfit, perPoint, total: enginePoints * perPoint + employeeProfit };
  }).sort((a, b) => b.total - a.total);
  const active = runs.slice(0, limit);
  const companies = active.reduce((s, r) => s + r.total, 0);

  // Energy: a tenth of the bar per hour. Trainings and hiring come first; the rest can go to self-work.
  const energyPerDay = (ecoValue(skills, 'energy', levels.energy) / 10) * HOURS;
  const trainingEnergy = (plan.trainingsPerDay ?? 0) * ENERGY_PER_ACTION;
  const spare = Math.max(0, energyPerDay - trainingEnergy);
  const selfWorkActions = plan.selfWork ? Math.floor(spare / ENERGY_PER_ACTION) : 0;
  const bestPerPoint = Math.max(0, ...active.map((r) => r.perPoint));
  const selfWorkPoints = selfWorkActions * ecoValue(skills, 'production', levels.production);
  const selfWork = selfWorkPoints * bestPerPoint;

  return {
    total: companies + selfWork,
    companies, selfWork, selfWorkActions, selfWorkPoints,
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
