// Pokémon edition: routes, the Pokédex data and sealed Pokémon cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealCard } from '../js/bingo.js';
import { randomInt } from '../js/rng.js';
import { sealCard, openCard, sealPokemonCard, openPokemonCard, extractToken, SealError } from '../js/codec.js';
import { roster, pokemonOf, nameOf, spokenName, dexNo, isRoute, PIKACHU, MAX_ROUTE } from '../js/pokemon/dex.js';
import { NAMES, RECTS, SHEET_W, SHEET_H } from '../js/pokemon/pokedex-data.js';

const kanto = (d) => d <= 151;

test('Pokédex data covers #001–#251 and every sprite is inside the sheet', () => {
  assert.equal(NAMES.length, 251);
  assert.equal(RECTS.length, 251 * 4);
  assert.equal(nameOf(1), 'Bulbasaur');
  assert.equal(nameOf(PIKACHU), 'Pikachu');
  assert.equal(nameOf(151), 'Mew');
  assert.equal(nameOf(251), 'Celebi');
  for (let i = 0; i < 251; i++) {
    const [x, y, w, h] = RECTS.subarray(i * 4, i * 4 + 4);
    assert.ok(w > 0 && h > 0 && x + w <= SHEET_W && y + h <= SHEET_H, `sprite ${i + 1}`);
  }
});

test('names read well out loud and number nicely', () => {
  assert.equal(spokenName(29), 'Nidoran female');
  assert.equal(spokenName(32), 'Nidoran male');
  assert.equal(spokenName(233), 'Porygon 2');
  assert.equal(spokenName(4), 'Charmander');
  assert.equal(dexNo(7), '#007');
});

test('every route has 75 different Pokémon: 60 Kanto, then 15 Johto, never Pikachu', () => {
  for (let r = 1; r <= 120; r++) {
    const ros = roster(r);
    assert.equal(ros.length, 75);
    assert.equal(new Set(ros).size, 75, `route ${r} repeats a Pokémon`);
    assert.ok(!ros.includes(PIKACHU));
    assert.ok(ros.every((d) => d >= 1 && d <= 251));
    assert.deepEqual(
      ros,
      [...ros].sort((a, b) => a - b),
    );
    assert.equal(ros.filter(kanto).length, 60);
    // Sorted, so the O column (balls 61–75) is all Johto.
    assert.ok(ros.slice(60).every((d) => d > 151));
  }
});

test('routes rotate through the whole Pokédex', () => {
  // Every Kanto Pokémon (bar Pikachu) twice in each run of five routes.
  for (const start of [1, 6, 11, 96]) {
    const counts = new Map();
    for (let r = start; r < start + 5; r++)
      for (const d of roster(r).filter(kanto)) counts.set(d, (counts.get(d) || 0) + 1);
    assert.equal(counts.size, 150);
    assert.ok([...counts.values()].every((c) => c === 2));
  }
  // Every Johto Pokémon three times in each run of twenty.
  for (const start of [1, 21]) {
    const counts = new Map();
    for (let r = start; r < start + 20; r++)
      for (const d of roster(r).filter((d) => !kanto(d))) counts.set(d, (counts.get(d) || 0) + 1);
    assert.equal(counts.size, 100);
    assert.ok([...counts.values()].every((c) => c === 3));
  }
  // Each run is shuffled afresh, so route 6 isn't route 1 again.
  assert.notDeepEqual(roster(6), roster(1));
});

test('rosters are fixed: every device sees the same Pokémon for a route', () => {
  // If this fails, the rotation changed, and a caller and players on
  // different versions of the site would see different Pokémon.
  assert.deepEqual(roster(1).slice(0, 5), [4, 5, 8, 10, 13]);
  assert.deepEqual([pokemonOf(1, 75), pokemonOf(2, 1), pokemonOf(37, 40)], [244, 1, 82]);
});

test('route numbers', () => {
  assert.ok(isRoute(1) && isRoute(MAX_ROUTE));
  assert.ok(!isRoute(0) && !isRoute(MAX_ROUTE + 1) && !isRoute(1.5) && !isRoute('3'));
  assert.throws(() => roster(0), RangeError);
});

test('Pokémon card links carry the route and reject tampering', async () => {
  for (let t = 0; t < 40; t++) {
    const c = { ...dealCard(), route: 1 + randomInt(MAX_ROUTE) };
    c.marks = c.marks.map(() => randomInt(8));
    const token = await sealPokemonCard(c);
    assert.equal(token.length, 82);
    assert.equal(extractToken(`https://x.github.io/bingo/pokemon/card.html#s=${token}`), token);
    const back = await openPokemonCard(token);
    assert.equal(back.route, c.route);
    assert.deepEqual(back.numbers, c.numbers);
    assert.deepEqual(back.marks, c.marks);
    assert.equal(back.serial, c.serial);
  }
  // The route sits in the clear but is sealed: changing it breaks the seal.
  const token = await sealPokemonCard({ ...dealCard(), route: 5 });
  const bytes = Buffer.from(token, 'base64url');
  bytes[2] ^= 1;
  await assert.rejects(openPokemonCard(bytes.toString('base64url')), /seal is broken/);
});

test("each edition points the other edition's links to the right blower", async () => {
  const poke = await sealPokemonCard({ ...dealCard(), route: 3 });
  const classic = await sealCard(dealCard());
  await assert.rejects(openCard(poke), (e) => e instanceof SealError && /Pokémon Bingo card/.test(e.message));
  await assert.rejects(openPokemonCard(classic), (e) => e instanceof SealError && /classic/.test(e.message));
});
