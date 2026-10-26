/**
 * Calls to the official WarEra API, straight from the browser (public
 * endpoints, no key). Responses are cached in memory for `ttlMs`, so every
 * part of the page sees the same data and nothing is fetched twice.
 */
const API = 'https://api2.warera.io/trpc/';

const cache = new Map();

async function call(procedure, input = {}) {
  const res = await fetch(API + procedure, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
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

export const getGameConfig = () => cached('gameConfig.getGameConfig', {}, 60 * 60 * 1000);
export const getItemPrices = () => cached('itemTrading.getPrices');

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
