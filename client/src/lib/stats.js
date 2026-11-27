/**
 * What follows from the list of entries. Several screens need the same
 * numbers (how often each zone came up), so they are computed once, here.
 */
import { ZONES } from './zones.js';
import { todayIso } from './format.js';

/** An entry "mentions" a zone when the classifier scored it at least this. */
export const MENTION_THRESHOLD = 0.5; // the same rule as the server's insight

/**
 *   mentions     { zone: entries mentioning it in the last 5 weeks }
 *   weekly       { zone: [W1..W5] } — W5 is the most recent 7 days
 *   lastMention  { zone: 'YYYY-MM-DD' of the newest entry mentioning it }
 *   entries35    entries in the last 5 weeks
 * `entries` is newest first.
 */
export function entryStats(entries) {
  const now = Date.parse(`${todayIso()}T00:00:00Z`);
  const daysAgo = (e) => Math.floor((now - Date.parse(`${e.day}T00:00:00Z`)) / 86_400_000); // 0 = today
  const mentions = Object.fromEntries(ZONES.map((z) => [z, 0]));
  const weekly = Object.fromEntries(ZONES.map((z) => [z, [0, 0, 0, 0, 0]]));
  const lastMention = {};
  for (const e of entries) {
    const ago = daysAgo(e);
    for (const z of ZONES) {
      if ((e.scores?.[z] ?? 0) < MENTION_THRESHOLD) continue;
      if (!lastMention[z]) lastMention[z] = e.day;
      if (ago < 35) {
        mentions[z] += 1;
        weekly[z][4 - Math.floor(ago / 7)] += 1;
      }
    }
  }
  return { mentions, weekly, lastMention, entries35: entries.filter((e) => daysAgo(e) < 35).length };
}

/** A /profile response as the screens use it. */
export function fromProfile(profile) {
  return {
    weights: Object.fromEntries(profile.zones.map((r) => [r.zone.id, r.weight])),
    startW: Object.fromEntries(profile.zones.map((r) => [r.zone.id, r.startWeight ?? r.weight])),
    muted: profile.zones.filter((r) => r.isMuted).map((r) => r.zone.id),
  };
}
