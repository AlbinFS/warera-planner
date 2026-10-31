/**
 * Training cards: what each card the game can deal an employee is worth, and
 * what a training session is worth (the best of a hand of 3).
 *
 * The game's rules (its web app's config and card list, 2026-10-28):
 *   a session costs 10 energy and deals a hand of 3; one is kept
 *   rarity weights 55 / 25 / 13 / 5 / 2 (common … legendary); each level of
 *   the owner's Management (v0.27.3: Leadership is part of it) moves +1 /
 *   +0.6 / +0.3 / +0.1 from common to uncommon … legendary, each point of
 *   the employee's Luck half that
 *   Drill: +1 / +2 / +3 / +4 to Production, Luck or Responsibility
 *     (common / uncommon / epic / legendary)
 *   Negotiation: −0.05 / −0.1 / −0.2 wage expectation (common / uncommon /
 *     rare), not below 0.7
 *   Second Wind: +2 / +3 / +4 potential (rare / epic / legendary), up to 15
 *   Rehab (rare): drops a bad trait (v0.27.3: bad ones only); Rehab All (two
 *     or more bad ones): drops them all (legendary)
 *   New habit: a mixed (rare) or good (epic) trait; two good ones (legendary)
 *   Wild Card (uncommon): +1 to a random stat and a random trait of any kind
 * Not in the config: which card of a rarity comes up. Taken as any of that
 * rarity's cards, evenly.
 *
 * A card's value: what it adds a day (output and toolboxes, coworkers
 * included, less any wage change) times the days the employee has left
 * before retiring; Second Wind and Luck's better odds by the trainings they
 * add or improve.
 */
import { changeValue, canGain, daysLeftOf, TRAITS, traitName } from './hiring.js';

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const BASE_WEIGHTS = { common: 55, uncommon: 25, rare: 13, epic: 5, legendary: 2 };
const MANAGEMENT_SHIFT = { uncommon: 1, rare: 0.6, epic: 0.3, legendary: 0.1 };
const LUCK_SHIFT = { uncommon: 0.5, rare: 0.3, epic: 0.15, legendary: 0.05 };
const DRILL_RARITY = ['common', 'uncommon', 'epic', 'legendary'];
const STATS = ['production', 'luck', 'responsibility'];
const SECOND_WIND = [[2, 'rare'], [3, 'epic'], [4, 'legendary']];
const NEGOTIATION = [[0.05, 'common'], [0.1, 'uncommon'], [0.2, 'rare']];
const POTENTIAL_CAP = 15;
const WAGE_FLOOR = 0.7;
const HAND = 3;
// Specialization: +1 % a day in the company's good, up to 20 % (Quick Study twice as fast).
const SPEC_MAX = 20;
// Days left when nothing says (a candidate's age is 18–45: about 33 days on average).
const DAYS_UNKNOWN = 33;

/** Rarity weights for a session, with the owner's Management level and the employee's Luck. */
export function rarityWeights(management = 0, luck = 0) {
  const w = { ...BASE_WEIGHTS };
  let moved = 0;
  for (const r of ['uncommon', 'rare', 'epic', 'legendary']) {
    const d = MANAGEMENT_SHIFT[r] * Math.max(0, management) + LUCK_SHIFT[r] * Math.max(0, luck);
    w[r] += d;
    moved += d;
  }
  w.common = Math.max(0, BASE_WEIGHTS.common - moved);
  return w;
}

// Nemesis is a partner trait, outside TRAITS, but a bad one: Rehab can drop it.
const isBad = (t) => t === 'nemesis' || !!TRAITS[t]?.bad;
const isMixed = (t) => !!TRAITS[t]?.mixed;
const markupOf = (traits) => (traits.includes('greedy') ? 1.2 : 1) * (traits.includes('modest') ? 0.85 : 1);

/** Every card the game can deal this employee (stats, traits, potential, wage expectation). */
export function cardPool(e) {
  const traits = e.traits ?? [];
  const pool = [];
  for (const stat of STATS) DRILL_RARITY.forEach((rarity, i) => pool.push({ card: 'drill', rarity, stat, delta: i + 1 }));
  for (const t of traits) if (isBad(t)) pool.push({ card: 'rehab', rarity: 'rare', trait: t });
  const bad = traits.filter(isBad);
  if (bad.length >= 2) pool.push({ card: 'rehabAll', rarity: 'legendary', traits: bad });
  const gainable = Object.keys(TRAITS).filter((t) => canGain(t, traits, e.gender));
  for (const t of gainable) if (!isBad(t)) pool.push({ card: 'habit', rarity: isMixed(t) ? 'rare' : 'epic', trait: t });
  const good = gainable.filter((t) => !isBad(t) && !isMixed(t));
  for (let i = 0; i < good.length; i++) for (let j = i + 1; j < good.length; j++) {
    if (canGain(good[j], [...traits, good[i]], e.gender)) pool.push({ card: 'habitPair', rarity: 'legendary', traits: [good[i], good[j]] });
  }
  if (gainable.length) pool.push({ card: 'wildCard', rarity: 'uncommon', gainable });
  for (const [delta, rarity] of SECOND_WIND) if ((e.potentialMax ?? 0) + delta <= POTENTIAL_CAP) pool.push({ card: 'secondWind', rarity, delta });
  const expectation = e.wageExpectation ?? 1;
  for (const [delta, rarity] of NEGOTIATION) if (Math.round((expectation - delta) * 1000) / 1000 >= WAGE_FLOOR) pool.push({ card: 'negotiation', rarity, delta });
  return pool;
}

