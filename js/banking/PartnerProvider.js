/**
 * PartnerProvider: PHASE 2 STUB. NOT CONNECTED. MOVES NO MONEY.
 *
 * Placeholder for a future regulated banking partner (a bank, or a BaaS
 * provider whose partner bank holds funds in FDIC-insured custodial / FBO
 * accounts). Every method throws. The comments describe the intended mapping.
 * Full notes: docs/PHASE2_INTEGRATION.md. Nothing here is legal advice.
 */
import { BankingProvider, ProviderError } from './BankingProvider.js';

const notConnected = (method, plan) => {
  throw new ProviderError('partner_not_connected', `PartnerProvider.${method}: not available in Phase 1. Planned: ${plan}`);
};

export class PartnerProvider extends BankingProvider {
  constructor(config = {}) {
    super();
    // Planned config: { baseUrl, clientId, webhookSecretRef, programId }.
    // Secrets must live server-side (a backend-for-frontend), never in this PWA.
    this.config = config;
  }
  get info() { return { id: 'partner', label: 'Partner bank (Phase 2, not connected)', live: false, movesRealMoney: false }; }

  async linkAccount() { notConnected('linkAccount', 'POST /accounts/external (verified via Plaid/MX or micro-deposits); returns externalAccountId'); }
  async createAuthorization() { notConnected('createAuthorization', 'POST /ach/authorizations with consent text, IP, timestamp, schedule; partner retains NACHA authorization record'); }
  async revokeAuthorization() { notConnected('revokeAuthorization', 'POST /ach/authorizations/{id}/revoke; cancel pending future debits immediately'); }
  async scheduleDeposit() { notConnected('scheduleDeposit', 'POST /recurring-transfers {from: externalAccountId, to: goal sub-ledger, amount, rrule}'); }
  async executeDeposit() { notConnected('executeDeposit', 'POST /transfers (ACH debit into FBO sub-ledger); result via transfer.* webhooks'); }
  async pauseSchedule() { notConnected('pauseSchedule', 'PATCH /recurring-transfers/{id} {status:"paused"}; must not touch held balance'); }
  async resumeSchedule() { notConnected('resumeSchedule', 'PATCH /recurring-transfers/{id} {status:"active"}'); }
  async getBalance() { notConnected('getBalance', 'GET /sub-ledgers/{goalId}/balance (source of truth = partner ledger)'); }
  async requestWithdrawal() { notConnected('requestWithdrawal', 'POST /payouts (merchant pay or ACH credit to linked account); only when balance >= target'); }
  async requestCancellation() { notConnected('requestCancellation', 'POST /goals/{id}/cancellation with cooling-off per program terms'); }
  async withdrawCancellationRequest() { notConnected('withdrawCancellationRequest', 'DELETE /goals/{id}/cancellation'); }
  async finalizeCancellation() { notConnected('finalizeCancellation', 'partner job after cooling-off; ACH credit to linked account'); }
  async reportFraud() { notConnected('reportFraud', 'POST /disputes (Reg E error-resolution intake) + freeze recurring transfers'); }
  async unfreeze() { notConnected('unfreeze', 'POST /programs/{user}/unfreeze after identity re-verification'); }
  async activateRealTransfers() { notConnected('activateRealTransfers', 'requires KYC approval, signed program agreement, benefit-limit acknowledgement on file'); }
}
