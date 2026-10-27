/**
 * Tools and training: which employee should hold which tool, who to train
 * first, and when to replace someone instead (the game's rules, from its
 * web app's config, 2026-10-27).
 *
 * Tools: a tool adds its rolled % to the holder's production bonus, only
 * when its kind fits the company's good. Its gain is linear in the holder's
 * output, so the best tool of a kind goes to the employee it adds most to.
 *
 * Training: one session a day for 10 energy, up to the employee's potential.
 * A Drill raises a stat by 1–4 (by card rarity: about +1.5 on average).
 * Wages follow Production (fair wage × (base + trained) × expectation), so
 * one more Production point earns
 *   margin = 6 points × (1 + bonus) × value per point − fair wage × expectation
 * a day: training pays only while that is positive. Negotiation lowers the
 * expectation by 0.05 / 0.1 / 0.2, not below 0.7.
 */

export const TOOL_GOODS = {
  sickle: ['grain', 'livestock', 'coca', 'wood', 'fish'],
  pickaxe: ['limestone', 'iron', 'lead', 'petroleum'],
  skillet: ['bread', 'steak', 'cookedFish'],
  hammer: ['steel', 'concrete'],
  flask: ['oil', 'paper', 'cocain'],
  caliper: ['lightAmmo', 'ammo', 'heavyAmmo'],
};
export const TOOL_KINDS = Object.keys(TOOL_GOODS);
const KIND_OF_GOOD = Object.fromEntries(Object.entries(TOOL_GOODS).flatMap(([kind, goods]) => goods.map((g) => [g, kind])));
export const toolKindFor = (good) => KIND_OF_GOOD[good] ?? null;
export const toolKind = (code) => TOOL_KINDS.find((k) => String(code ?? '').startsWith(k)) ?? null;

const HOURS = 24;
const OUTPUT_DIVISOR = 4;
const ENERGY_PER_ACTION = 10;
// Drill: +1 common, +2 uncommon, +3 epic, +4 legendary, drawn 55 / 25 / 5 / 2 (rare cards are other kinds).
const DRILL_AVERAGE = (55 * 1 + 25 * 2 + 5 * 3 + 2 * 4) / (55 + 25 + 5 + 2);
const WAGE_FLOOR = 0.7;

/** Points per day one bonus % adds to this employee. */
const pointsPerPercent = (e) => (e.production / OUTPUT_DIVISOR) * HOURS / 100;
/** What a tool of this % adds to them, in % (Handy +40 with any tool; Improviser loses its +25). */
const toolPercent = (e, percent) => (percent > 0 ? percent + (e.traits.includes('handy') ? 40 : 0) - (e.traits.includes('improviser') ? 25 : 0) : 0);

/**
 * The best tool for each employee. workers: [{ id, name, company, good,
 * perPoint, production, traits, tool: { id, code, percent } | null }];
 * spare: [{ id, code, percent }] (tools in the inventory). Returns
 * { assigned: [{ worker, tool, gain, now }], idle: [tool], total, current }.
 */
export function assignTools(workers, spare) {
  const tools = [...workers.filter((w) => w.tool).map((w) => ({ ...w.tool, heldBy: w.id })), ...spare];
  const value = (w, t) => (t ? toolPercent(w, t.percent) * pointsPerPercent(w) * w.perPoint : 0);
  const current = workers.reduce((s, w) => s + value(w, w.tool), 0);
  const assigned = [];
  const idle = [];
  for (const kind of TOOL_KINDS) {
    const kindTools = tools.filter((t) => toolKind(t.code) === kind).sort((a, b) => b.percent - a.percent);
    if (!kindTools.length) continue;
    // Best tool to whoever it adds most to, then the next: optimal when gains are linear in output.
    const free = workers.filter((w) => toolKindFor(w.good) === kind);
    for (const t of kindTools) {
      let best = null;
      for (const w of free) {
        const gain = value(w, t);
        if (gain > 0 && (!best || gain > best.gain)) best = { worker: w, tool: t, gain };
      }
      if (!best) { idle.push(t); continue; }
      free.splice(free.indexOf(best.worker), 1);
      assigned.push({ ...best, now: best.worker.tool?.id === t.id });
    }
  }
  const total = assigned.reduce((s, a) => s + a.gain, 0);
  return { assigned, idle, total, current };
}

/**
 * Who to train, who to negotiate with first, and who to replace. workers:
 * [{ id, name, company, perPoint, production, bonusPercent, payroll,
 * wageExpectation, potential, potentialMax, profit }]; fairWage per
 * Production point per day; replaceValue(worker) → G per day a typical
 * replacement would add (hiring.js). Each: { worker, margin, left, verdict,
 * perSession (G/day per 10 energy), why }.
 */
export function trainingPlan(workers, fairWage, replaceValue = () => 0) {
  return workers.map((w) => {
    const expectation = w.wageExpectation ?? 1;
    const outputPerPoint = 6 * (1 + w.bonusPercent / 100) * w.perPoint;
    const margin = outputPerPoint - fairWage * expectation;
    const floorMargin = outputPerPoint - fairWage * WAGE_FLOOR;
    const left = Math.max(0, (w.potentialMax ?? 0) - (w.potential ?? 0));
    const negotiate = expectation - 0.1 >= WAGE_FLOOR ? (w.payroll / expectation) * 0.1 : 0;
    const replace = replaceValue(w);
    let verdict;
    let perSession = 0;
    let why;
    if (margin > 0 && left > 0) {
      verdict = 'train';
      perSession = DRILL_AVERAGE * margin;
      why = `each Production point earns ${margin.toFixed(2)} G a day after its wage`;
    } else if (margin <= 0 && negotiate > 0 && floorMargin > 0) {
      verdict = 'negotiate';
      perSession = negotiate;
      why = `paid more than a Production point earns (${margin.toFixed(2)} G a day each); Negotiation first, then Drill`;
    } else if (w.profit < 0 && replace > 0) {
      verdict = 'replace';
      perSession = replace;
      why = floorMargin <= 0 ? 'loses money even at the lowest wage' : 'loses money and has no training left';
    } else if (left === 0) {
      verdict = 'done';
      why = 'no training left';
    } else {
      verdict = 'skip';
      why = 'training adds nothing: their Production barely pays its own wage';
    }
    return { worker: w, margin, left, verdict, perSession, replace, why };
  }).sort((a, b) => b.perSession - a.perSession);
}

export { ENERGY_PER_ACTION, DRILL_AVERAGE };
