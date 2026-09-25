// Tiny persisted store. State lives in localStorage on this device only.
import { todayLocal, addMonths } from './dates.js';

export const STORAGE_KEY = 'lockdeploy.state.v1';
let state = null;
const subs = new Set();

const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
export { uid };

export function seedState() {
  const today = todayLocal();
  return {
    version: 1,
    mode: 'simulation',          // Phase 1: fictional money only. Never 'live'.
    simNow: today,               // simulated clock (advanced from the Sim panel)
    globalPaused: false,
    frozen: false,               // fraud freeze: blocks ALL schedules
    frozenAt: null,
    linkedAccount: { name: 'Sim Checking', mask: '4821', simulated: true },
    realTransfers: { enabled: false, lastWarningAckAt: null },
    authorizations: [],
    goals: [
      {
        id: 'goal_mattress',
        name: 'Mattress',
        target: 300000,          // $3,000.00 in cents
        balance: 0,
        targetDate: addMonths(today, 6),
        createdAt: today,
        status: 'active',        // active | cancel_pending | cancelled | paid_out
        paused: false,
        unlockedAt: null,
        cancelRequestedAt: null,
        cancelEffectiveAt: null,
        // Drafted but NOT authorized: the user must explicitly authorize it first.
        schedule: { amount: 50000, frequency: 'benefit', benefitDay: 3, offsetDays: 1, dayOfMonth: 4, anchorDate: today, nextDate: null, authorizationId: null },
      },
    ],
    transactions: [
      { id: uid('tx'), goalId: 'goal_mattress', type: 'goal_created', amount: 0, date: today, ts: new Date().toISOString(), note: 'Goal created: Mattress, target $3,000' },
    ],
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 1 && Array.isArray(s.goals)) return s;
    }
  } catch (e) { console.warn('State load failed, reseeding', e); }
  return seedState();
}

export function init() { state = load(); persist(); return state; }
export function getState() { return state; }
function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.error(e); } }

/** Mutate state inside fn, then persist and notify subscribers. */
export function update(fn) {
  const r = fn(state);
  persist();
  subs.forEach((cb) => cb(state));
  return r;
}
export function replace(next) { state = next; persist(); subs.forEach((cb) => cb(state)); }
export function subscribe(cb) { subs.add(cb); return () => subs.delete(cb); }

/** Append to the audit log. `date` = simulated day, `ts` = real wall-clock timestamp. */
export function addTx(s, { goalId = null, type, amount = 0, note = '' }) {
  const tx = { id: uid('tx'), goalId, type, amount, date: s.simNow, ts: new Date().toISOString(), note };
  s.transactions.unshift(tx);
  return tx;
}
