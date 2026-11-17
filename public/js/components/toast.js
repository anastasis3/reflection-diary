/**
 * Brief messages at the bottom of the screen.
 *
 * The container is marked aria-live="polite", so a screen reader announces a
 * toast when it appears without interrupting whatever is being read. Anything
 * the person must act on is never a toast — it goes inline, next to the
 * control it concerns.
 */
import { esc } from '../dom.js';
import icons from '../icons.js';

const area = () => document.getElementById('toasts');

export function toast(message, kind = 'info', ms = 4200) {
  const host = area();
  if (!host) return;

  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  const icon = kind === 'warn' ? icons.warn() : kind === 'good' ? icons.check() : icons.info();
  node.innerHTML = `<span class="row" style="gap:9px;flex-wrap:nowrap">${icon}<span>${esc(message)}</span></span>`;
  host.append(node);

  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .25s';
    setTimeout(() => node.remove(), 300);
  }, ms);
}

/**
 * A confirmation the person has to answer.
 *
 * Uses the native <dialog>, which gives focus trapping, Escape to close and a
 * backdrop for free — all of which would otherwise have to be written and
 * tested by hand.
 */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  const dialog = document.getElementById('dialog');
  const host = document.getElementById('dialog-body');
  if (!dialog || !host) return Promise.resolve(false);

  host.innerHTML = `
    <h2>${esc(title)}</h2>
    <p style="color:var(--text-2);font-size:14px;margin-top:var(--gap-2)">${esc(body)}</p>
    <div class="dialog-actions">
      <button class="btn ${danger ? 'danger' : ''}" data-confirm>${esc(confirmLabel)}</button>
      <button class="btn ghost" data-cancel>Cancel</button>
    </div>`;

  return new Promise((resolve) => {
    const finish = (value) => {
      dialog.close();
      resolve(value);
    };
    host.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
    host.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', () => resolve(false), { once: true });
    dialog.showModal();
    // Focus the safe option first, so Enter does not confirm a deletion.
    host.querySelector('[data-cancel]').focus();
  });
}

export default toast;
