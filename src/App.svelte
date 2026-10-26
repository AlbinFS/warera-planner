<script>
  import SettingsBar from './components/SettingsBar.svelte';
  import PlayerCard from './components/PlayerCard.svelte';
  import DataStatus from './components/DataStatus.svelte';
</script>

<header>
  <h1>WarEra Build Planner</h1>
  <nav aria-label="Main">
    <a href="/" aria-current="page">Planner</a>
    <span class="soon" title="Coming soon">Contract</span>
  </nav>
</header>
<SettingsBar />
<main>
  <PlayerCard />
  <DataStatus />
</main>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    padding: 12px var(--gap);
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  h1 { font-size: 18px; margin: 0; letter-spacing: .02em; }
  nav { display: flex; gap: 16px; }
  nav a, .soon { color: var(--muted); text-decoration: none; padding: 4px 0; }
  nav a[aria-current='page'] { color: var(--text); box-shadow: inset 0 -2px var(--accent); }
  .soon { opacity: .5; cursor: default; }
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--gap);
    display: grid;
    gap: var(--gap);
  }
  main :global(.card) {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: var(--gap);
  }
  main :global(h2) { font-size: 13px; margin: 0 0 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
</style>
