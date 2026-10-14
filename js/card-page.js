import { dealCard, isValidCard, PATTERNS, FREE } from './bingo.js';
import { createCardView } from './cardview.js';
import { DAUBERS, dauberById, dauberSVG } from './dauber.js';
import { sealCard, openCard, shareUrl, extractToken } from './codec.js';
import { sound } from './sound.js';
import { store, toast, confirmSheet, openSheet, copyText, formatTime } from './ui.js';

const CARD_KEY = 'bingo:card';
const DAUBER_KEY = 'bingo:dauber';

const $ = (id) => document.getElementById(id);
const stage = $('stage');

let card;
let view;
let dauber = store.get(DAUBER_KEY, 1);

// --- Card on the table --------------------------------------------------------

function loadCard() {
  const saved = store.get(CARD_KEY);
  if (saved && isValidCard(saved.numbers) && Array.isArray(saved.marks) && saved.marks.length === 25) return saved;
  return null;
}
const saveCard = () => store.set(CARD_KEY, card);

function placeCard({ deal = false, interactive = true } = {}) {
  stage.replaceChildren();
  view = createCardView(card, { interactive, onTap });
  stage.append(view.el);
  if (deal) {
    stage.classList.remove('is-dealing');
    void stage.offsetWidth;
    stage.classList.add('is-dealing');
    sound.shuffle();
  }
}

function onTap(i) {
  const next = card.marks[i] ? 0 : dauber;
  card.marks[i] = next;
  view.setMark(i, next, { animate: true });
  saveCard();
  if (next) {
    sound.daub();
    navigator.vibrate?.(14);
    $('hint').classList.add('is-gone');
  }
}

async function newCard() {
  const daubed = card.marks.some((m, i) => m && i !== FREE);
  if (daubed) {
    const ok = await confirmSheet({
      title: 'Deal a new card?',
      body: 'This card and its daubs go in the bin. Only do this when a new game starts.',
      ok: 'Deal me in',
      danger: true,
    });
    if (!ok) return;
  }
  stage.classList.remove('is-dealing');
  stage.classList.add('is-leaving');
  sound.shuffle();
  await new Promise((r) => setTimeout(r, 330));
  stage.classList.remove('is-leaving');
  card = dealCard();
  saveCard();
  placeCard({ deal: true });
}

async function wipe() {
  if (!card.marks.some(Boolean)) return toast('Nothing to wipe yet');
  const ok = await confirmSheet({
    title: 'Wipe all daubs?',
    body: 'Your numbers stay the same; only the ink comes off.',
    ok: 'Wipe it',
  });
  if (!ok) return;
  card.marks.forEach((m, i) => m && view.setMark(i, 0, { animate: true }));
  card.marks = new Array(25).fill(0);
  saveCard();
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
  $('dauber-name').textContent = `${d.name} ink`;
  for (const b of $('bottles').children) b.setAttribute('aria-checked', String(+b.dataset.id === id));
  if (announce) sound.daub();
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
    b.innerHTML = dauberSVG(d);
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
  chooseDauber(DAUBERS.some((d) => d.id === dauber) ? dauber : 1);
}

// --- Calling bingo --------------------------------------------------------------

function completedPattern() {
  const on = (i) => i === FREE || card.marks[i] > 0;
  for (const key of ['line', 'corners', 'x', 'blackout']) {
    const hit = PATTERNS[key].sets.find((s) => s.cells.every(on));
    if (hit) return hit.label;
  }
  return null;
}

async function callBingo() {
  const sheet = $('share-sheet');
  let url;
  try {
    url = shareUrl(await sealCard(card));
  } catch {
    // WebCrypto only exists on https:// (or localhost) pages.
    toast('Card links need the game to be opened over https://', 4000);
    return;
  }
  const input = $('share-url');
  input.value = url;
  const daubs = card.marks.filter((m, i) => m && i !== FREE).length;
  const pattern = completedPattern();
  const note = $('share-note');
  note.classList.toggle('is-warn', !pattern);
  note.textContent = pattern
    ? `Card No ${card.serial} · ${daubs} daubs · ${pattern} complete. Good luck!`
    : `Heads up: your daubs don't make a line yet. You can still send it.`;
  const nativeBtn = $('native-share');
  nativeBtn.hidden = !navigator.share;
  nativeBtn.onclick = () =>
    navigator.share({ title: 'BINGO!', text: `BINGO! Card No ${card.serial}`, url }).catch(() => {});
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
  document.title = 'Shared Bingo Card';
  $('shared').hidden = false;
  try {
    card = await openCard(token);
  } catch (err) {
    $('shared-meta').textContent = err.message;
    $('shared-check').hidden = true;
    return;
  }
  placeCard({ deal: true, interactive: false });
  $('shared-meta').textContent = `Card No ${card.serial} · dealt ${formatTime(card.created)}`;
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
  const fresh = !card;
  if (fresh) {
    card = dealCard();
    saveCard();
  }
  if (card.marks.some(Boolean)) $('hint').classList.add('is-gone');
  placeCard({ deal: true });
  $('new-card').addEventListener('click', newCard);
  $('wipe').addEventListener('click', wipe);
  $('bingo').addEventListener('click', callBingo);
}
// Pasting a different card link into this tab only changes the hash.
addEventListener('hashchange', () => location.reload());
