// A short burst of paper confetti in dauber colours.

import { DAUBERS } from './dauber.js';

export function confetti({ count = 180, duration = 3200 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100';
  document.body.append(c);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = innerWidth;
  const H = innerHeight;
  c.width = W * dpr;
  c.height = H * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const colors = [...DAUBERS.map((d) => d.color), '#f6ecd6'];
  const bits = Array.from({ length: count }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    return {
      x: W / 2 + side * W * 0.32,
      y: H * 0.75,
      vx: -side * (180 + Math.random() * 520) + (Math.random() - 0.5) * 200,
      vy: -(700 + Math.random() * 700),
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 14,
      flip: Math.random() * 6.28,
      color: colors[i % colors.length],
    };
  });
  const t0 = performance.now();
  let last = t0;
  const tick = (now) => {
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;
    const life = (now - t0) / duration;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.min(1, (1 - life) * 3);
    for (const b of bits) {
      b.vy += 1100 * dt;
      b.vx *= 1 - 1.4 * dt;
      b.vy *= 1 - 1.1 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      b.flip += 9 * dt;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.rot);
      g.scale(1, Math.cos(b.flip));
      g.fillStyle = b.color;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    if (life < 1) requestAnimationFrame(tick);
    else c.remove();
  };
  requestAnimationFrame(tick);
}
