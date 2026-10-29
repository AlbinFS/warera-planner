/**
 * Who to hire next, and which training cards pay, for one company.
 *
 * The game's employee rules (its web app's config, 2026-10-27):
 *   points per day   = Production ÷ 4 × 24 × (1 + bonus %)
 *   bonus %          = Management + core region (+5 in a core region of
 *                      the owner's country, held or not) + tool
 *                      + specialization + percentage traits + (happiness − 50)
 *   happiness        = 50 + every reason (the region's country's income tax,
 *                      −1 a %, and −5 while the region is attacked, among
 *                      them); Responsibility shields losses, Responsibility
 *                      ÷ 10 of each (all of it at 10)
 *   wage per day     = fair wage per Production point × (base + trained
 *                      Production) × wage expectation (Greedy +20 %,
 *                      Modest −15 %)
 *   candidates       = stats 1–4, at most one trait (half have none), drawn
 *                      by each trait's weight
 *
 * Firing someone costs every coworker still there 5 happiness for 24 hours
 * (firing again restarts that timer, it doesn't stack); a moved employee loses
 * 5 for 7 days and can't be fired for 24 hours. Those are passing: an employee
 * is valued without them, and a replacement shows the firing as a one-time cost.
 *
 * A hire is scored by what the whole company makes after it: the newcomer's
 * own points plus every coworker's change (a Xenophobe next to a foreigner,
 * a Comic lifting everyone's mood, …), at the good's value per point, minus
 * the newcomer's wage. Traits that only pay off over weeks are counted over
 * the days the employee has left; Luck by the toolboxes it finds
 * (toolboxValue: G a toolbox is worth to these companies); retention at none.
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
  sociable: { mixed: true, weight: 10, note: '+25 % per coworker (up to +50 %), −10 happiness alone' },
  comic: { mixed: true, weight: 10, note: 'every coworker +10 happiness; −1 Production themselves' },
  mentor: { mixed: true, weight: 2, note: 'every weaker coworker +2 Production; −1 themselves' },
  foreman: { weight: 5, note: 'every coworker +3 Responsibility' },
  rival: { mixed: true, weight: 5, note: '+3 Production when someone out-produces them, −1 at the top' },
  primaDonna: { mixed: true, weight: 5, note: '+20 % when paid more than every coworker, else −10 happiness' },
  bully: { mixed: true, weight: 5, note: '+2 Production; every coworker −10 happiness' },
  envious: { weight: 10, bad: true, note: '−5 happiness per better-paid coworker (up to −10)' },
  girlPower: { weight: 5, gender: 'female', note: '+15 % per female coworker (up to +30 %)' },
  bandOfBrothers: { weight: 5, gender: 'male', note: '+15 % per male coworker (up to +30 %)' },
  manHater: { weight: 5, gender: 'female', bad: true, note: '−15 % per male coworker (up to −30 %)' },
  misogynist: { weight: 5, gender: 'male', bad: true, note: '−15 % per female coworker (up to −30 %)' },
  specialist: { weight: 10, note: '+3 Production, +5 happiness making their own good (named on the card); unknown, about 1 in 20 matches yours' },
  craftsman: { mixed: true, weight: 10, note: '+3 Production on manufactured goods, −1 on raw' },
  laborer: { mixed: true, weight: 10, note: '+3 Production on raw resources, −1 on manufactured' },
  quickStudy: { weight: 10, note: 'specializes twice as fast (20 % in 10 days, not 20)' },
  stockpiler: { weight: 10, note: 'no penalty when storage is full' },
  claustrophobe: { weight: 5, bad: true, note: '−20 % with storage at level 2 or lower' },
  sprinter: { weight: 5, note: '+50 % in their first day only' },
  veteran: { weight: 5, note: '+20 % after 30 days in the company; counted as +10 % (about a month in, they may ask to retire)' },
  creatureOfHabit: { weight: 10, bad: true, note: '−30 % for 3 days after a move' },
  diamondInTheRough: { weight: 2, note: '+1 to a stat (named on them) every 10 days, up to +4; counted as +2 to a random stat' },
  burnout: { weight: 2, bad: true, note: '−1 to every stat every 20 days (up to −3); counted as −1 Production' },
  lateBloomer: { weight: 5, note: '+2 Production per 10 years past 40, up to +6 (they age a year a day); counted at their age halfway through the next 20 days' },
  wornOut: { weight: 10, bad: true, note: '−2 Production per 10 years past 50, up to −6 (they age a year a day); counted at their age halfway through the next 20 days' },
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
  anchor: { mixed: true, weight: 5, note: 'never quits, but −50 % while unhappy' },
  scavenger: { mixed: true, weight: 2, note: 'twice the toolbox chance, −25 % Production' },
  salvager: { weight: 5, note: 'finds toolboxes even with storage full' },
  gambler: { mixed: true, weight: 10, note: '+3 Luck, −15 % Production' },
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

// Traits the game never puts together (its web app's config, 2026-10-28): no card teaches one to
// someone who has the other.
const CLASHES = [['handy', 'improviser'], ['loner', 'sociable'], ['cosmopolitan', 'xenophobe'], ['comic', 'bully'], ['craftsman', 'laborer'],
  ['expat', 'homesick'], ['statist', 'taxShy'], ['sprinter', 'creatureOfHabit'], ['sprinter', 'veteran'], ['diamondInTheRough', 'burnout'],
  ['greedy', 'modest'], ['flightRisk', 'anchor'], ['luckyCharm', 'jinx'], ['scavenger', 'handy']];
/** Whether someone with these traits can gain this one (not already theirs, no clash, their gender). */
export function canGain(code, traits, gender) {
  const t = TRAITS[code];
  if (!t || EVENT_ONLY.has(code) || traits.includes(code)) return false;
  if (t.gender && gender && t.gender !== gender) return false;
  return !CLASHES.some(([a, b]) => (a === code && traits.includes(b)) || (b === code && traits.includes(a)));
}

