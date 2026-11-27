/**
 * S-01a Register · S-01b Log in · "Forgot password?" · the page after deletion.
 *
 * Register asks for an optional name (only for the greeting), an e-mail, a
 * password and the two consents. Both consents are required: without the
 * AI consent the diary cannot choose questions, so the button stays off and
 * says which tick is missing. The checks in the browser are a convenience;
 * the server checks everything again.
 */
import { useState } from 'react';
import { api } from '../lib/api.js';
import { useDiary } from '../state/DiaryContext.jsx';
import { go } from '../state/nav.js';
import { Lock, Key, Trash } from '../components/Icon.jsx';
import { Dialog, DialogText, FieldError, PasswordInput } from '../components/ui.jsx';

const okEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/* ---------- S-01a register ---------- */
export function Register() {
  const { signIn } = useDiary();
  const [form, setForm] = useState({ name: '', email: '', password: '', privacy: false, ai: false });
  const [errors, setErrors] = useState({ email: null, password: null });
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(null);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const emailError = (v) => (v && !okEmail(v) ? 'Enter a valid e-mail address.' : null);
  const passwordError = (v) => (v && v.length < 8 ? 'Use at least 8 characters.' : null);
  const consented = form.privacy && form.ai;
  const consentHint = consented ? ' '
    : !form.ai ? 'Tick the AI consent to continue — the diary cannot choose questions without it.'
      : 'Tick the Privacy Notice to continue.';

  async function create() {
    const e = { email: okEmail(form.email) ? null : 'Enter a valid e-mail address.', password: form.password.length < 8 ? 'Use at least 8 characters.' : null };
    setErrors(e);
    if (e.email || e.password) { document.getElementById(e.email ? 'em' : 'pw').focus(); return; }
    setBusy(true);
    setHint(null);
    try {
      signIn(await api.register({
        name: form.name.trim(), email: form.email.trim(), password: form.password,
        acceptPrivacyNotice: form.privacy, acceptAiProcessing: form.ai,
      }));
      go('quiz');
    } catch (error) {
      setBusy(false);
      if (error.code === 'EMAIL_TAKEN') { setErrors({ email: error.message, password: null }); document.getElementById('em').focus(); return; }
      const f = error.fields;
      if (f.email || f.password) setErrors({ email: f.email ?? null, password: f.password ? 'Use at least 8 characters.' : null });
      else setHint(error.message);
    }
  }

  return (
    <>
      <h1>Create your account</h1>
      <p className="sub">Three questions a day to choose from, picked from what you write about.</p>
      <div className="trust">
        <span><Lock /> Entries encrypted at rest</span>
        <span><Key /> Only entry text leaves the app</span>
        <span><Trash /> Delete everything at any time</span>
      </div>
      <div className="card glow">
        <label className="lbl" htmlFor="nm" style={{ marginTop: 0 }}>What should the diary call you? <span className="opt">optional</span></label>
        <input id="nm" type="text" autoComplete="given-name" maxLength={40} placeholder="First name or a nickname"
          aria-describedby="nmHint" value={form.name} onChange={(e) => set('name')(e.target.value)} />
        <p className="hint" id="nmHint">Only used to greet you. Leave it empty and the diary just says “Good evening”.</p>

        <label className="lbl" htmlFor="em">E-mail</label>
        <input id="em" type="email" placeholder="you@example.com" autoComplete="email" aria-describedby="emErr"
          className={errors.email ? 'bad' : ''} value={form.email}
          onChange={(e) => { set('email')(e.target.value); setErrors((x) => ({ ...x, email: null })); }}
          onBlur={() => setErrors((x) => ({ ...x, email: emailError(form.email) }))} />
        <FieldError id="emErr" on={!!errors.email}>{errors.email ?? 'Enter a valid e-mail address.'}</FieldError>

        <label className="lbl" htmlFor="pw">Password</label>
        <PasswordInput id="pw" autoComplete="new-password" describedBy="pwErr" invalid={!!errors.password}
          value={form.password}
          onChange={(v) => { set('password')(v); setErrors((x) => ({ ...x, password: null })); }}
          onBlur={() => setErrors((x) => ({ ...x, password: passwordError(form.password) }))} />
        <FieldError id="pwErr" on={!!errors.password}>Use at least 8 characters.</FieldError>
        <p className="hint" style={{ marginTop: -12 }}>At least 8 characters</p>

        <hr style={{ border: 0, borderTop: '1px solid var(--div)', margin: '18px 0' }} />
        <div className="consent">
          <input type="checkbox" id="c1" checked={form.privacy} onChange={(e) => set('privacy')(e.target.checked)} />
          <label htmlFor="c1">I have read the <u>Privacy Notice</u>.</label>
        </div>
        <div className="aibox">
          <div className="consent">
            <input type="checkbox" id="c2" checked={form.ai} onChange={(e) => set('ai')(e.target.checked)} />
            <label htmlFor="c2">Send the <b>text of my entries</b> to an AI model so it can detect topics.</label>
          </div>
          <p className="note">No e-mail, no identifier and no date of birth are sent.</p>
          <p className="note">You can withdraw this at any time in Settings.</p>
        </div>
        <p style={{ marginTop: 20 }}>
          <button className="btn block" id="create" disabled={!consented || busy} onClick={create}>{busy ? 'Creating…' : 'Create account'}</button>
        </p>
        <p className="hint" id="cHint">{hint ?? consentHint}</p>
      </div>
      <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--txt2)' }}>
        Already have an account? <button className="linkbtn" onClick={() => go('login')}>Log in</button>
      </p>
    </>
  );
}

