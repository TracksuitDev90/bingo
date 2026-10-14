// The Pokémon edition's player screen. Same card as the classic one
// (js/card-page.js) with Pokémon on it: each card is dealt for a route, the
// route the caller is playing, so its Pokémon match the blower's.

import { dealCard, isValidCard, completedSets, FREE } from '../bingo.js?v=3f6ee08f';
import { createCardView } from '../cardview.js?v=66979a92';
import { DAUBERS as INKS, dauberSVG } from '../dauber.js?v=31409a63';
import { sealPokemonCard, openPokemonCard, shareUrl, extractToken } from '../codec.js?v=86133dcf';
import { sound } from '../sound.js?v=36bb5e44';
import { store, toast, openSheet, copyText, formatTime, confirmSheet } from '../ui.js?v=f98984b4';
import { pokemonOf, nameOf, isRoute, MAX_ROUTE } from './dex.js?v=b5b23e78';
import { paintPokemonFace } from './cardface.js?v=72e1f0df';

const CARD_KEY = 'bingo:pokemon:card';
const DAUBER_KEY = 'bingo:pokemon:dauber';
const ELECTRIC = 4;

// The classic inks, named for Pokémon types.
const TYPE_NAMES = { 1: 'Fighting', 2: 'Psychic', 3: 'Fire', 4: 'Electric', 5: 'Grass', 6: 'Water', 7: 'Ghost' };
const DAUBERS = INKS.map((d) => ({ ...d, name: TYPE_NAMES[d.id] }));
const dauberById = (id) => DAUBERS.find((d) => d.id === id) || DAUBERS[ELECTRIC - 1];
const BOTTLE_LABEL = {
  paper: '#ffffff',
  ink: '#e3352b',
  title: 'POKé',
  titleFont: 'Luckiest Guy, Titan One, sans-serif',
  subtitle: 'type ink',
  subtitleFont: 'Pixelify Sans, Fredoka, sans-serif',
  nameFont: 'Luckiest Guy, Titan One, sans-serif',
};

const $ = (id) => document.getElementById(id);
const stage = $('stage');

let card;
let view;
let dauber = store.get(DAUBER_KEY, ELECTRIC);
let lines = new Set();

const nameOn = (n) => nameOf(pokemonOf(card.route, n));
const clampRoute = (v) => Math.min(MAX_ROUTE, Math.max(1, Math.round(+v) || 1));

// --- Card on the table --------------------------------------------------------

function loadCard() {
  const saved = store.get(CARD_KEY);
  if (
    saved &&
    isRoute(saved.route) &&
    isValidCard(saved.numbers) &&
    Array.isArray(saved.marks) &&
    saved.marks.length === 25
  )
    return saved;
  return null;
}

// Saving is batched off the tap so inking never waits on storage.
let saveTimer = 0;
function saveCard({ now = false } = {}) {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (now) store.set(CARD_KEY, card);
  else saveTimer = setTimeout(() => saveCard({ now: true }), 250);
}
const flush = () => saveTimer && saveCard({ now: true });
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => document.hidden && flush());

async function placeCard({ deal = false, interactive = true } = {}) {
  stage.replaceChildren();
  stage.classList.remove('is-dealing');
  view = createCardView(card, { interactive, onTap, onCancel, face: paintPokemonFace, name: nameOn });
  stage.append(view.el);
  lines = new Set(completedSets(card.marks).map((s) => s.id));
  syncBingo();
  renderRoute();
  await view.ready;
  if (interactive) view.prewarm(dauber);
  if (deal) {
    void stage.offsetWidth;
    stage.classList.add('is-dealing');
    sound.shuffle();
  }
}

function renderRoute() {
  $('route-chip').hidden = !card;
  if (card) $('route-num').textContent = card.route;
}

function onTap(i) {
  const next = card.marks[i] ? 0 : dauber;
  card.marks[i] = next;
  view.setMark(i, next, { animate: true });
  if (next) {
    sound.daub();
    navigator.vibrate?.(12);
    dip();
    $('hint').classList.add('is-gone');
  } else {
    sound.lift();
  }
  checkLines();
  saveCard();
}

/** The press turned into a scroll: take the ink back off. */
function onCancel(i) {
  card.marks[i] = 0;
  view.setMark(i, 0, { animate: true });
  checkLines();
  saveCard();
}

