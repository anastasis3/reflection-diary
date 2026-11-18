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
import { api } from '../api.js';
import {
  S, ICON, zc, zl, esc, $, $$, render, notice, todayIso, clock, longDate, reduceMotion,
} from '../core.js';
import { loadProfile, loadEntries, loadWeek } from '../data.js';
import { radar, shownWeights } from '../radar.js';
import { rateFx } from '../effects.js';

const T = {
  day: null, questions: [], texts: {}, // today's three, and what was written for each
  active: null, draft: '', explain: false, why: {}, boosted: {},
  saved: null, change: null, rating: null, analyzing: false, done: false, reviewing: false,
};
const q = (id) => T.questions.find((x) => x.promptShownId === id);
const openQs = () => T.questions.filter((x) => !x.wasAnswered);
const answered = () => T.questions.filter((x) => x.wasAnswered);

/* ---------- the draft: kept on this device only ---------- */
const DRAFT_KEY = 'reflection-diary.draft';
const draftStore = {
  read(id) { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return d && d.id === id ? d.text : ''; } catch { return ''; } },
  write(id, text) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ id, text })); } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } },
};

/* ---------- head: greeting, date, the week strip ---------- */
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Still awake' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function head() {
  const who = S.user?.displayName; // null: no name given, so none is used
  return `<h1>${greeting()}${who ? `, ${esc(who)}` : ''}</h1>
    <p class="sub">${longDate(todayIso())} · five minutes is enough</p>
    ${weekStrip()}<div class="hr"></div>`;
}

/** The last seven days. A past day with an entry can be clicked to see the profile as it was then. */
function weekStrip() {
  const days = S.week?.days ?? [];
  const zonesOn = (day) => [...new Set(S.entries.filter((e) => e.day === day && e.zone).map((e) => e.zone.id))];
  const last = days.length - 1;
  let written = 0;
  const cells = days.map(({ day }, i) => {
    const zs = zonesOn(day), z = zs[0], nz = zs.length, today = i === last;
    const viewing = S.viewDay === i, past = !today && nz > 0;
    if (S.entries.some((e) => e.day === day)) written += 1;
    const frac = Math.min(nz, 3) / 3, CR = 2 * Math.PI * 21;
    const ring = z
      ? `<svg class="ring" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="21" fill="none" stroke="var(--div)" stroke-width="2"/><circle cx="23" cy="23" r="21" fill="none" stroke="${zc(z)}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${(CR * frac).toFixed(1)} ${CR.toFixed(1)}" transform="rotate(-90 23 23)"/></svg>`
      : '<svg class="ring" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="21" fill="none" stroke="var(--div)" stroke-width="2"/></svg>';
    const st = z ? `background:color-mix(in srgb, ${zc(z)} 16%, transparent);color:${zc(z)}` : 'color:var(--muted)';
    const name = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
    const lab = z ? `${name}: ${zs.map(zl).join(', ')}` : (today ? `${name}, today, nothing written yet` : `${name}, no entry`);
    return `<button class="day ${today ? 'now' : ''} ${viewing ? 'viewing' : ''} ${past ? 'has' : ''}" style="${st}"
      ${past ? `data-day="${i}"` : 'disabled'} aria-label="${lab}" aria-pressed="${viewing}">${ring}<u>${name[0]}</u></button>`;
  }).join('');
  const pastView = S.viewDay != null && S.viewDay !== last;
  return `<div class="weekrow">
    <div class="days">${cells}
      <button class="day cal-btn" aria-label="Open the full calendar" data-nav="history">${ICON.calendar()}</button></div>
    <div class="wstats"><b>${S.entries.length} ${S.entries.length === 1 ? 'entry' : 'entries'}</b><span>${pastView ? 'viewing a past day' : `${written} of the last 7 days`}</span></div>
  </div>`;
}

