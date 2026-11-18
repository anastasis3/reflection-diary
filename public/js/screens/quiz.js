/**
 * S-02 · the onboarding quiz: nine statements, one per zone, answered 1-5.
 *
 * Two faces, one set of answers:
 *   - the eye intro (js/eye.js, Three.js): opens by default when WebGL works;
 *     every answer flies the camera one step deeper into the eye;
 *   - the classic card below: for no WebGL, reduced motion, or a click on
 *     "Classic quiz".
 * Both read and write the quiz only through window.EYE_API. Each answer is
 * saved to the server as it is given (POST /onboarding/answers), so the quiz
 * can be left and resumed. "Finish" turns the answers into the nine starting
 * weights on the server: weight = (answer - 1) / 4.
 */
import { api } from '../api.js';
import { S, ZC, zl, esc, $, $$, go, render, notice } from '../core.js';
import { loadProfile } from '../data.js';

const Q = { statements: [], answers: [], step: 0 };

async function finishQuiz() {
  try {
    await api.completeOnboarding();
    S.user.onboardingCompleted = true;
    await loadProfile();
    S.eyeOff = false;
    go('today');
  } catch (error) {
    S.eyeOff = true; // show the classic card, which can display the message
    go('quiz');
    notice(error.message);
  }
}

function answer(i, v) {
  Q.answers[i] = v;
  api.answerStatement(Q.statements[i].zoneId, v).catch((e) => notice(`Could not save that answer: ${e.message}`));
}

/* The eye intro reads and writes the quiz only through this. */
window.EYE_API = {
  statements: () => Q.statements.map((s) => ({ zone: s.zoneId, text: esc(s.text), name: esc(zl(s.zoneId)), colour: ZC[s.zoneId] })),
  answers: () => Q.answers.slice(),
  step: () => Q.step,
  answer,
  setStep(i) { Q.step = i; },
  finish: finishQuiz,
  classic() { S.eyeOff = true; render(); },
};

export const quiz = {
  async load() {
    const state = await api.onboarding();
    Q.statements = state.statements;
    Q.answers = state.statements.map((s) => s.value ?? null);
    Q.step = Math.max(0, (state.nextStep ?? state.total) - 1);
  },

  view() {
    if (!Q.statements.length) return '<p class="sub">Loading…</p>';
    const { text } = Q.statements[Q.step], val = Q.answers[Q.step];
    return `
  <h1>A few words about you</h1>
  <p class="sub">Nine short statements · about three minutes · they set your starting profile</p>
  <div class="spread" style="margin-bottom:2px">
    <b style="font-size:14px;color:var(--txt2)">Statement ${Q.step + 1} of 9</b>
    <span class="meta">Answers are saved as you go</span>
  </div>
  <div class="steps">${Q.statements.map((_, i) => `<i class="${i < Q.step ? 'done' : (i === Q.step ? 'now' : '')}"></i>`).join('')}</div>
  <div class="card glow">
    <p style="font-size:20px;font-weight:600;line-height:1.35;margin:0">“${esc(text)}”</p>
    <div class="scale" role="group" aria-label="1 not like me to 5 very like me">
      ${[1, 2, 3, 4, 5].map((n) => `<button data-val="${n}" aria-pressed="${val === n}">${n}</button>`).join('')}
    </div>
    <div class="scalelabels"><span>not like me</span><span>very like me</span></div>
    <p class="meta" style="text-align:center;margin:10px 0 0">or press 1 – 5 on the keyboard</p>
  </div>
  <div class="spread">
    <button class="btn ghost" id="back" ${Q.step === 0 ? 'disabled' : ''}>Back</button>
    <span class="row">
      <span class="hint" id="qHint">${val === null ? 'Choose a value to continue' : ''}</span>
      <button class="btn" id="next" ${val === null ? 'disabled' : ''}>${Q.step === 8 ? 'Finish' : 'Next'}</button>
    </span>
  </div>`;
  },

  wire() {
    $$('.scale button').forEach((b) => b.addEventListener('click', () => { answer(Q.step, +b.dataset.val); render(); $('#next')?.focus(); }));
    $('#back')?.addEventListener('click', () => { if (Q.step > 0) { Q.step -= 1; render(); } });
    $('#next')?.addEventListener('click', () => {
      if (Q.answers[Q.step] === null) return;
      if (Q.step === 8) finishQuiz(); else { Q.step += 1; render(); }
    });
  },
};

// 1-5 on the keyboard answers the classic card (the eye has its own handler,
// captured earlier, which stops the key from reaching this one).
document.addEventListener('keydown', (e) => {
  if (S.screen !== 'quiz' || !/^[1-5]$/.test(e.key) || !Q.statements.length) return;
  if (e.target.closest?.('input, textarea')) return;
  answer(Q.step, +e.key);
  render();
});
