// Pokémon sprites from the packed sheet (assets/pokemon/sprites.webp).
//
// The sprites are pixel art, which goes blurry when a browser scales it by
// an odd amount and lumpy when it doesn't smooth. So each sprite is first
// blown up by a whole number with no smoothing (every pixel stays a crisp
// square), then scaled smoothly to its final size, which is never far off.
// Those blown-up copies are cached, as are their silhouettes.

import { RECTS } from './pokedex-data.js';

let sheet = null;
let loading;
/** Resolves once the sprite sheet has loaded (or failed to). */
export function loadSprites() {
  loading ??= new Promise((resolve) => {
    const img = new Image();
    img.src = new URL('../../assets/pokemon/sprites.webp', import.meta.url).href;
    img
      .decode()
      .then(() => {
        sheet = img;
        resolve(img);
      })
      .catch(() => resolve(null));
  });
  return loading;
}

export const rectOf = (dex) => RECTS.subarray((dex - 1) * 4, dex * 4);

const MAX_PX = 512;
const cache = new Map();
function crisp(dex, k, tint) {
  const key = `${dex}|${k}|${tint || ''}`;
  let c = cache.get(key);
  if (c) return c;
  const [x, y, w, h] = rectOf(dex);
  c = document.createElement('canvas');
  c.width = w * k;
  c.height = h * k;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(sheet, x, y, w, h, 0, 0, w * k, h * k);
  if (tint) {
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
  }
  cache.set(key, c);
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return c;
}

/**
 * Draw Pokémon `dex` as large as fits in the box (x, y, w, h), centred and
 * standing on the box's bottom edge if `ground` is set, in the context's
 * current transform. `tint` paints a solid silhouette instead. Does nothing
 * until the sheet has loaded.
 */
export function drawSprite(ctx, dex, x, y, w, h, { tint, ground = false, maxScale = Infinity } = {}) {
  if (!sheet) return;
  const [, , sw, sh] = rectOf(dex);
  const s = Math.min(w / sw, h / sh, maxScale);
  const dw = sw * s;
  const dh = sh * s;
  const m = ctx.getTransform();
  const device = s * Math.hypot(m.a, m.b);
  const k = Math.max(1, Math.min(Math.ceil(device), Math.floor(MAX_PX / Math.max(sw, sh))));
  const src = crisp(dex, k, tint);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x + (w - dw) / 2, ground ? y + h - dh : y + (h - dh) / 2, dw, dh);
  ctx.imageSmoothingEnabled = smooth;
}

/** A sprite on its own canvas, `size` CSS px square (for HTML around the page). */
export function spriteCanvas(dex, size, { tint, el = document.createElement('canvas') } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.max(1, Math.round(size * dpr));
  el.width = el.height = px;
  el.style.width = el.style.height = `${size}px`;
  const g = el.getContext('2d');
  g.clearRect(0, 0, px, px);
  drawSprite(g, dex, 0, 0, px, px, { tint });
  return el;
}
