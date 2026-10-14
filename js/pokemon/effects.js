// Electricity in the globe: while the air roars (or the glass is tapped),
// short lightning arcs crackle from the glass towards the balls. Drawn by
// the machine's `effects` hook, between the balls and the glass, with
// additive blending. A few strokes a frame, and nothing at all when idle.

const TAU = Math.PI * 2;

function arc(cx, cy, R) {
  const a0 = Math.random() * TAU;
  const a1 = a0 + (Math.random() - 0.5) * 1.1;
  const r0 = R * 0.97;
  const r1 = R * (0.35 + Math.random() * 0.35);
  const steps = 7;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + (a1 - a0) * t;
    const r = r0 + (r1 - r0) * t;
    const j = i && i < steps ? (Math.random() - 0.5) * R * 0.12 : 0;
    pts.push([cx + Math.cos(a) * r + j, cy + Math.sin(a) * r + j]);
  }
  return pts;
}

export function electricArcs({ idle = 0.42 } = {}) {
  let bolts = [];
  return (ctx, m) => {
    const { cx, cy, R } = m.geo;
    const poked = m.time < m.pokeUntil;
    const P = Math.max(poked ? 0.6 : 0, (m.power - idle) / (1 - idle));
    if (P > 0.25 && Math.random() < P * 0.22)
      bolts.push({ pts: arc(cx, cy, R), born: m.time, life: 0.09 + Math.random() * 0.1 });
    if (!bolts.length) return;
    bolts = bolts.filter((b) => m.time - b.born < b.life);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const b of bolts) {
      const k = 1 - (m.time - b.born) / b.life;
      ctx.beginPath();
      b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.globalAlpha = 0.35 * k;
      ctx.strokeStyle = '#ffd21f';
      ctx.lineWidth = R * 0.045;
      ctx.stroke();
      ctx.globalAlpha = 0.9 * k;
      ctx.strokeStyle = '#fffbe0';
      ctx.lineWidth = Math.max(1, R * 0.012);
      ctx.stroke();
    }
    ctx.restore();
  };
}
