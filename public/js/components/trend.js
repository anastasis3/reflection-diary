/**
 * One zone's weight over the last thirty days.
 *
 * It draws only the days that were actually recorded — no line is invented
 * across a gap where nothing was written, because that would show a movement
 * that never happened. With fewer than two points there is no trend to draw
 * and the card says so instead of drawing a dot and calling it a chart.
 */
import { esc, fmt } from '../dom.js';

export function trendChart({ zone, points }) {
  if (!points || points.length < 2) {
    return `
      <p class="meta" style="padding:var(--gap-4) 0">
        Not enough history yet for ${esc(zone.name)} — the line appears once this zone
        has moved on at least two different days.
      </p>`;
  }

  const W = 560;
  const H = 170;
  const padLeft = 36;
  const padRight = 8;
  const n = points.length;

  const x = (i) => padLeft + ((W - padLeft - padRight) * i) / (n - 1);
  const y = (v) => H - 18 - (H - 34) * v;

  let g = '';
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    g += `<line x1="${padLeft}" y1="${y(v).toFixed(1)}" x2="${W - padRight}" y2="${y(v).toFixed(1)}" stroke="#302F45"/>`;
    g += `<text x="${padLeft - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="10" fill="#8B89A3" text-anchor="end" font-family="inherit">${v.toFixed(2)}</text>`;
  }

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  g += `<polygon points="${x(0).toFixed(1)},${y(0).toFixed(1)} ${line} ${x(n - 1).toFixed(1)},${y(0).toFixed(1)}" fill="${esc(zone.colour)}" fill-opacity="0.12"/>`;
  g += `<polyline points="${line}" fill="none" stroke="${esc(zone.colour)}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  g += `<circle cx="${x(n - 1).toFixed(1)}" cy="${y(points.at(-1).weight).toFixed(1)}" r="4.5" fill="${esc(zone.colour)}" stroke="#14131F" stroke-width="2"/>`;

  const first = points[0];
  const last = points.at(-1);

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
         aria-label="${esc(zone.name)} over ${n} recorded days, from ${fmt(first.weight)} on ${esc(first.day)} to ${fmt(last.weight)} on ${esc(last.day)}.">${g}</svg>
    <div class="chart-axis">
      <span>${esc(first.day)}</span>
      <span>${esc(last.day)}</span>
    </div>`;
}

export default trendChart;
