/**
 * The site's Worker: static files come from the ASSETS binding, /api routes
 * are answered from D1, and the scheduled job (job.js) keeps D1 filled.
 *
 * Every data route answers { fetchedAt, stale, ... }: when the official API
 * is down the job keeps the last good copy, and `stale` tells the site so.
 */
import { runJob, ensureSchema, readDataset } from './job.js';
import { lootPrices } from './prices.js';
import { handleAuthRoute, currentSession, signInRequired } from './auth.js';

// How old data may get before it is flagged stale (the job refreshes far more often).
const STALE_AFTER_MS = { 'game-config': 3 * 60 * 60 * 1000, 'item-prices': 30 * 60 * 1000, equipment: 60 * 60 * 1000 };
// Responses are kept in memory this long per Worker instance (the Cache API doesn't run on workers.dev).
const MEMO_MS = 60 * 1000;

const json = (body, status = 200, maxAge = 0) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    },
  });

const memo = new Map();
async function remembered(key, build) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.body;
  const body = await build();
  if (body) memo.set(key, { at: Date.now(), body });
  return body;
}

const iso = (ms) => new Date(ms).toISOString();

async function dataset(env, name) {
  const body = await remembered(name, async () => {
    await ensureSchema(env.DB);
    const row = await readDataset(env.DB, name);
    if (!row) return null;
    // The stored body is already JSON; splice it in rather than parse and re-stringify.
    return `{"fetchedAt":"${iso(row.fetchedAt)}","stale":${Date.now() - row.fetchedAt > STALE_AFTER_MS[name]},"data":${row.body}}`;
  });
  return body ? json(body, 200, 60) : json({ error: `No ${name} stored yet.` }, 503);
}

async function equipmentPrices(env) {
  const body = await remembered('equipment', async () => {
    await ensureSchema(env.DB);
    const { results } = await env.DB.prepare('SELECT prices, ready, updated_at FROM equipment WHERE prices IS NOT NULL').all();
    if (!results.length) return null;
    const oldest = Math.min(...results.map((r) => r.updated_at));
    const ready = results.every((r) => r.ready);
    const items = results.map((r) => r.prices).filter(Boolean).join(',');
    return `{"fetchedAt":"${iso(oldest)}","stale":${Date.now() - oldest > STALE_AFTER_MS.equipment},"ready":${ready},`
      + `"source":"official trade history","averageWindowMinutes":10080,"minimumTransactionCount":5,"items":[${items}]}`;
  });
  return body
    ? json(body, 200, 60)
    : json({ error: 'No equipment prices yet. They are built from the official trade history, which is collected while the official API is up (about an hour for a full set).' }, 503);
}

/** What a dropped piece of each rarity is worth (prices.js lootPrices), from the last 7 days of trades. */
async function lootPriceRoute(env) {
  const body = await remembered('loot', async () => {
    await ensureSchema(env.DB);
    const config = await readDataset(env.DB, 'game-config');
    const { results } = await env.DB.prepare('SELECT code, recent FROM equipment WHERE recent IS NOT NULL').all();
    if (!config || !results.length) return null;
    const items = JSON.parse(config.body).items ?? {};
    const byRarity = {};
    for (const r of results) {
      const rarity = items[r.code]?.rarity;
      if (!rarity) continue;
      const list = (byRarity[rarity] ??= []);
      for (const t of JSON.parse(r.recent)) list.push(t);
    }
    return JSON.stringify({ at: iso(Date.now()), rarities: lootPrices(byRarity, Date.now()) });
  });
  return body ? json(body, 200, 60) : json({ error: 'No trades stored yet for loot prices.' }, 503);
}

/** A unit's recent contracts (won or currently led), newest first. */
async function unitContracts(env, request) {
  const mu = new URL(request.url).searchParams.get('mu');
  if (!mu || !/^[a-f0-9]{24}$/.test(mu)) return json({ error: 'Give ?mu=<unit id>.' }, 400);
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare('SELECT body FROM contracts WHERE winner = ? ORDER BY created_at DESC LIMIT 50').bind(mu).all();
  return json(`{"items":[${results.map((r) => r.body).join(',')}]}`, 200, 60);
}

/**
 * Value of 1 production point from the last 7 days of raw-material trades:
 * each raw material's average traded price per production point, averaged.
 * `days` says how much history is behind it (it fills up over a week).
 */
async function pointValue(env) {
  await ensureSchema(env.DB);
  const config = await readDataset(env.DB, 'game-config');
  if (!config) return json({ error: 'No game config yet.' }, 503);
  const items = JSON.parse(config.body).items ?? {};
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    'SELECT code, SUM(money) AS money, SUM(quantity) AS quantity, SUM(trades) AS trades, COUNT(DISTINCT day) AS days FROM raw_days WHERE day >= ? GROUP BY code',
  ).bind(since).all();
  const perPoint = results.filter((r) => r.quantity > 0 && items[r.code]?.productionPoints)
    .map((r) => ({ code: r.code, perPoint: r.money / r.quantity / items[r.code].productionPoints, trades: r.trades, days: r.days }));
  if (!perPoint.length) return json({ error: 'Raw-material trades are still being collected.' }, 503);
  const value = perPoint.reduce((s, r) => s + r.perPoint, 0) / perPoint.length;
  const days = Math.max(...perPoint.map((r) => r.days));
  return json({ value, days, trades: perPoint.reduce((s, r) => s + r.trades, 0), materials: perPoint }, 200, 300);
}

const routes = {
  '/api/health': () => json({ ok: true, time: new Date().toISOString() }),
  '/api/game-config': (env) => dataset(env, 'game-config'),
  '/api/item-prices': (env) => dataset(env, 'item-prices'),
  '/api/equipment-prices': (env) => equipmentPrices(env),
  '/api/loot-prices': (env) => lootPriceRoute(env),
  '/api/contracts': (env, request) => unitContracts(env, request),
  '/api/point-value': (env) => pointValue(env),
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    // Invite only: sign-in and admin routes, then nothing without a session.
    try {
      const auth = await handleAuthRoute(env, request);
      if (auth) return auth;
      if (!await currentSession(env, request)) return signInRequired(request);
    } catch (err) {
      console.error('auth', err);
      return json({ error: 'Server error' }, 500);
    }
    if (pathname.startsWith('/api/')) {
      const route = routes[pathname];
      if (!route) return json({ error: 'Not found' }, 404);
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405);
      try {
        return await route(env, request);
      } catch (err) {
        console.error(pathname, err);
        return json({ error: 'Server error' }, 500);
      }
    }
    // Signed-in pages and files must not be cached where someone else could get them.
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', (res.headers.get('Cache-Control') ?? '').includes('immutable') ? 'private, max-age=31536000, immutable' : 'private, no-cache');
    return out;
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runJob(env, event.scheduledTime));
  },
};
