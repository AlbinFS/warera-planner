/**
 * Eco page state: the player's companies (from the API), employees typed in
 * by the player (the API has none; kept in this browser) and eco settings.
 */
import { cached } from './warera.js';

const SETTINGS_KEY = 'eco.settings.v1';
const EMPLOYEES_KEY = 'eco.employees.v1';

const load = (key, fallback) => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') }; } catch { return { ...fallback }; }
};

export const ecoSettings = $state(load(SETTINGS_KEY, {
  pointValue: null, // null: use the estimate from market prices
  selfWork: false,
  trainingsPerDay: 0,
  managerPercent: 0,
  core: true,
  budgetMode: 'keepFight', // keepFight | all | custom
  customBudget: 0,
  minLeadership: 0,
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
  const companies = await Promise.all(ids.map((companyId) => cached('company.getById', { companyId }, 5 * 60 * 1000)));
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

export const newEmployee = () => ({
  name: '', production: 2, traitProduction: 0, expectation: 100, wagePerDay: 0, happiness: 50, toolPercent: 0, specialization: 0, bonusPercent: 0,
});