/* ---------- left: the profile card ---------- */
function profileCard() {
  const past = S.viewDay != null && S.viewDay !== (S.week?.days?.length ?? 0) - 1;
  let after = '';
  if (!past && !T.analyzing && T.saved) {
    if (T.saved.analysis === 'failed') after = `<p class="chip" style="margin-top:10px">${ICON.clock()} unchanged until topics arrive</p>`;
    else if (T.saved.analysis === 'skipped_no_consent') after = `<p class="chip" style="margin-top:10px">${ICON.info('#8B89A3', 14)} AI processing is off · profile unchanged</p>`;
    else if (T.change) after = `<p style="margin:10px 0 0;font-size:13px;color:var(--ok);border:1px solid var(--ok);border-radius:9px;padding:8px 10px;background:rgba(61,219,168,.08)">${zl(T.change.zoneId)} ${T.change.from.toFixed(2)} → <b>${T.change.to.toFixed(2)}</b> after this entry</p>`;
  }
  return `<div class="card profilecard">
    <b style="font-size:15px;color:var(--txt2)">Your profile</b>
    ${radar(240, shownWeights())}
    ${T.analyzing ? `<p class="analyzing">${ICON.spark()}<span>Saving, then finding the topics in your entry…</span></p>` : ''}
    ${after}
    <p class="meta" style="margin:10px 0 0">All nine values are read out in text for screen readers · full numbers in Profile</p>
  </div>`;
}

/* ---------- right: the five states ---------- */
function pickerView() {
  const open = openQs(), done = T.questions.length - open.length;
  return `<div>
    <div class="spread" style="margin-bottom:12px">
      <div><b style="font-size:17px">${done ? 'Want to write a little more?' : 'Three questions for today'}</b>
        <p class="meta" style="margin:2px 0 0">${done ? 'Optional — one entry a day is plenty.' : 'Pick the one that fits today. One is enough; more is up to you.'}</p></div>
      <span class="chip">${done} of 3 answered</span></div>
    <div class="qlist">${open.map((p, n) => `
      <div class="card qpick" style="--zc:${zc(p.zone.id)};animation-delay:${n * 70}ms">
        <span class="zone" style="color:${zc(p.zone.id)}"><i></i>${zl(p.zone.id)}</span>
        <p class="qtext">${esc(p.text)}</p>
        <button class="btn ghost" data-choose="${p.promptShownId}">Write about this ›</button>
      </div>`).join('')}</div>
  </div>`;
}

function writerView() {
  const p = q(T.active), z = p.zone.id, boost = T.boosted[p.promptShownId];
  const others = openQs().filter((o) => o.promptShownId !== T.active);
  return `<div><div class="card glow">
      <div class="spread"><span class="zone" style="color:${zc(z)}"><i></i>${zl(z)}</span>
        <button class="linkbtn" id="why" aria-expanded="${T.explain}">Why this question? <span class="caret ${T.explain ? 'open' : ''}">›</span></button></div>
      <p class="q">${esc(p.text)}</p>
      ${boost ? `<p class="boost">${ICON.spark('#E879F9', 13)} You chose this one, so <b style="color:${zc(z)}">${zl(z)}</b> moved up ${(boost.to - boost.from).toFixed(2)} already.</p>` : ''}
      ${T.explain ? `<div class="explain">
        <div class="spread"><b style="color:var(--accent);font-size:14px">Why this question?</b>
          <button class="linkbtn" id="hide" style="color:var(--muted)">Hide</button></div>
        <p style="font-size:14px;color:var(--txt2);margin:8px 0 0">${esc(T.why[p.promptShownId] ?? '…')}</p>
        <p class="meta" style="margin:6px 0 0">The chart on the left moves after each entry.</p></div>` : ''}
      <label class="lbl" for="entry">Your entry</label>
      <textarea id="entry" placeholder="Start writing…" aria-describedby="entryErr" ${T.analyzing ? 'disabled' : ''}>${esc(T.draft)}</textarea>
      <p class="err" id="entryErr">${ICON.warn('#FF9B8A', 13)} Write a few words before saving.</p>
      <p class="meta" style="margin:0 0 12px">Kept on this device as you type · sent only when you save · ⌘/Ctrl + Enter saves</p>
      <button class="btn block" id="save" ${T.analyzing ? 'disabled' : ''}>${T.analyzing ? 'Saving…' : 'Save entry'}</button>
    </div>
    ${others.length ? `<p class="meta" style="margin:2px 0 0">Changed your mind?
      ${others.map((o) => `<button class="linkbtn" data-choose="${o.promptShownId}" style="font-size:13px">${zl(o.zone.id)}</button>`).join(' · ')}
      &nbsp;or <button class="linkbtn" id="backPick" style="font-size:13px">see all three</button></p>` : ''}
  </div>`;
}

