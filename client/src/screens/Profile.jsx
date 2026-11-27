/**
 * S-05 · Profile: the nine weights and what they are made of.
 *
 *   Insight       one sentence on what the profile shows right now
 *                 (GET /profile/insight) — it describes, it does not judge
 *   weight rows   value, movement since the quiz, "asked" for the top three
 *   Edit zones    sliders, numbers and on/off switches; saved with
 *                 PATCH /profile/weights; at least three zones stay on
 *   Dynamics      one zone over 30 days (GET /profile/trend), with the
 *                 three largest day-to-day moves marked
 *   Heat map      how often each zone came up, week by week, for five weeks
 */
import { useState } from 'react';
import { api } from '../lib/api.js';
import { ZONES, zc, zl, cap, sortedZones, topThree } from '../lib/zones.js';
import { shortDate } from '../lib/format.js';
import { useDiary } from '../state/DiaryContext.jsx';
import { fromProfile } from '../lib/stats.js';
import { useLoad, LoadState } from '../state/useLoad.jsx';
import { Dialog, DialogText } from '../components/ui.jsx';
import { Spark } from '../components/Icon.jsx';

export default function Profile() {
  const { profile, applyProfile, loadEntries, stats, notify } = useDiary();
  const [insight, setInsight] = useState(null);
  const [trendZone, setTrendZone] = useState(null);
  const [trend, setTrend] = useState(null);
  const [edit, setEdit] = useState(null); // { weights, muted } while editing
  const [tooFew, setTooFew] = useState(false);

  const state = useLoad(async () => {
    const [ins, prof] = await Promise.all([api.insight(), api.profile(), loadEntries()]);
    applyProfile(prof);
    setInsight(ins.insight);
    const { weights, muted } = fromProfile(prof);
    const first = trendZone ?? topThree(weights, muted)[0] ?? 'work';
    setTrendZone(first);
    setTrend(await api.trend(first, 30));
  });

  if (!state.ready) return <LoadState state={state} />;

  async function pickTrend(z) {
    setTrendZone(z);
    try { setTrend(await api.trend(z, 30)); } catch (error) { notify(error.message); }
  }

  async function saveZones() {
    const zones = ZONES
      .filter((z) => edit.weights[z] !== profile.weights[z] || edit.muted.includes(z) !== profile.muted.includes(z))
      .map((z) => ({ zoneId: z, weight: edit.weights[z], isMuted: edit.muted.includes(z) }));
    if (zones.length === 0) { setEdit(null); return; }
    try {
      applyProfile(await api.updateWeights(zones));
      setInsight((await api.insight()).insight);
      setEdit(null);
    } catch (error) { notify(error.message); }
  }

  function toggleZone(z) {
    const off = edit.muted.includes(z);
    if (!off && ZONES.length - edit.muted.length <= 3) { setTooFew(true); return; }
    setEdit((e) => ({ ...e, muted: off ? e.muted.filter((x) => x !== z) : [...e.muted, z] }));
  }
  const setValue = (z, v) => setEdit((e) => ({ ...e, weights: { ...e.weights, [z]: +Math.min(1, Math.max(0, v || 0)).toFixed(2) } }));

  const editing = edit !== null;
  const W = editing ? edit.weights : profile.weights, M = editing ? edit.muted : profile.muted;
  const top = topThree(profile.weights, profile.muted);

  return (
    <>
      <div className="spread">
        <div>
          <h1>Your topic profile</h1>
          <p className="sub">All nine zones · the diary asks about your top three, and sometimes about a quieter one</p>
        </div>
        {editing ? <b style={{ color: 'var(--accent)' }}>Editing</b>
          : <button className="btn ghost" onClick={() => setEdit({ weights: { ...profile.weights }, muted: [...profile.muted] })}>Edit zones</button>}
      </div>
      {!editing && <Insight insight={insight} />}

      <div className="card">
        {sortedZones(profile.weights).map(([z]) => {
          const v = W[z], off = M.includes(z), d = v - (profile.startW[z] ?? v);
          if (editing) {
            return (
              <div className="wrow" key={z}>
                <div className="top">
                  <span className={`nm ${off ? 'off' : ''}`}>{zl(z)}</span>
                  <span className="row">
                    <NumberField value={off ? '' : v.toFixed(2)} disabled={off} label={`${zl(z)} value`} onCommit={(n) => setValue(z, n)} />
                    <span
                      className="sw" role="switch" tabIndex={0} aria-checked={!off} aria-label={`Ask me about ${zl(z)}`}
                      onClick={() => toggleZone(z)}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleZone(z); } }}
                    />
                  </span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={v} disabled={off} aria-label={`${zl(z)} weight`} onChange={(e) => setValue(z, +e.target.value)} />
              </div>
            );
          }
          return (
            <div className="wrow" key={z}>
              <div className="top">
                <span>
                  <span className={`nm ${off ? 'off' : ''}`}>{zl(z)}</span>
                  {off ? <span className="asked">muted</span> : top.includes(z) && <span className="asked">asked</span>}
                </span>
                <span><span className={`d ${d > 0.005 ? 'up' : ''}`}>{d >= 0 ? '+' : ''}{d.toFixed(2)}</span><span className="val">{v.toFixed(2)}</span></span>
              </div>
              <div className="bar"><span style={{ width: `${v * 100}%`, background: zc(z) }} /></div>
            </div>
          );
        })}
      </div>

      {editing ? (
        <div className="card glow">
          <b>{M.length} of 9 zones muted</b>
          <p style={{ fontSize: 13, color: 'var(--txt2)', margin: '6px 0 0' }}>
            Drag a bar or type a value between 0 and 1. The diary keeps learning from where you set it. Muted zones are never asked about, and at least three must stay on. Every change is recorded for the study.
          </p>
          <div className="dlgrow">
            <button className="btn" onClick={saveZones}>Save changes</button>
            <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <p style={{ margin: 0, fontSize: 14, color: 'var(--txt2)' }}>
              <b>What is this?</b> Each number is how relevant a topic is for you right now, between 0 and 1. It comes from your own entries and changes slowly: a new entry moves a weight by about a third of the way, and picking a question moves its zone up a little.
            </p>
            <p className="meta" style={{ margin: '8px 0 0' }}>The coloured number shows how far each zone has moved since the quiz.</p>
          </div>
          <Dynamics zone={trendZone} trend={trend} onPick={pickTrend} />
          <HeatMap stats={stats} />
        </>
      )}

      <Dialog open={tooFew} onClose={() => setTooFew(false)}>
        <DialogText title="At least three zones must stay on">
          <p style={{ color: 'var(--txt2)', fontSize: 15, margin: 0 }}>Each day the diary offers three questions on three different zones. With fewer than three there is nothing to choose from.</p>
        </DialogText>
        <div className="dlgrow"><button className="btn" onClick={() => setTooFew(false)}>Got it</button></div>
      </Dialog>
    </>
  );
}

