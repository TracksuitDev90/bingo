// Ink daubers: the splotch painter and the bottles you pick them from.
//
// No two real dauber marks match. How hard you press, the angle of the
// bottle, how wet the foam is and whether your hand slips all show up on the
// paper. Each mark picks a "press" from its seed (classic, heavy, light,
// tilted, smeared, double tap or ring) and then varies its size, tone,
// outline, rim, mottling, bleed and droplets on top of that. Marks are
// painted on a canvas from the seed, so a mark always redraws the same way,
// and are laid on the card with `mix-blend-mode: multiply` so the printed
// number shows through the ink.

import { seeded } from './rng.js?v=7096e9e1';

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

const TAU = Math.PI * 2;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const shade = (c, k) => c.map((v) => Math.round(Math.min(255, v * k)));
const css = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;

const PRESSES = [
  ['classic', 3],
  ['heavy', 2],
  ['light', 2],
  ['tilted', 2],
  ['smear', 1.1],
  ['double', 1],
  ['ring', 1.2],
];
function pickPress(rnd) {
  const total = PRESSES.reduce((s, [, w]) => s + w, 0);
  let x = rnd() * total;
  for (const [name, w] of PRESSES) if ((x -= w) < 0) return name;
  return 'classic';
}

/** A lumpy closed outline around (cx, cy). */
function blob(rnd, cx, cy, R, squash, angle, lump) {
  const harmonics = Array.from({ length: 8 }, (_, k) => ({
    k: k + 2,
    a: ((0.01 + rnd() * 0.03) * lump) / (1 + k * 0.5),
    p: rnd() * TAU,
  }));
  const fine = Array.from({ length: 3 }, () => ({
    k: 14 + Math.floor(rnd() * 22),
    a: (0.003 + rnd() * 0.005) * lump,
    p: rnd() * TAU,
  }));
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const path = new Path2D();
  const N = 140;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * TAU;
    let r = 1;
    for (const h of harmonics) r += h.a * Math.sin(h.k * t + h.p);
    for (const h of fine) r += h.a * Math.sin(h.k * t + h.p);
    const ux = Math.cos(t) * R * r * squash;
    const uy = (Math.sin(t) * R * r) / squash;
    const x = cx + ux * ca - uy * sa;
    const y = cy + ux * sa + uy * ca;
    if (i) path.lineTo(x, y);
    else path.moveTo(x, y);
  }
  path.closePath();
  return path;
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/**
 * Paint one splotch onto `canvas`, `size` CSS pixels square.
 * Drawn in a 100×100 space; the blob has a radius of roughly 31–37 so that
 * smears and droplets still fit inside.
 */
export function paintSplotch(canvas, { color, seed, size }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.max(8, Math.round(size * dpr));
  canvas.width = canvas.height = px;
  canvas.style.width = canvas.style.height = `${size}px`;
  renderSplotch(canvas.getContext('2d'), px, color, seed);
}

