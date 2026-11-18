/**
 * S-06 · History: a month of days, the counts per zone, and one day in full.
 *
 *   pills          "All N" and one pill per zone with its count (by the
 *                  entry's main zone); a pill filters the calendar
 *   monthCalendar  the month as a heat map — a dot for every zone recorded
 *                  that day; ‹ › change the month; a day without an entry
 *                  stays empty, the diary never fills it in
 *   dayCard        the questions answered that day, the entries, the
 *                  ratings, and the largest weight change an entry caused
 *   tooltip        hovering a day shows its zones and the start of the entry
 *
 * Data: GET /history/summary, /history/calendar?month=, /history/day/:day,
 * /profile/changes (for "moved" lines). Which of the three questions was
 * the random one is not shown here either.
 */
import { api } from '../api.js';
import { S, ICON, zc, zl, esc, $, $$, render, notice, todayIso, longDate } from '../core.js';
import { loadEntries } from '../data.js';

const H = { month: null, cal: null, summary: null, day: null, dayData: null, filter: null, changes: [] };

const monthName = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shiftMonth = (m, k) => { const d = new Date(`${m}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); };

async function openDay(day) {
  H.day = day;
  H.dayData = day ? await api.day(day) : null;
}

/** The largest change an entry caused on that day, for the "moved" line. */
function movedOn(day) {
  const c = H.changes.filter((x) => x.changedAt.slice(0, 10) === day && x.source === 'learned' && x.oldWeight != null)
    .sort((a, b) => Math.abs(b.newWeight - b.oldWeight) - Math.abs(a.newWeight - a.oldWeight))[0];
  return c ? { label: zl(c.zoneId), from: c.oldWeight, to: c.newWeight } : null;
}

function monthCalendar() {
  const c = H.cal;
  let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<b>${d}</b>`).join('');
  for (let i = 0; i < c.firstWeekday; i += 1) cells += '<span class="mday pad"></span>';
  for (const d of c.days) {
    const zs = d.zones.map((z) => z.id), sel = d.day === H.day, has = d.entryCount > 0;
    const hidden = H.filter && !zs.includes(H.filter);
    const lit = has && !hidden && zs.length;
    const st = lit
      ? `background:color-mix(in srgb, ${zc(zs[0])} ${Math.round(20 + 20 * Math.min(zs.length, 3))}%, transparent);border-color:color-mix(in srgb, ${zc(zs[0])} 55%, transparent)`
      : '';
    const dots = (hidden ? [] : zs).slice(0, 3).map((z) => `<i style="background:${zc(z)}"></i>`).join('');
    cells += `<button class="mday ${has && !hidden ? 'has' : 'none'} ${sel ? 'sel' : ''}" style="${st}"
      data-day="${d.day}" ${has ? '' : 'disabled'} aria-pressed="${sel}"
      aria-label="${longDate(d.day)}${has ? `, ${zs.map(zl).join(', ') || 'not classified yet'}` : ', no entry'}"><u>${d.dayOfMonth}</u><em>${dots}</em></button>`;
  }
  const isCurrent = H.month === todayIso().slice(0, 7);
  return `<div class="card">
    <div class="spread"><b style="font-size:15px">${monthName(H.month)}</b>
      <span class="meta"><button class="linkbtn" id="prevM" aria-label="Previous month">‹</button>
        <button class="linkbtn" id="thisM" ${isCurrent ? 'disabled' : ''}>today</button>
        <button class="linkbtn" id="nextM" aria-label="Next month" ${isCurrent ? 'disabled' : ''}>›</button></span></div>
    <div class="mcal">${cells}</div>
    <div class="spread meta" style="margin-top:10px"><span>a dot for every zone the diary recorded</span>
      <span class="scale">fewer ${[0.2, 0.4, 0.6, 0.8].map((o) => `<i style="opacity:${o}"></i>`).join('')} more</span></div>
  </div>`;
}

function dayCard() {
  if (!H.day || !H.dayData) {
    return `<div class="card"><div class="empty">${ICON.note()}
      <p style="font-weight:700;font-size:18px;margin:10px 0 4px">Pick a day</p>
      <p style="color:var(--txt2);font-size:14px;margin:0">Days with an entry are coloured. Days without one stay empty — the diary never fills them in for you.</p></div></div>`;
  }
  const { entries, questions } = H.dayData;
  if (entries.length === 0) {
    return `<div class="card"><div class="empty">${ICON.note()}
      <p style="font-weight:700;font-size:18px;margin:10px 0 4px">Nothing written on ${longDate(H.day)}</p>
      <p style="color:var(--txt2);font-size:14px;margin:0">Days without an entry stay empty — the diary never fills them in for you.</p></div></div>`;
  }
  const zs = [...new Set(entries.filter((e) => e.zone).map((e) => e.zone.id))];
  const moved = movedOn(H.day);
  const blocks = entries.slice().reverse().map((e) => {
    const qn = questions.find((x) => x.entryId === e.id) ?? (e.prompt ? { text: e.prompt.text, relevanceRating: e.prompt.relevanceRating } : null);
    return `${qn ? `<p class="lbl" style="margin:14px 0 6px">THE QUESTION</p>
      <p style="font-size:15px;font-weight:600;color:var(--txt2);margin:0 0 12px">${esc(qn.text)}</p>` : '<p class="lbl" style="margin:14px 0 6px">A FREE ENTRY</p>'}
      <blockquote>${esc(e.text)}</blockquote>
      <p class="meta" style="margin:6px 0 0">${qn ? (qn.relevanceRating == null ? 'Not rated' : `You rated this question ${qn.relevanceRating ? 'relevant' : 'not relevant'}`) : ''}${e.status === 'classification_failed' ? ' · topics pending' : ''}</p>`;
  }).join('<div class="hr"></div>');
  return `<div class="card glow">
    <b style="font-size:17px">${longDate(H.day)}</b>
    <div class="row" style="flex-wrap:wrap;margin-top:10px">${zs.map((z) => `<span class="zone" style="color:${zc(z)}"><i></i>${zl(z)}</span>`).join('')}</div>
    ${blocks}
    ${moved ? `<div class="hr"></div><p style="margin:4px 0 0;font-size:13px"><span style="color:var(--txt2)">${esc(moved.label)}</span>
      <b style="color:var(--ok)">${moved.from.toFixed(2)} → ${moved.to.toFixed(2)}</b></p>` : ''}
  </div>`;
}

