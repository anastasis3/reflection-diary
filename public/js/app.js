/**
 * Start-up of the interface.
 *
 *   1. register every screen with the core (name → view / wire / load)
 *   2. after every render: animate the radar, light its sparks, open or
 *      close the eye intro (only while the quiz is the current screen)
 *   3. paint the haze once, restore the session from the stored token,
 *      then route to the screen in the address bar (#/today …)
 *
 * The files, one per concern:
 *   core.js      state S, zones, icons, helpers, render / go / route
 *   api.js       every call to the server
 *   data.js      shared loaders: profile, entries (+ mentions), the week
 *   radar.js     the radar chart and its animations
 *   effects.js   the haze and the rating burst
 *   eye.js       the Three.js eye intro of the quiz
 *   screens/     auth (register, log in, deleted), quiz, today, profile,
 *                history, settings
 */
import { api, token } from './api.js';
import { S, $, defineScreen, afterRender, route, go } from './core.js';
import { animateRadar, wireZoneFocus, radarSparks } from './radar.js';
import { paintHaze } from './effects.js';
import { register, login, gone } from './screens/auth.js';
import { quiz } from './screens/quiz.js';
import { today } from './screens/today.js';
import { profile } from './screens/profile.js';
import { history } from './screens/history.js';
import { settings } from './screens/settings.js';

Object.entries({ register, login, gone, quiz, today, profile, history, settings })
  .forEach(([name, screen]) => defineScreen(name, screen));

afterRender(() => {
  wireZoneFocus();
  animateRadar();
  radarSparks();
  // S-02 opens as the 3D intro when WebGL is available; "Classic quiz" falls back to the card.
  window.__eyeWanted = S.screen === 'quiz' && !S.eyeOff;
  if (window.EyeIntro) window.EyeIntro.sync();
});

$('#nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-go]'); if (b) go(b.dataset.go); });
$('#brand').addEventListener('click', () => go('today'));
window.addEventListener('hashchange', () => route(location.hash.replace(/^#\/?/, '') || 'today'));

paintHaze();

async function start() {
  if (token.get()) {
    try { S.user = (await api.me()).user; } catch { token.clear(); }
  }
  await route(location.hash.replace(/^#\/?/, '') || (S.user ? 'today' : 'register'));
}
start();
