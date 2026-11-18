/**
 * S-01a Register · S-01b Log in · the page after deletion.
 *
 * Register asks for an optional name (only for the greeting), an e-mail, a
 * password and the two consents. Both consents are required: without the
 * AI consent the diary cannot choose questions, so the button stays off and
 * says which tick is missing. The checks in the browser are a convenience;
 * the server checks everything again.
 */
import { api, token } from '../api.js';
import { S, ICON, $, go, openDialog } from '../core.js';

const okEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

function signedIn({ user, token: value }) {
  token.set(value);
  S.user = user;
  go(user.onboardingCompleted ? 'today' : 'quiz');
}

/* ---------- S-01a register ---------- */
export const register = {
  view: () => `
  <h1>Create your account</h1>
  <p class="sub">Three questions a day to choose from, picked from what you write about.</p>
  <div class="trust">
    <span>${ICON.lock()} Entries encrypted at rest</span>
    <span>${ICON.key()} Only entry text leaves the app</span>
    <span>${ICON.trash()} Delete everything at any time</span>
  </div>
  <div class="card glow">
    <label class="lbl" for="nm" style="margin-top:0">What should the diary call you? <span class="opt">optional</span></label>
    <input id="nm" type="text" autocomplete="given-name" maxlength="40" placeholder="First name or a nickname" aria-describedby="nmHint">
    <p class="hint" id="nmHint">Only used to greet you. Leave it empty and the diary just says “Good evening”.</p>
    <label class="lbl" for="em">E-mail</label>
    <input id="em" type="email" placeholder="you@example.com" autocomplete="email" aria-describedby="emErr">
    <p class="err" id="emErr">${ICON.warn('#FF9B8A', 13)} <span>Enter a valid e-mail address.</span></p>
    <label class="lbl" for="pw">Password</label>
    <div style="position:relative">
      <input id="pw" type="password" autocomplete="new-password" aria-describedby="pwErr">
      <button class="linkbtn" id="revealPw" type="button" aria-label="Show password" style="position:absolute;right:12px;top:12px">${ICON.eye()}</button>
    </div>
    <p class="err" id="pwErr">${ICON.warn('#FF9B8A', 13)} Use at least 8 characters.</p>
    <p class="hint" style="margin-top:-12px">At least 8 characters</p>
    <hr style="border:0;border-top:1px solid var(--div);margin:18px 0">
    <div class="consent"><input type="checkbox" id="c1"><label for="c1">I have read the <u>Privacy Notice</u>.</label></div>
    <div class="aibox">
      <div class="consent"><input type="checkbox" id="c2"><label for="c2">Send the <b>text of my entries</b> to an AI model so it can detect topics.</label></div>
      <p class="note">No e-mail, no identifier and no date of birth are sent.</p>
      <p class="note">You can withdraw this at any time in Settings.</p>
    </div>
    <p style="margin-top:20px"><button class="btn block" id="create" disabled>Create account</button></p>
    <p class="hint" id="cHint">Tick the AI consent to continue — the diary cannot choose questions without it.</p>
  </div>
  <p style="text-align:center;font-size:14px;color:var(--txt2)">Already have an account?
    <button class="linkbtn" data-nav="login">Log in</button></p>`,

  wire() {
    const em = $('#em'), pw = $('#pw'), c1 = $('#c1'), c2 = $('#c2'), btn = $('#create'), hint = $('#cHint');
    const showErr = (input, box, bad, text) => {
      input.classList.toggle('bad', bad); $(box).classList.toggle('on', bad);
      const span = $(box).querySelector('span');
      if (text && span) span.textContent = text;
    };
    const upd = () => {
      btn.disabled = !(c1.checked && c2.checked);
      hint.textContent = c1.checked && c2.checked ? ' '
        : !c2.checked ? 'Tick the AI consent to continue — the diary cannot choose questions without it.'
          : 'Tick the Privacy Notice to continue.';
    };
    [c1, c2].forEach((c) => c.addEventListener('change', upd)); upd();
    $('#revealPw').addEventListener('click', () => { pw.type = pw.type === 'password' ? 'text' : 'password'; });
    em.addEventListener('blur', () => showErr(em, '#emErr', Boolean(em.value) && !okEmail(em.value), 'Enter a valid e-mail address.'));
    pw.addEventListener('blur', () => showErr(pw, '#pwErr', Boolean(pw.value) && pw.value.length < 8));
    [em, pw].forEach((i) => i.addEventListener('input', () => showErr(i, i === em ? '#emErr' : '#pwErr', false)));

    btn.addEventListener('click', async () => {
      const be = !okEmail(em.value), bp = pw.value.length < 8;
      showErr(em, '#emErr', be, 'Enter a valid e-mail address.'); showErr(pw, '#pwErr', bp);
      if (be || bp) { (be ? em : pw).focus(); return; }
      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        signedIn(await api.register({
          name: $('#nm').value.trim(),
          email: em.value.trim(),
          password: pw.value,
          acceptPrivacyNotice: c1.checked,
          acceptAiProcessing: c2.checked,
        }));
      } catch (error) {
        btn.disabled = false; btn.textContent = 'Create account';
        if (error.code === 'EMAIL_TAKEN') { showErr(em, '#emErr', true, error.message); em.focus(); return; }
        const f = error.fields;
        if (f.email) showErr(em, '#emErr', true, f.email);
        if (f.password) showErr(pw, '#pwErr', true);
        if (!f.email && !f.password) hint.textContent = error.message;
      }
    });
  },
};

