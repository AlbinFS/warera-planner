/**
 * Invite-only access.
 *
 * - Invite codes are created on the admin page. Only their SHA-256 hash is stored.
 * - Redeeming: the visitor gives a code and their WarEra username, renames
 *   one of their companies to a short check word, and the Worker confirms it
 *   through the official API (they can rename it back right after). The code is then bound to that
 *   player; later devices need the same code and the same check.
 * - Each verified device gets a random session token in a secure, HttpOnly
 *   cookie (only its hash is stored). At most `max_devices` active devices
 *   per code; sessions don't expire, they're revoked on the admin page.
 * - The admin page is protected by the ADMIN_PASSWORD secret.
 * - Managers: players the admin names (by WarEra player, not a password).
 *   Signed in to the site as themselves, they can create a few invite codes
 *   a week (MANAGER_WEEKLY, or what the admin sets) and revoke the ones they
 *   created, which signs out whoever those codes let in. Nothing else.
 */
import { WareraApi } from './warera.js';
import { LOGIN_PAGE, ADMIN_PAGE } from './auth-pages.js';

const SESSION_COOKIE = 'wp_session';
const ADMIN_COOKIE = 'wp_admin';
const TEN_YEARS = 10 * 365 * 24 * 60 * 60;
const CHECK_WORD_TTL_MS = 30 * 60 * 1000;
// Invite codes a manager can create in any 7 days, unless the admin sets another number.
const MANAGER_WEEKLY = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Devices a manager's code allows (the admin's own codes can allow up to 5).
const MANAGER_DEVICES = 2;
// last_seen is written at most this often per session (D1 writes are limited); the site
// checks in every 2 minutes while a tab is open, so "online" is seen within the last 5.
const SEEN_EVERY_MS = 2 * 60 * 1000;
const ONLINE_MS = 5 * 60 * 1000;

export const AUTH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS invites (
     code_hash TEXT PRIMARY KEY,
     label TEXT,
     max_devices INTEGER NOT NULL DEFAULT 2,
     player_id TEXT,
     player_name TEXT,
     created_at INTEGER NOT NULL,
     revoked INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY,
     code_hash TEXT NOT NULL,
     player_id TEXT,
     device TEXT,
     created_at INTEGER NOT NULL,
     last_seen INTEGER NOT NULL,
     revoked INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS managers (
     player_id TEXT PRIMARY KEY,
     player_name TEXT NOT NULL,
     weekly INTEGER NOT NULL,
     added_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS pending_checks (
     code_hash TEXT PRIMARY KEY,
     player_id TEXT NOT NULL,
     player_name TEXT NOT NULL,
     word TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
];

// ─── Helpers ────────────────────────────────────────────────────────────────

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Invite codes: 4 groups of 4 from an alphabet without look-alikes (~79 bits). */
export function newInviteCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...b].map((x) => alphabet[x % alphabet.length]).join('');
  return chars.match(/.{4}/g).join('-');
}

const normalizeCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, '$1-');

function cookies(request) {
  return Object.fromEntries((request.headers.get('Cookie') ?? '').split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, v.join('=')]));
}

const cookieHeader = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

const jsonResponse = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});

