// Pokémon landing page: a sample card for "Get a card" (a line half daubed
// in Electric ink) and Pikachu sitting on the logo.

import { dealCard } from '../bingo.js?v=11e3ed33';
import { createCardView } from '../cardview.js?v=4f36c40e';
import { paintPokemonFace } from './cardface.js?v=c3ca5b7e';
import { loadSprites, spriteCanvas } from './sprites.js?v=4e7b2fda';
import { PIKACHU } from './dex.js?v=1b50d13b';

const ELECTRIC = 4;
const card = { ...dealCard(), route: 1, serial: 25025 };
[0, 6, 18].forEach((i) => (card.marks[i] = ELECTRIC));
document.getElementById('mini-card').append(createCardView(card, { face: paintPokemonFace }).el);

loadSprites().then(() => {
  const pika = document.getElementById('pika');
  spriteCanvas(PIKACHU, pika.clientWidth || 64, { el: pika });
});
