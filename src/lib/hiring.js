/**
 * Who to hire next, and which training cards pay, for one company.
 *
 * The game's employee rules (its web app's config, 2026-10-27):
 *   points per day   = Production ÷ 4 × 24 × (1 + bonus %)
 *   bonus %          = Management + core region + tool + specialization
 *                      + percentage traits + (happiness − 50)
 *   happiness        = 50 + every reason; Responsibility shields losses,
 *                      Responsibility ÷ 10 of each (all of it at 10)
 *   wage per day     = fair wage per Production point × (base + trained
 *                      Production) × wage expectation (Greedy +20 %,
 *                      Modest −15 %)
 *   candidates       = stats 1–4, at most one trait (half have none), drawn
 *                      by each trait's weight
 *
 * A hire is scored by what the whole company makes after it: the newcomer's
 * own points plus every coworker's change (a Xenophobe next to a foreigner,
 * a Comic lifting everyone's mood, …), at the good's value per point, minus
 * the newcomer's wage. Traits that only pay off over weeks are counted at a
 * typical value; ones that don't change output (luck, retention) at none.
 *
 * Which trait to look for: first the ones that match the team (their value
 * here beyond what they'd give next to plain coworkers: Girl Power next to
 * women, Cosmopolitan next to foreigners, …), then the community tier list
 * (TIERS), which rates a trait on its own, for a hire who matches nobody.
 */

// Community tier list (S best … F worst), for a hire who doesn't need to match anyone.
// Flight Risk isn't on it; it is placed by its effect.
export const TIERS = {
  S: ['sociable', 'primaDonna', 'oldFriends', 'sweethearts', 'girlPower', 'bandOfBrothers', 'handy', 'improviser', 'veteran', 'modest', 'loyal', 'luckyCharm'],
  A: ['foreman', 'rival', 'comic', 'craftsman', 'laborer', 'lateBloomer', 'anchor', 'trainer'],
  B: ['mentor', 'quickStudy', 'stockpiler', 'sprinter', 'gambler', 'bully'],
  C: ['loner', 'nationalist', 'cosmopolitan', 'specialist', 'recruiter'],
  D: ['patriot', 'expat', 'statist', 'salvager'],
  E: ['diamondInTheRough', 'scavenger'],
  F: ['xenophobe', 'envious', 'nemesis', 'manHater', 'misogynist', 'claustrophobe', 'creatureOfHabit', 'burnout', 'wornOut', 'homesick', 'taxShy', 'greedy', 'climber', 'jinx', 'flightRisk'],
};
const TIER_OF = Object.fromEntries(Object.entries(TIERS).flatMap(([tier, codes]) => codes.map((c) => [c, tier])));
export const tierOf = (code) => TIER_OF[code] ?? null;
const TIER_RANK = { S: 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };

