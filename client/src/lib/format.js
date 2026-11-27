/** Dates and small helpers shared by the screens. */

/** Today as YYYY-MM-DD — the server's day (UTC). */
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** "21:40" in the reader's time zone. */
export const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "Wednesday, 18 November" */
export const longDate = (day) => new Date(`${day}T12:00:00Z`)
  .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** "18 Nov" */
export const shortDate = (day) => new Date(`${day}T12:00:00Z`)
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "Wednesday" */
export const weekday = (day) => new Date(`${day}T12:00:00Z`)
  .toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });

export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
