/**
 * Date helpers.
 *
 * The diary is organised by calendar day: one question a day, one row per zone
 * per day in the weight history, a calendar of days in History. Every one of
 * those needs the same notion of "which day is this", so it is defined once
 * here as an ISO date string (YYYY-MM-DD) in UTC.
 */

/** YYYY-MM-DD for a Date (or for now). */
export function toDay(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

/** YYYY-MM-DD of the day `n` days before `date`. */
export function daysAgo(n, date = new Date()) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - n);
  return toDay(d);
}

/** Whole days between two YYYY-MM-DD strings (b - a). */
export function dayDiff(a, b) {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** The list of days from `from` to `to` inclusive, as YYYY-MM-DD. */
export function dayRange(from, to) {
  const days = [];
  const count = dayDiff(from, to);
  for (let i = 0; i <= count; i += 1) {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(toDay(d));
  }
  return days;
}

/** True when `value` looks like YYYY-MM-DD and is a real date. */
export function isDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && toDay(parsed) === value;
}

export default { toDay, daysAgo, dayDiff, dayRange, isDay };
