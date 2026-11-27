/**
 * S-02 · the quiz inside the eye.
 *
 * The first scroll (or swipe, click, key) brings statement 1 up over the
 * eye. Each answer flies the camera one step deeper: through the pupil
 * around answer six and into the tunnel for the last ones. Back flies out
 * again. The picture is the Three.js scene in ../../eye/scene.js; this
 * component is everything you read and click: the cards, the progress, the
 * keys. Answers go to the parent (Quiz.jsx), which saves each one as it is
 * given.
 */
import { useEffect, useRef, useState } from 'react';
import { createEyeScene } from '../../eye/scene.js';
import { zc, zl } from '../../lib/zones.js';
import { reduceMotion } from '../../lib/format.js';

// statement 1 already sits one step inside; the ninth answer reaches the tunnel's heart
const depthFor = (step) => (step + 1) / 10;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export default function EyeQuiz({ statements, answers, step: savedStep, onAnswer, onStep, onFinish, onClassic }) {
  const host = useRef(null), canvas = useRef(null), closer = useRef(null), rail = useRef(null);
  const scene = useRef(null);
  const [phase, setPhase] = useState('rest'); // rest → quiz → done
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false); // the card slides out after an answer
  const busy = useRef(false);
  // The event listeners below read the phase and the step from here. It is
  // updated at the moment they change, not on the next render, so a key
  // pressed in between cannot answer the same statement twice.
  const live = useRef({ phase: 'rest', step: 0 });
  const calm = reduceMotion();
  const toPhase = (ph) => { live.current.phase = ph; setPhase(ph); scene.current?.setPhase(ph); };
  const toStep = (n) => { live.current.step = n; setStep(n); };

  function startQuiz(at = 0) {
    if (live.current.phase !== 'rest') return;
    toPhase('quiz'); toStep(at);
    scene.current?.setTarget(depthFor(at));
  }

  function choose(v) {
    const { phase: ph, step: s } = live.current;
    if (busy.current || ph !== 'quiz') return;
    busy.current = true;
    onAnswer(s, v);
    // one step deeper; the push is gentle at the eye and strong in the tunnel
    scene.current?.setTarget(depthFor(s + 1));
    scene.current?.kick();
    setTimeout(() => { if (!calm) setLeaving(true); }, 200);
    setTimeout(() => {
      busy.current = false;
      setLeaving(false);
      if (s >= 8) {
        toPhase('done');
        scene.current?.setTarget(1);
        scene.current?.kick(0.5);
        return;
      }
      toStep(s + 1);
      onStep(s + 1);
    }, calm ? 120 : 620);
  }

  function back() {
    const s = live.current.step;
    if (s === 0 || busy.current) return;
    toStep(s - 1);
    onStep(s - 1);
    scene.current?.setTarget(depthFor(s - 1)); // fly back out by one step
  }

  function enter() {
    if (calm) { onFinish(); return; }
    scene.current?.flash();
    setTimeout(onFinish, 900);
  }

  /* the scene: built on mount, disposed on unmount */
  useEffect(() => {
    const s = createEyeScene(host.current, canvas.current, {
      onLost: onClassic,
      onDepth: (p) => {
        // "look closer" appears as the camera slips through the pupil
        if (closer.current) closer.current.style.opacity = String(sm(0.6, 0.68, p) * (1 - sm(0.8, 0.88, p)));
        if (rail.current) rail.current.style.height = `${(p * 100).toFixed(1)}%`;
      },
    });
    if (!s) { onClassic(); return undefined; }
    scene.current = s;
    document.documentElement.style.overflow = 'hidden';
    // some answers already given: resume at that depth, with that statement up
    if (answers.some((a) => a !== null)) {
      const at = Math.max(0, savedStep);
      toPhase('quiz'); toStep(at);
      s.jump(depthFor(at));
    }
    s.start();
    return () => {
      s.dispose();
      scene.current = null;
      document.documentElement.style.overflow = '';
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* input: scroll, swipe, pointer, keys */
  useEffect(() => {
    const el = host.current;
    let touchY = null;
    const onWheel = (e) => { e.preventDefault(); if (e.deltaY > 0) startQuiz(); };
    const onTouchStart = (e) => { touchY = e.touches[0].clientY; };
    const onTouchMove = (e) => {
      if (touchY === null) return;
      if (touchY - e.touches[0].clientY > 24) { startQuiz(); touchY = null; }
      if (live.current.phase === 'rest') e.preventDefault();
    };
    const onTouchEnd = () => { touchY = null; };
    const onPointer = (e) => scene.current?.pointer((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
    // a click anywhere on the eye starts the quiz too (but not on a button)
    const onClick = (e) => { if (live.current.phase === 'rest' && !e.target.closest('button')) startQuiz(); };
    const onKey = (e) => {
      const k = e.key, ph = live.current.phase;
      if (ph === 'rest') {
        if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(k) || /^[1-5]$/.test(k)) { startQuiz(); e.preventDefault(); }
      } else if (ph === 'quiz') {
        if (/^[1-5]$/.test(k)) { choose(+k); e.preventDefault(); } else if (k === 'Backspace' || k === 'ArrowLeft') { back(); e.preventDefault(); }
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('pointermove', onPointer);
    el.addEventListener('click', onClick);
    addEventListener('keydown', onKey, true);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('pointermove', onPointer);
      el.removeEventListener('click', onClick);
      removeEventListener('keydown', onKey, true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stage = phase === 'rest' ? 'Calibration standby'
    : phase === 'quiz' ? `Sequence ${String(step + 1).padStart(2, '0')} / 09` : 'Profile calibrated';

  return (
    <div id="eyeIntro" ref={host} className={phase !== 'rest' ? 'ei-started' : ''} role="region" aria-label="Onboarding: nine statements that set your starting profile">
      <canvas id="eyeCanvas" ref={canvas} aria-hidden="true" />
      <div className="ei-hud">
        <div className="ei-top">
          <span className="ei-brand"><i />reflection diary</span>
          <span className="ei-stage" aria-live="off">{stage}</span>
          <button className="ei-classic" type="button" onClick={onClassic}>Classic quiz</button>
        </div>

        <div className="ei-intro">
          <h2 className="ei-title">The eyes</h2>
          <p className="ei-line">They reveal what words conceal</p>
        </div>
        <p className="ei-closer" ref={closer}>look closer</p>

        <button className="ei-scroll" type="button" aria-label="Begin: nine statements that set your starting profile" onClick={() => startQuiz()}>
          <span className="ei-wheel" aria-hidden="true" />Scroll to begin · 9 statements
        </button>
        <div className="ei-rail" aria-hidden="true"><b>DEPTH</b><i ref={rail} /></div>

        <section className="ei-quiz" hidden={phase !== 'quiz'} aria-live="polite">
          {phase === 'quiz' && (
            <>
              <div className="ei-segs" aria-hidden="true">
                {statements.map((_, i) => <i key={i} className={`${i !== step && answers[i] !== null ? 'done' : ''} ${i === step ? 'now' : ''}`} />)}
              </div>
              <StatementCard
                key={step} statement={statements[step]} step={step} value={answers[step]} leaving={leaving}
                onChoose={choose} onBack={back}
              />
            </>
          )}
        </section>

        <section className="ei-done" hidden={phase !== 'done'}>
          {phase === 'done' && <DoneCard statements={statements} answers={answers} onEnter={enter} />}
        </section>
      </div>
    </div>
  );
}

function StatementCard({ statement, step, value, leaving, onChoose, onBack }) {
  const card = useRef(null);
  const [hover, setHover] = useState(false); // no hover glow until the pointer actually moves
  const n = String(step + 1).padStart(2, '0');
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, []);
  return (
    <div
      ref={card} tabIndex={-1} className={`ei-card ${leaving ? 'out' : 'in'}${hover ? '' : ' nohover'}`}
      style={{ '--z': zc(statement.zoneId) }} onPointerMove={() => setHover(true)}
    >
      <div className="ei-cardhead">
        <span>Statement {n} / 09</span>
        <span className="ei-zone"><i />{zl(statement.zoneId)}</span>
      </div>
      <p className="ei-stmt" id="eiStmt">“{statement.text}”</p>
      <div className="ei-scale" role="group" aria-labelledby="eiStmt" aria-describedby="eiScaleLbl">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} type="button" aria-pressed={value === v} aria-label={`${v} of 5`} onClick={() => onChoose(v)}>
            {v}<kbd>{v}</kbd>
          </button>
        ))}
      </div>
      <div className="ei-scalelbl" id="eiScaleLbl"><span>not like me</span><span>very like me</span></div>
      <div className="ei-foot">
        <button className="ei-back" type="button" disabled={step === 0} onClick={onBack}>‹ Back</button>
        <span>Press 1–5 · saved as you go</span>
      </div>
    </div>
  );
}

function DoneCard({ statements, answers, onEnter }) {
  const button = useRef(null);
  useEffect(() => { button.current?.focus({ preventScroll: true }); }, []);
  // the same rule as the server: weight = (answer - 1) / 4
  const top = statements.map((s, i) => ({ zone: s.zoneId, w: ((answers[i] ?? 1) - 1) / 4 }))
    .sort((a, b) => b.w - a.w).slice(0, 3);
  return (
    <div className="ei-card in">
      <div className="ei-cardhead"><span>Calibration complete</span><span>9 / 9</span></div>
      <h2>Your starting profile is ready</h2>
      <p>The first questions come from the zones you rated highest. Every entry you write moves the profile a little from here.</p>
      <ul className="ei-top3">
        {top.map((z) => (
          <li key={z.zone} style={{ '--z': zc(z.zone) }}>
            <span>{zl(z.zone)}</span><span className="ei-bar"><i style={{ width: `${z.w * 100}%` }} /></span><b>{z.w.toFixed(2)}</b>
          </li>
        ))}
      </ul>
      <button className="ei-enter" type="button" ref={button} onClick={onEnter}>Enter the diary</button>
      <p className="ei-note">You can change these numbers later in Profile</p>
    </div>
  );
}
