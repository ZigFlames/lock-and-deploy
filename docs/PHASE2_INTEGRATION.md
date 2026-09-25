# Phase 2: Banking partner integration points

> **Status: design notes only. Nothing here is live.** Phase 1 of Lock & Deploy is a simulation with fictional money. It holds no funds, calls no bank APIs, and cannot move money.
>
> **Not legal, compliance, or financial advice.** This document lists the kinds of obligations a real launch would likely involve so they can be scoped with a qualified attorney, compliance professional, and the chosen partner. Requirements depend on the partner, the program structure, and the states involved.

## 1. Model

Lock & Deploy must **never custody funds itself**. In Phase 2, a regulated partner holds the money:

- a bank, or
- a Banking-as-a-Service (BaaS) provider whose partner bank holds customer funds in **FDIC-insured custodial / For-Benefit-Of (FBO) accounts**, with per-user (and per-goal) sub-ledgers.

The partner's ledger is the source of truth for balances. The app shows the partner's numbers. It does not keep its own.

```
Phone (PWA)  ──HTTPS──▶  Lock & Deploy backend (BFF)  ──mTLS/API keys──▶  Partner bank / BaaS
   │                        │  - stores consent records, audit log        │  - KYC/CIP
   │                        │  - verifies webhook signatures              │  - FBO account + sub-ledgers
   └─ no secrets in app     └─ holds API credentials (server-side only)   └─ ACH origination, disputes
```

A small backend (backend-for-frontend) is required in Phase 2. API credentials and webhook secrets must never ship inside the PWA.

## 2. The seam in this codebase

| File | Role |
|---|---|
| `js/banking/BankingProvider.js` | Abstract interface. Every money operation goes through it. |
| `js/banking/SimulatedProvider.js` | Phase 1 implementation (local, fictional). |
| `js/banking/PartnerProvider.js` | Phase 2 stub. Every method throws `partner_not_connected` and documents the planned partner call. |
| `js/banking/index.js` | Selects the provider. Hard-wired to `SimulatedProvider` in Phase 1. |
| `js/engine.js` | Decides *when* deposits run (schedule math, pause, freeze). In Phase 2 scheduling moves to the partner's recurring-transfer feature, and the engine becomes display-only. |

## 3. Provider interface

All methods are async, amounts are integer cents, dates are `YYYY-MM-DD`.

| Method | Purpose | Planned partner mapping (illustrative) | Rules |
|---|---|---|---|
| `linkAccount(details)` | Link the user's external checking account | Account verification via an aggregator (Plaid/MX/Finicity) or micro-deposits; returns `externalAccountId` | Show the account name and mask only. |
| `createAuthorization(goalId, schedule, consent)` | Record explicit debit authorization | `POST /ach/authorizations` with consent text, amount, frequency, start date, IP, user agent, timestamp | **Required before any schedule.** Store the exact text shown and give the user a copy. |
| `revokeAuthorization(idOrAll, reason)` | Stop future pulls | Revoke the authorization and cancel pending recurring debits | Takes effect **immediately** for anything not yet sent to the ACH network. Logged. |
| `scheduleDeposit(goalId, schedule, authorizationId)` | Create/replace the recurring transfer | `POST /recurring-transfers` (external account → goal sub-ledger) | Changing amount or timing needs a **new authorization**. |
| `executeDeposit(goalId, amount, meta)` | One deposit | `POST /transfers` (ACH debit) | Final status comes through webhooks, not the API response. |
| `pauseSchedule(goalId)` / `resumeSchedule(goalId)` | Pause/resume future deposits | `PATCH /recurring-transfers/{id}` status | Pause must **never** release, unlock, or move held funds. Resume skips missed dates (no catch-up debits). |
| `getBalance(goalId)` | Held balance | `GET /sub-ledgers/{id}/balance` | Partner ledger is authoritative. |
| `requestWithdrawal(goalId, method, details)` | Payout once fully saved | `POST /payouts`: merchant payment, or ACH credit to the linked account | Allowed **only** when balance ≥ target (enforced by backend and partner, not only the UI). |
| `requestCancellation(goalId, coolingOffDays)` | Start a cancellation | Program-defined cooling-off, then an ACH credit to the linked account | Not instant. Deposits stop immediately. User can undo during cooling-off. Program terms must spell this out. |
| `withdrawCancellationRequest(goalId)` / `finalizeCancellation(goalId)` | Undo / complete a cancellation | Partner job at the end of cooling-off | |
| `reportFraud(report)` | Report unauthorized activity | Dispute / error-resolution intake plus freezing recurring transfers | Freeze all schedules at once. Starts Reg E timelines (see §6). |
| `unfreeze()` | Lift a freeze | After identity re-verification | |
| `activateRealTransfers(ack)` | Turn on real money | Needs KYC approval, program agreement, and the benefit-limit acknowledgement | Refuses unless the warning in §5 was acknowledged **in the same flow**. |

## 4. Webhooks to expect

Verify signatures (HMAC or similar), make handlers idempotent (dedupe on event id), and put every event in the audit log.

