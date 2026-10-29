<script>
  /**
   * Skills as icon rows with level pips; click a pip to jump to that level.
   * The level and prestige can be planned too (prestige.js): ranks on a skill
   * from the prestige points, and a planned prestige (level 50 → 25, +1 point).
   */
  import { planner } from '../lib/planner.svelte.js';
  import { FIGHT_SKILLS, ECONOMY_SKILLS, ALL_SKILLS, skillValue } from '../engine/inputs.js';
  import { rankCost, prestigeUsed, PRESTIGE_LEVEL } from '../lib/prestige.js';
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
    const v = skillValue(config[s], n, rank(s));
    return SKILLS[s].percent ? `${Math.round(v)}%` : String(Math.round(v * 10) / 10);
  }

  // Prestige: ranks per skill (one level each) from the prestige points; the next rank costs 2^ranks.
  const rank = (s) => planner.player?.prestige?.[s] ?? 0;
  const points = $derived(planner.player?.prestigePoints ?? 0);
  const ranksUsed = $derived(prestigeUsed(planner.player?.prestige));
  const pointsLeft = $derived(points - ranksUsed);
  const nextRank = (s) => rankCost(rank(s) + 1) - rankCost(rank(s));
  function setRank(s, r) {
    if (!planner.player || r < 0 || (r > rank(s) && (maxLevel(s) <= 0 || rankCost(r) - rankCost(rank(s)) > pointsLeft))) return;
    planner.player.prestige = { ...planner.player.prestige, [s]: r };
  }

  // The level is the plan's too: what the next levels (or a prestige) would give.
  function setPlayerLevel(n) {
    if (!planner.player) return;
    planner.player.level = Math.min(PRESTIGE_LEVEL, Math.max(1, Math.round(Number(n) || 1)));
  }
  function setPoints(n) {
    if (!planner.player) return;
    planner.player.prestigePoints = Math.max(ranksUsed, Math.min(31, Math.round(Number(n) || 0)));
  }
  // Prestiging: back to level 25 (the game takes 65,000 XP of level 50's 86,600) for one more point.
  function planPrestige() {
    if (!planner.player) return;
    planner.player.level = 25;
    planner.player.prestigePoints = points + 1;
  }

  function setLevel(s, n) {
    if (n < 0 || n > maxLevel(s)) return;
    planner.skills[s] = n;
  }

  // The character's own levels (from loading the player), to go back to.
  const own = $derived(planner.player?.skills);
  const ownState = $derived(planner.player?.own);
  const changed = $derived(own && (ALL_SKILLS.some((s) => (planner.skills[s] ?? 0) !== (own[s] ?? 0) || rank(s) !== (ownState?.prestige?.[s] ?? 0))
    || (ownState && (planner.player.level !== ownState.level || points !== ownState.prestigePoints))));
  function reset() {
    planner.skills = { ...own };
    if (ownState) Object.assign(planner.player, { level: ownState.level, prestige: { ...ownState.prestige }, prestigePoints: ownState.prestigePoints });
  }

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
  {#if planner.player}
    <div class="plan">
      <div class="field">Level
        <span class="mini">
          <button type="button" onclick={() => setPlayerLevel(level - 1)} disabled={level <= 1} aria-label="Lower the level">−</button>
          <input type="number" min="1" max={PRESTIGE_LEVEL} value={level} onchange={(e) => setPlayerLevel(e.currentTarget.value)} aria-label="Planned level" />
          <button type="button" onclick={() => setPlayerLevel(level + 1)} disabled={level >= PRESTIGE_LEVEL} aria-label="Raise the level">+</button>
        </span>
        {#if ownState && level !== ownState.level}<small class="muted">you're {ownState.level}</small>{/if}
      </div>
      <div class="field prestige" title="One prestige point per prestige. A skill's next rank costs 2 to the power of the ranks it has (1, 2, 4, 8) and counts as one more level of it.">★ Prestige points
        <span class="mini">
          <button type="button" onclick={() => setPoints(points - 1)} disabled={points <= ranksUsed} aria-label="One prestige point less">−</button>
          <input type="number" min={ranksUsed} max="31" value={points} onchange={(e) => setPoints(e.currentTarget.value)} aria-label="Prestige points" />
          <button type="button" onclick={() => setPoints(points + 1)} disabled={points >= 31} aria-label="One prestige point more">+</button>
        </span>
        <small class="muted">{ranksUsed} on skills{pointsLeft > 0 ? ` · ${pointsLeft} free` : ''}</small>
      </div>
      {#if level >= PRESTIGE_LEVEL}
        <button type="button" class="reset" onclick={planPrestige} title="Plan the next prestige: back to level 25 (65,000 XP), one more prestige point">Plan a prestige</button>
      {/if}
    </div>
  {/if}
  {#if used > budget}<p class="warn" role="status">This layout uses {used - budget} more points than level {level} has.</p>{/if}
  {#if pointsLeft > 0}<p class="note prestige-note">{pointsLeft} prestige point{pointsLeft === 1 ? '' : 's'} not on a skill: use ★ on a skill (or let the optimizers place {pointsLeft === 1 ? 'it' : 'them'}).</p>{/if}
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
        {#if planner.player && (points > 0 || rank(s) > 0)}
          <span class="ranks" title="Prestige ranks on {meta.label}: each counts as one more level. The next costs {nextRank(s)} point{nextRank(s) === 1 ? '' : 's'}.">
            <button class="star" onclick={() => setRank(s, rank(s) - 1)} disabled={rank(s) <= 0} aria-label="One prestige rank less on {meta.label}">−</button>
            <span class="count num" class:on={rank(s) > 0}>★{rank(s)}</span>
            <button class="star" onclick={() => setRank(s, rank(s) + 1)} disabled={maxLevel(s) <= 0 || nextRank(s) > pointsLeft} aria-label="One prestige rank more on {meta.label}">+</button>
          </span>
        {/if}
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
      {#each Array.from({ length: rank(s) }, (_, i) => i) as i (i)}<span class="pip star-pip" title="Prestige rank {i + 1}"></span>{/each}
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
  .plan { display: flex; flex-wrap: wrap; align-items: end; gap: 10px 18px; margin: 0 0 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-2); }
  .field { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--muted); }
  .field.prestige { color: var(--r-legendary); }
  .field small { font-size: 11px; }
  .mini { display: inline-flex; align-items: center; gap: 4px; }
  .mini button { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--line); background: var(--surface); color: var(--text); cursor: pointer; line-height: 1; }
  .mini button:disabled { opacity: .3; cursor: default; }
  .mini input { width: 48px; text-align: center; padding: 3px 4px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font: inherit; font-size: 14px; }
  .prestige-note { color: var(--r-legendary); margin: 0 0 6px; }
  .ranks { display: inline-flex; align-items: center; gap: 2px; margin-right: 6px; }
  .stepper .ranks button.star { width: 22px; height: 22px; font-size: 13px; border-color: color-mix(in srgb, var(--r-legendary) 40%, var(--line)); }
  .count { font-size: 12px; color: var(--muted); min-width: 24px; text-align: center; }
  .count.on { color: var(--r-legendary); font-weight: 700; }
  .star-pip { cursor: default; background: var(--r-legendary); border-color: var(--r-legendary); }
  @media (max-width: 520px) { .pip { width: 18px; } }
</style>
