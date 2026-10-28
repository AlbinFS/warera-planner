<script>
  /**
   * For managers only: create invite codes (a few per 7 days, set by the
   * admin) and revoke the ones you created, which signs out whoever they let in.
   */
  import Icon from './Icon.svelte';
  import { mdiContentCopy, mdiCheck } from '@mdi/js';

  let { manager, onchange } = $props();

  let label = $state('');
  let code = $state('');
  let copied = $state(false);
  let error = $state('');
  let busy = $state(false);

  async function call(action, body) {
    const res = await fetch('/api/manager/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  async function create(event) {
    event.preventDefault();
    error = ''; busy = true;
    try {
      code = (await call('create', { label })).code;
      copied = false; label = '';
      await onchange();
    } catch (err) { error = err.message; }
    busy = false;
  }

  async function revoke(invite) {
    const who = invite.player ? `${invite.player} is signed out and can't sign in with it again.` : "It can't be used any more.";
    if (!confirm(`Revoke this code? ${who}`)) return;
    error = '';
    try { await call('revoke', { codeHash: invite.codeHash }); await onchange(); }
    catch (err) { error = err.message; }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(code); copied = true; } catch {}
  }

  const when = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
</script>

<div class="page">
  <section class="card intro">
    <h2>Invites</h2>
    <p class="muted">
      As a manager you can invite up to <strong>{manager.weekly}</strong> players in any 7 days. Each code works for one player on up to 2 devices.
      You can revoke only the codes you created; revoking one signs out the player it let in.
    </p>
  </section>

  <section class="card">
    <p class="left">
      {#if manager.left}<strong>{manager.left}</strong> of {manager.weekly} codes left in the last 7 days.
      {:else}You've used your {manager.weekly} codes for now. The next one frees up {when(manager.nextAt)}.{/if}
    </p>
    <form class="create" onsubmit={create}>
      <label>Who it's for (a note only you and the admin see) <input bind:value={label} maxlength="80" disabled={!manager.left}></label>
      <button class="primary" disabled={!manager.left || busy}>Create code</button>
    </form>
    {#if error}<p class="error">{error}</p>{/if}
    {#if code}
      <div class="newcode">
        <p>Copy this code now and send it to the player: it can't be shown again.</p>
        <div class="code">
          <span class="num">{code}</span>
          <button type="button" class="ghost" onclick={copy}><Icon path={copied ? mdiCheck : mdiContentCopy} size={16} /> {copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p class="muted small">They sign in at this site with the code and their WarEra username.</p>
      </div>
    {/if}
  </section>

  <section class="card scroll">
    <table>
      <thead><tr><th>Note</th><th>Player</th><th>Devices</th><th>Created</th><th></th></tr></thead>
      <tbody>
        {#each manager.invites as i (i.codeHash)}
          <tr class:revoked={i.revoked}>
            <td>{i.label || '–'}</td>
            <td>{#if i.player}{i.player}{:else}<span class="muted">not used yet</span>{/if}</td>
            <td class="num">{i.devices} / {i.maxDevices}</td>
            <td>{when(i.created_at)}</td>
            <td>{#if i.revoked}<span class="muted">revoked</span>{:else}<button type="button" class="ghost" onclick={() => revoke(i)}>Revoke</button>{/if}</td>
          </tr>
        {:else}
          <tr><td colspan="5" class="muted">No codes yet.</td></tr>
        {/each}
      </tbody>
    </table>
  </section>
</div>

<style>
  .page { display: grid; gap: var(--gap); max-width: 900px; margin: 0 auto; padding: var(--gap); }
  .intro h2 { text-transform: none; letter-spacing: 0; font-size: 16px; color: var(--text); margin-bottom: 6px; }
  .intro p, .left { margin: 0; }
  .create { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; margin-top: 12px; }
  .create label { display: grid; gap: 4px; flex: 1; min-width: 220px; font-size: 13px; color: var(--muted); }
  input { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 7px 9px; color: var(--text); }
  button { display: inline-flex; align-items: center; gap: 6px; border-radius: var(--radius-sm); padding: 7px 12px; cursor: pointer; font-size: 13px; }
  button:disabled { opacity: .5; cursor: default; }
  .primary { background: var(--accent); color: var(--accent-ink); border: 0; font-weight: 600; }
  .ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); }
  .error { color: var(--bad); margin: 8px 0 0; }
  .newcode { margin-top: 14px; padding: 12px; border: 1px solid var(--accent); border-radius: var(--radius); }
  .newcode p { margin: 0; }
  .code { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 10px 0; }
  .code span { font-family: var(--mono); font-size: 20px; letter-spacing: 1px; color: var(--accent); }
  .small { font-size: 12px; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 7px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
  thead th { font-size: 13px; }
  tr.revoked td { color: var(--muted); text-decoration: line-through; }
  tr.revoked td:last-child { text-decoration: none; }
</style>
