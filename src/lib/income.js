/**
 * The Eco page's income model as plain data, for searches that move economy
 * skills: the player's companies with their engines and the employees typed
 * in on the Eco page, at today's prices, with the Eco page's settings.
 */
import { loadCompanies, ecoEmployees, ecoSettings } from './eco.svelte.js';
import { goodsProfit, ecoValue, dailyIncome } from './eco.js';
import { loadMarket } from './market.js';
import { ECONOMY_SKILLS } from '../engine/inputs.js';

/** { plan, config } for eco.js dailyIncome. */
export async function incomePlan(market, planner) {
  const [companies, { upgrades }] = await Promise.all([loadCompanies(planner.player.id), loadMarket()]);
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
  return JSON.parse(JSON.stringify({ plan, config }));
}

/** Income per day for an economy layout. */
export const incomeOf = ({ plan, config }, levels) => dailyIncome(Object.fromEntries(ECONOMY_SKILLS.map((s) => [s, levels[s] ?? 0])), plan, config).total;
