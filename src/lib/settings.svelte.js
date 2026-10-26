/**
 * Fight settings: one copy for the whole site, shown in the settings bar on
 * every page and remembered in this browser. (The original kept the battle
 * bonus in two separate hidden places, which made pages disagree.)
 */
const KEY = 'settings.v1';
const DEFAULTS = { battleBonus: 60, pill: true, food: 'any', windowHours: 8 };

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = $state(load());

$effect.root(() => {
  $effect(() => {
    const snapshot = JSON.stringify(settings);
    try { localStorage.setItem(KEY, snapshot); } catch {}
  });
});

export const FOODS = [
  { value: 'any', label: 'Any food' },
  { value: 'cookedFish', label: 'Cooked fish' },
  { value: 'steak', label: 'Steak' },
  { value: 'bread', label: 'Bread' },
  { value: 'none', label: 'No food' },
];
