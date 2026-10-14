# Bingo Night

Online 75-ball bingo for a group of friends. One person runs **The Blower** and streams it; everyone else opens **Get a Card** on their own phone or laptop and daubs along.

No server, no accounts, no build step. It's a static site, so GitHub Pages can host it as-is.

## How a game goes

1. **Caller** opens the site, picks **The Blower**, and shares that screen on the stream.
2. **Players** open the same site and pick **Get a Card**. Each player is dealt their own random card.
3. The caller hits **Blow next ball** (or presses <kbd>Space</kbd>). The globe roars, one ball rides up the neck, and it's called out on screen and marked on the board.
4. Players tap numbers to daub them. Seven ink colours are on the table to choose from.
5. A player with a bingo taps **BINGO!** and sends the caller the sealed link it gives them.
6. The caller clicks **Check a card** (or presses <kbd>C</kbd>) and pastes the link in. The blower opens the seal and checks every daub against the balls that have actually been blown.

The **Playing for** button at the top of the blower picks the winning pattern: Any Line, Four Corners, The X or Blackout. The card check uses whichever pattern is selected.

Blower shortcuts: <kbd>Space</kbd> blows the next ball, <kbd>C</kbd> opens the card check, <kbd>F</kbd> toggles full screen. The microphone button reads each number out loud; it's off by default.

## Fairness

- **Same 75 numbers on both sides.** Cards use the standard ranges (B 1–15, I 16–30, N 31–45, G 46–60, O 61–75, free centre), and the blower draws from exactly those 75 balls. Every card can always reach bingo.
- **Uniform randomness.** Card numbers and ball draws use the browser's cryptographic RNG (`crypto.getRandomValues`) with rejection sampling, so there's no modulo bias and nothing predictable. See `js/rng.js`.
- **One-of-a-kind cards.** There are about 5.5 × 10²⁶ possible cards, so two players getting the same one isn't a realistic possibility. A card stays put through page reloads so nobody loses it mid-game. **New card** deals a fresh one.
- **No re-rolls.** Each ball is saved the moment it's picked, before the animation plays, so refreshing the blower can't change what came out. The globe animation is only for show; the pick has already happened.
- **Card shopping is flagged.** A sealed card carries the time it was dealt. If a card was dealt after balls had already been called, the check says how many.

## Sealed card links

The BINGO! link packs the card's numbers, every daub (and its colour), the serial number and the deal time into 30 bytes. It's encrypted with AES-256-GCM and the result goes in the URL fragment (`card.html#s=…`). The fragment never reaches a web server.

- Nobody can read a card from its link.
- Change any character and the seal breaks, so the blower rejects the link.
- Opening a link directly shows that card read-only, without touching the viewer's own card.

**Limitation:** with no server, the key has to ship inside the page (`js/codec.js`). That stops anyone from reading or editing a link by hand, but someone determined could dig the key out of the source and make their own. That's fine for friends. Anything stronger would need a server to issue and verify cards.

## Hosting on GitHub Pages

1. Merge this branch into `main`.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then pick `main` and `/ (root)`. Save.
4. After a minute the game is live at `https://<your-username>.github.io/bingo/`.

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

| Path | What it does |
| --- | --- |
| `index.html` | Home screen with the two choices |
| `blower.html`, `js/blower-page.js` | Caller screen: draws, board, pattern, card check |
| `js/machine.js` | The globe: canvas physics, 3D-rolling ball labels, glass, the draw animation |
| `card.html`, `js/card-page.js` | Player screen: card on the table, daubers, BINGO! sharing, shared-card view |
| `js/cardview.js`, `css/cardview.css` | The paper card itself (used by both pages) |
| `js/dauber.js` | Ink splotch painter and the dauber bottles |
| `js/bingo.js` | Rules: ranges, dealing, patterns, `checkCard` |
| `js/codec.js` | Sealed links (AES-GCM) |
| `js/rng.js` | Unbiased crypto randomness |
| `js/sound.js` | Synthesised sound effects (no audio files) |
| `tools/` | Scripts that generated the wood and paper textures |

## Credits

Fonts: Titan One, Fredoka and Itim, all under the SIL Open Font License (see `assets/fonts/OFL.txt`). The wood table and paper textures are procedurally generated by the scripts in `tools/`.
