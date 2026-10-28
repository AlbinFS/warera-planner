/**
 * The planned build as a picture, for sharing with people who can't open the
 * site: fight settings, damage and cost, skills, gear with its rolls, food,
 * and the debuff build. Drawn on a canvas (dark, like the site), as a PNG.
 * No player name on it, like share links.
 */
import { FIGHT_SKILLS, ECONOMY_SKILLS, SLOTS } from '../engine/inputs.js';
import { SKILLS, statText } from './visual.js';
import { itemLabel } from './market.js';
import { fmt, fmtDamage, periodLabel } from './format.js';

const W = 760;
const PAD = 24;
const SCALE = 2;
const C = {
  bg: '#0d0f12', surface: '#15181d', line: '#2a2f38', text: '#e7e9ee', muted: '#8b93a1', accent: '#e1c06d', bad: '#e0605a',
  attack: '#e8894a', crit: '#e2605a', defense: '#9fb4c8', life: '#5cc98f', economy: '#e1c06d',
};
const RARITY = { common: '#8a949e', uncommon: '#5cbf6a', rare: '#4f9be0', epic: '#a66ae8', legendary: '#e8a33d', mythic: '#e5534b' };
// The site's skill colors are CSS variables; the canvas needs them as colors.
const skillColor = (k) => C[(SKILLS[k]?.color ?? '').match(/--c-(\w+)/)?.[1]] ?? C.text;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const SLOT_NAMES = { weapon: 'Weapon', ammo: 'Ammo', helmet: 'Helmet', chest: 'Chest', pants: 'Pants', boots: 'Boots', gloves: 'Gloves' };

/** An item's icon through the site (null when it can't be had: the picture is drawn without it). */
function loadIcon(code, items) {
  const name = (items?.[code]?.iconImg ?? `${code}.png`).replace(/\.png$/, '');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `/api/item-icon?icon=${encodeURIComponent(name)}`;
  });
}

const codeOf = (g) => (typeof g === 'string' ? g : g?.code ?? null);
const rolls = (g) => (g && typeof g === 'object' ? Object.entries(g.skills ?? {}).map(([k, v]) => `${SKILLS[k]?.label ?? k} ${statText(k, v)}`).join(' · ') : '');

/**
 * build: { planner, settings, result, items, debuff } (debuff: the debuff
 * build in use, { gear, food, hits } or null). Resolves to a PNG Blob.
 */
