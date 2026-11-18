/**
 * S-05 · Profile: the nine weights and what they are made of.
 *
 *   insightCard()    one sentence on what the profile shows right now
 *                    (GET /profile/insight) — it describes, it does not judge
 *   weight rows      value, movement since the quiz, "asked" for the top three
 *   Edit zones       sliders, numbers and on/off switches; saved with
 *                    PATCH /profile/weights; at least three zones stay on
 *   dynamicsCard()   one zone over 30 days (GET /profile/trend), with the
 *                    three largest day-to-day moves marked
 *   heatCard()       how often each zone came up, week by week, for five weeks
 */
import { api } from '../api.js';
import {
  S, ICON, ZONES, zc, zl, esc, $, $$, render, notice, sorted, topThree, openDialog, applyProfile, shortDate,
} from '../core.js';
import { loadProfile, loadEntries } from '../data.js';

const P = { insight: null, editing: false, edit: null, trendZone: null, trend: null };

/* ---------- insight ---------- */
function insightCard() {
  const i = P.insight;
  if (!i) return '';
  const name = (z) => `<span class="zn" style="color:${zc(z.id)}">${esc(zl(z.id))}</span>`;
  const d = i.top.deltaSinceQuiz;
  const trend = d === null || Math.abs(d) < 0.01 ? 'about where the quiz put it'
    : d > 0 ? `up ${d.toFixed(2)} since the quiz` : `down ${(-d).toFixed(2)} since the quiz`;
  const body = i.totalEntries === 0
    ? `It is your highest zone at ${i.top.weight.toFixed(2)}, set by the quiz. Write a few entries and this card will show what you actually write about.`
    : `It is your highest zone at ${i.top.weight.toFixed(2)}, ${trend}, and it came up in ${i.top.mentions} of your ${i.totalEntries} ${i.totalEntries === 1 ? 'entry' : 'entries'} over the last five weeks.
       ${i.next ? `Next comes ${name(i.next.zone)} at ${i.next.weight.toFixed(2)}.` : ''}
       ${i.quiet ? `Of the quieter zones, ${name(i.quiet.zone)} has not come up for two weeks, so the diary will offer it now and then.` : ''}`;
  return `<div class="card glow insight">
    <span class="ico" aria-hidden="true">${ICON.spark('#F5D0FE', 18)}</span>
    <div>
      <p class="lbl">Insight · right now</p>
      <h2>${name(i.top.zone)} ${i.totalEntries === 0 ? 'leads your profile' : 'is taking up most of your reflection'}</h2>
      <p>${body}</p>
      <div class="facts">
        ${i.totalEntries ? `<span>${i.top.percentOfEntries}% of entries</span><span>${i.top.recentMentions} in the last two weeks</span>` : ''}
        <span>asked about: ${i.askedAbout.map((z) => esc(z.short)).join(', ')}</span>
      </div>
    </div>
  </div>`;
}

/* ---------- the weight rows, and the editor ---------- */
function rows() {
  const top = topThree();
  const W = P.editing ? P.edit.weights : S.weights, M = P.editing ? P.edit.muted : S.muted;
  return sorted(S.weights).map(([z]) => {
    const v = W[z], off = M.includes(z), d = v - (S.startW[z] ?? v);
    if (P.editing) {
      return `<div class="wrow">
      <div class="top"><span class="nm ${off ? 'off' : ''}">${zl(z)}</span>
        <span class="row">
          <input class="num" type="number" min="0" max="1" step="0.01" value="${off ? '' : v.toFixed(2)}" data-num="${z}" ${off ? "disabled placeholder='—'" : ''} aria-label="${zl(z)} value">
          <span class="sw" role="switch" tabindex="0" data-sw="${z}" aria-checked="${!off}" aria-label="Ask me about ${zl(z)}"></span>
        </span></div>
      <input type="range" min="0" max="1" step="0.01" value="${v}" data-range="${z}" ${off ? 'disabled' : ''} aria-label="${zl(z)} weight">
    </div>`;
    }
    return `<div class="wrow">
      <div class="top"><span><span class="nm ${off ? 'off' : ''}">${zl(z)}</span>${off ? '<span class="asked">muted</span>' : top.includes(z) ? '<span class="asked">asked</span>' : ''}</span>
        <span><span class="d ${d > 0.005 ? 'up' : ''}">${d >= 0 ? '+' : ''}${d.toFixed(2)}</span><span class="val">${v.toFixed(2)}</span></span></div>
      <div class="bar"><span style="width:${v * 100}%;background:${zc(z)}"></span></div>
    </div>`;
  }).join('');
}

