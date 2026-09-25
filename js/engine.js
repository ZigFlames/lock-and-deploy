// Scheduling engine: decides WHEN deposits run. It asks the provider to move
// (fictional) money; it never edits balances itself.
import { getState, update, addTx, replace, seedState } from './store.js';
import { provider } from './banking/index.js';
import { isUnlocked, checkUnlock } from './banking/SimulatedProvider.js';
import { addDays, diffDays } from './dates.js';
import { nextOccurrence } from './schedule.js';
import { money } from './money.js';

export { isUnlocked };

export function authActive(s, id) { return !!id && s.authorizations.some((a) => a.id === id && !a.revokedAt); }

/** Why a goal's schedule is or isn't running. */
export function scheduleStatus(s, g) {
  if (g.status === 'paid_out') return { code: 'paid_out', label: 'Paid out', running: false };
  if (g.status === 'cancelled') return { code: 'cancelled', label: 'Cancelled', running: false };
  if (g.status === 'cancel_pending') return { code: 'cancel_pending', label: 'Cancellation pending', running: false };
  if (isUnlocked(g)) return { code: 'complete', label: 'Fully saved', running: false };
  if (!g.schedule || !g.schedule.amount) return { code: 'none', label: 'No schedule', running: false };
  if (!authActive(s, g.schedule.authorizationId)) return { code: 'unauthorized', label: 'Needs your authorization', running: false };
  if (s.frozen) return { code: 'frozen', label: 'Frozen (fraud report)', running: false };
  if (s.globalPaused) return { code: 'global_paused', label: 'All deposits paused', running: false };
  if (g.paused) return { code: 'paused', label: 'Paused', running: false };
  return { code: 'active', label: 'Active', running: true };
}

/** Projected completion if the schedule runs as planned from the current sim day. */
export function projection(s, g, overrideAmount) {
  if (isUnlocked(g)) return { done: true, date: g.unlockedAt || s.simNow, deposits: 0 };
  const st = scheduleStatus(s, g);
  const sched = g.schedule ? { ...g.schedule, amount: overrideAmount || g.schedule.amount } : null;
  if (!sched || !(sched.amount > 0)) return { done: false, date: null, reason: 'No schedule' };
  let date = (st.running && sched.nextDate && sched.nextDate > s.simNow) ? sched.nextDate : nextOccurrence(sched, addDays(s.simNow, 1));
  let bal = g.balance, n = 0;
  while (bal < g.target && n < 2000 && date) {
    bal += Math.min(sched.amount, g.target - bal); n++;
    if (bal >= g.target) break;
    date = nextOccurrence(sched, addDays(date, 1));
  }
  return { done: false, date, deposits: n, hypothetical: !st.running, reason: st.running ? null : st.label, daysAway: date ? diffDays(s.simNow, date) : null };
}

/** Next upcoming deposit across all running goals. */
export function nextDeposit(s) {
  let best = null;
  for (const g of s.goals) {
    if (!scheduleStatus(s, g).running || !g.schedule.nextDate) continue;
    const amt = Math.min(g.schedule.amount, g.target - g.balance);
    if (!best || g.schedule.nextDate < best.date) best = { date: g.schedule.nextDate, amount: amt, goals: [g.name] };
    else if (g.schedule.nextDate === best.date) { best.amount += amt; best.goals.push(g.name); }
  }
  return best;
}

/** Advance the simulated clock day by day, posting any due deposits. */
export async function advanceDays(n) {
  let posted = 0, skipped = 0;
  for (let i = 0; i < n; i++) {
    update((s) => { s.simNow = addDays(s.simNow, 1); });
    const s = getState();
    const day = s.simNow;
    for (const g of s.goals) {
      if (g.status === 'cancel_pending' && g.cancelEffectiveAt && g.cancelEffectiveAt <= day) {
        await provider.finalizeCancellation(g.id);
        continue;
      }
      const sch = g.schedule;
      if (!sch || !sch.nextDate || sch.nextDate > day) continue;
      const st = scheduleStatus(s, g);
      if (st.running) {
        const amt = Math.min(sch.amount, g.target - g.balance);
        if (amt > 0) { await provider.executeDeposit(g.id, amt, { source: 'scheduled', date: day }); posted++; }
      } else if (['paused', 'global_paused', 'frozen'].includes(st.code)) {
        update((st2) => addTx(st2, { goalId: g.id, type: 'deposit_skipped', amount: 0, note: `Scheduled deposit skipped: ${st.label.toLowerCase()}. Balance unchanged.` }));
        skipped++;
      }
      update(() => {
        sch.nextDate = (isUnlocked(g) || g.status !== 'active') ? null : nextOccurrence(sch, addDays(day, 1));
      });
    }
  }
  return { posted, skipped };
}

/** After resume/unfreeze: make sure no schedule points at a past date (no catch-up pulls). */
export function rearm(s) {
  for (const g of s.goals) {
    const sch = g.schedule;
    if (!sch || !authActive(s, sch.authorizationId) || g.status !== 'active' || isUnlocked(g)) continue;
    if (!sch.nextDate || sch.nextDate <= s.simNow) sch.nextDate = nextOccurrence(sch, addDays(s.simNow, 1));
  }
}

// ---- User actions (thin wrappers so the UI stays declarative) ----
export async function pauseGoal(id) { await provider.pauseSchedule(id); }
export async function resumeGoal(id) { await provider.resumeSchedule(id); update(rearm); }
export function pauseAll() { update((s) => { s.globalPaused = true; addTx(s, { type: 'global_paused', note: 'All future deposits paused. Every locked balance stays locked.' }); }); }
export function resumeAll() { update((s) => { s.globalPaused = false; addTx(s, { type: 'global_resumed', note: 'All schedules resumed (goals paused individually stay paused).' }); rearm(s); }); }

export async function authorizeSchedule(goalId, schedule, consent) {
  const s = getState();
  const sched = { ...schedule };
  if (sched.frequency === 'weekly' || sched.frequency === 'biweekly') sched.anchorDate = sched.anchorDate || addDays(s.simNow, 1);
  sched.nextDate = nextOccurrence(sched, addDays(s.simNow, 1));
  const { authorizationId } = await provider.createAuthorization(goalId, sched, consent);
  await provider.scheduleDeposit(goalId, sched, authorizationId);
  return sched;
}

export function setBalanceSim(goalId, cents) {
  update((s) => {
    const g = s.goals.find((x) => x.id === goalId);
    if (!g || g.status !== 'active') return;
    const before = g.balance;
    g.balance = Math.max(0, cents);
    addTx(s, { goalId, type: 'balance_set', amount: g.balance - before, note: `Sim: balance set from ${money(before)} to ${money(g.balance)}` });
    checkUnlock(s, g);
    rearm(s);
  });
}

export function resetDemo() {
  const fresh = seedState();
  fresh.transactions.unshift({ id: 'tx_reset', goalId: null, type: 'demo_reset', amount: 0, date: fresh.simNow, ts: new Date().toISOString(), note: 'Demo data reset' });
  replace(fresh);
}
