// Sealed card links.
//
// A card and its daubs are packed into 30 bytes and sealed with AES-256-GCM.
// The link reveals nothing about the card, and any edit to it (a forged
// daub, a swapped number) breaks the GCM tag so the blower rejects it.
//
// Honest caveat: this is a static site with no server, so the key has to
// ship with the page. It stops anyone reading or hand-editing a link, but
// someone who digs the key out of this file could mint their own. For a game
// night with friends that's the right trade-off; a server would be needed
// for anything stronger.
//
// Layout (plaintext, 30 bytes):
//   0–3   serial            uint32
//   4–7   dealt at          uint32, unix seconds
//   8–19  24 numbers        4 bits each: offset within the column (0–14)
//   20–29 25 daubs          3 bits each: 0 = clean, 1–7 = dauber colour
// Token: base64url( version · iv[12] · ciphertext+tag[46] ) → 79 characters.

import { FREE, colStart, isValidCard } from './bingo.js';

const VERSION = 1;
const KEY = new Uint8Array([
  0x56, 0x38, 0xd7, 0x1b, 0x6c, 0x5e, 0x8c, 0x4a, 0x00, 0x4f, 0xd2, 0xf6, 0xfb, 0x69, 0x99, 0x9f, 0xbb, 0xba, 0xae,
  0xa6, 0xd3, 0x73, 0xbc, 0x83, 0x82, 0x29, 0xa5, 0x2d, 0x70, 0xfc, 0x56, 0xcf,
]);
const AAD = new TextEncoder().encode('bingo-card/v1');

let keyPromise;
const getKey = () =>
  (keyPromise ??= crypto.subtle.importKey('raw', KEY, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']));

const cellOrder = [...Array(25).keys()].filter((i) => i !== FREE);

function pack({ serial, created, numbers, marks }) {
  const out = new Uint8Array(30);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, serial >>> 0);
  dv.setUint32(4, created >>> 0);
  cellOrder.forEach((cell, k) => {
    const offset = numbers[cell] - colStart(cell % 5);
    out[8 + (k >> 1)] |= k & 1 ? offset : offset << 4;
  });
  // 25 × 3-bit daub colours as a little bit-stream.
  let bit = 0;
  for (let i = 0; i < 25; i++) {
    const v = marks[i] & 7;
    for (let b = 0; b < 3; b++, bit++) if (v & (1 << b)) out[20 + (bit >> 3)] |= 1 << (bit & 7);
  }
  return out;
}

function unpack(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numbers = new Array(25).fill(0);
  cellOrder.forEach((cell, k) => {
    const byte = bytes[8 + (k >> 1)];
    const offset = k & 1 ? byte & 15 : byte >> 4;
    numbers[cell] = colStart(cell % 5) + offset;
  });
  const marks = new Array(25).fill(0);
  let bit = 0;
  for (let i = 0; i < 25; i++) {
    for (let b = 0; b < 3; b++, bit++) if (bytes[20 + (bit >> 3)] & (1 << (bit & 7))) marks[i] |= 1 << b;
  }
  return { serial: dv.getUint32(0), created: dv.getUint32(4), numbers, marks };
}

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
function unb64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Seal a card + daubs into an opaque, tamper-evident token. */
export async function sealCard(card) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, await getKey(), pack(card)),
  );
  const out = new Uint8Array(1 + iv.length + ct.length);
  out[0] = VERSION;
  out.set(iv, 1);
  out.set(ct, 13);
  return b64url(out);
}

export class SealError extends Error {}

/** Open a token. Throws SealError if it's damaged, edited or not a card. */
export async function openCard(token) {
  let bytes;
  try {
    bytes = unb64url(token);
  } catch {
    throw new SealError("That doesn't look like a card link.");
  }
  if (bytes.length !== 1 + 12 + 30 + 16)
    throw new SealError('That link is incomplete — make sure the whole thing was copied.');
  if (bytes[0] !== VERSION) throw new SealError('That card was made by a different version of the game.');
  let plain;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.subarray(1, 13), additionalData: AAD },
        await getKey(),
        bytes.subarray(13),
      ),
    );
  } catch {
    throw new SealError('This link has been altered or damaged. The seal is broken.');
  }
  const card = unpack(plain);
  if (!isValidCard(card.numbers)) throw new SealError('This card is not valid.');
  return card;
}

/** Pull a token out of whatever was pasted: a full link, "#s=…", or the bare token. */
export function extractToken(text) {
  const s = String(text || '').trim();
  const m = s.match(/(?:[#&?](?:s|check)=)([A-Za-z0-9_-]{60,})/) || s.match(/^([A-Za-z0-9_-]{60,})$/);
  return m ? m[1] : null;
}

/** Shareable link that opens the sealed card. */
export function shareUrl(token, base = location.href) {
  return new URL(`card.html#s=${token}`, base).href;
}
