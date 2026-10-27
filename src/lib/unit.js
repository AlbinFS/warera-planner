/**
 * Military unit planning from public data: every member's damage available
 * right now (live health and hunger bars, worn gear, pill state), a cautious
 * "reached 95% of the time" figure from simulating their luck, and the unit's
 * mercenary contracts with their minimum damage.
 */
import { cached, cachedBatch } from './warera.js';
import { skillValue, ALL_SKILLS, SLOTS } from '../engine/inputs.js';
import { prepare, strongest } from '../combat/optimize.js';
import { lockedGear } from './compute.js';

// Simulated fights per member; the 5th percentile is "reached 95% of the time".
const SIMULATIONS = 2000;
const QUANTILE = 0.05;

/** A unit by id, or the unit of a player. */
export const loadUnitById = (muId) => cached('mu.getById', { muId }, 10 * 60 * 1000);

export async function searchUnits(text) {
  const r = await cached('mu.getManyPaginated', { search: text, limit: 10 });
  return r.items ?? [];
}

/** Members with their live profile and worn gear, in one batched request. */
export async function loadMembers(unit) {
  const ids = unit.members ?? [];
  const results = await cachedBatch([
    ...ids.map((userId) => ['user.getUserById', { userId }]),
    ...ids.map((userId) => ['inventory.fetchCurrentEquipment', { userId }]),
  ]);
  return ids.map((_, i) => ({ user: results[i], equipment: results[ids.length + i] })).filter((m) => m.user);
}

/**
 * The unit's mercenary contracts (won, or currently led in the auction), from
 * this site's contract index, each marked with whether its battle still runs.
 */
