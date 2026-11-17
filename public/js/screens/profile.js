/**
 * S-05 — the topic profile.
 *
 * Two modes in one screen. Reading shows the nine weights, how far each has
 * moved since the quiz, and which three are being asked about. Editing turns
 * the same rows into sliders and switches (US-5.3).
 *
 * Editing is a staged change: nothing is sent until Save, so a person can drag
 * four sliders and change their mind. The rule that at least three zones stay
 * active is enforced on the server as well — this screen only explains it
 * early, where it is useful.
 */
import { api } from '../api.js';
import { esc, fmt, fmtDelta } from '../dom.js';
import icons from '../icons.js';
import { radar, wireRadar } from '../components/radar.js';
import { trendChart } from '../components/trend.js';
import { toast } from '../components/toast.js';

export async function render(root) {
  root.innerHTML = `<p class="loading">Loading your profile…</p>`;

  let profile = await api.profile();
  let editing = false;
  let edits = {};                        // zoneId -> { weight, isMuted }
  let trendZone = profile.zones[0]?.zone.id ?? 'work';
  let trend = await api.trend(trendZone);

  /** The live value of a zone: the staged edit if there is one, else stored. */
  const current = (row) => ({
    weight: edits[row.zone.id]?.weight ?? row.weight,
    isMuted: edits[row.zone.id]?.isMuted ?? row.isMuted,
  });

  function readRow(row) {
    const { weight, isMuted } = current(row);
    return `
      <div class="weight-row">
        <div class="spread">
          <span>
            <span class="name ${isMuted ? 'off' : ''}" style="color:${isMuted ? '' : esc(row.zone.colour)}">
              ${esc(row.zone.name)}
            </span>
            ${row.askedAbout ? '<span class="asked">asked</span>' : ''}
            ${isMuted ? '<span class="meta" style="margin-left:8px">muted</span>' : ''}
          </span>
          <span>
            <span class="delta ${row.delta > 0.005 ? 'up' : ''}">${fmtDelta(row.delta)}</span>
            <span class="value">${fmt(weight)}</span>
          </span>
        </div>
        <div class="bar">
          <span style="width:${(isMuted ? 0 : weight) * 100}%;background:${esc(row.zone.colour)}"></span>
        </div>
      </div>`;
  }

  function editRow(row) {
    const { weight, isMuted } = current(row);
    return `
      <div class="weight-row">
        <div class="spread">
          <span class="name ${isMuted ? 'off' : ''}">${esc(row.zone.name)}</span>
          <span class="row" style="flex-wrap:nowrap">
            <input class="num-input" type="number" min="0" max="1" step="0.01"
                   value="${isMuted ? '' : weight.toFixed(2)}" ${isMuted ? 'disabled placeholder="—"' : ''}
                   data-number="${esc(row.zone.id)}" aria-label="${esc(row.zone.name)} value">
            <span class="switch" role="switch" tabindex="0" data-switch="${esc(row.zone.id)}"
                  aria-checked="${!isMuted}" aria-label="Ask me about ${esc(row.zone.name)}"></span>
          </span>
        </div>
        <input type="range" min="0" max="1" step="0.01" value="${weight}" ${isMuted ? 'disabled' : ''}
               data-range="${esc(row.zone.id)}" aria-label="${esc(row.zone.name)} weight">
      </div>`;
  }

  function draw() {
    const activeCount = profile.zones.filter((r) => !current(r).isMuted).length;

    root.innerHTML = `
      <section>
        <div class="profile-head page-head">
          <div>
            <h1>Your topic profile</h1>
            <p class="sub">All nine zones · the diary asks about your top three, and sometimes about a quieter one</p>
          </div>
          ${editing
            ? '<b style="color:var(--accent)">Editing</b>'
            : '<button class="btn ghost" data-edit>Edit zones</button>'}
        </div>

        <div class="card" style="text-align:center">
          ${radar(profile.zones, { size: 260 })}
        </div>

        <div class="card">
          ${profile.zones.map((row) => (editing ? editRow(row) : readRow(row))).join('')}
        </div>

        ${editing
          ? `<div class="card glow">
               <b>${profile.zones.length - activeCount} of ${profile.zones.length} zones muted</b>
               <p style="font-size:14px;color:var(--text-2);margin-top:var(--gap-1)">
                 Drag a bar or type a value between 0 and 1. The diary keeps learning from where you set it.
                 A muted zone is never asked about, and at least three must stay on.
                 Every change is recorded.
               </p>
               <div class="dialog-actions">
                 <button class="btn" data-save-zones ${activeCount < 3 ? 'disabled' : ''}>Save changes</button>
                 <button class="btn ghost" data-cancel-zones>Cancel</button>
               </div>
               ${activeCount < 3
                 ? `<p class="toast-inline warn" style="margin-top:var(--gap-3)">
                      ${icons.warn()}<span>At least three zones must stay on — the diary needs something to ask about.</span>
                    </p>`
                 : ''}
             </div>`
          : `<div class="card quiet">
               <p style="margin:0;font-size:14px;color:var(--text-2)">
                 <b>What is this?</b> Each number is how relevant a topic is for you right now,
                 between 0 and 1. It comes from your own entries and changes slowly: a new entry
                 moves a weight by about a third of the way towards what that entry was about.
               </p>
               <p class="meta" style="margin-top:var(--gap-2)">
                 These numbers choose your questions. They are not a measure of how you are doing.
               </p>
             </div>
             ${trendCard()}`}
      </section>`;

    wireRadar(root, profile.zones);
    wire();
  }

  function trendCard() {
    return `
      <div class="card">
        <div class="spread">
          <b style="font-size:15px">How one zone moved</b>
          <span class="meta">last 30 days</span>
        </div>
        <div class="trend-pick">
          <i style="background:${esc(trend.zone.colour)}"></i>
          <select data-trend-zone aria-label="Which zone to show">
            ${profile.zones
              .map((r) => `<option value="${esc(r.zone.id)}" ${r.zone.id === trendZone ? 'selected' : ''}>${esc(r.zone.name)}</option>`)
              .join('')}
          </select>
        </div>
        ${trendChart(trend)}
        <p class="meta" style="margin-top:var(--gap-3)">
          Only the days on which this zone actually moved are drawn.
        </p>
      </div>`;
  }

  async function saveZones() {
    const zones = Object.entries(edits).map(([zoneId, patch]) => ({ zoneId, ...patch }));
    if (zones.length === 0) { editing = false; edits = {}; draw(); return; }

    try {
      profile = await api.updateWeights(zones);
      edits = {};
      editing = false;
      trend = await api.trend(trendZone);
      draw();
      toast('Your zones are updated.', 'good');
    } catch (error) {
      toast(error.message, 'warn', 6000);
    }
  }

  function wire() {
    root.querySelector('[data-edit]')?.addEventListener('click', () => {
      editing = true;
      edits = {};
      draw();
    });
    root.querySelector('[data-cancel-zones]')?.addEventListener('click', () => {
      editing = false;
      edits = {};
      draw();
    });
    root.querySelector('[data-save-zones]')?.addEventListener('click', saveZones);

    // Slider and number field edit the same value and stay in step.
    root.querySelectorAll('[data-range]').forEach((slider) => {
      slider.addEventListener('input', () => {
        const id = slider.dataset.range;
        const value = Number(slider.value);
        edits[id] = { ...edits[id], weight: value };
        const number = root.querySelector(`[data-number="${id}"]`);
        if (number) number.value = value.toFixed(2);
      });
    });

    root.querySelectorAll('[data-number]').forEach((number) => {
      number.addEventListener('change', () => {
        const id = number.dataset.number;
        const value = Math.min(1, Math.max(0, Number(number.value) || 0));
        edits[id] = { ...edits[id], weight: value };
        number.value = value.toFixed(2);
        const slider = root.querySelector(`[data-range="${id}"]`);
        if (slider) slider.value = value;
      });
    });

    const toggle = (element) => {
      const id = element.dataset.switch;
      const row = profile.zones.find((r) => r.zone.id === id);
      edits[id] = { ...edits[id], isMuted: !current(row).isMuted };
      draw();
    };

    root.querySelectorAll('[data-switch]').forEach((element) => {
      element.addEventListener('click', () => toggle(element));
      // A div with role="switch" must answer Space and Enter like a real one.
      element.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          toggle(element);
        }
      });
    });

    root.querySelector('[data-trend-zone]')?.addEventListener('change', async (event) => {
      trendZone = event.target.value;
      trend = await api.trend(trendZone);
      draw();
    });
  }

  draw();
}

export default { render };
