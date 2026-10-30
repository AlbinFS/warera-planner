<script>
  /** The eco skill optimizer: the split of skill points that earns the most per day. */
  import { planner } from '../lib/planner.svelte.js';
  import { ecoSettings } from '../lib/eco.svelte.js';
  import { ECO_SKILLS, ecoValue, ecoCost, dailyIncome, optimizeEcoSkills, trainingsFromEmployees } from '../lib/eco.js';
  import { FIGHT_SKILLS } from '../engine/inputs.js';
  import { prestigeUsed } from '../lib/prestige.js';
  import { fmt } from '../lib/format.js';
  import Icon from './Icon.svelte';
  import { mdiFactory, mdiLightningBolt, mdiAccountGroup, mdiCrown } from '@mdi/js';

  let { plan, config, fightPoints, pointValue, estimateNote = '' } = $props();

  const META = {
    companies: { label: 'Companies', icon: mdiAccountGroup, what: 'How many companies run at once (engines and employees only work in running companies).' },
    management: { label: 'Management', icon: mdiCrown, what: '+2% output for every employee per point (its value is level + 1), and per level better training cards and +2% event odds (Leadership is part of it since v0.27.3). The cards are value, not money, but counted.' },
    energy: { label: 'Energy', icon: mdiLightningBolt, what: 'Pays for hiring, training and self-work (10 each); refills a tenth of the bar an hour.' },
    production: { label: 'Production', icon: mdiFactory, what: 'Production points from each self-work.' },
  };

  const skills = $derived(config.skills);
  const level = $derived(planner.player?.level ?? 1);
  const current = $derived(planner.player?.ecoLevels ?? Object.fromEntries(ECO_SKILLS.map((s) => [s, 0])));
  // Prestige ranks as the game has them now (each one more level), and the planned prestige points.
  const ownRanks = $derived(planner.player?.own?.prestige ?? {});
  const currentEffective = $derived(Object.fromEntries(ECO_SKILLS.map((s) => [s, (current[s] ?? 0) + (ownRanks[s] ?? 0)])));
  const currentCost = $derived(ECO_SKILLS.reduce((sum, s) => sum + ecoCost(skills, s, current[s] ?? 0), 0));
  const budget = $derived(ecoSettings.budgetMode === 'all' ? level * 4
    : ecoSettings.budgetMode === 'custom' ? Math.max(0, Number(ecoSettings.customBudget) || 0)
    : Math.max(0, level * 4 - fightPoints));
  // Prestige points for eco: all of them for pure eco, else what the fight skills' ranks leave.
  const prestigePoints = $derived.by(() => {
    // Never fewer than the player really has (a lower number typed in is for looking only).
    const total = Math.max(planner.player?.prestigePoints ?? prestigeUsed(planner.player?.prestige), planner.player?.own?.prestigePoints ?? 0);
    if (ecoSettings.budgetMode === 'all') return total;
    return Math.max(0, total - prestigeUsed(Object.fromEntries(FIGHT_SKILLS.map((s) => [s, planner.player?.prestige?.[s] ?? 0]))));
  });

  const now = $derived(dailyIncome(currentEffective, plan, config));
  // What the employees can train a day (the box overrides it).
  const autoTrainings = $derived(trainingsFromEmployees(plan.companies.flatMap((c) => c.employees ?? [])));
  const typedTrainings = $derived(ecoSettings.trainingsPerDay !== null && ecoSettings.trainingsPerDay !== '' && ecoSettings.trainingsPerDay !== undefined);

  // Runs when the button is pressed; changing a setting afterwards marks the result as out of date.
  let best = $state.raw(null);
  let ran = $state(false);
  let ranWith = $state('');
  const inputsKey = $derived(JSON.stringify([budget, plan, prestigePoints, level]));
  let applied = $state(false);
  function optimize() {
    applied = false;
    best = optimizeEcoSkills(plan, config, { budget, playerLevel: level, prestigePoints, prefer: ownRanks });
    ran = true;
    ranWith = inputsKey;
  }
  const outdated = $derived(ran && ranWith !== inputsKey);
  const employeeCount = $derived(plan.companies.reduce((s, c) => s + (c.employees?.length ?? 0), 0));
  const delta = (s) => (best ? best.effective[s] - currentEffective[s] : 0);
  function apply() {
    for (const s of ECO_SKILLS) planner.skills[s] = best.levels[s];
    if (planner.player) planner.player.prestige = { ...planner.player.prestige, ...best.ranks };
    applied = true;
  }
