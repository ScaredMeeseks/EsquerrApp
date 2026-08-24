/* The scratch-state module: rounding, key shapes, and the tween.
 *
 * The tween is the part that matters. Playback existed twice — once
 * in the editor and once in the read-only renderer — as two ~120-line
 * functions doing the same matching and the same lerp against
 * different DOM. They drifted, and the drift shipped: v91 records the
 * editor preferring the current colour array over the frame's, the
 * opposite of every other renderer, so a player changed colour
 * mid-animation in the editor and nowhere else. v88's opposition
 * flash was the same shape.
 *
 * These tests pin the rules those bugs broke, in a form a third
 * renderer (3D) inherits for free.
 */
const assert = require('assert');
const BS = require('../js/board-state.js');

const store = (obj) => ({
  getItem: (k) => (k in obj ? obj[k] : null),
  setItem: (k, v) => { obj[k] = String(v); },
  removeItem: (k) => { delete obj[k]; }
});

describe('rounding', () => {
  it('is 2 dp, the same everywhere', () => {
    /* 0.01% of a 105 m pitch is about a centimetre — below what
       anyone can drag, and enough to stop floating-point tails making
       db.js see a changed shard on every save. */
    assert.strictEqual(BS.round2(10.123456), 10.12);
    assert.strictEqual(BS.round2(10.987654), 10.99);
  });

  it('is byte-identical to the expression it replaced', () => {
    /* The save functions each carried their own
       `Math.round(v * 100) / 100`. Replacing six copies with one call
       is only safe if the call produces the SAME number — db.js diffs
       shards as serialised strings, so a single differing digit marks
       every board shard in every club as changed and rewrites the lot.

       Checked across the range the board actually stores (0-100) plus
       the negatives a drag can briefly produce. */
    for (let i = 0; i < 4000; i++) {
      const v = (Math.random() * 220) - 60;
      assert.strictEqual(BS.round2(v), Math.round(v * 100) / 100,
          'diverged at ' + v);
    }
  });

  it('leaves a null point null rather than becoming [NaN, NaN]', () => {
    /* null is a DELETED slot. Turning it into a point would
       resurrect a player nobody put back. */
    assert.strictEqual(BS.roundPt(null), null);
    assert.deepStrictEqual(BS.roundPts([[1.111, 2.222], null]), [[1.11, 2.22], null]);
  });
});

describe('the key registry', () => {
  it('names every scratch key, so no caller spells one as a literal', () => {
    /* A typo in a literal is silent: the write lands on a key nothing
       reads, the board looks right until reload, and the value is
       gone. */
    ['positions', 'numbers', 'colors', 'oppPositions', 'oppNumbers',
      'oppColors', 'balls', 'arrows', 'rects', 'texts', 'penLines',
      'cones', 'silhouette', 'pitch', 'penSpace'].forEach((k) => {
      assert.ok(BS.KEYS[k], 'missing key: ' + k);
      assert.ok(/^fa_tactic_/.test(BS.KEYS[k]), BS.KEYS[k]);
    });
  });

  it('survives a corrupt stored value instead of throwing', () => {
    /* localStorage is shared with other tabs and outlives version
       changes, so this is reachable in the wild, not just defensive.
       A parse error here would take the whole board down. */
    const s = store({fa_tactic_positions: '{not json'});
    assert.strictEqual(BS.getPoints(s, BS.KEYS.positions), null);
  });

  it('rounds on the way IN, so nothing downstream has to remember', () => {
    const bag = {};
    BS.setPoints(store(bag), BS.KEYS.positions, [[1.23456, 2.34567]]);
    assert.strictEqual(bag.fa_tactic_positions, '[[1.23,2.35]]');
  });
});

