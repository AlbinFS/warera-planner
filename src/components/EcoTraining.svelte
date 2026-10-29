<script>
  /**
   * Training & tools: what to spend the next energy on (training, replacing,
   * hiring, self-work), who to train or replace, which cards to pick for each
   * employee (src/lib/training.js), and which employee should hold which tool
   * (src/lib/staffing.js).
   */
  import { ecoEmployees, spareTools } from '../lib/eco.svelte.js';
  import { employeeDay, engineDaily } from '../lib/eco.js';
  import { switchValue, toolSwitchPlan, SWITCH_CONCRETE, SWITCH_DAYS } from '../lib/switching.js';
  import { companyModel, hireValue, bestHires, placeOf, fairWageOf, daysLeftOf } from '../lib/hiring.js';
  import { assignTools, trainingPlan, toolKindFor, toolKind, TOOL_KINDS, TOOL_GOODS, DAYS_UNKNOWN } from '../lib/staffing.js';
  import { trainingCards } from '../lib/training.js';
  import { cached } from '../lib/warera.js';
  import { fmt } from '../lib/format.js';
  import { itemImage, flagImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import TraitChip from './TraitChip.svelte';

  let { companies, perPoint, items, upgrades = {}, prices = {}, managementPercent = 0, toolboxValue = 0, leadership = 0, selfWorkValue = 0, selfWork = true, pointValue = null } = $props();

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

  // What replacing someone with a typical candidate (no trait, best nationality and gender) adds per day,
  // with the firing's one-time cost (coworkers −5 happiness for 24 hours) spread over the days it pays.
  // Moved in the last 24 hours: the game won't let them be fired yet.
  function replaceValue(w) {
    const model = models[w.company.id];
    if (model.team[w.index]?.fireBlocked) return 0;
    const nationalities = [...new Set([...model.team.map((e) => e.nationality), model.place.country, 'other'].filter(Boolean))];
    const days = w.daysLeft ?? DAYS_UNKNOWN;
    let best = -Infinity;
    for (const nationality of nationalities) for (const gender of ['male', 'female']) {
      const r = hireValue(model, { nationality, gender, trait: null }, { replace: w.index });
      best = Math.max(best, r.value - r.fireCost / days);
    }
    return best;
  }
  const plan = $derived(trainingPlan(workers, fairWage, replaceValue, { sessionOf: (w) => cards[w.id]?.session ?? 0, selfWork: selfWorkNow, pointValue }));

  // Free slots: hiring a typical candidate there.
  const hires = $derived(active.filter((c) => (ecoEmployees[c.id] ?? []).length < (c.breakRoom ?? 1)).map((c) => {
    const best = bestHires(models[c.id]).find((h) => !h.trait);
    return { company: c, value: best?.value ?? 0 };
  }));

  // One list for the next energy: every action is 10 energy. Ranked by G in all (a session over the days
  // the employee has left, a replacement over the days the one leaving would have stayed, a hire over a
  // typical stay), shown as G a day (what the game's daily profit moves by) and over how many days.
  const perDay = (total, days) => (days > 0 ? total / days : 0);
  const actions = $derived([
    ...plan.filter((p) => p.verdict === 'train').map((p) => ({ kind: 'Train', who: p.worker.name, where: p.worker.company, what: `pick the best card you're offered (often ${cards[p.worker.id]?.cards[0]?.label ?? 'a Drill'})`, value: p.perSession, day: perDay(p.perSession, p.days), days: p.days })),
    // Anyone losing money can also be replaced: listed when a typical candidate would do better.
    ...plan.filter((p) => p.verdict === 'replace' || (p.worker.profit < 0 && p.replace > 0)).map((p) => ({ kind: 'Replace', who: p.worker.name, where: p.worker.company, what: 'fire and hire someone new (coworkers −5 happiness for 24 hours, counted)', value: p.replace * p.days, day: p.replace, days: p.days })),
    ...hires.filter((h) => h.value > 0).map((h) => ({ kind: 'Hire', who: 'new employee', where: h.company, what: 'fill a free slot', value: h.value * DAYS_UNKNOWN, day: h.value, days: DAYS_UNKNOWN })),
  ].filter((a) => a.value > 0.005).sort((a, b) => b.value - a.value));
  // What to pick: the cards most likely to be in a hand (by your Leadership and their Luck), in the
  // order to pick them, then the rare ones worth more than all of those: take them if dealt.
  const LIKELY = 6;
  const likely = (list) => [...list].sort((a, b) => b.chance - a.chance || b.total - a.total).slice(0, LIKELY).sort((a, b) => b.total - a.total);
  const rareBetter = (list) => {
    const top = Math.max(...likely(list).map((c) => c.total));
    const seen = new Set(likely(list));
    // Likeliest first: a rare habit you'll meet now and then before a two-habit card you almost never will.
    return list.filter((c) => !seen.has(c) && c.total > top).sort((a, b) => b.chance - a.chance || b.total - a.total).slice(0, 4);
  };
  // Open an employee's card list below.
  let openCards = $state(null);
  // The rarity each employee was dealt this session (the game rolls one rarity for the whole hand): only those cards.
  let dealt = $state({});
  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const setDealt = (id, rarity) => { dealt = { ...dealt, [id]: dealt[id] === rarity ? null : rarity }; };
  const ofDealt = (id, list) => (dealt[id] ? list.filter((c) => c.rarity === dealt[id]).sort((a, b) => b.total - a.total) : list);
  function showCards(id) {
    openCards = id;
    requestAnimationFrame(() => document.getElementById(`cards-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const VERDICT = $derived({ train: 'Train', replace: 'Replace', trained: 'Already trained', done: 'Done training', skip: selfWork ? 'Self-work instead' : "Don't train" });
  // Cards shown per employee: the best dozen; Wild Card always (it can bring a bad trait).
  // Every card but most two-habit ones (hundreds of them, each a 1-in-10,000 draw): their best five.
  const shown = (list) => {
    const pairs = list.filter((c) => c.card === 'habitPair');
    const keep = new Set(pairs.slice(0, 5));
    return list.filter((c) => c.card !== 'habitPair' || keep.has(c));
  };
  const otherPairs = (list) => list.filter((c) => c.card === 'habitPair').slice(5);
  const RARITY_SHORT = { common: 'C', uncommon: 'U', rare: 'R', epic: 'E', legendary: 'L' };

  // Tools.
  const spare = $derived(spareTools.list.map((t) => ({ ...t, code: `${t.kind}${t.rarity}` })));
  const tools = $derived(assignTools(workers.map((w) => ({ ...w, tool: w.tool })), spare));
  const moves = $derived(tools.assigned.filter((a) => !a.now));
  // Spare tools no company can use: would switching a company to a good they fit pay?
  const idleKinds = $derived([...new Set(tools.idle.filter((t) => spare.some((s) => s.id === t.id)).map((t) => toolKind(t.code)))]);
  const switchCost = $derived(SWITCH_CONCRETE * (prices.concrete ?? 0));
  // Per kind: the switches the spare tools can fill, best for your income first (what the company makes
  // after, against what it makes now, the switch's cost taken off). No more switches than the tools fill.
  const switches = $derived(idleKinds.map((kind) => {
    const kindTools = spare.filter((t) => toolKind(t.code) === kind && tools.idle.some((i) => i.id === t.id));
    const staffed = active.filter((c) => (ecoEmployees[c.id] ?? []).length);
    const options = (c, left) => TOOL_GOODS[kind].filter((g) => g !== c.good && Number.isFinite(perPoint[g])).map((good) =>
      switchValue(models[c.id], { employees: ecoEmployees[c.id] ?? [], good, perPoint, spare: left, enginePoints: engineDaily(upgrades, c.engine), cost: switchCost }));
    return { kind, count: kindTools.length, ...toolSwitchPlan(staffed, kindTools, options) };
  }));

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
    Training, hiring and rerolling a company's candidates ("Reroll all") each take a flat 10 energy. Each shows what it adds
    <strong>a day</strong> (what your daily profit moves by) and for how many days: a training lasts until the employee retires (they
    age a year a day and ask at 65), a new hire about {DAYS_UNKNOWN} days. They're ranked by the total, since 10 energy now pays for all
    those days. Training is an average over the cards you might be offered; one pick can add more or less.
    {#if selfWork}Self-work makes <strong>{fmt(selfWorkValue, 1)} G</strong> per 10 energy, once: a training is worth it when its total beats that.{/if}
  </p>
  {#if actions.length}
    <ol class="actions">
      {#each actions.slice(0, 10) as a, i (i)}
        <li>
          <span class="rank">{i + 1}</span>
          <span class="kind" data-kind={a.kind}>{a.kind}</span>
          <span class="act">
            <span><strong>{a.who}</strong> <span class="muted"><img src={itemImage(a.where.good, items)} alt="" width="14" height="14" class="mini" /> {a.where.name}</span></span>
            <small class="muted">{a.what}</small>
          </span>
          <span class="gain num" title="{fmt(a.value, 1)} G in all"><strong>{signed(a.day, 2)} G/day</strong><small class="muted">{fmt(a.value, 1)} G over {fmt(a.days, 0)} days</small></span>
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
  <div class="people">
    {#each plan as p (p.worker.id)}
      {@const w = p.worker}
      {@const r = cards[w.id]}
      <article class="person" data-state={p.verdict} role="button" tabindex="0" title="All of {w.name}'s cards"
        onclick={(e) => { if (!e.target.closest('button, a, .rarities')) showCards(w.id); }}
        onkeydown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) showCards(w.id); }}>
        <header>
          {#if countries[w.nationality]?.code}<img class="flag" src={flagImage(countries[w.nationality].code)} alt={countries[w.nationality]?.name ?? ''} title={countries[w.nationality]?.name ?? ''} width="20" height="14" />{/if}
          <strong class="pname">{w.name}</strong>
          <span class="muted small">{w.gender === 'female' ? '♀' : w.gender === 'male' ? '♂' : ''}{w.age ?? ''}</span>
          <span class="company"><img src={itemImage(w.good, items)} alt="" width="16" height="16" class="mini" /> {w.company.name}</span>
          <span class="verdict" data-verdict={p.verdict} title={p.why}>{VERDICT[p.verdict]}</span>
        </header>
        {#if w.traits.length}<div class="ptraits">{#each w.traits as t (t)}<TraitChip code={t} />{/each}</div>{/if}
        <div class="tiles">
          <span class="tile" data-stat="production"><small>Production</small>{w.stats?.production?.revealed === false ? '?' : w.stats?.production?.total ?? w.production}{#if w.stats?.production?.trained}<em>+{w.stats.production.trained} trained</em>{/if}</span>
          <span class="tile" data-stat="luck"><small>Luck</small>{w.stats?.luck?.revealed === false ? '?' : w.stats?.luck?.total ?? '?'}</span>
          <span class="tile" data-stat="responsibility"><small>Responsibility</small>{w.stats?.responsibility?.revealed === false ? '?' : w.stats?.responsibility?.total ?? '?'}</span>
          <span class="tile"><small>Potential</small>{w.potential ?? '?'} / {w.potentialMax ?? '?'}</span>
          <span class="tile"><small>Happiness</small>{fmt(w.happiness?.value ?? 50, 0)}</span>
          <span class="tile"><small>Wage</small>{fmt(w.payroll ?? 0, 2)} G/day</span>
          <span class="tile" class:good={w.profit > 0} class:bad={w.profit < 0}><small>Profit now</small>{signed(w.profit)} G/day</span>
          <span class="tile"><small>Days left</small>{fmt(p.days, 0)}</span>
        </div>
        <div class="values">
          <span title="G a day one more Production point adds, after its wage, at the market price of the company's good">Per Production point <strong class:good={p.margin > 0} class:bad={p.margin < 0}>{signed(p.margin, 3)}</strong>{#if p.gameMargin != null} <small class="muted" title="At the game's point value ({fmt(pointValue, 4)} G), as its profit tooltip counts it">({signed(p.gameMargin, 3)} in game)</small>{/if}</span>
          <span>Trainings left <strong>{p.left}</strong></span>
          {#if p.left}<span title="What the next training adds, on average over the cards you may be offered">Next session <strong class="good">{signed(perDay(p.perSession, p.days), 2)} G/day</strong> <small class="muted">({fmt(p.perSession, 1)} G in all)</small></span>{/if}
        </div>
        <p class="why">{p.why}</p>
        {#if r}
          <div class="picks">
            <div class="rarities" role="group" aria-label="The rarity you were dealt">
              <span class="plabel">{dealt[w.id] ? 'Dealt' : 'Pick, in this order'}</span>
              {#each RARITY_ORDER.filter((x) => r.cards.some((c) => c.rarity === x)) as x (x)}
                <button type="button" class="rchip" data-rarity={x} aria-pressed={dealt[w.id] === x} title="I was dealt {x} cards: show only those" onclick={() => setDealt(w.id, x)}>{RARITY_SHORT[x]}</button>
              {/each}
            </div>
            <ol>
              {#each dealt[w.id] ? ofDealt(w.id, r.cards).slice(0, 8) : likely(r.cards) as c, i (i)}
                <li><span class="rarity" data-rarity={c.rarity}>{RARITY_SHORT[c.rarity]}</span> {c.label} <small class="muted">{signed(c.perDay, 2)}/day · {fmt(c.chance * 100, 0)} % in hand</small></li>
              {/each}
            </ol>
            {#if !dealt[w.id] && rareBetter(r.cards).length}<p class="rare">Rarer but better, take if dealt: {rareBetter(r.cards).map((c) => `${c.label} (${c.chance >= 0.001 ? fmt(c.chance * 100, 1) : '<0.1'} %)`).join(' · ')}</p>{/if}
            <button class="link" onclick={() => showCards(w.id)}>All cards</button>
          </div>
        {/if}
      </article>
    {/each}
  </div>
  <p class="muted small">
    "Already trained": trained today, so not again until 00:00 UTC; they come last until then.
    Per point: at the market price of the company's good (what selling it earns), and at the game's point value, as its profit tooltip
    counts it. Pick order: the {LIKELY} cards most likely to be in your hand (the % is the chance it's among your three, with your
    Leadership and their Luck), best first; then rare cards worth more than all of them, to take if you're dealt one. Anything else:
    "All cards".
  </p>
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
    <details id="cards-{w.id}" open={openCards === w.id}>
      <summary><strong>{w.name}</strong> <span class="muted">· {w.company.name} · {r.left} {r.left === 1 ? 'training' : 'trainings'} left · {fmt(r.days, 0)} days · a session ≈ {signed(r.session, 1)} G</span></summary>
      <div class="rarities" role="group" aria-label="The rarity you were dealt">
        <span class="plabel">Dealt</span>
        {#each RARITY_ORDER.filter((x) => r.cards.some((c) => c.rarity === x)) as x (x)}
          <button type="button" class="rchip" data-rarity={x} aria-pressed={dealt[w.id] === x} onclick={() => setDealt(w.id, x)}>{x}</button>
        {/each}
        {#if dealt[w.id]}<button type="button" class="link" onclick={() => setDealt(w.id, dealt[w.id])}>show all</button>{/if}
      </div>
      <div class="scroll">
        <table class="cards">
          <thead><tr><th>Card</th><th title="Rarity">R</th><th class="num" title="Chance it is in a hand of 3">In a hand</th><th class="num">G a day</th><th class="num">G in all</th></tr></thead>
          <tbody>
            {#each dealt[w.id] ? ofDealt(w.id, r.cards) : shown(r.cards) as c, i (i)}
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
      {#if otherPairs(r.cards).length}{@const rest = otherPairs(r.cards)}<p class="muted small">{rest.length} other two-habit cards (legendary, each about a 1-in-10,000 draw): worth {signed(rest.at(-1).perDay, 2)} to {signed(rest[0].perDay, 2)} G a day.</p>{/if}
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
  {#each switches as s (s.kind)}
    {@const kind = kindLabel(s.kind).toLowerCase()}
    <h3>Use your spare {kind}{s.count === 1 ? '' : 's'}: switch a company?</h3>
    <p class="muted small">
      No company makes a good {s.count === 1 ? 'it fits' : 'they fit'} ({TOOL_GOODS[s.kind].map((g) => itemLabel(g) || g).join(', ')}).
      Each line is a company to switch so {s.count === 1 ? 'the tool is' : 'the tools are'} used, picked for your income: what the company makes after,
      against what it makes now, the {SWITCH_CONCRETE} concrete (about {fmt(switchCost, 1)} G) taken off. Specialization starts over in the new good
      (+1 % a day up to 20 %, the old good's kept: worked out day by day from day 1) and tools for the old good stop working. No more switches than your tools fill.
    </p>
    {#if s.plan.length}
      <div class="scroll">
        <table>
          <thead><tr><th>Switch</th><th>Tool to</th><th class="num" title="The first day: specialization in the new good starts at what each employee already has there (usually 0 %)">Day 1</th><th class="num" title="Once specialization has caught up (a percent a day, up to 20 %)">From day 21 on</th><th class="num" title="The day the running total, worked out day by day, has covered the switch's cost">Pays back</th></tr></thead>
          <tbody>
            {#each s.plan as o (o.company.id)}
              <tr>
                <td><strong>{o.company.name}</strong> <span class="muted">{itemLabel(o.company.good) || o.company.good} → {itemLabel(o.good) || o.good}</span></td>
                <td>{o.tools.filter((t) => t.spare).map((t) => `${t.name} (+${t.percent}%)`).join(', ')}</td>
                <td class="num" class:good={o.first > 0.005} class:bad={o.first < -0.005}>{signed(o.first)} G/day</td>
                <td class="num" class:good={o.full > 0.005} class:bad={o.full < -0.005}>{signed(o.full)} G/day</td>
                <td class="num">{o.payback ? `day ${o.payback}` : `not within ${SWITCH_DAYS} days`}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if s.unused.length}<p class="muted small">{s.unused.length} {kind}{s.unused.length === 1 ? '' : 's'} left over: no other switch pays.</p>{/if}
    {:else}
      <p class="small">No switch pays within {SWITCH_DAYS} days: keep the {kind}{s.count === 1 ? '' : 's'} for later, or sell {s.count === 1 ? 'it' : 'them'}.</p>
    {/if}
  {/each}
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
  .actions { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
  .actions li { display: grid; grid-template-columns: 22px 68px 1fr auto; gap: 10px; align-items: center; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; }
  .actions .rank { font-weight: 700; color: var(--muted); text-align: center; }
  .actions .act { display: grid; gap: 2px; min-width: 0; }
  .actions .act small { font-size: 12px; }
  .actions .gain { display: grid; justify-items: end; gap: 2px; color: var(--good); }
  .actions .gain small { font-size: 11px; }
  @media (max-width: 520px) { .actions li { grid-template-columns: 22px 1fr auto; } .actions .kind { display: none; } }
  .kind, .verdict { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); text-align: center; white-space: nowrap; }
  [data-kind='Train'], [data-verdict='train'] { color: var(--good); border-color: var(--good); }
  [data-verdict='negotiate'] { color: var(--accent); border-color: var(--accent); }
  [data-kind='Replace'], [data-verdict='replace'] { color: var(--bad); border-color: var(--bad); }
  [data-kind='Hire'] { color: var(--info); border-color: var(--info); }
  [data-verdict='done'], [data-verdict='skip'], [data-verdict='trained'] { color: var(--muted); }
  details { border-top: 1px solid var(--line); padding: 6px 0; }
  summary { cursor: pointer; font-size: 13px; }
  table.cards { margin: 6px 0; }
  tr.bad-row td:first-child { color: var(--bad); }
  .people { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 10px; margin-top: 10px; }
  .person { display: grid; gap: 8px; align-content: start; background: var(--surface-2); border: 1px solid var(--line); border-left: 4px solid var(--line); border-radius: var(--radius); padding: 12px 14px; }
  .person[data-state='train'] { border-left-color: var(--good); }
  .person[data-state='replace'] { border-left-color: var(--bad); }
  .person header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
  .person .pname { font-size: 15px; }
  .person .company { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--muted); }
  .person header .verdict { margin-left: auto; }
  .flag { border-radius: 2px; box-shadow: 0 0 0 1px rgba(0, 0, 0, .25); }
  .ptraits { display: flex; flex-wrap: wrap; gap: 4px; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .tile { display: grid; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 8px; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .tile small { font-size: 10px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--muted); }
  .tile em { font-style: normal; font-size: 11px; font-weight: 500; color: var(--good); }
  .tile[data-stat='production'] small { color: var(--c-economy); }
  .tile[data-stat='luck'] small { color: var(--good); }
  .tile[data-stat='responsibility'] small { color: var(--info); }
  .values { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; }
  .why { margin: 0; font-size: 12px; color: var(--muted); }
  .picks { border-top: 1px solid var(--line); padding-top: 8px; font-size: 13px; }
  .plabel { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .person { cursor: pointer; transition: border-color .15s; }
  .person:hover { border-color: var(--accent); }
  .person:focus-visible { outline: 2px solid var(--accent); }
  .rarities { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 2px 0 4px; }
  .rarities .plabel { margin-right: 4px; }
  .rchip { --r: var(--muted); font-size: 11px; font-weight: 700; text-transform: capitalize; min-width: 24px; padding: 2px 7px; border-radius: 4px; border: 1px solid var(--r); color: var(--r); background: none; cursor: pointer; }
  .rchip[data-rarity='uncommon'] { --r: var(--good); }
  .rchip[data-rarity='rare'] { --r: var(--info); }
  .rchip[data-rarity='epic'] { --r: #a35bd6; }
  .rchip[data-rarity='legendary'] { --r: var(--accent); }
  .rchip[aria-pressed='true'] { background: var(--r); color: var(--bg); }
  .picks ol { margin: 4px 0 0; padding-left: 20px; display: grid; gap: 3px; }
  .picks .rare { margin: 6px 0 0; font-size: 12px; color: var(--accent); }
  @media (max-width: 420px) { .tiles { grid-template-columns: repeat(2, 1fr); } }
  .link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font-size: 12px; text-decoration: underline; }
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
