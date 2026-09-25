// Lock & Deploy: UI, routing, and actions.
// PHASE 1 = SIMULATION ONLY. Fictional money. No bank APIs. See README.md.
import { init, getState, subscribe, update, addTx } from './store.js';
import { provider } from './banking/index.js';
import {
  scheduleStatus, projection, nextDeposit, advanceDays, pauseGoal, resumeGoal, pauseAll, resumeAll,
  authorizeSchedule, setBalanceSim, resetDemo, isUnlocked, authActive, rearm,
} from './engine.js';
import { FREQUENCIES, describe, nextOccurrence, validateSchedule } from './schedule.js';
import { money, money0, toCents } from './money.js';
import { pretty, addDays, addMonths, diffDays, ordinal } from './dates.js';
import { esc, lockSVG, ringSVG, bar, confirmDialog, toast, icons } from './ui.js';

const app = document.getElementById('app');
const COOLING_OFF_DAYS = 10;
const ANIM_KEY = 'lockdeploy.unlockAnimSeen';
let activationAck = false;           // SSI warning must be acknowledged on EVERY activation attempt
let activationResult = '';
let historyFilter = 'all';
let lastRoute = '';

const seenAnim = () => { try { return JSON.parse(localStorage.getItem(ANIM_KEY) || '{}'); } catch { return {}; } };
const markAnim = (ids) => { const m = seenAnim(); ids.forEach(([id, at]) => { m[id] = at; }); localStorage.setItem(ANIM_KEY, JSON.stringify(m)); };
let pendingAnimMarks = [];

// ---------- helpers ----------
const goalById = (s, id) => s.goals.find((g) => g.id === id);
const pct = (g) => (g.target ? g.balance / g.target : 0);
const liveGoals = (s) => s.goals.filter((g) => g.status === 'active' || g.status === 'cancel_pending');
const timeOf = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function goalLock(g, size) {
  const open = isUnlocked(g) || g.status === 'paid_out';
  let animate = false;
  if (isUnlocked(g) && g.unlockedAt) {
    const seen = seenAnim()[g.id] === g.unlockedAt;
    animate = !seen;
    if (!seen) pendingAnimMarks.push([g.id, g.unlockedAt]);
  }
  return lockSVG({ open, animate, size, label: open ? `${g.name}: unlocked` : `${g.name}: locked until ${money0(g.target)} is saved` });
}

function chip(st) {
  const tone = { active: 'ok', complete: 'gold', paused: 'warn', global_paused: 'warn', frozen: 'bad', unauthorized: 'warn', cancel_pending: 'bad', none: 'muted', paid_out: 'gold', cancelled: 'muted' }[st.code] || 'muted';
  return `<span class="chip chip--${tone}" data-status="${st.code}">${esc(st.label)}</span>`;
}

function banners(s) {
  const out = [];
  if (s.frozen) out.push(`<div class="banner banner--bad"><b>Schedules frozen.</b> No deposits will run. Locked savings are unchanged. <a href="#/help/fraud">Fraud recovery</a></div>`);
  if (s.globalPaused) out.push(`<div class="banner banner--warn" data-testid="global-paused-banner"><b>All deposits paused.</b> Every locked balance stays locked.</div>`);
  return out.join('');
}

function pauseButton(s, g) {
  const st = scheduleStatus(s, g);
  if (g.status !== 'active' || isUnlocked(g)) return '';
  if (st.code === 'unauthorized' || st.code === 'none') return `<a class="btn btn--gold btn--xl" href="#/goal/${g.id}/schedule">Authorize deposit schedule</a>`;
  if (g.paused) return `<button class="btn btn--resume btn--xl" data-action="resume-goal" data-id="${g.id}">${icons.play}<span>Resume deposits</span></button>`;
  return `<button class="btn btn--pause btn--xl" data-action="pause-goal" data-id="${g.id}">${icons.pause}<span>Pause deposits</span></button>`;
}

function projLine(s, g) {
  const p = projection(s, g);
  if (p.done) return `<span class="gold">Fully saved</span>`;
  if (!p.date) return `<span class="muted">${esc(p.reason || 'No projection')}</span>`;
  if (p.hypothetical) return `<span class="muted">On hold (${esc(p.reason)}). If running: ${pretty(p.date)}</span>`;
  return `Projected ${pretty(p.date)} · <b>${p.daysAway}</b> days`;
}

// ---------- views ----------
function viewDashboard(s) {
  const goals = liveGoals(s);
  const featured = goals[0] || s.goals[0];
  const total = goals.reduce((a, g) => a + g.balance, 0);
  const nd = nextDeposit(s);
  const fp = featured ? projection(s, featured) : null;
  const daysTo = !fp ? '—' : fp.done ? '0' : fp.date && !fp.hypothetical ? String(fp.daysAway) : '—';
  const unlocked = featured && isUnlocked(featured);
  return `
  ${banners(s)}
  <section class="hero card" data-testid="hero">
    ${featured ? `
    <a class="hero__visual" href="#/goal/${featured.id}" aria-label="Open ${esc(featured.name)}">
      ${ringSVG(pct(featured), 232, 10)}
      <div class="hero__lock">${goalLock(featured, 104)}</div>
    </a>
    <div class="hero__meta">
      <div class="eyebrow">${esc(featured.name)}</div>
      <div class="hero__amount"><span data-testid="hero-balance">${money(featured.balance)}</span> <span class="muted">of</span> <span data-testid="hero-target">${money0(featured.target)}</span></div>
      ${unlocked ? '<div class="unlocked-pill" data-testid="unlocked-pill">Unlocked</div>' : `<div class="muted small">Locked until fully saved · ${Math.floor(pct(featured) * 100)}%</div>`}
    </div>` : '<p>No goals yet.</p>'}
  </section>

  <section class="stats">
    <div class="stat card"><div class="stat__label">Total saved</div><div class="stat__value" data-testid="total-saved">${money(total)}</div><div class="stat__sub">${goals.length} goal${goals.length === 1 ? '' : 's'}</div></div>
    <div class="stat card"><div class="stat__label">Next deposit</div>
      ${nd ? `<div class="stat__value" data-testid="next-deposit-amount">${money0(nd.amount)}</div><div class="stat__sub" data-testid="next-deposit-date">${pretty(nd.date, { year: undefined })}</div>` : `<div class="stat__value muted">—</div><div class="stat__sub">${s.frozen ? 'Frozen' : s.globalPaused ? 'Paused' : 'None scheduled'}</div>`}
    </div>
    <div class="stat card"><div class="stat__label">Days to goal</div><div class="stat__value" data-testid="days-to-goal">${daysTo}</div><div class="stat__sub">${fp && fp.date && !fp.done && !fp.hypothetical ? pretty(fp.date, { year: undefined }) : featured ? esc(featured.name) : ''}</div></div>
  </section>

  <section class="global-control">
    ${s.globalPaused
      ? `<button class="btn btn--resume btn--xl" data-action="resume-all" data-testid="resume-all">${icons.play}<span>Resume all deposits</span></button>`
      : `<button class="btn btn--pause btn--xl" data-action="pause-all" data-testid="pause-all">${icons.pause}<span>Pause all deposits</span></button>`}
    <p class="hint">Pausing stops future deposits only. It never unlocks savings.</p>
  </section>

  <h2 class="section-title">Your goals</h2>
  <section class="goal-list">${s.goals.filter((g) => g.status !== 'cancelled').map((g) => goalCard(s, g)).join('')}</section>
  <a class="btn btn--ghost btn--block" href="#/new">+ New goal</a>
  <p class="sim-date muted small">Simulated date: <b data-testid="sim-date">${pretty(s.simNow)}</b> · <a href="#/sim">Sim controls</a></p>`;
}

