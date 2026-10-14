// Ink daubers: the splotch painter and the bottles you pick them from.
//
// A real dauber mark isn't a flat circle: the foam tip leaves a slightly
// lumpy disc, ink pools into a darker rim, the middle is mottled where the
// foam pressed unevenly, paper tooth pokes through as tiny pale specks, and
// the odd droplet lands beside it. Each mark is painted on a canvas from a
// seed, so it always redraws the same way, and is laid on the card with
// `mix-blend-mode: multiply` so the printed number shows through the ink.

import { seeded } from './rng.js';

export const DAUBERS = [
  { id: 1, name: 'Cherry', color: '#e5143a' },
  { id: 2, name: 'Bubblegum', color: '#ff2e93' },
  { id: 3, name: 'Tangerine', color: '#ff6a00' },
  { id: 4, name: 'Lemon', color: '#ffc300' },
  { id: 5, name: 'Clover', color: '#0d9f48' },
  { id: 6, name: 'Cobalt', color: '#1f45e0' },
  { id: 7, name: 'Grape', color: '#8b1fd3' },
];
export const dauberById = (id) => DAUBERS.find((d) => d.id === id) || DAUBERS[0];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const shade = ([r, g, b], k) => [r * k, g * k, b * k].map(Math.round);
const css = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;

/**
 * Paint one splotch onto `canvas`, `size` CSS pixels square.
 * Drawn in a 100×100 space; the blob itself has a radius of roughly 38.
 */
export function paintSplotch(canvas, { color, seed, size }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const px = Math.max(8, Math.round(size * dpr));
  canvas.width = canvas.height = px;
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(px / 100, 0, 0, px / 100, 0, 0);
  ctx.clearRect(0, 0, 100, 100);

  const rnd = seeded(seed);
  const base = rgb(color);
  const dark = shade(base, 0.62);
  const R = 36.5 + rnd() * 3;

  // Lumpy outline: a few low harmonics plus smooth fine wobble.
  const harmonics = Array.from({ length: 8 }, (_, k) => ({
    k: k + 2,
    a: (0.01 + rnd() * 0.028) / (1 + k * 0.5),
    p: rnd() * Math.PI * 2,
  }));
  const fine = Array.from({ length: 3 }, () => ({
    k: 14 + Math.floor(rnd() * 20),
    a: 0.003 + rnd() * 0.004,
    p: rnd() * 6.28,
  }));
  const squash = 1 + (rnd() - 0.5) * 0.08;
  const outline = new Path2D();
  const N = 180;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    let r = 1;
    for (const h of harmonics) r += h.a * Math.sin(h.k * t + h.p);
    for (const h of fine) r += h.a * Math.sin(h.k * t + h.p);
    const x = 50 + Math.cos(t) * R * r * squash;
    const y = 50 + (Math.sin(t) * R * r) / squash;
    if (i) outline.lineTo(x, y);
    else outline.moveTo(x, y);
  }
  outline.closePath();

  // 1. The ink body.
  ctx.fillStyle = css(base, 0.93);
  ctx.fill(outline);

  ctx.save();
  ctx.clip(outline);

  // 2. Ink pooled at the rim: soft inward darkening built from wide strokes.
  for (const [w, a] of [
    [18, 0.08],
    [11, 0.11],
    [6, 0.16],
    [3, 0.26],
    [1.4, 0.4],
  ]) {
    ctx.lineWidth = w;
    ctx.strokeStyle = css(dark, a);
    ctx.stroke(outline);
  }

  // 3. Foam mottling: patches with a little less ink, and a few darker ones.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 170; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * R * 0.88;
    ctx.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.09})`;
    ctx.beginPath();
    ctx.arc(50 + Math.cos(a) * d, 50 + Math.sin(a) * d, 1.2 + rnd() * 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Lighter heart where the foam tip pressed the least.
  const cx = 50 + (rnd() - 0.5) * 10;
  const cy = 50 + (rnd() - 0.5) * 10;
  const heart = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.85);
  heart.addColorStop(0, 'rgba(0,0,0,0.2)');
  heart.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = heart;
  ctx.fillRect(0, 0, 100, 100);
  // Paper tooth showing through.
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * R;
    ctx.fillStyle = `rgba(0,0,0,${0.35 + rnd() * 0.55})`;
    ctx.beginPath();
    ctx.arc(50 + Math.cos(a) * d, 50 + Math.sin(a) * d, 0.25 + rnd() * 0.65, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * R * 0.8;
    ctx.fillStyle = css(dark, 0.05 + rnd() * 0.07);
    ctx.beginPath();
    ctx.arc(50 + Math.cos(a) * d, 50 + Math.sin(a) * d, 2 + rnd() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 4. Crisp, slightly darker wet edge.
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = css(dark, 0.45);
  ctx.stroke(outline);

  // 5. Stray droplets.
  const drops = Math.floor(rnd() * 3.2);
  for (let i = 0; i < drops; i++) {
    const a = rnd() * Math.PI * 2;
    const d = R * (1.06 + rnd() * 0.18);
    ctx.fillStyle = css(base, 0.85);
    ctx.beginPath();
    ctx.arc(50 + Math.cos(a) * d, 50 + Math.sin(a) * d, 0.5 + rnd() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Cosmetic placement jitter for a mark: the hand is never perfectly centred. */
export function markJitter(seed) {
  const rnd = seeded(seed ^ 0x5bd1e995);
  return { dx: (rnd() - 0.5) * 0.12, dy: (rnd() - 0.5) * 0.12, rot: rnd() * 360, scale: 0.94 + rnd() * 0.1 };
}

let uid = 0;
/** A bingo dauber bottle (side view) as an SVG string. */
export function dauberSVG(color) {
  const id = `db${++uid}`;
  const base = rgb(color);
  const deep = css(shade(base, 0.55));
  const mid = css(shade(base, 0.85));
  return `
