// The site's own files point at each other with content hashes, so browsers
// never mix old cached files with new ones (see tools/stamp.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const STAMP = path.resolve('tools/stamp.mjs');
const run = (...args) => execFileSync(process.execPath, [STAMP, ...args], { encoding: 'utf8' });

test('every reference between site files carries an up-to-date hash', () => {
  assert.doesNotThrow(() => run('--check'), 'stamps are stale: run `npm run stamp`');
});

test('stamps cover imports, module scripts, stylesheets, fonts and images', () => {
  const blower = readFileSync('pokemon/blower.html', 'utf8');
  assert.match(blower, /src="\.\.\/js\/pokemon\/blower-page\.js\?v=[0-9a-f]{8}"/);
  assert.match(blower, /href="\.\.\/css\/base\.css\?v=[0-9a-f]{8}"/);
  assert.match(blower, /href="\.\.\/assets\/fonts\/luckiest-guy\.woff2\?v=[0-9a-f]{8}"/);
  assert.match(readFileSync('js/pokemon/blower-page.js', 'utf8'), /from '\.\.\/codec\.js\?v=[0-9a-f]{8}'/);
  assert.match(readFileSync('js/pokemon/sprites.js', 'utf8'), /sprites\.webp\?v=[0-9a-f]{8}', import\.meta\.url/);
  assert.match(readFileSync('css/base.css', 'utf8'), /url\(\.\.\/assets\/img\/paper\.jpg\?v=[0-9a-f]{8}\)/);
  // A font preload and its @font-face must share one URL, or the font downloads twice.
  const pre = blower.match(/luckiest-guy\.woff2\?v=([0-9a-f]{8})/)[1];
  assert.match(readFileSync('css/pokemon/theme.css', 'utf8'), new RegExp(`luckiest-guy\\.woff2\\?v=${pre}`));
});

test('every game page carries the same load check', () => {
  const block = (f) =>
    readFileSync(f, 'utf8').match(/<script>\n\s*\/\/ If the game's scripts can't start[\s\S]*?<\/script>/)?.[0];
  const pages = ['blower.html', 'card.html', 'pokemon/blower.html', 'pokemon/card.html'];
  const first = block(pages[0]);
  assert.ok(first && first.includes("cache: 'reload'"));
  for (const p of pages) assert.equal(block(p), first, `${p}'s load check differs`);
});

/** A tiny site in a temp folder; returns its path. */
function site(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'stamp-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
}
const stamp = (dir, ...args) => spawnSync(process.execPath, [STAMP, '--root', dir, ...args], { encoding: 'utf8' });
const read = (dir, name) => readFileSync(path.join(dir, name), 'utf8');

test('stamping copes with circular imports and pages linking to pages', () => {
  const dir = site({
    'index.html': '<link rel="canonical" href="index.html"><script type="module" src="a.js"></script>',
    'a.js': "import { b } from './b.js';\nexport const a = 1;\n",
    'b.js': "import { a } from './a.js';\n// import { b } from './b.js';\nexport const b = 2;\n",
  });
  try {
    assert.equal(stamp(dir).status, 0);
    assert.match(read(dir, 'index.html'), /href="index\.html"/, 'page links stay as they are');
    assert.match(read(dir, 'index.html'), /src="a\.js\?v=[0-9a-f]{8}"/);
    assert.match(read(dir, 'a.js'), /'\.\/b\.js\?v=[0-9a-f]{8}'/);
    assert.equal(stamp(dir, '--check').status, 0, 'a second run changes nothing');
    // A change anywhere in the cycle gives the page a new address for a.js.
    const before = read(dir, 'index.html');
    writeFileSync(path.join(dir, 'b.js'), read(dir, 'b.js').replace('= 2', '= 3'));
    assert.equal(stamp(dir, '--check').status, 1);
    assert.equal(stamp(dir).status, 0);
    assert.notEqual(read(dir, 'index.html'), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Windows line endings give the same stamps', () => {
  const files = {
    'index.html': '<link rel="stylesheet" href="s.css">\n<script type="module" src="a.js"></script>\n',
    'a.js': "import { b } from './b.js';\nexport const a = b;\n",
    'b.js': 'export const b = 2;\n',
    's.css': 'body {\n  color: red;\n}\n',
  };
  const lf = site(files);
  const crlf = site(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.replace(/\n/g, '\r\n')])));
  try {
    stamp(lf);
    stamp(crlf);
    assert.equal(read(crlf, 'index.html').replace(/\r\n/g, '\n'), read(lf, 'index.html'));
  } finally {
    rmSync(lf, { recursive: true, force: true });
    rmSync(crlf, { recursive: true, force: true });
  }
});

test('a wrong stamp is caught and fixed', () => {
  const dir = site({ 'index.html': '<script type="module" src="a.js?v=00000000"></script>', 'a.js': 'export {};\n' });
  try {
    assert.equal(stamp(dir, '--check').status, 1);
    assert.equal(stamp(dir).status, 0);
    assert.doesNotMatch(read(dir, 'index.html'), /v=00000000/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
