<script>
  /**
   * Company check: what needs doing in each company now, from the live data.
   * Full storage stops production and costs employees 10 happiness; a free
   * move into a core region of the owner's country gives every employee +5%.
   */
  import { ecoEmployees } from '../lib/eco.svelte.js';
  import { employeeDay, engineDaily, managerAdvice, MANAGER_MAX_VALUE } from '../lib/eco.js';
  import { planner } from '../lib/planner.svelte.js';
  import { cached } from '../lib/warera.js';
  import { fmt } from '../lib/format.js';
  import { itemImage } from '../lib/visual.js';
  import Icon from './Icon.svelte';
  import { mdiAlertCircle, mdiAlert, mdiMapMarkerRadius, mdiCheckCircle, mdiAccountTie, mdiHammerWrench, mdiAccountClock } from '@mdi/js';

  let { companies, perPoint, upgrades, items } = $props();

  let countries = $state.raw({});
  let regions = $state.raw({});
  cached('country.getAllCountries', {}, 60 * 60 * 1000).then((list) => (countries = Object.fromEntries((list ?? []).map((c) => [c._id, c])))).catch(() => {});
  cached('region.getRegionsObject', {}, 60 * 60 * 1000).then((r) => (regions = r ?? {})).catch(() => {});

  // The market's pay for a manager, per Management point an hour.
  let marketRate = $state(null);
  cached('managerOffer.getWageStats', {}, 30 * 60 * 1000).then((s) => (marketRate = s?.allowedRange?.average ? s.allowedRange.average / MANAGER_MAX_VALUE : null)).catch(() => {});

  const CORE_REGION_PERCENT = 5;
  // Moving the company: every employee −10 happiness for 7 days (Loyal halves it).
  const MOVE_HAPPINESS = 10;
  const MOVE_DAYS = 7;
  // A manager worth hiring by at least this much a day is worth mentioning.
  const HIRE_WORTH = 0.25;
  // Tools wear out after 500 worked hours: 0.2 condition an hour, 4.8 a day.
  const TOOL_WEAR_PER_DAY = 100 / 500 * 24;
  const SOON_DAYS = 2;
  const dayText = (days) => (days < 1 ? 'within a day' : `in about ${fmt(days, 0)} day${days >= 1.5 ? 's' : ''}`);
  const FILL_WARNING_HOURS = 12;

  const alerts = $derived(companies.filter((c) => !c.disabled).flatMap((c) => {
    const team = ecoEmployees[c.id] ?? [];
    const pp = perPoint[c.good] ?? 0;
    const staff = team.map((e) => ({ e, d: employeeDay(e, { managementValue: 0, currentManagementValue: 0, goodPerPoint: pp }) }));
    const points = engineDaily(upgrades, c.engine) + staff.reduce((s, x) => s + x.d.points, 0);
    const storageMax = upgrades.storage?.levels?.[String(c.storage)]?.stats?.maxProduction ?? 0;
    const hoursToFull = points > 0 && storageMax ? Math.max(0, (storageMax - c.stock) / (points / 24)) : Infinity;
    const out = [];
    if (c.isFull || (storageMax && c.stock >= storageMax)) {
      out.push({ level: 'bad', icon: mdiAlertCircle, text: 'Storage is full: production has stopped and every employee loses 10 happiness. Collect or sell, or upgrade the storage.' });
    } else if (hoursToFull < FILL_WARNING_HOURS) {
      out.push({ level: 'warn', icon: mdiAlert, text: `Storage is full in about ${fmt(hoursToFull, 0)} h (${fmt(c.stock, 0)} of ${fmt(storageMax, 0)}): collect or sell before then.` });
    }
    // In a core region? The employees' live bonus says so; without employees, the region's home country.
    const region = regions[c.region];
    const home = planner.player?.countryId;
    const inCore = team.length ? team.some((e) => (e.bonus ?? []).some((b) => b.source === 'coreRegion')) : region && home ? region.initialCountry === home : null;
    // A core region of yours another country took: its tax and mood now (the Location tab weighs moving).
    if (region && home && team.length && region.initialCountry === home && region.country !== home) {
      const tax = countries[region.country]?.taxes?.income ?? 0;
      out.push({
        level: 'warn', icon: mdiMapMarkerRadius, group: `occupied ${region._id}`,
        text: `${region.name} is held by ${countries[region.country]?.name ?? 'another country'} now: its ${fmt(tax, 1)}% income tax costs every employee ${fmt(tax, 1)} happiness (as much % output). See the Location tab for whether moving pays before it's retaken.`,
      });
    }
    if (c.freeMoves > 0 && inCore === false && home) {
      // +5% on each employee's output (their bonus is additive, so on top of what it is now).
      const base = (e, d) => d.points / (1 + (e.bonusPercent ?? 0) / 100);
      const gain = staff.reduce((s, { e, d }) => s + base(e, d) * (CORE_REGION_PERCENT / 100), 0) * pp;
      // The week of −10 happiness, once (happiness is a bonus point for point).
      const lossFactor = (e) => (1 - Math.min(1, (e.stats?.responsibility?.total ?? 0) / 10)) * ((e.traits ?? []).includes('loyal') ? 0.5 : 1);
      const cost = staff.reduce((s, { e, d }) => s + base(e, d) * (MOVE_HAPPINESS * lossFactor(e) / 100) * MOVE_DAYS, 0) * pp;
      const payback = gain > 0 ? cost / gain : null;
      out.push({
        level: 'move', icon: mdiMapMarkerRadius,
        text: `${c.freeMoves === 1 ? 'A free move is' : `${c.freeMoves} free moves are`} available and the company is outside ${countries[home]?.name ?? 'your country'}'s core regions: moving into one gives every employee +${CORE_REGION_PERCENT}%${gain > 0 ? ` (about +${fmt(gain, 2)} G a day)` : ''}. `
          + `The move costs every employee ${MOVE_HAPPINESS} happiness for ${MOVE_DAYS} days${cost > 0.005 ? ` (about ${fmt(cost, 2)} G in all)` : ''}${payback != null && cost > 0.005 ? `, paid back in about ${fmt(payback, 0)} days` : ''}.`,
      });
    }
    for (const { e, d } of staff) {
      if (e.tool && e.tool.state != null) {
        const days = e.tool.state / TOOL_WEAR_PER_DAY;
        if (days < SOON_DAYS) out.push({ level: 'warn', icon: mdiHammerWrench, text: `${e.name}'s tool (+${e.tool.percent}%) wears out ${dayText(days)}: have a spare ready, or they lose ${fmt((d.points / (1 + (e.bonusPercent ?? 0) / 100)) * (e.tool.percent / 100) * pp, 2)} G a day.` });
      }
      if (e.retireAt) {
        const days = (Date.parse(e.retireAt) - Date.now()) / 86400000;
        if (days < SOON_DAYS) out.push({ level: 'warn', icon: mdiAccountClock, text: `${e.name} asks to retire ${days <= 0 ? 'now' : dayText(days)}. Keeping them costs 5 days of wage (${fmt(d.wage * 5, 2)} G); they make ${fmt(d.profit, 2)} G a day after their wage.` });
      }
    }
    const advice = managerAdvice(c.manager, staff.map(({ e, d }) => ({ points: d.points, bonusPercent: e.bonusPercent })), pp, marketRate);
    if (c.manager?.unpaidHours > 0) {
      out.push({ level: 'bad', icon: mdiAccountTie, text: `The manager has ${c.manager.unpaidHours} unpaid hours: the company can't pay them. Keep money in the company.` });
    } else if (advice?.has && advice.net < -0.005) {
      out.push({ level: 'warn', icon: mdiAccountTie, text: `The manager costs ${fmt(advice.cost, 2)} G a day and adds ${fmt(advice.gain, 2)} G: ${fmt(-advice.net, 2)} G a day more than they bring.` });
    } else if (advice && !advice.has && advice.net >= HIRE_WORTH) {
      out.push({ level: 'move', icon: mdiAccountTie, text: `A full manager (+22%) at market pay would add about +${fmt(advice.net, 2)} G a day after their pay (${fmt(advice.gain, 2)} G more output for ${fmt(advice.cost, 2)} G).` });
    }
    return out.map((a) => ({ ...a, company: c }));
  }));
  const ORDER = { bad: 0, warn: 1, move: 2 };
  // Alerts about a whole region come once, naming every company there.
  const merged = $derived(alerts.reduce((list, a) => {
    const same = a.group && list.find((x) => x.group === a.group);
    if (same) same.companies.push(a.company);
    else list.push({ ...a, companies: [a.company] });
    return list;
  }, []));
  const sorted = $derived([...merged].sort((a, b) => ORDER[a.level] - ORDER[b.level]));