export async function loadContracts(unitId) {
  const res = await fetch(`/api/contracts?mu=${encodeURIComponent(unitId)}`);
  if (!res.ok) throw new Error('Contracts are unavailable right now.');
  const { items } = await res.json();
  const battleIds = [...new Set(items.map((c) => c.battle).filter(Boolean))];
  const battles = await cachedBatch(battleIds.map((battleId) => ['battle.getById', { battleId }]), 5 * 60 * 1000).catch(() => []);
  const running = new Map(battleIds.map((id, i) => [id, battles[i]?.isActive ?? null]));
  // Progress of won contracts with a recorded start: the unit's battle damage on that side since then.
  const tracked = items.filter((c) => c.status === 'won' && c.startDamage != null && running.get(c.battle) !== false);
  const sides = [...new Map(tracked.map((c) => [`${c.battle}|${c.forCountrySide}`, c])).values()];
  const pages = await cachedBatch(sides.map((c) => ['battleRanking.getRanking', { battleId: c.battle, side: c.forCountrySide, dataType: 'damage', type: 'mu', limit: 100 }]), 60 * 1000).catch(() => []);
  const unitDamage = new Map(sides.map((c, i) => [`${c.battle}|${c.forCountrySide}`, pages[i]?.items?.find((x) => x.mu === unitId)?.value ?? null]));
  return items.map((c) => {
    const now = unitDamage.get(`${c.battle}|${c.forCountrySide}`);
    return { ...c, battleActive: running.get(c.battle) ?? null, done: c.startDamage != null && now != null ? Math.max(0, now - c.startDamage) : null };
  }).sort((a, b) => (b.battleActive === true) - (a.battleActive === true) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Pill state from the attack skill: +60% while on the pill, a debuff after. */
export function pillState(user) {
  const a = user.skills?.attack ?? {};
  if (a.buffsPercent > 0) return { kind: 'buff', multiplier: 1 + a.buffsPercent / 100, label: `Pill +${a.buffsPercent}%` };
  if (a.debuffsPercent > 0) return { kind: 'debuff', multiplier: 1 - a.debuffsPercent / 100, label: `Pill debuff −${a.debuffsPercent}%` };
  return { kind: 'none', multiplier: 1, label: '' };
}

const gearOf = (equipment) => Object.fromEntries(SLOTS.map((slot) => {
  const it = equipment?.[slot];
  if (!it) return [slot, null];
  return [slot, typeof it === 'string' ? it : { code: it.code, skills: { ...it.skills } }];
}));

/**
 * Damage a member can do now: the optimizer's strongest result for their worn
 * gear (food chosen for them unless fixed) with their current bars as one
 * fight. Also the inputs the luck simulation needs.
 */
export async function memberDamage(market, member, settings) {
  const { user, equipment } = member;
  const levels = Object.fromEntries(ALL_SKILLS.map((s) => [s, user.skills?.[s]?.level ?? 0]));
  const prestige = Object.fromEntries(ALL_SKILLS.map((s) => [s, user.skills?.[s]?.prestige ?? 0]));
  const pill = pillState(user);
  const health = Math.max(0, user.skills?.health?.currentBarValue ?? 0);
  const foodCount = Math.max(0, Math.floor(user.skills?.hunger?.currentBarValue ?? 0));
  const gear = gearOf(equipment);
  const base = { pill, health, foodCount, food: null, gear, levels };
  if (health <= 0 && foodCount < 1) return { ...base, damage: 0, perAttempt: 0, attempts: 0 };

  // Their worn gear, their current bars as one fight, at their pill state; food chosen unless fixed.
  const worn = { ...gear, ammo: typeof gear.ammo === 'string' ? gear.ammo : gear.ammo?.code ?? null };
  const prep = prepare(market, { locked: lockedGear(market, worn), lockedFood: settings.food === 'any' ? undefined : settings.food });
  const player = { level: user.leveling?.level ?? 1, militaryRankPercent: user.skills?.attack?.militaryRankPercent ?? 0, prestige };
  const opts = { battleBonusPercent: Number(settings.battleBonus) || 0, supply: { health, foodMax: foodCount }, multiplier: pill.multiplier };
  const r = strongest(prep, levels, player, opts);
  if (!r && worn.weapon?.code && worn.weapon.code !== 'knife' && !worn.ammo) return { ...base, damage: 0, perAttempt: 0, attempts: 0, error: 'Their gun has no ammo.' };
  if (!r) return { ...base, damage: 0, perAttempt: 0, attempts: 0, error: 'Their gear can’t fight.' };

  const multiplier = pill.multiplier * (1 + opts.battleBonusPercent / 100);
  // r.perSwing is per swing before the pill (its phase applies it); the simulation wants it before the bonus too.
  const perAttempt = r.perSwing / (1 + opts.battleBonusPercent / 100);
  const value = (s) => skillValue(market.gameConfigSkills[s], levels[s], prestige[s]);
  const statSum = (stat) => Object.values(gear).reduce((sum, g) => sum + (g && typeof g === 'object' ? g.skills?.[stat] ?? 0 : 0), 0);
  return {
    ...base,
    food: r.food ?? 'none',
    damage: r.damage,
    perAttempt,
    multiplier,
    attempts: r.swings,
    precision: Math.min(100, value('precision') + statSum('precision')) / 100,
    critChance: Math.min(100, value('criticalChance') + statSum('criticalChance')) / 100,
    critDamage: value('criticalDamages') + statSum('criticalDamages'),
    // Dodge as the game applies it: a whole percent from value / (value + soft cap).
    dodge: r.dodge / 100,
    armor: r.armor / 100,
  };
}

/**
 * Simulated totals for one member's fight. Each attack misses (half damage)
 * with chance 1 − precision, else hits, critting with the crit chance for
 * extra crit damage; a dodged attack costs no health, so the health budget
 * buys a fixed number of non-dodged attacks. Average matches the optimizer.
 */
export function simulate(m, runs = SIMULATIONS) {
  const out = new Float64Array(runs);
  if (!m.attempts || !m.perAttempt) return out;
  const p = m.precision;
  const g = m.critChance;
  const critFactor = 1 + m.critDamage / 100;
  // Per-attack damage before multipliers, solved from the optimizer's average.
  const u = m.perAttempt / ((1 - p) * 0.5 + p * (1 + g * (critFactor - 1)));
  const scale = u * m.multiplier;
  const nonDodged = m.attempts * (1 - m.dodge);
  const whole = Math.floor(nonDodged);
  const fraction = nonDodged - whole;
  for (let i = 0; i < runs; i++) {
    // The health budget allows `whole` non-dodged attacks, plus one more with probability `fraction`.
    const target = whole + (Math.random() < fraction ? 1 : 0);
    let taken = 0;
    let total = 0;
    while (taken < target) {
      if (Math.random() >= m.dodge) taken++;
      total += Math.random() < p ? (Math.random() < g ? critFactor : 1) : 0.5;
    }
    out[i] = total * scale;
  }
  return out;
}

export function quantile(values, q = QUANTILE) {
  if (!values.length) return 0;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** The unit total's cautious figure: members' simulated fights added run by run. */
export function unitQuantile(simulations, q = QUANTILE) {
  if (!simulations.length) return 0;
  const runs = simulations[0].length;
  const totals = new Float64Array(runs);
  for (const s of simulations) for (let i = 0; i < runs; i++) totals[i] += s[i];
  return quantile(totals, q);
}

