/**
 * S-03 / S-04 · Today: three questions, write, rate, done.
 *
 * Left: the profile card (the radar). Right, one of five states:
 *
 *   picker   three questions on three zones — "Write about this ›"
 *   writer   the chosen question, "Why this question?", the text box
 *   saved    the entry (read-only), "Was this question relevant?", and the
 *            questions still open today
 *   done     "That is today done." — appears by itself after a rating;
 *            "Read today's entries", "Answer another (N left)"
 *   review   everything written today, read-only, ratings as given
 *
 * What goes to the server, and when:
 *   picking a question   POST /prompts/:id/choose  (its zone moves up 0.03, once)
 *   typing               nothing — the draft stays in this browser (NFR-7)
 *   Save                 POST /entries             (saved first, then analysed)
 *   👍 / 👎              POST /prompts/:id/rating  (only after answering)
 *
 * The three cards look identical. The browser is never told which question
 * was the random control; "Why this question?" tells the truth when asked.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { ZONES, zc, zl } from '../lib/zones.js';
import { todayIso, clock, longDate, weekday, reduceMotion } from '../lib/format.js';
import { useDiary } from '../state/DiaryContext.jsx';
import { useLoad, LoadState } from '../state/useLoad.jsx';
import { go } from '../state/nav.js';
import Radar from '../components/Radar.jsx';
import RateBurst from '../components/RateBurst.jsx';
import { ZoneTag, FieldError } from '../components/ui.jsx';
import { Spark, Check, Warn, Info, Clock, Thumb, Calendar } from '../components/Icon.jsx';

/* ---------- the draft: kept on this device only ---------- */
const DRAFT_KEY = 'reflection-diary.draft';
const draftStore = {
  read(id) { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return d && d.id === id ? d.text : ''; } catch { return ''; } },
  write(id, text) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ id, text })); } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } },
};

/* What is remembered while the person visits another screen and comes back
   the same day: the question being written, the explanations already
   fetched, and the "moved up" lines. */
