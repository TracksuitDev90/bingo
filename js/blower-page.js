import { BALLS, LETTERS, PATTERNS, letterOf, callName, checkCard, patternPreview } from './bingo.js';
import { randomInt, hash } from './rng.js';
import { BlowerMachine, BALL_COLORS } from './machine.js';
import { paintSplotch, markJitter } from './dauber.js';
import { openCard, extractToken } from './codec.js';
import { createCardView } from './cardview.js';
import { sound } from './sound.js';
import { confetti } from './confetti.js';
import { store, toast, confirmSheet, openSheet, formatTime } from './ui.js';

const GAME_KEY = 'bingo:game';
const VOICE_KEY = 'bingo:voice';
const LABEL_INK = { B: '#163a8a', I: '#a50d2a', N: '#1d3e9e', G: '#0b6b35', O: '#b35a00' };
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

// --- Balls ---------------------------------------------------------------------------

function ballEl(n) {
  const L = letterOf(n);
  const el = document.createElement('div');
  el.className = `ball ball--${L}`;
  el.style.setProperty('--c', BALL_COLORS[L]);
  el.style.setProperty('--t', LABEL_INK[L]);
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${L} ${n}`);
  el.innerHTML = `<div class="ball__label"><span class="ball__letter">${L}</span><span class="ball__num">${n}</span></div>`;
  return el;
}

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
    if (L === 'N') badge.style.setProperty('--t-on', 'var(--royal)');
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
  const size = Math.round(Math.min(tile.offsetWidth, tile.offsetHeight) * 1.25);
  if (!size) return;
  const seed = hash(game.id, n);
  const j = markJitter(seed);
  const daub = document.createElement('div');
  daub.className = 'daub' + (animate ? ' daub--fresh' : '');
  daub.style.setProperty('--dx', `${j.dx * 60}%`);
  daub.style.setProperty('--dy', `${j.dy * 60}%`);
  daub.style.setProperty('--rot', `${j.rot}deg`);
  const c = document.createElement('canvas');
  paintSplotch(c, { color: '#e5143a', seed, size });
  daub.append(c);
  tile.append(daub);
}

function renderBoard() {
  for (const [, t] of tiles) {
    t.classList.remove('is-called', 'is-latest');
    t.querySelector('.daub')?.remove();
  }
  for (const n of calledNumbers()) daubTile(n, false);
  const last = game.draws.at(-1);
  if (last) tiles.get(last.n).classList.add('is-latest');
}

// --- Caller panel --------------------------------------------------------------------

function renderNow({ fresh = false } = {}) {
  const last = game.draws.at(-1);
  const slot = $('now-slot');
  slot.replaceChildren();
  slot.classList.toggle('is-empty', !last);
  if (last) {
    const b = ballEl(last.n);
    if (fresh) b.classList.add('is-landing');
    slot.append(b);
  } else {
    slot.textContent = 'Press Blow to start';
  }
  const text = $('call-text');
  text.textContent = last ? callName(last.n) : '';
  text.classList.remove('is-new');
  if (fresh) {
    void text.offsetWidth;
    text.classList.add('is-new');
  }
  $('count').textContent = last ? `Ball ${game.draws.length} of ${BALLS}` : 'Ready when you are';
  const recent = $('recent');
  recent.replaceChildren(
    ...game.draws
      .slice(-7, -1)
      .reverse()
      .map((d) => ballEl(d.n)),
  );
  const left = BALLS - game.draws.length;
  $('left').textContent = left ? `${left} ball${left === 1 ? '' : 's'} in the globe` : 'Globe empty';
  const blowBtn = $('blow');
  blowBtn.disabled = busy || left === 0;
  blowBtn.firstChild.textContent = left === 0 ? 'All 75 called ' : 'Blow next ball ';
}

const renderAll = () => {
  renderBoard();
  renderNow();
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
  $('blow').disabled = true;

  // The fair part: one uniformly random pick from the balls still in the globe.
  const n = pool[randomInt(pool.length)];
  const t = Date.now();
  game.startedAt ??= t;
  game.draws.push({ n, t });
  save();

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
  if (from && !reduceMotion) await flyToSlot(n, from);
  for (const t of tiles.values()) t.classList.remove('is-latest');
  daubTile(n, true);
  tiles.get(n).classList.add('is-latest');
  busy = false;
  renderNow({ fresh: true });
  speak(n);
}

async function flyToSlot(n, from) {
  const slot = $('now-slot');
  const rect = slot.getBoundingClientRect();
  const size = rect.width;
  const fly = ballEl(n);
  fly.classList.add('is-flying');
  fly.style.setProperty('--size', `${size}px`);
  document.body.append(fly);
  const s0 = (from.r * 2) / size;
  const x0 = from.x - size / 2;
  const y0 = from.y - size / 2;
  const x1 = rect.left;
  const y1 = rect.top;
  const midY = Math.min(y0, y1) - size * 0.3;
  const anim = fly.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(${s0}) rotate(-120deg)` },
      { transform: `translate(${x0 + (x1 - x0) * 0.4}px, ${midY}px) scale(${0.35 + s0}) rotate(-40deg)`, offset: 0.4 },
      { transform: `translate(${x1}px, ${y1}px) scale(1) rotate(0deg)` },
    ],
    { duration: 820, easing: 'cubic-bezier(.35,.6,.25,1)' },
  );
  await anim.finished.catch(() => {});
  fly.remove();
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

machine = new BlowerMachine($('globe'), { onClack: (s) => sound.clack(s) });
machine.load(remaining());
document.fonts.load('40px "Titan One"').then(() => machine.buildSprites());

buildBoard();
buildPatternSheet();
initToggles();
renderAll();

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
