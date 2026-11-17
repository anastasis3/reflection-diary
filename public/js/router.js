/**
 * The hash router and the navigation rules.
 *
 * A hash router rather than the History API, for one practical reason: the
 * whole interface is static files, so #/profile is served by the same
 * index.html with no server rewrite rule to configure or get wrong.
 *
 * The guards below are the user flow from the UX specification, written once:
 *
 *   not signed in            -> register or log in, nothing else
 *   signed in, quiz unfinished -> the quiz, whatever was asked for
 *   signed in, quiz finished   -> the screen that was asked for
 *
 * They exist for the person's benefit, not for security. Every screen's data
 * is protected on the server by the token and by row level security; a guard
 * that is bypassed shows an empty screen, never someone else's entries.
 */
import { state } from './state.js';
import { toast } from './components/toast.js';

const PUBLIC = new Set(['register', 'login']);

const routes = {
  register: () => import('./screens/register.js'),
  login: () => import('./screens/login.js'),
  quiz: () => import('./screens/quiz.js'),
  today: () => import('./screens/today.js'),
  profile: () => import('./screens/profile.js'),
  history: () => import('./screens/history.js'),
  settings: () => import('./screens/settings.js'),
};

/** '#/profile' -> 'profile' */
function currentName() {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return routes[hash] ? hash : null;
}

export function navigate(hash) {
  if (window.location.hash === hash) {
    handleRoute(); // same hash: no hashchange event, so render by hand
    return;
  }
  window.location.hash = hash;
}

/** Decides where the person may actually be, given who they are. */
function resolve(requested) {
  const signedIn = Boolean(state.user);

  if (!signedIn) return PUBLIC.has(requested) ? requested : 'login';
  if (!state.user.onboardingCompleted) return 'quiz';
  if (PUBLIC.has(requested) || requested === 'quiz') return 'today';
  return requested;
}

function updateNav(screen) {
  const hidden = !state.user || !state.user.onboardingCompleted;
  for (const id of ['topnav', 'bottomnav']) {
    const nav = document.getElementById(id);
    if (!nav) continue;
    nav.hidden = hidden;
    nav.querySelectorAll('a').forEach((link) => {
      const active = link.dataset.screen === screen;
      link.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }
}

// A redirect sets the hash, which fires hashchange, which routes again. If two
// guards ever disagreed, that would spin for ever and lock the tab up. The
// counter bounds it: a handful of redirects is normal, a hundred is a bug, and
// the screen is rendered as asked rather than freezing the browser.
let redirects = 0;

export async function handleRoute() {
  const main = document.getElementById('main');
  const requested = currentName() ?? (state.user ? 'today' : 'register');
  const screen = resolve(requested);

  // Keep the address bar honest when a guard redirected.
  if (screen !== requested && redirects < 5) {
    redirects += 1;
    window.location.hash = `#/${screen}`;
    return; // the hashchange this causes renders the screen
  }
  redirects = 0;

  updateNav(screen);
  main.setAttribute('aria-busy', 'true');
  document.body.dataset.screen = screen;

  try {
    const module = await routes[screen]();
    await module.render(main);
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      navigate('#/login');
      return;
    }
    main.innerHTML = `
      <div class="card danger">
        <b style="color:var(--error)">This screen could not be loaded</b>
        <p style="font-size:14px;color:var(--text-2);margin-top:var(--gap-2)">${error.message}</p>
        <p style="margin-top:var(--gap-3)"><button class="btn ghost" onclick="location.reload()">Try again</button></p>
      </div>`;
    toast(error.message, 'warn');
  } finally {
    main.setAttribute('aria-busy', 'false');
  }

  // Move focus to the start of the new screen, so a keyboard or screen-reader
  // user is not left where the previous screen's button used to be.
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);

  // One listener for every `data-go` button on every screen, so no screen has
  // to know how navigation works.
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-go]');
    if (!target) return;
    event.preventDefault();
    navigate(target.dataset.go);
  });

  return handleRoute();
}

export default { startRouter, navigate, handleRoute };
