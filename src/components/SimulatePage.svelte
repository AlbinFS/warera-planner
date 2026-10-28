<script>
  /**
   * Simulator: plays the planned build hit by hit, 5000 times, for an 8 h pill
   * window, a 16 h session or a full day (the hours after the pill in its
   * debuff, in the debuff build when the settings use one), and shows the
   * spread luck gives. Income (bounty, battle loot, company profit) is the
   * Planner's, from Hits and costs.
   */
  import { planner } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { lockedGear, suggestDebuff, payingHits } from '../lib/compute.js';
  import { setDebuff, playerStatus } from '../lib/planner.svelte.js';
  import { statText } from '../lib/visual.js';
  import { simulate, quantile, histogram } from '../combat/simulate.js';
  import { fmt, fmtDamage } from '../lib/format.js';
  import { itemLabel } from '../lib/market.js';
  import Icon from './Icon.svelte';
  import { mdiDice5, mdiPill } from '@mdi/js';
  import { fightIncome, incomeTerms, companyProfit, battleLoot } from '../lib/fightIncome.svelte.js';
  import { navigate } from '../lib/route.svelte.js';

  let { data } = $props();

  const KEY = 'simulate.v2';
  const RUNS = 5000;
  let session = $state((() => { try { return localStorage.getItem(KEY) ?? '8'; } catch { return '8'; } })());
  $effect(() => { const s = session; try { localStorage.setItem(KEY, s); } catch {} });

  const SESSIONS = [
    { id: '8', label: '8 hours', hint: 'Full bars, fighting through the pill’s 8 hours (regen included).' },
    { id: '16', label: '16 hours', hint: 'The pill’s 8 hours, then 8 more in its −60% debuff on regen: a day with 8 hours of sleep.' },
    { id: '24', label: '24 hours', hint: 'A full day: the pill’s 8 hours, its −60% debuff for 15.5 more, then half an hour at full strength, on regen.' },
  ];
  const withDebuffBuild = $derived(session !== '8' && settings.pill && settings.splitDebuff && !!planner.debuff);
  // "Debuff build" on but none set yet: suggest one (the one that pays for itself) before a run uses the pill gear.
  let suggesting = $state(false);
  $effect(() => {
    // Only once the player (their skills) has loaded: a suggestion for default skills is wrong.
    if (!settings.pill || !settings.splitDebuff || planner.debuff || suggesting || !planner.player || playerStatus.loading) return;
    suggesting = true;
    suggestDebuff(data.market, planner, settings, incomeTerms(data.market)).then((s) => { if (s) setDebuff(s); }).finally(() => (suggesting = false));
  });
  // Without a debuff build: how many hits in the pill gear still pay for themselves after the pill.
  let sameGearHits = $state(null);
  $effect(() => {
    if (settings.splitDebuff || !settings.pill || !planner.player || playerStatus.loading) { sameGearHits = null; return; }
    const gear = planner.gear, food = planner.food;
    payingHits(data.market, planner, settings, incomeTerms(data.market), { gear, food }).then((n) => (sameGearHits = n));
  });
  // A debuff build saved before it had a hit count: keep its gear, stop where its hits stop paying.
  $effect(() => {
    if (!planner.debuff || planner.debuff.hits !== undefined || !planner.player || playerStatus.loading) return;
    payingHits(data.market, planner, settings, incomeTerms(data.market)).then((n) => { if (planner.debuff && planner.debuff.hits === undefined) planner.debuff.hits = n; });
  });
  const debuffItems = $derived(planner.debuff && planner.debuff.hits !== 0
    ? [...(planner.debuff.gear.weapon ? [] : ['no weapon (bare hands)']), ...['weapon', 'ammo', 'helmet', 'chest', 'pants', 'boots', 'gloves'].map((slot) => planner.debuff.gear[slot]).filter(Boolean).map((g) => (typeof g === 'string' ? itemLabel(g) : `${itemLabel(g.code)} ${Object.entries(g.skills ?? {}).map(([k, v]) => statText(k, v)).join('/')}`)),
      planner.debuff.food && planner.debuff.food !== 'none' ? itemLabel(planner.debuff.food) : 'no food']
    : []);
  const terms = $derived(incomeTerms(data.market));

  let result = $state.raw(null);
  let error = $state('');
  let running = $state(false);
  function run() {
    error = '';
    running = true;
    // Let the button show its state before the (short) work starts.
    setTimeout(() => {
      try {
        const build = {
          levels: planner.skills, prestige: planner.player?.prestige ?? {}, militaryRankPercent: planner.player?.militaryRankPercent ?? 0,
          gear: lockedGear(data.market, planner.gear), food: planner.food && planner.food !== 'none' ? planner.food : null,
          // The debuff build, when the settings use one and it has been set; else the pill gear again,
          // stopped where its hits stop paying for themselves.
          debuff: settings.splitDebuff && planner.debuff
            ? { gear: lockedGear(data.market, planner.debuff.gear), food: planner.debuff.food && planner.debuff.food !== 'none' ? planner.debuff.food : null, hits: planner.debuff.hits ?? null }
            : sameGearHits != null && session !== '8' && settings.pill
              ? { gear: lockedGear(data.market, planner.gear), food: planner.food && planner.food !== 'none' ? planner.food : null, hits: sameGearHits, same: true }
              : null,
        };
        result = simulate(data.market, build, { pill: settings.pill, hours: Number(session) }, { battleBonusPercent: Number(settings.battleBonus) || 0, terms, runs: RUNS, seed: Date.now() % 1e9 });
      } catch (err) {
        console.error(err);
        error = err.message || String(err);
      } finally {
        running = false;
      }
    }, 20);
  }

  const q = (arr, p) => quantile(arr, p);
  const bars = $derived(result ? histogram(result.damage, 32) : []);
  const tallest = $derived(Math.max(1, ...bars.map((b) => b.n)));
  const median = $derived(result ? q(result.damage, 0.5) : 0);
  const p05 = $derived(result ? q(result.damage, 0.05) : 0);
  let hover = $state(-1);
  const costTotal = $derived(result ? Object.values(result.avg.costs).reduce((a, b) => a + b, 0) : 0);
  const incomeTotal = $derived(result ? Object.values(result.avg.income).reduce((a, b) => a + b, 0) : 0);
  const signed = (n) => `${n >= 0 ? '+' : ''}${fmt(n, 1)}`;
