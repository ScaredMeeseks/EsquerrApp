/* Does every test file actually get RUN?
 *
 * Mocha is handed an explicit list of files in package.json rather than a
 * directory, so a new suite runs only if someone remembers to add its name to
 * that list. `focus-plan.test.js` was missing from it for several versions and
 * silently never ran — the worst possible failure for a test file, because a
 * suite nobody runs looks exactly like a suite that passes.
 *
 * This is the one test that cannot be forgotten in the same way: it is itself
 * in the list, and it fails the moment a sibling is not.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};

/* Every filename mentioned by ANY script — unit suites, the emulator suites
   under test:functions and test:rules, and the one-off backfill checks. Where
   a suite runs is a judgement call; whether it runs at all is not. */
const registered = new Set();
Object.values(scripts).forEach((cmd) => {
  (String(cmd).match(/[\w.-]+\.test\.js/g) || []).forEach((f) => registered.add(f));
});

describe('the suite registry', () => {
  it('runs every test file in this directory', () => {
    const onDisk = fs.readdirSync(__dirname).filter((f) => /\.test\.js$/.test(f));
    const orphans = onDisk.filter((f) => !registered.has(f));
    assert.deepStrictEqual(orphans, [],
        'these suites are never run by any npm script — add them to ' +
        'package.json: ' + orphans.join(', '));
  });

  it('does not name test files that no longer exist', () => {
    /* The other direction: a renamed or deleted suite leaves a name behind
       that makes mocha exit non-zero, which reads as "the tests are broken"
       rather than "the list is stale". */
    const missing = [...registered]
        .filter((f) => !fs.existsSync(path.join(__dirname, f)));
    assert.deepStrictEqual(missing, [],
        'package.json names suites that are not here: ' + missing.join(', '));
  });

  it('has this very file in the list', () => {
    // Otherwise the guard is as forgettable as what it guards.
    assert.ok(registered.has('suite-registry.test.js'));
  });
});
