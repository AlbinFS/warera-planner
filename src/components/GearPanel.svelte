<script>
  /**
   * Gear as picture tiles. Click a tile to change the item (tiers shown as
   * pictures) and its stat rolls (slider within the tier's range).
   */
  import { planner } from '../lib/planner.svelte.js';
  import { GEAR_SLOTS, SLOT_NAMES, itemLabel } from '../lib/market.js';
  import { STATS, RARITY_COLORS, statText, itemImage, rarityOf } from '../lib/visual.js';
  import { mdiClose } from '@mdi/js';
  import ItemTile from './ItemTile.svelte';
  import Icon from './Icon.svelte';

  let { data, current = null } = $props();

  // How many of each a fight uses: weapons last 100 hits, armor 200; one ammo per hit.
  const uses = $derived.by(() => {
    const d = current?.details;
    if (!d) return {};
    const out = { weapon: d.swings / 100, ammo: d.swings, food: d.foodEaten };
    for (const s of ['helmet', 'chest', 'pants', 'boots', 'gloves']) out[s] = d.swings / 200;
    return out;
  });
  const { catalog, priceOf, itemPrice } = $derived(data);
  const items = $derived(data.market.gameConfigItems);

  let open = $state(null); // slot being edited

  const ALL = [...GEAR_SLOTS.slice(0, 1), 'ammo', ...GEAR_SLOTS.slice(1), 'food'];
  const LABELS = { ...SLOT_NAMES, food: 'Food' };

  function tileFor(slot) {
    if (slot === 'food') return { code: planner.food === 'none' ? null : planner.food, stats: {}, price: planner.food !== 'none' ? itemPrice(planner.food) : null };
    if (slot === 'ammo') return { code: planner.gear.ammo, stats: {}, price: planner.gear.ammo ? itemPrice(planner.gear.ammo) : null };
    const g = planner.gear[slot];
    return { code: g?.code ?? null, stats: g?.skills ?? {}, price: g ? priceOf(g.code, g.skills) : null };
  }

  /** Choosing another item keeps each stat where it can, clamped to the new item's range. */
  function choose(slot, code) {
    if (slot === 'food') { planner.food = code ?? 'none'; return; }
    if (slot === 'ammo') { planner.gear.ammo = code; return; }
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
    if (Number.isFinite(v)) planner.gear[slot].skills[stat] = Math.min(hi, Math.max(lo, v));
  }

  const choices = (slot) => (slot === 'food' ? catalog.foods : slot === 'ammo' ? catalog.ammo : catalog.bySlot[slot]);
  const rangeOf = (slot) => catalog.bySlot[slot]?.find((i) => i.code === planner.gear[slot]?.code)?.stats ?? {};
  const isChosen = (slot, code) => (slot === 'food' ? planner.food === code : slot === 'ammo' ? planner.gear.ammo === code : planner.gear[slot]?.code === code);
  const choicePrice = (slot, c) => (slot === 'food' || slot === 'ammo' ? itemPrice(c.code) : null);
  const extra = (slot, c) => (slot === 'ammo' ? `+${c.percent}% attack` : slot === 'food' ? `+${c.percent}% health` : Object.entries(c.stats).map(([s, [lo, hi]]) => `${STATS[s]?.label ?? s} ${lo}–${hi}`).join(', '));
</script>

