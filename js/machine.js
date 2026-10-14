// The ball blower: a glass globe full of ping-pong bingo balls, simulated on
// a canvas. An air jet in the floor keeps them tumbling; when a ball is drawn
// the air roars, the chosen ball is sucked up the neck and pops out the top.
//
// The physics is only theatre. Which ball comes out is decided beforehand by
// the page with the crypto RNG; the machine just animates that ball out.

import { letterOf } from './bingo.js';

// A 70s set: teal, tomato, cream, avocado and harvest gold.
export const BALL_COLORS = { B: '#2a7c7a', I: '#c4462c', N: '#eee0c0', G: '#7f8d2d', O: '#e3a127' };
export const LABEL_INK = { B: '#174948', I: '#7a2414', N: '#5b3a22', G: '#465017', O: '#7f4e05' };

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const mixHex = (hex, k) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const t = k > 0 ? 255 : 0;
  const a = Math.abs(k);
  return `rgb(${c.map((v) => Math.round(v + (t - v) * a)).join(',')})`;
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function rotate(v, k, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const kx = cross(k, v);
  return [0, 1, 2].map((i) => v[i] * c + kx[i] * s + k[i] * d * (1 - c));
}
function normalize(v) {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
}
function randomFrame() {
  const n = normalize([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
  const a = normalize(cross(n, normalize([Math.random(), Math.random(), Math.random()])));
  return { a, b: cross(n, a) };
}

/** A ball sprite for DOM use (the big "now calling" ball draws itself in CSS). */
export function ballColor(n) {
  return BALL_COLORS[letterOf(n)];
}

export class BlowerMachine {
  constructor(canvas, { onClack } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onClack = onClack;
    this.balls = [];
    this.power = 0.42;
    this.targetPower = 0.42;
    this.time = 0;
    this.acc = 0;
    this.lastClack = 0;
    this.mixing = false;
    this.flyer = null; // ball being drawn
    this.geo = null;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.last = performance.now();
    const tick = (now) => {
      this.frame(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // --- Setup -----------------------------------------------------------------

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.W = rect.width;
    this.H = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    const old = this.geo;
    const R = Math.min(this.W * 0.46, this.H * 0.385);
    const geo = { R, cx: this.W / 2, cy: this.H * 0.47, r: R * 0.074 };
    geo.top = geo.cy - R;
    this.geo = geo;
    if (old) {
      const k = R / old.R;
      for (const b of this.balls) {
        b.x = geo.cx + (b.x - old.cx) * k;
        b.y = geo.cy + (b.y - old.cy) * k;
        b.vx *= k;
        b.vy *= k;
      }
    }
    this.buildSprites();
  }

  buildSprites() {
    const D = Math.ceil(this.geo.r * 2 * this.dpr) + 2;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = c.height = D;
      return [c, c.getContext('2d')];
    };
    this.D = D;
    this.body = {};
    for (const [L, col] of Object.entries(BALL_COLORS)) {
      const [c, g] = mk();
      const grad = g.createRadialGradient(D * 0.38, D * 0.32, 0, D / 2, D / 2, D / 2);
      grad.addColorStop(0, mixHex(col, 0.35));
      grad.addColorStop(0.5, col);
      grad.addColorStop(1, mixHex(col, -0.5));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(D / 2, D / 2, D / 2 - 1, 0, TAU);
      g.fill();
      // Old, slightly worn plastic: fine speckle across the surface.
      g.save();
      g.clip();
      for (let i = 0; i < D * D * 0.05; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.09)' : 'rgba(255,240,210,0.09)';
        g.fillRect(Math.random() * D, Math.random() * D, 1, 1);
      }
      g.restore();
      this.body[L] = c;
    }
    // Number labels are drawn at twice the ball's resolution so they stay
    // crisp when scaled onto the curved surface.
    const LS = D * 2;
    this.LS = LS;
    this.labels = new Map();
    for (let n = 1; n <= 75; n++) {
      const c = document.createElement('canvas');
      c.width = c.height = LS;
      const g = c.getContext('2d');
      const L = letterOf(n);
      g.fillStyle = '#f7ead0';
      g.beginPath();
      g.arc(LS / 2, LS / 2, LS / 2 - 2, 0, TAU);
      g.fill();
      g.lineWidth = LS * 0.05;
      g.strokeStyle = L === 'N' ? '#5b3a22' : 'rgba(60,30,10,.15)';
      g.stroke();
      g.fillStyle = LABEL_INK[L];
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${LS * 0.2}px "Titan One", sans-serif`;
      g.fillText(L, LS / 2, LS * 0.25);
      g.font = `${LS * (n > 9 ? 0.46 : 0.52)}px "Titan One", sans-serif`;
      g.fillText(String(n), LS / 2, LS * 0.6);
      this.labels.set(n, c);
    }
    {
      const [c, g] = mk();
      const grad = g.createRadialGradient(D * 0.42, D * 0.38, D * 0.1, D / 2, D / 2, D / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.62, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(25,10,0,0.45)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(D / 2, D / 2, D / 2 - 1, 0, TAU);
      g.fill();
      this.shade = c;
    }
    {
      const [c, g] = mk();
      const grad = g.createRadialGradient(D * 0.34, D * 0.28, 0, D * 0.34, D * 0.28, D * 0.32);
      grad.addColorStop(0, 'rgba(255,250,235,0.85)');
      grad.addColorStop(0.25, 'rgba(255,250,235,0.38)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, D, D);
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = D * 0.04;
      g.beginPath();
      g.arc(D / 2, D / 2, D * 0.42, 0.15 * Math.PI, 0.55 * Math.PI);
      g.stroke();
      this.spec = c;
    }
  }

  /** Put these numbers in the globe, settled at the bottom. */
  load(numbers) {
    const { cx, cy, R, r } = this.geo;
    this.balls = numbers.map((n, i) => {
      // Rough packing in the lower part of the globe.
      const ang = Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const d = R * (0.35 + Math.random() * 0.55);
      return this.makeBall(n, cx + Math.cos(ang) * d * 0.9, cy + Math.abs(Math.sin(ang)) * d * 0.7 - (i % 5) * r);
    });
  }

  /** Pour these balls back in through the neck. */
  refill(numbers) {
    const { cx, top, r } = this.geo;
    const existing = new Set(this.balls.map((b) => b.n));
    numbers
      .filter((n) => !existing.has(n))
      .forEach((n, i) => {
        setTimeout(() => {
          if (this.balls.some((b) => b.n === n)) return;
          const b = this.makeBall(n, cx + (Math.random() - 0.5) * r, top + r * 1.2);
          b.vy = 40;
          this.balls.push(b);
        }, i * 28);
      });
  }

  /** Match the globe to `numbers` without disturbing balls already in it. */
  sync(numbers) {
    const want = new Set(numbers);
    this.balls = this.balls.filter((b) => want.has(b.n) || b === this.flyer?.ball);
    this.refill(numbers);
  }

  makeBall(n, x, y) {
    return {
      n,
      L: letterOf(n),
      x,
      y,
      vx: (Math.random() - 0.5) * 30,
      vy: 0,
      ...randomFrame(),
      ph: Math.random() * 100,
    };
  }

  get count() {
    return this.balls.length;
  }

  // --- Drawing a ball --------------------------------------------------------

  /**
   * Blow ball `n` out of the globe. Resolves once it has popped out of the
   * neck, with its position and radius in viewport coordinates.
   */
  draw(n, { mixMs = 1500 } = {}) {
    const ball = this.balls.find((b) => b.n === n);
    if (!ball) return Promise.reject(new Error(`Ball ${n} is not in the globe`));
    this.targetPower = 1;
    this.mixing = true;
    return new Promise((resolve) => {
      setTimeout(() => {
        ball.captured = true;
        ball.capturedAt = this.time;
        this.flyer = { ball, phase: 'capture', resolve };
      }, mixMs);
    });
  }

  // --- Simulation ---------------------------------------------------------------

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.geo) return;
    this.acc += dt;
    const STEP = 1 / 120;
    let steps = 0;
    while (this.acc >= STEP && steps < 6) {
      this.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 6) this.acc = 0;
    this.render();
  }

  step(dt) {
    const { cx, cy, R, r, top } = this.geo;
    this.time += dt;
    this.power += (this.targetPower - this.power) * Math.min(1, dt * 5);
    const P = this.power;
    const g = 3.4 * R;
    const jetMax = R * (2 + 11 * P * P);
    const turb = R * (1 + 10 * P * P);

    for (const b of this.balls) {
      if (b.captured) continue;
      const dx = (b.x - cx) / R;
      const dy = (b.y - cy) / R;
      // The jet blows up the middle; balls rain back down the sides.
      const jet = jetMax * Math.exp(-(dx * dx) / 0.28) * clamp((dy + 0.45) / 1.3, 0, 1);
      const t = this.time * 1.7 + b.ph;
      b.vx += (Math.sin(t * 1.3 + b.ph * 2) + Math.sin(t * 2.9)) * 0.5 * turb * dt;
      b.vy += (g - jet + Math.sin(t * 2.1 + 1.7) * turb * 0.6) * dt;
      const damp = 1 - 0.55 * dt;
      b.vx *= damp;
      b.vy *= damp;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    // Ball–ball collisions.
    const n = this.balls.length;
    const minD = r * 2;
    let clack = 0;
    for (let i = 0; i < n; i++) {
      const a = this.balls[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const overlap = minD - d;
        const wa = a.captured ? 0 : b.captured ? 1 : 0.5;
        const wb = 1 - wa;
        a.x -= nx * overlap * wa;
        a.y -= ny * overlap * wa;
        b.x += nx * overlap * wb;
        b.y += ny * overlap * wb;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -(1 + 0.88) * rv;
          a.vx -= imp * nx * wa;
          a.vy -= imp * ny * wa;
          b.vx += imp * nx * wb;
          b.vy += imp * ny * wb;
          clack = Math.max(clack, -rv);
        }
      }
    }
    if (this.mixing && clack > R * 0.9 && this.time - this.lastClack > 0.045) {
      this.lastClack = this.time;
      this.onClack?.(clamp(clack / (R * 3), 0.2, 1));
    }

    // Glass wall.
    const lim = R - r - R * 0.012;
    for (const b of this.balls) {
      if (b.captured) continue;
      const dx = b.x - cx;
      const dy = b.y - cy;
      const d = Math.hypot(dx, dy);
      if (d > lim) {
        const nx = dx / d;
        const ny = dy / d;
        b.x = cx + nx * lim;
        b.y = cy + ny * lim;
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) {
          b.vx -= (1 + 0.72) * vn * nx;
          b.vy -= (1 + 0.72) * vn * ny;
          b.vx *= 0.985;
          b.vy *= 0.985;
        }
      }
    }

    // Tumble: roll each ball's frame about the axis perpendicular to its motion.
    for (const b of this.balls) {
      const sp = Math.hypot(b.vx, b.vy);
      const axis = sp > 1 ? [-b.vy / sp, b.vx / sp, 0] : [0, 0, 1];
      const ang = (sp / r) * dt * 0.55 + dt * 0.4;
      b.a = rotate(b.a, axis, ang);
      b.b = normalize(rotate(b.b, axis, ang));
      // Re-orthonormalise to stop drift.
      const n3 = normalize(cross(b.a, b.b));
      b.a = normalize(cross(b.b, n3));
    }

    // The ball being drawn.
    const f = this.flyer;
    if (f) {
      const b = f.ball;
      const ex = cx;
      const ey = top + r * 1.05;
      if (f.phase === 'capture') {
        const k = 90;
        const c = 13;
        b.vx += ((ex - b.x) * k - b.vx * c) * dt;
        b.vy += ((ey - b.y) * k - b.vy * c) * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (Math.hypot(ex - b.x, ey - b.y) < r * 0.25 || this.time - b.capturedAt > 1.4) {
          f.phase = 'rise';
          f.t0 = this.time;
          f.y0 = b.y;
          f.x0 = b.x;
          this.targetPower = 0.42;
          this.mixing = false;
        }
      } else if (f.phase === 'rise') {
        const T = 0.55;
        const t = clamp((this.time - f.t0) / T, 0, 1);
        const e = ease(t);
        b.x = f.x0 + (cx - f.x0) * Math.min(1, t * 3);
        b.y = f.y0 + (r * 1.02 - f.y0) * e;
        b.vx = 0;
        b.vy = -R;
        if (t >= 1) {
          this.balls = this.balls.filter((x) => x !== b);
          this.flyer = null;
          const rect = this.canvas.getBoundingClientRect();
          f.resolve({ x: rect.left + b.x, y: rect.top + b.y, r });
        }
      }
    }
  }

  // --- Rendering ------------------------------------------------------------

  render() {
    const { ctx, dpr } = this;
    const { cx, cy, R, r, top } = this.geo;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);

    this.drawStand();

    // Neck tube (behind).
    const tw = r * 1.32;
    ctx.fillStyle = 'rgba(255,225,180,0.09)';
    ctx.fillRect(cx - tw, 0, tw * 2, top + R * 0.05);

    // Globe interior.
    const inner = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R);
    inner.addColorStop(0, 'rgba(255,240,215,0.10)');
    inner.addColorStop(0.75, 'rgba(255,200,140,0.05)');
    inner.addColorStop(1, 'rgba(40,15,0,0.4)');
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    // Air vent in the floor.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + R * 0.97, R * 0.16, R * 0.035, 0, 0, TAU);
    ctx.fill();

    const drawn = this.flyer?.ball;
    for (const b of this.balls) if (b !== drawn) this.drawBall(b);

    this.drawGlass();
    this.drawCradle();
    if (drawn) this.drawBall(drawn);

    // Neck tube (front).
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - tw, 0);
    ctx.lineTo(cx - tw, top + R * 0.02);
    ctx.moveTo(cx + tw, 0);
    ctx.lineTo(cx + tw, top + R * 0.02);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = tw * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx - tw * 0.62, 0);
    ctx.lineTo(cx - tw * 0.62, top);
    ctx.stroke();
    // Chrome collar where the neck meets the globe.
    const collar = ctx.createLinearGradient(cx - tw * 1.5, 0, cx + tw * 1.5, 0);
    collar.addColorStop(0, '#6d7484');
    collar.addColorStop(0.35, '#f4f6fb');
    collar.addColorStop(0.6, '#a9b0be');
    collar.addColorStop(1, '#4b5160');
    ctx.fillStyle = collar;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - tw * 1.45, top - r * 0.5, tw * 2.9, r * 0.75, r * 0.2);
    else ctx.rect(cx - tw * 1.45, top - r * 0.5, tw * 2.9, r * 0.75);
    ctx.fill();
  }

  drawBall(b) {
    const { ctx, dpr, D, LS } = this;
    const { r } = this.geo;
    ctx.drawImage(this.body[b.L], b.x - r, b.y - r, r * 2, r * 2);

    // Printed number, on whichever side faces us.
    let a = b.a;
    let bb = b.b;
    let n = cross(a, bb);
    if (n[2] < 0) {
      a = a.map((v) => -v);
      n = n.map((v) => -v);
    }
    if (n[2] > 0.05) {
      const lx = b.x + n[0] * r * 0.8;
      const ly = b.y + n[1] * r * 0.8;
      const s = (r * 1.26) / LS;
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.97, 0, TAU);
      ctx.clip();
      ctx.globalAlpha = Math.min(1, n[2] * 3);
      ctx.setTransform(dpr * a[0] * s, dpr * a[1] * s, dpr * bb[0] * s, dpr * bb[1] * s, dpr * lx, dpr * ly);
      ctx.drawImage(this.labels.get(b.n), -LS / 2, -LS / 2);
      ctx.restore();
    }
    ctx.drawImage(this.shade, b.x - r, b.y - r, r * 2, r * 2);
    ctx.drawImage(this.spec, b.x - r, b.y - r, r * 2, r * 2);
    void D;
  }

  drawCradle() {
    const { ctx } = this;
    const { cx, cy, R } = this.geo;
    const y0 = cy + R * 0.86;
    // Chrome cradle ring, in front of the globe's foot.
    const ring = ctx.createLinearGradient(cx - R * 0.6, 0, cx + R * 0.6, 0);
    ring.addColorStop(0, '#5b6170');
    ring.addColorStop(0.3, '#f5f7fb');
    ring.addColorStop(0.55, '#a7afbf');
    ring.addColorStop(1, '#434855');
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.ellipse(cx, y0, R * 0.56, R * 0.1, 0, 0, Math.PI);
    ctx.ellipse(cx, y0 - R * 0.035, R * 0.53, R * 0.06, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, y0 - R * 0.035, R * 0.53, R * 0.06, 0, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }

  drawGlass() {
    const { ctx } = this;
    const { cx, cy, R } = this.geo;
    ctx.save();
    ctx.lineCap = 'round';
    // Rim.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,225,255,0.14)';
    ctx.lineWidth = R * 0.035;
    ctx.beginPath();
    ctx.arc(cx, cy, R - R * 0.02, 0, TAU);
    ctx.stroke();
    // Big soft window reflection, top left.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = R * 0.09;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.86, Math.PI * 1.08, Math.PI * 1.42);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = R * 0.025;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.86, Math.PI * 1.46, Math.PI * 1.52);
    ctx.stroke();
    // Small hot spot.
    const hs = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.55, 0, cx - R * 0.42, cy - R * 0.55, R * 0.12);
    hs.addColorStop(0, 'rgba(255,255,255,0.7)');
    hs.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hs;
    ctx.fillRect(cx - R * 0.6, cy - R * 0.72, R * 0.36, R * 0.36);
    // Lower right bounce light.
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = R * 0.04;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.9, Math.PI * 0.12, Math.PI * 0.38);
    ctx.stroke();
    ctx.restore();
  }

  drawStand() {
    const { ctx } = this;
    const { cx, cy, R } = this.geo;
    const y0 = cy + R * 0.86;
    const y1 = Math.min(this.H - 6, cy + R * 1.5);
    // Floor shadow.
    const sh = ctx.createRadialGradient(cx, y1, 0, cx, y1, R * 1.1);
    sh.addColorStop(0, 'rgba(0,0,0,0.45)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(cx, y1, R * 1.1, R * 0.16, 0, 0, TAU);
    ctx.fill();
    // Burnt-orange enamel pedestal with a 70s stripe band.
    const w0 = R * 0.42;
    const w1 = R * 0.78;
    const shape = new Path2D();
    shape.moveTo(cx - w0, y0);
    shape.lineTo(cx + w0, y0);
    shape.quadraticCurveTo(cx + w0 * 1.05, y1 - R * 0.1, cx + w1, y1 - R * 0.04);
    shape.lineTo(cx + w1, y1);
    shape.lineTo(cx - w1, y1);
    shape.lineTo(cx - w1, y1 - R * 0.04);
    shape.quadraticCurveTo(cx - w0 * 1.05, y1 - R * 0.1, cx - w0, y0);
    const body = ctx.createLinearGradient(cx - w1, 0, cx + w1, 0);
    body.addColorStop(0, '#7a3510');
    body.addColorStop(0.3, '#e7782e');
    body.addColorStop(0.55, '#cf5f1c');
    body.addColorStop(1, '#5d270a');
    ctx.fillStyle = body;
    ctx.fill(shape);
    ctx.save();
    ctx.clip(shape);
    const band = y1 - R * 0.25;
    const sw = R * 0.045;
    [
      ['#f0c25a', 0],
      ['#f4e4c3', 1],
      ['#a8391f', 2],
    ].forEach(([c, k]) => {
      ctx.fillStyle = c;
      ctx.fillRect(cx - w1, band + k * sw, w1 * 2, sw * 0.82);
    });
    const shine = ctx.createLinearGradient(cx - w1, 0, cx + w1, 0);
    shine.addColorStop(0, 'rgba(0,0,0,0.35)');
    shine.addColorStop(0.3, 'rgba(255,255,255,0.12)');
    shine.addColorStop(0.6, 'rgba(0,0,0,0)');
    shine.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = shine;
    ctx.fillRect(cx - w1, y0, w1 * 2, y1 - y0);
    ctx.restore();
    ctx.fillStyle = '#f4e4c3';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const top = y0 + R * 0.1;
    const room = band - top;
    ctx.font = `italic 800 ${Math.min(R * 0.15, room * 0.85)}px Fraunces, Georgia, serif`;
    ctx.fillText('Fireside', cx, top + room * 0.5);
  }
}
