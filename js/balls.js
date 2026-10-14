// Bingo ball sprites, shared by the globe, the ball in flight, the "now
// calling" ball and the rack of recent balls, so a ball looks the same
// wherever it is.
//
// A ball is three pre-rendered layers: the coloured body, the printed number
// label and a shading/highlight overlay. The label is drawn with a 2D affine
// transform taken from the ball's 3D orientation, so it rolls over the
// surface as the ball tumbles. The label disc sits wholly inside the sphere
// (offset² + radius² < 1), so it never needs clipping to the silhouette.

import { letterOf } from './bingo.js?v=11e3ed33';

// Teal, tomato, cream, avocado and harvest gold.
export const BALL_COLORS = { B: '#2a7c7a', I: '#c4462c', N: '#eee0c0', G: '#7f8d2d', O: '#e3a127' };
export const LABEL_INK = { B: '#174948', I: '#7a2414', N: '#1d4f80', G: '#465017', O: '#7f4e05' };

const TAU = Math.PI * 2;
const LABEL_OFFSET = 0.78;
const LABEL_RADIUS = 0.6;

export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
/** Rotate v about unit axis k by ang (Rodrigues). */
export function rotate(v, k, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const d = (k[0] * v[0] + k[1] * v[1] + k[2] * v[2]) * (1 - c);
  const kx = cross(k, v);
  return [v[0] * c + kx[0] * s + k[0] * d, v[1] * c + kx[1] * s + k[1] * d, v[2] * c + kx[2] * s + k[2] * d];
}
export function randomFrame() {
  const n = normalize([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
  const a = normalize(cross(n, normalize([Math.random(), Math.random(), Math.random()])));
  return { a, b: cross(n, a) };
}
/** Label facing straight at the viewer, upright. */
export const FRONT = Object.freeze({ a: [1, 0, 0], b: [0, 1, 0] });

const mixHex = (hex, k) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const t = k > 0 ? 255 : 0;
  const a = Math.abs(k);
  return `rgb(${c.map((v) => Math.round(v + (t - v) * a)).join(',')})`;
};

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Worn-plastic speckle, made once and tiled.
let speckle;
function speckleTile() {
  if (speckle) return speckle;
  speckle = canvas(64);
  const g = speckle.getContext('2d');
  for (let i = 0; i < 64 * 64 * 0.06; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,244,220,0.1)';
    g.fillRect(Math.floor(Math.random() * 64), Math.floor(Math.random() * 64), 1, 1);
  }
  return speckle;
}

/** Sprites for balls drawn `px` device pixels across. Built lazily. */
export class BallSprites {
  constructor(px) {
    this.D = Math.max(8, Math.ceil(px));
    // Small labels are drawn at double resolution so they stay crisp when
    // squashed by the rolling transform.
    this.LS = this.D < 180 ? this.D * 2 : this.D;
    this.bodies = {};
    this.labels = new Map();
    this._overlay = null;
  }

