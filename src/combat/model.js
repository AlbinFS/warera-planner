/**
 * Our own combat model: how much damage a build does in a fight and what it
 * costs, from the game config and market prices. No dependencies.
 *
 * Per swing (one hit):
 *   attack   = (attack skill + weapon attack + precision overflow) × (1 + military rank)
 *   base     = attack × (1 + ammo) × (1 + pill) × (1 + battle bonus)
 *   miss     = 1 − precision; a miss does half damage
 *   crit     = crit chance (of the swings that land); a crit adds crit damage %
 *   expected = base × [miss × 0.5 + (1 − miss) × (1 + crit × crit damage)]
 * Health:
 *   armor and dodge each work as value / (value + soft cap), shown and applied
 *   as whole percents (so they come in breakpoints)
 *   health per swing = 10 × (1 − armor %) × (1 − dodge %)
 *   a fight window of H hours has the full bar plus H hours of regen (a tenth
 *   of the bar an hour), and as much food as the hunger bar plus its regen
 *   allows; each food heals its % of the health bar
 * Wear (durability 100): a weapon loses 1 per swing, armor 0.5; a broken
 * piece gives a third of its rarity's scrap base. Ammo: one per swing.
 * Drops: case 1 at the loot chance per swing, case 2 at 1% of that.
 */

export const HEALTH_COST = 10;
export const WEAR_PER_HIT = { weapon: 1, armor: 0.5 };
export const SCRAP_BASE = { common: 6, uncommon: 18, rare: 54, epic: 162, legendary: 486, mythic: 1458 };
export const ARMOR_SLOTS = ['helmet', 'chest', 'pants', 'boots', 'gloves'];
export const FOODS = ['bread', 'steak', 'cookedFish'];
export const AMMOS = ['lightAmmo', 'ammo', 'heavyAmmo'];
const CASE2_SHARE = 0.01;

/** Whole-percent reduction from a soft-capped stat (armor, dodge): value / (value + cap). */
export function softCapPercent(value, cap = 40) {
  return value > 0 ? Math.round((100 * value) / (value + cap)) : 0;
}

/** The smallest value that reaches `percent` (the breakpoint), or Infinity. */
export function breakpoint(percent, cap = 40) {
  if (percent <= 0) return 0;
  if (percent >= 100) return Infinity;
  // value / (value + cap) ≥ (percent − 0.5) / 100, rounded up to whole points.
  const f = (percent - 0.5) / 100;
  let v = Math.ceil((f * cap) / (1 - f) - 1e-9);
  while (softCapPercent(v, cap) < percent) v++;
  return v;
}

/** A skill's value at a level (plus prestige, at most 4), from the game config. */
export function skillValue(config, skill, level, prestige = 0) {
  const levels = config.skills[skill]?.levels ?? {};
  const n = level + Math.min(4, Math.max(0, prestige));
  if (typeof levels[n]?.value === 'number') return levels[n].value;
  const top = Math.max(...Object.keys(levels).map(Number));
  const step = (levels[top]?.value ?? 0) - (levels[top - 1]?.value ?? levels[top]?.value ?? 0);
  return (levels[top]?.value ?? 0) + (n - top) * step;
}

/** The player's stats from skill levels. */
export function playerStats(config, levels, prestige = {}) {
  const v = (s) => skillValue(config, s, levels[s] ?? 0, prestige[s] ?? 0);
  return {
    attack: v('attack'), precision: v('precision'), criticalChance: v('criticalChance'), criticalDamages: v('criticalDamages'),
    armor: v('armor'), dodge: v('dodge'), health: v('health'), hunger: v('hunger'), lootChance: v('lootChance'),
    armorCap: config.skills.armor?.softCap ?? 40, dodgeCap: config.skills.dodge?.softCap ?? 40,
    precisionOverflow: config.skills.precision?.skillOverflowValue ?? 4, critOverflow: config.skills.criticalChance?.skillOverflowValue ?? 4,
  };
}

/** Expected damage per swing and its parts. gear: { weapon, helmet, gloves } rolls ({ skills }), ammo code. */
export function swingDamage(stats, gear, opts, config) {
  const s = (slot, k) => gear[slot]?.skills?.[k] ?? 0;
  let precision = stats.precision + s('gloves', 'precision');
  let crit = stats.criticalChance + s('weapon', 'criticalChance');
  let critDamage = stats.criticalDamages + s('helmet', 'criticalDamages');
  let attack = stats.attack + s('weapon', 'attack');
  if (precision > 100) { attack += (precision - 100) * stats.precisionOverflow; precision = 100; }
  if (crit > 100) { critDamage += (crit - 100) * stats.critOverflow; crit = 100; }
  const ammo = gear.ammo ? (config.items[gear.ammo]?.flatStats?.percentAttack ?? 0) / 100 : 0;
  const pill = opts.pill ? (config.items.cocain?.flatStats?.percentAttack ?? 60) / 100 : 0;
  const base = attack * (1 + (opts.militaryRankPercent ?? 0) / 100) * (1 + ammo) * (1 + pill) * (1 + (opts.battleBonusPercent ?? 0) / 100);
  const miss = 1 - precision / 100;
  const expected = base * (miss * 0.5 + (1 - miss) * (1 + (crit / 100) * (critDamage / 100)));
  return { expected, base, attack, precision, crit, critDamage };
}

