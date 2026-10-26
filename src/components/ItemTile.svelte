<script>
  /**
   * One gear slot as a picture tile: the game's item image in a rarity frame,
   * its stats with icons, and its price. Empty slots show the slot name.
   */
  import Icon from './Icon.svelte';
  import { STATS, RARITY_COLORS, itemImage, rarityOf, statText } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';

  let { code = null, stats = {}, price = null, label, items, selected = false, onclick, small = false } = $props();

  const rarity = $derived(code ? rarityOf(code, items) : null);
</script>

<button type="button" class="tile" class:small class:empty={!code} class:selected style:--frame={rarity ? RARITY_COLORS[rarity] : 'var(--line)'} {onclick}
  aria-label="{label}: {code ? `${itemLabel(code)} ${Object.entries(stats).map(([s, v]) => statText(s, v)).join(' ')}` : 'empty'}">
  <span class="pic">
    {#if code}
      <img src={itemImage(code, items)} alt="" loading="lazy" width="56" height="56" />
    {:else}
      <span class="none">+</span>
    {/if}
  </span>
  {#if code}
    <span class="stats">
      {#each Object.entries(stats) as [stat, value] (stat)}
        <span class="stat" style:color={STATS[stat]?.color}><Icon path={STATS[stat]?.icon} size={12} />{statText(stat, value)}</span>
      {/each}
    </span>
    {#if price != null}<span class="price num">{Number.isFinite(price) ? price.toFixed(price < 1 ? 3 : 1) : '–'}</span>{/if}
  {/if}
  <span class="label">{label}</span>
</button>

<style>
  .tile {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    width: 92px; padding: 6px 4px 6px;
    background: color-mix(in srgb, var(--frame) 14%, var(--surface-2));
    border: 1.5px solid color-mix(in srgb, var(--frame) 70%, transparent);
    border-radius: 10px; cursor: pointer; color: var(--text); font: inherit;
    transition: transform .1s, box-shadow .1s;
  }
  .tile:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgb(0 0 0 / .25); }
  .tile.selected { box-shadow: 0 0 0 2px var(--accent); }
  .tile.empty { border-style: dashed; background: var(--surface-2); }
  .pic { width: 56px; height: 56px; display: grid; place-items: center; }
  .pic img { width: 56px; height: 56px; object-fit: contain; }
  .none { font-size: 26px; color: var(--muted); }
  .stats { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; font-size: 12px; font-weight: 600; }
  .stat { display: inline-flex; align-items: center; gap: 2px; }
  .price { font-size: 11px; color: var(--muted); }
  .label { font-size: 11px; color: var(--muted); }
  .small { width: 74px; }
  .small .pic, .small .pic img { width: 40px; height: 40px; }
</style>
