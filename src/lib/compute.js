/**
 * Planner calculations on top of the engine: evaluate the planned build,
 * find cheaper/stronger alternatives, optimize gear and skills.
 */
import { getEngine } from '../engine/browser.js';
import { buildInput, debuffEquipment, skillsMarket, priceKey, SLOTS, ALL_SKILLS, ECONOMY_SKILLS } from '../engine/inputs.js';
import { cached, getApiKey } from './warera.js';

// The original page's default net job salary, used by its income model.
const DEFAULT_JOB_SALARY = 0.123;

/** A plain copy: the planner's reactive state can't be posted to a worker as it is. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * The engine setup for a planned build. `windowHours` 24 means the full-day
 * model; `skills` replaces the planned skill levels (the contract search tries many).
 */
export function setupFor(planner, settings, { locked = true, windowHours = settings.windowHours, skills = planner.skills } = {}) {
  const p = planner.player;
  return plain({
    level: p?.level ?? 1,
    militaryRankPercent: p?.militaryRankPercent ?? 0,
    skills,
    prestige: p?.prestige ?? {},
    pill: settings.pill,
    battleBonusPercent: Number(settings.battleBonus) || 0,
    windowHours: windowHours === 24 ? null : windowHours,
    // Credits counted like the original page; the gear worn now is what the pill debuff phase uses.
    dailyContext: {
      settings: { scraps: true, cases: true, income: false, dailyWeekly: false },
      incomeCredit: 0,
      rewardCredit: 0,
      debuffBuild: { equipment: debuffEquipment(p?.currentGear), foodCode: 'none' },
    },
    ...(locked
      ? { lockedEquipment: Object.fromEntries(SLOTS.map((s) => [s, planner.gear[s] ?? null])), lockedFood: planner.food }
      : { lockedFood: settings.food === 'any' ? undefined : settings.food }),
  });
}

/** A result point's cost: per window (the pill added, since the window cost leaves it out) or per day. */
export function costOf(point, market, settings) {
  if (settings.windowHours !== 24 && point.roundNetCost != null) {
    return point.roundNetCost + (settings.pill ? market.itemPrices.cocain ?? 0 : 0);
  }
  return point.dailyNetCost;
}

/** Damage and cost of the planned build, or { error } when it can't fight (e.g. a gun without ammo). */
export async function evaluateBuild(market, planner, settings) {
  const input = buildInput(market, setupFor(planner, settings));
  const reply = await getEngine().optimize({ mode: 'damage', input, target: 0, maxBudget: Infinity, graph: false });
  const r = reply.result;
  if (!r) return { error: reasonText(reply.reason) };
  const point = r.selectedDamageCostPoint;
  return {
    damage: point.damagePerDay,
    cost: costOf(point, market, settings),
    build: r.build,
  };
}

/**
 * Cheaper build with the same damage and stronger build for the same cost.
 * Each is null when the planned build is already best.
 *
 * The hints worker only knows the full-day model, so it is used for that
 * setting; for a fight window the main optimizer answers instead, which
 * handles the window exactly.
 */
export async function findHints(market, planner, settings, evaluated) {
  const input = buildInput(market, setupFor(planner, settings, { locked: false }));
  if (settings.windowHours !== 24) return windowHints(market, settings, input, evaluated);
  const points = await getEngine().hints(input, plain({ equipment: evaluated.build.equipment, foodCode: evaluated.build.foodCode }));
  let cheaper = null;
  let stronger = null;
  for (const p of points) {
    const option = { damage: p.damagePerDay, cost: costOf(p, market, settings), equipment: p.equipment, food: p.foodCode };
    if (option.damage >= evaluated.damage * 0.999 && option.cost < evaluated.cost - 0.05 && (!cheaper || option.cost < cheaper.cost)) cheaper = option;
    if (option.damage > evaluated.damage * 1.001 && option.cost <= evaluated.cost + 0.05 && (!stronger || option.damage > stronger.damage)) stronger = option;
  }
  return { cheaper, stronger };
}

