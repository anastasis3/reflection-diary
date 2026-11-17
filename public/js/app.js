/**
 * Start-up.
 *
 * Three steps, in order: fill in the navigation icons, work out who is signed
 * in, then hand over to the router. Nothing else happens here — every screen
 * loads itself when it is first visited (the router imports them lazily), so
 * the first paint does not wait for code that may never be needed.
 */
import { restoreSession, loadZones } from './state.js';
import { startRouter } from './router.js';
import icons from './icons.js';

function paintNavIcons() {
  document.querySelectorAll('.bottomnav .ico').forEach((slot) => {
    const draw = icons[slot.dataset.icon];
    if (draw) slot.innerHTML = draw('currentColor', 20);
  });
}

async function start() {
  paintNavIcons();

  // The zone catalogue is public and tiny; fetching it here means no screen
  // has to wait for it later. A failure is not fatal — the screens that need
  // a zone get it from the API response they are already reading.
  await Promise.allSettled([restoreSession(), loadZones()]);

  await startRouter();
}

start();
