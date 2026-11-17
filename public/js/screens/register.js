/**
 * S-01a — Create your account.
 *
 * The two consents are separate and neither is pre-ticked. The second one is
 * the honest part: the diary cannot choose a question without reading what was
 * written, so the screen says that plainly instead of burying it in a privacy
 * policy, and the button stays disabled until both are given.
 */
import { api } from '../api.js';
import { signIn } from '../state.js';
import { esc, on, setFieldError } from '../dom.js';
import icons from '../icons.js';
import { navigate } from '../router.js';
import { toast } from '../components/toast.js';

export function render(root) {
  root.innerHTML = `
    <section class="auth-screen">
      <h1>Create your account</h1>
      <p class="sub">One question a day, chosen from what you write about.</p>

      <div class="trust">
        <span>${icons.lock('#9B8CFF')} Entries are kept on your account alone</span>
        <span>${icons.key('#9B8CFF')} Only the text of an entry is analysed</span>
        <span>${icons.trash('#9B8CFF')} Delete everything at any time</span>
      </div>

      <form class="card glow" id="register-form" novalidate>
        <div class="field">
          <label class="label" for="email">E-mail</label>
          <input class="input" id="email" name="email" type="email" inputmode="email"
                 autocomplete="email" placeholder="you@example.com" aria-describedby="email-error">
          <p class="error-text" id="email-error">${icons.warn()}<span data-text>Enter a valid e-mail address.</span></p>
        </div>

        <div class="field">
          <label class="label" for="password">Password</label>
          <div class="input-wrap">
            <input class="input" id="password" name="password" type="password"
                   autocomplete="new-password" aria-describedby="password-error password-hint">
            <button type="button" class="reveal" id="reveal" aria-label="Show password">${icons.eye('#8B89A3')}</button>
          </div>
          <p class="error-text" id="password-error">${icons.warn()}<span data-text>Use at least 8 characters.</span></p>
          <p class="hint" id="password-hint">At least 8 characters.</p>
        </div>

        <hr class="hr" style="margin:var(--gap-4) 0">

        <div class="consent">
          <input type="checkbox" id="consent-privacy">
          <label for="consent-privacy">I have read the <u>Privacy Notice</u>.</label>
        </div>

        <div class="ai-box">
          <div class="consent">
            <input type="checkbox" id="consent-ai">
            <label for="consent-ai">
              Send the <b>text of my entries</b> for analysis, so the diary can find the topics in them.
            </label>
          </div>
          <p class="note">No e-mail address and no identifier are sent with it.</p>
          <p class="note">You can withdraw this at any time in Settings.</p>
        </div>

        <p style="margin-top:var(--gap-4)">
          <button class="btn block" id="submit" type="submit" disabled>Create account</button>
        </p>
        <p class="hint" id="consent-hint">
          Tick the analysis consent to continue — the diary cannot choose questions without it.
        </p>
      </form>

      <p class="auth-switch">
        Already have an account?
        <button class="linkbtn" data-go="#/login">Log in</button>
      </p>
    </section>`;

  const form = root.querySelector('#register-form');
  const email = root.querySelector('#email');
  const password = root.querySelector('#password');
  const privacy = root.querySelector('#consent-privacy');
  const ai = root.querySelector('#consent-ai');
  const submit = root.querySelector('#submit');
  const hint = root.querySelector('#consent-hint');

  /** The button follows the consents, and the hint says which one is missing. */
  function refresh() {
    const ready = privacy.checked && ai.checked;
    submit.disabled = !ready;
    if (ready) hint.textContent = 'You can withdraw the analysis consent later without losing your entries.';
    else if (!ai.checked && !privacy.checked) hint.textContent = 'Both boxes are needed to continue.';
    else if (!ai.checked) hint.textContent = 'Tick the analysis consent to continue — the diary cannot choose questions without it.';
    else hint.textContent = 'Confirm that you have read the Privacy Notice.';
  }

  privacy.addEventListener('change', refresh);
  ai.addEventListener('change', refresh);
  refresh();

  on('#reveal', 'click', (event) => {
    const shown = password.type === 'text';
    password.type = shown ? 'password' : 'text';
    event.currentTarget.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
  });

  // Clear a message as soon as the person starts fixing the field.
  email.addEventListener('input', () => setFieldError('email', null));
  password.addEventListener('input', () => setFieldError('password', null));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFieldError('email', null);
    setFieldError('password', null);

    submit.disabled = true;
    submit.textContent = 'Creating your account…';

    try {
      const result = await api.register({
        email: email.value.trim(),
        password: password.value,
        acceptPrivacyNotice: privacy.checked,
        acceptAiProcessing: ai.checked,
      });
      signIn(result);
      navigate('#/quiz'); // straight into the nine statements
    } catch (error) {
      const fields = error.fields ?? {};
      if (fields.email) setFieldError('email', fields.email);
      if (fields.password) setFieldError('password', fields.password);
      if (error.code === 'EMAIL_TAKEN') {
        setFieldError('email', `${error.message} Log in instead?`);
      } else if (!fields.email && !fields.password) {
        toast(error.message, 'warn');
      }
      submit.disabled = false;
      submit.textContent = 'Create account';
      refresh();
    }
  });
}

export default { render };
