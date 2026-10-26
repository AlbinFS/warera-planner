<script>
  import { getGameConfig, getItemPrices } from '../lib/warera.js';

  // Each data source with when it arrived, so differences between tools can be traced.
  let sources = $state([
    { name: 'Game config', detail: '', status: 'loading', at: null },
    { name: 'Item prices', detail: '', status: 'loading', at: null },
    { name: 'Equipment prices', detail: '', status: 'loading', at: null },
  ]);

  const done = (i, detail) => Object.assign(sources[i], { status: 'ok', detail, at: new Date() });
  const failed = (i, err) => Object.assign(sources[i], { status: 'error', detail: err.message });

  getGameConfig()
    .then((c) => done(0, `${Object.keys(c.items ?? {}).length} items`))
    .catch((e) => failed(0, e));
  getItemPrices()
    .then((p) => done(1, `${Object.keys(p).length} prices`))
    .catch((e) => failed(1, e));
  fetch('/api/equipment-prices')
    .then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      done(2, `${body.items.length} rolls`);
    })
    .catch((e) => failed(2, e));

  const time = (d) => d?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
</script>

<section class="card" aria-label="Data sources">
  <h2>Data</h2>
  <ul>
    {#each sources as s (s.name)}
      <li>
        <span class="dot {s.status}" aria-hidden="true"></span>
        <span class="name">{s.name}</span>
        <span class="detail muted">
          {#if s.status === 'loading'}Loading…{:else if s.status === 'ok'}{s.detail}, as of {time(s.at)}{:else}{s.detail}{/if}
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
  .dot.error { background: var(--bad); }
  @media (max-width: 520px) {
    li { grid-template-columns: 12px 1fr; }
    .detail { grid-column: 2; }
  }
</style>
