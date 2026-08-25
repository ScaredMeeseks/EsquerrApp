/* The camera maths, EXECUTED — not grepped.
 *
 * Every other board3d test is a source assertion, because the module
 * needs WebGL. The camera orientation maths does not: it is pure
 * three.js vector work, and three.js imports fine in Node. So this
 * one runs the real functions and measures the real result.
 *
 * That distinction matters here. The source tests happily confirmed
 * that the tween "computes the destination with the same up rule" and
 * "slerps rather than re-deriving angles" — both true, and the camera
 * still flipped 180 degrees, because Object3D.lookAt and
 * Camera.lookAt are different operations and no amount of grepping
 * for call shapes can notice that.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');

/* Lift the three pure camera helpers out of board3d and run them over
   the real three.js. They take no closure state beyond THREE. */
function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found: ' + from);
  return src.slice(i, j);
}

let THREE, api;

before(async () => {
  THREE = await import('../vendor/three.module.min.js');
  const block =
      grab('  function upFor(phi, theta) {', '  /* Scratch, reused') +
      grab('  const orientMatrix', '  function tweenCameraTo');
  api = new Function('THREE',
      block + '\n; return {upFor, positionFor, quaternionFor};')(THREE);
});

/** Where a camera with this orientation actually points. */
const facing = (q) => new THREE.Vector3(0, 0, -1).applyQuaternion(q);

const ANGLES = [];
[1.4, 1.0, 0.6, 0.3, 0.05, 0.001].forEach((phi) => {
  [0, 1.2, -Math.PI / 2, Math.PI, 2.9].forEach((theta) => {
    ANGLES.push({phi, theta});
  });
});

describe('the destination orientation matches a real camera', () => {
  it('faces the target, at every angle including overhead', () => {
    /* THE bug this file exists for. Object3D.lookAt points +Z at the
       target; Camera.lookAt points -Z. Building the destination with
       a plain Object3D probe produced an orientation rotated by
       exactly 180 degrees, so the slerp drove the camera to face
       away from the pitch. */
    const target = new THREE.Vector3(0, 0, 0);
    ANGLES.forEach(({phi, theta}) => {
      const dist = 100;
      const q = api.quaternionFor(theta, phi, dist, target);
      const pos = api.positionFor(theta, phi, dist, target);
      const want = target.clone().sub(pos).normalize();
      const got = facing(q);
      const deg = Math.acos(Math.max(-1, Math.min(1, got.dot(want)))) * 180 / Math.PI;
      assert.ok(deg < 0.01,
          'phi=' + phi + ' theta=' + theta.toFixed(2) +
          ' faces ' + deg.toFixed(1) + ' degrees away from the target');
    });
  });

  it('is identical to what PerspectiveCamera.lookAt produces', () => {
    const target = new THREE.Vector3(0, 0, 0);
    ANGLES.forEach(({phi, theta}) => {
      const dist = 100;
      const pos = api.positionFor(theta, phi, dist, target);
      const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 1000);
      cam.position.copy(pos);
      cam.up.copy(api.upFor(phi, theta));
      cam.lookAt(target);
      const deg = Math.acos(Math.max(-1, Math.min(1,
          facing(cam.quaternion).dot(facing(api.quaternionFor(theta, phi, dist, target))))))
          * 180 / Math.PI;
      assert.ok(deg < 0.01, 'phi=' + phi + ' differs by ' + deg.toFixed(3) + ' degrees');
    });
  });
});

