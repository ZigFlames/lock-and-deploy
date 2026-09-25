/**
 * SimulatedProvider (Phase 1). FICTIONAL MONEY ONLY.
 * Operates purely on local app state. Makes no network calls, holds no funds,
 * and cannot move real money.
 */
import { BankingProvider, ProviderError } from './BankingProvider.js';
import { update, getState, addTx, uid } from '../store.js';
import { addDays } from '../dates.js';
import { money } from '../money.js';

const goalOf = (s, id) => {
  const g = s.goals.find((x) => x.id === id);
  if (!g) throw new ProviderError('not_found', 'Goal not found');
  return g;
};
export const isUnlocked = (g) => g.target > 0 && g.balance >= g.target;

export class SimulatedProvider extends BankingProvider {
  get info() { return { id: 'simulated', label: 'Simulated provider (fictional money)', live: false, movesRealMoney: false }; }

  async linkAccount({ name = 'Sim Checking', mask = '4821' } = {}) {
    return update((s) => { s.linkedAccount = { name, mask, simulated: true }; addTx(s, { type: 'account_linked', note: `Linked ${name} ••${mask} (simulated)` }); return s.linkedAccount; });
  }

  async createAuthorization(goalId, schedule, consent) {
    if (!consent || !consent.agreed || !consent.text) throw new ProviderError('consent_required', 'Explicit authorization is required.');
    return update((s) => {
      const g = goalOf(s, goalId);
      const auth = { id: uid('auth'), goalId, grantedAt: new Date().toISOString(), simDate: s.simNow, consentText: consent.text, schedule: { ...schedule }, revokedAt: null };
      s.authorizations.push(auth);
      addTx(s, { goalId, type: 'authorization_granted', note: `Authorized for ${g.name}: ${consent.summary || ''}`.trim() });
      return { authorizationId: auth.id, grantedAt: auth.grantedAt };
    });
  }

  async revokeAuthorization(which, reason = 'User revoked') {
    return update((s) => {
      const now = new Date().toISOString();
      const targets = s.authorizations.filter((a) => !a.revokedAt && (which === 'all' || a.id === which || a.goalId === which));
      targets.forEach((a) => {
        a.revokedAt = now;
        const g = s.goals.find((x) => x.id === a.goalId);
        if (g && g.schedule && g.schedule.authorizationId === a.id) { g.schedule.authorizationId = null; g.schedule.nextDate = null; }
        addTx(s, { goalId: a.goalId, type: 'authorization_revoked', note: `${reason}. Future deposits stopped immediately. Locked savings unchanged.` });
      });
      return targets.length;
    });
  }

  async scheduleDeposit(goalId, schedule, authorizationId) {
    return update((s) => {
      const g = goalOf(s, goalId);
      const auth = s.authorizations.find((a) => a.id === authorizationId && !a.revokedAt);
      if (!auth) throw new ProviderError('no_authorization', 'An active authorization is required to schedule deposits.');
      // Supersede any older authorization for this goal.
      s.authorizations.filter((a) => a.goalId === goalId && a.id !== authorizationId && !a.revokedAt).forEach((a) => { a.revokedAt = new Date().toISOString(); });
      const had = !!(g.schedule && g.schedule.authorizationId);
      g.schedule = { ...schedule, authorizationId };
      addTx(s, { goalId, type: had ? 'schedule_changed' : 'schedule_set', amount: schedule.amount, note: `Schedule ${had ? 'changed' : 'set'}. Next deposit ${schedule.nextDate || '—'}` });
      return g.schedule;
    });
  }

  async executeDeposit(goalId, amount, meta = {}) {
    if (!(amount > 0)) throw new ProviderError('bad_amount', 'Amount must be positive');
    return update((s) => {
      const g = goalOf(s, goalId);
      if (g.status !== 'active') throw new ProviderError('goal_closed', 'Goal is not accepting deposits');
      g.balance += amount;
      addTx(s, { goalId, type: meta.source === 'manual' ? 'deposit_manual' : 'deposit', amount, note: meta.source === 'manual' ? 'Simulated one-off deposit (Sim panel)' : 'Scheduled deposit posted (simulated)' });
      checkUnlock(s, g);
      return g.balance;
    });
  }

  async pauseSchedule(goalId) {
    // Pausing ONLY flips a flag on future deposits. Balance and lock are untouched.
    return update((s) => { const g = goalOf(s, goalId); g.paused = true; addTx(s, { goalId, type: 'paused', note: `Future deposits paused. ${money(g.balance)} stays locked.` }); });
  }
  async resumeSchedule(goalId) {
    return update((s) => { const g = goalOf(s, goalId); g.paused = false; addTx(s, { goalId, type: 'resumed', note: 'Scheduled deposits resumed.' }); });
  }

