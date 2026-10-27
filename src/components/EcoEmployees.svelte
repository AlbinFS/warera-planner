<script>
  /**
   * Employees as the game has them (loaded with the companies): what each one
   * makes and costs, their bonus and happiness with every source, traits,
   * potential and training.
   */
  import { ecoEmployees, ecoSettings, employeesStatus, words } from '../lib/eco.svelte.js';
  import { employeeDay } from '../lib/eco.js';
  import { fmt } from '../lib/format.js';
  import { itemImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import Icon from './Icon.svelte';
  import { mdiPickaxe, mdiClover, mdiTie, mdiEmoticonOutline } from '@mdi/js';

  let { companies, perPoint, pointValue, items, estimateNote = "from today's prices" } = $props();

  // The card's bonus already includes Management, so nothing is swapped here.
  const day = (e, c) => employeeDay(e, { managementValue: 0, currentManagementValue: 0, goodPerPoint: perPoint[c.good] ?? 0 });
  // The game's own estimate values output at the market value of a point.
  const gameEstimate = (d) => d.points * pointValue - d.wage;
  const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
  const daysAgo = (iso) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000));
  const date = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const STATS = [['production', mdiPickaxe, 'Production'], ['responsibility', mdiTie, 'Responsibility'], ['luck', mdiClover, 'Luck']];

  // Workforce overview: every employee, sortable.
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