const HOURS = 24;
const OUTPUT_DIVISOR = 4;
const AVERAGE_STAT = 2.5; // candidates roll 1–4
// Employees ask to retire at 65; a year passes a day.
export const RETIRE_AGE = 65;
// Production a newcomer typically gains from training in their first weeks (drills add 1–4).
const TRAINED = 2;
// Firing: every coworker −5 happiness for a day. Happiness reasons that pass (the game gives them an end time).
const FIRED_HAPPINESS = 5;
const FIRED_MS = 24 * 3600e3;
// A moved employee: −5 happiness for 7 days, and can't be fired for the first 24 hours of it.
const MOVED_MS = 7 * 24 * 3600e3;
const PASSING = new Set(['coworkerFired', 'recentlyMoved']);
// A core region of the owner's country: +5 % on every employee.
const CORE_PERCENT = 5;
// Moving the company: every employee −10 happiness for 7 days.
const COMPANY_MOVE_HAPPINESS = 10;
const COMPANY_MOVE_DAYS = 7;

/** How likely a candidate is to have this trait (half have none). */
export function traitChance(code, gender) {
  const fits = (t) => !t.gender || !gender || t.gender === gender;
  const total = Object.values(TRAITS).filter(fits).reduce((s, t) => s + t.weight, 0);
  return TRAITS[code] && fits(TRAITS[code]) ? 0.5 * (TRAITS[code].weight / total) : 0;
}

/**
 * What an employee's traits and their coworkers' traits do to them, given
 * who they work with: { prod, resp, luck, percent, gain, loss } (gain and
 * loss: happiness, before Responsibility's shield).
 */
