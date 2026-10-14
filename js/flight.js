// The drawn ball's trip from the top of the neck to the "now calling" spot.
//
// It bursts out of the tube in a shower of sparks, arcs over in a rolling
// tumble (growing as it comes toward you, with a short motion trail), lands
// with a squash, bounces twice and settles with its number facing front.
// Drawn on a temporary canvas that only covers the flight path.

import { letterOf } from './bingo.js';
import { BALL_COLORS, spritesFor, drawBall, FRONT, rotate, normalize } from './balls.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (t) => 1 - (1 - t) ** 3;

function sparks(x, y, count, { color, up = true, speed = 1 }) {
  const palette = [color, '#fff3c4', '#ffd25e', '#9fd3ff', '#ffffff'];
  return Array.from({ length: count }, (_, i) => {
    const a = up ? -Math.PI / 2 + (Math.random() - 0.5) * 2.4 : (i % 2 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.1;
    const v = (220 + Math.random() * 380) * speed;
    return {
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.45 + Math.random() * 0.4,
      size: 2.5 + Math.random() * 4,
      star: Math.random() < 0.55,
      spin: Math.random() * TAU,
      color: palette[i % palette.length],
    };
  });
}

function drawSpark(ctx, p, k) {
  ctx.globalAlpha = k;
  ctx.fillStyle = p.color;
  const s = p.size * (0.6 + 0.4 * k);
  if (p.star) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? s * 0.32 : s;
      const a = (i / 8) * TAU;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(p.x, p.y, s * 0.55, 0, TAU);
    ctx.fill();
  }
}

/**
 * Fly ball `n` from `from` {x, y, r, frame} to `to` {x, y, r}, both in
 * viewport pixels. Calls onBounce(strength) on each landing; `quality`
 * scales the resolution down on slow devices; `sprites` are the ball
 * sprites to draw with (pass the resting ball's, built ahead). Resolves when
 * the ball has settled; the canvas is removed on the next frame so the
 * caller can put the resting ball in place first.
 */
