<script>
  import { settings, FOODS } from '../lib/settings.svelte.js';
</script>

<section class="bar" aria-label="Fight settings">
  <label>
    <span>Battle bonus</span>
    <span class="field">
      <input type="number" min="0" max="500" step="5" bind:value={settings.battleBonus} />
      <span class="unit">%</span>
    </span>
  </label>
  <label>
    <span>Pill</span>
    <select bind:value={settings.pill}>
      <option value={true}>On pill</option>
      <option value={false}>No pill</option>
    </select>
  </label>
  <label>
    <span>Food</span>
    <select bind:value={settings.food}>
      {#each FOODS as food (food.value)}<option value={food.value}>{food.label}</option>{/each}
    </select>
  </label>
  <label>
    <span>Fight window</span>
    <select bind:value={settings.windowHours}>
      <option value={8}>8 h (full bars + 8 h regen)</option>
      <option value={24}>Full day</option>
    </select>
  </label>
</section>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 20px;
    padding: 12px var(--gap);
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  label { display: flex; flex-direction: column; gap: 4px; min-width: 130px; }
  label > span:first-child { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
  input, select {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    min-height: 36px;
  }
  .field { display: flex; align-items: center; gap: 6px; }
  .field input { width: 80px; }
  .unit { color: var(--muted); }
  @media (max-width: 520px) {
    label { flex: 1 1 calc(50% - 20px); min-width: 0; }
    .field input { width: 100%; }
  }
</style>