describe('arrows, rects and texts keep their non-coordinate fields', () => {
  it('an arrow rounds four numbers and passes colour and dash through', () => {
    const bag = {};
    BS.setArrows(store(bag), [[1.111, 2.222, 3.333, 4.444, '#ff0000', true]]);
    assert.deepStrictEqual(JSON.parse(bag.fa_tactic_arrows),
        [[1.11, 2.22, 3.33, 4.44, '#ff0000', true]]);
  });

  it('a rect keeps its fill opacity unrounded', () => {
    const bag = {};
    BS.setRects(store(bag), [[1, 2, 3, 4, '#fff', 0.3]]);
    assert.strictEqual(JSON.parse(bag.fa_tactic_rects)[0][5], 0.3);
  });

  it('a text does NOT round its pixel sizes', () => {
    /* Only the first two fields are pitch percentages. The width,
       height and font size are PIXELS — rounding them to 2 dp as
       though they were percentages is harmless today and wrong the
       moment anything reads them back as a measurement. */
    const bag = {};
    BS.setTexts(store(bag), [[1.111, 2.222, 'Press', '#000', 0.8, 120, 40, 14]]);
    const t = JSON.parse(bag.fa_tactic_texts)[0];
    assert.deepStrictEqual(t.slice(0, 2), [1.11, 2.22]);
    assert.deepStrictEqual(t.slice(2), ['Press', '#000', 0.8, 120, 40, 14]);
  });
});

describe('tweenTrack — where is each thing at time t', () => {
  it('interpolates something present in both frames', () => {
    assert.deepStrictEqual(
        BS.tweenTrack([[0, 0]], [[10, 20]], 0.5), [[5, 10]]);
  });

  it('is exact at both ends', () => {
    assert.deepStrictEqual(BS.tweenTrack([[0, 0]], [[10, 20]], 0), [[0, 0]]);
    assert.deepStrictEqual(BS.tweenTrack([[0, 0]], [[10, 20]], 1), [[10, 20]]);
  });

  it('SNAPS something that appears in the target frame', () => {
    /* Not a slide in from wherever index i happened to be. A player
       who is not in the previous frame has no previous position, and
       inventing one makes them fly in from the corner. */
    assert.deepStrictEqual(
        BS.tweenTrack([null], [[10, 20]], 0.5), [[10, 20]]);
  });

  it('returns null for something absent from the target frame', () => {
    assert.deepStrictEqual(BS.tweenTrack([[1, 2]], [null], 0.5), [null]);
    assert.deepStrictEqual(BS.tweenTrack([[1, 2]], [], 0.5), [null]);
  });

  it('keeps indices STABLE — a gap stays a gap', () => {
    /* The whole matching scheme is by array index, so a null is a
       deleted slot and never compacted away. Compacting it would
       shift every player after it onto someone else's identity. */
    const out = BS.tweenTrack(
        [[0, 0], null, [10, 10]],
        [[2, 2], null, [12, 12]], 0.5);
    assert.strictEqual(out.length, 3);
    assert.strictEqual(out[1], null);
    assert.deepStrictEqual(out[2], [11, 11]);
  });

  it('handles frames of different lengths', () => {
    assert.deepStrictEqual(
        BS.tweenTrack([[0, 0]], [[0, 0], [5, 5]], 0.5),
        [[0, 0], [5, 5]]);
  });

  it('treats missing tracks as empty, not as a crash', () => {
    assert.deepStrictEqual(BS.tweenTrack(null, null, 0.5), []);
    assert.deepStrictEqual(BS.tweenTrack(undefined, [[1, 2]], 0), [[1, 2]]);
  });
});

