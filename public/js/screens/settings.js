/**
 * S-07 — Settings and privacy.
 *
 * Three promises made on the registration screen, each with a button that
 * keeps it: what is stored, withdrawing the analysis consent, and deleting
 * everything. Deletion asks for confirmation and then actually deletes —
 * there is no "deactivated" state hiding the data.
 */
import { api, token } from '../api.js';
import { signOut, state } from '../state.js';
import { esc } from '../dom.js';
import icons from '../icons.js';
import { navigate } from '../router.js';
import { toast, confirmDialog } from '../components/toast.js';

export async function render(root) {
  root.innerHTML = `<p class="loading">Loading your settings…</p>`;
  let { consents } = await api.consents();

  function draw() {
    const ai = consents.find((c) => c.purpose === 'ai_processing');

    root.innerHTML = `
      <section>
        <div class="page-head">
          <h1>Settings &amp; privacy</h1>
          <p class="sub">What is stored, what leaves the app, and how to remove it</p>
        </div>

        <div class="card">
          <b>Signed in as</b>
          <p style="font-size:14px;color:var(--text-2);margin-top:var(--gap-1)">${esc(state.user?.email ?? '')}</p>
          <p style="margin-top:var(--gap-3)"><button class="btn ghost small" data-logout>Log out</button></p>
        </div>

        <div class="card">
          <b>What is stored</b>
          <p style="font-size:14px;color:var(--text-2);margin-top:var(--gap-1)">
            Your e-mail address, your entries, the topic scores of each entry and your nine weights.
            Only the text of an entry is sent for analysis — never your e-mail address or your identifier.
            Nothing is sent while you are typing: the text leaves this device when you press Save.
          </p>
        </div>

        <div class="card">
          <div class="setting">
            <div>
              <b>Analysis of your entries</b>
              <p>
                ${ai?.active
                  ? `Consent given on ${esc((ai.grantedAt ?? '').slice(0, 10))}. Withdrawing it stops the analysis:
                     you keep writing and your entries stay, but new entries are no longer analysed
                     and your profile stops changing.`
                  : `Withdrawn on ${esc((ai?.withdrawnAt ?? '').slice(0, 10))}. Your entries are still saved,
                     and your profile is frozen at the values it had.`}
              </p>
            </div>
            ${ai?.active
              ? '<button class="btn ghost" data-withdraw>Withdraw consent</button>'
              : '<button class="btn ghost" data-grant>Give consent again</button>'}
          </div>
        </div>

        <div class="card">
          <div class="setting">
            <div>
              <b>Your copy of the data</b>
              <p>A JSON file with every entry, every topic score and the history of your weights.</p>
            </div>
            <button class="btn ghost" data-export>Download my data</button>
          </div>
        </div>

        <div class="card danger">
          <b style="color:var(--error)">Delete account and all data</b>
          <p style="font-size:14px;color:var(--text-2);margin:var(--gap-1) 0 var(--gap-3)">
            This removes your account, every entry, every topic score, your profile and
            everything recorded during the pilot. It cannot be undone.
          </p>
          <button class="btn danger" data-delete>${icons.trash('#FF9B8A')} Delete everything</button>
        </div>
      </section>`;

    wire();
  }

  function wire() {
    root.querySelector('[data-logout]')?.addEventListener('click', () => {
      signOut();
      navigate('#/login');
    });

    root.querySelector('[data-withdraw]')?.addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'Withdraw the analysis consent?',
        body: 'Your entries stay and you can keep writing. New entries will not be analysed, so your profile will stop changing and the questions will stop adapting.',
        confirmLabel: 'Withdraw',
      });
      if (!yes) return;
      ({ consents } = await api.withdrawAiConsent());
      draw();
      toast('Analysis stopped. Your entries are untouched.', 'good');
    });

    root.querySelector('[data-grant]')?.addEventListener('click', async () => {
      ({ consents } = await api.grantAiConsent());
      draw();
      toast('Analysis is on again — your next entry will move your profile.', 'good');
    });

    root.querySelector('[data-export]')?.addEventListener('click', async () => {
      try {
        const data = await api.exportData();
        // Built and downloaded in the browser: the file never passes through
        // anywhere else on its way to the person it belongs to.
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reflection-diary-${data.exportedAt.slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        toast('Your data has been downloaded.', 'good');
      } catch (error) {
        toast(error.message, 'warn');
      }
    });

    root.querySelector('[data-delete]')?.addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: 'Delete everything?',
        body: 'Your account, your entries, your topic profile and every measurement collected during the pilot will be removed. This cannot be undone.',
        confirmLabel: 'Delete everything',
        danger: true,
      });
      if (!yes) return;

      try {
        await api.deleteAccount();
        token.clear();
        signOut();
        root.innerHTML = `
          <section class="auth-screen">
            <h1>Everything has been deleted</h1>
            <p class="sub">Your account, your entries, your profile and your pilot measurements are gone.</p>
            <div class="card">
              <p style="margin:0;font-size:14px;color:var(--text-2)">
                Thank you for taking part. If you would like to start again, you can create a new account.
              </p>
              <p style="margin-top:var(--gap-3)">
                <button class="btn" data-go="#/register">Start again</button>
              </p>
            </div>
          </section>`;
        document.getElementById('topnav').hidden = true;
        document.getElementById('bottomnav').hidden = true;
      } catch (error) {
        toast(error.message, 'warn');
      }
    });
  }

  draw();
}

export default { render };
