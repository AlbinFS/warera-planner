/**
 * Server-side calls to the official WarEra API, with the API key. A tRPC
 * batch (many calls in one request) costs one request against the key's
 * limit of 500 per minute, and one subrequest of the Worker's 50 per run.
 */
const DEFAULT_BASE = 'https://api2.warera.io/trpc';

export class WareraApi {
  constructor(env) {
    this.base = env.WARERA_API_BASE || DEFAULT_BASE;
    this.key = env.WARERA_API_KEY || null;
  }

  async send(path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.key) headers['X-API-Key'] = this.key;
    const res = await fetch(`${this.base}/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json().catch(() => null);
    return { res, json };
  }

  async call(procedure, body = {}) {
    const { res, json } = await this.send(procedure, body);
    const data = json?.result?.data;
    if (!res.ok || data === undefined) throw new Error(`${procedure}: HTTP ${res.status}`);
    return data;
  }

  /** One procedure for several inputs in a single request; null where a call failed. */
  async batch(procedure, bodies) {
    if (!bodies.length) return [];
    const path = `${bodies.map(() => procedure).join(',')}?batch=1`;
    const { res, json } = await this.send(path, Object.fromEntries(bodies.map((b, i) => [String(i), b])));
    if (!Array.isArray(json)) throw new Error(`${procedure} batch: HTTP ${res.status}`);
    return bodies.map((_, i) => json[i]?.result?.data ?? null);
  }
}
