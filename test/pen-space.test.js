/* Pen lines and the coordinate space they are stored in.
 *
 * Every geometry layer on the tactical board normalises to the HORIZONTAL
 * full pitch on the way out — saveArrows and saveRects run their endpoints
 * through toHorizontal, saveBalls, saveCones and saveTexts do the same. Pen
 * lines were the one exception: savePenLines stored the raw display points,
 * with a comment saying so.
 *
 * That is a real bug, not a tidiness complaint. Orientation is a per-DEVICE
 * preference (fa_tactic_orient is deliberately not part of a saved board), so
 * a stroke drawn on a phone held portrait came back rotated on the coach's
 * laptop. Arrows on the same board did not move. The stroke and the arrow
 * pointing at it drifted apart.
 *
 * The fix cannot simply reinterpret what is already stored: nothing records
 * which orientation an old stroke was drawn in. So `penSpace` marks the space
 * explicitly, '' means "legacy, render raw exactly as before", and a re-save
 * heals the board using the same orientation its raw render was already
 * assuming — what the coach sees is what gets stored.
 *
 * These tests run the REAL helpers, sliced out of app.js, rather than copies.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function grab(src, from, to, label) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in ' + label + ': ' + from);
  return src.slice(i, j);
}

/* The orientation swap plus the two pen converters, in one slice — they are
   adjacent in the source and the converters call toDisplay/toHorizontal, so
   taking them together is what makes this a test of the real thing. */
function makePen(opts) {
  opts = opts || {};
  const store = opts.store || {};
  const block = grab(appSrc,
      '    function toDisplay(hLeft, hTop) {',
      '    function saveState()', 'js/app.js');

  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };

  // BS supplies the 2dp rounding the converters share with every other
  // layer — see board-state.js.
  const fn = new Function('useJsSwap', 'localStorage', 'BS',
      block + '\n; return {toDisplay, toHorizontal, penIsNormalised, ' +
      'penPointsToDisplay, penPointsToHorizontal};');
  return fn(() => !!opts.vertical, localStorage, require('../js/board-state.js'));
}

describe('the pen coordinate converters', () => {
  it('are a no-op on a horizontal board', () => {
    // Horizontal display space IS horizontal storage space. If this ever
    // changed, every existing board would move.
    const p = makePen({vertical: false, store: {fa_tactic_pen_space: 'h'}});
    assert.strictEqual(p.penPointsToHorizontal('10,20 30,40'), '10,20 30,40');
    assert.strictEqual(p.penPointsToDisplay('10,20 30,40'), '10,20 30,40');
  });

  it('round-trip through the vertical swap', () => {
    const p = makePen({vertical: true, store: {fa_tactic_pen_space: 'h'}});
    const drawn = '10,20 30,40 55.5,60.25';
    const stored = p.penPointsToHorizontal(drawn);
    assert.notStrictEqual(stored, drawn, 'a vertical stroke must NOT store as drawn');
    assert.strictEqual(p.penPointsToDisplay(stored), drawn);
  });

  it('stores a vertical stroke in the same space an arrow would', () => {
    /* The whole point. Draw a stroke and an arrow through the same two
       points on a vertical board; both must land on the same numbers. */
    const p = makePen({vertical: true, store: {fa_tactic_pen_space: 'h'}});
    const arrow = p.toHorizontal(10, 20).map((n) => Math.round(n * 100) / 100);
    const pen = p.penPointsToHorizontal('10,20').split(',').map(Number);
    assert.deepStrictEqual(pen, arrow);
  });

  it('rounds to 2dp, like every other layer', () => {
    const p = makePen({vertical: false, store: {fa_tactic_pen_space: 'h'}});
    assert.strictEqual(p.penPointsToHorizontal('10.123456,20.987654'), '10.12,20.99');
  });

  it('survives the extra whitespace an SVG points attribute may carry', () => {
    const p = makePen({vertical: false, store: {fa_tactic_pen_space: 'h'}});
    assert.strictEqual(p.penPointsToHorizontal('  10,20   30,40  '), '10,20 30,40');
  });
});

