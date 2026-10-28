/** The sign-in and admin pages: plain HTML, served by the Worker before the site loads. */

const STYLE = `
  :root { color-scheme: dark; --bg: #0d0f12; --surface: #15181d; --surface-2: #1b1f26; --line: #2a2f38; --text: #e7e9ee; --muted: #8b93a1; --accent: #e1c06d; --accent-ink: #1a1406; --good: #4cc38a; --bad: #e0605a; }
  :root[data-theme='light'] { color-scheme: light; --bg: #f5f6f8; --surface: #ffffff; --surface-2: #eef0f3; --line: #d9dde3; --text: #15181d; --muted: #5d6573; --accent: #a77d17; --accent-ink: #ffffff; --good: #1f8a5a; --bad: #c23a33; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; display: grid; place-items: start center; padding: 48px 16px; }
  main { width: 100%; max-width: 460px; }
  main.wide { max-width: 980px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-top: 16px; }
  label { display: grid; gap: 4px; margin-bottom: 12px; color: var(--muted); font-size: 13px; }
  input { background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; color: var(--text); font-size: 15px; width: 100%; }
  button { background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 8px; padding: 10px 16px; font-weight: 600; font-size: 15px; cursor: pointer; }
  button.ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); font-weight: 500; padding: 5px 10px; font-size: 13px; }
  button:disabled { opacity: .5; cursor: default; }
  .muted { color: var(--muted); }
  .error { color: var(--bad); min-height: 1.5em; margin: 8px 0 0; }
  .word { font: 700 24px ui-monospace, Consolas, monospace; letter-spacing: .06em; background: var(--surface-2); border: 1px dashed var(--accent); border-radius: 8px; padding: 10px; text-align: center; margin: 10px 0; user-select: all; }
  ol { padding-left: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 500; font-size: 12px; }
  .row { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
  .row label { margin: 0; flex: 1; min-width: 160px; }
  .revoked { opacity: .45; }
  .scroll { overflow-x: auto; }
  [hidden] { display: none !important; }
`;

const page = (title, body, script) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title><style>${STYLE}</style>
<script>try { const t = localStorage.getItem('warera.theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch {}</script></head>
<body>${body}<script>${script}</script></body></html>`;

export const LOGIN_PAGE = page('Sign in', `
<main>
  <h1>WarEra planner</h1>
  <p class="muted">Invite only. Enter your invite code and your WarEra username.</p>
  <form class="card" id="start">
    <label>Invite code <input name="code" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" required></label>
    <label>WarEra username <input name="username" autocomplete="off" spellcheck="false" required></label>
    <button>Continue</button>
    <p class="error" id="err1"></p>
  </form>
  <section class="card" id="check" hidden>
    <p>Prove that <strong id="player"></strong> is your account:</p>
    <ol>
      <li>In the game, rename one of your companies to:<div class="word" id="word"></div></li>
      <li>Wait a few seconds, then press Verify.</li>
      <li>Once you're in, rename the company back.</li>
    </ol>
    <button id="verify">Verify</button> <button class="ghost" id="back" type="button">Back</button>
    <p class="error" id="err2"></p>
    <p class="muted" style="font-size:13px">The word is valid for 30 minutes. Each invite code works for one player on up to 2 devices.</p>
  </section>
</main>`, `
const $ = (id) => document.getElementById(id);
let code = '';
async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: 'Something went wrong. Try again.' }));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
$('start').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), btn = e.target.querySelector('button');
  code = f.get('code'); $('err1').textContent = ''; btn.disabled = true;
  try {
    const r = await post('/auth/start', { code, username: f.get('username') });
    $('word').textContent = r.word; $('player').textContent = r.player;
    $('start').hidden = true; $('check').hidden = false;
  } catch (err) { $('err1').textContent = err.message; }
  btn.disabled = false;
});
$('verify').addEventListener('click', async () => {
  $('err2').textContent = ''; $('verify').disabled = true;
  try { await post('/auth/verify', { code }); location.href = '/'; }
  catch (err) { $('err2').textContent = err.message; $('verify').disabled = false; }
});
$('back').addEventListener('click', () => { $('check').hidden = true; $('start').hidden = false; });
`);

export const ADMIN_PAGE = page('Admin', `
<main class="wide">
  <h1>Invites</h1>
  <form class="card" id="login" hidden>
    <label>Admin password <input type="password" name="password" autocomplete="current-password" required></label>
    <button>Sign in</button>
    <p class="error" id="err"></p>
  </form>
  <div id="panel" hidden>
    <form class="card row" id="create">
      <label>Who it's for (a note only you see) <input name="label" maxlength="80"></label>
      <label style="max-width:120px;flex:none">Devices <input name="maxDevices" type="number" min="1" max="5" value="2"></label>
      <button>Create code</button>
    </form>
    <section class="card" id="newcode" hidden>
      <p>New code. Copy it now: it is stored only as a hash and can't be shown again.</p>
      <div class="word" id="code"></div>
    </section>
    <section class="card scroll">
      <table>
        <thead><tr><th>Note</th><th>Player</th><th>Devices</th><th>Created</th><th>By</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </section>
    <h2>Managers</h2>
    <p class="muted">Players who can create invite codes themselves, on the site's Invites page while signed in as their player. They can revoke only the codes they created.</p>
    <form class="card row" id="addmanager">
      <label>WarEra username <input name="username" maxlength="40" required></label>
      <label style="max-width:140px;flex:none">Codes per 7 days <input name="weekly" type="number" min="1" max="50" value="5"></label>
      <button>Add manager</button>
    </form>
    <p class="error" id="merr"></p>
    <section class="card scroll">
      <table>
        <thead><tr><th>Player</th><th>Codes per 7 days</th><th>Last 7 days</th><th>All codes</th><th>Added</th><th></th></tr></thead>
        <tbody id="mrows"></tbody>
      </table>
    </section>
  </div>
