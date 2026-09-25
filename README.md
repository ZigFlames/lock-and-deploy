# Lock & Deploy

**Reverse financing:** instead of financing a purchase and paying later, you lock money away on a schedule, and the item unlocks when it's fully saved. The first goal is a **$3,000 mattress**.

> ### ⚠️ Phase 1: simulation only, fictional money
> This app never holds, moves, or touches real money. It calls no bank APIs. Every balance is fictional and stored only in your browser. A **"Simulation · fictional money"** badge appears on every screen.

Mobile-first, installable PWA. Plain HTML/CSS/JS (ES modules), **no runtime dependencies, no backend**.

## Features

- **Dashboard:** total saved, next scheduled deposit (date and amount), days to goal, a large lock with a progress ring, and progress bars for each goal.
- **Multiple goals:** name, target amount, target date, and deposit schedule. Seeded with **Mattress, $3,000**.
- **Deposit schedules:** weekly, every 2 weeks, monthly on a day, or **"N days after my benefit payment"** (you set the benefit day of month and an offset of 0–10 days). Short months clamp to their last day.
- **Explicit authorization:** creating or changing a schedule needs a checkbox, full consent text, and a confirmation dialog. It's logged with a real timestamp.
- **Pause/Resume:** a large button on each goal plus a global button. Pausing stops *future* deposits only and never unlocks or releases savings. Resume asks for confirmation and doesn't catch up on missed dates.
- **No instant withdrawal while locked.** The UI shows no withdraw button, and the provider refuses too.
- **Lock icon:** closed while short of the target. It animates open only when saved ≥ target, then shows **Unlocked** and two payout options (*Pay merchant directly*, *Transfer to my linked account*), each with a confirmation.
- **Safety procedures:** cancel a goal (10-day cooling-off, undo anytime, then a simulated return), revoke transfer authorization (stops future pulls immediately, logged), and fraud recovery (freeze everything, report, contact the partner, Reg E dispute steps, secure your accounts, unfreeze).
- **Sim panel:** add a fake deposit, fast-forward +1 day, week, or month (scheduled deposits post; paused ones log as skipped), set a balance, reset the demo, and see projected completion dates plus a live "what if" deposit calculator.
- **History:** per-goal and overall log of deposits, skips, pauses, resumes, authorizations granted or revoked, unlocks, payouts, cancellations, freezes, and warning acknowledgements.
- **Benefit-limit warning:** a mandatory screen before the *Activate real transfers* stub, covering SSI resource limits, Medicaid/SNAP asset rules, and ABLE accounts. In Phase 1 the stub can never turn on.
- **PWA:** web app manifest, 192/512 and maskable icons (gold lock on black), apple-touch-icon and iOS meta tags, a service worker for offline use, and localStorage persistence.

## Safety rules (built in)

1. Phase 1 is fictional money only. No custody, no real transfers, no bank APIs.
2. Nothing is scheduled without explicit, logged authorization.
3. Pause affects future deposits only and never releases savings.
4. There's no instant withdrawal while a goal is locked. Unlock happens only at ≥ target. Targets can be raised but not lowered, because lowering would be a back door around the lock.
5. Revocation stops future pulls immediately. Cancellation includes a cooling-off period.
6. The benefit resource-limit warning must be acknowledged on every real-transfer activation attempt.
7. Money movement sits behind a `BankingProvider` interface. Phase 2 plugs a regulated partner into it. See [docs/PHASE2_INTEGRATION.md](docs/PHASE2_INTEGRATION.md).

> **SSI note:** SSA lists the SSI resource limit as **$2,000 (individual) / $3,000 (couple)** (January 2026, [ssa.gov](https://www.ssa.gov/ssi/text-general-ussi.htm)). A $3,000 goal could affect eligibility. Check current limits with SSA or a benefits counselor. This is not legal advice.

## Project layout

```
index.html              App shell + iOS/PWA meta tags
manifest.webmanifest    Web app manifest
sw.js                   Service worker (offline app shell)
css/styles.css          Dark/gold theme, mobile first
js/app.js               UI, routing (hash-based), actions
js/engine.js            Scheduling engine (when deposits run, projections)
js/schedule.js          Schedule math (benefit day + offset, monthly, weekly)
js/store.js             localStorage persistence + audit log
js/banking/             BankingProvider interface, SimulatedProvider, PartnerProvider stub
icons/                  Generated PNG/SVG icons (scripts/gen_icons.py)
scripts/                build.mjs, serve.mjs (zero-dependency), gen_icons.py
tests/e2e.py            Playwright end-to-end test (mobile viewport)
screenshots/            Mobile screenshots from the test run
docs/PHASE2_INTEGRATION.md
```

## Run locally

Requires Node 18+ (Python 3 works too). There's nothing to install.

```bash
npm run dev          # serves the source at http://localhost:5173
# or: python3 -m http.server 5173
```

## Build

```bash
npm run build        # copies the app to dist/ and stamps the service-worker cache version
npm run preview      # serves dist/ at http://localhost:4173
```

## Test

```bash
pip install playwright && playwright install chromium   # once
npm run build && npm run preview &                      # serve dist on :4173
python3 tests/e2e.py http://localhost:4173/             # 50 checks at 390x844; writes screenshots/
```

Set `CHROME=/path/to/chrome` to use a system Chrome.

## Deploy as a static site

`dist/` is plain static files that work under any sub-path (all URLs are relative). Upload it anywhere static:

- **GitHub Pages:** push the contents of `dist/` to a `gh-pages` branch, then set *Settings → Pages → Branch: gh-pages / (root)*. (`dist/` includes `.nojekyll`.)
- **Netlify / Cloudflare Pages / Vercel:** build command `npm run build`, output directory `dist`.
- HTTPS is required for the service worker and install prompt (localhost is exempt).

## Install on your phone

- **iPhone (Safari):** open the URL, tap **Share** then **Add to Home Screen**, then **Add**.
- **Android (Chrome):** open the URL, tap **⋮** then **Install app** (or **Add to Home screen**).

It opens full screen with the gold lock icon and works offline. Your data stays on that phone, in that browser. Clearing site data resets it, and so does *Sim → Reset demo data*.

## Phase 2

See [docs/PHASE2_INTEGRATION.md](docs/PHASE2_INTEGRATION.md) for the provider interface, webhooks, and compliance notes (partner custody in FDIC-insured FBO accounts, NACHA authorization records, Reg E error resolution, and the benefit-limit acknowledgement). Nothing in this repo is legal advice.
