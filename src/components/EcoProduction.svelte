<script>
  /** What to produce and which company upgrades pay back. */
  import { ecoEmployees } from '../lib/eco.svelte.js';
  import { engineDaily, employeeDay } from '../lib/eco.js';
  import { fmt } from '../lib/format.js';
  import { itemImage, rarityOf, RARITY_COLORS } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';

  let { companies, goods, perPoint, config, prices } = $props();
  const items = $derived(config.items);
  const up = $derived(config.upgrades);

  const label = (code) => itemLabel(code) || code.replace(/^./, (c) => c.toUpperCase());
  const steel = $derived(prices.steel ?? 0);
  const levelCost = (kind, level) => up[kind]?.levels?.[String(level)];
  const maxLevel = (kind) => Math.max(...Object.keys(up[kind]?.levels ?? { 1: 1 }).map(Number));

  /** Points a company makes per day: engine plus its employees. */
  function dayPoints(c) {
    // Shown bonus already includes the owner's Management, so no change here.
    const staff = (ecoEmployees[c.id] ?? []).map((e) => employeeDay(e, { managementValue: 0, currentManagementValue: 0, goodPerPoint: perPoint[c.good] ?? 0 }));
    return engineDaily(up, c.engine) + staff.reduce((s, x) => s + x.points, 0);
  }
  const bestGood = $derived(goods[0]);

  const rows = $derived(companies.map((c) => {
    const pp = perPoint[c.good] ?? 0;
    const engineNow = engineDaily(up, c.engine);
    const next = levelCost('automatedEngine', c.engine + 1);
    const nextGain = next ? (engineDaily(up, c.engine + 1) - engineNow) * pp : 0;
    const nextSteel = next?.steelCost ?? 0;
    const room = levelCost('breakRoom', c.breakRoom + 1);
    const storageMax = levelCost('storage', c.storage)?.stats?.maxProduction ?? 0;
    const points = dayPoints(c);
    // Switching to the best good: same points, more per point.
    const switchGain = bestGood && bestGood.code !== c.good ? points * (bestGood.perPoint - pp) : 0;
    return {
      ...c, pp, engineNow, engineValue: engineNow * pp, points,
      next, nextGain, nextSteel, paybackDays: nextGain > 0 ? (nextSteel * steel) / nextGain : Infinity,
      room, storageMax, hoursToFull: points > 0 ? Math.max(0, (storageMax - c.stock) / (points / 24)) : Infinity,
      switchGain,
    };
  }));
  const engineMax = $derived(maxLevel('automatedEngine'));
</script>

<section class="card" aria-labelledby="goods-title">
  <h2 id="goods-title">What pays most per production point</h2>
  <p class="muted small">Price minus the inputs it needs, divided by the production points it takes. Today's market prices; the same for engines, employees and self-work.</p>
  <div class="scroll">
    <table>
      <thead><tr><th>Good</th><th class="num">Price</th><th class="num">Inputs</th><th class="num">Points</th><th class="num">Per point</th><th class="num">Engine level 1 / day</th></tr></thead>
      <tbody>
        {#each goods as g, i (g.code)}
          <tr class:top={i === 0}>
            <td class="good">
              <img src={itemImage(g.code, items)} alt="" width="28" height="28" loading="lazy" style:background="color-mix(in srgb, {RARITY_COLORS[rarityOf(g.code, items)]} 18%, transparent)" />
              {label(g.code)} {#if i === 0}<span class="tag">best</span>{/if}
            </td>
            <td class="num">{fmt(g.price, 3)}</td>
            <td class="num">{g.inputs ? fmt(g.inputs, 3) : '–'}</td>
            <td class="num">{g.pp}</td>
            <td class="num strong">{fmt(g.perPoint, 4)}</td>
            <td class="num">{fmt(24 * g.perPoint, 2)} G</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<section class="card" aria-labelledby="companies-title">
  <h2 id="companies-title">Your companies</h2>
  {#if !companies.length}
    <p class="muted">No companies found for this player.</p>
  {:else}
    <div class="scroll">
      <table>
        <thead><tr><th>Company</th><th>Makes</th><th class="num">Points / day</th><th>Next engine level</th><th>Break room</th><th>Storage</th></tr></thead>
        <tbody>
          {#each rows as r (r.id)}
            <tr class:off={r.disabled}>
              <td><strong>{r.name}</strong>{#if r.disabled}<small class="muted"> (switched off)</small>{/if}</td>
              <td class="good">
                <img src={itemImage(r.good, items)} alt="" width="24" height="24" loading="lazy" />
                {label(r.good)} <small class="muted">{fmt(r.pp, 4)}/pt</small>
                {#if r.switchGain > 0.5}<div class="hint">{label(bestGood.code)} would earn {fmt(r.switchGain, 1)} G more a day</div>{/if}
              </td>
              <td class="num">{fmt(r.points, 0)}<div class="muted small">engine {r.engineNow} = {fmt(r.engineValue, 2)} G</div></td>
              <td>
                {#if r.next}
                  Level {r.engine + 1}: {r.nextSteel} steel <span class="muted">({fmt(r.nextSteel * steel, 1)} G)</span>
                  <div class="small">+{fmt(r.nextGain, 2)} G a day → pays back in <strong>{Number.isFinite(r.paybackDays) ? `${fmt(r.paybackDays, 0)} days` : 'never'}</strong></div>
                {:else}
                  <span class="muted">Level {r.engine} (max {engineMax})</span>
                {/if}
              </td>
              <td>
                Level {r.breakRoom}: {r.breakRoom} employee{r.breakRoom > 1 ? 's' : ''}
                {#if r.room}<div class="small muted">Next: {r.room.steelCost} steel ({fmt(r.room.steelCost * steel, 1)} G) for one more employee</div>{/if}
              </td>
              <td>
                {fmt(r.stock, 0)} / {r.storageMax}
                <div class="small" class:warnText={r.hoursToFull < 12}>{Number.isFinite(r.hoursToFull) ? `full in ${fmt(r.hoursToFull, 0)} h` : ''}</div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="muted small">Upgrades also cost construction points (energy) in the game. A full storage stops production and costs employees happiness, so collect or upgrade before it fills. An employee's worth for a break room depends on them: see the Employees tab; guides report a good one earns about as much as an engine.</p>
  {/if}
</section>

<style>
  .small { font-size: 12px; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 7px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  th { font-size: 12px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  .num { text-align: right; white-space: nowrap; }
  .strong { font-weight: 700; }
  td.good { white-space: nowrap; }
  td.good img { vertical-align: middle; border-radius: 5px; margin-right: 4px; }
  tr.top td { background: color-mix(in srgb, var(--good) 8%, transparent); }
  tr.off td { opacity: .6; }
  .tag { font-size: 11px; padding: 0 6px; border-radius: 4px; border: 1px solid var(--good); color: var(--good); }
  .hint { color: var(--accent); font-size: 12px; white-space: normal; }
  .warnText { color: var(--bad); }
</style>
