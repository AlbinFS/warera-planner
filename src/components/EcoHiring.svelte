<script>
  /**
   * Next employee: for each company, who to hire next (or replace someone
   * with, when full). Traits that match the team come first; otherwise the
   * community tier list decides. Also the training cards worth picking for
   * the current employees (src/lib/hiring.js).
   */
  import { ecoEmployees } from '../lib/eco.svelte.js';
  import { companyModel, bestHires, hireValue, rankTraits, trainingCards, traitChance, placeOf, fairWageOf, TRAITS, TIERS } from '../lib/hiring.js';
  import { cached } from '../lib/warera.js';
  import { fmt } from '../lib/format.js';
  import { itemImage, flagImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import TraitChip from './TraitChip.svelte';
  import EcoCandidates from './EcoCandidates.svelte';

  let { companies, perPoint, items, managementPercent = 0 } = $props();

  let countries = $state.raw({});
  let regions = $state.raw({});
  cached('country.getAllCountries', {}, 60 * 60 * 1000).then((list) => (countries = Object.fromEntries((list ?? []).map((c) => [c._id, c])))).catch(() => {});
  cached('region.getRegionsObject', {}, 60 * 60 * 1000).then((r) => (regions = r ?? {})).catch(() => {});

  const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
  const OTHER = 'other';
  const countryName = (id) => (id === OTHER ? 'Any other country' : countries[id]?.name ?? 'Unknown country');
  const EVENT_ONLY = ['oldFriends', 'sweethearts', 'nemesis'];

  const fairWage = $derived(fairWageOf(Object.values(ecoEmployees).flat()));

  /**
   * Per nationality and gender: the best plain hire (and who they'd replace),
   * the traits ranked for them, and the trait to look for: the best team
   * match, else the top of the tier list. Profiles with a team match win.
   */
  function plan(c) {
    const team = ecoEmployees[c.id] ?? [];
    const place = placeOf(c, { regions, countries, items });
    const model = companyModel(team, place, { perPoint: perPoint[c.good] ?? 0, fairWage, management: managementPercent });
    const full = team.length >= (c.breakRoom ?? 1);
    const all = bestHires(model, { otherNationality: OTHER, full });
    const profiles = all.filter((h) => !h.trait).map((plain) => {
      const replace = full ? team.findIndex((e) => e.name === plain.replaces) : null;
      const ranked = rankTraits(model, { nationality: plain.nationality, gender: plain.gender }, { replace });
      const pick = ranked.matches[0] ?? ranked.lookFor[0] ?? null;
      return { plain, replace, ranked, pick, score: plain.value + (pick?.gain ?? 0) };
    });
    const withMatch = profiles.filter((p) => p.ranked.matches.length);
    const best = (withMatch.length ? withMatch : profiles).reduce((a, b) => (b.score > a.score ? b : a));
    const ideal = hireValue(model, { nationality: best.plain.nationality, gender: best.plain.gender, trait: best.pick?.trait ?? null }, { replace: best.replace });
    // Whether nationality or gender changes anything for this pick (else it says "any").
    const alike = (p) => p.pick?.trait === best.pick?.trait && Math.abs(p.score - best.score) < 0.01;
    const anyNationality = profiles.filter((p) => p.plain.gender === best.plain.gender).every(alike);
    const anyGender = !TRAITS[best.pick?.trait]?.gender && profiles.filter((p) => p.plain.nationality === best.plain.nationality).every(alike);
    const nationalities = [...new Set(profiles.map((p) => p.plain.nationality))]
      .map((n) => ({ nationality: n, value: Math.max(...profiles.filter((p) => p.plain.nationality === n).map((p) => p.plain.value)) }))
      .sort((a, b) => b.value - a.value);
    const genders = ['male', 'female'].map((g) => ({ gender: g, value: profiles.find((p) => p.plain.gender === g && p.plain.nationality === best.plain.nationality).plain.value }));
    const cards = team.map((e, i) => ({ name: e.name, cards: trainingCards(model, i).slice(0, 2) })).filter((x) => x.cards.length);
    return { company: c, team, full, best, ideal, anyNationality, anyGender, nationalities, genders, cards };
  }
  const plans = $derived(companies.filter((c) => !c.disabled).map(plan));
</script>

{#snippet flag(id)}
  {#if countries[id]?.code}<img class="flag" src={flagImage(countries[id].code)} alt="" width="18" height="13" />{/if}
{/snippet}

{#snippet traitRow(t, kind)}
  <li>
    <span><TraitChip code={t.trait} />{#if kind === 'match'}<small class="tag good">matches your team</small>{:else if kind === 'clash'}<small class="tag bad">clashes with your team</small>{/if}<small class="muted">{fmt(traitChance(t.trait) * 100, 1)}%</small></span>
    <span class="num" class:good={t.gain > 0.005} class:bad={t.gain < -0.005}>{signed(t.gain)}</span>
  </li>
{/snippet}

<EcoCandidates {companies} {perPoint} {items} {managementPercent} />

<section class="card">
  <h2>Trait tier list</h2>
  <p class="muted small">The community's tier list, for a hire who doesn't need to match anyone. In each company below, traits that match the employees already there come first. Hover a trait for what it does.</p>
  <dl class="tiers">
    {#each Object.entries(TIERS) as [tier, codes] (tier)}
      <div><dt data-tier={tier}>{tier}</dt><dd>{#each codes as code (code)}<TraitChip {code} />{#if EVENT_ONLY.includes(code)}<small class="muted">events only</small>{/if}{/each}</dd></div>
    {/each}
  </dl>
</section>

<section class="card">
  <p class="muted small intro">
    Values are G per day after the newcomer's wage, counting the newcomer and every coworker's change. A candidate is assumed to have
    average stats (2.5 Production, plus 2 from training in the first weeks) and a fair wage; half of candidates have no trait, and the %
    is how many have that one.
  </p>
</section>

{#each plans as p (p.company.id)}
  <section class="card" aria-label="Next employee for {p.company.name}">
    <div class="head">
      <h2><img src={itemImage(p.company.good, items)} alt="" width="22" height="22" /> {p.company.name} · {itemLabel(p.company.good) || p.company.good}</h2>
      <span class="muted small">{p.team.length} of {p.company.breakRoom} employees{#if p.full} · full, so a hire replaces someone{/if}</span>
    </div>

    <div class="ideal">
      <span class="label">{p.full ? `Ideal replacement for ${p.ideal.replaces}` : 'Ideal next hire'}</span>
      <strong class="who">
        {#if p.anyNationality}Any nationality{:else}{@render flag(p.best.plain.nationality)} {countryName(p.best.plain.nationality)}{/if}
        · {p.anyGender ? 'any gender' : p.best.plain.gender === 'male' ? 'man' : 'woman'}
        · {#if p.best.pick}<TraitChip code={p.best.pick.trait} />{#if p.best.ranked.matches.length}<small class="tag good">matches your team</small>{/if}{:else}any trait{/if}
      </strong>
      <span class="num value" class:good={p.ideal.value >= 0} class:bad={p.ideal.value < 0}>{signed(p.ideal.value)} G/day</span>
      <span class="muted small">{signed(p.ideal.points, 1)} points a day{#if p.best.pick} · without a trait: {signed(p.best.plain.value)} G/day{/if}</span>
      {#if p.ideal.coworkers.some((c) => Math.abs(c.change) > 0.05)}
        <ul class="effects">
          {#each p.ideal.coworkers.filter((c) => Math.abs(c.change) > 0.05) as c (c.name)}
            <li><span>{c.name}{#each c.traits as t (t)} <TraitChip code={t} />{/each}</span><span class="num" class:good={c.change > 0} class:bad={c.change < 0}>{signed(c.change, 1)} points</span></li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="grid">
      <div>
        <h3>Traits to look for</h3>
        <ul class="rows">
          {#each p.best.ranked.matches as t (t.trait)}{@render traitRow(t, 'match')}{/each}
          {#each p.best.ranked.lookFor.slice(0, Math.max(3, 8 - p.best.ranked.matches.length)) as t (t.trait)}{@render traitRow(t)}{/each}
        </ul>
        <h3>Traits to avoid</h3>
        <ul class="rows">
          {#each p.best.ranked.clashes as t (t.trait)}{@render traitRow(t, 'clash')}{/each}
          {#each p.best.ranked.avoid.slice(0, Math.max(3, 6 - p.best.ranked.clashes.length)) as t (t.trait)}{@render traitRow(t)}{/each}
        </ul>
        <p class="muted small">Against the same hire without a trait, G per day. Team matches first, then by tier.</p>
      </div>
      <div>
        <h3>Nationality</h3>
        <ul class="rows">
          {#each p.nationalities as n (n.nationality)}
            <li><span>{@render flag(n.nationality)} {countryName(n.nationality)}</span><span class="num">{signed(n.value)}</span></li>
          {/each}
        </ul>
        <h3>Gender</h3>
        <ul class="rows">
          {#each p.genders as g (g.gender)}<li><span>{g.gender === 'male' ? 'Man' : 'Woman'}</span><span class="num">{signed(g.value)}</span></li>{/each}
        </ul>
        <p class="muted small">Without a trait, G per day.</p>
      </div>
      {#if p.cards.length}
        <div>
          <h3>Training cards to pick</h3>
          <ul class="rows">
            {#each p.cards as e (e.name)}
              <li class="emp"><span>{e.name}</span></li>
              {#each e.cards as c, i (i)}
                <li class="card-row"><span>{c.card}: {#if c.trait}{c.card === 'Rehab' ? 'remove' : 'learn'} <TraitChip code={c.trait} />{:else}{c.what}{/if}</span><span class="num" class:good={c.value > 0}>{signed(c.value)}</span></li>
              {/each}
            {/each}
          </ul>
          <p class="muted small">What the card adds per day, coworkers included. Drill counts its higher wage.</p>
        </div>
      {/if}
    </div>
  </section>
{/each}

<style>
  .intro { margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .head h2 { display: flex; align-items: center; gap: 8px; margin: 0; }
  .small { font-size: 12px; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tiers { display: grid; gap: 6px; margin: 10px 0 0; }
  .tiers div { display: grid; grid-template-columns: 34px 1fr; gap: 8px; align-items: start; }
  .tiers dt { display: grid; place-items: center; height: 26px; border-radius: var(--radius-sm); font-weight: 800; color: #16161a; background: var(--tier); }
  .tiers dd { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  [data-tier='S'] { --tier: #f472b6; }
  [data-tier='A'] { --tier: #fb923c; }
  [data-tier='B'] { --tier: #facc15; }
  [data-tier='C'] { --tier: #4ade80; }
  [data-tier='D'] { --tier: #60a5fa; }
  [data-tier='E'] { --tier: #a78bfa; }
  [data-tier='F'] { --tier: #f87171; }
  .ideal { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--accent); border-radius: var(--radius); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); margin-bottom: 12px; }
  .ideal .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .ideal .who { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 16px; }
  .ideal .value { text-align: left; font-size: 18px; font-weight: 700; }
  .effects { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 4px; font-size: 13px; max-width: 520px; }
  .effects li, .rows li { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .effects li > span:first-child { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px 24px; }
  h3 { font-size: 12px; color: var(--muted); font-weight: 600; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: .04em; }
  .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 13px; }
  .rows li > span:first-child { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .rows .emp { margin-top: 4px; font-weight: 600; }
  .rows .card-row { padding-left: 12px; }
  .tag { font-size: 11px; }
  .flag { border-radius: 2px; vertical-align: middle; }
</style>