function goalCard(s, g) {
  const st = scheduleStatus(s, g);
  return `<article class="goal card" data-goal="${g.id}" data-testid="goal-card">
    <a class="goal__head" href="#/goal/${g.id}">
      <div class="goal__lock">${goalLock(g, 40)}</div>
      <div class="goal__title"><div class="goal__name">${esc(g.name)}</div>${chip(st)}</div>
      <span class="goal__chev">${icons.chevron}</span>
    </a>
    ${bar(g.status === 'paid_out' ? 1 : pct(g))}
    <div class="goal__nums"><span><b data-testid="goal-balance">${money(g.balance)}</b> of <span data-testid="goal-target">${money0(g.target)}</span></span><span>${g.status === 'paid_out' ? 'Paid out' : Math.floor(pct(g) * 100) + '%'}</span></div>
    <div class="goal__proj small">${g.status === 'active' ? projLine(s, g) : g.status === 'cancel_pending' ? `Cancellation completes ${pretty(g.cancelEffectiveAt)}` : ''}</div>
    ${pauseButton(s, g)}
  </article>`;
}

function viewGoal(s, g) {
  if (!g) return `<p>Goal not found.</p><a class="btn btn--ghost" href="#/">Back</a>`;
  const st = scheduleStatus(s, g);
  const p = projection(s, g);
  const unlocked = isUnlocked(g) && g.status === 'active';
  const txs = s.transactions.filter((t) => t.goalId === g.id);
  const targetIn = diffDays(s.simNow, g.targetDate);
  let late = '';
  if (p.date && !p.done && !p.hypothetical) { const d = diffDays(g.targetDate, p.date); late = d > 0 ? `<span class="warn">${d} days after target date</span>` : '<span class="ok">On track for target date</span>'; }
  return `
  <div class="subhead"><a class="back" href="#/">${icons.back}<span>Home</span></a></div>
  ${banners(s)}
  <section class="hero card hero--goal">
    <div class="hero__visual">${ringSVG(g.status === 'paid_out' ? 1 : pct(g), 248, 11)}<div class="hero__lock">${goalLock(g, 112)}</div></div>
    <h1 class="goal-title" data-testid="goal-title">${esc(g.name)}</h1>
    <div class="hero__amount"><span data-testid="goal-balance">${money(g.balance)}</span> <span class="muted">of</span> <span data-testid="goal-target">${money0(g.target)}</span></div>
    ${unlocked ? '<div class="unlocked-pill" data-testid="unlocked-pill">Unlocked</div>' : g.status === 'paid_out' ? `<div class="unlocked-pill">Paid out ${pretty(g.paidOutAt)}</div>` : `<div class="locked-pill" data-testid="locked-pill">Locked · ${money(Math.max(0, g.target - g.balance))} to go</div>`}
    ${unlocked || g.status === 'paid_out' ? '' : `<div class="row-center">${chip(st)}</div>`}
  </section>

  ${g.status === 'cancel_pending' ? `<section class="card banner--bad">
     <h2>Cancellation pending</h2>
     <p>Deposits have stopped. Your ${money(g.balance)} stays locked during the ${COOLING_OFF_DAYS}-day cooling-off period. On <b>${pretty(g.cancelEffectiveAt)}</b> it returns to ${esc(s.linkedAccount.name)} ••${esc(s.linkedAccount.mask)} (simulated).</p>
     <button class="btn btn--gold btn--xl" data-action="keep-goal" data-id="${g.id}">Keep my goal (undo cancellation)</button></section>` : ''}

  ${g.status === 'active' && !unlocked ? `<section class="controls">${pauseButton(s, g)}</section>` : ''}

  ${unlocked ? `<section class="card unlock-card" data-testid="withdraw-options">
      <h2>Your ${esc(g.name)} is fully saved</h2>
      <p class="muted">Choose how to use it. Each option asks you to confirm. Simulation only: no real money moves.</p>
      <button class="btn btn--gold btn--xl" data-action="withdraw" data-method="merchant" data-id="${g.id}" data-testid="withdraw-merchant">Pay merchant directly</button>
      <button class="btn btn--outline btn--xl" data-action="withdraw" data-method="linked_account" data-id="${g.id}" data-testid="withdraw-linked">Transfer to my linked account</button>
    </section>` : ''}

  <section class="card">
    <h2>Progress</h2>
    <dl class="facts">
      <div><dt>Projected completion</dt><dd data-testid="projected">${p.done ? 'Reached' : p.date ? `${pretty(p.date)}${p.hypothetical ? ' (on hold)' : ''}` : '—'}</dd></div>
      <div><dt>Days to goal</dt><dd>${p.done ? '0' : p.date && !p.hypothetical ? p.daysAway : '—'}</dd></div>
      <div><dt>Target date</dt><dd>${pretty(g.targetDate)} <span class="muted small">(${targetIn >= 0 ? `${targetIn} days` : `${-targetIn} days ago`})</span></dd></div>
      ${late ? `<div><dt>Status</dt><dd>${late}</dd></div>` : ''}
    </dl>
  </section>

  ${g.status === 'active' ? `<section class="card">
    <h2>Deposit schedule</h2>
    <p data-testid="schedule-desc">${esc(describe(g.schedule))}</p>
    <dl class="facts">
      <div><dt>Status</dt><dd>${chip(st)}</dd></div>
      <div><dt>Next deposit</dt><dd data-testid="goal-next-deposit">${st.running && g.schedule.nextDate ? `${pretty(g.schedule.nextDate)} · ${money0(Math.min(g.schedule.amount, g.target - g.balance))}` : '—'}</dd></div>
      <div><dt>From</dt><dd>${esc(s.linkedAccount.name)} ••${esc(s.linkedAccount.mask)} <span class="muted small">(simulated)</span></dd></div>
    </dl>
    ${!unlocked ? `<a class="btn btn--outline btn--block" href="#/goal/${g.id}/schedule">${st.code === 'unauthorized' || st.code === 'none' ? 'Set up & authorize schedule' : 'Change schedule'}</a>` : ''}
  </section>` : ''}

  ${g.status === 'active' && !unlocked ? `<section class="card note">
    <h2>${lockSVG({ size: 18 })} Locked savings</h2>
    <p>This money stays locked until you reach ${money0(g.target)}. There is no instant way to take it out early. That's the point.</p>
    <p class="small muted">Need out anyway? <a href="#/help/cancel">Cancellation</a> has a ${COOLING_OFF_DAYS}-day cooling-off period. Suspect fraud? <a href="#/help/fraud">Fraud recovery</a>.</p>
  </section>` : ''}

  <h2 class="section-title">History</h2>
  ${txList(s, txs)}`;
}

