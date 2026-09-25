import { addDays, diffDays, parse, dayOfMonthDate, ordinal, weekday } from './dates.js';
import { money0 } from './money.js';

export const FREQUENCIES = {
  benefit: 'After my benefit payment',
  monthly: 'Monthly on a set day',
  biweekly: 'Every 2 weeks',
  weekly: 'Every week',
};

/**
 * First deposit date on or after `from` (YYYY-MM-DD) for a schedule.
 * schedule = { amount, frequency, anchorDate?, dayOfMonth?, benefitDay?, offsetDays? }
 */
export function nextOccurrence(s, from) {
  if (!s) return null;
  const f = parse(from);
  switch (s.frequency) {
    case 'weekly':
    case 'biweekly': {
      const step = s.frequency === 'weekly' ? 7 : 14;
      const anchor = s.anchorDate || from;
      const d = diffDays(anchor, from);
      if (d <= 0) return anchor;
      return addDays(anchor, Math.ceil(d / step) * step);
    }
    case 'monthly': {
      for (let i = 0; i < 3; i++) {
        const c = dayOfMonthDate(f.getUTCFullYear(), f.getUTCMonth() + i, s.dayOfMonth || 1);
        if (c >= from) return c;
      }
      return null;
    }
    case 'benefit': {
      // Start one month back: a large offset can push last month's payment into this month.
      for (let i = -1; i < 3; i++) {
        const payday = dayOfMonthDate(f.getUTCFullYear(), f.getUTCMonth() + i, s.benefitDay || 1);
        const c = addDays(payday, s.offsetDays || 0);
        if (c >= from) return c;
      }
      return null;
    }
    default:
      return null;
  }
}

export function describe(s) {
  if (!s) return 'No schedule yet';
  const amt = money0(s.amount);
  switch (s.frequency) {
    case 'weekly': return `${amt} every week (${weekday(s.anchorDate)}s)`;
    case 'biweekly': return `${amt} every 2 weeks (${weekday(s.anchorDate)}s)`;
    case 'monthly': return `${amt} monthly on the ${ordinal(s.dayOfMonth)}`;
    case 'benefit': {
      const off = Number(s.offsetDays) || 0;
      const when = off === 0 ? 'the same day as' : `${off} day${off === 1 ? '' : 's'} after`;
      return `${amt} ${when} my benefit payment (paid on the ${ordinal(s.benefitDay)})`;
    }
    default: return amt;
  }
}

export function validateSchedule(s) {
  const errs = [];
  if (!(s.amount > 0)) errs.push('Enter a deposit amount above $0.');
  if (!FREQUENCIES[s.frequency]) errs.push('Choose how often to deposit.');
  if (s.frequency === 'monthly' && !(s.dayOfMonth >= 1 && s.dayOfMonth <= 31)) errs.push('Day of month must be 1–31.');
  if (s.frequency === 'benefit') {
    if (!(s.benefitDay >= 1 && s.benefitDay <= 31)) errs.push('Benefit payment day must be 1–31.');
    if (!(s.offsetDays >= 0 && s.offsetDays <= 10)) errs.push('Offset must be 0–10 days.');
  }
  return errs;
}
