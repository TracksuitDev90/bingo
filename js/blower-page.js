import { BALLS, LETTERS, PATTERNS, letterOf, callName, checkCard, patternPreview } from './bingo.js?v=3f6ee08f';
import { randomInt, hash } from './rng.js?v=d7e59606';
import { BlowerMachine, BALL_COLORS, LABEL_INK } from './machine.js?v=1f0b3b9a';
import { ballCanvas, clearSpriteCache, spritesFor } from './balls.js?v=3dc5c925';
import { flyBall } from './flight.js?v=21700ca4';
import { paintSplotch, markJitter } from './dauber.js?v=31409a63';
import { openCard, extractToken } from './codec.js?v=86133dcf';
import { createCardView } from './cardview.js?v=66979a92';
import { sound } from './sound.js?v=36bb5e44';
import { confetti } from './confetti.js?v=fe532583';
import { store, toast, confirmSheet, openSheet, formatTime } from './ui.js?v=f98984b4';

const GAME_KEY = 'bingo:game';
const VOICE_KEY = 'bingo:voice';
// The caller's board is daubed in green, like a real hall.
const BOARD_INK = '#0f9a52';
const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Game state -------------------------------------------------------------------
// Every draw is saved the instant it's picked, before any animation, so a
// reload can never re-roll a ball.

const freshGame = (pattern = 'line') => ({
  id: Date.now().toString(36),
  pattern,
  startedAt: null,
  draws: [],
  checks: [],
});

function loadGame() {
  const g = store.get(GAME_KEY);
  if (!g || !Array.isArray(g.draws) || !PATTERNS[g.pattern]) return freshGame();
  const seen = new Set();
  const ok = g.draws.every((d) => Number.isInteger(d.n) && d.n >= 1 && d.n <= BALLS && !seen.has(d.n) && seen.add(d.n));
  if (!ok) return freshGame(g.pattern);
  g.checks = Array.isArray(g.checks) ? g.checks : [];
  return g;
}

let game = loadGame();
const save = () => store.set(GAME_KEY, game);
const calledNumbers = () => game.draws.map((d) => d.n);
const remaining = () => {
  const c = new Set(calledNumbers());
  return Array.from({ length: BALLS }, (_, i) => i + 1).filter((n) => !c.has(n));
};

// --- Board -----------------------------------------------------------------------------

const tiles = new Map();
function buildBoard() {
  const board = $('board');
  LETTERS.forEach((L, row) => {
    const r = document.createElement('div');
    r.className = 'b-row';
    const badge = document.createElement('span');
    badge.className = 'b-row__letter';
    badge.textContent = L;
    badge.style.setProperty('--c', BALL_COLORS[L]);
    if (L === 'N') badge.style.setProperty('--t-on', LABEL_INK.N);
    const nums = document.createElement('div');
    nums.className = 'b-row__nums';
    for (let k = 1; k <= 15; k++) {
      const n = row * 15 + k;
      const t = document.createElement('div');
      t.className = 'tile';
      t.innerHTML = `<span>${n}</span>`;
      t.setAttribute('aria-label', `${L} ${n}`);
      tiles.set(n, t);
      nums.append(t);
    }
    r.append(badge, nums);
    board.append(r);
  });
  let lastW = 0;
  new ResizeObserver(() => {
    const w = tiles.get(1).offsetWidth;
    if (w && w !== lastW) {
      lastW = w;
      for (const n of calledNumbers()) daubTile(n, false);
    }
  }).observe(board);
}

function daubTile(n, animate) {
  const tile = tiles.get(n);
  tile.classList.add('is-called');
  tile.querySelector('.daub')?.remove();
  const size = Math.round(Math.min(tile.offsetWidth, tile.offsetHeight) * 1.3);
  if (!size) return;
  const seed = hash(game.id, n);
  const j = markJitter(seed);
  const daub = document.createElement('div');
  daub.className = 'daub' + (animate && !reduceMotion ? ' daub--fresh' : '');
  daub.style.setProperty('--dx', `${j.dx * 60}%`);
  daub.style.setProperty('--dy', `${j.dy * 60}%`);
  daub.style.setProperty('--rot', `${j.rot}deg`);
  const c = document.createElement('canvas');
  paintSplotch(c, { color: BOARD_INK, seed, size });
  daub.append(c);
  tile.append(daub);
}