<svg viewBox="0 0 60 160" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${id}b" x1="0" x2="1">
      <stop offset="0" stop-color="${deep}"/><stop offset=".22" stop-color="${color}"/>
      <stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/>
    </linearGradient>
    <linearGradient id="${id}c" x1="0" x2="1">
      <stop offset="0" stop-color="#1b1b22"/><stop offset=".3" stop-color="#4a4a55"/>
      <stop offset=".6" stop-color="#2a2a33"/><stop offset="1" stop-color="#121218"/>
    </linearGradient>
    <radialGradient id="${id}t" cx=".4" cy=".35" r=".7">
      <stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/>
    </radialGradient>
  </defs>
  <ellipse cx="30" cy="153" rx="24" ry="5" fill="rgba(0,0,0,.35)"/>
  <ellipse cx="30" cy="12" rx="11.5" ry="9" fill="url(#${id}t)"/>
  <ellipse cx="26.5" cy="9" rx="4" ry="2.4" fill="rgba(255,255,255,.35)"/>
  <path d="M17 17h26l2 16H15z" fill="url(#${id}c)"/>
  <path d="M15 33h30c5 0 9 6 11 14H4c2-8 6-14 11-14z" fill="url(#${id}b)"/>
  <rect x="4" y="46" width="52" height="104" rx="10" fill="url(#${id}b)"/>
  <rect x="4" y="66" width="52" height="50" fill="#f6edd8"/>
  <rect x="4" y="66" width="52" height="5" fill="${color}"/>
  <rect x="4" y="111" width="52" height="5" fill="${color}"/>
  <text x="30" y="98" text-anchor="middle" font-family="Titan One, sans-serif" font-size="15" fill="${deep}">ink</text>
  <path d="M9 52v90" stroke="rgba(255,255,255,.45)" stroke-width="4" stroke-linecap="round"/>
  <path d="M50 52v90" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linecap="round"/>
</svg>`;
}
