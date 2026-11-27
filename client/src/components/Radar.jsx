/**
 * The radar chart of the nine weights (Today and Profile).
 *
 *   the chart       grid, spokes, the profile shape, the labels
 *   the zone line   under the chart: the highest zone, or one zone's detail
 *                   while its label is hovered, focused or pinned (click /
 *                   Enter pins, Escape unpins)
 *   the spring      when the weights change, the shape springs from the old
 *                   values to the new ones, with one scan ring and a spark at
 *                   the vertex that moved most — once, never in a loop
 *   points of light glowing points on the outline that slide away from the
 *                   cursor; their animation loop sleeps when nothing moves
 *
 * Muted zones are drawn at 0: the diary never asks about them. The spring
 * and the points write SVG attributes directly from requestAnimationFrame
 * (through refs) instead of re-rendering React sixty times a second.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ZONES, ZONE_SHORT, zc, zl, sortedZones, topThree } from '../lib/zones.js';
import { reduceMotion, weekday } from '../lib/format.js';
import { useDiary } from '../state/DiaryContext.jsx';

const N = 9;
const SPARK_COUNT = 24;
// a fixed pseudo-random layout, so the points do not reshuffle on every render
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const SPARKS = [...Array(SPARK_COUNT)].map((_, i) => ({
  r: 2.2 + rnd(i, 1) * 2.6, fill: `url(#spark${'ABC'[i % 3]})`, opacity: 0.6 + rnd(i, 2) * 0.4,
  edge: i < 15, seg: Math.floor(rnd(i, 3) * 9), f: 0.15 + rnd(i, 4) * 0.7,
}));

function geometry(size) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 34;
  const pt = (i, r) => [
    cx + r * Math.cos(-Math.PI / 2 + 2 * Math.PI * i / N),
    cy + r * Math.sin(-Math.PI / 2 + 2 * Math.PI * i / N),
  ];
  return { cx, cy, R, pt };
}
const fmt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;

/** The line under the chart. */
function ZoneLine({ zone, weights, topZone }) {
  const { profile, stats } = useDiary();
  if (!zone) {
    if (!topZone) return null;
    return (
      <p className="meta" style={{ margin: '4px 0 0' }}>
        Highest now: <b style={{ color: 'var(--accent)' }}>{zl(topZone[0])} {topZone[1].toFixed(2)}</b>
      </p>
    );
  }
  const v = weights[zone] ?? 0, d = v - (profile.startW[zone] ?? v), m = stats.mentions[zone] ?? 0;
  const off = profile.muted.includes(zone), asked = topThree(profile.weights, profile.muted).includes(zone);
  return (
    <div className="zonedetail">
      <span className="zv" style={{ color: zc(zone) }}>{zl(zone)}</span>
      <span className="zv">{off ? 'muted' : v.toFixed(2)}</span>
      <span className="zd">{d >= 0 ? '+' : ''}{d.toFixed(2)} since the quiz</span>
      <span className="zd">· {m} {m === 1 ? 'entry' : 'entries'} in five weeks</span>
      <span className="zd">· {off ? 'never asked while muted' : (asked ? 'in your top three' : 'asked now and then')}</span>
    </div>
  );
}

/** One scan ring over the grid when the profile updates. */
function ScanRing({ cx, cy, R, onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now(), D = 540;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / D);
      ref.current?.setAttribute('r', (2 + (R + 8) * k).toFixed(1));
      ref.current?.setAttribute('stroke-opacity', (0.55 * (1 - k)).toFixed(2));
      if (k < 1) raf = requestAnimationFrame(step); else onDone();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <circle ref={ref} cx={cx} cy={cy} r="2" fill="none" stroke="#5FE0BE" strokeWidth="1.4" pointerEvents="none" />;
}