describe('app.js actually uses it', () => {
  const fs = require('fs');
  const path = require('path');
  const appSrc = fs.readFileSync(
      path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('has no lerp of its own left', () => {
    /* There were two — one per renderer — and they drifted. If one
       comes back, so does the class of bug that produced v88 and v91. */
    assert.ok(!/function lerp\s*\(/.test(appSrc),
        'app.js should not define its own lerp any more');
  });

  it('both renderers tween through the shared track', () => {
    // The editor's interpolateAndApply and the read-only interpolateRo.
    const uses = (appSrc.match(/BS\.tweenTrack\(/g) || []).length;
    assert.ok(uses >= 6,
        'expected both renderers to tween players, opposition and balls ' +
        'through BS.tweenTrack; found ' + uses + ' call sites');
  });

  it('no save function rounds coordinates by hand any more', () => {
    /* Six copies of `Math.round(v * 100) / 100` is six chances for one
       of them to be edited alone. db.js diffs shards as serialised
       strings, so a single differing digit rewrites every board shard
       in every club. */
    const inline = appSrc.match(/Math\.round\([^)]*\*\s*100\)\s*\/\s*100/g) || [];
    assert.deepStrictEqual(inline, [],
        'inline 2dp rounding survives at ' + inline.length + ' site(s)');
  });

  it('the scratch keys are written through the module', () => {
    ['positions', 'oppPositions', 'balls', 'cones', 'penLines']
        .forEach((k) => {
          assert.ok(appSrc.includes('BS.KEYS.' + k),
              k + ' should be written via BS.KEYS');
        });
    assert.ok(/BS\.setArrows\(/.test(appSrc));
    assert.ok(/BS\.setRects\(/.test(appSrc));
    assert.ok(/BS\.setTexts\(/.test(appSrc));
  });

  it('board-state loads before app.js', () => {
    // Everything shares one global scope; order in index.html is the
    // only dependency declaration there is.
    const html = fs.readFileSync(
        path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.indexOf('js/board-state.js') < html.indexOf('js/app.js'));
    assert.ok(html.indexOf('js/board-geom.js') < html.indexOf('js/board-state.js'));
  });

  it('is precached by the service worker', () => {
    // Missing here means the app breaks offline, and only offline.
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    assert.ok(sw.includes('./js/board-state.js'));
    assert.ok(sw.includes('./js/board-geom.js'));
  });
});

describe('tweenFrame — the v91 rule, stated once', () => {
  const from = {
    positions: [[0, 0]], colors: ['#aaa'], oppColors: ['#bbb'],
    arrows: [[0, 0, 1, 1]], rects: [[0, 0, 1, 1]], texts: [['a']],
    penLines: [['0,0']], silhouette: 'one-arm-up'
  };
  const to = {
    positions: [[10, 10]], colors: ['#ccc'], oppColors: ['#ddd'],
    arrows: [], rects: [], texts: [], penLines: [], silhouette: ''
  };

  it('the FRAME owns colours — they come from the target, never merged', () => {
    /* This is the v91 bug exactly. The editor used to prefer the
       current synced array, which meant a recolour became permanent:
       stepping back to frame 0 kept the newer colour, so "propagate
       forward" had nothing to propagate away from. */
    const mid = BS.tweenFrame(from, to, 0.5);
    assert.deepStrictEqual(mid.colors, ['#ccc']);
    assert.deepStrictEqual(mid.oppColors, ['#ddd']);
  });

  it('drawings belong to the moment and do not tween', () => {
    /* Half an arrow morphing into another arrow is not something
       anyone wants to watch, and there is no sane pairing between two
       frames' pen strokes anyway. */
    const mid = BS.tweenFrame(from, to, 0.5);
    assert.deepStrictEqual(mid.arrows, []);
    assert.deepStrictEqual(mid.rects, []);
    assert.deepStrictEqual(mid.texts, []);
    assert.deepStrictEqual(mid.penLines, []);
    assert.strictEqual(mid.silhouette, '');
  });

  it('positions, opposition, balls and cones all tween', () => {
    const mid = BS.tweenFrame(
        {positions: [[0, 0]], oppPositions: [[0, 0]], balls: [[0, 0]], cones: [[0, 0]]},
        {positions: [[4, 4]], oppPositions: [[8, 8]], balls: [[2, 2]], cones: [[6, 6]]},
        0.5);
    assert.deepStrictEqual(mid.positions, [[2, 2]]);
    assert.deepStrictEqual(mid.oppPositions, [[4, 4]]);
    assert.deepStrictEqual(mid.balls, [[1, 1]]);
    assert.deepStrictEqual(mid.cones, [[3, 3]]);
  });

  it('carries NO numbers — they are a property of the player, not the moment', () => {
    /* Deliberately absent. A shirt number is merged across frames
       using live editor state, which is not frame data, so putting a
       half-merged version here would give a caller something that
       looks authoritative and is not. */
    assert.strictEqual(BS.tweenFrame(from, to, 0.5).numbers, undefined);
  });

  it('never returns undefined for a track the frames omit', () => {
    // A renderer iterating the result must not have to null-check.
    const mid = BS.tweenFrame({}, {}, 0.5);
    ['positions', 'oppPositions', 'balls', 'cones', 'colors', 'oppColors',
      'arrows', 'rects', 'texts', 'penLines'].forEach((k) => {
      assert.ok(Array.isArray(mid[k]), k + ' should be an array, got ' + mid[k]);
    });
  });
});
