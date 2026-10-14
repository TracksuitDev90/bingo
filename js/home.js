// A sample card for the "Get a card" action: real card, a line half daubed, no taps.

import { dealCard } from './bingo.js?v=11e3ed33';
import { createCardView } from './cardview.js?v=4f36c40e';

const LEMON = 4;
const card = dealCard();
card.serial = 1945;
[0, 6, 18].forEach((i) => (card.marks[i] = LEMON));
document.getElementById('mini-card').append(createCardView(card).el);