function scheduleForm(s, g) {
  const isNew = !g;
  const sch = (g && g.schedule) || { amount: 25000, frequency: 'benefit', benefitDay: 3, offsetDays: 1, dayOfMonth: 1, anchorDate: addDays(s.simNow, 1) };
  const locked = g && isUnlocked(g);
  const f = (v) => (v === undefined || v === null ? '' : v);
  return `
  <div class="subhead"><a class="back" href="${isNew ? '#/' : `#/goal/${g.id}`}">${icons.back}<span>${isNew ? 'Home' : esc(g.name)}</span></a></div>
  <h1>${isNew ? 'New goal' : 'Goal & schedule'}</h1>
  <form id="schedule-form" class="form" novalidate data-goal="${isNew ? '' : g.id}">
    <section class="card">
      <h2>Goal</h2>
      <label class="field"><span>Name</span><input name="name" required maxlength="40" value="${esc(isNew ? '' : g.name)}" placeholder="e.g. Couch"></label>
      <label class="field"><span>Target amount ($)</span><input name="target" inputmode="decimal" value="${isNew ? '' : (g.target / 100).toFixed(2)}" placeholder="1500" ${isNew ? '' : `data-min="${g.target}"`}>
        ${isNew ? '' : '<small class="muted">You can raise a target, but not lower it while money is locked. Lowering it would be a back door around the lock.</small>'}</label>
      <label class="field"><span>Target date</span><input name="targetDate" type="date" value="${isNew ? addMonths(s.simNow, 6) : g.targetDate}"></label>
      ${isNew ? '' : '<button type="button" class="btn btn--outline btn--block" data-action="save-details">Save goal details</button>'}
    </section>
    ${locked ? '<p class="card">This goal is fully saved, so there is nothing left to schedule.</p>' : `
    <section class="card">
      <h2>Deposit schedule</h2>
      <label class="field"><span>Deposit amount ($)</span><input name="amount" inputmode="decimal" value="${(sch.amount / 100).toFixed(2)}"></label>
      <fieldset class="field"><legend>How often</legend>
        <div class="radios">${Object.entries(FREQUENCIES).map(([k, v]) => `<label class="radio"><input type="radio" name="frequency" value="${k}" ${sch.frequency === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
      </fieldset>
      <div class="freq freq--benefit">
        <label class="field"><span>My benefit payment arrives on day</span><input name="benefitDay" type="number" min="1" max="31" inputmode="numeric" value="${f(sch.benefitDay) || 3}"></label>
        <label class="field"><span>Deposit this many days after it arrives</span><input name="offsetDays" type="number" min="0" max="10" inputmode="numeric" value="${f(sch.offsetDays) === '' ? 1 : sch.offsetDays}"></label>
        <small class="muted">Example: paid on the 3rd, offset 1 → deposit on the 4th. If a month is shorter, the last day of the month is used.</small>
      </div>
      <div class="freq freq--monthly"><label class="field"><span>Day of month</span><input name="dayOfMonth" type="number" min="1" max="31" inputmode="numeric" value="${f(sch.dayOfMonth) || 1}"></label></div>
      <div class="freq freq--weekly freq--biweekly"><label class="field"><span>First deposit date</span><input name="anchorDate" type="date" min="${addDays(s.simNow, 1)}" value="${sch.anchorDate && sch.anchorDate > s.simNow ? sch.anchorDate : addDays(s.simNow, 1)}"></label></div>
      <div class="preview" id="sched-preview" aria-live="polite"></div>
    </section>
    <section class="card auth">
      <h2>Authorization</h2>
      <p class="consent" id="consent-text"></p>
      <label class="check"><input type="checkbox" name="authorize" data-testid="authorize-check"><span>I authorize this deposit schedule. I can pause it, change it, or revoke it at any time.</span></label>
      <button type="submit" class="btn btn--gold btn--xl" data-testid="authorize-submit" disabled>${isNew ? 'Create goal & authorize' : 'Authorize schedule'}</button>
      <p class="small muted">Your authorization is logged with a timestamp in History.</p>
    </section>`}
  </form>`;
}

function readSchedule(form) {
  const v = (n) => form.elements[n] && form.elements[n].value;
  return {
    amount: toCents(v('amount')),
    frequency: (form.querySelector('input[name=frequency]:checked') || {}).value,
    benefitDay: parseInt(v('benefitDay'), 10),
    offsetDays: parseInt(v('offsetDays'), 10),
    dayOfMonth: parseInt(v('dayOfMonth'), 10),
    anchorDate: v('anchorDate'),
  };
}

function consentText(s, name, sch, first) {
  return `I authorize Lock & Deploy to deposit ${describe(sch).replace(/^\$[\d,.]+ /, `${money0(sch.amount)} `)} from ${s.linkedAccount.name} ••${s.linkedAccount.mask} into my locked "${name || 'goal'}" savings, starting ${pretty(first)}, until the goal is fully saved or I pause, cancel, or revoke this authorization. I understand this money stays locked until the goal is reached. Simulation: fictional money, no real transfer occurs.`;
}

function refreshScheduleForm() {
  const form = document.getElementById('schedule-form');
  if (!form || !form.elements.amount) return;
  const s = getState();
  const sch = readSchedule(form);
  form.querySelectorAll('.freq').forEach((el) => { el.hidden = !el.classList.contains(`freq--${sch.frequency}`); });
  const errs = validateSchedule(sch);
  const prev = document.getElementById('sched-preview');
  const name = form.elements.name.value.trim();
  const target = toCents(form.elements.target.value);
  const balance = form.dataset.goal ? goalById(s, form.dataset.goal).balance : 0;
  if (errs.length) { prev.innerHTML = `<span class="warn">${esc(errs[0])}</span>`; document.getElementById('consent-text').textContent = ''; return; }
  const first = nextOccurrence(sch, addDays(s.simNow, 1));
  let comp = '';
  if (target > 0) {
    const fake = { target, balance, schedule: sch, status: 'active', unlockedAt: null };
    const p = projection({ ...s, frozen: false, globalPaused: false }, fake);
    if (p.date) comp = ` · Fully saved about <b>${pretty(p.date)}</b> (${p.deposits} deposits)`;
  }
  prev.innerHTML = `First deposit: <b>${pretty(first)}</b>${comp}`;
  document.getElementById('consent-text').textContent = consentText(s, name, sch, first);
}

const TX_LABEL = {
  goal_created: 'Goal created', deposit: 'Deposit', deposit_manual: 'Deposit (sim)', deposit_skipped: 'Deposit skipped', balance_set: 'Balance set (sim)',
  authorization_granted: 'Authorization granted', authorization_revoked: 'Authorization revoked', schedule_set: 'Schedule set', schedule_changed: 'Schedule changed',
  paused: 'Paused', resumed: 'Resumed', global_paused: 'All paused', global_resumed: 'All resumed', unlocked: 'Unlocked',
  withdrawal_requested: 'Withdrawal requested', withdrawal_completed: 'Withdrawal completed', cancel_requested: 'Cancellation requested',
  cancel_withdrawn: 'Cancellation withdrawn', cancel_completed: 'Cancellation completed', fraud_reported: 'Fraud reported',
  schedules_frozen: 'Schedules frozen', schedules_unfrozen: 'Schedules unfrozen', real_transfer_warning_ack: 'Benefit-limit warning acknowledged',
  real_transfer_activation_blocked: 'Real-transfer activation blocked', demo_reset: 'Demo reset', account_linked: 'Account linked', goal_updated: 'Goal updated',
};
const TX_TONE = { deposit: 'plus', deposit_manual: 'plus', unlocked: 'gold', withdrawal_completed: 'minus', cancel_completed: 'minus', fraud_reported: 'bad', schedules_frozen: 'bad', authorization_revoked: 'bad', deposit_skipped: 'muted' };

function txList(s, txs) {
  if (!txs.length) return '<p class="muted card">No activity yet.</p>';
  return `<ul class="tx-list" data-testid="tx-list">${txs.slice(0, 300).map((t) => {
    const g = t.goalId ? goalById(s, t.goalId) : null;
    const amt = t.amount ? `<span class="tx__amt tx__amt--${TX_TONE[t.type] || ''}">${['withdrawal_completed', 'cancel_completed', 'withdrawal_requested'].includes(t.type) ? '−' : t.amount > 0 ? '+' : ''}${money(Math.abs(t.amount))}</span>` : '';
    return `<li class="tx tx--${TX_TONE[t.type] || 'plain'}" data-type="${t.type}">
      <div class="tx__main"><div class="tx__type">${esc(TX_LABEL[t.type] || t.type)}${g ? ` <span class="muted">· ${esc(g.name)}</span>` : ''}</div>${amt}</div>
      <div class="tx__note">${esc(t.note)}</div>
      <div class="tx__when">Sim ${pretty(t.date)} · logged ${esc(timeOf(t.ts))}</div></li>`;
  }).join('')}</ul>`;
}

function viewHistory(s) {
  const txs = historyFilter === 'all' ? s.transactions : historyFilter === 'account' ? s.transactions.filter((t) => !t.goalId) : s.transactions.filter((t) => t.goalId === historyFilter);
  return `<h1>History</h1>
  <div class="chips" role="tablist">
    <button class="chip-btn ${historyFilter === 'all' ? 'is-on' : ''}" data-action="filter" data-f="all">All</button>
    ${s.goals.map((g) => `<button class="chip-btn ${historyFilter === g.id ? 'is-on' : ''}" data-action="filter" data-f="${g.id}">${esc(g.name)}</button>`).join('')}
    <button class="chip-btn ${historyFilter === 'account' ? 'is-on' : ''}" data-action="filter" data-f="account">Account</button>
  </div>
  ${txList(s, txs)}`;
}

function viewProcedures() {
  return `<h1>Safety & procedures</h1>
  <p class="muted">Plain-language steps for when plans change or something looks wrong.</p>
  <a class="proc card" href="#/help/cancel"><div><h2>Cancel a goal</h2><p class="muted">Stop a goal and get the money back after a ${COOLING_OFF_DAYS}-day cooling-off period.</p></div>${icons.chevron}</a>
  <a class="proc card" href="#/help/revoke"><div><h2>Revoke transfer authorization</h2><p class="muted">Stop all future pulls from your account, right now.</p></div>${icons.chevron}</a>
  <a class="proc card" href="#/help/fraud"><div><h2>Fraud recovery</h2><p class="muted">Report activity you didn't authorize and freeze everything.</p></div>${icons.chevron}</a>
  <section class="card note"><h2>The rules this app follows</h2>
    <ul class="rules">
      <li>Phase 1 is a simulation. All money is fictional. No bank is connected.</li>
      <li>Nothing is scheduled without your explicit authorization, and every authorization is logged.</li>
      <li>Pause stops future deposits only. It never unlocks savings.</li>
      <li>No instant withdrawal while a goal is locked. The lock opens only when the goal is fully saved.</li>
      <li>You can revoke authorization at any time, and future pulls stop immediately.</li>
    </ul></section>`;
}

function viewCancel(s) {
  const goals = s.goals.filter((g) => g.status === 'active' || g.status === 'cancel_pending');
  return `<div class="subhead"><a class="back" href="#/help">${icons.back}<span>Procedures</span></a></div>
  <h1>Cancel a goal</h1>
  <ol class="steps">
    <li><b>Request cancellation.</b> Pick the goal below and confirm.</li>
    <li><b>Deposits stop right away.</b> No more money goes in.</li>
    <li><b>${COOLING_OFF_DAYS}-day cooling-off.</b> Your money stays locked during this time. This protects you from quitting on an impulse. You can change your mind and keep the goal.</li>
    <li><b>Money returns.</b> When the cooling-off ends, the balance goes back to your linked account. In this simulation that happens instantly on day ${COOLING_OFF_DAYS}. With a real banking partner, bank transfer times apply (often 1–3 business days).</li>
  </ol>
  <p class="small muted">Tip: to take a break without cancelling, use <b>Pause</b>. Your money stays put and you can resume later.</p>
  ${goals.map((g) => `<section class="card">
      <div class="row-between"><h2>${esc(g.name)}</h2><span>${money(g.balance)}</span></div>
      ${g.status === 'cancel_pending'
        ? `<p>Cancellation requested ${pretty(g.cancelRequestedAt)}. Money returns on <b>${pretty(g.cancelEffectiveAt)}</b> (${Math.max(0, diffDays(s.simNow, g.cancelEffectiveAt))} days).</p>
           <button class="btn btn--gold btn--xl" data-action="keep-goal" data-id="${g.id}">Keep my goal (undo)</button>`
        : isUnlocked(g) ? '<p class="muted">This goal is fully saved and already unlocked. Use its payout options instead.</p>'
        : `<button class="btn btn--danger btn--xl" data-action="cancel-goal" data-id="${g.id}">Request cancellation</button>`}
    </section>`).join('') || '<p class="card muted">No goals can be cancelled right now.</p>'}`;
}

function viewRevoke(s) {
  const active = s.authorizations.filter((a) => !a.revokedAt);
  return `<div class="subhead"><a class="back" href="#/help">${icons.back}<span>Procedures</span></a></div>
  <h1>Revoke transfer authorization</h1>
  <ol class="steps">
    <li><b>Revoke.</b> Tap the button below and confirm.</li>
    <li><b>Future pulls stop immediately.</b> No new deposits will be taken from your account.</li>
    <li><b>Your savings stay locked.</b> Revoking stops new money going in. It does not release money already saved.</li>
    <li><b>It's on the record.</b> The revocation is logged with a timestamp in History.</li>
    <li><b>Starting again</b> means setting up a new schedule and authorizing it again.</li>
  </ol>
  <p class="small muted">With a real banking partner you could also tell your own bank to stop payments. Any debit already in progress may still post; if one posts after you revoke, report it under <a href="#/help/fraud">Fraud recovery</a>.</p>
  <section class="card"><h2>Active authorizations (${active.length})</h2>
    ${active.length ? `<ul class="plain">${active.map((a) => { const g = goalById(s, a.goalId); return `<li class="row-between"><span>${esc(g ? g.name : a.goalId)}<br><span class="small muted">Granted ${esc(timeOf(a.grantedAt))}</span></span><button class="btn btn--outline btn--sm" data-action="revoke-one" data-id="${a.id}">Revoke</button></li>`; }).join('')}</ul>
      <button class="btn btn--danger btn--xl" data-action="revoke-all" data-testid="revoke-all">Revoke all authorizations now</button>` : '<p class="muted">No active authorizations. Nothing can be pulled from your account.</p>'}
  </section>`;
}

function viewFraud(s) {
  return `<div class="subhead"><a class="back" href="#/help">${icons.back}<span>Procedures</span></a></div>
  <h1>Fraud recovery</h1>
  <p>If you see a deposit, change, or payout you didn't make, follow these steps in order.</p>
  <section class="card"><h2>1. Freeze everything</h2>
    <p>Stops every schedule immediately. Your locked savings stay locked and safe.</p>
    ${s.frozen ? '<p class="bad"><b>Frozen.</b> No deposits will run.</p>' : '<button class="btn btn--danger btn--xl" data-action="freeze">Freeze all schedules now</button>'}
  </section>
  <section class="card"><h2>2. Report what happened</h2>
    <label class="field"><span>What looks wrong? (date, amount, what you saw)</span><textarea id="fraud-desc" rows="3" placeholder="e.g. A $500 deposit on Oct 4 that I did not authorize"></textarea></label>
    <button class="btn btn--gold btn--xl" data-action="report-fraud">Submit report</button>
    <p class="small muted">Submitting also freezes all schedules and is logged in History.</p>
  </section>
  <section class="card"><h2>3. Contact the banking partner</h2>
    <p>In Phase 1 there is no bank and no real money, so nothing was taken. When a regulated banking partner is connected (Phase 2), its fraud phone line and dispute form will appear here.</p>
    <p>Also call your own bank or card issuer if money left an account you own.</p>
  </section>
  <section class="card"><h2>4. File a dispute</h2>
    <ul class="rules">
      <li>Report unauthorized electronic transfers as soon as possible. Under the federal rule for electronic transfers (Regulation E), reporting quickly, and within 60 days of the statement that shows the transfer, gives you the most protection.</li>
      <li>Write down dates, amounts, and who you spoke with. Keep copies.</li>
      <li>The bank must investigate and tell you the result.</li>
    </ul>
  </section>
  <section class="card"><h2>5. Secure your accounts</h2>
    <ul class="rules">
      <li>Change the passwords for your email, phone carrier, and bank.</li>
      <li>If your benefit payment went somewhere unexpected, contact Social Security at 1-800-772-1213 or through your my Social Security account.</li>
      <li>You can report identity theft at IdentityTheft.gov.</li>
    </ul>
  </section>
  ${s.frozen ? `<section class="card"><h2>6. Unfreeze when it's safe</h2><p>Only unfreeze once the problem is sorted out. Schedules with active authorizations will run again, and missed dates are not pulled late.</p>
    <button class="btn btn--outline btn--xl" data-action="unfreeze">Unfreeze schedules</button></section>` : ''}
  <p class="small muted">General information only, not legal advice.</p>`;
}

function viewSim(s) {
  const goals = s.goals.filter((g) => g.status === 'active');
  const opts = goals.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  const nextMonth = diffDays(s.simNow, addMonths(s.simNow, 1));
  return `<h1>Simulation controls</h1>
  <p class="muted">Developer panel. Everything here is fictional money.</p>
  <section class="card"><h2>Time</h2>
    <p>Simulated date: <b data-testid="sim-date">${pretty(s.simNow)}</b></p>
    <div class="btn-row">
      <button class="btn btn--outline" data-action="ff" data-days="1" data-testid="ff-day">+1 day</button>
      <button class="btn btn--outline" data-action="ff" data-days="7" data-testid="ff-week">+1 week</button>
      <button class="btn btn--outline" data-action="ff" data-days="${nextMonth}" data-testid="ff-month">+1 month</button>
    </div>
    <p class="small muted">Scheduled deposits post as their dates pass. Paused or frozen schedules log a skipped deposit instead.</p>
  </section>
  <section class="card"><h2>Projected completion</h2>
    <div id="sim-projections">${goals.map((g) => `<div class="row-between proj-row"><span>${esc(g.name)}</span><span data-testid="sim-proj-${g.id}">${projLine(s, g)}</span></div>`).join('') || '<p class="muted">No active goals.</p>'}</div>
    ${goals.length ? `<label class="field"><span>What if each deposit were… ($)</span><input id="whatif" inputmode="decimal" placeholder="e.g. 750"></label><div id="whatif-out" class="preview" aria-live="polite"></div>` : ''}
  </section>
  ${goals.length ? `<section class="card"><h2>Add fake deposit now</h2>
    <label class="field"><span>Goal</span><select id="dep-goal">${opts}</select></label>
    <label class="field"><span>Amount ($)</span><input id="dep-amt" inputmode="decimal" value="100"></label>
    <button class="btn btn--gold btn--block" data-action="sim-deposit" data-testid="sim-deposit">Add deposit</button>
  </section>
  <section class="card"><h2>Set balance</h2>
    <label class="field"><span>Goal</span><select id="bal-goal">${opts}</select></label>
    <label class="field"><span>New balance ($)</span><input id="bal-amt" inputmode="decimal" placeholder="2950"></label>
    <button class="btn btn--outline btn--block" data-action="sim-balance" data-testid="sim-balance">Set balance</button>
  </section>` : ''}
  <section class="card"><h2>Reset</h2><p class="muted">Restore the demo: one Mattress goal, $3,000, nothing saved, schedule not yet authorized.</p>
    <button class="btn btn--danger btn--block" data-action="reset">Reset demo data</button></section>`;
}

function viewSettings(s) {
  const info = provider.info;
  return `<h1>Settings</h1>
  <section class="card"><h2>Linked account</h2><p>${esc(s.linkedAccount.name)} ••${esc(s.linkedAccount.mask)} <span class="chip chip--muted">Simulated</span></p></section>
  <section class="card"><h2>Real transfers</h2>
    <p>Status: <b data-testid="real-status">Off</b>. Phase 1 is a simulation with fictional money.</p>
    <p class="small muted">Provider: ${esc(info.label)}. Moves real money: ${info.movesRealMoney ? 'yes' : 'no'}.</p>
    <button class="btn btn--outline btn--xl" data-action="start-activation" data-testid="activate-real">Activate real transfers…</button>
  </section>
  <section class="card note"><h2>About</h2>
    <p>Lock & Deploy is "reverse financing": instead of buying now and paying later, you lock money away on a schedule and the goal unlocks when it's fully saved.</p>
    <p class="small muted">Phase 1 prototype. Your data stays on this device (browser storage). Not financial or legal advice.</p>
    <p class="small"><a href="../lock-and-deploy-vault/" data-testid="vault-link">Try the Vault version (Hard Lock, Roll Over &amp; Relock, AI bot approvals) →</a></p>
  </section>`;
}

function viewActivateWarning(s) {
  const big = s.goals.filter((g) => g.status === 'active' && g.target > 200000);
  const total = liveGoals(s).reduce((a, g) => a + g.target, 0);
  return `<div class="subhead"><a class="back" href="#/settings">${icons.back}<span>Settings</span></a></div>
  <section class="warning card" data-testid="ssi-warning">
    <div class="warning__icon" aria-hidden="true">!</div>
    <h1>Before you turn on real transfers: benefit limits</h1>
    <p><b>If you get SSI, saving money can affect your eligibility.</b> SSI counts money in savings (including money locked in a goal like this) as a <i>resource</i>.</p>
    <ul class="rules">
      <li>The commonly cited SSI resource limits are <b>$2,000 for an individual</b> and <b>$3,000 for a couple</b>. SSA generally looks at what you have at the start of each month.</li>
      <li>A savings goal like <b>$3,000</b> could put you over the limit and affect your SSI payments, and in many states your Medicaid.</li>
      ${big.length ? `<li class="warn">Your goal${big.length > 1 ? 's' : ''} ${big.map((g) => `"${esc(g.name)}" (${money0(g.target)})`).join(', ')} ${big.length > 1 ? 'are' : 'is'} above $2,000. Your goals total ${money0(total)}.</li>` : ''}
      <li>Other programs, such as <b>Medicaid</b> or <b>SNAP</b>, may have their own asset rules, which vary by program and state.</li>
      <li><b>ABLE accounts</b> may be an option if you are eligible (generally, disability that began before a certain age). SSA excludes up to $100,000 in an ABLE account from SSI resources.</li>
      <li>Limits and rules can change. <b>Check the current limits with Social Security</b> (ssa.gov or 1-800-772-1213) or a benefits counselor before saving above them.</li>
    </ul>
    <p class="small muted">This is general information, not legal or financial advice.</p>
    <label class="check"><input type="checkbox" id="ssi-ack" data-testid="ssi-ack"><span>I have read this. I understand savings may count toward benefit resource limits and I will check my own situation with SSA or a benefits counselor.</span></label>
    <button class="btn btn--gold btn--xl" data-action="ack-warning" data-testid="ssi-continue" disabled>I understand, continue</button>
    <a class="btn btn--ghost btn--block" href="#/settings">Not now</a>
  </section>`;
}

function viewActivateStub() {
  return `<div class="subhead"><a class="back" href="#/settings">${icons.back}<span>Settings</span></a></div>
  <h1>Activate real transfers</h1>
  <section class="card" data-testid="activation-stub">
    <p>Real money movement needs a regulated banking partner that holds funds in FDIC-insured custodial accounts, identity verification (KYC), and a signed program agreement.</p>
    <p><b>None of that exists in Phase 1</b>, so this switch can't turn on. Your goals keep running on fictional money.</p>
    <button class="btn btn--gold btn--xl" data-action="try-activate" data-testid="try-activate">Activate real transfers</button>
    <div id="activate-result" aria-live="polite">${activationResult ? `<p class="banner banner--warn" data-testid="activation-blocked"><b>Not available.</b> ${esc(activationResult)}</p>` : ''}</div>
  </section>`;
}

// ---------- router ----------
function parseRoute() {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  return parts;
}

function render() {
  const s = getState();
  const parts = parseRoute();
  const key = parts.join('/');
  if (!key.startsWith('activate')) { activationAck = false; activationResult = ''; }
  if (key === 'activate/confirm' && !activationAck) { location.replace('#/activate'); return; }
  let html, tab = 'home';
  switch (parts[0]) {
    case undefined: html = viewDashboard(s); break;
    case 'goal': html = parts[2] === 'schedule' ? scheduleForm(s, goalById(s, parts[1])) : viewGoal(s, goalById(s, parts[1])); break;
    case 'new': html = scheduleForm(s, null); break;
    case 'history': html = viewHistory(s); tab = 'history'; break;
    case 'help': tab = 'help'; html = parts[1] === 'cancel' ? viewCancel(s) : parts[1] === 'revoke' ? viewRevoke(s) : parts[1] === 'fraud' ? viewFraud(s) : viewProcedures(); break;
    case 'sim': html = viewSim(s); tab = 'sim'; break;
    case 'settings': html = viewSettings(s); tab = 'settings'; break;
    case 'activate': html = parts[1] === 'confirm' ? viewActivateStub() : viewActivateWarning(s); tab = 'settings'; break;
    default: html = viewDashboard(s);
  }
  const keepScroll = key === lastRoute;
  const y = window.scrollY;
  pendingAnimMarks = [];
  app.innerHTML = `
    <header class="top">
      <a class="brand" href="#/">${lockSVG({ size: 22 })}<span>Lock <span class="gold">&amp;</span> Deploy</span></a>
      <span class="badge-sim" data-testid="sim-badge" title="Phase 1: no real money is held or moved">Simulation · fictional money</span>
    </header>
    <main class="main" id="main">${html}</main>
    <nav class="tabbar" aria-label="Main">
      ${[['home', '#/', 'Home', icons.home], ['history', '#/history', 'History', icons.history], ['help', '#/help', 'Safety', icons.shield], ['sim', '#/sim', 'Sim', icons.sim], ['settings', '#/settings', 'Settings', icons.gear]]
        .map(([k, href, label, ic]) => `<a href="${href}" class="tab ${tab === k ? 'is-on' : ''}" ${tab === k ? 'aria-current="page"' : ''}>${ic}<span>${label}</span></a>`).join('')}
    </nav>`;
  window.scrollTo(0, keepScroll ? y : 0);
  lastRoute = key;
  if (pendingAnimMarks.length) { const marks = pendingAnimMarks; setTimeout(() => markAnim(marks), 1500); }
  refreshScheduleForm();
}

let queued = false;
function scheduleRender() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; render(); }); }

