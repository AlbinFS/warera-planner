/**
 * The site's Worker: static files come from the ASSETS binding, /api routes
 * are answered from D1, and the scheduled job (job.js) keeps D1 filled.
 *
 * Every data route answers { fetchedAt, stale, ... }: when the official API
 * is down the job keeps the last good copy, and `stale` tells the site so.
 */
import { runJob, ensureSchema, readDataset } from './job.js';

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

const routes = {
  '/api/health': () => json({ ok: true, time: new Date().toISOString() }),
  '/api/game-config': (env) => dataset(env, 'game-config'),
  '/api/item-prices': (env) => dataset(env, 'item-prices'),
  '/api/equipment-prices': (env) => equipmentPrices(env),
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      const route = routes[pathname];
      if (!route) return json({ error: 'Not found' }, 404);
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405);
      try {
        return await route(env);
      } catch (err) {
        console.error(pathname, err);
        return json({ error: 'Server error' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runJob(env, event.scheduledTime));
  },
};
