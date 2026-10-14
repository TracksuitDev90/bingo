// Cache-busting for GitHub Pages, which lets browsers reuse any file for ten
// minutes. Right after an update, a page could otherwise run new scripts
// against old cached copies of the files they import, and stop dead.
//
// This stamps every reference between the site's own files with a hash
// (`./codec.js?v=1a2b3c4d`): in import statements, `new URL(…,
// import.meta.url)`, <script src>, <link href>, <img src> and CSS url(). A
// file's hash covers it and everything it leads to, so a change anywhere
// gives every page that uses it new addresses: a freshly loaded page always
// gets matching copies.
//
// It can't do the same for a page that's already in the browser's cache:
// GitHub Pages ignores the ?v=, so if one of that page's old addresses has
// expired, it comes back with the new file. The game pages catch that (and
// any other failure to start) and offer a Reload that fetches fresh copies.
//
// Run after changing anything: npm run stamp
// The tests run it with --check and fail if a stamp is out of date.
// --root <dir> stamps another folder (the tests use it).

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const rootArg = argv.indexOf('--root');
const root = path.resolve(
  rootArg >= 0 ? argv[rootArg + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
);

// For each kind of file, patterns whose groups are (lead, quote, path, old stamp).
const PATTERNS = {
  '.js': [
    /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"?#]+?)(\?v=[0-9a-f]+)?\2/g,
    /(new URL\(\s*)(['"])([^'"?#]+?)(\?v=[0-9a-f]+)?\2(?=\s*,\s*import\.meta\.url)/g,
  ],
  '.html': [/(<(?:script|img)\b[^>]*?\ssrc=|<link\b[^>]*?\shref=)(")([^"?#]+?)(\?v=[0-9a-f]+)?"/g],
  '.css': [/(url\()(['"]?)([^'")?#]+?)(\?v=[0-9a-f]+)?\2(?=\))/g],
};
// Text files are hashed with Unix line endings, so a Windows checkout agrees.
const TEXT = new Set(['.js', '.html', '.css', '.svg', '.json', '.txt']);
const STAMP = /\?v=[0-9a-f]{8}/g;

/** The site files that get stamped: tracked or new files, not tests or tools. */
function siteFiles() {
  const wanted = (rel) => PATTERNS[path.extname(rel)] && !/^(tests|tools)\//.test(rel.split(path.sep).join('/'));
  let rels;
  try {
    rels = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\0');
    // Only trust git's list if this folder is the top of its own repository.
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim();
    if (path.resolve(top) !== root) rels = null;
  } catch {
    rels = null;
  }
  if (!rels) {
    rels = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (name.startsWith('.') || name === 'node_modules') continue;
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else rels.push(path.relative(root, p));
      }
    };
    walk(root);
  }
  return rels
    .filter((r) => r && wanted(r))
    .map((r) => path.join(root, r))
    .filter((p) => existsSync(p));
}

/** Calls fn(lead, quote, ref, target) for each reference in a file; returns the rewritten text. */
function eachRef(file, text, fn) {
  for (const re of PATTERNS[path.extname(file)] || []) {
    text = text.replace(re, (whole, lead, quote, ref) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(ref)) return whole;
      const target = path.resolve(path.dirname(file), ref);
      // Pages link to pages for navigation, not as parts of themselves.
      if (path.extname(target) === '.html') return whole;
      if (!existsSync(target) || statSync(target).isDirectory()) return whole;
      return fn(lead, quote, ref, target) ?? whole;
    });
  }
  return text;
}

const texts = new Map();
const read = (file) => {
  if (!texts.has(file)) texts.set(file, readFileSync(file, 'utf8'));
  return texts.get(file);
};
const links = new Map();
function targetsOf(file) {
  if (!links.has(file)) {
    const out = new Set();
    if (PATTERNS[path.extname(file)]) eachRef(file, read(file), (l, q, r, target) => void out.add(target));
    links.set(file, [...out]);
  }
  return links.get(file);
}

/** Hash of a file and everything it leads to (cycles are fine), ignoring existing stamps. */
const hashes = new Map();
function stampOf(file) {
  if (hashes.has(file)) return hashes.get(file);
  const seen = new Set([file]);
  const todo = [file];
  while (todo.length) for (const t of targetsOf(todo.pop())) if (!seen.has(t)) seen.add(t) && todo.push(t);
  const h = createHash('sha256');
  for (const f of [...seen].sort()) {
    h.update(path.relative(root, f).split(path.sep).join('/') + '\0');
    h.update(TEXT.has(path.extname(f)) ? read(f).replace(/\r\n/g, '\n').replace(STAMP, '') : readFileSync(f));
    h.update('\0');
  }
  const v = h.digest('hex').slice(0, 8);
  hashes.set(file, v);
  return v;
}

// Work everything out first, then write, so a failure never leaves a half-stamped tree.
const changes = [];
for (const file of siteFiles()) {
  const before = read(file);
  const after = eachRef(
    file,
    before,
    (lead, quote, ref, target) => `${lead}${quote}${ref}?v=${stampOf(target)}${quote}`,
  );
  if (after !== before) changes.push([file, after]);
}
const names = changes.map(([f]) => path.relative(root, f)).join(', ');
if (check) {
  if (changes.length) {
    console.error(`Out-of-date stamps in: ${names}\nRun: npm run stamp`);
    process.exit(1);
  }
  console.log('Stamps are up to date.');
} else {
  for (const [file, text] of changes) writeFileSync(file, text);
  console.log(changes.length ? `Stamped ${names}` : 'Nothing to stamp.');
}
