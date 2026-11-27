/**
 * "Set a new password" — the page the reset e-mail links to.
 *
 * The link ends in #access_token=…&type=recovery (or #error=… when it has
 * expired). The token is read from the address and removed from it at once,
 * so it stays in neither the address bar nor the history; it is then sent to
 * POST /api/auth/reset with the new password, and the person is logged in.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, token as session } from './lib/api.js';
import { FieldError, PasswordInput } from './components/ui.jsx';
import './styles/base.css';
import './styles/theme.css';

const params = new URLSearchParams(location.hash.slice(1));
const resetToken = params.get('error') ? null : params.get('access_token');
history.replaceState(null, '', location.pathname);

function ResetPage() {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(!resetToken);

  async function save() {
    setError(null);
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== repeat) { setError('The two passwords are not the same.'); return; }
    setBusy(true);
    try {
      const { token } = await api.resetPassword(resetToken, password);
      session.set(token);
      location.replace('/#/today');
    } catch (e) {
      setBusy(false);
      if (e.code === 'RESET_LINK_INVALID') setExpired(true);
      else setError(e.details[0]?.message ?? e.message);
    }
  }
  const onEnter = (e) => { if (e.key === 'Enter') save(); };

  return (
    <div className="wrap">
      <div className="app">
        <div className="topbar"><a className="brand" href="/" style={{ color: 'inherit', textDecoration: 'none' }}>reflection diary</a></div>
        <main id="main" aria-live="polite">
          <h1>Set a new password</h1>
          <p className="sub">Choose a password you have not used here before.</p>
          {expired ? (
            <div className="card">
              <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 17 }}>This link does not work any more</p>
              <p style={{ margin: '0 0 16px', color: 'var(--txt2)', fontSize: 15 }}>A reset link works once, for one hour. Ask for a new one on the log-in page: “Forgot password?”.</p>
              <a className="btn" href="/#/login" style={{ textDecoration: 'none' }}>Go to log in</a>
            </div>
          ) : (
            <div className="card glow">
              <label className="lbl" htmlFor="pw1">New password</label>
              <PasswordInput id="pw1" autoComplete="new-password" describedBy="err" value={password} onChange={setPassword} onKeyDown={onEnter} />
              <label className="lbl" htmlFor="pw2" style={{ marginTop: 14 }}>Repeat it</label>
              <PasswordInput id="pw2" autoComplete="new-password" describedBy="err" value={repeat} onChange={setRepeat} onKeyDown={onEnter} />
              <FieldError id="err" on={!!error}>{error ?? 'At least 8 characters.'}</FieldError>
              <p style={{ marginTop: 6 }}><button className="btn block" disabled={busy} onClick={save}>Save and log in</button></p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><ResetPage /></StrictMode>);