function effects(e, coworkers, place) {
  const out = { prod: 0, resp: 0, luck: 0, percent: 0, gain: 0, loss: 0 };
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
  // Their good is on them (rolled); unknown, it matches this company's about 1 time in 20.
  if (has('specialist')) {
    const good = e.traitArgs?.specialist;
    const share = good ? (good === place.good ? 1 : 0) : 1 / 20;
    out.prod += 3 * share;
    happy(5 * share);
  }
  if (has('craftsman')) out.prod += place.raw ? -1 : 3;
  if (has('laborer')) out.prod += place.raw ? 3 : -1;
  if (has('claustrophobe') && place.storage <= 2) out.percent -= 20;
  // +20 % once 30 days in the company: its share of the days they have left (+10 % when not known).
  if (has('veteran')) {
    const left = e.daysLeft;
    out.percent += left == null ? 10 : left > 0 ? (20 * Math.max(0, left - Math.max(0, 30 - (e.tenure ?? 0)))) / left : 0;
  }
  if (has('diamondInTheRough')) out.prod += 2 / 3;
  if (has('burnout')) out.prod -= 1;
  // Age-based traits at the age they reach halfway through the next 20 days (a year passes a day); +2 / −1 when the age is unknown.
  const age = e.age != null ? e.age + Math.min(10, Math.max(0, (RETIRE_AGE - e.age) / 2)) : null;
  if (has('lateBloomer')) out.prod += age == null ? 2 : Math.min(6, 2 * Math.max(0, Math.floor((age - 40) / 10)));
  if (has('wornOut')) out.prod -= age == null ? 1 : Math.min(6, 2 * Math.max(0, Math.floor((age - 50) / 10)));
  // The place itself: its country's income tax, an attack on the region, a core region of the owner's country.
  if (place.tax) happy(-place.tax);
  if (place.attacked) happy(-place.attacked);
  if (place.core) out.percent += CORE_PERCENT;
  if (has('patriot') && place.homeCountry === e.nationality) { out.prod += 2; happy(10); }
  if (has('homesick') && place.country !== e.nationality) { out.prod -= 2; happy(-10); }
  if (has('expat') && place.country !== e.nationality) out.prod += 2;
  if (has('taxShy')) out.percent -= Math.min(30, place.tax);
  if (has('statist') && place.tax >= 20) out.resp += 2;
  if (has('improviser') && !e.tool) out.percent += 25;
  if (has('handy') && e.tool) out.percent += 40;
  if (has('scavenger')) out.percent -= 25;
  if (has('gambler')) { out.percent -= 15; out.luck += 3; }
  for (const c of coworkers) {
    if (c.traits.includes('comic')) happy(10);
    if (c.traits.includes('bully')) happy(-10);
    if (c.traits.includes('foreman')) out.resp += 3;
    if (c.traits.includes('mentor') && e.prod < c.prod) out.prod += 2;
    if (c.traits.includes('luckyCharm')) out.luck += 3;
    if (c.traits.includes('jinx')) out.luck -= 2;
  }
  // Pairs made by employee events, while the other one works here too (its id on the trait, else anyone).
  for (const [rel, percent] of RELATIONS) {
    if (!has(rel)) continue;
    const other = e.traitArgs?.[rel];
    if (coworkers.some((c) => !other || c.id === other)) out.percent += percent;
  }
  return out;
}
// The game's relation traits: Old Friends +15 %, Sweethearts +20 %, Nemesis −15 % output.
const RELATIONS = [['oldFriends', 15], ['sweethearts', 20], ['nemesis', -15]];

