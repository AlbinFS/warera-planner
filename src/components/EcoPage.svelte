<script>
  /**
   * Eco mode (game update v0.27): the eco skill optimizer, what to produce and
   * which upgrades pay back, and employees (from the game).
   */
  import { planner } from '../lib/planner.svelte.js';
  import { ecoSettings, ecoEmployees, loadCompanies } from '../lib/eco.svelte.js';
  import { GAME_POINT_VALUE, GAME_POINT_VALUE_NOTE, goodsProfit, ecoValue } from '../lib/eco.js';
  import { FIGHT_SKILLS } from '../engine/inputs.js';
  import EcoSkills from './EcoSkills.svelte';
  import EcoProduction from './EcoProduction.svelte';
  import EcoEmployees from './EcoEmployees.svelte';
  import EcoPlayground from './EcoPlayground.svelte';
  import EcoHiring from './EcoHiring.svelte';
  import EcoTraining from './EcoTraining.svelte';
  import EcoAlerts from './EcoAlerts.svelte';
  import Icon from './Icon.svelte';
  import { mdiSchool, mdiFactory, mdiAccountHardHat, mdiTuneVariant, mdiAccountPlus, mdiHammerWrench } from '@mdi/js';

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

  // The point value: the game's own number unless a newer one is typed in.
  const estimate = GAME_POINT_VALUE;
  const estimateNote = GAME_POINT_VALUE_NOTE;
  const pointValue = $derived(ecoSettings.pointValue > 0 ? ecoSettings.pointValue : estimate);
  const goods = $derived(goodsProfit(items, data.market.itemPrices));
  const currentManagementValue = $derived(ecoValue(data.market.gameConfigSkills, 'management', planner.player?.ecoLevels?.management ?? 0));
  const perPoint = $derived(Object.fromEntries(goods.map((g) => [g.code, g.perPoint])));

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
    trainingsPerDay: Number(ecoSettings.trainingsPerDay) || 0,
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
  ];
</script>

<div class="page">
  <section class="card intro">
    <h2>Eco mode</h2>
    <p class="muted">For players who earn from their companies instead of fighting. Built for the v0.27 update (employees). Prices are today's market; the value of 1 production point is <strong>{pointValue.toFixed(4)} G</strong> ({ecoSettings.pointValue > 0 ? 'your number' : estimateNote}).</p>
    {#if !planner.player}<p class="warn">Load your player on the planner first: the eco tools use your level, skills and companies.</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
  </section>

  {#if planner.player && companies.length}<EcoAlerts {companies} {perPoint} upgrades={data.upgrades} {items} />{/if}

  <div class="tabs" role="tablist" aria-label="Eco tools">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>
        <Icon path={t.icon} size={18} /> {t.label}
      </button>
    {/each}
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
    {:else if tab === 'employees'}
      <EcoEmployees {companies} {perPoint} {pointValue} {items} {estimateNote} />
    {:else if tab === 'hiring'}
      <EcoHiring {companies} {perPoint} {items} managementPercent={2 * currentManagementValue} />
    {:else}
      <EcoTraining {companies} {perPoint} {items} managementPercent={2 * currentManagementValue} />
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
  .tabs button[aria-selected='true'] { color: var(--text); border-bottom-color: var(--accent); }</style>
