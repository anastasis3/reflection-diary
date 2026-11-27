/**
 * The researcher console: the pilot's numbers, live.
 *
 * Behind the password in RESEARCH_PASSWORD, sent as the x-research-password
 * header and kept for this browser tab only (sessionStorage). The summary is
 * fetched every 5 seconds while the tab is visible. Entry texts are never
 * loaded here; names and e-mails are shown on this page only, and the CSV
 * export keeps pseudonyms.
 */
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/research.css';

const KEY = 'research-pw';
const storedPassword = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };

async function call(path, password) {
  const res = await fetch(`/api/research/${path}`, { headers: { 'x-research-password': password } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const e = new Error(body?.error?.message ?? `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res;
}

const DAY = 86_400_000;
const daysSince = (iso) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : 0);
const ago = (iso) => {
  if (!iso) return '—';
  const d = daysSince(iso);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
const when = (iso) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pp = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v} pp`);
const cls = (v) => (v === null ? 'none' : v >= 0 ? 'up' : 'down');
const s = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Login({ message, onOpen }) {
  const [value, setValue] = useState('');
  return (
    <section className="box" style={{ maxWidth: 420 }}>
      <h3>RESEARCHER ACCESS</h3>
      <p style={{ margin: '0 0 12px' }}>Enter the password set in <code>RESEARCH_PASSWORD</code>.</p>
      <div className="row">
        <input type="password" autoComplete="current-password" aria-label="Researcher password" value={value}
          onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(value); }} />
        <button className="main" onClick={() => onOpen(value)}>Open</button>
      </div>
      {message && <p className="err">{message}</p>}
    </section>
  );
}

function Kpis({ d }) {
  const { kpi1: k1, kpi2: k2 } = d;
  return (
    <div className="kpis">
      <div className="box">
        <h3>KPI1 · WHAT GETS PICKED FIRST</h3>
        <p className={`big ${cls(k1.deltaPoints)}`}>{pp(k1.deltaPoints)}</p>
        <p>Adaptive {k1.percentAdaptive ?? '—'}% · chance {k1.percentExpected}%</p>
        <small>{k1.firstPicks} first picks · above 0 = better than blind picking</small>
      </div>
      <div className="box">
        <h3>KPI2 · RELEVANCE</h3>
        <p className={`big ${cls(k2.deltaPoints)}`}>{pp(k2.deltaPoints)}</p>
        <p>Adaptive {k2.adaptive.percent ?? '—'}% · random {k2.random.percent ?? '—'}%</p>
        <small>{k2.adaptive.rated + k2.random.rated} rated questions · rated only after answering</small>
      </div>
      <div className="box">
        <h3>KPI3 · CLASSIFIER</h3>
        <p className="big none">{d.classifier}</p>
        <p>{d.entries - d.failedAnalyses} of {d.entries} entries analysed</p>
        <small>macro-F1 needs the hand-labelled sample (target ≥ 0.70)</small>
      </div>
    </div>
  );
}

function Participants({ rows }) {
  return (
    <div className="box" style={{ marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><b>Participants</b><small>{s(rows.length, 'participant')}</small></div>
      <div className="tblwrap">
        <table>
          <thead>
            <tr>
              <th>participant</th><th className="r">days shown</th><th className="r">days written</th><th className="r">answered</th>
              <th className="r">👍 adaptive</th><th className="r">👎 adaptive</th><th className="r">👍 random</th><th className="r">👎 random</th>
              <th className="r">first pick adaptive</th><th className="r">last entry</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} style={{ color: '#8B89A3' }}>No participants yet.</td></tr>}
            {rows.map((p) => (
              <tr key={p.pseudonym}>
                <td>
                  <b>{p.name || p.email || p.pseudonym}</b>{!p.onboarded && <> <small>(quiz not finished)</small></>}<br />
                  <small>{p.pseudonym}{p.name && p.email ? ` · ${p.email}` : ''}</small>
                </td>
                <td className="r">{p.daysShown}</td>
                <td className="r">{p.daysWritten}</td>
                <td className="r">{p.answered}</td>
                <td className="r">{p.likedAdaptive}</td>
                <td className="r">{p.dislikedAdaptive}</td>
                <td className="r">{p.likedRandom}</td>
                <td className="r">{p.dislikedRandom}</td>
                <td className="r">{p.firstPickAdaptive === null ? '—' : `${p.firstPickAdaptive}%`}</td>
                <td className={`r ${p.lastEntry && daysSince(p.lastEntry) >= 3 ? 'old' : ''}`}>{ago(p.lastEntry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Console({ data, live, onExport }) {
  const d = data;
  return (
    <section>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Researcher console</h1>
          <p className="sub">
            Pilot day {d.pilotDay} · {s(d.participants, 'participant')} · {d.entries} entries · classifier: {d.classifier}
            {d.failedAnalyses ? ` · ${d.failedAnalyses} analyses pending` : ''}
          </p>
        </div>
        <span className={`live ${live.ok ? '' : 'off'}`}><i /><span>{live.text}</span></span>
      </div>
      <Kpis d={d} />
      <Participants rows={d.table} />
      <div className="kpis">
        <div className="box">
          <b>Latest activity</b>
          <ul className="feed">
            {d.feed.length === 0 && <li style={{ color: '#8B89A3' }}>Nothing yet.</li>}
            {d.feed.map((e, i) => (
              <li key={i}>
                <time>{when(e.at)}</time>
                <span>{e.who} {e.what}{e.zone ? ` · ${e.zone}` : ''} {e.kind && <span className={`tag ${e.kind}`}>{e.kind}</span>}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="box">
          <b>Export</b>
          <p>One row per question shown: pseudonym, day, slot, zone, reason, chosen, first pick, answered, rating, explanation opened.</p>
          <p style={{ marginTop: 14 }}><button className="main" onClick={onExport}>Export CSV</button></p>
        </div>
      </div>
      <p className="note">Entry texts are never loaded here. Names and e-mails are shown on this page only; the CSV export keeps pseudonyms. Updates every 5 seconds.</p>
    </section>
  );
}

function ResearchApp() {
  const [password, setPassword] = useState(storedPassword);
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [live, setLive] = useState({ ok: true, text: 'live' });
  const timer = useRef(0);

  const forget = useCallback((msg) => {
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    setPassword(''); setData(null); setMessage(msg);
  }, []);

  /* "real-time": fetch every 5 seconds while the tab is visible */
  useEffect(() => {
    if (!password) return undefined;
    let stopped = false;
    const tick = async () => {
      clearTimeout(timer.current);
      try {
        const summary = await (await call('summary', password)).json();
        if (stopped) return;
        try { sessionStorage.setItem(KEY, password); } catch { /* ignore */ }
        setData(summary); setMessage(null);
        setLive({ ok: true, text: `live · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` });
      } catch (e) {
        if (stopped) return;
        if (e.status === 401 || e.status === 404) { forget(e.message); return; }
        setLive({ ok: false, text: 'connection lost — retrying' });
      }
      if (!document.hidden && !stopped) timer.current = setTimeout(tick, 5000);
    };
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    tick();
    return () => { stopped = true; clearTimeout(timer.current); document.removeEventListener('visibilitychange', onVisible); };
  }, [password, forget]);

  async function exportCsv() {
    const blob = await (await call('export.csv', password)).blob();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `pilot-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <>
      <div className="bar"><b>researcher console</b><span>researcher role</span></div>
      <main>
        {data ? <Console data={data} live={live} onExport={exportCsv} />
          : <Login message={message} onOpen={(value) => { setMessage(null); setPassword(value); }} />}
      </main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><ResearchApp /></StrictMode>);
