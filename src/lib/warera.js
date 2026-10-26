/**
 * Calls to the official WarEra API, straight from the browser (public
 * endpoints, no key). Responses are cached in memory for `ttlMs`, so every
 * part of the page sees the same data and nothing is fetched twice.
 */
const API = 'https://api2.warera.io/trpc/';

const cache = new Map();

const API_DOWN = "Can't reach the official WarEra API right now. It may be down; try again in a few minutes.";

async function call(procedure, input = {}) {
  let res;
  try {
    res = await fetch(API + procedure, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    // The browser only says "Failed to fetch": the API is unreachable, or down
    // and answering without CORS headers.
    throw new Error(API_DOWN);
  }
  if (res.status >= 500) throw new Error(API_DOWN);
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.result?.data === undefined) {
    throw new Error(body?.error?.message ?? `${procedure} failed (${res.status})`);
  }
  return body.result.data;
}

/** A cached call: the same procedure and input within ttlMs share one request. */
export function cached(procedure, input = {}, ttlMs = 5 * 60 * 1000) {
  const key = procedure + JSON.stringify(input);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise;
  const promise = call(procedure, input);
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));
  return promise;
}

/**
 * Game data from this site's /api, which keeps the last good copy when the
 * official API is down. Falls back to the official API if /api has nothing.
 * Resolves to { data, fetchedAt: Date, stale, source }.
 */
async function siteData(path, procedure) {
  try {
    const res = await fetch(path);
    if (res.ok) {
      const body = await res.json();
      return { data: body.data, fetchedAt: new Date(body.fetchedAt), stale: body.stale, source: 'site' };
    }
  } catch {}
  try {
    const data = await cached(procedure);
    return { data, fetchedAt: new Date(), stale: false, source: 'official API' };
  } catch {
    throw new Error('The official WarEra API is down and no copy is saved yet. The site saves one as soon as the API answers again.');
  }
}

const once = (load) => {
  let promise = null;
  return () => (promise ??= load().catch((err) => { promise = null; throw err; }));
};

export const getGameConfig = once(() => siteData('/api/game-config', 'gameConfig.getGameConfig'));
export const getItemPrices = once(() => siteData('/api/item-prices', 'itemTrading.getPrices'));

/** Per-roll equipment prices; only this site has them (built from trade history). */
export const getEquipmentPrices = once(async () => {
  const res = await fetch('/api/equipment-prices');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return { data: body, fetchedAt: new Date(body.fetchedAt), stale: body.stale, ready: body.ready, source: 'site' };
});

/** Finds a player by exact username (case-insensitive), else the best match. */
export async function findPlayer(name) {
  const found = await cached('search.searchAnything', { searchText: name });
  const ids = (found.userIds ?? []).slice(0, 5);
  if (!ids.length) throw new Error(`No player named "${name}".`);
  const users = await Promise.all(ids.map((userId) => cached('user.getUserLite', { userId }).catch(() => null)));
  const user = users.find((u) => u?.username?.toLowerCase() === name.toLowerCase()) ?? users.find(Boolean);
  if (!user) throw new Error('Could not load the player.');
  return user;
}
