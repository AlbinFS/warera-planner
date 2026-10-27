/**
 * Battle loot from real battles: what loot item each damage rank got.
 *
 * In a round, every 200k damage (both sides) rolls an item into the round's
 * pool; in a battle, every 500k. Each side's pool goes out by damage rank:
 * #1 the most valuable item, #2 the next, and so on. So what a given damage
 * earns depends on the battle; this keeps counts over the last 1000 finished
 * battles of at least MIN_DAMAGE (both sides), where many players fight: per
 * damage band, how many ranked players and how many got an item of each
 * rarity, for round loot and battle loot.
 *
 * Counts are kept running (each battle's own counts are stored, added once,
 * and taken off when it leaves the window), so serving them costs nothing.
 */
export const MIN_DAMAGE = 10e6;
export const WINDOW = 1000;
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const PAGE = 100;
const MAX_PAGES = 3;
// Damage bands: half powers of two from 25k (band 0 is below 35k), up to ~1.6B.
const BAND_BASE = 25e3;
export const BANDS = 32;
export const bandOf = (damage) => Math.max(0, Math.min(BANDS - 1, Math.floor(2 * Math.log2(Math.max(1, damage) / BAND_BASE))));
export const bandFloor = (band) => BAND_BASE * 2 ** (band / 2);

/** Counts for one ranking: { band: [ranked, common, …, mythic] }. */
export function addRanking(counts, items, rarityOf) {
  for (const it of items) {
    const band = bandOf(it.value);
    const row = (counts[band] ??= new Array(1 + RARITIES.length).fill(0));
    row[0]++;
    const r = it.lootItem ? RARITIES.indexOf(rarityOf(it.lootItem.code)) : -1;
    if (r >= 0) row[1 + r]++;
  }
  return counts;
}

