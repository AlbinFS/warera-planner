<script>
  /**
   * Eco mode (game update v0.27): the eco skill optimizer, what to produce and
   * which upgrades pay back, and employees (from the game).
   */
  import { planner } from '../lib/planner.svelte.js';
  import { ecoSettings, ecoEmployees, loadCompanies, apiKeyState } from '../lib/eco.svelte.js';
  import { maxRank } from '../lib/prestige.js';
  import { GAME_POINT_VALUE, GAME_POINT_VALUE_NOTE, pointValueFromWages, goodsProfit, ecoValue, trainingsPerDayOf, pointValues } from '../lib/eco.js';
  import { FIGHT_SKILLS } from '../engine/inputs.js';
  import { staffModels } from '../lib/income.js';
  import { cardValues } from '../lib/training.js';
  import { cached } from '../lib/warera.js';
  import EcoSkills from './EcoSkills.svelte';
  import EcoProduction from './EcoProduction.svelte';
  import EcoEmployees from './EcoEmployees.svelte';
  import EcoPlayground from './EcoPlayground.svelte';
  import EcoHiring from './EcoHiring.svelte';
  import EcoTraining from './EcoTraining.svelte';
  import EcoAlerts from './EcoAlerts.svelte';
  import EcoManagers from './EcoManagers.svelte';
  import EcoLocation from './EcoLocation.svelte';
  import EcoSwitch from './EcoSwitch.svelte';
  import Icon from './Icon.svelte';
  import { mdiSchool, mdiFactory, mdiAccountHardHat, mdiTuneVariant, mdiAccountPlus, mdiHammerWrench, mdiMapMarkerRadius, mdiCardsPlaying, mdiRefresh } from '@mdi/js';

  let { data } = $props();
  const items = $derived(data.market.gameConfigItems);
  const config = $derived({ skills: data.market.gameConfigSkills, upgrades: data.upgrades, items });

  // The open tab, kept in this browser so a reload opens it again.
  const TAB_KEY = 'eco.tab';
  let tab = $state((() => { try { return localStorage.getItem(TAB_KEY) || 'skills'; } catch { return 'skills'; } })());
  $effect(() => { const t = tab; try { localStorage.setItem(TAB_KEY, t); } catch {} });

  /*
   * Boxes fold: click a box's title to hide what's under it, again to show it.
   * Which ones are folded is kept in this browser (by title), and put back on
   * every box that appears (tabs swap boxes in and out).
   */
  const FOLD_KEY = 'eco.folded.v1';
  const folded = new Set((() => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]'); } catch { return []; } })());
  const titleOf = (h) => h.textContent.trim();
  // The box's child that holds the title stays visible.
  const headOf = (card, h) => { let x = h; while (x.parentElement && x.parentElement !== card) x = x.parentElement; return x; };
  function applyFolds(root) {
    for (const h of root.querySelectorAll('.card h2')) {
      const card = h.closest('.card');
      if (!card || h !== card.querySelector('h2')) continue;
      headOf(card, h).classList.add('fold-head');
      card.classList.add('foldable');
      card.classList.toggle('folded', folded.has(titleOf(h)));
    }
  }
  function folds(node) {
    applyFolds(node);
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; applyFolds(node); }, 0);
    });
    observer.observe(node, { childList: true, subtree: true });
    const onClick = (e) => {
      const h = e.target.closest('h2');
      const card = h?.closest('.card.foldable');
      if (!card || h !== card.querySelector('h2') || e.target.closest('a, button, input, select, label')) return;
      const t = titleOf(h);
      if (folded.has(t)) folded.delete(t); else folded.add(t);
      card.classList.toggle('folded', folded.has(t));
      try { localStorage.setItem(FOLD_KEY, JSON.stringify([...folded])); } catch {}
    };
    node.addEventListener('click', onClick);
    return { destroy() { observer.disconnect(); node.removeEventListener('click', onClick); } };
  }
  // Where companies are, for traits that care (Patriot, Expat, tax).
  let countries = $state.raw({});
  let regions = $state.raw({});
  cached('country.getAllCountries', {}, 60 * 60 * 1000).then((list) => (countries = Object.fromEntries((list ?? []).map((c) => [c._id, c])))).catch(() => {});
  cached('region.getRegionsObject', {}, 60 * 60 * 1000).then((r) => (regions = r ?? {})).catch(() => {});
  let companies = $state.raw([]);
  let error = $state('');
  let loading = $state(false);

  $effect(() => {
    const id = planner.player?.id;
    // A new API key loads again (employees need one).
    apiKeyState.version;
    if (!id) return;
    loading = true;
    loadCompanies(id).then((c) => { companies = c; error = ''; loadedAt = new Date(); }).catch((err) => (error = err.message)).finally(() => (loading = false));
  });

  // Refresh: your companies and employees again, straight from the game (after training someone, say).
  let loadedAt = $state(null);
  let refreshing = $state(false);
  async function refresh() {
    const id = planner.player?.id;
    if (!id || refreshing) return;
    refreshing = true;
    try { companies = await loadCompanies(id, { fresh: true }); error = ''; loadedAt = new Date(); } catch (err) { error = err.message; }
    refreshing = false;
  }

  // The game's own values of a production point: overall (gameStat.getPpMoneyValue) and per good
  // (getPpMoneyValueByItem, what its "Estimated profit" uses), refreshed with the page.
  let gameValue = $state(null);
  let gameByItem = $state.raw(null);
  cached('gameStat.getPpMoneyValue', null, 5 * 60 * 1000).then((v) => (gameValue = typeof v === 'number' ? v : null)).catch(() => {});
  cached('gameStat.getPpMoneyValueByItem', null, 5 * 60 * 1000).then((v) => (gameByItem = v ?? null)).catch(() => {});
  // The point value: the game's own number unless a newer one is typed in; without it, what the employees' wages say.
  const fromWages = $derived(pointValueFromWages(Object.values(ecoEmployees).flat()));
  const estimate = $derived(gameValue ?? fromWages ?? GAME_POINT_VALUE);
  const estimateNote = $derived(gameValue ? "the game's current value" : fromWages ? "the game's current value, read from your employees' wages" : GAME_POINT_VALUE_NOTE);
  const pointValue = $derived(ecoSettings.pointValue > 0 ? ecoSettings.pointValue : estimate);
  const goods = $derived(goodsProfit(items, data.market.itemPrices));
  // The game's own levels and prestige ranks (each rank one more level).
  const ownRank = (s) => planner.player?.own?.prestige?.[s] ?? 0;
  const currentManagementValue = $derived(ecoValue(data.market.gameConfigSkills, 'management', planner.player?.ecoLevels?.management ?? 0, ownRank('management')));
  // Each good's value per point as the game counts it, today's prices where it has none.
  const perPoint = $derived(pointValues(items, data.market.itemPrices, gameByItem));

  // The employees as the hiring and training models see them; what a toolbox is worth to them.
  const staffing = $derived(staffModels(companies, ecoEmployees, { perPoint, managementPercent: 2 * currentManagementValue, regions, countries, items }));
  // What each Management level adds a day through better training cards (Leadership's before v0.27.3).
  // Past level 10 with prestige ranks.
  const managementTop = $derived(Math.max(0, ...Object.keys(data.market.gameConfigSkills.management?.levels ?? { 0: 1 }).map(Number)) + maxRank(Math.max(planner.player?.prestigePoints ?? 0, planner.player?.own?.prestigePoints ?? 0)));
  const cardsByLevel = $derived(cardValues(staffing.models, managementTop));
  // The owner's Management level (with prestige ranks): better training cards and +2 % event odds a level.
  const managementLevel = $derived((planner.player?.ecoLevels?.management ?? 0) + ownRank('management'));
  // What 10 energy of self-work makes now: the Production skill's points at the best-paying good.
  const selfWorkValue = $derived(ecoValue(data.market.gameConfigSkills, 'production', planner.player?.ecoLevels?.production ?? 0, ownRank('production')) * Math.max(0, ...companies.filter((c) => !c.disabled).map((c) => perPoint[c.good] ?? 0)));

  /** Everything the model needs, from the companies, employees and settings. */
  const plan = $derived({
    companies: [
      ...companies.map((c) => ({ ...c, employees: ecoEmployees[c.id] ?? [] })),
      // Companies you'd build: a new one has a level 1 engine and makes the best-paying good.
      ...Array.from({ length: Math.max(0, Math.floor(Number(ecoSettings.extraCompanies) || 0)) }, (_, i) => ({
        id: `new-${i}`, name: 'New company', good: goods[0]?.code, engine: 1, employees: [], isNew: true,
      })),
    ],
    ownedCount: companies.length,
    perPoint,
    pointValue,
    // The employees' shown bonus includes the owner's Management as it is now.
    currentManagementValue: currentManagementValue,
    selfWork: ecoSettings.selfWork,
    trainingsPerDay: trainingsPerDayOf(ecoSettings.trainingsPerDay, Object.values(ecoEmployees).flat()),
    cardValues: cardsByLevel,
  });

  const fightPoints = $derived(FIGHT_SKILLS.reduce((sum, s) => {
    const n = planner.skills[s] ?? 0;
    return sum + (data.market.gameConfigSkills[s]?.levels?.[String(n)]?.totalCost ?? 0);
  }, 0));

  const TABS = [
    { id: 'skills', label: 'Eco skills', icon: mdiSchool },
    { id: 'playground', label: 'Skill playground', icon: mdiTuneVariant },
    { id: 'production', label: 'Production & upgrades', icon: mdiFactory },
    { id: 'employees', label: 'Employees', icon: mdiAccountHardHat },
    { id: 'hiring', label: 'Next employee', icon: mdiAccountPlus },
    { id: 'training', label: 'Training & tools', icon: mdiHammerWrench },
    { id: 'location', label: 'Location', icon: mdiMapMarkerRadius },
    { id: 'events', label: 'Worker events', icon: mdiCardsPlaying },
  ];
