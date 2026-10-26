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

// Mercenary contracts: the API can't filter by unit and pages are at most 50,
// so the job keeps an index of recent contracts by their leading/winning unit.
const CONTRACT_PAGE = 50;
const CONTRACT_BACKFILL_PAGES = 10;
const CONTRACT_KEEP_MS = 3 * 24 * 60 * 60 * 1000;

// Raw-material trades, totalled per day, for the value of 1 production point
// (the game averages raw-material trades over the last 7 days).
const RAW_EVERY_MS = 5 * 60 * 1000;
const RAW_KEEP_DAYS = 8;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS raw_days (
     code TEXT NOT NULL,
     day TEXT NOT NULL,
     money REAL NOT NULL,
     quantity REAL NOT NULL,
     trades INTEGER NOT NULL,
     PRIMARY KEY (code, day)
   )`,
  `CREATE TABLE IF NOT EXISTS contracts (
     id TEXT PRIMARY KEY,
     winner TEXT,
     status TEXT NOT NULL,
     battle TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     body TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS contracts_winner ON contracts (winner, created_at)`,
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

  try {
    await refreshRawTrades(db, api, now);
  } catch (err) {
    console.warn(`raw trades: ${err.message}`);
  }

  try {
    await refreshContracts(db, api, now);
  } catch (err) {
    console.warn(`contracts: ${err.message}`);
  }

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

/**
 * The newest active and won contracts, upserted by id (a contract changes
 * as bids come in and when it is won). The first run backfills a few pages.
 */
async function refreshContracts(db, api, now) {
  const { n } = await db.prepare('SELECT count(*) AS n FROM contracts').first();
  // Only new or changed contracts are written (D1's free plan allows 100k row writes a day).
  const save = async (items) => {
    if (!items.length) return;
    const stored = new Map();
    // D1 allows at most 100 bound values per query.
    for (let i = 0; i < items.length; i += 50) {
      const ids = items.slice(i, i + 50).map((c) => c._id);
      const { results } = await db.prepare(`SELECT id, updated_at FROM contracts WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
      for (const r of results) stored.set(r.id, r.updated_at);
    }
    const changed = items.filter((c) => stored.get(c._id) !== Date.parse(c.updatedAt ?? c.createdAt));
    if (!changed.length) return;
    await db.batch(changed.map((c) => db.prepare(
      'INSERT OR REPLACE INTO contracts (id, winner, status, battle, created_at, updated_at, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(c._id, c.currentWinner ?? null, c.status, c.battle ?? null, Date.parse(c.createdAt), Date.parse(c.updatedAt ?? c.createdAt), JSON.stringify(c))));
  };

  const [active, won] = await api.batch('mercenaryContractAuction.getPaginatedAuctions', [
    { status: 'active', limit: CONTRACT_PAGE },
    { status: 'won', limit: CONTRACT_PAGE },
  ]);
  // A contract can be in both lists for a moment, as it is won; keep one.
  const items = [...new Map([...(active?.items ?? []), ...(won?.items ?? [])].map((c) => [c._id, c])).values()];
  await save(items);

  if (n === 0 && won?.nextCursor) {
    let cursor = won.nextCursor;
    for (let page = 1; page < CONTRACT_BACKFILL_PAGES && cursor; page++) {
      const more = await api.call('mercenaryContractAuction.getPaginatedAuctions', { status: 'won', limit: CONTRACT_PAGE, cursor });
      await save(more.items ?? []);
      cursor = more.nextCursor;
    }
  }
  await db.prepare('DELETE FROM contracts WHERE created_at < ?').bind(now - CONTRACT_KEEP_MS).run();
}

/**
 * Adds raw-material trades since the last run to per-day totals. One batched
 * request for the newest page of every raw material, every 5 minutes; the
 * newest trade id per material is kept so nothing is counted twice.
 */
async function refreshRawTrades(db, api, now) {
  if (!api.key) return; // trade history needs the API key
  const last = await db.prepare(`SELECT body, fetched_at FROM datasets WHERE name = 'raw-trades-seen'`).first();
  if (last && now - last.fetched_at < RAW_EVERY_MS) return;
  const config = await readDataset(db, 'game-config');
  if (!config) return;
  const raws = Object.entries(JSON.parse(config.body).items ?? {}).filter(([, it]) => it.type === 'raw').map(([code]) => code);
  const seen = last ? JSON.parse(last.body) : {};
  const pages = await api.batch('transaction.getPaginatedTransactions', raws.map((itemCode) => ({ itemCode, transactionType: 'trading', limit: 100 })));
  const totals = new Map();
  raws.forEach((code, i) => {
    const items = pages[i]?.items ?? [];
    for (const t of items) {
      if (t._id === seen[code]) break;
      // First run: only start counting from now (no old page is guessed into a day).
      if (!seen[code]) break;
      const day = t.createdAt.slice(0, 10);
      const key = `${code}|${day}`;
      const sum = totals.get(key) ?? { code, day, money: 0, quantity: 0, trades: 0 };
      sum.money += t.money ?? 0;
      sum.quantity += t.quantity ?? 0;
      sum.trades += 1;
      totals.set(key, sum);
    }
    if (items[0]) seen[code] = items[0]._id;
  });
  const writes = [...totals.values()].map((t) => db.prepare(
    `INSERT INTO raw_days (code, day, money, quantity, trades) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (code, day) DO UPDATE SET money = money + excluded.money, quantity = quantity + excluded.quantity, trades = trades + excluded.trades`,
  ).bind(t.code, t.day, t.money, t.quantity, t.trades));
  writes.push(db.prepare(`INSERT OR REPLACE INTO datasets (name, body, fetched_at) VALUES ('raw-trades-seen', ?, ?)`).bind(JSON.stringify(seen), now));
  const oldest = new Date(now - RAW_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  writes.push(db.prepare('DELETE FROM raw_days WHERE day < ?').bind(oldest));
  await db.batch(writes);
}