/* ---------- "Forgot password?": e-mails a link to /reset.html ---------- */
function ForgotDialog({ open, email: initial, onClose }) {
  const [email, setEmail] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  async function send() {
    setError(null);
    const value = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) { setError('Enter a valid e-mail address.'); return; }
    setBusy(true);
    try {
      await api.forgotPassword(value);
      setSentTo(value);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  if (sentTo) {
    return (
      <Dialog open={open} onClose={onClose}>
        <DialogText title="Check your e-mail">
          <p style={{ color: 'var(--txt2)', fontSize: 15, margin: 0 }}>
            If an account exists for <b>{sentTo}</b>, a link to set a new password is on its way. It works once, for one hour. Look in the spam folder too.
          </p>
        </DialogText>
        <div className="dlgrow"><button className="btn" onClick={onClose}>Close</button></div>
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogText title="Forgot your password?">
        <p style={{ color: 'var(--txt2)', fontSize: 15, margin: '0 0 14px' }}>Enter your e-mail and we will send you a link to set a new password.</p>
      </DialogText>
      <label className="lbl" htmlFor="fem">E-mail</label>
      <input id="fem" type="email" autoComplete="email" autoFocus aria-describedby="fErr" value={email}
        onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
      <FieldError id="fErr" on={!!error}>{error ?? 'Enter a valid e-mail address.'}</FieldError>
      <div className="dlgrow">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={send}>Send link</button>
      </div>
    </Dialog>
  );
}

/* ---------- S-01b log in ---------- */
export function Login() {
  const { signIn } = useDiary();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  async function submit() {
    setError(null);
    if (!email || !password) { setError('E-mail or password is incorrect.'); document.getElementById('lpw').focus(); return; }
    setBusy(true);
    try {
      const session = await api.login({ email: email.trim(), password });
      signIn(session);
      go(session.user.onboardingCompleted ? 'today' : 'quiz');
    } catch (e) {
      setBusy(false);
      setError(e.status === 401 ? 'E-mail or password is incorrect.' : e.message);
      document.getElementById('lpw').focus();
    }
  }
  const onEnter = (e) => { if (e.key === 'Enter') submit(); };

  return (
    <>
      <h1>Welcome back</h1>
      <p className="sub">Three questions are waiting for you.</p>
      <div className="card glow">
        <label className="lbl" htmlFor="lem">E-mail</label>
        <input id="lem" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter} />
        <label className="lbl" htmlFor="lpw">Password</label>
        <PasswordInput id="lpw" autoComplete="current-password" describedBy="lErr" invalid={!!error}
          value={password} onChange={setPassword} onKeyDown={onEnter} />
        <FieldError id="lErr" on={!!error}>{error ?? 'E-mail or password is incorrect.'}</FieldError>
        <p style={{ textAlign: 'right', margin: 0 }}>
          <button className="linkbtn" id="forgot" type="button" onClick={() => setForgot(true)}>Forgot password?</button>
        </p>
        <p style={{ marginTop: 14 }}><button className="btn block" id="login" disabled={busy} onClick={submit}>Log in</button></p>
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--txt2)', margin: '12px 0 0' }}>
          New here? <button className="linkbtn" onClick={() => go('register')}>Create an account</button>
        </p>
      </div>
      {forgot && <ForgotDialog open email={email.trim()} onClose={() => setForgot(false)} />}
    </>
  );
}

/* ---------- after deletion ---------- */
export function Gone() {
  return (
    <>
      <h1>Everything has been deleted</h1>
      <p className="sub">Your account, your entries, your profile and your pilot measurements are gone.</p>
      <div className="card">
        <p style={{ margin: 0, fontSize: 14, color: 'var(--txt2)' }}>Nothing about you is left in the diary. Thank you for taking part.</p>
        <p style={{ margin: '14px 0 0' }}><button className="btn ghost" onClick={() => go('register')}>Create a new account</button></p>
      </div>
    </>
  );
}
