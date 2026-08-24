/* Resizing the pitch: the two routes and the one setter.
 *
 * A coach sets the perimeter either by typing metres or by dragging a
 * grip on the goal line / touchline. Both go through setPitch(), which
 * is what makes the clamp, the undo entry and the re-render impossible
 * to apply on one route and forget on the other.
 *
 * The grip axis mapping is the part most likely to be wrong and least
 * likely to look wrong: on a vertical full board the pitch is rotated
 * on screen, so the grip that owns the pitch LENGTH is the one running
 * horizontally. Get it backwards and dragging the touchline changes
 * the length — which still produces a plausible pitch.
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

/* gripPitchFor is self-contained apart from BG, curBoardType and
   isVertical, so it lifts cleanly. */
function makeGrip(opts) {
  opts = opts || {};
  const block = grab(appSrc, '    function gripPitchFor(e, drag, axis) {',
      '\n    // --- Silhouette picker ---', 'js/app.js');
  return new Function('BG', 'curBoardType', 'isVertical',
      block + '\n; return gripPitchFor;')(
      BG,
      () => opts.boardType || 'full',
      () => !!opts.vertical);
}

const RECT = {left: 0, top: 0, width: 800, height: 500,
  right: 800, bottom: 500};

describe('dragging a grip', () => {
  const gripFor = makeGrip({});

  it('halving the box halves the dimension the grip owns', () => {
    const drag = {start: [105, 68], rect: RECT};
    // Pointer at 50% across -> length scales by 0.5.
    const out = gripFor({clientX: 400, clientY: 250}, drag, 'x');
    assert.strictEqual(out[0], 53);          // round(105 * 0.5)
    assert.strictEqual(out[1], 68);          // width untouched
  });

  it('the y grip owns the width and leaves the length alone', () => {
    // Start wide enough that halving stays above the 42.32 m floor,
    // so this tests the AXIS and not the clamp.
    const drag = {start: [105, 90], rect: RECT};
    const out = gripFor({clientX: 400, clientY: 250}, drag, 'y');
    assert.strictEqual(out[0], 105);
    assert.strictEqual(out[1], 45);
  });

  it('a width drag below the floor is clamped, not accepted', () => {
    const drag = {start: [105, 68], rect: RECT};
    const out = gripFor({clientX: 400, clientY: 250}, drag, 'y');
    assert.strictEqual(out[1], 42.32, 'half of 68 is 34, which cannot hold the box');
  });

  it('dragging outward past the edge grows the pitch', () => {
    const drag = {start: [80, 60], rect: RECT};
    const out = gripFor({clientX: 1200, clientY: 250}, drag, 'x');
    assert.ok(out[0] > 80, 'expected growth, got ' + out[0]);
  });

  it('still clamps — a drag cannot produce an illegal pitch', () => {
    /* The grip is bounded, but the clamp is what guarantees the
       result, and it is the same clamp the typed inputs use. */
    const drag = {start: [105, 68], rect: RECT};
    const tiny = gripFor({clientX: 1, clientY: 1}, drag, 'y');
    assert.ok(tiny[1] >= BG.MARKS.paWidth,
        'width ' + tiny[1] + ' cannot hold the penalty area');
    const huge = gripFor({clientX: 99999, clientY: 250}, drag, 'x');
    assert.ok(huge[0] <= BG.BOUNDS.MAX_L);
  });

  it('measures from the drag START, not from the live value', () => {
    /* Otherwise the pitch compounds: each pointermove would scale
       whatever the previous one produced, and a slow drag would shrink
       the pitch to nothing while a fast one barely moved it. */
    const a = gripFor({clientX: 400, clientY: 250}, {start: [105, 68], rect: RECT}, 'x');
    const b = gripFor({clientX: 400, clientY: 250}, {start: [105, 68], rect: RECT}, 'x');
    assert.deepStrictEqual(a, b);
  });
});

