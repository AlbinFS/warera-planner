<script>
  import { planner } from '../lib/planner.svelte.js';
  import { GEAR_SLOTS, SLOT_NAMES, STAT_NAMES, itemLabel } from '../lib/market.js';

  let { data } = $props();
  const { catalog, priceOf, itemPrice } = $derived(data);

  /** Choosing another item keeps each stat where it can, clamped to the new item's range. */
  function setItem(slot, code) {
    if (!code) { planner.gear[slot] = null; return; }
    const item = catalog.bySlot[slot].find((i) => i.code === code);
    const old = planner.gear[slot]?.skills ?? {};
    planner.gear[slot] = {
      code,
      skills: Object.fromEntries(Object.entries(item.stats).map(([stat, [lo, hi]]) => [stat, Math.min(hi, Math.max(lo, old[stat] ?? hi))])),
    };
  }

  function setStat(slot, stat, raw, [lo, hi]) {
    const v = Math.round(Number(raw));
    if (!Number.isFinite(v)) return;
    planner.gear[slot].skills[stat] = Math.min(hi, Math.max(lo, v));
  }

  const statsOf = (slot) => catalog.bySlot[slot].find((i) => i.code === planner.gear[slot]?.code)?.stats ?? {};
  const fmtPrice = (p) => (Number.isFinite(p) ? p.toFixed(2) : '–');
</script>

<section class="card" aria-labelledby="gear-title">
  <h2 id="gear-title">Gear</h2>
  <div class="rows">
    {#each GEAR_SLOTS as slot (slot)}
      <div class="row">
        <label class="slot" for="gear-{slot}">{SLOT_NAMES[slot]}</label>
        <select id="gear-{slot}" value={planner.gear[slot]?.code ?? ''} onchange={(e) => setItem(slot, e.currentTarget.value)}>
          <option value="">None</option>
          {#each catalog.bySlot[slot] as item (item.code)}<option value={item.code}>{itemLabel(item.code)}</option>{/each}
        </select>
        <span class="stats">
          {#each Object.entries(statsOf(slot)) as [stat, range] (stat)}
            <label class="stat">
              <span class="visually-hidden">{SLOT_NAMES[slot]} {STAT_NAMES[stat] ?? stat}</span>
              <input type="number" min={range[0]} max={range[1]} value={planner.gear[slot].skills[stat]}
                onchange={(e) => setStat(slot, stat, e.currentTarget.value, range)} />
              <span class="muted">{STAT_NAMES[stat] ?? stat}</span>
            </label>
          {/each}
        </span>
        <span class="price num muted" title="Market price of this roll">
          {planner.gear[slot] ? fmtPrice(priceOf(planner.gear[slot].code, planner.gear[slot].skills)) : ''}
        </span>
      </div>
    {/each}
    <div class="row">
      <label class="slot" for="gear-ammo">Ammo</label>
      <select id="gear-ammo" value={planner.gear.ammo ?? ''} onchange={(e) => (planner.gear.ammo = e.currentTarget.value || null)}>
        <option value="">None</option>
        {#each catalog.ammo as a (a.code)}<option value={a.code}>{itemLabel(a.code)} (+{a.percent}%)</option>{/each}
      </select>
      <span class="stats"></span>
      <span class="price num muted">{planner.gear.ammo ? fmtPrice(itemPrice(planner.gear.ammo)) : ''}</span>
    </div>
    <div class="row">
      <label class="slot" for="gear-food">Food</label>
      <select id="gear-food" bind:value={planner.food}>
        <option value="none">None</option>
        {#each catalog.foods as f (f.code)}<option value={f.code}>{itemLabel(f.code)} (+{f.percent}% health)</option>{/each}
      </select>
      <span class="stats"></span>
      <span class="price num muted">{planner.food !== 'none' ? fmtPrice(itemPrice(planner.food)) : ''}</span>
    </div>
  </div>
</section>

<style>
  .rows { display: grid; gap: 6px; }
  .row {
    display: grid;
    grid-template-columns: 70px minmax(110px, 140px) 1fr 64px;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    border-bottom: 1px solid var(--line);
  }
  .slot { color: var(--muted); font-size: 13px; }
  select, input {
    background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm);
    padding: 5px 8px; min-height: 32px;
  }
  select { min-width: 0; width: 100%; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
  .stat input { width: 64px; }
  .price { text-align: right; font-size: 13px; }
  @media (max-width: 520px) {
    /* Phone: slot, item and price on one line, the stats below. */
    .row { grid-template-columns: 60px 1fr 56px; }
    .price { order: 3; }
    .stats { order: 4; grid-column: 1 / -1; }
    .stats:empty { display: none; }
  }
</style>
