/**
 * The build being planned: player basics, skill levels, gear and food.
 * Everything on the planner page reads and edits this one object.
 */
import { cached, findPlayer } from './warera.js';
import { ALL_SKILLS, SLOTS } from '../engine/inputs.js';
import { readShared } from './share.js';
import { settings } from './settings.svelte.js';

const emptyGear = () => Object.fromEntries(SLOTS.map((s) => [s, null]));

export const planner = $state({
  player: null, // { id, username, level, militaryRankPercent, prestige: { skill: n }, currentGear }
  skills: Object.fromEntries(ALL_SKILLS.map((s) => [s, 0])),
  gear: emptyGear(), // weapon/armor: { code, skills } or null; ammo: code or null
  food: 'cookedFish',
});

/** Gear from the API's current-equipment shape. */
function gearFrom(equipment) {
  const gear = emptyGear();
  for (const slot of SLOTS) {
    const item = equipment?.[slot];
    if (!item) continue;
    gear[slot] = typeof item === 'string' ? item : { code: item.code, skills: { ...item.skills } };
  }
  return gear;
}

const LAST_PLAYER = 'planner.lastPlayer';

/** Loading state for the player lookup, shared by every page. */
export const playerStatus = $state({ loading: false, error: '' });

/** Finds a player by name and loads them, remembering them for the next visit. */
export async function loadByName(name) {
  if (!name?.trim()) return;
  playerStatus.loading = true;
  playerStatus.error = '';
  try {
    await loadPlayer(await findPlayer(name.trim()));
    try { localStorage.setItem(LAST_PLAYER, planner.player.username); } catch {}
  } catch (err) {
    playerStatus.error = err.message;
  } finally {
    playerStatus.loading = false;
  }
}

export function lastPlayerName() {
  try { return localStorage.getItem(LAST_PLAYER) ?? ''; } catch { return ''; }
}

/** On start-up: load the player from the last visit, unless a shared build was opened. */
export function restoreLastPlayer() {
  if (!planner.player && lastPlayerName()) loadByName(lastPlayerName());
}

/** Loads a player's skills and worn gear into the planner. */
export async function loadPlayer(user) {
  const equipment = await cached('inventory.fetchCurrentEquipment', { userId: user._id }).catch(() => ({}));
  planner.player = {
    id: user._id,
    username: user.username,
    avatarUrl: user.avatarUrl ?? null,
    countryId: user.country ?? null,
    level: user.leveling?.level ?? 1,
    militaryRankPercent: user.skills?.attack?.militaryRankPercent ?? 0,
    prestige: Object.fromEntries(ALL_SKILLS.map((s) => [s, user.skills?.[s]?.prestige ?? 0])),
    currentGear: equipment,
    // Economy skills as the game has them now (v0.27 added Leadership).
    ecoLevels: Object.fromEntries(['companies', 'management', 'energy', 'production', 'leadership'].map((k) => [k, user.skills?.[k]?.level ?? 0])),
  };
  planner.skills = Object.fromEntries(ALL_SKILLS.map((s) => [s, user.skills?.[s]?.level ?? 0]));
  planner.gear = gearFrom(equipment);
  // A loaded player replaces a shared build; drop it from the address so a refresh keeps this player.
  if (location.search.includes('b=')) history.replaceState(null, '', location.pathname);
}

/** Puts an optimizer build (equipment + food) into the planner. */
export function applyBuild(equipment, foodCode) {
  planner.gear = gearFrom(equipment);
  if (foodCode) planner.food = foodCode;
}

/**
 * Puts a stored build (share link or saved build) into the planner, with its
 * fight settings. A loaded player stays loaded and only takes the build's
 * skills, gear and food; otherwise the build's own level and rank are used.
 */
export function applyState(state, label = 'Shared build') {
  if (!planner.player || planner.player.shared) planner.player = { ...state.player, label };
  planner.skills = state.skills;
  planner.gear = state.gear;
  planner.food = state.food;
  Object.assign(settings, state.settings);
}

// A share link (?b=…) opens that build.
const sharedCode = new URLSearchParams(location.search).get('b');
const shared = sharedCode ? readShared(sharedCode) : null;
if (shared) applyState(shared);