  async getBalance(goalId) { return goalOf(getState(), goalId).balance; }

  async requestWithdrawal(goalId, method, details = {}) {
    return update((s) => {
      const g = goalOf(s, goalId);
      // Defense in depth: the UI never offers this while locked, and the provider refuses too.
      if (!isUnlocked(g)) throw new ProviderError('locked', 'Funds stay locked until the goal is fully saved.');
      if (g.status !== 'active') throw new ProviderError('goal_closed', 'Goal already closed');
      const amt = g.balance;
      const label = method === 'merchant' ? `Pay merchant directly${details.merchant ? `: ${details.merchant}` : ''}` : `Transfer to ${s.linkedAccount.name} ••${s.linkedAccount.mask}`;
      addTx(s, { goalId, type: 'withdrawal_requested', amount: amt, note: `${label} (simulated)` });
      g.balance = 0;
      g.status = 'paid_out';
      g.paidOutAt = s.simNow;
      g.paidOutMethod = method;
      addTx(s, { goalId, type: 'withdrawal_completed', amount: amt, note: `${money(amt)} released: ${label}. Simulation only; no real money moved.` });
      return { amount: amt };
    });
  }

  async requestCancellation(goalId, coolingOffDays = 10) {
    return update((s) => {
      const g = goalOf(s, goalId);
      if (g.status !== 'active') throw new ProviderError('bad_state', 'Goal cannot be cancelled now');
      g.status = 'cancel_pending';
      g.cancelRequestedAt = s.simNow;
      g.cancelEffectiveAt = addDays(s.simNow, coolingOffDays);
      addTx(s, { goalId, type: 'cancel_requested', note: `Cancellation requested. Deposits stopped. ${coolingOffDays}-day cooling-off; funds stay locked until ${g.cancelEffectiveAt}.` });
    });
  }
  async withdrawCancellationRequest(goalId) {
    return update((s) => {
      const g = goalOf(s, goalId);
      if (g.status !== 'cancel_pending') return;
      g.status = 'active'; g.cancelRequestedAt = null; g.cancelEffectiveAt = null;
      addTx(s, { goalId, type: 'cancel_withdrawn', note: 'Cancellation request withdrawn. Goal kept.' });
    });
  }
  async finalizeCancellation(goalId) {
    return update((s) => {
      const g = goalOf(s, goalId);
      if (g.status !== 'cancel_pending') return;
      const amt = g.balance;
      g.balance = 0; g.status = 'cancelled';
      addTx(s, { goalId, type: 'cancel_completed', amount: amt, note: `Cooling-off ended. ${money(amt)} returned to ${s.linkedAccount.name} ••${s.linkedAccount.mask} (simulated).` });
    });
  }

  async reportFraud(report = {}) {
    return update((s) => {
      s.frozen = true; s.frozenAt = new Date().toISOString();
      addTx(s, { type: 'fraud_reported', note: `Unauthorized activity reported${report.description ? `: "${String(report.description).slice(0, 140)}"` : ''}. Case ${uid('case').toUpperCase()}` });
      addTx(s, { type: 'schedules_frozen', note: 'All schedules frozen. No deposits will run until you unfreeze.' });
    });
  }
  async freeze(reason = 'Frozen by user') {
    return update((s) => { if (s.frozen) return; s.frozen = true; s.frozenAt = new Date().toISOString(); addTx(s, { type: 'schedules_frozen', note: `${reason}. No deposits will run until you unfreeze.` }); });
  }
  async unfreeze() {
    return update((s) => { s.frozen = false; s.frozenAt = null; addTx(s, { type: 'schedules_unfrozen', note: 'Freeze lifted. Schedules with active authorizations may run again.' }); });
  }

  async activateRealTransfers() {
    throw new ProviderError('phase1_simulation', 'Real transfers cannot be activated in Phase 1. No regulated banking partner is connected.');
  }
}

/** Log an 'unlocked' event the first time a goal reaches its target. */
export function checkUnlock(s, g) {
  if (isUnlocked(g) && !g.unlockedAt) {
    g.unlockedAt = s.simNow;
    addTx(s, { goalId: g.id, type: 'unlocked', amount: g.balance, note: `${g.name} fully saved. Lock opened.` });
  } else if (!isUnlocked(g) && g.unlockedAt) {
    g.unlockedAt = null; // only reachable via Sim "set balance"
  }
}