function deviceName(request) {
  const ua = request.headers.get('User-Agent') ?? '';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${browser} on ${os}`;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

const memo = new Map(); // token hash → { at, ok } for a minute per Worker instance

let schemaReady = false;
async function ensureAuthSchema(db) {
  if (schemaReady) return;
  await db.batch(AUTH_SCHEMA.map((sql) => db.prepare(sql)));
  // Added later: who created a code (a manager's player id; none for the admin's). Fails once it exists.
  await db.prepare('ALTER TABLE invites ADD COLUMN created_by TEXT').run().catch(() => {});
  await db.prepare('CREATE INDEX IF NOT EXISTS invites_created_by ON invites (created_by, created_at)').run();
  schemaReady = true;
}

/** The visitor's session if their cookie is valid (or they're the admin), else null. */
export async function currentSession(env, request) {
  await ensureAuthSchema(env.DB);
  // The admin may also be signed in as their player (a manager, say): keep both.
  const player = await playerSession(env, request);
  if (await isAdmin(env, request)) return { ...player, admin: true };
  return player;
}

async function playerSession(env, request) {
  const token = cookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const hash = await sha256(token);
  const hit = memo.get(hash);
  let entry = hit && Date.now() - hit.at < 60 * 1000 ? hit : null;
  if (!entry) {
    const row = await env.DB.prepare(
      `SELECT s.token_hash, s.player_id, s.last_seen FROM sessions s JOIN invites i ON i.code_hash = s.code_hash
       WHERE s.token_hash = ? AND s.revoked = 0 AND i.revoked = 0`,
    ).bind(hash).first();
    entry = { at: Date.now(), session: row ? { tokenHash: row.token_hash, playerId: row.player_id } : null, seen: Math.max(row?.last_seen ?? 0, hit?.seen ?? 0) };
    memo.set(hash, entry);
  }
  // Last seen (for the admin's "Online right now"), also between database reads.
  if (entry.session && Date.now() - entry.seen > SEEN_EVERY_MS) {
    entry.seen = Date.now();
    await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').bind(entry.seen, hash).run();
  }
  return entry.session;
}

/** Finds a player by exact username: { _id, username } or null. */
async function findPlayer(env, username) {
  const api = new WareraApi(env);
  const name = String(username ?? '').trim();
  const found = await api.call('search.searchAnything', { searchText: name }).catch(() => null);
  const users = await Promise.all((found?.userIds ?? []).slice(0, 5).map((userId) => api.call('user.getUserLite', { userId }).catch(() => null)));
  return users.find((u) => u?.username?.toLowerCase() === name.toLowerCase()) ?? null;
}

async function activeDevices(env, codeHash) {
  const r = await env.DB.prepare('SELECT count(*) AS n FROM sessions WHERE code_hash = ? AND revoked = 0').bind(codeHash).first();
  return r.n;
}

// ─── Redeeming a code ───────────────────────────────────────────────────────

/** Step 1: code + username → a check word to use as one company's name. */
async function start(env, request) {
  const { code, username } = await request.json().catch(() => ({}));
  const codeHash = await sha256(normalizeCode(code));
  const invite = await env.DB.prepare('SELECT * FROM invites WHERE code_hash = ? AND revoked = 0').bind(codeHash).first();
  if (!invite) return jsonResponse({ error: 'That invite code is not valid.' }, 400);
  if (await activeDevices(env, codeHash) >= invite.max_devices) {
    return jsonResponse({ error: `This code is already used on ${invite.max_devices} devices. Ask for a device to be removed.` }, 403);
  }
  const user = await findPlayer(env, username);
  if (!user) return jsonResponse({ error: 'No WarEra player with that exact username.' }, 400);
  if (invite.player_id && invite.player_id !== user._id) {
    return jsonResponse({ error: 'This code belongs to another player.' }, 403);
  }
  const word = `WP-${newInviteCode().slice(0, 9)}`;
  await env.DB.prepare('INSERT OR REPLACE INTO pending_checks (code_hash, player_id, player_name, word, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(codeHash, user._id, user.username, word, Date.now()).run();
  return jsonResponse({ word, player: user.username });
}

async function ownsCompanyNamed(env, playerId, word) {
  const api = new WareraApi(env);
  const list = await api.call('company.getCompanies', { userId: playerId, perPage: 100 }).catch(() => null);
  const ids = (list?.items ?? []).map((c) => (typeof c === 'string' ? c : c._id)).filter(Boolean).slice(0, 50);
  const companies = await api.batch('company.getById', ids.map((companyId) => ({ companyId }))).catch(() => []);
  const want = word.toUpperCase();
  return companies.some((c) => String(c?.name ?? '').trim().toUpperCase() === want);
}

/** Step 2: one of the player's companies is named the check word → log this device in. */
async function verify(env, request) {
  const { code } = await request.json().catch(() => ({}));
  const codeHash = await sha256(normalizeCode(code));
  const pending = await env.DB.prepare('SELECT * FROM pending_checks WHERE code_hash = ?').bind(codeHash).first();
  if (!pending || Date.now() - pending.created_at > CHECK_WORD_TTL_MS) {
    return jsonResponse({ error: 'Start again: the check word has expired.' }, 400);
  }
  const invite = await env.DB.prepare('SELECT * FROM invites WHERE code_hash = ? AND revoked = 0').bind(codeHash).first();
  if (!invite) return jsonResponse({ error: 'That invite code is not valid.' }, 400);
  if (await activeDevices(env, codeHash) >= invite.max_devices) {
    return jsonResponse({ error: `This code is already used on ${invite.max_devices} devices.` }, 403);
  }
  if (!await ownsCompanyNamed(env, pending.player_id, pending.word)) {
    return jsonResponse({ error: `None of ${pending.player_name}'s companies is named "${pending.word}" yet. Rename one in the game, wait a few seconds, and try again.` }, 400);
  }
  const token = randomToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, code_hash, player_id, device, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await sha256(token), codeHash, pending.player_id, deviceName(request), now, now),
    env.DB.prepare('UPDATE invites SET player_id = ?, player_name = ? WHERE code_hash = ?').bind(pending.player_id, pending.player_name, codeHash),
    env.DB.prepare('DELETE FROM pending_checks WHERE code_hash = ?').bind(codeHash),
  ]);
  return jsonResponse({ ok: true, player: pending.player_name }, 200, { 'Set-Cookie': cookieHeader(SESSION_COOKIE, token, TEN_YEARS) });
}