// ---------- actions ----------
async function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const a = el.dataset.action;
  const s = getState();
  const g = el.dataset.id ? goalById(s, el.dataset.id) : null;
  try {
    switch (a) {
      case 'pause-goal': {
        if (await confirmDialog({ title: `Pause deposits to ${g.name}?`, body: `<p>Scheduled deposits stop until you resume.</p><p><b>Your ${money(g.balance)} stays locked.</b> Pausing never unlocks or releases savings.</p>`, confirmLabel: 'Pause deposits' })) {
          await pauseGoal(g.id); toast(`${g.name} paused. Savings still locked.`);
        }
        break;
      }
      case 'resume-goal': {
        const next = nextOccurrence(g.schedule, addDays(s.simNow, 1));
        if (await confirmDialog({ title: `Resume deposits to ${g.name}?`, body: `<p>Your authorized schedule starts again: ${esc(describe(g.schedule))}.</p><p>Next deposit: <b>${pretty(next)}</b>. Missed dates are not pulled late.</p>`, confirmLabel: 'Resume deposits' })) {
          await resumeGoal(g.id); toast(`${g.name} resumed.`);
        }
        break;
      }
      case 'pause-all':
        if (await confirmDialog({ title: 'Pause all deposits?', body: '<p>Every schedule stops until you resume.</p><p><b>All locked savings stay locked.</b> Nothing is released.</p>', confirmLabel: 'Pause everything' })) { pauseAll(); toast('All deposits paused.'); }
        break;
      case 'resume-all':
        if (await confirmDialog({ title: 'Resume all deposits?', body: '<p>Authorized schedules start again from their next date. Goals you paused one by one stay paused.</p>', confirmLabel: 'Resume all' })) { resumeAll(); toast('Deposits resumed.'); }
        break;
      case 'withdraw': {
        if (!isUnlocked(g)) { toast('Still locked.'); break; }
        const m = el.dataset.method;
        const label = m === 'merchant' ? 'Pay the merchant directly' : `Transfer to ${s.linkedAccount.name} ••${s.linkedAccount.mask}`;
        if (await confirmDialog({ title: label, body: `<p>Release <b>${money(g.balance)}</b> from ${esc(g.name)}.</p><p class="small muted">Simulation: fictional money. No real payment is made.</p>`, confirmLabel: 'Confirm payout', requireCheck: 'I confirm this payout.' })) {
          await provider.requestWithdrawal(g.id, m, { merchant: m === 'merchant' ? `${g.name} retailer` : undefined });
          toast('Payout recorded (simulated).');
        }
        break;
      }
      case 'save-details': {
        const form = document.getElementById('schedule-form');
        const res = readDetails(form, goalById(s, form.dataset.goal));
        if (res.error) { toast(res.error); break; }
        update((st) => { const gg = goalById(st, form.dataset.goal); Object.assign(gg, res.values); addTx(st, { goalId: gg.id, type: 'goal_updated', note: `Details saved: ${gg.name}, ${money0(gg.target)} by ${gg.targetDate}` }); });
        toast('Goal details saved.');
        break;
      }
      case 'filter': historyFilter = el.dataset.f; render(); break;
      case 'cancel-goal':
        if (await confirmDialog({ title: `Cancel ${g.name}?`, danger: true, body: `<p>Deposits stop now. Your ${money(g.balance)} stays locked for a <b>${COOLING_OFF_DAYS}-day cooling-off period</b>, then returns to your linked account (simulated).</p><p>You can undo any time before ${pretty(addDays(s.simNow, COOLING_OFF_DAYS))}.</p>`, confirmLabel: 'Request cancellation', requireCheck: 'I understand the money is not returned instantly.' })) {
          await provider.requestCancellation(g.id, COOLING_OFF_DAYS); toast('Cancellation requested.');
        }
        break;
      case 'keep-goal':
        if (await confirmDialog({ title: `Keep ${g.name}?`, body: '<p>The cancellation request is withdrawn. Your goal and savings stay as they are. Deposits restart only if the schedule is still authorized and not paused.</p>', confirmLabel: 'Keep my goal' })) {
          await provider.withdrawCancellationRequest(g.id); update(rearm); toast('Goal kept.');
        }
        break;
      case 'revoke-one':
      case 'revoke-all': {
        const all = a === 'revoke-all';
        if (await confirmDialog({ title: all ? 'Revoke all authorizations?' : 'Revoke this authorization?', danger: true, body: '<p>Future pulls stop <b>immediately</b>. Savings already locked stay locked. To deposit again you will need to authorize a new schedule.</p>', confirmLabel: 'Revoke now' })) {
          const n = await provider.revokeAuthorization(all ? 'all' : el.dataset.id, 'Authorization revoked by user');
          toast(`${n} authorization${n === 1 ? '' : 's'} revoked.`);
        }
        break;
      }
      case 'freeze':
        if (await confirmDialog({ title: 'Freeze all schedules?', danger: true, body: '<p>No deposits will run until you unfreeze. Locked savings stay locked.</p>', confirmLabel: 'Freeze now' })) { await provider.freeze('Frozen by user (fraud recovery)'); toast('All schedules frozen.'); }
        break;
      case 'report-fraud': {
        const desc = (document.getElementById('fraud-desc') || {}).value || '';
        if (await confirmDialog({ title: 'Submit fraud report?', danger: true, body: '<p>This logs your report and freezes all schedules immediately.</p>', confirmLabel: 'Submit & freeze' })) { await provider.reportFraud({ description: desc.trim() }); toast('Report logged. Schedules frozen.'); }
        break;
      }
      case 'unfreeze':
        if (await confirmDialog({ title: 'Unfreeze schedules?', body: '<p>Only do this if the problem is resolved. Authorized schedules will run again from their next date.</p>', confirmLabel: 'Unfreeze', requireCheck: 'The unauthorized activity has been dealt with.' })) { await provider.unfreeze(); update(rearm); toast('Schedules unfrozen.'); }
        break;
      case 'ff': {
        const n = Number(el.dataset.days);
        el.disabled = true;
        const r = await advanceDays(n);
        toast(`+${n} day${n === 1 ? '' : 's'}: ${r.posted} deposit${r.posted === 1 ? '' : 's'} posted${r.skipped ? `, ${r.skipped} skipped` : ''}.`);
        break;
      }
      case 'sim-deposit': {
        const id = document.getElementById('dep-goal').value; const c = toCents(document.getElementById('dep-amt').value);
        if (!(c > 0)) { toast('Enter an amount.'); break; }
        await provider.executeDeposit(id, c, { source: 'manual' }); toast(`Added ${money(c)} (fictional).`);
        break;
      }
      case 'sim-balance': {
        const id = document.getElementById('bal-goal').value; const c = toCents(document.getElementById('bal-amt').value);
        if (!(c >= 0)) { toast('Enter a balance.'); break; }
        setBalanceSim(id, c); toast('Balance set.');
        break;
      }
      case 'reset':
        if (await confirmDialog({ title: 'Reset demo data?', danger: true, body: '<p>All goals, history, and settings on this device return to the starting demo.</p>', confirmLabel: 'Reset' })) { localStorage.removeItem(ANIM_KEY); resetDemo(); location.hash = '#/'; toast('Demo reset.'); }
        break;
      case 'start-activation': activationAck = false; location.hash = '#/activate'; break;
      case 'ack-warning': {
        const box = document.getElementById('ssi-ack');
        if (!box || !box.checked) break;
        update((st) => { st.realTransfers.lastWarningAckAt = new Date().toISOString(); addTx(st, { type: 'real_transfer_warning_ack', note: 'Benefit resource-limit warning (SSI/Medicaid/SNAP/ABLE) read and acknowledged.' }); });
        activationAck = true; location.hash = '#/activate/confirm';
        break;
      }
      case 'try-activate': {
        try { await provider.activateRealTransfers({ warningAckAt: s.realTransfers.lastWarningAckAt }); } catch (err) {
          activationResult = err.message;
          update((st) => addTx(st, { type: 'real_transfer_activation_blocked', note: err.message }));
        }
        break;
      }
      default: break;
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Something went wrong');
  }
}

