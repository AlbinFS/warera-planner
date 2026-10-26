/**
 * The build being planned: player basics, skill levels, gear and food.
 * Everything on the planner page reads and edits this one object.
 */
import { cached } from './warera.js';
import { ALL_SKILLS, SLOTS } from '../engine/inputs.js';

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

/** Loads a player's skills and worn gear into the planner. */
export async function loadPlayer(user) {
  const equipment = await cached('inventory.fetchCurrentEquipment', { userId: user._id }).catch(() => ({}));
  planner.player = {
    id: user._id,
    username: user.username,
    level: user.leveling?.level ?? 1,
    militaryRankPercent: user.skills?.attack?.militaryRankPercent ?? 0,
    prestige: Object.fromEntries(ALL_SKILLS.map((s) => [s, user.skills?.[s]?.prestige ?? 0])),
    currentGear: equipment,
  };
  planner.skills = Object.fromEntries(ALL_SKILLS.map((s) => [s, user.skills?.[s]?.level ?? 0]));
  planner.gear = gearFrom(equipment);
}

/** Puts an optimizer build (equipment + food) into the planner. */
export function applyBuild(equipment, foodCode) {
  planner.gear = gearFrom(equipment);
  if (foodCode) planner.food = foodCode;
}
