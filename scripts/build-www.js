#!/usr/bin/env node
/*
 * Build the Capacitor web mirror: repo root -> www/
 *
 * ONE definition of what ships inside the APK. There used to be two — a
 * PowerShell one-liner in package.json and an rsync in the CI workflow — and
 * they excluded different sets, so what a local build put in the app and what
 * CI put in the app were not the same thing. The CI one is authoritative
 * because it is what reaches devices, so this reproduces it and CI asserts
 * the result.
 *
 * The list is an EXCLUDE list, which means anything new in the repo root
 * ships by default. That is how the APK ended up carrying CONTEXT.md (239
 * KB), the whole test suite, firestore.rules and five debug pages that were
 * live routes inside the WebView. An APK is a zip. Add to DENY when adding
 * anything to the root that is not part of the app.
 *
 *   node scripts/build-www.js            build
 *   node scripts/build-www.js --check    verify only, non-zero if dev files leaked
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www');

/** Exact names never copied. */
const DENY_EXACT = new Set([
  'android', 'ios', 'node_modules', 'www', 'scripts',
  '.git', '.github', '.claude', '.vscode',
  'package.json', 'package-lock.json', 'capacitor.config.json',
  'functions', 'test', 'tools',
  'firebase.json', '.firebaserc', '.gitignore', '.gitattributes',
  'deploy.ps1', 'deploy.sh',
]);

/** Patterns never copied, tested against the root-level entry name. */
const DENY_PATTERN = [
  /\.md$/i,          // CONTEXT/CLAUDE/HANDOFF/PROJECT_SUMMARY — 270 KB of notes
  /\.rules$/i,       // firestore.rules / storage.rules — the authz model
  /-preview\.html$/i, // font-preview, line-color-preview, new-season-preview…
  /-debug\.html$/i,  // body-map-debug
  /\.log$/i,         // firestore-debug.log etc — emulator leftovers, found
                     // by running this the first time. Gitignored, so CI
                     // never sees them, but a local cap:sync would have
                     // bundled one straight into the APK.
];

function denied(name) {
  return DENY_EXACT.has(name) || DENY_PATTERN.some((re) => re.test(name));
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, {recursive: true});
  for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function build() {
  fs.rmSync(OUT, {recursive: true, force: true});
  fs.mkdirSync(OUT, {recursive: true});
  let n = 0;
  for (const entry of fs.readdirSync(ROOT, {withFileTypes: true})) {
    if (denied(entry.name)) continue;
    const from = path.join(ROOT, entry.name);
    const to = path.join(OUT, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
    n++;
  }
  console.log('build-www: copied ' + n + ' root entries into www/');
}

/** The app is useless without these, and a broken exclude would drop them. */
const REQUIRED = ['index.html', 'sw.js', 'manifest.json',
  path.join('js', 'app.js'), path.join('css', 'style.css')];

function check() {
  const problems = [];
  if (!fs.existsSync(OUT)) {
    console.error('build-www --check: www/ does not exist');
    process.exit(1);
  }
  for (const name of fs.readdirSync(OUT)) {
    if (denied(name)) problems.push('dev file shipped: www/' + name);
  }
  for (const rel of REQUIRED) {
    if (!fs.existsSync(path.join(OUT, rel))) problems.push('missing: www/' + rel);
  }
  if (problems.length) {
    problems.forEach((p) => console.error('build-www: ' + p));
    process.exit(1);
  }
  console.log('build-www --check: www/ is clean');
}

if (process.argv.includes('--check')) check();
else { build(); check(); }
