<script>
  import { getGameConfig, getItemPrices, getEquipmentPrices } from '../lib/warera.js';

  // Each data source with when it was fetched, so differences between tools can be traced.
  const SOURCES = [
    { name: 'Game config', load: getGameConfig, describe: (d) => `${Object.keys(d.items ?? {}).length} items` },
    { name: 'Item prices', load: getItemPrices, describe: (d) => `${Object.keys(d).length} prices` },
    {
      name: 'Equipment prices',
      load: getEquipmentPrices,
      describe: (d, r) => `${d.items.length} rolls${r.ready ? '' : ', history still being collected'}`,
    },
  ];

  let rows = $state(SOURCES.map((s) => ({ name: s.name, status: 'loading', detail: '', fetchedAt: null, stale: false })));

  SOURCES.forEach((s, i) => {
    s.load()
      .then((r) => Object.assign(rows[i], { status: r.stale ? 'stale' : 'ok', detail: s.describe(r.data, r), fetchedAt: r.fetchedAt, stale: r.stale }))
      .catch((err) => Object.assign(rows[i], { status: 'error', detail: err.message }));
  });

  const anyStale = $derived(rows.some((r) => r.stale));

  function when(date) {
    if (!date) return '';
    const minutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 120) return `${minutes} min ago`;
    return date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  }
</script>

<section class="card" aria-label="Data sources">
  <h2>Data</h2>
  {#if anyStale}
    <p class="notice" role="status">The official WarEra API isn't answering right now. Showing the last data we have; check the times below.</p>
  {/if}
  <ul>
    {#each rows as r (r.name)}
      <li>
        <span class="dot {r.status}" aria-hidden="true"></span>
        <span class="name">{r.name}</span>
        <span class="detail muted">
          {#if r.status === 'loading'}Loading…{:else if r.status === 'error'}{r.detail}{:else}{r.detail} · fetched {when(r.fetchedAt)}{/if}
        </span>
      </li>
    {/each}
  </ul>
</section>

<style>
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  li { display: grid; grid-template-columns: 12px 140px 1fr; align-items: center; gap: 10px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); }
  .dot.ok { background: var(--good); }
  .dot.stale { background: var(--accent); }
  .dot.error { background: var(--bad); }
  .notice {
    margin: 0 0 12px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--accent);
    color: var(--text);
  }
  @media (max-width: 520px) {
    li { grid-template-columns: 12px 1fr; }
    .detail { grid-column: 2; }
  }
</style>
