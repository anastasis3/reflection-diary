/**
 * S-07 · Settings & privacy.
 *
 *   name          "What should the diary call you?" — PATCH /account/name
 *   AI consent    withdraw (entries stay, the profile stops moving) or give
 *                 it again — DELETE / POST /account/consents/ai-processing
 *   your data     downloads everything as one JSON file — GET /account/export
 *   log out       forgets the token in this browser
 *   delete        removes the account and every row — DELETE /account
 */
import { useState } from 'react';
import { api } from '../lib/api.js';
import { longDate } from '../lib/format.js';
import { useDiary } from '../state/DiaryContext.jsx';
import { useLoad, LoadState } from '../state/useLoad.jsx';
import { go } from '../state/nav.js';
import { Dialog, DialogText } from '../components/ui.jsx';

const text = { fontSize: 14, color: 'var(--txt2)', margin: '6px 0 0' };

export default function Settings() {
  const { user, setUser, signOut, entries, notify } = useDiary();
  const [consents, setConsents] = useState([]);
  const [name, setName] = useState(user?.displayName ?? '');
  const [nameHint, setNameHint] = useState('Only used to greet you on Today.');
  const [dialog, setDialog] = useState(null); // 'withdraw' | 'delete'

  const state = useLoad(async () => { setConsents((await api.consents()).consents); });
  if (!state.ready) return <LoadState state={state} />;

  const ai = consents.find((c) => c.purpose === 'ai_processing');
  const on = Boolean(ai?.active);

  async function saveName() {
    try {
      const updated = (await api.setName(name.trim() || null)).user;
      setUser(updated);
      setNameHint(updated.displayName ? `Saved. Today will greet you as ${updated.displayName}.` : 'Saved. The greeting has no name now.');
    } catch (error) { setNameHint(error.fields.name ?? error.message); }
  }

  async function setConsent(give) {
    setDialog(null);
    try {
      setConsents((await (give ? api.grantAiConsent() : api.withdrawAiConsent())).consents);
      setUser((u) => ({ ...u, aiProcessingConsent: give }));
    } catch (e) { notify(e.message); }
  }

  async function download() {
    try {
      const data = await api.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `reflection-diary-${data.exportedAt.slice(0, 10)}.json` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { notify(e.message); }
  }

  async function deleteAccount() {
    try {
      await api.deleteAccount();
      setDialog(null);
      signOut();
      go('gone');
    } catch (e) { setDialog(null); notify(e.message); }
  }

  return (
    <>
      <h1>Settings &amp; privacy</h1>
      <p className="sub">What is stored, who can see it, and how to remove it</p>

      <div className="card">
        <b>What is stored</b>
        <p style={text}>Your e-mail, your entries, the topic scores of each entry, your nine weights and which questions you were offered and picked. Entries are encrypted at rest. Only the text of an entry is sent to the AI model — never your e-mail, your identifier or a date of birth.</p>
      </div>

      <div className="card">
        <b>What should the diary call you?</b>
        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <input type="text" maxLength={40} autoComplete="given-name" placeholder="No name — the greeting stays plain" aria-label="Your name"
            value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 200, margin: 0 }} />
          <button className="btn ghost" onClick={saveName}>Save</button>
        </div>
        <p className="hint" style={{ margin: '8px 0 0' }}>{nameHint}</p>
      </div>

      <div className="card">
        <div className="spread">
          <div style={{ maxWidth: 420 }}>
            <b>AI processing of your entries</b>
            <p style={text}>
              {on
                ? `Consent given on ${longDate(ai.grantedAt.slice(0, 10))}. Withdrawing it stops the analysis: you keep writing and your entries stay, but new entries are no longer sent to the model and your profile stops changing.`
                : `Withdrawn${ai?.withdrawnAt ? ` on ${longDate(ai.withdrawnAt.slice(0, 10))}` : ''}. Your entries are saved but not analysed, and your profile does not change. You can give the consent again at any time.`}
            </p>
          </div>
          {on ? <button className="btn ghost" onClick={() => setDialog('withdraw')}>Withdraw consent</button>
            : <button className="btn ghost" onClick={() => setConsent(true)}>Give consent again</button>}
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <div style={{ maxWidth: 420 }}>
            <b>Your copy of the data</b>
            <p style={text}>A JSON file with every entry, every topic score, every question you were offered and the history of your weights.</p>
          </div>
          <button className="btn ghost" onClick={download}>Download my data</button>
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <div style={{ maxWidth: 420 }}>
            <b>Log out</b>
            <p style={text}>Signed in as {user?.email}.</p>
          </div>
          <button className="btn ghost" onClick={() => { signOut(); go('login'); }}>Log out</button>
        </div>
      </div>

      <div className="card danger">
        <b style={{ color: 'var(--err)' }}>Delete account and all data</b>
        <p style={{ ...text, margin: '6px 0 14px' }}>This removes your account, every entry, every topic score, your profile and the measurements collected during the pilot. It cannot be undone and takes a few seconds.</p>
        <button className="btn danger" onClick={() => setDialog('delete')}>Delete everything</button>
      </div>

      <Dialog open={dialog === 'withdraw'} onClose={() => setDialog(null)}>
        <DialogText title="Withdraw AI consent?">
          <p style={{ color: 'var(--txt2)', fontSize: 15, margin: 0 }}>Your entries stay and you can keep writing. New entries will no longer be sent to the model, and your profile will stop changing. You can give the consent again at any time.</p>
        </DialogText>
        <div className="dlgrow">
          <button className="btn" autoFocus onClick={() => setDialog(null)}>Keep it on</button>
          <button className="btn ghost" onClick={() => setConsent(false)}>Withdraw</button>
        </div>
      </Dialog>

      <Dialog open={dialog === 'delete'} onClose={() => setDialog(null)}>
        <DialogText title="Delete everything?">
          <p style={{ color: 'var(--txt2)', fontSize: 15, margin: '0 0 12px' }}>You will be logged out and {entries.length || 'all'} entries, your nine weights, your pilot measurements and your account will be removed.</p>
          <p style={{ color: 'var(--err)', fontWeight: 700, fontSize: 14, margin: 0, borderTop: '1px solid var(--div)', paddingTop: 12 }}>This cannot be undone.</p>
        </DialogText>
        <div className="dlgrow">
          <button className="btn" autoFocus onClick={() => setDialog(null)}>Keep my account</button>
          <button className="btn danger" onClick={deleteAccount}>Yes, delete everything</button>
        </div>
      </Dialog>
    </>
  );
}
