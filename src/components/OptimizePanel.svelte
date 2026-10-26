<script>
  import { planner, applyBuild } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { optimizeEquipment, optimizeSkills, evaluateBuild } from '../lib/compute.js';
  import { ALL_SKILLS, FIGHT_SKILLS, ECONOMY_SKILLS } from '../engine/inputs.js';
  import { fmt, fmtDamage, periodLabel } from '../lib/format.js';
  import { itemLabel, SLOT_NAMES } from '../lib/market.js';

  let { data, current } = $props();

  const NAMES = {
    attack: 'Attack', precision: 'Precision', criticalChance: 'Crit chance', criticalDamages: 'Crit damage', armor: 'Armor',
    dodge: 'Dodge', health: 'Health', lootChance: 'Loot chance', hunger: 'Hunger',
    production: 'Production', energy: 'Energy', entrepreneurship: 'Entrepreneurship', companies: 'Companies', management: 'Management',
  };

  // ── Equipment ──
  let target = $state('');
  let gear = $state(null);
  let gearBusy = $state(false);

  async function runGear() {
    const damage = parseDamage(target) ?? current?.damage;
    if (!damage) return;
    gearBusy = true;
    gear = null;
    try {
      gear = await optimizeEquipment(data.market, planner, settings, damage);
    } catch (err) {
      gear = { error: err.message };
    } finally {
      gearBusy = false;
    }
  }

  function applyGear() {
    applyBuild(gear.equipment, gear.food);
    gear = null;
  }

  const gearText = (equipment) => Object.entries(equipment ?? {})
    .filter(([, it]) => it)
    .map(([slot, it]) => (typeof it === 'string' ? itemLabel(it) : `${SLOT_NAMES[slot]}: ${itemLabel(it.code)} ${Object.values(it.skills ?? {}).join('/')}`))
    .join(' · ');

  // ── Skills ──
  let min = $state('');
  let max = $state('');
  let keepEconomy = $state(true);
  let skillsBusy = $state(false);
  let progress = $state(null);
  let found = $state(null);
  let controller = null;

  /** "1.8m", "1800k" or "1800000" → 1800000. */
  function parseDamage(text) {
    const m = String(text).trim().toLowerCase().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([km]?)$/);
    if (!m) return null;
    return Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1);
  }

  async function runSkills() {
    skillsBusy = true;
    found = null;
    progress = null;
    controller = new AbortController();
    try {
      let lo = parseDamage(min);
      let hi = parseDamage(max);
      if (!lo || !hi) {
        // Default range: around the planned build's full-day damage.
        const daily = await evaluateBuild(data.market, planner, { ...settings, windowHours: 24 });
        if (daily.error) throw new Error(`Set a damage range: ${daily.error}`);
        lo = daily.damage * 0.9;
        hi = daily.damage * 1.15;
        min = fmtDamage(lo);
        max = fmtDamage(hi);
      }
      found = await optimizeSkills(data.market, planner, settings, {
        min: Math.min(lo, hi), max: Math.max(lo, hi), keepEconomy,
        // { evaluations, bestMeanDailyNetCost, elapsedMs }; the search stops at 45 s at the latest.
        onProgress: (p) => { progress = p ?? progress; },
        signal: controller.signal,
      });
    } catch (err) {
      found = { error: err.message };
    } finally {
      skillsBusy = false;
      controller = null;
    }
  }

  function applySkills() {
    for (const s of ALL_SKILLS) planner.skills[s] = found.skills[s];
    found = null;
  }

  const changed = $derived(found?.skills ? ALL_SKILLS.filter((s) => found.skills[s] !== planner.skills[s]) : []);
</script>

