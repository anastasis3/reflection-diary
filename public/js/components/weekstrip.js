/**
 * The seven circles above the question on the Today screen.
 *
 * Each circle is one day of the current week. A day with an entry carries a
 * ring in the colour of what that day was about; today is outlined. It is a
 * glance at the week, not a control: tapping a past day is handled by History,
 * where there is room to show it.
 */
import { esc, todayIso } from '../dom.js';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The seven ISO days of the week containing `iso`, Monday first. */
export function weekOf(iso = todayIso()) {
  const date = new Date(`${iso}T12:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/**
 * @param {Array<{day: string, entryCount: number, zones: Array}>} days from the calendar endpoint
 */
export function weekStrip(days, { today = todayIso() } = {}) {
  const week = weekOf(today);
  const byDay = Object.fromEntries((days ?? []).map((d) => [d.day, d]));
  const written = week.filter((d) => byDay[d]?.entryCount > 0).length;

  const circles = week
    .map((iso, i) => {
      const data = byDay[iso];
      const has = (data?.entryCount ?? 0) > 0;
      const colour = data?.zones?.[0]?.colour ?? '#9B8CFF';
      const isToday = iso === today;
      const number = Number(iso.slice(8, 10));

      // A ring drawn as an SVG circle rather than a border, so the colour of
      // the day's zone can be used without fighting the focus outline.
      const ring = has
        ? `<svg class="ring" viewBox="0 0 46 46" aria-hidden="true">
             <circle cx="23" cy="23" r="21" fill="none" stroke="${esc(colour)}" stroke-width="2.5" stroke-opacity="0.9"/>
           </svg>`
        : '';

      return `
        <div class="weekday ${has ? 'has' : ''} ${isToday ? 'today' : ''}">
          <span aria-hidden="true">${LETTERS[i]}</span>
          <span class="circle">${ring}<span>${number}</span></span>
          <span class="sr-only">${esc(iso)}${has ? `, ${data.entryCount} entry` : ', no entry'}${isToday ? ', today' : ''}</span>
        </div>`;
    })
    .join('');

  // The summary sits under the circles on a phone and beside them from 600px;
  // squeezed into a narrow column it wrapped one word per line.
  return `
    <div class="week-block">
      <div class="weekstrip">${circles}</div>
      <div class="week-summary">
        <b>${written} of 7</b>
        <span class="meta">days written this week</span>
      </div>
    </div>`;
}

export default weekStrip;