describe('a transition never whips round', () => {
  /* The original fault, reproduced as a measurement rather than a
     description. Interpolating the orbit ANGLES and rebuilding the
     frame each step passed through the overhead singularity, where
     the up vector goes parallel to the view: the measured result was
     a 172-degree rotation in a single step. */
  const STEPS = 20;

  const worstStep = (fromA, toA) => {
    const target = new THREE.Vector3(0, 0, 0);
    const q0 = api.quaternionFor(fromA.theta, fromA.phi, 100, target);
    const q1 = api.quaternionFor(toA.theta, toA.phi, 100, target);
    const q = new THREE.Quaternion();
    let prev = null, worst = 0;
    for (let i = 0; i <= STEPS; i++) {
      q.slerpQuaternions(q0, q1, i / STEPS);
      const f = facing(q);
      if (prev) {
        worst = Math.max(worst,
            Math.acos(Math.max(-1, Math.min(1, f.dot(prev)))) * 180 / Math.PI);
      }
      prev = f.clone();
    }
    return worst;
  };

  /* THE shipped presets, read out of board3d.js — not "roughly" them.
     The transcription this replaces had broadcast and side at
     theta -PI/2 while the shipped table has +PI/2: it went stale when
     those were un-mirrored and nobody noticed, because the smoothness
     it measures is symmetric in theta. It was testing a camera the
     app does not build. The same copy also pinned top at phi 0.001,
     which is the value that made the drawing overlay drift. */
  const PRESETS = require('./board3d-presets.js').readPresets();

  it('moves smoothly between every pair of presets', () => {
    const names = Object.keys(PRESETS);
    names.forEach((a) => {
      names.forEach((b) => {
        if (a === b) return;
        const w = worstStep(PRESETS[a], PRESETS[b]);
        /* A whole transition is at most ~180 degrees over 20 steps,
           so an even move is well under 15 per step. The failure mode
           is a single enormous step, not a slightly uneven one. */
        assert.ok(w < 15,
            a + ' -> ' + b + ' has a ' + w.toFixed(1) + ' degree jump');
      });
    });
  });

  it('specifically survives Side -> Top, which used to jump 172 degrees', () => {
    const w = worstStep(PRESETS.side, PRESETS.top);
    assert.ok(w < 15, 'largest step ' + w.toFixed(1) + ' degrees');
  });

  it('and Top -> anywhere, which is the same singularity leaving it', () => {
    ['broadcast', 'goal', 'side'].forEach((b) => {
      const w = worstStep(PRESETS.top, PRESETS[b]);
      assert.ok(w < 15, 'top -> ' + b + ' has a ' + w.toFixed(1) + ' degree jump');
    });
  });
});

describe('the up rule', () => {
  it('goes horizontal only within a hair of vertical', () => {
    assert.strictEqual(api.upFor(1.0, 0).y, 1);
    assert.strictEqual(api.upFor(0.001, 0).y, 0);
  });

  it('never leaves the up vector parallel to the view', () => {
    /* The failure the blend caused: up and view going parallel is
       exactly when lookAt has no plane to build a basis in. */
    const target = new THREE.Vector3(0, 0, 0);
    ANGLES.forEach(({phi, theta}) => {
      const pos = api.positionFor(theta, phi, 100, target);
      const view = target.clone().sub(pos).normalize();
      const up = api.upFor(phi, theta).normalize();
      assert.ok(Math.abs(up.dot(view)) < 0.9995,
          'phi=' + phi + ': up.view = ' + up.dot(view).toFixed(4));
    });
  });
});

