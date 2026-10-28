<script>
  /**
   * Search as you type, like the game's own search: players (avatar, level,
   * country) and/or units (member count). Arrow keys and Enter pick a result.
   */
  import { cached, cachedBatch } from '../lib/warera.js';
  import { flagImage } from '../lib/visual.js';
  import Icon from './Icon.svelte';
  import { mdiMagnify, mdiClose, mdiAccountGroup } from '@mdi/js';

  // current: the name already loaded (it isn't searched for, so no suggestions come up for it).
  let { kinds = ['players', 'units'], placeholder = 'Search', value = $bindable(''), onpick, busy = false, current = null } = $props();

  let results = $state([]);
  let open = $state(false);
  let active = $state(-1);
  let loading = $state(false);
  // Suggestions only show while the box is being typed in, never on their own when a page opens.
  let focused = $state(false);
  let seq = 0;
  let countries = {};
  // The name just picked: filling it into the box shouldn't search again.
  let pickedName = null;

  // Look up 250 ms after the last keystroke, from 2 letters on.
  $effect(() => {
    const text = value.trim();
    const id = ++seq;
    if (text.length < 2 || text === pickedName || (current && text.toLowerCase() === current.toLowerCase())) { results = []; open = false; return; }
    pickedName = null;
    const timer = setTimeout(() => search(text, id), 250);
    return () => clearTimeout(timer);
  });

  async function search(text, id) {
    loading = true;
    try {
      const found = await cached('search.searchAnything', { searchText: text });
      const userIds = kinds.includes('players') ? (found.userIds ?? []).slice(0, 6) : [];
      const muIds = kinds.includes('units') ? (found.muIds ?? []).slice(0, 6) : [];
      const [details, countryList] = await Promise.all([
        cachedBatch([...userIds.map((userId) => ['user.getUserLite', { userId }]), ...muIds.map((muId) => ['mu.getById', { muId }])], 5 * 60 * 1000),
        Object.keys(countries).length ? null : cached('country.getAllCountries', {}, 60 * 60 * 1000).catch(() => []),
      ]);
      if (countryList) countries = Object.fromEntries(countryList.map((c) => [c._id, c]));
      if (id !== seq) return;
      const users = details.slice(0, userIds.length).filter(Boolean).map((u) => ({
        kind: 'player', id: u._id, name: u.username, avatar: u.avatarUrl,
        detail: `level ${u.leveling?.level ?? '?'}${countries[u.country] ? ` · ${countries[u.country].name}` : ''}`,
        flag: countries[u.country]?.code, user: u,
      }));
      const units = details.slice(userIds.length).filter(Boolean).map((m) => ({
        kind: 'unit', id: m._id, name: m.name, avatar: m.avatarUrl,
        detail: `${m.members?.length ?? 0} members${countries[m.country] ? ` · ${countries[m.country].name}` : ''}`,
        flag: countries[m.country]?.code, unit: m,
      }));
      results = [...users, ...units];
      open = focused;
      active = results.length ? 0 : -1;
    } catch {
      if (id === seq) results = [];
    } finally {
      if (id === seq) loading = false;
    }
  }

  function pick(r) {
    pickedName = r.name;
    value = r.name;
    open = false;
    results = [];
    onpick?.(r);
  }

  function key(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); open = true; active = Math.min(results.length - 1, active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); }
    else if (e.key === 'Escape') { open = false; }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && results[active]) pick(results[active]);
      else if (results.length === 1) pick(results[0]);
    }
  }

  const groups = $derived([
    { label: 'Players', items: results.filter((r) => r.kind === 'player') },
    { label: 'Units', items: results.filter((r) => r.kind === 'unit') },
  ].filter((g) => g.items.length));
</script>

<div class="box" class:open={open && results.length}>
  <span class="field">
    <Icon path={mdiMagnify} size={18} />
    <input bind:value {placeholder} autocomplete="off" spellcheck="false" role="combobox" aria-expanded={open && results.length > 0}
      aria-controls="search-results" aria-autocomplete="list" onkeydown={key} onfocus={() => { focused = true; open = results.length > 0; }}
      onblur={() => { focused = false; setTimeout(() => (open = false), 150); }} />
    {#if busy || loading}<span class="spin" aria-label="Searching"></span>{/if}
    {#if value}<button class="clear" type="button" onclick={() => { value = ''; results = []; }} aria-label="Clear"><Icon path={mdiClose} size={16} /></button>{/if}
  </span>
  {#if open && results.length}
    <div class="results" id="search-results" role="listbox">
      {#each groups as g (g.label)}
        <div class="group">{g.label}</div>
        {#each g.items as r (r.kind + r.id)}
          {@const i = results.indexOf(r)}
          <button type="button" role="option" aria-selected={i === active} class:active={i === active}
            onmousedown={(e) => e.preventDefault()} onclick={() => pick(r)} onmouseenter={() => (active = i)}>
            {#if r.avatar}<img src={r.avatar} alt="" width="28" height="28" />{:else}<span class="ph"><Icon path={mdiAccountGroup} size={16} /></span>{/if}
            <span class="name">{r.name}</span>
            <span class="detail">{#if r.flag}<img class="flag" src={flagImage(r.flag)} alt="" width="16" height="11" />{/if}{r.detail}</span>
          </button>
        {/each}
      {/each}
    </div>
  {/if}
</div>

<style>
  .box { position: relative; flex: 1; min-width: 0; }
  .field {
    display: flex; align-items: center; gap: 8px; padding: 0 10px; color: var(--muted);
    background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm);
  }
  .field:focus-within { outline: 2px solid var(--accent); }
  input { flex: 1; min-width: 0; background: none; border: 0; padding: 9px 0; color: var(--text); outline: none; font-size: 15px; }
  .clear { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 2px; display: grid; }
  .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--accent); animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .results {
    position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); max-height: 340px; overflow-y: auto;
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: 0 10px 30px rgb(0 0 0 / .35); padding: 4px;
  }
  .group { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; padding: 8px 10px 4px; }
  [role='option'] {
    display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 10px; background: none; border: 0;
    border-radius: var(--radius-sm); color: var(--text); cursor: pointer; text-align: left; font: inherit;
  }
  [role='option'].active { background: color-mix(in srgb, var(--accent) 14%, var(--surface-2)); }
  [role='option'] img { border-radius: 6px; object-fit: cover; }
  .ph { width: 28px; height: 28px; border-radius: 6px; background: var(--surface-2); display: grid; place-items: center; color: var(--muted); }
  .name { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 12px; white-space: nowrap; }
  .flag { border-radius: 1px; }
</style>