export const TRAITS = {
  handy: { weight: 5, note: '+40 % while holding a tool' },
  improviser: { weight: 5, note: '+25 % while holding no tool' },
  nationalist: { weight: 10, note: '+2 Responsibility, +5 happiness when half or more coworkers share their nationality' },
  xenophobe: { weight: 10, bad: true, note: '−2 Production, −5 happiness with any foreign coworker' },
  cosmopolitan: { weight: 10, note: '+2 Production per foreign nationality among coworkers (up to +4)' },
  loner: { weight: 5, note: '+100 %, +5 happiness as the only employee' },
  sociable: { weight: 10, note: '+25 % per coworker (up to +50 %), −10 happiness alone' },
  comic: { weight: 10, note: 'every coworker +10 happiness; −1 Production themselves' },
  mentor: { weight: 2, note: 'every weaker coworker +2 Production; −1 themselves' },
  foreman: { weight: 5, note: 'every coworker +3 Responsibility' },
  rival: { weight: 5, note: '+3 Production when someone out-produces them, −1 at the top' },
  primaDonna: { weight: 5, note: '+20 % when paid more than every coworker, else −10 happiness' },
  bully: { weight: 5, note: '+2 Production; every coworker −10 happiness' },
  envious: { weight: 10, bad: true, note: '−5 happiness per better-paid coworker (up to −10)' },
  girlPower: { weight: 5, gender: 'female', note: '+15 % per female coworker (up to +30 %)' },
  bandOfBrothers: { weight: 5, gender: 'male', note: '+15 % per male coworker (up to +30 %)' },
  manHater: { weight: 5, gender: 'female', bad: true, note: '−15 % per male coworker (up to −30 %)' },
  misogynist: { weight: 5, gender: 'male', bad: true, note: '−15 % per female coworker (up to −30 %)' },
  specialist: { weight: 10, note: '+3 Production, +5 happiness making their own good, which is random: about 1 in 20 matches yours (counted so)' },
  craftsman: { weight: 10, note: '+3 Production on manufactured goods, −1 on raw' },
  laborer: { weight: 10, note: '+3 Production on raw resources, −1 on manufactured' },
  quickStudy: { weight: 10, note: 'specializes twice as fast (20 % in 10 days, not 20)' },
  stockpiler: { weight: 10, note: 'no penalty when storage is full' },
  claustrophobe: { weight: 5, bad: true, note: '−20 % with storage at level 2 or lower' },
  sprinter: { weight: 5, note: '+50 % in their first day only' },
  veteran: { weight: 5, note: '+20 % after 30 days in the company; counted as +10 % (about a month in, they may ask to retire)' },
  creatureOfHabit: { weight: 10, bad: true, note: '−30 % for 3 days after a move' },
  diamondInTheRough: { weight: 2, note: '+1 to a stat (named on them) every 10 days, up to +4; counted as +2 to a random stat' },
  burnout: { weight: 2, bad: true, note: '−1 to every stat every 20 days (up to −3); counted as −1 Production' },
  lateBloomer: { weight: 5, note: '+2 Production per 10 years past 40 (they age a year a day); counted as +2 over a month' },
  wornOut: { weight: 10, bad: true, note: '−2 Production per 10 years past 50 (they age a year a day); counted as −1 over a month' },
  patriot: { weight: 10, note: '+2 Production, +10 happiness in a core region of their own country' },
  homesick: { weight: 10, bad: true, note: '−2 Production, −10 happiness outside their own country' },
  expat: { weight: 10, note: '+2 Production outside their own country' },
  taxShy: { weight: 10, bad: true, note: '−1 % per 1 % employee tax (up to −30 %)' },
  statist: { weight: 10, note: '+2 Responsibility when employee tax is 20 % or more' },
  greedy: { weight: 10, bad: true, note: 'expects 20 % more pay' },
  modest: { weight: 10, note: 'expects 15 % less pay' },
  climber: { weight: 10, bad: true, note: 'expected pay grows 2 % a week' },
  loyal: { weight: 5, note: 'happiness losses halved' },
  flightRisk: { weight: 10, bad: true, note: 'quits below 50 happiness, not 30' },
  anchor: { weight: 5, note: 'never quits, but −50 % while unhappy' },
  scavenger: { weight: 2, note: 'twice the toolbox chance, −25 % Production' },
  salvager: { weight: 5, note: 'finds toolboxes even with storage full' },
  gambler: { weight: 10, note: '+3 Luck, −15 % Production' },
  luckyCharm: { weight: 5, note: 'every coworker +3 Luck (toolboxes, training draws, events)' },
  jinx: { weight: 10, bad: true, note: 'every coworker −2 Luck' },
  recruiter: { weight: 2, note: '+1 candidate on your daily shortlist' },
  trainer: { weight: 5, note: 'every coworker can train once more a day' },
};
// The game's names where its code says something else.
const NAMES = { manHater: 'Misandrist', taxShy: 'Tax-shy', diamondInTheRough: 'Diamond in the Rough', primaDonna: 'Prima Donna', bandOfBrothers: 'Band of Brothers', creatureOfHabit: 'Creature of Habit' };
export const traitName = (code) => NAMES[code] ?? String(code).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

