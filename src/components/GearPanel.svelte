<script>
  /**
   * Gear as picture tiles. Click a tile to change the item (tiers shown as
   * pictures) and its stat rolls (slider within the tier's range).
   */
  import { planner } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { splitActive, suggestDebuff } from '../lib/compute.js';
  import { setDebuff } from '../lib/planner.svelte.js';
  import { GEAR_SLOTS, SLOT_NAMES, itemLabel } from '../lib/market.js';
  import { STATS, RARITY_COLORS, statText, itemImage, rarityOf } from '../lib/visual.js';
  import { mdiClose } from '@mdi/js';
  import ItemTile from './ItemTile.svelte';
  import GearStrip from './GearStrip.svelte';
  import Icon from './Icon.svelte';

  let { data, current = null } = $props();

  // How many of each a fight uses: weapons last 100 hits, armor 200; one ammo per hit.
  const uses = $derived.by(() => {
    const all = current?.details;
    if (!all) return {};
    const debuff = all.debuff;
    const d = !debuff ? all : editing === 'debuff' ? debuff : { swings: all.swings - debuff.swings, foodEaten: all.foodEaten - debuff.foodEaten };
    const out = { weapon: d.swings / 100, ammo: d.swings, food: d.foodEaten };
    for (const s of ['helmet', 'chest', 'pants', 'boots', 'gloves']) out[s] = d.swings / 200;
    return out;
  });
  const { catalog, priceOf, itemPrice } = $derived(data);

  // With a debuff build, either build can be edited; the debuff one starts as a copy of the pill one.
  const split = $derived(splitActive(data.market, settings));
  let editing = $state('pill');
  const target = $derived(split && editing === 'debuff' && planner.debuff ? planner.debuff : planner);
  const debuffHours = $derived(settings.pill && settings.windowHours > 8);
  let suggesting = $state(false);
  let suggestNote = $state('');
  /** Fills the debuff build with the cheapest gear doing the pill gear's damage in the debuff. */
  async function suggest() {
    suggesting = true;
    try {
      const s = await suggestDebuff(data.market, planner, settings);
      if (s) { setDebuff(s); suggestNote = `Same damage in the debuff as your pill gear, ${s.saving.toFixed(1)} G cheaper.`; }
      else { planner.debuff = { gear: structuredClone($state.snapshot(planner.gear)), food: planner.food }; suggestNote = 'Your pill gear is already the cheapest for its damage in the debuff.'; }
    } finally {
      suggesting = false;
    }
  }
  async function editDebuff() {
    if (!planner.debuff) await suggest();
    editing = 'debuff';
    open = null;
  }
  function sameAsPill() {
    planner.debuff = null;
    editing = 'pill';
    suggestNote = '';
  }
  // Turning the switch on with no debuff build yet fills in the suggested one.
  $effect(() => { if (split && !planner.debuff && !suggesting) suggest(); });
  const items = $derived(data.market.gameConfigItems);

  let open = $state(null); // slot being edited

  const ALL = [...GEAR_SLOTS.slice(0, 1), 'ammo', ...GEAR_SLOTS.slice(1), 'food'];
  const LABELS = { ...SLOT_NAMES, food: 'Food' };

  function tileFor(slot) {
    if (slot === 'food') return { code: target.food === 'none' ? null : target.food, stats: {}, price: target.food !== 'none' ? itemPrice(target.food) : null };
    if (slot === 'ammo') return { code: target.gear.ammo, stats: {}, price: target.gear.ammo ? itemPrice(target.gear.ammo) : null };
    const g = target.gear[slot];
    return { code: g?.code ?? null, stats: g?.skills ?? {}, price: g ? priceOf(g.code, g.skills) : null };
  }

  /** Choosing another item keeps each stat where it can, clamped to the new item's range. */
  function choose(slot, code) {
    if (slot === 'food') { target.food = code ?? 'none'; return; }
    if (slot === 'ammo') { target.gear.ammo = code; return; }
    if (!code) { target.gear[slot] = null; return; }
    const item = catalog.bySlot[slot].find((i) => i.code === code);
    const old = target.gear[slot]?.skills ?? {};
    target.gear[slot] = {
      code,
      skills: Object.fromEntries(Object.entries(item.stats).map(([stat, [lo, hi]]) => [stat, Math.min(hi, Math.max(lo, old[stat] ?? hi))])),
    };
  }

  function setStat(slot, stat, raw, [lo, hi]) {
    const v = Math.round(Number(raw));
    if (Number.isFinite(v)) target.gear[slot].skills[stat] = Math.min(hi, Math.max(lo, v));
  }

  const choices = (slot) => (slot === 'food' ? catalog.foods : slot === 'ammo' ? catalog.ammo : catalog.bySlot[slot]);
  const rangeOf = (slot) => catalog.bySlot[slot]?.find((i) => i.code === target.gear[slot]?.code)?.stats ?? {};
  const isChosen = (slot, code) => (slot === 'food' ? target.food === code : slot === 'ammo' ? target.gear.ammo === code : target.gear[slot]?.code === code);
  const choicePrice = (slot, c) => (slot === 'food' || slot === 'ammo' ? itemPrice(c.code) : null);
  const extra = (slot, c) => (slot === 'ammo' ? `+${c.percent}% attack` : slot === 'food' ? `+${c.percent}% health` : Object.entries(c.stats).map(([s, [lo, hi]]) => `${STATS[s]?.label ?? s} ${lo}–${hi}`).join(', '));
