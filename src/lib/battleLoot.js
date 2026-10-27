/**
 * Expected battle loot for a fight's damage, from the counts the site keeps
 * of real battles (worker/battleLoot.js): per damage band, how many ranked
 * players got an item of each rarity, for round loot and battle loot.
 *
 * A fight's damage counts whole for the battle's loot and is split evenly
 * over the battle's rounds for round loot (most battles take 2 rounds; the
 * data says how many). Between bands the chances are interpolated.
 */
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const BAND_BASE = 25e3;
const position = (damage) => 2 * Math.log2(Math.max(1, damage) / BAND_BASE);

/** Chance per rarity of getting an item, at this damage, in one scope ({ band: [ranked, …per rarity] }). */
function chances(bands, damage) {
  const rows = Object.entries(bands ?? {}).map(([b, row]) => ({ band: Number(b), row })).filter((x) => x.row[0] > 0).sort((a, b) => a.band - b.band);
  if (!rows.length) return RARITIES.map(() => 0);
  const at = (x) => x.row.slice(1).map((n) => n / x.row[0]);
  const p = position(damage) - 0.5; // a band's middle
  if (p <= rows[0].band) return at(rows[0]);
  if (p >= rows.at(-1).band) return at(rows.at(-1));
  const hi = rows.findIndex((x) => x.band >= p);
  const a = rows[hi - 1], b = rows[hi];
  const t = (p - a.band) / (b.band - a.band);
  return at(a).map((v, i) => v + t * (at(b)[i] - v));
}

/** Most common number of rounds per battle in the data. */
export const typicalRounds = (data) => Number(Object.entries(data?.rounds ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 2) || 2;

/**
 * Expected loot for a fight of `damage`: { items, byRarity, value, epicPlus,
 * rounds, battles } with prices per rarity (G).
 */
export function expectedLoot(data, damage, prices = {}) {
  if (!data?.battles || !(damage > 0)) return null;
  const rounds = typicalRounds(data);
  const round = chances(data.round, damage / rounds).map((p) => p * rounds);
  const battle = chances(data.battle, damage);
  const byRarity = Object.fromEntries(RARITIES.map((r, i) => [r, round[i] + battle[i]]));
  const items = Object.values(byRarity).reduce((s, x) => s + x, 0);
  const value = RARITIES.reduce((s, r) => s + byRarity[r] * (prices[r] ?? 0), 0);
  const epicPlus = byRarity.epic + byRarity.legendary + byRarity.mythic;
  return { items, byRarity, value, epicPlus, rounds, battles: data.battles, minDamage: data.minDamage };
}
