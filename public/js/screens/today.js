/**
 * S-03 and S-04 — the question of the day, writing, and what happens after.
 *
 * This one screen has four states and they are all here on purpose, because a
 * person moves between them in a few seconds and a page reload between them
 * would lose the text:
 *
 *   asking     the question, the empty box          (S-03a / S-03b)
 *   analysing  saved, topics being worked out       (S-04, the brief state)
 *   saved      the entry, what moved, the rating    (S-03c)
 *   degraded   saved, but the analysis failed       (S-04b)
 *
 * The draft is kept in this browser while typing and nothing is sent until
 * Save is pressed — the promise made on the registration screen.
 */
import { api } from '../api.js';
import { draft, state } from '../state.js';
import { esc, clock, greeting, longDate, todayIso, fmt, fmtDelta } from '../dom.js';
import icons from '../icons.js';
import { radar, wireRadar } from '../components/radar.js';
import { weekStrip } from '../components/weekstrip.js';
import { toast } from '../components/toast.js';

export async function render(root) {
  root.innerHTML = `<p class="loading">Finding today's question…</p>`;

  const month = todayIso().slice(0, 7);
  // `let`, because both the profile and the calendar are refetched after a save.
  let [profile, question, calendar] = await Promise.all([
    api.profile(),
    api.todaysQuestion(),
    api.calendar(month),
  ]);

  // If the question was already answered today, open on the saved state.
  let saved = null;
  if (question.wasAnswered) {
    const { entries } = await api.entries({ from: todayIso(), to: todayIso() });
    saved = entries[0] ?? null;
  }

  let explanationOpen = false;
  let explanationText = null;
  let movements = [];
  let analysisState = saved
    ? saved.status === 'classification_failed'
      ? 'degraded'
      : 'saved'
    : 'asking';

  /* --- the profile card, shown beside or above the question --------------- */
  function profileCard() {
    // The line under the chart reports the zone the entry was actually about,
    // not simply the largest movement: a weight that fell because the entry
    // was about something else is true but is not what the person just wrote,
    // and showing it as the headline reads like a verdict on their day.
    const moved =
      movements.find((m) => m.zoneId === saved?.zone?.id) ??
      movements.find((m) => m.delta > 0) ??
      null;
    return `
      <aside class="today-profile">
        <div class="card">
          <b style="font-size:15px;color:var(--text-2)">Your profile</b>
          ${radar(profile.zones)}
          ${analysisState === 'analysing'
            ? `<p class="analyzing">${icons.spark()}<span>Finding the topics in your entry…</span></p>`
            : ''}
          ${moved
            ? `<p class="toast-inline good" style="margin-top:var(--gap-3)">
                 ${icons.check()}
                 <span>${esc(moved.zone.name)} ${fmt(moved.from)} → <b>${fmt(moved.to)}</b> after this entry</span>
               </p>`
            : ''}
          ${analysisState === 'degraded'
            ? `<p class="chip" style="margin-top:var(--gap-3)">${icons.clock()} unchanged until the topics arrive</p>`
            : ''}
          <p class="meta" style="margin-top:var(--gap-3)">
            All nine values are read out in text for screen readers · full numbers in Profile
          </p>
        </div>
      </aside>`;
  }

  function header() {
    const name = state.user?.email?.split('@')[0] ?? 'there';
    return `
      <div class="page-head">
        <h1>${esc(greeting())}, ${esc(name)}</h1>
        <p class="sub">${esc(longDate(todayIso()))} · five minutes is enough</p>
      </div>
      ${weekStrip(calendar.days)}
      <hr class="hr">`;
  }

  /* --- state 1: the question and the empty box ---------------------------- */
  function asking() {
    const stored = draft.read();
    return `
      <div class="today-main">
        <div class="card glow">
          <div class="spread">
            <span class="zone-badge" style="color:${esc(question.zone.colour)}">
              <i class="dot"></i>${esc(question.zone.name)}
            </span>
            <button class="linkbtn" data-why aria-expanded="${explanationOpen}">
              Why this question? <span class="caret ${explanationOpen ? 'open' : ''}">${icons.chevron()}</span>
            </button>
          </div>

          <p class="question">${esc(question.text)}</p>

          ${explanationOpen
            ? `<div class="explain">
                 <div class="spread">
                   <b style="color:var(--accent);font-size:14px">Why this question?</b>
                   <button class="linkbtn quiet" data-why-hide>Hide</button>
                 </div>
                 <p style="font-size:14px;color:var(--text-2);margin-top:var(--gap-2)">
                   ${explanationText ? esc(explanationText) : 'Looking it up…'}
                 </p>
                 <p class="meta" style="margin-top:var(--gap-1)">The chart moves after each entry.</p>
               </div>`
            : ''}

          <div class="field">
            <label class="label" for="entry">Your entry</label>
            <textarea class="input" id="entry" placeholder="Start writing…"
                      aria-describedby="entry-error entry-note">${esc(stored?.text ?? '')}</textarea>
            <p class="error-text" id="entry-error">${icons.warn()}<span data-text>Write a few words before saving.</span></p>
            <p class="meta" id="entry-note">
              Kept on this device as you type · nothing is sent until you save · Ctrl/⌘ + Enter saves
            </p>
          </div>

          <button class="btn block" data-save>Save entry</button>
        </div>
      </div>`;
  }

  /* --- states 3 and 4: saved, with or without the analysis ---------------- */
  function savedView() {
    const failed = analysisState === 'degraded';
    const rated = saved?.prompt?.relevanceRating;

    return `
      <div class="today-main">
        <p class="ok-line">${icons.check()} Entry saved at ${esc(clock(saved.createdAt))}</p>

        ${failed
          ? `<div class="toast-inline info">
               ${icons.info()}
               <span>The topics will be added shortly — the analysis did not respond.
               Your entry is safe and your profile is unchanged.</span>
             </div>`
          : ''}

        <div class="card">
          <div class="spread">
            ${saved.zone
              ? `<span class="zone-badge" style="color:${esc(saved.zone.colour)}"><i class="dot"></i>${esc(saved.zone.name)}</span>`
              : `<span class="chip">${icons.clock()} topics pending</span>`}
            <span class="meta">saved ${esc(clock(saved.createdAt))}</span>
          </div>
          <p style="color:var(--text-2);margin-top:var(--gap-3);white-space:pre-wrap">${esc(saved.text)}</p>
          <p class="meta" style="margin-top:var(--gap-2)">Saved · read-only</p>
        </div>

        ${movements.length > 1
          ? `<div class="card quiet">
               <b style="font-size:14px">What moved</b>
               <ul style="margin-top:var(--gap-2)">
                 ${movements.slice(0, 4).map((m) => `
                   <li class="spread" style="padding:5px 0;font-size:14px">
                     <span class="zone-badge" style="color:${esc(m.zone.colour)}"><i class="dot"></i>${esc(m.zone.name)}</span>
                     <span><span class="meta">${fmt(m.from)} →</span> <b>${fmt(m.to)}</b>
                     <span class="${m.delta > 0 ? 'ok-line' : 'meta'}" style="display:inline;margin:0">${fmtDelta(m.delta)}</span></span>
                   </li>`).join('')}
               </ul>
             </div>`
          : ''}

        <div class="card glow">
          <b>Was this question relevant to you?</b>
          <div class="rate">
            <button data-rate="up" aria-pressed="${rated === true}">
              ${icons.thumb(rated === true ? '#9B8CFF' : '#C9C6E8', true)} Relevant
            </button>
            <button data-rate="down" aria-pressed="${rated === false}">
              ${icons.thumb(rated === false ? '#9B8CFF' : '#C9C6E8', false)} Not relevant
            </button>
          </div>
          <p class="meta" style="margin-top:var(--gap-3)">
            Optional — it is the one thing the diary cannot work out by itself.
          </p>
        </div>

        <p style="font-size:14px;color:var(--text-2);margin-top:var(--gap-3)">
          Next question tomorrow &nbsp;·&nbsp;
          <button class="linkbtn" data-go="#/history">See your history ›</button>
        </p>
      </div>`;
  }

  function draw() {
    root.innerHTML = `
      <section>
        ${header()}
        <div class="today-grid">
          ${profileCard()}
          ${analysisState === 'asking' ? asking() : savedView()}
        </div>
      </section>`;

    wireRadar(root, profile.zones);
    wire();
  }

  /* --- behaviour ---------------------------------------------------------- */
  async function showExplanation() {
    explanationOpen = true;
    draw();
    if (explanationText) return;
    try {
      const result = await api.explanation(question.promptShownId);
      explanationText = result.text;
    } catch {
      explanationText = 'The explanation could not be loaded just now.';
    }
    if (explanationOpen) draw();
  }

  async function save() {
    const box = root.querySelector('#entry');
    const button = root.querySelector('[data-save]');
    const text = box.value.trim();

    const error = root.querySelector('#entry-error');
    if (!text) {
      error.classList.add('on');
      box.setAttribute('aria-invalid', 'true');
      box.focus();
      return;
    }

    button.disabled = true;
    button.textContent = 'Saving…';
    analysisState = 'analysing';

    try {
      const result = await api.saveEntry(text, question.promptShownId);
      draft.clear();

      saved = result.entry;
      movements = result.weightChanges ?? [];
      analysisState = result.analysis === 'classified' ? 'saved' : 'degraded';

      if (result.analysis === 'skipped_no_consent') {
        toast('Saved. Analysis is off, so your profile did not change.', 'info', 6000);
      }

      // Refresh the chart and the week strip so both show the new state.
      ([profile, calendar] = await Promise.all([api.profile(), api.calendar(month)]));
      draw();
      root.querySelector('.ok-line')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (err) {
      // The text is still in the box and still in the draft: nothing is lost.
      analysisState = 'asking';
      draw();
      toast(
        err.code === 'OFFLINE'
          ? 'No connection. Your text is still here — try Save again in a moment.'
          : err.message,
        'warn',
        6000,
      );
    }
  }

  async function rate(relevant) {
    try {
      await api.rateQuestion(question.promptShownId, relevant);
      if (saved?.prompt) saved.prompt.relevanceRating = relevant;
      draw();
      toast('Thank you — that is what tells the diary whether it chose well.', 'good');
    } catch (error) {
      toast(error.message, 'warn');
    }
  }

  function wire() {
    root.querySelector('[data-why]')?.addEventListener('click', () => {
      if (explanationOpen) { explanationOpen = false; draw(); } else { showExplanation(); }
    });
    root.querySelector('[data-why-hide]')?.addEventListener('click', () => {
      explanationOpen = false;
      draw();
    });

    const box = root.querySelector('#entry');
    if (box) {
      // Keep the draft on this device. Nothing leaves the browser here.
      box.addEventListener('input', () => {
        draft.write(box.value);
        if (box.value.trim()) {
          root.querySelector('#entry-error')?.classList.remove('on');
          box.setAttribute('aria-invalid', 'false');
        }
      });
      box.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          save();
        }
      });
    }

    root.querySelector('[data-save]')?.addEventListener('click', save);
    root.querySelector('[data-rate="up"]')?.addEventListener('click', () => rate(true));
    root.querySelector('[data-rate="down"]')?.addEventListener('click', () => rate(false));
  }

  draw();
}

export default { render };