// Event-only traits (a named partner): never on a candidate.
const EVENT_ONLY = new Set(['oldFriends', 'nemesis', 'sweethearts']);

const HOURS = 24;
const OUTPUT_DIVISOR = 4;
const AVERAGE_STAT = 2.5; // candidates roll 1–4
// Production a newcomer typically gains from training in their first weeks (drills add 1–4).
const TRAINED = 2;

/** How likely a candidate is to have this trait (half have none). */
export function traitChance(code, gender) {
  const fits = (t) => !t.gender || !gender || t.gender === gender;
  const total = Object.values(TRAITS).filter(fits).reduce((s, t) => s + t.weight, 0);
  return TRAITS[code] && fits(TRAITS[code]) ? 0.5 * (TRAITS[code].weight / total) : 0;
}

/**
 * What an employee's traits and their coworkers' traits do to them, given
 * who they work with: { prod, resp, percent, happy } (happy as raw gains
 * and losses, before Responsibility's shield).
 */
function effects(e, coworkers, place) {
  const out = { prod: 0, resp: 0, percent: 0, gain: 0, loss: 0 };
  const happy = (v) => { if (v > 0) out.gain += v; else out.loss += v; };
  const has = (t) => e.traits.includes(t);
  const n = coworkers.length;
  const foreign = coworkers.filter((c) => c.nationality !== e.nationality);
  if (has('nationalist') && n && coworkers.length - foreign.length >= n / 2) { out.resp += 2; happy(5); }
  if (has('xenophobe') && foreign.length) { out.prod -= 2; happy(-5); }
  if (has('cosmopolitan')) out.prod += Math.min(4, 2 * new Set(foreign.map((c) => c.nationality)).size);
  if (has('loner') && !n) { out.percent += 100; happy(5); }
  if (has('sociable')) { out.percent += Math.min(50, 25 * n); if (!n) happy(-10); }
  if (has('comic') && n) out.prod -= 1;
  if (has('mentor') && coworkers.some((c) => c.prod < e.prod)) out.prod -= 1;
  if (has('rival')) out.prod += coworkers.some((c) => c.prod > e.prod) ? 3 : -1;
  if (has('primaDonna')) { if (coworkers.every((c) => c.wage < e.wage)) out.percent += 20; else happy(-10); }
  if (has('bully') && n) out.prod += 2;
  if (has('envious')) happy(-Math.min(10, 5 * coworkers.filter((c) => c.wage > e.wage).length));
  const of = (g) => coworkers.filter((c) => c.gender === g).length;
  if (has('girlPower')) out.percent += Math.min(30, 15 * of('female'));
  if (has('bandOfBrothers')) out.percent += Math.min(30, 15 * of('male'));
  if (has('manHater')) out.percent -= Math.min(30, 15 * of('male'));
  if (has('misogynist')) out.percent -= Math.min(30, 15 * of('female'));
  // Their good is one of about 20: it matches this company's about 1 time in 20.
  if (has('specialist')) { out.prod += 3 / 20; happy(5 / 20); }
  if (has('craftsman')) out.prod += place.raw ? -1 : 3;
  if (has('laborer')) out.prod += place.raw ? 3 : -1;
  if (has('claustrophobe') && place.storage <= 2) out.percent -= 20;
  if (has('veteran')) out.percent += 10;
  if (has('diamondInTheRough')) out.prod += 2 / 3;
  if (has('burnout')) out.prod -= 1;
  if (has('lateBloomer')) out.prod += 2;
  if (has('wornOut')) out.prod -= 1;
  if (has('patriot') && place.homeCountry === e.nationality) { out.prod += 2; happy(10); }
  if (has('homesick') && place.country !== e.nationality) { out.prod -= 2; happy(-10); }
  if (has('expat') && place.country !== e.nationality) out.prod += 2;
  if (has('taxShy')) out.percent -= Math.min(30, place.tax);
  if (has('statist') && place.tax >= 20) out.resp += 2;
  if (has('improviser') && !e.tool) out.percent += 25;
  if (has('handy') && e.tool) out.percent += 40;
  if (has('scavenger')) out.percent -= 25;
  if (has('gambler')) out.percent -= 15;
  for (const c of coworkers) {
    if (c.traits.includes('comic')) happy(10);
    if (c.traits.includes('bully')) happy(-10);
    if (c.traits.includes('foreman')) out.resp += 3;
    if (c.traits.includes('mentor') && e.prod < c.prod) out.prod += 2;
  }
  return out;
}

