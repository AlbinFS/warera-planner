<script>
  import { planner, applyBuild } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { evaluateBuild, findHints } from '../lib/compute.js';
  import { fmt, fmtDamage, periodLabel } from '../lib/format.js';

  let { data, onresult } = $props();

  let result = $state(null);
  let hints = $state({ cheaper: null, stronger: null, loading: false });
  let busy = $state(false);
  let seq = 0;

  // Recalculate shortly after the last edit; answers to older edits are dropped.
  $effect(() => {
    const snapshot = JSON.stringify([planner.skills, planner.gear, planner.food, planner.player?.id, settings]);
    const id = ++seq;
    busy = true;
    const timer = setTimeout(() => run(id, snapshot), 200);
    return () => clearTimeout(timer);
  });

  async function run(id) {
    try {
      const evaluated = await evaluateBuild(data.market, planner, settings);
      if (id !== seq) return;
      result = evaluated;
      busy = false;
      onresult?.(evaluated);
      hints = { cheaper: null, stronger: null, loading: !evaluated.error };
      if (evaluated.error) return;
      const found = await findHints(data.market, planner, settings, evaluated);
      if (id !== seq) return;
      hints = { ...found, loading: false };
    } catch (err) {
      if (id !== seq) return;
      result = { error: err.message };
      busy = false;
      hints = { cheaper: null, stronger: null, loading: false };
    }
  }

  const per1k = $derived(result && !result.error && result.damage > 0 ? (result.cost / result.damage) * 1000 : NaN);
</script>

<section class="card result" aria-labelledby="result-title" aria-busy={busy}>
  <h2 id="result-title">Damage and cost <span class="period">{periodLabel(settings)}</span></h2>
  {#if !result}
    <p class="muted">Calculating…</p>
  {:else if result.error}
    <p class="error" role="status">{result.error}</p>
  {:else}
    <dl class="stats" class:stale={busy}>
      <div><dt>Damage</dt><dd class="num">{fmtDamage(result.damage)}</dd></div>
      <div><dt>Cost</dt><dd class="num">{fmt(result.cost, 1)} G</dd></div>
      <div><dt>Cost per 1k damage</dt><dd class="num">{fmt(per1k, 3)} G</dd></div>
    </dl>
    <div class="hints" aria-live="polite">
      {#if hints.loading}
        <p class="muted">Looking for a cheaper or stronger build…</p>
      {:else if !hints.cheaper && !hints.stronger}
        <p class="good">No cheaper build with this damage, and no stronger one for this cost.</p>
      {:else}
        {#if hints.cheaper}
          <button class="hint" onclick={() => applyBuild(hints.cheaper.equipment, hints.cheaper.food)}>
            <strong>{fmt(result.cost - hints.cheaper.cost, 1)} G cheaper</strong> for the same damage
            <span class="muted">({fmtDamage(hints.cheaper.damage)} for {fmt(hints.cheaper.cost, 1)} G) · Apply</span>
          </button>
        {/if}
        {#if hints.stronger}
          <button class="hint" onclick={() => applyBuild(hints.stronger.equipment, hints.stronger.food)}>
            <strong>{fmtDamage(hints.stronger.damage - result.damage)} more damage</strong> for the same cost
            <span class="muted">({fmtDamage(hints.stronger.damage)} for {fmt(hints.stronger.cost, 1)} G) · Apply</span>
          </button>
        {/if}
      {/if}
    </div>
  {/if}
</section>

<style>
  .period { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 0; transition: opacity .15s; }
  .stats.stale { opacity: .55; }
  dt { color: var(--muted); font-size: 12px; }
  dd { margin: 2px 0 0; font-size: 22px; font-weight: 600; }
  .hints { margin-top: 14px; display: grid; gap: 8px; }
  .hints p { margin: 0; font-size: 14px; }
  .good { color: var(--good); }
  .error { color: var(--bad); }
  .hint {
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    cursor: pointer;
  }
  .hint:hover { background: color-mix(in srgb, var(--accent) 12%, var(--surface-2)); }
</style>
