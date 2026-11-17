/**
 * The nine-sided radar chart of the topic profile.
 *
 * Drawn as SVG from the weights the API returns, so it is always the real
 * numbers and never a picture. Three things it does on purpose:
 *
 *   - the whole chart carries one aria-label listing all nine values, so a
 *     screen reader gets the information the shape conveys;
 *   - each label is focusable and shows that zone's exact number, because a
 *     shape is good for comparing and useless for reading a value;
 *   - a muted zone is drawn at the centre, which is what muting means: the
 *     diary does not ask about it.
 */
import { esc, fmt } from '../dom.js';

const ORDER = ['work', 'energy', 'emotion', 'people', 'self', 'interest', 'health', 'everyday', 'meaning'];

/**
 * @param {Array<{zone: {id, name, short, colour}, weight: number, isMuted: boolean}>} zones
 * @param {object} [options]
 * @returns {string} SVG markup
 */
export function radar(zones, { size = 240, interactive = true } = {}) {
  if (!zones?.length) return '<div class="skeleton" style="height:240px"></div>';

  // Always draw the zones in the same order, so the shape of a profile is
  // comparable from one day to the next.
  const byId = Object.fromEntries(zones.map((z) => [z.zone.id, z]));
  const points = ORDER.map((id) => byId[id]).filter(Boolean);

  const n = points.length;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 34;

  const at = (i, r) => [
    cx + r * Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n),
    cy + r * Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / n),
  ];
  const xy = (i, r) => at(i, r).map((v) => v.toFixed(1)).join(',');

  const value = (row) => (row.isMuted ? 0 : row.weight);
  const highest = [...points].filter((p) => !p.isMuted).sort((a, b) => b.weight - a.weight)[0];

  let g = `
    <defs>
      <linearGradient id="radar-fill" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stop-color="#B9AEFF"/>
        <stop offset="0.55" stop-color="#7C6CEA"/>
        <stop offset="1" stop-color="#3DDBA8"/>
      </linearGradient>
      <linearGradient id="radar-edge" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stop-color="#C6BDFF"/>
        <stop offset="1" stop-color="#5FE0BE"/>
      </linearGradient>
    </defs>`;

  // the rings at 0.25, 0.50, 0.75 and 1.00
  for (const k of [0.25, 0.5, 0.75, 1]) {
    const ring = points.map((_, i) => xy(i, R * k)).join(' ');
    g += `<polygon points="${ring}" fill="none" stroke="#302F45" stroke-width="0.75" stroke-opacity="${k < 1 ? 0.55 : 0.9}"/>`;
  }

  // one spoke per zone, tinted in that zone's colour
  points.forEach((p, i) => {
    const [x, y] = at(i, R);
    g += `<line class="zone-axis" data-zone="${esc(p.zone.id)}" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${esc(p.zone.colour)}" stroke-width="0.75" stroke-opacity="0.45"/>`;
  });

  // the shape itself
  const shape = points.map((p, i) => xy(i, R * value(p))).join(' ');
  g += `<polygon points="${shape}" fill="url(#radar-fill)" fill-opacity="0.28" stroke="url(#radar-edge)" stroke-width="1.8" stroke-linejoin="round"/>`;

  // a dot on each vertex; the highest zone gets a halo
  points.forEach((p, i) => {
    const [x, y] = at(i, R * value(p));
    const isTop = highest && p.zone.id === highest.zone.id;
    if (isTop) {
      g += `<circle class="zone-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${esc(p.zone.colour)}" fill-opacity="0.22"/>`;
    }
    g += `<circle class="zone-point" data-zone="${esc(p.zone.id)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isTop ? 3.8 : 2.4}" fill="${isTop ? esc(p.zone.colour) : '#9B8CFF'}"${isTop ? ' stroke="#0C0B14" stroke-width="1.2"' : ''}/>`;
  });

  // the labels
  points.forEach((p, i) => {
    const [x, y] = at(i, R + 13);
    const anchor = x > cx + 4 ? 'start' : x < cx - 4 ? 'end' : 'middle';
    const isTop = highest && p.zone.id === highest.zone.id;
    g += `<text class="zone-label" data-zone="${esc(p.zone.id)}"${interactive ? ' tabindex="0" role="button"' : ''}
            aria-label="${esc(p.zone.name)}, ${fmt(p.weight)}${p.isMuted ? ', muted' : ''}"
            x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="11" font-weight="${isTop ? 700 : 500}"
            fill="${esc(p.zone.colour)}" fill-opacity="${p.isMuted ? 0.45 : 1}" text-anchor="${anchor}"
            font-family="inherit">${esc(p.zone.short)}</text>`;
  });

  const summary = points.map((p) => `${p.zone.name} ${fmt(p.weight)}`).join(', ');

  return `
    <div class="radar-wrap">
      <svg viewBox="-46 -4 ${size + 92} ${size + 8}" role="img"
           aria-label="Your topic profile. ${esc(summary)}.">${g}</svg>
      <div class="zone-detail" data-radar-detail aria-live="polite">
        ${highest ? `<span style="color:${esc(highest.zone.colour)}">${esc(highest.zone.name)}</span>
        <span class="v">${fmt(highest.weight)}</span>
        <span class="meta">your highest zone right now</span>` : ''}
      </div>
    </div>`;
}

/**
 * Makes the labels interactive: pointing at or focusing a zone dims the rest
 * and shows that zone's number underneath.
 */
export function wireRadar(root, zones) {
  const svg = root.querySelector('.radar-wrap svg');
  const detail = root.querySelector('[data-radar-detail]');
  if (!svg || !detail) return;

  const byId = Object.fromEntries(zones.map((z) => [z.zone.id, z]));
  const original = detail.innerHTML;

  const focus = (id) => {
    const row = byId[id];
    if (!row) return;
    svg.classList.add('focusing');
    svg.querySelectorAll('[data-zone]').forEach((el) => {
      el.classList.toggle('on', el.dataset.zone === id);
    });
    detail.innerHTML = `
      <span style="color:${esc(row.zone.colour)}">${esc(row.zone.name)}</span>
      <span class="v">${fmt(row.weight)}</span>
      <span class="meta">${row.isMuted ? 'muted — never asked about' : row.askedAbout ? 'among the three asked about' : 'in your profile'}</span>`;
  };

  const blur = () => {
    svg.classList.remove('focusing');
    svg.querySelectorAll('.on').forEach((el) => el.classList.remove('on'));
    detail.innerHTML = original;
  };

  svg.querySelectorAll('.zone-label').forEach((label) => {
    const id = label.dataset.zone;
    label.addEventListener('pointerenter', () => focus(id));
    label.addEventListener('pointerleave', blur);
    label.addEventListener('focus', () => focus(id));
    label.addEventListener('blur', blur);
  });
}

export default radar;