function checkLines() {
  const done = completedSets(card.marks);
  const fresh = done.filter((s) => !lines.has(s.id));
  lines = new Set(done.map((s) => s.id));
  syncBingo();
  if (!fresh.length) return;
  // Start the BINGO! button dancing again for the new line.
  const btn = $('bingo');
  btn.classList.remove('is-ready');
  requestAnimationFrame(() => requestAnimationFrame(syncBingo));
  // Celebrate the newest, smallest win (a line before a blackout).
  const best = fresh.sort((a, b) => a.cells.length - b.cells.length)[0];
  view.celebrate(best.cells);
  setTimeout(() => sound.line(), 120);
  navigator.vibrate?.([12, 60, 24]);
}
const syncBingo = () => $('bingo').classList.toggle('is-ready', lines.size > 0);

/** The bottle in your hand gives a little stamp with every daub. */
function dip() {
  $('bottles')
    .querySelector('[aria-checked="true"]')
    ?.animate(
      [
        { transform: 'translateY(-12px)' },
        { transform: 'translateY(-3px) scale(1.07, 0.9)', offset: 0.4 },
        { transform: 'translateY(-12px)' },
      ],
      { duration: 260, easing: 'cubic-bezier(.3,.7,.4,1.4)' },
    );
}

/** Slide the old card away (if any) and deal a fresh one for `route`. */
async function dealFor(route) {
  if (card) {
    stage.classList.remove('is-dealing');
    stage.classList.add('is-leaving');
    sound.shuffle();
    await new Promise((r) => setTimeout(r, 330));
    stage.classList.remove('is-leaving');
  }
  card = { ...dealCard(), route };
  saveCard({ now: true });
  $('hint').classList.remove('is-gone');
  placeCard({ deal: true });
}

async function wipe() {
  if (!card.marks.some(Boolean)) return toast('Nothing to wipe yet');
  const ok = await confirmSheet({
    title: 'Wipe all daubs?',
    body: 'Your Pokémon stay the same; only the ink comes off.',
    ok: 'Wipe it',
  });
  if (!ok) return;
  card.marks.forEach((m, i) => m && view.setMark(i, 0, { animate: true }));
  card.marks = new Array(25).fill(0);
  lines = new Set();
  syncBingo();
  saveCard({ now: true });
  view.prewarm(dauber);
}

// --- Route picker -----------------------------------------------------------------

/**
 * Ask which route to deal a card for. `joining` (no card yet) can't be
 * cancelled; otherwise it suggests `suggest`, which for a new card is the
 * next route, since a new game on the blower moves on one.
 */
function askRoute({ suggest, joining = false }) {
  const sheet = $('route-sheet');
  const input = $('route-input');
  input.value = suggest;
  $('route-title').textContent = joining ? 'Which route?' : 'New card';
  $('route-cancel').hidden = joining;
  $('route-close').hidden = joining;
  const daubed = card?.marks.some((m, i) => m && i !== FREE);
  const sync = () => {
    const r = clampRoute(input.value);
    $('route-note').textContent = daubed
      ? 'This card and its daubs go in the bin.'
      : card && r === card.route
        ? `A fresh card, still on Route ${r}.`
        : `Your card will have Route ${r}'s Pokémon.`;
  };
  sync();
  input.oninput = sync;
  const step = (d) => {
    const r = clampRoute(input.value) + d;
    input.value = r > MAX_ROUTE ? 1 : r < 1 ? MAX_ROUTE : r;
    sync();
  };
  $('route-down').onclick = () => step(-1);
  $('route-up').onclick = () => step(1);
  const go = () => {
    sheet.close('go');
    dealFor(clampRoute(input.value));
  };
  $('route-go').onclick = go;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go();
    }
  };
  // With no card yet, Escape mustn't leave an empty table.
  sheet.oncancel = (e) => joining && e.preventDefault();
  openSheet(sheet);
}

// --- Daubers ------------------------------------------------------------------

