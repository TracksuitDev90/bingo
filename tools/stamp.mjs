// Cache-busting for GitHub Pages, which lets browsers reuse any file for ten
// minutes. Right after an update, a page could otherwise run new scripts
// against old cached copies of the files they import, and stop dead.
//
// This stamps every reference between the site's own files with a hash of
// the file it points to (`./codec.js?v=1a2b3c4d`): in import statements,
// `new URL(…, import.meta.url)`, <script src>, <link href>, <img src> and
// CSS url(). A changed file gets a new address, and so does everything that
// leads to it, so a browser can only ever load matching copies.
//
// Run after changing anything: npm run stamp
// The tests run it with --check and fail if a stamp is out of date.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const SKIP = new Set(['.git', 'node_modules', 'tests', 'tools', '.scratch']);

// [pattern, index of the quoted path's group] for each kind of file.
const PATTERNS = {
  '.js': [
    /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"?#]+?)(\?v=[0-9a-f]+)?\2/g,
    /(new URL\(\s*)(['"])([^'"?#]+?)(\?v=[0-9a-f]+)?\2(?=\s*,\s*import\.meta\.url)/g,
  ],
  '.html': [/(<(?:script|img)\b[^>]*?\ssrc=|<link\b[^>]*?\shref=)(")([^"?#]+?)(\?v=[0-9a-f]+)?"/g],
  '.css': [/(url\()(['"]?)([^'")?#]+?)(\?v=[0-9a-f]+)?\2(?=\))/g],
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (PATTERNS[path.extname(p)]) out.push(p);
  }
  return out;
}

const stamped = new Map(); // file → final text (or bytes, for assets)
const visiting = new Set();

/** A file's content once its own references are stamped. */
function finalContent(file) {
  if (stamped.has(file)) return stamped.get(file);
  const patterns = PATTERNS[path.extname(file)];
  if (!patterns) {
    const bytes = readFileSync(file);
    stamped.set(file, bytes);
    return bytes;
  }
  if (visiting.has(file)) throw new Error(`Reference cycle through ${path.relative(root, file)}`);
  visiting.add(file);
  let text = readFileSync(file, 'utf8');
  for (const re of patterns) {
    text = text.replace(re, (whole, lead, quote, ref) => {
      if (/^(?:[a-z]+:|\/\/|\/|#)/i.test(ref)) return whole;
      const target = path.resolve(path.dirname(file), ref);
      if (!existsSync(target) || statSync(target).isDirectory()) return whole;
      const hash = createHash('sha256').update(finalContent(target)).digest('hex').slice(0, 8);
      return `${lead}${quote}${ref}?v=${hash}${quote || ''}`;
    });
  }
  visiting.delete(file);
  stamped.set(file, text);
  return text;
}

const stale = [];
for (const file of walk(root)) {
  const text = finalContent(file);
  if (text === readFileSync(file, 'utf8')) continue;
  stale.push(path.relative(root, file));
  if (!check) writeFileSync(file, text);
}
if (check && stale.length) {
  console.error(`Out-of-date stamps in: ${stale.join(', ')}\nRun: npm run stamp`);
  process.exit(1);
}
console.log(check ? 'Stamps are up to date.' : stale.length ? `Stamped ${stale.join(', ')}` : 'Nothing to stamp.');