/** A number box that accepts what is typed and settles it on leaving the field. */
function NumberField({ value, disabled, label, onCommit }) {
  const [text, setText] = useState(null); // null: show the value
  return (
    <input
      className="num" type="number" min="0" max="1" step="0.01" disabled={disabled} placeholder={disabled ? '—' : undefined}
      aria-label={label} value={text ?? value}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== null) onCommit(+text); setText(null); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

/* ---------- insight ---------- */
function Insight({ insight: i }) {
  if (!i) return null;
  const Name = ({ zone }) => <span className="zn" style={{ color: zc(zone.id) }}>{zl(zone.id)}</span>;
  const d = i.top.deltaSinceQuiz;
  const trend = d === null || Math.abs(d) < 0.01 ? 'about where the quiz put it'
    : d > 0 ? `up ${d.toFixed(2)} since the quiz` : `down ${(-d).toFixed(2)} since the quiz`;
  return (
    <div className="card glow insight">
      <span className="ico" aria-hidden="true"><Spark c="#F5D0FE" s={18} /></span>
      <div>
        <p className="lbl">Insight · right now</p>
        <h2><Name zone={i.top.zone} /> {i.totalEntries === 0 ? 'leads your profile' : 'is taking up most of your reflection'}</h2>
        {i.totalEntries === 0 ? (
          <p>It is your highest zone at {i.top.weight.toFixed(2)}, set by the quiz. Write a few entries and this card will show what you actually write about.</p>
        ) : (
          <p>
            It is your highest zone at {i.top.weight.toFixed(2)}, {trend}, and it came up in {i.top.mentions} of your {i.totalEntries} {i.totalEntries === 1 ? 'entry' : 'entries'} over the last five weeks.
            {i.next && <> Next comes <Name zone={i.next.zone} /> at {i.next.weight.toFixed(2)}.</>}
            {i.quiet && <> Of the quieter zones, <Name zone={i.quiet.zone} /> has not come up for two weeks, so the diary will offer it now and then.</>}
          </p>
        )}
        <div className="facts">
          {i.totalEntries > 0 && <><span>{i.top.percentOfEntries}% of entries</span><span>{i.top.recentMentions} in the last two weeks</span></>}
          <span>asked about: {i.askedAbout.map((z) => z.short).join(', ')}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- one zone over 30 days ---------- */
function Dynamics({ zone, trend: t, onPick }) {
  const col = zc(zone), W = 560, H = 170, pl = 34;
  const pts = t?.points ?? [];
  const head = (
    <>
      <div className="spread"><b style={{ fontSize: 15 }}>How one zone moved</b><span className="meta">last 30 days</span></div>
      <div className="zpick">
        <i style={{ background: col }} />
        <select aria-label="Which zone to show" value={zone} onChange={(e) => onPick(e.target.value)}>
          {ZONES.map((k) => <option key={k} value={k}>{zl(k)}</option>)}
        </select>
      </div>
    </>
  );
  if (pts.length < 2) {
    return <div className="card">{head}<p className="meta" style={{ margin: '14px 0 0' }}>Not enough history yet — the line appears once this zone has changed on two different days.</p></div>;
  }
  const dayIdx = (day) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${t.from}T00:00:00Z`)) / 86_400_000);
  const n = t.days;
  const px = (i) => pl + (W - pl - 6) * i / (n - 1), py = (v) => H - 18 - (H - 34) * v;
  // carry the last value to today, so the line ends at "now"
  const series = pts.map((p) => [dayIdx(p.day), p.weight]);
  if (series.at(-1)[0] < n - 1) series.push([n - 1, series.at(-1)[1]]);
  const line = series.map(([i, v]) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  // the three largest day-to-day moves, labelled with their size and day
  const moves = pts.slice(1).map((p, k) => ({ p, d: p.weight - pts[k].weight }))
    .filter((m) => Math.abs(m.d) >= 0.02).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
  const end = series.at(-1);
  return (
    <div className="card">
      {head}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${zl(zone)} over the last 30 days, from ${t.first.toFixed(2)} to ${t.last.toFixed(2)}.`}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={pl} y1={py(v).toFixed(1)} x2={W - 6} y2={py(v).toFixed(1)} stroke="#A855F7" strokeOpacity="0.22" />
            <text x={pl - 8} y={(py(v) + 4).toFixed(1)} fontSize="10" fill="#8B89A3" textAnchor="end">{v.toFixed(2)}</text>
          </g>
        ))}
        <polygon points={`${px(series[0][0]).toFixed(1)},${py(0).toFixed(1)} ${line} ${px(end[0]).toFixed(1)},${py(0).toFixed(1)}`} fill={col} fillOpacity=".12" />
        <polyline points={line} fill="none" stroke={col} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={px(end[0]).toFixed(1)} cy={py(end[1]).toFixed(1)} r="4.5" fill={col} stroke="#14131F" strokeWidth="2" />
        {moves.map(({ p, d }) => {
          const x = px(dayIdx(p.day)), y = py(p.weight), above = d > 0;
          const lab = `${d > 0 ? '+' : ''}${d.toFixed(2)} · ${shortDate(p.day)}`, w = lab.length * 6.4 + 20;
          const bx = Math.min(Math.max(x - w / 2, pl), W - 6 - w), by = above ? Math.max(2, y - 38) : Math.min(H - 22, y + 16);
          return (
            <g key={p.day}>
              <line x1={x.toFixed(1)} y1={(y + (above ? -7 : 7)).toFixed(1)} x2={x.toFixed(1)} y2={(above ? by + 20 : by).toFixed(1)} stroke="#9B8CFF" strokeDasharray="2 2" />
              <rect x={bx.toFixed(1)} y={by.toFixed(1)} width={w.toFixed(1)} height="20" rx="7" fill="#1A1929" stroke="#9B8CFF" />
              <text x={(bx + w / 2).toFixed(1)} y={(by + 14).toFixed(1)} fontSize="11" fontWeight="600" fill="#F0EFFB" textAnchor="middle" fontFamily="inherit">{lab}</text>
              <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="5" fill="#14131F" stroke="#9B8CFF" strokeWidth="2" />
            </g>
          );
        })}
      </svg>
      <div className="spread meta"><span>{shortDate(t.from)}</span><span>today</span></div>
      <p className="meta" style={{ margin: '10px 0 0' }}>Each point is the value at the end of a day on which it changed. The marked points are the largest moves.</p>
    </div>
  );
}