describe('the side views are not mirrored against the 2D board', () => {
  /* The 2D board is a map seen from above: a player at x=10% is on the
     LEFT of the screen. A side camera on the wrong touchline reverses
     that, and a coach reading the same board in two views sees the
     pitch flipped — which is exactly as confusing as it sounds.
     Measured by projecting a known point, not by reasoning about
     handedness, which is easy to get backwards on paper. */
  let BG;
  before(async () => { BG = require('../js/board-geom.js'); });

  const ndcX = (theta, phi, pct) => {
    const target = new THREE.Vector3(0, 0, 0);
    const dist = 140;
    const cam = new THREE.PerspectiveCamera(45, 1.6, 0.5, 1000);
    cam.position.copy(api.positionFor(theta, phi, dist, target));
    cam.up.copy(api.upFor(phi, theta));
    cam.lookAt(target);
    cam.updateMatrixWorld();
    const w = BG.toWorld(pct[0], pct[1], [105, 68], 'full');
    return new THREE.Vector3(w.x, 0, w.z).project(cam).x;
  };

  /* Read the shipped presets out of the source, so this tests what
     actually ships rather than a copy that can drift. */
  const preset = (name) => {
    /* Parsed by finding the line, not by a built regex — escaping a
       pattern through a string literal is its own small hazard and
       has nothing to do with what is being tested. */
    /* Must look like a preset: `side:` alone also matches
       `side: THREE.DoubleSide` on a material, which appears first. */
    const line = src.split('\n').find((l) =>
      l.trim().startsWith(name + ':') && l.includes('{theta:'));
    assert.ok(line, 'preset not found: ' + name);
    const inner = line.slice(line.indexOf('{') + 1, line.lastIndexOf('}'));
    const parts = inner.split(',').map((s) => s.trim());
    const val = (key) => {
      const p = parts.find((s) => s.startsWith(key + ':'));
      assert.ok(p, key + ' missing from ' + name);
      // eslint-disable-next-line no-new-func
      return new Function('Math', 'return ' + p.slice(key.length + 1))(Math);
    };
    return {theta: val('theta'), phi: val('phi')};
  };

  ['broadcast', 'side'].forEach((name) => {
    it(name + ' keeps the pitch the same way round as 2D', () => {
      const p = preset(name);
      const left = ndcX(p.theta, p.phi, [10, 50]);
      const right = ndcX(p.theta, p.phi, [90, 50]);
      assert.ok(left < right,
          name + ' is mirrored: x=10% lands at ' + left.toFixed(2) +
          ', x=90% at ' + right.toFixed(2));
    });
  });

  it('the STARTING camera is not mirrored either', () => {
    /* The gap the preset tests left. They checked every preset and
       said nothing about the angle the board actually loads with, so
       fixing the presets left the initial view still mirrored — the
       first thing a coach sees, and the only one nothing covered. */
    const line = src.split('\n').find((l) => l.includes('const cam = {theta:'));
    assert.ok(line, 'initial camera not found');
    const inner = line.slice(line.indexOf('{') + 1);
    const theta = new Function('Math',
        'return ' + inner.split(',')[0].split(':')[1])(Math);
    const phi = new Function('Math',
        'return ' + inner.split(',')[1].split(':')[1])(Math);
    assert.ok(ndcX(theta, phi, [10, 50]) < ndcX(theta, phi, [90, 50]),
        'the board loads mirrored against the 2D view');
  });

  it('top keeps it the same way round too', () => {
    const p = preset('top');
    assert.ok(ndcX(p.theta, p.phi, [10, 50]) < ndcX(p.theta, p.phi, [90, 50]));
  });

  it('top also puts the 2D board top away from the camera', () => {
    /* y=0 is the top edge in 2D. Looking straight down it must appear
       at the top of the screen, or the board is flipped vertically
       even though left-right is right. */
    const p = preset('top');
    const target = new THREE.Vector3(0, 0, 0);
    const cam = new THREE.PerspectiveCamera(45, 1.6, 0.5, 1000);
    cam.position.copy(api.positionFor(p.theta, p.phi, 140, target));
    cam.up.copy(api.upFor(p.phi, p.theta));
    cam.lookAt(target);
    cam.updateMatrixWorld();
    const yOf = (pct) => {
      const w = BG.toWorld(pct[0], pct[1], [105, 68], 'full');
      return new THREE.Vector3(w.x, 0, w.z).project(cam).y;
    };
    assert.ok(yOf([50, 10]) > yOf([50, 90]),
        'the 2D top edge should be the top of the screen');
  });
});

/* ── Drawn marks have no thickness, MEASURED ──────────────────────
 *
 * Arrows were a cylinder shaft and a cone head: real solids standing
 * 0.16m proud of the grass, which read as pipes laid on the pitch
 * from every angle except straight down. An arrow on a tactics board
 * is a MARK — the thing it represents has no thickness, so neither
 * should it.
 *
 * "Flat" is a property of the built geometry, not of the source, so
 * these tests build the real arrow over the real three.js and measure
 * the vertical extent of every vertex. A source test could confirm
 * ShapeGeometry is used and still miss a rotation that tips the plane
 * out of the turf.
 */
