<script>
  /** A build's gear as a compact row of item pictures with their rolls. */
  import { itemImage, rarityOf, RARITY_COLORS, STATS, statText } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import Icon from './Icon.svelte';

  let { equipment = {}, food = null, items } = $props();

  const ORDER = ['weapon', 'ammo', 'helmet', 'chest', 'pants', 'boots', 'gloves'];
  const pieces = $derived([
    ...ORDER.map((slot) => equipment?.[slot]).filter(Boolean)
      .map((it) => (typeof it === 'string' ? { code: it, skills: {} } : { code: it.code, skills: it.skills ?? {} })),
    ...(food && food !== 'none' ? [{ code: food, skills: {} }] : []),
  ]);
</script>

<ul class="strip">
  {#each pieces as p (p.code)}
    <li style:--frame={RARITY_COLORS[rarityOf(p.code, items)]} title={`${itemLabel(p.code)} ${Object.entries(p.skills).map(([s, v]) => `${STATS[s]?.label ?? s} ${statText(s, v)}`).join(', ')}`}>
      <img src={itemImage(p.code, items)} alt={itemLabel(p.code)} width="30" height="30" loading="lazy" />
      {#each Object.entries(p.skills) as [s, v] (s)}
        <span class="stat" style:color={STATS[s]?.color}><Icon path={STATS[s]?.icon} size={10} />{statText(s, v)}</span>
      {/each}
    </li>
  {/each}
</ul>

<style>
  .strip { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
  li {
    display: flex; flex-direction: column; align-items: center; min-width: 40px; padding: 2px 3px;
    border: 1px solid color-mix(in srgb, var(--frame) 60%, transparent); border-radius: 6px;
    background: color-mix(in srgb, var(--frame) 12%, transparent);
  }
  .stat { display: inline-flex; align-items: center; gap: 1px; font-size: 10px; font-weight: 600; line-height: 1.2; }
</style>