describe('the grip axes follow what is on SCREEN', () => {
  it('a vertical full board swaps which grip owns which dimension', () => {
    /* The board is rotated, so the pitch's length runs across the
       screen. The x grip still owns the length — it just reads the
       pointer's Y. Backwards, this silently edits the wrong
       dimension and still yields a plausible pitch. */
    const vert = makeGrip({vertical: true, boardType: 'full'});
    const drag = {start: [105, 68], rect: RECT};

    // Moving the pointer VERTICALLY should now drive the length.
    const movedY = vert({clientX: 400, clientY: 250}, drag, 'x');
    assert.strictEqual(movedY[0], 53, 'vertical board: x grip should read clientY');

    // And moving HORIZONTALLY should drive the width.
    const wide = {start: [105, 90], rect: RECT};
    const movedX = vert({clientX: 400, clientY: 250}, wide, 'y');
    assert.strictEqual(movedX[1], 45);
  });

  it('half and area boards are NOT swapped', () => {
    /* They are rotated by a CSS transform on the whole field, which
       moves the pointer coordinates with it — so the untransformed
       mapping is already correct. Exactly the isRotated() rule. */
    const half = makeGrip({vertical: true, boardType: 'half'});
    const flat = makeGrip({vertical: false, boardType: 'half'});
    const drag = {start: [105, 68], rect: RECT};
    assert.deepStrictEqual(
        half({clientX: 400, clientY: 250}, drag, 'x'),
        flat({clientX: 400, clientY: 250}, drag, 'x'));
  });

  it('uses the same isRotated the markings use', () => {
    // Not a re-derivation: one rule, or the pitch and its markings
    // come apart. Pinned at the source level.
    const src = grab(appSrc, '    function gripPitchFor(e, drag, axis) {',
        '\n    // --- Silhouette picker ---', 'js/app.js');
    assert.ok(/BG\.isRotated\(curBoardType\(\), isVertical\(\)\)/.test(src), src);
  });
});

describe('the source wiring', () => {
  it('both routes go through setPitch', () => {
    const src = grab(appSrc, '    function currentPitch()',
        '\n    // --- Silhouette picker ---', 'js/app.js');
    // typed inputs, reset button and the grip pointerup
    assert.ok((src.match(/setPitch\(/g) || []).length >= 4,
        'expected every route to call setPitch');
  });

  it('setPitch takes an undo snapshot before it writes', () => {
    const src = grab(appSrc, '    function setPitch(L, W, opts) {',
        '    const pitchLInput', 'js/app.js');
    const undoAt = src.indexOf('pushUndo()');
    const writeAt = src.indexOf("setItem('fa_tactic_pitch'");
    assert.ok(undoAt !== -1 && writeAt !== -1);
    assert.ok(undoAt < writeAt, 'pushUndo must come before the write');
  });

  it('setPitch does nothing when the pitch has not moved', () => {
    /* Otherwise every pointerup on a grip that went nowhere, and every
       blur of an untouched input, pushes an undo entry — and the undo
       stack fills with no-ops that each need a press to get past. */
    const src = grab(appSrc, '    function setPitch(L, W, opts) {',
        '    const pitchLInput', 'js/app.js');
    const guardAt = src.indexOf('return c;');
    assert.ok(guardAt !== -1 && guardAt < src.indexOf('pushUndo()'),
        'the unchanged-pitch guard must come before pushUndo');
  });

  it('undo carries the pitch, in both lists', () => {
    const push = grab(appSrc, '    function pushUndo()', '    function popUndo()', 'js/app.js');
    assert.ok(/pitch: localStorage\.getItem\('fa_tactic_pitch'\)/.test(push));
    const pop = grab(appSrc, '      const UNDO_KEYS = [', '      UNDO_KEYS.forEach', 'js/app.js');
    assert.ok(/\['pitch',\s*'fa_tactic_pitch'\]/.test(pop));
  });

  it('undoing a resize re-renders instead of rebuilding the DOM', () => {
    /* applyFrameState puts the players back but knows nothing about
       markings, the box aspect or the rotation margins — all of which
       derive from the pitch. Without the early return, undo restored
       the dimensions while leaving the pitch on screen at its new
       size. */
    const pop = grab(appSrc, '      const pitchBefore =', '      // Rebuild DOM', 'js/app.js');
    assert.ok(/navigate\(\);\s*\n\s*return;/.test(pop), pop);
  });

  it('the controls are hidden on derived board types', () => {
    /* Half and area are views of the same pitch. Editing the
       perimeter from a frame whose edges you cannot see is a control
       with no visible effect. */
    const src = grab(appSrc, '            /* Pitch size, in metres. Shown for the FULL board only',
        'tb-pitch-reset', 'js/app.js');
    assert.ok(/boardType !== 'full'\) return ''/.test(src), src);
  });
});

describe('i18n', () => {
  it('every new pitch string has all three languages', () => {
    // t() returns the key itself on a miss, so a gap ships as raw
    // `tactics.pitch` on screen.
    const keys = [...appSrc.matchAll(/'(tactics\.pitch[a-z_]*)':\s*\{([^}]*)\}/g)];
    assert.ok(keys.length >= 6, 'expected the pitch strings, found ' + keys.length);
    keys.forEach((m) => {
      ['ca:', 'es:', 'en:'].forEach((l) => {
        assert.ok(m[2].includes(l), m[1] + ' is missing ' + l);
      });
    });
  });
});
