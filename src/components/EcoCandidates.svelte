<script>
  /**
   * Rate today's candidates: type in what each card shows, and see what each
   * would add per day in every company (or, in a full one, as a replacement
   * for whoever adds least), with the employees already there counted.
   */
  import { ecoEmployees } from '../lib/eco.svelte.js';
  import { planner } from '../lib/planner.svelte.js';
  import { companyModel, rateCandidate, placeOf, fairWageOf, traitName, TRAITS, RETIRE_AGE } from '../lib/hiring.js';
  import { cached } from '../lib/warera.js';
  import { fmt } from '../lib/format.js';
  import { itemImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import TraitChip from './TraitChip.svelte';

  let { companies, perPoint, items, managementPercent = 0, toolboxValue = 0 } = $props();

  let countries = $state.raw({});
  let regions = $state.raw({});
  cached('country.getAllCountries', {}, 60 * 60 * 1000).then((list) => (countries = Object.fromEntries((list ?? []).map((c) => [c._id, c])))).catch(() => {});
  cached('region.getRegionsObject', {}, 60 * 60 * 1000).then((r) => (regions = r ?? {})).catch(() => {});
  const countryList = $derived(Object.values(countries).sort((a, b) => a.name.localeCompare(b.name)));

  // Today's cards, kept in this browser (new candidates come at 00:00 UTC).
  const KEY = 'eco.candidates.v1';
  const today = () => new Date().toISOString().slice(0, 10);
  const blank = (n) => ({ id: `${Date.now()}-${n}`, label: `Candidate ${n}`, production: 2, luck: 2, responsibility: 2, potential: 6, age: 30, expectation: 100, trait: '', gender: 'male', nationality: planner.player?.countryId ?? '' });
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } })();
  let cards = $state(saved ?? { day: today(), list: [blank(1), blank(2), blank(3)] });
  $effect(() => { const s = JSON.stringify(cards); try { localStorage.setItem(KEY, s); } catch {} });
  const stale = $derived(cards.day !== today());
  function reset() { cards = { day: today(), list: [blank(1), blank(2), blank(3)] }; }
  function add() { cards.list = [...cards.list, blank(cards.list.length + 1)]; }
  function remove(id) { cards.list = cards.list.filter((c) => c.id !== id); }

  const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;
  // Goods a company can make (for a Specialist's good).
  const goodCodes = $derived(Object.keys(perPoint).sort((a, b) => itemLabel(a).localeCompare(itemLabel(b))));
  const traitCodes = Object.keys(TRAITS).filter((t) => !['oldFriends', 'nemesis', 'sweethearts'].includes(t)).sort((a, b) => traitName(a).localeCompare(traitName(b)));

  const active = $derived(companies.filter((c) => !c.disabled));
  const fairWage = $derived(fairWageOf(Object.values(ecoEmployees).flat()));
  const models = $derived(active.map((c) => ({
    company: c,
    full: (ecoEmployees[c.id] ?? []).length >= (c.breakRoom ?? 1),
    model: companyModel(ecoEmployees[c.id] ?? [], placeOf(c, { regions, countries, items }), { perPoint: perPoint[c.good] ?? 0, fairWage, management: managementPercent, toolboxValue }),
  })));

  // Every candidate in every company.
  const scores = $derived(cards.list.map((card) => {
    const profile = {
      nationality: card.nationality || null, gender: card.gender, trait: card.trait || null, age: Number(card.age) || null,
      production: Math.max(1, Number(card.production) || 1), responsibility: Math.max(0, Number(card.responsibility) || 0), luck: Math.max(0, Number(card.luck) || 0),
      expectation: Math.min(1.6, Math.max(0.5, (Number(card.expectation) || 100) / 100)),
      specialistGood: card.trait === 'specialist' ? card.specialistGood || null : null,
    };
    const byCompany = models.map((m) => ({ company: m.company, full: m.full, ...rateCandidate(m.model, profile, { full: m.full }) }));
    const best = byCompany.reduce((a, b) => (!a || b.value > a.value ? b : a), null);
    return { card, byCompany, best, wage: byCompany[0]?.newWage ?? 0, days: card.age ? Math.max(0, RETIRE_AGE - Number(card.age)) : null };
  }));
  const top = $derived(scores.filter((s) => s.best).reduce((a, b) => (!a || b.best.value > a.best.value ? b : a), null));
</script>

