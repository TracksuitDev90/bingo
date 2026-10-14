// The ball blower: a glass globe full of ping-pong bingo balls, simulated on
// a canvas. An air jet in the floor keeps them tumbling; when a ball is drawn
// the air roars, the lights race, the chosen ball is sucked up the neck and
// pops out the top.
//
// The physics is only theatre. Which ball comes out is decided beforehand by
// the page with the crypto RNG; the machine just animates that ball out.
//
// Speed: everything that doesn't move (pedestal, glass, neck, cradle) is
// painted once per resize into two offscreen layers, balls are three sprite
// blits each with no clipping, and the resolution steps down by itself if a
// slow device can't keep up.

import { letterOf } from './bingo.js';
import { spritesFor, drawBall, randomFrame, rotate, cross, normalize } from './balls.js';

// How the machine is dressed. A themed edition can pass its own `balls`
// (sprites and drawing), `stand` (pedestal colours and lettering) and an
// `effects(ctx, machine)` hook drawn over the balls, inside the glass.
const CLASSIC_BALLS = { spritesFor, drawBall };
const CLASSIC_STAND = {
  body: ['#18466f', '#3a8fd0', '#2f80c0', '#123a5e'],
  text: 'bingo',
  font: '"Titan One", sans-serif',
  ink: '#f4ead4',
  glow: 'rgba(255,236,170,',
};

export { BALL_COLORS, LABEL_INK } from './balls.js';

const TAU = Math.PI * 2;
const IDLE = 0.42;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const BULBS = 13;

