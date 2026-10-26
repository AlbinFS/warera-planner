<script>
  /**
   * Employees, typed in from the game (the API doesn't expose them yet).
   * Output, wage and profit per employee with the community-documented formulas.
   */
  import { ecoEmployees, ecoSettings, newEmployee } from '../lib/eco.svelte.js';
  import { employeeDay } from '../lib/eco.js';
  import { planner } from '../lib/planner.svelte.js';
  import { fmt } from '../lib/format.js';
  import { itemImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import Icon from './Icon.svelte';
  import { mdiPlus, mdiDelete } from '@mdi/js';

  let { companies, perPoint, pointValue, items } = $props();

  const management = $derived(planner.player?.ecoLevels?.management ?? 0);
  const ctx = (c) => ({
    managementLevel: management, managerPercent: Number(ecoSettings.managerPercent) || 0, corePercent: ecoSettings.core ? 5 : 0,
    pointValue, goodPerPoint: perPoint[c.good] ?? 0,
  });

  function add(c) {
    ecoEmployees[c.id] = [...(ecoEmployees[c.id] ?? []), newEmployee()];
  }
  function remove(c, i) {
    ecoEmployees[c.id] = (ecoEmployees[c.id] ?? []).filter((_, j) => j !== i);
  }

  const totals = $derived(companies.reduce((acc, c) => {
    for (const e of ecoEmployees[c.id] ?? []) {
      const d = employeeDay(e, ctx(c));
      acc.count++; acc.points += d.points; acc.wage += d.wage; acc.profit += d.profit;
    }
    return acc;
  }, { count: 0, points: 0, wage: 0, profit: 0 }));

  const FIELDS = [
    ['production', 'Production (base + trained)', 'Counts for output and for their wage.'],
    ['traitProduction', 'Production from traits', 'Counts for output only: not paid for.'],
    ['expectation', 'Wage expectation %', '70–130; lowered by Negotiation training and Modest.'],
    ['wagePerDay', 'Or: wage per day (G)', 'From the game; overrides the expectation if set.'],
    ['happiness', 'Happiness', '50 is neutral; each point is ±1% output.'],
    ['toolPercent', 'Tool %', 'Common +3% … Mythic +65%.'],
    ['specialization', 'Days on this good', '+1% a day, up to +20%.'],
    ['bonusPercent', 'Other bonus %', 'Traits and events that change the bonus.'],
  ];
</script>

<section class="card wipcard">
  <p><span class="wip">WIP</span> The game's API has no employee data yet, so enter your employees from their cards in the game. Saved in this browser. Formulas from the community guides: output = (production + trait production) ÷ 4 × bonus each hour; wage = production ÷ 4 × point value × expectation (trait production isn't paid).</p>
  <dl class="big">
    <div><dt>Employees</dt><dd class="num">{totals.count}</dd></div>
    <div><dt>Points per day</dt><dd class="num">{fmt(totals.points, 0)}</dd></div>
    <div><dt>Wages per day</dt><dd class="num">{fmt(totals.wage, 2)} G</dd></div>
    <div><dt>Profit per day</dt><dd class="num" class:good={totals.profit >= 0} class:bad={totals.profit < 0}>{fmt(totals.profit, 2)} G</dd></div>
  </dl>
</section>

{#each companies.filter((c) => !c.disabled) as c (c.id)}
  {@const list = ecoEmployees[c.id] ?? []}
  <section class="card" aria-label="Employees of {c.name}">
    <div class="head">
      <h2><img src={itemImage(c.good, items)} alt="" width="22" height="22" /> {c.name} · {itemLabel(c.good) || c.good}</h2>
      <span class="muted small">{list.length} of {c.breakRoom} (break room level {c.breakRoom})</span>
    </div>
    {#each list as e, i (i)}
      {@const d = employeeDay(e, ctx(c))}
      <div class="employee">
        <div class="row">
          <input class="name" bind:value={e.name} placeholder="Name" aria-label="Employee name" />
          <span class="result">
            <strong>{fmt(d.points, 0)}</strong> points · wage <strong>{fmt(d.wage, 2)} G</strong> ·
            profit <strong class:good={d.profit >= 0} class:bad={d.profit < 0}>{fmt(d.profit, 2)} G</strong> a day
            <small class="muted">(bonus {fmt(d.bonus * 100, 1)}%)</small>
          </span>
          <button class="icon" onclick={() => remove(c, i)} aria-label="Remove employee"><Icon path={mdiDelete} size={16} /></button>
        </div>
        <div class="fields">
          {#each FIELDS as [key, text, help] (key)}
            <label title={help}><span>{text}</span><input type="number" step="any" bind:value={e[key]} /></label>
          {/each}
        </div>
        {#if d.profit < 0}<p class="bad small">Costs more than they make: train their wage down, give them a tool, or replace them.</p>{/if}
      </div>
    {/each}
    {#if list.length < c.breakRoom}
      <button class="add" onclick={() => add(c)}><Icon path={mdiPlus} size={16} /> Add employee</button>
    {/if}
  </section>
{/each}

<style>
  .wipcard p { margin: 0 0 10px; }
  .wip { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: var(--accent); color: var(--accent-ink); margin-right: 6px; }
  .big { display: flex; flex-wrap: wrap; gap: 12px 36px; margin: 0; }
  .big dt { color: var(--muted); font-size: 12px; }
  .big dd { margin: 2px 0 0; font-size: 22px; font-weight: 700; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .head h2 { display: flex; align-items: center; gap: 8px; margin: 0; }
  .small { font-size: 12px; }
  .employee { border-top: 1px solid var(--line); padding: 10px 0; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .name { width: 160px; }
  .result { flex: 1; font-size: 14px; }
  .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 8px; }
  label { display: grid; gap: 3px; font-size: 11px; color: var(--muted); }
  input { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 8px; color: var(--text); font-size: 14px; min-width: 0; }
  .icon { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 4px; }
  .add { margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; background: var(--surface-2); color: var(--text); border: 1px dashed var(--line); border-radius: var(--radius-sm); padding: 7px 12px; cursor: pointer; }
</style>
