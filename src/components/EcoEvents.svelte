<script>
  /**
   * Worker events: find the event the game shows you, pick the employee (and
   * the second one, for two-person events), and every answer is worked out in
   * gold for your company (events.js): its cost, each result's chance and
   * what that result does to them and their coworkers. Best first.
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
  const pct = (p) => `${fmt(p * 100, p < 0.1 ? 1 : 0)} %`;
  const POOL = { inspiration: 'Inspiration', crisis: 'Crisis', social: 'Social', life: 'Life', cozy: 'Cozy', world: 'World', legendary: 'Legendary', chain: 'Follow-up' };

  // The events, by name.
  const list = Object.keys(EVENTS).map((code) => ({ code, title: TEXTS[code]?.title ?? code, when: TEXTS[code]?.when ?? '', pool: EVENTS[code].pool, two: EVENTS[code].participants === 2 }))
    .sort((a, b) => a.title.localeCompare(b.title));
  let query = $state('');
  const shown = $derived(query.trim() ? list.filter((e) => `${e.title} ${e.when}`.toLowerCase().includes(query.trim().toLowerCase())) : list);
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
    The chance of a check is the game's: its base, the traits it names, +2 % per level of your Leadership ({leadership} now), the employee's Luck and happiness.
    Luck decides the result, but this is the best bet.
  </p>
  <input class="search" type="search" bind:value={query} placeholder="Search events: name or trigger (e.g. Eureka, tool, Gambler)" aria-label="Search events" />
  <div class="events" role="list">
    {#each shown as e (e.code)}
      <button type="button" role="listitem" class="event" class:on={picked === e.code} onclick={() => pick(e.code)}>
        <span class="title">{e.title}{#if e.two} <small class="tag">2 employees</small>{/if}</span>
        <span class="pool" data-pool={e.pool}>{POOL[e.pool] ?? e.pool}</span>
        <span class="when muted">{e.when}</span>
      </button>
    {:else}
      <p class="muted small">No event matches.</p>
    {/each}
  </div>
</section>

{#if picked}
  {@const t = TEXTS[picked]}
  <section class="card" id="event-detail">
    <h2>{t.title}</h2>
    <p class="small"><strong>When:</strong> {t.when}</p>
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
        {#if one}
          <p class="muted small">
            {one.company.name} · Production {one.e.production} · happiness {fmt(one.e.happiness?.value ?? 50, 0)} · Luck {one.e.stats?.luck?.total ?? '?'}
            {#if one.e.traits?.filter(Boolean).length} · {one.e.traits.filter(Boolean).map(traitName).join(', ')}{/if}
          </p>
        {/if}
      </div>

      {#if needsTwo && one && !coworkers.length}
        <p class="muted">This event needs two employees in the same company.</p>
      {:else if answers.length}
        {#if best}
          <p class="verdict"><strong>Pick: {fill(best.label)}</strong> · {signed(best.ev)} G expected{#if best.chance != null}, {pct(best.chance)} to succeed{/if}.</p>
        {/if}
        <div class="answers">
          {#each answers as a (a.key)}
            <article class="answer" class:best={a === best} class:off={!a.available}>
              <header>
                <strong>{fill(a.label)}</strong>
                {#if a === best}<span class="tag good">best</span>{/if}
                {#if a.isDefault}<span class="tag">if you don't answer</span>{/if}
                {#if a.risky}<span class="tag bad">can lose the employee</span>{/if}
                {#if !a.available}<span class="tag">not possible for them</span>{/if}
                <span class="ev num" class:good={a.ev > 0.005} class:bad={a.ev < -0.005}>{signed(a.ev)} G</span>
              </header>
              {#if a.chance != null}<p class="small muted">{a.check.type === 'luck' ? 'Luck check' : 'Check'}: {pct(a.chance)} to succeed (base {a.check.base} %).</p>{/if}
              <ul class="lines">
                {#each a.costs as c, i (i)}<li><span>Cost: {c.text}</span><span class="num bad">{signed(c.value)}</span></li>{/each}
                {#each a.always as x, i (i)}<li><span>Always: {fill(x.text)}</span><span class="num" class:good={x.value > 0.005} class:bad={x.value < -0.005}>{signed(x.value)}</span></li>{/each}
                {#each a.results as r (r.kind)}
                  <li class="result"><span>{resultLabel(r.kind)} <small class="muted">{pct(r.p)}</small>{#if !r.effects.length} · nothing happens{/if}</span><span class="num" class:good={r.value > 0.005} class:bad={r.value < -0.005}>{signed(r.value)}</span></li>
                  {#each r.effects as x, i (i)}<li class="sub"><span>{fill(x.text)}</span><span class="num muted">{signed(x.value)}</span></li>{/each}
                {/each}
              </ul>
            </article>
          {/each}
        </div>
        <p class="muted small">
          G for your company, over the days each employee has left where an effect lasts (a stat, a trait, a wage). Results' G are before their chance;
          the total weighs them by it. Not counted: an employee quitting from low happiness, and the chance of later events.
        </p>
      {:else if one}
        <p class="muted">Pick the second employee.</p>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .small { font-size: 12px; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .search { width: 100%; margin: 10px 0; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px 10px; color: var(--text); }
  .events { display: grid; gap: 4px; max-height: 340px; overflow-y: auto; }
  .event { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; text-align: left; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 7px 10px; cursor: pointer; color: var(--text); }
  .event.on { border-color: var(--accent); }
  .event .when { grid-column: 1 / -1; font-size: 12px; }
  .pool { font-size: 11px; color: var(--muted); }
  .tag { font-size: 11px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); font-weight: 400; }
  .tag.good { border-color: var(--good); color: var(--good); }
  .tag.bad { border-color: var(--bad); color: var(--bad); }
  .who { display: grid; gap: 8px; margin: 10px 0; }
  .who label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); max-width: 360px; }
  select { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 8px; color: var(--text); }
  .verdict { padding: 10px 12px; border: 1px solid var(--accent); border-radius: var(--radius); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); margin: 8px 0; }
  .answers { display: grid; gap: 8px; }
  .answer { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; }
  .answer.best { border-color: var(--good); }
  .answer.off { opacity: .6; }
  .answer header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .answer header .ev { margin-left: auto; font-weight: 700; }
  .answer p { margin: 4px 0; }
  .lines { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 2px; font-size: 13px; }
  .lines li { display: flex; justify-content: space-between; gap: 10px; }
  .lines li.sub { padding-left: 14px; font-size: 12px; }
  .lines li.result { margin-top: 4px; }
</style>
