/**
 * S-02 — the nine statements that set the starting profile.
 *
 * Each answer is sent as it is chosen, so the screen resumes where it was left
 * (US-2.4): the server already knows how far the person got, and this screen
 * simply opens at the first unanswered statement. That is why there is no
 * "save and finish later" button — there is nothing to save.
 *
 * The keyboard shortcut 1–5 is not decoration: nine statements with a mouse is
 * nine round trips to the pointer, and the quiz is the one screen a person
 * sees exactly once, where a slow first impression costs the most.
 */
import { api } from '../api.js';
import { state } from '../state.js';
import { esc } from '../dom.js';
import icons from '../icons.js';
import { navigate } from '../router.js';
import { toast } from '../components/toast.js';

export async function render(root) {
  const quiz = await api.onboarding();

  if (quiz.completed) {
    navigate('#/today');
    return;
  }

  // Resume at the first statement with no answer.
  let step = (quiz.nextStep ?? 1) - 1;
  const answers = quiz.statements.map((s) => s.value);

  function draw() {
    const statement = quiz.statements[step];
    const value = answers[step];

    root.innerHTML = `
      <section class="quiz-screen">
        <h1>A few words about you</h1>
        <p class="sub">Nine short statements · about three minutes · they set your starting profile</p>

        <div class="spread" style="margin-top:var(--gap-4)">
          <b style="font-size:14px;color:var(--text-2)">Statement ${step + 1} of ${quiz.total}</b>
          <span class="meta">Answers are saved as you go</span>
        </div>

        <div class="steps" role="progressbar" aria-valuemin="1" aria-valuemax="${quiz.total}"
             aria-valuenow="${step + 1}" aria-label="Quiz progress">
          ${quiz.statements
            .map((_, i) => `<i class="${answers[i] != null ? 'done' : ''} ${i === step ? 'now' : ''}"></i>`)
            .join('')}
        </div>

        <div class="card glow">
          <p class="quiz-statement">“${esc(statement.text)}”</p>
          <div class="scale" role="group" aria-label="1, not like me, to 5, very like me">
            ${[1, 2, 3, 4, 5]
              .map((n) => `<button type="button" data-value="${n}" aria-pressed="${value === n}">${n}</button>`)
              .join('')}
          </div>
          <div class="scale-labels"><span>not like me</span><span>very like me</span></div>
          <p class="meta" style="text-align:center;margin-top:var(--gap-2)">or press 1 – 5 on the keyboard</p>
        </div>

        <div class="quiz-actions">
          <button class="btn ghost" data-back ${step === 0 ? 'disabled' : ''}>Back</button>
          <span class="row">
            <span class="hint">${value == null ? 'Choose a value to continue' : ''}</span>
            <button class="btn" data-next ${value == null ? 'disabled' : ''}>
              ${step === quiz.total - 1 ? 'Finish' : 'Next'}
            </button>
          </span>
        </div>

        <p class="hint row" style="margin-top:var(--gap-4)">
          ${icons.info('#8B89A3', 14)} You can leave and come back — this screen resumes where you stopped.
        </p>
      </section>`;

    wire();
  }

  async function choose(n) {
    const statement = quiz.statements[step];
    answers[step] = n;
    draw(); // immediate feedback; the request follows
    try {
      await api.answerStatement(statement.zoneId, n);
    } catch (error) {
      answers[step] = null;
      toast(`That answer was not saved: ${error.message}`, 'warn');
      draw();
    }
  }

  async function finish() {
    try {
      await api.completeOnboarding();
      // The router decides where a person may go from `state.user`, so the
      // in-memory copy has to learn about this straight away. Without it the
      // guard would still think the quiz is unfinished and send them back here.
      if (state.user) state.user.onboardingCompleted = true;
      toast('Your starting profile is ready.', 'good');
      navigate('#/today');
    } catch (error) {
      toast(error.message, 'warn');
    }
  }

  function wire() {
    root.querySelectorAll('[data-value]').forEach((button) => {
      button.addEventListener('click', () => choose(Number(button.dataset.value)));
    });
    root.querySelector('[data-back]')?.addEventListener('click', () => {
      if (step > 0) { step -= 1; draw(); }
    });
    root.querySelector('[data-next]')?.addEventListener('click', () => {
      if (answers[step] == null) return;
      if (step === quiz.total - 1) { finish(); return; }
      step += 1;
      draw();
    });
  }

  // One keyboard listener for the whole screen, removed when the screen is
  // replaced, so it cannot keep firing on top of another screen.
  const onKey = (event) => {
    if (!root.isConnected || !document.body.contains(root.querySelector('.quiz-screen'))) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (event.target.matches('input, textarea')) return;
    if (/^[1-5]$/.test(event.key)) {
      event.preventDefault();
      choose(Number(event.key));
    }
  };
  document.addEventListener('keydown', onKey);

  draw();
}

export default { render };
