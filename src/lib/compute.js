/**
 * Planner calculations on top of our own combat engine (src/combat):
 * evaluate the planned build, find cheaper/stronger alternatives, the cost
 * breakdown, and optimize gear and skills.
 */
import { priceKey, FIGHT_SKILLS, ECONOMY_SKILLS, ALL_SKILLS } from '../engine/inputs.js';
import { prepare, strongest, strongestSplit, isSplit, cheapest, buildFrontier, rollPrice, levelCost } from '../combat/optimize.js';
import { WEAR_PER_HIT, SCRAP_BASE, itemPrice, canFight } from '../combat/model.js';
import { searchLayout } from '../combat/client.js';
import { incomePlan } from './income.js';

const GEAR_SLOTS = ['weapon', 'helmet', 'chest', 'pants', 'boots', 'gloves'];

/**
 * Fight settings as the engine's options. A full day is 24 h; a session can
 * also be 16 h. splitDebuff: a second build for the pill's debuff.
 */
export function fightOptions(settings) {
  return { pill: !!settings.pill, battleBonusPercent: Number(settings.battleBonus) || 0, hours: Number(settings.windowHours) || 8, splitDebuff: !!settings.splitDebuff };
}

/** Whether the settings fight the debuff with its own build. */
export const splitActive = (market, settings) => isSplit({ items: market.gameConfigItems }, fightOptions(settings));

/** The player's level, rank and prestige (a shared build carries its own). */
export function playerOf(planner) {
  const p = planner.player;
  return { level: p?.level ?? 1, militaryRankPercent: p?.militaryRankPercent ?? 0, prestige: p?.prestige ?? {} };
}

/** The planner's gear as engine rolls ({ code, skills, price }; ammo a code). */
export function lockedGear(market, gear) {
  const locked = {};
  for (const slot of GEAR_SLOTS) {
    const g = gear[slot];
    locked[slot] = g?.code ? { code: g.code, skills: g.skills ?? {}, price: rollPrice(market, g.code, g.skills, priceKey) ?? 0 } : null;
  }
  locked.ammo = gear.ammo ?? null;
  return locked;
}

/** Engine gear → the planner's equipment shape. */
export function toEquipment(market, gear) {
  const out = {};
  for (const slot of GEAR_SLOTS) {
    const r = gear[slot];
    out[slot] = r ? { code: r.code, type: market.gameConfigItems[r.code]?.type ?? 'equipment', skills: { ...r.skills }, maxState: 100, state: 100 } : null;
  }
  out.ammo = gear.ammo ?? null;
  return out;
}

// Prepared markets, by what's fixed (a handful at most: planned gear, free gear).
const preps = new Map();
function prepFor(market, { locked, lockedFood } = {}) {
  const key = JSON.stringify([locked ?? null, lockedFood ?? null]);
  let entry = preps.get(key);
  if (!entry || entry.market !== market) {
    entry = { market, prep: prepare(market, { locked: locked ?? {}, lockedFood }) };
    preps.set(key, entry);
    if (preps.size > 8) preps.delete(preps.keys().next().value);
  }
  return entry.prep;
}

const foodSetting = (settings) => (settings.food === 'any' ? undefined : settings.food);
const plannedFood = (planner) => (planner.food && planner.food !== 'none' ? planner.food : 'none');

/** A build as the pages show it: damage, cost, equipment, food (and the engine's details), and the debuff's own build. */
const shape = (market, b) => b && {
  damage: b.damage, cost: b.cost, equipment: toEquipment(market, b.gear), food: b.food ?? 'none', details: b,
  debuff: b.debuff ? { equipment: toEquipment(market, b.debuff.gear), food: b.debuff.food ?? 'none' } : null,
};

