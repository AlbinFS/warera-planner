<script>
  /**
   * Skill playground: change eco and fight skills and see gold per day (and
   * fight damage) move, with what one level up or down of each eco skill is
   * worth. It edits the planner's skills, so both pages always show the same.
   */
  import { planner } from '../lib/planner.svelte.js';
  import { ecoSettings } from '../lib/eco.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { ECO_SKILLS, ecoValue, ecoCost, ecoMaxLevel, dailyIncome } from '../lib/eco.js';
  import { evaluateBuild } from '../lib/compute.js';
  import { FIGHT_SKILLS, skillValue } from '../engine/inputs.js';
  import { SKILLS } from '../lib/visual.js';
  import { fmt, fmtDamage, periodLabel } from '../lib/format.js';
  import Icon from './Icon.svelte';
  import { mdiRestore } from '@mdi/js';

  let { plan, config, market } = $props();

  const skills = $derived(config.skills);
  const level = $derived(planner.player?.level ?? 1);
  const budget = $derived(level * 4);
  const META = SKILLS;

  // "Now" is the character as it is in the game; the layout being tried is the planner's.
  const own = $derived(planner.player?.skills ?? {});
  const ownEco = () => Object.fromEntries(ECO_SKILLS.map((s) => [s, own[s] ?? planner.player?.ecoLevels?.[s] ?? 0]));
  const ownFight = () => Object.fromEntries(FIGHT_SKILLS.map((s) => [s, own[s] ?? 0]));
  const eco = $derived(Object.fromEntries(ECO_SKILLS.map((s) => [s, planner.skills[s] ?? 0])));
  // Prestige ranks count as levels: the planned ones for the layout tried, the game's for "now".
  const rank = (s) => planner.player?.prestige?.[s] ?? 0;
  const ownRank = (s) => planner.player?.own?.prestige?.[s] ?? 0;
  const withRanks = (levels, of) => Object.fromEntries(ECO_SKILLS.map((s) => [s, (levels[s] ?? 0) + of(s)]));
  const fight = $derived(Object.fromEntries(FIGHT_SKILLS.map((s) => [s, planner.skills[s] ?? 0])));
  function reset() { planner.skills = { ...planner.skills, ...ownEco(), ...ownFight() }; }

  const cost = (s, n) => (skills[s]?.levels?.[String(n)]?.totalCost ?? (n * (n + 1)) / 2);
  const used = $derived(ECO_SKILLS.reduce((t, s) => t + ecoCost(skills, s, eco[s]), 0) + FIGHT_SKILLS.reduce((t, s) => t + cost(s, fight[s]), 0));
  const maxOf = (s) => (ECO_SKILLS.includes(s) ? ecoMaxLevel(skills, s, level)
    : Math.max(0, ...Object.entries(skills[s]?.levels ?? {}).filter(([, l]) => (l.unlockAtLevel ?? 0) <= level).map(([n]) => Number(n))));
  const topOf = (s) => Math.max(0, ...Object.keys(skills[s]?.levels ?? {}).map(Number));

  const base = $derived(dailyIncome(withRanks(ownEco(), ownRank), plan, config));
  const result = $derived(dailyIncome(withRanks(eco, rank), plan, config));
  /** Gold per day for this layout with one eco skill changed by `step`. */
  const withStep = (s, step) => {
    const n = eco[s] + step;
    if (n < 0 || n > maxOf(s)) return null;
    return dailyIncome(withRanks({ ...eco, [s]: n }, rank), plan, config).total - result.total;
  };

  // Fight damage with the planned gear and these fight skills (recalculated shortly after a change).
  let damage = $state(null);
  let baseDamage = $state(null);
  let seq = 0;
  async function damageFor(levels, prestige = planner.player?.prestige) {
    const player = planner.player && { ...planner.player, prestige: prestige ?? {} };
    const r = await evaluateBuild(market, { ...planner, player, skills: { ...planner.skills, ...levels } }, settings).catch(() => null);
    return r && !r.error ? r.damage : null;
  }
  $effect(() => {
    const levels = { ...fight };
    JSON.stringify([settings, planner.gear, planner.player?.prestige, planner.player?.level]);
    const id = ++seq;
    const timer = setTimeout(async () => { const d = await damageFor(levels); if (id === seq) damage = d; }, 250);
    return () => clearTimeout(timer);
  });
  $effect(() => { JSON.stringify([settings, planner.gear, own]); damageFor(ownFight(), planner.player?.own?.prestige).then((d) => (baseDamage = d)); });

  const valueText = (s, n) => {
    if (ECO_SKILLS.includes(s)) return String(ecoValue(skills, s, n, rank(s)));
    const v = skillValue(skills[s], n, rank(s));
    return SKILLS[s]?.percent ? `${Math.round(v)}%` : String(Math.round(v * 10) / 10);
  };
  const signed = (n, d = 1) => `${n >= 0 ? '+' : ''}${fmt(n, d)}`;
  const set = (s, n) => { if (n >= 0 && n <= maxOf(s)) planner.skills[s] = n; };
  // Companies the skill allows beyond the ones owned (and already counted as built).
  const spareSlots = $derived(Math.max(0, result.limit - plan.ownedCount));
