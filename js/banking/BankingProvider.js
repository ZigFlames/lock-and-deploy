/**
 * BankingProvider: the Phase-2 integration seam.
 *
 * Every operation that would move, hold, or authorize money goes through this
 * interface. The UI and scheduling engine never touch balances directly.
 *
 *  - SimulatedProvider (Phase 1) implements it against local, fictional state.
 *  - PartnerProvider (Phase 2 stub) documents how a regulated partner bank /
 *    BaaS provider would implement it. See docs/PHASE2_INTEGRATION.md.
 *
 * All methods are async because a real implementation calls a partner API.
 * Amounts are integer cents. Dates are "YYYY-MM-DD".
 */
export class BankingProvider {
  /** @returns {{id:string, label:string, live:boolean, movesRealMoney:boolean}} */
  get info() { throw new NotImplemented('info'); }

  /** Link the user's external account (partner: via Plaid/MX/verified micro-deposits). */
  async linkAccount(_details) { throw new NotImplemented('linkAccount'); }

  /**
   * Record the user's explicit authorization (NACHA-style debit authorization)
   * for a goal's recurring schedule. Must include consent text + timestamp.
   * @returns {Promise<{authorizationId:string, grantedAt:string}>}
   */
  async createAuthorization(_goalId, _schedule, _consent) { throw new NotImplemented('createAuthorization'); }

  /** Revoke an authorization (or 'all'). Must stop FUTURE pulls immediately. */
  async revokeAuthorization(_authorizationIdOrAll, _reason) { throw new NotImplemented('revokeAuthorization'); }

  /** Create/replace the recurring deposit schedule for a goal (requires an active authorization). */
  async scheduleDeposit(_goalId, _schedule, _authorizationId) { throw new NotImplemented('scheduleDeposit'); }

  /** Execute one deposit into the locked goal (scheduled or one-off). */
  async executeDeposit(_goalId, _amountCents, _meta) { throw new NotImplemented('executeDeposit'); }

  /** Pause FUTURE deposits only. Must never release or unlock held funds. */
  async pauseSchedule(_goalId) { throw new NotImplemented('pauseSchedule'); }
  async resumeSchedule(_goalId) { throw new NotImplemented('resumeSchedule'); }

  /** Current held balance for a goal, in cents. */
  async getBalance(_goalId) { throw new NotImplemented('getBalance'); }

  /** Only allowed when balance >= target. method: 'merchant' | 'linked_account'. */
  async requestWithdrawal(_goalId, _method, _details) { throw new NotImplemented('requestWithdrawal'); }

  /** Start a cancellation with a cooling-off period (not instant). */
  async requestCancellation(_goalId, _coolingOffDays) { throw new NotImplemented('requestCancellation'); }
  async withdrawCancellationRequest(_goalId) { throw new NotImplemented('withdrawCancellationRequest'); }
  async finalizeCancellation(_goalId) { throw new NotImplemented('finalizeCancellation'); }

  /** Report unauthorized activity; freezes all schedules. */
  async reportFraud(_report) { throw new NotImplemented('reportFraud'); }
  async unfreeze() { throw new NotImplemented('unfreeze'); }

  /** Turn on real money movement. Phase 1: always refused. */
  async activateRealTransfers(_ack) { throw new NotImplemented('activateRealTransfers'); }
}

export class NotImplemented extends Error {
  constructor(m) { super(`BankingProvider.${m} is not implemented`); this.name = 'NotImplemented'; }
}
export class ProviderError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = 'ProviderError'; }
}