/** Points per day from stats and bonus, with happiness held in 0–100. */
function pointsOf(e, fx) {
  const shield = Math.min(1, Math.max(0, (e.resp + fx.resp) / 10));
  const lossFactor = (1 - shield) * (e.traits.includes('loyal') ? 0.5 : 1);
  const happiness = Math.max(0, Math.min(100, e.happinessBase + fx.gain + fx.loss * lossFactor));
  const prod = Math.max(1, e.prodBase + fx.prod);
  return (prod / OUTPUT_DIVISOR) * HOURS * (1 + (e.bonusBase + fx.percent + happiness - 50) / 100);
}

/**
 * The company as the model needs it. employees: from the game (eco.svelte.js),
 * place: { raw, storage, country, homeCountry, tax }, value per point, and
 * the fair wage per Production point per day.
 */
export function companyModel(employees, place, { perPoint, fairWage, management = 0 }) {
  // Each employee's numbers with today's trait effects taken out, so they can be put back for any team.
  const team = employees.map((e) => {
    const base = { ...e, traits: e.traits.filter(Boolean), prod: e.production, resp: e.stats?.responsibility?.total ?? AVERAGE_STAT, wage: e.payroll, tool: e.hasTool };
    const now = effects(base, employees.filter((c) => c !== e).map(asCoworker), place);
    const happinessNow = e.happiness?.value ?? 50;
    const shieldNow = Math.min(1, base.resp / 10);
    return {
      ...base,
      prodBase: base.prod - now.prod,
      resp: base.resp - now.resp,
      bonusBase: e.bonusPercent - now.percent - (happinessNow - 50),
      happinessBase: happinessNow - now.gain - now.loss * (1 - shieldNow) * (base.traits.includes('loyal') ? 0.5 : 1),
    };
  });
  // What a newcomer starts with: the company-wide bonuses (Management, core region), today's tax mood.
  const shared = employees[0]?.bonus?.filter((b) => b.source === 'management' || b.source === 'coreRegion').reduce((s, b) => s + b.percent, 0) ?? management;
  // A company whose employees hold tools gives the newcomer one too.
  return { team, place: { ...place, tools: place.tools ?? employees.some((e) => e.hasTool) }, perPoint, fairWage, shared };
}

// Traits whose effect depends on who the coworkers are: only these can match or clash with a team.
const TEAM_TRAITS = new Set(['nationalist', 'xenophobe', 'cosmopolitan', 'loner', 'sociable', 'comic', 'mentor', 'foreman', 'rival', 'primaDonna', 'bully', 'envious', 'girlPower', 'bandOfBrothers', 'manHater', 'misogynist', 'luckyCharm', 'jinx', 'trainer']);

/**
 * How much more a trait is worth here than next to plain coworkers (no
 * traits, no gender, all of one other nationality): what it gains or loses by
 * matching this team. G per day; 0 for traits that don't depend on coworkers.
 */
export function teamMatch(model, profile, options = {}) {
  if (!TEAM_TRAITS.has(profile.trait)) return 0;
  const plain = { ...model, team: model.team.map((e) => ({ ...e, traits: [], nationality: '(plain)', gender: null })) };
  const gain = (m) => hireValue(m, profile, options).value - hireValue(m, { ...profile, trait: null }, options).value;
  return gain(model) - gain(plain);
}

