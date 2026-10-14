// Poké Balls for the blower: the Pokémon edition's take on js/balls.js,
// with the same API, so the globe, the flight and the rack can use either.
//
// Each column has its own ball: B Poké Ball, I Great Ball, N Ultra Ball,
// G Safari Ball, O Master Ball. The ball's button is the label: a white
// disc with the Pokémon's sprite and name, rolling over the surface exactly
// like the numbers on a classic ball. The coloured cap and the black band
// are projected from the same 3D orientation, so they roll with it: the
// band is the great circle through the button, drawn as half an ellipse,
// and the cap is the half of the ball above it.
//
// Per ball that's a body blit, one filled and one stroked path, the label
// blit and a shading blit. Labels and bodies are drawn once and cached.

import { FRONT } from '../balls.js?v=3dc5c925';
import { columnOf } from '../bingo.js?v=3f6ee08f';
import { pokemonOf, nameOf } from './dex.js?v=b5b23e78';
import { drawSprite } from './sprites.js?v=26842faa';

export const BALL_TYPES = [
  { name: 'Poké Ball', cap: '#e3352b' },
  { name: 'Great Ball', cap: '#2f6cd3' },
  { name: 'Ultra Ball', cap: '#2b2c33' },
  { name: 'Safari Ball', cap: '#4f9a3f' },
  { name: 'Master Ball', cap: '#7b3ec0' },
];
export const BAND = '#222329';

const TAU = Math.PI * 2;
// A label disc this size, this deep, has its rim right on the surface.
const LABEL_RADIUS = 0.64;
const LABEL_OFFSET = 0.756;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Text in `font` (with a {size} placeholder), shrunk to fit `max` px wide. */
export function fitText(g, text, x, y, size, max, font) {
  g.font = font.replace('{size}', `${size}px`);
  const w = g.measureText(text).width;
  if (w > max) g.font = font.replace('{size}', `${(size * max) / w}px`);
  g.fillText(text, x, y);
}

/**
 * The cap and band of a ball whose cap points along unit vector k, at
 * (x, y) with radius r.
 */
function capAndBand(ctx, x, y, r, k, cap, band) {
  const h = Math.hypot(k[0], k[1]);
  ctx.fillStyle = cap;
  if (h < 1e-4) {
    // Looking straight down the axis: all cap, or none, and the band is the rim.
    if (k[2] > 0) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    return;
  }
  const rot = Math.atan2(-k[0], k[1]);
  const ry = r * Math.abs(k[2]);
  const end = k[2] >= 0 ? TAU : 0;
  const ccw = k[2] < 0;
  ctx.beginPath();
  ctx.arc(x, y, r, rot, rot + Math.PI);
  ctx.ellipse(x, y, r, ry, rot, Math.PI, end, ccw);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, r, ry, rot, Math.PI, end, ccw);
  ctx.strokeStyle = band;
  ctx.stroke();
}

/**
 * Ball sprites for one route: whoever is on ball n depends on it. Call
 * reset() after the route changes.
 */
