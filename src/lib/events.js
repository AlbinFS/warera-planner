/**
 * Employee events: which answer to pick. Each answer is worth what it costs
 * plus what each of its results does, weighted by the result's chance, in G
 * for your company: the employees as hiring.js models them (their stats,
 * traits, happiness and coworkers), at the good's value per point.
 *
 * The rules are the game's own (employee-events.json, read from its
 * web app). A check's chance, as the game explains it:
 *   base + its trait modifiers
 *   + 2 % per level of your Management (v0.27.3: Leadership is part of it)
 *   + Luck: 4 % a point on a Luck check, 2 % on any other (v0.27.3: from the
 *     first point; the first 3 used to do nothing)
 *   + 1 % per 5 happiness above 50 (minus below)
 *   held in 5–90 %. A tenth of successes are critical, a tenth of failures
 *   critically bad (a fifth each for a Gambler).
 *
 * How results are valued (G):
 *   happiness: a point is 1 % output for its hours (losses halved for Loyal);
 *   production %: its share of output for its hours; away: no output for them;
 *   a stat point: what it adds a day over the days they have left, coworkers
 *     included (Production also raises the wage); if it uses Potential, less
 *     the training it takes the place of (that session's worth beyond self-work);
 *     with no Potential left the game gives +15 % for 72 h instead;
 *   training potential: one more training session's worth beyond self-work;
 *   experience: the specialization days it brings forward, up to 20 %;
 *   a trait: what it changes a day (coworkers too, Greedy's or Modest's pay),
 *     over the days left; a random one: the game's pool for it, by weight;
 *   leaving: what replacing them with a typical candidate changes a day;
 *   tool durability: days of their tool's bonus (it wears 4.8 a day);
 *   items at market prices (a toolbox at what one is worth to your companies);
 *   gold, wage expectation, energy (at what self-work makes with it);
 *   a follow-up event: its best answer, worked out the same way.
 * Not counted: quitting from low happiness, and the odds of later events.
 */
import DATA from './employee-events.json' with { type: 'json' };
import { changeValue, changesValue, hireValue, daysLeftOf, canGain, traitName } from './hiring.js';
import { trainingCards } from './training.js';
import { toolKindFor } from './staffing.js';

export const EVENTS = DATA.events;
export const TEXTS = DATA.texts;
export const POOLS = ['inspiration', 'crisis', 'social', 'life', 'cozy', 'world', 'legendary', 'chain'];

const DAYS_UNKNOWN = 33;
const SPEC_MAX = 20;
const TOOL_WEAR_PER_DAY = 100 / 500 * 24;
const TOOL_RANGES = [[3, 6], [7, 12], [13, 20], [21, 30], [31, 45], [46, 65]];
// The game's trait pools for a random trait (polarity, weight).
const POSITIVE = { bandOfBrothers: 5, cosmopolitan: 10, diamondInTheRough: 2, expat: 10, foreman: 5, girlPower: 5, handy: 5, improviser: 5, lateBloomer: 5, loner: 5, loyal: 5, luckyCharm: 5, modest: 10, nationalist: 10, patriot: 10, quickStudy: 10, recruiter: 2, salvager: 5, specialist: 10, earlyBloomer: 5, statist: 10, stockpiler: 10, trainer: 5, veteran: 5 };
const NEGATIVE = { burnout: 2, claustrophobe: 5, climber: 10, creatureOfHabit: 10, envious: 10, flightRisk: 10, greedy: 10, homesick: 10, jinx: 10, manHater: 5, misogynist: 5, taxShy: 10, wornOut: 10, xenophobe: 10 };
const RESULT = { crit: 'Critical success', success: 'Success', fail: 'Failure', critFail: 'Critical failure' };
export const resultLabel = (k) => RESULT[k] ?? k;

const markupOf = (traits) => (traits.includes('greedy') ? 1.2 : 1) * (traits.includes('modest') ? 0.85 : 1);

/**
 * The chance a check succeeds (0–1). who: the employee (traits, happiness,
 * stats.luck), partner (two-person events: their traits count too), management (the owner's level).
 */
export function checkChance(check, { who, partner = null, management = 0 }) {
  if (!check) return 1;
  const traits = [...(who?.traits ?? []), ...(partner?.traits ?? [])];
  const mods = Object.entries(check.traitMods ?? {}).reduce((s, [t, v]) => s + (traits.includes(t) ? v : 0), 0);
  const luck = who?.stats?.luck?.total ?? 3;
  const luckPer = check.type === 'luck' ? DATA.check.statPerPoint : DATA.check.luckPerPoint;
  const happiness = who?.happiness?.value ?? 50;
  const percent = check.base + mods + DATA.check.skillPerLevel * management
    + (luck - DATA.check.statPivot) * luckPer + (happiness - 50) / DATA.check.happinessDivisor;
  return Math.min(DATA.chance.max, Math.max(DATA.chance.min, percent)) / 100;
}