/**
 * The traits to look for and to avoid in this company, for a newcomer of
 * this nationality and gender: team matches first (by what they add), then
 * the tier list (S first), leaving out what this company can't use (Craftsman
 * on raw goods, …). Each: { trait, tier, gain (G/day vs no trait), match }.
 */
export function rankTraits(model, profile, options = {}) {
  const none = hireValue(model, { ...profile, trait: null }, options).value;
  const rows = Object.keys(TRAITS)
    .filter((t) => !EVENT_ONLY.has(t) && (!TRAITS[t].gender || TRAITS[t].gender === profile.gender))
    .map((t) => ({ trait: t, tier: tierOf(t), gain: hireValue(model, { ...profile, trait: t }, options).value - none, match: teamMatch(model, { ...profile, trait: t }, options) }));
  const byTier = (a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || b.gain - a.gain;
  // A match must be worth having (a Xenophobe among compatriots avoids a loss, but adds nothing), and come
  // mostly from the team: at least a quarter of its value (not just a happy team making every trait worth a bit more).
  const isMatch = (r) => r.match >= Math.max(MATCH, r.gain / 4) && r.gain >= MATCH;
  const isClash = (r) => r.match <= Math.min(-MATCH, r.gain / 4) && r.gain <= -MATCH;
  const matches = rows.filter(isMatch).sort((a, b) => b.gain - a.gain);
  const clashes = rows.filter(isClash).sort((a, b) => a.gain - b.gain);
  const rest = rows.filter((r) => !isMatch(r) && !isClash(r));
  return {
    matches,
    clashes,
    // Good tiers that work here (no loss in this company), then the bad tiers.
    lookFor: rest.filter((r) => TIER_RANK[r.tier] <= TIER_RANK.B && r.gain >= -0.005).sort(byTier),
    avoid: rest.filter((r) => TIER_RANK[r.tier] >= TIER_RANK.E || r.gain < -0.2).sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || a.gain - b.gain),
  };
}
// A team match worth naming, G per day.
const MATCH = 0.2;

function asCoworker(e) {
  return { nationality: e.nationality, gender: e.gender, traits: (e.traits ?? []).filter(Boolean), prod: e.prod ?? e.production, wage: e.wage ?? e.payroll };
}

/** Points per day of the whole team, each with the effects of the rest. */
function teamPoints(team, place) {
  return team.map((e) => pointsOf(e, effects(e, team.filter((c) => c !== e), place)));
}

/** A typical candidate with this nationality, gender and trait. */
function candidate(model, { nationality, gender, trait }) {
  const markup = trait === 'greedy' ? 1.2 : trait === 'modest' ? 0.85 : 1;
  const production = AVERAGE_STAT + TRAINED;
  return {
    id: 'new', name: 'New hire', nationality, gender, traits: trait ? [trait] : [], tool: !!model.place.tools,
    prodBase: production, prod: production, resp: AVERAGE_STAT,
    bonusBase: model.shared, happinessBase: 50 - model.place.tax,
    wage: model.fairWage * production * markup,
  };
}

/**
 * What hiring this profile changes, per day: points (the newcomer's and
 * every coworker's change), G (points × value − the newcomer's wage), and
 * each coworker's change in points. With `replace` (an index), that employee
 * leaves for the newcomer: their points and wage go with them.
 */
