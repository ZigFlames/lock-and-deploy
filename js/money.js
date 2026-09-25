// All money is stored as integer cents (fictional money in Phase 1).
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const money = (cents) => usd.format((cents || 0) / 100);
export const money0 = (cents) => ((cents || 0) % 100 === 0 ? usd0 : usd).format((cents || 0) / 100);
export function toCents(v) {
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
