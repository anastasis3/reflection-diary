/**
 * The radar chart of the nine weights (Today and Profile).
 *
 *   radar(size, w)     the SVG: grid, spokes, the profile shape, the labels
 *   zoneLine(z, w)     the line under the chart: the highest zone, or one
 *                      zone's detail while it is hovered / focused / pinned
 *   animateRadar()     after a change the shape springs from S.prevW to the
 *                      new weights, with one scan ring and a spark at the
 *                      vertex that moved most — once, never in a loop
 *   wireZoneFocus()    hover or focus a label to highlight that zone;
 *                      click / Enter pins it, Escape unpins
 *   radarSparks()      glowing points on the outline that slide away from
 *                      the cursor; the animation loop sleeps when nothing moves
 *
 * Muted zones are drawn at 0: the diary never asks about them.
 */
import { S, ZONES, ZS, zc, zl, topThree, reduceMotion } from './core.js';

/** The weights the chart is showing: today's, or a past day's from the week strip. */
export function shownWeights() {
  if (S.viewDay != null && S.week?.days?.[S.viewDay]) {
    const w = S.week.days[S.viewDay].weights;
    return Object.fromEntries(ZONES.map((z) => [z, w[z] ?? 0]));
  }
  return S.weights;
}

/** How many entries mentioned a zone in the last five weeks (score >= 0.5). */
const mentions = (z) => S.mentions?.[z] ?? 0;

export function zoneLine(z, w, topZone) {
  w = w || S.weights;
  if (!z) {
    const t = topZone || Object.entries(w).sort((a, b) => b[1] - a[1])[0];
    if (!t) return '';
    return `<p class="meta" style="margin:4px 0 0">Highest now: <b style="color:var(--accent)">${zl(t[0])} ${t[1].toFixed(2)}</b></p>`;
  }
  const v = w[z] ?? 0, d = v - (S.startW[z] ?? v), m = mentions(z);
  const asked = topThree().includes(z), off = S.muted.includes(z);
  return `<div class="zonedetail">
    <span class="zv" style="color:${zc(z)}">${zl(z)}</span>
    <span class="zv">${off ? 'muted' : v.toFixed(2)}</span>
    <span class="zd">${d >= 0 ? '+' : ''}${d.toFixed(2)} since the quiz</span>
    <span class="zd">· ${m} ${m === 1 ? 'entry' : 'entries'} in five weeks</span>
    <span class="zd">· ${off ? 'never asked while muted' : (asked ? 'in your top three' : 'asked now and then')}</span>
  </div>`;
}