describe('legacy boards are left alone', () => {
  it('renders an unmarked board raw, even when vertical', () => {
    /* The load-bearing back-compat guarantee. Applying the swap to a board
       that predates the flag would move every stroke drawn before this
       version the first time it was opened. */
    const p = makePen({vertical: true, store: {}});
    assert.strictEqual(p.penIsNormalised(), false);
    assert.strictEqual(p.penPointsToDisplay('10,20 30,40'), '10,20 30,40');
  });

  it('still normalises on the way OUT, so a re-save heals the board', () => {
    // toHorizontal is unconditional: the DOM is always display space.
    const p = makePen({vertical: true, store: {}});
    assert.notStrictEqual(p.penPointsToHorizontal('10,20'), '10,20');
  });
});

describe('the source still does what these tests assume', () => {
  it('savePenLines normalises and stamps the flag', () => {
    const src = grab(appSrc, '    function savePenLines()',
        '    function spawnPenLine', 'js/app.js');
    assert.ok(/penPointsToHorizontal\(pts\)/.test(src),
        'savePenLines must normalise the points it stores');
    assert.ok(/fa_tactic_pen_space', 'h'/.test(src),
        'savePenLines must stamp the space it just wrote');
    assert.ok(!/Store raw display points/.test(src),
        'the old raw-display comment should be gone with the behaviour');
  });

  it('every path that spawns a stroke converts it first', () => {
    /* Two call sites restore strokes into the SVG — the initial editor
       restore and applyFrameState. One converting and the other not is
       exactly how a board ends up drawing differently before and after you
       press play, so both are pinned. */
    const calls = appSrc.match(/spawnPenLine\([^)]*\)/g) || [];
    const restores = calls.filter((c) => !/pointsStr/.test(c) && /p\[0\]/.test(c));
    assert.ok(restores.length >= 2,
        'expected both restore call sites, found ' + restores.length);
    restores.forEach((c) => {
      assert.ok(/penPointsToDisplay\(p\[0\]\)/.test(c),
          'restore site does not convert: ' + c);
    });
  });

  it('applyFrameState converts cones, like it converts balls', () => {
    /* Same family of bug, one line over: saveCones normalises to horizontal
       but the frame restore was spawning them raw, so a cone jumped across
       the pitch every time you stepped a frame on a vertical board. */
    const src = grab(appSrc, '      inner.querySelectorAll(\'.tb-cone\').forEach',
        '      clearSelection();', 'js/app.js');
    assert.ok(/toDisplay\(c\[0\], c\[1\]\)/.test(src),
        'cone restore must go through toDisplay');
  });

  it('undo carries penSpace alongside penLines', () => {
    /* The v90 scramble was two lists that had to stay in lockstep and did
       not. penSpace has to be in BOTH the snapshot and the restore pairs, or
       undoing the first stroke on a legacy board renders the restored
       display-space points as though they were horizontal. */
    const push = grab(appSrc, '    function pushUndo()', '    function popUndo()',
        'js/app.js');
    assert.ok(/penSpace: localStorage\.getItem\('fa_tactic_pen_space'\)/.test(push),
        'pushUndo must snapshot the flag');
    const pop = grab(appSrc, '      const UNDO_KEYS = [', '      UNDO_KEYS.forEach',
        'js/app.js');
    assert.ok(/\['penSpace',\s*'fa_tactic_pen_space'\]/.test(pop),
        'popUndo must restore the flag');
  });

  it('the editor scratch keys are cleared and reset together', () => {
    const src = grab(appSrc, '  function tbClearEditor()',
        '  /** The template currently open in the editor', 'js/app.js');
    assert.ok(/'fa_tactic_pen_space', 'fa_tactic_pitch'/.test(src),
        'both new scratch keys must be in the clear list');
    assert.ok(/setItem\('fa_tactic_pen_space', 'h'\)/.test(src),
        'a blank board must start normalised, not legacy');
  });
});