function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class BlowerMachine {
  constructor(canvas, { onClack, onPoke, balls = CLASSIC_BALLS, stand, effects } = {}) {
    this.canvas = canvas;
    this.kit = balls;
    this.stand = { ...CLASSIC_STAND, ...stand };
    this.effects = effects;
    this.ctx = canvas.getContext('2d');
    this.onClack = onClack;
    this.onPoke = onPoke;
    this.balls = [];
    this.power = IDLE;
    this.targetPower = IDLE;
    this.time = 0;
    this.acc = 0;
    this.lastClack = 0;
    this.mixing = false;
    this.flyer = null; // ball being drawn
    this.geo = null;
    this.quality = 1; // drops on slow devices
    this.slowWindows = 0;
    this.perf = { n: 0, sum: 0 };
    this.pokeUntil = 0;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    canvas.addEventListener('pointerdown', (e) => this.poke(e));
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
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

  /** (Re)build ball sprites and the static layers. Call again once fonts load. */
  buildSprites() {
    if (!this.geo) return;
    this.sprites = this.kit.spritesFor(this.geo.r * 2 * this.dpr);
    this.sprites.labels.clear();
    this.buildLayers();
  }

  /** Put these numbers in the globe, settled at the bottom. */
  load(numbers) {
    const { cx, cy, R, r } = this.geo;
    this.balls = numbers.map((n, i) => {
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

  /** A tap on the glass gives the balls a puff of air. */
  poke(e) {
    if (this.mixing || this.flyer || !this.geo) return;
    const rect = this.canvas.getBoundingClientRect();
    const { cx, cy, R } = this.geo;
    if (Math.hypot(e.clientX - rect.left - cx, e.clientY - rect.top - cy) > R * 1.1) return;
    this.pokeUntil = this.time + 0.32;
    this.onPoke?.();
  }

  // --- Drawing a ball --------------------------------------------------------

  /**
   * Blow ball `n` out of the globe. Resolves once it has popped out of the
   * neck, with its viewport position, radius and orientation.
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
    const raw = now - this.last;
    const dt = Math.min(0.05, raw / 1000);
    this.last = now;
    if (!this.geo) return;
    this.watchSpeed(raw);
    this.acc += dt;
    const STEP = 1 / 120;
    let steps = 0;
    while (this.acc >= STEP && steps < 3) {
      this.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 3) this.acc = 0;
    this.render();
  }

  /**
   * Step the resolution down if frames keep running long (a phone without
   * GPU canvas, say). Two slow stretches in a row are needed, so a one-off
   * hiccup never costs sharpness. The first couple of seconds are ignored
   * while fonts and sprites settle.
   */
  watchSpeed(ms) {
    if (ms > 250 || document.hidden || this.time < 2) return;
    const p = this.perf;
    p.n++;
    p.sum += ms;
    if (p.n < 40) return;
    const avg = p.sum / p.n;
    p.n = p.sum = 0;
    this.slowWindows = avg > 22 ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= 2 && this.quality > 0.5) {
      this.slowWindows = 0;
      this.quality = Math.max(0.5, this.quality * 0.75);
      this.resize();
    }
  }

  step(dt) {
    const { cx, cy, R, r, top } = this.geo;
    this.time += dt;
    const target = this.time < this.pokeUntil ? Math.max(this.targetPower, 0.95) : this.targetPower;
    this.power += (target - this.power) * Math.min(1, dt * 5);
    const P = this.power;
    const g = 3.4 * R;
    const jetMax = R * (2 + 11 * P * P);
    const turb = R * (1 + 10 * P * P);
    const balls = this.balls;
    const n = balls.length;

    for (let i = 0; i < n; i++) {
      const b = balls[i];
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
    const minD = r * 2;
    const minD2 = minD * minD;
    let clack = 0;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        const dx = b.x - a.x;
        if (dx > minD || dx < -minD) continue;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD2 || d2 === 0) continue;
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
          const imp = -1.88 * rv;
          a.vx -= imp * nx * wa;
          a.vy -= imp * ny * wa;
          b.vx += imp * nx * wb;
          b.vy += imp * ny * wb;
          if (-rv > clack) clack = -rv;
        }
      }
    }
    if ((this.mixing || this.time < this.pokeUntil) && clack > R * 0.9 && this.time - this.lastClack > 0.045) {
      this.lastClack = this.time;
      this.onClack?.(clamp(clack / (R * 3), 0.2, 1));
    }

    // Glass wall, and the tumble: roll each ball's frame about the axis
    // perpendicular to its motion.
    const lim = R - r - R * 0.012;
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (!b.captured) {
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
            b.vx = (b.vx - 1.72 * vn * nx) * 0.985;
            b.vy = (b.vy - 1.72 * vn * ny) * 0.985;
          }
        }
      }
      const sp = Math.hypot(b.vx, b.vy);
      const axis = sp > 1 ? [-b.vy / sp, b.vx / sp, 0] : [0, 0, 1];
      const ang = (sp / r) * dt * 0.55 + dt * 0.4;
      b.a = rotate(b.a, axis, ang);
      b.b = normalize(rotate(b.b, axis, ang));
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
        b.vx += ((ex - b.x) * 90 - b.vx * 13) * dt;
        b.vy += ((ey - b.y) * 90 - b.vy * 13) * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (Math.hypot(ex - b.x, ey - b.y) < r * 0.25 || this.time - b.capturedAt > 1.4) {
          f.phase = 'rise';
          f.t0 = this.time;
          f.y0 = b.y;
          f.x0 = b.x;
          this.targetPower = IDLE;
          this.mixing = false;
        }
      } else if (f.phase === 'rise') {
        const t = clamp((this.time - f.t0) / 0.42, 0, 1);
        const e = ease(t);
        b.x = f.x0 + (cx - f.x0) * Math.min(1, t * 3);
        b.y = f.y0 + (r * 1.02 - f.y0) * e;
        b.vx = 0;
        b.vy = -R * 2;
        if (t >= 1) {
          this.balls = this.balls.filter((x) => x !== b);
          this.flyer = null;
          const rect = this.canvas.getBoundingClientRect();
          f.resolve({ x: rect.left + b.x, y: rect.top + b.y, r, frame: { a: b.a, b: b.b } });
        }
      }
    }
  }

  // --- Rendering ------------------------------------------------------------

  render() {
    const { ctx, dpr, sprites } = this;
    const { cx, R, r } = this.geo;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // The whole machine shudders while the air is roaring.
    const shake = Math.max(0, this.power - 0.55) * R * 0.012;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);

    ctx.drawImage(this.back, 0, 0, this.W, this.H);
    const drawn = this.flyer?.ball;
    const { drawBall } = this.kit;
    for (const b of this.balls) if (b !== drawn) drawBall(ctx, sprites, b.n, b.x, b.y, r, b);
    if (drawn) {
      // A glow in the neck as the chosen ball rides up.
      if (this.flyer.phase === 'rise') {
        const g = ctx.createRadialGradient(cx, drawn.y, 0, cx, drawn.y, r * 3);
        g.addColorStop(0, `${this.stand.glow}0.55)`);
        g.addColorStop(1, `${this.stand.glow}0)`);
        ctx.fillStyle = g;
        ctx.fillRect(cx - r * 3, drawn.y - r * 3, r * 6, r * 6);
      }
      drawBall(ctx, sprites, drawn.n, drawn.x, drawn.y, r, drawn);
    }
    this.effects?.(ctx, this);
    ctx.drawImage(this.front, 0, 0, this.W, this.H);
    this.drawBulbs();
  }

  /** Marquee bulbs round the pedestal: a lazy twinkle, racing while mixing. */
  drawBulbs() {
    const { ctx, bulbs } = this;
    if (!bulbs) return;
    const P = clamp((this.power - IDLE) / (1 - IDLE), 0, 1);
    const t = this.time;
    const speed = 1.4 + P * 16;
    const s = bulbs.size;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < BULBS; i++) {
      const [x, y] = bulbs.at[i];
      const wave = 0.5 + 0.5 * Math.sin(i * 1.9 - t * speed);
      const chase = (Math.floor(t * speed * 0.9) + i) % 3 === 0 ? 1 : 0.15;
      const on = P > 0.05 ? 0.25 + 0.75 * (chase * P + wave * (1 - P)) : 0.35 + 0.65 * wave ** 3;
      ctx.globalAlpha = on;
      ctx.drawImage(bulbs.glow, x - s, y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  buildLayers() {
    const { dpr, W, H } = this;
    const w = Math.round(W * dpr);
    const h = Math.round(H * dpr);
    this.back = layer(w, h);
    this.front = layer(w, h);
    const b = this.back.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    const f = this.front.getContext('2d');
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.paintStand(b);
    this.paintInterior(b);
    this.paintGlass(f);
    this.paintCradle(f);
    this.paintNeck(f);
    this.buildBulbs();
  }

  paintInterior(ctx) {
    const { cx, cy, R, r, top } = this.geo;
    // Neck tube, behind.
    const tw = r * 1.32;
    ctx.fillStyle = 'rgba(220,235,255,0.1)';
    ctx.fillRect(cx - tw, 0, tw * 2, top + R * 0.05);
    const inner = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R);
    inner.addColorStop(0, 'rgba(235,245,255,0.12)');
    inner.addColorStop(0.75, 'rgba(200,225,255,0.05)');
    inner.addColorStop(1, 'rgba(5,20,45,0.45)');
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    // Air vent in the floor.
    ctx.fillStyle = 'rgba(0,10,25,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + R * 0.97, R * 0.16, R * 0.035, 0, 0, TAU);
    ctx.fill();
  }

  paintNeck(ctx) {
    const { cx, R, r, top } = this.geo;
    const tw = r * 1.32;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
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

  paintCradle(ctx) {
    const { cx, cy, R } = this.geo;
    const y0 = cy + R * 0.86;
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

  paintGlass(ctx) {
    const { cx, cy, R } = this.geo;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,225,255,0.16)';
    ctx.lineWidth = R * 0.035;
    ctx.beginPath();
    ctx.arc(cx, cy, R - R * 0.02, 0, TAU);
    ctx.stroke();
    // Big soft window reflection, top left.
    ctx.strokeStyle = 'rgba(255,255,255,0.24)';
    ctx.lineWidth = R * 0.09;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.86, Math.PI * 1.08, Math.PI * 1.42);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = R * 0.025;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.86, Math.PI * 1.46, Math.PI * 1.52);
    ctx.stroke();
    const hs = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.55, 0, cx - R * 0.42, cy - R * 0.55, R * 0.12);
    hs.addColorStop(0, 'rgba(255,255,255,0.7)');
    hs.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hs;
    ctx.fillRect(cx - R * 0.6, cy - R * 0.72, R * 0.36, R * 0.36);
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = R * 0.04;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.9, Math.PI * 0.12, Math.PI * 0.38);
    ctx.stroke();
    ctx.restore();
  }

  /** Painted-blue enamel pedestal, printed like the cards. */
  paintStand(ctx) {
    const { cx, cy, R } = this.geo;
    const look = this.stand;
    const y0 = cy + R * 0.86;
    const y1 = Math.min(this.H - 4, cy + R * 1.5);
    this.standBox = { y0, y1 };
    const sh = ctx.createRadialGradient(cx, y1, 0, cx, y1, R * 1.1);
    sh.addColorStop(0, 'rgba(0,8,20,0.5)');
    sh.addColorStop(1, 'rgba(0,8,20,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(cx, y1, R * 1.1, R * 0.16, 0, 0, TAU);
    ctx.fill();
    const w0 = R * 0.42;
    const w1 = R * 0.8;
    const shape = new Path2D();
    shape.moveTo(cx - w0, y0);
    shape.lineTo(cx + w0, y0);
    shape.quadraticCurveTo(cx + w0 * 1.05, y1 - R * 0.1, cx + w1, y1 - R * 0.05);
    shape.quadraticCurveTo(cx + w1 * 1.02, y1, cx + w1 * 0.96, y1);
    shape.lineTo(cx - w1 * 0.96, y1);
    shape.quadraticCurveTo(cx - w1 * 1.02, y1, cx - w1, y1 - R * 0.05);
    shape.quadraticCurveTo(cx - w0 * 1.05, y1 - R * 0.1, cx - w0, y0);
    const body = ctx.createLinearGradient(cx - w1, 0, cx + w1, 0);
    [0, 0.3, 0.55, 1].forEach((at, i) => body.addColorStop(at, look.body[i]));
    ctx.fillStyle = body;
    ctx.fill(shape);
    ctx.save();
    ctx.clip(shape);
    const shine = ctx.createLinearGradient(0, y0, 0, y1);
    shine.addColorStop(0, 'rgba(0,10,30,0.35)');
    shine.addColorStop(0.35, 'rgba(255,255,255,0.06)');
    shine.addColorStop(1, 'rgba(0,10,30,0.25)');
    ctx.fillStyle = shine;
    ctx.fillRect(cx - w1, y0, w1 * 2, y1 - y0);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke(shape);
    // Lowercase "bingo", like the top of a card.
    const room = y1 - y0 - R * 0.28;
    const size = Math.min(R * 0.2, room * 0.95);
    ctx.fillStyle = look.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${size}px ${look.font}`;
    ctx.fillText(look.text, cx, y0 + R * 0.12 + room * 0.5);
  }

  buildBulbs() {
    const { cx, R } = this.geo;
    const { y1 } = this.standBox;
    const y = y1 - R * 0.09;
    const span = R * 0.66;
    const s = Math.max(5, R * 0.075);
    const at = Array.from({ length: BULBS }, (_, i) => {
      const u = i / (BULBS - 1) - 0.5;
      return [cx + u * 2 * span, y - Math.cos(u * Math.PI) * R * 0.02];
    });
    const D = Math.ceil(s * 2 * this.dpr);
    const glow = layer(D, D);
    const g = glow.getContext('2d');
    const grad = g.createRadialGradient(D / 2, D / 2, 0, D / 2, D / 2, D / 2);
    grad.addColorStop(0, 'rgba(255,250,225,1)');
    grad.addColorStop(0.18, 'rgba(255,226,140,0.95)');
    grad.addColorStop(0.4, 'rgba(255,190,70,0.35)');
    grad.addColorStop(1, 'rgba(255,170,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, D, D);
    // A marquee strip and the unlit bulbs live on the static layer.
    const b = this.back.getContext('2d');
    b.strokeStyle = 'rgba(8,24,44,0.55)';
    b.lineWidth = s * 0.95;
    b.lineCap = 'round';
    b.beginPath();
    at.forEach(([x, yy], i) => (i ? b.lineTo(x, yy) : b.moveTo(x, yy)));
    b.stroke();
    for (const [x, yy] of at) {
      b.fillStyle = 'rgba(255,236,190,0.35)';
      b.beginPath();
      b.arc(x, yy, s * 0.26, 0, TAU);
      b.fill();
    }
    this.bulbs = { at, size: s, glow };
  }
}
