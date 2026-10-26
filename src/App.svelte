<script>
  import SettingsBar from './components/SettingsBar.svelte';
  import PlayerCard from './components/PlayerCard.svelte';
  import SkillsPanel from './components/SkillsPanel.svelte';
  import GearPanel from './components/GearPanel.svelte';
  import ResultPanel from './components/ResultPanel.svelte';
  import OptimizePanel from './components/OptimizePanel.svelte';
  import DataStatus from './components/DataStatus.svelte';
  import { loadMarket } from './lib/market.js';

  // Raw: market data never changes after loading, and the workers need plain objects.
  let data = $state.raw(null);
  let loadError = $state('');
  let current = $state(null);

  loadMarket().then((d) => (data = d)).catch((err) => (loadError = err.message));
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
  <div class="col">
    <PlayerCard />
    {#if data}
      <SkillsPanel market={data.market} />
      <GearPanel {data} />
    {/if}
  </div>
  <div class="col">
    {#if data}
      <ResultPanel {data} onresult={(r) => (current = r)} />
      <OptimizePanel {data} {current} />
    {:else if loadError}
      <section class="card"><p class="error">Couldn't load market data: {loadError}</p></section>
    {:else}
      <section class="card"><p class="muted">Loading market data…</p></section>
    {/if}
    <DataStatus />
  </div>
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
    max-width: 1280px;
    margin: 0 auto;
    padding: var(--gap);
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: var(--gap);
    align-items: start;
  }
  .col { display: grid; gap: var(--gap); min-width: 0; }
  @media (max-width: 900px) {
    main { grid-template-columns: minmax(0, 1fr); }
  }
  .error { color: var(--bad); }
  main :global(.card) {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: var(--gap);
  }
  main :global(h2) { font-size: 13px; margin: 0 0 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
</style>