/** Damage and cost of the planned build, or { error }. */
export async function evaluateBuild(market, planner, settings) {
  if (!canFight(planner.gear)) return { error: 'A gun can’t shoot without ammo: pick ammo, or a knife.' };
  const opts = fightOptions(settings);
  const prep = prepFor(market, { locked: lockedGear(market, planner.gear), lockedFood: plannedFood(planner) });
  let b;
  if (isSplit(prep.config, opts)) {
    // The debuff build (or the pill build again, until one is set).
    const debuff = planner.debuff ?? { gear: planner.gear, food: planner.food };
    if (!canFight(debuff.gear)) return { error: 'The debuff build’s gun can’t shoot without ammo: pick ammo, or a knife.' };
    const prepDebuff = prepFor(market, { locked: lockedGear(market, debuff.gear), lockedFood: plannedFood(debuff) });
    b = strongestSplit(prep, planner.skills, playerOf(planner), opts, {}, Infinity, prepDebuff);
  } else {
    b = strongest(prep, planner.skills, playerOf(planner), opts);
  }
  if (!b) return { error: 'This build can’t fight.' };
  return { damage: b.damage, cost: b.cost, build: { equipment: toEquipment(market, b.gear), foodCode: b.food ?? 'none' }, details: b };
}

/** Cheaper build with the same damage and stronger build for the same cost (null when the planned one is best). */
export async function findHints(market, planner, settings, evaluated) {
  const prep = prepFor(market, { lockedFood: foodSetting(settings) });
  const player = playerOf(planner);
  const opts = fightOptions(settings);
  const same = cheapest(prep, planner.skills, player, opts, evaluated.damage * 0.9999);
  const top = strongest(prep, planner.skills, player, opts, {}, evaluated.cost + 1e-6);
  const cheaper = same?.reachedTarget && same.cost < evaluated.cost - 0.05 ? shape(market, same) : null;
  const stronger = top && top.damage > evaluated.damage * 1.001 ? shape(market, top) : null;
  return { cheaper, stronger };
}

/**
 * Where the cost goes, and how many hits that buys: wear per piece (its
 * market price over its life), ammo, food, the pill, and the credits (scraps
 * from broken gear, expected case drops).
 */
export async function costBreakdown(market, planner, settings, evaluated) {
  const b = evaluated.details;
  if (!b) return null;
  const config = { items: market.gameConfigItems };
  const rows = [];
  const scraps = itemPrice(market, 'scraps') ?? 0;
  let scrapCredit = 0;
  // Gear wear, ammo and food of one build: the pill build (all of it with one build), then the debuff's own.
  const own = (x, phase) => {
    const swings = phase === 'debuff' || !b.debuff ? x.swings : x.swings - b.debuff.swings;
    const food = phase === 'debuff' || !b.debuff ? x.foodEaten : x.foodEaten - b.debuff.foodEaten;
    for (const slot of GEAR_SLOTS) {
      const r = x.gear[slot];
      if (!r) continue;
      // The weapon wears per swing, armor per hit taken (a dodge spares it).
      const share = swings * (slot === 'weapon' ? WEAR_PER_HIT.weapon : WEAR_PER_HIT.armor * (1 - x.dodge / 100)) / 100;
      rows.push({ kind: 'roll', key: priceKey(r.code, r.skills), code: r.code, skills: r.skills, slot, phase, amount: share * r.price });
      scrapCredit += share * Math.floor((SCRAP_BASE[config.items[r.code]?.rarity] ?? 0) / 3) * scraps;
    }
    if (x.gear.ammo) rows.push({ kind: 'item', code: x.gear.ammo, slot: 'ammo', phase, amount: swings * (itemPrice(market, x.gear.ammo) ?? 0) });
    if (x.food && food > 0) rows.push({ kind: 'item', code: x.food, slot: 'food', phase, amount: food * (itemPrice(market, x.food) ?? 0) });
  };
  own(b, 'planned');
  if (b.debuff) own(b.debuff, 'debuff');
  if (settings.pill) rows.push({ kind: 'item', code: 'cocain', slot: 'pill', amount: itemPrice(market, 'cocain') ?? 0 });
  if (scrapCredit) rows.push({ kind: 'item', code: 'scraps', slot: 'scraps', amount: -scrapCredit });
  const lootChance = b.stats.lootChance / 100;
  const case1 = b.swings * lootChance;
  const cases = [{ code: 'case1', count: case1 }, { code: 'case2', count: case1 * 0.01 }].filter((c) => itemPrice(market, c.code) != null);
  for (const c of cases) rows.push({ kind: 'item', code: c.code, slot: 'case', amount: -c.count * itemPrice(market, c.code) });
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    total, rows: rows.filter((r) => Math.abs(r.amount) >= 0.005), other: Math.abs(b.cost - total) >= 0.05 ? b.cost - total : 0,
    hits: b.swings, hitsArePillPhase: false, perAttack: b.perSwing, foodEaten: b.foodEaten, cases, phases: b.phases,
    split: b.debuff ? { pill: b.swings - b.debuff.swings, debuff: b.debuff.swings } : null,
  };
}

