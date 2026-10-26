<script>
  /**
   * Employees, typed in from the game (the API doesn't expose them yet):
   * the three numbers the game shows for each one.
   */
  import { ecoEmployees, ecoSettings, newEmployee } from '../lib/eco.svelte.js';
  import { employeeDay } from '../lib/eco.js';
  import { fmt } from '../lib/format.js';
  import { itemImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import Icon from './Icon.svelte';
  import { mdiPlus, mdiDelete, mdiPickaxe } from '@mdi/js';

  let { companies, perPoint, pointValue, items, estimateNote = "from today's prices" } = $props();

  // The card's bonus already includes Management, so nothing is swapped here.
  const day = (e, c) => employeeDay(e, { managementValue: 0, currentManagementValue: 0, goodPerPoint: perPoint[c.good] ?? 0 });
  // The game's own estimate values output at the market value of a point.
  const gameEstimate = (d) => d.points * pointValue - d.wage;

  function add(c) {
    ecoEmployees[c.id] = [...(ecoEmployees[c.id] ?? []), newEmployee()];
  }
  function remove(c, i) {
    ecoEmployees[c.id] = (ecoEmployees[c.id] ?? []).filter((_, j) => j !== i);
  }

  // Workforce overview: every entered employee, sortable.
  const all = $derived(companies.filter((c) => !c.disabled).flatMap((c) => (ecoEmployees[c.id] ?? []).map((e) => {
    const d = day(e, c);
    return { company: c.name, good: c.good, name: e.name || '(no name)', production: e.production ?? 0, points: d.points, payroll: d.wage, profit: gameEstimate(d), breakEven: d.points * pointValue };
  })));
  const COLS = { company: 'Company', name: 'Name', production: 'Production', points: 'Points / day', payroll: 'Payroll / day', breakEven: 'Break-even payroll', profit: 'Profit (game)' };
  let sortKey = $state('profit');
  let sortDesc = $state(true);
  function sortBy(k) {
    if (sortKey === k) sortDesc = !sortDesc;
    else { sortKey = k; sortDesc = k !== 'company' && k !== 'name'; }
  }
  const sortedAll = $derived([...all].sort((a, b) => {
    const [x, y] = [a[sortKey], b[sortKey]];
    const o = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return sortDesc ? -o : o;
  }));

  const totals = $derived(companies.reduce((acc, c) => {
    for (const e of ecoEmployees[c.id] ?? []) {
      const d = day(e, c);
      acc.count++; acc.points += d.points; acc.wage += d.wage; acc.profit += d.profit;
    }
    return acc;
  }, { count: 0, points: 0, wage: 0, profit: 0 }));
</script>

<section class="card wipcard">
  <p><span class="wip">WIP</span> The game's API has no employee data yet, so copy three numbers per employee from the game:</p>
  <ol>
    <li><strong>Production</strong>: the <Icon path={mdiPickaxe} size={13} /> number on their card (e.g. 5).</li>
    <li><strong>Bonus %</strong>: the <Icon path={mdiPickaxe} size={13} /> +x% on their card; hover it for the exact total (e.g. 21.9).</li>
    <li><strong>Payroll per day</strong>: hover their profit (e.g. +2.13) and copy "Payroll" (e.g. 1.56).</li>
  </ol>
  <label class="pv">
    <span>Value of 1 production point: copy it from any employee's "Estimated profit" tooltip (the number after ×, e.g. 0.1012)</span>
    <input type="number" step="0.0001" min="0" bind:value={ecoSettings.pointValue} placeholder={pointValue.toFixed(4)} />
    {#if !(ecoSettings.pointValue > 0)}<small class="muted">Using an estimate {estimateNote} ({fmt(pointValue, 4)}); the game's own profit numbers match once you type in its value.</small>{/if}
  </label>
  <p class="muted small">Saved in this browser. "Profit (game)" is the game's own estimate. The column next to it values the output at what the company's good actually sells for per point: what you really earn when you sell it.</p>
  <dl class="big">
    <div><dt>Employees</dt><dd class="num">{totals.count}</dd></div>
    <div><dt>Points per day</dt><dd class="num">{fmt(totals.points, 0)}</dd></div>
    <div><dt>Payroll per day</dt><dd class="num">{fmt(totals.wage, 2)} G</dd></div>
    <div><dt>Profit per day</dt><dd class="num" class:good={totals.profit >= 0} class:bad={totals.profit < 0}>{fmt(totals.profit, 2)} G</dd></div>
  </dl>
</section>

{#if all.length > 1}
  <section class="card" aria-labelledby="workforce-title">
    <h2 id="workforce-title">Workforce</h2>
    <div class="scroll">
      <table>
        <thead><tr>
          {#each Object.entries(COLS) as [k, label] (k)}
            <th class:num={!['company', 'name'].includes(k)} aria-sort={sortKey === k ? (sortDesc ? 'descending' : 'ascending') : 'none'}>
              <button class="sort" class:active={sortKey === k} onclick={() => sortBy(k)}>{label} <span aria-hidden="true">{sortKey === k ? (sortDesc ? '▼' : '▲') : '↕'}</span></button>
            </th>
          {/each}
        </tr></thead>
        <tbody>
          {#each sortedAll as r, i (i)}
            <tr>
              <td><img src={itemImage(r.good, items)} alt="" width="18" height="18" class="mini" /> {r.company}</td>
              <td>{r.name}</td>
              <td class="num">{r.production}</td>
              <td class="num">{fmt(r.points, 1)}</td>
              <td class="num">{fmt(r.payroll, 2)}</td>
              <td class="num" title="Payroll at which this employee would make exactly nothing">{fmt(r.breakEven, 2)}</td>
              <td class="num"><strong class:good={r.profit >= 0} class:bad={r.profit < 0}>{r.profit >= 0 ? '+' : ''}{fmt(r.profit, 2)}</strong></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="muted small">Break-even payroll: the most an employee could be paid per day before they cost more than they make (at the game's point value). Far below it is a keeper; above it, train their wage down or replace them.</p>
  </section>
{/if}

{#each companies.filter((c) => !c.disabled) as c (c.id)}
  {@const list = ecoEmployees[c.id] ?? []}
  <section class="card" aria-label="Employees of {c.name}">
    <div class="head">
      <h2><img src={itemImage(c.good, items)} alt="" width="22" height="22" /> {c.name} · {itemLabel(c.good) || c.good}</h2>
      <span class="muted small">{list.length} of {c.breakRoom} (break room level {c.breakRoom}) · {fmt(perPoint[c.good] ?? 0, 4)} G per point</span>
    </div>
    {#if list.length}
      <div class="scroll">
        <table>
          <thead><tr><th>Name</th><th>Production</th><th>Bonus %</th><th>Payroll / day</th><th class="num">Points / day</th><th class="num" title="Points × value of 1 production point − payroll, as the game shows it">Profit (game)</th><th class="num" title="Points × what {itemLabel(c.good) || c.good} sells for per point − payroll">At {itemLabel(c.good) || c.good}'s price</th><th></th></tr></thead>
          <tbody>
            {#each list as e, i (i)}
              {@const d = day(e, c)}
              <tr>
                <td><input class="name" bind:value={e.name} placeholder="Name" aria-label="Name" /></td>
                <td><input type="number" step="any" min="0" bind:value={e.production} aria-label="Production" /></td>
                <td><input type="number" step="any" bind:value={e.bonusPercent} aria-label="Bonus percent" /></td>
                <td><input type="number" step="any" min="0" bind:value={e.payroll} aria-label="Payroll per day" /></td>
                <td class="num">{fmt(d.points, 1)}</td>
                <td class="num"><strong class:good={gameEstimate(d) >= 0} class:bad={gameEstimate(d) < 0}>{gameEstimate(d) >= 0 ? '+' : ''}{fmt(gameEstimate(d), 2)}</strong></td>
                <td class="num" class:good={d.profit >= 0} class:bad={d.profit < 0}>{d.profit >= 0 ? '+' : ''}{fmt(d.profit, 2)}</td>
                <td><button class="icon" onclick={() => remove(c, i)} aria-label="Remove employee"><Icon path={mdiDelete} size={16} /></button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if list.some((e) => gameEstimate(day(e, c)) < 0)}<p class="bad small">Red: costs more than they make. Train their wage down (Negotiation), give them a tool, raise their happiness, or replace them.</p>{/if}
    {/if}
    {#if list.length < c.breakRoom}
      <button class="add" onclick={() => add(c)}><Icon path={mdiPlus} size={16} /> Add employee</button>
    {/if}
  </section>
{/each}

<style>
  .wipcard p { margin: 0 0 8px; }
  .pv { display: grid; gap: 4px; font-size: 13px; color: var(--muted); margin: 0 0 10px; max-width: 640px; }
  .pv input { width: 140px; }
  .wipcard ol { margin: 0 0 8px; padding-left: 20px; display: grid; gap: 3px; }
  .wip { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; background: var(--accent); color: var(--accent-ink); margin-right: 6px; }
  .big { display: flex; flex-wrap: wrap; gap: 12px 36px; margin: 0; }
  .big dt { color: var(--muted); font-size: 12px; }
  .big dd { margin: 2px 0 0; font-size: 22px; font-weight: 700; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
  .head h2 { display: flex; align-items: center; gap: 8px; margin: 0; }
  .small { font-size: 12px; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 6px; border-bottom: 1px solid var(--line); text-align: left; }
  th { font-size: 11px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  .num { text-align: right; white-space: nowrap; }
  input { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 7px; color: var(--text); font-size: 14px; width: 80px; }
  input.name { width: 150px; }
  .sort { background: none; border: 0; padding: 0; color: inherit; font: inherit; cursor: pointer; white-space: nowrap; }
  .sort.active { color: var(--text); }
  .mini { vertical-align: middle; border-radius: 4px; }
  .icon { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 4px; }
  .add { margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; background: var(--surface-2); color: var(--text); border: 1px dashed var(--line); border-radius: var(--radius-sm); padding: 7px 12px; cursor: pointer; }
</style>
