<script>
  /**
   * Eco mode (game update v0.27): the eco skill optimizer, what to produce and
   * which upgrades pay back, and employees (typed in; the API has none).
   */
  import { planner } from '../lib/planner.svelte.js';
  import { ecoSettings, ecoEmployees, loadCompanies } from '../lib/eco.svelte.js';
  import { estimatePointValue, goodsProfit } from '../lib/eco.js';
  import { FIGHT_SKILLS } from '../engine/inputs.js';
  import EcoSkills from './EcoSkills.svelte';
  import EcoProduction from './EcoProduction.svelte';
  import EcoEmployees from './EcoEmployees.svelte';
  import Icon from './Icon.svelte';
  import { mdiSchool, mdiFactory, mdiAccountHardHat } from '@mdi/js';

  let { data } = $props();
  const items = $derived(data.market.gameConfigItems);
  const config = $derived({ skills: data.market.gameConfigSkills, upgrades: data.upgrades, items });

  let tab = $state('skills');
  let companies = $state.raw([]);
  let error = $state('');
  let loading = $state(false);

  $effect(() => {
    const id = planner.player?.id;
    if (!id) return;
    loading = true;
    loadCompanies(id).then((c) => { companies = c; error = ''; }).catch((err) => (error = err.message)).finally(() => (loading = false));
  });

  const estimate = $derived(estimatePointValue(items, data.market.itemPrices));
  const pointValue = $derived(ecoSettings.pointValue > 0 ? ecoSettings.pointValue : estimate);
  const goods = $derived(goodsProfit(items, data.market.itemPrices));
  const perPoint = $derived(Object.fromEntries(goods.map((g) => [g.code, g.perPoint])));

  /** Everything the model needs, from the companies, employees and settings. */
  const plan = $derived({
    companies: companies.map((c) => ({ ...c, employees: ecoEmployees[c.id] ?? [] })),
    perPoint,
    pointValue,
    selfWork: ecoSettings.selfWork,
    trainingsPerDay: Number(ecoSettings.trainingsPerDay) || 0,
    managerPercent: Number(ecoSettings.managerPercent) || 0,
    corePercent: ecoSettings.core ? 5 : 0,
  });

  const fightPoints = $derived(FIGHT_SKILLS.reduce((sum, s) => {
    const n = planner.skills[s] ?? 0;
    return sum + (data.market.gameConfigSkills[s]?.levels?.[String(n)]?.totalCost ?? 0);
  }, 0));

  const TABS = [
    { id: 'skills', label: 'Eco skills', icon: mdiSchool },
    { id: 'production', label: 'Production & upgrades', icon: mdiFactory },
    { id: 'employees', label: 'Employees', icon: mdiAccountHardHat, wip: true },
  ];
</script>

<div class="page">
  <section class="card intro">
    <h2>Eco mode</h2>
    <p class="muted">For players who earn from their companies instead of fighting. Built for the v0.27 update (employees). Prices are today's market; the value of 1 production point is estimated from raw materials at <strong>{pointValue.toFixed(4)} G</strong>{ecoSettings.pointValue > 0 ? ' (your number)' : ''}.</p>
    {#if !planner.player}<p class="warn">Load your player on the planner first: the eco tools use your level, skills and companies.</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
  </section>

  <div class="tabs" role="tablist" aria-label="Eco tools">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>
        <Icon path={t.icon} size={18} /> {t.label}{#if t.wip}<span class="wip">WIP</span>{/if}
      </button>
    {/each}
  </div>

  {#if planner.player}
    {#if loading && !companies.length}
      <p class="muted">Loading your companies…</p>
    {:else if tab === 'skills'}
      <EcoSkills {plan} {config} {fightPoints} estimate={estimate} />
    {:else if tab === 'production'}
      <EcoProduction {companies} {goods} {perPoint} {config} prices={data.market.itemPrices} {pointValue} />
    {:else}
      <EcoEmployees {companies} {perPoint} {pointValue} {items} />
    {/if}
  {/if}
</div>

<style>
  .page { display: grid; gap: var(--gap); max-width: 1280px; margin: 0 auto; padding: var(--gap); }
  .intro h2 { text-transform: none; letter-spacing: 0; font-size: 16px; color: var(--text); margin-bottom: 6px; }
  .intro p { margin: 0; }
  .warn { color: var(--accent); margin-top: 8px !important; }
  .error { color: var(--bad); }
  .tabs { display: flex; gap: 6px; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
  .tabs button {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: none; border: 0;
    color: var(--muted); cursor: pointer; font: inherit; border-bottom: 2px solid transparent; margin-bottom: -1px;
  }
  .tabs button[aria-selected='true'] { color: var(--text); border-bottom-color: var(--accent); }
  .wip { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: var(--accent); color: var(--accent-ink); }
</style>
