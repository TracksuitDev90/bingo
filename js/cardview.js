// Renders a paper bingo card. Used for the player's own card, for a shared
// card opened from a link, inside the blower's card check and on the home
// page.
//
// The printed face (card stock, deckled edge, the hand-painted blue print,
// the numbers, the red serial) is painted once into a canvas and then never
// touched. Each daub is a small canvas of its own, multiplied over the print
// so the number shows through the ink; its splotch is painted ahead of time,
// and the stamp, sheen, splash and sparkle are transform/opacity animations
// the compositor runs by itself. A tap costs almost nothing on the main
// thread. Invisible buttons over the grid take the taps and keep the card
// accessible.

import { FREE, letterOf } from './bingo.js?v=3f6ee08f';
import { splotch, dauberById, markJitter } from './dauber.js?v=31409a63';
import { hash, seeded } from './rng.js?v=d7e59606';

const TAU = Math.PI * 2;
const PAPER = '#f0e3c5';
const INK = '#2f80c0';
const SERIAL_INK = '#c23b22';

// Card geometry in units of 1/100 of the card's width.
const W = 100;
const H = 131;
const SIDE = 5.2;
const GAP = 1.7;
const BORDER = 0.85;
const GRID_TOP = 31.6;
const GRID_H = 91.5;
const COL_W = (W - 2 * SIDE - 4 * GAP) / 5;
const CELL_W = COL_W - 2 * BORDER;
const CELL_H = (GRID_H - 2 * BORDER) / 5;
const MARK = Math.min(CELL_W, CELL_H) * 1.55;
const colX = (c) => SIDE + c * (COL_W + GAP);
/** Box of cell i (row-major) in card units. */
function cell(i) {
  const row = Math.floor(i / 5);
  const col = i % 5;
  const x = colX(col) + BORDER;
  const y = GRID_TOP + BORDER + row * CELL_H;
  return { x, y, w: CELL_W, h: CELL_H, cx: x + CELL_W / 2, cy: y + CELL_H / 2 };
}
const pct = (v, of) => `${((v / of) * 100).toFixed(4)}%`;

/** The card's layout, for editions that paint their own face on it. */
export const GEOMETRY = Object.freeze({ W, H, SIDE, GAP, BORDER, GRID_TOP, GRID_H, COL_W, CELL_W, CELL_H, colX, cell });

// --- Shared resources ---------------------------------------------------------

let fontsReady;
function loadFonts() {
  fontsReady ??= Promise.race([
    Promise.all(
      ['40px "Titan One"', '40px Itim', 'italic 800 40px Fraunces'].map((f) => document.fonts.load(f).catch(() => {})),
    ),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
  return fontsReady;
}

let paperImg;
function loadPaper() {
  if (!paperImg) {
    const img = new Image();
    img.src = new URL('../assets/img/paper.jpg?v=1212cfcc', import.meta.url).href;
    paperImg = img
      .decode()
      .then(() => img)
      .catch(() => null);
  }
  return paperImg;
}

// Fine speckle that knocks little holes in the print, like ink on rough stock.
let tooth;
function toothTile() {
  if (tooth) return tooth;
  const N = 96;
  const src = document.createElement('canvas');
  src.width = src.height = N;
  const g = src.getContext('2d');
  const img = g.createImageData(N, N);
  const rnd = seeded(4);
  for (let i = 0; i < N * N; i++) {
    const v = rnd();
    img.data[i * 4 + 3] = v < 0.025 ? 120 + rnd() * 100 : v < 0.12 ? 20 + rnd() * 40 : 0;
  }
  g.putImageData(img, 0, 0);
  tooth = src;
  return tooth;
}

// --- Hand-painted shapes -------------------------------------------------------

/** Points round a rounded rectangle, each with its outward normal. */
function roundRectPoints(x, y, w, h, r, step) {
  const pts = [];
  const seg = (x0, y0, x1, y1, nx, ny) => {
    const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < k; i++) pts.push([x0 + ((x1 - x0) * i) / k, y0 + ((y1 - y0) * i) / k, nx, ny]);
  };
  const arc = (cx, cy, a0) => {
    const k = Math.max(2, Math.ceil((r * Math.PI) / 2 / step));
    for (let i = 0; i < k; i++) {
      const a = a0 + ((i / k) * Math.PI) / 2;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.cos(a), Math.sin(a)]);
    }
  };
  seg(x + r, y, x + w - r, y, 0, -1);
  arc(x + w - r, y + r, -Math.PI / 2);
  seg(x + w, y + r, x + w, y + h - r, 1, 0);
  arc(x + w - r, y + h - r, 0);
  seg(x + w - r, y + h, x + r, y + h, 0, 1);
  arc(x + r, y + h - r, Math.PI / 2);
  seg(x, y + h - r, x, y + r, -1, 0);
  arc(x + r, y + r, Math.PI);
  return pts;
}

