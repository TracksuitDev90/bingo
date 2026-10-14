// A sample card for the "Get a Card" choice: real card, a few daubs, no taps.

import { dealCard } from './bingo.js';
import { createCardView } from './cardview.js';

const card = dealCard();
card.serial = 1945;
[0, 6, 18, 9, 22].forEach((i, k) => (card.marks[i] = [1, 2, 1, 7, 1][k]));
document.getElementById('mini-card').append(createCardView(card).el);
