<script>
  import { planner, applyBuild } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { optimizeEquipment, strongestWithin, buildsNear, optimizeSkills, evaluateBuild } from '../lib/compute.js';
  import { searchSkills } from '../lib/contract.js';
  import { ALL_SKILLS } from '../engine/inputs.js';
  import { fmt, fmtDamage, periodLabel } from '../lib/format.js';
  import { itemLabel, SLOT_NAMES } from '../lib/market.js';
  import GearStrip from './GearStrip.svelte';

  // show: 'gear' or 'skills' (each opens in its own dialog), or both.
  let { data, current, show = 'both' } = $props();

  const NAMES = {
    attack: 'Attack', precision: 'Precision', criticalChance: 'Crit chance', criticalDamages: 'Crit damage', armor: 'Armor',
    dodge: 'Dodge', health: 'Health', lootChance: 'Loot chance', hunger: 'Hunger',
    production: 'Production', energy: 'Energy', entrepreneurship: 'Entrepreneurship', companies: 'Companies', management: 'Management', leadership: 'Leadership',
  };

  /** "1.8m", "1800k" or "1800000" → 1800000. */
  function parseAmount(text) {
    const m = String(text).trim().toLowerCase().replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)\s*([km]?)$/);
    if (!m) return null;
    return Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1);
  }

  const gearText = (equipment) => Object.entries(equipment ?? {})
    .filter(([, it]) => it)
    .map(([slot, it]) => (typeof it === 'string' ? itemLabel(it) : `${SLOT_NAMES[slot]}: ${itemLabel(it.code)} ${Object.values(it.skills ?? {}).join('/')}`))
    .join(' · ');
  const vsNow = (cost) => (current && !current.error ? `${cost >= current.cost ? '+' : ''}${fmt(cost - current.cost, 1)} G vs now` : '');

  // ── Equipment ──
  let gearMode = $state('damage');
  let target = $state('');
  let budget = $state('');
  let gear = $state(null);
  let nearby = $state([]);
  let gearBusy = $state(false);

  async function runGear() {
    gearBusy = true;
    gear = null;
    nearby = [];
    try {
      if (gearMode === 'budget') {
        const amount = parseAmount(budget) ?? current?.cost;
        if (amount == null) throw new Error('Enter a budget.');
        gear = await strongestWithin(data.market, planner, settings, amount);
      } else {
        const damage = parseAmount(target) ?? current?.damage;
        if (!damage) throw new Error('Enter a damage target.');
        [gear, nearby] = await Promise.all([
          optimizeEquipment(data.market, planner, settings, damage),
          buildsNear(data.market, planner, settings, damage).catch(() => []),
        ]);
      }
    } catch (err) {
      gear = { error: err.message };
    } finally {
      gearBusy = false;
    }
  }

  function apply(option) {
    applyBuild(option.equipment, option.food);
    gear = null;
    nearby = [];
  }

  // Cost of each step up, per extra 1k damage: worth it while it's below what a contract pays per 1k.
  const steps = $derived(nearby.map((n, i) => ({
    ...n,
    marginal: i > 0 && n.damage > nearby[i - 1].damage ? ((n.cost - nearby[i - 1].cost) / (n.damage - nearby[i - 1].damage)) * 1000 : null,
  })));

  // ── Skills ──
  let skillsMode = $state('range');
  let min = $state('');
  let max = $state('');
  let skillsBudget = $state('');
  let keepEconomy = $state(true);
  let skillsBusy = $state(false);
  let progress = $state(null);
  let found = $state(null);
  let controller = null;

  async function runSkills() {
    skillsBusy = true;
    found = null;
    progress = null;
    controller = new AbortController();
    try {
      found = skillsMode === 'budget' ? await skillsForBudget() : await skillsForRange();
    } catch (err) {
      found = { error: err.message };
    } finally {
      skillsBusy = false;
      controller = null;
    }
  }

  async function skillsForRange() {
    let lo = parseAmount(min);
    let hi = parseAmount(max);
    if (!lo || !hi) {
      // Default range: around the planned build's full-day damage.
      const daily = await evaluateBuild(data.market, planner, { ...settings, windowHours: 24 });
      if (daily.error) throw new Error(`Set a damage range: ${daily.error}`);
      lo = daily.damage * 0.9;
      hi = daily.damage * 1.15;
      min = fmtDamage(lo);
      max = fmtDamage(hi);
    }
    return optimizeSkills(data.market, planner, settings, {
      min: Math.min(lo, hi), max: Math.max(lo, hi), keepEconomy,
      // { evaluations, bestMeanDailyNetCost, elapsedMs }; the search stops at 45 s at the latest.
      onProgress: (p) => { progress = p ?? progress; },
      signal: controller.signal,
    });
  }

  /**
   * Most damage for a budget: the contract search with no income, so "willing
   * to lose" is the budget. Costs follow the settings (window or day).
   */
  async function skillsForBudget() {
    const amount = parseAmount(skillsBudget) ?? current?.cost;
    if (amount == null) throw new Error('Enter a budget.');
    skillsBudget = fmt(amount, 0);
    const result = await searchSkills(data.market, planner, settings, {
      terms: { bounty: 0, poolLoot: 0, economy: 0 }, maxLoss: amount, economySearch: !keepEconomy, signal: controller.signal,
      onStep: (s) => { progress = { step: s.step, checked: s.checked, best: s.best }; },
    });
    if (!result.best) throw new Error('No skill layout has a build within this budget.');
    return {
      skills: Object.fromEntries(ALL_SKILLS.map((s) => [s, result.levels[s]])),
      budgetBuild: result.best,
      incomeChange: keepEconomy ? null : result.incomeChange,
    };
  }

  /**
   * New skills change what the gear is worth, so by default the gear is
   * re-picked too: the cheapest gear that keeps the current damage.
   */
  let applying = $state(false);
  async function applySkills(withGear = true) {
    const keepDamage = current && !current.error ? current.damage : null;
    for (const s of ALL_SKILLS) planner.skills[s] = found.skills[s];
    if (found.budgetBuild) {
      applyBuild(found.budgetBuild.equipment, found.budgetBuild.food);
    } else if (withGear && keepDamage) {
      applying = true;
      const g = await optimizeEquipment(data.market, planner, settings, keepDamage).catch(() => null);
      applying = false;
      if (g && !g.error) applyBuild(g.equipment, g.food);
    }
    found = null;
  }

  const changed = $derived(found?.skills ? ALL_SKILLS.filter((s) => found.skills[s] !== planner.skills[s]) : []);
