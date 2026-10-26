/**
 * Market data for the engine, loaded once per page: game config, item
 * prices and per-roll equipment prices, plus a catalog of what fits each slot.
 */
import { getGameConfig, getItemPrices, getEquipmentPrices } from './warera.js';
import { buildMarket, priceKey } from '../engine/inputs.js';

export const GEAR_SLOTS = ['weapon', 'helmet', 'chest', 'pants', 'boots', 'gloves'];
export const SLOT_NAMES = { weapon: 'Weapon', ammo: 'Ammo', helmet: 'Helmet', chest: 'Chest', pants: 'Pants', boots: 'Boots', gloves: 'Gloves' };
export const STAT_NAMES = {
  attack: 'Attack', criticalChance: 'Crit chance', criticalDamages: 'Crit damage', armor: 'Armor', dodge: 'Dodge', precision: 'Precision',
};

let loading = null;

/** { market, catalog, priceOf(code, skills), itemPrice(code) }, loaded once. */
export function loadMarket() {
  loading ??= (async () => {
    const [config, itemPrices, equipment] = await Promise.all([getGameConfig(), getItemPrices(), getEquipmentPrices()]);
    const market = buildMarket(config.data, itemPrices.data, equipment.data.items);
    return { market, catalog: catalog(config.data.items), priceOf: (code, skills) => market.equipmentPrices[priceKey(code, skills)], itemPrice: (code) => market.itemPrices[code] };
  })().catch((err) => { loading = null; throw err; });
  return loading;
}

/** Items per slot (with their stat ranges), ammo types and foods, from the game config. */
function catalog(items) {
  const bySlot = Object.fromEntries(GEAR_SLOTS.map((s) => [s, []]));
  const ammo = [];
  const foods = [];
  for (const [code, item] of Object.entries(items)) {
    if (item.dynamicStats && bySlot[item.usage]) bySlot[item.usage].push({ code, stats: item.dynamicStats, rarity: item.rarity });
    else if (item.usage === 'ammo') ammo.push({ code, percent: item.flatStats?.percentAttack ?? 0 });
    else if (item.isConsumable && item.flatStats?.healthRegenPercent) foods.push({ code, percent: item.flatStats.healthRegenPercent });
  }
  // Tiers in order (helmet1 … helmet6), ammo and food from weakest to strongest.
  for (const list of Object.values(bySlot)) list.sort((a, b) => firstStatMin(a) - firstStatMin(b));
  ammo.sort((a, b) => a.percent - b.percent);
  foods.sort((a, b) => a.percent - b.percent);
  return { bySlot, ammo, foods };
}

const firstStatMin = (item) => Object.values(item.stats)[0][0];

export function itemLabel(code) {
  const names = { knife: 'Knife', gun: 'Gun', rifle: 'Rifle', sniper: 'Sniper', tank: 'Tank', jet: 'Jet', lightAmmo: 'Light ammo', ammo: 'Ammo', heavyAmmo: 'Heavy ammo', cookedFish: 'Cooked fish', steak: 'Steak', bread: 'Bread', cocain: 'Pill', scraps: 'Scraps' };
  if (names[code]) return names[code];
  const m = code.match(/^([a-z]+)(\d)$/);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} T${m[2]}` : code;
}
