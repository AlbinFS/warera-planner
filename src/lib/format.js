/** Number formatting shared by the planner's panels. */
export const fmt = (n, digits = 0) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '–';

export const fmtDamage = (n) => {
  if (!Number.isFinite(n)) return '–';
  if (Math.abs(n) >= 1e6) return `${fmt(n / 1e6, 2)}M`;
  if (Math.abs(n) >= 1e3) return `${fmt(n / 1e3, 0)}k`;
  return fmt(n, 0);
};

/** "per 8 h window" or "per day", for the current settings. */
export const periodLabel = (settings) => (settings.windowHours === 24 ? 'per day' : settings.windowHours === 16 ? 'per 16 h session' : `per ${settings.windowHours} h window`);