</script>

<section class="card" aria-labelledby="eco-in-title">
  <h2 id="eco-in-title">Your eco setup</h2>
  <div class="inputs">
    <label>
      <span>Skill points for eco</span>
      <select bind:value={ecoSettings.budgetMode}>
        <option value="keepFight">Keep my fight skills ({Math.max(0, level * 4 - fightPoints)} points left)</option>
        <option value="all">All {level * 4} points (pure eco)</option>
        <option value="custom">A number I choose</option>
      </select>
    </label>
    {#if ecoSettings.budgetMode === 'custom'}
      <label><span>Points</span><input type="number" min="0" max={level * 4} bind:value={ecoSettings.customBudget} /></label>
    {/if}
    <div class="readout">
      <span>Value of 1 production point (G)</span>
      <strong class="num">{pointValue.toFixed(4)}</strong>
      <small class="help">Live from the game: {estimateNote}. It's the "Market value" in the game's Cost per production point.</small>
    </div>
    <label>
      <span>Trainings per day</span>
      <input type="number" min="0" max="60" bind:value={ecoSettings.trainingsPerDay} placeholder={String(autoTrainings)} />
      <small class="help">{#if typedTrainings}Your number. Empty: {autoTrainings}, from your employees.{:else}{autoTrainings}, from your employees: each with training left trains once a day (a Trainer coworker adds one), 10 energy each. Type a number to plan otherwise.{/if}</small>
    </label>
    <label>
      <span>Companies I'd build</span>
      <input type="number" min="0" max="20" bind:value={ecoSettings.extraCompanies} />
      <small class="help">You own {plan.ownedCount}. Count new ones here to see what a higher Companies skill would earn: each new company gets a level 1 engine making the best-paying good. The cost of building them isn't included.</small>
    </label>
    <label class="check"><input type="checkbox" bind:checked={ecoSettings.selfWork} /> I self-work with spare energy <small class="help">(10 energy each, for your Production skill's points: {ecoValue(skills, 'production', currentEffective.production)} now, +3 a level)</small></label>
  </div>
  <div class="go">
    <button class="primary" onclick={optimize}>Find best eco skills</button>
    {#if outdated}<span class="warn">Settings changed: press again to update.</span>{/if}
    {#if !employeeCount}<span class="muted small"><strong>No employees:</strong> Management only pays off with employees.</span>{/if}
  </div>
</section>

{#if !ran}
  <section class="card"><p class="muted">Set the options above and press <strong>Find best eco skills</strong>. You earn about <strong>{fmt(now.total, 1)} G a day</strong> from your companies now.</p></section>
{:else if best}
  <section class="card" aria-labelledby="eco-out-title">
    <h2 id="eco-out-title">Best eco skills</h2>
    <dl class="big">
      <div><dt>Money per day now</dt><dd class="num">{fmt(now.total, 1)} G</dd></div>
      <div><dt>With the best skills</dt><dd class="num good">{fmt(best.result.total, 1)} G</dd></div>
      {#if best.result.cards > 0.05 || now.cards > 0.05}<div><dt>Better training cards</dt><dd class="num">{fmt(best.result.cards, 1)} G</dd><small class="muted">Management {best.effective.management}: value, not money (now {fmt(now.cards, 1)})</small></div>{/if}
      <div><dt>Difference</dt><dd class="num">{best.result.value >= now.value ? '+' : ''}{fmt(best.result.value - now.value, 1)} G</dd></div>
      <div><dt>Points used</dt><dd class="num">{best.spent} <small class="muted">of {budget}</small></dd></div>
      {#if prestigePoints > 0}<div><dt>★ Prestige points</dt><dd class="num">{prestigeUsed(best.ranks)} <small class="muted">of {prestigePoints}</small></dd><small class="muted">each rank is a level without skill points</small></div>{/if}
    </dl>
    <table>
      <thead><tr><th>Skill</th><th>Now</th><th>Best</th><th>What it does</th></tr></thead>
      <tbody>
        {#each ECO_SKILLS as s (s)}
          <tr>
            <td class="name"><Icon path={META[s].icon} size={16} color="var(--c-economy)" /> {META[s].label}</td>
            <td class="num">{current[s] ?? 0}{#if ownRanks[s]}<span class="rank"> +{ownRanks[s]}★</span>{/if} <small class="muted">({ecoValue(skills, s, currentEffective[s])})</small></td>
            <td class="num"><strong class:up={delta(s) > 0} class:down={delta(s) < 0}>{best.levels[s]}</strong>{#if best.ranks[s]}<span class="rank"> +{best.ranks[s]}★</span>{/if} <small class="muted">({ecoValue(skills, s, best.effective[s])})</small></td>
            <td class="muted small">{META[s].what}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p><button class="primary" onclick={apply}>Put these in Overview & MinMax</button>
      {#if applied}<span class="muted small"> Done: the Overview & MinMax page and the Skill playground now use them.</span>{/if}</p>

    <h3>Where the money comes from (best skills)</h3>
    <ul class="parts">
      <li>Companies running: <strong>{best.result.activeCount}</strong> of {plan.ownedCount} you own{#if best.result.owned > plan.ownedCount}{' + '}{best.result.owned - plan.ownedCount} you'd build{/if} (limit {best.result.limit}) → <strong>{fmt(best.result.companies, 1)} G</strong> a day from engines and employees</li>
      <li>Energy: {fmt(best.result.energyPerDay, 0)} a day; {fmt(best.result.trainingEnergy, 0)} for trainings{#if plan.selfWork}, {best.result.selfWorkActions} self-works → {fmt(best.result.selfWorkPoints, 0)} points = <strong>{fmt(best.result.selfWork, 1)} G</strong>{/if}</li>
      {#if best.result.energyShort}<li class="warn">No layout within {budget} points has the energy for all {plan.trainingsPerDay} trainings a day: this one has the most ({fmt(best.result.energyPerDay / 10, 0)} actions).</li>{/if}
    </ul>
    <p class="muted small">Current skills cost {currentCost} points. Skills can be reset in the game (v0.27.3 gave everyone a free reset with no cooldown, and refunded Leadership's points). The model: engine and employee output at the game's value of a point of each company's good, employees' output and payroll as the game shows them, Management +2% per point of its value on employee output.</p>
  </section>
{:else}
  <section class="card"><p class="warn">No layout fits within {budget} points.</p></section>
{/if}

<style>
  .inputs { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; align-items: start; }
  .readout { display: grid; gap: 4px; font-size: 13px; color: var(--muted); }
  .readout strong { color: var(--text); font-size: 18px; }
  .help { font-size: 11px; color: var(--muted); line-height: 1.35; }
  .go { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
  .primary { background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius-sm); padding: 9px 16px; font-weight: 600; cursor: pointer; }
  label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
  label.check { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text); }
  input:not([type='checkbox']), select { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 7px 10px; color: var(--text); font-size: 14px; }
  input[type='checkbox'] { accent-color: var(--accent); width: 18px; height: 18px; }
  .small { font-size: 12px; margin: 10px 0 0; }
  .big { display: flex; flex-wrap: wrap; gap: 12px 36px; margin: 0 0 14px; }
  .big dt { color: var(--muted); font-size: 12px; }
  .big dd { margin: 2px 0 0; font-size: 24px; font-weight: 700; }
  .good { color: var(--good); }
  .warn { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 7px 8px; border-bottom: 1px solid var(--line); text-align: left; }
  th { font-size: 12px; color: var(--muted); font-weight: 500; }
  td.num { white-space: nowrap; }
  .name { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .up { color: var(--good); }
  .rank { color: var(--r-legendary); font-size: 12px; }
  .down { color: var(--bad); }
  h3 { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin: 16px 0 6px; font-weight: 500; }
  .parts { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
</style>
