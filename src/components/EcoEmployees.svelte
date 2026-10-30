<script>
  /**
   * Employees as the game has them (loaded with the companies): what each one
   * makes and costs, their bonus and happiness with every source, traits,
   * potential and training, and what each is worth to their company: their
   * own output plus what they do for their coworkers (hiring.js employeeWorth).
   */
  import { ecoEmployees, employeesStatus, words } from '../lib/eco.svelte.js';
  import { employeeDay } from '../lib/eco.js';
  import { trainedToday } from '../lib/staffing.js';
  import { employeeWorth } from '../lib/hiring.js';
  import { fmt } from '../lib/format.js';
  import { itemImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import Icon from './Icon.svelte';
  import TraitChip from './TraitChip.svelte';
  import EcoMoves from './EcoMoves.svelte';
  import { mdiPickaxe, mdiClover, mdiTie, mdiEmoticonOutline } from '@mdi/js';

  // perPoint and models at the game's values (this tab mirrors its Estimated profit); moveModels at today's prices.
  let { companies, perPoint, items, models = [], moveModels = models } = $props();

  // What each employee is worth to their company (the models are the running companies', in order).
  const running = $derived(companies.filter((c) => !c.disabled));
  const worthOf = (c, i) => {
    const m = models[running.indexOf(c)];
    return m && i < m.team.length ? employeeWorth(m, i) : null;
  };

  // The card's bonus already includes Management, so nothing is swapped here. Points: the game's own
  // estimate where it gives one (what its "Estimated profit" counts), else from Production and bonus.
  const day = (e, c) => {
    const d = employeeDay(e, { managementValue: 0, currentManagementValue: 0, goodPerPoint: perPoint[c.good] ?? 0 });
    if (e.pointsPerDay == null) return d;
    const value = e.pointsPerDay * (perPoint[c.good] ?? 0);
    return { ...d, points: e.pointsPerDay, value, profit: value - d.wage };
  };
  const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
  const worthTip = (w) => `Own output ${signed(w.own)}, for coworkers ${signed(w.others)}${Math.abs(w.toolboxes) > 0.005 ? `, toolboxes ${signed(w.toolboxes)}` : ''}, wage ${signed(-w.wage)} (G a day)`;
  const daysAgo = (iso) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000));
  const date = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const STATS = [['production', mdiPickaxe, 'Production'], ['responsibility', mdiTie, 'Responsibility'], ['luck', mdiClover, 'Luck']];

  // Workforce overview: every employee, sortable.
  const all = $derived(companies.filter((c) => !c.disabled).flatMap((c) => (ecoEmployees[c.id] ?? []).map((e, i) => {
    const d = day(e, c);
    const w = worthOf(c, i);
    // Potential: trainings used of the most they can take; sorted by how many are left.
    const left = e.potentialMax != null ? Math.max(0, e.potentialMax - (e.potential ?? 0)) : -1;
    return { company: c.name, good: c.good, name: e.name || '(no name)', production: e.production ?? 0, potential: left, used: e.potential, max: e.potentialMax, points: d.points, payroll: d.wage, profit: d.profit, breakEven: d.value,
      others: w ? w.others + w.toolboxes : 0, value: w ? w.value : d.profit, worth: w };
  })));
  const COLS = { company: 'Company', name: 'Name', production: 'Production', potential: 'Potential', points: 'Points / day', payroll: 'Payroll / day', breakEven: 'Break-even payroll', profit: 'Profit', others: 'For coworkers', value: 'Value to company' };
  let sortKey = $state('value');
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

  // The game's "Estimated profit": each good's points at its market value per point (a manufactured
  // good's minus the raws it uses), minus the day's payroll (employees and hired managers).
  const estimate = $derived.by(() => {
    const goods = {};
    let wage = 0;
    let count = 0;
    for (const c of companies) {
      for (const e of ecoEmployees[c.id] ?? []) {
        const d = day(e, c);
        const g = (goods[c.good] ??= { good: c.good, points: 0, perPoint: perPoint[c.good] ?? 0 });
        g.points += d.points;
        wage += d.wage;
        count++;
      }
    }
    const list = Object.values(goods).map((g) => ({ ...g, value: g.points * g.perPoint })).sort((a, b) => b.value - a.value);
    const managers = companies.reduce((t, c) => t + (c.manager && !c.manager.inactive ? c.manager.wageDay : 0), 0);
    const output = list.reduce((t, g) => t + g.value, 0);
    return { goods: list, count, points: list.reduce((t, g) => t + g.points, 0), wage, managers, output, profit: output - wage - managers };
  });
