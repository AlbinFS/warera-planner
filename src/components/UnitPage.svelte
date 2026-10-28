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
  import SearchBox from './SearchBox.svelte';
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

  // Auto-refresh: members' bars change every hour, pills and contracts any time.
  const REFRESH_MS = 3 * 60 * 1000;
  let autoRefresh = $state(true);
  let updatedAt = $state(0);
  let now = $state(Date.now());
  $effect(() => {
    const tick = setInterval(() => (now = Date.now()), 30 * 1000);
    return () => clearInterval(tick);
  });
  $effect(() => {
    if (!autoRefresh || !unit) return;
    const timer = setInterval(() => refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  });
  async function refresh() {
    if (!unit || status) return;
    const id = ++seq;
    const [members, unitContracts] = await Promise.all([loadMembers(unit), loadContracts(unit._id).catch(() => contracts)]);
    if (id !== seq) return;
    contracts = unitContracts;
    await compute(members, id);
  }
  const ago = $derived(updatedAt ? Math.max(0, Math.round((now - updatedAt) / 60000)) : null);

  /** Full bars: regen is being wasted. Ready to pill: full and neither on the pill nor in its debuff. */
  function readiness(user, pill) {
    const h = user.skills?.health;
    const f = user.skills?.hunger;
    const full = h && f && h.currentBarValue >= (h.total ?? h.value) - 0.5 && f.currentBarValue >= (f.total ?? f.value) - 0.5;
    if (!full) return null;
    return pill?.kind === 'none' ? 'ready to pill' : 'full bars';
  }
  async function open(muId) {
    const id = ++seq;
    error = '';
    found = [];
    rows = [];
    progress = 0;
    try {
      status = 'Loading the unit…';
      unit = await loadUnitById(muId);
      const [members, unitContracts, countryList] = await Promise.all([
        loadMembers(unit),
        loadContracts(unit._id).catch(() => []),
        cached('country.getAllCountries', {}, 60 * 60 * 1000).catch(() => []),
      ]);
      if (id !== seq) return;
      countries = Object.fromEntries((countryList ?? []).map((c) => [c._id, c]));
      contracts = unitContracts;
      picked = unitContracts.find((c) => c.battleActive !== false)?._id ?? null;
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
    rows = results;
    status = '';
    updatedAt = Date.now();
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

  const countryName = (id) => countries[id]?.name ?? 'a country';
  const time = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  // Where a contract stands: its auction ('active'), then 'won' until the battle ends.
  const stateOf = (c) => (c.status === 'active' ? 'auction open' : c.status !== 'won' ? c.status : c.battleActive === false ? 'battle over' : 'in progress');
  const contractLabel = (c) => [
    `For ${countryName(c.forCountry)} (${c.forCountrySide})`,
    // Exact enough to tell apart two contracts in one battle (4.996M and 5.000M).
    `min ${fmt(c.minimumDamage / 1e6, 3)}M`,
    `${fmt(c.currentPerK, 3)} G per 1k`,
    `${fmt(c.currentPayout, 0)} G`,
    stateOf(c),
    c.status === 'won' ? `won ${time(c.updatedAt)}` : null,
  ].filter(Boolean).join(' · ');
  const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);

  // Damage already done on a contract: tracked by the site, or typed in from the game (kept in this browser).
  const DONE_KEY = 'unit.contractDone';
  let typedDone = $state((() => { try { return JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}'); } catch { return {}; } })());
  $effect(() => { const v = JSON.stringify(typedDone); try { localStorage.setItem(DONE_KEY, v); } catch {} });
  /** "3.72m", "3720k" or "3720000" → 3720000. */
  function parseAmount(text) {
    const m = String(text ?? '').trim().toLowerCase().replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)\s*([km]?)$/);
    return m ? Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1) : null;
  }
  const doneOf = (c) => c.done ?? parseAmount(typedDone[c._id]);

  // Sorting the members table: click a column to sort, again to reverse.
  const gearValue = (gear) => Object.values(gear ?? {}).reduce((sum, g) => sum + (g && typeof g === 'object' ? data.priceOf(g.code, g.skills) || 0 : 0), 0);
  const SORTS = {
    name: { label: 'Member', value: (r) => r.user.username.toLowerCase(), text: true },
    health: { label: 'Bars now', value: (r) => r.user.skills?.health?.currentBarValue ?? 0, title: 'Sorted by health now' },
    gear: { label: 'Gear', value: (r) => gearValue(r.d.gear), title: 'Sorted by the gear’s market value' },
    damage: { label: 'Damage now', value: (r) => r.d.damage ?? 0 },
    safe: { label: '95% of the time', value: (r) => r.safe ?? 0, title: 'Reached 95% of the time' },
  };
  let sortKey = $state('damage');
  let sortDesc = $state(true);
  function sortBy(key) {
    if (sortKey === key) sortDesc = !sortDesc;
    else { sortKey = key; sortDesc = !SORTS[key].text; }
  }
  const sorted = $derived([...rows].sort((a, b) => {
    const [x, y] = [SORTS[sortKey].value(a), SORTS[sortKey].value(b)];
    const order = SORTS[sortKey].text ? String(x).localeCompare(String(y)) : x - y;
    return sortDesc ? -order : order;
  }));
</script>

<div class="page">
  <section class="card intro">
    <h2><Icon path={mdiAccountGroup} size={18} /> Military unit</h2>
    <p class="muted">How much damage your unit can put into a battle <strong>right now</strong>: every member's current health and hunger, the gear they wear and their pill. The cautious figure is what they reach <strong>95% of the time</strong>, given their luck on misses, crits and dodges. Battle bonus and food come from the settings bar.</p>
    <form class="find" onsubmit={find}>
      <SearchBox kinds={['units']} placeholder={unit ? unit.name : 'Unit name'} bind:value={search} onpick={(r) => open(r.id)} />
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
        <span class="refresh">
          <label class="check"><input type="checkbox" bind:checked={autoRefresh} /> Refresh every 3 min</label>
          {#if ago != null}<span class="muted">updated {ago === 0 ? 'just now' : `${ago} min ago`}</span>{/if}
          <button class="link" onclick={refresh}>Refresh now</button>
        </span>
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
            {@const min = contract.minimumDamage}
            {@const done = doneOf(contract) ?? 0}
            {@const left = Math.max(0, min - done)}
            {@const over = contract.battleActive === false}
            {@const verdict = left <= 0 ? 'done' : safeTotal >= left ? 'safe' : total >= left ? 'risky' : 'short'}
            {#if !over && contract.status === 'won'}
              <div class="progress-row">
                <span>Done so far</span>
                {#if contract.done != null}
                  <strong class="num">{fmtDamage(contract.done)}</strong> <small class="muted">tracked since it was won</small>
                {:else}
                  <input class="done-in" placeholder="e.g. 3.72m" bind:value={typedDone[contract._id]} aria-label="Damage already done on this contract" />
                  <small class="muted">from the game: this contract was won before the site tracked it</small>
                {/if}
              </div>
            {/if}
            <div class="meter" aria-label="Contract minimum: done so far, then what the unit can still add">
              <div class="seg done" style:width="{pct(done, min)}%" title="Done so far: {fmtDamage(done)}"></div>
              <div class="seg safe" style:width="{pct(Math.min(safeTotal, left), min)}%" title="Available even with bad luck: {fmtDamage(safeTotal)}"></div>
              <div class="seg avg" style:width="{pct(Math.min(total, left) - Math.min(safeTotal, left), min)}%" title="Available on average: {fmtDamage(total)}"></div>
            </div>
            <div class="meter-legend">
              <span><i class="key done"></i> done {fmtDamage(done)}</span>
              <span><i class="key safe"></i> available with bad luck {fmtDamage(safeTotal)}</span>
              <span><i class="key avg"></i> on average {fmtDamage(total)}</span>
              <span class="muted">minimum {fmtDamage(min)}</span>
            </div>
            <p class="verdict" data-verdict={over ? 'over' : verdict}>
              {#if over}The battle is over.
              {:else if verdict === 'done'}The minimum is reached.
              {:else if verdict === 'safe'}{fmtDamage(left)} to go: the unit can finish it now, even with bad luck.
              {:else if verdict === 'risky'}{fmtDamage(left)} to go: enough on average, but with bad luck {fmtDamage(left - safeTotal)} short.
              {:else}{fmtDamage(left)} to go: the unit is {fmtDamage(left - total)} short right now (bars refill every hour).{/if}
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
            <thead><tr>
              {#each Object.entries(SORTS) as [key, col] (key)}
                <th class:num={!col.text && key !== 'health' && key !== 'gear'} aria-sort={sortKey === key ? (sortDesc ? 'descending' : 'ascending') : 'none'}>
                  <button class="sort" class:active={sortKey === key} onclick={() => sortBy(key)} title={col.title ?? `Sort by ${col.label.toLowerCase()}`}>
                    {col.label}
                    <span class="arrow" aria-hidden="true">{sortKey === key ? (sortDesc ? '▼' : '▲') : '↕'}</span>
                  </button>
                </th>
              {/each}
            </tr></thead>
            <tbody>
              {#each sorted as r (r.user._id)}
                <tr class:idle={!r.d.damage}>
                  <td class="who">
                    {#if r.user.avatarUrl}<img src={r.user.avatarUrl} alt="" width="30" height="30" />{/if}
                    <span>
                      <strong>{r.user.username}</strong>
                      <small class="muted">Level {r.user.leveling?.level}{#if countries[r.user.country]?.code} · <img class="flag" src={flagImage(countries[r.user.country].code)} alt={countries[r.user.country].name} width="16" height="11" />{/if}</small>
                      {#if r.d.pill?.kind !== 'none'}<span class="pill {r.d.pill.kind}"><Icon path={mdiPill} size={12} /> {r.d.pill.label}</span>{/if}
                      {#if readiness(r.user, r.d.pill)}{@const ready = readiness(r.user, r.d.pill)}<span class="pill ready" title={ready === 'ready to pill' ? 'Full bars and not on the pill or in its debuff' : 'Bars are full: waiting wastes regen'}>{ready}</span>{/if}
                    </span>
                  </td>
                  <td><div class="bars">
                    <span title="Health now"><Icon path={mdiHeart} size={13} color="var(--c-life)" /> {fmt(r.user.skills?.health?.currentBarValue, 0)}/{r.user.skills?.health?.total ?? r.user.skills?.health?.value}</span>
                    <span title="Hunger now (meals they can eat)"><Icon path={mdiSilverwareForkKnife} size={13} color="var(--c-crit)" /> {fmt(r.user.skills?.hunger?.currentBarValue, 1)}/{r.user.skills?.hunger?.total ?? r.user.skills?.hunger?.value}</span>
                  </div></td>
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
    <p class="muted">{planner.player ? 'Loading your unit…' : 'Load your player on the Overview & MinMax page, or find a unit by name.'}</p>
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
  .meter { display: flex; height: 14px; border-radius: 7px; background: var(--surface-2); overflow: hidden; margin: 10px 0 0; max-width: 720px; }
  .good { color: var(--good); }
  .warn { color: var(--accent); }
  .progress-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 10px 0 4px; font-size: 14px; }
  .done-in { width: 110px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 8px; color: var(--text); font-size: 14px; }
  .meter .seg { height: 100%; }
  .meter .seg.done { background: var(--good); }
  .meter .seg.safe { background: color-mix(in srgb, var(--good) 45%, transparent); }
  .meter .seg.avg { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--good) 35%, transparent) 0 6px, transparent 6px 10px); }
  .meter-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; margin-top: 6px; }
  .meter-legend span { display: inline-flex; align-items: center; gap: 5px; }
  .key { width: 12px; height: 10px; border-radius: 2px; display: inline-block; }
  .key.done { background: var(--good); }
  .key.safe { background: color-mix(in srgb, var(--good) 45%, transparent); }
  .key.avg { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--good) 35%, transparent) 0 3px, transparent 3px 5px); border: 1px solid color-mix(in srgb, var(--good) 45%, transparent); }
  .verdict { margin: 8px 0 0; font-weight: 600; }
  .verdict[data-verdict='done'], .verdict[data-verdict='safe'] { color: var(--good); }
  .verdict[data-verdict='risky'] { color: var(--accent); }
  .verdict[data-verdict='short'] { color: var(--bad); }
  .verdict[data-verdict='over'] { color: var(--muted); }
  .error { color: var(--bad); display: block; }
  .progress { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
  .progress div { height: 100%; background: var(--accent); transition: width .15s; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
  th { font-size: 12px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .sort { background: none; border: 0; padding: 2px 0; color: inherit; font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .sort:hover, .sort.active { color: var(--text); }
  .arrow { font-size: 10px; opacity: .6; }
  .sort.active .arrow { opacity: 1; color: var(--accent); }
  .dmg { font-weight: 600; }
  tr.idle td { color: var(--muted); }
  .who { display: flex; align-items: center; gap: 8px; min-width: 170px; }
  .who img { border-radius: 6px; }
  .who span { display: grid; }
  .flag { border-radius: 1px; vertical-align: middle; }
  .pill { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; width: fit-content; padding: 0 6px; border-radius: 999px; }
  .pill.buff { color: var(--good); border: 1px solid var(--good); }
  .pill.debuff { color: var(--bad); border: 1px solid var(--bad); }
  .pill.ready { color: var(--accent); border: 1px solid var(--accent); }
  .refresh { display: inline-flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 13px; }
  .check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .check input { accent-color: var(--accent); }
  .bars { display: grid; gap: 2px; font-size: 13px; white-space: nowrap; }
  .gear :global(.strip) { flex-wrap: nowrap; }
  .small { font-size: 12px; margin: 10px 0 0; }
</style>
