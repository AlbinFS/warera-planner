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
 */
import { WareraApi } from './warera.js';
import { LOGIN_PAGE, ADMIN_PAGE } from './auth-pages.js';

const SESSION_COOKIE = 'wp_session';
const ADMIN_COOKIE = 'wp_admin';
const TEN_YEARS = 10 * 365 * 24 * 60 * 60;
const CHECK_WORD_TTL_MS = 30 * 60 * 1000;
// last_seen is written at most this often per session (D1 writes are limited).
const SEEN_EVERY_MS = 60 * 60 * 1000;

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
  schemaReady = true;
}

/** The visitor's session if their cookie is valid (or they're the admin), else null. */
export async function currentSession(env, request) {
  await ensureAuthSchema(env.DB);
  if (await isAdmin(env, request)) return { admin: true };
  const token = cookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const hash = await sha256(token);
  const hit = memo.get(hash);
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.session;
  const row = await env.DB.prepare(
    `SELECT s.token_hash, s.player_id, s.last_seen FROM sessions s JOIN invites i ON i.code_hash = s.code_hash
     WHERE s.token_hash = ? AND s.revoked = 0 AND i.revoked = 0`,
  ).bind(hash).first();
  const session = row ? { tokenHash: row.token_hash, playerId: row.player_id } : null;
  memo.set(hash, { at: Date.now(), session });
  if (row && Date.now() - row.last_seen > SEEN_EVERY_MS) {
    await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').bind(Date.now(), hash).run();
  }
  return session;
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
  const api = new WareraApi(env);
  const found = await api.call('search.searchAnything', { searchText: String(username ?? '').trim() }).catch(() => null);
  const users = await Promise.all((found?.userIds ?? []).slice(0, 5).map((userId) => api.call('user.getUserLite', { userId }).catch(() => null)));
  const user = users.find((u) => u?.username?.toLowerCase() === String(username ?? '').trim().toLowerCase());
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
    return jsonResponse({
      invites: invites.map((i) => ({ ...i, devices: sessions.filter((s) => s.code_hash === i.code_hash && !s.revoked).map((s) => ({ id: s.token_hash.slice(0, 16), device: s.device, created_at: s.created_at, last_seen: s.last_seen })) })),
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
  if (action === 'remove-device') {
    await db.prepare('UPDATE sessions SET revoked = 1 WHERE substr(token_hash, 1, 16) = ? AND code_hash = ?').bind(body.id, body.codeHash).run();
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