</script>

<section class="card" aria-labelledby="alerts-title">
  <h2 id="alerts-title">Company check</h2>
  {#if sorted.length}
    <ul class="alerts">
      {#each sorted as a, i (i)}
        <li data-level={a.level}>
          <Icon path={a.icon} size={18} />
          {#if a.companies.length === 1}<img src={itemImage(a.company.good, items)} alt="" width="18" height="18" class="mini" />{/if}
          <strong>{a.companies.map((c) => c.name).join(', ')}</strong>
          <span>{a.text}</span>
        </li>
      {/each}
    </ul>
  {:else if companies.length}
    <p class="ok"><Icon path={mdiCheckCircle} size={18} /> Nothing needs doing: no storage is full or close to it, no company has a free move it should use, and every manager earns their pay, no tool is about to wear out and nobody is about to ask to retire.</p>
  {/if}
</section>

<style>
  .alerts { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .alerts li { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--line); font-size: 14px; flex-wrap: wrap; }
  .alerts li strong { white-space: nowrap; }
  .alerts li span { flex: 1; min-width: 220px; }
  [data-level='bad'] { border-color: var(--bad); color: var(--bad); }
  [data-level='bad'] span { color: var(--text); }
  [data-level='warn'] { border-color: var(--accent); color: var(--accent); }
  [data-level='warn'] span { color: var(--text); }
  [data-level='move'] { border-color: var(--info); color: var(--info); }
  [data-level='move'] span { color: var(--text); }
  .mini { border-radius: 4px; }
  .ok { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--good); }
</style>
