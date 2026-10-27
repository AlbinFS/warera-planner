/**
 * The combat model and optimizer (src/combat) against numbers from the game:
 * the armor and dodge breakpoint tables, and a known build's damage and hits.
 * A small game config is built here, so the tests need no data files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { softCapPercent, breakpoint, playerStats, swingDamage, fight } from '../src/combat/model.js';
import { prepare, strongest, cheapest } from '../src/combat/optimize.js';
import { buildMarket } from '../src/engine/inputs.js';

const table = (base, step, cost = (n) => (n * (n + 1)) / 2) => ({
  levels: Object.fromEntries(Array.from({ length: 11 }, (_, n) => [n, { value: base + step * n, totalCost: cost(n) }])),
});
const config = {
  skills: {
    attack: table(100, 25), precision: { ...table(50, 5), skillOverflowValue: 4 }, criticalChance: { ...table(10, 5), skillOverflowValue: 4 },
    criticalDamages: table(100, 20), armor: { ...table(0, 6), softCap: 40 }, dodge: { ...table(0, 4), softCap: 40 },
    health: table(100, 10), hunger: table(4, 1), lootChance: table(5, 2),
  },
  items: {
    cocain: { flatStats: { percentAttack: 60, buffDurationHours: 8 } },
    lightAmmo: { usage: 'ammo', flatStats: { percentAttack: 10 } },
    cookedFish: { usage: 'food', flatStats: { healthRegenPercent: 20 } },
    rifle: { usage: 'weapon', type: 'weapon', rarity: 'rare' },
    helmet4: { usage: 'helmet', type: 'equipment', rarity: 'epic' },
    chest4: { usage: 'chest', type: 'equipment', rarity: 'epic' },
    pants4: { usage: 'pants', type: 'equipment', rarity: 'epic' },
    boots4: { usage: 'boots', type: 'equipment', rarity: 'epic' },
    gloves4: { usage: 'gloves', type: 'equipment', rarity: 'epic' },
  },
};
const layout = { attack: 6, precision: 5, criticalChance: 4, criticalDamages: 3, armor: 5, dodge: 5, health: 5, lootChance: 4, hunger: 5 };
const roll = (code, skills, price = 60) => ({ code, skills, price });
const gear = {
  weapon: roll('rifle', { attack: 87, criticalChance: 14 }, 15), ammo: 'lightAmmo', helmet: roll('helmet4', { criticalDamages: 84 }),
  chest: roll('chest4', { armor: 24 }), pants: roll('pants4', { armor: 28 }), boots: roll('boots4', { dodge: 24 }), gloves: roll('gloves4', { precision: 24 }),
};

test('armor breakpoints match the game table', () => {
  // Armor → reduction, from the in-game table.
  for (const [value, pct] of [[43, 52], [44, 52], [47, 54], [59, 60], [61, 60], [92, 70], [95, 70], [96, 71], [124, 76], [130, 76]]) {
    assert.equal(softCapPercent(value, 40), pct, `armor ${value}`);
  }
  assert.equal(breakpoint(52), 43);
  assert.equal(breakpoint(70), 92);
  assert.equal(breakpoint(71), 96);
});

test('dodge breakpoints match the game table (dodge skill 24 plus gear)', () => {
  for (const [gearDodge, pct] of [[11, 47], [12, 47], [13, 48], [21, 53], [24, 55], [31, 58], [40, 62], [51, 65], [60, 68]]) {
    assert.equal(softCapPercent(24 + gearDodge, 40), pct, `dodge 24 + ${gearDodge}`);
  }
});

test('damage per swing: multipliers and luck as the combat simulator shows them', () => {
  const stats = playerStats(config, layout);
  const d = swingDamage(stats, gear, { pill: true, battleBonusPercent: 70, militaryRankPercent: 27.75 }, config);
  // ×1.2775 rank × 1.1 ammo × 1.6 pill × 1.7 bonus = ×3.822; 99% precision, 44% crit, 244% crit damage.
  assert.ok(Math.abs(d.base / d.attack - 3.822) < 0.001);
  assert.ok(Math.abs(d.expected / d.base - 2.0582) < 0.0005);
});

test('an 8 h window: health, armor, dodge and food give the hits', () => {
  const market = { itemPrices: { lightAmmo: 0.2, cookedFish: 8.3, cocain: 35, case1: 3.9, case2: 24, scraps: 0.24 } };
  const f = fight({ market, config, stats: playerStats(config, layout), gear, food: 'cookedFish', opts: { pill: true, battleBonusPercent: 70, militaryRankPercent: 21.5, hours: 8 } });
  assert.equal(f.armor, 67);
  assert.equal(f.dodge, 52);
  assert.equal(Math.round(f.foodEaten), 16);
  assert.ok(Math.abs(f.swings - 473.5) < 1, `swings ${f.swings}`);
});

/** A small market: chest/pants armor rolls at rising prices, so breakpoints matter. */
function smallMarket() {
  const rolls = [];
  for (let a = 1; a <= 30; a++) rolls.push({ code: 'chest4', skills: { armor: a }, averagePrice: 10 + a * 2 });
  for (let a = 1; a <= 30; a++) rolls.push({ code: 'pants4', skills: { armor: a }, averagePrice: 10 + a * 2 });
  for (let d = 1; d <= 25; d++) rolls.push({ code: 'boots4', skills: { dodge: d }, averagePrice: 10 + d * 2 });
  rolls.push({ code: 'rifle', skills: { attack: 80, criticalChance: 12 }, averagePrice: 15 });
  rolls.push({ code: 'helmet4', skills: { criticalDamages: 80 }, averagePrice: 40 });
  rolls.push({ code: 'gloves4', skills: { precision: 20 }, averagePrice: 40 });
  return buildMarket(config, { lightAmmo: 0.2, cookedFish: 8.3, cocain: 35, case1: 3.9, case2: 24, scraps: 0.24 }, rolls);
}

test('the optimizer only buys armor and dodge up to a breakpoint', () => {
  const market = smallMarket();
  const prep = prepare(market);
  const player = { level: 32, militaryRankPercent: 20, prestige: {} };
  for (const limit of [20, 60, 150, Infinity]) {
    const b = strongest(prep, layout, player, { pill: true, battleBonusPercent: 70, hours: 8 }, { bounty: 0.1 }, limit);
    const armor = 30 + (b.gear.chest?.skills.armor ?? 0) + (b.gear.pants?.skills.armor ?? 0);
    const dodge = 20 + (b.gear.boots?.skills.dodge ?? 0);
    // One point less would drop a whole percent (unless no armor/dodge gear is worn at all).
    if (b.gear.chest || b.gear.pants) assert.ok(softCapPercent(armor - 1) < softCapPercent(armor), `armor ${armor} isn't a breakpoint`);
    if (b.gear.boots) assert.ok(softCapPercent(dodge - 1) < softCapPercent(dodge), `dodge ${dodge} isn't a breakpoint`);
    assert.ok(b.net >= -limit - 1e-6, `net ${b.net} below −${limit}`);
  }
});

test('cheapest reaches its target, and more damage costs more', () => {
  const prep = prepare(smallMarket());
  const player = { level: 32, militaryRankPercent: 20, prestige: {} };
  const opts = { pill: true, battleBonusPercent: 70, hours: 8 };
  const low = cheapest(prep, layout, player, opts, 200e3);
  const high = cheapest(prep, layout, player, opts, 500e3);
  assert.ok(low.reachedTarget && high.reachedTarget);
  assert.ok(Math.abs(low.damage - 200e3) < 1 && Math.abs(high.damage - 500e3) < 1);
  assert.ok(high.cost > low.cost);
});
