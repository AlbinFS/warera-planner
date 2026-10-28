/**
 * Switching a company to another good, for a tool no company can use yet (a
 * skillet when nobody makes food, say). The game's rules:
 *   - a switch costs 5 concrete;
 *   - employees stay, but specialization is kept per good: in the new good
 *     each starts from what they have there (usually 0) and gains 1 % a day
 *     worked, up to 20 % (Quick Study twice as fast); the old good's is kept
 *     for later;
 *   - tools only work in their own goods: those for the old good stop, those
 *     for the new one (held or spare) are handed out;
 *   - the engine makes the new good.
 * Wages don't change. The team is scored as hiring.js scores it, so traits
 * that care about the good or a tool (Specialist, Handy, Improviser) count.
 */
import { teamPointsAt } from './hiring.js';
import { toolKind, toolKindFor } from './staffing.js';

export const SWITCH_CONCRETE = 5;
const SPEC_MAX = 20;
// Days the switch is weighed over (specialization is full by day 20).
export const SWITCH_DAYS = 30;

const bonusOf = (e, source) => (e.bonus ?? []).filter((b) => b.source === source).reduce((s, b) => s + b.percent, 0);

/**
 * model: hiring.js companyModel for the company now (its team, place, value
 * per point); employees: the same team as loaded (eco.svelte.js: their tools);
 * good: the good to switch to; perPoint: G per point by good;
 * spare: tools in the inventory ({ code, percent }); enginePoints: what its
 * engine makes a day; cost: G for the switch. Returns { good, now, after,
 * first, full, total, payback, tools } (G a day; total: over SWITCH_DAYS,
 * the cost taken off; payback: days, or null).
 */
/**
 * Which companies to switch so the spare tools get used, for the most income:
 * the best switch first (each company's best good, with as many of the tools
 * as it has employees for), then the next with the tools left, while a switch
 * still pays over the days weighed. options(company, tools) → switchValue
 * results for that company with those tools. Only switches that use a tool.
 */
export function toolSwitchPlan(companies, tools, options) {
  let left = [...tools];
  const plan = [];
  const used = new Set();
  while (left.length) {
    let best = null;
    for (const c of companies) {
      if (used.has(c.id)) continue;
      for (const o of options(c, left)) {
        if (!o.tools.some((t) => t.spare) || o.total <= 0) continue;
        if (!best || o.total > best.total) best = { company: c, ...o };
      }
    }
    if (!best) break;
    plan.push(best);
    used.add(best.company.id);
    const taken = new Set(best.tools.filter((t) => t.spare).map((t) => t.id));
    left = left.filter((t) => !taken.has(t.id));
  }
  return { plan, unused: left };
}

export function switchValue(model, { employees = [], good, perPoint, spare = [], enginePoints = 0, cost = 0, days = SWITCH_DAYS }) {
  const oldGood = model.place.good;
  const kind = toolKindFor(good);
  // The tools that would work: held ones of the new good's kind, and the spare ones; the best to whoever makes most.
  const heldTools = employees.map((e) => (e.tool && toolKind(e.tool.code) === kind ? { ...e.tool, held: true } : null)).filter(Boolean);
  const pool = [...heldTools, ...spare.filter((t) => toolKind(t.code) === kind)].sort((a, b) => b.percent - a.percent);
  const byOutput = model.team.map((e, i) => i).sort((a, b) => model.team[b].prodBase - model.team[a].prodBase);
  const toolFor = new Map(byOutput.slice(0, pool.length).map((i, n) => [i, pool[n]]));
  const quick = (e) => (e.traits.includes('quickStudy') ? 2 : 1);
  // The team on day d (0 = the first day): in the old good as it is, or in the new one.
  const teamOn = (d, switched) => model.team.map((e, i) => {
    const specNow = bonusOf(e, 'specialization');
    const toolNow = bonusOf(e, 'tool');
    if (!switched) return { ...e, bonusBase: e.bonusBase - specNow + Math.min(SPEC_MAX, specNow + quick(e) * d) };
    const spec = Math.min(SPEC_MAX, (e.specializations?.[good] ?? 0) + quick(e) * d);
    const tool = toolFor.get(i);
    return { ...e, tool: !!tool, bonusBase: e.bonusBase - specNow - toolNow + spec + (tool?.percent ?? 0) };
  });
  const placeNew = { ...model.place, good };
  const dayValue = (d, switched) => {
    const g = switched ? good : oldGood;
    const points = teamPointsAt(teamOn(d, switched), switched ? placeNew : model.place) + enginePoints;
    return points * (perPoint[g] ?? 0);
  };
  let total = -cost;
  let payback = null;
  let run = -cost;
  for (let d = 0; d < days; d++) {
    const gain = dayValue(d, true) - dayValue(d, false);
    total += gain;
    run += gain;
    if (payback == null && run >= 0) payback = d + 1;
  }
  return {
    good, now: dayValue(0, false), after: dayValue(0, true),
    first: dayValue(0, true) - dayValue(0, false), full: dayValue(SPEC_MAX, true) - dayValue(SPEC_MAX, false),
    total, payback, cost,
    tools: [...toolFor.entries()].map(([i, t]) => ({ id: t.id, name: model.team[i].name, percent: t.percent, spare: !t.held })),
  };
}
