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

import { maxRank, rankCost, splitPrestige } from './prestige.js';

// Leadership is part of Management since v0.27.3.
export const ECO_SKILLS = ['companies', 'management', 'energy', 'production'];

const HOURS = 24;
const ENERGY_PER_ACTION = 10;

/**
 * Skill value at a level (plus prestige ranks, one level each), from the game
 * config; past level 10 (prestige) it goes on by the last step, as the game's does.
 */
export function ecoValue(skills, skill, level, prestige = 0) {
  const levels = skills[skill]?.levels ?? {};
  const n = (level ?? 0) + Math.max(0, prestige ?? 0);
  const at = (k) => levels[String(k)]?.value;
  if (typeof at(n) === 'number') return at(n);
  const top = Math.max(-1, ...Object.keys(levels).map(Number).filter((k) => typeof at(k) === 'number'));
  if (top < 1 || n < top) return 0;
  return at(top) + (n - top) * (at(top) - (at(top - 1) ?? at(top)));
}
export const ecoCost = (skills, skill, level) => skills[skill]?.levels?.[String(level)]?.totalCost ?? (level * (level + 1)) / 2;
export const ecoMaxLevel = (skills, skill, playerLevel) => Math.max(0, ...Object.entries(skills[skill]?.levels ?? {})
  .filter(([, l]) => (l.unlockAtLevel ?? 0) <= playerLevel).map(([n]) => Number(n)));

/**
 * Value of 1 production point, as the game shows it in an employee's
 * "Estimated profit" tooltip (2026-10-27): the fallback when no wages say
 * otherwise. The game averages raw-material trades over 7 days, so it drifts.
 */
export const GAME_POINT_VALUE = 0.1012;
export const GAME_POINT_VALUE_NOTE = "the game's value on Oct 27";

/** Greedy employees expect 20% more pay, Modest ones 15% less. */
export const wageMarkup = (traits = []) => (traits.includes('greedy') ? 1.2 : 1) * (traits.includes('modest') ? 0.85 : 1);

/**
 * The game's current point value, read from employees' wages: a wage is
 * (base + trained Production) ÷ 4 points an hour × the point value × the
 * wage expectation (× Greedy / Modest), so wage a day ÷ (Production ×
 * expectation × markup) ÷ 6. The median over the employees; null without any.
 */
export function pointValueFromWages(employees) {
  const per = employees.filter((e) => e.wageExpectation > 0 && e.ownProduction > 0 && e.payroll > 0)
    .map((e) => e.payroll / (e.wageExpectation * e.ownProduction * wageMarkup(e.traits ?? [])) / 6).sort((a, b) => a - b);
  return per.length ? per[per.length >> 1] : null;
}

/**
 * Trainings a day the employees can take: one each (a Trainer coworker adds
 * one; the game counts it in their trainingsPerDay) while they have potential left.
 */
export function trainingsFromEmployees(employees) {
  return employees.reduce((t, e) => {
    const left = Math.max(0, (e.potentialMax ?? 0) - (e.potential ?? 0));
    return t + Math.min(left, e.trainingsPerDay ?? 1);
  }, 0);
}

/** Trainings a day for the income model: the number typed in, else the employees'. */
export const trainingsPerDayOf = (setting, employees) => (setting === null || setting === undefined || setting === '' ? trainingsFromEmployees(employees) : Math.max(0, Number(setting) || 0));

/**
 * The game's own value of a production point per good, as its "Estimated
 * profit" counts it (its web app, 2026-10-29): gameStat.getPpMoneyValueByItem
 * gives each item's value per point of everything that goes into it; a
 * manufactured good is worth that over all its points, minus its inputs'
 * worth, per its own points (cooked fish: (0.1093 × 80 − 0.0924 × 40) ÷ 40).
 * A good without a value (or with an input without one) keeps the game's own.
 */
export function gamePointValues(items, byItem) {
  const total = (code) => {
    const it = items[code];
    if (!it?.productionPoints) return 0;
    return Object.entries(it.productionNeeds ?? {}).reduce((t, [c, n]) => t + (n ?? 0) * total(c), it.productionPoints);
  };
  const out = {};
  for (const [code, value] of Object.entries(byItem ?? {})) {
    const it = items[code];
    const needs = Object.entries(it?.productionNeeds ?? {});
    if (!it?.productionPoints || !needs.length || needs.some(([c]) => !byItem[c])) { out[code] = value; continue; }
    const inputs = needs.reduce((t, [c, n]) => t + (n ?? 0) * byItem[c] * total(c), 0);
    out[code] = (value * total(code) - inputs) / it.productionPoints;
  }
  return out;
}

/** Value per production point by good: the game's (gamePointValues) where it has one, else from today's prices (goodsProfit). */
export function pointValues(items, prices, byItem) {
  const fromPrices = Object.fromEntries(goodsProfit(items, prices).map((g) => [g.code, g.perPoint]));
  return { ...fromPrices, ...gamePointValues(items, byItem) };
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
 *         selfWork (bool), trainingsPerDay,
 *         cardValues: [G a day by Management level] (training.js: better cards) }
 * Companies run in order of profit, up to the Companies skill's limit. Managers'
 * pay comes off the total: they are paid every hour, whether the company runs.
 * Management's better training cards (v0.27.3) are value made a day (paid out over
 * the employees' remaining days), for the trainings the energy covers: not
 * money, so outside `total`; `value` is both (what the eco skills aim for).
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
  const trained = trainingEnergy > 0 ? Math.min(1, energyPerDay / trainingEnergy) : 1;
  const cards = (plan.cardValues?.[levels.management ?? 0] ?? 0) * trained;

  return {
    total: companies + selfWork - managers,
    value: companies + selfWork - managers + cards,
    companies, selfWork, selfWorkActions, selfWorkPoints, managers, cards,
    energyPerDay, trainingEnergy, energyShort: trainingEnergy > energyPerDay,
    activeCount: active.length, limit, owned: runs.length,
    runs, active,
  };
}

