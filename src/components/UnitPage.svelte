<script>
  /**
   * A military unit's damage: every member from their live bars, worn gear
   * and pill state, now, if they took the pill now, and over a fresh 8 h pill
   * session; a cautious "95% of the time" figure; and the unit total against
   * its mercenary contracts. For a commander deciding on a contract.
   */
  import { planner } from '../lib/planner.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { cached } from '../lib/warera.js';
  import { loadUnitById, searchUnits, loadMembers, loadContracts, memberDamage, simulate, quantile, unitQuantile, scaled } from '../lib/unit.js';
  import { fmt, fmtDamage } from '../lib/format.js';
  import { flagImage } from '../lib/visual.js';
  import { itemLabel } from '../lib/market.js';
  import GearStrip from './GearStrip.svelte';
  import SearchBox from './SearchBox.svelte';
  import Icon from './Icon.svelte';
  import { mdiPill, mdiHeart, mdiSilverwareForkKnife, mdiFileDocumentOutline, mdiAccountGroup, mdiRefresh } from '@mdi/js';

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

  /**
   * Where a member stands: on the pill, in its debuff, ready to take it (full
   * bars, neither), full bars on the pill (regen is being wasted), or resting.
   */
  function stateOf(r) {
    const kind = r.d.pill?.kind ?? 'none';
    const full = r.d.fullIn <= 0.01;
    if (kind === 'buff') return full ? { key: 'buff', label: `On the pill +${r.user.skills?.attack?.buffsPercent ?? 60}%`, note: 'bars full: fight now' } : { key: 'buff', label: `On the pill +${r.user.skills?.attack?.buffsPercent ?? 60}%` };
    if (kind === 'debuff') return { key: 'debuff', label: `In the debuff −${r.user.skills?.attack?.debuffsPercent ?? 60}%`, note: "can't take a pill yet" };
    if (full) return { key: 'ready', label: 'Ready to pill', note: 'full bars, no pill' };
    return { key: 'rest', label: 'Regenerating' };
  }
  const hours = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${fmt(h, h < 10 ? 1 : 0)} h`);

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
      const d = await memberDamage(data.market, m, settings).catch((err) => ({ damage: 0, session: 0, pilledNow: null, fullIn: 0, error: err.message, pill: { kind: 'none' } }));
      const sims = simulate(d);
      progress = ++done / members.length;
      // Taking the pill scales every hit alike, so their luck simulation scales with it.
      const pillFactor = d.damage > 0 && d.pilledNow != null ? d.pilledNow / d.damage : 1;
      return { user: m.user, d, sims, safe: quantile(sims), pilledSims: d.pilledNow != null ? scaled(sims, pillFactor) : sims };
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
  // If everyone who can takes the pill now (the debuffed fight as they are).
  const pilledTotal = $derived(rows.reduce((s, r) => s + (r.d.pilledNow ?? r.d.damage), 0));
  const pilledSafe = $derived(unitQuantile(rows.map((r) => r.pilledSims)));
  const sessionTotal = $derived(rows.reduce((s, r) => s + (r.d.session ?? 0), 0));
  const contract = $derived(contracts.find((c) => c._id === picked) ?? null);
  const fighting = $derived(rows.filter((r) => r.d.damage > 0).length);
  const counts = $derived(rows.reduce((c, r) => { const k = stateOf(r).key; c[k] = (c[k] ?? 0) + 1; return c; }, {}));
  const canPill = $derived(rows.filter((r) => r.d.pill?.kind === 'none').length);
  const pillCost = $derived(canPill * (data.market.itemPrices?.cocain ?? 0));

  const countryName = (id) => countries[id]?.name ?? 'a country';
  const time = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  // Where a contract stands: its auction ('active'), then 'won' until the battle ends.
  const contractState = (c) => (c.status === 'active' ? 'auction open' : c.status !== 'won' ? c.status : c.battleActive === false ? 'battle over' : 'in progress');
  const contractLabel = (c) => [
    `For ${countryName(c.forCountry)} (${c.forCountrySide})`,
    // Exact enough to tell apart two contracts in one battle (4.996M and 5.000M).
    `min ${fmt(c.minimumDamage / 1e6, 3)}M`,
    `${fmt(c.currentPerK, 3)} G per 1k`,
    `${fmt(c.currentPayout, 0)} G`,
    contractState(c),
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
  const STATE_ORDER = { ready: 0, buff: 1, rest: 2, debuff: 3 };
  const SORTS = {
    name: { label: 'Member', value: (r) => r.user.username.toLowerCase(), text: true },
    state: { label: 'Status', value: (r) => -STATE_ORDER[stateOf(r).key], title: 'Ready to pill first, then on the pill, regenerating, in the debuff' },
    health: { label: 'Bars now', value: (r) => -(r.d.fullIn ?? 0), title: 'Sorted by how soon their bars are full' },
    damage: { label: 'Damage now', value: (r) => r.d.damage ?? 0, title: 'Their bars now, at their pill state now' },
    pilled: { label: 'If they pill now', value: (r) => r.d.pilledNow ?? -1, title: 'Their bars now, with the pill’s +60 % (not possible in the debuff)' },
    session: { label: '8 h on the pill', value: (r) => r.d.session ?? 0, title: 'A fresh pill session: full bars, 8 hours of regen, the pill on' },
    safe: { label: '95% of the time', value: (r) => r.safe ?? 0, title: 'Damage now, reached 95% of the time' },
    gear: { label: 'Gear', value: (r) => gearValue(r.d.gear), title: 'Sorted by the gear’s market value' },
  };
  const NUMERIC = new Set(['damage', 'pilled', 'session', 'safe']);
  let sortKey = $state('damage');
  let sortDesc = $state(true);
  function sortBy(key) {
    if (sortKey === key) sortDesc = !sortDesc;
    else { sortKey = key; sortDesc = !SORTS[key].text; }
  }
  // Filter by status.
  let show = $state('all');
  const FILTERS = [['all', 'Everyone'], ['ready', 'Ready to pill'], ['buff', 'On the pill'], ['debuff', 'In the debuff'], ['rest', 'Regenerating']];
  const sorted = $derived([...rows].filter((r) => show === 'all' || stateOf(r).key === show).sort((a, b) => {
    const [x, y] = [SORTS[sortKey].value(a), SORTS[sortKey].value(b)];
    const order = SORTS[sortKey].text ? String(x).localeCompare(String(y)) : x - y;
    return sortDesc ? -order : order;
  }));
  const barPct = (bar) => pct(bar?.currentBarValue ?? 0, bar?.total ?? bar?.value ?? 0);
</script>

<div class="page">
  <section class="card intro">
    <h2><Icon path={mdiAccountGroup} size={18} /> Military unit</h2>
    <p class="muted">How much damage your unit can put into a battle: every member's health and hunger, the gear they wear and their pill. <strong>Now</strong> is what their bars allow this moment; <strong>if they pill now</strong> adds the pill's +60 % to that; <strong>8 h on the pill</strong> is a fresh session (full bars and 8 hours of regen), what to plan a contract on. The cautious figure is what they reach <strong>95% of the time</strong>, given their luck. Battle bonus and food come from the settings bar.</p>
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
        <span class="refresh">
          {#if ago != null}<span class="muted">updated {ago === 0 ? 'just now' : `${ago} min ago`}</span>{/if}
          <label class="check"><input type="checkbox" bind:checked={autoRefresh} /> every 3 min</label>
          <button class="btn" onclick={refresh} disabled={!!status}><Icon path={mdiRefresh} size={16} /> Refresh</button>
        </span>
      </div>
      {#if status}
        <p class="muted">{status}</p>
        <div class="progress" role="progressbar" aria-label="Working out members' damage" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}><div style="width:{progress * 100}%"></div></div>
      {:else}
        <div class="states">
          <span class="muted">{fighting} of {rows.length || unit.members?.length} can fight now:</span>
          {#each FILTERS.slice(1) as [k, label] (k)}
            {#if counts[k]}<button type="button" class="state" data-state={k} aria-pressed={show === k} onclick={() => (show = show === k ? 'all' : k)}>{counts[k]} {label.toLowerCase()}</button>{/if}
          {/each}
        </div>
        <div class="tiles">
          <div class="tile main"><small>Damage now</small><strong class="num">{fmtDamage(total)}</strong><span class="muted">95% of the time: {fmtDamage(safeTotal)}</span></div>
          <div class="tile pill-tile"><small><Icon path={mdiPill} size={12} /> If they pill now</small><strong class="num">{fmtDamage(pilledTotal)}</strong><span class="muted">{canPill} can take one{#if pillCost}{' '}({fmt(pillCost, 0)} G of pills){/if} · 95%: {fmtDamage(pilledSafe)}</span></div>
          <div class="tile session"><small>8 h on the pill, each</small><strong class="num">{fmtDamage(sessionTotal)}</strong><span class="muted">full bars, 8 h of regen: the unit's potential</span></div>
        </div>
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
            {@const verdict = left <= 0 ? 'done' : safeTotal >= left ? 'safe' : pilledSafe >= left ? 'pill' : total >= left || pilledTotal >= left ? 'risky' : 'short'}
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
              <div class="seg safe" style:width="{pct(Math.min(safeTotal, left), min)}%" title="Available now even with bad luck: {fmtDamage(safeTotal)}"></div>
              <div class="seg avg" style:width="{pct(Math.min(total, left) - Math.min(safeTotal, left), min)}%" title="Available now on average: {fmtDamage(total)}"></div>
              <div class="seg pilled" style:width="{pct(Math.min(pilledTotal, left) - Math.min(total, left), min)}%" title="More if they pill now: {fmtDamage(pilledTotal)}"></div>
            </div>
            <div class="meter-legend">
              <span><i class="key done"></i> done {fmtDamage(done)}</span>
              <span><i class="key safe"></i> now, bad luck {fmtDamage(safeTotal)}</span>
              <span><i class="key avg"></i> now, on average {fmtDamage(total)}</span>
              <span><i class="key pilled"></i> if they pill now {fmtDamage(pilledTotal)}</span>
              <span class="muted">minimum {fmtDamage(min)}</span>
            </div>
            <p class="verdict" data-verdict={over ? 'over' : verdict}>
              {#if over}The battle is over.
              {:else if verdict === 'done'}The minimum is reached.
              {:else if verdict === 'safe'}{fmtDamage(left)} to go: the unit can finish it now, even with bad luck.
              {:else if verdict === 'pill'}{fmtDamage(left)} to go: enough if the {canPill} who can take the pill do it now, even with bad luck.
              {:else if verdict === 'risky'}{fmtDamage(left)} to go: enough on average{pilledTotal > total ? ' if they pill now' : ''}, but with bad luck {fmtDamage(left - Math.max(safeTotal, pilledSafe))} short.
              {:else}{fmtDamage(left)} to go: {fmtDamage(left - pilledTotal)} short even if they pill now (bars refill every hour; a full pill session each is {fmtDamage(sessionTotal)}).{/if}
              Pays {fmt(contract.currentPayout, 0)} G.
            </p>
          {/if}
        </div>
      {/if}
    </section>

    {#if rows.length}
      <section class="card" aria-labelledby="members-title">
        <div class="head">
          <h2 id="members-title">Members</h2>
          <div class="filters" role="group" aria-label="Show">
            {#each FILTERS as [k, label] (k)}
              {#if k === 'all' || counts[k]}<button type="button" class="chip" data-state={k} aria-pressed={show === k} onclick={() => (show = k)}>{label}{#if k !== 'all'} <small>{counts[k]}</small>{/if}</button>{/if}
            {/each}
          </div>
        </div>
        <div class="scroll">
          <table>
            <thead><tr>
              {#each Object.entries(SORTS) as [key, col] (key)}
                <th class:num={NUMERIC.has(key)} aria-sort={sortKey === key ? (sortDesc ? 'descending' : 'ascending') : 'none'}>
                  <button class="sort" class:active={sortKey === key} onclick={() => sortBy(key)} title={col.title ?? `Sort by ${col.label.toLowerCase()}`}>
                    {col.label}
                    <span class="arrow" aria-hidden="true">{sortKey === key ? (sortDesc ? '▼' : '▲') : '↕'}</span>
                  </button>
                </th>
              {/each}
            </tr></thead>
            <tbody>
              {#each sorted as r (r.user._id)}
                {@const st = stateOf(r)}
                <tr class:idle={!r.d.damage}>
                  <td class="who">
                    {#if r.user.avatarUrl}<img class="avatar" src={r.user.avatarUrl} alt="" width="32" height="32" />{/if}
                    <span class="names">
                      <strong>{r.user.username}</strong>
                      <small class="muted">{#if countries[r.user.country]?.code}<img class="flag" src={flagImage(countries[r.user.country].code)} alt={countries[r.user.country].name} title={countries[r.user.country].name} width="16" height="11" /> {/if}Level {r.user.leveling?.level}</small>
                    </span>
                  </td>
                  <td>
                    <span class="state" data-state={st.key}>{#if st.key === 'buff' || st.key === 'debuff'}<Icon path={mdiPill} size={12} />{/if} {st.label}</span>
                    {#if st.note}<small class="note muted">{st.note}</small>{/if}
                  </td>
                  <td>
                    <div class="bars">
                      <span class="bar" title="Health now"><Icon path={mdiHeart} size={12} color="var(--c-life)" /><i style:--w="{barPct(r.user.skills?.health)}%" data-kind="health"></i><b class="num">{fmt(r.user.skills?.health?.currentBarValue, 0)}/{r.user.skills?.health?.total ?? r.user.skills?.health?.value}</b></span>
                      <span class="bar" title="Hunger now (meals they can eat)"><Icon path={mdiSilverwareForkKnife} size={12} color="var(--c-crit)" /><i style:--w="{barPct(r.user.skills?.hunger)}%" data-kind="hunger"></i><b class="num">{fmt(r.user.skills?.hunger?.currentBarValue, 1)}/{r.user.skills?.hunger?.total ?? r.user.skills?.hunger?.value}</b></span>
                      <small class="muted">{r.d.fullIn > 0.01 ? `full in ${hours(r.d.fullIn)}` : 'full'}</small>
                    </div>
                  </td>
                  <td class="num dmg">{r.d.error ? '' : fmtDamage(r.d.damage)}{#if r.d.error}<small class="error">{r.d.error}</small>{/if}</td>
                  <td class="num">{#if r.d.pilledNow == null}<span class="muted" title="In the pill's debuff: no pill until it ends">–</span>{:else}<span class:up={r.d.pilledNow > r.d.damage + 1}>{fmtDamage(r.d.pilledNow)}</span>{/if}</td>
                  <td class="num">{fmtDamage(r.d.session ?? 0)}</td>
                  <td class="num muted">{r.d.damage ? fmtDamage(r.safe) : ''}</td>
                  <td class="gear"><GearStrip equipment={r.d.gear} food={r.d.food} {items} /></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="muted small">
          Damage now: what their bars allow at this moment, fighting in the gear they wear, eating {settings.food === 'any' ? 'the best food for them' : itemLabel(settings.food)}.
          If they pill now: the same with the pill's +60 % (already on it: the same; in the debuff they can't take one). 8 h on the pill: a fresh session from full bars.
          Members regain health and hunger every hour, so the numbers grow while they wait. The game doesn't show when a pill or its debuff ends.
        </p>
      </section>
    {/if}
  {:else if !error}
    <p class="muted">{planner.player ? 'Loading your unit…' : 'Load your player on the Overview & MinMax page, or find a unit by name.'}</p>
  {/if}
</div>

<style>
  [data-state='ready'] { --s: var(--accent); }
  [data-state='buff'] { --s: var(--good); }
  [data-state='debuff'] { --s: var(--bad); }
  [data-state='rest'] { --s: var(--muted); }
  .page { display: grid; gap: var(--gap); max-width: 1280px; margin: 0 auto; padding: var(--gap); }
  .intro h2 { display: flex; align-items: center; gap: 6px; text-transform: none; letter-spacing: 0; font-size: 16px; color: var(--text); margin-bottom: 6px; }
  .intro p { margin: 0 0 10px; }
  .find { display: flex; gap: 8px; max-width: 460px; }
  .find input, select { flex: 1; min-width: 0; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px 10px; color: var(--text); }
  .find button { background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius-sm); padding: 8px 14px; font-weight: 600; cursor: pointer; }
  .found { list-style: none; padding: 0; margin: 8px 0 0; }
  .link { background: none; border: 0; color: var(--info); cursor: pointer; padding: 4px 0; }
  .head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .head h2 { text-transform: none; letter-spacing: 0; font-size: 18px; color: var(--text); margin: 0; }
  .refresh { display: inline-flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 13px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 12px; color: var(--text); cursor: pointer; font: inherit; font-size: 13px; }
  .btn:hover:not(:disabled) { border-color: var(--accent); }
  .btn:disabled { opacity: .6; cursor: default; }
  .check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .check input { accent-color: var(--accent); }

  .states { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 13px; }
  .state { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--s); color: var(--s); background: color-mix(in srgb, var(--s) 10%, transparent); white-space: nowrap; }
  button.state { cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; }
  button.state[aria-pressed='true'] { background: var(--s); color: var(--bg); }
  .note { display: block; font-size: 11px; margin-top: 2px; }

  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; margin-bottom: 14px; }
  .tile { display: grid; gap: 2px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 14px; }
  .tile small { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; }
  .tile strong { font-size: 26px; font-weight: 700; }
  .tile span { font-size: 12px; }
  .tile.main { border-color: var(--accent); }
  .tile.pill-tile strong { color: var(--good); }

  .contract label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); max-width: 720px; }
  .contract label span { display: inline-flex; align-items: center; gap: 6px; }
  .meter { display: flex; height: 14px; border-radius: 7px; background: var(--surface-2); overflow: hidden; margin: 10px 0 0; max-width: 720px; }
  .progress-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 10px 0 4px; font-size: 14px; }
  .done-in { width: 110px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 5px 8px; color: var(--text); font-size: 14px; }
  .meter .seg { height: 100%; }
  .meter .seg.done { background: var(--good); }
  .meter .seg.safe { background: color-mix(in srgb, var(--good) 45%, transparent); }
  .meter .seg.avg { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--good) 35%, transparent) 0 6px, transparent 6px 10px); }
  .meter .seg.pilled { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--accent) 45%, transparent) 0 6px, transparent 6px 10px); }
  .meter-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; margin-top: 6px; }
  .meter-legend span { display: inline-flex; align-items: center; gap: 5px; }
  .key { width: 12px; height: 10px; border-radius: 2px; display: inline-block; }
  .key.done { background: var(--good); }
  .key.safe { background: color-mix(in srgb, var(--good) 45%, transparent); }
  .key.avg { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--good) 35%, transparent) 0 3px, transparent 3px 5px); border: 1px solid color-mix(in srgb, var(--good) 45%, transparent); }
  .key.pilled { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--accent) 45%, transparent) 0 3px, transparent 3px 5px); border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent); }
  .verdict { margin: 8px 0 0; font-weight: 600; }
  .verdict[data-verdict='done'], .verdict[data-verdict='safe'] { color: var(--good); }
  .verdict[data-verdict='pill'], .verdict[data-verdict='risky'] { color: var(--accent); }
  .verdict[data-verdict='short'] { color: var(--bad); }
  .verdict[data-verdict='over'] { color: var(--muted); }
  .error { color: var(--bad); display: block; }
  .progress { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
  .progress div { height: 100%; background: var(--accent); transition: width .15s; }

  .filters { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { --s: var(--accent); display: inline-flex; align-items: center; gap: 4px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; color: var(--text); cursor: pointer; }
  .chip[data-state='all'] { --s: var(--accent); }
  .chip small { color: var(--muted); }
  .chip[aria-pressed='true'] { border-color: var(--s); background: color-mix(in srgb, var(--s) 16%, var(--surface-2)); }

  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
  th { font-size: 11px; color: var(--muted); font-weight: 600; white-space: nowrap; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tbody tr:hover td { background: color-mix(in srgb, var(--accent) 4%, transparent); }
  .sort { background: none; border: 0; padding: 2px 0; color: inherit; font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .sort:hover, .sort.active { color: var(--text); }
  .arrow { font-size: 10px; opacity: .6; }
  .sort.active .arrow { opacity: 1; color: var(--accent); }
  .dmg { font-weight: 700; font-size: 14px; }
  .up { color: var(--good); font-weight: 600; }
  tr.idle td { color: var(--muted); }
  .who { display: flex; align-items: center; gap: 10px; min-width: 170px; }
  .avatar { border-radius: 8px; flex: none; }
  .names { display: grid; gap: 1px; }
  .names small { display: inline-flex; align-items: center; gap: 4px; }
  .flag { border-radius: 1px; box-shadow: 0 0 0 1px rgba(0, 0, 0, .25); }
  .bars { display: grid; gap: 3px; min-width: 150px; }
  .bar { display: grid; grid-template-columns: 14px 60px auto; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; }
  .bar i { position: relative; height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .bar i::after { content: ''; position: absolute; inset: 0 auto 0 0; width: var(--w); border-radius: 3px; background: var(--c-life); }
  .bar i[data-kind='hunger']::after { background: var(--c-crit); }
  .bar b { font-weight: 500; }
  .bars small { font-size: 11px; }
  .gear :global(.strip) { flex-wrap: nowrap; }
  .small { font-size: 12px; margin: 10px 0 0; }
</style>
