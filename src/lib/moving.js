/**
 * Moving employees between your own companies. The game's rules: the one
 * moved loses 5 happiness for 7 days (and can't be fired for 24 hours);
 * wages don't change; a hired manager's bonus is their company's (the one
 * moved leaves it behind and gets the new company's, if it has one); specialization is kept per good (in another good they
 * start from what they have there and gain 1 % a day worked, up to 20 %;
 * Quick Study twice as fast); a tool only works in goods of its kind. A
 * company holds as many employees as its break room level; when the one
 * moved to is full, someone comes back the other way (a swap, both moved).
 *
 * Both companies are scored as hiring.js scores a team, so everything that
 * depends on who works with whom counts: an Old Friends, Sweethearts or
 * Nemesis pair (only the one holding the trait gets it, while the other works
 * in the same company), a Comic, Girl Power, a Xenophobe, the place (tax,
 * core region, a Patriot's home), and so on. Worked out day by day over
 * MOVE_DAYS, each company's points at what its good is worth.
 */
import { teamPointsAt, teamPointsEach } from './hiring.js';
import { toolKind, toolKindFor } from './staffing.js';

export const MOVE_DAYS = 30;
const MOVE_HAPPINESS = 5;
const MOVE_HAPPINESS_DAYS = 7;
const SPEC_MAX = 20;

const bonusOf = (e, source) => (e.bonus ?? []).filter((b) => b.source === source).reduce((s, b) => s + b.percent, 0);
const quick = (e) => (e.traits.includes('quickStudy') ? 2 : 1);

/**
 * An employee on day d (0 = the first) of working at `place`: in their own
 * company (moved = false) or after moving there, with specialization, tool,
 * time in the company and the move's happiness loss as they'd be that day.
 * toolCode: the tool they hold (eco.svelte.js), if any.
 */
function onDay(e, d, { from, place, moved, toolCode, manager = 0 }) {
  const specNow = bonusOf(e, 'specialization');
  if (!moved) return { ...e, bonusBase: e.bonusBase - specNow + Math.min(SPEC_MAX, specNow + quick(e) * d), tenure: e.tenure == null ? null : e.tenure + d };
  const sameGood = place.good === from.good;
  const spec = sameGood ? Math.min(SPEC_MAX, specNow + quick(e) * d) : Math.min(SPEC_MAX, (e.specializations?.[place.good] ?? 0) + quick(e) * d);
  // A tool goes with them, and works only in goods of its kind.
  const toolNow = bonusOf(e, 'tool');
  const toolWorks = !!toolCode && toolKind(toolCode) === toolKindFor(place.good);
  return {
    ...e,
    bonusBase: e.bonusBase - specNow + spec - (toolWorks ? 0 : toolNow) - bonusOf(e, 'manager') + manager,
    tool: toolWorks ? e.tool : false,
    tenure: d,
    passingLoss: d < MOVE_HAPPINESS_DAYS ? -MOVE_HAPPINESS : 0,
  };
}

/**
 * What moving employee `index` of company `a` to company `b` is worth (with
 * `swap`: employee `swap` of `b` coming back to `a`). a, b: { model (hiring.js
 * companyModel), employees (as loaded: their tools), capacity, manager (its
 * hired manager's bonus %, 0 without one) }.
 * Returns { first (G, day 1), average (G a day over the days), full (G a day
 * once specialization has caught up), total (G over the days), payback (the
 * day the running total turns positive, or null), changes: [{ name, company:
 * 'a' | 'b', change (G a day, day 21 on) }] } — or null when b has no room
 * and there's no swap.
 */