/* ---------- one zone over 30 days ---------- */
function dynamicsCard() {
  const z = P.trendZone, col = zc(z), W = 560, H = 170, pl = 34;
  const t = P.trend, pts = t?.points ?? [];
  const opts = ZONES.map((k) => `<option value="${k}" ${k === z ? 'selected' : ''}>${zl(k)}</option>`).join('');
  const head = `<div class="spread"><b style="font-size:15px">How one zone moved</b><span class="meta">last 30 days</span></div>
    <div class="zpick"><i style="background:${col}"></i><select id="trendZone" aria-label="Which zone to show">${opts}</select></div>`;
  if (pts.length < 2) {
    return `<div class="card">${head}<p class="meta" style="margin:14px 0 0">Not enough history yet — the line appears once this zone has changed on two different days.</p></div>`;
  }
  const dayIdx = (day) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${t.from}T00:00:00Z`)) / 86_400_000);
  const n = t.days;
  const px = (i) => pl + (W - pl - 6) * i / (n - 1), py = (v) => H - 18 - (H - 34) * v;
  // carry the last value to today, so the line ends at "now"
  const series = pts.map((p) => [dayIdx(p.day), p.weight]);
  if (series.at(-1)[0] < n - 1) series.push([n - 1, series.at(-1)[1]]);
  let g = '';
  [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
    g += `<line x1="${pl}" y1="${py(v).toFixed(1)}" x2="${W - 6}" y2="${py(v).toFixed(1)}" stroke="#A855F7" stroke-opacity="0.22"/>`;
    g += `<text x="${pl - 8}" y="${(py(v) + 4).toFixed(1)}" font-size="10" fill="#8B89A3" text-anchor="end">${v.toFixed(2)}</text>`;
  });
  const line = series.map(([i, v]) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  g += `<polygon points="${px(series[0][0]).toFixed(1)},${py(0).toFixed(1)} ${line} ${px(series.at(-1)[0]).toFixed(1)},${py(0).toFixed(1)}" fill="${col}" fill-opacity=".12"/>`;
  g += `<polyline points="${line}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  g += `<circle cx="${px(series.at(-1)[0]).toFixed(1)}" cy="${py(series.at(-1)[1]).toFixed(1)}" r="4.5" fill="${col}" stroke="#14131F" stroke-width="2"/>`;
  // the three largest day-to-day moves, labelled with their size and day
  const moves = pts.slice(1).map((p, k) => ({ p, d: p.weight - pts[k].weight }))
    .filter((m) => Math.abs(m.d) >= 0.02).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
  moves.forEach(({ p, d }) => {
    const x = px(dayIdx(p.day)), y = py(p.weight), above = d > 0;
    const lab = `${d > 0 ? '+' : ''}${d.toFixed(2)} · ${shortDate(p.day)}`, w = lab.length * 6.4 + 20;
    const bx = Math.min(Math.max(x - w / 2, pl), W - 6 - w), by = above ? Math.max(2, y - 38) : Math.min(H - 22, y + 16);
    g += `<line x1="${x.toFixed(1)}" y1="${(y + (above ? -7 : 7)).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(above ? by + 20 : by).toFixed(1)}" stroke="#9B8CFF" stroke-dasharray="2 2"/>`;
    g += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${w.toFixed(1)}" height="20" rx="7" fill="#1A1929" stroke="#9B8CFF"/>`;
    g += `<text x="${(bx + w / 2).toFixed(1)}" y="${(by + 14).toFixed(1)}" font-size="11" font-weight="600" fill="#F0EFFB" text-anchor="middle" font-family="inherit">${lab}</text>`;
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#14131F" stroke="#9B8CFF" stroke-width="2"/>`;
  });
  return `<div class="card">${head}
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${zl(z)} over the last 30 days, from ${t.first.toFixed(2)} to ${t.last.toFixed(2)}.">${g}</svg>
    <div class="spread meta"><span>${shortDate(t.from)}</span><span>today</span></div>
    <p class="meta" style="margin:10px 0 0">Each point is the value at the end of a day on which it changed. The marked points are the largest moves.</p>
  </div>`;
}

