// Which Pokémon are in play.
//
// Underneath, Pokémon Bingo is the same 75-ball game as the classic one:
// cards and the blower use ball numbers 1–75, so dealing, the patterns and
// the card check are shared. A *route* decides which Pokémon those 75 balls
// are, and every device works out the same 75 from the route number alone,
// so the caller and the players only have to agree on one number.
//
// Each route has 60 Gen 1 (Kanto) Pokémon and 15 Gen 2 (Johto), sorted by
// Pokédex number: B, I, N and G are Kanto in Pokédex order and O is always
// Johto. Routes rotate through the Pokédex rather than picking at random:
// every Kanto Pokémon comes up exactly twice in each run of five routes, and
// every Johto Pokémon three times in each run of twenty. Pikachu is the free
// spot on every card, so it's never a ball.
//
// No DOM in here, so the tests can run it under Node.

import { NAMES } from './pokedex-data.js?v=05c22653';
import { seeded, hash } from '../rng.js?v=d7e59606';

export const PIKACHU = 25;
export const MAX_ROUTE = 999;
const KANTO = Array.from({ length: 151 }, (_, i) => i + 1).filter((d) => d !== PIKACHU);
const JOHTO = Array.from({ length: 100 }, (_, i) => i + 152);
// [pool, per route, passes through the pool per epoch, routes per epoch]
const KANTO_ROT = [KANTO, 60, 2, 5];
const JOHTO_ROT = [JOHTO, 15, 3, 20];

export const nameOf = (dex) => NAMES[dex - 1];
export const dexNo = (dex) => `#${String(dex).padStart(3, '0')}`;
/** A name speech synthesis can say: "Nidoran female", "Porygon 2". */
export const spokenName = (dex) =>
  nameOf(dex)
    .replace('♀', ' female')
    .replace('♂', ' male')
    .replace(/([a-z])(\d)$/, '$1 $2');
export const isRoute = (r) => Number.isInteger(r) && r >= 1 && r <= MAX_ROUTE;

function shuffled(pool, rnd) {
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * One epoch of routes: `passes` freshly shuffled runs through the pool, cut
 * into routes of `per`. A route that straddles two runs takes the start of
 * the next run minus anything it already has, so no route repeats a Pokémon.
 */
function epoch([pool, per, passes], seed) {
  const routes = [];
  let open = [];
  for (let p = 0; p < passes; p++) {
    let order = shuffled(pool, seeded(hash(seed, p)));
    if (open.length) {
      const have = new Set(open);
      const head = order.filter((d) => !have.has(d)).slice(0, per - open.length);
      const taken = new Set(head);
      order = head.concat(order.filter((d) => !taken.has(d)));
    }
    for (const d of order) {
      open.push(d);
      if (open.length === per) {
        routes.push(open);
        open = [];
      }
    }
  }
  return routes;
}

const epochs = new Map();
function slice(rot, name, k) {
  const routesPer = rot[3];
  const e = Math.floor(k / routesPer);
  const key = `${name}:${e}`;
  let routes = epochs.get(key);
  if (!routes) {
    routes = epoch(rot, hash('pokemon-bingo', name, e));
    epochs.set(key, routes);
  }
  return routes[k % routesPer];
}

const rosters = new Map();
/** The 75 Pokédex numbers in play on `route`; ball n is roster(route)[n - 1]. */
export function roster(route) {
  if (!isRoute(route)) throw new RangeError(`Not a route: ${route}`);
  let r = rosters.get(route);
  if (!r) {
    const k = route - 1;
    r = slice(KANTO_ROT, 'kanto', k)
      .concat(slice(JOHTO_ROT, 'johto', k))
      .sort((a, b) => a - b);
    rosters.set(route, r);
  }
  return r;
}

/** The Pokémon on ball `n` (1–75) of `route`. */
export const pokemonOf = (route, n) => roster(route)[n - 1];
