<script>
  /** A modal dialog (native <dialog>): Escape or the close button closes it. */
  import Icon from './Icon.svelte';
  import { mdiClose } from '@mdi/js';

  let { open = $bindable(false), title, children } = $props();
  let dialog;

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-label={title}
  onclick={(e) => { if (e.target === dialog) open = false; }}>
  <div class="body">
    <div class="head">
      <h2>{title}</h2>
      <button class="close" onclick={() => (open = false)} aria-label="Close"><Icon path={mdiClose} size={20} /></button>
    </div>
    {#if open}{@render children()}{/if}
  </div>
</dialog>

<style>
  dialog {
    border: 1px solid var(--line); border-radius: 12px; padding: 0;
    background: var(--surface); color: var(--text);
    width: min(720px, calc(100vw - 24px)); max-height: calc(100vh - 48px);
    /* Only up and down: a sideways scrollbar showed while the content settled in. */
    overflow-x: hidden;
  }
  dialog::backdrop { background: rgb(0 0 0 / .55); }
  .body { padding: 16px var(--gap) var(--gap); }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .head h2 { margin: 0; font-size: 16px; }
  .close { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 4px; }
  /* The optimizer panels inside don't need their own card frame. */
  .body :global(.card) { border: 0; padding: 0; background: none; }
  .body :global(.card .head h2) { display: none; }
</style>
