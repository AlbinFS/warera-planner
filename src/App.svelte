<script>
  import SettingsBar from './components/SettingsBar.svelte';
  import PlayerCard from './components/PlayerCard.svelte';
  import SkillsPanel from './components/SkillsPanel.svelte';
  import GearPanel from './components/GearPanel.svelte';
  import ResultPanel from './components/ResultPanel.svelte';
  import OptimizePanel from './components/OptimizePanel.svelte';
  import DataStatus from './components/DataStatus.svelte';
  import ContractPage from './components/ContractPage.svelte';
  import { loadMarket } from './lib/market.js';
  import { route, navigate } from './lib/route.svelte.js';

  // Raw: market data never changes after loading, and the workers need plain objects.
  let data = $state.raw(null);
  let loadError = $state('');
  let current = $state(null);

  loadMarket().then((d) => (data = d)).catch((err) => (loadError = err.message));

  const PAGES = [{ path: '/', label: 'Planner' }, { path: '/contract', label: 'Contract' }];
  const page = $derived(route.path === '/contract' ? '/contract' : '/');

  function go(event, path) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(path);
  }
</script>

<header>
  <h1>WarEra Build Planner</h1>
  <nav aria-label="Main">
    {#each PAGES as p (p.path)}
      <a href={p.path} aria-current={page === p.path ? 'page' : undefined} onclick={(e) => go(e, p.path)}>{p.label}</a>
    {/each}
  </nav>
</header>
<SettingsBar />

{#if !data}
  <main class="loading">
    <section class="card">
      {#if loadError}<p class="error">Couldn't load market data: {loadError}</p>{:else}<p class="muted">Loading market data…</p>{/if}
    </section>
    <DataStatus />
  </main>
{:else if page === '/contract'}
  <ContractPage {data} />
{:else}
  <main>
    <div class="col">
      <PlayerCard />
      <SkillsPanel market={data.market} />
      <GearPanel {data} />
    </div>
    <div class="col">
      <ResultPanel {data} onresult={(r) => (current = r)} />
      <OptimizePanel {data} {current} />
      <DataStatus />
    </div>
  </main>
{/if}

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
  nav a { color: var(--muted); text-decoration: none; padding: 4px 0; }
  nav a:hover { color: var(--text); }
  nav a[aria-current='page'] { color: var(--text); box-shadow: inset 0 -2px var(--accent); }
  main {
    max-width: 1280px;
    margin: 0 auto;
    padding: var(--gap);
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: var(--gap);
    align-items: start;
  }
  main.loading { grid-template-columns: minmax(0, 1fr); max-width: 700px; }
  .col { display: grid; gap: var(--gap); min-width: 0; }
  @media (max-width: 900px) {
    main { grid-template-columns: minmax(0, 1fr); }
  }
  .error { color: var(--bad); }
  :global(.card) {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: var(--gap);
    min-width: 0;
  }
  :global(.card h2) { font-size: 13px; margin: 0 0 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
</style>