export function pokeBalls(getRoute) {
  class Sprites {
    constructor(px) {
      this.D = Math.max(8, Math.ceil(px));
      this.LS = this.D < 180 ? this.D * 2 : this.D;
      this.labels = new Map();
      this._body = null;
      this._overlay = null;
    }

    /** The white plastic ball, lit from the top left. */
    get body() {
      if (this._body) return this._body;
      const D = this.D;
      const c = canvas(D);
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(D * 0.38, D * 0.32, 0, D / 2, D / 2, D / 2);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.55, '#f0f1f5');
      grad.addColorStop(1, '#b4b8c4');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(D / 2, D / 2, D / 2 - 0.5, 0, TAU);
      g.fill();
      this._body = c;
      return c;
    }

    /** The button: a white disc in a black ring, with the Pokémon on it. */
    label(n) {
      let c = this.labels.get(n);
      if (c) return c;
      const LS = this.LS;
      const dex = pokemonOf(getRoute(), n);
      c = canvas(LS);
      const g = c.getContext('2d');
      const R = LS / 2;
      const ring = LS * 0.07;
      g.fillStyle = BAND;
      g.beginPath();
      g.arc(R, R, R - 0.5, 0, TAU);
      g.fill();
      const face = g.createRadialGradient(R * 0.8, R * 0.7, 0, R, R, R);
      face.addColorStop(0, '#ffffff');
      face.addColorStop(0.75, '#f6f6f8');
      face.addColorStop(1, '#d9dbe2');
      g.fillStyle = face;
      g.beginPath();
      g.arc(R, R, R - ring, 0, TAU);
      g.fill();
      // Names only where there's room to read them (not on balls in the globe).
      if (LS >= 96) {
        drawSprite(g, dex, LS * 0.22, LS * 0.13, LS * 0.56, LS * 0.5, { ground: true });
        g.fillStyle = '#1d2230';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        fitText(
          g,
          nameOf(dex),
          R,
          LS * 0.735,
          LS * 0.115,
          LS * 0.58,
          '600 {size} "Pixelify Sans", "Fredoka", sans-serif',
        );
      } else {
        drawSprite(g, dex, LS * 0.17, LS * 0.17, LS * 0.66, LS * 0.66);
      }
      this.labels.set(n, c);
      return c;
    }

    /** Edge shading, a glossy highlight and a soft rim light, in one layer. */
    get overlay() {
      if (this._overlay) return this._overlay;
      const D = this.D;
      const c = canvas(D);
      const g = c.getContext('2d');
      const shade = g.createRadialGradient(D * 0.42, D * 0.38, D * 0.1, D / 2, D / 2, D / 2);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(0.6, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(10,14,40,0.45)');
      g.fillStyle = shade;
      g.beginPath();
      g.arc(D / 2, D / 2, D / 2 - 0.5, 0, TAU);
      g.fill();
      const spec = g.createRadialGradient(D * 0.33, D * 0.27, 0, D * 0.33, D * 0.27, D * 0.3);
      spec.addColorStop(0, 'rgba(255,255,255,0.9)');
      spec.addColorStop(0.3, 'rgba(255,255,255,0.35)');
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = spec;
      g.fillRect(0, 0, D, D);
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = D * 0.04;
      g.beginPath();
      g.arc(D / 2, D / 2, D * 0.42, 0.15 * Math.PI, 0.55 * Math.PI);
      g.stroke();
      this._overlay = c;
      return c;
    }
  }

  const cache = new Map();
  function spritesFor(px) {
    const key = Math.max(8, Math.ceil(px));
    let s = cache.get(key);
    if (s) {
      cache.delete(key);
      cache.set(key, s);
      return s;
    }
    s = new Sprites(key);
    cache.set(key, s);
    if (cache.size > 6) cache.delete(cache.keys().next().value);
    return s;
  }

  /** Same contract as drawBall in js/balls.js. */
  function drawBall(ctx, sp, n, x, y, r, frame = FRONT, alpha = 1) {
    const d = r * 2;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(sp.body, x - r, y - r, d, d);
    let a = frame.a;
    const b = frame.b;
    // The cap is "up" from the button, which is -b in the label's frame.
    ctx.lineWidth = r * 0.15;
    capAndBand(ctx, x, y, r * 0.99, [-b[0], -b[1], -b[2]], BALL_TYPES[columnOf(n)].cap, BAND);
    let nz = a[0] * b[1] - a[1] * b[0];
    // A button on both sides, so a Pokémon is always on show somewhere.
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

  /** A still ball, button facing front, on its own canvas `size` CSS px across. */
  function ballCanvas(n, size, el = canvas(1)) {
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

  return { spritesFor, drawBall, ballCanvas, reset: () => cache.clear() };
}

/**
 * A flat, front-on ball with a letter on its button: the column badges on
 * the card and the board.
 */
export function paintEmblem(g, x, y, r, col, letter) {
  g.save();
  g.fillStyle = '#f4f5f8';
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.fillStyle = BALL_TYPES[col].cap;
  g.beginPath();
  g.arc(x, y, r, Math.PI, TAU);
  g.fill();
  g.fillStyle = BAND;
  g.fillRect(x - r, y - r * 0.08, r * 2, r * 0.16);
  g.beginPath();
  g.arc(x, y, r * 0.5, 0, TAU);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x, y, r * 0.38, 0, TAU);
  g.fill();
  const shade = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.05, x, y, r);
  shade.addColorStop(0, 'rgba(255,255,255,0.55)');
  shade.addColorStop(0.35, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(10,14,40,0.35)');
  g.fillStyle = shade;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.lineWidth = r * 0.07;
  g.strokeStyle = BAND;
  g.stroke();
  if (letter) {
    g.fillStyle = BAND;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${r * 0.5}px "Luckiest Guy", "Titan One", sans-serif`;
    g.fillText(letter, x, y + r * 0.04);
  }
  g.restore();
}
