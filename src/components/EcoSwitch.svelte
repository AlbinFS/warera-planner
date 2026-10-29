<script>
  /**
   * Each company's most profitable good: what it would make a day switched to
   * every other good, against what it makes now (its own team and engine),
   * the switch's 5 concrete taken off, and when that pays back.
   */
  import { ecoEmployees } from '../lib/eco.svelte.js';
  import { engineDaily } from '../lib/eco.js';
  import { companyModel, placeOf, fairWageOf } from '../lib/hiring.js';
  import { switchValue, SWITCH_CONCRETE, SWITCH_DAYS } from '../lib/switching.js';
  import { cached } from '../lib/warera.js';
  import { fmt } from '../lib/format.js';
  import { itemImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';

  let { companies, perPoint, items, upgrades = {}, prices = {}, managementPercent = 0 } = $props();

  let countries = $state.raw({});
  let regions = $state.raw({});
  cached('country.getAllCountries', {}, 60 * 60 * 1000).then((list) => (countries = Object.fromEntries((list ?? []).map((c) => [c._id, c])))).catch(() => {});
  cached('region.getRegionsObject', {}, 60 * 60 * 1000).then((r) => (regions = r ?? {})).catch(() => {});

  const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
  const switchCost = $derived(SWITCH_CONCRETE * (prices.concrete ?? 0));
  const fairWage = $derived(fairWageOf(Object.values(ecoEmployees).flat()));
  // Goods with a price (and their inputs'): any of them, anywhere (since v0.27 a region doesn't change output).
  const goods = $derived(Object.keys(perPoint).filter((g) => Number.isFinite(perPoint[g])));

  const rows = $derived(companies.filter((c) => !c.disabled).map((c) => {
    const team = ecoEmployees[c.id] ?? [];
    const model = companyModel(team, placeOf(c, { regions, countries, items }), { perPoint: perPoint[c.good] ?? 0, fairWage, management: managementPercent });
    const enginePoints = engineDaily(upgrades, c.engine);
    const best = goods.filter((g) => g !== c.good)
      .map((good) => switchValue(model, { employees: team, good, perPoint, enginePoints, cost: switchCost }))
      .reduce((a, b) => (!a || b.total > a.total ? b : a), null);
    return { company: c, best, now: best?.now ?? 0, staffed: team.length > 0 };
  }).sort((a, b) => (b.best?.total ?? 0) - (a.best?.total ?? 0)));
</script>

<section class="card">
  <h2>Best good for each company</h2>
  <p class="muted small">
    What each company would make switched to its most profitable other good, against what it makes now: its own employees and engine,
    inputs at market prices. A switch costs {SWITCH_CONCRETE} concrete (about {fmt(switchCost, 1)} G); employees stay, but their specialization
    starts over in the new good (+1 % a day up to 20 %, the old good's kept) and tools for the old good stop working (tools in your inventory:
    see Training & tools). Worked out day by day: day 1 at the specialization each employee already has in the new good
    (usually 0 %), day 2 a percent more, and so on, so the payback day is when the running total covers the switch. Since v0.27 any good can be made anywhere: the game counts no region, climate or deposit in output.
  </p>
  <div class="scroll">
    <table>
      <thead><tr><th>Company</th><th>Best switch</th><th class="num" title="The first day: specialization in the new good starts at what each employee already has there (usually 0 %)">Day 1</th><th class="num" title="Once specialization has caught up (a percent a day, up to 20 %)">From day 21 on</th><th class="num" title="The day the running total, worked out day by day, has covered the switch's cost">Pays back</th></tr></thead>
      <tbody>
        {#each rows as r (r.company.id)}
          <tr class:keep={!r.best || r.best.total <= 0.005}>
            <td>
              <img src={itemImage(r.company.good, items)} alt="" width="18" height="18" class="mini" /> <strong>{r.company.name}</strong> <span class="muted">{itemLabel(r.company.good) || r.company.good}</span>
              {#if !r.staffed && r.best && r.best.total > 0.005}<br /><small class="muted">No employees: only its engine switches, so day 1 and day 21 are the same (no specialization to build up).</small>{/if}
            </td>
            {#if r.best && r.best.total > 0.005}
              <td><img src={itemImage(r.best.good, items)} alt="" width="18" height="18" class="mini" /> {itemLabel(r.best.good) || r.best.good}</td>
              <td class="num" class:good={r.best.first > 0.005} class:bad={r.best.first < -0.005}>{signed(r.best.first)} G/day</td>
              <td class="num" class:good={r.best.full > 0.005} class:bad={r.best.full < -0.005}>{signed(r.best.full)} G/day</td>
              <td class="num">{r.best.payback ? `day ${r.best.payback}` : `not within ${SWITCH_DAYS} days`}</td>
            {:else}
              <td colspan="4" class="muted">Keep it: no switch pays back within {SWITCH_DAYS} days.</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="muted small">At today's prices: switching several companies to one good and selling much more of it can push its price down.</p>
</section>

<style>
  .small { font-size: 12px; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
  th { font-size: 12px; color: var(--muted); font-weight: 600; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .mini { vertical-align: -4px; }
  tr.keep td { color: var(--muted); }
  tr.keep td strong { color: var(--text); }
</style>