</script>

<section class="card">
  <p class="muted intro">Your employees as the game has them, loaded with your companies. Profit is what a day of their production is worth minus a day of their wage.</p>
  {#if employeesStatus.error}<p class="bad">{employeesStatus.error}</p>{/if}
  <dl class="big">
    <div><dt>Employees</dt><dd class="num">{estimate.count}</dd></div>
    <div><dt>Points per day</dt><dd class="num">{fmt(estimate.points, 0)}</dd></div>
    <div><dt>Payroll per day</dt><dd class="num">{fmt(estimate.wage + estimate.managers, 2)} G</dd>{#if estimate.managers > 0}<small class="muted">{fmt(estimate.managers, 2)} G of it hired managers</small>{/if}</div>
    <div><dt>Estimated profit per day</dt><dd class="num" class:good={estimate.profit >= 0} class:bad={estimate.profit < 0}>{signed(estimate.profit)} G</dd><small class="muted">as the game works it out</small></div>
  </dl>
  <table class="est">
    <caption class="muted small">Like the game's "Estimated profit": a day of production at market value, minus the day's payroll. Manufactured goods are valued minus the raws they use.</caption>
    <thead><tr><th>Good</th><th class="num">Points</th><th class="num">G a point</th><th class="num">Worth</th></tr></thead>
    <tbody>
      {#each estimate.goods as g (g.good)}
        <tr><td><img src={itemImage(g.good, items)} alt="" width="18" height="18" class="mini" /> {itemLabel(g.good) || g.good}</td><td class="num">{fmt(g.points, 2)}</td><td class="num">× {fmt(g.perPoint, 4)}</td><td class="num">{fmt(g.value, 2)}</td></tr>
      {/each}
      <tr class="pay"><td>Payroll{#if estimate.managers > 0} <small class="muted">(employees {fmt(estimate.wage, 2)} + managers {fmt(estimate.managers, 2)})</small>{/if}</td><td></td><td></td><td class="num bad">−{fmt(estimate.wage + estimate.managers, 2)}</td></tr>
      <tr class="sum"><td><strong>Profit</strong></td><td></td><td></td><td class="num"><strong class:good={estimate.profit >= 0} class:bad={estimate.profit < 0}>{signed(estimate.profit)}</strong></td></tr>
    </tbody>
  </table>
  <p class="muted small why">The values per point here are the game's own, so this matches its Estimated profit. They lag when a price moves fast; the advice on the other tabs and in "Worth moving?" uses today's prices.</p>
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
              <td class="num" title="Trainings used of the most they can take; trainings left below">{#if r.max != null}{r.used ?? 0} / {r.max}<br /><small class:good={r.potential > 0} class:muted={r.potential === 0}>{r.potential ? `${r.potential} left` : 'done'}</small>{:else}<span class="muted">?</span>{/if}</td>
              <td class="num">{fmt(r.points, 1)}</td>
              <td class="num">{fmt(r.payroll, 2)}</td>
              <td class="num" title="Payroll at which this employee would make exactly nothing">{fmt(r.breakEven, 2)}</td>
              <td class="num" title="At {itemLabel(r.good) || r.good}'s market value per point, minus payroll"><strong class:good={r.profit >= 0} class:bad={r.profit < 0}>{signed(r.profit)}</strong></td>
              <td class="num" title={r.worth ? worthTip(r.worth) : ''}><span class:good={r.others > 0.005} class:bad={r.others < -0.005} class:muted={Math.abs(r.others) <= 0.005}>{signed(r.others)}</span></td>
              <td class="num" title={r.worth ? worthTip(r.worth) : ''}><strong class:good={r.value >= 0} class:bad={r.value < 0}>{signed(r.value)}</strong></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="muted small">Break-even payroll: the most an employee could be paid per day before they cost more than they make (at their good's market value per point). Far below it is a keeper; above it, train their wage down or replace them.</p>
    <p class="muted small"><strong>Value to company</strong>: what the company makes a day with them against without them, minus their wage, at the game's value of its good. It counts what they do for their coworkers (<strong>For coworkers</strong>: a Comic's +10 happiness for everyone, a Xenophobe's drag on foreigners, Girl Power, Luck traits' toolboxes, …), so someone who makes little themselves can be worth the most. Not counted: training help (a Trainer's extra training) and anything that takes weeks.</p>
  </section>
{/if}

{#if running.length > 1}<EcoMoves {companies} models={moveModels} {items} />{/if}

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
          {@const w = worthOf(c, list.indexOf(e))}
          <article class="emp" class:losing={d.profit < 0}>
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
              <div><dt title="Points × {itemLabel(c.good) || c.good}'s market value per point ({fmt(perPoint[c.good] ?? 0, 4)} G) − payroll, as the game works it out">Profit</dt><dd class="num" class:good={d.profit >= 0} class:bad={d.profit < 0}>{signed(d.profit)}</dd></div>
            </dl>
            {#if w}
              <details class="worth">
                <summary title="The company with them against without them, minus their wage: their own output and what they do for their coworkers">Value to company <strong class="num" class:good={w.value >= 0} class:bad={w.value < 0}>{signed(w.value)}</strong></summary>
                <ul class="parts">
                  <li><span>Own output</span><span class="num">{signed(w.own)}</span></li>
                  {#each w.coworkers.filter((x) => Math.abs(x.change) > 0.005) as x, i (i)}<li><span>{x.change > 0 ? 'Lifts' : 'Drags'} {x.name || '(no name)'}</span><span class="num" class:good={x.change > 0} class:bad={x.change < 0}>{signed(x.change)}</span></li>{/each}
                  {#if Math.abs(w.toolboxes) > 0.005}<li><span>Toolboxes (Luck)</span><span class="num">{signed(w.toolboxes)}</span></li>{/if}
                  <li><span>Wage</span><span class="num">{signed(-w.wage)}</span></li>
                </ul>
              </details>
            {/if}
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
            {#if e.traits?.length}<div class="traits">{#each e.traits as t, i (i)}<TraitChip code={t} hidden={!t} />{/each}</div>{/if}
            <p class="facts muted small">
              {[
                e.potential != null && `Potential ${e.potential} of ${e.potentialMax}`,
                `Trained today ${trainedToday(e)} of ${e.trainingsPerDay ?? 0}`,
                ...Object.entries(e.specializations ?? {}).map(([good, days]) => `${itemLabel(good) || words(good)} specialist, ${days} d`),
                e.retireAt && `may retire ${date(e.retireAt)}`,
              ].filter(Boolean).join(' · ')}
            </p>
          </article>
        {/each}
      </div>
      {#if list.some((e) => day(e, c).profit < 0)}<p class="bad small">Red: costs more than they make. Train their wage down (Negotiation), give them a tool, raise their happiness, or replace them.</p>{/if}
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
  .why { margin: 6px 0 0; max-width: 760px; line-height: 1.45; }
  .est { max-width: 520px; margin-top: 12px; }
  .est caption { text-align: left; caption-side: top; padding-bottom: 6px; }
  .est tr.pay td { border-top: 2px solid var(--line); }
  .est tr.sum td { border-bottom: 0; }
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
  .facts { margin: 0; }
  details.worth summary { font-weight: 600; }
  .parts .good { color: var(--good); }
  .parts .bad { color: var(--bad); }
</style>