/** A card in words. */
export function cardLabel(c) {
  const stat = { production: 'Production', luck: 'Luck', responsibility: 'Responsibility' };
  switch (c.card) {
    case 'drill': return `Drill +${c.delta} ${stat[c.stat]}`;
    case 'negotiation': return `Negotiation −${c.delta.toFixed(2)} wage expectation`;
    case 'secondWind': return `Second Wind +${c.delta} potential`;
    case 'rehab': return `Rehab: drop ${traitName(c.trait)}`;
    case 'rehabAll': return `Rehab all: drop ${c.traits.map(traitName).join(', ')}`;
    case 'habit': return `New habit: ${traitName(c.trait)}`;
    case 'habitPair': return `New habits: ${c.traits.map(traitName).join(' + ')}`;
    case 'wildCard': return 'Wild Card: +1 random stat, random trait';
    default: return c.card;
  }
}

/**
 * Chance of each card in a single draw: its rarity's weight (among rarities
 * the pool has) over that rarity's cards.
 */
function drawChances(pool, weights) {
  const count = {};
  for (const c of pool) count[c.rarity] = (count[c.rarity] ?? 0) + 1;
  const total = Object.keys(count).reduce((t, r) => t + weights[r], 0);
  return pool.map((c) => (total > 0 ? weights[c.rarity] / total / count[c.rarity] : 0));
}

/** Expected value of the best of a hand of 3 (each card drawn as drawChances says). */
export function handValue(values, chances) {
  const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
  let below = 0;
  let expected = 0;
  for (const i of order) {
    const upto = below + chances[i];
    expected += values[i] * (upto ** HAND - below ** HAND);
    below = upto;
  }
  return expected;
}

/**
 * Every card for employee `index` of a company model (hiring.js), valued.
 * options: { management (the owner's Management level), now }. Returns { days (left),
 * left (trainings), perDay (sessions a day), cards: [{ …card, label, perDay,
 * total, chance (in a hand) }] best first, session (the best of a hand,
 * expected, G in all) }.
 */