function renderBoard() {
  for (const [, t] of tiles) {
    t.classList.remove('is-called', 'is-latest');
    t.querySelector('.daub')?.remove();
  }
  for (const n of calledNumbers()) daubTile(n, false);
  markLatest(game.draws.at(-1)?.n);
}
function markLatest(n) {
  for (const t of tiles.values()) t.classList.remove('is-latest');
  if (n) tiles.get(n).classList.add('is-latest');
}

// --- Caller panel --------------------------------------------------------------------

let slotN = null;

/** Sprites for a ball the size of the "now calling" spot (shared with the flight). */
const slotSprites = () => spritesFor(Math.round($('now-slot').clientWidth * Math.min(window.devicePixelRatio || 1, 2)));

/** Put ball `n` (or nothing) in the "now calling" spot. */
function drawSlot(n) {
  slotN = n;
  const slot = $('now-slot');
  slot.classList.toggle('is-empty', n == null);
  slot.classList.remove('is-waiting');
  $('now-hint').hidden = n != null || game.draws.length > 0;
  if (n == null) return;
  const c = $('now-ball');
  ballCanvas(n, slot.clientWidth, c);
  c.setAttribute('aria-label', `${letterOf(n)} ${n}`);
}

function renderCall({ fresh = false } = {}) {
  const last = game.draws.at(-1);
  const text = $('call-text');
  text.textContent = last ? callName(last.n) : '';
  text.classList.remove('is-new', 'is-dim');
  if (fresh && !reduceMotion) {
    void text.offsetWidth;
    text.classList.add('is-new');
  }
  $('count').textContent = last ? `Ball ${game.draws.length} of ${BALLS}` : '';
  renderLeft(BALLS - game.draws.length);
  setBlowState();
}

function renderLeft(left) {
  $('left').textContent = left ? `${left} ball${left === 1 ? '' : 's'} in the globe` : 'Globe empty';
}

function setBlowState() {
  const left = BALLS - game.draws.length;
  const btn = $('blow');
  btn.disabled = left === 0;
  btn.classList.toggle('is-busy', busy);
  $('blow-label').textContent = left === 0 ? 'All 75 called' : 'Blow next ball';
}

// Balls called before the one in the slot, newest first.
const rackMax = () => (innerWidth < 600 ? 5 : 6);
const rackList = () =>
  game.draws
    .slice(0, -1)
    .slice(-rackMax())
    .reverse()
    .map((d) => d.n);

