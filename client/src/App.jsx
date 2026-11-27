/**
 * The diary: the top bar, the navigation, and the current screen.
 *
 * The address bar holds the screen (#/today, #/profile …), so reload and the
 * Back button work. Which screens a person may see depends on who they are:
 *   not signed in            register, log in, the page after deletion
 *   signed in, no quiz yet   the quiz
 *   signed in                today, profile, history, settings
 * Any other address is replaced by the right one.
 *
 * Each screen loads its own data (see state/useLoad.jsx); the data several
 * screens share lives in state/DiaryContext.jsx.
 */
import { useEffect, useState } from 'react';
import { api, token } from './lib/api.js';
import { useDiary } from './state/DiaryContext.jsx';
import { go } from './state/nav.js';
import Haze from './components/Haze.jsx';
import { Notices } from './components/ui.jsx';
import { Register, Login, Gone } from './screens/Auth.jsx';
import Quiz from './screens/quiz/Quiz.jsx';
import Today from './screens/Today.jsx';
import Profile from './screens/Profile.jsx';
import History from './screens/History.jsx';
import Settings from './screens/Settings.jsx';

const SCREENS = { register: Register, login: Login, gone: Gone, quiz: Quiz, today: Today, profile: Profile, history: History, settings: Settings };
const APP_SCREENS = ['today', 'profile', 'history', 'settings'];
const NAV = [['today', 'Today'], ['profile', 'Profile'], ['history', 'History'], ['settings', 'Settings']];

const fromHash = () => location.hash.replace(/^#\/?/, '');

/** Where the person may be, given where they asked to go. */
function allowed(requested, user) {
  if (!user) return ['register', 'login', 'gone'].includes(requested) ? requested : 'register';
  if (!user.onboardingCompleted) return 'quiz';
  return APP_SCREENS.includes(requested) ? requested : 'today';
}

export default function App() {
  const { user, setUser, notices } = useDiary();
  const [booted, setBooted] = useState(false);
  const [requested, setRequested] = useState(fromHash);

  // restore the session from the stored token
  useEffect(() => {
    (async () => {
      if (token.get()) {
        try { setUser((await api.me()).user); } catch { token.clear(); }
      }
      setBooted(true);
    })();
  }, [setUser]);

  useEffect(() => {
    const onHash = () => setRequested(fromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const screen = allowed(requested || (user ? 'today' : 'register'), user);

  useEffect(() => {
    if (!booted) return;
    if (location.hash !== `#/${screen}`) history.replaceState(null, '', `#/${screen}`);
    document.body.dataset.screen = screen;
    document.body.classList.toggle('app-on', APP_SCREENS.includes(screen));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [booted, screen]);

  const Screen = SCREENS[screen];
  return (
    <>
      <Haze />
      <div className="wrap">
        <div className="app">
          <div className="topbar">
            <span className="brand" onClick={() => go('today')}>reflection diary</span>
            <nav id="nav" aria-label="Main" hidden={!APP_SCREENS.includes(screen)}>
              {NAV.map(([name, label]) => (
                <button key={name} aria-current={screen === name ? 'page' : 'false'} onClick={() => go(name)}>{label}</button>
              ))}
            </nav>
          </div>
          <main id="main" aria-live="polite" tabIndex={-1}>
            <Notices notices={notices} />
            {booted ? <Screen key={screen} /> : <p className="sub">Loading…</p>}
          </main>
        </div>
      </div>
    </>
  );
}
