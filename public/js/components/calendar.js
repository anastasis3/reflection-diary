/**
 * The month calendar on the History screen.
 *
 * A heat map of real days: a solid square with coloured dots where something
 * was written, a dashed outline where nothing was. The empty days are drawn
 * rather than skipped, because the gaps are part of what a person is looking
 * for when they open History.
 */
import { esc, todayIso } from '../dom.js';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * @param {{month: string, daysInMonth: number, firstWeekday: number, days: Array}} data
 * @param {string|null} selected the day currently open beside the calendar
 */
export function monthCalendar(data, selected = null) {
  const today = todayIso();
  const title = new Date(`${data.month}-01T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const headers = WEEKDAYS.map((d, i) => `<b aria-hidden="true" data-i="${i}">${d}</b>`).join('');
  const padding = Array.from({ length: data.firstWeekday }, () => '<span class="month-day pad"></span>').join('');

  const cells = data.days
    .map((day) => {
      const has = day.entryCount > 0;
      const dots = day.zones
        .map((z) => `<i style="background:${esc(z.colour)}"></i>`)
        .join('');
      const about = day.zones.map((z) => z.name).join(', ');

      return `
        <button class="month-day ${has ? 'has' : ''} ${day.day === today ? 'today' : ''}"
                data-day="${esc(day.day)}"
                aria-pressed="${day.day === selected}"
                ${has ? '' : 'disabled'}
                aria-label="${esc(day.day)}${has ? `, ${day.entryCount} entry about ${esc(about)}` : ', nothing written'}">
          <span aria-hidden="true">${day.dayOfMonth}</span>
          ${has ? `<span class="dots" aria-hidden="true">${dots}</span>` : ''}
        </button>`;
    })
    .join('');

  return `
    <div class="card">
      <div class="month-head">
        <span>${esc(title)}</span><i></i>
        <button class="linkbtn quiet" data-month-step="-1" aria-label="Previous month">‹</button>
        <button class="linkbtn quiet" data-month-step="1" aria-label="Next month">›</button>
      </div>
      <div class="month-grid" role="grid" aria-label="Entries in ${esc(title)}">
        ${headers}${padding}${cells}
      </div>
      <p class="meta" style="margin-top:var(--gap-3)">
        A dot for each topic the day was about. Pick a day to read it.
      </p>
    </div>`;
}

/** Shifts a YYYY-MM string by `step` months. */
export function shiftMonth(month, step) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + step, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default monthCalendar;
