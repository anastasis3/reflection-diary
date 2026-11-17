/**
 * The History screen (S-06): a month of days, the counts per zone, and what
 * one chosen day was about.
 *
 * The calendar is a heat map of real days. A day with no entry is drawn as an
 * empty outline rather than being skipped, because the gaps are part of what
 * the participant is looking at.
 */
import { getZone, ZONE_IDS } from '../data/zones.js';
import * as entriesRepo from '../repositories/entries.repo.js';
import * as promptsShownRepo from '../repositories/promptsShown.repo.js';
import { getPrompt } from '../data/prompts.js';
import { present } from './entries.service.js';
import ApiError from '../utils/ApiError.js';
import { isDay } from '../utils/dates.js';

/** How many entries fall into each zone, most first. Drives the filter pills. */
export function zoneCounts(userId) {
  const entries = entriesRepo.listForUser(userId);
  const counts = Object.fromEntries(ZONE_IDS.map((id) => [id, 0]));

  for (const entry of entries) {
    const zoneId = entriesRepo.topZoneOf(entry.id);
    if (zoneId) counts[zoneId] += 1;
  }

  return {
    total: entries.length,
    zones: ZONE_IDS.map((id) => ({ zone: getZone(id), count: counts[id] }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * One calendar month.
 *
 * @param {string} month YYYY-MM
 */
export function calendar(userId, month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw ApiError.badRequest('The month must be written as YYYY-MM, for example 2026-11.');
  }

  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  // Monday = 0, matching the calendar grid in the mockups.
  const firstWeekday = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;

  const entries = entriesRepo.listForUser(userId, {
    from: `${month}-01`,
    to: `${month}-${String(daysInMonth).padStart(2, '0')}`,
  });

  const byDay = new Map();
  for (const entry of entries) {
    const day = entry.createdAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    const zoneId = entriesRepo.topZoneOf(entry.id);
    if (zoneId) byDay.get(day).push(zoneId);
  }

  const days = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    const day = `${month}-${String(d).padStart(2, '0')}`;
    const zoneIds = byDay.get(day) ?? [];
    days.push({
      day,
      dayOfMonth: d,
      entryCount: zoneIds.length,
      // At most three dots are drawn under a day in the mockups.
      zones: [...new Set(zoneIds)].slice(0, 3).map((id) => getZone(id)),
    });
  }

  return { month, daysInMonth, firstWeekday, days };
}

/** Everything about one day: the question, the entry, the rating, the movement. */
export function day(userId, isoDay) {
  if (!isDay(isoDay)) {
    throw ApiError.badRequest('The day must be written as YYYY-MM-DD.');
  }

  const entries = entriesRepo.listForUser(userId, { from: isoDay, to: isoDay });
  const shown = promptsShownRepo.findForDay(userId, isoDay);

  return {
    day: isoDay,
    question: shown
      ? {
          promptShownId: shown.id,
          text: getPrompt(shown.promptId)?.text ?? null,
          zone: getZone(shown.zoneId),
          selectionReason: shown.selectionReason,
          relevanceRating: shown.relevanceRating,
          wasAnswered: shown.wasAnswered,
        }
      : null,
    entries: entries.map(present),
  };
}

export default { zoneCounts, calendar, day };
