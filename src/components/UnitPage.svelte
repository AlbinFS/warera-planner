<script>
  /**
   * A military unit's damage right now: every member from their live bars,
   * worn gear and pill state, a cautious "95% of the time" figure, and the
   * unit total against its mercenary contracts.
   */
  import { planner } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { cached } from '../lib/warera.js';
  import { loadUnitById, searchUnits, loadMembers, loadContracts, memberDamage, simulate, quantile, unitQuantile } from '../lib/unit.js';
  import { fmt, fmtDamage } from '../lib/format.js';
  import { flagImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import GearStrip from './GearStrip.svelte';
  import Icon from './Icon.svelte';
  import { mdiPill, mdiHeart, mdiSilverwareForkKnife, mdiFileDocumentOutline, mdiAccountGroup } from '@mdi/js';

  let { data } = $props();
  const items = $derived(data.market.gameConfigItems);

  let search = $state('');
  let found = $state([]);
  let unit = $state.raw(null);
  let rows = $state.raw([]);
  let contracts = $state.raw([]);
  let picked = $state(null); // contract id
  let status = $state('');
  let error = $state('');
  let progress = $state(0);
  let countries = $state.raw({});
  let regions = $state.raw({});
  let retryId = $state(null);

  // Start with the loaded player's unit.
  $effect(() => {
    const id = planner.player?.id;
    if (!id || unit) return;
    cached('user.getUserById', { userId: id }, 60 * 1000).then((u) => { if (u.mu && !unit) open(u.mu); }).catch(() => {});
  });

  async function find(event) {
    event.preventDefault();
    if (!search.trim()) return;
    error = '';
    try {
      found = await searchUnits(search.trim());
      if (!found.length) error = `No unit named "${search}".`;
    } catch (err) {
      error = err.message;
    }
  }

  let seq = 0;
  async function open(muId) {
    const id = ++seq;
    error = '';
    found = [];
    rows = [];
    progress = 0;
    try {
      status = 'Loading the unit…';
      unit = await loadUnitById(muId);
      const [members, unitContracts, countryList, regionMap] = await Promise.all([
        loadMembers(unit),
        loadContracts(unit._id).catch(() => []),
        cached('country.getAllCountries', {}, 60 * 60 * 1000).catch(() => []),
        cached('region.getRegionsObject', {}, 60 * 60 * 1000).catch(() => ({})),
      ]);
      if (id !== seq) return;
      countries = Object.fromEntries((countryList ?? []).map((c) => [c._id, c]));
      regions = regionMap ?? {};
      contracts = unitContracts;
      picked = unitContracts[0]?._id ?? null;
      await compute(members, id);
    } catch (err) {
      if (id === seq) { error = err.message; status = ''; unit = null; retryId = muId; }
    }
  }

  /** Each member's damage now and their simulated fights; results appear as they come in. */
  async function compute(members, id) {
    status = `Working out ${members.length} members' damage…`;
    let done = 0;
    const results = await Promise.all(members.map(async (m) => {
      const d = await memberDamage(data.market, m, settings).catch((err) => ({ damage: 0, error: err.message, pill: { kind: 'none' } }));
      const sims = simulate(d);
      progress = ++done / members.length;
      return { user: m.user, d, sims, safe: quantile(sims) };
    }));
    if (id !== seq) return;
    rows = results.sort((a, b) => b.d.damage - a.d.damage);
    status = '';
  }

  // Recompute when the fight settings change (bonus, food).
  let lastSettings = JSON.stringify([settings.battleBonus, settings.food]);
  $effect(() => {
    const now = JSON.stringify([settings.battleBonus, settings.food]);
    if (now === lastSettings || !unit || !rows.length) return;
    lastSettings = now;
    const id = ++seq;
    loadMembers(unit).then((m) => compute(m, id));
  });

  const total = $derived(rows.reduce((s, r) => s + r.d.damage, 0));
  const safeTotal = $derived(unitQuantile(rows.map((r) => r.sims)));
  const contract = $derived(contracts.find((c) => c._id === picked) ?? null);
  const fighting = $derived(rows.filter((r) => r.d.damage > 0).length);

  const regionName = (id) => regions?.[id]?.name ?? 'a region';
  const countryName = (id) => countries[id]?.name ?? 'a country';
  const contractLabel = (c) => `For ${countryName(c.forCountry)} (${c.forCountrySide}) · min ${fmtDamage(c.minimumDamage)} · ${fmt(c.currentPerK, 3)} G per 1k · ${fmt(c.currentPayout, 0)} G${c.roundNumber ? ` · round ${c.roundNumber}` : ''} · ${c.status === 'won' ? 'won' : 'leading'}`;
  const pct = (a, b) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);
