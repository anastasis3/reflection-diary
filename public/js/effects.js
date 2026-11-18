/**
 * Visual effects that do not depend on a screen's data.
 *
 *   paintHaze()  the violet smoke behind the app screens. Painted once into a
 *                half-resolution canvas on load and on resize, then left
 *                alone: scrolling and hovering never repaint it (the live
 *                SVG version cost ~100 ms a frame).
 *   rateFx()     the burst when a question is rated: a fan of sparks and
 *                small thumbs for "relevant", a soft drop for "not".
 */
import { ICON, reduceMotion } from './core.js';

export const HAZE_TILES = ["data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='700'%3E%3Cfilter id='f' x='0' y='0' width='1' height='1'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.003333 0.004286' numOctaves='5' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.58 0 0 0 0 0.30 0 0 0 0 0.98 2.4 0 0 0 -1.05'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E", "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1300' height='900'%3E%3Cfilter id='f' x='0' y='0' width='1' height='1'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.002308 0.003333' numOctaves='5' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.80 0 0 0 0 0.30 0 0 0 0 0.90 2.2 0 0 0 -1.1'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E"];

export function paintHaze(){
  const host = document.getElementById("haze"); if(!host) return;
  let cv = host.querySelector("canvas");
  if(!cv){ cv = document.createElement("canvas"); host.appendChild(cv); }
  const w = innerWidth, h = innerHeight, k = 0.5;
  cv.width = Math.round(w*k); cv.height = Math.round(h*k);
  const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  ctx.clearRect(0,0,W,H);
  const glow = (x,y,rx,col) => { const g = ctx.createRadialGradient(x*W,y*H,0,x*W,y*H,rx*Math.max(W,H));
    g.addColorStop(0,col); g.addColorStop(1,"rgba(0,0,0,0)"); ctx.fillStyle=g; ctx.fillRect(0,0,W,H); };
  glow(.2,.3,.45,"rgba(139,92,246,.30)"); glow(.8,.7,.4,"rgba(192,38,211,.20)"); glow(.6,.15,.35,"rgba(99,102,241,.16)");
  const layers = [[HAZE_TILES[1], .35, 1300, 900, -40], [HAZE_TILES[0], .55, 900, 700, 30]];
  let done = 0;
  layers.forEach(([src, alpha, tw, th, shift]) => {
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.globalAlpha = alpha;
      if("filter" in ctx) ctx.filter = "blur(3px)";
      ctx.translate(shift, shift*0.6); ctx.scale(k, k);
      ctx.fillStyle = ctx.createPattern(img, "repeat");
      ctx.fillRect(-shift/k, -shift/k, (W+Math.abs(shift)*2)/k, (H+Math.abs(shift)*2)/k);
      ctx.restore();
      done++;
    };
    img.src = src;
  });
}
let hazeTimer = 0;
addEventListener("resize", () => { clearTimeout(hazeTimer); hazeTimer = setTimeout(paintHaze, 250); });

/* rateFx(kind, rect, sel): kind 'up' | 'down'; rect = the button's box. */
export function rateFx(kind, rect, sel){
  if(reduceMotion() || !rect) return;
  const btn = sel ? document.querySelector(sel) : document.getElementById(kind);
  if(btn){ btn.classList.remove("rfx-up","rfx-down"); void btn.offsetWidth; btn.classList.add("rfx-" + kind); }
  const x = rect.left + 30, y = rect.top + rect.height/2;
  const layer = document.createElement("div");
  layer.className = "rfx"; layer.style.left = x + "px"; layer.style.top = y + "px";
  const up = kind === "up";
  const cols = up ? ["#F5D0FE","#E879F9","#C084FC","#A5F3FC","#FFFFFF"] : ["#C4B5FD","#93A5CF","#A5B4FC"];
  let html = `<i class="rfx-ring ${up ? "" : "soft"}"></i>`;
  const n = up ? 18 : 8;
  for(let i=0;i<n;i++){
    // up: a fan opening upwards; down: a few sparks dropping off
    const a = up ? (-Math.PI/2) + (Math.random()-0.5) * Math.PI * 1.5 : (Math.PI/2) + (Math.random()-0.5) * 1.6;
    const d = up ? 46 + Math.random()*60 : 22 + Math.random()*30;
    const dx = Math.cos(a)*d, dy = Math.sin(a)*d + (up ? 0 : 16);
    const thumb = up && i % 5 === 0;
    const c = cols[i % cols.length];
    const style = `--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;--c:${c};--rot:${((Math.random()-0.5)*80).toFixed(0)}deg;animation-delay:${(Math.random()*60).toFixed(0)}ms`;
    html += thumb
      ? `<i class="rfx-p rfx-thumb" style="${style}">${ICON.thumb(c, true)}</i>`
      : `<i class="rfx-p ${up ? "" : "soft"}" style="${style};width:${(4+Math.random()*4).toFixed(0)}px;height:${(4+Math.random()*4).toFixed(0)}px"></i>`;
  }
  layer.innerHTML = html;
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1100);
}
