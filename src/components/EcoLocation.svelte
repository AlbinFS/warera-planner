<script>
  /**
   * Where each company is best off: what its employees make where it is now,
   * against every other region (income tax as happiness, the core-region
   * bonus, attacks, and the traits that care where they work), what a move
   * costs (every employee −10 happiness for 7 days) and how soon it pays back.
   * In a core region your country has lost: how soon it would have to be
   * retaken for waiting to beat moving. The employees' income tax goes to
   * whoever holds the region, so the options come by holder: your country,
   * your allies (to back them), and the best of the rest.
   */
  import { ecoEmployees } from '../lib/eco.svelte.js';
  import { companyModel, placeOf, placeValue, fairWageOf } from '../lib/hiring.js';
  import { planner } from '../lib/planner.svelte.js';
  import { cached } from '../lib/warera.js';
  import { fmt } from '../lib/format.js';
  import { itemImage, flagImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';

  let { companies, perPoint, items } = $props();

  let countries = $state.raw({});
  let regions = $state.raw({});
  cached('country.getAllCountries', {}, 60 * 60 * 1000).then((list) => (countries = Object.fromEntries((list ?? []).map((c) => [c._id, c])))).catch(() => {});
  cached('region.getRegionsObject', {}, 60 * 60 * 1000).then((r) => (regions = r ?? {})).catch(() => {});

  const home = $derived(planner.player?.countryId ?? null);
  const fairWage = $derived(fairWageOf(Object.values(ecoEmployees).flat()));
  const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
  const countryName = (id) => countries[id]?.name ?? 'Unknown country';
  const days = (d) => (d < 1 ? 'under a day' : `about ${fmt(d, d < 10 ? 1 : 0)} days`);
  // Gains below this a day are noise.
  const MIN_GAIN = 0.01;
  const NAMES_SHOWN = 4;
  // Options shown in each part: your country, every ally (the best region of each), anyone else.
  const SHOWN = { home: 2, ally: Infinity, other: 2 };
  const SECTIONS = [
    { id: 'home', label: 'Held by your country' },
    { id: 'ally', label: 'Held by your allies (they get the tax)' },
    { id: 'other', label: 'Anywhere else' },
  ];
  // Who holds a region, to your country: yours, an ally, at war with you, or neither.
  function relation(holder) {
    const me = countries[home];
    if (!holder || !me) return 'other';
    if (holder === home) return 'home';
    if (me.allies?.includes(holder)) return 'ally';
    return me.warsWith?.includes(holder) ? 'enemy' : 'other';
  }
  const TAG = { ally: 'ally', enemy: 'at war with you' };

  function plan(c) {
    const team = ecoEmployees[c.id] ?? [];
    const world = { regions, countries, items, home };
    const model = companyModel(team, placeOf(c, world), { perPoint: perPoint[c.good] ?? 0, fairWage });
    const region = regions[c.region];
    const now = placeValue(model, {}).worth;
    const here = model.place;
    // Every other region, grouped where they'd make the same (same holder, core or not, home country for Patriots).
    const groups = new Map();
    for (const r of Object.values(regions)) {
      if (r._id === c.region) continue;
      const place = placeOf({ ...c, region: r._id }, world);
      const key = [place.country, place.core, place.homeCountry, place.tax].join('|');
      let g = groups.get(key);
      if (!g) {
        const v = placeValue(model, place);
        g = { place, gain: v.worth - now, moveCost: v.moveCost, regions: [] };
        groups.set(key, g);
      }
      g.regions.push(r.name);
    }
    const ranked = [...groups.values()].sort((a, b) => b.gain - a.gain || a.moveCost - b.moveCost);
    for (const g of ranked) { g.regions.sort(); g.relation = relation(g.place.country); }
    const bestOf = new Set();
    const sections = {
      // Your country's and your allies' regions even when they don't pay: you may want to back them anyway.
      home: ranked.filter((g) => g.relation === 'home').slice(0, SHOWN.home),
      // One row per ally, their best region.
      ally: ranked.filter((g) => g.relation === 'ally' && !bestOf.has(g.place.country) && bestOf.add(g.place.country)).slice(0, SHOWN.ally),
      other: ranked.filter((g) => (g.relation === 'other' || g.relation === 'enemy') && g.gain > MIN_GAIN).slice(0, SHOWN.other),
    };
    const options = ranked.filter((g) => g.gain > MIN_GAIN);
    // Lost to another country: what staying costs a day until it's retaken.
    const occupied = region && region.country !== region.initialCountry;
    const retaken = occupied && region.initialCountry === home
      ? placeValue(model, { country: home, tax: countries[home]?.taxes?.income ?? 0, attacked: 0 }).worth - now
      : null;
    const best = options[0] ?? null;
    return { company: c, team, region, here, now, sections, best, occupied, retaken, payback: best ? best.moveCost / best.gain : null, wait: best && retaken > MIN_GAIN ? best.moveCost / retaken : null };
  }
  const plans = $derived(Object.keys(regions).length ? companies.filter((c) => !c.disabled && (ecoEmployees[c.id] ?? []).length).map(plan) : []);
  const empty = $derived(companies.filter((c) => !c.disabled && !(ecoEmployees[c.id] ?? []).length).length);
</script>

{#snippet flag(id)}
  {#if countries[id]?.code}<img class="flag" src={flagImage(countries[id].code)} alt="" width="18" height="13" />{/if}
{/snippet}

<section class="card">
  <p class="intro muted">
    Where each company's employees make the most. A region changes their happiness by its country's income tax (−1 per 1 %) and −5 while it's attacked,
    gives +5 % in a core region of your country (even one another country holds now), and matters to Patriot, Homesick, Expat, Tax-shy and Statist.
    Moving costs every employee 10 happiness for 7 days, counted below as gold. Their income tax goes to whoever holds the region:
    your allies' regions are listed even when they make less, if you'd rather back them. Battles to come can't be foreseen: a region on the front line may be attacked.
  </p>
</section>

{#if !Object.keys(regions).length}
  <section class="card"><p class="muted">Loading regions…</p></section>
{/if}

{#each plans as p (p.company.id)}
  <section class="card" aria-label="Location of {p.company.name}">
    <div class="head">
      <h2><img src={itemImage(p.company.good, items)} alt="" width="22" height="22" /> {p.company.name} · {itemLabel(p.company.good) || p.company.good}</h2>
      <span class="muted small">{p.team.length} employee{p.team.length === 1 ? '' : 's'} · {p.company.freeMoves ? `${p.company.freeMoves} free move${p.company.freeMoves === 1 ? '' : 's'}` : 'no free move (a move costs extra)'}</span>
    </div>

    <p class="where">
      <span>Now in <strong>{p.region?.name ?? 'an unknown region'}</strong>, held by {@render flag(p.region?.country)} {countryName(p.region?.country)}{#if TAG[relation(p.region?.country)]} <small class="tag" data-rel={relation(p.region?.country)}>{TAG[relation(p.region?.country)]}</small>{/if}</span>
      · income tax {fmt(p.here.tax, 1)}% · {p.here.core ? 'core region (+5 %)' : 'not a core region of your country'}{#if p.here.attacked} · <span class="bad">attacked (−{fmt(p.here.attacked, 0)} happiness)</span>{/if}
      · <strong class="num">{fmt(p.now, 2)} G/day</strong> <span class="muted small">from the employees, before wages</span>
    </p>
    {#if p.occupied}
      <p class="small">{@render flag(p.region.initialCountry)} {countryName(p.region.initialCountry)}'s region, taken by {countryName(p.region.country)}.{#if p.retaken > MIN_GAIN}{' '}Staying costs about <strong class="bad">{fmt(p.retaken, 2)} G a day</strong> until it's taken back.{/if}</p>
    {/if}

    {#if p.best}
      <div class="verdict">
        <strong>
          {#if p.wait != null}
            Move, unless {countryName(p.region.initialCountry)} retakes {p.region.name} within {days(p.wait)}.
          {:else}
            Moving gains {signed(p.best.gain)} G a day.
          {/if}
        </strong>
        <span class="small">The move costs once about {fmt(p.best.moveCost, 2)} G (every employee −10 happiness for 7 days), paid back in {days(p.payback)}{p.company.freeMoves ? '' : ', plus the move\'s price'}.</span>
      </div>
    {:else}
      <p class="verdict stay"><strong>Stay:</strong> no other region makes these employees more.</p>
    {/if}
    <table>
      <thead><tr><th>Where to</th><th class="num">Tax</th><th>Core</th><th class="num">Gain a day</th><th class="num">Move cost</th><th class="num">Pays back</th></tr></thead>
      {#each SECTIONS as sec (sec.id)}
        {#if p.sections[sec.id].length}
          <tbody>
            <tr class="section"><th colspan="6">{sec.label}</th></tr>
            {#each p.sections[sec.id] as g, i (i)}
              <tr class:loses={g.gain <= MIN_GAIN}>
                <td>
                  {@render flag(g.place.country)} <strong>{countryName(g.place.country)}</strong>{#if TAG[g.relation] && sec.id !== 'ally'} <small class="tag" data-rel={g.relation}>{TAG[g.relation]}</small>{/if}{#if g.place.country !== g.place.homeCountry} <span class="muted small">(holds {countryName(g.place.homeCountry)}'s region)</span>{/if}<br />
                  <span class="muted small">{g.regions.slice(0, NAMES_SHOWN).join(', ')}{g.regions.length > NAMES_SHOWN ? ` and ${g.regions.length - NAMES_SHOWN} more` : ''}</span>
                </td>
                <td class="num">{fmt(g.place.tax, 1)}%</td>
                <td>{g.place.core ? '+5 %' : '–'}</td>
                <td class="num" class:good={g.gain > MIN_GAIN} class:bad={g.gain < -MIN_GAIN}>{signed(g.gain)} G</td>
                <td class="num">{fmt(g.moveCost, 2)} G</td>
                <td class="num">{g.gain > MIN_GAIN ? days(g.moveCost / g.gain) : 'never'}</td>
              </tr>
            {/each}
          </tbody>
        {/if}
      {/each}
    </table>
  </section>
{/each}

{#if empty}
  <p class="muted small">{empty} compan{empty === 1 ? 'y has' : 'ies have'} no employees: where they are doesn't change what they make.</p>
{/if}

<style>
  .intro { margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .head h2 { display: flex; align-items: center; gap: 8px; margin: 0; }
  .where { margin: 0 0 4px; display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
  p.small { margin: 0 0 8px; }
  .small { font-size: 12px; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .flag { vertical-align: -2px; border-radius: 2px; }
  .verdict { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--accent); border-radius: var(--radius); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); margin: 8px 0 10px; }
  .verdict.stay { border-color: var(--line); background: none; display: block; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
  th { font-size: 12px; color: var(--muted); font-weight: 600; }
  th.num { text-align: right; }
  tr.section th { padding-top: 12px; color: var(--text); text-transform: uppercase; letter-spacing: .04em; font-size: 11px; }
  tr.loses td { color: var(--muted); }
  .tag { font-size: 11px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
  .tag[data-rel='ally'] { border-color: var(--good); color: var(--good); }
  .tag[data-rel='enemy'] { border-color: var(--bad); color: var(--bad); }
  @media (max-width: 600px) {
    table { display: block; overflow-x: auto; }
  }
</style>