/**
 * Where the cost goes, and how many hits that buys.
 *
 * Costs come from price probes: the cost is linear in every price, so
 * evaluating the same build with one price doubled changes the cost by
 * exactly that item's share. (A zero price can't be used: it counts as a
 * missing price.) The shares add up to the total; anything left over (e.g.
 * daily credits) is reported as "other".
 *
 * Hits: damage ÷ (damage per attack × pill × battle bonus), exact for one
 * phase. For a full day on the pill that is the pill phase only; the debuff
 * phase after it isn't counted.
 */
export async function costBreakdown(market, planner, settings, evaluated) {
  const engine = getEngine();
  const setup = setupFor(planner, settings);
  const run = async (m, s = setup) => {
    const r = (await engine.optimize({ mode: 'damage', input: buildInput(m, s), target: 0, maxBudget: Infinity, graph: false })).result;
    return r ? { cost: costOf(r.selectedDamageCostPoint, m, settings), damage: r.selectedDamageCostPoint.damagePerDay, perAttack: r.optimizedDamage } : null;
  };
  const base = await run(market);
  if (!base) return null;

  const probes = [];
  // Gear worn, and in the full-day model the gear worn during the pill debuff.
  const worn = [['planned', setup.lockedEquipment], ['debuff', setup.windowHours ? null : setup.dailyContext?.debuffBuild?.equipment]];
  const seen = new Set();
  for (const [phase, gear] of worn) {
    for (const [slot, item] of Object.entries(gear ?? {})) {
      if (!item) continue;
      if (typeof item === 'string') {
        if (seen.has(item)) continue;
        seen.add(item);
        probes.push({ kind: 'item', code: item, slot, phase });
        continue;
      }
      const key = priceKey(item.code, item.skills);
      if (seen.has(key) || !Number.isFinite(market.equipmentPrices[key])) continue;
      seen.add(key);
      probes.push({ kind: 'roll', key, code: item.code, skills: item.skills, slot, phase });
    }
  }
  if (setup.lockedFood && setup.lockedFood !== 'none' && !seen.has(setup.lockedFood)) probes.push({ kind: 'item', code: setup.lockedFood, slot: 'food' });
  if (settings.pill) probes.push({ kind: 'item', code: 'cocain', slot: 'pill' });
  probes.push({ kind: 'item', code: 'scraps', slot: 'scraps' });
  for (const [code, item] of Object.entries(market.gameConfigItems)) {
    if (item.type === 'case' && Number.isFinite(market.itemPrices[code])) probes.push({ kind: 'item', code, slot: 'case' });
  }

  const doubled = (p) => (p.kind === 'roll'
    ? { ...market, equipmentPrices: { ...market.equipmentPrices, [p.key]: 2 * market.equipmentPrices[p.key] } }
    : { ...market, itemPrices: { ...market.itemPrices, [p.code]: 2 * market.itemPrices[p.code] } });
  const shares = await Promise.all(probes.map(async (p) => {
    const r = await run(doubled(p));
    return r ? { ...p, amount: r.cost - base.cost } : null;
  }));
  const rows = shares.filter((s) => s && Math.abs(s.amount) >= 0.005);
  const other = base.cost - rows.reduce((sum, r) => sum + r.amount, 0);

  // Hits for the planned gear's phase (a window, or the pill phase of a day).
  let phaseDamage = base.damage;
  if (!setup.windowHours && settings.pill) {
    const buffOnly = await run(market, { ...setup, dailyContext: undefined });
    phaseDamage = buffOnly?.damage ?? NaN;
  }
  const multiplier = (settings.pill ? 1 + (market.gameConfigItems.cocain?.flatStats?.percentAttack ?? 60) / 100 : 1) * (1 + (Number(settings.battleBonus) || 0) / 100);
  const hits = base.perAttack > 0 ? phaseDamage / (base.perAttack * multiplier) : null;
  const food = rows.find((r) => r.slot === 'food');
  const cases = rows.filter((r) => r.slot === 'case').map((r) => ({ code: r.code, count: -r.amount / market.itemPrices[r.code] }));

  return {
    total: base.cost,
    rows,
    other: Math.abs(other) >= 0.05 ? other : 0,
    hits,
    hitsArePillPhase: !setup.windowHours && settings.pill,
    perAttack: base.perAttack * multiplier,
    foodEaten: food ? food.amount / market.itemPrices[food.code] : 0,
    cases,
  };
}

// Stronger-for-the-same-cost search: stop when the damage bracket is this tight.
const BISECT_PRECISION = 1.005;

