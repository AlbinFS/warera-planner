/**
 * Calls to the official WarEra API, straight from the browser (public
 * endpoints, no key). Responses are cached in memory for `ttlMs`, so every
 * part of the page sees the same data and nothing is fetched twice.
 */
const API = 'https://api2.warera.io/trpc/';

const cache = new Map();

/**
 * The visitor's own WarEra API key, if they added one. It stays in this
 * browser and is only ever sent to the official API.
 */
const KEY_STORAGE = 'warera.apiKey';
export function getApiKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}
export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {}
  cache.clear();
}
function headers() {
  const key = getApiKey();
  return { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}) };
}

const API_DOWN = "Can't reach the official WarEra API right now. It may be down; try again in a few minutes.";

async function call(procedure, input = {}) {
  let res;
  try {
    // input null: a procedure that takes none (a POST, even an empty one, is refused), as a GET.
    res = input == null
      ? await fetch(API + procedure, { headers: headers() })
      : await fetch(API + procedure, { method: 'POST', headers: headers(), body: JSON.stringify(input) });
  } catch {
    // The browser only says "Failed to fetch": the API is unreachable, or down
    // and answering without CORS headers.
    throw new Error(API_DOWN);
  }
  if (res.status >= 500) throw new Error(API_DOWN);
  if (res.status === 429) throw new Error('The official API is limiting requests right now. Wait a minute, or add your API key for a higher limit.');
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.result?.data === undefined) {
    throw new Error(body?.error?.message ?? `${procedure} failed (${res.status})`);
  }
  return body.result.data;
}

/**
 * Many calls in one request (tRPC batching), which counts as a single request
 * against the API's rate limit. calls: [[procedure, input], …]; resolves to
 * the results in order, or null where a call failed. Cached like `cached`.
 */
export async function cachedBatch(calls, ttlMs = 60 * 1000) {
  const results = new Array(calls.length).fill(undefined);
  const missing = [];
  calls.forEach(([procedure, input], i) => {
    const hit = cache.get(procedure + JSON.stringify(input));
    if (hit && Date.now() - hit.at < ttlMs) results[i] = hit.promise;
    else missing.push(i);
  });
  // Up to 50 calls per request, the API's batch size.
  for (let start = 0; start < missing.length; start += 50) {
    const chunk = missing.slice(start, start + 50);
    const path = chunk.map((i) => calls[i][0]).join(',');
    const body = Object.fromEntries(chunk.map((i, j) => [String(j), calls[i][1]]));
    const request = (async () => {
      let res;
      try {
        res = await fetch(`${API}${path}?batch=1`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      } catch {
        throw new Error(API_DOWN);
      }
      if (res.status === 429) throw new Error('The official API is limiting requests right now. Wait a minute, or add your API key for a higher limit.');
      if (res.status >= 500) throw new Error(API_DOWN);
      const json = await res.json().catch(() => null);
      if (!Array.isArray(json)) throw new Error(`Batch request failed (${res.status})`);
      return json;
    })();
    chunk.forEach((i, j) => {
      const promise = request.then((json) => json[j]?.result?.data ?? null);
      cache.set(calls[i][0] + JSON.stringify(calls[i][1]), { at: Date.now(), promise });
      promise.catch(() => cache.delete(calls[i][0] + JSON.stringify(calls[i][1])));
      results[i] = promise;
    });
  }
  return Promise.all(results);
}

/** A cached call: the same procedure and input within ttlMs share one request. */
/** Drops what's kept for these procedures, so the next call asks the game again. */
export function forget(...procedures) {
  for (const key of [...cache.keys()]) if (procedures.some((p) => key.startsWith(p + '{'))) cache.delete(key);
}

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

/** Battle-loot value per rarity: 24 h trade median, or 7 days without manipulated days. Only this site has it. */
export const getLootPrices = once(async () => {
  const res = await fetch('/api/loot-prices');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.rarities;
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
