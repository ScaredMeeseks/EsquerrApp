/* The markings renderer: geometry -> DOM.
 *
 * board-geom.test.js proves the numbers are right. This proves app.js
 * actually puts them on the page, which is a separate failure mode and
 * the one that produces a board that looks subtly wrong rather than a
 * board that throws.
 *
 * Runs the REAL tbMarkingsHtml, sliced out of js/app.js over the real
 * board-geom module — no re-implementation, so a change to either side
 * shows up here.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const BG = require('../js/board-geom.js');

function grab(src, from, to, label) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in ' + label + ': ' + from);
  return src.slice(i, j);
}

const block = grab(appSrc, '  function tbMarkingsHtml(',
    '  function renderReadOnlyBoard(', 'js/app.js');
const api = new Function('BG',
    block + '\n; return {tbMarkingsHtml, tbFieldInnerStyle, tbFieldOuterStyle};')(BG);

/** Every inline style on elements whose class matches, as one string. */
function styleOf(html, cls) {
  const re = new RegExp('<div class="' + cls + '" style="([^"]*)"');
  const m = re.exec(html);
  return m ? m[1] : null;
}

describe('tbMarkingsHtml', () => {
  it('draws the full set on a full board', () => {
    const html = api.tbMarkingsHtml(null, 'full', false);
    ['tb-halfway', 'tb-center-circle', 'tb-center-spot',
      'tb-penalty-left', 'tb-penalty-right', 'tb-goal-left', 'tb-goal-right',
      'tb-penalty-arc-left', 'tb-penalty-arc-right',
      'tb-penalty-spot-left', 'tb-penalty-spot-right'].forEach((c) => {
      assert.ok(html.indexOf('class="' + c + '"') !== -1, 'missing ' + c);
    });
  });

  it('omits — rather than hides — what a board type does not have', () => {
    /* The CSS used to `display:none` the unused half of the markings.
       Now they are simply not emitted, which is why deleting those
       rules was safe. */
    const html = api.tbMarkingsHtml(null, 'area', false);
    assert.ok(html.indexOf('tb-penalty-right') === -1);
    assert.ok(html.indexOf('tb-center-circle') === -1);
    assert.ok(html.indexOf('tb-halfway') === -1);
    assert.ok(html.indexOf('display:none') === -1,
        'nothing should be emitted just to be hidden');
  });

  it('a half board draws one penalty area, and it is the LEFT slot', () => {
    /* Worth pinning: the old CSS positioned .tb-penalty-RIGHT for half
       and area boards while hiding the left one. board-geom names the
       single box 'Left', so the slots are the other way round from
       what the deleted stylesheet did. Getting this backwards renders
       an empty board with all the geometry computed correctly. */
    const html = api.tbMarkingsHtml(null, 'half', false);
    assert.ok(html.indexOf('tb-penalty-left') !== -1);
    assert.ok(html.indexOf('tb-penalty-right') === -1);
  });

  it('writes real percentages, never NaN or undefined', () => {
    /* A NaN in a style string is silently dropped by the browser and
       the element lands at 0,0 — a whole marking set collapsed into
       the top-left corner, with no error anywhere. */
    ['full', 'half', 'area'].forEach((bt) => {
      [false, true].forEach((vert) => {
        [null, [60, 40, 'f7'], [105, 68, 'f11']].forEach((pitch) => {
          const html = api.tbMarkingsHtml(pitch, bt, vert);
          assert.ok(!/NaN|undefined|null/.test(html),
              bt + '/' + vert + ' emitted a bad value: ' + html.slice(0, 200));
        });
      });
    });
  });

  it('opens each box at the edge it sits on', () => {
    /* The goal line side has no line. The old CSS hardcoded
       `border-left:none` for the left box — correct horizontally,
       wrong the moment the board rotates and that box is at the
       bottom. */
    const h = api.tbMarkingsHtml(null, 'full', false);
    assert.ok(/border-left:none/.test(styleOf(h, 'tb-penalty-left')));
    assert.ok(/border-right:none/.test(styleOf(h, 'tb-penalty-right')));

    const v = api.tbMarkingsHtml(null, 'full', true);
    const vLeft = styleOf(v, 'tb-penalty-left');
    assert.ok(/border-(top|bottom):none/.test(vLeft),
        'a rotated box must open along the other axis, got ' + vLeft);
  });

  it('gives the halfway line a thickness on the axis it is thin', () => {
    // width:0 with a background paints nothing, so a line has to be a
    // 2px box rather than a zero-width one with a border.
    const h = styleOf(api.tbMarkingsHtml(null, 'full', false), 'tb-halfway');
    assert.ok(/width:2px/.test(h) && /height:100%/.test(h), h);
    const v = styleOf(api.tbMarkingsHtml(null, 'full', true), 'tb-halfway');
    assert.ok(/height:2px/.test(v) && /width:100%/.test(v), v);
  });

  it('clips the arcs', () => {
    const h = api.tbMarkingsHtml(null, 'full', false);
    assert.ok(/clip-path:inset\(/.test(styleOf(h, 'tb-penalty-arc-left')));
  });

  it('draws four corner arcs on a full board', () => {
    const html = api.tbMarkingsHtml(null, 'full', false);
    assert.strictEqual((html.match(/class="tb-corner"/g) || []).length, 4);
  });

  it('two on each portrait board type, at the goal line', () => {
    /* The area board included: it spans the full pitch width, so it
       has both corners — which is what makes it usable for the drill
       it is most often opened for, a corner or a cross. */
    ['half', 'area'].forEach((bt) => {
      assert.strictEqual(
          (api.tbMarkingsHtml(null, bt, false).match(/tb-corner/g) || []).length, 2,
          bt + ' should draw two corner arcs');
    });
  });

  it('does NOT clip-path the corner arcs', () => {
    /* They are clipped by .tb-field's overflow:hidden instead — the
       circle is centred on the corner, so the quarter that survives is
       the quarter inside the pitch, in any orientation, with nothing
       to re-derive. A clip-path here would be a second mechanism doing
       the same job and would have to be rotated by hand. */
    const html = api.tbMarkingsHtml(null, 'full', false);
    const first = /<div class="tb-corner" style="([^"]*)"/.exec(html);
    assert.ok(first, 'no corner emitted');
    assert.ok(!/clip-path/.test(first[1]), first[1]);
  });

  it('does not clip the centre circle', () => {
    // It is a whole circle; a stray inset would eat three quarters of it.
    const h = api.tbMarkingsHtml(null, 'full', false);
    assert.ok(!/clip-path/.test(styleOf(h, 'tb-center-circle')));
  });
});