// Luck finds toolboxes: 0.1 % an hour per point, at most 2 % an hour (Scavenger twice as likely).
const TOOLBOX_PER_POINT = 0.001;
const TOOLBOX_MAX = 0.02;
/** Toolboxes a day an employee finds at this Luck. */
export function toolboxesPerDay(luck, traits = []) {
  const times = traits.includes('scavenger') ? 2 : 1;
  return HOURS * Math.min(TOOLBOX_MAX * times, Math.max(0, luck) * TOOLBOX_PER_POINT * times);
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
 * Where a company works: its good (raw or manufactured), storage, country
 * (who holds the region now), home country (whose core region it is), the
 * income tax, and whether it's a core region of the owner's country (`home`:
 * the owner's country; unknown without it, and then read from the employees).
 */
export function placeOf(company, { regions = {}, countries = {}, items = {}, home = null } = {}) {
  const region = regions[company.region];
  return {
    good: company.good ?? null,
    raw: items[company.good]?.type === 'raw',
    storage: company.storage ?? 1,
    country: region?.country ?? null,
    homeCountry: region?.initialCountry ?? null,
    tax: countries[region?.country]?.taxes?.income ?? 0,
    attacked: 0,
    core: home && region ? region.initialCountry === home : null,
  };
}

/**
 * The place as the employees feel it now, where the game says so: the income
 * tax and an attack from their happiness reasons, the core region from their bonus.
 */
function livePlace(employees, place) {
  const reasons = employees.flatMap((e) => e.happiness?.reasons ?? []);
  const tax = reasons.find((r) => r.reason === 'incomeTax');
  const attacked = reasons.find((r) => r.reason === 'regionAttacked');
  const core = employees.length && employees.some((e) => e.bonus) ? employees.some((e) => (e.bonus ?? []).some((b) => b.source === 'coreRegion')) : place.core;
  return { ...place, tax: tax ? -tax.delta : place.tax ?? 0, attacked: attacked ? -attacked.delta : place.attacked ?? 0, core: !!core };
}

/** Fair wage per Production point per day, from what employees are paid (median). */
export function fairWageOf(employees) {
  const markup = (traits = []) => (traits.includes('greedy') ? 1.2 : 1) * (traits.includes('modest') ? 0.85 : 1);
  const per = employees.filter((e) => e.wageExpectation > 0 && e.ownProduction > 0).map((e) => e.payroll / (e.wageExpectation * e.ownProduction * markup(e.traits ?? []))).sort((a, b) => a - b);
  return per.length ? per[per.length >> 1] : 0.6;
}

/**
 * The company as the model needs it. employees: from the game (eco.svelte.js),
 * place: { raw, storage, country, homeCountry, tax }, value per point, and
 * the fair wage per Production point per day.
 */
export function companyModel(employees, placeIn, { perPoint, fairWage, management = 0, toolboxValue = 0, now: at = Date.now() }) {
  const place = livePlace(employees, placeIn);
  // Each employee's numbers with today's trait effects taken out, so they can be put back for any team.
  const team = employees.map((e) => {
    const base = {
      ...e, traits: e.traits.filter(Boolean), prod: e.production, resp: e.stats?.responsibility?.total ?? AVERAGE_STAT, wage: e.payroll, tool: e.hasTool,
      daysLeft: daysLeftOf(e, at), tenure: e.hiredAt ? Math.max(0, (at - Date.parse(e.hiredAt)) / DAY) : null,
    };
    const now = effects(base, employees.filter((c) => c !== e).map(asCoworker), place);
    const happinessNow = e.happiness?.value ?? 50;
    const shieldNow = Math.min(1, base.resp / 10);
    const lossNow = (1 - shieldNow) * (base.traits.includes('loyal') ? 0.5 : 1);
    // A recent firing or move: real today, gone in a day or a week, so not part of what they're worth.
    const reasons = e.happiness?.reasons ?? [];
    const passing = reasons.filter((r) => PASSING.has(r.reason) && r.until && Date.parse(r.until) > at).reduce((s, r) => s + r.delta, 0);
    const moved = reasons.find((r) => r.reason === 'recentlyMoved' && r.until);
    return {
      ...base,
      prodBase: base.prod - now.prod,
      resp: base.resp - now.resp,
      luckBase: (e.stats?.luck?.total ?? AVERAGE_STAT) - now.luck,
      bonusBase: e.bonusPercent - now.percent - (happinessNow - 50),
      happinessBase: happinessNow - now.gain - (now.loss + Math.min(0, passing)) * lossNow,
      // Moved less than 24 hours ago: the game won't let them be fired yet.
      fireBlocked: !!moved && Date.parse(moved.until) - MOVED_MS + FIRED_MS > at,
    };
  });
  // A firing whose 24 hours are still running: firing again only restarts it.
  const firedUntil = Math.max(0, ...employees.flatMap((e) => (e.happiness?.reasons ?? []).filter((r) => r.reason === 'coworkerFired' && r.until).map((r) => Date.parse(r.until))));
  // What a newcomer starts with: Management (the place's core region, tax and attacks come from the place).
  const shared = employees[0]?.bonus?.filter((b) => b.source === 'management').reduce((s, b) => s + b.percent, 0) ?? management;
  // A company whose employees hold tools gives the newcomer one too.
  return { team, place: { ...place, tools: place.tools ?? employees.some((e) => e.hasTool) }, perPoint, fairWage, shared, toolboxValue, firedFraction: 1 - Math.min(FIRED_MS, Math.max(0, firedUntil - at)) / FIRED_MS };
}

const DAY = 864e5;
/** Days an employee has before asking to retire: the game's date, else from their age (a year a day); null when unknown. */
export function daysLeftOf(e, now = Date.now()) {
  if (e.retireAt) return Math.max(0, (Date.parse(e.retireAt) - now) / DAY);
  return e.age != null ? Math.max(0, RETIRE_AGE - e.age) : null;
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
  return { id: e.id, nationality: e.nationality, gender: e.gender, traits: (e.traits ?? []).filter(Boolean), prod: e.prod ?? e.production, wage: e.wage ?? e.payroll };
}

/** Points per day of the whole team, each with the effects of the rest. */
function teamPoints(team, place) {
  return team.map((e) => pointsOf(e, effects(e, team.filter((c) => c !== e), place)));
}

/** Production points a day of a whole team at a place (switching.js: the same team making another good). */
export const teamPointsAt = (team, place) => teamPoints(team, place).reduce((s, x) => s + x, 0);

/** Toolboxes a day the whole team finds. */
function teamToolboxes(team, place) {
  return team.reduce((t, e) => t + toolboxesPerDay((e.luckBase ?? AVERAGE_STAT) + effects(e, team.filter((c) => c !== e), place).luck, e.traits), 0);
}

/** What the team makes a day in G (points and toolboxes), wages not counted. */
const teamWorth = (model, team) => teamPoints(team, model.place).reduce((s, x) => s + x, 0) * model.perPoint + teamToolboxes(team, model.place) * (model.toolboxValue ?? 0);

/**
 * What changing one employee adds a day, coworkers included, before wages:
 * `change(e)` gives the fields that change (stats, traits). G a day.
 */
export function changeValue(model, index, change) {
  const team = model.team.map((x, i) => (i === index ? { ...x, ...change(x) } : x));
  if (!worthNow.has(model)) worthNow.set(model, teamWorth(model, model.team));
  return teamWorth(model, team) - worthNow.get(model);
}
const worthNow = new WeakMap();

/** changeValue for several employees at once: changes { index: (e) => fields }. G a day, before wages. */
export function changesValue(model, changes) {
  const team = model.team.map((x, i) => (changes[i] ? { ...x, ...changes[i](x) } : x));
  if (!worthNow.has(model)) worthNow.set(model, teamWorth(model, model.team));
  return teamWorth(model, team) - worthNow.get(model);
}

/**
 * What one employee is worth to the company a day, beyond their own output:
 * the team with them against the team without them. own: their points (with
 * what coworkers do to them); others: what they change for every coworker (a
 * Comic's mood, a Xenophobe's drag, Girl Power, …); toolboxes: what their Luck
 * finds (and does to others' Luck); minus their wage. G a day.
 * coworkers: [{ name, change (G a day) }].
 */
export function employeeWorth(model, index) {
  const before = teamPoints(model.team, model.place);
  const rest = model.team.filter((_, i) => i !== index);
  const without = teamPoints(rest, model.place);
  const coworkers = rest.map((c, i) => ({ name: c.name, change: (before[model.team.indexOf(c)] - without[i]) * model.perPoint }));
  const own = before[index] * model.perPoint;
  const others = coworkers.reduce((s, c) => s + c.change, 0);
  const toolboxes = (teamToolboxes(model.team, model.place) - teamToolboxes(rest, model.place)) * (model.toolboxValue ?? 0);
  const wage = model.team[index].wage ?? 0;
  return { own, others, toolboxes, wage, value: own + others + toolboxes - wage, coworkers };
}

/** A typical candidate with this nationality, gender and trait. */
/**
 * A candidate: a typical one (average stats, a little training, a fair wage),
 * or one from a real card when `production` is given: { production,
 * responsibility, expectation (0.7–1.3, the card's hint), age }.
 */
function candidate(model, { nationality, gender, trait, production, responsibility, luck, expectation = 1, age = null, specialistGood = null }) {
  const markup = trait === 'greedy' ? 1.2 : trait === 'modest' ? 0.85 : 1;
  const own = production ?? AVERAGE_STAT + TRAINED;
  return {
    id: 'new', name: 'New hire', nationality, gender, age, traits: trait ? [trait] : [], tool: !!model.place.tools,
    traitArgs: trait === 'specialist' && specialistGood ? { specialist: specialistGood } : {},
    prodBase: own, prod: own, resp: responsibility ?? AVERAGE_STAT, luckBase: luck ?? AVERAGE_STAT,
    daysLeft: age != null ? Math.max(0, RETIRE_AGE - age) : null, tenure: 0,
    bonusBase: model.shared, happinessBase: 50,
    wage: model.fairWage * own * expectation * markup,
  };
}

/** Who can be replaced: everyone but those moved in the last 24 hours (everyone, if that's nobody). */
function fireable(model) {
  const can = model.team.map((_, i) => i).filter((i) => !model.team[i].fireBlocked);
  return can.length ? can : model.team.map((_, i) => i);
}

/**
 * One real candidate for one company: what hiring them adds per day, or
 * (a full company) the best of replacing each employee with them.
 * { value, points, wage, replaces, coworkers, fireCost }.
 */
export function rateCandidate(model, profile, { full = false } = {}) {
  const slots = full ? fireable(model) : [null];
  let best = null;
  for (const replace of slots) {
    const r = hireValue(model, profile, { replace });
    if (!best || r.value > best.value) best = r;
  }
  return best;
}

/**
 * What hiring this profile changes, per day: points (the newcomer's and
 * every coworker's change), G (points × value − the newcomer's wage), and
 * each coworker's change in points (newWage: the newcomer's own). With `replace` (an index), that employee
 * leaves for the newcomer: their points and wage go with them, and firing them
 * costs once what the coworkers don't make while 5 happiness down for 24 hours
 * (fireCost, G; less while an earlier firing's 24 hours still run).
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
  // Toolboxes Luck finds (Gambler, Lucky Charm, Jinx), at what one is worth here.
  const toolboxes = (teamToolboxes([...stay, newcomer], model.place) - teamToolboxes(model.team, model.place)) * (model.toolboxValue ?? 0);
  const fireCost = leaving ? firingCost(model, stay, newcomer) : 0;
  return { points, own, coworkers, wage, newWage: newcomer.wage, replaces: leaving?.name ?? null, toolboxes, value: points * model.perPoint + toolboxes - wage, fireCost, fireBlocked: !!leaving?.fireBlocked };
}

/**
 * The team elsewhere: what it makes a day at `place` (G, wages are the same
 * anywhere), and what moving there costs once: every employee 10 happiness
 * down for 7 days. The model's own place is where they are now.
 */
export function placeValue(model, place) {
  const at = { ...model.place, ...place, tools: model.place.tools };
  const team = model.team;
  const worth = teamWorth({ ...model, place: at }, team);
  const lost = team.reduce((s, e) => {
    const fx = effects(e, team.filter((c) => c !== e), at);
    return s + pointsOf(e, fx) - pointsOf(e, { ...fx, loss: fx.loss - COMPANY_MOVE_HAPPINESS });
  }, 0);
  return { worth, moveCost: lost * COMPANY_MOVE_DAYS * model.perPoint };
}

/** G the coworkers left behind don't make in the 24 hours a firing costs them 5 happiness (the newcomer, hired after, isn't hit). */
function firingCost(model, stay, newcomer) {
  const team = [...stay, newcomer];
  const lost = stay.reduce((s, e) => {
    const fx = effects(e, team.filter((c) => c !== e), model.place);
    return s + pointsOf(e, fx) - pointsOf(e, { ...fx, loss: fx.loss - FIRED_HAPPINESS });
  }, 0);
  return lost * model.perPoint * (model.firedFraction ?? 1);
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
  const slots = full ? fireable(model) : [null];
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
