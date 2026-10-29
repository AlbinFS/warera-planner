/**
 * Prestige, as the game has it (its config and skill page, 2026-10-29): at
 * level 50 a player can prestige, losing 65,000 XP (back to level 25: fewer
 * skill points) for one prestige point and an XP bonus. Points go on skills:
 * a skill's next rank costs 2^(ranks it has) points (1, 2, 4, 8: r ranks cost
 * 2^r − 1 in all) and each rank counts as one more level of the skill, past
 * level 10 too. Ranks stay on their skill until a skill reset.
 *
 * Searches here work in effective levels (level + ranks): a skill's value
 * depends on nothing else. splitPrestige turns effective levels back into
 * levels and ranks, using the fewest skill points the prestige points allow.
 */
export const PRESTIGE_LEVEL = 50;
export const PRESTIGE_XP = 65000;

/** Prestige points r ranks on one skill cost. */
export const rankCost = (r) => 2 ** Math.max(0, r ?? 0) - 1;
/** The most ranks one skill can have with this many points. */
export const maxRank = (points) => Math.floor(Math.log2(Math.max(0, points ?? 0) + 1));
/** Prestige points a set of ranks uses. */
export const prestigeUsed = (ranks) => Object.values(ranks ?? {}).reduce((t, r) => t + rankCost(r), 0);
/** Levels plus ranks. */
export const effective = (levels, ranks) => Object.fromEntries(Object.entries(levels ?? {}).map(([s, n]) => [s, (n ?? 0) + (ranks?.[s] ?? 0)]));

/**
 * For each skill, its ways to reach effective level e: [{ r, cost: prestige
 * points, points: skill points }]. A locked skill (max 0) can't take ranks.
 */
function ways(skill, e, points, levelCost, maxLevel) {
  const top = maxLevel(skill);
  const out = [];
  for (let r = Math.max(0, e - top); r <= Math.min(e, top > 0 ? maxRank(points) : 0); r++) out.push({ r, cost: rankCost(r), points: levelCost(skill, e - r) });
  return out;
}

/**
 * Fewest skill points to reach these effective levels with at most `points`
 * prestige points (Infinity when they can't be reached).
 * levelCost(skill, level), maxLevel(skill): from the game config.
 */
export function minPoints(skills, target, points, levelCost, maxLevel) {
  if (!points) return skills.reduce((t, s) => (target[s] > maxLevel(s) ? Infinity : t + levelCost(s, target[s] ?? 0)), 0);
  let best = new Array(points + 1).fill(Infinity);
  best[0] = 0;
  for (const s of skills) {
    const next = new Array(points + 1).fill(Infinity);
    const options = ways(s, target[s] ?? 0, points, levelCost, maxLevel);
    for (let p = 0; p <= points; p++) {
      if (best[p] === Infinity) continue;
      for (const w of options) if (p + w.cost <= points && best[p] + w.points < next[p + w.cost]) next[p + w.cost] = best[p] + w.points;
    }
    best = next;
  }
  return Math.min(...best);
}

/**
 * Effective levels as { levels, ranks, points (skill points), used (prestige
 * points) }, with the fewest skill points; ties keep the ranks in `prefer`
 * (no skill reset), then use fewer prestige points. null when out of reach.
 */
export function splitPrestige(skills, target, points, { levelCost, maxLevel, prefer = {} }) {
  // States by prestige points used: [skill points, ranks moved, choices].
  let best = [[0, 0, []], ...new Array(points).fill(null)];
  for (const s of skills) {
    const next = new Array(points + 1).fill(null);
    const options = ways(s, target[s] ?? 0, points, levelCost, maxLevel);
    for (let p = 0; p <= points; p++) {
      if (!best[p]) continue;
      for (const w of options) {
        const q = p + w.cost;
        if (q > points) continue;
        const cand = [best[p][0] + w.points, best[p][1] + (w.r === (prefer[s] ?? 0) ? 0 : 1), [...best[p][2], w.r]];
        const cur = next[q];
        if (!cur || cand[0] < cur[0] || (cand[0] === cur[0] && cand[1] < cur[1])) next[q] = cand;
      }
    }
    best = next;
  }
  let pick = null;
  best.forEach((b, used) => { if (b && (!pick || b[0] < pick.b[0] || (b[0] === pick.b[0] && b[1] < pick.b[1]))) pick = { b, used }; });
  if (!pick) return null;
  const ranks = Object.fromEntries(skills.map((s, i) => [s, pick.b[2][i]]));
  return { levels: Object.fromEntries(skills.map((s) => [s, (target[s] ?? 0) - ranks[s]])), ranks, points: pick.b[0], used: pick.used };
}