async function logout(env, request) {
  const token = cookies(request)[SESSION_COOKIE];
  if (token) {
    const hash = await sha256(token);
    await env.DB.prepare('UPDATE sessions SET revoked = 1 WHERE token_hash = ?').bind(hash).run();
    memo.delete(hash);
  }
  return new Response(null, { status: 302, headers: { Location: '/login', 'Set-Cookie': cookieHeader(SESSION_COOKIE, '', 0) } });
}

// ─── Admin ──────────────────────────────────────────────────────────────────

async function adminCookieValue(env) {
  return sha256(`admin:${env.ADMIN_PASSWORD}`);
}

async function isAdmin(env, request) {
  if (!env.ADMIN_PASSWORD) return false;
  return cookies(request)[ADMIN_COOKIE] === await adminCookieValue(env);
}

async function adminLogin(env, request) {
  const { password } = await request.json().catch(() => ({}));
  if (!env.ADMIN_PASSWORD) return jsonResponse({ error: 'The ADMIN_PASSWORD secret is not set on the Worker.' }, 500);
  // Compare hashes, so the comparison takes the same time whatever was typed.
  if (await sha256(String(password ?? '')) !== await sha256(env.ADMIN_PASSWORD)) return jsonResponse({ error: 'Wrong password.' }, 403);
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': cookieHeader(ADMIN_COOKIE, await adminCookieValue(env), 30 * 24 * 60 * 60) });
}

