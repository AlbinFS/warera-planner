/**
 * Eco page state: the player's companies and their employees (both from the
 * API) and eco settings (kept in this browser).
 */
import { cached, cachedBatch, getApiKey, forget } from './warera.js';

const SETTINGS_KEY = 'eco.settings.v2';
// Employees used to be typed in and kept here; they come from the game now.
try { localStorage.removeItem('eco.employees.v2'); } catch {}

const load = (key, fallback) => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') }; } catch { return { ...fallback }; }
};

// v1 had self-work off and trainings typed in (0); both now default to what the game says.
try {
  const v1 = localStorage.getItem('eco.settings.v1');
  if (v1 && !localStorage.getItem(SETTINGS_KEY)) {
    const { selfWork, trainingsPerDay, ...rest } = JSON.parse(v1);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
  }
  localStorage.removeItem('eco.settings.v1');
} catch {}

export const ecoSettings = $state(load(SETTINGS_KEY, {
  pointValue: null, // null: the game's value (eco.js GAME_POINT_VALUE)
  selfWork: true,
  trainingsPerDay: null, // null: from the employees (eco.js trainingsFromEmployees)
  budgetMode: 'keepFight', // keepFight | all | custom
  customBudget: 0,
  extraCompanies: 0, // companies you'd build, to see what a higher Companies skill would earn
}));

export const ecoEmployees = $state({}); // companyId → [employee]
// Tools in the inventory, typed in (the API keeps inventories from API keys): [{ id, code, percent }].
const SPARE_TOOLS_KEY = 'eco.spareTools.v1';
export const spareTools = $state(load(SPARE_TOOLS_KEY, { list: [] }));
// Why the employees couldn't be loaded, if they couldn't ('' when they were).
export const employeesStatus = $state({ error: '' });
// Bumped when the visitor adds or removes their API key, so the Eco page loads again.
export const apiKeyState = $state({ version: 0 });

$effect.root(() => {
  $effect(() => { const s = JSON.stringify(ecoSettings); try { localStorage.setItem(SETTINGS_KEY, s); } catch {} });
  $effect(() => { const s = JSON.stringify(spareTools); try { localStorage.setItem(SPARE_TOOLS_KEY, s); } catch {} });
});

/** The player's companies: good, upgrade levels, region, whether switched off. */
export async function loadCompanies(playerId, { fresh = false } = {}) {
  // Refresh: what the game has now, not what was kept from a few minutes ago.
  if (fresh) forget('company.getCompanies', 'company.getById', 'manager.getByCompanyId', 'employee.getCompanyEmployees');
  const list = await cached('company.getCompanies', { userId: playerId, perPage: 100 }, 5 * 60 * 1000);
  const ids = (list.items ?? []).map((c) => (typeof c === 'string' ? c : c._id)).filter(Boolean);
  const [companies, managers] = await Promise.all([
    Promise.all(ids.map((companyId) => cached('company.getById', { companyId }, 5 * 60 * 1000))),
    // Each company's hired manager, if any (public): their pay and bonus.
    cachedBatch(ids.map((companyId) => ['manager.getByCompanyId', { companyId }]), 5 * 60 * 1000).catch(() => ids.map(() => null)),
    loadEmployees(ids, fresh).then(
      () => { employeesStatus.error = ''; },
      (err) => { employeesStatus.error = `Couldn't load your employees from the game (${err.message}); income is counted without them.`; },
    ),
  ]);
  return companies.map((c, i) => ({
    id: c._id,
    name: c.name,
    good: c.itemCode,
    region: c.region,
    engine: c.activeUpgradeLevels?.automatedEngine ?? 0,
    breakRoom: c.activeUpgradeLevels?.breakRoom ?? 1,
    storage: c.activeUpgradeLevels?.storage ?? 1,
    stock: c.production ?? 0,
    disabled: c.disabledAt != null,
    // Storage full (production stopped) and moves that cost nothing, as the game has them.
    isFull: !!c.isFull,
    freeMoves: c.freeMoves ?? 0,
    manager: managerOf(managers[i]),
  }));
}