function savedView() {
  const s = T.saved, open = openQs();
  return `<div>
      <p class="okline">${ICON.check()} Entry saved at ${clock(s.at)}</p>
      ${s.analysis === 'failed' ? `<div class="toast i">${ICON.info()} <span>Topics will be added later — the analysis service is not responding. Your entry is safe and your profile is unchanged.</span></div>` : ''}
      <div class="card">
        <div class="spread"><span class="zone" style="color:${zc(s.zone)}"><i></i>${zl(s.zone)}</span>
          ${s.analysis === 'failed' ? `<span class="chip">${ICON.clock()} topics pending</span>` : `<span class="meta">saved ${clock(s.at)}</span>`}</div>
        <p style="color:var(--txt2);margin:14px 0 0;white-space:pre-wrap">${esc(s.text)}</p>
        <p class="meta" style="margin:10px 0 0">Saved · read-only</p>
      </div>
      <div class="card glow">
        <b>Was this question relevant to you?</b>
        <div class="rate" style="margin-top:14px">
          <button id="up" aria-pressed="${T.rating === 'up'}">${ICON.thumb(T.rating === 'up' ? '#9B8CFF' : '#C9C6E8', true)} Relevant</button>
          <button id="down" aria-pressed="${T.rating === 'down'}">${ICON.thumb(T.rating === 'down' ? '#9B8CFF' : '#C9C6E8', false)} Not relevant</button>
        </div>
        <p class="meta" style="margin:12px 0 0">Optional — it is the only thing the diary cannot work out by itself.</p>
      </div>
      ${open.length ? `<div class="card quietcard">
        <b style="font-size:14px">Still open today · optional</b>
        ${open.map((p) => `<div class="openrow">
          <span class="zone" style="color:${zc(p.zone.id)}"><i></i>${zl(p.zone.id)}</span>
          <span class="otext">${esc(p.text)}</span>
          <button class="linkbtn" data-choose="${p.promptShownId}">Answer ›</button></div>`).join('')}
      </div>` : ''}
  </div>`;
}

function doneCard() {
  const done = answered(), open = openQs().length, n = done.length;
  const lastQ = done.slice().sort((a, b) => (T.texts[b.promptShownId]?.at ?? '').localeCompare(T.texts[a.promptShownId]?.at ?? ''))[0];
  const z = lastQ?.zone.id;
  const at = lastQ && T.texts[lastQ.promptShownId]?.at;
  const rated = lastQ?.relevanceRating;
  return `<div class="card glow">
    <b style="font-size:19px">That is today done.</b>
    <p style="color:var(--txt2);margin:10px 0 14px">You wrote about ${n > 1 ? `${n} questions` : zl(z)} today. The next three questions arrive tomorrow — nothing else is waiting for you here.</p>
    ${z ? `<div class="row"><span class="zone" style="color:${zc(z)}"><i></i>${zl(z)}</span>
      <span class="meta">${at ? `saved ${clock(at)}` : 'saved'}${rated != null ? ` · rated ${rated ? 'relevant' : 'not relevant'}` : ''}</span></div>` : ''}
    <p style="margin:14px 0 0"><button class="linkbtn" id="reopen">Read today's ${n > 1 ? 'entries' : 'entry'}</button>
      ${open ? `&nbsp;·&nbsp; <button class="linkbtn" id="another">Answer another (${open} left)</button>` : ''}
      &nbsp;·&nbsp; <button class="linkbtn" data-nav="history">See your history ›</button></p>
  </div>`;
}