async function adminApi(env, request, action) {
  if (!await isAdmin(env, request)) return jsonResponse({ error: 'Not signed in as admin.' }, 401);
  const db = env.DB;
  if (action === 'list') {
    const { results: invites } = await db.prepare('SELECT * FROM invites ORDER BY created_at DESC').all();
    const { results: sessions } = await db.prepare('SELECT token_hash, code_hash, device, created_at, last_seen, revoked FROM sessions ORDER BY created_at DESC').all();
    const { results: managers } = await db.prepare('SELECT * FROM managers ORDER BY added_at').all();
    const since = Date.now() - WEEK_MS;
    const nameOf = Object.fromEntries(managers.map((m) => [m.player_id, m.player_name]));
    // Who's online: a device seen in the last few minutes, by player (newest first).
    const now = Date.now();
    const live = sessions.filter((s) => !s.revoked && now - s.last_seen < ONLINE_MS);
    const playerOf = Object.fromEntries(invites.map((i) => [i.code_hash, i]));
    const online = live.map((s) => ({ player: playerOf[s.code_hash]?.player_name ?? null, label: playerOf[s.code_hash]?.label ?? '', device: s.device, last_seen: s.last_seen }))
      .sort((a, b) => b.last_seen - a.last_seen);
    return jsonResponse({
      now, onlineMinutes: ONLINE_MS / 60000, online,
      invites: invites.map((i) => ({
        ...i, created_by_name: i.created_by ? nameOf[i.created_by] ?? 'a former manager' : null,
        devices: sessions.filter((s) => s.code_hash === i.code_hash && !s.revoked).map((s) => ({ id: s.token_hash.slice(0, 16), device: s.device, created_at: s.created_at, last_seen: s.last_seen })),
      })),
      managers: managers.map((m) => ({ ...m, thisWeek: invites.filter((i) => i.created_by === m.player_id && i.created_at > since).length, total: invites.filter((i) => i.created_by === m.player_id).length })),
    });
  }
  const body = await request.json().catch(() => ({}));
  if (action === 'create') {
    const code = newInviteCode();
    await db.prepare('INSERT INTO invites (code_hash, label, max_devices, created_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256(code), String(body.label ?? '').slice(0, 80), Math.min(5, Math.max(1, Number(body.maxDevices) || 2)), Date.now()).run();
    return jsonResponse({ code });
  }
  if (action === 'revoke-code') {
    await db.batch([
      db.prepare('UPDATE invites SET revoked = 1 WHERE code_hash = ?').bind(body.codeHash),
      db.prepare('UPDATE sessions SET revoked = 1 WHERE code_hash = ?').bind(body.codeHash),
    ]);
    memo.clear();
    return jsonResponse({ ok: true });
  }
  if (action === 'add-manager') {
    const user = await findPlayer(env, body.username);
    if (!user) return jsonResponse({ error: 'No WarEra player with that exact username.' }, 400);
    const weekly = Math.min(50, Math.max(1, Math.floor(Number(body.weekly) || MANAGER_WEEKLY)));
    await db.prepare('INSERT INTO managers (player_id, player_name, weekly, added_at) VALUES (?, ?, ?, ?) ON CONFLICT (player_id) DO UPDATE SET player_name = excluded.player_name, weekly = excluded.weekly')
      .bind(user._id, user.username, weekly, Date.now()).run();
    return jsonResponse({ ok: true, player: user.username });
  }
  if (action === 'set-weekly') {
    await db.prepare('UPDATE managers SET weekly = ? WHERE player_id = ?').bind(Math.min(50, Math.max(1, Math.floor(Number(body.weekly) || MANAGER_WEEKLY))), body.playerId).run();
    return jsonResponse({ ok: true });
  }
  if (action === 'remove-manager') {
    // Their codes stay valid: revoke them in the list if they should go too.
    await db.prepare('DELETE FROM managers WHERE player_id = ?').bind(body.playerId).run();
    return jsonResponse({ ok: true });
  }
  if (action === 'remove-device') {
    await db.prepare('UPDATE sessions SET revoked = 1 WHERE substr(token_hash, 1, 16) = ? AND code_hash = ?').bind(body.id, body.codeHash).run();
    memo.clear();
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'Unknown action.' }, 404);
}

// ─── Managers ───────────────────────────────────────────────────────────────

/**
 * A manager's own invite codes, for the site's Invites page (they're signed in
 * as their player; no password). GET me → { manager: false } or { manager:
 * true, weekly, left, nextAt, invites }; POST create { label } → { code };
 * POST revoke { codeHash }: only a code they created.
 */