export async function buildImage({ planner, settings, result, items, debuff = null }) {
  const gearCodes = SLOTS.map((s) => codeOf(planner.gear[s]));
  const debuffCodes = debuff ? SLOTS.map((s) => codeOf(debuff.gear?.[s])) : [];
  const foods = [planner.food, debuff?.food].filter((f) => f && f !== 'none');
  const codes = [...new Set([...gearCodes, ...debuffCodes, ...foods].filter(Boolean))];
  const icons = Object.fromEntries(await Promise.all(codes.map(async (c) => [c, await loadIcon(c, items)])));

  const eco = ECONOMY_SKILLS.filter((k) => (planner.skills[k] ?? 0) > 0);
  const gearRows = SLOTS.length + 1;
  const height = PAD + 70 + 84 + 24 + Math.ceil(FIGHT_SKILLS.length / 3) * 30 + (eco.length ? 30 : 0) + 24 + gearRows * 44 + (debuff ? 34 + 30 * 2 : 0) + PAD + 10;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  const g = canvas.getContext('2d');
  g.scale(SCALE, SCALE);
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, height);
  g.textBaseline = 'middle';
  const text = (s, x, y, { size = 14, weight = 400, color = C.text, align = 'left', max } = {}) => {
    g.font = `${weight} ${size}px ${FONT}`;
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(String(s), x, y, max);
  };
  const box = (x, y, w, h, border = C.line) => {
    g.fillStyle = C.surface;
    g.strokeStyle = border;
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 8);
    g.fill();
    g.stroke();
  };
  const heading = (s, y) => text(s.toUpperCase(), PAD, y, { size: 11, weight: 700, color: C.muted });

  let y = PAD;
  // Title and the fight settings the numbers are for.
  text('WarEra build', PAD, y + 12, { size: 22, weight: 700 });
  const p = planner.player;
  const who = [p?.level ? `Level ${p.level}` : null, p ? `rank ${fmt(p.militaryRankPercent ?? 0, 0)} %` : null].filter(Boolean).join(' · ');
  if (who) text(who, W - PAD, y + 12, { size: 13, color: C.muted, align: 'right' });
  const setting = [periodLabel(settings), settings.pill ? 'pill on' : 'no pill', `battle bonus ${fmt(settings.battleBonus ?? 0, 0)} %`].join(' · ');
  text(setting, PAD, y + 42, { size: 13, color: C.muted });
  y += 70;

  // Damage and cost.
  const stats = result && !result.error ? [
    ['Damage', fmtDamage(result.damage)],
    ['Cost', `${fmt(result.cost, 1)} G`],
    ['Per 1k damage', `${fmt(result.damage > 0 ? (result.cost / result.damage) * 1000 : 0, 3)} G`],
    ['Hits', fmt(result.details?.swings ?? 0, 0)],
    ['Armor / dodge', `${result.details?.armor ?? 0} % / ${result.details?.dodge ?? 0} %`],
  ] : [];
  const sw = (W - 2 * PAD - 4 * 8) / 5;
  stats.forEach(([label, value], i) => {
    const x = PAD + i * (sw + 8);
    box(x, y, sw, 70, i < 3 ? C.accent : C.line);
    text(label, x + 12, y + 20, { size: 11, color: C.muted, max: sw - 24 });
    text(value, x + 12, y + 46, { size: i < 3 ? 20 : 16, weight: 700, color: i < 3 ? C.accent : C.text, max: sw - 24 });
  });
  y += 84;

  // Skills: three columns of fight skills, the economy skills in use on one line.
  heading('Skills', y + 8);
  y += 24;
  const cw = (W - 2 * PAD) / 3;
  FIGHT_SKILLS.forEach((k, i) => {
    const x = PAD + (i % 3) * cw;
    const yy = y + Math.floor(i / 3) * 30 + 12;
    g.fillStyle = skillColor(k);
    g.beginPath();
    g.arc(x + 5, yy, 4, 0, Math.PI * 2);
    g.fill();
    text(SKILLS[k]?.label ?? k, x + 16, yy, { size: 14 });
    text(planner.skills[k] ?? 0, x + cw - 16, yy, { size: 15, weight: 700, align: 'right' });
  });
  y += Math.ceil(FIGHT_SKILLS.length / 3) * 30;
  if (eco.length) {
    text(eco.map((k) => `${SKILLS[k]?.label ?? k} ${planner.skills[k]}`).join(' · '), PAD, y + 12, { size: 13, color: C.muted });
    y += 30;
  }

  // Gear, with each roll, then the food.
  heading('Gear', y + 8);
  y += 24;
  const item = (code, label, detail, yy) => {
    box(PAD, yy, W - 2 * PAD, 38, code ? RARITY[items?.[code]?.rarity] ?? C.line : C.line);
    if (code && icons[code]) g.drawImage(icons[code], PAD + 6, yy + 3, 32, 32);
    text(label, PAD + 46, yy + 19, { size: 12, color: C.muted });
    text(code ? itemLabel(code) || code : 'none', PAD + 120, yy + 19, { size: 14, weight: 600, color: code ? C.text : C.muted, max: 230 });
    if (detail) text(detail, W - PAD - 12, yy + 19, { size: 13, color: C.text, align: 'right', max: W - 2 * PAD - 380 });
  };
  SLOTS.forEach((slot, i) => item(gearCodes[i], SLOT_NAMES[slot], rolls(planner.gear[slot]), y + i * 44));
  y += SLOTS.length * 44;
  const food = planner.food && planner.food !== 'none' ? planner.food : null;
  item(food, 'Food', null, y);
  y += 44;

  // The debuff build: what's worn for the hours after the pill.
  if (debuff) {
    heading(`Debuff build (after the pill)${debuff.hits != null ? ` · ${debuff.hits} hits` : ''}`, y + 14);
    y += 34;
    const parts = SLOTS.map((s) => debuff.gear?.[s]).filter(Boolean).map((d) => `${itemLabel(codeOf(d)) || codeOf(d)}${rolls(d) ? ` (${rolls(d)})` : ''}`);
    if (!debuff.gear?.weapon) parts.unshift('no weapon');
    parts.push(debuff.food && debuff.food !== 'none' ? itemLabel(debuff.food) : 'no food');
    // Two lines at most, cut to fit.
    g.font = `400 13px ${FONT}`;
    const lines = [''];
    for (const part of parts) {
      const next = lines.at(-1) ? `${lines.at(-1)} · ${part}` : part;
      if (g.measureText(next).width > W - 2 * PAD && lines.at(-1)) lines.push(part);
      else lines[lines.length - 1] = next;
    }
    lines.slice(0, 2).forEach((l, i) => text(l, PAD, y + 10 + i * 30, { size: 13, max: W - 2 * PAD }));
  }

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the picture."))), 'image/png'));
}