function readDetails(form, g) {
  const name = form.elements.name.value.trim();
  const target = toCents(form.elements.target.value);
  const targetDate = form.elements.targetDate.value;
  if (!name) return { error: 'Give the goal a name.' };
  if (!(target > 0)) return { error: 'Enter a target amount.' };
  if (!targetDate) return { error: 'Pick a target date.' };
  if (g && target < g.target) return { error: `Targets can't be lowered while locked (min ${money0(g.target)}).` };
  return { values: { name, target, targetDate } };
}

async function onSubmit(e) {
  if (e.target.id !== 'schedule-form') return;
  e.preventDefault();
  const form = e.target;
  const s = getState();
  const existing = form.dataset.goal ? goalById(s, form.dataset.goal) : null;
  const det = readDetails(form, existing);
  if (det.error) { toast(det.error); return; }
  const sch = readSchedule(form);
  const errs = validateSchedule(sch);
  if (errs.length) { toast(errs[0]); return; }
  if (!form.elements.authorize.checked) { toast('Tick the authorization box first.'); return; }
  const first = nextOccurrence(sch, addDays(s.simNow, 1));
  const text = consentText(s, det.values.name, sch, first);
  const ok = await confirmDialog({
    title: existing && existing.schedule && existing.schedule.authorizationId ? 'Confirm schedule change' : 'Confirm authorization',
    body: `<p>${esc(text)}</p><p class="small muted">Logged with today's timestamp. Any earlier authorization for this goal is replaced.</p>`,
    confirmLabel: 'Authorize',
  });
  if (!ok) return;
  let goalId = existing && existing.id;
  if (!existing) {
    goalId = `goal_${Date.now().toString(36)}`;
    update((st) => {
      st.goals.push({ id: goalId, ...det.values, balance: 0, createdAt: st.simNow, status: 'active', paused: false, unlockedAt: null, cancelRequestedAt: null, cancelEffectiveAt: null, schedule: null });
      addTx(st, { goalId, type: 'goal_created', note: `Goal created: ${det.values.name}, target ${money0(det.values.target)}` });
    });
  } else {
    update((st) => { Object.assign(goalById(st, goalId), det.values); });
  }
  await authorizeSchedule(goalId, sch, { agreed: true, text, summary: describe(sch) });
  toast(`Authorized ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`);
  location.hash = `#/goal/${goalId}`;
}