/* ---------- attention, not score: which zones the entries are about ---------- */
function HeatMap({ stats }) {
  const { weekly, mentions, lastMention, entries35: all } = stats;
  const mx = Math.max(1, ...Object.values(weekly).flat());
  const most = ZONES.map((z) => [z, mentions[z] ?? 0]).sort((a, b) => b[1] - a[1])[0];
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const faded = ZONES.filter((z) => lastMention[z] && lastMention[z] < twoWeeksAgo)
    .sort((a, b) => lastMention[a].localeCompare(lastMention[b]))[0];
  return (
    <div className="card">
      <div className="spread"><b style={{ fontSize: 15 }}>What you actually write about</b><span className="meta">last 5 weeks</span></div>
      <p className="meta" style={{ margin: '4px 0 12px' }}>Not good or bad — how often each zone appears in your entries.</p>
      <div className="hhead"><span className="hn" /><span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>W5</span><b>ALL</b></div>
      {ZONES.map((z) => {
        const tot = mentions[z] ?? 0;
        return (
          <div key={z} className={`hrow ${tot ? '' : 'off'}`}>
            <span className="hn">{zl(z)}</span>
            {weekly[z].map((v, k) => (v === 0
              ? <span key={k} className="hc zero" aria-label="no entries" />
              : <span key={k} className="hc" style={{ background: zc(z), opacity: (0.22 + 0.62 * v / mx).toFixed(2) }}>{v}</span>))}
            <b>{tot}</b><span className="hp">{all ? Math.round(100 * tot / all) : 0}%</span>
          </div>
        );
      })}
      <p className="meta" style={{ margin: '12px 0 0', borderTop: '1px solid var(--div)', paddingTop: 12 }}>
        {all === 0 ? 'No entries in the last five weeks yet.' : (
          <>
            {cap(zl(most[0]))} appears in {most[1]} of your {all} entries in the last five weeks.
            {faded && ` ${cap(zl(faded))} has not come up since ${shortDate(lastMention[faded])}.`} One entry can touch more than one zone.
          </>
        )}
      </p>
    </div>
  );
}