export function moveValue(a, index, b, { swap = null, days = MOVE_DAYS } = {}) {
  if (swap == null && b.model.team.length >= b.capacity) return null;
  const mover = a.model.team[index];
  const back = swap == null ? null : b.model.team[swap];
  const toolOf = (side, i) => side.employees?.[i]?.tool?.code ?? null;
  const teams = (d, moving) => {
    const at = (side) => side.model.place;
    const stayA = a.model.team.map((e, i) => (moving && i === index ? null : onDay(e, d, { from: at(a), place: at(a), moved: false }))).filter(Boolean);
    const stayB = b.model.team.map((e, i) => (moving && i === swap ? null : onDay(e, d, { from: at(b), place: at(b), moved: false }))).filter(Boolean);
    if (moving) {
      stayB.push(onDay(mover, d, { from: at(a), place: at(b), moved: true, toolCode: toolOf(a, index), manager: b.manager ?? 0 }));
      if (back) stayA.push(onDay(back, d, { from: at(b), place: at(a), moved: true, toolCode: toolOf(b, swap), manager: a.manager ?? 0 }));
    }
    return [stayA, stayB];
  };
  const worth = (d, moving) => {
    const [ta, tb] = teams(d, moving);
    return teamPointsAt(ta, a.model.place) * a.model.perPoint + teamPointsAt(tb, b.model.place) * b.model.perPoint;
  };
  let total = 0;
  let payback = null;
  for (let d = 0; d < days; d++) {
    total += worth(d, true) - worth(d, false);
    if (payback == null && total > 0) payback = d + 1;
  }
  // Who gains and who loses among those who stay, once specialization has caught up (day 21 on).
  const settled = SPEC_MAX;
  const [beforeA, beforeB] = teams(settled, false);
  const [afterA, afterB] = teams(settled, true);
  const changes = [];
  // Those who stay keep their order; the one who leaves is skipped.
  for (const [side, before, after, place, perPoint, gone] of [['a', beforeA, afterA, a.model.place, a.model.perPoint, index], ['b', beforeB, afterB, b.model.place, b.model.perPoint, swap]]) {
    const was = teamPointsEach(before, place);
    const now = teamPointsEach(after, place);
    before.forEach((e, i) => {
      if (i === gone) return;
      const j = gone != null && i > gone ? i - 1 : i;
      const change = (now[j] - was[i]) * perPoint;
      if (Math.abs(change) > 0.005) changes.push({ name: e.name, company: side, change });
    });
  }
  // The ones who move: their own points there against here (at each company's value per point).
  const moverChange = teamPointsEach(afterB, b.model.place).at(-1) * b.model.perPoint - teamPointsEach(beforeA, a.model.place)[index] * a.model.perPoint;
  changes.unshift({ name: mover.name, company: 'moved', change: moverChange });
  if (back) {
    const backChange = teamPointsEach(afterA, a.model.place).at(-1) * a.model.perPoint - teamPointsEach(beforeB, b.model.place)[swap] * b.model.perPoint;
    changes.splice(1, 0, { name: back.name, company: 'moved back', change: backChange });
  }
  return {
    first: worth(0, true) - worth(0, false),
    average: total / days,
    full: worth(settled, true) - worth(settled, false),
    total, payback, changes,
  };
}

/**
 * Every move worth making: each employee to each other company (where it has
 * room), or swapped with each employee there (where it's full), kept when it
 * pays over the days weighed. sides: [{ id, name, model, employees, capacity }].
 * Sorted by total, best first: [{ from, to, index, swap, name, swapName, ...moveValue }].
 */
export function bestMoves(sides, { days = MOVE_DAYS } = {}) {
  const out = [];
  sides.forEach((a, ai) => sides.forEach((b, bi) => {
    if (ai === bi) return;
    a.model.team.forEach((e, index) => {
      const options = b.model.team.length < b.capacity ? [null] : b.model.team.map((_, j) => j);
      for (const swap of options) {
        // A swap is found from both sides: keep it once.
        if (swap != null && bi < ai) continue;
        const v = moveValue(a, index, b, { swap, days });
        if (v && v.total > 0.01) out.push({ from: a, to: b, index, swap, name: e.name, swapName: swap == null ? null : b.model.team[swap].name, ...v });
      }
    });
  }));
  return out.sort((x, y) => y.total - x.total);
}

/**
 * The moves to make, from bestMoves' list: best first, then only moves that
 * touch nobody and no company an earlier pick already changed (each was
 * worked out with the teams as they are now, and you'd take the best one for
 * a person anyway). After moving, reload to see what's worth doing next.
 */
export function movePlan(moves) {
  const people = new Set();
  const places = new Set();
  const plan = [];
  for (const m of moves) {
    const who = [`${m.from.id}:${m.index}`, ...(m.swap == null ? [] : [`${m.to.id}:${m.swap}`])];
    if (who.some((w) => people.has(w)) || places.has(m.from.id) || places.has(m.to.id)) continue;
    plan.push(m);
    who.forEach((w) => people.add(w));
    places.add(m.from.id).add(m.to.id);
  }
  return plan;
}
