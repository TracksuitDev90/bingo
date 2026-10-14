// Randomness.
//
// Everything that affects the game (which numbers go on a card, which ball
// comes out of the blower) uses the browser's cryptographic RNG with
// rejection sampling, so every outcome is exactly equally likely: no modulo
// bias, no Math.random patterns, nothing a player could predict.
//
// The seeded PRNG at the bottom is only for looks (the wobble of an ink
// splotch), so the same mark redraws identically after a reload.

const U32 = 2 ** 32;
const word = new Uint32Array(1);

/** Uniform integer in [0, n). */
export function randomInt(n) {
  if (!Number.isInteger(n) || n <= 0 || n > U32) throw new RangeError(`randomInt: bad bound ${n}`);
  // Largest multiple of n that fits in 32 bits; anything above it is rejected
  // so every residue has the same number of preimages.
  const limit = U32 - (U32 % n);
  let x;
  do {
    crypto.getRandomValues(word);
    x = word[0];
  } while (x >= limit);
  return x % n;
}

/** Unbiased Fisher–Yates shuffle, in place. */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** k distinct items drawn uniformly from pool, in random order. */
export function sample(pool, k) {
  const a = pool.slice();
  for (let i = 0; i < k; i++) {
    const j = i + randomInt(a.length - i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

/** Deterministic PRNG (mulberry32) for cosmetic jitter only. */
export function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / U32;
  };
}

/** Small integer hash for building cosmetic seeds. */
export function hash(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x9e37;
  }
  return h >>> 0;
}