</script>

<div class="page" use:folds>
  <section class="card intro">
    <h2>Eco mode</h2>
    <p class="muted">For players who earn from their companies instead of fighting. Built for the v0.27 update (employees). Prices are today's market; the value of 1 production point is <strong>{pointValue.toFixed(4)} G</strong> ({ecoSettings.pointValue > 0 ? 'your number' : estimateNote}).</p>
    {#if !planner.player}<p class="warn">Load your player on the Overview & MinMax page first: the eco tools use your level, skills and companies.</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
  </section>

  {#if planner.player && companies.length}<EcoAlerts {companies} {perPoint} upgrades={data.upgrades} {items} />{/if}

  <div class="tabs" role="tablist" aria-label="Eco tools">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>
        <Icon path={t.icon} size={18} /> {t.label}
      </button>
    {/each}
    {#if planner.player}
      <button type="button" class="refresh" onclick={refresh} disabled={refreshing} title="Load your companies and employees again from the game (after training or hiring someone)">
        <Icon path={mdiRefresh} size={18} /> {refreshing ? 'Refreshing…' : 'Refresh'}
        {#if loadedAt && !refreshing}<small>{loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>{/if}
      </button>
    {/if}
  </div>

  {#if planner.player}
    {#if loading && !companies.length}
      <p class="muted">Loading your companies…</p>
    {:else if tab === 'skills'}
      <EcoSkills {plan} {config} {fightPoints} {estimate} {estimateNote} />
    {:else if tab === 'playground'}
      <EcoPlayground {plan} {config} market={data.market} />
    {:else if tab === 'production'}
      <EcoProduction {companies} {goods} {perPoint} {config} prices={data.market.itemPrices} />
      <EcoSwitch {companies} {perPoint} {items} upgrades={data.upgrades} prices={data.market.itemPrices} managementPercent={2 * currentManagementValue} />
      <EcoManagers {companies} {perPoint} {items} />
    {:else if tab === 'employees'}
      <EcoEmployees {companies} {perPoint} {pointValue} {items} {estimateNote} models={staffing.models} />
    {:else if tab === 'events'}
      <!-- Loaded when opened: it carries the game's event rules. -->
      {#await import('./EcoEvents.svelte')}
        <p class="muted">Loading the events…</p>
      {:then { default: EcoEvents }}
        <EcoEvents {companies} {perPoint} {items} prices={data.market.itemPrices} managementPercent={2 * currentManagementValue} toolboxValue={staffing.toolboxValue} {managementLevel} {selfWorkValue} selfWork={ecoSettings.selfWork} />
      {/await}
    {:else if tab === 'location'}
      <EcoLocation {companies} {perPoint} {items} />
    {:else if tab === 'hiring'}
      <EcoHiring {companies} {perPoint} {items} managementPercent={2 * currentManagementValue} toolboxValue={staffing.toolboxValue} {managementLevel} />
    {:else}
      <EcoTraining {companies} {perPoint} {items} upgrades={data.upgrades} prices={data.market.itemPrices} managementPercent={2 * currentManagementValue} toolboxValue={staffing.toolboxValue} {managementLevel} {selfWorkValue} selfWork={ecoSettings.selfWork} {pointValue} />
    {/if}
  {/if}
</div>

<style>
  .page { display: grid; gap: var(--gap); max-width: 1280px; margin: 0 auto; padding: var(--gap); }
  .intro h2 { text-transform: none; letter-spacing: 0; font-size: 16px; color: var(--text); margin-bottom: 6px; }
  .intro p { margin: 0; }
  .warn { color: var(--accent); margin-top: 8px !important; }
  .error { color: var(--bad); }
  /* Folding boxes: the title shows an arrow; a folded box shows only its title. */
  .page :global(.card.foldable h2) { cursor: pointer; user-select: none; }
  .page :global(.card.foldable h2::after) { content: '▾'; display: inline-block; margin-left: 8px; font-size: 12px; color: var(--muted); transition: transform .15s; }
  .page :global(.card.folded h2::after) { transform: rotate(-90deg); }
  .page :global(.card.foldable h2:hover) { color: var(--accent); }
  .page :global(.card.folded > :not(.fold-head)) { display: none !important; }
  .page :global(.card.folded) { padding-bottom: 12px; }
  .tabs { display: flex; gap: 6px; flex-wrap: wrap; padding: 6px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
  .tabs button {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--surface-2);
    border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--text); cursor: pointer; font: inherit; font-size: 14px; font-weight: 500;
    transition: background .15s, border-color .15s, color .15s;
  }
  .tabs button:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--surface-2)); }
  .tabs .refresh { margin-left: auto; border-style: dashed; }
  .tabs .refresh small { color: var(--muted); font-size: 11px; font-weight: 400; }
  .tabs .refresh:disabled { opacity: .6; cursor: default; }
  .tabs button[aria-selected='true'] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 700; }</style>
