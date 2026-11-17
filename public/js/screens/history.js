/**
 * S-06 — History.
 *
 * A month calendar on one side and the chosen day on the other, with filter
 * pills above. Filtering by a zone with nothing in it is a real state and gets
 * a real screen (S-06b) rather than an empty list: it explains why the zone is
 * in the profile but has no entries.
 */
import { api } from '../api.js';
import { esc, clock, longDate, todayIso } from '../dom.js';
import icons from '../icons.js';
import { monthCalendar, shiftMonth } from '../components/calendar.js';
import { toast } from '../components/toast.js';

export async function render(root) {
  root.innerHTML = `<p class="loading">Loading your history…</p>`;

  let month = todayIso().slice(0, 7);
  let filter = null;
  let selectedDay = null;

  let [summary, calendar] = await Promise.all([api.historySummary(), api.calendar(month)]);
  let dayData = null;

  function pills() {
    const all = `
      <button class="pill" data-zone="" aria-pressed="${filter === null}">
        All <b>${summary.total}</b>
      </button>`;

    const rest = summary.zones
      .map(({ zone, count }) => `
        <button class="pill ${count ? '' : 'empty'}" data-zone="${esc(zone.id)}"
                aria-pressed="${filter === zone.id}">
          <i class="dot" style="background:${count ? esc(zone.colour) : 'var(--muted)'}"></i>
          ${esc(zone.name)} <b>${count}</b>
        </button>`)
      .join('');

    return `<div class="pills">${all}${rest}</div>`;
  }

  function dayCard() {
    if (!dayData) {
      return `
        <div class="card">
          <div class="empty-state">
            ${icons.note('#6A6890')}
            <h2>Pick a day</h2>
            <p>Choose a day with a dot on it to see the question, what you wrote and how you rated it.</p>
          </div>
        </div>`;
    }

    const question = dayData.question;
    return `
      <div class="card">
        <div class="spread">
          <b style="font-size:15px">${esc(longDate(dayData.day))}</b>
          ${question?.relevanceRating != null
            ? `<span class="chip">${icons.thumb('#8B89A3', question.relevanceRating)} ${question.relevanceRating ? 'relevant' : 'not relevant'}</span>`
            : '<span class="chip">not rated</span>'}
        </div>

        ${question
          ? `<p class="meta" style="margin-top:var(--gap-3)">The question that day</p>
             <blockquote>${esc(question.text)}</blockquote>`
          : ''}

        ${dayData.entries.length === 0
          ? `<p class="meta" style="margin-top:var(--gap-3)">Nothing was written on this day.</p>`
          : dayData.entries.map((entry) => `
              <div class="day-entry">
                <div class="spread">
                  ${entry.zone
                    ? `<span class="zone-badge" style="color:${esc(entry.zone.colour)}"><i class="dot"></i>${esc(entry.zone.name)}</span>`
                    : `<span class="chip">${icons.clock()} no topics</span>`}
                  <span class="meta">${esc(clock(entry.createdAt))}</span>
                </div>
                <p style="color:var(--text-2);margin-top:var(--gap-2);white-space:pre-wrap">${esc(entry.text)}</p>
              </div>`).join('')}
      </div>`;
  }

  function emptyZone() {
    const zone = summary.zones.find((z) => z.zone.id === filter)?.zone;
    return `
      <div class="card">
        <div class="empty-state">
          ${icons.note('#6A6890')}
          <h2>Nothing about ${esc(zone?.name ?? filter)} yet</h2>
          <p>
            This zone is in your profile but has no entries. The diary asks most about the zones
            you already write about, so it may come up soon — or raise it yourself in Profile.
          </p>
          <div class="row" style="justify-content:center">
            <button class="btn ghost" data-zone="">Show all entries</button>
            <button class="btn" data-go="#/today">Write today's entry</button>
          </div>
        </div>
      </div>`;
  }

  async function filteredList() {
    const { entries } = await api.entries({ zone: filter });
    if (entries.length === 0) return emptyZone();

    return `
      <div class="card">
        ${entries.map((entry) => `
          <div class="day-entry">
            <div class="spread">
              <span class="zone-badge" style="color:${esc(entry.zone?.colour ?? '#9B8CFF')}">
                <i class="dot"></i>${esc(entry.zone?.name ?? 'no topics')}
              </span>
              <span class="meta">${esc(longDate(entry.day))}</span>
            </div>
            <p style="color:var(--text-2);margin-top:var(--gap-2);white-space:pre-wrap">${esc(entry.text)}</p>
          </div>`).join('')}
      </div>`;
  }

  async function draw() {
    const body = filter
      ? await filteredList()
      : `<div class="history-grid">${monthCalendar(calendar, selectedDay)}${dayCard()}</div>`;

    root.innerHTML = `
      <section>
        <div class="page-head">
          <h1>History</h1>
          <p class="sub">${summary.total} ${summary.total === 1 ? 'entry' : 'entries'} · pick a day to see what it was about</p>
        </div>
        ${pills()}
        ${body}
      </section>`;

    wire();
  }

  function wire() {
    root.querySelectorAll('[data-zone]').forEach((pill) => {
      pill.addEventListener('click', () => {
        filter = pill.dataset.zone || null;
        selectedDay = null;
        dayData = null;
        draw();
      });
    });

    root.querySelectorAll('[data-month-step]').forEach((button) => {
      button.addEventListener('click', async () => {
        month = shiftMonth(month, Number(button.dataset.monthStep));
        selectedDay = null;
        dayData = null;
        try {
          calendar = await api.calendar(month);
          draw();
        } catch (error) {
          toast(error.message, 'warn');
        }
      });
    });

    root.querySelectorAll('[data-day]').forEach((cell) => {
      cell.addEventListener('click', async () => {
        selectedDay = cell.dataset.day;
        try {
          dayData = await api.day(selectedDay);
          draw();
        } catch (error) {
          toast(error.message, 'warn');
        }
      });
    });
  }

  await draw();
}

export default { render };
