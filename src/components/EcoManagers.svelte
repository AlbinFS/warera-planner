<script>
  /**
   * Managers: what each hired manager adds against their pay, and what hiring a
   * full one (+22%) at the market's pay would do in the companies without one.
   */
  import { ecoEmployees } from '../lib/eco.svelte.js';
  import { employeeDay, managerAdvice, MANAGER_MAX_VALUE } from '../lib/eco.js';
  import { cached } from '../lib/warera.js';
  import { fmt } from '../lib/format.js';
  import { itemImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';

  let { companies, perPoint, items } = $props();

  // The market's pay for a full manager (11 points) an hour, as a rate per point.
  let market = $state.raw(null);
  cached('managerOffer.getWageStats', {}, 30 * 60 * 1000).then((s) => (market = s?.allowedRange ?? null)).catch(() => {});
  const marketRate = $derived(market?.average ? market.average / MANAGER_MAX_VALUE : null);

  const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
  const rows = $derived(companies.filter((c) => !c.disabled).map((c) => {
    const pp = perPoint[c.good] ?? 0;
    const staff = (ecoEmployees[c.id] ?? []).map((e) => ({ points: employeeDay(e, { managementValue: 0, currentManagementValue: 0, goodPerPoint: pp }).points, bonusPercent: e.bonusPercent }));
    return { company: c, advice: managerAdvice(c.manager, staff, pp, marketRate) };
  }).filter((r) => r.advice));
  const totals = $derived(rows.filter((r) => r.advice.has).reduce((t, r) => ({ cost: t.cost + r.advice.cost, gain: t.gain + r.advice.gain }), { cost: 0, gain: 0 }));
</script>

<section class="card" aria-labelledby="managers-title">
  <h2 id="managers-title">Managers</h2>
  <p class="muted small">
    A manager adds 2% per Management point (up to +22%) to every employee's output, and each day gives one employee +5 happiness for 48 hours.
    They're paid every hour, whether the company runs or not; company income here already has their pay taken off.
    {#if marketRate}The market pays about {fmt(marketRate, 4)} G per point an hour ({fmt(market.min / MANAGER_MAX_VALUE, 4)}–{fmt(market.max / MANAGER_MAX_VALUE, 4)}).{/if}
  </p>
  {#if totals.cost > 0}
    <p class="sum">Your managers cost <strong>{fmt(totals.cost, 2)} G</strong> a day and add <strong>{fmt(totals.gain, 2)} G</strong>: <strong class:good={totals.gain >= totals.cost} class:bad={totals.gain < totals.cost}>{signed(totals.gain - totals.cost)} G</strong> a day.</p>
  {/if}
  <div class="scroll">
    <table>
      <thead><tr><th>Company</th><th>Manager</th><th class="num">Adds / day</th><th class="num">Pay / day</th><th class="num">Net / day</th><th>Verdict</th></tr></thead>
      <tbody>
        {#each rows as r (r.company.id)}
          {@const a = r.advice}
          {@const m = r.company.manager}
          <tr>
            <td><img src={itemImage(r.company.good, items)} alt="" width="16" height="16" class="mini" /> {r.company.name} <small class="muted">{itemLabel(r.company.good) || r.company.good}</small></td>
            <td>{#if m}Management {m.level} · +{m.bonusPercent}%{#if m.unpaidHours} <small class="bad">{m.unpaidHours} h unpaid</small>{/if}{:else}<span class="muted">none · a full one: +22%</span>{/if}</td>
            <td class="num">{fmt(a.gain, 2)}</td>
            <td class="num">{fmt(a.cost, 2)}</td>
            <td class="num" class:good={a.net > 0.005} class:bad={a.net < -0.005}>{signed(a.net)}</td>
            <td>
              {#if a.has}{a.net >= 0 ? 'Worth keeping' : 'Costs more than they add'}
              {:else}{a.net > 0 ? 'Hiring one pays' : 'Not worth hiring'}{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="muted small">Adds: the manager's bonus on each employee's output before other bonuses, at what your good sells for, plus the daily care. Companies without employees are left out: a manager has nobody to manage there.</p>
</section>

<style>
  .small { font-size: 12px; }
  .sum { margin: 6px 0 4px; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
  th, td { padding: 5px 6px; border-bottom: 1px solid var(--line); text-align: left; }
  th { font-size: 11px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  .mini { vertical-align: middle; border-radius: 4px; }
</style>