/** Redraw the rack, sliding balls to their new places (and in from the slot). */
function renderRack({ fromSlot = null } = {}) {
  const rack = $('recent');
  const before = new Map([...rack.children].map((el) => [+el.dataset.n, el.getBoundingClientRect()]));
  const slotRect = fromSlot != null ? $('now-slot').getBoundingClientRect() : null;
  rack.replaceChildren(
    ...rackList().map((n) => {
      const s = document.createElement('span');
      s.className = 'rball';
      s.dataset.n = n;
      s.setAttribute('role', 'img');
      s.setAttribute('aria-label', `${letterOf(n)} ${n}`);
      return s;
    }),
  );
  const size = rack.clientHeight;
  for (const el of rack.children) el.append(ballCanvas(+el.dataset.n, size));
  if (reduceMotion) return;
  for (const el of rack.children) {
    const n = +el.dataset.n;
    const r = el.getBoundingClientRect();
    const timing = { duration: 560, easing: 'cubic-bezier(.3,.75,.3,1.15)' };
    if (n === fromSlot && slotRect) {
      const dx = slotRect.left + slotRect.width / 2 - (r.left + r.width / 2);
      const dy = slotRect.top + slotRect.height / 2 - (r.top + r.height / 2);
      const k = slotRect.width / r.width;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(0deg)` },
          {
            transform: `translate(${dx * 0.4}px, ${dy * 0.4 - r.height * 0.8}px) scale(${1 + (k - 1) * 0.3}) rotate(200deg)`,
            offset: 0.55,
          },
          { transform: 'translate(0, 0) scale(1) rotate(360deg)' },
        ],
        { duration: 620, easing: 'cubic-bezier(.35,.6,.3,1)' },
      );
    } else if (before.has(n)) {
      const o = before.get(n);
      const dx = o.left - r.left;
      if (dx) el.animate([{ transform: `translateX(${dx}px) rotate(${-dx * 2}deg)` }, { transform: 'none' }], timing);
    } else {
      el.animate(
        [
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        timing,
      );
    }
  }
}

const renderAll = () => {
  renderBoard();
  drawSlot(game.draws.at(-1)?.n ?? null);
  renderCall();
  renderRack();
  renderPattern();
};

// --- Blowing a ball ------------------------------------------------------------------

let machine;
let busy = false;

async function blow() {
  if (busy || document.querySelector('dialog[open]')) return;
  const pool = remaining();
  if (!pool.length) return;
  busy = true;
  setBlowState();

  // The fair part: one uniformly random pick from the balls still in the globe.
  const n = pool[randomInt(pool.length)];
  const t = Date.now();
  game.startedAt ??= t;
  const prev = slotN;
  game.draws.push({ n, t });
  save();

  // Clear the stage: last ball rolls off into the rack while the air roars.
  drawSlot(null);
  $('now-slot').classList.add('is-waiting');
  $('now-hint').hidden = true;
  if (prev != null) renderRack({ fromSlot: prev });
  $('call-text').classList.add('is-dim');
  $('count').textContent = 'Here it comes…';

  // Build the big ball's sprites while the balls mix, not as it pops out.
  setTimeout(() => {
    const sp = slotSprites();
    sp.body(letterOf(n));
    sp.label(n);
    void sp.overlay;
  }, 80);

  const stop = sound.whoosh(1.8);
  let from;
  try {
    from = await machine.draw(n, { mixMs: reduceMotion ? 300 : 1500 });
  } catch {
    from = null;
  } finally {
    stop();
  }
  sound.pop();
  renderLeft(machine.count);
  if (from && !reduceMotion) {
    const rect = $('now-slot').getBoundingClientRect();
    await flyBall(
      n,
      from,
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: rect.width / 2 },
      { onBounce: (s) => sound.bounce(s), quality: machine.quality, sprites: slotSprites() },
    );
  }
  drawSlot(n);
  busy = false;
  renderCall({ fresh: true });
  markLatest(n);
  daubTile(n, true);
  navigator.vibrate?.(20);
  speak(n);
}

let voiceOn = store.get(VOICE_KEY, false);
function speak(n) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(`${letterOf(n)}. ${n}.`);
  u.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

async function newGame() {
  if (busy) return;
  if (game.draws.length) {
    const ok = await confirmSheet({
      title: 'Start a new game?',
      body: 'Every ball goes back in the globe and the board is wiped. Players should deal themselves a new card.',
      ok: 'New game',
      danger: true,
    });
    if (!ok) return;
  }
  game = freshGame(game.pattern);
  save();
  machine.refill(remaining());
  renderAll();
  toast('New game! Tell everyone to deal a fresh card.', 3200);
}

// --- Pattern ----------------------------------------------------------------------------

function miniDiagram(key) {
  const on = new Set(patternPreview(key));
  return Array.from({ length: 25 }, (_, i) => `<i class="${on.has(i) ? 'on' : ''}"></i>`).join('');
}

function renderPattern() {
  const p = PATTERNS[game.pattern];
  $('pattern-mini').innerHTML = miniDiagram(game.pattern);
  $('pattern-name').textContent = p.name;
}

function buildPatternSheet() {
  const list = $('pattern-list');
  for (const [key, p] of Object.entries(PATTERNS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pattern-opt';
    b.dataset.key = key;
    b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="mini">${miniDiagram(key)}</span><span><b>${p.name}</b><small>${p.blurb}</small></span>`;
    b.addEventListener('click', () => {
      game.pattern = key;
      save();
      renderPattern();
      $('pattern-sheet').close();
      toast(`Now playing for ${p.name}`);
    });
    list.append(b);
  }
  $('pattern-btn').addEventListener('click', () => {
    for (const b of list.children) b.setAttribute('aria-checked', String(b.dataset.key === game.pattern));
    openSheet($('pattern-sheet'));
  });
}

// --- Card check ---------------------------------------------------------------------

function openCheck(prefill) {
  const sheet = $('check-sheet');
  renderLog();
  if (!sheet.open) openSheet(sheet);
  const input = $('check-input');
  if (prefill) {
    input.value = prefill;
    runCheck(prefill);
  } else {
    input.select();
  }
}

function showError(msg) {
  const e = $('check-error');
  e.textContent = msg;
  e.hidden = false;
  $('check-result').hidden = true;
}

const names = (cells, max = 8) => {
  const s = cells.slice(0, max).map((c) => callName(c.n ?? c));
  return s.join(', ') + (cells.length > max ? ` and ${cells.length - max} more` : '');
};

let lastChecked = { token: '', at: 0 };

async function runCheck(text) {
  $('check-error').hidden = true;
  const token = extractToken(text);
  // A paste followed by Enter shouldn't log the same check twice.
  if (token && token === lastChecked.token && Date.now() - lastChecked.at < 4000) return;
  if (!token)
    return showError(
      "That doesn't look like a card link. Ask the player to tap BINGO! and send you the link it gives them.",
    );
  let card;
  try {
    card = await openCard(token);
  } catch (err) {
    sound.buzz();
    return showError(err.message);
  }

  const res = checkCard(card, calledNumbers(), game.pattern);
  const view = createCardView(card);
  $('check-card').replaceChildren(view.el);
  view.showCheck(res);

  const stamp = $('stamp');
  stamp.className = `stamp ${res.bingo ? 'stamp--yes' : 'stamp--no'}`;
  stamp.textContent = res.bingo ? 'BINGO!' : 'NOT YET';
  void stamp.offsetWidth;

  const facts = [];
  const pattern = PATTERNS[game.pattern];
  if (res.bingo) {
    facts.push(['ok', `<b>${res.wins.map((w) => w.label).join(' + ')}</b>: every square called and daubed.`]);
  } else if (!game.draws.length) {
    facts.push(['bad', 'No balls have been blown yet.']);
  } else {
    const c = res.closest;
    facts.push([
      'bad',
      `Closest is <b>${c.label}</b>, which still needs ${c.need.length}: ${names(c.need.map((i) => card.numbers[i]))}.`,
    ]);
  }
  for (const s of res.sleepers)
    facts.push(['warn', `<b>${s.label}</b> is complete on called numbers but wasn't fully daubed.`]);
  if (res.badMarks.length) {
    facts.push([
      res.bingo ? 'warn' : 'bad',
      `${res.badMarks.length} daub${res.badMarks.length > 1 ? 's' : ''} on numbers not called yet: ${names(res.badMarks)}.`,
    ]);
  }
  if (res.missed.length) facts.push(['', `Called but not daubed: ${names(res.missed)}.`]);

  const dealtMs = card.created * 1000;
  const before = game.draws.filter((d) => d.t < dealtMs - 60_000).length;
  if (before > 0) {
    facts.push([
      'warn',
      `Card No ${card.serial} was dealt at ${formatTime(card.created)}, after <b>${before} ball${before > 1 ? 's' : ''}</b> had been called.`,
    ]);
  } else {
    facts.push(['', `Card No ${card.serial}, dealt ${formatTime(card.created)}.`]);
  }
  const prior = game.checks.filter((c) => c.serial === card.serial);
  if (prior.length) facts.push(['', `Already checked ${prior.length} time${prior.length > 1 ? 's' : ''} this game.`]);
  facts.push([
    '',
    `Playing for <b>${pattern.name}</b>, ${game.draws.length} ball${game.draws.length === 1 ? '' : 's'} called.`,
  ]);

  $('facts').innerHTML = facts.map(([cls, html]) => `<li class="${cls}"><span>${html}</span></li>`).join('');
  $('check-result').hidden = false;

  lastChecked = { token, at: Date.now() };
  game.checks.push({
    serial: card.serial,
    bingo: res.bingo,
    label: res.wins[0]?.label || '',
    at: Date.now(),
    balls: game.draws.length,
  });
  save();
  renderLog();

  if (res.bingo) {
    sound.fanfare();
    confetti();
  } else {
    sound.buzz();
  }
}

function renderLog() {
  const log = $('check-log');
  log.hidden = !game.checks.length;
  $('check-log-list').innerHTML = game.checks
    .slice()
    .reverse()
    .map(
      (c) =>
        `<li><b>No ${c.serial}</b>: ${c.bingo ? `BINGO (${c.label})` : 'not yet'} · after ${c.balls} ball${c.balls === 1 ? '' : 's'} · ${formatTime(c.at / 1000)}</li>`,
    )
    .join('');
}

// --- Toggles & keys ---------------------------------------------------------------------

function initToggles() {
  const soundBtn = $('sound');
  const syncSound = () => soundBtn.setAttribute('aria-pressed', String(sound.on));
  soundBtn.addEventListener('click', () => {
    sound.on = !sound.on;
    syncSound();
  });
  syncSound();

  const voiceBtn = $('voice');
  const hasVoice = 'speechSynthesis' in window;
  voiceBtn.hidden = !hasVoice;
  const syncVoice = () => voiceBtn.setAttribute('aria-pressed', String(voiceOn));
  voiceBtn.addEventListener('click', () => {
    voiceOn = !voiceOn;
    store.set(VOICE_KEY, voiceOn);
    syncVoice();
    toast(voiceOn ? 'Numbers will be read out loud' : 'Voice off', 1600);
  });
  syncVoice();

  const fsBtn = $('fullscreen');
  fsBtn.hidden = !document.documentElement.requestFullscreen;
  fsBtn.addEventListener('click', toggleFullscreen);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.target.closest('button, a, input, textarea, select')) return;
  if (e.code === 'Space' || e.key === 'Enter') {
    e.preventDefault();
    blow();
  } else if (e.key === 'c' || e.key === 'C') {
    e.preventDefault();
    openCheck();
  } else if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
  }
});

