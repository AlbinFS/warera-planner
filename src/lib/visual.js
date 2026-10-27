/**
 * How things look: icons and colours for stats and skills, rarity colours,
 * and item and flag images from the game's own image server.
 */
import {
  mdiSword, mdiTarget, mdiFlash, mdiBullseyeArrow, mdiShield, mdiRunFast, mdiHeart, mdiTreasureChest,
  mdiSilverwareForkKnife, mdiFactory, mdiLightningBolt, mdiBriefcase, mdiAccountGroup, mdiCrown, mdiAccountStar,
} from '@mdi/js';

const MEDIA = 'https://media.warera.io/images';

/** Fight and economy skills: label, icon, colour, and whether the game shows the value as a percentage. */
export const SKILLS = {
  attack: { label: 'Attack', icon: mdiSword, color: 'var(--c-attack)' },
  precision: { label: 'Precision', icon: mdiTarget, color: 'var(--c-attack)', percent: true },
  criticalChance: { label: 'Crit chance', icon: mdiFlash, color: 'var(--c-crit)', percent: true },
  criticalDamages: { label: 'Crit damage', icon: mdiBullseyeArrow, color: 'var(--c-crit)', percent: true },
  armor: { label: 'Armor', icon: mdiShield, color: 'var(--c-defense)' },
  dodge: { label: 'Dodge', icon: mdiRunFast, color: 'var(--c-defense)' },
  health: { label: 'Health', icon: mdiHeart, color: 'var(--c-life)' },
  lootChance: { label: 'Loot chance', icon: mdiTreasureChest, color: 'var(--c-life)', percent: true },
  hunger: { label: 'Hunger', icon: mdiSilverwareForkKnife, color: 'var(--c-crit)' },
  production: { label: 'Production', icon: mdiFactory, color: 'var(--c-economy)' },
  energy: { label: 'Energy', icon: mdiLightningBolt, color: 'var(--c-economy)' },
  entrepreneurship: { label: 'Entrepreneurship', icon: mdiBriefcase, color: 'var(--c-economy)' },
  companies: { label: 'Companies', icon: mdiAccountGroup, color: 'var(--c-economy)' },
  management: { label: 'Management', icon: mdiCrown, color: 'var(--c-economy)' },
  leadership: { label: 'Leadership', icon: mdiAccountStar, color: 'var(--c-economy)' },
};

/** Gear stats share the skill icons; precision on gloves and crit chance on weapons show as %. */
export const STATS = {
  attack: SKILLS.attack,
  criticalChance: SKILLS.criticalChance,
  criticalDamages: SKILLS.criticalDamages,
  armor: SKILLS.armor,
  dodge: SKILLS.dodge,
  precision: SKILLS.precision,
};

export const RARITY_COLORS = {
  common: 'var(--r-common)', uncommon: 'var(--r-uncommon)', rare: 'var(--r-rare)',
  epic: 'var(--r-epic)', legendary: 'var(--r-legendary)', mythic: 'var(--r-mythic)',
};

/** The game's picture of an item (armor tiers share one picture per slot). */
export function itemImage(code, items) {
  const icon = items?.[code]?.iconImg ?? `${code}.png`;
  return `${MEDIA}/items/${encodeURIComponent(icon.replace(/\.png$/, ''))}.png?v=33`;
}

export const rarityOf = (code, items) => items?.[code]?.rarity ?? 'common';

export const flagImage = (countryCode) => `${MEDIA}/flags/${encodeURIComponent(countryCode)}.svg?v=16`;

/** "+12%" style for percentage stats, plain numbers otherwise. */
export function statText(stat, value) {
  return STATS[stat]?.percent || stat === 'criticalChance' || stat === 'precision' || stat === 'criticalDamages' ? `${value}%` : String(value);
}
