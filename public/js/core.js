/**
 * The core of the interface: shared state, the zone catalogue, icons, small
 * helpers, and navigation (render / go).
 *
 * How the interface works, in one paragraph:
 *   Every screen is a module in js/screens/ with two functions — view()
 *   returns the HTML of the screen as a string, wire() attaches the event
 *   handlers after that HTML is on the page — and optionally load(), which
 *   fetches what the screen needs from the API before it is drawn. render()
 *   draws the current screen; go(name) changes the screen. The markup and
 *   the class names are the clickable prototype's, so the application looks
 *   exactly like the mockup; the data now comes from the server.
 */

/* ---------- the nine zones (same ids, names and colours as the server) ---------- */
// Radar order: the order the zones go round the chart, as in the mockup.
export const ZONES = ['work', 'energy', 'emotion', 'people', 'self', 'interest', 'health', 'everyday', 'meaning'];
export const ZC = {
  work: '#A99BFF', energy: '#F3BE8C', self: '#D8B4F2', interest: '#8FD1E8',
  meaning: '#B4C6F0', everyday: '#95DCC6', health: '#9BD9A2', people: '#EDB4D0', emotion: '#EDD392',
};
// Names from the four WHOQOL-BREF domains and the five PERMA elements,
// adapted as journalling topics (UX specification §1.4).
export const ZL = {
  work: 'work & study', people: 'close people', health: 'health & body', energy: 'energy & sleep',
  emotion: 'emotions', self: 'self & growth', interest: 'interests', meaning: 'meaning', everyday: 'everyday life',
};
export const ZS = {
  work: 'work', people: 'people', health: 'health', energy: 'energy', emotion: 'emotions',
  self: 'self', interest: 'interests', meaning: 'meaning', everyday: 'everyday',
};
export const zc = (z) => ZC[z] || '#9B8CFF';
export const zl = (z) => ZL[z] || z;