/** A short burst of rays at the vertex that moved most. */
function VertexSpark({ x, y, colour, onDone }) {
  const rays = useRef([]);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now(), D = 520;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / D), e = 1 - (1 - k) ** 2;
      rays.current.forEach((l, n) => {
        if (!l) return;
        const a = (n / 7) * Math.PI * 2;
        l.setAttribute('x1', (x + Math.cos(a) * (3 + 7 * e)).toFixed(1));
        l.setAttribute('y1', (y + Math.sin(a) * (3 + 7 * e)).toFixed(1));
        l.setAttribute('x2', (x + Math.cos(a) * (5 + 12 * e)).toFixed(1));
        l.setAttribute('y2', (y + Math.sin(a) * (5 + 12 * e)).toFixed(1));
        l.setAttribute('stroke-opacity', (0.85 * (1 - k)).toFixed(2));
      });
      if (k < 1) raf = requestAnimationFrame(step); else onDone();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <g pointerEvents="none">
      {[...Array(7)].map((_, n) => (
        <line key={n} ref={(el) => { rays.current[n] = el; }} stroke={colour} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0" />
      ))}
    </g>
  );
}

/**
 * @param weights   the weights to show (today's, or a past day's)
 * @param pastDay   'YYYY-MM-DD' when a past day is shown, else null
 * @param onBackToToday  the "back to today" link while a past day is shown
 */