// Painted marks, kept so a tap only has to blit one. Keyed by colour, seed
// and pixel size; old entries fall out once there are plenty.
const cache = new Map();
/** A splotch on its own `px`-square canvas, painted once and reused. */
export function splotch(color, seed, px) {
  px = Math.max(8, Math.round(px));
  const key = `${color}|${seed}|${px}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = px;
  renderSplotch(c.getContext('2d'), px, color, seed);
  cache.set(key, c);
  if (cache.size > 160) cache.delete(cache.keys().next().value);
  return c;
}

function renderSplotch(ctx, px, color, seed) {
  ctx.setTransform(px / 100, 0, 0, px / 100, 0, 0);
  ctx.clearRect(0, 0, 100, 100);

  const rnd = seeded(seed);
  const press = pickPress(rnd);

  // Every bottle and every press lays the colour down a little differently.
  const tone = 0.9 + rnd() * 0.18;
  const base = shade(rgb(color), tone);
  const dark = shade(base, 0.55 + rnd() * 0.1);

  let R = 33 + rnd() * 3;
  let squash = 1 + (rnd() - 0.5) * 0.1;
  let alpha = 0.88 + rnd() * 0.06;
  let rim = 0.8 + rnd() * 0.5;
  let mottle = 0.7 + rnd() * 0.6;
  let heart = 0.12 + rnd() * 0.12;
  let lump = 0.8 + rnd() * 0.6;
  let drops = Math.floor(rnd() * 3.2);
  let dry = 0;
  let bleed = rnd() < 0.35;
  let tilt = 0;
  let smear = null;
  let second = null;
  const angle = rnd() * TAU;

  switch (press) {
    case 'heavy':
      R += 1.5;
      alpha = 0.97;
      rim *= 1.5;
      mottle *= 0.45;
      heart *= 0.4;
      drops += 2 + Math.floor(rnd() * 3);
      bleed = true;
      break;
    case 'light':
      R -= 2.5;
      alpha = 0.66 + rnd() * 0.1;
      rim *= 0.55;
      mottle *= 1.6;
      heart += 0.12;
      dry = 0.6 + rnd() * 0.4;
      drops = rnd() < 0.2 ? 1 : 0;
      bleed = false;
      break;
    case 'tilted':
      squash = 0.83 + rnd() * 0.08;
      tilt = 0.6 + rnd() * 0.4;
      break;
    case 'smear':
      smear = { len: 5 + rnd() * 6, dir: rnd() * TAU };
      R -= 1;
      break;
    case 'double':
      R -= 1.5;
      second = { d: 5 + rnd() * 6, dir: rnd() * TAU };
      break;
    case 'ring':
      heart = 0.45 + rnd() * 0.15;
      rim *= 1.6;
      mottle *= 0.8;
      break;
  }

  const cx = 50;
  const cy = 50;
  const outline = blob(rnd, cx, cy, R, squash, angle, lump);

  // Smeared: the dauber slid a little as it lifted, dragging ink with it.
  if (smear) {
    const sx = Math.cos(smear.dir);
    const sy = Math.sin(smear.dir);
    for (let k = 6; k >= 1; k--) {
      const f = k / 6;
      ctx.save();
      ctx.translate(sx * smear.len * f, sy * smear.len * f);
      ctx.fillStyle = css(base, 0.1 + (1 - f) * 0.12);
      ctx.fill(outline);
      ctx.restore();
    }
    ctx.strokeStyle = css(dark, 0.18);
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 14; i++) {
      const a = smear.dir + Math.PI / 2 + (rnd() - 0.5) * 2.2;
      const ox = cx + Math.cos(a) * R * 0.85;
      const oy = cy + Math.sin(a) * R * 0.85;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + sx * smear.len * (0.6 + rnd() * 0.5), oy + sy * smear.len * (0.6 + rnd() * 0.5));
      ctx.stroke();
    }
  }

  // Ink soaking out along the paper fibres.
  if (bleed) {
    for (const [w, a] of [
      [4, 0.06],
      [2.2, 0.1],
    ]) {
      ctx.lineWidth = w;
      ctx.strokeStyle = css(base, a);
      ctx.stroke(outline);
    }
    ctx.strokeStyle = css(base, 0.28);
    ctx.lineWidth = 0.35;
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU;
      const r0 = R * (0.96 + rnd() * 0.04);
      const len = 1 + rnd() * 3.5;
      const bend = (rnd() - 0.5) * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a + bend * 0.1) * (r0 + len), cy + Math.sin(a + bend * 0.1) * (r0 + len));
      ctx.stroke();
    }
  }

  // The ink body (and a second, overlapping stamp for a double tap).
  ctx.fillStyle = css(base, alpha);
  ctx.fill(outline);
  let outline2 = null;
  if (second) {
    outline2 = blob(
      rnd,
      cx + Math.cos(second.dir) * second.d,
      cy + Math.sin(second.dir) * second.d,
      R * (0.92 + rnd() * 0.1),
      1 + (rnd() - 0.5) * 0.1,
      rnd() * TAU,
      lump,
    );
    ctx.fillStyle = css(base, 0.62 + rnd() * 0.2);
    ctx.fill(outline2);
  }

  // Texture the whole stamped area, both stamps of a double tap included.
  const shapes = outline2 ? [outline, outline2] : [outline];
  const area = new Path2D();
  for (const sh of shapes) area.addPath(sh);
  ctx.save();
  ctx.clip(area);

  // Ink pooled at the rim: soft inward darkening built from wide strokes.
  for (const sh of shapes) {
    for (const [w, a] of [
      [18, 0.07],
      [11, 0.1],
      [6, 0.15],
      [3, 0.24],
      [1.4, 0.38],
    ]) {
      ctx.lineWidth = w;
      ctx.strokeStyle = css(dark, Math.min(0.9, a * rim * (sh === outline ? 1 : 0.7)));
      ctx.stroke(sh);
    }
  }

  // Tilted: one side of the foam bit in harder than the other.
  if (tilt) {
    const ta = rnd() * TAU;
    const gx = Math.cos(ta) * R;
    const gy = Math.sin(ta) * R;
    const g = ctx.createLinearGradient(cx - gx, cy - gy, cx + gx, cy + gy);
    g.addColorStop(0, css(dark, 0.35 * tilt));
    g.addColorStop(0.45, css(dark, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 100, 100);
    ctx.globalCompositeOperation = 'destination-out';
    const h = ctx.createLinearGradient(cx - gx, cy - gy, cx + gx, cy + gy);
    h.addColorStop(0.55, 'rgba(0,0,0,0)');
    h.addColorStop(1, `rgba(0,0,0,${0.42 * tilt})`);
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 100, 100);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.globalCompositeOperation = 'destination-out';
  // Foam mottling: patches with a little less ink.
  const patches = Math.round(160 * mottle);
  for (let i = 0; i < patches; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * R * 0.88;
    ctx.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.09})`;
    dot(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + rnd() * 4.5);
  }
  // Light press: the foam was dry, leaving streaky gaps.
  if (dry) {
    const dir = rnd() * Math.PI;
    for (let i = 0; i < 46; i++) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * R * 0.9;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      ctx.rotate(dir + (rnd() - 0.5) * 0.4);
      ctx.fillStyle = `rgba(0,0,0,${(0.12 + rnd() * 0.3) * dry})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 2 + rnd() * 6, 0.4 + rnd() * 1.1, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  // Lighter heart where the foam pressed least (strong for a ring mark).
  const hx = cx + (rnd() - 0.5) * 9;
  const hy = cy + (rnd() - 0.5) * 9;
  const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * (press === 'ring' ? 0.72 : 0.85));
  hg.addColorStop(0, `rgba(0,0,0,${heart})`);
  hg.addColorStop(press === 'ring' ? 0.7 : 0.4, `rgba(0,0,0,${heart * 0.6})`);
  hg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, 100, 100);
  // Paper tooth showing through.
  const specks = 8 + Math.floor(rnd() * 30) + (dry ? 50 : 0);
  for (let i = 0; i < specks; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * R;
    ctx.fillStyle = `rgba(0,0,0,${0.25 + rnd() * 0.45})`;
    dot(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.2 + rnd() * 0.5);
  }
  ctx.globalCompositeOperation = 'source-over';
  // A few darker clots.
  const clots = 10 + Math.floor(rnd() * 24);
  for (let i = 0; i < clots; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * R * 0.8;
    ctx.fillStyle = css(dark, 0.04 + rnd() * 0.08);
    dot(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5 + rnd() * 5);
  }
  ctx.restore();

  // Crisp, slightly darker wet edge.
  ctx.lineWidth = 0.7 + rnd() * 0.5;
  ctx.strokeStyle = css(dark, Math.min(0.75, 0.4 * rim));
  ctx.stroke(outline);
  if (outline2) {
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = css(dark, 0.35);
    ctx.stroke(outline2);
  }

  // Stray droplets, some flicked into little teardrops.
  ctx.fillStyle = css(base, 0.88);
  for (let i = 0; i < drops; i++) {
    const a = rnd() * TAU;
    const d = R * (1.05 + rnd() * 0.3);
    const r = 0.4 + rnd() * (press === 'heavy' ? 2 : 1.4);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    if (rnd() < 0.35) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 2.2, r * 0.8, a, 0, TAU);
      ctx.fill();
    } else {
      dot(ctx, x, y, r);
    }
  }
}

/** Cosmetic placement jitter for a mark: the hand is never perfectly centred. */
export function markJitter(seed) {
  const rnd = seeded(seed ^ 0x5bd1e995);
  return { dx: (rnd() - 0.5) * 0.12, dy: (rnd() - 0.5) * 0.12, rot: rnd() * 360, scale: 0.92 + rnd() * 0.14 };
}

let uid = 0;
// The bottle's printed label. A themed edition can pass its own.
const CLASSIC_LABEL = {
  paper: '#f2e6cb',
  ink: '#2f80c0',
  title: 'bingo',
  titleFont: 'Titan One, sans-serif',
  subtitle: 'dauber ink',
  subtitleFont: 'Itim, sans-serif',
  nameFont: 'Titan One, sans-serif',
};

/**
 * A bingo dauber bottle as an SVG string: translucent plastic showing the
 * ink inside, a paper label printed like the cards, a ridged cap that lifts
 * off when the bottle is picked up, a foam tip, ink dribbles and scuffs.
 * No filters or images, so the cap animation stays cheap to repaint.
 */
export function dauberSVG({ id: n, name, color }, label = CLASSIC_LABEL) {
  const L = { ...CLASSIC_LABEL, ...label };
  const id = `db${++uid}`;
  const rnd = seeded(n * 7919);
  const c = rgb(color);
  const deep = css(shade(c, 0.5));
  const mid = css(shade(c, 0.82));
  const lite = css(c.map((v) => Math.round(v + (255 - v) * 0.45)));
  const level = 74 + Math.round(rnd() * 14);
  // Dried ink crusted around the collar with a couple of short runs, and a
  // smudge on the label where an inky thumb held it.
  const runs = Array.from({ length: 2 }, (_, k) => {
    const x = 20 + k * 16 + rnd() * 10;
    const len = 4 + rnd() * 7;
    const w = 1.6 + rnd() * 1.2;
    return `M${x - w} 46 Q${x - w} ${46 + len} ${x} ${47 + len} Q${x + w} ${46 + len} ${x + w} 46Z`;
  }).join('');
  const crust = `<path d="M15 44.5q4 2.5 8 .8t9 1.2 8-.6 9 .4v2.4q-5 1.4-9 .2t-9 .6-8-.4-8 .2z${runs}" fill="${mid}" stroke="${deep}" stroke-width=".4"/>`;
  const sx = rnd() < 0.5 ? 9 + rnd() * 5 : 50 + rnd() * 5;
  const sy = 128 + rnd() * 14;
  const sr = 4 + rnd() * 2.5;
  const smudge = `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${sr.toFixed(1)}" fill="${color}" opacity=".35"/>`;
  const scuffs = Array.from({ length: 4 }, () => {
    const x = 12 + rnd() * 40;
    const y = 64 + rnd() * 96;
    return `M${x.toFixed(1)} ${y.toFixed(1)}l${(2 + rnd() * 5).toFixed(1)} ${((rnd() - 0.5) * 2).toFixed(1)}`;
  }).join('');
  const ridges = Array.from({ length: 7 }, (_, k) => `M${17 + k * 5} 10v24`).join('');
  return `
<svg viewBox="0 0 64 176" aria-hidden="true" focusable="false" overflow="visible">
  <defs>
    <linearGradient id="${id}b" x1="0" x2="1">
      <stop offset="0" stop-color="${deep}"/><stop offset=".18" stop-color="${color}"/>
      <stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/>
    </linearGradient>
    <linearGradient id="${id}e" x1="0" x2="1">
      <stop offset="0" stop-color="${mid}" stop-opacity=".55"/><stop offset=".2" stop-color="${lite}" stop-opacity=".4"/>
      <stop offset="1" stop-color="${deep}" stop-opacity=".6"/>
    </linearGradient>
    <linearGradient id="${id}w" x1="0" x2="1">
      <stop offset="0" stop-color="#14304c" stop-opacity=".3"/><stop offset=".22" stop-color="#14304c" stop-opacity="0"/>
      <stop offset=".7" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#14304c" stop-opacity=".4"/>
    </linearGradient>
    <radialGradient id="${id}t" cx=".38" cy=".3" r=".75">
      <stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/>
    </radialGradient>
  </defs>
  <ellipse cx="32" cy="170" rx="27" ry="5" fill="rgba(4,14,32,.4)"/>
  <ellipse cx="32" cy="27" rx="11.5" ry="12" fill="url(#${id}t)"/>
  <ellipse cx="28" cy="22" rx="4" ry="2.6" fill="rgba(255,255,255,.4)"/>
  <path d="M17 36h30l2 10H15z" fill="#262a30"/>
  <path d="M17 36h30v2H17z" fill="rgba(255,255,255,.25)"/>
  <path d="M15 46h34c6 0 9 6 10 16H5c1-10 4-16 10-16z" fill="url(#${id}e)"/>
  <rect x="5" y="60" width="54" height="108" rx="11" fill="url(#${id}e)"/>
  <path d="M5 ${level}H59V157A11 11 0 0 1 48 168H16A11 11 0 0 1 5 157Z" fill="url(#${id}b)" opacity=".92"/>
  <path d="M6 ${level}q26 3 52 0" fill="none" stroke="${lite}" stroke-width="1.2" opacity=".8"/>
  <g>
    <rect x="5" y="94" width="54" height="56" fill="${L.paper}"/>
    <rect x="9" y="98" width="46" height="15" rx="2.4" fill="${L.ink}"/>
    <text x="32" y="109.6" text-anchor="middle" font-family="${L.titleFont}" font-size="11" letter-spacing=".6" fill="${L.paper}">${L.title}</text>
    <rect x="9" y="115" width="46" height="1.4" rx=".7" fill="${L.ink}"/>
    <text x="32" y="126" text-anchor="middle" font-family="${L.subtitleFont}" font-size="7" letter-spacing=".8" fill="${L.ink}">${L.subtitle}</text>
    <rect x="9" y="132" width="46" height="11" rx="5.5" fill="${color}"/>
    <text x="32" y="140.4" text-anchor="middle" font-family="${L.nameFont}" font-size="${name.length > 6 ? 5.6 : 7.2}" fill="#fff8e6">${name}</text>
    <rect x="5" y="94" width="54" height="56" fill="url(#${id}w)"/>
    <path d="M5 94h54M5 150h54" stroke="rgba(20,40,60,.25)" stroke-width=".6"/>
    ${smudge}
  </g>
  ${crust}
  <path d="M10 66v92" stroke="rgba(255,255,255,.5)" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M14 70v30" stroke="rgba(255,255,255,.3)" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M54 66v92" stroke="rgba(0,0,0,.2)" stroke-width="3" stroke-linecap="round"/>
  <path d="${scuffs}" stroke="rgba(255,255,255,.35)" stroke-width=".5"/>
  <g class="cap">
    <path d="M14 38V14C14 6 22 2 32 2s18 4 18 12v24z" fill="url(#${id}b)"/>
    <path d="${ridges}" stroke="rgba(0,0,0,.22)" stroke-width="1.4"/>
    <path d="M18 9c3-4 8-5 12-5" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-linecap="round"/>
    <path d="M14 34h36v4H14z" fill="rgba(0,0,0,.25)"/>
  </g>
</svg>`;
}