describe('drawn marks lie flat on the turf', () => {
  let addArrow, addPenLine, added;

  before(() => {
    /* The builders plus the decal machinery they now share — the
       constants and helpers come out of the SOURCE rather than being
       stubbed, so the y-offset and the polygon offset under test are
       the real ones. Stubbing decalMaterial here would have let the
       marks float again with every test still green. */
    const fn = (marker) => {
      const i = src.indexOf(marker);
      assert.ok(i !== -1, 'not found: ' + marker);
      return src.slice(i, src.indexOf('\n  }', i) + '\n  }'.length);
    };
    const consts = (() => {
      // Anchored on the NAME, not on its current value — pinning
      // 'const DECAL_Y = 0;' meant changing the value broke the slice
      // and the test failed to find it rather than failing on it.
      const i = src.indexOf('  const DECAL_Y =');
      assert.ok(i !== -1, 'DECAL_Y not found');
      // To the END of the PEN_W statement, not a character count past
      // its start — that landed mid-line and produced a syntax error.
      const p = src.indexOf('const PEN_W', i);
      return src.slice(i, src.indexOf(';', p) + 1);
    })();

    added = [];
    const built = new Function('THREE', 'BG', 'getPitch', 'getBoardType', 'drawRoot',
        consts + '\n' +
        fn('  function decalMaterial(colour, opacity) {') + '\n' +
        fn('  function ribbonGeometry(pts, width) {') + '\n' +
        fn('  function addArrow(a) {') + '\n' +
        fn('  function addPenLine(p) {') + '\n' +
        'return {addArrow, addPenLine, DECAL_Y, PEN_W, ORDER};')(
      THREE,
      {toWorld: (x, y) => ({x: (x - 50) * 1.05, z: (y - 50) * 0.68})},
      () => null, () => 'full',
      {add: (m) => added.push(m)});
    addArrow = built.addArrow;
    addPenLine = built.addPenLine;
  });

  /** Every vertex of a mesh, in world space. */
  const verts = (mesh) => {
    mesh.updateMatrixWorld(true);
    const pos = mesh.geometry.attributes.position;
    const out = [];
    for (let i = 0; i < pos.count; i++) {
      out.push(new THREE.Vector3().fromBufferAttribute(pos, i)
          .applyMatrix4(mesh.matrixWorld));
    }
    return out;
  };

  const DIRECTIONS = [
    ['left to right', 10, 50, 90, 50],
    ['right to left', 90, 50, 10, 50],
    ['down the pitch', 50, 10, 50, 90],
    ['diagonal', 20, 80, 75, 15],
    ['short', 48, 50, 55, 53]
  ];

  DIRECTIONS.forEach(([name, x1, y1, x2, y2]) => {
    it('has zero thickness — ' + name, () => {
      added.length = 0;
      addArrow([x1, y1, x2, y2, '#ff0000', false]);
      assert.strictEqual(added.length, 1, 'one mesh, not a shaft plus a head');

      const ys = verts(added[0]).map((v) => v.y);
      const spread = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      assert.ok(spread < 1e-6,
          'the arrow must lie in one horizontal plane; vertical spread ' + spread);
      /* AT the turf, not above it. The old assertion demanded the
         opposite — `> 0` — which is exactly the offset that made a
         mark float 76px off the grass once the camera came in close.
         Depth is handled by polygonOffset now, not by height. */
      assert.ok(Math.abs(ys[0]) < 1e-9,
          'a mark must sit AT y=0; found ' + ys[0]);
    });

    it('points from the tail to the head — ' + name, () => {
      /* The direction is the whole meaning of an arrow, and a basis
         built with the wrong perpendicular flips it silently. */
      added.length = 0;
      addArrow([x1, y1, x2, y2, '#ff0000', false]);
      const vs = verts(added[0]);
      const toWorld = (x, y) => ({x: (x - 50) * 1.05, z: (y - 50) * 0.68});
      const tail = toWorld(x1, y1), tip = toWorld(x2, y2);

      const near = (p, v) => Math.hypot(v.x - p.x, v.z - p.z);
      const nearestTip = Math.min.apply(null, vs.map((v) => near(tip, v)));
      const nearestTail = Math.min.apply(null, vs.map((v) => near(tail, v)));
      assert.ok(nearestTip < 0.05,
          'a vertex must sit on the arrow head; closest was ' + nearestTip.toFixed(3));
      assert.ok(nearestTail < 0.4,
          'and the shaft must start at the tail; closest was ' + nearestTail.toFixed(3));
    });
  });

  it('faces the sky, not the ground', () => {
    /* makeBasis with the other perpendicular gives a left-handed
       basis: the shape is still flat, but its normal points DOWN and
       it disappears under a single-sided material. */
    added.length = 0;
    addArrow([20, 80, 75, 15, '#ff0000', false]);
    const m = added[0];
    m.updateMatrixWorld(true);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
    assert.ok(n.y > 0.999, 'the face normal must point up; y = ' + n.y.toFixed(4));
  });

  it('is a single opaque mark, not a lit solid', () => {
    added.length = 0;
    addArrow([10, 50, 90, 50, '#ff0000', false]);
    const mat = added[0].material;
    assert.strictEqual(mat.type, 'MeshBasicMaterial',
        'a lit material would shade the mark as though it had volume');
    assert.strictEqual(added[0].castShadow, false,
        'a flat mark casting a shadow reads as an object standing on the grass');
  });

  it('degenerate arrows are dropped rather than drawn as a speck', () => {
    added.length = 0;
    addArrow([50, 50, 50, 50, '#ff0000', false]);
    assert.strictEqual(added.length, 0, 'a zero-length arrow must add nothing');
  });

  it('zones stay a plane laid flat, with no solids among the marks', () => {
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const rect = bare.slice(bare.indexOf('function addRect('), bare.indexOf('function addPenLine('));
    assert.ok(/PlaneGeometry/.test(rect) && /rotation\.x = -Math\.PI \/ 2/.test(rect),
        'a zone must stay a plane laid flat');
    const pen = bare.slice(bare.indexOf('function addPenLine('), bare.indexOf('function addText('));
    assert.ok(!/(Cylinder|Cone|Box|Extrude|Tube|Sphere)Geometry/.test(rect + pen),
        'no solids among the drawn marks');
  });

  /* ── Pen strokes ────────────────────────────────────────────────
     They were `THREE.Line`, which is one device pixel however far you
     zoom and cannot carry polygonOffset — WebGL's depth bias applies
     to polygons only. So a line at y=0 z-fights the grass and a line
     above it floats: at the zoom where a player reads 300px wide, the
     old y=0.08 put a stroke 76px off the turf on the side view. A
     ribbon fixes both: it is a polygon, so it takes the offset, and
     it has a width in METRES so it grows with the pitch. */
  const STROKES = [
    ['a straight run', '10,50 30,50 50,50'],
    ['a hard turn', '20,20 40,20 40,60'],
    ['a scribble', '30,30 35,38 44,33 50,45 58,40 63,52']
  ];

  STROKES.forEach(([name, points]) => {
    it('a pen stroke lies in the turf plane — ' + name, () => {
      added.length = 0;
      addPenLine([points, '#ff0000', false]);
      assert.strictEqual(added.length, 1, 'one mesh per stroke');
      const ys = verts(added[0]).map((v) => v.y);
      assert.ok(ys.length >= 6, 'a ribbon needs at least one quad');
      assert.ok(Math.max.apply(null, ys) === 0 && Math.min.apply(null, ys) === 0,
          'every vertex must sit AT y=0; found ' +
          Math.min.apply(null, ys) + '..' + Math.max.apply(null, ys));
    });

    it('and has real width, in metres — ' + name, () => {
      /* The width is what makes it visible at all once it is flat on
         the grass, and what makes it scale with the pitch instead of
         staying a hairline. */
      added.length = 0;
      addPenLine([points, '#ff0000', false]);
      const vs = verts(added[0]);
      const first = String(points).split(' ')[0].split(',').map(Number);
      const w = {x: (first[0] - 50) * 1.05, z: (first[1] - 50) * 0.68};
      const spread = Math.max.apply(null, vs.map(
          (v) => Math.hypot(v.x - w.x, v.z - w.z)));
      assert.ok(spread > 0.1, 'the ribbon must have breadth; got ' + spread.toFixed(3));
    });
  });

  it('a pen stroke wins the depth fight without leaving the ground', () => {
    /* polygonOffset biases the depth VALUE, so the mark can be
       coplanar with the turf and still win. Height was the old way
       and it is what floated. */
    added.length = 0;
    addPenLine(['10,50 40,50', '#ff0000', false]);
    const m = added[0].material;
    assert.strictEqual(m.polygonOffset, true, 'polygonOffset must be on');
    assert.ok(m.polygonOffsetFactor < 0 && m.polygonOffsetUnits < 0,
        'the bias must pull the mark TOWARD the camera');
    assert.strictEqual(m.depthTest, true,
        'depthTest stays on, or a player no longer occludes the stroke');
    assert.strictEqual(m.depthWrite, false,
        'depthWrite stays off, so the marks do not fight each other');
  });

  it('marks stack by renderOrder, in the 2D board\'s order', () => {
    /* Height used to carry this (0.04 / 0.06 / 0.08). With everything
       at zero it has to be explicit, and it must match the SVG: the
       2D board paints zones, then arrows, then pen. */
    added.length = 0;
    addArrow([10, 50, 40, 50, '#fff', false]);
    const arrowOrder = added[0].renderOrder;
    added.length = 0;
    addPenLine(['10,50 40,50', '#fff', false]);
    const penOrder = added[0].renderOrder;
    assert.ok(penOrder > arrowOrder,
        'a pen stroke must paint over an arrow, as in 2D (' +
        penOrder + ' vs ' + arrowOrder + ')');
  });

  it('a degenerate stroke adds nothing', () => {
    added.length = 0;
    addPenLine(['50,50', '#fff', false]);
    assert.strictEqual(added.length, 0, 'a single point is not a stroke');
  });
});