/* ---------- attention, not score: which zones the entries are about ---------- */
function heatCard() {
  const all = S.entries35 ?? 0;
  const mx = Math.max(1, ...Object.values(S.weekly ?? {}).flat());
  const rowsHtml = ZONES.map((z) => {
    const vals = S.weekly?.[z] ?? [0, 0, 0, 0, 0], tot = S.mentions?.[z] ?? 0;
    const cells = vals.map((v) => (v === 0
      ? '<span class="hc zero" aria-label="no entries"></span>'
      : `<span class="hc" style="background:${zc(z)};opacity:${(0.22 + 0.62 * v / mx).toFixed(2)}">${v}</span>`)).join('');
    return `<div class="hrow ${tot ? '' : 'off'}"><span class="hn">${zl(z)}</span>${cells}
      <b>${tot}</b><span class="hp">${all ? Math.round(100 * tot / all) : 0}%</span></div>`;
  }).join('');
  const most = ZONES.map((z) => [z, S.mentions?.[z] ?? 0]).sort((a, b) => b[1] - a[1])[0];
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const faded = ZONES.filter((z) => S.lastMention?.[z] && S.lastMention[z] < twoWeeksAgo)
    .sort((a, b) => S.lastMention[a].localeCompare(S.lastMention[b]))[0];
  const cap = (z) => zl(z).charAt(0).toUpperCase() + zl(z).slice(1);
  const summary = all === 0 ? 'No entries in the last five weeks yet.'
    : `${cap(most[0])} appears in ${most[1]} of your ${all} entries in the last five weeks.
       ${faded ? `${cap(faded)} has not come up since ${shortDate(S.lastMention[faded])}.` : ''} One entry can touch more than one zone.`;
  return `<div class="card">
    <div class="spread"><b style="font-size:15px">What you actually write about</b><span class="meta">last 5 weeks</span></div>
    <p class="meta" style="margin:4px 0 12px">Not good or bad — how often each zone appears in your entries.</p>
    <div class="hhead"><span class="hn"></span><span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>W5</span><b>ALL</b></div>
    ${rowsHtml}
    <p class="meta" style="margin:12px 0 0;border-top:1px solid var(--div);padding-top:12px">${summary}</p>
  </div>`;
}

