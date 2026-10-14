// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, shuffle, sample } from '../js/rng.js';
import { dealCard, isValidCard, checkCard, columnOf, FREE, PATTERNS } from '../js/bingo.js';
import { sealCard, openCard, extractToken, SealError } from '../js/codec.js';

test('randomInt is uniform (chi-squared)', () => {
  const n = 75,
    draws = 150000,
    counts = new Array(n).fill(0);
  for (let i = 0; i < draws; i++) counts[randomInt(n)]++;
  const e = draws / n;
  const chi = counts.reduce((s, c) => s + (c - e) ** 2 / e, 0);
  // 74 dof: p=0.001 critical value ≈ 117
  assert.ok(chi < 117, `chi² ${chi.toFixed(1)} too high`);
});

test('shuffle keeps every element', () => {
  const a = shuffle([...Array(75).keys()]);
  assert.deepEqual(
    [...a].sort((x, y) => x - y),
    [...Array(75).keys()],
  );
});

test('sample returns distinct items', () => {
  for (let t = 0; t < 200; t++) {
    const s = sample([...Array(15).keys()], 5);
    assert.equal(new Set(s).size, 5);
  }
});

test('dealt cards are always legal and match ball ranges', () => {
  for (let t = 0; t < 2000; t++) {
    const c = dealCard();
    assert.ok(isValidCard(c.numbers));
    assert.equal(c.numbers[FREE], 0);
    c.numbers.forEach((n, i) => i !== FREE && assert.equal(columnOf(n), i % 5));
  }
});

test('every number appears in every cell position equally often', () => {
  // Cell 0 (B column, top) should see each of 1–15 about equally.
  const counts = new Array(16).fill(0),
    deals = 30000;
  for (let t = 0; t < deals; t++) counts[dealCard().numbers[0]]++;
  const e = deals / 15;
  const chi = counts.slice(1).reduce((s, c) => s + (c - e) ** 2 / e, 0);
  assert.ok(chi < 36.1, `chi² ${chi.toFixed(1)}`); // 14 dof, p=0.001
});

test('cards are unique', () => {
  const seen = new Set();
  for (let t = 0; t < 20000; t++) seen.add(dealCard().numbers.join(','));
  assert.equal(seen.size, 20000);
});

test('every card can reach bingo once all 75 balls are called', () => {
  const all = Array.from({ length: 75 }, (_, i) => i + 1);
  for (let t = 0; t < 200; t++) {
    const c = dealCard();
    c.marks = c.marks.map(() => 1);
    for (const key of Object.keys(PATTERNS)) assert.ok(checkCard(c, all, key).bingo, key);
  }
});

test('checkCard: valid line, bad daubs, sleepers', () => {
  const c = dealCard();
  const row2 = [10, 11, 13, 14].map((i) => c.numbers[i]); // row 3 incl. free
  [10, 11, 13, 14].forEach((i) => (c.marks[i] = 1));
  let r = checkCard(c, row2, 'line');
  assert.ok(r.bingo);
  assert.equal(r.wins[0].label, 'Row 3');

  // Daub something that wasn't called → flagged, still bingo on row 3.
  c.marks[0] = 2;
  r = checkCard(c, row2, 'line');
  assert.ok(r.bingo);
  assert.equal(r.badMarks.length, 1);

  // Line daubed but one number not called → no bingo.
  r = checkCard(c, row2.slice(1), 'line');
  assert.ok(!r.bingo);
  assert.equal(r.closest.need.length, 1);

  // Called but not daubed → sleeper.
  const fresh = { ...c, marks: new Array(25).fill(0) };
  r = checkCard(fresh, row2, 'line');
  assert.ok(!r.bingo);
  assert.equal(r.sleepers[0].label, 'Row 3');
});

test('sealed links round-trip and reject tampering', async () => {
  for (let t = 0; t < 50; t++) {
    const c = dealCard();
    c.marks = c.marks.map(() => randomInt(8));
    const token = await sealCard(c);
    assert.equal(token.length, 79);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    const back = await openCard(token);
    assert.deepEqual(back.numbers, c.numbers);
    assert.deepEqual(back.marks, c.marks);
    assert.equal(back.serial, c.serial);
    assert.equal(back.created, c.created);
  }
  const token = await sealCard(dealCard());
  const flip = token.slice(0, 40) + (token[40] === 'A' ? 'B' : 'A') + token.slice(41);
  await assert.rejects(openCard(flip), SealError);
  await assert.rejects(openCard(token.slice(0, 70)), SealError);
  await assert.rejects(openCard('hello'), SealError);
});

test('extractToken finds tokens in links', async () => {
  const token = await sealCard(dealCard());
  assert.equal(extractToken(`https://x.github.io/bingo/card.html#s=${token}`), token);
  assert.equal(extractToken(`  ${token}\n`), token);
  assert.equal(extractToken(`blower.html#check=${token}`), token);
  assert.equal(extractToken('nope'), null);
});
