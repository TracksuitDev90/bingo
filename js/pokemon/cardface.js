// The Pokémon edition's card face, painted once like the classic one (see
// js/cardview.js, which handles the daubs, taps and checks on top of it).
//
// It's dressed as a trading card: a yellow border, a blue holo header with
// a Poké Ball for each column, the Pokémon on the card in their columns,
// Pikachu on the free spot and the route and serial number along the foot.
// It uses the classic card's grid, so daubs land in exactly the same places.

import { FREE, LETTERS } from '../bingo.js';
import { GEOMETRY } from '../cardview.js';
import { pokemonOf, nameOf, PIKACHU } from './dex.js';
import { loadSprites, drawSprite } from './sprites.js';
import { BALL_TYPES, paintEmblem, fitText } from './pokeballs.js';

const { W, H, SIDE, GRID_TOP, GRID_H, COL_W, colX, cell } = GEOMETRY;
export const BLUE = '#2556a8';
const INK = '#232733';
const SERIAL = '#c8281e';

let fontsReady;
export function loadFonts() {
  fontsReady ??= Promise.race([
    Promise.all(
      ['40px "Luckiest Guy"', '600 40px "Pixelify Sans"', '40px "Press Start 2P"'].map((f) =>
        document.fonts.load(f).catch(() => {}),
      ),
    ),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
  return fontsReady;
}

const rgba = (hex, a) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;

function rounded(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A lightning bolt filling the box (x, y, w, h). */
export function bolt(g, x, y, w, h) {
  const pts = [
    [0.62, 0],
    [0.12, 0.56],
    [0.44, 0.56],
    [0.3, 1],
    [0.9, 0.38],
    [0.56, 0.38],
    [0.78, 0],
  ];
  g.beginPath();
  pts.forEach(([u, v], i) => (i ? g.lineTo(x + u * w, y + v * h) : g.moveTo(x + u * w, y + v * h)));
  g.closePath();
}

function paintFrame(g) {
  // Yellow trading-card border.
  rounded(g, 0.4, 0.4, W - 0.8, H - 0.8, 4.2);
  const frame = g.createLinearGradient(0, 0, W * 0.6, H);
  frame.addColorStop(0, '#ffe766');
  frame.addColorStop(0.45, '#f8cd1e');
  frame.addColorStop(1, '#eeb40b');
  g.fillStyle = frame;
  g.fill();
  g.lineWidth = 0.35;
  g.strokeStyle = 'rgba(140,90,0,0.6)';
  g.stroke();

  // The card's face, with a couple of faint bolts in the background.
  rounded(g, 2.5, 2.5, W - 5, H - 5, 2.6);
  const panel = g.createLinearGradient(0, 2.5, 0, H - 2.5);
  panel.addColorStop(0, '#fffdf4');
  panel.addColorStop(1, '#fbf0cf');
  g.fillStyle = panel;
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = 'rgba(255,203,5,0.16)';
  bolt(g, -14, 30, 60, 84);
  g.fill();
  bolt(g, 58, 52, 56, 80);
  g.fill();
  g.restore();
  rounded(g, 2.5, 2.5, W - 5, H - 5, 2.6);
  g.lineWidth = 0.3;
  g.strokeStyle = 'rgba(150,100,0,0.5)';
  g.stroke();
}

function paintHeader(g) {
  const x = SIDE;
  const y = 4.6;
  const w = W - 2 * SIDE;
  const h = 21;
  rounded(g, x, y, w, h, 2);
  const plate = g.createLinearGradient(0, y, 0, y + h);
  plate.addColorStop(0, '#3d7fd8');
  plate.addColorStop(0.55, '#2a5db0');
  plate.addColorStop(1, '#1d4590');
  g.fillStyle = plate;
  g.fill();
  // A holo sheen across the plate.
  g.save();
  g.clip();
  const holo = g.createLinearGradient(x, y, x + w, y + h);
  ['#ff7ad9', '#7af3ff', '#fff27a', '#8affa8', '#ff7ad9'].forEach((c, i) => holo.addColorStop(i / 4, rgba(c, 0.2)));
  g.fillStyle = holo;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(x, y, w, h * 0.42);
  g.restore();
  for (let c = 0; c < 5; c++) paintEmblem(g, colX(c) + COL_W / 2, y + h / 2, 8.1, c, LETTERS[c]);

  // Lightning rule under the header, like Pikachu's tail.
  const top = 26.4;
  const bot = 29.6;
  const step = 3.2;
  g.beginPath();
  g.moveTo(x, bot);
  for (let i = 0, xx = x; xx < x + w; i++, xx += step) g.lineTo(Math.min(x + w, xx + step), i % 2 ? bot : top);
  g.lineTo(x + w, bot);
  g.closePath();
  g.fillStyle = '#ffcb05';
  g.fill();
  g.lineWidth = 0.35;
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(80,50,0,0.7)';
  g.stroke();
}

function paintFree(g, b) {
  const fw = b.w * 0.94;
  const fh = b.h * 0.92;
  const x = b.cx - fw / 2;
  const y = b.cy - fh / 2;
  rounded(g, x, y, fw, fh, 1.4);
  const sky = g.createRadialGradient(b.cx, b.cy - 1, 1, b.cx, b.cy, fh * 0.75);
  sky.addColorStop(0, '#4b8ee6');
  sky.addColorStop(1, BLUE);
  g.fillStyle = sky;
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = '#ffcb05';
  bolt(g, b.cx - fw * 0.42, y - 0.5, fw * 0.84, fh * 0.88);
  g.fill();
  g.restore();
  drawSprite(g, PIKACHU, x + 1, y + 0.6, fw - 2, fh * 0.72, { ground: true });
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '4.6px "Luckiest Guy", "Titan One", sans-serif';
  g.lineJoin = 'round';
  g.lineWidth = 1.1;
  g.strokeStyle = '#1b3a78';
  g.strokeText('FREE', b.cx, y + fh - 2.6);
  g.fillStyle = '#ffcb05';
  g.fillText('FREE', b.cx, y + fh - 2.6);
}

function paintGrid(g, card) {
  for (let c = 0; c < 5; c++) {
    const cap = BALL_TYPES[c].cap;
    rounded(g, colX(c), GRID_TOP, COL_W, GRID_H, 1.3);
    g.fillStyle = '#ffffff';
    g.fill();
    g.fillStyle = rgba(cap, 0.08);
    g.fill();
    g.lineWidth = 0.5;
    g.strokeStyle = rgba(cap, 0.55);
    g.stroke();
  }
  for (let i = 0; i < 25; i++) {
    const b = cell(i);
    const cap = BALL_TYPES[i % 5].cap;
    if (i < 20) {
      g.strokeStyle = rgba(cap, 0.28);
      g.lineWidth = 0.3;
      g.beginPath();
      g.moveTo(b.x + 1.2, b.y + b.h);
      g.lineTo(b.x + b.w - 1.2, b.y + b.h);
      g.stroke();
    }
    if (i === FREE) {
      paintFree(g, b);
      continue;
    }
    const dex = pokemonOf(card.route, card.numbers[i]);
    drawSprite(g, dex, b.x + 0.8, b.y + 0.7, b.w - 1.6, b.h * 0.7, { ground: true });
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(
      g,
      nameOf(dex),
      b.cx,
      b.y + b.h - 2.55,
      2.7,
      b.w - 1.1,
      '600 {size} "Pixelify Sans", "Fredoka", sans-serif',
    );
  }
}

function paintFooter(g, card) {
  const y = 126.2;
  paintEmblem(g, SIDE + 1.9, y, 1.9, 0);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = '4.2px "Luckiest Guy", "Titan One", sans-serif';
  g.fillStyle = BLUE;
  g.fillText('POKé BINGO', SIDE + 4.8, y + 0.35);
  g.textAlign = 'right';
  g.font = '2.3px "Press Start 2P", monospace';
  g.fillStyle = SERIAL;
  const serial = `No${String(card.serial).padStart(6, '0')}`;
  g.fillText(serial, W - SIDE, y + 0.2);
  const sw = g.measureText(serial).width;
  g.fillStyle = INK;
  g.fillText(`ROUTE ${card.route}`, W - SIDE - sw - 2.6, y + 0.2);
}

/** Paint a Pokémon card `px` device pixels wide. */
export async function paintPokemonFace(card, px) {
  await Promise.all([loadFonts(), loadSprites()]);
  const s = px / W;
  const face = document.createElement('canvas');
  face.width = px;
  face.height = Math.round(px * (H / W));
  const g = face.getContext('2d');
  g.setTransform(s, 0, 0, s, 0, 0);
  paintFrame(g);
  paintHeader(g);
  paintGrid(g, card);
  paintFooter(g, card);
  return face;
}