<section class="card" aria-labelledby="gear-title">
  <h2 id="gear-title">Gear</h2>
  <div class="tiles">
    {#each ALL as slot (slot)}
      {@const t = tileFor(slot)}
      <span class="slot-tile">
        <ItemTile code={t.code} stats={t.stats} price={t.price} label={LABELS[slot]} {items} selected={open === slot}
          onclick={() => (open = open === slot ? null : slot)} />
        {#if t.code && uses[slot] > 0}<span class="uses" title="Used up per fight">×{uses[slot] >= 10 ? Math.round(uses[slot]) : uses[slot].toFixed(1)}</span>{/if}
      </span>
    {/each}
  </div>
  <p class="hint muted">Click a piece to change it. Prices are what each roll sells for on the market.</p>

  {#if open}
    <div class="editor" role="group" aria-label="Change {LABELS[open]}">
      <div class="editor-head">
        <strong>{LABELS[open]}</strong>
        <button class="close" onclick={() => (open = null)} aria-label="Close"><Icon path={mdiClose} /></button>
      </div>
      <div class="choices">
        <button class="choice" class:on={!tileFor(open).code} onclick={() => choose(open, null)}>
          <span class="none">–</span><span>None</span>
        </button>
        {#each choices(open) as c (c.code)}
          <button class="choice" class:on={isChosen(open, c.code)} onclick={() => choose(open, c.code)} title={extra(open, c)}>
            <img src={itemImage(c.code, items)} alt="" width="36" height="36" loading="lazy"
              style:background="color-mix(in srgb, {RARITY_COLORS[rarityOf(c.code, items)]} 22%, transparent)" />
            <span>{itemLabel(c.code)}</span>
            <small class="muted">{choicePrice(open, c) != null ? choicePrice(open, c).toFixed(2) : extra(open, c)}</small>
          </button>
        {/each}
      </div>
      {#if GEAR_SLOTS.includes(open) && planner.gear[open]}
        <div class="sliders">
          {#each Object.entries(rangeOf(open)) as [stat, range] (stat)}
            <label class="slider">
              <span class="name" style:color={STATS[stat]?.color}><Icon path={STATS[stat]?.icon} size={16} /> {STATS[stat]?.label ?? stat}</span>
              <input type="range" min={range[0]} max={range[1]} value={planner.gear[open].skills[stat]}
                oninput={(e) => setStat(open, stat, e.currentTarget.value, range)} />
              <input class="num-in" type="number" min={range[0]} max={range[1]} value={planner.gear[open].skills[stat]}
                onchange={(e) => setStat(open, stat, e.currentTarget.value, range)} aria-label="{STATS[stat]?.label} value" />
              <span class="muted small">{statText(stat, range[0])}–{statText(stat, range[1])}</span>
            </label>
          {/each}
          <p class="muted small">This roll sells for about <strong>{Number.isFinite(priceOf(planner.gear[open].code, planner.gear[open].skills)) ? priceOf(planner.gear[open].code, planner.gear[open].skills).toFixed(2) : 'an unknown price'}</strong> on the market.</p>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .tiles { display: flex; flex-wrap: wrap; gap: 8px; }
  .hint { font-size: 12px; margin: 10px 0 0; }
  .editor { margin-top: 14px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface-2); }
  .editor-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .close { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 4px; }
  .choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
  .choice {
    display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px;
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; color: var(--text);
  }
  .choice img { border-radius: 6px; }
  .choice small { font-size: 10px; text-align: center; }
  .choice.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .choice .none { width: 36px; height: 36px; display: grid; place-items: center; font-size: 20px; color: var(--muted); }
  .sliders { margin-top: 12px; display: grid; gap: 10px; }
  .slider { display: grid; grid-template-columns: 130px 1fr 64px auto; align-items: center; gap: 10px; }
  .slider .name { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; }
  .slider input[type='range'] { accent-color: var(--accent); width: 100%; }
  .num-in { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 4px 6px; width: 64px; color: var(--text); }
  .small { font-size: 12px; }
  @media (max-width: 520px) {
    .tiles { gap: 6px; }
    .slider { grid-template-columns: 1fr 64px; }
    .slider input[type='range'] { grid-column: 1 / -1; grid-row: 2; }
    .slider .muted { display: none; }
  }
  .slot-tile { position: relative; display: inline-flex; }
  .uses { position: absolute; top: 4px; right: 4px; font-size: 11px; font-weight: 700; padding: 0 5px; border-radius: 6px; background: color-mix(in srgb, var(--bg) 80%, transparent); color: var(--text); pointer-events: none; font-variant-numeric: tabular-nums; }
</style>
