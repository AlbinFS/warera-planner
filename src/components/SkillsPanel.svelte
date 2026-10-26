<script>
  import { planner } from '../lib/planner.svelte.js';
  import { FIGHT_SKILLS, ECONOMY_SKILLS, ALL_SKILLS, skillValue } from '../engine/inputs.js';

  let { market } = $props();

  const NAMES = {
    attack: 'Attack', precision: 'Precision', criticalChance: 'Crit chance', criticalDamages: 'Crit damage', armor: 'Armor',
    dodge: 'Dodge', health: 'Health', lootChance: 'Loot chance', hunger: 'Hunger',
    production: 'Production', energy: 'Energy', entrepreneurship: 'Entrepreneurship', companies: 'Companies', management: 'Management',
  };
  // Shown as percentages in the game.
  const PERCENT = new Set(['precision', 'criticalChance', 'criticalDamages', 'lootChance']);

  const config = $derived(market.gameConfigSkills);
  const level = $derived(planner.player?.level ?? 1);
  const totalCost = (s, n) => config[s]?.levels?.[String(n)]?.totalCost ?? (n * (n + 1)) / 2;
  const maxLevel = (s) => Math.max(0, ...Object.entries(config[s]?.levels ?? {})
    .filter(([, l]) => (l.unlockAtLevel ?? 0) <= level).map(([n]) => Number(n)));
  const used = $derived(ALL_SKILLS.reduce((sum, s) => sum + totalCost(s, planner.skills[s]), 0));
  const budget = $derived(level * 4);

  function value(s) {
    const v = skillValue(config[s], planner.skills[s], planner.player?.prestige?.[s] ?? 0);
    return PERCENT.has(s) ? `${Math.round(v)}%` : Math.round(v * 10) / 10;
  }

  function step(s, delta) {
    const next = planner.skills[s] + delta;
    if (next < 0 || next > maxLevel(s)) return;
    planner.skills[s] = next;
  }

  let showEconomy = $state(false);
</script>

<section class="card" aria-labelledby="skills-title">
  <div class="head">
    <h2 id="skills-title">Skills</h2>
    <span class="points num" class:over={used > budget}>{used} / {budget} points</span>
  </div>
  {#if used > budget}<p class="warn" role="status">This layout uses more points than level {level} has.</p>{/if}
  <ul class="skills">
    {#each FIGHT_SKILLS as s (s)}
      {@render row(s)}
    {/each}
  </ul>
  <button class="link" onclick={() => (showEconomy = !showEconomy)} aria-expanded={showEconomy}>
    {showEconomy ? 'Hide' : 'Show'} economy skills
  </button>
  {#if showEconomy}
    <ul class="skills">
      {#each ECONOMY_SKILLS as s (s)}
        {@render row(s)}
      {/each}
    </ul>
  {/if}
</section>

{#snippet row(s)}
  <li>
    <span class="name">{NAMES[s]}</span>
    <span class="value num muted">{value(s)}</span>
    <span class="stepper">
      <button onclick={() => step(s, -1)} disabled={planner.skills[s] <= 0} aria-label="Lower {NAMES[s]}">−</button>
      <span class="level num" aria-label="{NAMES[s]} level">{planner.skills[s]}</span>
      <button onclick={() => step(s, 1)} disabled={planner.skills[s] >= maxLevel(s)} aria-label="Raise {NAMES[s]}">+</button>
    </span>
  </li>
{/snippet}

<style>
  .head { display: flex; justify-content: space-between; align-items: baseline; }
  .points { color: var(--muted); font-size: 13px; }
  .points.over { color: var(--bad); }
  .warn { color: var(--bad); margin: 0 0 8px; font-size: 13px; }
  .skills { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 4px 20px; }
  li { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 12px; padding: 4px 0; border-bottom: 1px solid var(--line); }
  .stepper { display: inline-flex; align-items: center; gap: 4px; }
  .stepper button {
    width: 30px; height: 30px; border-radius: var(--radius-sm); border: 1px solid var(--line);
    background: var(--surface-2); cursor: pointer; font-size: 16px; line-height: 1;
  }
  .stepper button:disabled { opacity: .35; cursor: default; }
  .level { min-width: 22px; text-align: center; font-weight: 600; }
  .link { background: none; border: 0; color: var(--info); padding: 8px 0 4px; cursor: pointer; }
</style>