export function hireValue(model, profile, { replace = null } = {}) {
  const before = teamPoints(model.team, model.place);
  const newcomer = candidate(model, profile);
  const stay = model.team.filter((_, i) => i !== replace);
  const after = teamPoints([...stay, newcomer], model.place);
  const coworkers = stay.map((e, i) => ({ name: e.name, traits: e.traits, change: after[i] - before[model.team.indexOf(e)] }));
  const own = after.at(-1);
  const leaving = replace == null ? null : model.team[replace];
  const points = own + coworkers.reduce((s, c) => s + c.change, 0) - (leaving ? before[replace] : 0);
  const wage = newcomer.wage - (leaving ? leaving.wage : 0);
  return { points, own, coworkers, wage, replaces: leaving?.name ?? null, value: points * model.perPoint - wage };
}

/**
 * The best next hire: every nationality worth trying (each one already in
 * the company, the company's country, and any other), both genders, and every
 * trait a candidate can have (or none), ranked by G per day. A full company
 * (`full`) hires by replacing someone: each employee is tried as the one
 * who leaves.
 */
export function bestHires(model, { otherNationality = 'other', full = false } = {}) {
  const nationalities = [...new Set([...model.team.map((e) => e.nationality), model.place.country, model.place.homeCountry, otherNationality].filter(Boolean))];
  const traits = [null, ...Object.keys(TRAITS).filter((t) => !EVENT_ONLY.has(t))];
  const slots = full ? model.team.map((_, i) => i) : [null];
  const all = [];
  for (const nationality of nationalities) {
    for (const gender of ['male', 'female']) {
      for (const trait of traits) {
        if (trait && TRAITS[trait].gender && TRAITS[trait].gender !== gender) continue;
        let best = null;
        for (const replace of slots) {
          const r = hireValue(model, { nationality, gender, trait }, { replace });
          if (!best || r.value > best.value) best = r;
        }
        all.push({ nationality, gender, trait, ...best });
      }
    }
  }
  all.sort((a, b) => b.value - a.value);
  return all;
}

/**
 * Training cards for one employee, by what they add per day: removing each
 * bad trait (Rehab), teaching the best good trait (New habit), +1 Production
 * (Drill) and a 10 % lower wage expectation (Negotiation).
 */
export function trainingCards(model, index) {
  const before = teamPoints(model.team, model.place).reduce((s, x) => s + x, 0);
  const valueOf = (team) => (teamPoints(team, model.place).reduce((s, x) => s + x, 0) - before) * model.perPoint;
  const e = model.team[index];
  const swap = (changed) => model.team.map((x, i) => (i === index ? { ...x, ...changed } : x));
  const cards = [];
  cards.push({ card: 'Drill', what: '+1 Production', value: valueOf(swap({ prodBase: e.prodBase + 1, prod: e.prod + 1 })) - model.fairWage * (e.wageExpectation ?? 1) });
  // The middle Negotiation card: 0.1 off the wage expectation (it can't go below 0.7).
  if (e.wageExpectation && e.wageExpectation - 0.1 >= 0.7) cards.push({ card: 'Negotiation', what: '−0.1 wage expectation', value: (e.wage / e.wageExpectation) * 0.1 });
  for (const t of e.traits) {
    const gain = valueOf(swap({ traits: e.traits.filter((x) => x !== t) }));
    const wage = t === 'greedy' ? e.wage - e.wage / 1.2 : t === 'modest' ? e.wage - e.wage / 0.85 : 0;
    if (gain + wage > 0.005) cards.push({ card: 'Rehab', what: `remove ${t}`, trait: t, value: gain + wage });
  }
  if (e.traits.length < 2) {
    let best = null;
    for (const t of Object.keys(TRAITS)) {
      if (EVENT_ONLY.has(t) || e.traits.includes(t) || TRAITS[t].bad || (TRAITS[t].gender && TRAITS[t].gender !== e.gender)) continue;
      const wage = t === 'modest' ? e.wage * 0.15 : 0;
      const v = valueOf(swap({ traits: [...e.traits, t] })) + wage;
      if (!best || v > best.value) best = { card: 'New habit', what: `learn ${t}`, trait: t, value: v };
    }
    if (best && best.value > 0.005) cards.push(best);
  }
  return cards.sort((a, b) => b.value - a.value);
}
