/**
 * The Eco page's income model as plain data, for searches that move economy
 * skills: the player's companies with their engines and employees (from the
 * game), at today's prices, with the Eco page's settings.
 */
import { loadCompanies, ecoEmployees, ecoSettings } from './eco.svelte.js';
import { goodsProfit, ecoValue, dailyIncome, trainingsPerDayOf } from './eco.js';
import { companyModel, placeOf, fairWageOf, daysLeftOf } from './hiring.js';
import { toolboxValue } from './staffing.js';
import { loadMarket } from './market.js';
import { ECONOMY_SKILLS } from '../engine/inputs.js';

/**
 * Each running company's employees as hiring.js models them, and what a
 * toolbox is worth to them. employeesById: companyId → [employee];
 * world: { regions, countries, items } (for traits that care where).
 */
export function staffModels(companies, employeesById, { perPoint, managementPercent = 0, ...world }) {
  const active = companies.filter((c) => !c.disabled);
  const staff = active.flatMap((c) => (employeesById[c.id] ?? []).map((e) => ({
    ...e, traits: (e.traits ?? []).filter(Boolean), good: c.good, perPoint: perPoint[c.good] ?? 0, daysLeft: daysLeftOf(e),
  })));
  const toolbox = toolboxValue(staff);
  const fairWage = fairWageOf(Object.values(employeesById).flat());
  const models = active.map((c) => companyModel(employeesById[c.id] ?? [], placeOf(c, world), { perPoint: perPoint[c.good] ?? 0, fairWage, management: managementPercent, toolboxValue: toolbox }));
  return { models, toolboxValue: toolbox, fairWage, staff };
}

/** { plan, config } for eco.js dailyIncome. */
export async function incomePlan(market, planner) {
  const [companies, { upgrades }] = await Promise.all([loadCompanies(planner.player.id), loadMarket()]);
  const config = { skills: market.gameConfigSkills, upgrades, items: market.gameConfigItems };
  const perPoint = Object.fromEntries(goodsProfit(config.items, market.itemPrices).map((g) => [g.code, g.perPoint]));
  // The game's own levels and ranks: what the employees' shown bonus has in it.
  const currentManagementValue = ecoValue(config.skills, 'management', planner.player.ecoLevels?.management ?? 0, planner.player.own?.prestige?.management ?? 0);
  const plan = {
    companies: companies.map((c) => ({ ...c, employees: ecoEmployees[c.id] ?? [] })),
    perPoint,
    // The employees' shown bonus includes the owner's Management as it is in the game.
    currentManagementValue,
    selfWork: ecoSettings.selfWork,
    trainingsPerDay: trainingsPerDayOf(ecoSettings.trainingsPerDay, Object.values(ecoEmployees).flat()),
  };
  return JSON.parse(JSON.stringify({ plan, config }));
}

/** Money per day for an economy layout, plus prestige ranks (Leadership's better cards aren't money: see dailyIncome). */
export const incomeOf = ({ plan, config }, levels, prestige = {}) => dailyIncome(Object.fromEntries(ECONOMY_SKILLS.map((s) => [s, (levels[s] ?? 0) + (prestige?.[s] ?? 0)])), plan, config).total;
