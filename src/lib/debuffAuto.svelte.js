/**
 * Keeps the debuff build suggested for the planned setup: whenever what it
 * depends on changes (skills, level, rank, battle bonus, food setting, fight
 * bounty and loot), it is worked out again, unless it was edited by
 * hand (planner.debuff.auto === false; the Suggest button turns it back on).
 */
import { planner, playerStatus, setDebuff } from './planner.svelte.js';
import { settings } from './settings.svelte.js';
import { suggestDebuff } from './compute.js';
import { incomeTerms } from './fightIncome.svelte.js';

// Edits come in bursts (a skill clicked up a few levels): wait for them to settle.
const SETTLE_MS = 600;

export function trackDebuff(market) {
  let last = '';
  let timer = null;
  return $effect.root(() => {
    $effect(() => {
      const wanted = settings.pill && settings.splitDebuff && planner.player && !playerStatus.loading;
      const manual = planner.debuff?.auto === false;
      const terms = incomeTerms(market);
      const key = JSON.stringify([planner.player?.id, planner.player?.level, planner.player?.militaryRankPercent, planner.skills,
        settings.battleBonus, settings.food, terms.bounty, terms.perK]);
      if (!wanted || manual || (key === last && planner.debuff)) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        // For the 8 hours after the pill: a 16 h session.
        const s = await suggestDebuff(market, planner, { ...settings, windowHours: 16 }, terms).catch(() => null);
        if (s && planner.debuff?.auto !== false) { setDebuff(s); last = key; }
      }, SETTLE_MS);
    });
  });
}
