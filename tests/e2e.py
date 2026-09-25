"""End-to-end test at a mobile viewport. Usage:
    npm run build && npm run preview   # in another terminal (serves dist/ on :4173)
    python3 tests/e2e.py [base_url]
Requires: pip install playwright && playwright install chromium (or a system Chrome;
set CHROME=/path/to/chrome)."""
import json, os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/").rstrip("/") + "/"
SHOTS = Path(__file__).resolve().parent.parent / "screenshots"
SHOTS.mkdir(exist_ok=True)
CHROME = os.environ.get("CHROME") or ("/usr/bin/google-chrome" if Path("/usr/bin/google-chrome").exists() else None)
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail else ""))

def state(page):
    return page.evaluate("JSON.parse(localStorage.getItem('lockdeploy.state.v1'))")

def mattress(page):
    return next(g for g in state(page)["goals"] if g["id"] == "goal_mattress")

def confirm(page):
    page.locator("[data-modal-ok]").click()
    page.wait_for_timeout(250)

def ff(page, testid="ff-month"):
    page.goto(BASE + "#/sim")
    page.get_by_test_id(testid).click()
    page.wait_for_timeout(500)

def clear_toasts(page):
    page.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")

def withdraw_buttons(page):
    n = page.locator("[data-action=withdraw]").count()
    texts = page.locator("button, a.btn").all_inner_texts()
    bad = [t for t in texts if re.search(r"withdraw|cash out", t, re.I)]
    return n, bad

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True) if CHROME else p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))

    page.goto(BASE)
    page.wait_for_selector("[data-testid=hero]")
    check("dashboard renders", page.get_by_test_id("hero").is_visible())
    check("simulation badge visible", page.get_by_test_id("sim-badge").is_visible(), page.get_by_test_id("sim-badge").inner_text())
    check("Mattress goal shows $3,000 target", page.get_by_test_id("hero-target").inner_text() == "$3,000" and "Mattress" in page.locator("[data-testid=goal-card]").first.inner_text())
    n, bad = withdraw_buttons(page)
    check("no withdraw button while locked (dashboard)", n == 0 and not bad, str(bad))
    check("lock closed at $0", page.locator(".hero [data-lock]").get_attribute("data-lock") == "closed")

    # Authorize the schedule (explicit checkbox + confirm)
    page.get_by_text("Authorize deposit schedule").first.click()
    page.wait_for_selector("#schedule-form")
    submit = page.get_by_test_id("authorize-submit")
    check("authorize button disabled until checkbox ticked", submit.is_disabled())
    page.get_by_test_id("authorize-check").check()
    check("benefit schedule preview shows day after benefit", "Oct 4" in page.locator("#sched-preview").inner_text(), page.locator("#sched-preview").inner_text())
    submit.click()
    page.wait_for_selector("[data-modal-ok]")
    confirm(page)
    page.wait_for_url(re.compile(r"#/goal/goal_mattress$"))
    st = state(page)
    auth_tx = [t for t in st["transactions"] if t["type"] == "authorization_granted"]
    check("authorization logged with timestamp", bool(auth_tx) and bool(auth_tx[0].get("ts")), auth_tx[0]["ts"] if auth_tx else "")

    # Fast-forward posts deposits
    ff(page); ff(page)
    bal = mattress(page)["balance"]
    check("fast-forward posts scheduled deposits", bal == 100000, f"balance after 2 months = ${bal/100:.2f}")
    page.goto(BASE)
    page.wait_for_selector("[data-testid=hero]")
    check("dashboard total saved updated", page.get_by_test_id("total-saved").inner_text() == "$1,000.00")
    check("next deposit shown", page.get_by_test_id("next-deposit-date").is_visible(), page.get_by_test_id("next-deposit-date").inner_text() + " " + page.get_by_test_id("next-deposit-amount").inner_text())
    page.wait_for_timeout(900)
    clear_toasts(page); page.screenshot(path=str(SHOTS / "01-dashboard-locked.png"))

    # Pause keeps balance, stops new deposits
    page.locator("[data-testid=goal-card] [data-action=pause-goal]").click()
    confirm(page)
    check("pause sets paused status", mattress(page)["paused"] is True)
    check("pause did not change balance or unlock", mattress(page)["balance"] == 100000 and mattress(page)["unlockedAt"] is None)
    ff(page)
    check("no deposits while paused", mattress(page)["balance"] == 100000)
    check("skipped deposit logged", any(t["type"] == "deposit_skipped" for t in state(page)["transactions"]))
    page.goto(BASE + "#/goal/goal_mattress")
    page.wait_for_selector("[data-testid=goal-title]")
    check("lock stays closed while paused", page.locator(".hero [data-lock]").get_attribute("data-lock") == "closed")
    n, bad = withdraw_buttons(page)
    check("no withdraw button while locked (goal page)", n == 0 and not bad, str(bad))
    check("resume button visible", page.locator("[data-action=resume-goal]").is_visible())
    page.wait_for_timeout(700)
    clear_toasts(page); page.screenshot(path=str(SHOTS / "02-paused.png"))

    # Resume
    page.locator("[data-action=resume-goal]").click()
    confirm(page)
    check("resume clears paused", mattress(page)["paused"] is False)
    ff(page)
    check("deposits resume after resume", mattress(page)["balance"] == 150000, f"${mattress(page)['balance']/100:.2f}")

    # Global pause
    page.goto(BASE)
    page.get_by_test_id("pause-all").click(); confirm(page)
    ff(page)
    check("global pause stops deposits, keeps balance", mattress(page)["balance"] == 150000 and state(page)["globalPaused"])
    page.goto(BASE)
    page.get_by_test_id("resume-all").click(); confirm(page)
    check("global resume", not state(page)["globalPaused"])

    # Reload persistence
    before = state(page)
    page.reload(); page.wait_for_selector("[data-testid=hero]")
    after = state(page)
    check("state survives reload", before["goals"] == after["goals"] and before["simNow"] == after["simNow"] and page.get_by_test_id("hero-balance").inner_text() == "$1,500.00")

    # SSI warning before activation
    page.goto(BASE + "#/activate/confirm")
    page.wait_for_timeout(300)
    check("activation stub unreachable without warning", page.get_by_test_id("ssi-warning").is_visible())
    page.goto(BASE + "#/settings")
    page.get_by_test_id("activate-real").click()
    page.wait_for_selector("[data-testid=ssi-warning]")
    txt = page.get_by_test_id("ssi-warning").inner_text()
    check("warning flags the $3,000 Mattress goal", "Mattress" in txt)
    check("SSI warning appears before activation", "$2,000" in txt and "$3,000" in txt and "ABLE" in txt and "SNAP" in txt and "Medicaid" in txt)
    check("continue disabled until acknowledged", page.get_by_test_id("ssi-continue").is_disabled())
    clear_toasts(page); page.screenshot(path=str(SHOTS / "04-ssi-warning.png"))
    page.add_style_tag(content=".tabbar{display:none!important}")
    page.screenshot(path=str(SHOTS / "05-ssi-warning-full.png"), full_page=True)
    page.get_by_test_id("ssi-ack").check()
    page.get_by_test_id("ssi-continue").click()
    page.wait_for_selector("[data-testid=activation-stub]")
    page.get_by_test_id("try-activate").click()
    page.wait_for_selector("[data-testid=activation-blocked]")
    check("real-transfer activation is blocked (stub)", page.get_by_test_id("activation-blocked").is_visible() and state(page)["realTransfers"]["enabled"] is False)

    # Near target: still locked
    page.goto(BASE + "#/sim")
    page.fill("#bal-amt", "2900"); page.get_by_test_id("sim-balance").click(); page.wait_for_timeout(300)
    page.goto(BASE + "#/goal/goal_mattress"); page.wait_for_selector("[data-testid=goal-title]")
    n, bad = withdraw_buttons(page)
    check("still locked at $2,900 (no withdraw)", n == 0 and page.locator(".hero [data-lock]").get_attribute("data-lock") == "closed")

    # Live projection in Sim panel
    page.goto(BASE + "#/sim")
    page.fill("#whatif", "50")
    check("projection recalculates live", "deposits of $50" in page.locator("#whatif-out").inner_text(), page.locator("#whatif-out").inner_text())

    # Reach target
    ff(page)
    g = mattress(page)
    check("final deposit capped at remaining amount", g["balance"] == 300000, f"${g['balance']/100:.2f}")
    page.goto(BASE + "#/goal/goal_mattress"); page.wait_for_selector("[data-testid=goal-title]")
    check("lock opens at target", page.locator(".hero [data-lock]").get_attribute("data-lock") == "open")
    check("Unlocked status shown", page.get_by_test_id("unlocked-pill").is_visible())
    check("withdrawal options shown", page.get_by_test_id("withdraw-merchant").is_visible() and page.get_by_test_id("withdraw-linked").is_visible())
    check("unlocked event logged", any(t["type"] == "unlocked" for t in state(page)["transactions"]))
    page.wait_for_timeout(1800)
    clear_toasts(page); page.screenshot(path=str(SHOTS / "03-goal-unlocked.png"))

    # Withdrawal requires confirmation
    page.get_by_test_id("withdraw-linked").click()
    check("withdrawal confirm disabled until checkbox", page.locator("[data-modal-ok]").is_disabled())
    page.locator("[data-modal-check]").check(); confirm(page)
    g = mattress(page)
    check("simulated withdrawal completes after confirm", g["status"] == "paid_out" and any(t["type"] == "withdrawal_requested" for t in state(page)["transactions"]))

    # Procedures: new goal, revoke, cancel, fraud
    page.goto(BASE + "#/new"); page.wait_for_selector("#schedule-form")
    page.fill("input[name=name]", "Couch"); page.fill("input[name=target]", "1200"); page.fill("input[name=amount]", "100")
    page.locator("input[name=frequency][value=weekly]").check()
    page.get_by_test_id("authorize-check").check(); page.get_by_test_id("authorize-submit").click(); confirm(page)
    page.wait_for_url(re.compile(r"#/goal/goal_"))
    couch = next(x for x in state(page)["goals"] if x["name"] == "Couch")
    check("new goal created with authorized weekly schedule", bool(couch["schedule"]["authorizationId"]))
    ff(page, "ff-week")
    couch = next(x for x in state(page)["goals"] if x["name"] == "Couch")
    check("weekly deposit posted", couch["balance"] == 10000)
    page.goto(BASE + "#/help/revoke"); page.get_by_test_id("revoke-all").click(); confirm(page)
    ff(page, "ff-week")
    couch = next(x for x in state(page)["goals"] if x["name"] == "Couch")
    check("revocation stops future pulls, keeps savings", couch["balance"] == 10000 and any(t["type"] == "authorization_revoked" for t in state(page)["transactions"]))
    page.goto(BASE + "#/help/cancel"); page.locator("[data-action=cancel-goal]").first.click()
    page.locator("[data-modal-check]").check(); confirm(page)
    couch = next(x for x in state(page)["goals"] if x["name"] == "Couch")
    check("cancellation is not instant (cooling-off)", couch["status"] == "cancel_pending" and couch["balance"] == 10000)
    ff(page, "ff-week"); ff(page, "ff-week")
    couch = next(x for x in state(page)["goals"] if x["name"] == "Couch")
    check("cancellation completes after cooling-off", couch["status"] == "cancelled")
    page.goto(BASE + "#/help/fraud"); page.fill("#fraud-desc", "Test report"); page.locator("[data-action=report-fraud]").click(); confirm(page)
    check("fraud report freezes schedules", state(page)["frozen"] is True)
    page.goto(BASE + "#/history")
    check("history lists events", page.locator(".tx").count() >= 15, f"{page.locator('.tx').count()} entries")

    # PWA: manifest, icons, service worker, offline
    man = page.evaluate("fetch('manifest.webmanifest').then(r=>r.json())")
    check("manifest valid with 192/512/maskable icons", man["display"] == "standalone" and {"192x192", "512x512"} <= {i["sizes"] for i in man["icons"]} and any(i.get("purpose") == "maskable" for i in man["icons"]))
    codes = page.evaluate("Promise.all(['icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png'].map(u=>fetch(u).then(r=>r.status)))")
    check("icons load", all(c == 200 for c in codes), str(codes))
    check("apple-touch-icon + iOS meta tags", page.locator("link[rel=apple-touch-icon]").count() == 1 and page.locator("meta[name=apple-mobile-web-app-capable]").count() == 1)
    page.evaluate("navigator.serviceWorker.ready")
    page.reload(); page.wait_for_timeout(800)
    check("service worker controls page", page.evaluate("!!navigator.serviceWorker.controller"))
    page.goto(BASE); page.wait_for_selector("[data-testid=hero]")
    ctx.set_offline(True)
    page.reload(); page.wait_for_selector("[data-testid=hero]", timeout=8000)
    check("works offline", page.get_by_test_id("hero").is_visible())
    ctx.set_offline(False)

    check("no console/page errors", not errors, "; ".join(errors[:5]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
(SHOTS.parent / "tests" / "last-run.json").write_text(json.dumps([{"check": n, "pass": ok, "detail": d} for n, ok, d in results], indent=2))
sys.exit(1 if failed else 0)
