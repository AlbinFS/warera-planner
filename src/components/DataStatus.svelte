<script>
  /** Where the data comes from and how fresh it is: one line, details on click. */
  import { getGameConfig, getItemPrices, getEquipmentPrices } from '../lib/warera.js';

  const SOURCES = [
    { name: 'Game config', load: getGameConfig, describe: (d) => `${Object.keys(d.items ?? {}).length} items` },
    { name: 'Item prices', load: getItemPrices, describe: (d) => `${Object.keys(d).length} prices` },
    {
      name: 'Equipment prices',
      load: getEquipmentPrices,
      describe: (d, r) => `${d.items.length} rolls from market trades${r.ready ? '' : ', still collecting'}`,
    },
  ];

  let rows = $state(SOURCES.map((s) => ({ name: s.name, status: 'loading', detail: '', fetchedAt: null, stale: false })));

  SOURCES.forEach((s, i) => {
    s.load()
      .then((r) => Object.assign(rows[i], { status: r.stale ? 'stale' : 'ok', detail: s.describe(r.data, r), fetchedAt: r.fetchedAt, stale: r.stale }))
      .catch((err) => Object.assign(rows[i], { status: 'error', detail: err.message }));
  });

  const anyStale = $derived(rows.some((r) => r.stale));
  const anyError = $derived(rows.some((r) => r.status === 'error'));
  const prices = $derived(rows[1].fetchedAt && rows[2].fetchedAt ? new Date(Math.min(rows[1].fetchedAt, rows[2].fetchedAt)) : null);

  function when(date) {
    if (!date) return '';
    const minutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 120) return `${minutes} min ago`;
    return date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  }
</script>

{#if anyStale}
  <p class="notice" role="status">The official WarEra API isn't answering right now. Showing the last prices we have, from {when(prices)}.</p>
{/if}
<details class="footer">
  <summary>
    <span class="dot" class:ok={!anyError && !anyStale} class:stale={anyStale} class:error={anyError} aria-hidden="true"></span>
    {#if anyError}Some data couldn't load{:else if prices}Market prices updated {when(prices)}{:else}Loading market prices…{/if}
  </summary>
  <ul>
    {#each rows as r (r.name)}
      <li>
        <strong>{r.name}</strong>
        <span class="muted">{#if r.status === 'loading'}Loading…{:else if r.status === 'error'}{r.detail}{:else}{r.detail} · fetched {when(r.fetchedAt)}{/if}</span>
      </li>
    {/each}
  </ul>
  <p class="muted">Gear prices are the median of each roll's recent market trades, refreshed every few minutes.</p>
</details>

<style>
  .footer { font-size: 13px; color: var(--muted); padding: 4px 2px; }
  summary { cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  .dot.ok { background: var(--good); }
  .dot.stale { background: var(--accent); }
  .dot.error { background: var(--bad); }
  ul { list-style: none; padding: 0; margin: 8px 0; display: grid; gap: 4px; }
  li { display: flex; gap: 10px; flex-wrap: wrap; }
  li strong { color: var(--text); font-weight: 500; min-width: 130px; }
  .notice { margin: 0; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--accent); }
</style>
