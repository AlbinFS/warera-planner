/**
 * Eco page state: the player's companies and their employees (from the API;
 * employees can still be added or edited by hand, kept in this browser) and
 * eco settings.
 */
import { cached } from './warera.js';

const SETTINGS_KEY = 'eco.settings.v1';
// v2: production, bonus and payroll as the game shows them.
const EMPLOYEES_KEY = 'eco.employees.v2';

const load = (key, fallback) => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') }; } catch { return { ...fallback }; }
};

export const ecoSettings = $state(load(SETTINGS_KEY, {
  pointValue: null, // null: use the estimate from market prices
  selfWork: false,
  trainingsPerDay: 0,
  budgetMode: 'keepFight', // keepFight | all | custom
  customBudget: 0,
  minLeadership: 0,
  extraCompanies: 0, // companies you'd build, to see what a higher Companies skill would earn
}));

export const ecoEmployees = $state(load(EMPLOYEES_KEY, {})); // companyId → [employee]

$effect.root(() => {
  $effect(() => { const s = JSON.stringify(ecoSettings); try { localStorage.setItem(SETTINGS_KEY, s); } catch {} });
  $effect(() => { const s = JSON.stringify(ecoEmployees); try { localStorage.setItem(EMPLOYEES_KEY, s); } catch {} });
});

/** The player's companies: good, upgrade levels, region, whether switched off. */
export async function loadCompanies(playerId) {
  const list = await cached('company.getCompanies', { userId: playerId, perPage: 100 }, 5 * 60 * 1000);
  const ids = (list.items ?? []).map((c) => (typeof c === 'string' ? c : c._id)).filter(Boolean);
  const [companies] = await Promise.all([
    Promise.all(ids.map((companyId) => cached('company.getById', { companyId }, 5 * 60 * 1000))),
    loadEmployees(ids).catch(() => {}), // without them, the ones typed in stay
  ]);
  return companies.map((c) => ({
    id: c._id,
    name: c.name,
    good: c.itemCode,
    region: c.region,
    engine: c.activeUpgradeLevels?.automatedEngine ?? 0,
    breakRoom: c.activeUpgradeLevels?.breakRoom ?? 1,
    storage: c.activeUpgradeLevels?.storage ?? 1,
    stock: c.production ?? 0,
    disabled: c.disabledAt != null,
  }));
}

/**
 * Employees from the game, through the site (the API needs a key for them), in
 * the numbers the game's card shows: production, bonus % (Management
 * included) and payroll per day (the API's wage is per hour).
 */
async function loadEmployees(ids) {
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const res = await fetch(`/api/company-employees?ids=${chunk.join(',')}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { companies } = await res.json();
    for (const id of chunk) {
      if (!Array.isArray(companies[id])) continue;
      ecoEmployees[id] = companies[id].map((e) => ({
        name: e.name ?? '',
        production: e.breakdown?.production?.total ?? (e.base?.production ?? 0) + (e.trained?.production ?? 0),
        bonusPercent: Math.round((e.productionBonus?.total ?? 0) * 100) / 100,
        payroll: Math.round((e.wage ?? 0) * 24 * 1000) / 1000,
        fromGame: true,
      }));
    }
  }
}

export const newEmployee = () => ({ name: '', production: 2, bonusPercent: 0, payroll: 0 });