export default function Radar({ weights, size = 240, pastDay = null, onBackToToday }) {
  const { profile } = useDiary();
  const { muted } = profile;
  const { cx, cy, R, pt } = geometry(size);
  const val = (w, z) => (muted.includes(z) ? 0 : (w[z] ?? 0));
  const shape = (w) => ZONES.map((z, i) => fmt(pt(i, R * val(w, z)))).join(' ');
  const topZone = sortedZones(weights).filter(([z]) => !muted.includes(z))[0];

  const svgRef = useRef(null), polyRef = useRef(null), glowRef = useRef(null);
  const dotRefs = useRef({}), haloRef = useRef(null), sparkRefs = useRef([]);
  const drawn = useRef(weights); // the weights the shape last settled on
  const [bursts, setBursts] = useState([]);
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);
  const focus = pinned || hover;

  /* ---- the spring: from the weights drawn last to the new ones ---- */
  useLayoutEffect(() => {
    const from = drawn.current, to = weights;
    drawn.current = weights;
    if (ZONES.every((z) => val(from, z) === val(to, z))) return undefined;
    const place = (e) => {
      const at = (z) => val(from, z) + (val(to, z) - val(from, z)) * e;
      const pts = ZONES.map((z, i) => fmt(pt(i, R * at(z)))).join(' ');
      polyRef.current?.setAttribute('points', pts);
      glowRef.current?.setAttribute('points', pts);
      ZONES.forEach((z, i) => {
        const [x, y] = pt(i, R * at(z));
        for (const el of [dotRefs.current[z], topZone?.[0] === z ? haloRef.current : null]) {
          el?.setAttribute('cx', x.toFixed(1));
          el?.setAttribute('cy', y.toFixed(1));
        }
      });
    };
    if (reduceMotion()) { place(1); return undefined; }

    // a scan ring, and a spark where the shape moved most
    let best = null, bd = 0;
    ZONES.forEach((z, i) => { const d = Math.abs(val(to, z) - val(from, z)); if (d > bd) { bd = d; best = [z, i]; } });
    const added = [{ id: `ring${performance.now()}`, kind: 'ring' }];
    if (best && bd >= 0.02) {
      const [x, y] = pt(best[1], R * val(to, best[0]));
      added.push({ id: `spark${performance.now()}`, kind: 'spark', x, y, colour: zc(best[0]) });
    }
    setBursts((list) => [...list, ...added]);

    // a spring with a little overshoot, so the web springs rather than slides
    const spring = (k) => 1 - 2 ** (-9 * k) * Math.cos(k * Math.PI * 2.4);
    const t0 = performance.now(), D = 620;
    let raf = 0;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / D);
      place(k >= 1 ? 1 : spring(k));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    place(0);
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); place(1); };
  }, [weights, muted]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- points of light: run only while something moves ---- */
  useEffect(() => {
    const svg = svgRef.current, poly = polyRef.current;
    if (!svg || !poly) return undefined;
    const calm = reduceMotion();
    const state = SPARKS.map(() => ({ ox: 0, oy: 0 }));
    let mx = null, my = null, raf = 0;
    const settleUntil = performance.now() + 1000; // follow the spring after a change
    const tick = (now) => {
      raf = 0;
      const P = [...poly.points].map((q) => [q.x, q.y]);
      let moving = now < settleUntil;
      SPARKS.forEach((sp, i) => {
        let x, y;
        if (sp.edge) {
          const a = P[sp.seg], b = P[(sp.seg + 1) % P.length];
          x = a[0] + (b[0] - a[0]) * sp.f; y = a[1] + (b[1] - a[1]) * sp.f;
        } else { const v = P[sp.seg]; x = cx + (v[0] - cx) * sp.f; y = cy + (v[1] - cy) * sp.f; }
        let tx = 0, ty = 0;
        if (mx !== null && !calm) { // pushed away from the cursor, up to ~26 units within 60
          const dx = x - mx, dy = y - my, d = Math.hypot(dx, dy) || 1, k = Math.max(0, 1 - d / 60);
          tx = dx / d * 26 * k * k; ty = dy / d * 26 * k * k;
        }
        const s = state[i];
        s.ox += (tx - s.ox) * 0.16; s.oy += (ty - s.oy) * 0.16;
        if (Math.abs(tx - s.ox) > 0.05 || Math.abs(ty - s.oy) > 0.05) moving = true;
        sparkRefs.current[i]?.setAttribute('cx', (x + s.ox).toFixed(1));
        sparkRefs.current[i]?.setAttribute('cy', (y + s.oy).toFixed(1));
      });
      if (moving) raf = requestAnimationFrame(tick); // otherwise sleep until the next hover
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const toSvg = (e) => {
      const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    const onMove = (e) => { const p = toSvg(e); mx = p.x; my = p.y; wake(); };
    const onLeave = () => { mx = null; my = null; wake(); };
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerleave', onLeave);
    };
  }, [weights, muted, cx, cy]);

  /* ---- labels: hover, focus, pin ---- */
  const togglePin = (z) => setPinned((p) => (p === z ? null : z));
  const labelProps = (z) => ({
    onMouseEnter: () => setHover(z),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover(z),
    onBlur: () => setHover(null),
    onClick: () => togglePin(z),
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePin(z); }
      if (e.key === 'Escape') { setPinned(null); setHover(null); e.currentTarget.blur(); }
    },
  });
  const on = (z) => (focus === z ? ' on' : '');

  // Always rendered at the target values. When they change, the layout
  // effect above moves the shape back to the old values before the browser
  // paints, then springs it forward, so the change is never seen as a jump.
  const start = weights;
  return (
    <>
      <svg
        ref={svgRef} width="100%" viewBox={`-40 -2 ${size + 80} ${size + 4}`} role="img"
        className={focus ? 'focusing' : ''}
        aria-label={`Topic profile. ${ZONES.map((z) => `${zl(z)} ${(weights[z] ?? 0).toFixed(2)}`).join(', ')}.`}
      >
        <defs>
          <linearGradient id="rfill" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#E9D5FF" /><stop offset="0.5" stopColor="#A855F7" /><stop offset="1" stopColor="#3DDBA8" />
          </linearGradient>
          <linearGradient id="redge" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#C6BDFF" /><stop offset="1" stopColor="#5FE0BE" />
          </linearGradient>
          <filter id="rglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" /></filter>
          {[['sparkA', '#F5D0FE', '#E879F9', 0.45], ['sparkB', '#C4B5FD', '#A855F7', 0.45], ['sparkC', '#A5F3FC', '#5FE0BE', 0.4]].map(([id, light, colour, o]) => (
            <radialGradient key={id} id={id}>
              <stop offset="0" stopColor="#FFFFFF" /><stop offset=".25" stopColor={light} />
              <stop offset=".55" stopColor={colour} stopOpacity={o} /><stop offset="1" stopColor={colour} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>

        {[0.25, 0.5, 0.75, 1].map((k) => (
          <polygon key={k} points={ZONES.map((_, i) => fmt(pt(i, R * k))).join(' ')} fill="none" stroke="#A855F7" strokeWidth="0.75" strokeOpacity={k < 1 ? 0.22 : 0.45} />
        ))}
        {ZONES.map((z, i) => {
          const [x, y] = pt(i, R);
          return <line key={z} className={`zaxis${on(z)}`} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke={zc(z)} strokeWidth="0.75" strokeOpacity="0.45" />;
        })}
        {[0.5, 1].map((k) => (
          <text key={k} x={cx + 5} y={(cy - R * k + 3).toFixed(1)} fontSize="7" fill="#8B89A3" fillOpacity="0.6" fontFamily="inherit">{k.toFixed(2)}</text>
        ))}

        <polygon id="radarGlow" ref={glowRef} points={shape(start)} fill="none" stroke="#C084FC" strokeWidth="8" strokeOpacity="0.32" filter="url(#rglow)" />
        <polygon id="radarPoly" ref={polyRef} points={shape(start)} fill="url(#rfill)" fillOpacity="0.34" stroke="url(#redge)" strokeWidth="1.8" strokeLinejoin="round" />

        {ZONES.map((z, i) => {
          const [x, y] = pt(i, R * val(start, z));
          const isTop = topZone?.[0] === z;
          return (
            <g key={z}>
              <circle
                ref={(el) => { dotRefs.current[z] = el; }} className={`rv${isTop ? ' rtop' : ''}${on(z)}`}
                cx={x.toFixed(1)} cy={y.toFixed(1)} r={isTop ? 3.6 : 2.4} fill={isTop ? zc(z) : '#9B8CFF'} fillOpacity={isTop ? 1 : 0.85}
                stroke={isTop ? '#07030E' : undefined} strokeWidth={isTop ? 1.2 : undefined}
              />
              {isTop && <circle ref={haloRef} className={`rhalo${on(z)}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="7" fill={zc(z)} fillOpacity="0.22" />}
            </g>
          );
        })}

        <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
          {SPARKS.map((sp, i) => (
            <circle key={i} ref={(el) => { sparkRefs.current[i] = el; }} r={sp.r.toFixed(1)} fill={sp.fill} opacity={sp.opacity.toFixed(2)} />
          ))}
        </g>

        {ZONES.map((z, i) => {
          const [x, y] = pt(i, R + 13);
          const anchor = x > cx + 4 ? 'start' : (x < cx - 4 ? 'end' : 'middle');
          return (
            <text
              key={z} className={`zlabel${on(z)}`} tabIndex={0} role="button" {...labelProps(z)}
              aria-label={`${zl(z)}, ${(weights[z] ?? 0).toFixed(2)}. Show details.`}
              x={x.toFixed(1)} y={(y + 4).toFixed(1)} fontSize="11" fontWeight={topZone?.[0] === z ? 700 : 500}
              fill={zc(z)} textAnchor={anchor} fontFamily="inherit"
            >{ZONE_SHORT[z]}</text>
          );
        })}

        {bursts.map((b) => (b.kind === 'ring'
          ? <ScanRing key={b.id} cx={cx} cy={cy} R={R} onDone={() => setBursts((l) => l.filter((x) => x.id !== b.id))} />
          : <VertexSpark key={b.id} x={b.x} y={b.y} colour={b.colour} onDone={() => setBursts((l) => l.filter((x) => x.id !== b.id))} />))}
      </svg>

      {pastDay ? (
        <p className="meta timewarp" style={{ margin: '4px 0 0' }}>
          Showing <b>{weekday(pastDay)}</b> · <button className="linkbtn" onClick={onBackToToday}>back to today</button>
        </p>
      ) : (
        <div aria-live="polite"><ZoneLine zone={focus} weights={weights} topZone={topZone} /></div>
      )}
    </>
  );
}