</script>

<div class="page">
  <section class="card">
    <h2><Icon path={mdiDice5} size={20} /> Simulator</h2>
    <p class="muted">Plays the build on the Overview & MinMax page hit by hit, many times, so you see what luck does: misses (half damage), crits, dodges and case drops are rolled every swing.
      Pill: <strong>{settings.pill ? 'on' : 'off'}</strong> and bonus <strong>{settings.battleBonus}%</strong>, from the settings bar.</p>
    <div class="tabs" role="tablist" aria-label="How long">
      {#each SESSIONS as s (s.id)}
        <button role="tab" aria-selected={session === s.id} title={s.hint} onclick={() => { session = s.id; run(); }}>{s.label}</button>
      {/each}
    </div>
    <p class="muted small">
      {SESSIONS.find((s) => s.id === session)?.hint}
      {#if session !== '8' && settings.pill}{withDebuffBuild ? ' The debuff hours are fought in your debuff build (below).' : settings.splitDebuff ? ' Finding a debuff build…' : ''}{/if}
    </p>
    {#if session !== '8' && settings.pill && !settings.splitDebuff}
      <p class="debuff-box small">
        <span class="tag debuff">After the pill</span>
        {#if sameGearHits === 0}Not fighting: at −60 % no hit in your pill gear pays for itself.
        {:else if sameGearHits != null}In your pill gear, <strong>stopping after {sameGearHits} hits</strong> (more lose gold).
        {:else}Working out where your pill gear stops paying…{/if}
        Cheap debuff gear makes a profit there from case drops.
        <button type="button" class="link" onclick={() => { settings.splitDebuff = true; result = null; }}>Use a debuff build</button>
      </p>
    {/if}
    {#if withDebuffBuild}
      <p class="debuff-box small">
        <span class="tag debuff">Debuff build</span>
        {#if planner.debuff.hits === 0}
          Don't fight after the pill: at −60 % no hit pays for itself at these prices.
        {:else}
          {debuffItems.join(' · ')}{#if planner.debuff.hits != null} · <strong>{planner.debuff.hits} hits</strong> (every one that pays for itself){/if}
        {/if}
        <button type="button" class="link" onclick={() => navigate('/')}>Change it</button>
      </p>
    {/if}
    <p class="muted small">
      {fmt(RUNS, 0)} fights. Income from Hits and costs on Overview & MinMax: bounty <strong>{fmt(terms.bounty, 3)}</strong> G per 1k,
      battle loot <strong>{fightIncome.lootMode === 'auto' ? (battleLoot.data ? `from ${fmt(battleLoot.data.battles, 0)} real battles, for each fight's damage` : 'from real battles (still being collected)') : fightIncome.lootMode === 'items' ? `${fmt(terms.flat, 1)} G a fight` : `${fmt(terms.perK, 3)} G per 1k`}</strong>,
      company profit <strong>{companyProfit.value != null ? `${fmt(companyProfit.value, 1)} G a day` : 'none (load your player)'}</strong>.
      <button type="button" class="link" onclick={() => navigate('/')}>Change</button>
    </p>
    {#if running}<p class="muted">Simulating…</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
  </section>

  {#if result}
    <section class="card" aria-labelledby="sim-result">
      <h2 id="sim-result">{fmt(result.runs, 0)} fights · {fmt(result.avg.swings, 0)} hits on average</h2>
      <dl class="big">
        <div><dt>Net profit (median)</dt><dd class="num" class:good={q(result.net, 0.5) >= 0} class:bad={q(result.net, 0.5) < 0}>{signed(q(result.net, 0.5))} G</dd><small class="muted">ROI {fmt((100 * q(result.net, 0.5)) / Math.max(1e-9, costTotal), 0)}%</small></div>
        <div><dt>Damage (median)</dt><dd class="num">{fmtDamage(median)}</dd><small class="muted">{fmt(median / Math.max(1, result.avg.swings), 0)} per hit</small></div>
        <div><dt>Reached 95% of the time</dt><dd class="num">{fmtDamage(p05)}</dd></div>
        <div><dt>Armor · dodge</dt><dd class="num">{fmt(result.armor * 100, 0)}% · {fmt(result.dodge * 100, 0)}%</dd></div>
      </dl>

      <figure class="hist" aria-label="How often each damage total came up">
        <svg viewBox="0 0 640 160" preserveAspectRatio="none" role="img" aria-label="Damage distribution">
          {#each bars as b, i (i)}
            {@const h = (b.n / tallest) * 140}
            <rect x={i * 20 + 1} y={150 - h} width="18" height={Math.max(h, 0.5)} rx="2" class:active={hover === i}
              onmouseenter={() => (hover = i)} onmouseleave={() => (hover = -1)} role="presentation" />
            <rect x={i * 20} y="0" width="20" height="150" fill="transparent" onmouseenter={() => (hover = i)} onmouseleave={() => (hover = -1)} role="presentation" />
          {/each}
          <line x1="0" x2="640" y1="150" y2="150" class="axis" />
        </svg>
        <figcaption class="muted small">
          {#if hover >= 0}{fmtDamage(bars[hover].from)}–{fmtDamage(bars[hover].to)}: {fmt((100 * bars[hover].n) / result.runs, 1)}% of fights
          {:else}{fmtDamage(bars[0].from)} … {fmtDamage(bars.at(-1).to)} · hover a bar for its share{/if}
        </figcaption>
      </figure>

      {#if result.byPhase.length > 1}
        <div class="phases" aria-label="Damage by phase">
          {#each result.byPhase as ph, i (i)}
            {@const from = result.byPhase.slice(0, i).reduce((t, x) => t + (x.hours ?? 0), 0)}
            <div>
              <span class="tag" class:debuff={i > 0}>{i === 0 ? 'Pill build' : ph.debuffBuild ? 'Debuff build' : 'Pill build, after the pill'}</span>
              hours {fmt(from, 1)}–{fmt(from + (ph.hours ?? 0), 1)} · ×{fmt(ph.multiplier, 1)}{ph.multiplier === 1 && i > 0 ? ' (the debuff is over)' : ''} ·
              <strong class="num">{fmtDamage(ph.damage)}</strong> in {fmt(ph.swings, 0)} hits · {fmt(ph.cost, 1)} G spent
            </div>
          {/each}
        </div>
      {/if}

      <table class="spread">
        <thead><tr><th></th><th class="num">Worst 1%</th><th class="num">5%</th><th class="num">Median</th><th class="num">95%</th><th class="num">Best 1%</th></tr></thead>
        <tbody>
          <tr><th>Damage</th>{#each [0.01, 0.05, 0.5, 0.95, 0.99] as p (p)}<td class="num">{fmtDamage(q(result.damage, p))}</td>{/each}</tr>
          <tr><th>Net (G)</th>{#each [0.01, 0.05, 0.5, 0.95, 0.99] as p (p)}<td class="num">{signed(q(result.net, p))}</td>{/each}</tr>
          <tr><th>Hits</th>{#each [0.01, 0.05, 0.5, 0.95, 0.99] as p (p)}<td class="num">{fmt(q(result.swings, p), 0)}</td>{/each}</tr>
        </tbody>
      </table>

      <div class="cols">
        <div>
          <h3>Rolls</h3>
          <ul class="list">
            <li><span>Miss (half damage)</span><span class="num">{fmt(result.rates.miss * 100, 1)}%</span></li>
            <li><span>Hit</span><span class="num">{fmt(result.rates.hit * 100, 1)}%</span></li>
            <li><span>Crit</span><span class="num">{fmt(result.rates.crit * 100, 1)}%</span></li>
            <li><span>Dodged (no health lost)</span><span class="num">{fmt(result.rates.dodged * 100, 1)}%</span></li>
            <li><span>One hit</span><span class="num">{fmt(result.hitRange[0], 0)} – {fmt(result.hitRange[1], 0)}</span></li>
            {#if result.phases.length > 1}<li><span><Icon path={mdiPill} size={14} /> Phases</span><span class="num">{result.phases.map((p) => `×${fmt(p.multiplier, 1)}`).join(' then ')}</span></li>{/if}
          </ul>
        </div>
        <div>
          <h3>Costs (average) <span class="num muted">{fmt(costTotal, 1)} G</span></h3>
          <ul class="list">
            <li><span>Weapon wear</span><span class="num">{fmt(result.avg.costs.weapon, 1)}</span></li>
            <li><span>Armor wear</span><span class="num">{fmt(result.avg.costs.armor, 1)}</span></li>
            <li><span>Ammo{planner.gear.ammo ? ` (${itemLabel(planner.gear.ammo)})` : ''}</span><span class="num">{fmt(result.avg.costs.ammo, 1)}</span></li>
            <li><span>Food ({fmt(result.avg.food, 1)})</span><span class="num">{fmt(result.avg.costs.food, 1)}</span></li>
            <li><span>Pill</span><span class="num">{fmt(result.avg.costs.pill, 1)}</span></li>
          </ul>
          <p class="muted small">Wear is net of the scrap broken gear gives back.</p>
        </div>
        <div>
          <h3>Income (average) <span class="num muted">{fmt(incomeTotal, 1)} G</span></h3>
          <ul class="list">
            <li><span>Bounty</span><span class="num">{fmt(result.avg.income.bounty, 1)}</span></li>
            <li><span>Battle loot</span><span class="num">{fmt(result.avg.income.loot + result.avg.income.lootPerK, 1)}</span></li>
            <li><span>Company profit</span><span class="num">{fmt(result.avg.income.companies, 1)}</span></li>
            <li><span>Case 1 ({fmt(result.avg.cases.case1, 1)})</span><span class="num">{fmt(result.avg.income.case1, 1)}</span></li>
            <li><span>Case 2 ({fmt(result.avg.cases.case2, 2)})</span><span class="num">{fmt(result.avg.income.case2, 1)}</span></li>
          </ul>
        </div>
      </div>
    </section>
  {:else}
    <section class="card"><p class="muted">Set up the build on the Overview & MinMax page and pick how long to fight.</p></section>
  {/if}
</div>

<style>
  .page { max-width: 1100px; margin: 0 auto; padding: var(--gap); display: grid; gap: var(--gap); }
  h2 { display: flex; align-items: center; gap: 8px; }
  h3 { font-size: 14px; margin: 12px 0 6px; display: flex; justify-content: space-between; }
  .small { font-size: 12px; }
  .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 4px; }
  .tabs button { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 7px 12px; cursor: pointer; }
  .tabs button[aria-selected='true'] { border-color: var(--accent); box-shadow: inset 0 -2px var(--accent); }
  .phases { display: grid; gap: 4px; margin: 0 0 12px; font-size: 14px; }
  .phases .tag { display: inline-block; min-width: 100px; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--accent); color: var(--accent); }
  .phases .tag.debuff { border-color: var(--info); color: var(--info); }
  .debuff-box { margin: 6px 0; line-height: 1.6; }
  .debuff-box .tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--info); color: var(--info); margin-right: 6px; }
  .link { background: none; border: 0; color: var(--info); cursor: pointer; padding: 0 2px; font: inherit; }
  .big { display: flex; flex-wrap: wrap; gap: 12px 36px; margin: 0 0 12px; }
  .big div { display: grid; }
  .big dt { color: var(--muted); font-size: 12px; }
  .big dd { margin: 2px 0 0; font-size: 24px; font-weight: 700; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .hist { margin: 8px 0 12px; }
  .hist svg { width: 100%; height: 160px; display: block; }
  .hist rect:not([fill]) { fill: color-mix(in srgb, var(--accent) 75%, transparent); }
  .hist rect.active { fill: var(--accent); }
  .hist .axis { stroke: var(--line); stroke-width: 1; }
  .spread { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .spread th, .spread td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: left; }
  .spread thead th { font-size: 12px; color: var(--muted); font-weight: 500; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px 24px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
</style>
