<script>
  /** The fight settings every page uses, in one visible bar. */
  import { settings, FOODS } from '../lib/settings.svelte.js';
  import Icon from './Icon.svelte';
  import { mdiPill, mdiFire, mdiClockOutline, mdiFoodDrumstick } from '@mdi/js';
</script>

<section class="bar" aria-label="Fight settings">
  <label class="toggle" title="On pill: +60% damage for 8 hours, then a debuff. The pill's price counts in the cost.">
    <Icon path={mdiPill} size={18} color="var(--c-crit)" />
    <span>Pill</span>
    <input type="checkbox" role="switch" bind:checked={settings.pill} />
    <span class="state">{settings.pill ? 'On' : 'Off'}</span>
  </label>

  <label class="field" title="The battle's damage bonus (country, unit and battle bonuses together).">
    <Icon path={mdiFire} size={18} color="var(--c-attack)" />
    <span>Bonus</span>
    <input type="number" min="0" max="500" step="5" bind:value={settings.battleBonus} />
    <span class="unit">%</span>
  </label>

  <div class="field" role="group" aria-label="Fight window" title="8 h: full health and hunger, fighting through one pill's 8 hours. 16 h: a play session (8 h asleep): the pill's 8 hours, then 8 hours in its −60% debuff on regen. Full day: 24 hours, the debuff included.">
    <Icon path={mdiClockOutline} size={18} color="var(--c-defense)" />
    <span>Fight for</span>
    <span class="seg">
      <button type="button" aria-pressed={settings.windowHours === 8} onclick={() => (settings.windowHours = 8)}>8 hours</button>
      <button type="button" aria-pressed={settings.windowHours === 16} onclick={() => (settings.windowHours = 16)}>16 hours</button>
      <button type="button" aria-pressed={settings.windowHours === 24} onclick={() => (settings.windowHours = 24)}>A full day</button>
    </span>
  </div>

  <label class="field" title="Which food the optimizers may use. Your planned food is set in the gear section.">
    <Icon path={mdiFoodDrumstick} size={18} color="var(--c-life)" />
    <span>Optimize with</span>
    <select bind:value={settings.food}>
      {#each FOODS as food (food.value)}<option value={food.value}>{food.label}</option>{/each}
    </select>
  </label>
</section>

<style>
  .bar {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px;
    padding: 8px var(--gap); background: var(--surface-2); border-bottom: 1px solid var(--line); font-size: 14px;
  }
  .field, .toggle { display: inline-flex; align-items: center; gap: 8px; }
  input[type='number'], select {
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 4px 8px; min-height: 30px; color: var(--text);
  }
  input[type='number'] { width: 64px; }
  .unit, .state { color: var(--muted); }
  .toggle { cursor: pointer; }
  .toggle input { accent-color: var(--accent); width: 18px; height: 18px; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius-sm); overflow: hidden; }
  .seg button { background: var(--surface); border: 0; padding: 5px 10px; cursor: pointer; color: var(--muted); font-size: 13px; }
  .seg button[aria-pressed='true'] { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
</style>