  body(L) {
    if (this.bodies[L]) return this.bodies[L];
    const D = this.D;
    const c = canvas(D);
    const g = c.getContext('2d');
    const col = BALL_COLORS[L];
    const grad = g.createRadialGradient(D * 0.38, D * 0.32, 0, D / 2, D / 2, D / 2);
    grad.addColorStop(0, mixHex(col, 0.35));
    grad.addColorStop(0.5, col);
    grad.addColorStop(1, mixHex(col, -0.5));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(D / 2, D / 2, D / 2 - 0.5, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = g.createPattern(speckleTile(), 'repeat');
    g.fillRect(0, 0, D, D);
    this.bodies[L] = c;
    return c;
  }

  label(n) {
    let c = this.labels.get(n);
    if (c) return c;
    const LS = this.LS;
    const L = letterOf(n);
    c = canvas(LS);
    const g = c.getContext('2d');
    g.fillStyle = '#f7ead0';
    g.beginPath();
    g.arc(LS / 2, LS / 2, LS / 2 - 1, 0, TAU);
    g.fill();
    g.lineWidth = LS * (L === 'N' ? 0.07 : 0.035);
    g.strokeStyle = L === 'N' ? LABEL_INK.N : 'rgba(40,30,20,.16)';
    g.beginPath();
    g.arc(LS / 2, LS / 2, LS / 2 - 1 - g.lineWidth / 2, 0, TAU);
    g.stroke();
    g.fillStyle = LABEL_INK[L];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${LS * 0.21}px "Titan One", sans-serif`;
    g.fillText(L, LS / 2, LS * 0.26);
    g.font = `${LS * (n > 9 ? 0.47 : 0.53)}px "Titan One", sans-serif`;
    g.fillText(String(n), LS / 2, LS * 0.61);
    this.labels.set(n, c);
    return c;
  }

  /** Edge shading, specular highlight and a soft rim light, in one layer. */
  get overlay() {
    if (this._overlay) return this._overlay;
    const D = this.D;
    const c = canvas(D);
    const g = c.getContext('2d');
    const shade = g.createRadialGradient(D * 0.42, D * 0.38, D * 0.1, D / 2, D / 2, D / 2);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(0.62, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(10,20,40,0.42)');
    g.fillStyle = shade;
    g.beginPath();
    g.arc(D / 2, D / 2, D / 2 - 0.5, 0, TAU);
    g.fill();
    const spec = g.createRadialGradient(D * 0.34, D * 0.28, 0, D * 0.34, D * 0.28, D * 0.32);
    spec.addColorStop(0, 'rgba(255,252,240,0.88)');
    spec.addColorStop(0.25, 'rgba(255,252,240,0.36)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = spec;
    g.fillRect(0, 0, D, D);
    g.strokeStyle = 'rgba(255,255,255,0.2)';
    g.lineWidth = D * 0.04;
    g.beginPath();
    g.arc(D / 2, D / 2, D * 0.42, 0.15 * Math.PI, 0.55 * Math.PI);
    g.stroke();
    this._overlay = c;
    return c;
  }
}

// A few recently used sizes, so the slot, the rack and the flight share work.
const cache = new Map();
export function spritesFor(px) {
  const key = Math.max(8, Math.ceil(px));
  let s = cache.get(key);
  if (s) {
    cache.delete(key);
    cache.set(key, s);
    return s;
  }
  s = new BallSprites(key);
  cache.set(key, s);
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  return s;
}
/** Forget every cached sprite (after the ball font finishes loading). */
export const clearSpriteCache = () => cache.clear();

/**
 * Draw ball `n` centred at (x, y) with radius r, in the context's current
 * transform. `frame` is the label's 3D orientation; `alpha` fades the whole
 * ball (used for motion trails).
 */
export function drawBall(ctx, sp, n, x, y, r, frame = FRONT, alpha = 1) {
  const d = r * 2;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(sp.body(letterOf(n)), x - r, y - r, d, d);
  let a = frame.a;
  const b = frame.b;
  let nz = a[0] * b[1] - a[1] * b[0];
  // Numbers are printed on both sides; show whichever faces us.
  let flip = 1;
  if (nz < 0) {
    flip = -1;
    nz = -nz;
  }
  if (nz > 0.04) {
    const nx = flip * (a[1] * b[2] - a[2] * b[1]);
    const ny = flip * (a[2] * b[0] - a[0] * b[2]);
    if (flip < 0) a = [-a[0], -a[1], -a[2]];
    const s = (r * LABEL_RADIUS * 2) / sp.LS;
    const half = sp.LS / 2;
    ctx.save();
    ctx.globalAlpha = alpha * Math.min(1, nz * 3);
    ctx.translate(x + nx * r * LABEL_OFFSET, y + ny * r * LABEL_OFFSET);
    ctx.transform(a[0] * s, a[1] * s, b[0] * s, b[1] * s, 0, 0);
    ctx.drawImage(sp.label(n), -half, -half);
    ctx.restore();
  }
  ctx.drawImage(sp.overlay, x - r, y - r, d, d);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

/** A still ball, label facing front, on its own canvas `size` CSS px across. */
export function ballCanvas(n, size, el = canvas(1)) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(size * dpr);
  if (el.width !== px) el.width = el.height = px;
  el.style.width = el.style.height = `${size}px`;
  const g = el.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, px, px);
  drawBall(g, spritesFor(px), n, px / 2, px / 2, px / 2);
  return el;
}
