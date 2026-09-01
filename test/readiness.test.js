/* Unit tests for the Ready cell.
 *
 * Pure logic, no emulator: `npm run test:readiness`.
 *
 * The roster, the training-detail attendance table and the convocatòria all
 * rendered this independently and had drifted to the same bug: a player with
 * NO readiness data was painted GREEN. On a club whose data had just been
 * wiped that meant an entire squad reading as fully ready while the app knew
 * nothing about any of them. They now share readinessCellHtml().
 *
 * The thresholds themselves are untouched — they encode a clinical
 * judgement. These tests cover presentation only, which is exactly the scope
 * of the change.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

const TIPS = {
  'readiness.no_data': 'Not enough data yet',
  'readiness.injured_warning': 'Careful — player currently injured',
};

function loadCell() {
  /* From plReadinessReasons down. The reason sentence was lifted out of
     readinessCellHtml so a caller with its own tooltip can show the same
     words rather than nest a second one inside it — the Plantilla table
     does exactly that. Slicing the cell alone leaves the helper
     undefined and every case in this file throws. */
  const code = grab('  function plReadinessReasons(rd, injured)',
      '  function buildReadinessCard');
  // eslint-disable-next-line no-new-func
  return new Function('t', 'sanitize', `${code}\nreturn readinessCellHtml;`)(
      (k) => TIPS[k] || k,
      (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'));
}

const cell = loadCell();
const NO_DATA = { hasData: false };
const READY = { hasData: true, color: 'green', score: 88 };
const WATCH = { hasData: true, color: 'orange', score: 62 };
const RISK = { hasData: true, color: 'red', score: 41 };

describe('app.js — readiness cell, no data', () => {
  it('is never green', () => {
    // The whole point of the change.
    const html = cell(NO_DATA, false);
    assert.ok(!html.includes('readiness-green'), html);
  });

  it('is grey and says why', () => {
    const html = cell(NO_DATA, false);
    assert.ok(html.includes('readiness-nodata'), html);
    assert.ok(html.includes(TIPS['readiness.no_data']), html);
  });

  it('shows no score at all, not a dash', () => {
    // A dash occupies the column as though it were a reading.
    const html = cell(NO_DATA, false);
    assert.ok(!html.includes('readiness-score'), html);
    assert.ok(!html.includes('—'), html);
  });

  it('still warns when the player is also injured', () => {
    const html = cell(NO_DATA, true);
    assert.ok(html.includes(TIPS['readiness.injured_warning']), html);
    assert.ok(html.includes(TIPS['readiness.no_data']), html);
  });
});

describe('app.js — readiness cell, with data', () => {
  [READY, WATCH, RISK].forEach((rd) => {
    it(`shows the ${rd.color} score in the cell, not only on hover`, () => {
      // It used to live solely in a mouse tooltip, so it was invisible on a
      // phone.
      const html = cell(rd, false);
      assert.ok(html.includes('readiness-dot readiness-' + rd.color), html);
      assert.ok(html.includes('>' + rd.score + '<'), html);
    });
  });

  it('carries no tooltip for a fit player with data', () => {
    // Nothing useful to say; a tooltip that adds nothing is noise.
    assert.ok(!cell(READY, false).includes('data-tooltip'), cell(READY, false));
  });

  it('keeps the load colour for an injured player but warns', () => {
    // Readiness stays a pure LOAD metric and deliberately does not read the
    // injury log — the warning is what stops the Ready and Status columns
    // appearing to contradict each other.
    const html = cell(READY, true);
    assert.ok(html.includes('readiness-green'), html);
    assert.ok(html.includes('>88<'), html);
    assert.ok(html.includes(TIPS['readiness.injured_warning']), html);
  });
});

describe('app.js — readiness cell wiring', () => {
  it('is reached from every screen that shows it, and only through shared code', () => {
    /* Three call sites: the roster table, the training-detail table, and
       playerStatusHtml() — which is itself the shared path for the match
       call-up AND the New Training page. playerStatusHtml used to be a
       local inside renderConvocatoria; lifting it out is what stops those
       two screens disagreeing about what "doubt" looks like. */
    const uses = (src.match(/(?<!function )readinessCellHtml\(/g) || []).length;
    assert.strictEqual(uses, 3, 'roster, training detail, playerStatusHtml');

    const shared = (src.match(/(?<!function )playerStatusHtml\(/g) || []).length;
    assert.ok(shared >= 2, 'the call-up and New Training both go through it');
    assert.ok(!/function playerStatusHtml/.test(src.split('renderConvocatoria')[1] || ''),
        'it must stay module-level, not slide back inside a render function');
  });

  it('leaves no call site painting missing data green', () => {
    assert.ok(!src.includes("rd.hasData ? rd.color : 'green'"),
        'a render site still falls back to green when there is no data');
    assert.ok(!src.includes("!rd.hasData ? '#4caf50'"),
        'the A/C ratio cell still goes green when there is no data');
  });

  it('has styles for every state it can emit', () => {
    ['readiness-nodata', 'readiness-cell', 'readiness-score',
      'readiness-score-green', 'readiness-score-orange', 'readiness-score-red']
        .forEach((c) => assert.ok(css.includes('.' + c), 'missing CSS: .' + c));
  });

  it('translates the injury warning into all three languages', () => {
    const m = src.match(/'readiness\.injured_warning':\s*\{([^}]+)\}/);
    assert.ok(m, 'key missing');
    ['ca:', 'es:', 'en:'].forEach((l) => assert.ok(m[1].includes(l), 'missing ' + l));
  });
});
