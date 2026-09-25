// Small UI helpers: escaping, lock + ring graphics, modal confirmations, toasts.
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let lockSeq = 0;
/** Lock graphic. `open` only when saved >= target. `animate` plays the opening. */
export function lockSVG({ open = false, animate = false, size = 96, label } = {}) {
  const id = `lk${++lockSeq}`;
  const cls = ['lock', open ? (animate ? 'lock--opening' : 'lock--open') : 'lock--closed'].join(' ');
  return `<svg class="${cls}" width="${size}" height="${Math.round(size * 1.17)}" viewBox="0 0 120 140" role="img" aria-label="${esc(label || (open ? 'Unlocked' : 'Locked'))}" data-lock="${open ? 'open' : 'closed'}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9CD6C"/><stop offset="1" stop-color="#B8922A"/></linearGradient></defs>
    <g class="lock__shackle"><path d="M36 100 V44 a24 24 0 0 1 48 0 V66" fill="none" stroke="url(#${id})" stroke-width="11" stroke-linecap="round"/></g>
    <rect class="lock__body" x="16" y="60" width="88" height="72" rx="16" fill="url(#${id})"/>
    <g class="lock__hole"><circle cx="60" cy="90" r="9.5" fill="#0B0B0C"/><rect x="55.5" y="92" width="9" height="20" rx="4.5" fill="#0B0B0C"/></g>
  </svg>`;
}

export function ringSVG(pct, size = 220, stroke = 10) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#222226" stroke-width="${stroke}"/>
    <circle class="ring__fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#D4AF37" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

export function bar(pct) {
  const p = Math.max(0, Math.min(1, pct));
  return `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><div class="bar__fill" style="width:${(p * 100).toFixed(1)}%"></div></div>`;
}

/**
 * Confirmation dialog. Resolves true only on explicit confirm.
 * requireCheck: label text for a checkbox that must be ticked before confirming.
 */
export function confirmDialog({ title, body = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, requireCheck = null }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div class="modal__sheet">
      <h2 class="modal__title">${esc(title)}</h2>
      <div class="modal__body">${body}</div>
      ${requireCheck ? `<label class="check"><input type="checkbox" data-modal-check><span>${esc(requireCheck)}</span></label>` : ''}
      <div class="modal__actions">
        <button class="btn ${danger ? 'btn--danger' : 'btn--gold'}" data-modal-ok ${requireCheck ? 'disabled' : ''}>${esc(confirmLabel)}</button>
        <button class="btn btn--ghost" data-modal-cancel>${esc(cancelLabel)}</button>
      </div></div>`;
    document.body.appendChild(wrap);
    const ok = wrap.querySelector('[data-modal-ok]');
    const chk = wrap.querySelector('[data-modal-check]');
    if (chk) chk.addEventListener('change', () => { ok.disabled = !chk.checked; });
    const close = (v) => { wrap.remove(); resolve(v); };
    ok.addEventListener('click', () => close(true));
    wrap.querySelector('[data-modal-cancel]').addEventListener('click', () => close(false));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(false); });
    setTimeout(() => (chk || ok).focus(), 30);
  });
}

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('toast--out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

export const icons = {
  home: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  history: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/></svg>',
  sim: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4l10 8-10 8zM17 5v14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
};
