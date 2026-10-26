/**
 * Share links: the whole build (skills, gear, food, fight settings, level
 * and military rank) packed into the link, so no server stores anything.
 * No player name or ID goes into the link.
 *
 * Format: ?b=<base64url of a compact JSON array>, version first.
 */
import { ALL_SKILLS, SLOTS } from '../engine/inputs.js';

const VERSION = 1;

const toBase64Url = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (code) => new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

/** A link to this page that opens the planned build. */
export function shareLink(planner, settings) {
  const p = planner.player;
  const gear = SLOTS.map((slot) => {
    const g = planner.gear[slot];
    if (!g) return 0;
    return typeof g === 'string' ? g : [g.code, ...Object.entries(g.skills).sort(([a], [b]) => a.localeCompare(b)).flat()];
  });
  const packed = [
    VERSION,
    p?.level ?? 1,
    p?.militaryRankPercent ?? 0,
    ALL_SKILLS.map((s) => planner.skills[s] ?? 0),
    ALL_SKILLS.map((s) => p?.prestige?.[s] ?? 0),
    gear,
    planner.food,
    [settings.pill ? 1 : 0, Number(settings.battleBonus) || 0, settings.windowHours],
  ];
  return `${location.origin}/?b=${toBase64Url(JSON.stringify(packed))}`;
}

/** The build in a share code, or null if it can't be read. */
export function readShared(code) {
  try {
    const [version, level, rank, skills, prestige, gear, food, [pill, bonus, windowHours]] = JSON.parse(fromBase64Url(code));
    if (version !== VERSION) return null;
    return {
      player: {
        id: null, username: null, avatarUrl: null, countryId: null, currentGear: null, shared: true,
        level, militaryRankPercent: rank,
        prestige: Object.fromEntries(ALL_SKILLS.map((s, i) => [s, prestige[i] ?? 0])),
      },
      skills: Object.fromEntries(ALL_SKILLS.map((s, i) => [s, skills[i] ?? 0])),
      gear: Object.fromEntries(SLOTS.map((slot, i) => {
        const g = gear[i];
        if (!g) return [slot, null];
        if (typeof g === 'string') return [slot, g];
        const [code, ...pairs] = g;
        const stats = {};
        for (let j = 0; j < pairs.length; j += 2) stats[pairs[j]] = pairs[j + 1];
        return [slot, { code, skills: stats }];
      })),
      food,
      settings: { pill: !!pill, battleBonus: bonus, windowHours },
    };
  } catch {
    return null;
  }
}