function reviewView() {
  const done = answered();
  return `<div>
    <div class="spread" style="margin-bottom:12px">
      <div><b style="font-size:17px">Today's ${done.length > 1 ? 'entries' : 'entry'}</b>
        <p class="meta" style="margin:2px 0 0">Saved · read-only</p></div>
      <button class="linkbtn" id="backDone">‹ Back</button></div>
    <div class="qlist">${done.map((p) => {
    const t = T.texts[p.promptShownId];
    return `
      <div class="card readcard" style="--zc:${zc(p.zone.id)}">
        <div class="spread"><span class="zone" style="color:${zc(p.zone.id)}"><i></i>${zl(p.zone.id)}</span>
          <span class="meta">${t?.at ? `saved ${clock(t.at)}` : 'saved'}${p.relevanceRating != null ? ` · rated ${p.relevanceRating ? 'relevant' : 'not relevant'}` : ' · not rated'}</span></div>
        <p class="rq">${esc(p.text)}</p>
        <p class="ra">${esc(t?.text ?? '')}</p>
      </div>`;
  }).join('')}</div>
  </div>`;
}

/* ---------- actions ---------- */
async function choose(id) {
  const p = q(id);
  if (!p) return;
  Object.assign(T, { active: id, saved: null, change: null, rating: null, done: false, reviewing: false, explain: false });
  T.draft = draftStore.read(id);
  try {
    const { question, boost } = await api.choose(id);
    Object.assign(p, question);
    if (boost) { // the choice is a signal: a small nudge, once
      T.boosted[id] = boost;
      S.prevW = { ...S.weights };
      S.weights[boost.zone.id] = boost.to;
    }
  } catch (error) { notice(error.message); }
  render();
  $('#entry')?.focus();
}

async function save() {
  const ta = $('#entry');
  const text = ta.value.trim();
  if (!text) { ta.classList.add('bad'); $('#entryErr').classList.add('on'); ta.focus(); return; }
  const id = T.active, p = q(id);
  T.draft = ta.value;
  T.analyzing = true;
  render();
  let result;
  try {
    result = await api.saveEntry(text, id);
  } catch (error) {
    // Nothing is lost: the text stays in the box and on this device.
    T.analyzing = false;
    render();
    $('#saveErrBox').innerHTML = `<div class="toast e">${ICON.warn()} <span>${esc(error.code === 'ALREADY_ANSWERED' || error.code === 'QUESTION_EXPIRED' ? error.message : 'Could not save. Your text is kept on this device — try again.')} <button class="linkbtn" id="retry" style="color:var(--err)">Retry</button></span></div>`;
    $('#retry')?.addEventListener('click', save);
    return;
  }
  draftStore.clear();
  Object.assign(p, { wasAnswered: true, wasChosen: true, entryId: result.entry.id });
  T.texts[id] = { text: result.entry.text, at: result.entry.createdAt };
  S.prevW = { ...S.weights };
  if (result.boost) S.weights[result.boost.zone.id] = result.boost.to;
  for (const c of result.weightChanges) S.weights[c.zoneId] = c.to;
  // the line under the chart: the asked zone if it moved, otherwise the biggest move
  T.change = result.weightChanges.find((c) => c.zoneId === p.zone.id) ?? result.weightChanges[0] ?? null;
  T.saved = { id, zone: p.zone.id, text: result.entry.text, at: result.entry.createdAt, analysis: result.analysis };
  Object.assign(T, { analyzing: false, active: null, draft: '', explain: false, rating: null });
  S.entries.unshift(result.entry);
  const todaySnap = S.week?.days?.at(-1);
  if (todaySnap) todaySnap.weights = { ...S.weights };
  render();
  loadEntries().catch(() => {}); // refresh counts quietly for the next render
}

