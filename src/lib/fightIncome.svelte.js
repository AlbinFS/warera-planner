/**
 * What a fight earns besides its cases, shared by the Planner's Hits and
 * costs and the simulator: a bounty (G per 1k damage), battle loot (G per 1k
 * damage, or items per fight at market value) and the companies' profit for
 * a day at the planned economy skills. Remembered in this browser.
 */
import { getLootPrices } from './warera.js';
import { incomeModel } from './contract.js';
import { ECONOMY_SKILLS } from '../engine/inputs.js';
import { planner } from './planner.svelte.js';
import { fmt } from './format.js';

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

const KEY = 'fightIncome.v1';
const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved) return saved;
    // The Planner's first bounty field kept its value on its own.
    return { bounty: localStorage.getItem('planner.bounty') ?? '' };
  } catch { return {}; }
};
export const fightIncome = $state({ bounty: '', lootMode: 'items', lootItems: 3, lootRarity: 'epic', lootPerK: 0.13, ...load() });

// Loot prices from the site (24 h median, or 7 days without manipulated days), loaded once.
export const lootTrades = $state({ byRarity: {} });
getLootPrices().then((r) => (lootTrades.byRarity = r ?? {})).catch(() => {});

// Company profit per day at the planned economy skills (null without a loaded player).
export const companyProfit = $state({ value: null });

$effect.root(() => {
  $effect(() => { const s = JSON.stringify(fightIncome); try { localStorage.setItem(KEY, s); } catch {} });
});

/** Value of one dropped piece per rarity: the site's loot prices, else the median of the per-roll prices. */
export function lootPrices(market) {
  const items = market.gameConfigItems;
  const byRarity = {};
  for (const r of market.equipmentMarketRolls) {
    const item = items[r.code];
    if (!item || (item.type !== 'equipment' && item.type !== 'weapon') || !(r.averagePrice > 0)) continue;
    (byRarity[item.rarity] ??= []).push(r.averagePrice);
  }
  const prices = Object.fromEntries(Object.entries(byRarity).map(([k, v]) => [k, v.sort((a, b) => a - b)[v.length >> 1]]));
  for (const [k, v] of Object.entries(lootTrades.byRarity)) prices[k] = v.price;
  return prices;
}

/** Where a rarity's loot price comes from, in words. */
export function lootBasis(rarity) {
  const t = lootTrades.byRarity[rarity];
  if (!t) return 'median of the roll prices';
  if (t.basis === 'day') return `median of ${t.trades} trades in the last 24 h`;
  const left = t.excluded ? `, ${t.excluded} manipulated day${t.excluded > 1 ? 's' : ''} left out` : '';
  return `7-day median${left}; the last 24 h ${t.day != null ? `were at ${fmt(t.day, 1)}` : 'had too few trades'}`;
}

/**
 * The fight's income as engine terms: { bounty, perK, flat (loot items' value), economy (companies) }.
 */
export function incomeTerms(market) {
  const items = fightIncome.lootMode === 'items';
  return {
    bounty: Math.max(0, Number(fightIncome.bounty) || 0),
    perK: items ? 0 : Math.max(0, Number(fightIncome.lootPerK) || 0),
    flat: items ? Math.max(0, Number(fightIncome.lootItems) || 0) * (lootPrices(market)[fightIncome.lootRarity] ?? 0) : 0,
    economy: companyProfit.value ?? 0,
  };
}

/** Keeps companyProfit up to date for the loaded player and their planned economy skills. */
export function trackCompanyProfit(market) {
  let modelFor = null;
  let model = null;
  let wanted = null;
  return $effect.root(() => {
    $effect(() => {
      const id = planner.player?.id;
      const levels = Object.fromEntries(ECONOMY_SKILLS.map((s) => [s, planner.skills[s] ?? 0]));
      if (!id) { companyProfit.value = null; return; }
      const key = JSON.stringify([id, levels]);
      wanted = key;
      (async () => {
        if (modelFor !== id) { model = await incomeModel(market, planner).catch(() => null); modelFor = id; }
        if (wanted === key) companyProfit.value = model ? model(levels) : null;
      })();
    });
  });
}