/** A hired manager as the models need them: pay a day, bonus, Management level. */
function managerOf(m) {
  if (!m) return null;
  return { wageDay: m.isInactive ? 0 : (m.hourlyWage ?? 0) * 24, bonusPercent: m.productionBonusPercent ?? 0, level: m.managementLevel ?? 0, rate: m.rateManagement ?? 0, unpaidHours: m.unpaidHours ?? 0, inactive: !!m.isInactive };
}

/** "incomeTax" → "Income tax": the API's codes as words. */
export const words = (code) => String(code ?? '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (_, c) => ` ${c.toLowerCase()}`);

/**
 * Employees from the game (the API only shares them with a key): with the
 * visitor's own key straight from this browser, like every other call; without
 * one, through the site with its key. The model reads what the game's card
 * shows: production, bonus % (Management included) and payroll per day (the
 * API's wage is per hour); the rest is shown on the Employees tab.
 */
async function loadEmployees(ids, fresh = false) {
  if (getApiKey()) {
    const pages = await cachedBatch(ids.map((companyId) => ['employee.getCompanyEmployees', { companyId }]), 60 * 1000);
    ids.forEach((id, i) => {
      if (Array.isArray(pages[i])) ecoEmployees[id] = pages[i].map(fromGame);
    });
    return;
  }
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const res = await fetch(`/api/company-employees?ids=${chunk.join(',')}${fresh ? '&fresh=1' : ''}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    for (const id of chunk) {
      if (Array.isArray(body.companies?.[id])) ecoEmployees[id] = body.companies[id].map(fromGame);
    }
  }
}

const stat = (e, k) => ({
  total: e.breakdown?.[k]?.total ?? (e.base?.[k] ?? 0) + (e.trained?.[k] ?? 0),
  trained: e.trained?.[k] ?? 0,
  revealed: e.revealed?.[k] !== false,
});

function fromGame(e) {
  return {
    id: e._id,
    name: e.name ?? '',
    production: stat(e, 'production').total,
    bonusPercent: Math.round((e.productionBonus?.total ?? 0) * 100) / 100,
    payroll: Math.round((e.wage ?? 0) * 24 * 1000) / 1000,
    age: e.age,
    gender: e.gender ?? null,
    nationality: e.nationality ?? null,
    hasTool: !!e.toolItem,
    tool: e.toolItem ? { id: e.toolItem._id, code: e.toolItem.code, percent: e.toolStatus?.bonusPercent ?? e.toolItem.skills?.production ?? 0, state: e.toolItem.state } : null,
    // Wage = fair wage × (base + trained Production) × this.
    wageExpectation: e.wageExpectation ?? null,
    // Base + trained Production (what the wage is set on). The API's own `base` now already includes
    // the trained points (2026-10-28); its breakdown still has them apart.
    ownProduction: e.breakdown?.production ? (e.breakdown.production.base ?? 0) + (e.breakdown.production.trained ?? 0) : (e.base?.production ?? 0),
    stats: { production: stat(e, 'production'), luck: stat(e, 'luck'), responsibility: stat(e, 'responsibility') },
    bonus: (e.productionBonus?.contributions ?? []).map((c) => ({ source: c.source, percent: c.percent })),
    happiness: {
      value: e.happinessBreakdown?.value ?? null,
      quitChance: e.happinessBreakdown?.quitChance ?? 0,
      reasons: (e.happinessBreakdown?.contributions ?? []).filter((c) => c.revealed !== false).map((c) => ({ reason: c.reason, delta: c.delta, until: c.until ?? null })),
    },
    traits: (e.traits ?? []).map((t) => (t.revealed === false ? null : t.code)),
    // What a trait is about, where it names something (Specialist's good, Diamond's stat).
    traitArgs: Object.fromEntries((e.traits ?? []).filter((t) => t.revealed !== false && t.arg).map((t) => [t.code, t.arg])),
    potential: e.potential ?? null,
    potentialMax: e.potentialMax ?? null,
    trainingsToday: e.trainingsToday ?? 0,
    lastTrainedAt: e.lastTrainedAt ?? null,
    trainingsPerDay: e.trainingsPerDay ?? 0,
    specializations: e.specializations ?? {},
    retireAt: e.retireAskAt ?? null,
    hiredAt: e.createdAt ?? null,
  };
}
