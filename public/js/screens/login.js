/**
 * S-01b — Welcome back.
 *
 * One message for a wrong e-mail and a wrong password, matching what the
 * server returns: telling the two apart would turn this form into a way of
 * finding out who has an account.
 */
import { api } from '../api.js';
import { signIn } from '../state.js';
import { on, setFieldError } from '../dom.js';
import icons from '../icons.js';
import { navigate } from '../router.js';

export function render(root) {
  root.innerHTML = `
    <section class="auth-screen">
      <h1>Welcome back</h1>
      <p class="sub">One question is waiting for you.</p>

      <form class="card glow" id="login-form" novalidate>
        <div class="field">
          <label class="label" for="email">E-mail</label>
          <input class="input" id="email" type="email" inputmode="email" autocomplete="email">
        </div>

        <div class="field">
          <label class="label" for="password">Password</label>
          <div class="input-wrap">
            <input class="input" id="password" type="password" autocomplete="current-password"
                   aria-describedby="password-error">
            <button type="button" class="reveal" id="reveal" aria-label="Show password">${icons.eye('#8B89A3')}</button>
          </div>
          <p class="error-text" id="password-error">${icons.warn()}<span data-text>E-mail or password is incorrect.</span></p>
        </div>

        <p style="margin-top:var(--gap-3)">
          <button class="btn block" id="submit" type="submit">Log in</button>
        </p>
      </form>

      <p class="auth-switch">
        New here?
        <button class="linkbtn" data-go="#/register">Create an account</button>
      </p>
    </section>`;

  const form = root.querySelector('#login-form');
  const email = root.querySelector('#email');
  const password = root.querySelector('#password');
  const submit = root.querySelector('#submit');

  on('#reveal', 'click', (event) => {
    const shown = password.type === 'text';
    password.type = shown ? 'password' : 'text';
    event.currentTarget.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
  });

  password.addEventListener('input', () => setFieldError('password', null));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFieldError('password', null);
    submit.disabled = true;
    submit.textContent = 'Logging in…';

    try {
      const result = await api.login({ email: email.value.trim(), password: password.value });
      signIn(result);
      navigate(result.user.onboardingCompleted ? '#/today' : '#/quiz');
    } catch (error) {
      setFieldError('password', error.message);
      submit.disabled = false;
      submit.textContent = 'Log in';
      password.focus();
    }
  });
}

export default { render };
