<script>
  /** The visitor's own WarEra API key: kept in this browser, sent only to the official API. */
  import Dialog from './Dialog.svelte';
  import { getApiKey, setApiKey } from '../lib/warera.js';

  let { open = $bindable(false), onchange } = $props();

  let value = $state('');
  let saved = $state(!!getApiKey());
  let message = $state('');

  $effect(() => {
    if (open) { value = ''; message = ''; saved = !!getApiKey(); }
  });

  async function save(event) {
    event.preventDefault();
    const key = value.trim();
    if (!key) return;
    message = 'Checking the key…';
    // A call that needs a key: it fails without a valid one.
    const res = await fetch('https://api2.warera.io/trpc/transaction.getPaginatedTransactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify({ limit: 1, transactionType: 'wage' }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok || body?.result?.data === undefined) {
      message = "That key wasn't accepted by the WarEra API.";
      return;
    }
    setApiKey(key);
    saved = true;
    value = '';
    message = 'Saved. It is used from now on.';
    onchange?.();
  }

  function remove() {
    setApiKey('');
    saved = false;
    message = 'Removed from this browser.';
    onchange?.();
  }
</script>

<Dialog bind:open title="Your WarEra API key">
  <p>Most of the site works without one. With your own key it can also:</p>
  <ul>
    <li>load <strong>your employees</strong> on the Eco page (the game only shares them with a key);</li>
    <li>use <strong>your real job salary</strong> (from your recent wages) in the income estimates, instead of a default;</li>
    <li>load bigger pages like the <strong>Unit</strong> page without running into the official API's limit for anonymous visitors.</li>
  </ul>
  <p class="muted small">Create a key in WarEra under Settings → API Tokens. The key is stored <strong>only in this browser</strong> and sent <strong>only to the official WarEra API</strong>, never to this site's server. Remove it here at any time.</p>
  <form class="row" onsubmit={save}>
    <label class="visually-hidden" for="api-key">API key</label>
    <input id="api-key" type="password" autocomplete="off" bind:value placeholder={saved ? 'A key is saved; paste a new one to replace it' : 'Paste your API key'} />
    <button class="primary">Save</button>
    {#if saved}<button type="button" class="ghost" onclick={remove}>Remove</button>{/if}
  </form>
  {#if message}<p class="small" role="status">{message}</p>{/if}
</Dialog>

<style>
  ul { margin: 0 0 8px; padding-left: 20px; display: grid; gap: 4px; }
  p { margin: 0 0 8px; }
  .small { font-size: 13px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .row input { flex: 1; min-width: 220px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px 10px; color: var(--text); }
  .primary { background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius-sm); padding: 8px 14px; font-weight: 600; cursor: pointer; }
  .ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px 14px; cursor: pointer; }
</style>
