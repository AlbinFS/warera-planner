<script>
  /**
   * Hits, food and cases for the planned build, and where its cost goes; with
   * a bounty and the companies' profit, the true net.
   */
  import { planner } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { costBreakdown } from '../lib/compute.js';
  import { incomeModel } from '../lib/contract.js';
  import { ECONOMY_SKILLS } from '../engine/inputs.js';
  import { fmt, periodLabel } from '../lib/format.js';
  import { itemImage, rarityOf, RARITY_COLORS, STATS, statText } from '../lib/visual.js';
  import { itemLabel, SLOT_NAMES } from '../lib/market.js';

  let { data, current } = $props();
  const items = $derived(data.market.gameConfigItems);

  let breakdown = $state(null);
  let busy = $state(false);
  let seq = 0;

  // Recompute after the summary has its result (it changes on every edit).
  $effect(() => {
    const result = current;
    if (!result || result.error) { breakdown = null; return; }
    const id = ++seq;
    busy = true;
    const timer = setTimeout(async () => {
      const b = await costBreakdown(data.market, planner, settings, result).catch(() => null);
      if (id === seq) { breakdown = b; busy = false; }
    }, 400);
    return () => clearTimeout(timer);
  });

  const LABELS = { ...SLOT_NAMES, food: 'Food', pill: 'Pill', scraps: 'Scraps from broken gear', case: 'Loot cases' };
  function rowLabel(r) {
    if (r.slot === 'scraps') return LABELS.scraps;
    if (r.slot === 'case') return `${itemLabel(r.code)} drops`;
    if (r.slot === 'pill') return 'Pill';
    const base = `${LABELS[r.slot] ?? r.slot}: ${itemLabel(r.code)}`;
    const stats = r.skills ? ' ' + Object.entries(r.skills).map(([s, v]) => statText(s, v)).join('/') : '';
    return base + stats + (r.phase === 'debuff' ? ' (worn during the pill debuff)' : '');
  }
  const costs = $derived(breakdown ? breakdown.rows.filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount) : []);
  const credits = $derived(breakdown ? breakdown.rows.filter((r) => r.amount < 0).sort((a, b) => a.amount - b.amount) : []);
  const spent = $derived(costs.reduce((s, r) => s + r.amount, 0));

  // Bounty: G per 1k damage, typed in (remembered in this browser).
  const BOUNTY_KEY = 'planner.bounty';
  let bounty = $state((() => { try { return localStorage.getItem(BOUNTY_KEY) ?? ''; } catch { return ''; } })());
  $effect(() => { const v = String(bounty ?? ''); try { localStorage.setItem(BOUNTY_KEY, v); } catch {} });
  const bountyRate = $derived(Math.max(0, Number(bounty) || 0));
  const bountyIncome = $derived(current?.damage ? (bountyRate * current.damage) / 1000 : 0);

  // Company profit per day at the planned economy skills (the Eco page's income model, employees included).
  let income = $state(null);
  let incomeFor = null;
  let modelFor = null;
  let model = null;
  $effect(() => {
    const id = planner.player?.id;
    const levels = Object.fromEntries(ECONOMY_SKILLS.map((s) => [s, planner.skills[s] ?? 0]));
    if (!id) { income = null; return; }
    const key = JSON.stringify([id, levels]);
    if (key === incomeFor) return;
    incomeFor = key;
    (async () => {
      if (modelFor !== id) { model = await incomeModel(data.market, planner).catch(() => null); modelFor = id; }
      if (incomeFor === key) income = model ? model(levels) : null;
    })();
  });
  const net = $derived(breakdown ? breakdown.total - bountyIncome - (income ?? 0) : 0);
</script>

