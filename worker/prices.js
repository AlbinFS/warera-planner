/**
 * Per-roll equipment prices from the official trade history.
 *
 * - A roll with at least 5 trades in the last 7 days is priced from its 15
 *   most recent trades, otherwise from its 5 most recent trades of any age.
 * - The price is the median of those trades: a plain mean is pulled down by
 *   the occasional dumped item.
 * - For single-stat items the prices are made non-decreasing in the stat, so
 *   a better roll is never priced below a worse one.
 *
 * Trades are stored compactly as [id, at (ms), price, roll], where roll is
 * "stat=value|stat=value" in stat-name order.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_MS = 7 * DAY_MS;
// 15 rather than 9: a burst of snipes on underpriced listings can make up most of the last 9 trades.
export const MAX_SAMPLES = 15;
export const MIN_SAMPLES = 5;
export const HISTORY_MS = 60 * DAY_MS;

export function rollKey(skills) {
  return Object.entries(skills ?? {})
    .filter(([, v]) => Number.isFinite(v))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
}

function rollSkills(roll) {
  if (!roll) return {};
  return Object.fromEntries(roll.split('|').map((part) => {
    const [k, v] = part.split('=');
    return [k, Number(v)];
  }));
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Every possible roll of an item, from its dynamicStats ranges. */
function allRolls(dynamicStats) {
  let rolls = [{}];
  for (const [stat, [lo, hi]] of Object.entries(dynamicStats)) {
    const next = [];
    for (const r of rolls) for (let v = lo; v <= hi; v++) next.push({ ...r, [stat]: v });
    rolls = next;
  }
  return rolls.map(rollKey);
}

/** Pool-adjacent-violators: weighted non-decreasing fit, in place. */
function makeNonDecreasing(entries) {
  const blocks = [];
  for (const e of entries) {
    blocks.push({ sum: e.averagePrice * e.transactionCount, weight: e.transactionCount, members: [e] });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.sum / a.weight <= b.sum / b.weight) break;
      blocks.splice(-2, 2, { sum: a.sum + b.sum, weight: a.weight + b.weight, members: [...a.members, ...b.members] });
    }
  }
  for (const b of blocks) for (const e of b.members) e.averagePrice = b.sum / b.weight;
}

/** One API trade in the stored form. */
export function toTrade(t) {
  const qty = t.quantity || 1;
  return [t._id, Date.parse(t.createdAt), t.money / qty, rollKey(t.item?.skills)];
}

/**
 * True once every roll of the item has enough trades, or history ran out.
 * The 5-trades-of-any-age fallback only counts once paging is past the 7-day window.
 */
export function isSatisfied(entry, dynamicStats, now) {
  if (entry.exhausted) return true;
  const pastWindow = entry.oldestAt != null && now - entry.oldestAt > WINDOW_MS;
  const counts = new Map();
  for (const [, at, , roll] of entry.trades) {
    const c = counts.get(roll) ?? { recent: 0, any: 0 };
    c.any++;
    if (now - at <= WINDOW_MS) c.recent++;
    counts.set(roll, c);
  }
  return allRolls(dynamicStats).every((r) => {
    const c = counts.get(r);
    return c && (c.recent >= MAX_SAMPLES || (pastWindow && c.any >= MIN_SAMPLES));
  });
}

/**
 * Drop trades no roll needs: keep the last 7 days (up to 15 per roll) plus
 * the latest 5 per roll. Returns them newest first.
 */
export function prune(trades, now) {
  const perRoll = new Map();
  const kept = [];
  for (const t of [...trades].sort((a, b) => b[1] - a[1])) {
    const n = perRoll.get(t[3]) ?? 0;
    if ((now - t[1] <= WINDOW_MS && n < MAX_SAMPLES) || n < MIN_SAMPLES) {
      kept.push(t);
      perRoll.set(t[3], n + 1);
    }
  }
  return kept;
}

/**
 * Price entries for one item, in the original price service's shape.
 * `trades` must be newest first, as prune() returns them.
 */
export function priceItem(code, dynamicStats, trades, now) {
  const byRoll = new Map();
  for (const t of trades) {
    const list = byRoll.get(t[3]);
    if (list) list.push(t);
    else byRoll.set(t[3], [t]);
  }
  const entries = [];
  for (const [roll, list] of byRoll) {
    // Newest first, so the recent trades are a prefix of the list.
    let recent = 0;
    while (recent < list.length && now - list[recent][1] <= WINDOW_MS) recent++;
    const sample = recent >= MIN_SAMPLES ? list.slice(0, Math.min(recent, MAX_SAMPLES)) : list.slice(0, MIN_SAMPLES);
    const med = median(sample.map((t) => t[2]));
    entries.push({
      code,
      skills: rollSkills(roll),
      averagePrice: med,
      medianPrice: med,
      transactionCount: sample.length,
      oldestTransactionCreatedAt: new Date(sample.at(-1)[1]).toISOString(),
      latestTransactionCreatedAt: new Date(sample[0][1]).toISOString(),
    });
  }
  const stats = Object.keys(dynamicStats);
  if (stats.length === 1) {
    entries.sort((a, b) => a.skills[stats[0]] - b.skills[stats[0]]);
    makeNonDecreasing(entries);
  }
  return entries;
}
