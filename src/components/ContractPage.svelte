<script>
  import { planner, applyBuild } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { navigate } from '../lib/route.svelte.js';
  import { collectBuilds, searchSkills, evaluate, frontier, incomeModel } from '../lib/contract.js';
  import { loadEconomy } from '../lib/compute.js';
  import { FIGHT_SKILLS, ECONOMY_SKILLS, ALL_SKILLS } from '../engine/inputs.js';
  import { fmt, fmtDamage, periodLabel } from '../lib/format.js';
  import { itemLabel } from '../lib/market.js';
  import PlayerCard from './PlayerCard.svelte';
  import GearStrip from './GearStrip.svelte';

  let { data } = $props();

  const NAMES = {
    attack: 'Attack', precision: 'Precision', criticalChance: 'Crit chance', criticalDamages: 'Crit damage', armor: 'Armor',
    dodge: 'Dodge', health: 'Health', lootChance: 'Loot chance', hunger: 'Hunger',
    production: 'Production', energy: 'Energy', entrepreneurship: 'Entrepreneurship', companies: 'Companies', management: 'Management',
  };

  // Contract terms, remembered in this browser.
  const KEY = 'contract.terms.v1';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } })();
  let terms = $state({ mode: 'skills', bounty: 0.08, poolLoot: 0.13, lose: '1', income: 0, sort: 'damage', show: 'frontier', ...saved });
  $effect(() => {
    const snapshot = JSON.stringify(terms);
    try { localStorage.setItem(KEY, snapshot); } catch {}
  });

  let running = $state(false);
  let status = $state('');
  let error = $state('');
  let progress = $state(0);
  let points = $state.raw([]);
  let search = $state.raw(null);
  let start = $state.raw(null);
  let controller = null;

  const maxLoss = $derived(String(terms.lose).trim() === '' ? Infinity : Math.max(0, Number(terms.lose) || 0));
  const contract = $derived({
    bounty: Number(terms.bounty) || 0,
    poolLoot: Number(terms.poolLoot) || 0,
    economy: (Number(terms.income) || 0) + (search?.incomeChange ?? 0),
  });

  async function run() {
    error = '';
    if (terms.mode !== 'gear' && !Number.isFinite(maxLoss)) { error = 'Set "Willing to lose" for the skill search: it needs a limit to aim for.'; return; }
    running = true;
    progress = 0;
    points = [];
    search = null;
    start = { ...planner.skills };
    controller = new AbortController();
    const began = Date.now();
    const secs = () => `${Math.round((Date.now() - began) / 1000)} s`;
    try {
      let levels = { ...planner.skills };
      if (terms.mode !== 'gear') {
        status = terms.mode === 'economy' ? 'Loading your companies for the income model…' : 'Searching skill layouts…';
        search = await searchSkills(data.market, planner, settings, {
          terms: contract, maxLoss, economySearch: terms.mode === 'economy', signal: controller.signal,
          onStep: (s) => {
            search = s;
            status = `Step ${s.step}: best so far ${s.best ? fmtDamage(s.best.damage) : 'nothing within the limit'} · ${s.checked} layouts checked · ${secs()}`;
          },
        });
        if (!search.best) throw new Error('No skill layout keeps the loss within the limit. Raise the bounty or the amount you are willing to lose.');
        levels = search.levels;
      }
      status = 'Listing builds for these skills…';
      points = await collectBuilds(data.market, planner, settings, levels, (share) => { progress = share; });
      status = `Done in ${secs()} · ${points.length} exact builds for ${terms.mode === 'gear' ? 'your planned' : 'the suggested'} skills.`;
    } catch (err) {
      error = err.message;
      status = '';
    } finally {
      running = false;
      controller = null;
    }
  }

  // Income model for the planned economy skills, offered as the income to enter.
  let modelled = $state(null);
  let modelBusy = $state(false);
  async function estimateIncome() {
    modelBusy = true;
    try {
      const income = incomeModel(data.market, planner, settings, await loadEconomy(planner.player.id, data.market.itemPrices));
      modelled = await income(planner.skills);
    } catch (err) {
      error = err.message;
    } finally {
      modelBusy = false;
    }
  }

  const visible = $derived.by(() => {
    const list = terms.show === 'food'
      ? Object.values(Object.groupBy(points, (p) => p.food)).flatMap(frontier)
      : frontier(points);
    return list.map((p) => evaluate(p, contract));
  });
  const allowed = $derived(visible.filter((b) => b.net >= -maxLoss - 1e-9));
  const bestNet = $derived(allowed.reduce((a, b) => (!a || b.net > a.net ? b : a), null));
  const strongest = $derived(allowed.reduce((a, b) => (!a || b.damage > a.damage ? b : a), null));
  const rows = $derived([...allowed].sort((a, b) =>
    terms.sort === 'damage' ? b.damage - a.damage : terms.sort === 'cost' ? a.cost - b.cost : b.net - a.net || b.damage - a.damage));

  function useInPlanner(build) {
    if (search?.levels) for (const s of ALL_SKILLS) planner.skills[s] = search.levels[s];
    applyBuild(build.equipment, build.food);
    navigate('/');
  }

  const signed = (n) => `${n >= 0 ? '+' : ''}${fmt(n, 1)}`;
  const skillRows = $derived(search && start ? [...FIGHT_SKILLS, ...(terms.mode === 'economy' ? ECONOMY_SKILLS : [])] : []);