/* ── The camera the overlay reads is the current one ──────────────
 *
 * `lookAt()` updates a camera's LOCAL matrix. `matrixWorld` — and so
 * `matrixWorldInverse`, which `Vector3.project()` uses — is refreshed
 * inside `renderer.render()`. Anything that moves the camera and then
 * projects a point before the next render reads the PREVIOUS frame's
 * camera.
 *
 * `pitchScreenRect()` does exactly that, from app.js's own rAF loop,
 * and the drawing overlay lagged the pitch on every zoom. Worse on a
 * static board: no camera path called `invalidate()`, so a zoom
 * scheduled no frame at all and the overlay simply froze until an
 * unrelated edit forced a render. It only looked like it worked
 * because a board with trajectories re-renders every frame for the
 * travelling dots.
 *
 * There is no renderer here, which is the point: if `applyCamera()`
 * leaves the matrix to the render, this test sees the stale one.
 */
describe('applyCamera leaves the camera ready to project', () => {
  let build;

  before(() => {
    const grabFn = (marker) => {
      const i = src.indexOf(marker);
      assert.ok(i !== -1, 'not found: ' + marker);
      return src.slice(i, src.indexOf('\n  }', i) + '\n  }'.length);
    };
    build = () => {
      const camera = new THREE.PerspectiveCamera(45, 1200 / 700, 0.5, 1000);
      const cam = {theta: -Math.PI / 2, phi: 0, dist: 100,
                   target: new THREE.Vector3()};
      let invalidated = 0;
      const applyCamera = new Function('THREE', 'camera', 'cam', 'upFor', 'invalidate',
          grabFn('  function applyCamera() {') + '\nreturn applyCamera;')(
        THREE, camera, cam,
        (phi, theta) => (phi < 0.02
          ? new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta))
          : new THREE.Vector3(0, 1, 0)),
        () => { invalidated++; });
      return {camera, cam, applyCamera, seen: () => invalidated};
    };
  });

  const project = (camera, v) => v.clone().project(camera);

  it('a zoom moves the projection immediately, with no render', () => {
    const b = build();
    b.applyCamera();
    const before = project(b.camera, new THREE.Vector3(40, 0, 20)).x;

    b.cam.dist = 25;                 // four notches of wheel, roughly
    b.applyCamera();
    const after = project(b.camera, new THREE.Vector3(40, 0, 20)).x;

    assert.ok(Math.abs(after - before) > 0.1,
        'the projection must follow the zoom without waiting for a render; ' +
        'moved from ' + before.toFixed(4) + ' to ' + after.toFixed(4));
  });

  it('a pan moves it too', () => {
    const b = build();
    b.applyCamera();
    const before = project(b.camera, new THREE.Vector3(0, 0, 0)).x;
    b.cam.target.set(20, 0, 0);
    b.applyCamera();
    const after = project(b.camera, new THREE.Vector3(0, 0, 0)).x;
    assert.ok(Math.abs(after - before) > 0.1,
        'panning must move the projection; ' + before.toFixed(4) +
        ' -> ' + after.toFixed(4));
  });

  it('and schedules a frame, or nothing redraws', () => {
    /* The other half. A correct matrix that nobody renders is still a
       board that does not move when you spin the wheel. */
    const b = build();
    const at = b.seen();
    b.cam.dist = 40;
    b.applyCamera();
    assert.ok(b.seen() > at, 'applyCamera must invalidate');
  });

  it('the projection agrees with a camera that HAS been rendered', () => {
    /* Guards the test: proves the fresh matrix is the RIGHT one, not
       merely a different one. */
    const b = build();
    b.cam.dist = 33;
    b.applyCamera();
    const fresh = project(b.camera, new THREE.Vector3(-30, 0, 12));

    const ref = new THREE.PerspectiveCamera(45, 1200 / 700, 0.5, 1000);
    ref.position.copy(b.camera.position);
    ref.up.copy(b.camera.up);
    ref.lookAt(b.cam.target);
    ref.updateMatrixWorld(true);
    const want = project(ref, new THREE.Vector3(-30, 0, 12));

    assert.ok(Math.abs(fresh.x - want.x) < 1e-9 &&
              Math.abs(fresh.y - want.y) < 1e-9,
        'fresh ' + fresh.x.toFixed(6) + ',' + fresh.y.toFixed(6) +
        ' vs ' + want.x.toFixed(6) + ',' + want.y.toFixed(6));
  });
});