function cursorFor(color) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><circle cx='16' cy='16' r='11' fill='${color}' fill-opacity='.85' stroke='rgba(0,0,0,.45)' stroke-width='1.5'/><circle cx='12.5' cy='12' r='3' fill='white' fill-opacity='.45'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, pointer`;
}

function chooseDauber(id, { announce = false } = {}) {
  dauber = id;
  store.set(DAUBER_KEY, id);
  const d = dauberById(id);
  document.body.style.setProperty('--dauber', d.color);
  document.body.style.setProperty('--dauber-cursor', cursorFor(d.color));
  $('dauber-name').textContent = `${d.name}-type ink`;
  for (const b of $('bottles').children) b.setAttribute('aria-checked', String(+b.dataset.id === id));
  if (announce) sound.daub();
  view?.prewarm(id);
}

function buildTray() {
  const tray = $('bottles');
  for (const d of DAUBERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bottle';
    b.dataset.id = d.id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', `${d.name} dauber`);
    b.innerHTML = dauberSVG(d, BOTTLE_LABEL);
    b.addEventListener('click', () => chooseDauber(d.id, { announce: true }));
    tray.append(b);
  }
  // Arrow keys move through the radio group.
  tray.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const idx = DAUBERS.findIndex((d) => d.id === dauber);
    const next = DAUBERS[(idx + step + DAUBERS.length) % DAUBERS.length];
    chooseDauber(next.id, { announce: true });
    tray.querySelector(`[data-id="${next.id}"]`).focus();
  });
  chooseDauber(DAUBERS.some((d) => d.id === dauber) ? dauber : ELECTRIC);
}

// --- Calling bingo --------------------------------------------------------------

async function callBingo() {
  flush();
  const sheet = $('share-sheet');
  let url;
  try {
    url = shareUrl(await sealPokemonCard(card));
  } catch {
    // WebCrypto only exists on https:// (or localhost) pages.
    toast('Card links need the game to be opened over https://', 4000);
    return;
  }
  const input = $('share-url');
  input.value = url;
  const daubs = card.marks.filter((m, i) => m && i !== FREE).length;
  const done = completedSets(card.marks).sort((a, b) => a.cells.length - b.cells.length)[0];
  const note = $('share-note');
  note.classList.toggle('is-warn', !done);
  note.textContent = done
    ? `Card No ${card.serial} · Route ${card.route} · ${daubs} daubs · ${done.label} complete. Good luck!`
    : `Heads up: your daubs don't make a line yet. You can still send it.`;
  const nativeBtn = $('native-share');
  nativeBtn.hidden = !navigator.share;
  nativeBtn.onclick = () =>
    navigator
      .share({ title: 'BINGO!', text: `BINGO! Card No ${card.serial}, Route ${card.route}`, url })
      .catch(() => {});
  $('copy').onclick = async () => {
    const ok = await copyText(url);
    toast(ok ? 'Link copied. Send it to your caller!' : 'Select the link and copy it');
    if (!ok) input.select();
  };
  input.onfocus = () => input.select();
  openSheet(sheet);
}

// --- Shared card view -------------------------------------------------------------

async function showShared(token) {
  document.body.classList.add('is-shared');
  document.title = 'Shared Poké Bingo Card';
  $('shared').hidden = false;
  try {
    card = await openPokemonCard(token);
  } catch (err) {
    $('shared-meta').textContent = err.message;
    $('shared-check').hidden = true;
    return;
  }
  placeCard({ deal: true, interactive: false });
  $('route-chip').hidden = true;
  $('shared-meta').textContent = `Card No ${card.serial} · Route ${card.route} · dealt ${formatTime(card.created)}`;
  $('shared-check').href = `blower.html#check=${token}`;
}

// --- Boot ---------------------------------------------------------------------------

function initSoundToggle() {
  const btn = $('sound');
  const sync = () => btn.setAttribute('aria-pressed', String(sound.on));
  btn.addEventListener('click', () => {
    sound.on = !sound.on;
    sync();
    toast(sound.on ? 'Sound on' : 'Sound off', 1200);
  });
  sync();
}

initSoundToggle();
const sharedToken = extractToken(location.hash);
if (sharedToken) {
  showShared(sharedToken);
} else {
  buildTray();
  card = loadCard();
  // A player link from the caller: card.html#route=12
  const linked = +(location.hash.match(/route=(\d+)/)?.[1] ?? NaN);
  if (location.hash) history.replaceState(null, '', location.pathname);
  if (isRoute(linked) && card?.route !== linked) {
    if (card) toast(`New card for Route ${linked}`, 2400);
    dealFor(linked);
  } else if (card) {
    if (card.marks.some(Boolean)) $('hint').classList.add('is-gone');
    placeCard({ deal: true });
  } else {
    renderRoute();
    askRoute({ suggest: 1, joining: true });
  }
  const nextRoute = () => (!card ? 1 : card.route >= MAX_ROUTE ? 1 : card.route + 1);
  $('new-card').addEventListener('click', () => askRoute({ suggest: nextRoute(), joining: !card }));
  $('route-chip').addEventListener('click', () => askRoute({ suggest: card.route }));
  $('wipe').addEventListener('click', () => card && wipe());
  $('bingo').addEventListener('click', () => card && callBingo());
}
// Pasting a different card link into this tab only changes the hash.
addEventListener('hashchange', () => location.reload());

// Booted: tells the page's load check the game started.
document.documentElement.setAttribute('data-ready', '');
