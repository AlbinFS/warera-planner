<script>
  /**
   * Saved builds and side-by-side comparison. Both compared builds are
   * recalculated with the settings bar, so the comparison is like for like.
   */
  import { planner, applyState } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { saved, renameBuild, deleteBuild, stateOf } from '../lib/saved.svelte.js';
  import { evaluateBuild } from '../lib/compute.js';
  import { navigate } from '../lib/route.svelte.js';
  import { fmt, fmtDamage, periodLabel } from '../lib/format.js';
  import { FIGHT_SKILLS, ECONOMY_SKILLS, skillValue } from '../engine/inputs.js';
  import { SKILLS } from '../lib/visual.js';
  import GearStrip from './GearStrip.svelte';
  import Icon from './Icon.svelte';
  import { mdiPencil, mdiDelete, mdiOpenInApp, mdiScaleBalance } from '@mdi/js';

  let { data } = $props();
  const items = $derived(data.market.gameConfigItems);

  const CURRENT = 'current';
  let picked = $state([]); // up to two ids, CURRENT for the planner's build
  let editing = $state(null);
  let editName = $state('');

  const stateFor = (id) => (id === CURRENT ? planner : stateOf(saved.builds.find((b) => b.id === id)));
  const nameFor = (id) => (id === CURRENT ? 'Planner build (now)' : saved.builds.find((b) => b.id === id)?.name ?? '');

  function pick(id) {
    if (picked.includes(id)) picked = picked.filter((x) => x !== id);
    else picked = [...picked, id].slice(-2);
  }

  function load(build) {
    applyState(stateOf(build), build.name);
    navigate('/');
  }

  function remove(build) {
    if (!confirm(`Delete "${build.name}"?`)) return;
    picked = picked.filter((x) => x !== build.id);
    deleteBuild(build.id);
  }

  // Recalculate the compared builds whenever the choice or the settings change.
  let results = $state([]);
  let comparing = $state(false);
  let seq = 0;
  $effect(() => {
    const ids = [...picked];
    JSON.stringify([settings, ids.includes(CURRENT) ? [planner.skills, planner.gear, planner.food] : null]);
    if (ids.length < 2) { results = []; return; }
    const id = ++seq;
    comparing = true;
    Promise.all(ids.map((x) => evaluateBuild(data.market, stateFor(x), settings).catch((err) => ({ error: err.message }))))
      .then((r) => { if (id === seq) { results = r; comparing = false; } });
  });

  const per1k = (r) => (r && !r.error && r.damage > 0 ? (r.cost / r.damage) * 1000 : NaN);
  const diff = (a, b, digits, damage) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
    const d = b - a;
    if (Math.abs(d) < 10 ** -digits / 2) return '=';
    return `${d > 0 ? '+' : ''}${damage ? fmtDamage(d) : fmt(d, digits)}`;
  };

  const skillText = (state, s) => {
    const v = skillValue(data.market.gameConfigSkills[s], state.skills[s] ?? 0, state.player?.prestige?.[s] ?? 0);
    return SKILLS[s].percent ? `${Math.round(v)}%` : Math.round(v * 10) / 10;
  };
  const when = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
</script>

