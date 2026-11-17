/**
 * Small helpers shared by every screen.
 *
 * `esc` is the important one. Screens build their markup as template strings,
 * and anything that came from a person — an entry, an e-mail address — goes
 * through `esc` before it is put into that string. Without it an entry
 * containing `<script>` would run as code in the writer's own browser.
 */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Escapes the five characters that matter inside HTML text and attributes. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

/** Binds an event, tolerating an element that is not on the current screen. */
export function on(selector, type, handler, root = document) {
  const element = typeof selector === 'string' ? $(selector, root) : selector;
  if (element) element.addEventListener(type, handler);
  return element;
}

/** Binds one handler for many elements, by selector, with the element passed in. */
export function onEach(selector, type, handler, root = document) {
  $$(selector, root).forEach((element) => {
    element.addEventListener(type, (event) => handler(event, element));
  });
}

/** Shows or hides the message under an input and marks the input itself. */
export function setFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(`${inputId}-error`);
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (!error) return;
  error.classList.toggle('on', Boolean(message));
  if (message) {
    const text = error.querySelector('[data-text]');
    if (text) text.textContent = message;
  }
}

/** 0.38 -> "0.38"; keeps the two decimals the interface shows everywhere. */
export const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2));

/** "+0.04" / "-0.02" — the signed movement shown beside a weight. */
export const fmtDelta = (n) =>
  n === null || n === undefined ? '' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}`;

/** "Monday, 17 November" */
export function longDate(isoDay) {
  return new Date(`${isoDay}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** "21:40" in the reader's own time zone. */
export function clock(isoTimestamp) {
  return new Date(isoTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Today as YYYY-MM-DD, matching how the server stores a day. */
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** "Good morning" / "Good evening", by the reader's clock. */
export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Still awake';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
