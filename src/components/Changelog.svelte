<script>
  /**
   * What's new: a quiet link at the bottom of every page, and a pop-up once
   * per browser after a new entry is added to changelog.js.
   */
  import Dialog from './Dialog.svelte';
  import { CHANGELOG, unseen, markSeen } from '../lib/changelog.js';

  // New since this browser last looked: shown once, then marked seen.
  const fresh = unseen();
  let open = $state(fresh.length > 0);
  let showAll = $state(false);
  const shown = $derived(showAll ? CHANGELOG : fresh);

  function openAll() {
    showAll = true;
    open = true;
  }
  // Closing (button, Escape, a click outside) marks everything seen.
  $effect(() => { if (!open) markSeen(); });

  // "**bold** text" → [{ text, bold }].
  const parts = (s) => s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((t) => (t.startsWith('**') ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false }));
  const day = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
</script>

<div class="whatsnew">
  <button type="button" class="link" onclick={openAll}>What's new</button>
</div>

<Dialog bind:open title={showAll ? "What's new" : "What's new since your last visit"}>
  <div class="log">
    {#each shown as e (e.id)}
      <article>
        <header><h3>{e.title}</h3><time datetime={e.date}>{day(e.date)}</time></header>
        {#if e.intro}<p class="intro">{e.intro}</p>{/if}
        <ul>
          {#each e.items as item, i (i)}
            <li>{#each parts(item) as p, j (j)}{#if p.bold}<strong>{p.text}</strong>{:else}{p.text}{/if}{/each}</li>
          {/each}
        </ul>
      </article>
    {/each}
    <div class="foot">
      {#if !showAll && CHANGELOG.length > shown.length}<button type="button" class="link" onclick={() => (showAll = true)}>Earlier updates</button>{/if}
      <button type="button" class="ok" onclick={() => (open = false)}>Got it</button>
    </div>
  </div>
</Dialog>

<style>
  .whatsnew { max-width: 1280px; margin: 0 auto; padding: 0 var(--gap) var(--gap); text-align: center; }
  .link { background: none; border: 0; padding: 4px 6px; color: var(--muted); font-size: 12px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
  .link:hover { color: var(--text); }
  .log { display: grid; gap: 18px; }
  article header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h3 { margin: 0; font-size: 15px; }
  time { color: var(--muted); font-size: 12px; }
  .intro { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
  ul { margin: 8px 0 0; padding-left: 20px; display: grid; gap: 6px; font-size: 14px; line-height: 1.45; }
  .foot { display: flex; justify-content: flex-end; align-items: center; gap: 12px; }
  .ok { background: var(--accent); color: var(--accent-ink); border: 0; border-radius: var(--radius-sm); padding: 8px 18px; font-weight: 600; cursor: pointer; }
</style>