<section class="card" aria-labelledby="opt-gear-title">
  <h2 id="opt-gear-title">Optimize equipment</h2>
  <form class="line" onsubmit={(e) => { e.preventDefault(); runGear(); }}>
    <label>
      <span>Damage target {periodLabel(settings)}</span>
      <input bind:value={target} placeholder={current?.damage ? fmtDamage(current.damage) : 'e.g. 1.5m'} inputmode="decimal" />
    </label>
    <button disabled={gearBusy}>{gearBusy ? 'Optimizing…' : 'Cheapest gear'}</button>
  </form>
  <p class="hint muted">Finds the cheapest gear{settings.food === 'any' ? ' and food' : ''} that reaches the target with your skills. Empty target: your current damage.</p>
  {#if gear?.error}
    <p class="error">{gear.error}</p>
  {:else if gear}
    <div class="found">
      <p>
        <strong>{fmtDamage(gear.damage)}</strong> for <strong>{fmt(gear.cost, 1)} G</strong>
        {#if current && !current.error}<span class="muted">({gear.cost >= current.cost ? '+' : ''}{fmt(gear.cost - current.cost, 1)} G vs now)</span>{/if}
        {#if !gear.reachedTarget}<span class="error"> · the target is out of reach; this is the strongest build</span>{/if}
      </p>
      <p class="muted small">{gearText(gear.equipment)} · {itemLabel(gear.food ?? 'none')}</p>
      <button onclick={applyGear}>Apply this gear</button>
    </div>
  {/if}
</section>

<section class="card" aria-labelledby="opt-skills-title">
  <h2 id="opt-skills-title">Optimize skills</h2>
  <form class="line" onsubmit={(e) => { e.preventDefault(); runSkills(); }}>
    <label><span>Daily damage from</span><input bind:value={min} placeholder="auto" inputmode="decimal" /></label>
    <label><span>to</span><input bind:value={max} placeholder="auto" inputmode="decimal" /></label>
    <label class="check"><input type="checkbox" bind:checked={keepEconomy} /> Keep economy skills</label>
    {#if skillsBusy}
      <button type="button" class="secondary" onclick={() => controller?.abort()}>Cancel</button>
    {:else}
      <button>Find best skills</button>
    {/if}
  </form>
  <p class="hint muted">
    Spreads your skill points for the lowest cost across the range, with gear bought at market prices{keepEconomy ? '' : ' and your company income counted'}.
    Uses the full-day model. Takes up to 45 seconds.
  </p>
  {#if skillsBusy}
    {@const share = Math.min(1, (progress?.elapsedMs ?? 0) / 45000)}
    <div class="progress" role="progressbar" aria-label="Skill search time" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(share * 100)}>
      <div style="width: {Math.round(share * 100)}%"></div>
    </div>
    <p class="muted small" aria-live="polite">
      {#if progress?.evaluations}{fmt(progress.evaluations)} layouts checked{#if Number.isFinite(progress.bestMeanDailyNetCost)}{' · '}best average cost so far {fmt(progress.bestMeanDailyNetCost, 1)} G per day{/if}{:else}Loading your companies and starting…{/if}
    </p>
  {/if}
  {#if found?.error}
    <p class="error">{found.error}</p>
  {:else if found}
    <div class="found">
      {#if !changed.length}
        <p class="good">Your current skills are already the best layout for this range.</p>
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
        <p class="muted small">
          {#if found.hadEconomy}Income with this layout: {fmt(found.income, 1)} G per day. {/if}
          {#if found.elapsedMs >= 44000}The search hit its 45-second limit; running it again may find a slightly better layout.{/if}
        </p>
        <button onclick={applySkills}>Apply these skills</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .line { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  label.check { flex-direction: row; align-items: center; gap: 6px; font-size: 14px; color: var(--text); min-height: 36px; }
  input:not([type='checkbox']) {
    background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm);
    padding: 7px 10px; width: 140px; color: var(--text);
  }
  button {
    background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius-sm);
    padding: 9px 16px; font-weight: 600; cursor: pointer; min-height: 36px;
  }
  button:disabled { opacity: .6; cursor: default; }
  button.secondary { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); }
  .hint { font-size: 13px; margin: 8px 0 0; }
  .found { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
  .found p { margin: 0 0 8px; }
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
