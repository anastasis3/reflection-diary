/**
 * S-06 · History: a month of days, the counts per zone, and one day in full.
 *
 *   pills      "All N" and one pill per zone with its count (by the entry's
 *              main zone); a pill filters the calendar
 *   calendar   the month as a heat map — a dot for every zone recorded that
 *              day; ‹ › change the month; a day without an entry stays
 *              empty, the diary never fills it in
 *   day card   the questions answered that day, the entries, the ratings,
 *              and the largest weight change an entry caused
 *   tooltip    hovering or focusing a day shows its zones and the start of
 *              the entry
 *
 * Data: GET /history/summary, /history/calendar?month=, /history/day/:day,
 * /profile/changes (for the "moved" line). Which of the three questions was
 * the random one is not shown here either.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api.js';
import { zc, zl } from '../lib/zones.js';
import { todayIso, longDate } from '../lib/format.js';
import { useDiary } from '../state/DiaryContext.jsx';
import { useLoad, LoadState } from '../state/useLoad.jsx';
import { go } from '../state/nav.js';
import { ZoneTag } from '../components/ui.jsx';
import { Note } from '../components/Icon.jsx';

const monthName = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shiftMonth = (m, k) => { const d = new Date(`${m}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); };
const thisMonth = () => todayIso().slice(0, 7);

// Kept while the person visits another screen and comes back.
const memo = { month: null, day: null, filter: null };

export default function History() {
  const { entries, loadEntries, notify } = useDiary();
  const [month, setMonth] = useState(memo.month ?? thisMonth());
  const [summary, setSummary] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [changes, setChanges] = useState([]);
  const [day, setDay] = useState(memo.day);
  const [dayData, setDayData] = useState(null);
  const [filter, setFilter] = useState(memo.filter);
  const [tip, setTip] = useState(null); // { day, rect }

  const state = useLoad(async () => {
    const [s, cal, ch] = await Promise.all([api.historySummary(), api.calendar(month), api.changes(), loadEntries()]);
    setSummary(s); setCalendar(cal); setChanges(ch.changes);
    // open the most recent day with an entry in this month
    const open = memo.day ?? [...cal.days].reverse().find((d) => d.entryCount > 0)?.day ?? null;
    setDay(open);
    setDayData(open ? await api.day(open) : null);
  });

  if (!state.ready) return <LoadState state={state} />;

  async function openDay(d) {
    setTip(null);
    memo.day = d;
    setDay(d);
    try { setDayData(d ? await api.day(d) : null); } catch (e) { notify(e.message); }
  }
  async function toMonth(m) {
    memo.month = m;
    setMonth(m);
    try { setCalendar(await api.calendar(m)); await openDay(null); } catch (e) { notify(e.message); }
  }
  const pickFilter = (z) => { memo.filter = z; setFilter(z); };

  const first = entries.at(-1)?.day;
  const none = filter && !summary.zones.find((z) => z.zone.id === filter && z.count);

  return (
    <>
      <h1>History</h1>
      <p className="sub">
        {summary.total} {summary.total === 1 ? 'entry' : 'entries'}{first ? ` since ${longDate(first).replace(/^\w+, /, '')}` : ''} · pick a day to see what it was about
      </p>
      <div className="pills">
        <button className="pill" aria-pressed={!filter} onClick={() => pickFilter(null)}>All <b>{summary.total}</b></button>
        {summary.zones.map(({ zone, count }) => (
          <button key={zone.id} className={`pill ${count ? '' : 'empty'}`} aria-pressed={filter === zone.id} onClick={() => pickFilter(zone.id)}>
            <i style={{ width: 8, height: 8, borderRadius: '50%', background: count ? zc(zone.id) : 'var(--muted)', display: 'inline-block' }} />
            {zl(zone.id)} <b>{count}</b>
          </button>
        ))}
      </div>

      {none ? (
        <div className="card">
          <div className="empty">
            <Note />
            <p style={{ fontWeight: 700, fontSize: 18, margin: '10px 0 4px' }}>Nothing about {zl(filter)} yet</p>
            <p style={{ color: 'var(--txt2)', fontSize: 14, margin: '0 0 18px' }}>This zone is in your profile but no entry is mainly about it. The diary offers a quieter zone now and then, so it may come up soon.</p>
            <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={() => pickFilter(null)}>Show all entries</button>
              <button className="btn" onClick={() => go('today')}>Write today's entry</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="histgrid">
          <MonthCalendar
            month={month} calendar={calendar} selected={day} filter={filter}
            onPick={openDay} onMonth={toMonth} onTip={setTip}
          />
          <DayCard day={day} data={dayData} changes={changes} />
        </div>
      )}
      {tip && <DayTip tip={tip} calendar={calendar} entries={entries} />}
    </>
  );
}

function MonthCalendar({ month, calendar: c, selected, filter, onPick, onMonth, onTip }) {
  const isCurrent = month === thisMonth();
  return (
    <div className="card">
      <div className="spread">
        <b style={{ fontSize: 15 }}>{monthName(month)}</b>
        <span className="meta">
          <button className="linkbtn" aria-label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))}>‹</button>{' '}
          <button className="linkbtn" disabled={isCurrent} onClick={() => onMonth(thisMonth())}>today</button>{' '}
          <button className="linkbtn" aria-label="Next month" disabled={isCurrent} onClick={() => onMonth(shiftMonth(month, 1))}>›</button>
        </span>
      </div>
      <div className="mcal">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <b key={d}>{d}</b>)}
        {[...Array(c.firstWeekday)].map((_, i) => <span key={`pad${i}`} className="mday pad" />)}
        {c.days.map((d) => {
          const zs = d.zones.map((z) => z.id), sel = d.day === selected, has = d.entryCount > 0;
          const hidden = filter && !zs.includes(filter);
          const lit = has && !hidden && zs.length;
          const style = lit ? {
            background: `color-mix(in srgb, ${zc(zs[0])} ${Math.round(20 + 20 * Math.min(zs.length, 3))}%, transparent)`,
            borderColor: `color-mix(in srgb, ${zc(zs[0])} 55%, transparent)`,
          } : undefined;
          const showTip = (e) => onTip({ day: d.day, rect: e.currentTarget.getBoundingClientRect() });
          return (
            <button
              key={d.day} className={`mday ${has && !hidden ? 'has' : 'none'} ${sel ? 'sel' : ''}`} style={style}
              disabled={!has} aria-pressed={sel}
              aria-label={`${longDate(d.day)}${has ? `, ${zs.map(zl).join(', ') || 'not classified yet'}` : ', no entry'}`}
              onClick={() => onPick(d.day)} onMouseEnter={showTip} onFocus={showTip}
              onMouseLeave={() => onTip(null)} onBlur={() => onTip(null)}
            >
              <u>{d.dayOfMonth}</u>
              <em>{(hidden ? [] : zs).slice(0, 3).map((z) => <i key={z} style={{ background: zc(z) }} />)}</em>
            </button>
          );
        })}
      </div>
      <div className="spread meta" style={{ marginTop: 10 }}>
        <span>a dot for every zone the diary recorded</span>
        <span className="scale">fewer {[0.2, 0.4, 0.6, 0.8].map((o) => <i key={o} style={{ opacity: o }} />)} more</span>
      </div>
    </div>
  );
}

/** The largest change an entry caused on that day, for the "moved" line. */
function movedOn(changes, day) {
  const c = changes.filter((x) => x.changedAt.slice(0, 10) === day && x.source === 'learned' && x.oldWeight != null)
    .sort((a, b) => Math.abs(b.newWeight - b.oldWeight) - Math.abs(a.newWeight - a.oldWeight))[0];
  return c ? { label: zl(c.zoneId), from: c.oldWeight, to: c.newWeight } : null;
}

