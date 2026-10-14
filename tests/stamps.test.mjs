// The site's own files point at each other with content hashes, so browsers
// never mix old cached files with new ones (see tools/stamp.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (...args) => execFileSync(process.execPath, ['tools/stamp.mjs', ...args], { encoding: 'utf8' });

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
