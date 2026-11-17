/**
 * What the front-end keeps in memory between screens.
 *
 * Deliberately small. The server owns the data; this holds only what would
 * otherwise be fetched again on every navigation (the signed-in user, the
 * zone catalogue) and the one thing the server must not hold yet — the draft
 * of an entry that has not been saved.
 */
import { api, token } from './api.js';

export const state = {
  user: null,
  zones: [],
  zonesById: {},
};

/** Fetches the nine zones once and indexes them by id. */
export async function loadZones() {
  if (state.zones.length > 0) return state.zones;
  const { zones } = await api.zones();
  state.zones = zones;
  state.zonesById = Object.fromEntries(zones.map((z) => [z.id, z]));
  return zones;
}

export const zone = (id) =>
  state.zonesById[id] ?? { id, name: id, short: id, colour: '#9B8CFF' };

/** Restores the session from the stored token, if there is one. */
export async function restoreSession() {
  if (!token.get()) return null;
  try {
    const { user } = await api.me();
    state.user = user;
    return user;
  } catch {
    token.clear(); // expired or revoked
    state.user = null;
    return null;
  }
}

export function signIn({ user, token: value }) {
  token.set(value);
  state.user = user;
}

export function signOut() {
  token.clear();
  state.user = null;
}

/* ---------------------------------------------------------------------------
   The draft of an unsaved entry.

   It is kept in this browser only. Nothing is sent anywhere while the person
   is typing — the text reaches the server when they press Save, and the model
   only after that (NFR-7). The promise made on the registration screen is kept
   here, in the one place that could break it.
   --------------------------------------------------------------------------- */
const DRAFT_KEY = 'reflection-diary.draft';

export const draft = {
  read() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // A draft from another day belongs to another question: drop it.
      return parsed.day === new Date().toISOString().slice(0, 10) ? parsed : null;
    } catch {
      return null;
    }
  },
  write(text) {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ text, day: new Date().toISOString().slice(0, 10) }),
      );
    } catch {
      /* private mode or a full quota: the draft is a convenience, not a feature */
    }
  },
  clear() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
  },
};

export default state;