export async function managerApi(env, request, session, action) {
  await ensureAuthSchema(env.DB);
  const db = env.DB;
  const manager = session?.playerId ? await db.prepare('SELECT * FROM managers WHERE player_id = ?').bind(session.playerId).first() : null;
  if (!manager) return jsonResponse(action === 'me' ? { manager: false } : { error: 'Only managers can do that.' }, action === 'me' ? 200 : 403);
  const now = Date.now();
  const { results: mine } = await db.prepare('SELECT * FROM invites WHERE created_by = ? ORDER BY created_at DESC').bind(manager.player_id).all();
  const recent = mine.filter((i) => i.created_at > now - WEEK_MS);
  const left = Math.max(0, manager.weekly - recent.length);
  if (action === 'me' && request.method === 'GET') {
    const hashes = mine.map((i) => i.code_hash);
    const sessions = hashes.length
      ? (await db.prepare(`SELECT code_hash, count(*) AS n FROM sessions WHERE revoked = 0 AND code_hash IN (${hashes.map(() => '?').join(',')}) GROUP BY code_hash`).bind(...hashes).all()).results
      : [];
    const devices = Object.fromEntries(sessions.map((s) => [s.code_hash, s.n]));
    return jsonResponse({
      manager: true, name: manager.player_name, weekly: manager.weekly, left,
      // When the oldest code of the last 7 days stops counting (the next one becomes free).
      nextAt: left ? null : Math.min(...recent.map((i) => i.created_at)) + WEEK_MS,
      invites: mine.map((i) => ({ codeHash: i.code_hash, label: i.label, player: i.player_name, created_at: i.created_at, revoked: !!i.revoked, devices: devices[i.code_hash] ?? 0, maxDevices: i.max_devices })),
    });
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  const body = await request.json().catch(() => ({}));
  if (action === 'create') {
    if (!left) return jsonResponse({ error: `You've used your ${manager.weekly} codes for this week.` }, 429);
    const code = newInviteCode();
    await db.prepare('INSERT INTO invites (code_hash, label, max_devices, created_at, created_by) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256(code), String(body.label ?? '').slice(0, 80), MANAGER_DEVICES, now, manager.player_id).run();
    return jsonResponse({ code });
  }
  if (action === 'revoke') {
    // Only a code this manager created: it and everyone signed in with it.
    const own = mine.find((i) => i.code_hash === body.codeHash);
    if (!own) return jsonResponse({ error: 'You can only revoke codes you created.' }, 403);
    await db.batch([
      db.prepare('UPDATE invites SET revoked = 1 WHERE code_hash = ? AND created_by = ?').bind(own.code_hash, manager.player_id),
      db.prepare('UPDATE sessions SET revoked = 1 WHERE code_hash = ?').bind(own.code_hash),
    ]);
    memo.clear();
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'Unknown action.' }, 404);
}

// ─── Routing ────────────────────────────────────────────────────────────────

const html = (body) => new Response(body, {
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' },
});

/**
 * Handles login, logout and admin routes. Returns a Response for those, or
 * null when the request is for the site itself (then the caller checks the session).
 */
export async function handleAuthRoute(env, request) {
  const { pathname } = new URL(request.url);
  if (!/^\/(login|auth|admin)(\/|$)/.test(pathname)) return null;
  await ensureAuthSchema(env.DB);
  const post = request.method === 'POST';
  if (pathname === '/login') return html(LOGIN_PAGE);
  if (pathname === '/auth/start' && post) return start(env, request);
  if (pathname === '/auth/verify' && post) return verify(env, request);
  if (pathname === '/auth/logout') return logout(env, request);
  if (pathname === '/admin') return html(ADMIN_PAGE);
  if (pathname === '/admin/login' && post) return adminLogin(env, request);
  if (pathname.startsWith('/admin/api/')) return adminApi(env, request, pathname.slice('/admin/api/'.length));
  return new Response('Not found', { status: 404 });
}

/** What a visitor without a session gets: the sign-in page for pages, 401 for everything else. */
export function signInRequired(request) {
  const wantsPage = request.method === 'GET' && (request.headers.get('Accept') ?? '').includes('text/html');
  if (wantsPage) return new Response(null, { status: 302, headers: { Location: '/login', 'Cache-Control': 'no-store' } });
  return jsonResponse({ error: 'Sign in first.' }, 401);
}