</script>

<div class="contract">
  <section class="card guide" aria-label="How it works">
    <h2>Find the best build for a contract</h2>
    <ol>
      <li><strong>Load your player</strong> below, so the search starts from your skills.</li>
      <li><strong>Enter the contract:</strong> what it pays per 1k damage, the pool loot you expect, and how much you're willing to lose.</li>
      <li><strong>Press Optimize.</strong> You get the skills and gear with the most damage that stays within your loss.</li>
      <li><strong>Pick a build</strong> from the list and press "Use in planner" to fine-tune it.</li>
    </ol>
  </section>
  <PlayerCard />

  <section class="card" aria-labelledby="terms-title">
    <h2 id="terms-title">Contract</h2>
    <form class="terms" onsubmit={(e) => { e.preventDefault(); run(); }}>
      <label class="wide">
        <span>Optimize</span>
        <select bind:value={terms.mode}>
          <option value="skills">Skills + gear (keep economy skills)</option>
          <option value="economy">Skills + gear (search economy skills too)</option>
          <option value="gear">Gear only (planned skills)</option>
        </select>
      </label>
      <label><span>Bounty (G per 1k damage)</span><input type="number" step="0.01" min="0" bind:value={terms.bounty} /></label>
      <label><span>Pool loot (G per 1k damage)</span><input type="number" step="0.01" min="0" bind:value={terms.poolLoot} /></label>
      <label><span>Willing to lose (G)</span><input type="number" step="1" min="0" bind:value={terms.lose} placeholder="No limit" /></label>
      <label>
        <span>Economy income (G per day)</span>
        <input type="number" step="1" min="0" bind:value={terms.income} />
        {#if planner.player}
          {#if modelled != null}
            <button type="button" class="link" onclick={() => (terms.income = Math.round(modelled))}>Use modelled {fmt(modelled, 1)}</button>
          {:else}
            <button type="button" class="link" onclick={estimateIncome} disabled={modelBusy}>{modelBusy ? 'Estimating…' : 'Estimate from your companies'}</button>
          {/if}
        {/if}
      </label>
      <div class="actions">
        {#if running}
          <button type="button" class="secondary" onclick={() => controller?.abort()}>Stop after this step</button>
        {:else}
          <button>Optimize</button>
        {/if}
      </div>
    </form>
    <p class="hint muted">
      Net = (bounty + pool loot) × damage / 1000 + economy income − cost, {periodLabel(settings)} (fight window, pill, bonus and food come from the settings bar).
      Pool loot measured from battle data is about 0.12–0.16. The skill search starts from the skills in the planner.
    </p>
    {#if running && terms.mode === 'gear' || progress > 0 && progress < 1}
      <div class="progress" role="progressbar" aria-label="Listing builds" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
        <div style="width: {Math.round(progress * 100)}%"></div>
      </div>
    {/if}
    {#if status}<p class="status muted" aria-live="polite">{status}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>

  {#if search}
    <section class="card" aria-labelledby="layout-title">
      <h2 id="layout-title">Suggested skills</h2>
      <dl class="summary">
        <div><dt>Most damage within the limit</dt><dd class="num">{search.best ? fmtDamage(search.best.damage) : '–'}</dd></div>
        <div><dt>Its net</dt><dd class="num" class:pos={search.best?.net >= 0} class:neg={search.best?.net < 0}>{search.best ? signed(search.best.net) : '–'}</dd></div>
        {#if terms.mode === 'economy'}<div><dt>Income change per day</dt><dd class="num">{signed(search.incomeChange)}</dd></div>{/if}
        <div><dt>Skill points</dt><dd class="num">{search.used} / {search.budget}</dd></div>
        <div><dt>Layouts checked</dt><dd class="num">{search.checked}</dd></div>
      </dl>
      <table class="skills">
        <thead><tr><th>Skill</th><th>Planned</th><th>Suggested</th></tr></thead>
        <tbody>
          {#each skillRows as s (s)}
            {@const d = search.levels[s] - start[s]}
            <tr class:changed={d !== 0}>
              <td>{NAMES[s]}</td><td class="num">{start[s]}</td>
              <td class="num"><strong>{search.levels[s]}</strong>{#if d} <span class={d > 0 ? 'pos' : 'neg'}>({d > 0 ? '+' : ''}{d})</span>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  {#if points.length}
    <section class="card" aria-labelledby="builds-title">
      <div class="toolbar">
        <h2 id="builds-title">Builds</h2>
        <label><span>Sort</span>
          <select bind:value={terms.sort}><option value="damage">Most damage</option><option value="net">Best net</option><option value="cost">Cheapest</option></select>
        </label>
        <label><span>Show</span>
          <select bind:value={terms.show}><option value="frontier">Best builds</option><option value="food">Best per food</option></select>
        </label>
      </div>
      <dl class="summary">
        <div><dt>Builds within the limit</dt><dd class="num">{allowed.length} <small class="muted">of {visible.length}</small></dd></div>
        <div><dt>Most damage within the limit</dt><dd class="num">{strongest ? fmtDamage(strongest.damage) : '–'}</dd></div>
        <div><dt>Best net</dt><dd class="num">{bestNet ? signed(bestNet.net) : '–'} {#if bestNet}<small class="muted">at {fmtDamage(bestNet.damage)}</small>{/if}</dd></div>
      </dl>
      <div class="scroll">
        <table class="builds">
          <thead><tr>
            <th>Damage</th><th>Cost</th><th>Bounty + loot</th><th>Net</th><th title="Bounty rate at which this build breaks even">Break-even / 1k</th><th>Gear</th><th></th>
          </tr></thead>
          <tbody>
            {#each rows as b (b)}
              <tr class:best={b === strongest || b === bestNet}>
                <td class="num">
                  {fmtDamage(b.damage)}
                  {#if b === strongest}<span class="tag">most damage</span>{/if}
                  {#if b === bestNet}<span class="tag">best net</span>{/if}
                </td>
                <td class="num">{fmt(b.cost, 1)}</td>
                <td class="num">{fmt(b.income, 1)}</td>
                <td class="num" class:pos={b.net >= 0} class:neg={b.net < 0}>{signed(b.net)}</td>
                <td class="num">{fmt(b.breakEven, 3)}</td>
                <td class="gear"><GearStrip equipment={b.equipment} food={b.food} items={data.market.gameConfigItems} /></td>
                <td><button class="secondary small" onclick={() => useInPlanner(b)}>Use in planner</button></td>
              </tr>
            {:else}
              <tr><td colspan="7" class="muted">No build stays within {fmt(maxLoss)} G lost at these terms. Raise the bounty or the amount you are willing to lose.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

<style>
  .contract { display: grid; gap: var(--gap); max-width: 1280px; margin: 0 auto; padding: var(--gap); }
  .guide h2 { text-transform: none; letter-spacing: 0; font-size: 16px; color: var(--text); margin-bottom: 8px; }
  .guide ol { margin: 0; padding-left: 20px; display: grid; gap: 4px; color: var(--muted); }
  .guide strong { color: var(--text); font-weight: 600; }
  .terms { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; align-items: end; }
  .terms .wide { grid-column: span 2; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  input, select {
    background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm);
    padding: 7px 10px; min-height: 36px; color: var(--text); font-size: 14px;
  }
  button {
    background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius-sm);
    padding: 9px 16px; font-weight: 600; cursor: pointer; min-height: 36px;
  }
  button.secondary { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); font-weight: 500; }
  button.small { padding: 5px 10px; min-height: 0; font-size: 13px; }
  button.link { background: none; color: var(--info); padding: 2px 0; min-height: 0; font-weight: 400; text-align: left; font-size: 12px; }
  button:disabled { opacity: .6; cursor: default; }
  .hint { font-size: 13px; margin: 10px 0 0; }
  .status { margin: 8px 0 0; }
  .error { color: var(--bad); margin: 8px 0 0; }
  .progress { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; margin-top: 10px; }
  .progress div { height: 100%; background: var(--accent); transition: width .15s; }
  .summary { display: flex; flex-wrap: wrap; gap: 12px 28px; margin: 0 0 12px; }
  .summary dt { color: var(--muted); font-size: 12px; }
  .summary dd { margin: 2px 0 0; font-size: 20px; font-weight: 600; }
  .pos { color: var(--good); }
  .neg { color: var(--bad); }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 7px 10px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
  th { color: var(--muted); font-size: 12px; font-weight: 500; position: sticky; top: 0; background: var(--surface); }
  th:first-child, td:first-child { text-align: left; }
  .skills { max-width: 420px; }
  .skills tr:not(.changed) td { color: var(--muted); }
  td.gear { text-align: left; }
  td.gear :global(.strip) { flex-wrap: nowrap; }
  tr.best td { background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .tag { display: inline-block; margin-left: 6px; font-size: 11px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--accent); color: var(--accent); }
  .toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin-bottom: 12px; }
  .toolbar h2 { margin: 0 auto 0 0; }
  .scroll { overflow: auto; max-height: 70vh; }
  @media (max-width: 520px) { .terms .wide { grid-column: auto; } }
</style>