<section class="card">
  <p class="muted intro">Your employees as the game has them, loaded with your companies. Profit is what a day of their production is worth minus a day of their wage.</p>
  {#if employeesStatus.error}<p class="bad">{employeesStatus.error}</p>{/if}
  <label class="pv">
    <span>Value of 1 production point: the number after × in any employee's "Estimated profit" tooltip in the game (e.g. 0.1012)</span>
    <input type="number" step="0.0001" min="0" bind:value={ecoSettings.pointValue} placeholder={pointValue.toFixed(4)} />
    {#if !(ecoSettings.pointValue > 0)}<small class="muted">Using an estimate {estimateNote} ({fmt(pointValue, 4)}); "Profit (game)" matches the game once you type in its value.</small>{/if}
  </label>
  <dl class="big">
    <div><dt>Employees</dt><dd class="num">{totals.count}</dd></div>
    <div><dt>Points per day</dt><dd class="num">{fmt(totals.points, 0)}</dd></div>
    <div><dt>Payroll per day</dt><dd class="num">{fmt(totals.wage, 2)} G</dd></div>
    <div><dt>Profit per day</dt><dd class="num" class:good={totals.profit >= 0} class:bad={totals.profit < 0}>{fmt(totals.profit, 2)} G</dd><small class="muted">at what your goods sell for</small></div>
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
              <td class="num"><strong class:good={r.profit >= 0} class:bad={r.profit < 0}>{signed(r.profit)}</strong></td>
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
      <div class="emps">
        {#each list as e (e.id ?? e.name)}
          {@const d = day(e, c)}
          {@const g = gameEstimate(d)}
          <article class="emp" class:losing={g < 0}>
            <header>
              <strong>{e.name || '(no name)'}</strong>
              <span class="muted small">{[e.age && `${e.age} y`, e.hiredAt && `hired ${daysAgo(e.hiredAt) ? `${daysAgo(e.hiredAt)} d ago` : 'today'}`].filter(Boolean).join(' · ')}</span>
            </header>
            {#if e.stats}
              <div class="stats">
                {#each STATS as [k, icon, label] (k)}
                  {@const v = e.stats[k]}
                  <span title={label}><Icon path={icon} size={15} /> {v.revealed ? v.total : '?'}{#if v.trained}<small class="muted">(+{v.trained} trained)</small>{/if}</span>
                {/each}
              </div>
            {/if}
            <dl class="money">
              <div><dt>Points / day</dt><dd class="num">{fmt(d.points, 1)}</dd></div>
              <div><dt>Payroll / day</dt><dd class="num">{fmt(d.wage, 2)}</dd></div>
              <div><dt title="Points × the value of 1 production point − payroll, as the game shows it">Profit (game)</dt><dd class="num" class:good={g >= 0} class:bad={g < 0}>{signed(g)}</dd></div>
              <div><dt title="Points × what {itemLabel(c.good) || c.good} sells for per point − payroll">At {itemLabel(c.good) || c.good}'s price</dt><dd class="num" class:good={d.profit >= 0} class:bad={d.profit < 0}>{signed(d.profit)}</dd></div>
            </dl>
            <details>
              <summary><Icon path={mdiPickaxe} size={13} /> Production bonus <strong class="num">+{fmt(e.bonusPercent, 1)}%</strong></summary>
              <ul class="parts">{#each e.bonus ?? [] as b (b.source)}<li><span>{words(b.source)}</span><span class="num">{signed(b.percent, 1)}%</span></li>{/each}</ul>
            </details>
            {#if e.happiness?.value != null}
              <details>
                <summary><Icon path={mdiEmoticonOutline} size={13} /> Happiness <strong class="num">{fmt(e.happiness.value, 0)}</strong></summary>
                <ul class="parts">
                  <li><span>Base</span><span class="num">50</span></li>
                  {#each e.happiness.reasons as r, i (i)}<li><span>{words(r.reason)}</span><span class="num">{signed(r.delta, 1)}</span></li>{/each}
                  {#if e.happiness.quitChance > 0}<li class="bad"><span>Chance to quit</span><span class="num">{fmt(e.happiness.quitChance * 100, 1)}%</span></li>{/if}
                </ul>
              </details>
            {/if}
            {#if e.traits?.length}<div class="traits">{#each e.traits as t, i (i)}<span class="chip">{t ? words(t) : 'Hidden trait'}</span>{/each}</div>{/if}
            <p class="facts muted small">
              {[
                e.potential != null && `Potential ${e.potential} of ${e.potentialMax}`,
                `Trained today ${e.trainingsToday ?? 0} of ${e.trainingsPerDay ?? 0}`,
                ...Object.entries(e.specializations ?? {}).map(([good, days]) => `${itemLabel(good) || words(good)} specialist, ${days} d`),
                e.retireAt && `may retire ${date(e.retireAt)}`,
              ].filter(Boolean).join(' · ')}
            </p>
          </article>
        {/each}
      </div>
      {#if list.some((e) => gameEstimate(day(e, c)) < 0)}<p class="bad small">Red: costs more than they make. Train their wage down (Negotiation), give them a tool, raise their happiness, or replace them.</p>{/if}
    {:else}
      <p class="muted small">No employees.</p>
    {/if}
  </section>
{/each}

<style>
  .intro { margin: 0 0 8px; }
  .pv { display: grid; gap: 4px; font-size: 13px; color: var(--muted); margin: 0 0 10px; max-width: 640px; }
  .pv input { width: 140px; }
  .big { display: flex; flex-wrap: wrap; gap: 12px 36px; margin: 0; }
  .big dt { color: var(--muted); font-size: 12px; }
  .big dd { margin: 2px 0 0; font-size: 22px; font-weight: 700; }
  .big small { font-size: 11px; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .head h2 { display: flex; align-items: center; gap: 8px; margin: 0; }
  .small { font-size: 12px; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 6px; border-bottom: 1px solid var(--line); text-align: left; }
  th { font-size: 11px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  .num { text-align: right; white-space: nowrap; }
  input { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 7px; color: var(--text); font-size: 14px; width: 80px; }
  .sort { background: none; border: 0; padding: 0; color: inherit; font: inherit; cursor: pointer; white-space: nowrap; }
  .sort.active { color: var(--text); }
  .mini { vertical-align: middle; border-radius: 4px; }
  .emps { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  .emp { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; display: grid; gap: 8px; align-content: start; background: var(--surface-2); }
  .emp.losing { border-color: color-mix(in srgb, var(--bad) 55%, var(--line)); }
  .emp header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .stats { display: flex; gap: 14px; flex-wrap: wrap; font-size: 14px; }
  .stats span { display: inline-flex; align-items: center; gap: 4px; }
  .money { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin: 0; }
  .money dt { font-size: 11px; color: var(--muted); }
  .money dd { margin: 0; font-weight: 600; text-align: left; }
  details summary { cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; }
  details summary strong { margin-left: auto; }
  .parts { list-style: none; margin: 6px 0 0; padding: 0 0 0 19px; display: grid; gap: 2px; font-size: 12px; color: var(--muted); }
  .parts li { display: flex; justify-content: space-between; gap: 8px; }
  .parts li.bad { color: var(--bad); }
  .traits { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
  .facts { margin: 0; }
</style>
