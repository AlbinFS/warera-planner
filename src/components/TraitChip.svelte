<script>
  /** A trait with its community tier (S … F), colour-coded; hover for what it does. */
  import { TRAITS, tierOf, traitName } from '../lib/hiring.js';

  let { code, hidden = false } = $props();
  const tier = $derived(hidden ? null : tierOf(code));
</script>

<span class="trait" data-tier={tier ?? '?'} title={hidden ? 'Not revealed yet' : TRAITS[code]?.note ?? ''}>
  <b>{tier ?? '?'}</b>{hidden ? 'Hidden trait' : traitName(code)}
</span>

<style>
  .trait { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 1px 8px 1px 1px; border-radius: 999px; border: 1px solid var(--tier, var(--line)); white-space: nowrap; }
  .trait b { display: inline-grid; place-items: center; min-width: 18px; height: 18px; border-radius: 999px; background: var(--tier, var(--surface-2)); color: #16161a; font-size: 11px; }
  /* The community tier list's colours. */
  [data-tier='S'] { --tier: #f472b6; }
  [data-tier='A'] { --tier: #fb923c; }
  [data-tier='B'] { --tier: #facc15; }
  [data-tier='C'] { --tier: #4ade80; }
  [data-tier='D'] { --tier: #60a5fa; }
  [data-tier='E'] { --tier: #a78bfa; }
  [data-tier='F'] { --tier: #f87171; }
</style>
