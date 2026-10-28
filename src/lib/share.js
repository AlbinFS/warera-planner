/**
 * One compact format for a build (skills, prestige, gear, food, fight
 * settings, level and military rank), used by share links and saved builds.
 * No player name or ID is part of it.
 *
 * Share links: ?b=<base64url of the packed JSON array>, version first.
 */
import { FIGHT_SKILLS, SLOTS } from '../engine/inputs.js';

// Positions in the packed arrays: never reorder, only append (old links must keep reading right).
const ALL_SKILLS = [...FIGHT_SKILLS, 'production', 'energy', 'entrepreneurship', 'companies', 'management', 'leadership'];

const VERSION = 1;

const toBase64Url = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (code) => new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

const packGear = (gear) => SLOTS.map((slot) => {
  const g = gear[slot];
  if (!g) return 0;
  return typeof g === 'string' ? g : [g.code, ...Object.entries(g.skills).sort(([a], [b]) => a.localeCompare(b)).flat()];
});
const unpackGear = (gear) => Object.fromEntries(SLOTS.map((slot, i) => {
  const g = gear[i];
  if (!g) return [slot, null];
  if (typeof g === 'string') return [slot, g];
  const [code, ...pairs] = g;
  const stats = {};
  for (let j = 0; j < pairs.length; j += 2) stats[pairs[j]] = pairs[j + 1];
  return [slot, { code, skills: stats }];
}));

/** The planned build as a compact array (the debuff build, if any, last: older links have none). */
export function pack(planner, settings) {
  const p = planner.player;
  const gear = packGear(planner.gear);
  return [
    VERSION,
    p?.level ?? 1,
    p?.militaryRankPercent ?? 0,
    ALL_SKILLS.map((s) => planner.skills[s] ?? 0),
    ALL_SKILLS.map((s) => p?.prestige?.[s] ?? 0),
    gear,
    planner.food,
    [settings.pill ? 1 : 0, Number(settings.battleBonus) || 0, settings.windowHours],
    // The build worn in the pill's debuff: [gear, food, used], or 0.
    planner.debuff ? [packGear(planner.debuff.gear), planner.debuff.food, settings.splitDebuff ? 1 : 0] : 0,
  ];
}

/** A packed build back as { player, skills, gear, food, debuff, settings }, or null if it can't be read. */
export function unpack(packed) {
  try {
    const [version, level, rank, skills, prestige, gear, food, [pill, bonus, windowHours], debuff] = packed;
    if (version !== VERSION) return null;
    return {
      player: {
        id: null, username: null, avatarUrl: null, countryId: null, currentGear: null, shared: true,
        level, militaryRankPercent: rank,
        prestige: Object.fromEntries(ALL_SKILLS.map((s, i) => [s, prestige[i] ?? 0])),
      },
      skills: Object.fromEntries(ALL_SKILLS.map((s, i) => [s, skills[i] ?? 0])),
      gear: unpackGear(gear),
      food,
      debuff: Array.isArray(debuff) ? { gear: unpackGear(debuff[0]), food: debuff[1] } : null,
      settings: { pill: !!pill, battleBonus: bonus, windowHours, splitDebuff: Array.isArray(debuff) && !!debuff[2] },
    };
  } catch {
    return null;
  }
}

/** A link to this site that opens the planned build. */
export function shareLink(planner, settings) {
  return `${location.origin}/?b=${toBase64Url(JSON.stringify(pack(planner, settings)))}`;
}

/** The build in a share code, or null if it can't be read. */
export function readShared(code) {
  try {
    return unpack(JSON.parse(fromBase64Url(code)));
  } catch {
    return null;
  }
}