</script>

<div class="page">
  <section class="card intro">
    <h2><Icon path={mdiAccountGroup} size={18} /> Military unit</h2>
    <p class="muted">How much damage your unit can put into a battle <strong>right now</strong>: every member's current health and hunger, the gear they wear and their pill. The cautious figure is what they reach <strong>95% of the time</strong>, given their luck on misses, crits and dodges. Battle bonus and food come from the settings bar.</p>
    <form class="find" onsubmit={find}>
      <input bind:value={search} placeholder={unit ? unit.name : 'Unit name'} aria-label="Unit name" />
      <button>Find unit</button>
    </form>
    {#if found.length}
      <ul class="found">
        {#each found as u (u._id)}<li><button class="link" onclick={() => open(u._id)}>{u.name} <span class="muted">({u.members?.length ?? 0} members)</span></button></li>{/each}
      </ul>
    {/if}
    {#if error}<p class="error" role="alert">{error}{#if retryId} <button class="link" onclick={() => open(retryId)}>Try again</button>{/if}</p>{/if}
  </section>

  {#if unit}
    <section class="card totals" aria-labelledby="totals-title">
      <div class="head">
        <h2 id="totals-title">{unit.name}</h2>
        <span class="muted">{fighting} of {rows.length || unit.members?.length} members can fight now</span>
      </div>
      {#if status}
        <p class="muted">{status}</p>
        <div class="progress" role="progressbar" aria-label="Working out members' damage" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}><div style="width:{progress * 100}%"></div></div>
      {:else}
        <dl class="big">
          <div><dt>Damage available now</dt><dd class="num">{fmtDamage(total)}</dd></div>
          <div><dt>Reached 95% of the time</dt><dd class="num">{fmtDamage(safeTotal)}</dd></div>
        </dl>
        <div class="contract">
          <label>
            <span><Icon path={mdiFileDocumentOutline} size={16} /> Contract</span>
            <select bind:value={picked}>
              <option value={null}>{contracts.length ? 'No contract' : 'This unit holds no current contracts'}</option>
              {#each contracts as c (c._id)}<option value={c._id}>{contractLabel(c)}</option>{/each}
            </select>
          </label>
          {#if contract}
            {@const enough = safeTotal >= contract.minimumDamage}
            <div class="meter" aria-label="Unit damage against the contract minimum">
              <div class="fill avg" style:width="{pct(total, contract.minimumDamage)}%"></div>
              <div class="fill safe" style:width="{pct(safeTotal, contract.minimumDamage)}%"></div>
            </div>
            <p class:good={enough} class:warn={!enough}>
              {#if enough}
                The unit can reach the {fmtDamage(contract.minimumDamage)} minimum even with bad luck ({fmtDamage(safeTotal)} reached 95% of the time).
              {:else if total >= contract.minimumDamage}
                On average the unit reaches the {fmtDamage(contract.minimumDamage)} minimum, but with bad luck it falls short: plan for {fmtDamage(contract.minimumDamage - safeTotal)} more.
              {:else}
                The unit is {fmtDamage(contract.minimumDamage - total)} short of the {fmtDamage(contract.minimumDamage)} minimum right now.
              {/if}
              Pays {fmt(contract.currentPayout, 0)} G.
            </p>
          {/if}
        </div>
      {/if}
    </section>

    {#if rows.length}
      <section class="card" aria-labelledby="members-title">
        <h2 id="members-title">Members</h2>
        <div class="scroll">
          <table>
            <thead><tr><th>Member</th><th>Bars now</th><th>Gear</th><th>Damage now</th><th title="Reached 95% of the time">95% of the time</th></tr></thead>
            <tbody>
              {#each rows as r (r.user._id)}
                <tr class:idle={!r.d.damage}>
                  <td class="who">
                    {#if r.user.avatarUrl}<img src={r.user.avatarUrl} alt="" width="30" height="30" />{/if}
                    <span>
                      <strong>{r.user.username}</strong>
                      <small class="muted">Level {r.user.leveling?.level}{#if countries[r.user.country]?.code} · <img class="flag" src={flagImage(countries[r.user.country].code)} alt={countries[r.user.country].name} width="16" height="11" />{/if}</small>
                      {#if r.d.pill?.kind !== 'none'}<span class="pill {r.d.pill.kind}"><Icon path={mdiPill} size={12} /> {r.d.pill.label}</span>{/if}
                    </span>
                  </td>
                  <td class="bars">
                    <span title="Health now"><Icon path={mdiHeart} size={13} color="var(--c-life)" /> {fmt(r.user.skills?.health?.currentBarValue, 0)}/{r.user.skills?.health?.total ?? r.user.skills?.health?.value}</span>
                    <span title="Hunger now (meals they can eat)"><Icon path={mdiSilverwareForkKnife} size={13} color="var(--c-crit)" /> {fmt(r.user.skills?.hunger?.currentBarValue, 1)}/{r.user.skills?.hunger?.total ?? r.user.skills?.hunger?.value}</span>
                  </td>
                  <td class="gear"><GearStrip equipment={r.d.gear} food={r.d.food} {items} /></td>
                  <td class="num dmg">{r.d.error ? '' : fmtDamage(r.d.damage)}{#if r.d.error}<small class="error">{r.d.error}</small>{/if}</td>
                  <td class="num">{r.d.damage ? fmtDamage(r.safe) : ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="muted small">Damage now: what their bars allow at this moment, fighting in the gear they wear, eating {settings.food === 'any' ? 'the best food for them' : itemLabel(settings.food)}. Members regain health and hunger every hour, so the numbers grow while they wait.</p>
      </section>
    {/if}
  {:else if !error}
    <p class="muted">{planner.player ? 'Loading your unit…' : 'Load your player on the planner, or find a unit by name.'}</p>
  {/if}
</div>

<style>
  .page { display: grid; gap: var(--gap); max-width: 1280px; margin: 0 auto; padding: var(--gap); }
  .intro h2 { display: flex; align-items: center; gap: 6px; text-transform: none; letter-spacing: 0; font-size: 16px; color: var(--text); margin-bottom: 6px; }
  .intro p { margin: 0 0 10px; }
  .find { display: flex; gap: 8px; max-width: 460px; }
  .find input, select { flex: 1; min-width: 0; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px 10px; color: var(--text); }
  .find button { background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius-sm); padding: 8px 14px; font-weight: 600; cursor: pointer; }
  .found { list-style: none; padding: 0; margin: 8px 0 0; }
  .link { background: none; border: 0; color: var(--info); cursor: pointer; padding: 4px 0; }
  .head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
  .head h2 { text-transform: none; letter-spacing: 0; font-size: 18px; color: var(--text); }
  .big { display: flex; flex-wrap: wrap; gap: 12px 40px; margin: 0 0 12px; }
  .big dt { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
  .big dd { margin: 2px 0 0; font-size: 30px; font-weight: 700; }
  .contract label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); max-width: 720px; }
  .contract label span { display: inline-flex; align-items: center; gap: 6px; }
  .meter { position: relative; height: 12px; border-radius: 6px; background: var(--surface-2); overflow: hidden; margin: 12px 0 6px; max-width: 720px; }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: 6px; }
  .fill.avg { background: color-mix(in srgb, var(--good) 35%, transparent); }
  .fill.safe { background: var(--good); }
  .good { color: var(--good); }
  .warn { color: var(--accent); }
  .error { color: var(--bad); display: block; }
  .progress { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
  .progress div { height: 100%; background: var(--accent); transition: width .15s; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
  th { font-size: 12px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  td.num, th:nth-child(4), th:nth-child(5) { text-align: right; white-space: nowrap; }
  .dmg { font-weight: 600; }
  tr.idle td { color: var(--muted); }
  .who { display: flex; align-items: center; gap: 8px; min-width: 170px; }
  .who img { border-radius: 6px; }
  .who span { display: grid; }
  .flag { border-radius: 1px; vertical-align: middle; }
  .pill { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; width: fit-content; padding: 0 6px; border-radius: 999px; }
  .pill.buff { color: var(--good); border: 1px solid var(--good); }
  .pill.debuff { color: var(--bad); border: 1px solid var(--bad); }
  .bars { display: grid; gap: 2px; font-size: 13px; white-space: nowrap; }
  .gear :global(.strip) { flex-wrap: nowrap; }
  .small { font-size: 12px; margin: 10px 0 0; }
</style>
