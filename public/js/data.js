/**
 * Loading shared data from the API into S.
 *
 * Several screens need the same numbers (the weights, the list of entries,
 * how often each zone came up), so they are loaded here once per visit to a
 * screen and computed the same way everywhere.
 */
import { api } from './api.js';
import { S, ZONES, applyProfile, todayIso } from './core.js';

/** An entry "mentions" a zone when the classifier scored it at least this. */
export const MENTION_THRESHOLD = 0.5; // same rule as the server's insight

/** The nine weights, their starting values and the muted zones. */
export async function loadProfile() {
  applyProfile(await api.profile());
}

/**
 * Every entry of the account, and what follows from them:
 *   S.entries     newest first
 *   S.mentions    { zone: entries mentioning it in the last 5 weeks }
 *   S.weekly      { zone: [W1..W5] } — W5 is the most recent 7 days
 *   S.lastMention { zone: 'YYYY-MM-DD' of the newest entry mentioning it }
 * A pilot account has at most a few hundred entries, so one request is fine.
 */
export async function loadEntries() {
  const { entries } = await api.entries();
  S.entries = entries;
  const now = Date.parse(`${todayIso()}T00:00:00Z`);
  S.mentions = Object.fromEntries(ZONES.map((z) => [z, 0]));
  S.weekly = Object.fromEntries(ZONES.map((z) => [z, [0, 0, 0, 0, 0]]));
  S.lastMention = {};
  for (const e of entries) {
    const ago = Math.floor((now - Date.parse(`${e.day}T00:00:00Z`)) / 86_400_000); // 0 = today
    for (const z of ZONES) {
      if ((e.scores?.[z] ?? 0) < MENTION_THRESHOLD) continue;
      if (!S.lastMention[z]) S.lastMention[z] = e.day;
      if (ago < 35) {
        S.mentions[z] += 1;
        S.weekly[z][4 - Math.floor(ago / 7)] += 1;
      }
    }
  }
  S.entries35 = entries.filter((e) => (now - Date.parse(`${e.day}T00:00:00Z`)) / 86_400_000 < 35).length;
}

/** The profile on each of the last seven days, for the week strip. */
export async function loadWeek() {
  S.week = await api.snapshots(7);
}
