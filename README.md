# Fireside Bingo

Online 75-ball bingo for a group of friends, printed like a hand-painted paper bingo card: cream card stock, sky-blue ink, a deep blue table, and balls in teal, tomato, cream, avocado and harvest gold. One person picks **Host a game**, which opens the ball blower, and streams it; everyone else picks **Get a card** on their own phone or laptop and daubs along.

There's also a **Pokémon edition**, Poké Bingo, picked from the home page: Poké Balls in the blower and Pokémon on the cards. See [Pokémon edition](#pokémon-edition) below.

No server, no accounts, no build step. It's a static site, so GitHub Pages can host it as-is.

## How a game goes

1. **Caller** opens the site, picks **Host a game**, and shares that screen (the blower) on the stream.
2. **Players** open the same site and pick **Get a card**. Each player is dealt their own random card.
3. The caller hits **Blow next ball** (or presses <kbd>Space</kbd>). The globe roars and shudders, the marquee lights race, one ball is sucked up the neck and pops out in a shower of sparks, tumbles through the air and bounces into the spotlight. It's called out on screen and daubed on the board. Tap the glass any time to give the balls a puff of air.
4. Players tap numbers to daub them. Seven ink bottles sit on the table; picking one up pops its cap. Ink goes down the instant your finger touches the card, with a squash, a splash and a wet shine that dries off. Every daub is painted fresh, so no two marks look alike: some presses are heavy and wet, some light and streaky, some tilted, smeared or double-tapped. Finish a line and it sparkles, and the BINGO! button starts dancing.
5. A player with a bingo taps **BINGO!** and sends the caller the sealed link it gives them.
6. The caller clicks **Check a card** (or presses <kbd>C</kbd>) and pastes the link in. The blower opens the seal and checks every daub against the balls that have actually been blown.

The **Playing for** button at the top of the blower picks the winning pattern: Any Line, Four Corners, The X or Blackout. The card check uses whichever pattern is selected.

Blower shortcuts: <kbd>Space</kbd> blows the next ball, <kbd>C</kbd> opens the card check, <kbd>F</kbd> toggles full screen. The microphone button reads each number out loud; it's off by default.

Both screens fit on a single phone screen with no scrolling, in portrait or on its side, and spread out on tablets and computers.

## Pokémon edition

Poké Bingo lives in `pokemon/` and is reached from the yellow **Poké Bingo** panel on the home page. It's the same game (same blower, same cards, same fairness and sealed links) dressed in Pikachu yellow, Poké Ball red and logo blue, with lightning crackling in the globe.

- **Balls are Poké Balls.** Each column has its own ball: B Poké Ball, I Great Ball, N Ultra Ball, G Safari Ball, O Master Ball. The button on each ball shows the Pokémon's sprite and name, and the cap and band roll with it as the ball tumbles.
- **Cards are trading cards.** A yellow-bordered card with the Pokémon in their columns, names under the sprites, and Pikachu on the free spot. The inks are named after types (Electric, Fire, Water…).
- **The board is "Who's that Pokémon?"** Every Pokémon in the game starts as a silhouette and pops into colour when it's called. Calls read like `G · #143 SNORLAX`, and the voice says "G. Snorlax."

### Routes: which Pokémon are in play

Bingo needs 75 balls, and there are 251 Pokémon in Gen 1 and Gen 2, so each game is played on a numbered **route** that decides which 75 are in it. Every device works out the same 75 from the route number alone, so nothing has to be sent between the caller and the players:

- The route is on the signpost next to the globe. Tapping it lets the caller pick another route or copy a player link (`pokemon/card.html#route=12`) that deals a card for it.
- Players pick the route when they get a card. It's printed on the card and shown in the top bar. **New card** suggests the next route, since a new game on the blower moves on one.
- Each route has **60 Kanto and 15 Johto** Pokémon, in Pokédex order, so B to G are Gen 1 and O is always Gen 2.
- Routes **rotate** through the Pokédex rather than picking at random: every Gen 1 Pokémon comes up exactly twice in each run of five routes, and every Gen 2 Pokémon three times in each run of twenty. Each run is shuffled afresh, so the groups change too.
- A sealed Pokémon card link carries its route. Checking a card from another route says so, and each edition points the other's links at the right blower.

The two editions keep their games, cards and dauber choices apart, so one browser can have both on the go.

## Keeping it smooth

- **The card is painted once.** Its face (paper, deckled edge, the hand-painted print, the numbers) is drawn into a canvas when it's dealt and never redrawn. There are no SVG filters anywhere.
- **Daubs cost almost nothing.** Each colour's marks are painted in idle time before you need them. A tap drops a ready-made mark on the card, and the stamp, splash, shine and sparkle only animate `transform` and `opacity`, which the browser's compositor runs on its own.
- **The globe draws only what moves.** The pedestal, glass, neck and unlit bulbs are painted once per resize. Each frame is the balls (three sprite blits each, no clipping) and the bulbs. On a device that can't keep up, the globe steps its resolution down by itself.
- **No modern-only CSS that older phones drop.** No container query units or `color-mix()`, so nothing silently disappears on older iPhones.

## Fairness

