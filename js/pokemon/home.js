// Pokémon landing page: a sample card for "Get a card" (a line half daubed
// in Electric ink) and Pikachu sitting on the logo.

import { dealCard } from '../bingo.js';
import { createCardView } from '../cardview.js';
import { paintPokemonFace } from './cardface.js';
import { loadSprites, spriteCanvas } from './sprites.js';
import { PIKACHU } from './dex.js';

const ELECTRIC = 4;
const card = { ...dealCard(), route: 1, serial: 25025 };
[0, 6, 18].forEach((i) => (card.marks[i] = ELECTRIC));
document.getElementById('mini-card').append(createCardView(card, { face: paintPokemonFace }).el);

loadSprites().then(() => {
  const pika = document.getElementById('pika');
  spriteCanvas(PIKACHU, pika.clientWidth || 64, { el: pika });
});
