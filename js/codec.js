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
//
// Pokémon edition cards use version 2 and put the card's route (uint16) in
// the clear right after the version byte. The route is part of the GCM
// additional data, so it can't be changed either: ver · route[2] · iv · ct,
// 82 characters.

import { FREE, colStart, isValidCard } from './bingo.js?v=11e3ed33';

const FORMATS = {
  1: { aad: 'bingo-card/v1', route: false },
  2: { aad: 'bingo-card/pokemon-v1', route: true },
};
// A link from the other edition gets a helpful answer instead of "broken".
const ELSEWHERE = {
  1: "That's a classic Fireside Bingo card. Check it on the classic blower.",
  2: "That's a Pokémon Bingo card. Check it on the Pokémon blower.",
};
const KEY = new Uint8Array([
  0x56, 0x38, 0xd7, 0x1b, 0x6c, 0x5e, 0x8c, 0x4a, 0x00, 0x4f, 0xd2, 0xf6, 0xfb, 0x69, 0x99, 0x9f, 0xbb, 0xba, 0xae,
  0xa6, 0xd3, 0x73, 0xbc, 0x83, 0x82, 0x29, 0xa5, 0x2d, 0x70, 0xfc, 0x56, 0xcf,
]);

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

const PLAIN = 30;
const TAG = 16;
const headerSize = (version) => (FORMATS[version].route ? 3 : 1);
const additionalData = (version, header) =>
  new Uint8Array([...new TextEncoder().encode(FORMATS[version].aad), ...header.subarray(1)]);

async function seal(card, version) {
  const header = new Uint8Array(headerSize(version));
  header[0] = version;
  if (FORMATS[version].route) new DataView(header.buffer).setUint16(1, card.route);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(version, header) },
      await getKey(),
      pack(card),
    ),
  );
  const out = new Uint8Array(header.length + iv.length + ct.length);
  out.set(header);
  out.set(iv, header.length);
  out.set(ct, header.length + iv.length);
  return b64url(out);
}

export class SealError extends Error {}

async function open(token, version) {
  let bytes;
  try {
    bytes = unb64url(token);
  } catch {
    throw new SealError("That doesn't look like a card link.");
  }
  if (bytes[0] !== version && ELSEWHERE[bytes[0]]) throw new SealError(ELSEWHERE[bytes[0]]);
  const head = headerSize(version);
  if (bytes.length !== head + 12 + PLAIN + TAG)
    throw new SealError('That link is incomplete — make sure the whole thing was copied.');
  if (bytes[0] !== version) throw new SealError('That card was made by a different version of the game.');
  let plain;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: bytes.subarray(head, head + 12),
          additionalData: additionalData(version, bytes.subarray(0, head)),
        },
        await getKey(),
        bytes.subarray(head + 12),
      ),
    );
  } catch {
    throw new SealError('This link has been altered or damaged. The seal is broken.');
  }
  const card = unpack(plain);
  if (FORMATS[version].route) card.route = new DataView(bytes.buffer, bytes.byteOffset).getUint16(1);
  if (!isValidCard(card.numbers) || card.route === 0) throw new SealError('This card is not valid.');
  return card;
}

/** Seal a card + daubs into an opaque, tamper-evident token. */
export const sealCard = (card) => seal(card, 1);
/** Open a token. Throws SealError if it's damaged, edited or not a card. */
export const openCard = (token) => open(token, 1);
/** The same for Pokémon edition cards, which also carry `route`. */
export const sealPokemonCard = (card) => seal(card, 2);
export const openPokemonCard = (token) => open(token, 2);

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
