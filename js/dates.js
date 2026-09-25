// Date helpers. All app dates are plain calendar days ("YYYY-MM-DD") handled in UTC
// so time zones and DST never shift a scheduled deposit to a different day.
export const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function fmt(dt) { return dt.toISOString().slice(0, 10); }
export function addDays(s, n) { return fmt(new Date(parse(s).getTime() + n * DAY_MS)); }
export function daysInMonth(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
export function addMonths(s, n) {
  const d = parse(s);
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const y = base.getUTCFullYear(), m = base.getUTCMonth();
  return fmt(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), daysInMonth(y, m)))));
}
/** Calendar date for "day N of month m" (m may overflow), clamped to month length. */
export function dayOfMonthDate(y, m, day) {
  const base = new Date(Date.UTC(y, m, 1));
  const yy = base.getUTCFullYear(), mm = base.getUTCMonth();
  return fmt(new Date(Date.UTC(yy, mm, Math.min(day, daysInMonth(yy, mm)))));
}
export function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / DAY_MS); }
export function pretty(s, opts = {}) {
  if (!s) return '—';
  return parse(s).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', ...opts });
}
export function weekday(s) { return parse(s).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' }); }
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
