<script>
  /** Skills as icon rows with level pips; click a pip to jump to that level. */
  import { planner } from '../lib/planner.svelte.js';
  import { FIGHT_SKILLS, ECONOMY_SKILLS, ALL_SKILLS, skillValue } from '../engine/inputs.js';
  import { SKILLS } from '../lib/visual.js';
  import Icon from './Icon.svelte';

  let { market } = $props();

  const config = $derived(market.gameConfigSkills);
  const level = $derived(planner.player?.level ?? 1);
  const totalCost = (s, n) => config[s]?.levels?.[String(n)]?.totalCost ?? (n * (n + 1)) / 2;
  const topLevel = (s) => Math.max(0, ...Object.keys(config[s]?.levels ?? {}).map(Number));
  const maxLevel = (s) => Math.max(0, ...Object.entries(config[s]?.levels ?? {})
    .filter(([, l]) => (l.unlockAtLevel ?? 0) <= level).map(([n]) => Number(n)));
  const used = $derived(ALL_SKILLS.reduce((sum, s) => sum + totalCost(s, planner.skills[s]), 0));
  const budget = $derived(level * 4);
  const economy = $derived(ECONOMY_SKILLS.filter((s) => config[s]?.levels?.['1']));

  function value(s, n = planner.skills[s]) {
    const v = skillValue(config[s], n, planner.player?.prestige?.[s] ?? 0);
    return SKILLS[s].percent ? `${Math.round(v)}%` : String(Math.round(v * 10) / 10);
  }

  function setLevel(s, n) {
    if (n < 0 || n > maxLevel(s)) return;
    planner.skills[s] = n;
  }

  // The character's own levels (from loading the player), to go back to.
  const own = $derived(planner.player?.skills);
  const changed = $derived(own && ALL_SKILLS.some((s) => (planner.skills[s] ?? 0) !== (own[s] ?? 0)));
  function reset() { planner.skills = { ...own }; }

  let showEconomy = $state(true);
</script>

<section class="card" aria-labelledby="skills-title">
  <div class="head">
    <h2 id="skills-title">Skills</h2>
    <span class="right">
      {#if changed}<button class="reset" onclick={reset} title="Set every skill back to what {planner.player.username} has in the game">Reset to my skills</button>{/if}
      <span class="points" class:over={used > budget}>
        <strong class="num">{used}</strong> / {budget} points
      </span>
    </span>
  </div>
  {#if used > budget}<p class="warn" role="status">This layout uses {used - budget} more points than level {level} has.</p>{/if}
  <ul class="skills">
    {#each FIGHT_SKILLS as s (s)}{@render row(s)}{/each}
  </ul>
  {#if economy.length}
    <button class="link" onclick={() => (showEconomy = !showEconomy)} aria-expanded={showEconomy}>
      {showEconomy ? 'Hide' : 'Show'} economy skills
    </button>
    {#if showEconomy}
      <p class="note">The optimizers keep these as set here (unless told to search them), and their points come off the budget.</p>
      <ul class="skills">
        {#each economy as s (s)}{@render row(s)}{/each}
      </ul>
    {/if}
  {/if}
</section>

{#snippet row(s)}
  {@const meta = SKILLS[s]}
  <li style:--skill={meta.color}>
    <div class="top">
      <span class="name"><Icon path={meta.icon} size={18} color={meta.color} /> <strong class="num">{value(s)}</strong> {meta.label}</span>
      <span class="stepper">
        <button onclick={() => setLevel(s, planner.skills[s] - 1)} disabled={planner.skills[s] <= 0} aria-label="Lower {meta.label}">−</button>
        <button onclick={() => setLevel(s, planner.skills[s] + 1)} disabled={planner.skills[s] >= maxLevel(s)} aria-label="Raise {meta.label}">+</button>
      </span>
    </div>
    <div class="pips" role="group" aria-label="{meta.label} level {planner.skills[s]} of {topLevel(s)}">
      {#each Array.from({ length: topLevel(s) }, (_, i) => i + 1) as n (n)}
        <button class="pip" class:on={n <= planner.skills[s]} class:locked={n > maxLevel(s)} disabled={n > maxLevel(s)}
          onclick={() => setLevel(s, n === planner.skills[s] ? n - 1 : n)}
          title="Level {n}: {value(s, n)}{n > maxLevel(s) ? ' (unlocks at a higher level)' : ''}" aria-label="Set {meta.label} to level {n}"></button>
      {/each}
    </div>
  </li>
{/snippet}

<style>
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .right { display: inline-flex; align-items: baseline; gap: 10px; }
  .reset { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 3px 9px; font-size: 12px; cursor: pointer; }
  .note { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
  .head h2 { margin-bottom: 8px; }
  .points { color: var(--muted); font-size: 13px; }
  .points strong { color: var(--text); font-size: 15px; }
  .points.over strong, .warn { color: var(--bad); }
  .warn { margin: 0 0 8px; font-size: 13px; }
  .skills { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  li { padding: 8px 0; border-bottom: 1px solid var(--line); }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .name { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
  .name strong { color: var(--skill); }
  .stepper { display: inline-flex; gap: 6px; }
  .stepper button {
    width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--line);
    background: var(--surface-2); cursor: pointer; font-size: 16px; line-height: 1; color: var(--text);
  }
  .stepper button:disabled { opacity: .3; cursor: default; }
  .pips { display: flex; gap: 4px; margin-top: 6px; }
  .pip {
    width: 22px; height: 12px; border-radius: 3px; padding: 0; cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--skill) 35%, var(--line)); background: var(--surface-2);
  }
  .pip.on { background: var(--skill); border-color: var(--skill); }
  .pip.locked { opacity: .3; cursor: default; }
  .link { background: none; border: 0; color: var(--info); padding: 10px 0 2px; cursor: pointer; }
  @media (max-width: 520px) { .pip { width: 18px; } }
</style>
