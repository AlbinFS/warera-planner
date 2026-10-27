/**
 * Builds the optimizer workers' inputs. Pure functions: they run in the
 * browser and in Node (tests), and produce inputs identical to the ones the
 * workers were verified against.
 */
export const FIGHT_SKILLS = ['attack', 'precision', 'criticalChance', 'criticalDamages', 'armor', 'dodge', 'health', 'lootChance', 'hunger'];
// Economy skills since the eco update (v0.27): Entrepreneurship is gone, Leadership is new.
export const ECONOMY_SKILLS = ['production', 'energy', 'companies', 'management', 'leadership'];
// The vendored optimizers predate the update: they know these and not Leadership,
// so Leadership's points are taken off the budget they get.
export const VENDOR_ECONOMY_SKILLS = ['production', 'energy', 'companies', 'management'];
export const ALL_SKILLS = [...FIGHT_SKILLS, ...ECONOMY_SKILLS];
export const SLOTS = ['weapon', 'ammo', 'helmet', 'chest', 'pants', 'boots', 'gloves'];

/** Price key of an equipment roll: "code:stat=value|stat=value" (stats in name order). */
export function priceKey(code, skills) {
  const entries = Object.entries(skills ?? {})
    .filter(([, v]) => Number.isFinite(v))
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? `${code}:${entries.map(([k, v]) => `${k}=${v}`).join('|')}` : `${code}:no-skills`;
}

/** Value of a skill at a level plus prestige (at most 4), from the game config; extrapolated past the table. */
export function skillValue(skillConfig, level, prestige = 0) {
  const levels = skillConfig?.levels ?? {};
  const at = (n) => (typeof levels[String(n)]?.value === 'number' ? levels[String(n)].value : null);
  const effective = level + Math.min(4, Math.max(0, prestige));
  if (at(effective) != null) return at(effective);
  const top = Math.max(...Object.keys(levels).map(Number).filter((n) => at(n) != null));
  const step = at(top) - (at(top - 1) ?? at(top));
  return at(top) + (effective - top) * step;
}

/**
 * Market data in the shape the workers expect, from game config, item prices
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

/**
 * Market data for the skill optimizer: gear worn during the pill debuff that
 * has no exact roll price gets the median price of that item's rolls.
 */
export function skillsMarket(market, debuffBuild) {
  const extra = {};
  for (const item of Object.values(debuffBuild?.equipment ?? {})) {
    if (!item?.code) continue;
    const key = priceKey(item.code, item.skills ?? {});
    if (Number.isFinite(market.equipmentPrices[key])) continue;
    const prices = market.equipmentMarketRolls.filter((r) => r.code === item.code)
      .map((r) => market.equipmentPrices[priceKey(r.code, r.skills)]).filter(Number.isFinite).sort((a, b) => a - b);
    if (prices.length) extra[key] = prices[prices.length >> 1];
  }
  return { ...market, equipmentPrices: { ...market.equipmentPrices, ...extra } };
}

/** Combat skill values for given levels (and prestige), as the workers expect them. */
export function combatSkills(market, levels, prestige = {}, militaryRankPercent = 0) {
  const value = (s) => skillValue(market.gameConfigSkills[s], levels[s] ?? 0, prestige[s] ?? 0);
  return {
    attack: { value: value('attack'), militaryRankPercent },
    precision: { value: value('precision') },
    criticalChance: { value: value('criticalChance') },
    criticalDamages: { value: value('criticalDamages') },
    armor: { value: value('armor') },
    dodge: { value: value('dodge') },
    health: { value: value('health'), hourlyBarRegen: value('health') / 10 },
    hunger: { value: value('hunger'), hourlyBarRegen: value('hunger') / 10 },
    lootChance: { value: value('lootChance') },
  };
}

/**
 * A fight window as one "round" phase: full health and hunger bars plus
 * their regen over the window, at the pill's damage multiplier. The workers'
 * round cost leaves the pill out; add its price when costing a window.
 */
export function windowRound(market, skills, hours, pill) {
  const pillStats = market.gameConfigItems.cocain?.flatStats ?? {};
  return {
    existingDamage: 0,
    phases: [{
      health: skills.health.value * (1 + hours / 10),
      food: Math.floor(skills.hunger.value * (1 + hours / 10)),
      multiplier: pill ? 1 + (pillStats.percentAttack ?? 60) / 100 : 1,
    }],
  };
}

/**
 * The optimizer worker's `input` for a player setup:
 * - level, militaryRankPercent, skills (fight-skill levels), prestige
 * - pill, battleBonusPercent
 * - dailyContext (optional): credits to count and the build worn during the pill debuff
 * - windowHours (optional): cost and damage for that fight window instead of a full day
 * - round (optional): { existingDamage, phases: [{ health, food, multiplier }] }, used as given
 * - lockedEquipment, lockedFood (optional): fix slots or the food
 */
export function buildInput(market, setup) {
  const { level, militaryRankPercent = 0, skills, prestige = {}, pill = false, battleBonusPercent = 0 } = setup;
  const combat = combatSkills(market, skills, prestige, militaryRankPercent);
  return {
    ...market,
    level,
    militaryRankPercent,
    fightSkills: Object.fromEntries(FIGHT_SKILLS.map((s) => [s, skills[s] ?? 0])),
    combatOptions: {
      pillEnabled: pill,
      battleBonusPercent,
      // An explicit fight (e.g. a player's current bars) or a window of full bars plus regen.
      ...(setup.round ? { round: setup.round } : setup.windowHours ? { round: windowRound(market, combat, setup.windowHours, pill) } : {}),
      ...(setup.dailyContext ? { dailyContext: setup.dailyContext } : {}),
    },
    lockedEquipment: setup.lockedEquipment,
    lockedFood: setup.lockedFood,
    combatSkills: combat,
  };
}

/** Gear as the debuff build expects it, from inventory.fetchCurrentEquipment. */
export function debuffEquipment(equipment) {
  return Object.fromEntries(SLOTS.map((slot) => {
    const item = equipment?.[slot];
    if (!item) return [slot, null];
    if (typeof item === 'string') return [slot, item];
    return [slot, { code: item.code, type: item.type ?? (slot === 'weapon' ? 'weapon' : 'equipment'), skills: item.skills ?? {}, maxState: item.maxState ?? 100 }];
  }));
}
