<script>
  import SettingsBar from './components/SettingsBar.svelte';
  import PlayerCard from './components/PlayerCard.svelte';
  import SkillsPanel from './components/SkillsPanel.svelte';
  import GearPanel from './components/GearPanel.svelte';
  import ResultPanel from './components/ResultPanel.svelte';
  import OptimizePanel from './components/OptimizePanel.svelte';
  import DataStatus from './components/DataStatus.svelte';
  import ContractPage from './components/ContractPage.svelte';
  import BuildsPage from './components/BuildsPage.svelte';
  import BreakdownPanel from './components/BreakdownPanel.svelte';
  import Dialog from './components/Dialog.svelte';
  import Icon from './components/Icon.svelte';
  import { loadMarket } from './lib/market.js';
  import { route, navigate } from './lib/route.svelte.js';
  import { mdiShieldSword, mdiFileDocumentOutline, mdiBookmarkMultiple } from '@mdi/js';
  import { saved } from './lib/saved.svelte.js';

  // Raw: market data never changes after loading, and the workers need plain objects.
  let data = $state.raw(null);
  let loadError = $state('');
  let current = $state(null);
  let optimizing = $state(null); // 'gear' | 'skills' while its dialog is open
  let dialogOpen = $state(false);

  loadMarket().then((d) => (data = d)).catch((err) => (loadError = err.message));

  const PAGES = [
    { path: '/', label: 'Planner', icon: mdiShieldSword, hint: 'Your build: damage, cost, and how to improve it' },
    { path: '/contract', label: 'Contract', icon: mdiFileDocumentOutline, hint: 'The best build for a bounty contract' },
    { path: '/builds', label: 'Saved builds', icon: mdiBookmarkMultiple, hint: 'Your saved builds, and side-by-side comparison' },
  ];
  const page = $derived(PAGES.some((p) => p.path === route.path) ? route.path : '/');

  function go(event, path) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(path);
  }

  function openOptimizer(kind) {
    optimizing = kind;
    dialogOpen = true;
  }
</script>

<header>
  <h1>WarEra Build Planner</h1>
  <nav aria-label="Main">
    {#each PAGES as p (p.path)}
      <a href={p.path} title={p.hint} aria-current={page === p.path ? 'page' : undefined} onclick={(e) => go(e, p.path)}>
        <Icon path={p.icon} size={18} /> {p.label}
        {#if p.path === '/builds' && saved.builds.length}<span class="count">{saved.builds.length}</span>{/if}
      </a>
    {/each}
  </nav>
</header>
<SettingsBar />

{#if !data}
  <main class="single">
    <section class="card">
      {#if loadError}<p class="error">Couldn't load market data: {loadError}</p>{:else}<p class="muted">Loading market data…</p>{/if}
    </section>
    <DataStatus />
  </main>
{:else if page === '/contract'}
  <ContractPage {data} />
  <footer><DataStatus /></footer>
{:else if page === '/builds'}
  <BuildsPage {data} />
  <footer><DataStatus /></footer>
{:else}
  <ResultPanel {data} onresult={(r) => (current = r)} onoptimize={openOptimizer} />
  <main>
    <div class="col">
      <PlayerCard />
      <GearPanel {data} />
      <BreakdownPanel {data} {current} />
    </div>
    <div class="col">
      <SkillsPanel market={data.market} />
    </div>
  </main>
  <footer><DataStatus /></footer>
  <Dialog bind:open={dialogOpen} title={optimizing === 'skills' ? 'Optimize skills' : 'Optimize gear'}>
    <OptimizePanel {data} {current} show={optimizing} />
  </Dialog>
{/if}

<style>
  header {
    display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
    padding: 10px var(--gap); background: var(--surface); border-bottom: 1px solid var(--line);
  }
  h1 { font-size: 18px; margin: 0; letter-spacing: .02em; }
  nav { display: flex; gap: 6px; }
  nav a {
    display: inline-flex; align-items: center; gap: 6px; color: var(--muted); text-decoration: none;
    padding: 6px 12px; border-radius: var(--radius-sm);
  }
  .count { font-size: 11px; background: var(--accent); color: var(--accent-ink); border-radius: 999px; padding: 0 6px; font-weight: 700; }
  nav { flex-wrap: wrap; }
  nav a:hover { color: var(--text); background: var(--surface-2); }
  nav a[aria-current='page'] { color: var(--text); background: var(--surface-2); box-shadow: inset 0 -2px var(--accent); }
  main {
    max-width: 1280px; margin: 0 auto; padding: var(--gap);
    display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: var(--gap); align-items: start;
  }
  main.single { grid-template-columns: minmax(0, 1fr); max-width: 700px; }
  .col { display: grid; gap: var(--gap); min-width: 0; }
  footer { max-width: 1280px; margin: 0 auto; padding: 0 var(--gap) var(--gap); }
  @media (max-width: 900px) {
    main { grid-template-columns: minmax(0, 1fr); }
  }
  .error { color: var(--bad); }
  :global(.card) {
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
    padding: var(--gap); min-width: 0;
  }
  :global(.card h2) { font-size: 13px; margin: 0 0 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
</style>
