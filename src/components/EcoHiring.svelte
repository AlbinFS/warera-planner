<script>
  /**
   * Next employee: for each company, the nationality, gender and trait that
   * would add the most per day given who already works there, the traits to
   * look for and to avoid, and the training cards worth picking for the
   * current employees (src/lib/hiring.js).
   */
  import { ecoEmployees } from '../lib/eco.svelte.js';
  import { companyModel, bestHires, trainingCards, traitChance, traitName, TRAITS } from '../lib/hiring.js';
  import { cached } from '../lib/warera.js';
  import { fmt } from '../lib/format.js';
  import { itemImage, flagImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';

  let { companies, perPoint, items, managementPercent = 0 } = $props();

  let countries = $state.raw({});
  let regions = $state.raw({});
  cached('country.getAllCountries', {}, 60 * 60 * 1000).then((list) => (countries = Object.fromEntries((list ?? []).map((c) => [c._id, c])))).catch(() => {});
  cached('region.getRegionsObject', {}, 60 * 60 * 1000).then((r) => (regions = r ?? {})).catch(() => {});

  const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
  const OTHER = 'other';
  const countryName = (id) => (id === OTHER ? 'Any other country' : countries[id]?.name ?? 'Unknown country');

  // Fair wage per Production point per day, from what the employees are paid.
  const fairWage = $derived.by(() => {
    const per = Object.values(ecoEmployees).flat().filter((e) => e.wageExpectation > 0 && e.ownProduction > 0).map((e) => e.payroll / (e.wageExpectation * e.ownProduction)).sort((a, b) => a - b);
    return per.length ? per[per.length >> 1] : 0.6;
  });

  const plans = $derived(companies.filter((c) => !c.disabled).map((c) => {
    const team = ecoEmployees[c.id] ?? [];
    const region = regions[c.region];
    const place = {
      raw: items[c.good]?.type === 'raw',
      storage: c.storage ?? 1,
      country: region?.country ?? null,
      homeCountry: region?.initialCountry ?? null,
      tax: countries[region?.country]?.taxes?.income ?? 0,
    };
    const model = companyModel(team, place, { perPoint: perPoint[c.good] ?? 0, fairWage, management: managementPercent });
    const full = team.length >= (c.breakRoom ?? 1);
    const all = bestHires(model, { otherNationality: OTHER, full });
    const ideal = all[0];
    // Whether the ideal's nationality or gender matters at all (else it says "any").
    const same = (h) => h.trait === ideal.trait;
    const spread = (list) => Math.max(...list.map((h) => h.value)) - Math.min(...list.map((h) => h.value));
    const anyNationality = spread(all.filter((h) => same(h) && h.gender === ideal.gender)) < 0.01;
    const anyGender = spread(all.filter((h) => same(h) && h.nationality === ideal.nationality)) < 0.01 && !(ideal.trait && TRAITS[ideal.trait].gender);
    const plain = (nationality, gender) => all.find((h) => !h.trait && h.nationality === nationality && h.gender === gender);
    const baseline = plain(ideal.nationality, ideal.gender);
    const nationalities = [...new Set(all.map((h) => h.nationality))].map((n) => {
      const best = [plain(n, 'male'), plain(n, 'female')].sort((a, b) => b.value - a.value)[0];
      return { nationality: n, value: best.value, coworkers: best.coworkers };
    }).sort((a, b) => b.value - a.value);
    const traits = all.filter((h) => h.trait && h.nationality === ideal.nationality && h.gender === ideal.gender)
      .map((h) => ({ trait: h.trait, gain: h.value - baseline.value, chance: traitChance(h.trait, h.gender) }));
    const cards = team.map((e, i) => ({ name: e.name, cards: trainingCards(model, i).slice(0, 2) })).filter((x) => x.cards.length);
    return {
      company: c, team, ideal, baseline, nationalities,
      lookFor: traits.filter((t) => t.gain > 0.005).sort((a, b) => b.gain - a.gain).slice(0, 6),
      avoid: traits.filter((t) => t.gain < -0.005).sort((a, b) => a.gain - b.gain).slice(0, 5),
      genders: ['male', 'female'].map((g) => ({ gender: g, value: plain(ideal.nationality, g).value })),
      cards, full, anyNationality, anyGender,
    };
  }));
</script>

{#snippet flag(id)}
  {#if countries[id]?.code}<img class="flag" src={flagImage(countries[id].code)} alt="" width="18" height="13" />{/if}
{/snippet}

<section class="card">
  <p class="muted intro">
    For each company: the next employee that adds the most per day, given who already works there. Traits that react to coworkers
    (Xenophobe, Cosmopolitan, Nationalist, Comic, Girl Power, …) and to the company's country (Patriot, Homesick, Expat) are counted for
    the newcomer and for everyone already there. A candidate is assumed to have average stats (2.5) and a fair wage; half of candidates
    have no trait. Values are per day, after the newcomer's wage.
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
        {#if p.anyNationality}Any nationality{:else}{@render flag(p.ideal.nationality)} {countryName(p.ideal.nationality)}{/if}
        · {p.anyGender ? 'any gender' : p.ideal.gender === 'male' ? 'man' : 'woman'}
        · {#if p.ideal.trait}<span class="chip good">{traitName(p.ideal.trait)}</span>{:else}no trait needed{/if}
      </strong>
      <span class="num value" class:good={p.ideal.value >= 0} class:bad={p.ideal.value < 0}>{signed(p.ideal.value)} G/day</span>
      <span class="muted small">
        {signed(p.ideal.points, 1)} points a day
        {#if p.ideal.trait} · about {fmt(traitChance(p.ideal.trait, p.ideal.gender) * 100, 1)}% of candidates have {traitName(p.ideal.trait)}; without a trait: {signed(p.baseline.value)} G/day{/if}
      </span>
      {#if p.ideal.coworkers.some((c) => Math.abs(c.change) > 0.05)}
        <ul class="effects">
          {#each p.ideal.coworkers.filter((c) => Math.abs(c.change) > 0.05) as c (c.name)}
            <li><span>{c.name}{#if c.traits.length} <span class="muted">({c.traits.map(traitName).join(', ')})</span>{/if}</span><span class="num" class:good={c.change > 0} class:bad={c.change < 0}>{signed(c.change, 1)} points</span></li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="grid">
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
      <div>
        <h3>Traits to look for</h3>
        <ul class="rows">
          {#each p.lookFor as t (t.trait)}
            <li title={TRAITS[t.trait].note}><span>{traitName(t.trait)} <small class="muted">{fmt(t.chance * 100, 1)}%</small></span><span class="num good">{signed(t.gain)}</span></li>
          {:else}<li class="muted">None adds anything here.</li>{/each}
        </ul>
        <h3>Traits to avoid</h3>
        <ul class="rows">
          {#each p.avoid as t (t.trait)}
            <li title={TRAITS[t.trait].note}><span>{traitName(t.trait)} <small class="muted">{fmt(t.chance * 100, 1)}%</small></span><span class="num bad">{signed(t.gain)}</span></li>
          {:else}<li class="muted">Nothing costs much here.</li>{/each}
        </ul>
        <p class="muted small">Against the same hire without a trait, G per day; % = how many candidates have it. Hover for what it does.</p>
      </div>
      {#if p.cards.length}
        <div>
          <h3>Training cards to pick</h3>
          <ul class="rows">
            {#each p.cards as e (e.name)}
              <li class="emp"><span>{e.name}</span></li>
              {#each e.cards as c, i (i)}
                <li class="card-row"><span>{c.card}: {c.trait ? `${c.card === 'Rehab' ? 'remove' : 'learn'} ${traitName(c.trait)}` : c.what}</span><span class="num" class:good={c.value > 0}>{signed(c.value)}</span></li>
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
  .ideal { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--accent); border-radius: var(--radius); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); margin-bottom: 12px; }
  .ideal .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .ideal .who { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 16px; }
  .ideal .value { text-align: left; font-size: 18px; font-weight: 700; }
  .effects { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 2px; font-size: 13px; max-width: 460px; }
  .effects li, .rows li { display: flex; justify-content: space-between; gap: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px 24px; }
  h3 { font-size: 12px; color: var(--muted); font-weight: 600; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: .04em; }
  .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; font-size: 13px; }
  .rows li > span:first-child { display: inline-flex; align-items: center; gap: 6px; }
  .rows .emp { margin-top: 4px; font-weight: 600; }
  .rows .card-row { padding-left: 12px; }
  .chip { font-size: 12px; padding: 1px 8px; border-radius: 999px; border: 1px solid currentColor; }
  .flag { border-radius: 2px; vertical-align: middle; }
</style>
