<script>
  import { planner, applyBuild } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { navigate } from '../lib/route.svelte.js';
  import { collectBuilds, searchSkills, evaluate, frontier, incomeModel } from '../lib/contract.js';
  import { FIGHT_SKILLS, ECONOMY_SKILLS, ALL_SKILLS } from '../engine/inputs.js';
  import { fmt, fmtDamage, periodLabel } from '../lib/format.js';
  import { itemLabel } from '../lib/market.js';
  import PlayerCard from './PlayerCard.svelte';
  import { cached } from '../lib/warera.js';
  import { loadContracts } from '../lib/unit.js';
  import GearStrip from './GearStrip.svelte';

  let { data } = $props();

  // Real contracts to fill the terms from: the player's unit's, then open auctions.
  let realContracts = $state.raw([]);
  let countryNames = $state.raw({});
  let pickedContract = $state('');
  $effect(() => {
    const id = planner.player?.id;
    if (!id) return;
    (async () => {
      const user = await cached('user.getUserById', { userId: id }, 60 * 1000).catch(() => null);
      const [mine, open, countries] = await Promise.all([
        user?.mu ? loadContracts(user.mu).catch(() => []) : [],
        cached('mercenaryContractAuction.getPaginatedAuctions', { status: 'active', limit: 50 }, 60 * 1000).then((r) => r.items ?? []).catch(() => []),
        cached('country.getAllCountries', {}, 60 * 60 * 1000).catch(() => []),
      ]);
      countryNames = Object.fromEntries((countries ?? []).map((c) => [c._id, c.name]));
      const seen = new Set(mine.map((c) => c._id));
      realContracts = [...mine.map((c) => ({ ...c, mine: true })), ...open.filter((c) => !seen.has(c._id)).sort((a, b) => b.currentPerK - a.currentPerK)];
    })();
  });
  const chosen = $derived(realContracts.find((c) => c._id === pickedContract) ?? null);
  function useContract(id) {
    pickedContract = id;
    const c = realContracts.find((x) => x._id === id);
    if (c) terms.bounty = Math.round(c.currentPerK * 1000) / 1000;
  }
  const contractText = (c) => `${c.mine ? 'Your unit: ' : 'Open auction: '}${fmt(c.currentPerK, 3)} G per 1k · min ${fmtDamage(c.minimumDamage)} · ${fmt(c.currentPayout, 0)} G · for ${countryNames[c.forCountry] ?? 'a country'}${c.battleActive === false ? ' · battle over' : ''}`;

  const NAMES = {
    attack: 'Attack', precision: 'Precision', criticalChance: 'Crit chance', criticalDamages: 'Crit damage', armor: 'Armor',
    dodge: 'Dodge', health: 'Health', lootChance: 'Loot chance', hunger: 'Hunger',
    production: 'Production', energy: 'Energy', entrepreneurship: 'Entrepreneurship', companies: 'Companies', management: 'Management', leadership: 'Leadership',
  };

  // Contract terms, remembered in this browser.
  const KEY = 'contract.terms.v1';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } })();
  let terms = $state({ mode: 'skills', bounty: 0.08, poolLoot: 0.13, lootMode: 'perK', lootItems: 3, lootRarity: 'epic', lose: '1', income: 0, sort: 'damage', show: 'frontier', ...saved });

  // Battle loot: equipment pieces dropped per fight, each worth the median market
  // price of that rarity's weapons and armour (every roll, from the trade history).
  const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const lootPrice = $derived.by(() => {
    const items = data.market.gameConfigItems;
    const byRarity = {};
    for (const r of data.market.equipmentMarketRolls) {
      const item = items[r.code];
      if (!item || (item.type !== 'equipment' && item.type !== 'weapon') || !(r.averagePrice > 0)) continue;
      (byRarity[item.rarity] ??= []).push(r.averagePrice);
    }
    return Object.fromEntries(Object.entries(byRarity).map(([k, v]) => [k, v.sort((a, b) => a - b)[v.length >> 1]]));
  });
  // Loot is counted one way: G per 1k damage, or a number of items per fight.
  const byItems = $derived(terms.lootMode === 'items');
  const loot = $derived(byItems ? Math.max(0, Number(terms.lootItems) || 0) * (lootPrice[terms.lootRarity] ?? 0) : 0);
  $effect(() => {
    const snapshot = JSON.stringify(terms);
    try { localStorage.setItem(KEY, snapshot); } catch {}
  });

  let running = $state(false);
  let status = $state('');
  let error = $state('');
  let progress = $state(0);
  // While running: which part, the latest step, and a ticking clock for the banner.
  let phase = $state('');
  let stepInfo = $state.raw(null);
  let elapsed = $state(0);
  let finished = $state('');
  let points = $state.raw([]);
  let search = $state.raw(null);
  let start = $state.raw(null);
  let controller = null;

  const maxLoss = $derived(String(terms.lose).trim() === '' ? Infinity : Math.max(0, Number(terms.lose) || 0));
  const contract = $derived({
    bounty: Number(terms.bounty) || 0,
    poolLoot: byItems ? 0 : Number(terms.poolLoot) || 0,
    loot,
    economy: (Number(terms.income) || 0) + (search?.incomeChange ?? 0),
  });

  async function run() {
    error = '';
    if (terms.mode !== 'gear' && !Number.isFinite(maxLoss)) { error = 'Set "Willing to lose" for the skill search: it needs a limit to aim for.'; return; }
    running = true;
    progress = 0;
    finished = '';
    stepInfo = null;
    elapsed = 0;
    points = [];
    search = null;
    start = { ...planner.skills };
    controller = new AbortController();
    const began = Date.now();
    const secs = () => `${Math.round((Date.now() - began) / 1000)} s`;
    const tick = setInterval(() => (elapsed = Math.round((Date.now() - began) / 1000)), 1000);
    const title = document.title;
    try {
      let levels = { ...planner.skills };
      if (terms.mode !== 'gear') {
        phase = terms.mode === 'economy' ? 'income' : 'skills';
        status = terms.mode === 'economy' ? 'Loading your companies for the income model…' : 'Searching skill layouts…';
        search = await searchSkills(data.market, planner, settings, {
          terms: contract, maxLoss, economySearch: terms.mode === 'economy', upgrades: data.upgrades, signal: controller.signal,
          onStep: (s) => {
            search = s;
            phase = 'skills';
            stepInfo = s;
            document.title = `Step ${s.step + 1} · optimizing…`;
            status = `Step ${s.step}: best so far ${s.best ? fmtDamage(s.best.damage) : 'nothing within the limit'} · ${s.checked} layouts checked · ${secs()}`;
          },
        });
        if (!search.best) throw new Error('No skill layout keeps the loss within the limit. Raise the bounty or the amount you are willing to lose.');
        levels = search.levels;
      }
      phase = 'builds';
      document.title = 'Listing builds · optimizing…';
      status = 'Listing builds for these skills…';
      points = await collectBuilds(data.market, planner, settings, levels, (share) => { progress = share; });
      status = `Done in ${secs()} · ${points.length} exact builds for ${terms.mode === 'gear' ? 'your planned' : 'the suggested'} skills.`;
      finished = status;
    } catch (err) {
      error = err.message;
      status = '';
    } finally {
      running = false;
      controller = null;
      phase = '';
      clearInterval(tick);
      document.title = title;
    }
  }

  // Income model for the planned economy skills, offered as the income to enter.
  let modelled = $state(null);
  let modelBusy = $state(false);
  async function estimateIncome({ quiet = false } = {}) {
    modelBusy = true;
    try {
      modelled = (await incomeModel(data.market, data.upgrades, planner))(planner.skills);
    } catch (err) {
      if (!quiet) error = err.message;
    } finally {
      modelBusy = false;
    }
  }
  // A loaded player's companies earn every day whatever the fight: estimate it, and use it
  // when no income has been typed in (other tools count it in the break-even too).
  let estimatedFor = null;
  $effect(() => {
    const id = planner.player?.id;
    if (!id || id === estimatedFor) return;
    estimatedFor = id;
    modelled = null;
    estimateIncome({ quiet: true }).then(() => {
      if (modelled != null && !(Number(terms.income) > 0)) terms.income = Math.round(modelled);
    });
  });

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

  const totalPoints = $derived((planner.player?.level ?? 1) * 4);
  const signed = (n) => `${n >= 0 ? '+' : ''}${fmt(n, 1)}`;
  // Every skill, economy too: kept ones still use points and count for income.
  const skillRows = $derived(search && start ? ALL_SKILLS : []);