/**
 * Window hints from the main optimizer: the cheapest build reaching the
 * planned damage, and (by bisection on the damage target) the strongest
 * build that costs no more than the planned one.
 */
async function windowHints(market, settings, input, evaluated) {
  const engine = getEngine();
  const at = async (target) => {
    const r = await engine.cheapestBuild(input, Math.round(target));
    if (!r) return null;
    return { damage: r.selectedDamageCostPoint.damagePerDay, cost: costOf(r.selectedDamageCostPoint, market, settings), equipment: r.build.equipment, food: r.build.foodCode };
  };
  const affordable = (o) => o && o.cost <= evaluated.cost + 0.05;

  const [same, top] = await Promise.all([at(Math.ceil(evaluated.damage)), at(1e12)]);
  const cheaper = same && same.damage >= evaluated.damage * 0.999 && same.cost < evaluated.cost - 0.05 ? same : null;

  let best = affordable(top) ? top : null;
  if (!best && top) {
    let lo = evaluated.damage;
    let hi = top.damage;
    while (hi / lo > BISECT_PRECISION) {
      const mid = Math.sqrt(lo * hi);
      const o = await at(mid);
      if (affordable(o)) { best = !best || o.damage > best.damage ? o : best; lo = Math.max(mid, o.damage); } else hi = mid;
    }
  }
  const stronger = best && best.damage > evaluated.damage * 1.001 ? best : null;
  return { cheaper, stronger };
}

/**
 * The most damage whose cheapest build costs no more than `budget` (per
 * window or per day, as the settings say): bisection on the damage target.
 */
export async function strongestWithin(market, planner, settings, budget) {
  const input = buildInput(market, setupFor(planner, settings, { locked: false }));
  const engine = getEngine();
  const at = async (target) => {
    const r = await engine.cheapestBuild(input, Math.round(target));
    if (!r) return null;
    return { damage: r.selectedDamageCostPoint.damagePerDay, cost: costOf(r.selectedDamageCostPoint, market, settings), equipment: r.build.equipment, food: r.build.foodCode, reachedTarget: true };
  };
  const [cheapest, top] = await Promise.all([at(0), at(1e12)]);
  if (!cheapest || !top) return { error: 'No build can fight with these settings.' };
  if (cheapest.cost > budget) return { error: `Even the cheapest build costs ${cheapest.cost.toFixed(1)} G.` };
  if (top.cost <= budget) return top;
  let best = cheapest;
  let lo = Math.max(1, cheapest.damage);
  let hi = top.damage;
  while (hi / lo > BISECT_PRECISION) {
    const mid = Math.sqrt(lo * hi);
    const o = await at(mid);
    if (o && o.cost <= budget) { if (o.damage > best.damage) best = o; lo = Math.max(mid, o.damage); } else hi = mid;
  }
  return best;
}

/**
 * Builds around a damage target (85–115%), cheapest per damage, so a slightly
 * lower or higher target with much better value is easy to spot.
 */
export async function buildsNear(market, planner, settings, target) {
  const input = buildInput(market, setupFor(planner, settings, { locked: false }));
  const engine = getEngine();
  // A damage run with the curve on returns the frontier from its target upward.
  const [low, high] = await Promise.all([engine.damageCurve(input, Math.round(target * 0.85)), engine.damageCurve(input, Math.round(target))]);
  const points = [];
  for (const r of [low, high]) {
    for (const f of r?.foodDamageCostResults ?? []) {
      points.push({ damage: f.damagePerDay, cost: costOf(f, market, settings), equipment: f.equipment, food: f.foodCode });
    }
  }
  const inRange = points.filter((p) => Number.isFinite(p.cost) && p.damage >= target * 0.85 && p.damage <= target * 1.15);
  // Keep builds no other beats on both damage and cost, one per damage level.
  const sorted = inRange.sort((a, b) => b.damage - a.damage || a.cost - b.cost);
  const kept = [];
  let cheapest = Infinity;
  for (const p of sorted) if (p.cost < cheapest - 0.05) { kept.push(p); cheapest = p.cost; }
  return kept.reverse().map((p) => ({ ...p, per1k: (p.cost / p.damage) * 1000 }));
}