// Another tab (say, one opened from a shared card link) changed the game.
addEventListener('storage', (e) => {
  if (e.key !== GAME_KEY || busy) return;
  game = loadGame();
  machine.sync(remaining());
  renderAll();
});

// --- Boot ------------------------------------------------------------------------------

machine = new BlowerMachine($('globe'), {
  onClack: (s) => sound.clack(s),
  onPoke: () => sound.puff(),
});
machine.load(remaining());

buildBoard();
buildPatternSheet();
initToggles();
renderAll();

// Balls print their numbers in Titan One: redraw them once it has loaded.
Promise.all([document.fonts.load('40px "Titan One"'), document.fonts.load('40px Itim')]).then(() => {
  clearSpriteCache();
  machine.buildSprites();
  drawSlot(busy ? null : slotN);
  renderRack();
});

// Keep the resting ball and the rack sharp when the layout changes size.
let lastSlot = 0;
new ResizeObserver(() => {
  const w = $('now-slot').clientWidth;
  if (w === lastSlot) return;
  lastSlot = w;
  if (slotN != null) drawSlot(slotN);
  if (!busy) renderRack();
}).observe($('now-slot'));

$('blow').addEventListener('click', blow);
$('new-game').addEventListener('click', newGame);
$('check').addEventListener('click', () => openCheck());
$('check-go').addEventListener('click', () => runCheck($('check-input').value));
$('check-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    runCheck(e.target.value);
  }
});
$('check-input').addEventListener('paste', () => setTimeout(() => runCheck($('check-input').value), 0));

const linked = extractToken(location.hash);
if (linked) {
  history.replaceState(null, '', location.pathname);
  openCheck(linked);
}

// Booted: tells the page's load check the game started.
document.documentElement.setAttribute('data-ready', '');
