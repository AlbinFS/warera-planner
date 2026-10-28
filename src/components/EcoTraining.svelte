<script>
  /**
   * Training & tools: what to spend the next energy on (training, replacing,
   * hiring, self-work), who to train or replace, which cards to pick for each
   * employee (src/lib/training.js), and which employee should hold which tool
   * (src/lib/staffing.js).
   */
  import { ecoEmployees, spareTools } from '../lib/eco.svelte.js';
  import { employeeDay } from '../lib/eco.js';
  import { companyModel, hireValue, bestHires, placeOf, fairWageOf, daysLeftOf } from '../lib/hiring.js';
  import { assignTools, trainingPlan, toolKindFor, toolKind, TOOL_KINDS, TOOL_GOODS, DAYS_UNKNOWN } from '../lib/staffing.js';
  import { trainingCards } from '../lib/training.js';
  import { cached } from '../lib/warera.js';
  import { fmt } from '../lib/format.js';
  import { itemImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import TraitChip from './TraitChip.svelte';

  let { companies, perPoint, items, managementPercent = 0, toolboxValue = 0, leadership = 0, selfWorkValue = 0, selfWork = true } = $props();

  let countries = $state.raw({});
  let regions = $state.raw({});
  cached('country.getAllCountries', {}, 60 * 60 * 1000).then((list) => (countries = Object.fromEntries((list ?? []).map((c) => [c._id, c])))).catch(() => {});
  cached('region.getRegionsObject', {}, 60 * 60 * 1000).then((r) => (regions = r ?? {})).catch(() => {});

  const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
  const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const RANGES = [[3, 6], [7, 12], [13, 20], [21, 30], [31, 45], [46, 65]];
  const kindLabel = (k) => k[0].toUpperCase() + k.slice(1);

  const active = $derived(companies.filter((c) => !c.disabled));
  const fairWage = $derived(fairWageOf(Object.values(ecoEmployees).flat()));
  const models = $derived(Object.fromEntries(active.map((c) => [c.id, companyModel(ecoEmployees[c.id] ?? [], placeOf(c, { regions, countries, items }), { perPoint: perPoint[c.good] ?? 0, fairWage, management: managementPercent, toolboxValue })])));

  // Everyone, with what the plans need.
  const workers = $derived(active.flatMap((c) => (ecoEmployees[c.id] ?? []).map((e, index) => {
    const d = employeeDay(e, { managementValue: 0, currentManagementValue: 0, goodPerPoint: perPoint[c.good] ?? 0 });
    return { ...e, id: e.id ?? `${c.id}-${index}`, index, company: c, good: c.good, perPoint: perPoint[c.good] ?? 0, traits: (e.traits ?? []).filter(Boolean), profit: d.profit, daysLeft: daysLeftOf(e) };
  })));

  // Every card each employee could be dealt, valued (only those still training).
  const cards = $derived(Object.fromEntries(workers.filter((w) => (w.potentialMax ?? 0) > (w.potential ?? 0)).map((w) => [w.id, trainingCards(models[w.company.id], w.index, { leadership })])));
  const selfWorkNow = $derived(selfWork ? selfWorkValue : 0);

  // What replacing someone with a typical candidate (no trait, best nationality and gender) adds per day.
  function replaceValue(w) {
    const model = models[w.company.id];
    const nationalities = [...new Set([...model.team.map((e) => e.nationality), model.place.country, 'other'].filter(Boolean))];
    let best = -Infinity;
    for (const nationality of nationalities) for (const gender of ['male', 'female']) best = Math.max(best, hireValue(model, { nationality, gender, trait: null }, { replace: w.index }).value);
    return best;
  }
  const plan = $derived(trainingPlan(workers, fairWage, replaceValue, { sessionOf: (w) => cards[w.id]?.session ?? 0, selfWork: selfWorkNow }));

  // Free slots: hiring a typical candidate there.
  const hires = $derived(active.filter((c) => (ecoEmployees[c.id] ?? []).length < (c.breakRoom ?? 1)).map((c) => {
    const best = bestHires(models[c.id]).find((h) => !h.trait);
    return { company: c, value: best?.value ?? 0 };
  }));

  // One list for the next energy: every action is 10 energy. G in all: a session over the days the
  // employee has left, a replacement over the days the one leaving would have stayed, a hire over a typical stay.
  const actions = $derived([
    ...plan.filter((p) => p.verdict === 'train').map((p) => ({ kind: 'Train', who: p.worker.name, where: p.worker.company, what: `the best of the hand (often ${cards[p.worker.id]?.cards[0]?.label ?? 'a Drill'})`, value: p.perSession })),
    // Anyone losing money can also be replaced: listed when a typical candidate would do better.
    ...plan.filter((p) => p.verdict === 'replace' || (p.worker.profit < 0 && p.replace > 0)).map((p) => ({ kind: 'Replace', who: p.worker.name, where: p.worker.company, what: 'fire and hire someone new', value: p.replace * p.days })),
    ...hires.filter((h) => h.value > 0).map((h) => ({ kind: 'Hire', who: 'new employee', where: h.company, what: 'fill a free slot', value: h.value * DAYS_UNKNOWN })),
  ].filter((a) => a.value > 0.005).sort((a, b) => b.value - a.value));

  const VERDICT = $derived({ train: 'Train', replace: 'Replace', done: 'Done training', skip: selfWork ? 'Self-work instead' : "Don't train" });
  // Cards shown per employee: the best dozen; Wild Card always (it can bring a bad trait).
  const shown = (list) => [...list.slice(0, 12), ...list.slice(12).filter((c) => c.card === 'wildCard')];
  const RARITY_SHORT = { common: 'C', uncommon: 'U', rare: 'R', epic: 'E', legendary: 'L' };

  // Tools.
  const spare = $derived(spareTools.list.map((t) => ({ ...t, code: `${t.kind}${t.rarity}` })));
  const tools = $derived(assignTools(workers.map((w) => ({ ...w, tool: w.tool })), spare));
  const moves = $derived(tools.assigned.filter((a) => !a.now));
  function addTool() {
    spareTools.list = [...spareTools.list, { id: `spare-${Date.now()}`, kind: TOOL_KINDS[1], rarity: 3, percent: 16 }];
  }
  function removeTool(id) {
    spareTools.list = spareTools.list.filter((t) => t.id !== id);
  }
</script>

<section class="card">
  <h2>What to spend your next energy on</h2>
  <p class="muted small">
    Training, hiring and rerolling a company's candidates ("Reroll all") each take a flat 10 energy. Ranked by what each adds in all:
    a training session over the days the employee has left before retiring (they age a year a day and ask to retire at 65),
    a replacement over the days the one leaving would have stayed, a new hire over a typical {DAYS_UNKNOWN} days.
    {#if selfWork}Self-work makes <strong>{fmt(selfWorkValue, 1)} G</strong> per 10 energy: anything below that isn't worth the energy.{/if}
  </p>
  {#if actions.length}
    <ol class="actions">
      {#each actions.slice(0, 10) as a, i (i)}
        <li>
          <span class="kind" data-kind={a.kind}>{a.kind}</span>
          <span><strong>{a.who}</strong> <span class="muted">· {a.where.name} ({itemLabel(a.where.good) || a.where.good})</span> · {a.what}</span>
          <span class="num good">{signed(a.value, 1)} G</span>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="muted">Nothing pays more than self-work right now: everyone is trained out, or training wouldn't add enough.</p>
  {/if}
</section>

<section class="card">
  <h2>Training priority</h2>
  <p class="muted small">
    A session deals 3 cards and you keep one: its worth is the best of the hand, on average (the cards each employee can get are below).
    Wages rise with Production: one more point earns its output (6 points a day × their bonus × the value of a point) less a fair wage of
    {fmt(fairWage, 3)} G × their wage expectation. What a card adds lasts until they retire, so the young pay back more.
  </p>
  <div class="scroll">
    <table>
      <thead><tr><th>Employee</th><th>Company</th><th class="num" title="G per day one more Production point adds, after its wage">Per Production point</th><th class="num">Profit now</th><th class="num" title="Days until they ask to retire">Days left</th><th class="num">Trainings left</th><th>Do</th><th class="num" title="What the next 10 energy on them adds in all (the best of a hand, on average)">Next session</th></tr></thead>
      <tbody>
        {#each plan as p (p.worker.id)}
          <tr>
            <td>{p.worker.name}{#each p.worker.traits as t (t)} <TraitChip code={t} />{/each}</td>
            <td><img src={itemImage(p.worker.good, items)} alt="" width="16" height="16" class="mini" /> {p.worker.company.name}</td>
            <td class="num" class:good={p.margin > 0} class:bad={p.margin < 0}>{signed(p.margin, 3)}</td>
            <td class="num" class:good={p.worker.profit > 0} class:bad={p.worker.profit < 0}>{signed(p.worker.profit)}</td>
            <td class="num">{fmt(p.days, 0)}</td>
            <td class="num">{p.left}{#if (p.worker.trainingsToday ?? 0) >= (p.worker.trainingsPerDay ?? 1) && p.left} <small class="muted" title="Trained today">✓</small>{/if}</td>
            <td><span class="verdict" data-verdict={p.verdict} title={p.why}>{VERDICT[p.verdict]}</span></td>
            <td class="num">{p.left ? `${signed(p.perSession, 1)} G` : '–'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="muted small">Hover the verdict for why. ✓: trained today. Profit and per point are G a day; the session is G in all.</p>
</section>

<section class="card">
  <h2>Which card to pick</h2>
  <p class="muted small">
    Every card the game can deal each employee, best first: pick the highest of the three you're offered. Values are what the card adds
    a day (output, toolboxes from Luck, coworkers included, less any wage rise) and in all, over the days they have left. Odds use your
    Leadership ({leadership}) and their Luck; which card of a rarity comes up isn't in the game's config, so it's taken as any of them, evenly.
  </p>
  {#each workers.filter((w) => cards[w.id]) as w (w.id)}
    {@const r = cards[w.id]}
    <details>
      <summary><strong>{w.name}</strong> <span class="muted">· {w.company.name} · {r.left} {r.left === 1 ? 'training' : 'trainings'} left · {fmt(r.days, 0)} days · a session ≈ {signed(r.session, 1)} G</span></summary>
      <div class="scroll">
        <table class="cards">
          <thead><tr><th>Card</th><th title="Rarity">R</th><th class="num" title="Chance it is in a hand of 3">In a hand</th><th class="num">G a day</th><th class="num">G in all</th></tr></thead>
          <tbody>
            {#each shown(r.cards) as c, i (i)}
              <tr class:bad-row={c.total < 0}>
                <td>{c.label}</td>
                <td><span class="rarity" data-rarity={c.rarity}>{RARITY_SHORT[c.rarity]}</span></td>
                <td class="num">{fmt(c.chance * 100, 1)}%</td>
                <td class="num" class:good={c.perDay > 0} class:bad={c.perDay < 0}>{signed(c.perDay, 3)}</td>
                <td class="num" class:good={c.total > 0} class:bad={c.total < 0}>{signed(c.total, 1)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if r.cards.length > shown(r.cards).length}<p class="muted small">{r.cards.length - shown(r.cards).length} other cards (habits) are worth {signed(r.cards[12]?.total ?? 0, 1)} G or less.</p>{/if}
    </details>
  {/each}
</section>

<section class="card">
  <h2>Tools</h2>
  <p class="muted small">
    A tool adds its % to the holder's production bonus, but only if it fits the company's good
    ({TOOL_KINDS.map((k) => `${kindLabel(k)}: ${TOOL_GOODS[k].map((g) => itemLabel(g) || g).join(', ')}`).join(' · ')}).
    Each kind is shared out for the most in all: a tool's % counts on the holder's output (Handy +40 % with any tool, so they take a weak one;
    Improviser loses its +25 %). A toolbox (Luck finds them) is worth about {fmt(toolboxValue, 1)} G to you now: a tool for someone without one.
  </p>

  <h3>Spare tools in your inventory</h3>
  <p class="muted small">The game doesn't share inventories with other sites, so add the ones you have here (saved in this browser). Tools your employees hold are loaded from the game.</p>
  <div class="spare">
    {#each spareTools.list as t (t.id)}
      <div class="spare-row">
        <img src={itemImage(`${t.kind}${t.rarity}`, items)} alt="" width="22" height="22" />
        <select bind:value={t.kind} aria-label="Tool kind">{#each TOOL_KINDS as k (k)}<option value={k}>{kindLabel(k)}</option>{/each}</select>
        <select bind:value={t.rarity} aria-label="Rarity">{#each RARITIES as r, i (r)}<option value={i + 1}>{r}</option>{/each}</select>
        <label class="pct"><input type="number" min={RANGES[t.rarity - 1][0]} max={RANGES[t.rarity - 1][1]} bind:value={t.percent} aria-label="Production %" /> %</label>
        <button class="icon" onclick={() => removeTool(t.id)} aria-label="Remove tool">✕</button>
      </div>
    {/each}
    <button class="add" onclick={addTool}>+ Add a tool</button>
  </div>

  <h3>Who should hold what</h3>
  {#if tools.assigned.length}
    <div class="scroll">
      <table>
        <thead><tr><th>Tool</th><th>Give to</th><th>Now with</th><th class="num">Adds</th></tr></thead>
        <tbody>
          {#each tools.assigned as a (a.tool.id)}
            {@const holder = workers.find((w) => w.id === a.tool.heldBy)}
            <tr class:move={!a.now}>
              <td><img src={itemImage(a.tool.code, items)} alt="" width="18" height="18" class="mini" /> {kindLabel(toolKind(a.tool.code))} +{a.tool.percent}%</td>
              <td><strong>{a.worker.name}</strong> <span class="muted">· {a.worker.company.name}, Production {a.worker.production}</span></td>
              <td>{a.now ? 'already there' : holder ? holder.name : 'inventory'}</td>
              <td class="num good">{signed(a.gain)} G/day</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="small">With these tools: <strong class="num">{signed(tools.total)}</strong> G/day, against {signed(tools.current)} now{#if moves.length} · <strong>{moves.length} {moves.length === 1 ? 'move' : 'moves'}</strong>{/if}.</p>
  {:else}
    <p class="muted">No tools yet, or none fits a good your companies make.</p>
  {/if}
  {#if tools.idle.length}
    <p class="muted small">Not used: {tools.idle.map((t) => `${kindLabel(toolKind(t.code))} +${t.percent}%`).join(', ')}: no employee makes a good it fits.</p>
  {/if}
</section>

<style>
  h3 { font-size: 12px; color: var(--muted); font-weight: 600; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: .04em; }
  .small { font-size: 12px; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 5px 6px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
  th { font-size: 11px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  td :global(.trait) { margin-left: 4px; }
  .mini { vertical-align: middle; border-radius: 4px; }
  tr.move td { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .actions { margin: 8px 0 0; padding-left: 22px; display: grid; gap: 6px; }
  .actions li { display: grid; grid-template-columns: 70px 1fr auto; gap: 10px; align-items: center; }
  .kind, .verdict { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); text-align: center; white-space: nowrap; }
  [data-kind='Train'], [data-verdict='train'] { color: var(--good); border-color: var(--good); }
  [data-verdict='negotiate'] { color: var(--accent); border-color: var(--accent); }
  [data-kind='Replace'], [data-verdict='replace'] { color: var(--bad); border-color: var(--bad); }
  [data-kind='Hire'] { color: var(--info); border-color: var(--info); }
  [data-verdict='done'], [data-verdict='skip'] { color: var(--muted); }
  details { border-top: 1px solid var(--line); padding: 6px 0; }
  summary { cursor: pointer; font-size: 13px; }
  table.cards { margin: 6px 0; }
  tr.bad-row td:first-child { color: var(--bad); }
  .rarity { display: inline-block; min-width: 18px; text-align: center; font-size: 10px; font-weight: 700; border-radius: 4px; padding: 1px 4px; border: 1px solid var(--line); }
  .rarity[data-rarity='uncommon'] { color: var(--good); border-color: var(--good); }
  .rarity[data-rarity='rare'] { color: var(--info); border-color: var(--info); }
  .rarity[data-rarity='epic'] { color: #a35bd6; border-color: #a35bd6; }
  .rarity[data-rarity='legendary'] { color: var(--accent); border-color: var(--accent); }
  .spare { display: grid; gap: 6px; }
  .spare-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  select, input { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 7px; color: var(--text); font-size: 14px; }
  .pct { display: inline-flex; align-items: center; gap: 4px; }
  .pct input { width: 64px; }
  .icon { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 4px 6px; }
  .add { justify-self: start; display: inline-flex; align-items: center; gap: 6px; background: var(--surface-2); color: var(--text); border: 1px dashed var(--line); border-radius: var(--radius-sm); padding: 6px 12px; cursor: pointer; }
</style>
