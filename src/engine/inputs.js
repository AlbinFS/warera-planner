/**
 * Skill lists, price keys, skill values and the market shape the combat
 * engine (src/combat) reads. Pure functions: they run in the browser and in Node.
 */
export const FIGHT_SKILLS = ['attack', 'precision', 'criticalChance', 'criticalDamages', 'armor', 'dodge', 'health', 'lootChance', 'hunger'];
// Economy skills since the eco update (v0.27): Entrepreneurship is gone, Leadership is new.
export const ECONOMY_SKILLS = ['production', 'energy', 'companies', 'management', 'leadership'];
export const ALL_SKILLS = [...FIGHT_SKILLS, ...ECONOMY_SKILLS];
export const SLOTS = ['weapon', 'ammo', 'helmet', 'chest', 'pants', 'boots', 'gloves'];

/** Price key of an equipment roll: "code:stat=value|stat=value" (stats in name order). */
export function priceKey(code, skills) {
  const entries = Object.entries(skills ?? {})
    .filter(([, v]) => Number.isFinite(v))
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? `${code}:${entries.map(([k, v]) => `${k}=${v}`).join('|')}` : `${code}:no-skills`;
}

/** Value of a skill at a level plus prestige ranks (one level each), from the game config; extrapolated past the table. */
export function skillValue(skillConfig, level, prestige = 0) {
  const levels = skillConfig?.levels ?? {};
  const at = (n) => (typeof levels[String(n)]?.value === 'number' ? levels[String(n)].value : null);
  const effective = level + Math.max(0, prestige);
  if (at(effective) != null) return at(effective);
  const top = Math.max(...Object.keys(levels).map(Number).filter((n) => at(n) != null));
  const step = at(top) - (at(top - 1) ?? at(top));
  return at(top) + (effective - top) * step;
}

/**
 * Market data in the shape the combat engine reads, from game config, item prices
 * and per-roll equipment prices (the /api/equipment-prices `items` list).
 * Rolls and item prices are put in a fixed order, so results don't depend on
 * the order the data arrived in.
 */
export function buildMarket(gameConfig, itemPrices, equipmentRolls) {
  const rolls = [...equipmentRolls].sort((a, b) => priceKey(a.code, a.skills).localeCompare(priceKey(b.code, b.skills)));
  return {
    gameConfigItems: gameConfig.items,
    gameConfigSkills: gameConfig.skills,
    gameConfigBattle: gameConfig.battle,
    itemPrices: Object.fromEntries(Object.entries(itemPrices).sort(([a], [b]) => a.localeCompare(b))),
    equipmentPrices: Object.fromEntries(rolls.map((r) => [priceKey(r.code, r.skills), r.averagePrice])),
    equipmentMarketRolls: rolls,
  };
}
