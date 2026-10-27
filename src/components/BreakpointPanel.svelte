<script>
  /**
   * Armor and dodge breakpoints for the planned build. Both work as
   * value / (value + 40) and the game applies whole percents, so only some
   * values matter: the ones that just reach a new percent.
   */
  import { planner } from '../lib/planner.svelte.js';
  import { playerStats, softCapPercent, breakpoint, HEALTH_COST } from '../combat/model.js';
  import { configOf } from '../combat/optimize.js';
  import Icon from './Icon.svelte';
  import { mdiShield, mdiRunFast } from '@mdi/js';

  let { data } = $props();

  const stats = $derived(playerStats(configOf(data.market), planner.skills, planner.player?.prestige ?? {}));
  const gearStat = (slots, k) => slots.reduce((t, s) => t + (planner.gear[s]?.skills?.[k] ?? 0), 0);
  const rows = $derived([
    { key: 'armor', label: 'Armor', icon: mdiShield, cap: stats.armorCap, skill: stats.armor, gear: gearStat(['chest', 'pants'], 'armor'), what: 'less health lost per hit' },
    { key: 'dodge', label: 'Dodge', icon: mdiRunFast, cap: stats.dodgeCap, skill: stats.dodge, gear: gearStat(['boots'], 'dodge'), what: 'chance a hit costs no health' },
  ].map((r) => {
    const value = r.skill + r.gear;
    const pct = softCapPercent(value, r.cap);
    const at = breakpoint(pct, r.cap);
    let next = value + 1;
    while (softCapPercent(next, r.cap) <= pct) next++;
    // Steps that exist (at low values one point can skip a percent), two below to three above.
    const steps = new Map();
    for (let p = Math.max(1, pct - 4); p < Math.min(100, pct + 8); p++) {
      const v = breakpoint(p, r.cap);
      steps.set(v, { pct: softCapPercent(v, r.cap), value: v });
    }
    const all = [...steps.values()].sort((a, b) => a.value - b.value);
    const here = Math.max(0, all.findIndex((s) => s.pct >= pct));
    const ladder = all.slice(Math.max(0, here - 2), here + 4);
    return { ...r, value, pct, waste: pct > 0 ? value - at : 0, toNext: next - value, nextPct: softCapPercent(next, r.cap), ladder };
  }));
  const armorPct = $derived(rows[0].pct);
  const dodgePct = $derived(rows[1].pct);
  const perHit = $derived(HEALTH_COST * (1 - armorPct / 100) * (1 - dodgePct / 100));
</script>

<section class="card" aria-labelledby="bp-title">
  <h2 id="bp-title">Breakpoints</h2>
  <p class="muted small">Armor and dodge count in whole percents: value ÷ (value + 40). Points between two steps do nothing; the optimizers only buy up to a step.</p>
  {#each rows as r (r.key)}
    <div class="row">
      <div class="head">
        <span class="name"><Icon path={r.icon} size={17} /> {r.label}</span>
        <strong class="num">{r.pct}%</strong>
        <span class="muted small">{r.value} ({r.skill} skill + {r.gear} gear) · {r.what}</span>
      </div>
      <div class="ladder" role="list" aria-label="{r.label} steps">
        {#each r.ladder as s (s.pct)}
          <span role="listitem" class="step" class:here={s.pct === r.pct} class:reached={s.pct < r.pct} title="{s.pct}% from {s.value} {r.key}">
            <b>{s.pct}%</b><small>{s.value}</small>
          </span>
        {/each}
      </div>
      <p class="small">
        {#if r.waste > 0}<span class="warn">{r.waste} point{r.waste > 1 ? 's' : ''} above the {r.pct}% step {r.waste > 1 ? 'do' : 'does'} nothing.</span>{:else if r.pct > 0}<span class="good">Exactly on the {r.pct}% step.</span>{/if}
        Next step ({r.nextPct}%): <strong>+{r.toNext}</strong> {r.key}.
      </p>
    </div>
  {/each}
  <p class="muted small">Health per hit: 10 × (1 − {armorPct}%) × (1 − {dodgePct}%) = <strong class="num">{perHit.toFixed(2)}</strong> on average.</p>
</section>

<style>
  .small { font-size: 12px; margin: 6px 0 0; }
  .row { padding: 10px 0; border-bottom: 1px solid var(--line); }
  .head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .name { display: inline-flex; align-items: center; gap: 6px; min-width: 80px; }
  .head strong { font-size: 18px; }
  .ladder { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .step { display: grid; justify-items: center; min-width: 46px; padding: 4px 6px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--surface-2); font-size: 12px; }
  .step small { color: var(--muted); }
  .step.reached { opacity: .55; }
  .step.here { border-color: var(--accent); box-shadow: inset 0 -2px var(--accent); }
  .warn { color: var(--accent); }
  .good { color: var(--good); }
</style>