describe('the field box styles', () => {
  it('replaces the hardcoded 62% with the pitch aspect', () => {
    /* 68/105 is 64.76%, not 62 — the old constant described a 105x65
       pitch while the markings assumed 105x68. */
    assert.ok(/padding-top:64\.7\d%/.test(api.tbFieldInnerStyle(null, 'full', false)),
        api.tbFieldInnerStyle(null, 'full', false));
  });

  it('a resized pitch changes the box shape', () => {
    const wide = api.tbFieldInnerStyle([105, 68, 'f11'], 'full', false);
    const narrow = api.tbFieldInnerStyle([105, 45, 'f11'], 'full', false);
    assert.notStrictEqual(wide, narrow);
  });

  it('only the CSS-rotated board types get compensating margins', () => {
    assert.strictEqual(api.tbFieldOuterStyle(null, 'full', true), '');
    assert.strictEqual(api.tbFieldOuterStyle(null, 'half', false), '');
    assert.ok(/margin-top:calc\(/.test(api.tbFieldOuterStyle(null, 'half', true)));
  });

  it('reproduces the old hardcoded HALF margin from the geometry', () => {
    /* The deleted CSS said calc(11.5% + 1rem) for a half board, which
       is (100 - 77)/2. Landing back on it from the geometry is the
       evidence that the formula is the one the CSS encoded.

       The area board deliberately does NOT match its old 21%: it was
       widened to the full pitch width so it would carry both corners,
       which changes its aspect from 58% to about 51%. The next test
       pins that divergence so it reads as a decision rather than
       as drift. */
    approxPct(api.tbFieldOuterStyle([105, 68], 'half', true), 11.5, 0.6);
  });

  it('the area margin follows the widened area board', () => {
    const area = api.tbFieldOuterStyle([105, 68], 'area', true);
    approxPct(area, (100 - 51.47) / 2, 0.6);
  });
});

function approxPct(style, expected, tol) {
  const m = /margin-top:calc\(([\d.]+)%/.exec(style);
  assert.ok(m, 'no margin in ' + style);
  const got = parseFloat(m[1]);
  assert.ok(Math.abs(got - expected) < tol,
      'expected about ' + expected + '%, got ' + got + '%');
}