/** A rounded rectangle whose edge wanders a little, like a painted line. */
function wobblyRect(rnd, x, y, w, h, r, amp, freqs = [0.3, 1.2, 3.6], { step = 0.5, rough = 0 } = {}) {
  const pts = roundRectPoints(x, y, w, h, r, step);
  const ph = freqs.map(() => rnd() * TAU);
  const fq = freqs.map((f) => f * (0.8 + rnd() * 0.4));
  const am = [amp, amp * 0.45, amp * 0.22];
  const path = new Path2D();
  let s = 0;
  pts.forEach(([px, py, nx, ny], i) => {
    if (i) s += Math.hypot(px - pts[i - 1][0], py - pts[i - 1][1]);
    const d =
      am[0] * Math.sin(s * fq[0] + ph[0]) +
      am[1] * Math.sin(s * fq[1] + ph[1]) +
      am[2] * Math.sin(s * fq[2] + ph[2]) +
      (rough ? (rnd() - 0.5) * rough : 0);
    if (i) path.lineTo(px + nx * d, py + ny * d);
    else path.moveTo(px + nx * d, py + ny * d);
  });
  path.closePath();
  return path;
}

function jitterText(ctx, rnd, text, x, y, { rot = 2, shift = 0.35, size = 0.03 } = {}) {
  ctx.save();
  ctx.translate(x + (rnd() - 0.5) * shift * 2, y + (rnd() - 0.5) * shift * 1.6);
  ctx.rotate(((rnd() - 0.5) * 2 * rot * Math.PI) / 180);
  const k = 1 + (rnd() - 0.5) * 2 * size;
  ctx.scale(k, k);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// --- Painting the face -----------------------------------------------------------

function paintInk(ctx, card) {
  const rnd = seeded(hash('ink', card.serial));
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Title block with "bingo" knocked out of it.
  ctx.fill(wobblyRect(rnd, SIDE, 5, W - 2 * SIDE, 20, 1.6, 0.16));
  ctx.globalCompositeOperation = 'destination-out';
  ctx.font = '17.5px "Titan One", sans-serif';
  [...'bingo'].forEach((l, c) => jitterText(ctx, rnd, l, colX(c) + COL_W / 2, 14.2, { rot: 2.5, shift: 0.3 }));
  ctx.globalCompositeOperation = 'source-over';
  ctx.fill(wobblyRect(rnd, SIDE, 27, W - 2 * SIDE, 2.3, 1, 0.12));

  // Columns, rule bars, numbers and the free spot.
  ctx.lineWidth = BORDER;
  for (let c = 0; c < 5; c++) {
    ctx.stroke(
      wobblyRect(rnd, colX(c) + BORDER / 2, GRID_TOP + BORDER / 2, COL_W - BORDER, GRID_H - BORDER, 1.1, 0.14),
    );
  }
  ctx.font = '13.2px Itim, sans-serif';
  for (let i = 0; i < 25; i++) {
    const b = cell(i);
    if (i < 20) ctx.fill(wobblyRect(rnd, b.x + b.w * 0.15, b.y + b.h - 0.9, b.w * 0.7, 1.8, 0.9, 0.1));
    if (i === FREE) {
      const fw = b.w * 0.84;
      const fh = b.h * 0.78;
      ctx.fill(wobblyRect(rnd, b.cx - fw / 2, b.cy - fh / 2, fw, fh, 1.3, 0.12));
      ctx.globalCompositeOperation = 'destination-out';
      ctx.font = '5.4px Itim, sans-serif';
      ctx.fillText('FREE', b.cx, b.cy - 2.5);
      ctx.fillText('SPOT', b.cx, b.cy + 2.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = '13.2px Itim, sans-serif';
    } else {
      jitterText(ctx, rnd, String(card.numbers[i]), b.cx, b.cy + 0.35, { rot: 2.4, shift: 0.4 });
    }
  }

  // Footer: brand and a dotted rule with a couple of gaps.
  ctx.textAlign = 'left';
  ctx.font = 'italic 800 4.3px Fraunces, Georgia, serif';
  const fy = 123.9 + 2.3;
  ctx.fillText('Fireside Bingo', SIDE, fy + 0.2);
  const x0 = SIDE + ctx.measureText('Fireside Bingo').width + 2;
  const x1 = W - 31;
  const span = x1 - x0;
  for (let x = x0 + 0.5; x < x1; x += 2.6) {
    const u = (x - x0) / span;
    if ((u > 0.22 && u < 0.28) || (u > 0.61 && u < 0.68)) continue;
    ctx.beginPath();
    ctx.arc(x, fy + (rnd() - 0.5) * 0.2, 0.42, 0, TAU);
    ctx.fill();
  }
}

async function paintFace(card, px) {
  await loadFonts();
  const paper = await loadPaper();
  const s = px / W;
  const ph = Math.round(px * (H / W));
  const face = document.createElement('canvas');
  face.width = px;
  face.height = ph;
  const ctx = face.getContext('2d');
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const rnd = seeded(hash('paper', card.serial));

  // Card stock with a deckled edge.
  const edge = wobblyRect(rnd, 0.5, 0.5, W - 1, H - 1, 0.9, 0.24, [0.45, 1.6, 4.2], { step: 0.22, rough: 0.16 });
  ctx.save();
  ctx.clip(edge);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  if (paper) {
    const pat = ctx.createPattern(paper, 'repeat');
    pat.setTransform?.(new DOMMatrix().scale(60 / paper.width));
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.translate(45, H * 0.42);
  ctx.scale(1, 1.31);
  const vig = ctx.createRadialGradient(0, 0, 0, 0, 0, 78);
  vig.addColorStop(0.5, 'rgba(130,80,20,0)');
  vig.addColorStop(1, 'rgba(130,80,20,0.22)');
  ctx.fillStyle = vig;
  ctx.fillRect(-60, -60, 130, 130);
  ctx.restore();
  const light = ctx.createLinearGradient(0, 0, 25, H);
  light.addColorStop(0, 'rgba(255,255,255,0.22)');
  light.addColorStop(0.4, 'rgba(255,255,255,0)');
  light.addColorStop(1, 'rgba(90,60,20,0.06)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // The blue print, painted on its own layer, roughened, then laid down.
  const ink = document.createElement('canvas');
  ink.width = px;
  ink.height = ph;
  const ic = ink.getContext('2d');
  ic.setTransform(s, 0, 0, s, 0, 0);
  paintInk(ic, card);
  ic.setTransform(1, 0, 0, 1, 0, 0);
  ic.globalCompositeOperation = 'destination-out';
  const tp = ic.createPattern(toothTile(), 'repeat');
  const grain = Math.max(1, px / 380);
  tp.setTransform?.(new DOMMatrix().scale(grain));
  ic.fillStyle = tp;
  ic.fillRect(0, 0, px, ph);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.96;
  ctx.drawImage(ink, 0, 0);
  ctx.globalAlpha = 1;

  // Serial number, stamped in red.
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.fillStyle = SERIAL_INK;
  ctx.globalAlpha = 0.88;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const serial = String(card.serial).padStart(6, '0');
  ctx.font = 'bold 4px "Courier New", ui-monospace, monospace';
  const adv = ctx.measureText('0').width + 0.32;
  let x = W - SIDE - adv * serial.length;
  for (const ch of serial) {
    ctx.fillText(ch, x, 126.3);
    x += adv;
  }
  ctx.font = 'bold 3px "Courier New", ui-monospace, monospace';
  ctx.fillText('No', W - SIDE - adv * serial.length - 5.2, 126.5);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return face;
}

// --- The view ---------------------------------------------------------------------

const columnsOf = (make) => Array.from({ length: 25 }, (_, i) => make(i)).join('');
const placeStyle = (i) => {
  const b = cell(i);
  return `left:${pct(b.x, W)};top:${pct(b.y, H)};width:${pct(b.w, W)};height:${pct(b.h, H)}`;
};

/**
 * A card on the page. A themed edition can pass its own `face` painter
 * (async (card, px) → canvas, using GEOMETRY) and a `name` for each number,
 * which screen readers hear in place of "B 12".
 */
export function createCardView(card, { interactive = false, onTap, onCancel, face = paintFace, name } = {}) {
  const root = document.createElement('div');
  root.className = 'card';
  const label = (i) =>
    i === FREE ? 'Free spot' : name ? name(card.numbers[i]) : `${letterOf(card.numbers[i])} ${card.numbers[i]}`;
  root.innerHTML = `<canvas class="card__canvas" aria-hidden="true"></canvas><div class="card__marks" aria-hidden="true"></div>${
    interactive
      ? `<div class="card__hits" role="group" aria-label="Bingo card">${columnsOf(
          (i) =>
            `<button type="button" class="card__hit" style="${placeStyle(i)}" data-i="${i}" aria-label="${label(i)}" aria-pressed="false"></button>`,
        )}</div>`
      : ''
  }`;
  const canvas = root.querySelector('canvas');
  const layer = root.querySelector('.card__marks');
  const hits = [...root.querySelectorAll('.card__hit')];
  const marks = card.marks.slice();
  const markEls = new Array(25).fill(null);
  let px = 0; // card width in device pixels
  let painted = false;
  let paintToken = 0;
  let markReady;
  const ready = new Promise((r) => (markReady = r));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const markPx = () => Math.round((MARK * px) / W);
  const markOf = (i, colorId) => {
    const seed = hash(card.serial, i, colorId);
    return { seed, j: markJitter(seed), color: dauberById(colorId).color };
  };
  // Position, in % of the card, of a square `size` units across centred at (x, y).
  const square = (x, y, size) =>
    `left:${pct(x - size / 2, W)};top:${pct(y - size / 2, H)};width:${pct(size, W)};height:${pct(size, H)}`;

  /**
   * Each daub is its own small canvas laid over the cell and multiplied onto
   * the print, so adding or wiping one never touches the rest of the card,
   * and its stamp animation runs on the compositor.
   */
  function placeMark(i, colorId) {
    markEls[i]?.remove();
    markEls[i] = null;
    if (!colorId || !px) return null;
    const { seed, j, color } = markOf(i, colorId);
    const b = cell(i);
    const src = splotch(color, seed, markPx());
    const el = document.createElement('canvas');
    el.className = 'card__mark';
    el.width = src.width;
    el.height = src.height;
    el.getContext('2d').drawImage(src, 0, 0);
    el.style.cssText = square(b.cx + j.dx * MARK, b.cy + j.dy * MARK, MARK);
    el.style.transform = `rotate(${j.rot.toFixed(1)}deg) scale(${j.scale.toFixed(3)})`;
    layer.append(el);
    markEls[i] = el;
    return el;
  }

  const fx = (cls, style) => {
    const el = document.createElement('i');
    el.className = cls;
    el.style.cssText = style;
    layer.append(el);
    return el;
  };
  const removeWhenDone = (anim, el) => {
    anim.onfinish = () => el.remove();
    anim.oncancel = () => el.remove();
  };

  function stamp(i, colorId) {
    const el = placeMark(i, colorId);
    if (!el || reduceMotion) return;
    const base = el.style.transform;
    // Lands big, squashes past, settles.
    el.animate(
      [
        { transform: `${base} scale(1.32)`, opacity: 0 },
        { transform: `${base} scale(1.24)`, opacity: 1, offset: 0.12 },
        { transform: `${base} scale(0.9)`, offset: 0.4 },
        { transform: base },
      ],
      { duration: 280, easing: 'ease-out' },
    );
    const { j, color } = markOf(i, colorId);
    const b = cell(i);
    const cx = b.cx + j.dx * MARK;
    const cy = b.cy + j.dy * MARK;
    // Wet shine that fades as the ink dries.
    const sheen = fx('card__sheen', square(cx - MARK * 0.13, cy - MARK * 0.15, MARK * 0.6));
    removeWhenDone(
      sheen.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.12 }, { opacity: 0 }], {
        duration: 1000,
        easing: 'ease-out',
      }),
      sheen,
    );
    // Ink flicked out by the press.
    const u = root.clientWidth / W;
    const rnd = seeded(hash(card.serial, i, colorId, 'drops'));
    const n = 4 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU;
      const size = (0.7 + rnd() * 1.4) * 1.2;
      const r0 = MARK * 0.32 * u;
      const r1 = MARK * (0.44 + rnd() * 0.3) * u;
      const drop = fx('card__drop', `${square(b.cx, b.cy, size)};background:${color}`);
      removeWhenDone(
        drop.animate(
          [
            { transform: `translate(${Math.cos(a) * r0}px, ${Math.sin(a) * r0}px)`, opacity: 1 },
            { transform: `translate(${Math.cos(a) * r1}px, ${Math.sin(a) * r1}px) scale(0.5)`, opacity: 0 },
          ],
          { duration: 300, easing: 'cubic-bezier(.2,.8,.4,1)' },
        ),
        drop,
      );
    }
  }

  function lift(i) {
    const el = markEls[i];
    markEls[i] = null;
    if (!el) return;
    if (reduceMotion) return el.remove();
    const base = el.style.transform;
    removeWhenDone(
      el.animate(
        [
          { transform: base, opacity: 1 },
          { transform: `${base} scale(1.12)`, opacity: 0 },
        ],
        { duration: 240, easing: 'ease-in', fill: 'forwards' },
      ),
      el,
    );
  }

  // Paint the face (again, at a new size). The old one stretches meanwhile.
  async function paint() {
    const w = root.clientWidth;
    if (!w) return;
    const next = Math.round(w * dpr());
    if (next === px && painted) return;
    const token = ++paintToken;
    const f = await face(card, next);
    if (token !== paintToken) return;
    const sizeChanged = next !== px;
    px = next;
    canvas.width = f.width;
    canvas.height = f.height;
    canvas.getContext('2d').drawImage(f, 0, 0);
    root.style.setProperty('--u', `${w / 100}px`);
    if (sizeChanged) for (let i = 0; i < 25; i++) placeMark(i, marks[i]);
    painted = true;
    root.classList.add('is-ready');
    markReady();
  }
  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(paint, painted ? 150 : 0);
  }).observe(root);

  if (interactive) {
    const hitLayer = root.querySelector('.card__hits');
    const pressed = new Map(); // pointerId → cell daubed on press
    const pending = new Set(); // cells daubed on press whose click hasn't arrived
    hitLayer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const btn = e.target.closest('.card__hit');
      if (!btn) return;
      const i = +btn.dataset.i;
      // Ink goes down the instant the dauber touches the paper.
      if (!marks[i]) {
        pending.add(i);
        pressed.set(e.pointerId, i);
        onTap?.(i, btn);
      }
    });
    hitLayer.addEventListener('pointercancel', (e) => {
      // The page scrolled instead: lift the mark again.
      const i = pressed.get(e.pointerId);
      pressed.delete(e.pointerId);
      if (i == null || !pending.has(i)) return;
      pending.delete(i);
      onCancel?.(i);
    });
    hitLayer.addEventListener('pointerup', (e) => pressed.delete(e.pointerId));
    hitLayer.addEventListener('click', (e) => {
      const btn = e.target.closest('.card__hit');
      if (!btn) return;
      const i = +btn.dataset.i;
      if (e.detail !== 0 && pending.has(i)) {
        pending.delete(i);
        return;
      }
      pending.delete(i);
      onTap?.(i, btn);
    });
    hitLayer.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function syncHit(i) {
    const h = hits[i];
    if (!h) return;
    h.setAttribute('aria-pressed', String(marks[i] > 0));
    h.setAttribute('aria-label', label(i) + (marks[i] > 0 ? ', daubed' : ''));
  }
  hits.forEach((_, i) => syncHit(i));

  return {
    el: root,
    marks,
    ready,
    setMark(i, colorId, { animate = false } = {}) {
      marks[i] = colorId;
      syncHit(i);
      if (!animate) placeMark(i, colorId);
      else if (colorId) stamp(i, colorId);
      else lift(i);
    },
    /** Paint this colour's marks for every open cell ahead of time. */
    prewarm(colorId) {
      const todo = [];
      for (let i = 0; i < 25; i++) if (!marks[i]) todo.push(i);
      const step = (deadline) => {
        if (!px) return setTimeout(() => step(), 200);
        const until = performance.now() + (deadline?.timeRemaining ? Math.min(10, deadline.timeRemaining()) : 6);
        do {
          const i = todo.shift();
          const { seed, color } = markOf(i, colorId);
          splotch(color, seed, markPx());
        } while (todo.length && performance.now() < until);
        if (todo.length) idle(step);
      };
      if (todo.length) idle(step);
    },
    /** Sparkle along the cells of a freshly finished line. */
    celebrate(cells) {
      if (reduceMotion) return;
      cells.forEach((ci, k) => {
        const b = cell(ci);
        const spark = fx('card__spark', square(b.cx + b.w * 0.26, b.cy - b.h * 0.26, 13));
        removeWhenDone(
          spark.animate(
            [
              { transform: 'scale(0) rotate(0deg)', opacity: 1 },
              { transform: 'scale(1) rotate(50deg)', opacity: 1, offset: 0.5 },
              { transform: 'scale(0) rotate(95deg)', opacity: 0.6 },
            ],
            { duration: 520, delay: k * 70, easing: 'ease-in-out', fill: 'backwards' },
          ),
          spark,
        );
      });
    },
    /** Decorate cells after a card check. */
    showCheck(result) {
      const winCells = new Set(result.wins.flatMap((w) => w.cells));
      const notes = document.createElement('div');
      notes.className = 'card__notes';
      notes.setAttribute('aria-hidden', 'true');
      notes.innerHTML = columnsOf(
        (i) =>
          `<i class="card__note${winCells.has(i) ? ' is-win' : ''}" data-status="${result.cells[i].status}" style="${placeStyle(i)}"></i>`,
      );
      root.querySelector('.card__notes')?.remove();
      root.append(notes);
    },
  };
}

const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 16));