/* ---------- S-01b log in ---------- */
export const login = {
  view: () => `
  <h1>Welcome back</h1>
  <p class="sub">Three questions are waiting for you.</p>
  <div class="card glow">
    <label class="lbl" for="lem">E-mail</label>
    <input id="lem" type="email" autocomplete="email">
    <label class="lbl" for="lpw">Password</label>
    <div style="position:relative">
      <input id="lpw" type="password" autocomplete="current-password" aria-describedby="lErr">
      <button class="linkbtn" id="revealLpw" type="button" aria-label="Show password" style="position:absolute;right:12px;top:12px">${ICON.eye()}</button>
    </div>
    <p class="err" id="lErr">${ICON.warn('#FF9B8A', 13)} <span>E-mail or password is incorrect.</span></p>
    <p style="text-align:right;margin:0"><button class="linkbtn" id="forgot" type="button">Forgot password?</button></p>
    <p style="margin-top:14px"><button class="btn block" id="login">Log in</button></p>
    <p style="text-align:center;font-size:14px;color:var(--txt2);margin:12px 0 0">New here?
      <button class="linkbtn" data-nav="register">Create an account</button></p>
  </div>`,

  wire() {
    const em = $('#lem'), pw = $('#lpw'), btn = $('#login'), err = $('#lErr');
    $('#revealLpw').addEventListener('click', () => { pw.type = pw.type === 'password' ? 'text' : 'password'; });
    $('#forgot').addEventListener('click', () => openDialog(`<h2 style="margin:0 0 10px;font-size:18px">Forgot your password?</h2>
      <p style="color:var(--txt2);font-size:15px;margin:0">Password reset by e-mail is not part of the pilot yet. Write to the researcher and the password will be reset for you.</p>
      <div class="dlgrow"><button class="btn" data-close>Close</button></div>`));
    const submit = async () => {
      err.classList.remove('on'); pw.classList.remove('bad');
      if (!em.value || !pw.value) { pw.classList.add('bad'); err.classList.add('on'); pw.focus(); return; }
      btn.disabled = true;
      try {
        signedIn(await api.login({ email: em.value.trim(), password: pw.value }));
      } catch (error) {
        btn.disabled = false;
        err.querySelector('span').textContent = error.status === 401 ? 'E-mail or password is incorrect.' : error.message;
        pw.classList.add('bad'); err.classList.add('on'); pw.focus();
      }
    };
    btn.addEventListener('click', submit);
    [em, pw].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
  },
};

/* ---------- after deletion ---------- */
export const gone = {
  view: () => `<h1>Everything has been deleted</h1>
  <p class="sub">Your account, your entries, your profile and your pilot measurements are gone.</p>
  <div class="card"><p style="margin:0;font-size:14px;color:var(--txt2)">Nothing about you is left in the diary. Thank you for taking part.</p>
    <p style="margin:14px 0 0"><button class="btn ghost" data-nav="register">Create a new account</button></p></div>`,
};