/** Each result's chance, for the results the option has (a missing crit counts as a success, a missing critFail as a failure). */
function resultOdds(option, chance, gambler) {
  const out = option.outcomes ?? {};
  if (!option.check) return Object.keys(out).length ? [['success', 1]] : [];
  const cs = gambler ? DATA.critShare.gambler : DATA.critShare.base;
  const cf = gambler ? DATA.critFailShare.gambler : DATA.critFailShare.base;
  const p = { crit: chance * cs, success: chance * (1 - cs), fail: (1 - chance) * (1 - cf), critFail: (1 - chance) * cf };
  if (!out.crit) { p.success += p.crit; delete p.crit; }
  if (!out.critFail) { p.fail += p.critFail; delete p.critFail; }
  return Object.entries(p).filter(([, v]) => v > 0);
}

/**
 * What every answer of an event is worth. ctx: { model (hiring.js
 * companyModel), employees (as loaded: their tools), self, partner (indexes),
 * prices (item prices), toolboxValue, selfWork (G 10 energy makes),
 * management }. Returns [{ key, label, available, chance, cost, ev, results:
 * [{ kind, p, value, effects: [{ text, value }] }], always: [...] }], best first.
 */
export function rateEvent(code, ctx, depth = 0) {
  const event = EVENTS[code];
  const text = TEXTS[code] ?? {};
  if (!event) return [];
  const { model, employees = [], self, partner = null, prices = {}, toolboxValue = 0, selfWork = 0, management = 0 } = ctx;
  const team = model.team;
  const pp = model.perPoint;
  const raw = employees[self] ?? team[self];
  const wage = (i) => team[i]?.wage ?? 0;
  const days = (i) => team[i]?.daysLeft ?? daysLeftOf(team[i] ?? {}) ?? DAYS_UNKNOWN;
  // Points a day one percent of bonus is, and output now.
  const perPercent = (i) => ((team[i]?.prod ?? 0) / 4) * 24 / 100;
  const output = (i) => perPercent(i) * (100 + (employees[i]?.bonusPercent ?? 0));
  // Loyal halves happiness losses (Responsibility no longer shields them since v0.27.3: it adds +3 a point).
  const lossFactor = (i) => (team[i]?.traits?.includes('loyal') ? 0.5 : 1);
  const sessions = new Map();
  const potentialWorth = (i) => {
    if (!sessions.has(i)) sessions.set(i, Math.max(0, (trainingCards(model, i, { management }).session ?? 0) - selfWork));
    return sessions.get(i);
  };
  const potentialLeft = (i) => Math.max(0, (team[i]?.potentialMax ?? 0) - (team[i]?.potential ?? 0));
  const pointWage = (i) => model.fairWage * (team[i]?.wageExpectation ?? 1) * markupOf(team[i]?.traits ?? []);
  const others = (i) => team.map((_, j) => j).filter((j) => j !== i);
  const targets = (t) => ({
    self: [self], partner: partner == null ? [] : [partner], both: [self, partner].filter((x) => x != null),
    coworkers: others(self), company: team.map((_, j) => j),
    heir: others(self).sort((a, b) => (team[b].prod ?? 0) - (team[a].prod ?? 0)).slice(0, 1),
  })[t] ?? [self];
  const who = (i) => (i === self ? 'the employee' : i === partner ? 'the partner' : team[i]?.name ?? 'a coworker');

  // A stat's worth a day for one employee.
  const statDay = (i, stat, d) => {
    if (stat === 'production') return changeValue(model, i, (x) => ({ prodBase: x.prodBase + d, prod: x.prod + d })) - pointWage(i) * d;
    if (stat === 'responsibility') return changeValue(model, i, (x) => ({ resp: x.resp + d }));
    if (stat === 'luck') return changeValue(model, i, (x) => ({ luckBase: (x.luckBase ?? 0) + d }));
    return (statDay(i, 'production', d) + statDay(i, 'responsibility', d) + statDay(i, 'luck', d)) / 3;
  };
  // A trait's worth over the days left, coworkers and pay included.
  const traitWorth = (i, trait, gain) => {
    const traits = team[i].traits;
    if (gain ? traits.includes(trait) : !traits.includes(trait)) return 0;
    const next = gain ? [...traits, trait] : traits.filter((t) => t !== trait);
    // Burnout takes real stat points (counted as one Production), and the wage follows Production down.
    const statPay = trait === 'burnout' ? (gain ? -1 : 1) * pointWage(i) : 0;
    const pay = wage(i) * (markupOf(next) / markupOf(traits) - 1) + statPay;
    return (changeValue(model, i, () => ({ traits: next })) - pay) * days(i);
  };
  const randomTrait = (i, pool, gain) => {
    const list = gain
      ? Object.entries(pool).filter(([t]) => canGain(t, team[i].traits, team[i].gender))
      : Object.entries(pool).filter(([t]) => team[i].traits.includes(t));
    const total = list.reduce((s, [, w]) => s + w, 0);
    return total ? list.reduce((s, [t, w]) => s + (w / total) * traitWorth(i, t, gain), 0) : 0;
  };
  const relation = (trait, make) => {
    if (partner == null) return 0;
    const a = team[self], b = team[partner];
    const set = (x, other) => ({ traits: make ? [...x.traits.filter((t) => t !== trait), trait] : x.traits.filter((t) => t !== trait), traitArgs: { ...(x.traitArgs ?? {}), [trait]: other.id } });
    return changesValue(model, { [self]: (x) => set(x, b), [partner]: (x) => set(x, a) }) * Math.min(days(self), days(partner));
  };
  const leaving = (i) => {
    // A typical candidate in their place, from the day after.
    const typical = hireValue(model, { nationality: team[i].nationality, gender: team[i].gender, trait: null }, { replace: i }).value;
    return typical * Math.max(0, Math.min(days(i), DAYS_UNKNOWN) - 1) - Math.max(0, output(i) * pp - wage(i));
  };
  const tool = raw?.tool ?? null;
  const toolDay = (i) => {
    const t = employees[i]?.tool;
    if (!t) return 0;
    const pct = t.percent + (team[i].traits.includes('handy') ? 40 : 0) - (team[i].traits.includes('improviser') ? 25 : 0);
    return pct * perPercent(i) * pp;
  };
  const specDays = (i, extra) => {
    const quick = team[i].traits.includes('quickStudy') ? 2 : 1;
    const now = employees[i]?.specializations?.[model.place.good] ?? 0;
    let sum = 0;
    for (let d = 0; d < days(i); d++) {
      const later = extra === 'reset' ? Math.min(SPEC_MAX, quick * d) : Math.min(SPEC_MAX, now + quick * (d + extra));
      sum += later - Math.min(SPEC_MAX, now + quick * d);
    }
    return sum * perPercent(i) * pp;
  };
  const itemPrice = (code) => (code === 'toolbox' ? toolboxValue : prices[code] ?? 0);
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  const stat = (s) => (s === 'random' ? 'a random stat' : traitName(s));

  // One effect: [{ text, value }] (one line per employee it touches).
  const effect = (f, option) => {
    const on = (fn, label) => targets(f.target).map((i) => ({ text: `${who(i)}: ${label}`, value: fn(i) }));
    switch (f.type) {
      case 'happiness': return on((i) => perPercent(i) * (f.delta < 0 ? f.delta * lossFactor(i) : f.delta) * pp * (f.hours ?? 24) / 24, `happiness ${sign(f.delta)} for ${f.hours} h`);
      case 'production': return on((i) => perPercent(i) * f.percent * pp * f.hours / 24, `output ${sign(f.percent)} % for ${f.hours} h`);
      case 'away': return on((i) => -output(i) * pp * f.hours / 24, `away for ${f.hours} h`);
      case 'stat': return on((i) => {
        if (!f.free && potentialLeft(i) < f.delta) return perPercent(i) * DATA.noPotentialFallback.percent * pp * DATA.noPotentialFallback.hours / 24;
        return statDay(i, f.stat, f.delta) * days(i) - (f.free ? 0 : f.delta * potentialWorth(i));
      }, `${stat(f.stat)} ${sign(f.delta)}${f.free ? '' : ' (uses Potential)'}`);
      case 'potentialMax': return on((i) => f.delta * potentialWorth(i), `training potential ${sign(f.delta)}`);
      case 'specialization': return [{ text: f.days === 'reset' ? 'experience in the good reset' : `+${f.days} days of experience`, value: specDays(self, f.days) }];
      case 'toolDurability': {
        const state = tool?.state ?? 100;
        const amount = f.amount === 'full' ? 100 - state : Math.max(-state, Math.min(100 - state, f.amount));
        return [{ text: tool ? (f.amount === 'full' ? 'tool repaired to full' : `tool durability ${sign(f.amount)}`) : 'tool durability (no tool held)', value: amount * toolDay(self) / TOOL_WEAR_PER_DAY }];
      }
      case 'tool': {
        const [lo, hi] = TOOL_RANGES[(f.rarity ?? 1) - 1] ?? [0, 0];
        const fits = !!toolKindFor(model.place.good);
        const best = Math.max(0, ...team.map((_, i) => (employees[i]?.tool ? 0 : perPercent(i))));
        return [{ text: `a ${['', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'][f.rarity] ?? ''} tool`, value: fits ? ((lo + hi) / 2) * best * pp * (100 / TOOL_WEAR_PER_DAY) : 0 }];
      }
      case 'item': return [{ text: `${f.quantity} × ${traitName(f.itemCode)}`, value: f.quantity * itemPrice(f.itemCode) }];
      case 'money': return [{ text: `gold: ${f.wageDays} days of their wage`, value: wage(self) * f.wageDays }];
      case 'wageExpectation': {
        const now = team[self].wageExpectation ?? 1;
        const next = Math.min(DATA.wageExpectationCeiling, now * f.multiplier);
        return [{ text: `wage expectation × ${f.multiplier}`, value: -wage(self) * (next / now - 1) * days(self) }];
      }
      case 'gainTrait': return on((i) => (f.trait === 'randomPositive' ? randomTrait(i, POSITIVE, true) : f.trait === 'randomNegative' ? randomTrait(i, NEGATIVE, true) : traitWorth(i, f.trait, true)),
        `gains ${f.trait === 'randomPositive' ? 'a random good trait' : f.trait === 'randomNegative' ? 'a random bad trait' : traitName(f.trait)}`);
      case 'loseTrait': return on((i) => (f.trait === 'randomNegative' ? randomTrait(i, NEGATIVE, false) : traitWorth(i, f.trait, false)),
        `loses ${f.trait === 'randomNegative' ? 'a random bad trait' : traitName(f.trait)}`);
      case 'relation': return [{ text: `they become ${traitName(f.trait)}`, value: relation(f.trait, true) }];
      case 'endRelation': return [{ text: `${traitName(f.trait)} ends`, value: relation(f.trait, false) }];
      case 'leave': return on((i) => leaving(i), `leaves the company${f.reason ? ` (${f.reason})` : ''}`);
      case 'schedule': {
        const follow = depth < 2 ? rateEvent(f.code, ctx, depth + 1).find((o) => o.available) : null;
        return [{ text: `follow-up “${TEXTS[f.code]?.title ?? f.code}” in ${f.inHours} h`, value: follow?.ev ?? 0 }];
      }
      case 'refundCost': return [{ text: `money back × ${f.multiplier}`, value: f.multiplier * moneyCost(option) }];
      case 'inheritTrait': return targets('heir').map((i) => ({ text: `${who(i)}: inherits a trait`, value: randomTrait(i, POSITIVE, true) }));
      default: return [{ text: f.type, value: 0 }];
    }
  };
  const moneyCost = (option) => (option.costs ?? []).filter((c) => c.type === 'money').reduce((s, c) => s + wage(self) * c.wageDays, 0);
  const cost = (c) => {
    if (c.type === 'money') return { text: `${c.wageDays} days of their wage`, value: -wage(self) * c.wageDays };
    if (c.type === 'energy') return { text: `${c.amount} energy`, value: -(c.amount / 10) * selfWork };
    if (c.type === 'item') return { text: `${c.quantity} × ${traitName(c.itemCode)}`, value: -c.quantity * itemPrice(c.itemCode) };
    if (c.type === 'companyGood') {
      const n = DATA.strangeMoodQuantity[model.place.raw ? 'raw' : 'product'];
      return { text: `${n} of the company's good`, value: -n * (prices[model.place.good] ?? 0) };
    }
    return { text: c.type, value: 0 };
  };
  const gambler = team[self]?.traits?.includes('gambler');
  const options = event.options.map((o) => {
    const available = !o.requires?.traitsAny || o.requires.traitsAny.some((t) => team[self]?.traits?.includes(t));
    const chance = checkChance(o.check, { who: raw, partner: partner != null ? employees[partner] ?? team[partner] : null, management });
    const costs = (o.costs ?? []).map(cost);
    const always = (o.always ?? []).flatMap((f) => effect(f, o));
    const results = resultOdds(o, chance, gambler).map(([kind, p]) => {
      const effects = (o.outcomes?.[kind] ?? []).flatMap((f) => effect(f, o));
      return { kind, p, effects, value: effects.reduce((s, x) => s + x.value, 0) };
    });
    const sum = (list) => list.reduce((s, x) => s + x.value, 0);
    const ev = sum(costs) + sum(always) + results.reduce((s, r) => s + r.p * r.value, 0);
    return { key: o.key, label: text.options?.[o.key] ?? o.key, available, check: o.check ?? null, chance: o.check ? chance : null, risky: !!o.risky, costs, always, results, ev };
  });
  const def = event.options[event.defaultOption]?.key;
  for (const o of options) o.isDefault = o.key === def;
  return options.sort((a, b) => (b.available - a.available) || b.ev - a.ev);
}
