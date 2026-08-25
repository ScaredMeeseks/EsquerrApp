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

describe('trajectories', () => {
  const P0 = [0, 0];
  const P1 = [100, 0];

  it('no bend is EXACTLY the straight lerp it replaced', () => {
    /* The load-bearing back-compat claim. Every board that predates
       trajectories has no paths, so if this diverged by a floating
       hair, every existing animation would move. */
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      assert.deepStrictEqual(
          BS.pathPoint([10, 20], [90, 60], null, t),
          [10 + 80 * t, 20 + 40 * t]);
    }
  });

  it('the handle sits ON the curve, at its middle', () => {
    /* The coach drags the midpoint, so storing the midpoint means the
       handle round-trips exactly. Storing a Bezier control point
       instead would put the handle somewhere the user did not leave
       it. */
    const bend = [50, 30];
    const mid = BS.pathPoint(P0, P1, {bend}, 0.5);
    assert.ok(Math.abs(mid[0] - 50) < 1e-9, 'x drifted: ' + mid[0]);
    assert.ok(Math.abs(mid[1] - 30) < 1e-9, 'y drifted: ' + mid[1]);
  });

  it('always starts and ends exactly where the object does', () => {
    // A bend must not move the endpoints; those are the frame poses.
    const p = {bend: [20, 80]};
    assert.deepStrictEqual(BS.pathPoint(P0, P1, p, 0), [0, 0]);
    assert.deepStrictEqual(BS.pathPoint(P0, P1, p, 1), [100, 0]);
  });

  it('is a PARABOLA, not an arbitrary curve', () => {
    /* Stated as a requirement, so it is tested as one. A quadratic
       Bezier is a parabola iff its second difference is constant:
       sample at even t and the differences of the differences must
       all agree. */
    const p = {bend: [50, 40]};
    const ys = [];
    for (let i = 0; i <= 10; i++) ys.push(BS.pathPoint(P0, P1, p, i / 10)[1]);
    const d2 = [];
    for (let i = 2; i < ys.length; i++) d2.push(ys[i] - 2 * ys[i - 1] + ys[i - 2]);
    d2.forEach((v) => assert.ok(Math.abs(v - d2[0]) < 1e-9,
        'second difference varies: ' + d2.join(', ')));
  });

  it('the apex is the peak height, in metres, at the middle', () => {
    assert.strictEqual(BS.pathHeight({apex: 4}, 0.5), 4);
    assert.strictEqual(BS.pathHeight({apex: 4}, 0), 0);
    assert.strictEqual(BS.pathHeight({apex: 4}, 1), 0);
  });

  it('the height profile is a parabola too', () => {
    const hs = [];
    for (let i = 0; i <= 10; i++) hs.push(BS.pathHeight({apex: 3}, i / 10));
    const d2 = [];
    for (let i = 2; i < hs.length; i++) d2.push(hs[i] - 2 * hs[i - 1] + hs[i - 2]);
    d2.forEach((v) => assert.ok(Math.abs(v - d2[0]) < 1e-9, d2.join(', ')));
  });

  it('a missing or nonsense apex is flat, not NaN', () => {
    [null, undefined, {}, {apex: 0}, {apex: -2}, {apex: 'x'}].forEach((p) => {
      assert.strictEqual(BS.pathHeight(p, 0.5), 0, JSON.stringify(p));
    });
  });

  it('samplePath returns x, y and height together', () => {
    const pts = BS.samplePath(P0, P1, {bend: [50, 20], apex: 5}, 5);
    assert.strictEqual(pts.length, 5);
    assert.deepStrictEqual(pts[0].slice(0, 2), [0, 0]);
    assert.deepStrictEqual(pts[4].slice(0, 2), [100, 0]);
    assert.strictEqual(pts[2][2], 5, 'the middle sample carries the apex');
  });

  it('pathOf digs one object out of a frame, sparsely', () => {
    const frame = {paths: {balls: {0: {apex: 2}}}};
    assert.deepStrictEqual(BS.pathOf(frame, 'balls', 0), {apex: 2});
    assert.strictEqual(BS.pathOf(frame, 'balls', 1), null);
    assert.strictEqual(BS.pathOf(frame, 'positions', 0), null);
    assert.strictEqual(BS.pathOf({}, 'balls', 0), null);
    assert.strictEqual(BS.pathOf(null, 'balls', 0), null);
  });
});