function onInput(e) {
  if (e.target.closest('#schedule-form')) { if (e.target.name === 'authorize') { const b = document.querySelector('[data-testid=authorize-submit]'); if (b) b.disabled = !e.target.checked; } refreshScheduleForm(); }
  if (e.target.id === 'ssi-ack') { const b = document.querySelector('[data-testid=ssi-continue]'); if (b) b.disabled = !e.target.checked; }
  if (e.target.id === 'whatif') {
    const s = getState(); const c = toCents(e.target.value); const out = document.getElementById('whatif-out');
    if (!(c > 0)) { out.textContent = ''; return; }
    out.innerHTML = s.goals.filter((g) => g.status === 'active' && g.schedule).map((g) => { const p = projection(s, g, c); return `${esc(g.name)}: ${p.done ? 'already saved' : p.date ? `<b>${pretty(p.date)}</b> (${p.deposits} deposits of ${money0(c)})` : '—'}`; }).join('<br>');
  }
}

// ---------- boot ----------
init();
subscribe(scheduleRender);
window.addEventListener('hashchange', render);
document.addEventListener('click', onClick);
document.addEventListener('submit', onSubmit);
document.addEventListener('input', onInput);
document.addEventListener('change', onInput);
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e)));
}
// Exposed for debugging / tests only.
window.__lockDeploy = { getState, authActive, ordinal };
