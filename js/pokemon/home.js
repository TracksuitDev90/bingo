// Pokémon landing page: a sample card for "Get a card" (a line half daubed
// in Electric ink) and Pikachu sitting on the logo.

import { dealCard } from '../bingo.js?v=3f6ee08f';
import { createCardView } from '../cardview.js?v=66979a92';
import { paintPokemonFace } from './cardface.js?v=72e1f0df';
import { loadSprites, spriteCanvas } from './sprites.js?v=26842faa';
import { PIKACHU } from './dex.js?v=b5b23e78';

const ELECTRIC = 4;
const card = { ...dealCard(), route: 1, serial: 25025 };
[0, 6, 18].forEach((i) => (card.marks[i] = ELECTRIC));
document.getElementById('mini-card').append(createCardView(card, { face: paintPokemonFace }).el);

loadSprites().then(() => {
  const pika = document.getElementById('pika');
  spriteCanvas(PIKACHU, pika.clientWidth || 64, { el: pika });
});
