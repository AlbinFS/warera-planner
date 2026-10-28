/**
 * Tools and training: which employee should hold which tool, who to train
 * first, and when to replace someone instead (the game's rules, from its
 * web app's config, 2026-10-27).
 *
 * Tools: a tool adds its rolled % to the holder's production bonus, only
 * when its kind fits the company's good. Handy adds +40 % with any tool and
 * Improviser loses +25 %, whatever its %, so the best tool doesn't simply go
 * to the biggest producer: each kind is assigned exactly (best total).
 *
 * Training: one session a day for 10 energy, up to the employee's potential;
 * what a session is worth comes from its hand of cards (training.js), over
 * the days the employee has left. Wages follow Production (fair wage ×
 * (base + trained) × expectation), so one more Production point earns
 *   margin = 6 points × (1 + bonus) × value per point − fair wage × expectation
 * a day. The 10 energy could self-work instead: a session pays only if it is
 * worth more than that.
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
// Days left when nothing says (a candidate's age is 18–45: about 33 days on average).
const DAYS_UNKNOWN = 33;
const OUTPUT_DIVISOR = 4;
const ENERGY_PER_ACTION = 10;
// Drill: +1 common, +2 uncommon, +3 epic, +4 legendary, drawn 55 / 25 / 5 / 2 (rare cards are other kinds).
const DRILL_AVERAGE = (55 * 1 + 25 * 2 + 5 * 3 + 2 * 4) / (55 + 25 + 5 + 2);
const WAGE_FLOOR = 0.7;
// A tool lasts 500 worked hours.
const TOOL_DAYS = 500 / HOURS;
// When no tools are held to go by, a toolbox's tool is taken as +12 %.
const TOOL_PERCENT_UNKNOWN = 12;

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
    const free = workers.filter((w) => toolKindFor(w.good) === kind);
    const gains = kindTools.map((t) => free.map((w) => Math.max(0, value(w, t))));
    const holder = bestAssignment(gains);
    kindTools.forEach((t, i) => {
      const j = holder[i];
      if (j < 0 || !(gains[i][j] > 0)) { idle.push(t); return; }
      assigned.push({ worker: free[j], tool: t, gain: gains[i][j], now: free[j].tool?.id === t.id });
    });
  }
  const total = assigned.reduce((s, a) => s + a.gain, 0);
  return { assigned, idle, total, current };
}

/**
 * What a toolbox is worth to these companies (G): it gives a random tool (one
 * of the 6 kinds; at the % your employees' tools have on average), which is
 * worth something only to an employee without one making a good it fits:
 * the best such employee's output × the tool's % for as long as the tool or
 * the employee lasts. Tools can't be traded, so nothing otherwise.
 * workers: [{ good, perPoint, production, tool, daysLeft }].
 */
export function toolboxValue(workers) {
  const held = workers.filter((w) => w.tool?.percent > 0).map((w) => w.tool.percent);
  const percent = held.length ? held.reduce((t, p) => t + p, 0) / held.length : TOOL_PERCENT_UNKNOWN;
  let total = 0;
  for (const kind of TOOL_KINDS) {
    let best = 0;
    for (const w of workers) {
      if (w.tool || toolKindFor(w.good) !== kind) continue;
      const days = Math.min(TOOL_DAYS, w.daysLeft ?? TOOL_DAYS);
      best = Math.max(best, toolPercent(w, percent) * pointsPerPercent(w) * w.perPoint * days);
    }
    total += best / TOOL_KINDS.length;
  }
  return total;
}

/**
 * The assignment of rows to columns with the most total (each at most once;
 * gains ≥ 0, so leaving one out never helps): Hungarian method on the costs
 * −gain, padded square. Returns each row's column, or −1.
 */
export function bestAssignment(gains) {
  const rows = gains.length;
  const cols = gains[0]?.length ?? 0;
  const n = Math.max(rows, cols);
  if (!rows || !cols) return gains.map(() => -1);
  const cost = (i, j) => (i < rows && j < cols ? -gains[i][j] : 0);
  // Potentials u (rows), v (columns); match[j] = row on column j (1-based, 0 = none).
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), match = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    match[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = match[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[match[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (match[j0] !== 0);
    do { const j1 = way[j0]; match[j0] = match[j1]; j0 = j1; } while (j0);
  }
  const out = new Array(rows).fill(-1);
  for (let j = 1; j <= n; j++) if (match[j] && match[j] <= rows && j <= cols) out[match[j] - 1] = j - 1;
  return out;
}

/**
 * Who to train, and who to replace. workers: [{ id, name, company, perPoint,
 * production, bonusPercent, payroll, wageExpectation, potential,
 * potentialMax, profit, traits, daysLeft }]; fairWage per Production point
 * per day; replaceValue(worker) → G a day a typical replacement would add
 * (hiring.js). options: sessionOf(worker) → what a session is worth, G in all
 * (training.js; without it, an average Production drill); selfWork: G that
 * 10 energy of self-work makes. Each: { worker, margin, left, days, verdict,
 * perSession (G in all for the next 10 energy), replace (G a day), why }.
 */
export function trainingPlan(workers, fairWage, replaceValue = () => 0, { sessionOf = null, selfWork = 0 } = {}) {
  return workers.map((w) => {
    const expectation = w.wageExpectation ?? 1;
    const outputPerPoint = 6 * (1 + w.bonusPercent / 100) * w.perPoint;
    // Greedy is paid 20 % more per point, Modest 15 % less.
    const markup = (w.traits?.includes('greedy') ? 1.2 : 1) * (w.traits?.includes('modest') ? 0.85 : 1);
    const margin = outputPerPoint - fairWage * expectation * markup;
    const floorMargin = outputPerPoint - fairWage * WAGE_FLOOR * markup;
    const left = Math.max(0, (w.potentialMax ?? 0) - (w.potential ?? 0));
    const days = w.daysLeft ?? DAYS_UNKNOWN;
    const replace = replaceValue(w);
    const session = left > 0 ? (sessionOf ? sessionOf(w) : DRILL_AVERAGE * margin * days) : 0;
    let verdict;
    let why;
    if (w.profit < 0 && replace > 0 && replace * days > session) {
      verdict = 'replace';
      why = floorMargin <= 0 ? 'loses money even at the lowest wage' : 'loses money, and a new hire adds more than training them';
    } else if (left === 0) {
      verdict = 'done';
      why = 'no training left';
    } else if (session > selfWork + 0.005) {
      verdict = 'train';
      why = `a session is worth about ${session.toFixed(1)} G over the ${Math.round(days)} days they have left${selfWork > 0 ? `, more than self-work's ${selfWork.toFixed(1)} G` : ''}`;
    } else {
      verdict = 'skip';
      why = session > 0 ? `self-work makes more with the energy (${selfWork.toFixed(1)} G against ${session.toFixed(1)} G)` : 'no card pays: their Production barely pays its own wage';
    }
    return { worker: w, margin, left, days, verdict, perSession: session, replace, why };
  }).sort((a, b) => b.perSession - a.perSession);
}

export { ENERGY_PER_ACTION, DRILL_AVERAGE, DAYS_UNKNOWN };
