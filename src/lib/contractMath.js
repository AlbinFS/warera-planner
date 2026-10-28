/** Contract arithmetic with no dependencies (tested on its own; contract.js re-exports it). */

/**
 * A build's result under the contract terms; break-even is the bounty rate where net is 0.
 * `loot` is battle loot per fight: an amount, or a function of the build's damage.
 */
export function evaluate(p, { bounty, poolLoot = 0, economy, loot = 0 }) {
  const lootValue = typeof loot === 'function' ? loot(p.damage) : loot;
  const income = ((bounty + poolLoot) * p.damage) / 1000 + lootValue;
  const net = income + economy - p.cost;
  const breakEven = p.damage > 0 ? ((p.cost - economy - lootValue) / p.damage) * 1000 - poolLoot : Infinity;
  return { ...p, income, loot: lootValue, net, breakEven };
}

/** Loot by damage as points for the search's workers: [damage, G], log-spaced from 20k to 200M (120 a decade, 2 % apart). */
export function lootCurve(lootAt) {
  return Array.from({ length: 481 }, (_, i) => 20e3 * 10 ** (i / 120)).map((d) => [d, lootAt(d)]);
}