</main>`, `
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const when = (ms) => new Date(ms).toLocaleString();
async function api(action, body) {
  const res = await fetch('/admin/api/' + action, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { $('login').hidden = false; $('panel').hidden = true; throw new Error('signed out'); }
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}
async function refresh() {
  const { invites, managers } = await api('list');
  $('login').hidden = true; $('panel').hidden = false;
  $('rows').innerHTML = invites.map((i) => '<tr class="' + (i.revoked ? 'revoked' : '') + '">'
    + '<td>' + esc(i.label || '–') + '</td>'
    + '<td>' + (i.player_name ? esc(i.player_name) : '<span class="muted">not used yet</span>') + '</td>'
    + '<td>' + (i.devices.length ? i.devices.map((d) => esc(d.device) + ' <span class="muted">· last seen ' + when(d.last_seen) + '</span> '
        + (i.revoked ? '' : '<button class="ghost" data-remove="' + d.id + '" data-code="' + i.code_hash + '">Remove</button>')).join('<br>') : '<span class="muted">none</span>')
    + ' <span class="muted">(' + i.devices.length + ' / ' + i.max_devices + ')</span></td>'
    + '<td>' + when(i.created_at) + '</td>'
    + '<td>' + (i.created_by_name ? esc(i.created_by_name) : '<span class="muted">you</span>') + '</td>'
    + '<td>' + (i.revoked ? 'revoked' : '<button class="ghost" data-revoke="' + i.code_hash + '">Revoke code</button>') + '</td></tr>').join('');
  $('mrows').innerHTML = managers.length ? managers.map((m) => '<tr>'
    + '<td>' + esc(m.player_name) + '</td>'
    + '<td><input type="number" min="1" max="50" value="' + m.weekly + '" data-weekly="' + esc(m.player_id) + '" style="width:70px"></td>'
    + '<td>' + m.thisWeek + ' / ' + m.weekly + '</td>'
    + '<td>' + m.total + '</td>'
    + '<td>' + when(m.added_at) + '</td>'
    + '<td><button class="ghost" data-unmanage="' + esc(m.player_id) + '">Remove</button></td></tr>').join('')
    : '<tr><td colspan="6" class="muted">No managers yet.</td></tr>';
}
$('login').addEventListener('submit', async (e) => {
  e.preventDefault(); $('err').textContent = '';
  const res = await fetch('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: new FormData(e.target).get('password') }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { $('err').textContent = data.error || 'Failed'; return; }
  e.target.reset(); refresh();
});
$('create').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { code } = await api('create', { label: f.get('label'), maxDevices: Number(f.get('maxDevices')) });
  $('code').textContent = code; $('newcode').hidden = false; e.target.reset(); refresh();
});
$('rows').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.revoke && confirm('Revoke this code? Everyone using it is signed out.')) await api('revoke-code', { codeHash: b.dataset.revoke });
  if (b.dataset.remove && confirm('Sign this device out? The code can then be used on another device.')) await api('remove-device', { id: b.dataset.remove, codeHash: b.dataset.code });
  refresh();
});
$('addmanager').addEventListener('submit', async (e) => {
  e.preventDefault(); $('merr').textContent = '';
  const f = new FormData(e.target);
  try { await api('add-manager', { username: f.get('username'), weekly: Number(f.get('weekly')) }); e.target.reset(); refresh(); }
  catch (err) { $('merr').textContent = err.message; }
});
$('mrows').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-unmanage]'); if (!b) return;
  if (confirm('Remove this manager? Codes they already made keep working; revoke those above if they should go too.')) { await api('remove-manager', { playerId: b.dataset.unmanage }); refresh(); }
});
$('mrows').addEventListener('change', async (e) => {
  const i = e.target.closest('input[data-weekly]'); if (!i) return;
  await api('set-weekly', { playerId: i.dataset.weekly, weekly: Number(i.value) }); refresh();
});
refresh().catch(() => {});
`);