/** Cheapest gear (and food, unless fixed in settings) reaching a damage target. */
export async function optimizeEquipment(market, planner, settings, target) {
  const input = buildInput(market, setupFor(planner, settings, { locked: false }));
  const reply = await getEngine().optimize({ mode: 'damage', input, target: Math.round(target), maxBudget: Infinity, graph: false });
  if (!reply.result) return { error: reasonText(reply.reason) };
  const r = reply.result;
  return {
    damage: r.selectedDamageCostPoint.damagePerDay,
    cost: costOf(r.selectedDamageCostPoint, market, settings),
    reachedTarget: r.reachedTarget,
    equipment: r.build.equipment,
    food: r.build.foodCode,
  };
}

/** The player's companies in the shape the skill optimizer's income model expects. */
export async function loadEconomy(playerId, itemPrices) {
  const list = await cached('company.getCompanies', { userId: playerId, perPage: 100 });
  const ids = (list.items ?? []).map((c) => (typeof c === 'string' ? c : c._id)).filter(Boolean);
  const companies = await Promise.all(ids.map(async (companyId) => {
    const [company, bonus] = await Promise.all([
      cached('company.getById', { companyId }),
      cached('company.getProductionBonus', { companyId }).catch(() => null),
    ]);
    return {
      company: {
        _id: company._id,
        itemCode: company.itemCode,
        // The official API marks a switched-off company with disabledAt; the worker reads `disabled`.
        disabled: company.disabled === true || company.disabledAt != null,
        activeUpgradeLevels: { automatedEngine: company.activeUpgradeLevels?.automatedEngine ?? 0 },
      },
      productionBonus: bonus ? { total: bonus.total ?? 0 } : null,
    };
  }));
  return { netJobSalary: await jobSalary(playerId), companies, itemPrices };
}

/**
 * Net salary per unit of work: the median of the player's recent wages when
 * the visitor has added an API key (wages need one), else the original's default.
 */
async function jobSalary(playerId) {
  if (!getApiKey()) return DEFAULT_JOB_SALARY;
  try {
    const page = await cached('transaction.getPaginatedTransactions', { userId: playerId, transactionType: 'wage', limit: 20 }, 10 * 60 * 1000);
    const rates = (page.items ?? []).filter((t) => t.quantity > 0).map((t) => t.money / t.quantity).sort((a, b) => a - b);
    return rates.length ? rates[rates.length >> 1] : DEFAULT_JOB_SALARY;
  } catch {
    return DEFAULT_JOB_SALARY;
  }
}

/**
 * Skill layout search over a daily-damage range (full-day model, like the
 * original). With keepEconomy the economy skills stay as they are.
 */
export async function optimizeSkills(market, planner, settings, { min, max, keepEconomy, onProgress, signal }) {
  const p = planner.player;
  const debuffBuild = plain({ equipment: debuffEquipment(p?.currentGear), foodCode: 'none' });
  const economy = p ? await loadEconomy(p.id, market.itemPrices).catch(() => null) : null;
  const level = p?.level ?? 1;
  const request = {
    market: skillsMarket(market, debuffBuild),
    player: { level, totalSkillPoints: level * 4, militaryRankPercent: p?.militaryRankPercent ?? 0, skills: plain(planner.skills) },
    combat: { pillEnabled: settings.pill, battleBonusPercent: Number(settings.battleBonus) || 0, scraps: true, debuffBuild },
    economy: economy ?? { netJobSalary: 0, companies: [], itemPrices: market.itemPrices },
    range: { min: Math.round(min), max: Math.round(max), steps: 4 },
    locks: keepEconomy ? plain(Object.fromEntries(ECONOMY_SKILLS.map((s) => [s, planner.skills[s]]))) : {},
    resetCostPerPoint: null,
  };
  const response = await getEngine().optimizeSkills(request, { onProgress, signal });
  if (!response?.result) return { error: reasonText(response?.reason) };
  const { best, elapsedMs } = response.result;
  return { skills: Object.fromEntries(ALL_SKILLS.map((s) => [s, best.skills[s] ?? 0])), income: best.income, cost: best.meanDailyNetCost, steps: best.steps, elapsedMs, hadEconomy: !!economy };
}

function reasonText(reason) {
  if (!reason) return 'No build can do this with these settings.';
  return String(reason).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}