function showTip(el, day) {
  const d = H.cal.days.find((x) => x.day === day);
  if (!d?.entryCount) return;
  const first = S.entries.find((e) => e.day === day);
  let t = document.getElementById('tip');
  if (!t) { t = document.createElement('div'); t.id = 'tip'; t.className = 'tip'; t.setAttribute('role', 'presentation'); document.body.appendChild(t); }
  t.innerHTML = `<div class="tz">${d.zones.map((z) => `<span class="zone" style="color:${zc(z.id)}"><i></i>${zl(z.id)}</span>`).join('')}</div>
    ${first ? `${first.prompt?.text ? `<p class="tq">${esc(first.prompt.text.slice(0, 58))}…</p>` : ''}<p>${esc(first.text.split(/(?<=\.)\s/).slice(0, 2).join(' ').slice(0, 220))}</p>` : ''}
    <div class="td">${d.entryCount} ${d.entryCount === 1 ? 'entry' : 'entries'} · click to open the day</div>`;
  const r = el.getBoundingClientRect();
  t.style.left = `${Math.min(Math.max(r.left + r.width / 2 - 140, 12), innerWidth - 292)}px`;
  t.style.top = '0px'; t.style.visibility = 'hidden'; t.classList.add('on');
  const h = t.offsetHeight;
  t.style.top = `${r.bottom + 10 + h > innerHeight - 12 ? Math.max(12, r.top - 10 - h) : r.bottom + 10}px`;
  t.style.visibility = 'visible';
}
const hideTip = () => document.getElementById('tip')?.classList.remove('on');

export const history = {
  async load() {
    H.month = H.month ?? todayIso().slice(0, 7);
    const [summary, cal, changes] = await Promise.all([
      api.historySummary(), api.calendar(H.month), api.changes().then((r) => r.changes), loadEntries(),
    ]);
    H.summary = summary; H.cal = cal; H.changes = changes;
    if (!H.day) {
      // open the most recent day with an entry in this month
      const last = [...cal.days].reverse().find((d) => d.entryCount > 0);
      H.day = last?.day ?? null;
    }
    H.dayData = H.day ? await api.day(H.day) : null;
  },

  view() {
    const s = H.summary;
    const pills = `<button class="pill" data-zone="" aria-pressed="${!H.filter}">All <b>${s.total}</b></button>${
      s.zones.map(({ zone, count }) => `<button class="pill ${count ? '' : 'empty'}" data-zone="${zone.id}" aria-pressed="${H.filter === zone.id}"><i style="width:8px;height:8px;border-radius:50%;background:${count ? zc(zone.id) : 'var(--muted)'};display:inline-block"></i>${zl(zone.id)} <b>${count}</b></button>`).join('')}`;
    const none = H.filter && !s.zones.find((z) => z.zone.id === H.filter && z.count);
    const body = none
      ? `<div class="card"><div class="empty">${ICON.note()}
        <p style="font-weight:700;font-size:18px;margin:10px 0 4px">Nothing about ${zl(H.filter)} yet</p>
        <p style="color:var(--txt2);font-size:14px;margin:0 0 18px">This zone is in your profile but no entry is mainly about it. The diary offers a quieter zone now and then, so it may come up soon.</p>
        <div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn ghost" id="clear">Show all entries</button>
          <button class="btn" data-nav="today">Write today's entry</button></div></div></div>`
      : `<div class="histgrid">${monthCalendar()}${dayCard()}</div>`;
    const first = S.entries.at(-1)?.day;
    return `<h1>History</h1><p class="sub">${s.total} ${s.total === 1 ? 'entry' : 'entries'}${first ? ` since ${longDate(first).replace(/^\w+, /, '')}` : ''} · pick a day to see what it was about</p>
    <div class="pills">${pills}</div>${body}`;
  },

  wire() {
    $$('.mday[data-day]').forEach((b) => {
      b.addEventListener('click', async () => {
        hideTip();
        try { await openDay(b.dataset.day); } catch (e) { notice(e.message); }
        render();
        $('.mday.sel')?.focus();
      });
      b.addEventListener('mouseenter', () => showTip(b, b.dataset.day));
      b.addEventListener('focus', () => showTip(b, b.dataset.day));
      b.addEventListener('mouseleave', hideTip);
      b.addEventListener('blur', hideTip);
    });
    const toMonth = async (m) => {
      H.month = m;
      try { H.cal = await api.calendar(m); await openDay(null); } catch (e) { notice(e.message); }
      render();
    };
    $('#prevM')?.addEventListener('click', () => toMonth(shiftMonth(H.month, -1)));
    $('#nextM')?.addEventListener('click', () => toMonth(shiftMonth(H.month, 1)));
    $('#thisM')?.addEventListener('click', () => toMonth(todayIso().slice(0, 7)));
    $$('.pill').forEach((b) => b.addEventListener('click', () => { H.filter = b.dataset.zone || null; render(); }));
    $('#clear')?.addEventListener('click', () => { H.filter = null; render(); });
  },
};