const memo = { day: null, active: null, why: {}, boosted: {} };

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Still awake' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Today() {
  const { user, profile, setProfile, entries, setEntries, loadProfile, loadEntries, week, setWeek, loadWeek, notify } = useDiary();
  const [questions, setQuestions] = useState([]);
  const [texts, setTexts] = useState({}); //      promptShownId -> { text, at }
  const [active, setActive] = useState(null); //  the question being written
  const [draft, setDraft] = useState('');
  const [explain, setExplain] = useState(false);
  const [why, setWhy] = useState({});
  const [boosted, setBoosted] = useState({});
  const [saved, setSaved] = useState(null); //    the entry just saved
  const [change, setChange] = useState(null); // the line under the chart after saving
  const [rating, setRating] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [emptyError, setEmptyError] = useState(false);
  const [done, setDone] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [arrive, setArrive] = useState(false);
  const [burst, setBurst] = useState(null);
  const [viewDay, setViewDay] = useState(null); // a past day picked on the week strip
  const dayTimer = useRef(0);

  const state = useLoad(async () => {
    const [today, , list] = await Promise.all([api.today(), loadProfile(), loadEntries(), loadWeek()]);
    if (memo.day !== today.day) Object.assign(memo, { day: today.day, active: null, why: {}, boosted: {} });
    const written = {};
    for (const e of list) if (e.prompt?.promptShownId && e.day === today.day) written[e.prompt.promptShownId] = { text: e.text, at: e.createdAt };
    const open = today.questions.filter((x) => !x.wasAnswered);
    const stillOpen = memo.active && open.some((x) => x.promptShownId === memo.active) ? memo.active : null;
    setQuestions(today.questions);
    setTexts(written);
    setActive(stillOpen);
    setDraft(stillOpen ? draftStore.read(stillOpen) : '');
    setWhy(memo.why); setBoosted(memo.boosted);
    setDone(today.questions.some((x) => x.wasAnswered) && stillOpen == null);
  });

  useEffect(() => () => clearTimeout(dayTimer.current), []);
  useEffect(() => { memo.active = active; }, [active]);
  useEffect(() => { if (active) document.getElementById('entry')?.focus(); }, [active]);

  const q = (id) => questions.find((x) => x.promptShownId === id);
  const openQs = questions.filter((x) => !x.wasAnswered);
  const answered = questions.filter((x) => x.wasAnswered);
  const lastDay = (week?.days?.length ?? 0) - 1;
  const pastView = viewDay != null && viewDay !== lastDay;

  /** The weights the chart shows: today's, or a past day's from the week strip. */
  const shown = useMemo(() => {
    const w = viewDay != null ? week?.days?.[viewDay]?.weights : null;
    return w ? Object.fromEntries(ZONES.map((z) => [z, w[z] ?? 0])) : profile.weights;
  }, [viewDay, week, profile.weights]);

  const setWeight = (updates) => {
    const weights = { ...profile.weights, ...updates };
    setProfile((p) => ({ ...p, weights }));
    setWeek((w) => (w?.days?.length ? { ...w, days: w.days.map((d, i) => (i === w.days.length - 1 ? { ...d, weights } : d)) } : w));
  };

  /* ---------- actions ---------- */
  async function choose(id) {
    if (!q(id)) return;
    setActive(id); setSaved(null); setChange(null); setRating(null); setDone(false); setReviewing(false); setExplain(false);
    setDraft(draftStore.read(id));
    try {
      const { question, boost } = await api.choose(id);
      setQuestions((list) => list.map((x) => (x.promptShownId === id ? { ...x, ...question } : x)));
      if (boost) { // the choice is a signal: a small nudge, once
        memo.boosted = { ...memo.boosted, [id]: boost };
        setBoosted(memo.boosted);
        setWeight({ [boost.zone.id]: boost.to });
      }
    } catch (error) { notify(error.message); }
  }

  async function save() {
    const text = draft.trim();
    if (!text) { setEmptyError(true); document.getElementById('entry')?.focus(); return; }
    const id = active, p = q(id);
    setAnalyzing(true); setSaveError(null);
    let result;
    try {
      result = await api.saveEntry(text, id);
    } catch (error) {
      // Nothing is lost: the text stays in the box and on this device.
      setAnalyzing(false);
      setSaveError(error.code === 'ALREADY_ANSWERED' || error.code === 'QUESTION_EXPIRED'
        ? error.message : 'Could not save. Your text is kept on this device — try again.');
      return;
    }
    draftStore.clear();
    setQuestions((list) => list.map((x) => (x.promptShownId === id ? { ...x, wasAnswered: true, wasChosen: true, entryId: result.entry.id } : x)));
    setTexts((t) => ({ ...t, [id]: { text: result.entry.text, at: result.entry.createdAt } }));
    const updates = {};
    if (result.boost) updates[result.boost.zone.id] = result.boost.to;
    for (const c of result.weightChanges) updates[c.zoneId] = c.to;
    setWeight(updates);
    // the line under the chart: the asked zone if it moved, otherwise the biggest move
    setChange(result.weightChanges.find((c) => c.zoneId === p.zone.id) ?? result.weightChanges[0] ?? null);
    setSaved({ id, zone: p.zone.id, text: result.entry.text, at: result.entry.createdAt, analysis: result.analysis });
    setAnalyzing(false); setActive(null); setDraft(''); setExplain(false); setRating(null);
    setEntries((list) => [result.entry, ...list]);
    loadEntries().catch(() => {}); // refresh the counts quietly
  }

  async function rate(kind, button) {
    if (!saved || rating === kind) return;
    const rect = button.getBoundingClientRect();
    try {
      await api.rate(saved.id, kind === 'up');
    } catch (error) { notify(error.message); return; }
    setRating(kind);
    setQuestions((list) => list.map((x) => (x.promptShownId === saved.id ? { ...x, relevanceRating: kind === 'up' } : x)));
    if (!reduceMotion()) setBurst({ kind, rect, key: Date.now() });
    // Once the question is rated there is nothing left to do today, so after
    // the animation the card turns into "That is today done" by itself.
    clearTimeout(dayTimer.current);
    dayTimer.current = setTimeout(() => { setDone(true); setSaved(null); setArrive(true); }, reduceMotion() ? 400 : 1300);
  }

  async function toggleWhy() {
    const next = !explain;
    setExplain(next);
    if (next && !why[active]) {
      let text;
      try { text = (await api.explanation(active)).text; } catch (e) { text = e.message; }
      memo.why = { ...memo.why, [active]: text };
      setWhy(memo.why);
    }
  }

  if (!state.ready) return <LoadState state={state} />;

  /* ---------- the right-hand side ---------- */
  let right;
  if (done && reviewing) right = <Review answered={answered} texts={texts} onBack={() => setReviewing(false)} />;
  else if (done) {
    right = (
      <DoneCard
        answered={answered} texts={texts} openCount={openQs.length} arrive={arrive}
        onReopen={() => setReviewing(true)}
        onAnother={() => { setDone(false); setReviewing(false); setSaved(null); setRating(null); setActive(null); }}
      />
    );
  } else if (saved) {
    right = <Saved saved={saved} rating={rating} burst={burst} open={openQs} onRate={rate} onChoose={choose} />;
  } else if (active != null) {
    right = (
      <Writer
        question={q(active)} boost={boosted[active]} explain={explain} why={why[active]} draft={draft}
        analyzing={analyzing} emptyError={emptyError} others={openQs.filter((o) => o.promptShownId !== active)}
        onDraft={(text) => { setDraft(text); draftStore.write(active, text); if (text.trim()) setEmptyError(false); }}
        onSave={save} onWhy={toggleWhy} onHide={() => setExplain(false)} onChoose={choose} onBack={() => setActive(null)}
      />
    );
  } else right = <Picker open={openQs} answeredCount={questions.length - openQs.length} onChoose={choose} />;

  return (
    <>
      <h1>{greeting()}{user?.displayName ? `, ${user.displayName}` : ''}</h1>
      <p className="sub">{longDate(todayIso())} · five minutes is enough</p>
      <WeekStrip week={week} entries={entries} viewDay={viewDay} onView={(i) => setViewDay(viewDay === i ? null : i)} />
      <div className="hr" />
      {saveError && (
        <div className="toast e"><Warn /> <span>{saveError} <button className="linkbtn" style={{ color: 'var(--err)' }} onClick={save}>Retry</button></span></div>
      )}
      <div className="two">
        <div className="card profilecard">
          <b style={{ fontSize: 15, color: 'var(--txt2)' }}>Your profile</b>
          <Radar weights={shown} pastDay={pastView ? week.days[viewDay].day : null} onBackToToday={() => setViewDay(null)} />
          {analyzing && <p className="analyzing"><Spark /><span>Saving, then finding the topics in your entry…</span></p>}
          {!pastView && !analyzing && saved && <AfterSave saved={saved} change={change} />}
          <p className="meta" style={{ margin: '10px 0 0' }}>All nine values are read out in text for screen readers · full numbers in Profile</p>
        </div>
        {done ? <div>{right}</div> : right}
      </div>
      {burst && <RateBurst key={burst.key} kind={burst.kind} rect={burst.rect} onDone={() => setBurst(null)} />}
    </>
  );
}

