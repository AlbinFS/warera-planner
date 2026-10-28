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
  import UnitPage from './components/UnitPage.svelte';
  import ApiKeyDialog from './components/ApiKeyDialog.svelte';
  import EcoPage from './components/EcoPage.svelte';
  import SimulatePage from './components/SimulatePage.svelte';
  import InvitesPage from './components/InvitesPage.svelte';
  import ComparisonsPage from './components/ComparisonsPage.svelte';
  import BreakpointPanel from './components/BreakpointPanel.svelte';
  import { getApiKey } from './lib/warera.js';
  import { apiKeyState } from './lib/eco.svelte.js';
  import Dialog from './components/Dialog.svelte';
  import Icon from './components/Icon.svelte';
  import { loadMarket } from './lib/market.js';
  import { route, navigate } from './lib/route.svelte.js';
  import { mdiShieldSword, mdiFileDocumentOutline, mdiBookmarkMultiple, mdiAccountGroup, mdiKeyVariant, mdiCashMultiple, mdiLogout, mdiWeatherNight, mdiWeatherSunny, mdiDice5, mdiTicketConfirmation, mdiCompareHorizontal } from '@mdi/js';
  import { saved } from './lib/saved.svelte.js';
  import { restoreLastPlayer } from './lib/planner.svelte.js';
  import { trackCompanyProfit } from './lib/fightIncome.svelte.js';
  import { trackDebuff } from './lib/debuffAuto.svelte.js';

  // Raw: market data never changes after loading, and the workers need plain objects.
  let data = $state.raw(null);
  let loadError = $state('');
  let current = $state(null);
  let optimizing = $state(null); // 'gear' | 'skills' while its dialog is open
  let dialogOpen = $state(false);
  let keyOpen = $state(false);
  let hasKey = $state(!!getApiKey());

  // Dark unless light was picked with the button (remembered in this browser).
  let dark = $state(document.documentElement.dataset.theme !== 'light');
  function toggleTheme() {
    dark = !dark;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('warera.theme', dark ? 'dark' : 'light'); } catch {}
  }

  loadMarket().then((d) => { data = d; trackCompanyProfit(d.market); trackDebuff(d.market); }).catch((err) => (loadError = err.message));
  restoreLastPlayer();

  // Managers (players the admin picked) get an Invites page for their own codes.
  let manager = $state(null);
  async function loadManager() {
    const me = await fetch('/api/manager/me').then((r) => r.json()).catch(() => null);
    manager = me?.manager ? me : null;
  }
  loadManager();

  const PAGES = [
    { path: '/', label: 'Overview & MinMax', icon: mdiShieldSword, hint: 'Your build: damage, cost, and how to improve it' },
    { path: '/contract', label: 'Optimizer', icon: mdiFileDocumentOutline, hint: 'The best skills and gear for a bounty contract and the gold you want to spend' },
    { path: '/simulate', label: 'Simulate', icon: mdiDice5, hint: 'Play the planned build hit by hit: the spread of damage and profit' },
    { path: '/eco', label: 'Eco', icon: mdiCashMultiple, hint: 'Eco mode: skills, production, upgrades and employees' },
    { path: '/unit', label: 'Unit', icon: mdiAccountGroup, hint: "Your military unit's damage right now, and its contracts" },
    { path: '/builds', label: 'Saved builds', icon: mdiBookmarkMultiple, hint: 'Your saved builds, and side-by-side comparison' },
    { path: '/comparisons', label: 'Other tool comparisons', icon: mdiCompareHorizontal, hint: 'Why other WarEra tools can show different numbers for the same build' },
  ];
  const INVITES = { path: '/invites', label: 'Invites', icon: mdiTicketConfirmation, hint: 'Invite players: create and revoke your codes' };
  const pages = $derived(manager ? [...PAGES, INVITES] : PAGES);
  const page = $derived(pages.some((p) => p.path === route.path) ? route.path : '/');

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
    {#each pages as p (p.path)}
      <a href={p.path} title={p.hint} aria-current={page === p.path ? 'page' : undefined} onclick={(e) => go(e, p.path)}>
        <Icon path={p.icon} size={18} /> {p.label}
        {#if p.path === '/builds' && saved.builds.length}<span class="count">{saved.builds.length}</span>{/if}
      </a>
    {/each}
  </nav>
  <button class="key" class:on={hasKey} onclick={() => (keyOpen = true)} title="Optional: your WarEra API key for extra data">
    <Icon path={mdiKeyVariant} size={18} /> {hasKey ? 'API key on' : 'Add API key'}
  </button>
  <button class="key theme" onclick={toggleTheme} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
    <Icon path={dark ? mdiWeatherSunny : mdiWeatherNight} size={18} />
  </button>
  <a class="key signout" href="/auth/logout" title="Sign out on this device (frees one of your code's device slots)" aria-label="Sign out"><Icon path={mdiLogout} size={18} /></a>
</header>
<ApiKeyDialog bind:open={keyOpen} onchange={() => { hasKey = !!getApiKey(); apiKeyState.version++; }} />
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
{:else if page === '/simulate'}
  <SimulatePage {data} />
  <footer><DataStatus /></footer>
{:else if page === '/eco'}
  <EcoPage {data} />
  <footer><DataStatus /></footer>
{:else if page === '/unit'}
  <UnitPage {data} />
  <footer><DataStatus /></footer>
{:else if page === '/comparisons'}
  <ComparisonsPage />
{:else if page === '/invites'}
  <InvitesPage {manager} onchange={loadManager} />
{:else if page === '/builds'}
  <BuildsPage {data} />
  <footer><DataStatus /></footer>
{:else}
  <ResultPanel {data} onresult={(r) => (current = r)} onoptimize={openOptimizer} />
  <main>
    <div class="col">
      <PlayerCard />
      <GearPanel {data} {current} />
      <BreakdownPanel {data} {current} />
    </div>
    <div class="col">
      <BreakpointPanel {data} />
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
  .key {
    margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: var(--radius-sm);
    background: none; border: 1px solid var(--line); color: var(--muted); cursor: pointer; font-size: 13px;
  }
  .signout, .theme { margin-left: 0; }
  .signout { text-decoration: none; }
  .key.on { color: var(--good); border-color: var(--good); }
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