/** Health lost per swing on average, with the armor and dodge percents. */
export function healthPerSwing(stats, gear) {
  const s = (slot, k) => gear[slot]?.skills?.[k] ?? 0;
  const armorValue = stats.armor + s('chest', 'armor') + s('pants', 'armor');
  const dodgeValue = stats.dodge + s('boots', 'dodge');
  const armor = softCapPercent(armorValue, stats.armorCap);
  const dodge = softCapPercent(dodgeValue, stats.dodgeCap);
  return { perSwing: HEALTH_COST * (1 - armor / 100) * (1 - dodge / 100), armor, dodge, armorValue, dodgeValue };
}

/** Health and food a fight window of `hours` offers. */
export function fightSupply(stats, food, hours, config) {
  const regen = 1 + hours / 10;
  const heal = food ? stats.health * ((config.items[food]?.flatStats?.healthRegenPercent ?? 0) / 100) : 0;
  return { health: stats.health * regen, foodMax: food ? Math.floor(stats.hunger * regen) : 0, heal };
}

/** Market price of an item code (ammo, food, pill, cases, scraps). */
export const itemPrice = (market, code) => market.itemPrices[code] ?? null;

/** Wear cost per swing of one piece, net of the scrap it gives once broken. */
export function wearPerSwing(market, config, slot, roll) {
  if (!roll) return 0;
  const rate = (slot === 'weapon' ? WEAR_PER_HIT.weapon : WEAR_PER_HIT.armor) / 100;
  const scraps = Math.floor((SCRAP_BASE[config.items[roll.code]?.rarity] ?? 0) / 3);
  return rate * (roll.price - scraps * (itemPrice(market, 'scraps') ?? 0));
}

/**
 * Damage, cost and income of one build over a fight. The number of swings is
 * chosen up to what the health and food allow: by default all of it; with
 * `limit` (most loss allowed), the most swings whose net stays at or above it.
 * terms: { bounty, perK, flat } (G per 1k damage, and G per fight); economy (G).
 */
export function fight({ market, config, stats, gear, food, opts, terms = {}, limit = null }) {
  const dmg = swingDamage(stats, gear, opts, config);
  const hp = healthPerSwing(stats, gear);
  const supply = fightSupply(stats, food, opts.hours ?? 8, config);
  const ammoPrice = gear.ammo ? itemPrice(market, gear.ammo) ?? 0 : 0;
  const wear = wearPerSwing(market, config, 'weapon', gear.weapon) + ARMOR_SLOTS.reduce((t, s) => t + wearPerSwing(market, config, s, gear[s]), 0);
  const lootChance = stats.lootChance / 100;
  const cases = lootChance * ((itemPrice(market, 'case1') ?? 0) + CASE2_SHARE * (itemPrice(market, 'case2') ?? 0));
  const perSwingCost = ammoPrice + wear - cases;
  const perSwingIncome = ((terms.bounty ?? 0) + (terms.perK ?? 0)) * dmg.expected / 1000;
  const fixed = (terms.flat ?? 0) + (terms.economy ?? 0) - (opts.pill ? itemPrice(market, 'cocain') ?? 0 : 0);
  const foodPrice = food ? itemPrice(market, food) ?? Infinity : 0;
  const freeSwings = supply.health / hp.perSwing;
  const foodSwings = supply.heal / hp.perSwing; // swings per food
  const maxSwings = freeSwings + supply.foodMax * foodSwings;
  const margin = perSwingIncome - perSwingCost; // per swing, before food
  const foodMargin = margin - (foodSwings > 0 ? foodPrice / foodSwings : Infinity);

  // net(s) = fixed + s × margin − food bought; piecewise linear in s.
  const netAt = (s) => fixed + s * margin - Math.max(0, s - freeSwings) * (foodSwings > 0 ? foodPrice / foodSwings : 0);
  let swings = maxSwings;
  if (limit != null && netAt(swings) < -limit) {
    // Most swings with net ≥ −limit, if any.
    const target = -limit;
    let s = null;
    if (fixed + freeSwings * margin >= target) {
      // Inside the free part; extend into food while it stays above.
      s = foodMargin < 0 ? Math.min(maxSwings, freeSwings + (fixed + freeSwings * margin - target) / -foodMargin) : maxSwings;
    } else if (margin < 0 && fixed >= target) {
      s = (fixed - target) / -margin;
    }
    if (s == null) return null;
    swings = Math.max(0, s);
  }
  const foodEaten = Math.max(0, swings - freeSwings) / (foodSwings || Infinity);
  const damage = swings * dmg.expected;
  const cost = swings * perSwingCost + foodEaten * foodPrice + (opts.pill ? itemPrice(market, 'cocain') ?? 0 : 0);
  const income = swings * perSwingIncome + (terms.flat ?? 0);
  return {
    damage, cost, income, net: income + (terms.economy ?? 0) - cost, swings, foodEaten,
    perSwing: dmg.expected, armor: hp.armor, dodge: hp.dodge, armorValue: hp.armorValue, dodgeValue: hp.dodgeValue,
    healthPerSwing: hp.perSwing, precision: dmg.precision, crit: dmg.crit, critDamage: dmg.critDamage,
    parts: { ammo: swings * ammoPrice, wear: swings * wear, cases: swings * cases, food: foodEaten * foodPrice },
  };
}