/** The last seven days. A past day with an entry can be clicked to see the profile as it was then. */
function WeekStrip({ week, entries, viewDay, onView }) {
  const days = week?.days ?? [];
  const last = days.length - 1;
  const zonesOn = (day) => [...new Set(entries.filter((e) => e.day === day && e.zone).map((e) => e.zone.id))];
  const written = days.filter(({ day }) => entries.some((e) => e.day === day)).length;
  const pastView = viewDay != null && viewDay !== last;
  const CR = 2 * Math.PI * 21;
  return (
    <div className="weekrow">
      <div className="days">
        {days.map(({ day }, i) => {
          const zs = zonesOn(day), z = zs[0], isToday = i === last, past = !isToday && zs.length > 0, viewing = viewDay === i;
          const name = weekday(day);
          const label = z ? `${name}: ${zs.map(zl).join(', ')}` : (isToday ? `${name}, today, nothing written yet` : `${name}, no entry`);
          return (
            <button
              key={day} className={`day ${isToday ? 'now' : ''} ${viewing ? 'viewing' : ''} ${past ? 'has' : ''}`}
              style={z ? { background: `color-mix(in srgb, ${zc(z)} 16%, transparent)`, color: zc(z) } : { color: 'var(--muted)' }}
              disabled={!past} aria-label={label} aria-pressed={viewing} onClick={() => onView(i)}
            >
              <svg className="ring" viewBox="0 0 46 46" aria-hidden="true">
                <circle cx="23" cy="23" r="21" fill="none" stroke="var(--div)" strokeWidth="2" />
                {z && <circle cx="23" cy="23" r="21" fill="none" stroke={zc(z)} strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={`${(CR * Math.min(zs.length, 3) / 3).toFixed(1)} ${CR.toFixed(1)}`} transform="rotate(-90 23 23)" />}
              </svg>
              <u>{name[0]}</u>
            </button>
          );
        })}
        <button className="day cal-btn" aria-label="Open the full calendar" onClick={() => go('history')}><Calendar /></button>
      </div>
      <div className="wstats">
        <b>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</b>
        <span>{pastView ? 'viewing a past day' : `${written} of the last 7 days`}</span>
      </div>
    </div>
  );
}