export function radar(size = 240, w) {
  w = w || S.weights;
  const n = 9, cx = size / 2, cy = size / 2, R = size / 2 - 34;
  const pt = (i, r) => [cx + r * Math.cos(-Math.PI / 2 + 2 * Math.PI * i / n), cy + r * Math.sin(-Math.PI / 2 + 2 * Math.PI * i / n)];
  const val = (ww, z) => (S.muted.includes(z) ? 0 : (ww[z] ?? 0));
  const live = Object.entries(w).sort((a, b) => b[1] - a[1]);
  const topZone = live.filter(([z]) => !S.muted.includes(z))[0];
  let g = `<defs>
    <linearGradient id="rfill" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#E9D5FF"/><stop offset="0.5" stop-color="#A855F7"/>
      <stop offset="1" stop-color="#3DDBA8"/></linearGradient>
    <linearGradient id="redge" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#C6BDFF"/><stop offset="1" stop-color="#5FE0BE"/></linearGradient>
    <filter id="rglow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="5"/></filter></defs>`;
  [0.25, 0.5, 0.75, 1].forEach((k) => {
    g += `<polygon points="${[...Array(n)].map((_, i) => pt(i, R * k).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#A855F7" stroke-width="0.75" stroke-opacity="${k < 1 ? 0.22 : 0.45}"/>`;
  });
  for (let i = 0; i < n; i += 1) {
    const [x, y] = pt(i, R);
    g += `<line class="zaxis" data-z="${ZONES[i]}" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${zc(ZONES[i])}" stroke-width="0.75" stroke-opacity="0.45"/>`;
  }
  [0.5, 1].forEach((k) => {
    g += `<text x="${cx + 5}" y="${(cy - R * k + 3).toFixed(1)}" font-size="7" fill="#8B89A3" fill-opacity="0.6" font-family="inherit">${k.toFixed(2)}</text>`;
  });
  const from = S.prevW || w;
  const shape = (ww) => ZONES.map((z, i) => pt(i, R * val(ww, z)).map((v) => v.toFixed(1)).join(',')).join(' ');
  const start = shape(from);
  g += `<polygon id="radarGlow" points="${start}" fill="none" stroke="#C084FC" stroke-width="8" stroke-opacity="0.32" filter="url(#rglow)"/>`;
  g += `<polygon id="radarPoly" points="${start}" fill="url(#rfill)" fill-opacity="0.34" stroke="url(#redge)" stroke-width="1.8" stroke-linejoin="round"/>`;
  ZONES.forEach((z, i) => {
    const [x, y] = pt(i, R * val(from, z));
    const isTop = topZone && z === topZone[0];
    g += `<circle class="rv${isTop ? ' rtop' : ''}" data-z="${z}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isTop ? 3.6 : 2.4}" fill="${isTop ? zc(z) : '#9B8CFF'}" fill-opacity="${isTop ? 1 : 0.85}"${isTop ? ' stroke="#07030E" stroke-width="1.2"' : ''}/>`;
    if (isTop) g += `<circle class="rhalo" data-z="${z}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${zc(z)}" fill-opacity="0.22"/>`;
  });
  ZONES.forEach((z, i) => {
    const [x, y] = pt(i, R + 13);
    const a = x > cx + 4 ? 'start' : (x < cx - 4 ? 'end' : 'middle');
    const isTop = topZone && z === topZone[0];
    g += `<text class="zlabel" data-z="${z}" tabindex="0" role="button"
      aria-label="${zl(z)}, ${(w[z] ?? 0).toFixed(2)}. Show details."
      x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="11" font-weight="${isTop ? 700 : 500}"
      fill="${zc(z)}" text-anchor="${a}" font-family="inherit">${ZS[z] || z}</text>`;
  });
  window.__radar = { n, cx, cy, R, pt };
  const past = S.viewDay != null && S.week?.days && S.viewDay !== S.week.days.length - 1;
  const pastName = past ? new Date(`${S.week.days[S.viewDay].day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }) : '';
  return `<svg width="100%" viewBox="-40 -2 ${size + 80} ${size + 4}" role="img" aria-label="Topic profile. ${ZONES.map((z) => `${zl(z)} ${(w[z] ?? 0).toFixed(2)}`).join(', ')}.">${g}</svg>
    ${past
    ? `<p class="meta timewarp" style="margin:4px 0 0">Showing <b>${pastName}</b> · <button class="linkbtn" id="backToToday">back to today</button></p>`
    : `<div id="zoneLine" aria-live="polite">${zoneLine(null, w, topZone)}</div>`}`;
}

/* a single scan ring over the grid when the profile updates */
function sweepGrid() {
  const svg = document.querySelector('.profilecard svg'); if (!svg) return;
  const { cx, cy, R } = window.__radar;
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', 2);
  ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#5FE0BE');
  ring.setAttribute('stroke-width', '1.4'); ring.setAttribute('pointer-events', 'none');
  svg.appendChild(ring);
  const t0 = performance.now(), D = 540;
  (function step(t) {
    const k = Math.min(1, (t - t0) / D);
    ring.setAttribute('r', (2 + (R + 8) * k).toFixed(1));
    ring.setAttribute('stroke-opacity', (0.55 * (1 - k)).toFixed(2));
    if (k < 1) requestAnimationFrame(step); else ring.remove();
  }(performance.now()));
}

/* a short spark at the vertex that actually moved most */
function sparkAt(from, to) {
  const svg = document.querySelector('.profilecard svg'); if (!svg) return;
  const { R, pt } = window.__radar;
  let best = null, bd = 0;
  ZONES.forEach((z, i) => { const d = Math.abs((to[z] || 0) - (from[z] || 0)); if (d > bd) { bd = d; best = [z, i]; } });
  if (!best || bd < 0.02) return;
  const [z, i] = best, [x, y] = pt(i, R * to[z]);
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('pointer-events', 'none'); svg.appendChild(g);
  const rays = [...Array(7)].map((_, k) => {
    const a = (k / 7) * Math.PI * 2, l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('stroke', zc(z)); l.setAttribute('stroke-width', '1.4');
    l.setAttribute('stroke-linecap', 'round'); g.appendChild(l);
    return [l, a];
  });
  const t0 = performance.now(), D = 520;
  (function step(t) {
    const k = Math.min(1, (t - t0) / D), e = 1 - (1 - k) ** 2;
    rays.forEach(([l, a]) => {
      l.setAttribute('x1', (x + Math.cos(a) * (3 + 7 * e)).toFixed(1));
      l.setAttribute('y1', (y + Math.sin(a) * (3 + 7 * e)).toFixed(1));
      l.setAttribute('x2', (x + Math.cos(a) * (5 + 12 * e)).toFixed(1));
      l.setAttribute('y2', (y + Math.sin(a) * (5 + 12 * e)).toFixed(1));
      l.setAttribute('stroke-opacity', (0.85 * (1 - k)).toFixed(2));
    });
    if (k < 1) requestAnimationFrame(step); else g.remove();
  }(performance.now()));
}

export function animateRadar() {
  const poly = document.getElementById('radarPoly'), glow = document.getElementById('radarGlow');
  if (!poly || !S.prevW) { S.prevW = null; return; }
  const { R, pt } = window.__radar, from = { ...S.prevW }, to = { ...shownWeights() };
  S.prevW = null;
  const v = (ww, z) => (S.muted.includes(z) ? 0 : (ww[z] ?? 0));
  const dots = [...document.querySelectorAll('.rv,.rhalo')];
  const place = (e) => {
    const pts = ZONES.map((z, i) => pt(i, R * (v(from, z) + (v(to, z) - v(from, z)) * e)).map((x) => x.toFixed(1)).join(',')).join(' ');
    poly.setAttribute('points', pts); if (glow) glow.setAttribute('points', pts);
    dots.forEach((d) => {
      const z = d.dataset.z, i = ZONES.indexOf(z);
      const [x, y] = pt(i, R * (v(from, z) + (v(to, z) - v(from, z)) * e));
      d.setAttribute('cx', x.toFixed(1)); d.setAttribute('cy', y.toFixed(1));
    });
  };
  if (reduceMotion()) { place(1); return; }
  sweepGrid(); sparkAt(from, to);
  // a spring with a little overshoot, so the web springs rather than slides
  const spring = (k) => 1 - 2 ** (-9 * k) * Math.cos(k * Math.PI * 2.4);
  const t0 = performance.now(), D = 620;
  (function step(t) {
    const k = Math.min(1, (t - t0) / D);
    place(k >= 1 ? 1 : spring(k));
    if (k < 1) requestAnimationFrame(step);
  }(performance.now()));
}

export function wireZoneFocus() {
  const svg = document.querySelector('.profilecard svg, .card svg'); if (!svg) return;
  const line = document.getElementById('zoneLine');
  const set = (z) => {
    svg.classList.toggle('focusing', !!z);
    svg.querySelectorAll('.zlabel,.zaxis,.rv,.rhalo').forEach((el) => el.classList.toggle('on', !!z && el.dataset.z === z));
    if (line) line.innerHTML = zoneLine(z, shownWeights());
  };
  svg.querySelectorAll('.zlabel').forEach((el) => {
    const z = el.dataset.z;
    el.addEventListener('mouseenter', () => { if (!S.pinZone) set(z); });
    el.addEventListener('mouseleave', () => { if (!S.pinZone) set(null); });
    el.addEventListener('focus', () => set(z));
    el.addEventListener('blur', () => { if (!S.pinZone) set(null); });
    el.addEventListener('click', () => { S.pinZone = S.pinZone === z ? null : z; set(S.pinZone || z); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.pinZone = S.pinZone === z ? null : z; set(S.pinZone || z); }
      if (e.key === 'Escape') { S.pinZone = null; set(null); el.blur(); }
    });
  });
  if (S.pinZone) set(S.pinZone);
}

/* ---------- points of light ----------
   Built to cost nothing at rest: the glow is a gradient fill, not an SVG
   filter (a filter re-blurs on every change), and the animation loop runs
   only while a point is actually moving. */
const SPARKS = { raf: 0 };
export function radarSparks() {
  cancelAnimationFrame(SPARKS.raf);
  SPARKS.raf = 0;
  const poly = document.getElementById('radarPoly');
  if (!poly) return;
  const svg = poly.ownerSVGElement, NS = 'http://www.w3.org/2000/svg';
  const { cx, cy } = window.__radar;
  const calm = reduceMotion();

  svg.querySelector('defs').insertAdjacentHTML('beforeend', `
    <radialGradient id="sparkA"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".25" stop-color="#F5D0FE"/>
      <stop offset=".55" stop-color="#E879F9" stop-opacity=".45"/><stop offset="1" stop-color="#E879F9" stop-opacity="0"/></radialGradient>
    <radialGradient id="sparkB"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".25" stop-color="#C4B5FD"/>
      <stop offset=".55" stop-color="#A855F7" stop-opacity=".45"/><stop offset="1" stop-color="#A855F7" stop-opacity="0"/></radialGradient>
    <radialGradient id="sparkC"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".25" stop-color="#A5F3FC"/>
      <stop offset=".55" stop-color="#5FE0BE" stop-opacity=".4"/><stop offset="1" stop-color="#5FE0BE" stop-opacity="0"/></radialGradient>`);
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('aria-hidden', 'true');
  g.style.pointerEvents = 'none';
  svg.insertBefore(g, svg.querySelector('.zlabel')); // under the labels, so they stay readable

  // a fixed pseudo-random layout, so the points do not reshuffle on every render
  const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  const list = [];
  for (let i = 0; i < 24; i += 1) {
    const el = document.createElementNS(NS, 'circle');
    el.setAttribute('r', (2.2 + rnd(i, 1) * 2.6).toFixed(1));
    el.setAttribute('fill', `url(#spark${'ABC'[i % 3]})`);
    el.setAttribute('opacity', (0.6 + rnd(i, 2) * 0.4).toFixed(2));
    g.appendChild(el);
    list.push({ el, edge: i < 15, seg: Math.floor(rnd(i, 3) * 9), f: 0.15 + rnd(i, 4) * 0.7, ox: 0, oy: 0, x: 0, y: 0 });
  }

  let mx = null, my = null;
  const settleUntil = performance.now() + 1000; // follow the spring after a render
  const toSvg = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const wake = () => { if (!SPARKS.raf) SPARKS.raf = requestAnimationFrame(tick); };
  svg.addEventListener('pointermove', (e) => { const p = toSvg(e); mx = p.x; my = p.y; wake(); });
  svg.addEventListener('pointerleave', () => { mx = null; my = null; wake(); });

  function tick(now) {
    SPARKS.raf = 0;
    if (!document.body.contains(svg)) return; // the screen changed: stop
    const P = [...poly.points].map((q) => [q.x, q.y]);
    let moving = now < settleUntil;
    for (const sp of list) {
      if (sp.edge) {
        const a = P[sp.seg], b = P[(sp.seg + 1) % P.length];
        sp.x = a[0] + (b[0] - a[0]) * sp.f; sp.y = a[1] + (b[1] - a[1]) * sp.f;
      } else { const v = P[sp.seg]; sp.x = cx + (v[0] - cx) * sp.f; sp.y = cy + (v[1] - cy) * sp.f; }
      let tx = 0, ty = 0;
      if (mx !== null && !calm) { // pushed away from the cursor, up to ~26 units within 60
        const dx = sp.x - mx, dy = sp.y - my, d = Math.hypot(dx, dy) || 1, k = Math.max(0, 1 - d / 60);
        tx = dx / d * 26 * k * k; ty = dy / d * 26 * k * k;
      }
      sp.ox += (tx - sp.ox) * 0.16; sp.oy += (ty - sp.oy) * 0.16;
      if (Math.abs(tx - sp.ox) > 0.05 || Math.abs(ty - sp.oy) > 0.05) moving = true;
      sp.el.setAttribute('cx', (sp.x + sp.ox).toFixed(1));
      sp.el.setAttribute('cy', (sp.y + sp.oy).toFixed(1));
    }
    if (moving) SPARKS.raf = requestAnimationFrame(tick); // otherwise sleep until the next hover
  }
  SPARKS.raf = requestAnimationFrame(tick);
}