let dayTimer = 0;
/* Once the question is rated there is nothing left to do today, so after the
   animation the card turns into "That is today done" by itself. */
function finishDay() {
  clearTimeout(dayTimer);
  dayTimer = setTimeout(() => {
    if (S.screen !== 'today' || !T.rating || T.done) return;
    T.done = true; T.saved = null;
    render();
    $('#reopen')?.closest('.card')?.classList.add('arrive');
  }, reduceMotion() ? 400 : 1300);
}

async function rate(kind, button) {
  if (!T.saved || T.rating === kind) return;
  const rect = button.getBoundingClientRect();
  try {
    await api.rate(T.saved.id, kind === 'up');
  } catch (error) { notice(error.message); return; }
  T.rating = kind;
  const p = q(T.saved.id);
  if (p) p.relevanceRating = kind === 'up';
  render();
  rateFx(kind, rect);
  finishDay();
}

/* ---------- the screen ---------- */
export const today = {
  async load() {
    const [todayRes] = await Promise.all([api.today(), loadProfile(), loadEntries(), loadWeek()]);
    if (T.day !== todayRes.day) Object.assign(T, { active: null, draft: '', why: {}, boosted: {}, texts: {} });
    T.day = todayRes.day;
    T.questions = todayRes.questions;
    for (const e of S.entries) if (e.prompt?.promptShownId && e.day === T.day) T.texts[e.prompt.promptShownId] = { text: e.text, at: e.createdAt };
    if (T.active && !openQs().some((x) => x.promptShownId === T.active)) T.active = null;
    Object.assign(T, { saved: null, change: null, rating: null, analyzing: false, reviewing: false });
    T.done = answered().length > 0 && T.active == null;
  },

  view() {
    const right = T.done && T.reviewing ? reviewView()
      : T.done ? doneCard()
        : T.saved ? savedView()
          : T.active != null ? writerView()
            : pickerView();
    return `${head()}<div id="saveErrBox"></div><div class="two">${profileCard()}${T.done ? `<div>${right}</div>` : right}</div>`;
  },

  wire() {
    $$('[data-choose]').forEach((b) => b.addEventListener('click', () => choose(b.dataset.choose)));
    $('#backPick')?.addEventListener('click', () => { T.active = null; render(); });
    $('#another')?.addEventListener('click', () => { Object.assign(T, { done: false, reviewing: false, saved: null, rating: null, active: null }); render(); });
    $('#backDone')?.addEventListener('click', () => { T.reviewing = false; render(); });
    $('#reopen')?.addEventListener('click', () => { T.reviewing = true; render(); });

    // the week strip is a time machine: the profile as it was on a past day
    $$('.day[data-day]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.day;
      S.prevW = { ...shownWeights() };
      S.viewDay = S.viewDay === i ? null : i;
      render();
    }));
    $('#backToToday')?.addEventListener('click', () => { S.prevW = { ...shownWeights() }; S.viewDay = null; render(); });

    const ta = $('#entry');
    if (ta) {
      ta.addEventListener('input', () => {
        T.draft = ta.value;
        draftStore.write(T.active, ta.value);
        if (ta.value.trim()) { ta.classList.remove('bad'); $('#entryErr').classList.remove('on'); }
      });
      ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save(); });
      $('#save').addEventListener('click', save);
      $('#why').addEventListener('click', async () => {
        T.explain = !T.explain;
        if (T.explain && !T.why[T.active]) {
          try { T.why[T.active] = (await api.explanation(T.active)).text; } catch (e) { T.why[T.active] = e.message; }
        }
        render();
      });
      $('#hide')?.addEventListener('click', () => { T.explain = false; render(); });
    }
    $('#up')?.addEventListener('click', (e) => rate('up', e.currentTarget));
    $('#down')?.addEventListener('click', (e) => rate('down', e.currentTarget));
  },
};

