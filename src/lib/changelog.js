/**
 * What's new on the site, newest first. Only the updates worth telling
 * players about go here (not every change). Each entry's id must be unique
 * and never change: a browser that hasn't seen the newest id gets the
 * "What's new" pop-up once (Changelog.svelte).
 */
export const CHANGELOG = [
  {
    id: '2026-10-29-v0.27.3',
    date: '2026-10-29',
    title: 'Game update v0.27.2 & v0.27.3',
    intro: 'The planner now follows the game\'s latest rules.',
    items: [
      '**Leadership is part of Management.** It is gone from every skill list and optimizer; better training cards and +2 % event odds now come with each Management level, and the Eco skill optimizer counts them on Management.',
      '**Responsibility** gives +3 happiness per point (it used to shield a share of happiness losses).',
      '**Luck** counts from the first point in employee events: +4 % a point on luck checks, +2 % on others.',
      '**Firing and transfers are free:** firing costs coworkers no happiness, moving someone between your companies costs nothing, and a new hire can\'t be fired for 12 hours.',
      '**Traits:** Early Bloomer replaces Sprinter, new employees always have one trait (Old Friends and Nemesis can come with a hire), Specialist matches the company\'s good, the game\'s clashing traits are respected, and Rehab is offered for bad traits only.',
      '**Estimated profit** on the Employees tab now matches the game exactly: each good\'s value per point, as the game counts it, and hired managers in the payroll.',
    ],
  },
];

const SEEN_KEY = 'changelog.seen';

/** The id of the newest entry this browser has seen (null: none, or nothing stored). */
export function seenId() {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}

/** Marks every entry as seen in this browser. */
export function markSeen() {
  try { localStorage.setItem(SEEN_KEY, CHANGELOG[0]?.id ?? ''); } catch {}
}

/** The entries newer than the last one seen here (just the newest on a first visit). */
export function unseen(seen = seenId()) {
  if (!seen) return CHANGELOG.slice(0, 1);
  const i = CHANGELOG.findIndex((e) => e.id === seen);
  return i < 0 ? CHANGELOG.slice(0, 1) : CHANGELOG.slice(0, i);
}
