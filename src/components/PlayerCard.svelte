<script>
  import { findPlayer } from '../lib/warera.js';

  const FIGHT = [
    ['attack', 'Attack'], ['precision', 'Precision'], ['criticalChance', 'Crit chance'],
    ['criticalDamages', 'Crit damage'], ['armor', 'Armor'], ['dodge', 'Dodge'],
    ['health', 'Health'], ['lootChance', 'Loot chance'], ['hunger', 'Hunger'],
  ];

  let name = $state('');
  let player = $state(null);
  let error = $state('');
  let loading = $state(false);

  async function load(event) {
    event.preventDefault();
    if (!name.trim()) return;
    loading = true;
    error = '';
    try {
      player = await findPlayer(name.trim());
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<section class="card" aria-label="Player">
  <h2>Player</h2>
  <form onsubmit={load}>
    <label class="visually-hidden" for="player-name">Username</label>
    <input id="player-name" bind:value={name} placeholder="Username" autocomplete="off" spellcheck="false" />
    <button disabled={loading}>{loading ? 'Loading…' : 'Load'}</button>
  </form>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if player}
    <div class="player">
      <div><strong>{player.username}</strong> <span class="muted">· level {player.leveling?.level ?? '?'}</span></div>
      <dl class="skills">
        {#each FIGHT as [key, label] (key)}
          <div><dt>{label}</dt><dd class="num">{player.skills?.[key]?.level ?? 0}</dd></div>
        {/each}
      </dl>
    </div>
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
  .player { margin-top: 12px; }
  .skills { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px 16px; margin: 10px 0 0; }
  .skills div { display: flex; justify-content: space-between; border-bottom: 1px solid var(--line); padding: 4px 0; }
  dt { color: var(--muted); }
  dd { margin: 0; }
</style>
