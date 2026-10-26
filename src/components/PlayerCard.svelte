<script>
  import { findPlayer, cached } from '../lib/warera.js';
  import { planner, loadPlayer } from '../lib/planner.svelte.js';
  import { flagImage } from '../lib/visual.js';
  import Icon from './Icon.svelte';
  import { mdiAccountSearch } from '@mdi/js';

  const LAST = 'planner.lastPlayer';

  let name = $state('');
  let error = $state('');
  let loading = $state(false);
  let country = $state(null);

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

  // The player's country, for the flag.
  $effect(() => {
    const id = planner.player?.countryId;
    country = null;
    if (id) cached('country.getCountryById', { countryId: id }, 24 * 60 * 60 * 1000).then((c) => (country = c)).catch(() => {});
  });

  // Load the last player on return visits (not when switching pages: that would undo edits).
  if (planner.player) {
    name = planner.player.username ?? '';
  } else {
    try {
      const last = localStorage.getItem(LAST);
      if (last) { name = last; load(last); }
    } catch {}
  }
</script>

<section class="card player" class:empty={!planner.player} aria-labelledby="player-title">
  <h2 id="player-title" class="visually-hidden">Player</h2>
  {#if planner.player?.shared}
    <div class="who">
      <div>
        <div class="name"><strong>Shared build</strong></div>
        <div class="muted small">Level {planner.player.level} · military rank +{planner.player.militaryRankPercent}% · load your own player below to compare</div>
      </div>
      <div class="level num" title="Level">{planner.player.level}</div>
    </div>
  {:else if planner.player}
    <div class="who">
      {#if planner.player.avatarUrl}<img class="avatar" src={planner.player.avatarUrl} alt="" width="52" height="52" />{/if}
      <div>
        <div class="name">
          {#if country?.code}<img class="flag" src={flagImage(country.code)} alt={country.name} title={country.name} width="22" height="16" />{/if}
          <strong>{planner.player.username}</strong>
        </div>
        <div class="muted small">Level {planner.player.level} · military rank +{planner.player.militaryRankPercent}%</div>
      </div>
      <div class="level num" title="Level">{planner.player.level}</div>
    </div>
  {:else}
    <p class="intro"><strong>Start with your WarEra username.</strong> Your skills and the gear you wear are loaded, then you can change anything and see the damage and cost update.</p>
  {/if}
  <form onsubmit={(e) => { e.preventDefault(); load(name); }}>
    <label class="visually-hidden" for="player-name">Username</label>
    <span class="search"><Icon path={mdiAccountSearch} size={18} /><input id="player-name" bind:value={name} placeholder="WarEra username" autocomplete="off" spellcheck="false" /></span>
    <button disabled={loading}>{loading ? 'Loading…' : planner.player ? 'Load' : 'Load my build'}</button>
  </form>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .who { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .avatar { border-radius: 10px; object-fit: cover; }
  .name { display: flex; align-items: center; gap: 8px; font-size: 17px; }
  .flag { border-radius: 2px; }
  .level { margin-left: auto; font-size: 34px; font-weight: 700; color: var(--muted); }
  .small { font-size: 13px; }
  .intro { margin: 0 0 12px; }
  .player.empty { border-color: var(--accent); }
  form { display: flex; gap: 8px; }
  .search {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 0 10px;
    background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--muted);
  }
  .search input { flex: 1; min-width: 0; background: none; border: 0; padding: 9px 0; color: var(--text); outline: none; }
  .search:focus-within { outline: 2px solid var(--accent); }
  button {
    background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius-sm);
    padding: 8px 16px; font-weight: 600; cursor: pointer; white-space: nowrap;
  }
  button:disabled { opacity: .6; cursor: default; }
  .error { color: var(--bad); margin: 8px 0 0; }
</style>