</script>

<section class="card summary" aria-label="Result">
  <dl class="big">
    <div><dt>Gold per day</dt><dd class="num">{fmt(result.total, 1)} G</dd><small class:good={result.total >= base.total} class:bad={result.total < base.total}>{signed(result.total - base.total)} vs your skills now</small></div>
    <div><dt>Fight damage {periodLabel(settings)}</dt><dd class="num">{damage != null ? fmtDamage(damage) : '…'}</dd>{#if damage != null && baseDamage != null}<small class:good={damage >= baseDamage} class:bad={damage < baseDamage}>{damage >= baseDamage ? '+' : ''}{fmtDamage(damage - baseDamage)} vs now</small>{/if}</div>
    <div><dt>Skill points</dt><dd class="num" class:bad={used > budget}>{used} <small class="muted">/ {budget}</small></dd>{#if used > budget}<small class="bad">{used - budget} over</small>{/if}</div>
  </dl>
  <p class="muted small">
    Companies running: {result.activeCount} of {result.owned} (limit {result.limit}) · engines and employees {fmt(result.companies, 1)} G
    {#if plan.selfWork} · self-work {fmt(result.selfWork, 1)} G{/if} · energy {fmt(result.energyPerDay, 0)} a day{#if result.trainingEnergy} ({fmt(result.trainingEnergy, 0)} for trainings){/if}
    {#if result.energyShort}<strong class="bad"> · not enough energy for your trainings</strong>{/if}
  </p>
  {#if spareSlots > (Number(ecoSettings.extraCompanies) || 0)}
    <p class="hint">Companies {result.limit} lets you run {spareSlots} more than you own; they only earn once built.
      <button class="ghost" onclick={() => (ecoSettings.extraCompanies = spareSlots)}>Count {spareSlots} new {spareSlots === 1 ? 'company' : 'companies'}</button></p>
  {:else if ecoSettings.extraCompanies > 0}
    <p class="hint">Counting {ecoSettings.extraCompanies} new {ecoSettings.extraCompanies == 1 ? 'company' : 'companies'} you'd build (level 1 engine, best good; building cost not included).
      <button class="ghost" onclick={() => (ecoSettings.extraCompanies = 0)}>Only the ones I own</button></p>
  {/if}
  <button class="ghost" onclick={reset}><Icon path={mdiRestore} size={16} /> Back to my skills</button>
  <span class="muted small">Same skills as the Overview & MinMax page: changes here show there too.</span>
</section>

<div class="cols">
  <section class="card" aria-labelledby="pg-eco">
    <h2 id="pg-eco">Eco skills</h2>
    <ul>
      {#each ECO_SKILLS as s (s)}
        {@const up = withStep(s, 1)}
        {@const down = withStep(s, -1)}
        {@render row(eco, s, META[s])}
        <li class="effect">
          {#if up != null}<span class:good={up > 0.005} class:flat={Math.abs(up) <= 0.005}>next level {signed(up, 2)} G/day</span>{/if}
          {#if down != null}<span class:bad={down < -0.005} class:flat={Math.abs(down) <= 0.005}>one less {signed(down, 2)} G/day</span>{/if}
          {#if s === 'management'}<span class="muted">also better training cards and event odds</span>{/if}
          {#if s === 'energy' && !plan.selfWork && !plan.trainingsPerDay}<span class="muted">counts for trainings and self-work (self-work is off on Eco skills)</span>{/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="card" aria-labelledby="pg-fight">
    <h2 id="pg-fight">Fight skills</h2>
    <ul>
      {#each FIGHT_SKILLS as s (s)}{@render row(fight, s, SKILLS[s])}{/each}
    </ul>
    <p class="muted small">Fight skills earn no gold here; they use points eco could have. Damage uses the gear and food on the Overview & MinMax page.</p>
  </section>
</div>

{#snippet row(group, s, meta)}
  <li class="skill" style:--skill={meta.color}>
    <div class="top">
      <span class="name"><Icon path={meta.icon} size={17} color={meta.color} /> <strong class="num">{valueText(s, group[s])}</strong> {meta.label}</span>
      <span class="stepper">
        <button onclick={() => set(s, group[s] - 1)} disabled={group[s] <= 0} aria-label="Lower {meta.label}">−</button>
        <button onclick={() => set(s, group[s] + 1)} disabled={group[s] >= maxOf(s)} aria-label="Raise {meta.label}">+</button>
      </span>
    </div>
    <div class="pips" role="group" aria-label="{meta.label} level {group[s]}">
      {#each Array.from({ length: topOf(s) }, (_, i) => i + 1) as n (n)}
        <button class="pip" class:on={n <= group[s]} class:locked={n > maxOf(s)} disabled={n > maxOf(s)}
          onclick={() => set(s, n === group[s] ? n - 1 : n)} title="Level {n}: {valueText(s, n)}" aria-label="Set {meta.label} to level {n}"></button>
      {/each}
    </div>
  </li>
{/snippet}

<style>
  .summary { position: sticky; top: 0; z-index: 3; }
  .big { display: flex; flex-wrap: wrap; gap: 12px 40px; margin: 0 0 8px; }
  .big div { display: grid; }
  .big dt { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
  .big dd { margin: 2px 0 0; font-size: 26px; font-weight: 700; }
  .big small { font-size: 13px; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .flat { color: var(--muted); }
  .hint { font-size: 13px; color: var(--accent); margin: 6px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .small { font-size: 12px; margin: 6px 0; }
  .ghost { display: inline-flex; align-items: center; gap: 6px; background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 12px; cursor: pointer; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--gap); align-items: start; }
  ul { list-style: none; margin: 0; padding: 0; }
  .skill { padding: 8px 0 4px; }
  .effect { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; padding: 0 0 8px; border-bottom: 1px solid var(--line); }
  #pg-fight + ul .skill { border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .name { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
  .name strong { color: var(--skill); }
  .stepper { display: inline-flex; gap: 6px; }
  .stepper button { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--line); background: var(--surface-2); cursor: pointer; font-size: 16px; color: var(--text); }
  .stepper button:disabled { opacity: .3; cursor: default; }
  .pips { display: flex; gap: 4px; margin-top: 6px; }
  .pip { width: 22px; height: 12px; border-radius: 3px; padding: 0; cursor: pointer; border: 1px solid color-mix(in srgb, var(--skill) 35%, var(--line)); background: var(--surface-2); }
  .pip.on { background: var(--skill); border-color: var(--skill); }
  .pip.locked { opacity: .3; cursor: default; }
  @media (max-width: 520px) { .pip { width: 18px; } .summary { position: static; } }
</style>
