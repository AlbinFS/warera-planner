/**
 * The scheduled job (every minute). Free Workers get 10 ms of CPU per run, so
 * each run does a small slice:
 * - game config once an hour and item prices every 5 minutes, kept in D1 so
 *   the site still has them when the official API is down;
 * - trade history for the equipment items refreshed longest ago, as many as
 *   fit in about 350 KB of stored trades (the heaviest, jets, run alone), and
 *   their prices. All 36 items come round in roughly 10-15 minutes.
 */
import { WareraApi } from './warera.js';
import { toTrade, isSatisfied, prune, priceItem, HISTORY_MS } from './prices.js';

const CONFIG_EVERY_MS = 60 * 60 * 1000;
const ITEM_PRICES_EVERY_MS = 5 * 60 * 1000;
// Stored-trade bytes handled per run: parsing, pricing and saving scale with it.
const BYTES_PER_RUN = 350 * 1024;
const MAX_CODES_PER_RUN = 6;
const PAGE_SIZE = 100;
// Older pages fetched per item per run while its history is still being filled.
const BACKFILL_PAGES = 6;
const GAME_CONFIG_KEYS = ['items', 'skills', 'battle', 'region', 'upgradesConfig'];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS datasets (name TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS equipment (
     code TEXT PRIMARY KEY,
     trades TEXT NOT NULL,
     cursor TEXT,
     oldest_at INTEGER,
     exhausted INTEGER NOT NULL DEFAULT 0,
     ready INTEGER NOT NULL DEFAULT 0,
     prices TEXT,
     updated_at INTEGER NOT NULL
   )`,
];

let schemaReady = false;
export async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  schemaReady = true;
}

export async function readDataset(db, name) {
  const row = await db.prepare('SELECT body, fetched_at FROM datasets WHERE name = ?').bind(name).first();
  return row ? { body: row.body, fetchedAt: row.fetched_at } : null;
}

function writeDataset(db, name, body, now) {
  return db.prepare('INSERT OR REPLACE INTO datasets (name, body, fetched_at) VALUES (?, ?, ?)').bind(name, body, now).run();
}

/** Refresh a dataset if it is older than `everyMs`; a failure keeps the stored copy. */
async function refreshDataset(db, name, everyMs, now, fetchBody) {
  const stored = await db.prepare('SELECT fetched_at FROM datasets WHERE name = ?').bind(name).first();
  if (stored && now - stored.fetched_at < everyMs) return;
  try {
    await writeDataset(db, name, await fetchBody(), now);
  } catch (err) {
    console.warn(`${name}: ${err.message} (keeping the stored copy)`);
  }
}

/** Equipment codes with roll ranges, from the stored game config. */
async function equipmentItems(db) {
  const config = await readDataset(db, 'game-config');
  if (!config) return [];
  const items = JSON.parse(config.body).items ?? {};
  return Object.entries(items)
    .filter(([, i]) => i.dynamicStats && (i.type === 'weapon' || i.type === 'equipment'))
    .map(([code, i]) => ({ code, dynamicStats: i.dynamicStats }));
}

async function loadEntry(db, code) {
  const row = await db.prepare('SELECT * FROM equipment WHERE code = ?').bind(code).first();
  if (!row) return { trades: [], cursor: null, oldestAt: null, exhausted: false, ready: false };
  return { trades: JSON.parse(row.trades), cursor: row.cursor, oldestAt: row.oldest_at, exhausted: !!row.exhausted, ready: !!row.ready };
}

/**
 * Merge the newest page into an item's stored trades, then page backwards
 * while the history doesn't yet cover every roll.
 */
async function refreshItem(api, { code, dynamicStats }, entry, firstPage, now) {
  const request = (cursor) => api.call('transaction.getPaginatedTransactions', { limit: PAGE_SIZE, transactionType: 'itemMarket', itemCode: code, ...(cursor ? { cursor } : {}) });
  const known = new Set(entry.trades.map((t) => t[0]));
  const isNew = entry.trades.length === 0;
  const fresh = [];
  for (const t of firstPage.items ?? []) {
    if (known.has(t._id)) break;
    fresh.push(toTrade(t));
    known.add(t._id);
  }
  // A gap between this page and the stored trades only loses older trades;
  // prices use the newest, so it is accepted rather than refetched.
  if (isNew) {
    entry.cursor = firstPage.nextCursor ?? null;
    entry.oldestAt = fresh.length ? fresh.at(-1)[1] : null;
    if (!firstPage.nextCursor) entry.exhausted = true;
  }
  entry.trades = [...fresh, ...entry.trades];
  entry.changed = fresh.length > 0;

  // Coverage only matters while the history is being filled; once an item is
  // ready, new trades only add to it.
  for (let pages = 0; pages < BACKFILL_PAGES && entry.cursor && !entry.ready && !isSatisfied(entry, dynamicStats, now); pages++) {
    entry.changed = true;
    const page = await request(entry.cursor);
    for (const t of page.items ?? []) {
      if (known.has(t._id)) continue;
      known.add(t._id);
      entry.trades.push(toTrade(t));
    }
    const oldest = page.items?.at(-1);
    if (oldest) entry.oldestAt = Date.parse(oldest.createdAt);
    entry.cursor = page.nextCursor ?? null;
    if (!page.nextCursor || !oldest || now - Date.parse(oldest.createdAt) > HISTORY_MS) {
      entry.exhausted = true;
      entry.cursor = null;
    }
  }

  entry.trades = prune(entry.trades, now);
  entry.ready ||= isSatisfied(entry, dynamicStats, now);
  entry.prices = priceItem(code, dynamicStats, entry.trades, now);
  return entry;
}

/** Saves the item; the trades are only rewritten when new ones arrived (prices change as trades age, so they always are). */
function saveEntry(db, code, entry, now) {
  const prices = JSON.stringify(entry.prices).slice(1, -1);
  if (!entry.changed) {
    return db.prepare('UPDATE equipment SET prices = ?, ready = ?, updated_at = ? WHERE code = ?')
      .bind(prices, entry.ready ? 1 : 0, now, code).run();
  }
  return db.prepare(`INSERT OR REPLACE INTO equipment (code, trades, cursor, oldest_at, exhausted, ready, prices, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(code, JSON.stringify(entry.trades), entry.cursor, entry.oldestAt, entry.exhausted ? 1 : 0, entry.ready ? 1 : 0, prices, now)
    .run();
}

export async function runJob(env, now = Date.now()) {
  const db = env.DB;
  const api = new WareraApi(env);
  await ensureSchema(db);

  await refreshDataset(db, 'game-config', CONFIG_EVERY_MS, now, async () => {
    const full = await api.call('gameConfig.getGameConfig');
    const picked = Object.fromEntries(GAME_CONFIG_KEYS.map((k) => [k, full[k] ?? {}]));
    if (!Object.keys(picked.items).length) throw new Error('no items');
    return JSON.stringify(picked);
  });
  await refreshDataset(db, 'item-prices', ITEM_PRICES_EVERY_MS, now, async () => {
    const prices = await api.call('itemTrading.getPrices');
    if (!Object.keys(prices).length) throw new Error('no prices');
    return JSON.stringify(prices);
  });

  if (!env.WARERA_API_KEY && !env.WARERA_API_BASE) {
    console.warn('No WARERA_API_KEY secret: equipment prices are not collected.');
    return;
  }
  const items = await equipmentItems(db);
  if (!items.length) return;
  const { results } = await db.prepare('SELECT code, updated_at, length(trades) AS bytes FROM equipment').all();
  const stored = new Map(results.map((r) => [r.code, r]));
  const slice = [];
  let bytes = 0;
  for (const item of [...items].sort((a, b) => (stored.get(a.code)?.updated_at ?? 0) - (stored.get(b.code)?.updated_at ?? 0))) {
    const size = stored.get(item.code)?.bytes ?? 0;
    if (slice.length && (bytes + size > BYTES_PER_RUN || slice.length >= MAX_CODES_PER_RUN)) break;
    slice.push(item);
    bytes += size;
  }

  let pages;
  try {
    pages = await api.batch('transaction.getPaginatedTransactions',
      slice.map(({ code }) => ({ limit: PAGE_SIZE, transactionType: 'itemMarket', itemCode: code })));
  } catch (err) {
    // The official API is down: keep the stored prices and try again next minute.
    console.warn(`trade history: ${err.message} (keeping the stored prices)`);
    return;
  }
  for (let i = 0; i < slice.length; i++) {
    const item = slice[i];
    if (!pages[i]) { console.warn(`${item.code}: no trade page`); continue; }
    try {
      const entry = await refreshItem(api, item, await loadEntry(db, item.code), pages[i], now);
      await saveEntry(db, item.code, entry, now);
    } catch (err) {
      console.warn(`${item.code}: ${err.message}`);
    }
  }
}
