// The rules: classic 75-ball bingo.
//
//   B 1–15 · I 16–30 · N 31–45 · G 46–60 · O 61–75, free spot in the middle.
//
// The blower draws from exactly the same 75 numbers that cards are printed
// from, so every card can always reach bingo, whichever device it lives on.
// Cells are stored row-major (index = row * 5 + col); index 12 is the free spot.

import { randomInt, sample } from './rng.js?v=7096e9e1';

export const LETTERS = ['B', 'I', 'N', 'G', 'O'];
export const BALLS = 75;
export const FREE = 12;
export const colStart = (col) => col * 15 + 1;
export const letterOf = (n) => LETTERS[Math.floor((n - 1) / 15)];
export const columnOf = (n) => Math.floor((n - 1) / 15);
export const callName = (n) => `${letterOf(n)}-${n}`;

/**
 * Deal a fresh card. Each column gets distinct numbers drawn uniformly from
 * its own 15, in random order, so there are about 5.5 × 10^26 possible cards:
 * every deal is effectively one of a kind.
 */
export function dealCard() {
  const numbers = new Array(25).fill(0);
  for (let col = 0; col < 5; col++) {
    const range = Array.from({ length: 15 }, (_, i) => colStart(col) + i);
    const picks = sample(range, col === 2 ? 4 : 5);
    for (let row = 0, k = 0; row < 5; row++) {
      const i = row * 5 + col;
      if (i === FREE) continue;
      numbers[i] = picks[k++];
    }
  }
  return {
    serial: 100000 + randomInt(900000),
    created: Math.floor(Date.now() / 1000),
    numbers,
    marks: new Array(25).fill(0), // 0 = clean, 1–7 = dauber colour id
  };
}

/** True if the numbers form a legal card. */
export function isValidCard(numbers) {
  if (!Array.isArray(numbers) || numbers.length !== 25) return false;
  for (let col = 0; col < 5; col++) {
    const seen = new Set();
    for (let row = 0; row < 5; row++) {
      const i = row * 5 + col;
      const n = numbers[i];
      if (i === FREE) {
        if (n !== 0) return false;
        continue;
      }
      if (!Number.isInteger(n) || columnOf(n) !== col || n < 1 || n > BALLS || seen.has(n)) return false;
      seen.add(n);
    }
  }
  return true;
}

// --- Winning patterns -------------------------------------------------------

const rows = [0, 1, 2, 3, 4].map((r) => ({ label: `Row ${r + 1}`, cells: [0, 1, 2, 3, 4].map((c) => r * 5 + c) }));
const cols = [0, 1, 2, 3, 4].map((c) => ({
  label: `Column ${LETTERS[c]}`,
  cells: [0, 1, 2, 3, 4].map((r) => r * 5 + c),
}));
const diags = [
  { label: 'Diagonal ↘', cells: [0, 6, 12, 18, 24] },
  { label: 'Diagonal ↙', cells: [4, 8, 12, 16, 20] },
];

export const PATTERNS = {
  line: { name: 'Any Line', blurb: 'Any row, column or diagonal', sets: [...rows, ...cols, ...diags] },
  corners: {
    name: 'Four Corners',
    blurb: 'All four corners',
    sets: [{ label: 'Four corners', cells: [0, 4, 20, 24] }],
  },
  x: { name: 'The X', blurb: 'Both diagonals', sets: [{ label: 'The X', cells: [0, 6, 12, 18, 24, 4, 8, 16, 20] }] },
  blackout: {
    name: 'Blackout',
    blurb: 'Every square on the card',
    sets: [{ label: 'Blackout', cells: [...Array(25).keys()] }],
  },
};

/**
 * Every pattern a card's daubs complete, whatever has been called. Used on
 * the player's side to cheer a finished line; only checkCard decides a win.
 */
export function completedSets(marks) {
  const on = (i) => i === FREE || marks[i] > 0;
  const out = [];
  for (const [key, p] of Object.entries(PATTERNS)) {
    for (const s of p.sets)
      if (s.cells.every(on)) out.push({ id: `${key}:${s.label}`, label: s.label, cells: s.cells });
  }
  return out;
}

/** Cells to light up in a small pattern diagram. */
export function patternPreview(key) {
  if (key === 'line') return [10, 11, 12, 13, 14];
  return PATTERNS[key].sets[0].cells;
}

/**
 * Verify a card against the numbers that have actually been called.
 *
 * A square only counts if the player daubed it AND its number has been
 * called (the free spot always counts). Daubs on uncalled numbers are
 * flagged, and a pattern the player completed on called numbers but forgot
 * to daub is reported as a "sleeper".
 */
export function checkCard(card, called, patternKey = 'line') {
  const calledSet = called instanceof Set ? called : new Set(called);
  const cells = card.numbers.map((n, i) => {
    const free = i === FREE;
    const marked = free || card.marks[i] > 0;
    const isCalled = free || calledSet.has(n);
    let status = 'open';
    if (free) status = 'free';
    else if (marked && isCalled) status = 'good';
    else if (marked) status = 'bad';
    else if (isCalled) status = 'missed';
    return { i, n, marked, called: isCalled, status };
  });
  const ok = (i) => cells[i].status === 'good' || cells[i].status === 'free';
  const reachable = (i) => cells[i].called;

  const sets = PATTERNS[patternKey].sets;
  const wins = sets.filter((s) => s.cells.every(ok));
  const sleepers = wins.length ? [] : sets.filter((s) => s.cells.every(reachable));

  // Closest pattern: fewest squares still needed (counting only good daubs).
  let closest = null;
  for (const s of sets) {
    const need = s.cells.filter((i) => !ok(i));
    if (!closest || need.length < closest.need.length) closest = { ...s, need };
  }

  return {
    cells,
    wins,
    sleepers,
    closest,
    badMarks: cells.filter((c) => c.status === 'bad'),
    missed: cells.filter((c) => c.status === 'missed'),
    bingo: wins.length > 0,
  };
}