</script>

<section class="card" aria-labelledby="gear-title">
  <h2 id="gear-title">Gear</h2>
  {#if debuffHours}
    <div class="builds" role="group" aria-label="Which build">
      <label class="switch"><input type="checkbox" role="switch" bind:checked={settings.splitDebuff} /> Separate debuff build</label>
      {#if split}
        <button type="button" aria-pressed={editing === 'pill' || !planner.debuff} onclick={() => { editing = 'pill'; open = null; }}>Pill build <small>hours 1–8, +60%</small></button>
        <button type="button" aria-pressed={editing === 'debuff' && !!planner.debuff} onclick={editDebuff}>Debuff build <small>hours 9–{settings.windowHours}, −60%</small></button>
        <button type="button" class="link" onclick={suggest} disabled={suggesting}>{suggesting ? 'Finding…' : 'Suggest the cheapest'}</button>
        {#if planner.debuff}<button type="button" class="link" onclick={sameAsPill}>Use the pill build for both</button>{/if}
      {/if}
    </div>
    {#if !split}<p class="hint muted">The {settings.windowHours - 8} hours after the pill are fought in this gear. Turn on a separate debuff build to fight them in cheaper gear.</p>
    {:else if editing === 'debuff' && planner.debuff}<p class="hint muted">Editing the debuff build (worn after the pill). {suggestNote}</p>
    {:else if suggestNote}<p class="hint muted">{suggestNote} See it under Debuff build.</p>{/if}
  {/if}
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
  {#if split && planner.debuff}
    {@const other = editing === 'debuff' ? planner : planner.debuff}
    <div class="other">
      <span>{editing === 'debuff' ? 'Pill build, hours 1–8' : `Debuff build, hours 9–${settings.windowHours}`}</span>
      <GearStrip equipment={other.gear} food={other.food} {items} />
      <button type="button" class="link" onclick={() => (editing === 'debuff' ? (editing = 'pill') : editDebuff())}>Edit</button>
    </div>
  {/if}

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
      {#if GEAR_SLOTS.includes(open) && target.gear[open]}
        <div class="sliders">
          {#each Object.entries(rangeOf(open)) as [stat, range] (stat)}
            <label class="slider">
              <span class="name" style:color={STATS[stat]?.color}><Icon path={STATS[stat]?.icon} size={16} /> {STATS[stat]?.label ?? stat}</span>
              <input type="range" min={range[0]} max={range[1]} value={target.gear[open].skills[stat]}
                oninput={(e) => setStat(open, stat, e.currentTarget.value, range)} />
              <input class="num-in" type="number" min={range[0]} max={range[1]} value={target.gear[open].skills[stat]}
                onchange={(e) => setStat(open, stat, e.currentTarget.value, range)} aria-label="{STATS[stat]?.label} value" />
              <span class="muted small">{statText(stat, range[0])}–{statText(stat, range[1])}</span>
            </label>
          {/each}
          <p class="muted small">This roll sells for about <strong>{Number.isFinite(priceOf(target.gear[open].code, target.gear[open].skills)) ? priceOf(target.gear[open].code, target.gear[open].skills).toFixed(2) : 'an unknown price'}</strong> on the market.</p>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .builds { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 10px; }
  .builds button { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 12px; color: var(--muted); cursor: pointer; font: inherit; font-size: 13px; }
  .builds button[aria-pressed='true'] { color: var(--text); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface-2)); }
  .builds button small { color: var(--muted); margin-left: 4px; }
  .builds .link { background: none; border: 0; color: var(--info); padding: 4px; }
  .other { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 10px; padding: 8px 10px; border: 1px dashed var(--line); border-radius: var(--radius-sm); font-size: 13px; color: var(--muted); }
  .other .link { background: none; border: 0; color: var(--info); cursor: pointer; font: inherit; }
  .builds .switch { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text); margin-right: 6px; }
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
