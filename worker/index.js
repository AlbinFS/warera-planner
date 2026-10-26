/**
 * The site's Worker: static files come from the ASSETS binding, /api routes
 * are answered here. The scheduled price job is added in the next step; until
 * then /api/equipment-prices reports that prices aren't available yet.
 */
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

const routes = {
  '/api/health': () => json({ ok: true, time: new Date().toISOString() }),
  '/api/equipment-prices': () => json({ error: 'Equipment prices are not available yet.' }, 503),
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      const route = routes[pathname];
      if (!route) return json({ error: 'Not found' }, 404);
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, HEAD' });
      return route(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
