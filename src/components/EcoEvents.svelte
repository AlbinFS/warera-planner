<script>
  /**
   * Worker events: find the event the game shows you, pick the employee (and
   * the second one, for two-person events), and every answer is worked out in
   * gold for your company (events.js): its cost, each result's chance and
   * what that result does to them and their coworkers. Best first. Colors are
   * the game's: its event kinds, and its results (critical success amber,
   * success green, failure red, critical failure purple, certain gray).
   */
  import { ecoEmployees } from '../lib/eco.svelte.js';
  import { companyModel, placeOf, fairWageOf, traitName } from '../lib/hiring.js';
  import { EVENTS, TEXTS, rateEvent, resultLabel } from '../lib/events.js';
  import { cached } from '../lib/warera.js';
  import { fmt } from '../lib/format.js';

  let { companies, perPoint, items, prices = {}, managementPercent = 0, toolboxValue = 0, leadership = 0, selfWorkValue = 0, selfWork = true } = $props();

  let countries = $state.raw({});
  let regions = $state.raw({});
  cached('country.getAllCountries', {}, 60 * 60 * 1000).then((list) => (countries = Object.fromEntries((list ?? []).map((c) => [c._id, c])))).catch(() => {});
  cached('region.getRegionsObject', {}, 60 * 60 * 1000).then((r) => (regions = r ?? {})).catch(() => {});

  const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
  const pct = (p) => `${fmt(p * 100, p < 0.1 && p > 0 ? 1 : 0)} %`;
  // The game's event kinds, in its order.
  const POOLS = [
    ['inspiration', 'Inspiration'], ['crisis', 'Crisis'], ['social', 'Social'], ['world', 'World'],
    ['life', 'Life'], ['cozy', 'Cozy'], ['legendary', 'Legendary'], ['chain', 'Follow-up'],
  ];
  const POOL = Object.fromEntries(POOLS);
  const ORDER = { crit: 0, success: 1, fail: 2, critFail: 3 };

  // The events, by name.
  const list = Object.keys(EVENTS).map((code) => ({ code, title: TEXTS[code]?.title ?? code, when: TEXTS[code]?.when ?? '', pool: EVENTS[code].pool, two: EVENTS[code].participants === 2 }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const counts = Object.fromEntries(POOLS.map(([p]) => [p, list.filter((e) => e.pool === p).length]));
  let query = $state('');
  let pool = $state(null);
  const shown = $derived(list.filter((e) => (!pool || e.pool === pool) && (!query.trim() || `${e.title} ${e.when}`.toLowerCase().includes(query.trim().toLowerCase()))));
  let picked = $state(null);

  const active = $derived(companies.filter((c) => !c.disabled));
  const fairWage = $derived(fairWageOf(Object.values(ecoEmployees).flat()));
  const models = $derived(Object.fromEntries(active.map((c) => [c.id, companyModel(ecoEmployees[c.id] ?? [], placeOf(c, { regions, countries, items }), { perPoint: perPoint[c.good] ?? 0, fairWage, management: managementPercent, toolboxValue })])));
  const workers = $derived(active.flatMap((c) => (ecoEmployees[c.id] ?? []).map((e, index) => ({ key: `${c.id}:${index}`, company: c, index, e }))));

  let first = $state('');
  let second = $state('');
  const one = $derived(workers.find((w) => w.key === first) ?? null);
  const coworkers = $derived(one ? workers.filter((w) => w.company.id === one.company.id && w.index !== one.index) : []);
  const two = $derived(coworkers.find((w) => w.key === second) ?? null);
  $effect(() => { if (one && !coworkers.some((w) => w.key === second)) second = coworkers[0]?.key ?? ''; });

  const event = $derived(picked ? EVENTS[picked] : null);
  const needsTwo = $derived(event?.participants === 2);
  const answers = $derived(picked && one && (!needsTwo || two)
    ? rateEvent(picked, {
      model: models[one.company.id], employees: ecoEmployees[one.company.id] ?? [], self: one.index, partner: needsTwo ? two.index : null,
      prices, toolboxValue, selfWork: selfWork ? selfWorkValue : 0, leadership,
    })
    : []);
  const best = $derived(answers.find((a) => a.available) ?? null);
  const name = (w) => w?.e.name ?? '';
  const fill = (s) => String(s ?? '').replaceAll('{name}', name(one) || 'the employee').replaceAll('{partner}', name(two) || 'the partner').replaceAll('{good}', 'their good');
  // A result without a check is certain (the game shows it gray).
  const kindOf = (a, r) => (a.check ? r.kind : 'certain');
  const labelOf = (a, r) => (a.check ? resultLabel(r.kind) : 'Certain');
  const sorted = (a) => [...a.results].sort((x, y) => ORDER[x.kind] - ORDER[y.kind]);
  function pick(code) {
    picked = code;
    requestAnimationFrame(() => document.getElementById('event-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
</script>

<section class="card">
  <h2>Worker events</h2>
  <p class="muted small">
    When the game shows an employee event, find it here and pick who it is about: every answer is worked out in gold for your company, from
    the game's own rules (cost, chance and results) and your employees as they are now (stats, traits, happiness, coworkers, days left).
    A check's chance is the game's: its base, the traits it names, +2 % per level of your Leadership ({leadership} now), the employee's Luck and happiness.
    Luck decides the result, but this is the best bet.
  </p>
  <input class="search" type="search" bind:value={query} placeholder="Search events: name or trigger (Eureka, tool, Gambler…)" aria-label="Search events" />
  <div class="pools" role="group" aria-label="Kind of event">
    <button type="button" class="chip" aria-pressed={!pool} onclick={() => (pool = null)}>All <small>{list.length}</small></button>
    {#each POOLS as [p, label] (p)}
      <button type="button" class="chip" data-pool={p} aria-pressed={pool === p} onclick={() => (pool = pool === p ? null : p)}>{label} <small>{counts[p]}</small></button>
    {/each}
  </div>
  <div class="events">
    {#each shown as e (e.code)}
      <button type="button" class="event" data-pool={e.pool} class:on={picked === e.code} onclick={() => pick(e.code)}>
        <span class="head">
          <span class="title">{e.title}</span>
          <span class="kind" data-pool={e.pool}>{POOL[e.pool] ?? e.pool}</span>
        </span>
        <span class="when">{e.when}</span>
        {#if e.two}<span class="pair">2 employees</span>{/if}
      </button>
    {:else}
      <p class="muted small">No event matches.</p>
    {/each}
  </div>
</section>

{#if picked}
  {@const t = TEXTS[picked]}
  <section class="card detail" id="event-detail" data-pool={event.pool}>
    <div class="banner">
      <span class="kind" data-pool={event.pool}>{POOL[event.pool] ?? event.pool}</span>
      <h2>{t.title}</h2>
      <p>{t.when}</p>
    </div>
    {#if !workers.length}
      <p class="muted">Your employees aren't loaded: load your player (and your API key, if the site's key can't reach them).</p>
    {:else}
      <div class="who">
        <label>
          <span>{needsTwo ? 'First employee' : 'Employee'}</span>
          <select bind:value={first}>
            <option value="" disabled>Pick who it's about</option>
            {#each active as c (c.id)}
              <optgroup label={c.name}>
                {#each workers.filter((w) => w.company.id === c.id) as w (w.key)}<option value={w.key}>{w.e.name}</option>{/each}
              </optgroup>
            {/each}
          </select>
        </label>
        {#if needsTwo}
          <label>
            <span>Second employee</span>
            <select bind:value={second} disabled={!coworkers.length}>
              {#each coworkers as w (w.key)}<option value={w.key}>{w.e.name}</option>{/each}
            </select>
          </label>
        {/if}
      </div>
      {#if one}
        <div class="stats">
          <span><small>Company</small>{one.company.name}</span>
          <span><small>Production</small>{one.e.production}</span>
          <span><small>Happiness</small>{fmt(one.e.happiness?.value ?? 50, 0)}</span>
          <span><small>Luck</small>{one.e.stats?.luck?.total ?? '?'}</span>
          <span><small>Your Leadership</small>{leadership}</span>
          {#if one.e.traits?.filter(Boolean).length}<span class="traits"><small>Traits</small>{one.e.traits.filter(Boolean).map(traitName).join(', ')}</span>{/if}
        </div>
      {/if}

      {#if needsTwo && one && !coworkers.length}
        <p class="muted">This event needs two employees in the same company.</p>
      {:else if answers.length}
        {#if best}
          <div class="verdict">
            <span class="label">Best answer</span>
            <strong>{fill(best.label)}</strong>
            <span class="num ev" class:good={best.ev > 0.005} class:bad={best.ev < -0.005}>{signed(best.ev)} G</span>
            <span class="muted small">expected{#if best.chance != null}{' · '}{pct(best.chance)} to succeed{/if}</span>
          </div>
        {/if}
        <div class="answers">
          {#each answers as a (a.key)}
            <article class="answer" class:best={a === best} class:off={!a.available}>
              <header>
                <strong class="name">{fill(a.label)}</strong>
                <span class="tags">
                  {#if a === best}<span class="tag good">best</span>{/if}
                  {#if a.isDefault}<span class="tag">if you don't answer</span>{/if}
                  {#if a.risky}<span class="tag bad">can lose the employee</span>{/if}
                  {#if !a.available}<span class="tag">not possible for them</span>{/if}
                </span>
                <span class="ev num" class:good={a.ev > 0.005} class:bad={a.ev < -0.005}>{signed(a.ev)} <small>G</small></span>
              </header>
              {#if a.results.length}
                <div class="odds" role="img" aria-label={sorted(a).map((r) => `${labelOf(a, r)} ${pct(r.p)}`).join(', ')}>
                  {#each sorted(a) as r (r.kind)}<span data-result={kindOf(a, r)} style:flex-grow={r.p} title="{labelOf(a, r)} {pct(r.p)}"></span>{/each}
                </div>
                {#if a.chance != null}<p class="check small">{a.check.type === 'luck' ? 'Luck check' : 'Check'}: <strong>{pct(a.chance)}</strong> to succeed <span class="muted">(base {a.check.base} %)</span></p>{/if}
              {/if}
              {#if a.costs.length || a.always.length}
                <ul class="lines">
                  {#each a.costs as c, i (i)}<li><span><span class="pill cost">Cost</span> {c.text}</span><span class="num bad">{signed(c.value)}</span></li>{/each}
                  {#each a.always as x, i (i)}<li><span><span class="pill">Always</span> {fill(x.text)}</span><span class="num" class:good={x.value > 0.005} class:bad={x.value < -0.005}>{signed(x.value)}</span></li>{/each}
                </ul>
              {/if}
              {#if a.results.length}
                <div class="results">
                  {#each sorted(a) as r (r.kind)}
                    <div class="result" data-result={kindOf(a, r)}>
                      <div class="rhead">
                        <span class="rname">{labelOf(a, r)}</span>
                        <span class="rp">{pct(r.p)}</span>
                        <span class="num" class:good={r.value > 0.005} class:bad={r.value < -0.005}>{signed(r.value)}</span>
                      </div>
                      {#if r.effects.length}
                        <ul class="lines">{#each r.effects as x, i (i)}<li><span>{fill(x.text)}</span><span class="num muted">{signed(x.value)}</span></li>{/each}</ul>
                      {:else}
                        <p class="muted small">Nothing happens.</p>
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else if !a.costs.length && !a.always.length}
                <p class="muted small">Nothing happens.</p>
              {/if}
            </article>
          {/each}
        </div>
        <p class="muted small">
          G for your company, over the days each employee has left where an effect lasts (a stat, a trait, a wage). Each result shows its own G;
          an answer's total weighs them by their chance. Not counted: an employee quitting from low happiness, and the chance of later events.
        </p>
      {:else if one}
        <p class="muted">Pick the second employee.</p>
      {:else}
        <p class="muted">Pick the employee the event is about.</p>
      {/if}
    {/if}
  </section>
{/if}

<style>
  /* The game's colors: event kinds and results. */
  [data-pool='inspiration'] { --pool: #48bb78; }
  [data-pool='crisis'] { --pool: #f56565; }
  [data-pool='social'] { --pool: #63b3ed; }
  [data-pool='world'] { --pool: #ed8936; }
  [data-pool='life'] { --pool: #9f7aea; }
  [data-pool='cozy'] { --pool: #38b2ac; }
  [data-pool='legendary'] { --pool: #ecc94b; }
  [data-pool='chain'] { --pool: #7f9cf5; }
  [data-result='crit'] { --result: #ecc94b; }
  [data-result='success'] { --result: #48bb78; }
  [data-result='fail'] { --result: #f56565; }
  [data-result='critFail'] { --result: #9f7aea; }
  [data-result='certain'] { --result: #a0aec0; }

  .small { font-size: 12px; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .search { width: 100%; margin: 10px 0 8px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 9px 12px; color: var(--text); font-size: 14px; }
  .pools { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 4px 11px; font-size: 12px; color: var(--text); cursor: pointer; }
  .chip::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--pool); }
  .chip:not([data-pool])::before { display: none; }
  .chip small { color: var(--muted); }
  .chip[aria-pressed='true'] { border-color: var(--pool, var(--accent)); background: color-mix(in srgb, var(--pool, var(--accent)) 16%, var(--surface-2)); }
  .chip:not([data-pool])[aria-pressed='true'] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--surface-2)); }

  .events { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; max-height: 460px; overflow-y: auto; padding: 2px; }
  .event { position: relative; display: grid; gap: 4px; align-content: start; text-align: left; background: var(--surface-2); border: 1px solid var(--line); border-left: 4px solid var(--pool); border-radius: var(--radius-sm); padding: 9px 11px; cursor: pointer; color: var(--text); transition: border-color .15s, background .15s; }
  .event:hover { background: color-mix(in srgb, var(--pool) 8%, var(--surface-2)); }
  .event.on { border-color: var(--pool); background: color-mix(in srgb, var(--pool) 14%, var(--surface-2)); }
  .event .head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .event .title { font-weight: 600; font-size: 14px; }
  .event .when { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .event .pair { font-size: 11px; color: var(--muted); }
  .kind { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; color: var(--pool); white-space: nowrap; }

  .detail { border-top: 4px solid var(--pool); }
  .banner { padding: 4px 0 12px; border-bottom: 1px solid var(--line); margin-bottom: 12px; }
  .banner h2 { margin: 2px 0 4px; font-size: 20px; text-transform: none; letter-spacing: 0; color: var(--text); }
  .banner p { margin: 0; color: var(--muted); font-size: 13px; }
  .who { display: flex; flex-wrap: wrap; gap: 12px; }
  .who label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); min-width: 240px; }
  select { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 7px 9px; color: var(--text); font-size: 14px; }
  .stats { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
  .stats span { display: grid; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 10px; font-size: 13px; font-weight: 600; }
  .stats small { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 600; }
  .stats .traits { font-weight: 500; }

  .verdict { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 12px 14px; border: 1px solid var(--good); border-radius: var(--radius); background: color-mix(in srgb, var(--good) 10%, var(--surface)); margin: 4px 0 12px; }
  .verdict .label { width: 100%; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  .verdict strong { font-size: 17px; }
  .verdict .ev { font-size: 18px; font-weight: 700; }

  .answers { display: grid; gap: 10px; }
  .answer { border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; background: var(--surface); }
  .answer.best { border-color: var(--good); box-shadow: 0 0 0 1px color-mix(in srgb, var(--good) 40%, transparent); }
  .answer.off { opacity: .55; }
  .answer header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .answer .name { font-size: 15px; }
  .tags { display: inline-flex; flex-wrap: wrap; gap: 4px; }
  .answer header .ev { margin-left: auto; font-size: 18px; font-weight: 700; }
  .answer header .ev small { font-size: 12px; font-weight: 500; color: var(--muted); }
  .tag { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
  .tag.good { border-color: var(--good); color: var(--good); }
  .tag.bad { border-color: var(--bad); color: var(--bad); }

  .odds { display: flex; gap: 2px; height: 8px; border-radius: 4px; overflow: hidden; margin: 10px 0 4px; background: var(--surface-2); }
  .odds span { background: var(--result); min-width: 3px; }
  .check { margin: 0 0 6px; color: var(--text); }

  .lines { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 3px; font-size: 13px; }
  .lines li { display: flex; justify-content: space-between; gap: 10px; }
  .pill { display: inline-block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; font-weight: 700; padding: 0 6px; border-radius: 4px; background: var(--surface-2); color: var(--muted); }
  .pill.cost { color: var(--bad); }

  .results { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; margin-top: 10px; }
  .result { border: 1px solid color-mix(in srgb, var(--result) 45%, var(--line)); border-left: 4px solid var(--result); border-radius: var(--radius-sm); padding: 8px 10px; background: color-mix(in srgb, var(--result) 6%, var(--surface)); }
  .result .rhead { display: flex; align-items: baseline; gap: 8px; }
  .result .rname { font-weight: 700; color: var(--result); font-size: 13px; }
  .result .rp { font-size: 12px; color: var(--muted); }
  .result .rhead .num { margin-left: auto; font-weight: 600; }
  .result .lines { font-size: 12px; }
  .result p { margin: 4px 0 0; }
</style>
