<script>
  import { cached } from '../lib/warera.js';
  import { planner, loadByName, loadUser, playerStatus, lastPlayerName } from '../lib/planner.svelte.js';
  import SearchBox from './SearchBox.svelte';
  import { flagImage } from '../lib/visual.js';

  let name = $state(planner.player?.username ?? lastPlayerName());
  let country = $state(null);

  // Loading the player again resets the skills and gear planned for them: ask first.
  const isLoaded = (username) => !!planner.player && !planner.player.shared && planner.player.username?.toLowerCase() === username?.trim().toLowerCase();
  const confirmReload = () => confirm(`Load ${planner.player.username} again? This resets the skills and gear you've planned to what they have in the game.`);

  async function load(username) {
    if (isLoaded(username) && !confirmReload()) return;
    await loadByName(username);
    if (planner.player?.username) name = planner.player.username;
  }
  async function pick(r) {
    // Picking the player already loaded changes nothing.
    if (isLoaded(r.name)) { name = planner.player.username; return; }
    await loadUser(r.user);
    name = planner.player?.username ?? name;
  }

  // The player's country, for the flag.
  $effect(() => {
    const id = planner.player?.countryId;
    country = null;
    if (id) cached('country.getCountryById', { countryId: id }, 24 * 60 * 60 * 1000).then((c) => (country = c)).catch(() => {});
  });
</script>

<section class="card player" class:empty={!planner.player} aria-labelledby="player-title">
  <h2 id="player-title" class="visually-hidden">Player</h2>
  {#if planner.player?.shared}
    <div class="who">
      <div>
        <div class="name"><strong>{planner.player.label ?? 'Shared build'}</strong></div>
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
    <SearchBox kinds={['players']} placeholder="WarEra username" bind:value={name} busy={playerStatus.loading}
      current={planner.player?.shared ? null : planner.player?.username} onpick={pick} />
    <button disabled={playerStatus.loading}>{playerStatus.loading ? 'Loading…' : planner.player ? 'Load' : 'Load my build'}</button>
  </form>
  {#if playerStatus.error}<p class="error" role="alert">{playerStatus.error}</p>{/if}
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
  button {
    background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius-sm);
    padding: 8px 16px; font-weight: 600; cursor: pointer; white-space: nowrap;
  }
  button:disabled { opacity: .6; cursor: default; }
  .error { color: var(--bad); margin: 8px 0 0; }
</style>