export function trainingCards(model, index, { management = 0, now = Date.now() } = {}) {
  const e = model.team[index];
  const days = e.daysLeft ?? daysLeftOf(e, now) ?? DAYS_UNKNOWN;
  const left = Math.max(0, (e.potentialMax ?? 0) - (e.potential ?? 0));
  const sessions = Math.max(1, e.trainingsPerDay ?? 1);
  const expectation = e.wageExpectation ?? 1;
  const traits = e.traits ?? [];
  const luck = e.stats?.luck?.total ?? e.luckBase ?? 0;
  // Wage per Production point a day (the wage follows base + trained Production).
  const pointWage = model.fairWage * expectation * markupOf(traits);
  // A trait change's wage change (Greedy +20 %, Modest −15 %).
  const wageFor = (next) => (e.wage ?? 0) * (markupOf(next) / markupOf(traits) - 1);
  // Quick Study: specialization twice as fast, in percent-days of bonus over the days left.
  const specGain = (gaining) => {
    if (!gaining.includes('quickStudy') || traits.includes('quickStudy')) return 0;
    const now = e.specializations?.[model.place.good] ?? 0;
    let extra = 0;
    for (let d = 1; d <= days; d++) extra += Math.min(SPEC_MAX, now + 2 * d) - Math.min(SPEC_MAX, now + d);
    const base = (e.prodBase / 4) * 24;
    return (extra / 100) * base * model.perPoint;
  };
  const withTraits = (next) => changeValue(model, index, () => ({ traits: next })) - wageFor(next);
  const statDay = (stat, d) => (stat === 'production'
    ? changeValue(model, index, (x) => ({ prodBase: x.prodBase + d, prod: x.prod + d })) - pointWage * d
    : stat === 'responsibility' ? changeValue(model, index, (x) => ({ resp: x.resp + d }))
      : changeValue(model, index, (x) => ({ luckBase: (x.luckBase ?? 0) + d })));

  const pool = cardPool(e);
  const traitDay = new Map();
  const gainTrait = (t) => {
    if (!traitDay.has(t)) traitDay.set(t, withTraits([...traits, t]));
    return traitDay.get(t);
  };
  // Value per day (and any one-off, in all) of each card but Second Wind and Luck's better odds.
  for (const c of pool) {
    let perDay = 0;
    let once = 0;
    if (c.card === 'drill') perDay = statDay(c.stat, c.delta);
    else if (c.card === 'negotiation') perDay = ((e.wage ?? 0) * c.delta) / expectation;
    else if (c.card === 'rehab') perDay = withTraits(traits.filter((t) => t !== c.trait));
    else if (c.card === 'rehabAll') perDay = withTraits(traits.filter((t) => !c.traits.includes(t)));
    else if (c.card === 'habit') { perDay = gainTrait(c.trait); once = specGain([c.trait]); }
    else if (c.card === 'habitPair') { perDay = withTraits([...traits, ...c.traits]); once = specGain(c.traits); }
    else if (c.card === 'wildCard') {
      // A random stat, and a random trait drawn by the traits' weights.
      const stats = STATS.reduce((t, s) => t + statDay(s, 1), 0) / STATS.length;
      const weight = c.gainable.reduce((t, x) => t + TRAITS[x].weight, 0);
      perDay = stats + c.gainable.reduce((t, x) => t + (TRAITS[x].weight / weight) * gainTrait(x), 0);
      once = c.gainable.reduce((t, x) => t + (TRAITS[x].weight / weight) * specGain([x]), 0);
    }
    c.perDay = perDay;
    c.total = perDay * days + once;
  }

  const weights = rarityWeights(management, luck);
  const chances = drawChances(pool, weights);
  // Trainings still to come after this one, and how much later they come on average (fewer days to pay).
  const later = Math.max(0, Math.min(left - 1, Math.floor(days * sessions) - 1));
  const laterShare = days > 0 ? Math.max(0, days - (left + 1) / (2 * sessions)) / days : 0;
  // A session's worth before the cards that add or improve sessions.
  const base = handValue(pool.map((c) => (c.card === 'secondWind' ? 0 : c.total)), chances);
  for (const c of pool) {
    if (c.card === 'secondWind') {
      // More potential: sessions that fit before retiring, each after the ones already left.
      const extra = Math.min(c.delta, Math.max(0, Math.floor(days * sessions) - left));
      let total = 0;
      for (let k = 1; k <= extra; k++) total += (base / Math.max(days, 1)) * Math.max(0, days - (left + k) / sessions);
      c.total = total;
      c.perDay = days > 0 ? total / days : 0;
    } else if (c.card === 'drill' && c.stat === 'luck' && later > 0) {
      // Luck also deals this employee better cards in the sessions left.
      const better = handValue(pool.map((x) => (x.card === 'secondWind' ? 0 : x.total)), drawChances(pool, rarityWeights(management, luck + c.delta))) - base;
      c.total += better * later * laterShare;
      c.perDay = days > 0 ? c.total / days : c.perDay;
    }
  }
  const session = handValue(pool.map((c) => c.total), chances);
  const cards = pool.map((c, i) => ({ ...c, label: cardLabel(c), chance: 1 - (1 - chances[i]) ** HAND }))
    .sort((a, b) => b.total - a.total);
  return { days, left, sessions, weights, cards, session };
}

/**
 * What the owner's Management level adds a day through better training cards
 * (v0.27.3; Leadership's before): for every employee still training,
 * how much more a session is worth at each level than at 0, times their
 * sessions a day. models: company models (hiring.js). Returns [G a day] by
 * level 0…maxLevel.
 */
export function cardValues(models, maxLevel = 10, now = Date.now()) {
  const out = new Array(maxLevel + 1).fill(0);
  for (const model of models) {
    model.team.forEach((e, i) => {
      const left = Math.max(0, (e.potentialMax ?? 0) - (e.potential ?? 0));
      if (!left) return;
      const sessions = Math.min(left, Math.max(1, e.trainingsPerDay ?? 1));
      // The cards' values don't depend on the Management level, only their odds do.
      const { cards, session } = trainingCards(model, i, { management: 0, now });
      const luck = e.stats?.luck?.total ?? e.luckBase ?? 0;
      const values = cards.map((c) => c.total);
      for (let level = 1; level <= maxLevel; level++) out[level] += (handValue(values, drawChances(cards, rarityWeights(level, luck))) - session) * sessions;
    });
  }
  return out;
}
