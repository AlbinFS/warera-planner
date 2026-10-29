/**
 * What a fight earns besides its cases, shared by the Planner's Hits and
 * costs and the simulator: a bounty (G per 1k damage), battle loot (from real
 * battles for the fight's damage, G per 1k damage, or items per fight at
 * market value) and the companies' profit for a day at the planned economy
 * skills. Remembered in this browser.
 */
import { getLootPrices } from './warera.js';
import { incomeModel } from './contract.js';
import { ECONOMY_SKILLS } from '../engine/inputs.js';
import { planner } from './planner.svelte.js';
import { fmt } from './format.js';
import { expectedLoot } from './battleLoot.js';

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

// v2: loot from real battles is the default.
const KEY = 'fightIncome.v2';
const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved) return saved;
    const old = JSON.parse(localStorage.getItem('fightIncome.v1') ?? 'null');
    if (old) return { ...old, lootMode: 'auto' };
    // The Planner's first bounty field kept its value on its own.
    return { bounty: localStorage.getItem('planner.bounty') ?? '' };
  } catch { return {}; }
};
// lootMode: 'auto' (from real battles), 'items' (a number per fight) or 'perK' (G per 1k damage).
export const fightIncome = $state({ bounty: '', lootMode: 'auto', lootItems: 3, lootRarity: 'epic', lootPerK: 0.13, ...load() });

// Loot prices from the site (24 h median, or 7 days without manipulated days), loaded once.
export const lootTrades = $state({ byRarity: {} });
getLootPrices().then((r) => (lootTrades.byRarity = r ?? {})).catch(() => {});

// What real battles hand out per damage band (the site's counts), loaded once.
export const battleLoot = $state({ data: null, error: '' });
fetch('/api/battle-loot').then(async (r) => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  battleLoot.data = body.data;
}).catch((err) => { battleLoot.error = err.message; });

/** Expected battle loot for a fight's damage (from real battles), or null while there's no data. */
export const lootFor = (market, damage) => expectedLoot(battleLoot.data, damage, lootPrices(market));

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
 * The fight's income as engine terms: { bounty, perK, flat (loot items' value),
 * economy (companies), lootAt (damage → G, loot from real battles) }. With
 * `damage`, loot from real battles is in `flat` for that damage.
 */
export function incomeTerms(market, damage = 0) {
  const mode = fightIncome.lootMode;
  const prices = lootPrices(market);
  const lootAt = mode === 'auto' && battleLoot.data ? (d) => expectedLoot(battleLoot.data, d, prices)?.value ?? 0 : null;
  return {
    bounty: Math.max(0, Number(fightIncome.bounty) || 0),
    perK: mode === 'perK' ? Math.max(0, Number(fightIncome.lootPerK) || 0) : 0,
    flat: mode === 'items' ? Math.max(0, Number(fightIncome.lootItems) || 0) * (prices[fightIncome.lootRarity] ?? 0) : lootAt && damage ? lootAt(damage) : 0,
    economy: companyProfit.value ?? 0,
    lootAt,
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
      const ranks = Object.fromEntries(ECONOMY_SKILLS.map((s) => [s, planner.player?.prestige?.[s] ?? 0]));
      if (!id) { companyProfit.value = null; return; }
      const key = JSON.stringify([id, levels, ranks]);
      wanted = key;
      (async () => {
        if (modelFor !== id) { model = await incomeModel(market, planner).catch(() => null); modelFor = id; }
        if (wanted === key) companyProfit.value = model ? model(levels, ranks) : null;
      })();
    });
  });
}