/* ---------- icons: vector, never font glyphs ---------- */
export const ICON = {
  spark: (c = '#9B8CFF', s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M8,1 L9.5,6.1 L14.6,7.6 L9.5,9.1 L8,14.2 L6.5,9.1 L1.4,7.6 L6.5,6.1 Z" fill="${c}"/></svg>`,
  check: (c = '#3DDBA8', s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M2,9 l3.2,3.2 L14,3.5" stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warn: (c = '#FF9B8A', s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M8,1 L15,14.5 L1,14.5 Z" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M8,6 V10.4" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="12.7" r="1.1" fill="${c}"/></svg>`,
  info: (c = '#9B8CFF', s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="8" cy="4.8" r="1.1" fill="${c}"/><path d="M8,7.6 V12.4" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  clock: (c = '#8B89A3', s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.2" fill="none" stroke="${c}" stroke-width="1.5"/><path d="M7,3.8 V7 H10" stroke="${c}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: (c = '#9B8CFF', s = 15) => `<svg width="${s}" height="${s}" viewBox="0 0 15 15" aria-hidden="true"><rect x="1" y="6.3" width="13" height="8.2" rx="2" fill="none" stroke="${c}" stroke-width="1.4"/><path d="M4.3,6.3 V3.9 a3.2,3.2 0 0 1 6.4,0 V6.3" fill="none" stroke="${c}" stroke-width="1.4"/></svg>`,
  key: (c = '#9B8CFF', s = 15) => `<svg width="${s}" height="${s}" viewBox="0 0 15 15" aria-hidden="true"><circle cx="4.5" cy="7.5" r="3.4" fill="none" stroke="${c}" stroke-width="1.4"/><path d="M8.2,7.5 H14.5 M12.2,7.5 V10.3" stroke="${c}" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`,
  trash: (c = '#9B8CFF', s = 15) => `<svg width="${s}" height="${s}" viewBox="0 0 15 15" aria-hidden="true"><path d="M2,4 H13 M3.6,4 V13.2 H11.4 V4 M5.6,2 H9.4" fill="none" stroke="${c}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  eye: (c = '#8B89A3', s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" aria-hidden="true"><path d="M0.6,8 C3,4.4 13,4.4 15.4,8 C13,11.6 3,11.6 0.6,8 Z" fill="none" stroke="${c}" stroke-width="1.4"/><circle cx="8" cy="8" r="2.4" fill="${c}"/></svg>`,
  thumb: (c = '#C9C6E8', up = true, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><g fill="${c}"${up ? '' : ' transform="translate(0,24) scale(1,-1)"'}><path d="M3,10 h4 v11 h-4 z"/><path d="M8.5,10 c0,-3.2 2.4,-4.2 2.4,-6.6 c0,-1.2 1.1,-2.1 2.2,-1.2 c1.2,1 0.5,4.2 0.2,5.4 h4.6 c1.3,0 2.2,1.1 1.8,2.2 l-2.4,7.4 c-0.3,0.9 -1.1,1.5 -2,1.5 h-6.8 z"/></g></svg>`,
  calendar: (c = '#8B89A3', s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" aria-hidden="true"><rect x="1" y="3" width="16" height="14" rx="3" fill="none" stroke="${c}" stroke-width="1.5"/><path d="M1,7 H17 M6,1.5 V4 M12,1.5 V4" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  note: (c = '#6A6890', s = 34) => `<svg width="${s}" height="${s * 1.25}" viewBox="0 0 34 42" aria-hidden="true"><rect x="1" y="1" width="32" height="40" rx="6" fill="none" stroke="${c}" stroke-width="2"/><path d="M9,12 h16 M9,21 h11 M9,30 h6" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`,
};

/* ---------- the shared state ----------
   The server owns the data. S holds what the current screens show, plus a
   few things that exist only in the browser: the draft being typed (it
   reaches the server only on Save, NFR-7), which panel is open, and the
   previous weights so the radar can animate from them. */
export const S = {
  screen: null,
  user: null, //                       /auth/me
  weights: {}, startW: {}, muted: [], // /profile
  prevW: null, //                      weights before the last change, for the animation
  pinZone: null, viewDay: null, //     radar focus; a past day picked on the week strip
};

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

/** Escapes text from a person (an entry, a name) before it goes into HTML. */
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Zones sorted by weight, highest first: [[zone, weight], …] */
export const sorted = (w = S.weights) => Object.entries(w).sort((a, b) => b[1] - a[1]);
/** The three zones the diary is asking about (muted ones never count). */
export const topThree = () => sorted().filter(([z]) => !S.muted.includes(z)).slice(0, 3).map(([z]) => z);

/** Today as YYYY-MM-DD — the server's day (UTC). */
export const todayIso = () => new Date().toISOString().slice(0, 10);
/** "21:40" in the reader's time zone. */
export const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
/** "Wednesday, 18 November" */
export const longDate = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
/** "18 Nov" */
export const shortDate = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Fills S.weights / startW / muted from a /profile response. */
export function applyProfile(profile) {
  S.weights = Object.fromEntries(profile.zones.map((r) => [r.zone.id, r.weight]));
  S.startW = Object.fromEntries(profile.zones.map((r) => [r.zone.id, r.startWeight ?? r.weight]));
  S.muted = profile.zones.filter((r) => r.isMuted).map((r) => r.zone.id);
}

/* ---------- navigation ---------- */
const screens = {}; //  name -> { view, wire, load? }, filled by app.js
const hooks = []; //    run after every render (radar animation, sparks, eye)

export function defineScreen(name, module) { screens[name] = module; }
export function afterRender(fn) { hooks.push(fn); }

/** Draws the current screen from S. Cheap: call it after any change. */
export function render() {
  const nav = $('#nav');
  nav.hidden = !['today', 'profile', 'history', 'settings'].includes(S.screen);
  $$('button', nav).forEach((b) => b.setAttribute('aria-current', b.dataset.go === S.screen ? 'page' : 'false'));
  const screen = screens[S.screen];
  $('#main').innerHTML = screen ? screen.view() : '';
  $$('[data-nav]').forEach((b) => b.addEventListener('click', () => go(b.dataset.nav)));
  document.body.dataset.screen = S.screen;
  document.body.classList.toggle('app-on', ['today', 'profile', 'history', 'settings'].includes(S.screen));
  screen?.wire?.();
  hooks.forEach((fn) => fn());
}

let routing = null;
/** Changes the screen. The address bar follows (#/profile), so reload works. */
export function go(name) {
  if (location.hash !== `#/${name}`) { location.hash = `#/${name}`; return; } // hashchange calls route()
  route(name);
}

/** Decides where the person may be, loads that screen's data, draws it. */
export async function route(requested) {
  let name = requested;
  if (!S.user) name = ['register', 'login', 'gone'].includes(name) ? name : 'register';
  else if (!S.user.onboardingCompleted) name = 'quiz';
  else if (['register', 'login', 'quiz', 'gone'].includes(name) || !screens[name]) name = 'today';
  if (name !== requested && location.hash !== `#/${name}`) { history.replaceState(null, '', `#/${name}`); }

  const ticket = Symbol(name);
  routing = ticket;
  try {
    await screens[name].load?.();
  } catch (error) {
    if (error.status === 401) { S.user = null; return route('login'); }
    if (routing !== ticket) return;
    S.screen = name;
    render();
    notice(error.message);
    return;
  }
  if (routing !== ticket) return; // another navigation started meanwhile
  if (S.screen !== name) { S.pinZone = null; S.viewDay = null; }
  S.screen = name;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/** A message at the top of the screen, for errors from the server. */
export function notice(message, kind = 'e') {
  const box = document.createElement('div');
  box.className = `toast ${kind}`;
  box.setAttribute('role', kind === 'e' ? 'alert' : 'status');
  box.innerHTML = `${kind === 'e' ? ICON.warn() : ICON.info()} <span>${esc(message)}</span>`;
  $('#main').prepend(box);
  setTimeout(() => box.remove(), 7000);
}

/** A modal dialog. Buttons with data-close close it. */
export function openDialog(html) {
  $('#dlgBody').innerHTML = html;
  const d = $('#dlg');
  d.showModal();
  $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => d.close()));
  return d;
}
