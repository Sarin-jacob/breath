// Minimal DOM helpers: escaped templates, bottom sheets, form controls, toasts.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Delegate clicks on [data-action] within root to handlers[action](el, event). */
export function actions(root, handlers) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t || !root.contains(t)) return;
    const fn = handlers[t.dataset.action];
    if (fn) {
      e.preventDefault();
      fn(t, e);
    }
  });
}

export const icon = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" class="size-5"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" class="size-5"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor" class="size-5"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  install: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/></svg>',
  offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-4"><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.4M19 12.5a10 10 0 0 0-3-2M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5"/><circle cx="12" cy="20" r="1"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4"><path d="m5 12 5 5 9-10"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-4"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-4"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5"><path d="M15 5l-7 7 7 7"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
};

// ---------- form controls ----------

export function toggle(name, checked, label, hint = '') {
  return `<label class="flex items-center justify-between gap-4 py-3 cursor-pointer">
    <span class="min-w-0"><span class="block text-[15px]">${esc(label)}</span>${hint ? `<span class="block text-xs text-white/45 mt-0.5 leading-snug">${esc(hint)}</span>` : ''}</span>
    <span class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span></span></span>
  </label>`;
}

export function slider(name, value, { min = 0, max = 1, step = 0.01, label, fmt = (v) => Math.round(v * 100) + '%' }) {
  const fill = ((value - min) / (max - min)) * 100;
  return `<label class="block py-2">
    <span class="flex justify-between text-sm"><span>${esc(label)}</span><span class="text-white/50 tabular-nums" data-out="${name}">${esc(fmt(value))}</span></span>
    <input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}" style="--fill:${fill}%" data-fmt>
  </label>`;
}

/** Keep slider fill + readout in sync. fmts: { name: fn } */
export function bindSliders(root, fmts = {}) {
  root.addEventListener('input', (e) => {
    const r = e.target;
    if (r.type !== 'range') return;
    const min = +r.min, max = +r.max;
    r.style.setProperty('--fill', ((r.value - min) / (max - min)) * 100 + '%');
    const out = root.querySelector(`[data-out="${r.name}"]`);
    if (out) out.textContent = (fmts[r.name] || ((v) => Math.round(v * 100) + '%'))(+r.value);
  });
}

export function segmented(name, value, options) {
  return `<div class="grid gap-1 p-1 rounded-2xl bg-white/5" style="grid-template-columns:repeat(${options.length},minmax(0,1fr))" role="radiogroup">
    ${options.map(([v, label]) => `<button type="button" role="radio" aria-checked="${v === value}" data-action="seg" data-name="${name}" data-value="${esc(v)}"
      class="rounded-xl px-2 py-2 text-sm transition ${v === value ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'}">${esc(label)}</button>`).join('')}
  </div>`;
}

export const section = (title, body, hint = '') => `
  <section class="py-4 border-b border-white/5 last:border-0">
    <h3 class="text-xs uppercase tracking-[0.2em] text-white/40 mb-2">${esc(title)}</h3>
    ${hint ? `<p class="text-xs text-white/45 -mt-1 mb-2 leading-relaxed">${hint}</p>` : ''}
    ${body}
  </section>`;

// ---------- sheet ----------

let openSheet = null;

/**
 * Open a bottom sheet (centered panel on desktop). render(body) fills it and may re-render.
 * Returns { close, body, rerender }.
 */
export function sheet({ title, render, onClose, wide = false }) {
  openSheet?.close(true);
  const host = document.getElementById('sheets');
  const root = el(`<div class="sheet-closed fixed inset-0 pointer-events-auto flex items-end sm:items-center justify-center">
    <div class="sheet-backdrop absolute inset-0 bg-black/50" data-close></div>
    <div class="sheet relative w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[88dvh] sm:max-h-[85dvh] flex flex-col glass-strong rounded-t-[28px] sm:rounded-[28px] shadow-2xl" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="flex items-center justify-between px-6 pt-5 pb-2">
        <h2 class="font-serif text-2xl font-light tracking-wide">${esc(title)}</h2>
        <button class="p-2 -mr-2 rounded-full text-white/60 hover:text-white hover:bg-white/10" data-close aria-label="Close">${icon.close}</button>
      </div>
      <div class="sheet-body overflow-y-auto scroll-thin px-6 pb-8 safe-bottom"></div>
    </div>
  </div>`);
  host.appendChild(root);
  const body = root.querySelector('.sheet-body');
  const api = {
    body,
    rerender() {
      const top = body.scrollTop;
      render(body, api);
      body.scrollTop = top;
    },
    close(immediate = false) {
      if (openSheet !== api) return;
      openSheet = null;
      removeEventListener('keydown', onKey);
      onClose?.();
      if (immediate) return root.remove();
      root.classList.add('sheet-closed');
      setTimeout(() => root.remove(), 450);
    },
  };
  const onKey = (e) => e.key === 'Escape' && api.close();
  addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api.close(); });
  openSheet = api;
  render(body, api);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('sheet-closed')));
  return api;
}

export const closeSheet = () => openSheet?.close();

// ---------- toast ----------
let toastTimer;
export function toast(msg, ms = 2800) {
  const host = document.getElementById('toast');
  host.innerHTML = `<div class="glass-strong rounded-full px-5 py-2.5 text-sm shadow-xl fade-enter whitespace-nowrap">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (host.innerHTML = ''), ms);
}

export function fmtTime(sec) {
  if (!isFinite(sec)) return '∞';
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
