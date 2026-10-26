/**
 * Saved builds, kept in this browser only (nothing is sent anywhere).
 * Each is { id, name, savedAt, damage, cost, packed } where `packed` is the
 * share format and damage/cost are what the planner showed when saved.
 */
import { pack, unpack } from './share.js';

const KEY = 'savedBuilds.v1';

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export const saved = $state({ builds: load() });

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(saved.builds)); } catch {}
}

export function saveBuild(name, planner, settings, result) {
  const build = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Untitled build',
    savedAt: Date.now(),
    damage: result?.damage ?? null,
    cost: result?.cost ?? null,
    windowHours: settings.windowHours,
    packed: pack(planner, settings),
  };
  saved.builds = [build, ...saved.builds];
  persist();
  return build;
}

export function renameBuild(id, name) {
  const b = saved.builds.find((x) => x.id === id);
  if (b) { b.name = name.trim() || b.name; persist(); }
}

export function deleteBuild(id) {
  saved.builds = saved.builds.filter((x) => x.id !== id);
  persist();
}

/** A saved build as { player, skills, gear, food, settings }. */
export const stateOf = (build) => unpack(build.packed);
