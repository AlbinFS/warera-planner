<script>
  /**
   * Training & tools: what to spend the next energy on (training, replacing,
   * hiring), who to train or replace, and which employee should hold which
   * tool (src/lib/staffing.js).
   */
  import { ecoEmployees, spareTools } from '../lib/eco.svelte.js';
  import { employeeDay } from '../lib/eco.js';
  import { companyModel, hireValue, bestHires, placeOf, fairWageOf } from '../lib/hiring.js';
  import { assignTools, trainingPlan, toolKindFor, toolKind, TOOL_KINDS, TOOL_GOODS, ENERGY_PER_ACTION } from '../lib/staffing.js';
  import { cached } from '../lib/warera.js';
  import { fmt } from '../lib/format.js';
  import { itemImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import TraitChip from './TraitChip.svelte';

  let { companies, perPoint, items, managementPercent = 0 } = $props();

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
  const models = $derived(Object.fromEntries(active.map((c) => [c.id, companyModel(ecoEmployees[c.id] ?? [], placeOf(c, { regions, countries, items }), { perPoint: perPoint[c.good] ?? 0, fairWage, management: managementPercent })])));

  // Everyone, with what the plans need.
  const workers = $derived(active.flatMap((c) => (ecoEmployees[c.id] ?? []).map((e, index) => {
    const d = employeeDay(e, { managementValue: 0, currentManagementValue: 0, goodPerPoint: perPoint[c.good] ?? 0 });
    return { ...e, id: e.id ?? `${c.id}-${index}`, index, company: c, good: c.good, perPoint: perPoint[c.good] ?? 0, traits: (e.traits ?? []).filter(Boolean), profit: d.profit };
  })));

  // What replacing someone with a typical candidate (no trait, best nationality and gender) adds per day.
  function replaceValue(w) {
    const model = models[w.company.id];
    const nationalities = [...new Set([...model.team.map((e) => e.nationality), model.place.country, 'other'].filter(Boolean))];
    let best = -Infinity;
    for (const nationality of nationalities) for (const gender of ['male', 'female']) best = Math.max(best, hireValue(model, { nationality, gender, trait: null }, { replace: w.index }).value);
    return best;
  }
  const plan = $derived(trainingPlan(workers, fairWage, replaceValue));

  // Free slots: hiring a typical candidate there.
  const hires = $derived(active.filter((c) => (ecoEmployees[c.id] ?? []).length < (c.breakRoom ?? 1)).map((c) => {
    const best = bestHires(models[c.id]).find((h) => !h.trait);
    return { company: c, value: best?.value ?? 0 };
  }));

  // One list for the next energy: every action is 10 energy.
  const actions = $derived([
    ...plan.filter((p) => p.verdict === 'train').map((p) => ({ kind: 'Train', who: p.worker.name, where: p.worker.company, what: 'Drill Production', value: p.perSession })),
    ...plan.filter((p) => p.verdict === 'negotiate').map((p) => ({ kind: 'Train', who: p.worker.name, where: p.worker.company, what: 'Negotiation (lower wage), then Drill', value: p.perSession })),
    // Anyone losing money can also be replaced: listed when a typical candidate would do better.
    ...plan.filter((p) => p.verdict === 'replace' || (p.worker.profit < 0 && p.replace > 0)).map((p) => ({ kind: 'Replace', who: p.worker.name, where: p.worker.company, what: 'fire and hire someone new', value: p.replace })),
    ...hires.filter((h) => h.value > 0).map((h) => ({ kind: 'Hire', who: 'new employee', where: h.company, what: 'fill a free slot', value: h.value })),
  ].filter((a) => a.value > 0.005).sort((a, b) => b.value - a.value));

  const VERDICT = { train: 'Train', negotiate: 'Negotiate first', replace: 'Replace', done: 'Done training', skip: "Don't train" };

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
  <p class="muted small">Training, hiring and rerolling a company's candidates ("Reroll all") each take a flat 10 energy. Ranked by what each adds per day.</p>
  {#if actions.length}
    <ol class="actions">
      {#each actions.slice(0, 10) as a, i (i)}
        <li>
          <span class="kind" data-kind={a.kind}>{a.kind}</span>
          <span><strong>{a.who}</strong> <span class="muted">· {a.where.name} ({itemLabel(a.where.good) || a.where.good})</span> · {a.what}</span>
          <span class="num good">{signed(a.value)} G/day</span>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="muted">Nothing pays right now: everyone is trained out or training wouldn't add anything.</p>
  {/if}
</section>

<section class="card">
  <h2>Training priority</h2>
  <p class="muted small">
    Wages rise with Production, so training only pays when one more Production point earns more than it adds to the wage
    (6 points a day × their bonus × the value of a point, against a fair wage of {fmt(fairWage, 3)} G × their wage expectation).
    A Drill adds about 1.5 Production. Someone paid more than that should get Negotiation first; someone who loses money even at the
    lowest wage (0.7) is better replaced.
  </p>
  <div class="scroll">
    <table>
      <thead><tr><th>Employee</th><th>Company</th><th class="num" title="G per day one more Production point adds, after its wage">Per Production point</th><th class="num">Profit now</th><th class="num">Trainings left</th><th>Do</th><th class="num" title="What the next 10 energy on them adds per day">Next 10 energy</th></tr></thead>
      <tbody>
        {#each plan as p (p.worker.id)}
          <tr>
            <td>{p.worker.name}{#each p.worker.traits as t (t)} <TraitChip code={t} />{/each}</td>
            <td><img src={itemImage(p.worker.good, items)} alt="" width="16" height="16" class="mini" /> {p.worker.company.name}</td>
            <td class="num" class:good={p.margin > 0} class:bad={p.margin < 0}>{signed(p.margin, 3)}</td>
            <td class="num" class:good={p.worker.profit > 0} class:bad={p.worker.profit < 0}>{signed(p.worker.profit)}</td>
            <td class="num">{p.left}</td>
            <td><span class="verdict" data-verdict={p.verdict} title={p.why}>{VERDICT[p.verdict]}</span></td>
            <td class="num">{p.perSession > 0 ? signed(p.perSession) : '–'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="muted small">Hover the verdict for why. Values are G per day.</p>
</section>

<section class="card">
  <h2>Tools</h2>
  <p class="muted small">
    A tool adds its % to the holder's production bonus, but only if it fits the company's good
    ({TOOL_KINDS.map((k) => `${kindLabel(k)}: ${TOOL_GOODS[k].map((g) => itemLabel(g) || g).join(', ')}`).join(' · ')}).
    The best tool of a kind goes to whoever it adds most to: the highest output (Handy +40 % with any tool; Improviser loses its +25 %).
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
  .spare { display: grid; gap: 6px; }
  .spare-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  select, input { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 7px; color: var(--text); font-size: 14px; }
  .pct { display: inline-flex; align-items: center; gap: 4px; }
  .pct input { width: 64px; }
  .icon { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 4px 6px; }
  .add { justify-self: start; display: inline-flex; align-items: center; gap: 6px; background: var(--surface-2); color: var(--text); border: 1px dashed var(--line); border-radius: var(--radius-sm); padding: 6px 12px; cursor: pointer; }
</style>