/** Under the chart, after saving: what the entry did to the profile. */
function AfterSave({ saved, change }) {
  if (saved.analysis === 'failed') return <p className="chip" style={{ marginTop: 10 }}><Clock /> unchanged until topics arrive</p>;
  if (saved.analysis === 'skipped_no_consent') return <p className="chip" style={{ marginTop: 10 }}><Info c="#8B89A3" s={14} /> AI processing is off · profile unchanged</p>;
  if (!change) return null;
  return (
    <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ok)', border: '1px solid var(--ok)', borderRadius: 9, padding: '8px 10px', background: 'rgba(61,219,168,.08)' }}>
      {zl(change.zoneId)} {change.from.toFixed(2)} → <b>{change.to.toFixed(2)}</b> after this entry
    </p>
  );
}

function Picker({ open, answeredCount, onChoose }) {
  return (
    <div>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <b style={{ fontSize: 17 }}>{answeredCount ? 'Want to write a little more?' : 'Three questions for today'}</b>
          <p className="meta" style={{ margin: '2px 0 0' }}>{answeredCount ? 'Optional — one entry a day is plenty.' : 'Pick the one that fits today. One is enough; more is up to you.'}</p>
        </div>
        <span className="chip">{answeredCount} of 3 answered</span>
      </div>
      <div className="qlist">
        {open.map((p, n) => (
          <div key={p.promptShownId} className="card qpick" style={{ '--zc': zc(p.zone.id), animationDelay: `${n * 70}ms` }}>
            <ZoneTag zone={p.zone.id} />
            <p className="qtext">{p.text}</p>
            <button className="btn ghost" onClick={() => onChoose(p.promptShownId)}>Write about this ›</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Writer({ question, boost, explain, why, draft, analyzing, emptyError, others, onDraft, onSave, onWhy, onHide, onChoose, onBack }) {
  const z = question.zone.id;
  return (
    <div>
      <div className="card glow">
        <div className="spread">
          <ZoneTag zone={z} />
          <button className="linkbtn" aria-expanded={explain} onClick={onWhy}>Why this question? <span className={`caret ${explain ? 'open' : ''}`}>›</span></button>
        </div>
        <p className="q">{question.text}</p>
        {boost && (
          <p className="boost"><Spark c="#E879F9" s={13} /> You chose this one, so <b style={{ color: zc(z) }}>{zl(z)}</b> moved up {(boost.to - boost.from).toFixed(2)} already.</p>
        )}
        {explain && (
          <div className="explain">
            <div className="spread">
              <b style={{ color: 'var(--accent)', fontSize: 14 }}>Why this question?</b>
              <button className="linkbtn" style={{ color: 'var(--muted)' }} onClick={onHide}>Hide</button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--txt2)', margin: '8px 0 0' }}>{why ?? '…'}</p>
            <p className="meta" style={{ margin: '6px 0 0' }}>The chart on the left moves after each entry.</p>
          </div>
        )}
        <label className="lbl" htmlFor="entry">Your entry</label>
        <textarea
          id="entry" placeholder="Start writing…" aria-describedby="entryErr" disabled={analyzing}
          className={emptyError ? 'bad' : ''} value={draft} onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSave(); }}
        />
        <FieldError id="entryErr" on={emptyError}>Write a few words before saving.</FieldError>
        <p className="meta" style={{ margin: '0 0 12px' }}>Kept on this device as you type · sent only when you save · ⌘/Ctrl + Enter saves</p>
        <button className="btn block" id="save" disabled={analyzing} onClick={onSave}>{analyzing ? 'Saving…' : 'Save entry'}</button>
      </div>
      {others.length > 0 && (
        <p className="meta" style={{ margin: '2px 0 0' }}>
          Changed your mind?{' '}
          {others.map((o, i) => (
            <span key={o.promptShownId}>{i > 0 && ' · '}<button className="linkbtn" style={{ fontSize: 13 }} onClick={() => onChoose(o.promptShownId)}>{zl(o.zone.id)}</button></span>
          ))}
          &nbsp;or <button className="linkbtn" style={{ fontSize: 13 }} onClick={onBack}>see all three</button>
        </p>
      )}
    </div>
  );
}

function Saved({ saved, rating, burst, open, onRate, onChoose }) {
  const fx = (kind) => (burst?.kind === kind ? `rfx-${kind}` : '');
  return (
    <div>
      <p className="okline"><Check /> Entry saved at {clock(saved.at)}</p>
      {saved.analysis === 'failed' && (
        <div className="toast i"><Info /> <span>Topics will be added later — the analysis service is not responding. Your entry is safe and your profile is unchanged.</span></div>
      )}
      <div className="card">
        <div className="spread">
          <ZoneTag zone={saved.zone} />
          {saved.analysis === 'failed' ? <span className="chip"><Clock /> topics pending</span> : <span className="meta">saved {clock(saved.at)}</span>}
        </div>
        <p style={{ color: 'var(--txt2)', margin: '14px 0 0', whiteSpace: 'pre-wrap' }}>{saved.text}</p>
        <p className="meta" style={{ margin: '10px 0 0' }}>Saved · read-only</p>
      </div>
      <div className="card glow">
        <b>Was this question relevant to you?</b>
        <div className="rate" style={{ marginTop: 14 }}>
          <button id="up" className={fx('up')} aria-pressed={rating === 'up'} onClick={(e) => onRate('up', e.currentTarget)}>
            <Thumb c={rating === 'up' ? '#9B8CFF' : '#C9C6E8'} up /> Relevant
          </button>
          <button id="down" className={fx('down')} aria-pressed={rating === 'down'} onClick={(e) => onRate('down', e.currentTarget)}>
            <Thumb c={rating === 'down' ? '#9B8CFF' : '#C9C6E8'} up={false} /> Not relevant
          </button>
        </div>
        <p className="meta" style={{ margin: '12px 0 0' }}>Optional — it is the only thing the diary cannot work out by itself.</p>
      </div>
      {open.length > 0 && (
        <div className="card quietcard">
          <b style={{ fontSize: 14 }}>Still open today · optional</b>
          {open.map((p) => (
            <div key={p.promptShownId} className="openrow">
              <ZoneTag zone={p.zone.id} />
              <span className="otext">{p.text}</span>
              <button className="linkbtn" onClick={() => onChoose(p.promptShownId)}>Answer ›</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DoneCard({ answered, texts, openCount, arrive, onReopen, onAnother }) {
  const n = answered.length;
  const lastQ = answered.slice().sort((a, b) => (texts[b.promptShownId]?.at ?? '').localeCompare(texts[a.promptShownId]?.at ?? ''))[0];
  const z = lastQ?.zone.id;
  const at = lastQ && texts[lastQ.promptShownId]?.at;
  const rated = lastQ?.relevanceRating;
  return (
    <div className={`card glow${arrive ? ' arrive' : ''}`}>
      <b style={{ fontSize: 19 }}>That is today done.</b>
      <p style={{ color: 'var(--txt2)', margin: '10px 0 14px' }}>
        You wrote about {n > 1 ? `${n} questions` : zl(z)} today. The next three questions arrive tomorrow — nothing else is waiting for you here.
      </p>
      {z && (
        <div className="row">
          <ZoneTag zone={z} />
          <span className="meta">{at ? `saved ${clock(at)}` : 'saved'}{rated != null ? ` · rated ${rated ? 'relevant' : 'not relevant'}` : ''}</span>
        </div>
      )}
      <p style={{ margin: '14px 0 0' }}>
        <button className="linkbtn" onClick={onReopen}>Read today's {n > 1 ? 'entries' : 'entry'}</button>
        {openCount > 0 && <>&nbsp;·&nbsp; <button className="linkbtn" onClick={onAnother}>Answer another ({openCount} left)</button></>}
        &nbsp;·&nbsp; <button className="linkbtn" onClick={() => go('history')}>See your history ›</button>
      </p>
    </div>
  );
}

function Review({ answered, texts, onBack }) {
  return (
    <div>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <b style={{ fontSize: 17 }}>Today's {answered.length > 1 ? 'entries' : 'entry'}</b>
          <p className="meta" style={{ margin: '2px 0 0' }}>Saved · read-only</p>
        </div>
        <button className="linkbtn" onClick={onBack}>‹ Back</button>
      </div>
      <div className="qlist">
        {answered.map((p) => {
          const t = texts[p.promptShownId];
          return (
            <div key={p.promptShownId} className="card readcard" style={{ '--zc': zc(p.zone.id) }}>
              <div className="spread">
                <ZoneTag zone={p.zone.id} />
                <span className="meta">{t?.at ? `saved ${clock(t.at)}` : 'saved'}{p.relevanceRating != null ? ` · rated ${p.relevanceRating ? 'relevant' : 'not relevant'}` : ' · not rated'}</span>
              </div>
              <p className="rq">{p.text}</p>
              <p className="ra">{t?.text ?? ''}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