<div class="page">
  <section class="card intro">
    <h2>Saved builds</h2>
    <p class="muted">Save builds from the planner with <strong>Save</strong>. They stay in this browser. Tick two builds (or your current planner build) to compare them side by side.</p>
  </section>

  <section class="list" aria-label="Builds">
    <article class="build current" class:picked={picked.includes(CURRENT)}>
      <label class="pick"><input type="checkbox" checked={picked.includes(CURRENT)} onchange={() => pick(CURRENT)} /> Compare</label>
      <h3>Planner build (now)</h3>
      <p class="muted small">Whatever is in the planner right now.</p>
      <GearStrip equipment={planner.gear} food={planner.food} {items} />
    </article>

    {#each saved.builds as b (b.id)}
      <article class="build" class:picked={picked.includes(b.id)}>
        <label class="pick"><input type="checkbox" checked={picked.includes(b.id)} onchange={() => pick(b.id)} /> Compare</label>
        {#if editing === b.id}
          <form class="rename" onsubmit={(e) => { e.preventDefault(); renameBuild(b.id, editName); editing = null; }}>
            <input bind:value={editName} maxlength="60" aria-label="New name" />
            <button>OK</button>
          </form>
        {:else}
          <h3>{b.name}</h3>
        {/if}
        <p class="muted small">
          Saved {when(b.savedAt)}{#if b.damage != null}{' · '}{fmtDamage(b.damage)} for {fmt(b.cost, 1)} G ({b.windowHours === 24 ? 'full day' : `${b.windowHours} h window`}){/if}
        </p>
        <GearStrip equipment={stateOf(b)?.gear} food={stateOf(b)?.food} {items} />
        <div class="buttons">
          <button class="primary" onclick={() => load(b)}><Icon path={mdiOpenInApp} size={16} /> Open in planner</button>
          <button class="ghost" onclick={() => { editing = b.id; editName = b.name; }} aria-label="Rename {b.name}"><Icon path={mdiPencil} size={16} /></button>
          <button class="ghost" onclick={() => remove(b)} aria-label="Delete {b.name}"><Icon path={mdiDelete} size={16} /></button>
        </div>
      </article>
    {:else}
      <p class="muted empty">No saved builds yet. In the planner, press <strong>Save</strong> to keep a build here.</p>
    {/each}
  </section>

  {#if picked.length === 2}
    {@const [a, b] = picked.map(stateFor)}
    {@const [ra, rb] = results}
    <section class="card compare" aria-labelledby="compare-title" aria-busy={comparing}>
      <h2 id="compare-title"><Icon path={mdiScaleBalance} size={16} /> Comparison <span class="muted note">both {periodLabel(settings)}, with the settings bar above</span></h2>
      <div class="scroll">
        <table class:stale={comparing}>
          <thead>
            <tr><th></th><th>{nameFor(picked[0])}</th><th>{nameFor(picked[1])}</th><th>Difference</th></tr>
          </thead>
          <tbody>
            <tr class="big"><th>Damage</th><td>{ra?.error ?? fmtDamage(ra?.damage)}</td><td>{rb?.error ?? fmtDamage(rb?.damage)}</td><td class="d">{diff(ra?.damage, rb?.damage, 0, true)}</td></tr>
            <tr class="big"><th>Cost</th><td>{fmt(ra?.cost, 1)} G</td><td>{fmt(rb?.cost, 1)} G</td><td class="d">{diff(ra?.cost, rb?.cost, 1)}</td></tr>
            <tr><th>Per 1k damage</th><td>{fmt(per1k(ra), 3)}</td><td>{fmt(per1k(rb), 3)}</td><td class="d">{diff(per1k(ra), per1k(rb), 3)}</td></tr>
            <tr><th>Gear</th>
              <td><GearStrip equipment={a.gear} food={a.food} {items} /></td>
              <td><GearStrip equipment={b.gear} food={b.food} {items} /></td><td></td></tr>
            {#each [...FIGHT_SKILLS, ...ECONOMY_SKILLS.filter((s) => (a.skills[s] ?? 0) || (b.skills[s] ?? 0))] as s (s)}
              {@const same = (a.skills[s] ?? 0) === (b.skills[s] ?? 0)}
              <tr class:same>
                <th><span style:color={SKILLS[s].color}><Icon path={SKILLS[s].icon} size={14} /></span> {SKILLS[s].label}</th>
                <td>{skillText(a, s)} <span class="muted">(lvl {a.skills[s] ?? 0})</span></td>
                <td>{skillText(b, s)} <span class="muted">(lvl {b.skills[s] ?? 0})</span></td>
                <td class="d">{same ? '' : `${(b.skills[s] ?? 0) > (a.skills[s] ?? 0) ? '+' : ''}${(b.skills[s] ?? 0) - (a.skills[s] ?? 0)} lvl`}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {:else if picked.length === 1}
    <p class="muted hint">Tick one more build to compare.</p>
  {/if}
</div>

<style>
  .page { display: grid; gap: var(--gap); max-width: 1280px; margin: 0 auto; padding: var(--gap); }
  .intro h2 { text-transform: none; letter-spacing: 0; font-size: 16px; color: var(--text); margin-bottom: 6px; }
  .intro p { margin: 0; }
  .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .build {
    position: relative; display: grid; gap: 8px; align-content: start;
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px;
  }
  .build.picked { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .build.current { border-style: dashed; }
  .build h3 { margin: 0; font-size: 15px; padding-right: 90px; }
  .pick { position: absolute; top: 12px; right: 12px; display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: var(--muted); cursor: pointer; }
  .pick input { accent-color: var(--accent); }
  .small { font-size: 12px; margin: 0; }
  .buttons { display: flex; gap: 6px; }
  .buttons button, .rename button {
    display: inline-flex; align-items: center; gap: 6px; border-radius: var(--radius-sm); padding: 6px 10px; cursor: pointer; font-size: 13px;
  }
  .primary { background: var(--accent); color: var(--accent-ink); border: 0; font-weight: 600; }
  .ghost, .rename button { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); }
  .rename { display: flex; gap: 6px; padding-right: 90px; }
  .rename input { flex: 1; min-width: 0; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 8px; color: var(--text); }
  .empty { grid-column: 1 / -1; }
  .compare h2 { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .note { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; transition: opacity .15s; }
  table.stale { opacity: .55; }
  th, td { padding: 7px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
  thead th { font-size: 13px; color: var(--text); }
  tbody th { font-weight: 500; color: var(--muted); white-space: nowrap; }
  tr.big td { font-size: 18px; font-weight: 600; }
  tr.same td { color: var(--muted); }
  .d { color: var(--accent); font-weight: 600; white-space: nowrap; }
  .hint { margin: 0; }
</style>