<section class="card" aria-labelledby="cands-title">
  <div class="head">
    <h2 id="cands-title">Rate today's candidates</h2>
    <span class="muted small">{stale ? `Cards from ${cards.day}: new candidates come at 00:00 UTC.` : `Today, ${cards.day}`} <button class="link" onclick={reset}>Start today's cards</button></span>
  </div>
  <p class="muted small">
    Type in what each candidate card shows. Each is scored in every company: what they add per day after their wage, coworkers included.
    In a full company, as a replacement for whoever that helps most. Expectation is the hidden part of the wage, hinted on the card (70–130%).
  </p>

  <div class="scroll">
    <table class="cards">
      <thead><tr><th>Candidate</th><th>Prod.</th><th>Luck</th><th>Resp.</th><th>Potential</th><th>Age</th><th>Expect. %</th><th>Trait</th><th>Gender</th><th>Nationality</th><th></th></tr></thead>
      <tbody>
        {#each cards.list as c (c.id)}
          <tr>
            <td><input class="name" bind:value={c.label} aria-label="Name" /></td>
            <td><input type="number" min="1" max="20" bind:value={c.production} aria-label="Production" /></td>
            <td><input type="number" min="0" max="20" bind:value={c.luck} aria-label="Luck" /></td>
            <td><input type="number" min="0" max="20" bind:value={c.responsibility} aria-label="Responsibility" /></td>
            <td><input type="number" min="0" max="15" bind:value={c.potential} aria-label="Potential" /></td>
            <td><input type="number" min="18" max="80" bind:value={c.age} aria-label="Age" /></td>
            <td><input type="number" min="50" max="160" step="5" bind:value={c.expectation} aria-label="Wage expectation %" /></td>
            <td>
              <select bind:value={c.trait} aria-label="Trait">
                <option value="">No trait</option>
                {#each traitCodes as t (t)}<option value={t}>{traitName(t)}</option>{/each}
              </select>
              {#if c.trait === 'specialist'}
                <select bind:value={c.specialistGood} aria-label="Specialist's good">
                  <option value="">Good not known</option>
                  {#each goodCodes as g (g)}<option value={g}>{itemLabel(g)}</option>{/each}
                </select>
              {/if}
            </td>
            <td><select bind:value={c.gender} aria-label="Gender"><option value="male">Man</option><option value="female">Woman</option></select></td>
            <td>
              <select bind:value={c.nationality} aria-label="Nationality">
                <option value="">Unknown</option>
                {#each countryList as k (k._id)}<option value={k._id}>{k.name}</option>{/each}
              </select>
            </td>
            <td><button class="icon" onclick={() => remove(c.id)} aria-label="Remove {c.label}">✕</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <button class="add" onclick={add}>+ Add a candidate</button>

  {#if scores.length && models.length}
    {#if top}
      <p class="verdict" class:bad={top.best.value < 0}>
        {#if top.best.value > 0}
          Best: <strong>{top.card.label}</strong> in <strong>{top.best.company.name}</strong>{top.best.replaces ? `, replacing ${top.best.replaces}` : ''}: <strong>{signed(top.best.value)} G/day</strong>.
        {:else}
          None of these adds anything: every one costs more than they bring. Skip today's set, or reroll if energy allows.
        {/if}
      </p>
    {/if}
    <div class="scroll">
      <table class="scores">
        <thead><tr>
          <th>Candidate</th><th class="num">Wage / day</th><th class="num">Days to 65</th><th class="num">Trainings left</th>
          {#each models as m (m.company.id)}<th class="num"><img src={itemImage(m.company.good, items)} alt="" width="16" height="16" class="mini" /> {m.company.name}{#if m.full}<small class="muted"> full</small>{/if}</th>{/each}
        </tr></thead>
        <tbody>
          {#each scores as s (s.card.id)}
            <tr>
              <td><strong>{s.card.label}</strong> {#if s.card.trait}<TraitChip code={s.card.trait} />{/if}</td>
              <td class="num">{fmt(s.wage, 2)}</td>
              <td class="num">{s.days ?? '–'}</td>
              <td class="num">{s.card.potential}</td>
              {#each s.byCompany as r (r.company.id)}
                <td class="num" class:best={r === s.best && r.value > 0} class:good={r.value > 0.005} class:bad={r.value < -0.005} title={r.replaces ? `Replacing ${r.replaces} (firing costs coworkers nothing)` : 'Added to the company'}>
                  {signed(r.value)}{#if r.replaces}<small class="muted"> for {r.replaces}</small>{/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="muted small">G per day after the candidate's wage, with each company's employees, good, storage and country counted. Luck and Potential don't change today's output (Luck finds toolboxes; Potential is how many trainings they can take); both are worth more on a cheap, productive candidate.</p>
  {/if}
</section>

<style>
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .head h2 { margin: 0; }
  .small { font-size: 12px; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  th, td { padding: 4px 5px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
  th { font-size: 11px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  input, select { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 4px 6px; color: var(--text); font-size: 13px; }
  .cards input[type='number'] { width: 58px; }
  .cards input.name { width: 110px; }
  .cards select { max-width: 150px; }
  td.best { background: color-mix(in srgb, var(--good) 14%, transparent); font-weight: 700; }
  .scores td small { font-weight: 400; }
  .mini { vertical-align: middle; border-radius: 4px; }
  .verdict { margin: 12px 0 0; font-size: 15px; }
  .icon { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 4px 6px; }
  .link { background: none; border: 0; color: var(--info); cursor: pointer; font: inherit; padding: 0 2px; }
  .add { margin-top: 8px; display: inline-flex; align-items: center; gap: 6px; background: var(--surface-2); color: var(--text); border: 1px dashed var(--line); border-radius: var(--radius-sm); padding: 6px 12px; cursor: pointer; }
</style>