export function flyBall(n, from, to, { onBounce, quality = 1, sprites } = {}) {
  // Motion hides softness, so the flight never needs more than 1.5x.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * quality;
  const { x: x0, y: y0, r: r0 } = from;
  const { x: x1, y: y1, r: R1 } = to;

  // Peak height of the arc, kept on screen.
  const lift = clamp(Math.abs(x1 - x0) * 0.3 + R1 * 1.2, 70, 280);
  const apex = Math.max(R1 * 1.1 + 6, Math.min(y0, y1) - lift);
  // Quadratic Bézier whose highest point is exactly `apex`.
  const cy = apex - Math.sqrt(Math.max(0, (apex - y0) * (apex - y1)));
  const cx = x0 + (x1 - x0) * 0.18;
  const dist = Math.hypot(x1 - x0, y1 - y0) + (Math.min(y0, y1) - apex) * 1.5;
  const T = clamp(420 + dist * 0.5, 680, 1050);
  const B1 = 300;
  const B2 = 180;
  const SETTLE = 160;
  const total = T + B1 + B2 + SETTLE;

  // Roll forwards along the path, ending face-on.
  const axis = normalize([-(y1 - y0) || 0.01, x1 - x0, Math.hypot(x1 - x0, y1 - y0) * 0.25]);
  const spin = TAU * (1.5 + Math.random() * 0.5);

  // Overlay covering the path, the landing and some room for sparks.
  const pad = R1 * 0.6 + 40;
  const left = Math.max(0, Math.min(x0, cx, x1 - R1) - pad);
  const right = Math.min(innerWidth, Math.max(x0, cx, x1 + R1) + pad);
  const top = Math.max(0, apex - R1 - pad);
  const bottom = Math.min(innerHeight, Math.max(y0, y1 + R1) + pad);
  const W = right - left;
  const H = bottom - top;
  const canvas = document.createElement('canvas');
  canvas.className = 'flight';
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${W}px;height:${H}px;pointer-events:none;z-index:40`;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  // Ideally the resting ball's own sprites, built while the balls mixed.
  sprites ??= spritesFor(R1 * 2 * Math.min(window.devicePixelRatio || 1, 2));

  const color = BALL_COLORS[letterOf(n)];
  let particles = sparks(x0 - left, y0 - top - r0, 16, { color });
  const trail = [];
  let ring = null;
  let bounced = 0;

  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = t0;
    const tick = (now) => {
      const ms = now - t0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      let x;
      let y;
      let r;
      let frame;
      let sx = 1;
      let sy = 1;
      if (ms < T) {
        const t = ms / T;
        const u = 1 - t;
        x = u * u * x0 + 2 * u * t * cx + t * t * x1;
        y = u * u * y0 + 2 * u * t * cy + t * t * y1;
        r = r0 + (R1 - r0) * easeOut(Math.min(1, t * 1.15));
        frame = {
          a: rotate(FRONT.a, axis, -spin * (1 - easeOut(t))),
          b: rotate(FRONT.b, axis, -spin * (1 - easeOut(t))),
        };
        // Stretched as it shoots out of the tube, and again as it falls.
        const out = Math.max(0, 1 - t / 0.12);
        const fall = Math.max(0, (t - 0.8) / 0.2);
        sy = 1 + 0.28 * out + 0.1 * fall;
        sx = 1 - 0.16 * out - 0.06 * fall;
        trail.push({ x: x - left, y: y - top, r });
        if (trail.length > 5) trail.shift();
      } else {
        const b = ms - T;
        x = x1;
        r = R1;
        let h = 0;
        let since;
        if (b < B1) {
          h = R1 * 0.34 * Math.sin((Math.PI * b) / B1);
          since = b;
        } else if (b < B1 + B2) {
          h = R1 * 0.09 * Math.sin((Math.PI * (b - B1)) / B2);
          since = b - B1;
        } else {
          since = b - B1 - B2;
        }
        y = y1 - h;
        const hit = b < B1 ? 0 : b < B1 + B2 ? 1 : 2;
        if (hit >= bounced) {
          onBounce?.(hit === 0 ? 1 : hit === 1 ? 0.45 : 0.15);
          if (hit === 0) {
            ring = { x: x1 - left, y: y1 - top + R1 * 0.85, t: 0 };
            particles = particles.concat(sparks(x1 - left, y1 - top + R1 * 0.9, 12, { color, up: false, speed: 0.7 }));
          }
          bounced = hit + 1;
        }
        const amp = hit === 0 ? 0.24 : hit === 1 ? 0.11 : 0.05;
        const sq = amp * Math.max(0, 1 - since / 110);
        sx = 1 + sq;
        sy = 1 - sq;
        // The label rocks to a stop.
        const wob = 0.32 * Math.exp(-b / 160) * Math.sin(b / 45);
        frame = { a: rotate(FRONT.a, [0, 1, 0], wob), b: rotate(FRONT.b, [1, 0, 0], wob * 0.4) };
      }

      const lx = x - left;
      const ly = y - top;

      // Motion trail.
      if (ms < T) {
        for (let i = 0; i < trail.length - 1; i++) {
          const p = trail[i];
          drawBall(ctx, sprites, n, p.x, p.y, p.r, frame, 0.07 + i * 0.05);
        }
      }

      // Landing ring.
      if (ring) {
        ring.t += dt;
        const k = ring.t / 0.42;
        if (k < 1) {
          ctx.globalAlpha = (1 - k) * 0.7;
          ctx.strokeStyle = '#fff4d6';
          ctx.lineWidth = Math.max(1.5, R1 * 0.06 * (1 - k));
          ctx.beginPath();
          ctx.ellipse(ring.x, ring.y, R1 * (0.7 + k * 0.9), R1 * (0.18 + k * 0.22), 0, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // The ball, squashed about its base.
      ctx.save();
      ctx.translate(lx, ly + r);
      ctx.scale(sx, sy);
      drawBall(ctx, sprites, n, 0, -r, r, frame);
      ctx.restore();

      // Sparks.
      particles = particles.filter((p) => {
        p.life -= dt;
        if (p.life <= 0) return false;
        p.vy += 900 * dt;
        p.vx *= 1 - 1.5 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.spin += dt * 8;
        drawSpark(ctx, p, Math.min(1, p.life * 2.5));
        return true;
      });
      ctx.globalAlpha = 1;

      if (ms < total || particles.length) {
        if (ms >= total && !canvas.dataset.done) {
          canvas.dataset.done = '1';
          resolve();
        }
        requestAnimationFrame(tick);
      } else {
        if (!canvas.dataset.done) resolve();
        requestAnimationFrame(() => canvas.remove());
      }
    };
    requestAnimationFrame(tick);
  });
}
