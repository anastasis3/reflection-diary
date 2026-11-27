/**
 * S-02 · the onboarding quiz: nine statements, one per zone, answered 1-5.
 *
 * Two faces, one set of answers:
 *   - the eye (EyeQuiz.jsx, Three.js): opens by default when WebGL works;
 *   - the classic card (below): for no WebGL, reduced motion, a lost GPU
 *     context, or a click on "Classic quiz".
 * Each answer is saved to the server as it is given (POST /onboarding/answers),
 * so the quiz can be left and resumed. "Finish" turns the answers into the
 * nine starting weights on the server: weight = (answer - 1) / 4.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { reduceMotion } from '../../lib/format.js';
import { useDiary } from '../../state/DiaryContext.jsx';
import { useLoad, LoadState } from '../../state/useLoad.jsx';
import { go } from '../../state/nav.js';

// Three.js is large; it is downloaded only when the eye is actually shown.
const EyeQuiz = lazy(() => import('./EyeQuiz.jsx'));

export default function Quiz() {
  const { setUser, loadProfile, notify } = useDiary();
  const [statements, setStatements] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [step, setStep] = useState(0);
  const [classic, setClassic] = useState(() => reduceMotion());
  const zoneOf = useRef([]); // statement index -> zone id, for saving an answer

  const state = useLoad(async () => {
    const quiz = await api.onboarding();
    setStatements(quiz.statements);
    zoneOf.current = quiz.statements.map((s) => s.zoneId);
    setAnswers(quiz.statements.map((s) => s.value ?? null));
    setStep(Math.max(0, (quiz.nextStep ?? quiz.total) - 1));
  });

  const answer = useCallback((i, value) => {
    setAnswers((list) => list.map((a, k) => (k === i ? value : a)));
    api.answerStatement(zoneOf.current[i], value).catch((e) => notify(`Could not save that answer: ${e.message}`));
  }, [notify]);

  const finish = useCallback(async () => {
    try {
      await api.completeOnboarding();
      await loadProfile();
      setUser((u) => ({ ...u, onboardingCompleted: true }));
      go('today');
    } catch (error) {
      setClassic(true); // the classic card can show the message
      notify(error.message);
    }
  }, [loadProfile, setUser, notify]);

  const toClassic = useCallback(() => setClassic(true), []);

  if (!state.ready) return <LoadState state={state} />;

  if (!classic) {
    return (
      <Suspense fallback={<p className="sub">Loading…</p>}>
        <EyeQuiz
          statements={statements} answers={answers} step={step}
          onAnswer={answer} onStep={setStep} onFinish={finish} onClassic={toClassic}
        />
      </Suspense>
    );
  }
  return <ClassicQuiz statements={statements} answers={answers} step={step} setStep={setStep} onAnswer={answer} onFinish={finish} />;
}

function ClassicQuiz({ statements, answers, step, setStep, onAnswer, onFinish }) {
  const value = answers[step];
  const last = step === statements.length - 1;

  // 1-5 on the keyboard answers the card
  useEffect(() => {
    const onKey = (e) => {
      if (!/^[1-5]$/.test(e.key) || e.target.closest?.('input, textarea')) return;
      onAnswer(step, +e.key);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [step, onAnswer]);

  const next = () => {
    if (value === null) return;
    if (last) onFinish(); else setStep(step + 1);
  };

  return (
    <>
      <h1>A few words about you</h1>
      <p className="sub">Nine short statements · about three minutes · they set your starting profile</p>
      <div className="spread" style={{ marginBottom: 2 }}>
        <b style={{ fontSize: 14, color: 'var(--txt2)' }}>Statement {step + 1} of 9</b>
        <span className="meta">Answers are saved as you go</span>
      </div>
      <div className="steps">
        {statements.map((_, i) => <i key={i} className={i < step ? 'done' : (i === step ? 'now' : '')} />)}
      </div>
      <div className="card glow">
        <p style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.35, margin: 0 }}>“{statements[step].text}”</p>
        <div className="scale" role="group" aria-label="1 not like me to 5 very like me">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-pressed={value === n} onClick={() => { onAnswer(step, n); document.getElementById('next')?.focus(); }}>{n}</button>
          ))}
        </div>
        <div className="scalelabels"><span>not like me</span><span>very like me</span></div>
        <p className="meta" style={{ textAlign: 'center', margin: '10px 0 0' }}>or press 1 – 5 on the keyboard</p>
      </div>
      <div className="spread">
        <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        <span className="row">
          <span className="hint">{value === null ? 'Choose a value to continue' : ''}</span>
          <button className="btn" id="next" disabled={value === null} onClick={next}>{last ? 'Finish' : 'Next'}</button>
        </span>
      </div>
    </>
  );
}
