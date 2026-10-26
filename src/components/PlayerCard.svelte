<script>
  import { findPlayer } from '../lib/warera.js';
  import { planner, loadPlayer } from '../lib/planner.svelte.js';

  const LAST = 'planner.lastPlayer';

  let name = $state('');
  let error = $state('');
  let loading = $state(false);

  async function load(username) {
    if (!username.trim()) return;
    loading = true;
    error = '';
    try {
      await loadPlayer(await findPlayer(username.trim()));
      name = planner.player.username;
      try { localStorage.setItem(LAST, planner.player.username); } catch {}
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Load the last player on return visits.
  try {
    const last = localStorage.getItem(LAST);
    if (last) { name = last; load(last); }
  } catch {}
</script>

<section class="card" aria-labelledby="player-title">
  <h2 id="player-title">Player</h2>
  <form onsubmit={(e) => { e.preventDefault(); load(name); }}>
    <label class="visually-hidden" for="player-name">Username</label>
    <input id="player-name" bind:value={name} placeholder="Username" autocomplete="off" spellcheck="false" />
    <button disabled={loading}>{loading ? 'Loading…' : 'Load'}</button>
  </form>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if planner.player}
    <p class="who">
      <strong>{planner.player.username}</strong>
      <span class="muted">· level {planner.player.level} · military rank +{planner.player.militaryRankPercent}% · skills and gear loaded, edit them below</span>
    </p>
  {:else if !loading}
    <p class="muted small">Load a player to start from their skills and worn gear, or edit the build below by hand.</p>
  {/if}
</section>

<style>
  form { display: flex; gap: 8px; }
  input {
    flex: 1;
    min-width: 0;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
  }
  button {
    background: var(--accent);
    color: var(--accent-ink);
    border: 0;
    border-radius: var(--radius-sm);
    padding: 8px 16px;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled { opacity: .6; cursor: default; }
  .error { color: var(--bad); }
  .who { margin: 10px 0 0; }
  .small { font-size: 13px; margin: 10px 0 0; }
</style>
