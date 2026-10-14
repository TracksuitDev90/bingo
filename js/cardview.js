// Renders a paper bingo card. Used for the player's own card, for a shared
// card opened from a link, and inside the blower's card check.
//
// The card is built from stacked layers that share one grid, so they line up
// exactly at any size:
//   paper  – cream stock with a deckled edge
//   ink    – everything printed in blue, run through a hand-painted filter
//   marks  – dauber splotches (multiply-blended over the ink)
//   hits   – invisible buttons that take the taps

import { FREE, letterOf } from './bingo.js';
import { paintSplotch, dauberById, markJitter } from './dauber.js';
import { hash } from './rng.js';

const SVG_DEFS = `
<svg class="svg-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">
  <filter id="f-paint" x="-3%" y="-3%" width="106%" height="106%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="11" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="wobble"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="4" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -4 0 0 0 3.55" result="tooth"/>
    <feComposite in="wobble" in2="tooth" operator="in"/>
  </filter>
  <filter id="f-deckle" x="-4%" y="-4%" width="108%" height="108%">
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" seed="5" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>`;

export function ensureDefs() {
  if (document.querySelector('.svg-defs')) return;
  document.body.insertAdjacentHTML('afterbegin', SVG_DEFS);
}

const columns = (cell) =>
  [0, 1, 2, 3, 4]
    .map((col) => `<div class="card__col">${[0, 1, 2, 3, 4].map((row) => cell(row * 5 + col, row)).join('')}</div>`)
    .join('');

export function createCardView(card, { interactive = false, onTap } = {}) {
  ensureDefs();
  const root = document.createElement('div');
  root.className = 'card';
  const label = (i) => (i === FREE ? 'Free spot' : `${letterOf(card.numbers[i])} ${card.numbers[i]}`);

  root.innerHTML = `
    <div class="card__paper"></div>
    <div class="card__ink" aria-hidden="true">
      <div class="card__title">${[...'bingo'].map((l) => `<span>${l}</span>`).join('')}</div>
      <div class="card__band"></div>
      <div class="card__grid">${columns(
        (i, row) =>
          `<div class="card__cell">${
            i === FREE
              ? '<div class="card__free"><span>FREE</span><span>SPOT</span></div>'
              : `<span class="card__num">${card.numbers[i]}</span>`
          }${row < 4 ? '<i class="card__bar"></i>' : ''}</div>`,
      )}</div>
      <div class="card__foot"><span class="card__brand">Fireside Bingo</span><i class="card__dots"></i></div>
    </div>
    <div class="card__serial">${String(card.serial).padStart(6, '0')}</div>
    <div class="card__grid card__marks" aria-hidden="true">${columns((i) => `<div class="card__cell"><div class="card__slot" data-i="${i}"></div></div>`)}</div>
    ${
      interactive
        ? `<div class="card__grid card__hits" role="group" aria-label="Bingo card">${columns(
            (i) =>
              `<div class="card__cell"><button type="button" class="card__hit" data-i="${i}" aria-label="${label(i)}" aria-pressed="false"></button></div>`,
          )}</div>`
        : ''
    }`;

  const slots = [...root.querySelectorAll('.card__slot')].sort((a, b) => a.dataset.i - b.dataset.i);
  const hits = [...root.querySelectorAll('.card__hit')].sort((a, b) => a.dataset.i - b.dataset.i);
  const marks = card.marks.slice();
  let markSize = 0;

  function paint(i, animate) {
    const slot = slots[i];
    slot.querySelector('.daub')?.remove();
    const colorId = marks[i];
    hits[i]?.setAttribute('aria-pressed', String(colorId > 0));
    hits[i]?.setAttribute('aria-label', label(i) + (colorId > 0 ? ', daubed' : ''));
    if (!colorId || !markSize) return;
    const seed = hash(card.serial, i, colorId);
    const j = markJitter(seed);
    const daub = document.createElement('div');
    daub.className = 'daub' + (animate ? ' daub--fresh' : '');
    daub.style.setProperty('--dx', `${j.dx * 100}%`);
    daub.style.setProperty('--dy', `${j.dy * 100}%`);
    daub.style.setProperty('--rot', `${j.rot}deg`);
    daub.style.setProperty('--s', j.scale);
    const canvas = document.createElement('canvas');
    paintSplotch(canvas, { color: dauberById(colorId).color, seed, size: markSize });
    daub.append(canvas);
    slot.append(daub);
    if (animate) {
      const sheen = document.createElement('i');
      sheen.className = 'daub-sheen';
      sheen.addEventListener('animationend', () => sheen.remove());
      slot.append(sheen);
    }
  }

  function measure() {
    const r = slots[0].getBoundingClientRect();
    // offsetWidth/Height ignore the card's tilt; fall back to the rect.
    const w = slots[0].offsetWidth || r.width;
    const h = slots[0].offsetHeight || r.height;
    const next = Math.round(Math.min(w, h) * 1.55);
    if (next && next !== markSize) {
      markSize = next;
      for (let i = 0; i < 25; i++) paint(i, false);
    }
  }
  new ResizeObserver(measure).observe(root);
  requestAnimationFrame(measure);

  if (interactive) {
    root.querySelector('.card__hits').addEventListener('click', (e) => {
      const btn = e.target.closest('.card__hit');
      if (btn) onTap?.(+btn.dataset.i, btn);
    });
  }

  return {
    el: root,
    marks,
    setMark(i, colorId, { animate = false } = {}) {
      marks[i] = colorId;
      if (!colorId && animate) {
        const old = slots[i].querySelector('.daub');
        if (old) {
          old.classList.add('daub--lift');
          hits[i]?.setAttribute('aria-pressed', 'false');
          setTimeout(() => marks[i] === 0 && old.remove(), 260);
          return;
        }
      }
      paint(i, animate);
    },
    /** Decorate cells after a card check. */
    showCheck(result) {
      const winCells = new Set(result.wins.flatMap((w) => w.cells));
      result.cells.forEach((c, i) => {
        slots[i].dataset.status = c.status;
        slots[i].classList.toggle('is-win', winCells.has(i));
      });
    },
  };
}