/* ---------- the screen ---------- */
export const profile = {
  async load() {
    const [ins] = await Promise.all([api.insight(), loadProfile(), loadEntries()]);
    P.insight = ins.insight;
    if (!P.trendZone) P.trendZone = topThree()[0] ?? 'work';
    P.trend = await api.trend(P.trendZone, 30);
    P.editing = false;
  },

  view() {
    const M = P.editing ? P.edit.muted : S.muted;
    return `
  <div class="spread"><div><h1>Your topic profile</h1>
    <p class="sub">All nine zones · the diary asks about your top three, and sometimes about a quieter one</p></div>
    ${P.editing ? '<b style="color:var(--accent)">Editing</b>' : '<button class="btn ghost" id="edit">Edit zones</button>'}</div>
  ${P.editing ? '' : insightCard()}
  <div class="card">${rows()}</div>
  ${P.editing ? `<div class="card glow">
    <b>${M.length} of 9 zones muted</b>
    <p style="font-size:13px;color:var(--txt2);margin:6px 0 0">Drag a bar or type a value between 0 and 1. The diary keeps learning from where you set it. Muted zones are never asked about, and at least three must stay on. Every change is recorded for the study.</p>
    <div class="dlgrow"><button class="btn" id="saveZones">Save changes</button>
      <button class="btn ghost" id="resetZones">Cancel</button></div>
  </div>` : `<div class="card">
    <p style="margin:0;font-size:14px;color:var(--txt2)"><b>What is this?</b> Each number is how relevant a topic is for you right now, between 0 and 1. It comes from your own entries and changes slowly: a new entry moves a weight by about a third of the way, and picking a question moves its zone up a little.</p>
    <p class="meta" style="margin:8px 0 0">The coloured number shows how far each zone has moved since the quiz.</p></div>
  ${dynamicsCard()}${heatCard()}`}`;
  },

  wire() {
    $('#edit')?.addEventListener('click', () => {
      P.editing = true;
      P.edit = { weights: { ...S.weights }, muted: [...S.muted] };
      render();
    });
    $('#resetZones')?.addEventListener('click', () => { P.editing = false; render(); });
    $('#saveZones')?.addEventListener('click', async () => {
      const zones = ZONES.filter((z) => P.edit.weights[z] !== S.weights[z] || P.edit.muted.includes(z) !== S.muted.includes(z))
        .map((z) => ({ zoneId: z, weight: P.edit.weights[z], isMuted: P.edit.muted.includes(z) }));
      if (zones.length === 0) { P.editing = false; render(); return; }
      try {
        applyProfile(await api.updateWeights(zones));
        P.insight = (await api.insight()).insight;
        P.editing = false;
        render();
      } catch (error) { notice(error.message); }
    });
    $$('[data-range]').forEach((r) => r.addEventListener('input', () => {
      const z = r.dataset.range;
      P.edit.weights[z] = +(+r.value).toFixed(2);
      const n = $(`[data-num="${z}"]`); if (n) n.value = P.edit.weights[z].toFixed(2);
    }));
    $$('[data-num]').forEach((n) => n.addEventListener('change', () => {
      const z = n.dataset.num, v = Math.min(1, Math.max(0, +n.value || 0));
      P.edit.weights[z] = +v.toFixed(2); n.value = P.edit.weights[z].toFixed(2);
      const r = $(`[data-range="${z}"]`); if (r) r.value = P.edit.weights[z];
    }));
    const toggleZone = (z) => {
      const off = P.edit.muted.includes(z);
      if (!off && ZONES.length - P.edit.muted.length <= 3) {
        openDialog(`<h2 style="margin:0 0 10px;font-size:18px">At least three zones must stay on</h2>
          <p style="color:var(--txt2);font-size:15px;margin:0">Each day the diary offers three questions on three different zones. With fewer than three there is nothing to choose from.</p>
          <div class="dlgrow"><button class="btn" data-close>Got it</button></div>`);
        return;
      }
      P.edit.muted = off ? P.edit.muted.filter((x) => x !== z) : P.edit.muted.concat(z);
      render();
    };
    $$('[data-sw]').forEach((sw) => {
      sw.addEventListener('click', () => toggleZone(sw.dataset.sw));
      sw.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleZone(sw.dataset.sw); } });
    });
    $('#trendZone')?.addEventListener('change', async (e) => {
      P.trendZone = e.target.value;
      try { P.trend = await api.trend(P.trendZone, 30); } catch (error) { notice(error.message); }
      render();
      $('#trendZone')?.focus();
    });
  },
};

