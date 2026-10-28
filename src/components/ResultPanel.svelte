<script>
  /**
   * The build summary, sticky at the top of the planner: damage, cost and cost
   * per 1k for the planned build, recalculated as you edit, with one-click
   * improvements (stronger for the same cost, cheaper for the same damage)
   * and the optimizer buttons.
   */
  import { planner, applyBuild } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { evaluateBuild, findHints } from '../lib/compute.js';
  import { fmt, fmtDamage, periodLabel } from '../lib/format.js';
  import Icon from './Icon.svelte';
  import { mdiArrowUpBold, mdiArrowDownBold, mdiTshirtCrew, mdiSchool, mdiCheckCircle, mdiLinkVariant, mdiContentSave } from '@mdi/js';
  import { shareLink } from '../lib/share.js';
  import { saveBuild } from '../lib/saved.svelte.js';
  import { itemLabel } from '../lib/market.js';
  import { statText } from '../lib/visual.js';
  import { navigate } from '../lib/route.svelte.js';
  import Dialog from './Dialog.svelte';

  let { data, onresult, onoptimize } = $props();

  let result = $state(null);
  let hints = $state({ cheaper: null, stronger: null, loading: false });
  let busy = $state(false);
  let seq = 0;

  // Recalculate shortly after the last edit; answers to older edits are dropped.
  $effect(() => {
    JSON.stringify([planner.skills, planner.gear, planner.food, planner.debuff, planner.player?.id, settings]);
    const id = ++seq;
    busy = true;
    const timer = setTimeout(() => run(id), 200);
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

  // What a hint changes against the planned build, so applying it is never a surprise.
  const SLOTS = ['weapon', 'helmet', 'chest', 'pants', 'boots', 'gloves'];
  const rollText = (r, slot) => (r?.code ? `${itemLabel(r.code)} ${Object.entries(r.skills ?? {}).map(([k, v]) => statText(k, v)).join('/')}` : `no ${slot}`);
  function changesOf(hint) {
    const out = [];
    for (const slot of SLOTS) {
      const a = planner.gear[slot], b = hint.equipment[slot];
      if ((a?.code ?? null) === (b?.code ?? null) && JSON.stringify(a?.skills ?? {}) === JSON.stringify(b?.skills ?? {})) continue;
      out.push(`${rollText(a, slot)} → ${rollText(b, slot)}`);
    }
    if ((planner.gear.ammo ?? null) !== (hint.equipment.ammo ?? null)) out.push(`${planner.gear.ammo ? itemLabel(planner.gear.ammo) : 'no ammo'} → ${hint.equipment.ammo ? itemLabel(hint.equipment.ammo) : 'no ammo'}`);
    if ((planner.food ?? 'none') !== (hint.food ?? 'none')) out.push(`Food ${hint.food && hint.food !== 'none' ? itemLabel(hint.food) : 'none'}`);
    const d = hint.details, r = result?.details;
    if (d && r) out.push(`ARM ${r.armor}% → ${d.armor}%, DDG ${r.dodge}% → ${d.dodge}%, ${Math.round(r.swings)} → ${Math.round(d.swings)} hits`);
    return out;
  }

  // Saving: a name suggested from the weapon, damage and cost.
  let saving = $state(false);
  let saveName = $state('');
  let justSaved = $state(null);
  function startSave() {
    const weapon = planner.gear.weapon?.code;
    saveName = [weapon ? itemLabel(weapon) : null, result && !result.error ? `${fmtDamage(result.damage)} · ${fmt(result.cost, 0)} G` : null].filter(Boolean).join(' · ');
    justSaved = null;
    saving = true;
  }
  function confirmSave(event) {
    event.preventDefault();
    justSaved = saveBuild(saveName, planner, settings, result && !result.error ? result : null);
  }

  let copied = $state(false);
  async function copyLink() {
    const link = shareLink(planner, settings);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('Copy this link:', link);
    }
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  const per1k = $derived(result && !result.error && result.damage > 0 ? (result.cost / result.damage) * 1000 : NaN);
</script>

<section class="summary" aria-labelledby="result-title" aria-busy={busy}>
  <h2 id="result-title" class="visually-hidden">Damage and cost</h2>
  <div class="numbers" class:stale={busy}>
    {#if !result}
      <p class="muted">Calculating…</p>
    {:else if result.error}
      <p class="error" role="status">{result.error}</p>
    {:else}
      <div class="big"><span class="label">Damage {periodLabel(settings)}</span><span class="value num">{fmtDamage(result.damage)}</span></div>
      <div class="big"><span class="label">Cost</span><span class="value num">{fmt(result.cost, 1)} <small>G</small></span></div>
      <div class="big"><span class="label">Per 1k damage</span><span class="value num">{fmt(per1k, 3)} <small>G</small></span></div>
      {#if result.details}
        <div class="chips" aria-label="Fight details">
          <span title="Hits in the fight">{fmt(result.details.swings, 0)} hits</span>
          <span title="Armor: less health lost per hit (breakpoints in whole percents)">ARM {result.details.armor}%</span>
          <span title="Dodge: chance a hit costs no health">DDG {result.details.dodge}%</span>
          <span title="Average damage per hit, the pill and the debuff included (damage ÷ hits)">{fmt(result.details.swings ? result.damage / result.details.swings : 0, 0)} / hit</span>
        </div>
      {/if}
    {/if}
  </div>

  <div class="hints" aria-live="polite">
    {#if result && !result.error}
      {#if hints.loading}
        <span class="chip muted">Checking for a better build…</span>
      {:else if !hints.cheaper && !hints.stronger}
        <span class="chip good"><Icon path={mdiCheckCircle} size={16} /> Best gear for this damage and cost</span>
      {:else}
        {#if hints.stronger}
          <button class="chip up" onclick={() => applyBuild(hints.stronger.equipment, hints.stronger.food, hints.stronger.debuff)}
            title="Apply: {fmtDamage(hints.stronger.damage)} for {fmt(hints.stronger.cost, 1)} G">
            <Icon path={mdiArrowUpBold} size={16} /> {fmtDamage(hints.stronger.damage - result.damage)} more damage, same cost
          </button>
        {/if}
        {#if hints.cheaper}
          <button class="chip down" onclick={() => applyBuild(hints.cheaper.equipment, hints.cheaper.food, hints.cheaper.debuff)}
            title="Apply: {fmtDamage(hints.cheaper.damage)} for {fmt(hints.cheaper.cost, 1)} G">
            <Icon path={mdiArrowDownBold} size={16} /> {fmt(result.cost - hints.cheaper.cost, 1)} G cheaper, same damage
          </button>
        {/if}
      {/if}
    {/if}
  </div>
  {#if result && !result.error && !hints.loading && (hints.stronger || hints.cheaper)}
    <div class="changes muted small">
      {#each [['More damage', hints.stronger], ['Cheaper', hints.cheaper]].filter(([, h]) => h) as [label, h] (label)}
        <p><strong>{label}:</strong> {changesOf(h).join(' · ')}</p>
      {/each}
    </div>
  {/if}

  <div class="actions">
    <button class="action" onclick={() => onoptimize?.('gear')}><Icon path={mdiTshirtCrew} size={18} /> Optimize gear</button>
    <button class="action" onclick={() => onoptimize?.('skills')}><Icon path={mdiSchool} size={18} /> Optimize skills</button>
    <button class="action ghost" onclick={startSave} title="Keep this build in this browser to load or compare later">
      <Icon path={mdiContentSave} size={18} /> Save
    </button>
    <button class="action ghost" onclick={copyLink} title="A link that opens exactly this build (no player name in it)">
      <Icon path={mdiLinkVariant} size={18} /> {copied ? 'Link copied' : 'Copy link'}
    </button>
  </div>
</section>

<Dialog bind:open={saving} title="Save this build">
  {#if justSaved}
    <p>Saved as <strong>{justSaved.name}</strong>. Saved builds stay in this browser.</p>
    <div class="row">
      <button class="action" onclick={() => { saving = false; navigate('/builds'); }}>See saved builds</button>
      <button class="action ghost" onclick={() => (saving = false)}>Keep planning</button>
    </div>
  {:else}
    <form class="row" onsubmit={confirmSave}>
      <label class="visually-hidden" for="save-name">Name</label>
      <input id="save-name" bind:value={saveName} placeholder="Name" maxlength="60" />
      <button class="action">Save</button>
    </form>
    <p class="muted small">Skills, gear, food and fight settings are saved, in this browser only.</p>
  {/if}
</Dialog>

<style>
  .summary {
    position: sticky; top: 0; z-index: 5;
    display: grid; grid-template-columns: 1fr auto; gap: 10px 16px; align-items: center;
    padding: 12px var(--gap);
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
  }
  .numbers { display: flex; flex-wrap: wrap; gap: 8px 28px; transition: opacity .15s; }
  .numbers.stale { opacity: .55; }
  .big { display: flex; flex-direction: column; }
  .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
  .value { font-size: 26px; font-weight: 700; line-height: 1.15; }
  .value small { font-size: 14px; color: var(--muted); font-weight: 500; }
  .changes { grid-column: 1 / -1; margin-top: -4px; }
  .changes p { margin: 2px 0; line-height: 1.4; }
  .hints { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; min-height: 30px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px;
    font-size: 13px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text);
  }
  button.chip { cursor: pointer; }
  .chip.up { border-color: var(--good); color: var(--good); }
  .chip.down { border-color: var(--info); color: var(--info); }
  .chip.good { color: var(--good); border-color: transparent; background: none; padding-left: 0; }
  button.chip:hover { background: color-mix(in srgb, currentColor 12%, var(--surface-2)); }
  .actions { grid-row: 1; grid-column: 2; display: flex; gap: 8px; }
  .action {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius-sm);
    padding: 9px 14px; font-weight: 600; cursor: pointer;
  }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .row input { flex: 1; min-width: 200px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px 10px; color: var(--text); }
  .small { font-size: 13px; }
  .action.ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); }
  .error { color: var(--bad); margin: 0; }
  @media (max-width: 700px) {
    .summary { grid-template-columns: 1fr; position: static; }
    .actions { grid-row: auto; grid-column: 1; }
    .action { flex: 1; justify-content: center; }
    .value { font-size: 22px; }
  }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; align-self: center; }
  .chips span { font-size: 12px; padding: 3px 8px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line); color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
