<script>
  /**
   * Moving employees between your companies (moving.js): the moves (or swaps,
   * into a full company) that pay over 30 days, and any one move checked by hand.
   */
  import { ecoEmployees } from '../lib/eco.svelte.js';
  import { moveValue, bestMoves, MOVE_DAYS } from '../lib/moving.js';
  import { fmt } from '../lib/format.js';
  import { itemImage } from '../lib/visual.js';

  let { companies, models = [], items } = $props();

  const signed = (n, d = 2) => `${n >= 0 ? '+' : ''}${fmt(n, d)}`;
  const running = $derived(companies.filter((c) => !c.disabled));
  const sides = $derived(running.map((c, i) => ({ id: c.id, name: c.name, good: c.good, capacity: c.breakRoom ?? 1, manager: c.manager && !c.manager.inactive ? c.manager.bonusPercent : 0, employees: ecoEmployees[c.id] ?? [], model: models[i] }))
    .filter((s) => s.model));
  const moves = $derived(sides.length > 1 ? bestMoves(sides) : []);

  // Check a move by hand.
  let pick = $state('');
  let to = $state('');
  let swapWith = $state('');
  const picked = $derived.by(() => {
    const [sid, i] = pick.split(':');
    const a = sides.find((s) => s.id === sid);
    return a ? { a, index: Number(i) } : null;
  });
  const target = $derived(sides.find((s) => s.id === to && s.id !== picked?.a.id) ?? null);
  const full = $derived(!!target && target.model.team.length >= target.capacity);
  const checked = $derived(picked && target && (!full || swapWith !== '') ? moveValue(picked.a, picked.index, target, { swap: full ? Number(swapWith) : null }) : null);
  $effect(() => { to; swapWith = ''; });

  const sideName = (s) => s.name;
</script>

<section class="card" aria-labelledby="moves-title">
  <h2 id="moves-title">Worth moving?</h2>
  <p class="muted small intro">
    Moving someone to another of your companies: they lose 5 happiness for 7 days, their wage stays, and in another good their specialization starts over (+1 % a day).
    What changes is who works with whom: an <strong>Old Friends</strong>, Sweethearts or Nemesis pair (only the one holding the trait gets it, while the other works in the same company), a Comic, Girl Power, a Xenophobe, the region's tax… Both companies are counted, day by day over {MOVE_DAYS} days. A full company (break room level) takes someone only as a swap.
  </p>

  {#if moves.length}
    <ul class="moves">
      {#each moves.slice(0, 8) as m, k (k)}
        {@render result(m, m.swap == null ? `Move ${m.name}` : `Swap ${m.name} ↔ ${m.swapName}`, m.from, m.to)}
      {/each}
    </ul>
    {#if moves.length > 8}<p class="muted small">{moves.length - 8} more moves pay less.</p>{/if}
  {:else if sides.length > 1}
    <p class="muted">No move or swap pays over {MOVE_DAYS} days right now.</p>
  {/if}

  <h3>Check a move</h3>
  <div class="pick">
    <label><span>Employee</span>
      <select bind:value={pick}>
        <option value="">Choose…</option>
        {#each sides as s (s.id)}
          <optgroup label={s.name}>
            {#each s.model.team as e, i (i)}<option value="{s.id}:{i}">{e.name || '(no name)'}</option>{/each}
          </optgroup>
        {/each}
      </select>
    </label>
    <label><span>To</span>
      <select bind:value={to} disabled={!picked}>
        <option value="">Choose…</option>
        {#each sides.filter((s) => s.id !== picked?.a.id) as s (s.id)}<option value={s.id}>{s.name} ({s.model.team.length} of {s.capacity})</option>{/each}
      </select>
    </label>
    {#if full}
      <label><span>{target.name} is full: swap with</span>
        <select bind:value={swapWith}>
          <option value="">Choose…</option>
          {#each target.model.team as e, j (j)}<option value={String(j)}>{e.name || '(no name)'}</option>{/each}
        </select>
      </label>
    {/if}
  </div>
  {#if checked}
    <ul class="moves">
      {@render result(checked, full ? `Swap ${picked.a.model.team[picked.index].name} ↔ ${target.model.team[Number(swapWith)].name}` : `Move ${picked.a.model.team[picked.index].name}`, picked.a, target)}
    </ul>
  {/if}
</section>

{#snippet result(m, title, from, toSide)}
  <li class="move" class:pays={m.total > 0}>
    <div class="what">
      <strong>{title}</strong>
      <span class="muted small"><img src={itemImage(from.good, items)} alt="" width="16" height="16" /> {sideName(from)} → <img src={itemImage(toSide.good, items)} alt="" width="16" height="16" /> {sideName(toSide)}</span>
    </div>
    <dl>
      <div><dt>Day 1</dt><dd class="num" class:good={m.first > 0} class:bad={m.first < 0}>{signed(m.first)}</dd></div>
      <div><dt>From day 21 on</dt><dd class="num" class:good={m.full > 0} class:bad={m.full < 0}>{signed(m.full)}</dd></div>
      <div><dt>Pays back</dt><dd class="num">{m.payback ? (m.payback === 1 ? 'at once' : `day ${m.payback}`) : 'never'}</dd></div>
      <div><dt>{MOVE_DAYS} days</dt><dd class="num" class:good={m.total > 0} class:bad={m.total < 0}>{signed(m.total, 1)} G</dd></div>
    </dl>
    {#if m.changes.length}
      <ul class="parts">
        {#each m.changes as c, i (i)}
          <li><span>{c.name || '(no name)'} <small class="muted">{c.company === 'moved' ? '(moved)' : c.company === 'moved back' ? '(moved back)' : c.company === 'a' ? `in ${sideName(from)}` : `in ${sideName(toSide)}`}</small></span><span class="num" class:good={c.change > 0} class:bad={c.change < 0}>{signed(c.change)}</span></li>
        {/each}
      </ul>
      <p class="muted small note">G a day from day 21 on, each at their company's value per point.</p>
    {/if}
  </li>
{/snippet}

<style>
  .intro { margin: 0 0 10px; line-height: 1.45; max-width: 760px; }
  .small { font-size: 12px; }
  h3 { margin: 16px 0 8px; font-size: 14px; }
  .moves { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .move { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; background: var(--surface-2); display: grid; gap: 8px; }
  .move.pays { border-color: color-mix(in srgb, var(--good) 45%, var(--line)); }
  .what { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: baseline; }
  .what img { vertical-align: middle; border-radius: 3px; }
  dl { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 0; }
  dt { font-size: 11px; color: var(--muted); }
  dd { margin: 0; font-weight: 600; }
  .parts { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: 12px; max-width: 420px; }
  .parts li { display: flex; justify-content: space-between; gap: 8px; }
  .note { margin: 0; }
  .good { color: var(--good); }
  .bad { color: var(--bad); }
  .pick { display: flex; flex-wrap: wrap; gap: 10px 16px; margin-bottom: 10px; }
  .pick label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
  .pick select { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 8px; color: var(--text); font-size: 14px; min-width: 180px; }
</style>