function Empty({ title, children }) {
  return (
    <div className="card">
      <div className="empty">
        <Note />
        <p style={{ fontWeight: 700, fontSize: 18, margin: '10px 0 4px' }}>{title}</p>
        <p style={{ color: 'var(--txt2)', fontSize: 14, margin: 0 }}>{children}</p>
      </div>
    </div>
  );
}

function DayCard({ day, data, changes }) {
  if (!day || !data) return <Empty title="Pick a day">Days with an entry are coloured. Days without one stay empty — the diary never fills them in for you.</Empty>;
  const { entries, questions } = data;
  if (entries.length === 0) return <Empty title={`Nothing written on ${longDate(day)}`}>Days without an entry stay empty — the diary never fills them in for you.</Empty>;
  const zs = [...new Set(entries.filter((e) => e.zone).map((e) => e.zone.id))];
  const moved = movedOn(changes, day);
  return (
    <div className="card glow">
      <b style={{ fontSize: 17 }}>{longDate(day)}</b>
      <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>{zs.map((z) => <ZoneTag key={z} zone={z} />)}</div>
      {entries.slice().reverse().map((e, n) => {
        const qn = questions.find((x) => x.entryId === e.id) ?? (e.prompt ? { text: e.prompt.text, relevanceRating: e.prompt.relevanceRating } : null);
        return (
          <div key={e.id}>
            {n > 0 && <div className="hr" />}
            {qn ? (
              <>
                <p className="lbl" style={{ margin: '14px 0 6px' }}>THE QUESTION</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt2)', margin: '0 0 12px' }}>{qn.text}</p>
              </>
            ) : <p className="lbl" style={{ margin: '14px 0 6px' }}>A FREE ENTRY</p>}
            <blockquote>{e.text}</blockquote>
            <p className="meta" style={{ margin: '6px 0 0' }}>
              {qn ? (qn.relevanceRating == null ? 'Not rated' : `You rated this question ${qn.relevanceRating ? 'relevant' : 'not relevant'}`) : ''}
              {e.status === 'classification_failed' ? ' · topics pending' : ''}
            </p>
          </div>
        );
      })}
      {moved && (
        <>
          <div className="hr" />
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            <span style={{ color: 'var(--txt2)' }}>{moved.label}</span>{' '}
            <b style={{ color: 'var(--ok)' }}>{moved.from.toFixed(2)} → {moved.to.toFixed(2)}</b>
          </p>
        </>
      )}
    </div>
  );
}

/** The tooltip over a calendar day: its zones and the start of the entry. */
function DayTip({ tip, calendar, entries }) {
  const d = calendar.days.find((x) => x.day === tip.day);
  if (!d?.entryCount) return null;
  const first = entries.find((e) => e.day === tip.day);
  const { rect } = tip;
  const left = Math.min(Math.max(rect.left + rect.width / 2 - 140, 12), innerWidth - 292);
  // below the day, or above it when there is no room below (about 150 px tall)
  const top = rect.bottom + 160 > innerHeight - 12 ? Math.max(12, rect.top - 160) : rect.bottom + 10;
  return createPortal(
    <div className="tip on" role="presentation" style={{ left, top }}>
      <div className="tz">{d.zones.map((z) => <ZoneTag key={z.id} zone={z.id} />)}</div>
      {first && (
        <>
          {first.prompt?.text && <p className="tq">{first.prompt.text.slice(0, 58)}…</p>}
          <p>{first.text.split(/(?<=\.)\s/).slice(0, 2).join(' ').slice(0, 220)}</p>
        </>
      )}
      <div className="td">{d.entryCount} {d.entryCount === 1 ? 'entry' : 'entries'} · click to open the day</div>
    </div>,
    document.body,
  );
}