<section class="card" aria-labelledby="breakdown-title" aria-busy={busy}>
  <h2 id="breakdown-title">Hits and costs <span class="period">{periodLabel(settings)}</span></h2>
  {#if !breakdown}
    <p class="muted">{busy ? 'Working it out…' : 'Load or build a fighting setup to see this.'}</p>
  {:else}
    <dl class="facts" class:stale={busy}>
      <div><dt>{breakdown.hitsArePillPhase ? 'Hits during the pill' : 'Hits'}</dt><dd class="num">{fmt(breakdown.hits, 0)}</dd></div>
      <div><dt>Average damage per hit</dt><dd class="num">{fmt(breakdown.perAttack, 0)}</dd></div>
      <div><dt>Food eaten</dt><dd class="num">{fmt(breakdown.foodEaten, 1)}</dd></div>
      {#each breakdown.cases as c (c.code)}
        <div><dt>{itemLabel(c.code)} expected</dt><dd class="num">{fmt(c.count, 1)}</dd></div>
      {/each}
    </dl>
    {#if breakdown.hitsArePillPhase}<p class="muted small">On a full day, the hits after the pill wears off (in the gear you wear now) aren't counted here; their cost is.</p>{/if}

    <table class:stale={busy}>
      <tbody>
        {#each costs as r (r.slot + r.code + (r.phase ?? ''))}
          <tr>
            <td class="pic">
              {#if r.slot !== 'scraps'}<img src={itemImage(r.code, items)} alt="" width="26" height="26" loading="lazy" style:background="color-mix(in srgb, {RARITY_COLORS[rarityOf(r.code, items)]} 18%, transparent)" />{/if}
            </td>
            <td>{rowLabel(r)}</td>
            <td class="num amount">{fmt(r.amount, 2)}</td>
            <td class="bar"><span style:width="{Math.min(100, (r.amount / spent) * 100)}%"></span></td>
          </tr>
        {/each}
        <tr class="sub"><td></td><td>Spent</td><td class="num amount">{fmt(spent, 2)}</td><td></td></tr>
        {#each credits as r (r.slot + r.code)}
          <tr class="credit">
            <td class="pic">{#if r.slot === 'case'}<img src={itemImage(r.code, items)} alt="" width="26" height="26" loading="lazy" />{:else}<img src={itemImage('scraps', items)} alt="" width="26" height="26" loading="lazy" />{/if}</td>
            <td>{rowLabel(r)}</td>
            <td class="num amount">{fmt(r.amount, 2)}</td>
            <td></td>
          </tr>
        {/each}
        {#if bountyIncome > 0}
          <tr class="credit"><td class="pic"></td><td>Bounty <span class="muted">({fmt(bountyRate, 3)} G per 1k × {fmt(current.damage / 1000, 0)}k damage)</span></td><td class="num amount">{fmt(-bountyIncome, 2)}</td><td></td></tr>
        {/if}
        {#if income != null}
          <tr class="credit"><td class="pic"></td><td>Company profit <span class="muted">(a day, at these economy skills)</span></td><td class="num amount">{fmt(-income, 2)}</td><td></td></tr>
        {/if}
        {#if breakdown.other}
          <tr><td></td><td class="muted">Other (daily credits, gear without a price)</td><td class="num amount">{fmt(breakdown.other, 2)}</td><td></td></tr>
        {/if}
        <tr class="total" class:profit={net < 0}><td></td><td>{net < 0 ? 'Net profit' : 'Net cost'}</td><td class="num amount">{fmt(Math.abs(net), 2)}</td><td></td></tr>
      </tbody>
    </table>
    <label class="bounty">
      <span>Bounty (G per 1k damage)</span>
      <input type="number" step="0.001" min="0" bind:value={bounty} placeholder="0.08" />
    </label>
    <p class="muted small">
      Gear costs are its wear: the share of the item's market price used up. Credits are what broken gear's scraps and expected case drops
      are worth, the bounty this damage earns, and {planner.player ? "your companies' profit for a day at the planned economy skills" : "(once you load your player) your companies' profit"}.
    </p>
  {/if}
</section>

<style>
  .period { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 0 0 8px; }
  dt { color: var(--muted); font-size: 12px; }
  dd { margin: 2px 0 0; font-size: 20px; font-weight: 600; }
  .stale { opacity: .55; transition: opacity .15s; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
  td { padding: 5px 6px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .pic { width: 32px; padding-left: 0; }
  .pic img { border-radius: 5px; display: block; }
  .amount { text-align: right; white-space: nowrap; width: 80px; }
  .bar { width: 22%; }
  .bar span { display: block; height: 6px; border-radius: 3px; background: var(--c-attack); }
  .sub td { color: var(--muted); }
  .credit td { color: var(--good); }
  .total td { font-weight: 700; border-bottom: 0; border-top: 2px solid var(--line); }
  .total.profit td { color: var(--good); }
  .bounty { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: var(--muted); }
  .bounty input { width: 90px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 8px; color: var(--text); font-size: 14px; }
  .small { font-size: 12px; margin: 8px 0 0; }
  @media (max-width: 520px) { .bar { display: none; } }
</style>
