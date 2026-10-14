// A sample card for the "Get a card" action: real card, a line half daubed, no taps.

import { dealCard } from './bingo.js?v=3f6ee08f';
import { createCardView } from './cardview.js?v=66979a92';

const LEMON = 4;
const card = dealCard();
card.serial = 1945;
[0, 6, 18].forEach((i) => (card.marks[i] = LEMON));
document.getElementById('mini-card').append(createCardView(card).el);
