/**
 * The combat model and optimizer (src/combat) against numbers from the game:
 * the armor and dodge breakpoint tables, and a known build's damage and hits.
 * A small game config is built here, so the tests need no data files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { softCapPercent, breakpoint, playerStats, swingDamage, fight, needsAmmo, wearPerSwing } from '../src/combat/model.js';
import { prepare, strongest, cheapest, phasesFor, layoutSpace, bestNet, bestLayoutAsync } from '../src/combat/optimize.js';
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

test('a gun always comes with ammo; without it the gun can’t fight', () => {
  const prep = prepare(smallMarket());
  const player = { level: 32, militaryRankPercent: 20, prestige: {} };
  const opts = { pill: true, battleBonusPercent: 70, hours: 8 };
  for (const target of [100e3, 300e3, 600e3]) {
    const b = cheapest(prep, layout, player, opts, target);
    if (needsAmmo(b.gear)) assert.ok(b.gear.ammo, `${b.gear.weapon.code} without ammo at ${target}`);
  }
  const noAmmo = fight({ market: smallMarket(), config: { items: smallMarket().gameConfigItems }, stats: playerStats({ skills: config.skills }, layout), gear: { ...gear, ammo: null }, food: null, opts });
  assert.equal(noAmmo, null);
});

test('armor wears only on hits taken: dodge spares it, the weapon wears every swing', () => {
  const market = smallMarket();
  const cfg = { items: market.gameConfigItems };
  const opts = { pill: true, battleBonusPercent: 70, hours: 8 };
  const stats = playerStats({ skills: config.skills }, layout);
  const noArmor = { ...gear, helmet: null, chest: null, pants: null, boots: null, gloves: null };
  const withArmor = fight({ market, config: cfg, stats, gear, food: null, opts });
  const bare = fight({ market, config: cfg, stats, gear: noArmor, food: null, opts });
  // Armor's share of the cost per swing: its wear per hit taken (1 per 100, net of scrap) × the share not dodged.
  const perSwing = (withArmor.parts.wear - bare.parts.wear * (withArmor.swings / bare.swings)) / withArmor.swings;
  const armorWear = ['helmet', 'chest', 'pants', 'boots', 'gloves'].reduce((t, s) => t + wearPerSwing(market, cfg, s, gear[s]), 0);
  assert.ok(Math.abs(perSwing - armorWear * (1 - withArmor.dodge / 100)) < 1e-9, `${perSwing} vs ${armorWear * (1 - withArmor.dodge / 100)}`);
});

test('a second build for the debuff never does worse than one build all day, and buys the pill once', () => {
  const prep = prepare(smallMarket());
  const player = { level: 32, militaryRankPercent: 20, prestige: {} };
  const one = { pill: true, battleBonusPercent: 70, hours: 16 };
  const two = { ...one, splitDebuff: true };
  for (const limit of [60, 150, Infinity]) {
    const a = strongest(prep, layout, player, one, { bounty: 0.1 }, limit);
    const b = strongest(prep, layout, player, two, { bounty: 0.1 }, limit);
    assert.ok(b.damage >= a.damage * 0.995, `split ${b.damage} < single ${a.damage} at ${limit}`);
    assert.ok(b.net >= -limit - 1e-6);
  }
  const b = strongest(prep, layout, player, two);
  const pillOnly = strongest(prep, layout, player, { ...two, phase: 'pill' });
  const debuffOnly = strongest(prep, layout, player, { ...two, phase: 'debuff' });
  // The pill (35) is in the pill build's cost only.
  assert.ok(pillOnly.cost - 35 < pillOnly.cost && debuffOnly.cost < pillOnly.cost);
  assert.ok(b.debuff && b.phases.length === 2 && Math.abs(b.damage - pillOnly.damage - debuffOnly.damage) < b.damage * 0.01);
  const target = cheapest(prep, layout, player, two, b.damage * 0.8);
  assert.ok(target.reachedTarget && target.damage >= b.damage * 0.8 - 1);
});

test('two builds under a limit used to the last gold: no rounding failure, net within it', () => {
  const prep = prepare(smallMarket());
  const player = { level: 32, militaryRankPercent: 20, prestige: {} };
  for (const hours of [16, 24]) for (const bounty of [0, 0.08, 0.1]) for (let limit = 0; limit <= 300; limit += 7.5) {
    const b = strongest(prep, layout, player, { pill: true, battleBonusPercent: 70, hours, splitDebuff: true }, { bounty }, limit);
    if (b) assert.ok(b.net >= -limit - 1e-6, `net ${b.net} below −${limit}`);
  }
});

test('the debuff lasts its own 15.5 h: a full day ends at full strength, and no food is lost to rounding', () => {
  const cfg = { ...config, items: { ...config.items, cocain: { flatStats: { percentAttack: 60, buffDurationHours: 8, debuffDurationHours: 15.5 } } } };
  const stats = playerStats(cfg, layout);
  const phases = phasesFor(cfg, stats, 'cookedFish', { pill: true, hours: 24 });
  assert.deepEqual(phases.map((p) => [p.multiplier, p.hours]), [[1.6, 8], [0.4, 15.5], [1, 0.5]]);
  // The whole day's food, as one 24 h window counts it: the full bar plus 2.4 bars of regen.
  assert.equal(phases.reduce((t, p) => t + p.foodMax, 0), Math.floor(stats.hunger * 3.4 + 1e-9));
  // 16 h: the debuff runs to the end.
  assert.deepEqual(phasesFor(cfg, stats, null, { pill: true, hours: 16 }).map((p) => p.multiplier), [1.6, 0.4]);
});

test('skill search starts: economy skills zeroed in the first, the same random starts every run', () => {
  const skills = { ...config.skills, production: table(30, 3), energy: table(100, 10) };
  const start = { ...layout, production: 8, energy: 8 };
  const args = { start, searched: [...Object.keys(layout), 'production', 'energy'], budget: 200, playerLevel: 40, zeroed: ['production', 'energy'] };
  const a = layoutSpace({ skills }, args);
  const b = layoutSpace({ skills }, args);
  assert.equal(a.starts[0].production, 0);
  assert.equal(a.starts[0].energy, 0);
  assert.equal(a.starts[0].attack, layout.attack);
  assert.equal(a.starts.length, 7);
  assert.deepEqual(a.starts, b.starts);
  for (const s of a.starts) assert.ok(a.fits(s));
});

test('screening neighbours with a rough score that ranks alike finds the same layout, scoring far fewer exactly', async () => {
  const skills = Object.fromEntries(Object.keys(layout).map((s) => [s, table(0, 1)]));
  // A made-up damage with diminishing returns and a few skills that pay more.
  const weight = { attack: 5, precision: 3, criticalChance: 3, criticalDamages: 2, armor: 2, dodge: 2, health: 2, lootChance: 1, hunger: 1 };
  const damage = (l) => Object.entries(weight).reduce((t, [s, w]) => t + w * Math.sqrt(l[s] ?? 0), 0);
  const exact = async (ls) => ls.map((l) => ({ damage: damage(l), net: 0 }));
  const rough = async (ls) => ls.map((l) => ({ damage: damage(l) * 0.8 + 1, net: 0 }));
  const args = { start: layout, budget: 80, playerLevel: 40 };
  const plain = await bestLayoutAsync({ skills }, { ...args, scoreMany: exact });
  const screened = await bestLayoutAsync({ skills }, { ...args, scoreMany: exact, scoreQuick: rough, screen: 6 });
  assert.equal(screened.best.damage, plain.best.damage);
  assert.ok(screened.checked < plain.checked / 2, `${screened.checked} vs ${plain.checked}`);
});

test('economy placed by points: fight skills climbed per economy step, the best kept', async () => {
  const { bestLayoutEconomy } = await import('../src/combat/optimize.js');
  const skills = { ...Object.fromEntries(Object.keys(layout).map((s) => [s, table(0, 1)])), companies: table(0, 1) };
  const weight = { attack: 5, precision: 3, criticalChance: 3, criticalDamages: 2, armor: 2, dodge: 2, health: 2, lootChance: 1, hunger: 1 };
  // Damage from fight skills; companies only help through gold: up to 2 levels lift the damage a lot.
  const score = async (ls) => ls.map((l) => ({ damage: Object.entries(weight).reduce((t, [s, w]) => t + w * Math.sqrt(l[s] ?? 0), 0) + 6 * Math.min(2, l.companies ?? 0), net: 0 }));
  const steps = [0, 1, 2, 3].map((n) => ({ levels: { companies: n }, points: (n * (n + 1)) / 2 }));
  const r = await bestLayoutEconomy({ skills }, { start: { ...layout, companies: 4 }, searched: [...Object.keys(layout), 'companies'], budget: 60, playerLevel: 40, economy: { skills: ['companies'], steps }, scoreMany: score });
  assert.equal(r.levels.companies, 2);
  assert.ok(r.used <= 60);
});

test('a layout no build keeps within the limit is told how far off it is', () => {
  const prep = prepare(smallMarket());
  const player = { level: 32, militaryRankPercent: 20, prestige: {} };
  const opts = { pill: true, battleBonusPercent: 70, hours: 8 };
  const best = bestNet(prep, layout, player, opts, { bounty: 0.1 });
  // Just inside the best net: a build exists; just outside: none.
  assert.ok(strongest(prep, layout, player, opts, { bounty: 0.1 }, -best + 0.01));
  assert.equal(strongest(prep, layout, player, opts, { bounty: 0.1 }, -best - 0.01), null);
});

test('the simulator stops the debuff build at its planned hits', async () => {
  const { simulate } = await import('../src/combat/simulate.js');
  const market = smallMarket();
  const g = { weapon: { code: 'rifle', skills: { attack: 80, criticalChance: 12 } }, ammo: 'lightAmmo', helmet: null, chest: null, pants: null, boots: null, gloves: null };
  const build = { levels: layout, prestige: {}, militaryRankPercent: 20, gear: g, food: null, debuff: { gear: g, food: null, hits: 25 } };
  const capped = simulate(market, build, { pill: true, hours: 16 }, { runs: 50 });
  const all = simulate(market, { ...build, debuff: { ...build.debuff, hits: null } }, { pill: true, hours: 16 }, { runs: 50 });
  // At most the 25 planned (a run can run out of health first).
  assert.ok(capped.byPhase[1].swings <= 25 && capped.byPhase[1].swings > 24);
  assert.ok(all.byPhase[1].swings > 25);
  // The pill hours are fought the same (the dice differ once the debuff hits do).
  assert.ok(Math.abs(capped.byPhase[0].swings - all.byPhase[0].swings) < all.byPhase[0].swings * 0.03);
});

test('a share link keeps the debuff build, and old links still read', async () => {
  globalThis.location ??= { origin: 'http://x' };
  const { pack, unpack } = await import('../src/lib/share.js');
  const gear = { weapon: { code: 'rifle', skills: { attack: 80, criticalChance: 12 } }, ammo: 'lightAmmo', helmet: null, chest: null, pants: null, boots: null, gloves: null };
  const debuffGear = { ...gear, weapon: { code: 'knife', skills: { attack: 40, criticalChance: 4 } }, ammo: null };
  const planner = { player: { level: 30, militaryRankPercent: 10, prestige: {} }, skills: { attack: 5 }, gear, food: 'cookedFish', debuff: { gear: debuffGear, food: 'steak' } };
  const settings = { pill: true, battleBonus: 70, windowHours: 16, splitDebuff: true };
  const back = unpack(JSON.parse(JSON.stringify(pack(planner, settings))));
  assert.equal(back.debuff.gear.weapon.code, 'knife');
  assert.equal(back.debuff.food, 'steak');
  assert.equal(back.settings.splitDebuff, true);
  assert.equal(back.debuff.hits, null);
  assert.equal(unpack(JSON.parse(JSON.stringify(pack({ ...planner, debuff: { ...planner.debuff, hits: 120 } }, settings)))).debuff.hits, 120);
  // A link from before the debuff build: no ninth element.
  const old = pack({ ...planner, debuff: null }, settings).slice(0, 8);
  assert.equal(unpack(old).debuff, null);
});