describe('tweenTrack follows a trajectory when there is one', () => {
  it('is unchanged when there are no paths at all', () => {
    assert.deepStrictEqual(BS.tweenTrack([[0, 0]], [[10, 20]], 0.5), [[5, 10]]);
    assert.deepStrictEqual(BS.tweenTrack([[0, 0]], [[10, 20]], 0.5, {}), [[5, 10]]);
  });

  it('curves the one object that has a path, and only that one', () => {
    const out = BS.tweenTrack(
        [[0, 0], [0, 0]], [[100, 0], [100, 0]], 0.5,
        {0: {bend: [50, 40]}});
    assert.deepStrictEqual(out[0], [50, 40], 'the bent one');
    assert.deepStrictEqual(out[1], [50, 0], 'the straight one');
  });

  it('a path with only an apex does not bend the plan view', () => {
    /* Height and bend are independent: a ball chipped straight down
       the line has an apex and no bend. */
    const out = BS.tweenTrack([[0, 0]], [[100, 0]], 0.5, {0: {apex: 5}});
    assert.deepStrictEqual(out[0], [50, 0]);
  });
});

describe('multi-point player runs', () => {
  const P0 = [0, 0];
  const P1 = [100, 0];

  it('the curve passes EXACTLY through every dot', () => {
    /* The whole reason for a spline rather than a Bezier: the coach
       drops a dot where the player should be, and the player goes
       there. A Bezier control point would only pull the curve
       towards it. */
    [[[50, 40]], [[30, 30], [70, -20]], [[20, 10], [50, 40], [80, 5]]]
        .forEach((pts) => {
          const n = pts.length + 1;
          pts.forEach((pt, i) => {
            const got = BS.splinePoint(P0, pts, P1, (i + 1) / n);
            assert.ok(Math.abs(got[0] - pt[0]) < 1e-6 &&
                      Math.abs(got[1] - pt[1]) < 1e-6,
            'dot ' + JSON.stringify(pt) + ' -> ' + JSON.stringify(got));
          });
        });
  });

  it('still starts and ends exactly where the player does', () => {
    const pts = [[30, 30], [70, -20]];
    assert.deepStrictEqual(BS.splinePoint(P0, pts, P1, 0), [0, 0]);
    const end = BS.splinePoint(P0, pts, P1, 1);
    assert.ok(Math.abs(end[0] - 100) < 1e-6 && Math.abs(end[1]) < 1e-6, end);
  });

  it('survives coincident dots instead of dividing by zero', () => {
    /* Two dots dropped on the same spot makes a zero-length knot
       span. Centripetal Catmull-Rom divides by it. */
    const out = BS.splinePoint(P0, [[50, 10], [50, 10]], P1, 0.5);
    assert.ok(isFinite(out[0]) && isFinite(out[1]), out);
  });

  it('never forms a CUSP, however badly the dots are spaced', () => {
    /* This is why it is CENTRIPETAL and not uniform Catmull-Rom.
       Uniform forms cusps and self-intersecting loops when the
       spacing is very uneven, which is exactly what hand-placed dots
       produce.

       A cusp is the curve reversing direction on the spot, so the
       test is on the TANGENT: between consecutive samples the
       direction may turn, but never flip. Note this does NOT assert
       x-monotonicity — a run that goes up, across and back is a
       legitimate curve, and centripetal CR does not promise
       monotonicity in any case. */
    [[[2, 30], [98, -30]], [[1, 1], [99, 40]], [[50, 90], [51, -90]]]
        .forEach((pts) => {
          let prevDir = null;
          for (let i = 0; i < 120; i++) {
            const a = BS.splinePoint(P0, pts, P1, i / 120);
            const b = BS.splinePoint(P0, pts, P1, (i + 1) / 120);
            const dx = b[0] - a[0], dy = b[1] - a[1];
            const len = Math.hypot(dx, dy);
            if (len < 1e-9) continue;
            const dir = [dx / len, dy / len];
            if (prevDir) {
              const dot = dir[0] * prevDir[0] + dir[1] * prevDir[1];
              assert.ok(dot > -0.5,
                  'direction flipped (cusp) at t=' + (i / 120).toFixed(3) +
                  ' for ' + JSON.stringify(pts));
            }
            prevDir = dir;
          }
        });
  });

  it('reads a legacy single bend as a one-dot run', () => {
    // Player paths written before multi-point runs existed.
    assert.deepStrictEqual(BS.pointsOf({bend: [50, 20]}), [[50, 20]]);
    assert.deepStrictEqual(BS.pointsOf({pts: [[1, 2]]}), [[1, 2]]);
    assert.deepStrictEqual(BS.pointsOf(null), []);
    assert.deepStrictEqual(BS.pointsOf({}), []);
  });

  it('pathPoint prefers pts, and falls back to the parabola', () => {
    // The ball keeps its parabola; only a run becomes a spline.
    const spline = BS.pathPoint(P0, P1, {pts: [[50, 40]]}, 0.5);
    assert.ok(Math.abs(spline[1] - 40) < 1e-6, spline);
    const parabola = BS.pathPoint(P0, P1, {bend: [50, 40]}, 0.5);
    assert.ok(Math.abs(parabola[1] - 40) < 1e-9, parabola);
  });

  it('an empty pts array is still a straight line', () => {
    assert.deepStrictEqual(BS.pathPoint(P0, P1, {pts: []}, 0.5), [50, 0]);
  });

  it('tweenTrack follows a multi-dot run', () => {
    const out = BS.tweenTrack([P0], [P1], 0.5, {0: {pts: [[50, 40]]}});
    assert.ok(Math.abs(out[0][1] - 40) < 1e-6, out[0]);
  });
});