/** Adds (sign 1) or takes off (sign −1) one battle's counts from the totals. */
export function merge(total, battle, sign) {
  total.battles = (total.battles ?? 0) + sign;
  total.rounds ??= {};
  total.rounds[battle.rounds] = (total.rounds[battle.rounds] ?? 0) + sign;
  for (const scope of ['round', 'battle']) {
    const into = (total[scope] ??= {});
    for (const [band, row] of Object.entries(battle[scope] ?? {})) {
      const t = (into[band] ??= new Array(row.length).fill(0));
      row.forEach((v, i) => { t[i] += sign * v; });
      if (t[0] <= 0) delete into[band];
    }
  }
  return total;
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS loot_battles (
  id TEXT PRIMARY KEY, ended_at INTEGER NOT NULL, damage INTEGER NOT NULL, kept INTEGER NOT NULL, counts TEXT
)`;

async function readState(db, name, fallback) {
  const row = await db.prepare('SELECT body FROM datasets WHERE name = ?').bind(name).first();
  return row ? JSON.parse(row.body) : fallback;
}
const writeState = (db, name, body, now) => db.prepare('INSERT OR REPLACE INTO datasets (name, body, fetched_at) VALUES (?, ?, ?)').bind(name, JSON.stringify(body), now);

/**
 * One battle's counts (round loot and battle loot, both sides). Every
 * ranking's first page comes in one batched request; a big battle's ranking
 * goes on (up to MAX_PAGES) while its page still had items handed out.
 */
async function battleCounts(api, battle, rarityOf) {
  const out = { rounds: battle.rounds.length, round: {}, battle: {} };
  const queries = [];
  for (const side of ['attacker', 'defender']) {
    queries.push({ scope: 'battle', key: { battleId: battle._id }, side });
    for (const roundId of battle.rounds) queries.push({ scope: 'round', key: { roundId }, side });
  }
  const body = (q, cursor) => ({ ...q.key, side: q.side, dataType: 'damage', type: 'user', limit: PAGE, ...(cursor ? { cursor } : {}) });
  const first = await api.batch('battleRanking.getRanking', queries.map((q) => body(q)));
  for (const [i, q] of queries.entries()) {
    let page = first[i];
    for (let n = 1; page; n++) {
      addRanking(out[q.scope], page.items ?? [], rarityOf);
      // Past the last item handed out there is nothing more to learn.
      if (!page.nextCursor || n >= MAX_PAGES || !(page.items ?? []).some((x) => x.lootItem)) break;
      page = await api.call('battleRanking.getRanking', body(q, page.nextCursor));
    }
  }
  return out;
}

/**
 * One slice of work: list newly finished battles (and older ones until the
 * window is full), then count up to `perRun` of them. state: { newest, cursor,
 * queue: [{ id, endedAt, damage, rounds }] }.
 */
export async function refreshBattleLoot(db, api, now, { rarityOf, perRun = 2 } = {}) {
  await db.prepare(SCHEMA).run();
  const state = await readState(db, 'battle-loot-state', { newest: null, cursor: null, backfilled: false, queue: [] });
  const total = await readState(db, 'battle-loot', { battles: 0, rounds: {}, round: {}, battle: {} });
  const { n } = await db.prepare('SELECT count(*) AS n FROM loot_battles WHERE kept = 1').first();
  const meta = (b) => ({ id: b._id, endedAt: Date.parse(b.endedAt ?? b.updatedAt), damage: (b.attacker?.damages ?? 0) + (b.defender?.damages ?? 0), rounds: b.rounds ?? [] });

  // Newly finished battles, every few minutes; older ones while the window isn't full.
  if (!state.listedAt || now - state.listedAt > 5 * 60 * 1000) {
    const page = await api.call('battle.getBattles', { isActive: false, limit: 50 });
    const fresh = [];
    for (const b of page.items ?? []) { if (b._id === state.newest) break; fresh.push(meta(b)); }
    if (page.items?.[0]) state.newest = page.items[0]._id;
    if (!state.cursor && !state.backfilled) state.cursor = page.nextCursor ?? null;
    state.queue = [...fresh, ...state.queue];
    state.listedAt = now;
  } else if (state.queue.length < 10 && !state.backfilled && n + state.queue.length < WINDOW && state.cursor) {
    const page = await api.call('battle.getBattles', { isActive: false, limit: 50, cursor: state.cursor });
    state.queue.push(...(page.items ?? []).map(meta));
    state.cursor = page.nextCursor ?? null;
    if (!state.cursor) state.backfilled = true;
  }
  if (n >= WINDOW) state.backfilled = true;

  const writes = [];
  let counted = 0;
  while (state.queue.length && counted < perRun) {
    const b = state.queue.shift();
    const seen = await db.prepare('SELECT 1 FROM loot_battles WHERE id = ?').bind(b.id).first();
    if (seen) continue;
    if (b.damage < MIN_DAMAGE) {
      // Small battles: noted so they aren't listed again, never counted.
      writes.push(db.prepare('INSERT INTO loot_battles (id, ended_at, damage, kept, counts) VALUES (?, ?, ?, 0, NULL)').bind(b.id, b.endedAt, b.damage));
      continue;
    }
    const counts = await battleCounts(api, { _id: b.id, rounds: b.rounds }, rarityOf);
    merge(total, counts, 1);
    writes.push(db.prepare('INSERT INTO loot_battles (id, ended_at, damage, kept, counts) VALUES (?, ?, ?, 1, ?)').bind(b.id, b.endedAt, b.damage, JSON.stringify(counts)));
    counted++;
  }
  // Keep the window at the newest WINDOW counted battles.
  const kept = n + counted;
  if (kept > WINDOW) {
    const { results } = await db.prepare('SELECT id, counts FROM loot_battles WHERE kept = 1 ORDER BY ended_at ASC LIMIT ?').bind(kept - WINDOW).all();
    for (const old of results) {
      merge(total, JSON.parse(old.counts), -1);
      writes.push(db.prepare('UPDATE loot_battles SET kept = 0, counts = NULL WHERE id = ?').bind(old.id));
    }
  }
  // Small battles' markers are only needed while they could be listed again.
  writes.push(db.prepare('DELETE FROM loot_battles WHERE kept = 0 AND ended_at < ?').bind(now - 30 * 24 * 60 * 60 * 1000));
  total.minDamage = MIN_DAMAGE;
  total.updatedAt = now;
  writes.push(writeState(db, 'battle-loot-state', state, now), writeState(db, 'battle-loot', total, now));
  await db.batch(writes);
}