/**
 * The economy layouts worth their points, for a search that trades economy
 * skills against fight skills: for each number of points (up to `budget`),
 * the layout of `skills` (the rest at 0) that makes the most money a day,
 * kept only when it makes more than every cheaper one. [{ levels, points,
 * income }], the first all at 0.
 */
export function incomeSteps(plan, config, { skills: names, budget, playerLevel }) {
  const { skills } = config;
  const max = Object.fromEntries(names.map((s) => [s, ecoMaxLevel(skills, s, playerLevel)]));
  const byPoints = new Map();
  const levels = Object.fromEntries(ECO_SKILLS.map((s) => [s, 0]));
  const walk = (i, spent) => {
    if (i === names.length) {
      const income = dailyIncome(levels, plan, config).total;
      const prev = byPoints.get(spent);
      if (!prev || income > prev.income + 1e-9) byPoints.set(spent, { levels: Object.fromEntries(names.map((s) => [s, levels[s]])), points: spent, income });
      return;
    }
    const s = names[i];
    for (let n = 0; n <= max[s]; n++) {
      const cost = ecoCost(skills, s, n);
      if (spent + cost > budget) break;
      levels[s] = n;
      walk(i + 1, spent + cost);
    }
    levels[s] = 0;
  };
  walk(0, 0);
  const steps = [];
  for (const step of [...byPoints.values()].sort((a, b) => a.points - b.points)) {
    if (!steps.length || step.income > steps.at(-1).income + 0.01) steps.push(step);
  }
  return steps;
}

/**
 * The eco skill layout with the most value per day (money, and Management's
 * better training cards) within a point budget, with prestige points placed
 * too (prestige.js: a rank is a level for prestige points instead of skill points).
 * Exhaustive over the four eco skills' effective levels (level + ranks; small
 * search). Options: minimum effective levels per skill (e.g. a level kept while
 * training), the player level for unlocks, the prestige points to place and
 * the ranks to keep on a tie (`prefer`). Ties go to the cheaper layout, then to
 * more Energy. When no layout has the energy for every training, the one with
 * the most energy (then the most money), its result marked energyShort.
 * Returns { levels (without ranks), ranks, effective, result, spent }.
 */
export function optimizeEcoSkills(plan, config, { budget, playerLevel, minimum = {}, prestigePoints = 0, prefer = {} }) {
  const { skills } = config;
  const points = Math.max(0, prestigePoints);
  const unlocked = Object.fromEntries(ECO_SKILLS.map((s) => [s, ecoMaxLevel(skills, s, playerLevel)]));
  const top = maxRank(points);
  const max = Object.fromEntries(ECO_SKILLS.map((s) => [s, unlocked[s] + (unlocked[s] > 0 ? top : 0)]));
  // Fewest skill points by prestige points used, for the skills chosen so far.
  const extend = (spent, s, e) => {
    const next = new Array(points + 1).fill(Infinity);
    for (let p = 0; p <= points; p++) {
      if (spent[p] === Infinity) continue;
      for (let r = Math.max(0, e - unlocked[s]); r <= Math.min(e, unlocked[s] > 0 ? top : 0); r++) {
        const q = p + rankCost(r);
        const cost = spent[p] + ecoCost(skills, s, e - r);
        if (q <= points && cost < next[q]) next[q] = cost;
      }
    }
    return next;
  };
  let best = null;
  let short = null;
  const levels = {};
  const walk = (i, spentBy) => {
    const spent = Math.min(...spentBy);
    if (i === ECO_SKILLS.length) {
      const r = dailyIncome(levels, plan, config);
      if (r.energyShort) {
        if (!best && (!short || r.energyPerDay > short.result.energyPerDay || (r.energyPerDay === short.result.energyPerDay && r.value > short.result.value + 1e-9))) {
          short = { effective: { ...levels }, result: r, spent };
        }
        return;
      }
      if (!best || r.value > best.result.value + 1e-9 || (Math.abs(r.value - best.result.value) <= 1e-9 && spent < best.spent)) {
        best = { effective: { ...levels }, result: r, spent };
      }
      return;
    }
    const s = ECO_SKILLS[i];
    for (let n = minimum[s] ?? 0; n <= max[s]; n++) {
      const next = extend(spentBy, s, n);
      // More levels never cost fewer points: past the budget, stop.
      if (Math.min(...next) > budget) break;
      levels[s] = n;
      walk(i + 1, next);
    }
  };
  walk(0, [0, ...new Array(points).fill(Infinity)]);
  const found = best ?? short;
  if (!found) return null;
  const split = splitPrestige(ECO_SKILLS, found.effective, points, { levelCost: (s, n) => ecoCost(skills, s, n), maxLevel: (s) => unlocked[s], prefer });
  return { ...found, levels: split.levels, ranks: split.ranks };
}