/** The most damage whose cost is at most `budget` (per window or per day, as the settings say). */
export async function strongestWithin(market, planner, settings, budget) {
  const prep = prepFor(market, { lockedFood: foodSetting(settings) });
  const b = strongest(prep, planner.skills, playerOf(planner), fightOptions(settings), {}, budget);
  if (!b) return { error: 'No build costs that little with these skills and settings.' };
  return { ...shape(market, b), reachedTarget: true };
}

/** Builds around a damage target (85–115%), so a slightly lower or higher target with much better value is easy to spot. */
export async function buildsNear(market, planner, settings, target) {
  const prep = prepFor(market, { lockedFood: foodSetting(settings) });
  const near = buildFrontier(prep, planner.skills, playerOf(planner), fightOptions(settings))
    .filter((b) => b.damage >= target * 0.85 && b.damage <= target * 1.15);
  // One build per 1% of damage (the frontier is very fine-grained), cheapest of each.
  const kept = [];
  for (const b of near) {
    const last = kept.at(-1);
    if (last && b.damage < last.damage * 1.01) { if (b.cost <= last.cost) kept[kept.length - 1] = b; continue; }
    kept.push(b);
  }
  return kept.map((b) => ({ ...shape(market, b), per1k: (b.cost / b.damage) * 1000 }));
}

/** Cheapest gear (and food, unless fixed in settings) reaching a damage target. */
export async function optimizeEquipment(market, planner, settings, target) {
  const prep = prepFor(market, { lockedFood: foodSetting(settings) });
  const b = cheapest(prep, planner.skills, playerOf(planner), fightOptions(settings), target);
  if (!b) return { error: 'No build can fight with these settings.' };
  return { ...shape(market, b), reachedTarget: b.reachedTarget };
}

/** Points the skills outside `searched` use. */
export function keptPoints(market, levels, searched) {
  const config = { skills: market.gameConfigSkills };
  return ALL_SKILLS.filter((s) => !searched.includes(s)).reduce((t, s) => t + levelCost(config, s, levels[s] ?? 0), 0);
}

/**
 * Skills for a daily-damage range: the layout whose cheapest builds at four
 * targets across the range cost least on average. With keepEconomy off the
 * economy skills move too, with their income change counted (Leadership earns
 * nothing, so it's set to 0 and its points freed).
 */
export async function optimizeSkills(market, planner, settings, { min, max, keepEconomy, onProgress, signal }) {
  const started = Date.now();
  const searched = keepEconomy ? FIGHT_SKILLS : [...FIGHT_SKILLS, ...ECONOMY_SKILLS.filter((s) => s !== 'leadership')];
  const start = { ...planner.skills, ...(keepEconomy ? {} : { leadership: 0 }) };
  const level = planner.player?.level ?? 1;
  const income = !keepEconomy && planner.player?.id ? await incomePlan(market, planner).catch(() => null) : null;
  const targets = Array.from({ length: 4 }, (_, i) => min + ((max - min) * i) / 3);
  const r = await searchLayout(market, {
    lockedFood: foodSetting(settings), start, searched, budget: level * 4 - keptPoints(market, start, searched),
    player: playerOf(planner), opts: fightOptions(settings), objective: { kind: 'range', targets }, income,
  }, { onProgress: (s) => onProgress?.({ evaluations: s.checked }), signal });
  if (!r?.best || r.best.unreachable) return { error: 'No skill layout reaches that damage range with these settings.' };
  return {
    skills: { ...start, ...r.levels }, income: r.best.income ?? 0, incomeChange: income ? r.best.income ?? 0 : null,
    cost: r.best.cost, elapsedMs: Date.now() - started, hadEconomy: false,
  };
}
