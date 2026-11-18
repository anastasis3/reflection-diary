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
import { api, token } from '../api.js';
import { S, esc, $, go, render, notice, openDialog, longDate } from '../core.js';

const ST = { consents: [] };
const ai = () => ST.consents.find((c) => c.purpose === 'ai_processing');

export const settings = {
  async load() {
    ST.consents = (await api.consents()).consents;
  },

  view() {
    const c = ai();
    const on = Boolean(c?.active);
    return `
  <h1>Settings &amp; privacy</h1><p class="sub">What is stored, who can see it, and how to remove it</p>
  <div class="card"><b>What is stored</b>
    <p style="font-size:14px;color:var(--txt2);margin:6px 0 0">Your e-mail, your entries, the topic scores of each entry, your nine weights and which questions you were offered and picked. Entries are encrypted at rest. Only the text of an entry is sent to the AI model — never your e-mail, your identifier or a date of birth.</p></div>
  <div class="card"><b>What should the diary call you?</b>
    <div class="row" style="margin-top:10px;flex-wrap:wrap">
      <input id="nameIn" type="text" maxlength="40" autocomplete="given-name" placeholder="No name — the greeting stays plain" value="${esc(S.user?.displayName ?? '')}" style="flex:1;min-width:200px;margin:0" aria-label="Your name">
      <button class="btn ghost" id="saveName">Save</button></div>
    <p class="hint" id="nameHint" style="margin:8px 0 0">Only used to greet you on Today.</p></div>
  <div class="card"><div class="spread"><div style="max-width:420px"><b>AI processing of your entries</b>
    <p style="font-size:14px;color:var(--txt2);margin:6px 0 0">${on
      ? `Consent given on ${longDate(c.grantedAt.slice(0, 10))}. Withdrawing it stops the analysis: you keep writing and your entries stay, but new entries are no longer sent to the model and your profile stops changing.`
      : `Withdrawn${c?.withdrawnAt ? ` on ${longDate(c.withdrawnAt.slice(0, 10))}` : ''}. Your entries are saved but not analysed, and your profile does not change. You can give the consent again at any time.`}</p></div>
    <button class="btn ghost" id="${on ? 'withdraw' : 'grant'}">${on ? 'Withdraw consent' : 'Give consent again'}</button></div></div>
  <div class="card"><div class="spread"><div style="max-width:420px"><b>Your copy of the data</b>
    <p style="font-size:14px;color:var(--txt2);margin:6px 0 0">A JSON file with every entry, every topic score, every question you were offered and the history of your weights.</p></div>
    <button class="btn ghost" id="download">Download my data</button></div></div>
  <div class="card"><div class="spread"><div style="max-width:420px"><b>Log out</b>
    <p style="font-size:14px;color:var(--txt2);margin:6px 0 0">Signed in as ${esc(S.user?.email ?? '')}.</p></div>
    <button class="btn ghost" id="logout">Log out</button></div></div>
  <div class="card danger"><b style="color:var(--err)">Delete account and all data</b>
    <p style="font-size:14px;color:var(--txt2);margin:6px 0 14px">This removes your account, every entry, every topic score, your profile and the measurements collected during the pilot. It cannot be undone and takes a few seconds.</p>
    <button class="btn danger" id="del">Delete everything</button></div>`;
  },

  wire() {
    $('#saveName').addEventListener('click', async () => {
      try {
        S.user = (await api.setName($('#nameIn').value.trim() || null)).user;
        $('#nameHint').textContent = S.user.displayName ? `Saved. Today will greet you as ${S.user.displayName}.` : 'Saved. The greeting has no name now.';
      } catch (error) { $('#nameHint').textContent = error.fields.name ?? error.message; }
    });

    $('#withdraw')?.addEventListener('click', () => {
      const d = openDialog(`<h2 style="margin:0 0 10px;font-size:18px">Withdraw AI consent?</h2>
        <p style="color:var(--txt2);font-size:15px;margin:0">Your entries stay and you can keep writing. New entries will no longer be sent to the model, and your profile will stop changing. You can give the consent again at any time.</p>
        <div class="dlgrow"><button class="btn" data-close autofocus>Keep it on</button><button class="btn ghost" id="confirmWithdraw">Withdraw</button></div>`);
      $('#confirmWithdraw').addEventListener('click', async () => {
        d.close();
        try { ST.consents = (await api.withdrawAiConsent()).consents; S.user.aiProcessingConsent = false; render(); } catch (e) { notice(e.message); }
      });
    });
    $('#grant')?.addEventListener('click', async () => {
      try { ST.consents = (await api.grantAiConsent()).consents; S.user.aiProcessingConsent = true; render(); } catch (e) { notice(e.message); }
    });

    $('#download').addEventListener('click', async () => {
      try {
        const data = await api.exportData();
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: `reflection-diary-${data.exportedAt.slice(0, 10)}.json` });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) { notice(e.message); }
    });

    $('#logout').addEventListener('click', () => { token.clear(); S.user = null; go('login'); });

    $('#del').addEventListener('click', () => {
      const d = openDialog(`<h2 style="margin:0 0 10px;font-size:18px">Delete everything?</h2>
        <p style="color:var(--txt2);font-size:15px;margin:0 0 12px">You will be logged out and ${S.entries?.length ?? 'all'} entries, your nine weights, your pilot measurements and your account will be removed.</p>
        <p style="color:var(--err);font-weight:700;font-size:14px;margin:0;border-top:1px solid var(--div);padding-top:12px">This cannot be undone.</p>
        <div class="dlgrow"><button class="btn" data-close autofocus>Keep my account</button>
          <button class="btn danger" id="confirmDel">Yes, delete everything</button></div>`);
      $('#confirmDel').addEventListener('click', async () => {
        try {
          await api.deleteAccount();
          d.close(); token.clear(); S.user = null; go('gone');
        } catch (e) { d.close(); notice(e.message); }
      });
    });
  },
};