| Event (typical names) | Meaning | App reaction |
|---|---|---|
| `kyc.approved` / `kyc.needs_review` / `kyc.rejected` | Identity verification result | Gate activation; show next steps. |
| `external_account.verified` / `.failed` | Account link result | Enable/disable scheduling. |
| `authorization.created` / `authorization.revoked` | Mandate lifecycle | Keep local consent records in sync. |
| `transfer.pending` / `transfer.settled` | ACH debit progress | Show "pending" until settled. Only settled funds count toward unlocking. |
| `transfer.failed` / `transfer.returned` (R01 NSF, R07 authorization revoked, R10 unauthorized, R29, …) | Debit failed or returned | Reverse the pending credit. Pause the schedule after repeated NSF returns. Treat R07/R10/R29 as revocation or fraud signals and freeze. |
| `recurring_transfer.paused` / `.resumed` | Schedule changes | Sync UI. |
| `payout.initiated` / `payout.completed` / `payout.failed` | Withdrawals | Update goal status. |
| `dispute.opened` / `dispute.provisional_credit` / `dispute.resolved` | Reg E error resolution | Show case status and deadlines. |
| `account.frozen` / `account.unfrozen` | Partner-side holds | Mirror the freeze in the app. |
| `balance.updated` | Ledger change | Refresh balances and the lock state. |

## 5. Benefit resource-limit acknowledgement (mandatory)

Before real transfers can be activated, the user must read and acknowledge a warning (already built as the `#/activate` screen). It covers:

- **SSI** counts money in savings as a resource. SSA lists the resource limit as **$2,000 for an individual and $3,000 for a couple** (SSA, "SSI Resource Limits", January 2026; https://www.ssa.gov/ssi/text-general-ussi.htm and https://www.ssa.gov/ssi/spotlights/spot-resources.htm). Resources are generally counted at the start of the month.
- A goal such as **$3,000** could exceed the limit and affect SSI eligibility (and, in many states, Medicaid).
- **Medicaid, SNAP**, and other programs may have their own asset rules.
- **ABLE accounts** may be an option for eligible people (SSA excludes up to $100,000 in an ABLE account from SSI resources).
- Verify current limits with **SSA** (ssa.gov, 1-800-772-1213) or a benefits counselor. Not legal advice.

Phase 2 requirements: store the acknowledgement (text version, timestamp, user id) server-side. Require it again whenever real transfers are activated, and consider re-prompting when a goal target or combined balance goes above $2,000. Consider an in-app balance alert near the limit, and a referral path to a benefits counselor (e.g., a WIPA project, for people who work).

## 6. Compliance notes (scoping checklist, not advice)

- **Custody and licensing:** the partner holds funds. Lock & Deploy acts as a technology/program manager under the partner's program agreement. Confirm with counsel whether any state money-transmitter or other licensing applies to the chosen structure. Review FDIC rules on deposit-insurance representations and pass-through coverage (for example, 12 CFR Part 328 on advertising and misrepresentation of insured status, and FDIC recordkeeping requirements for custodial accounts). Never say "FDIC-insured" unless the partner confirms and approves the wording.
- **KYC / CIP / BSA-AML:** customer identification and verification, sanctions screening (OFAC), and ongoing monitoring are done by or on behalf of the partner under its BSA/AML program.
- **ACH authorizations (NACHA Operating Rules):** recurring consumer debits (WEB/PPD) need an authorization that is clear, readable, and says how to revoke. Keep authorization records for the period the rules require (currently 2 years after termination or revocation) and be able to produce them on request. Honor revocations promptly. Handle returns (R07/R10/R29) correctly. WEB debits need fraud-detection screening and account validation.
- **Regulation E (EFTA):** error-resolution procedures for unauthorized or incorrect electronic transfers: intake, investigation timelines, provisional credit, and written results. Consumer liability depends on how quickly the user reports. Required disclosures cover preauthorized transfers, including the right to stop payment, and the partner determines which Reg E obligations sit with whom. The in-app Fraud Recovery flow is the intake front end.
- **Disclosures and UDAAP:** plain-language terms for locking, cooling-off cancellation, fees (ideally none), and payout timing. No dark patterns. The pause, cancel, and revoke controls stay easy to find.
- **E-SIGN:** get consent to electronic disclosures before the account opens.
- **Privacy / GLBA:** privacy notice, data minimization, encryption, and deletion policy. Keep financial data out of analytics.
- **Accessibility:** WCAG 2.1 AA as a baseline.
- **Records and audit:** an append-only audit log of authorizations, revocations, pauses and resumes, freezes, cancellations, payouts, and warning acknowledgements, with timestamps (the Phase 1 History screen models this).

## 7. Suggested Phase 2 milestones

1. Choose partner. Sign the program agreement. Get the compliance review.
2. Build the BFF backend: auth, consent storage, webhook receiver, audit log.
3. Implement `PartnerProvider` against the partner sandbox. Contract-test it against the same scenarios as `tests/e2e.py`.
4. Test end-to-end in the sandbox: NSF returns, revocation, disputes, cooling-off cancellation.
5. Run a limited pilot with low per-goal caps and the benefit-limit warning enforced server-side.