describe('adding a bend dot lands in the right place', () => {
  const P0 = [0, 0];
  const P1 = [100, 0];

  it('a dot dropped near the START goes first, not last', () => {
    /* Appending would send it to the end of the list and the run
       would double back on itself to collect it. */
    const pts = BS.insertPointAt({pts: [[80, 20]]}, P0, P1, [15, 5]);
    assert.deepStrictEqual(pts[0], [15, 5]);
    assert.strictEqual(pts.length, 2);
  });

  it('a dot dropped near the END goes last', () => {
    const pts = BS.insertPointAt({pts: [[20, 20]]}, P0, P1, [85, 5]);
    assert.deepStrictEqual(pts[1], [85, 5]);
  });

  it('a dot dropped BETWEEN two existing ones goes between them', () => {
    const pts = BS.insertPointAt({pts: [[20, 20], [80, 20]]}, P0, P1, [50, 30]);
    assert.deepStrictEqual(pts.map((p) => p[0]), [20, 50, 80]);
  });

  it('the first dot on a straight run just works', () => {
    assert.deepStrictEqual(BS.insertPointAt(null, P0, P1, [50, 25]), [[50, 25]]);
  });

  it('rounds like every other stored coordinate', () => {
    assert.deepStrictEqual(BS.insertPointAt(null, P0, P1, [50.123456, 25.987]),
        [[50.12, 25.99]]);
  });
});

describe('the ball bend handle stays at the midpoint', () => {
  const P0 = [0, 0];
  const P1 = [100, 0];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  it('is always equidistant from both ends', () => {
    /* That is what "at the midpoint" means from any camera angle,
       and it is the property the whole constraint exists for. */
    [[50, 30], [10, 40], [90, -25], [0, 0], [120, 5]].forEach((at) => {
      const b = BS.constrainBend(P0, P1, at);
      assert.ok(Math.abs(dist(b, P0) - dist(b, P1)) < 0.02,
          JSON.stringify(at) + ' -> ' + JSON.stringify(b));
    });
  });

  it('a push ALONG the line moves it nowhere', () => {
    // Sliding toward an end is exactly what is being prevented.
    assert.deepStrictEqual(BS.constrainBend(P0, P1, [90, 0]), [50, 0]);
    assert.deepStrictEqual(BS.constrainBend(P0, P1, [10, 0]), [50, 0]);
  });

  it('a push ACROSS the line moves it fully', () => {
    assert.deepStrictEqual(BS.constrainBend(P0, P1, [50, 30]), [50, 30]);
    // And the sideways component survives even when dragged askew.
    assert.deepStrictEqual(BS.constrainBend(P0, P1, [90, 30]), [50, 30]);
  });

  it('works on a diagonal flight, not just an axis-aligned one', () => {
    const a = [0, 0], b = [60, 80];
    const out = BS.constrainBend(a, b, [70, 10]);
    assert.ok(Math.abs(dist(out, a) - dist(out, b)) < 0.02, out);
  });

  it('the resulting parabola is symmetric', () => {
    /* Equidistant handle plus quadratic Bezier means the curve at t
       and at 1-t are mirror images about the bisector — measurable as
       equal distances from the two endpoints. */
    const bend = BS.constrainBend(P0, P1, [50, 40]);
    for (let i = 1; i < 5; i++) {
      const t = i / 10;
      const a = BS.pathPoint(P0, P1, {bend}, t);
      const b = BS.pathPoint(P0, P1, {bend}, 1 - t);
      assert.ok(Math.abs(dist(a, P0) - dist(b, P1)) < 1e-6,
          't=' + t + ' ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
    }
  });

  it('survives a zero-length flight instead of dividing by zero', () => {
    const out = BS.constrainBend([50, 50], [50, 50], [60, 60]);
    assert.ok(isFinite(out[0]) && isFinite(out[1]), out);
  });

  it('rounds like every other stored coordinate', () => {
    const out = BS.constrainBend(P0, P1, [50, 30.987654]);
    assert.strictEqual(out[1], 30.99);
  });
});