</script>

<div class="contract">
  <section class="card guide" aria-label="How it works">
    <h2>Find the best build for a contract</h2>
    <ol>
      <li><strong>Load your player</strong> below. The search starts from the skills set on the Planner page, economy skills included.</li>
      <li><strong>Enter the contract:</strong> what it pays per 1k damage, the loot you expect (per 1k damage or as items per fight), and how much you're willing to lose.</li>
      <li><strong>Press Optimize.</strong> You get the skills and gear with the most damage that stays within your loss.</li>
      <li><strong>Pick a build</strong> from the list and press "Use in planner" to fine-tune it.</li>
    </ol>
  </section>
  <PlayerCard />

  <section class="card" aria-labelledby="terms-title">
    <h2 id="terms-title">Contract</h2>
    {#if realContracts.length}
      <label class="real">
        <span>Fill from a real contract</span>
        <select value={pickedContract} onchange={(e) => useContract(e.currentTarget.value)}>
          <option value="">Pick a contract (optional)</option>
          {#each realContracts as c (c._id)}<option value={c._id}>{contractText(c)}</option>{/each}
        </select>
        {#if chosen}<small class="muted">Bounty set to {fmt(chosen.currentPerK, 3)} G per 1k. The contract pays out up to {fmt(chosen.currentPayout, 0)} G when the unit reaches {fmtDamage(chosen.minimumDamage)} damage; see the Unit page for whether your unit can.</small>{/if}
      </label>
    {/if}
    <form class="terms" onsubmit={(e) => { e.preventDefault(); run(); }}>
      <label class="wide">
        <span>Optimize</span>
        <select bind:value={terms.mode}>
          <option value="skills">Skills + gear (keep economy skills)</option>
          <option value="economy">Skills + gear (search economy skills too)</option>
          <option value="gear">Gear only (planned skills)</option>
        </select>
      </label>
      <label><span>Bounty (G per 1k damage)</span><input type="number" step="0.001" min="0" bind:value={terms.bounty} /></label>
      <label>
        <span>Loot</span>
        <select bind:value={terms.lootMode} aria-label="How loot is counted">
          <option value="perK">G per 1k damage</option>
          <option value="items">Items {periodLabel(settings)}</option>
        </select>
        {#if byItems}
          <span class="loot">
            <input type="number" step="0.5" min="0" bind:value={terms.lootItems} aria-label="Loot items" />
            <select bind:value={terms.lootRarity} aria-label="Loot item rarity">
              {#each RARITIES as r (r)}<option value={r} disabled={!lootPrice[r]}>{r}</option>{/each}
            </select>
          </span>
          <small class="muted">{fmt(lootPrice[terms.lootRarity] ?? 0, 1)} G each · {fmt(loot, 1)} G in all, whatever the damage.</small>
        {:else}
          <input type="number" step="0.001" min="0" bind:value={terms.poolLoot} aria-label="Loot, G per 1k damage" />
          <small class="muted">Measured from battle data: about 0.12–0.16.</small>
        {/if}
      </label>
      <label><span>Willing to lose (G)</span><input type="number" step="1" min="0" bind:value={terms.lose} placeholder="No limit" /></label>
      <label>
        <span>Economy income (G per day)</span>
        <input type="number" step="1" min="0" bind:value={terms.income} />
        {#if planner.player}
          {#if modelled != null}
            {#if Math.round(modelled) !== Number(terms.income)}
              <button type="button" class="link" onclick={() => (terms.income = Math.round(modelled))}>Use modelled {fmt(modelled, 1)}</button>
            {:else}
              <small class="muted">Modelled from your companies</small>
            {/if}
          {:else}
            <button type="button" class="link" onclick={() => estimateIncome()} disabled={modelBusy}>{modelBusy ? 'Estimating…' : 'Estimate from your companies'}</button>
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
      Net = bounty × damage / 1000 + loot + economy income − cost, {periodLabel(settings)} (fight window, pill, bonus and food come from the settings bar).
      The skill search starts from the skills in the planner.
    </p>
    {#if running}
      <div class="running" role="status" aria-live="polite">
        <div class="run-head">
          <span class="spinner" aria-hidden="true"></span>
          <strong>
            {#if phase === 'builds'}Listing builds for {terms.mode === 'gear' ? 'your' : 'the suggested'} skills… {Math.round(progress * 100)}%
            {:else if phase === 'income'}Loading your companies for the income model…
            {:else if stepInfo?.seeding}Finding a starting layout…
            {:else}Optimizing skills{#if stepInfo}{' · '}step {stepInfo.step + 1}{/if}…{/if}
          </strong>
          <span class="clock num">{elapsed} s</span>
        </div>
        {#if phase === 'skills' && stepInfo}
          <div class="run-facts">
            <span>Best so far <strong class="num">{stepInfo.best ? fmtDamage(stepInfo.best.damage) : 'nothing within the limit'}</strong></span>
            <span><strong class="num">{stepInfo.checked}</strong> layouts checked</span>
            <span>Points <strong class="num">{stepInfo.used} / {stepInfo.budget}</strong></span>
          </div>
        {/if}
        <div class="bar" class:indeterminate={phase !== 'builds'}><div style:width={phase === 'builds' ? `${Math.round(progress * 100)}%` : null}></div></div>
        <p class="muted small">Still working: each step tries every one-level change (raise one skill, lower one or two to pay for it) with the best gear for each, and keeps the best, until no change helps. "Stop after this step" keeps the best so far.</p>
      </div>
    {:else if finished}
      <p class="done" role="status">✓ {finished}</p>
    {:else if status}<p class="status muted" aria-live="polite">{status}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>

  {#if search}
    <section class="card" aria-labelledby="layout-title">
      <h2 id="layout-title">Suggested skills</h2>
      <dl class="summary">
        <div><dt>Most damage within the limit</dt><dd class="num">{search.best ? fmtDamage(search.best.damage) : '–'}</dd>{#if Number.isFinite(maxLoss)}<small class="muted">losing at most {fmt(maxLoss, 0)} G {periodLabel(settings)}</small>{/if}</div>
        <div><dt>Its net</dt><dd class="num" class:pos={search.best?.net >= 0} class:neg={search.best?.net < 0}>{search.best ? signed(search.best.net) : '–'}</dd></div>
        {#if terms.mode === 'economy'}<div><dt>Income change per day</dt><dd class="num">{signed(search.incomeChange)}</dd></div>{/if}
        <div><dt>Skill points searched</dt><dd class="num">{search.used} / {search.budget}</dd>{#if totalPoints > search.budget}<small class="muted">{totalPoints - search.budget} more of your {totalPoints} are in kept economy skills</small>{/if}</div>
        {#if search.best?.armor != null}<div><dt>Armor · dodge</dt><dd class="num">{search.best.armor}% · {search.best.dodge}%</dd><small class="muted">on breakpoints</small></div>{/if}
        <div><dt>Layouts checked</dt><dd class="num">{search.checked}</dd></div>
      </dl>
      <table class="skills">
        <thead><tr><th>Skill</th><th>Planned</th><th>Suggested</th></tr></thead>
        <tbody>
          {#each skillRows as s (s)}
            {@const d = (search.levels[s] ?? 0) - (start[s] ?? 0)}
            <tr class:changed={d !== 0} class:eco-first={s === ECONOMY_SKILLS[0]}>
              <td>{NAMES[s]}{#if ECONOMY_SKILLS.includes(s) && terms.mode !== 'economy'} <small class="muted">kept</small>{/if}</td><td class="num">{start[s] ?? 0}</td>
              <td class="num"><strong>{search.levels[s] ?? 0}</strong>{#if d} <span class={d > 0 ? 'pos' : 'neg'}>({d > 0 ? '+' : ''}{d})</span>{/if}</td>
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
  .real { display: grid; gap: 4px; font-size: 12px; color: var(--muted); margin-bottom: 12px; max-width: 760px; }
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
  .running {
    margin-top: 14px; padding: 12px 14px; border-radius: var(--radius); border: 1px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface)); animation: glow 2s ease-in-out infinite;
  }
  @keyframes glow { 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); } }
  .run-head { display: flex; align-items: center; gap: 10px; font-size: 15px; }
  .run-head strong { flex: 1; }
  .clock { color: var(--muted); }
  .spinner { width: 18px; height: 18px; border-radius: 50%; border: 3px solid color-mix(in srgb, var(--accent) 30%, transparent); border-top-color: var(--accent); animation: spin .8s linear infinite; flex: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .run-facts { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 8px 0 0 28px; font-size: 13px; }
  .bar { height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; margin-top: 10px; position: relative; }
  .bar div { height: 100%; background: var(--accent); transition: width .15s; }
  .bar.indeterminate div { position: absolute; width: 35%; animation: slide 1.4s ease-in-out infinite; }
  @keyframes slide { from { left: -35%; } to { left: 100%; } }
  .running .small { font-size: 12px; margin: 8px 0 0; }
  .done { margin: 12px 0 0; color: var(--good); font-weight: 600; }
  @media (prefers-reduced-motion: reduce) { .running, .spinner, .bar.indeterminate div { animation: none; } }
  .summary { display: flex; flex-wrap: wrap; gap: 12px 28px; margin: 0 0 12px; }
  .summary dt { color: var(--muted); font-size: 12px; }
  .summary dd { margin: 2px 0 0; font-size: 20px; font-weight: 600; }
  .summary div { display: grid; }
  .summary small { font-size: 12px; }
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
  tr.eco-first td { border-top: 2px solid var(--line); }
  .loot { display: flex; gap: 6px; }
  .loot input { width: 70px; }
  .loot select { flex: 1; }
</style>