- **Same 75 numbers on both sides.** Cards use the standard ranges (B 1–15, I 16–30, N 31–45, G 46–60, O 61–75, free centre), and the blower draws from exactly those 75 balls. Every card can always reach bingo.
- **Uniform randomness.** Card numbers and ball draws use the browser's cryptographic RNG (`crypto.getRandomValues`) with rejection sampling, so there's no modulo bias and nothing predictable. See `js/rng.js`.
- **One-of-a-kind cards.** There are about 5.5 × 10²⁶ possible cards, so two players getting the same one isn't a realistic possibility. A card stays put through page reloads so nobody loses it mid-game. **New card** deals a fresh one.
- **No re-rolls.** Each ball is saved the moment it's picked, before the animation plays, so refreshing the blower can't change what came out. The globe animation is only for show; the pick has already happened.
- **Card shopping is flagged.** A sealed card carries the time it was dealt. If a card was dealt after balls had already been called, the check says how many.

## Sealed card links

The BINGO! link packs the card's numbers, every daub (and its colour), the serial number and the deal time into 30 bytes (Pokémon cards add their route, which is sealed too). It's encrypted with AES-256-GCM and the result goes in the URL fragment (`card.html#s=…`). The fragment never reaches a web server.

- Nobody can read a card from its link.
- Change any character and the seal breaks, so the blower rejects the link.
- Opening a link directly shows that card read-only, without touching the viewer's own card.

**Limitation:** with no server, the key has to ship inside the page (`js/codec.js`). That stops anyone from reading or editing a link by hand, but someone determined could dig the key out of the source and make their own. That's fine for friends. Anything stronger would need a server to issue and verify cards.

## Hosting on GitHub Pages

1. Merge this branch into `main`.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then pick `main` and `/ (root)`. Save.
4. After a minute the game is live at `https://<your-username>.github.io/bingo/`.

**After changing any file, run `npm run stamp` before committing.** GitHub Pages lets browsers reuse files for ten minutes, so right after an update a page could run new scripts against old cached copies of the files they import, and stop dead. The stamp tool (`tools/stamp.mjs`) adds a hash of each file to every reference to it (`codec.js?v=1a2b3c4d`), so a changed file gets a new address and browsers always load matching copies. `npm test` fails if a stamp is out of date. If a game page ever can't start anyway, it says so and offers a Reload button.

The site needs to be served over `https://` (or `localhost`), because the sealed links use the browser's WebCrypto API, which only works there. GitHub Pages is https by default.

## Running it locally

```sh
npx http-server -c-1 -p 8080 .     # or: python3 -m http.server 8080
# then open http://localhost:8080
```

Opening the HTML files straight from disk (`file://`) won't work, because browsers block ES modules there.

Logic tests (dealing, fairness, win checks, sealing) run on Node 20+:

```sh
npm test
```

## What's where

| Path                                                   | What it does                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `index.html`, `css/home.css`                           | Home screen: Get a card, Host a game, and how it works                                                       |
| `blower.html`, `js/blower-page.js`                     | Caller screen: draws, board, rack of recent balls, pattern, card check                                       |
| `js/machine.js`                                        | The globe: canvas physics, glass, pedestal and marquee lights, the draw                                      |
| `js/balls.js`                                          | Ball sprites with 3D-rolling labels, shared by the globe, the flight and the rack                            |
| `js/flight.js`                                         | The drawn ball's pop, tumble and bounce into the "now calling" spot                                          |
| `card.html`, `js/card-page.js`                         | Player screen: card on the table, daubers, line sparkle, BINGO! sharing, shared-card view                    |
| `js/cardview.js`, `css/cardview.css`                   | The paper card itself, painted on canvas (used by every page)                                                |
| `js/dauber.js`                                         | Ink splotch painter and the dauber bottles                                                                   |
| `js/bingo.js`                                          | Rules: ranges, dealing, patterns, `checkCard`                                                                |
| `js/codec.js`                                          | Sealed links (AES-GCM)                                                                                       |
| `js/rng.js`                                            | Unbiased crypto randomness                                                                                   |
| `js/sound.js`                                          | Synthesised sound effects (no audio files)                                                                   |
| `pokemon/`, `css/pokemon/`                             | Pokémon edition pages (home, blower, card) and their skin over the classic layouts                           |
| `js/pokemon/dex.js`                                    | Routes: which 75 Pokémon are in play, and the rotation                                                       |
| `js/pokemon/pokeballs.js`                              | Poké Ball sprites (same API as `js/balls.js`) and the column emblems                                         |
| `js/pokemon/cardface.js`                               | The trading-card face, painted on the classic card's grid                                                    |
| `js/pokemon/sprites.js`, `pokedex-data.js`             | Crisp pixel-art sprites from the sheet; names and sheet positions (generated)                                |
| `js/pokemon/blower-page.js`, `card-page.js`, `home.js` | The Pokémon edition's screens                                                                                |
| `tools/`                                               | Cache-busting stamps (`stamp.mjs`), and the scripts that made the paper texture and the Pokémon sprite sheet |

## Credits

Fonts: Fraunces (the "Fireside" wordmark), Titan One, Fredoka and Itim, all under the SIL Open Font License (see `assets/fonts/OFL.txt`). The paper texture is procedurally generated by `tools/make_paper.py`.

Pokémon edition: Press Start 2P and Pixelify Sans (SIL Open Font License) and Luckiest Guy (Apache License 2.0, see `assets/fonts/LICENSE-Apache.txt`). The sprites are the Black/White (Gen 5) sprites shown on [pokemondb.net/sprites](https://pokemondb.net/sprites); `tools/make_pokemon_atlas.py` fetches them, and the names, from the [PokeAPI](https://github.com/PokeAPI) repositories and packs them into `assets/pokemon/sprites.webp`.

Poké Bingo is a fan-made game for playing with friends, not affiliated with or endorsed by Nintendo. Pokémon, the Pokémon names and the sprites are © Nintendo, Creatures Inc., GAME FREAK inc. and The Pokémon Company.