</script>

{#if show !== 'skills'}
<section class="card" aria-labelledby="opt-gear-title">
  <div class="head">
    <h2 id="opt-gear-title">Optimize equipment</h2>
    <div class="switch" role="group" aria-label="Optimize for">
      <button type="button" aria-pressed={gearMode === 'damage'} onclick={() => (gearMode = 'damage')}>Damage</button>
      <button type="button" aria-pressed={gearMode === 'budget'} onclick={() => (gearMode = 'budget')}>Budget</button>
    </div>
  </div>
  <form class="line" onsubmit={(e) => { e.preventDefault(); runGear(); }}>
    {#if gearMode === 'damage'}
      <label>
        <span>Damage target {periodLabel(settings)}</span>
        <input bind:value={target} placeholder={current?.damage ? fmtDamage(current.damage) : 'e.g. 1.5m'} inputmode="decimal" />
      </label>
      <button class="primary" disabled={gearBusy}>{gearBusy ? 'Optimizing…' : 'Cheapest gear'}</button>
    {:else}
      <label>
        <span>Budget in G {periodLabel(settings)}</span>
        <input bind:value={budget} placeholder={current?.cost != null ? fmt(current.cost, 0) : 'e.g. 300'} inputmode="decimal" />
      </label>
      <button class="primary" disabled={gearBusy}>{gearBusy ? 'Optimizing…' : 'Most damage'}</button>
    {/if}
  </form>
  <p class="hint muted">
    {#if gearMode === 'damage'}
      The cheapest gear{settings.food === 'any' ? ' and food' : ''} whose damage is at least the target. Below it you'll see the builds from 85% to 115% of the target and their cost per 1k damage, in case a little more or less damage is much better value.
    {:else}
      The gear{settings.food === 'any' ? ' and food' : ''} with the most damage that costs no more than the budget (negative means a build that earns money).
    {/if}
    Empty field: your current {gearMode === 'damage' ? 'damage' : 'cost'}.
  </p>
  {#if gear?.error}
    <p class="error">{gear.error}</p>
  {:else if gear}
    <div class="found">
      <p>
        <strong>{fmtDamage(gear.damage)}</strong> for <strong>{fmt(gear.cost, 1)} G</strong>
        <span class="muted">({vsNow(gear.cost)})</span>
        {#if !gear.reachedTarget}<span class="error"> · the target is out of reach; this is the strongest build</span>{/if}
      </p>
      <div class="strip"><GearStrip equipment={gear.equipment} food={gear.food} items={data.market.gameConfigItems} /></div>
      <button class="primary" onclick={() => apply(gear)}>Apply this gear</button>
    </div>
    {#if nearby.length > 1}
      <div class="nearby">
        <h3>Around the target</h3>
        <p class="muted small">"Step per 1k" is what each step up costs per extra 1k damage. Going up pays off while it's below your bounty plus pool loot per 1k.</p>
        <table>
          <thead><tr><th>Damage</th><th>Cost</th><th>Per 1k</th><th title="Extra cost per extra 1k damage, from the row above">Step per 1k</th><th></th></tr></thead>
          <tbody>
            {#each steps as n (n)}
              <tr class:target={gear && Math.abs(n.damage - gear.damage) < 1}>
                <td class="num">{fmtDamage(n.damage)}</td>
                <td class="num">{fmt(n.cost, 1)}</td>
                <td class="num">{fmt(n.per1k, 3)}</td>
                <td class="num">{n.marginal == null ? '' : fmt(n.marginal, 3)}</td>
                <td><button class="secondary small" onclick={() => apply(n)} title={gearText(n.equipment)}>Apply</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</section>

{/if}

{#if show !== 'gear'}
<section class="card" aria-labelledby="opt-skills-title">
  <div class="head">
    <h2 id="opt-skills-title">Optimize skills</h2>
    <div class="switch" role="group" aria-label="Optimize for">
      <button type="button" aria-pressed={skillsMode === 'range'} onclick={() => (skillsMode = 'range')}>Damage range</button>
      <button type="button" aria-pressed={skillsMode === 'budget'} onclick={() => (skillsMode = 'budget')}>Budget</button>
    </div>
  </div>
  <form class="line" onsubmit={(e) => { e.preventDefault(); runSkills(); }}>
    {#if skillsMode === 'range'}
      <label><span>Daily damage from</span><input bind:value={min} placeholder="auto" inputmode="decimal" /></label>
      <label><span>to</span><input bind:value={max} placeholder="auto" inputmode="decimal" /></label>
    {:else}
      <label><span>Budget in G {periodLabel(settings)}</span><input bind:value={skillsBudget} placeholder={current?.cost != null ? fmt(current.cost, 0) : 'e.g. 300'} inputmode="decimal" /></label>
    {/if}
    <label class="check"><input type="checkbox" bind:checked={keepEconomy} /> Keep economy skills</label>
    {#if skillsBusy}
      <button type="button" class="secondary" onclick={() => controller?.abort()}>{skillsMode === 'range' ? 'Cancel' : 'Stop after this step'}</button>
    {:else}
      <button class="primary">Find best skills</button>
    {/if}
  </form>
  <p class="hint muted">
    {#if skillsMode === 'range'}
      Spreads your skill points for the lowest cost across the range{keepEconomy ? '' : ', with your company income counted'}. Uses the full-day model, like the original; takes up to 45 seconds.
    {:else}
      The skill layout and gear with the most damage {periodLabel(settings)} that costs no more than the budget{keepEconomy ? '' : '; economy skills are searched too and their income change is counted'}. Starts from your planned skills; takes a minute or two.
    {/if}
  </p>
  {#if skillsBusy}
    {#if skillsMode === 'range'}
      {@const share = Math.min(1, (progress?.elapsedMs ?? 0) / 45000)}
      <div class="progress" role="progressbar" aria-label="Skill search time" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(share * 100)}>
        <div style="width: {Math.round(share * 100)}%"></div>
      </div>
      <p class="muted small" aria-live="polite">
        {#if progress?.evaluations}{fmt(progress.evaluations)} layouts checked{#if Number.isFinite(progress.bestMeanDailyNetCost)}{' · '}best average cost so far {fmt(progress.bestMeanDailyNetCost, 1)} G per day{/if}{:else}Loading your companies and starting…{/if}
      </p>
    {:else}
      <p class="muted small" aria-live="polite">
        {#if progress}Step {progress.step}: best so far {progress.best ? fmtDamage(progress.best.damage) : 'nothing within the budget'} · {progress.checked} layouts checked{:else}Starting…{/if}
      </p>
    {/if}
  {/if}
  {#if found?.error}
    <p class="error">{found.error}</p>
  {:else if found}
    <div class="found">
      {#if found.budgetBuild}
        <p><strong>{fmtDamage(found.budgetBuild.damage)}</strong> for <strong>{fmt(found.budgetBuild.cost, 1)} G</strong> <span class="muted">({vsNow(found.budgetBuild.cost)})</span></p>
      {/if}
      {#if !changed.length}
        <p class="good">Your planned skills are already the best layout for this {skillsMode === 'range' ? 'range' : 'budget'}.</p>
      {:else}
        <table>
          <thead><tr><th>Skill</th><th>Now</th><th>Best</th></tr></thead>
          <tbody>
            {#each changed as s (s)}
              <tr>
                <td>{NAMES[s]}</td><td class="num">{planner.skills[s]}</td>
                <td class="num"><strong class={found.skills[s] > planner.skills[s] ? 'up' : 'down'}>{found.skills[s]}</strong></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      <p class="muted small">
        {#if found.hadEconomy}Income with this layout: {fmt(found.income, 1)} G per day. {/if}
        {#if found.incomeChange != null}Income change: {found.incomeChange >= 0 ? '+' : ''}{fmt(found.incomeChange, 1)} G per day. {/if}
        {#if found.elapsedMs >= 44000}The search hit its 45-second limit; running it again may find a slightly better layout.{/if}
      </p>
      {#if changed.length || found.budgetBuild}
        {#if found.budgetBuild}
          <button class="primary" onclick={() => applySkills()}>Apply skills and gear</button>
        {:else}
          <div class="apply">
            <button class="primary" onclick={() => applySkills(true)} disabled={applying}>{applying ? 'Picking gear…' : 'Apply skills + matching gear'}</button>
            <button class="secondary" onclick={() => applySkills(false)} disabled={applying}>Skills only</button>
          </div>
          <p class="muted small">"Matching gear" re-picks the cheapest gear that keeps your current damage with the new skills. These skills are best on average across the damage range for a full day; for a contract, the Contract page's skills fit better.</p>
        {/if}
      {/if}
    </div>
  {/if}
</section>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
  .head h2 { margin: 0; }
  .switch { display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius-sm); overflow: hidden; }
  .switch button { background: none; border: 0; padding: 6px 12px; cursor: pointer; color: var(--muted); font-size: 13px; }
  .switch button[aria-pressed='true'] { background: var(--surface-2); color: var(--text); box-shadow: inset 0 -2px var(--accent); }
  .line { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  label.check { flex-direction: row; align-items: center; gap: 6px; font-size: 14px; color: var(--text); min-height: 36px; }
  input:not([type='checkbox']) {
    background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm);
    padding: 7px 10px; width: 140px; color: var(--text);
  }
  button.primary {
    background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius-sm);
    padding: 9px 16px; font-weight: 600; cursor: pointer; min-height: 36px;
  }
  button.primary:disabled { opacity: .6; cursor: default; }
  button.secondary { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 9px 16px; cursor: pointer; min-height: 36px; }
  button.small { padding: 4px 10px; min-height: 0; font-size: 13px; }
  .hint { font-size: 13px; margin: 8px 0 0; }
  .found { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
  .found p { margin: 0 0 8px; }
  .nearby { margin-top: 14px; }
  .apply { display: flex; gap: 8px; flex-wrap: wrap; }
  .strip { margin: 4px 0 10px; }
  .nearby h3 { font-size: 12px; color: var(--muted); font-weight: 500; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .05em; }
  tr.target td { background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .nearby { max-height: 420px; overflow: auto; }
  .small { font-size: 13px; }
  .error { color: var(--bad); }
  .good { color: var(--good); }
  .up { color: var(--good); }
  .down { color: var(--bad); }
  table { border-collapse: collapse; margin-bottom: 8px; }
  th, td { padding: 4px 16px 4px 0; text-align: left; border-bottom: 1px solid var(--line); }
  th { font-size: 12px; color: var(--muted); font-weight: 500; }
  .progress { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; margin-top: 12px; }
  .progress div { height: 100%; background: var(--accent); transition: width .2s; }
</style>
