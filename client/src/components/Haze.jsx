/**
 * The violet smoke behind the app screens. Painted once into a
 * half-resolution canvas on mount and on resize, then left alone: scrolling
 * and hovering never repaint it (a live SVG version cost ~100 ms a frame).
 */
import { useEffect, useRef } from 'react';

const HAZE_TILES = ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='700'%3E%3Cfilter id='f' x='0' y='0' width='1' height='1'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.003333 0.004286' numOctaves='5' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.58 0 0 0 0 0.30 0 0 0 0 0.98 2.4 0 0 0 -1.05'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E", "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1300' height='900'%3E%3Cfilter id='f' x='0' y='0' width='1' height='1'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.002308 0.003333' numOctaves='5' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.80 0 0 0 0 0.30 0 0 0 0 0.90 2.2 0 0 0 -1.1'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E"];

function paint(cv) {
  const w = innerWidth, h = innerHeight, k = 0.5;
  cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const glow = (x, y, rx, col) => {
    const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, rx * Math.max(W, H));
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  glow(0.2, 0.3, 0.45, 'rgba(139,92,246,.30)');
  glow(0.8, 0.7, 0.4, 'rgba(192,38,211,.20)');
  glow(0.6, 0.15, 0.35, 'rgba(99,102,241,.16)');
  const layers = [[HAZE_TILES[1], 0.35, -40], [HAZE_TILES[0], 0.55, 30]];
  layers.forEach(([src, alpha, shift]) => {
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.globalAlpha = alpha;
      if ('filter' in ctx) ctx.filter = 'blur(3px)';
      ctx.translate(shift, shift * 0.6); ctx.scale(k, k);
      ctx.fillStyle = ctx.createPattern(img, 'repeat');
      ctx.fillRect(-shift / k, -shift / k, (W + Math.abs(shift) * 2) / k, (H + Math.abs(shift) * 2) / k);
      ctx.restore();
    };
    img.src = src;
  });
}

export default function Haze() {
  const canvas = useRef(null);
  useEffect(() => {
    let timer = 0;
    paint(canvas.current);
    const onResize = () => { clearTimeout(timer); timer = setTimeout(() => paint(canvas.current), 250); };
    addEventListener('resize', onResize);
    return () => { clearTimeout(timer); removeEventListener('resize', onResize); };
  }, []);
  return <div id="haze" aria-hidden="true"><canvas ref={canvas} /></div>;
}
