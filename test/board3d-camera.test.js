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
/* The mark builders, shared by both describes below. At file scope
   because the formatting suite needs the same harness, and building
   it twice means two chances for the stubs to differ. */
let addArrow, addPenLine, added;
/* What the builders registered as pickable, in order. */
const picked = [];

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

describe('drawn marks lie flat on the turf', () => {

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
    const built = new Function('THREE', 'BG', 'getPitch', 'getBoardType', 'drawRoot', 'objects',
        consts + '\n' +
        fn('  function decalMaterial(colour, opacity) {') + '\n' +
        fn('  function ribbonGeometry(pts, width, dashed) {') + '\n' +
        fn('  function roundedRectPath(cx, cz, w, h, radius) {') + '\n' +
        fn('  function addArrow(a, ai) {') + '\n' +
        fn('  function addPenLine(p, pi) {') + '\n' +
        'return {addArrow, addPenLine, DECAL_Y, PEN_W, ORDER};')(
      THREE,
      /* The REAL size tables, with only toWorld stubbed to a simple
         linear map. Stubbing MARK would let the mark weights drift
         from the 2D board with every test still green — the tables
         are the thing under test. */
      Object.assign(Object.create(require('../js/board-geom.js')),
          {toWorld: (x, y) => ({x: (x - 50) * 1.05, z: (y - 50) * 0.68})}),
      () => null, () => 'full',
      {add: (m) => added.push(m)}, picked);
    addArrow = built.addArrow;
    addPenLine = built.addPenLine;
  });

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

  it('cannot be hidden by a winding mistake', () => {
    /* This used to check the face normal pointed up, because the
       arrow was a local shape rotated into place by a hand-built
       basis and the wrong perpendicular turned it face-down. It is
       built directly in world coordinates now, so there is no basis
       to get backwards and the mesh carries no rotation at all — the
       old assertion measured an identity quaternion and proved
       nothing.

       What still matters is that a mark is visible from either side:
       these are decals in the turf plane, and a triangle wound the
       other way must not vanish. */
    added.length = 0;
    addArrow([20, 80, 75, 15, '#ff0000', false]);
    assert.strictEqual(added[0].material.side, THREE.DoubleSide,
        'a decal must render from both sides');
    assert.ok(added[0].quaternion.equals(new THREE.Quaternion()),
        'the geometry is already in world space; a rotation would move it twice');
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

/* ── 3D marks are formatted like the 2D ones ──────────────────────
 *
 * The 2D board draws arrows with round caps, zones with a rounded
 * outline, and either with a dash pattern. In 3D they were bare
 * shapes: no caps, no outline, and the dash flag was read from the
 * data and thrown away. All three are measured here on the built
 * geometry, because "has round caps" is a claim about vertices, not
 * about the source.
 */
describe('3D marks carry the 2D formatting', () => {
  const BGEOM = require('../js/board-geom.js');
  let addRect, added2;

  before(() => {
    const fn = (marker) => {
      const i = src.indexOf(marker);
      assert.ok(i !== -1, 'not found: ' + marker);
      return src.slice(i, src.indexOf('\n  }', i) + '\n  }'.length);
    };
    const consts = (() => {
      const i = src.indexOf('  const DECAL_Y =');
      const p = src.indexOf('const PEN_W', i);
      return src.slice(i, src.indexOf(';', p) + 1);
    })();
    added2 = [];
    addRect = new Function('THREE', 'BG', 'getPitch', 'getBoardType', 'drawRoot', 'objects',
        consts + '\n' +
        fn('  function decalMaterial(colour, opacity) {') + '\n' +
        fn('  function ribbonGeometry(pts, width, dashed) {') + '\n' +
        fn('  function roundedRectPath(cx, cz, w, h, radius) {') + '\n' +
        fn('  function addRect(r, ri) {') + '\nreturn addRect;')(
      THREE,
      Object.assign(Object.create(BGEOM),
          {toWorld: (x, y) => ({x: (x - 50) * 1.05, z: (y - 50) * 0.68})}),
      () => null, () => 'full',
      {add: (m) => added2.push(m)}, picked);
  });

  const verts2 = (mesh) => {
    const pos = mesh.geometry.attributes.position;
    const out = [];
    for (let i = 0; i < pos.count; i++) {
      out.push(new THREE.Vector3().fromBufferAttribute(pos, i));
    }
    return out;
  };

  it('a stroke end is ROUND, not a square corner', () => {
    /* A butt cap puts exactly two vertices at the end, both at half
       the width from the centreline. A round cap puts a fan of them
       all round it — including BEYOND the end, which a square cap
       never does. That overshoot is the measurement. */
    added.length = 0;
    addPenLine(['20,50 60,50', '#fff', false]);
    const vs = verts(added[0]);
    const endX = (60 - 50) * 1.05;
    const beyond = vs.filter((v) => v.x > endX + BGEOM.MARK.pen * 0.2);
    assert.ok(beyond.length >= 3,
        'a round cap must put vertices past the stroke end; found ' + beyond.length);
  });

  it('the round join has no orientation, so a diagonal turn is clean', () => {
    /* The first version filled joints with an AXIS-ALIGNED SQUARE.
       It looked right on a horizontal stroke and poked out of a
       diagonal one, because a square does not rotate with the line.
       A disc is the same shape from every angle: every join vertex
       must sit within half a width of the corner it rounds. */
    added.length = 0;
    addPenLine(['30,30 50,50', '#fff', false]);
    const corner = {x: (50 - 50) * 1.05, z: (50 - 50) * 0.68};
    const h = BGEOM.MARK.pen / 2;
    const near = verts(added[0]).filter(
        (v) => Math.hypot(v.x - corner.x, v.z - corner.z) < h * 1.001);
    assert.ok(near.length > 0, 'no vertices round the corner at all');
    // Not a single vertex further than the radius: that is the square.
    const worst = Math.max.apply(null, verts(added[0]).map((v) => {
      const d = Math.hypot(v.x - corner.x, v.z - corner.z);
      return d < h * 1.5 ? d : 0;
    }));
    assert.ok(worst <= h * 1.001,
        'a join vertex sits ' + worst.toFixed(4) + ' from the corner, ' +
        'past the ' + h.toFixed(4) + ' radius — that is a square, not a disc');
  });

  it('the arrow head is a FIXED length, as in 2D', () => {
    /* refreshArrowheads uses a constant aLen, so a short arrow and a
       long one carry the same head. The old 3D head was len * 0.3 —
       a different drawing at every length. */
    const headOf = (x1, x2) => {
      added.length = 0;
      addArrow([x1, 50, x2, 50, '#fff', false]);
      const vs = verts(added[0]);
      const tip = Math.max.apply(null, vs.map((v) => v.x));
      // The widest pair of vertices is the head's base.
      const wide = vs.filter((v) => Math.abs(v.z) > BGEOM.MARK.arrowShaft);
      assert.ok(wide.length >= 2, 'no head found');
      return tip - Math.max.apply(null, wide.map((v) => v.x));
    };
    const shortArrow = headOf(40, 60);
    const longArrow = headOf(10, 90);
    assert.ok(Math.abs(shortArrow - longArrow) < 0.01,
        'head length must not depend on arrow length: ' +
        shortArrow.toFixed(3) + ' vs ' + longArrow.toFixed(3));
    assert.ok(Math.abs(longArrow - BGEOM.MARK.arrowHead) < 0.01,
        'and must be MARK.arrowHead (' + BGEOM.MARK.arrowHead + '), got ' +
        longArrow.toFixed(3));
  });

  it('a very short arrow keeps a head rather than inverting', () => {
    /* A fixed 1.54m head on a 1m arrow would put the base behind the
       tail and fold the shaft inside out. */
    added.length = 0;
    addArrow([50, 50, 51, 50, '#fff', false]);
    assert.strictEqual(added.length, 1, 'a short arrow still draws');
    const vs = verts(added[0]);
    const span = Math.max.apply(null, vs.map((v) => v.x)) -
                 Math.min.apply(null, vs.map((v) => v.x));
    assert.ok(span > 0 && span < 3, 'the mark must stay near its own length: ' + span);
  });

  it('a dashed stroke has gaps; a solid one does not', () => {
    /* stroke-dasharray 6 4 exists on both arrows and pen strokes in
       2D and used to be read from the data and thrown away in 3D. */
    const area = (mesh) => {
      const vs = verts(mesh);
      let a = 0;
      for (let i = 0; i < vs.length; i += 3) {
        a += Math.abs((vs[i + 1].x - vs[i].x) * (vs[i + 2].z - vs[i].z) -
                      (vs[i + 2].x - vs[i].x) * (vs[i + 1].z - vs[i].z)) / 2;
      }
      return a;
    };
    const line = '5,50 95,50';
    added.length = 0; addPenLine([line, '#fff', false]);
    const solid = area(added[0]);
    added.length = 0; addPenLine([line, '#fff', true]);
    const dashed = area(added[0]);
    assert.ok(dashed < solid * 0.85,
        'a dashed stroke must cover less turf than a solid one: ' +
        dashed.toFixed(2) + ' vs ' + solid.toFixed(2));
    assert.ok(dashed > solid * 0.3, 'but must not vanish: ' + dashed.toFixed(2));
  });

  it('the dash pattern is the same table the 2D board uses', () => {
    assert.ok(Array.isArray(BGEOM.MARK.dash) && BGEOM.MARK.dash.length === 2,
        'MARK.dash must be an on/off pair');
    assert.ok(BGEOM.MARK.dash[0] > BGEOM.MARK.dash[1],
        'the 2D pattern is 6 on, 4 off — the dash is longer than the gap');
  });

  it('a zone has an outline, not just a fill', () => {
    /* In 2D a zone is a translucent fill inside a SOLID stroke. In 3D
       it was fill only, which reads as a smudge rather than a marked
       area. */
    added2.length = 0;
    addRect([20, 20, 30, 25, '#ff0000', 0.3]);
    assert.strictEqual(added2.length, 2, 'a zone is a fill plus an outline');
    const opacities = added2.map((m) => m.material.opacity).sort();
    assert.ok(opacities[0] < 0.9, 'the fill must stay translucent');
    assert.strictEqual(opacities[1], 1, 'the outline must be solid, as in 2D');
  });

  it('the outline is drawn over its own fill', () => {
    added2.length = 0;
    addRect([20, 20, 30, 25, '#ff0000', 0.3]);
    const [fill, border] = added2;
    assert.ok(border.renderOrder > fill.renderOrder,
        'the outline must paint after the fill it surrounds');
  });

  it('the outline has rounded corners, on the edge it traces', () => {
    /* rx:2 in 2D. An inset polyline would round by the STROKE's
       half-width and pull the whole outline away from the edge — a
       different rectangle. The corner vertices must sit ON the
       rectangle's bounds. */
    added2.length = 0;
    addRect([20, 20, 30, 25, '#ff0000', 0.3]);
    const border = added2[1];
    const vs = verts2(border);
    const xs = vs.map((v) => v.x), zs = vs.map((v) => v.z);
    const fillVs = verts2(added2[0]);
    /* The fill is a PlaneGeometry rotated flat, so compare against
       its own extent rather than recomputing the rectangle here. */
    const fw = Math.max.apply(null, fillVs.map((v) => v.x)) -
               Math.min.apply(null, fillVs.map((v) => v.x));
    const bw = Math.max.apply(null, xs) - Math.min.apply(null, xs);
    assert.ok(bw > fw * 0.9,
        'the outline must trace the zone edge, not sit inset from it: ' +
        bw.toFixed(2) + ' vs a zone ' + fw.toFixed(2) + ' wide');
    assert.ok(zs.length > 40,
        'a rounded outline needs sampled corner arcs; got ' + zs.length + ' vertices');
  });

  it('every mark lies at y=0, outline included', () => {
    added2.length = 0;
    addRect([20, 20, 30, 25, '#ff0000', 0.3]);
    const border = added2[1];
    verts2(border).forEach((v) => assert.strictEqual(v.y, 0,
        'the outline must be a decal like everything else'));
  });
});

/* ── Stripes run the same way in both views ───────────────────────
 *
 * A `dir: 'v'` kit painted vertical bands in 2D and HORIZONTAL ones
 * in 3D. The painter was not wrong: it drew canvas-vertical bands for
 * 'v', exactly as fillCss does. The cylinder cap's UV mapping swaps
 * the axes, and not in the direction anyone would guess. Measured off
 * a real CylinderGeometry:
 *
 *     +X (screen right)  u=0.5  v=1        -> v follows world X
 *     +Z (screen down)   u=1    v=0.5      -> u follows world Z
 *
 * So a canvas-vertical band varies along world Z, which under the
 * top-down camera spans the screen horizontally.
 *
 * These tests assert the OBSERVABLE — which world axis the bands vary
 * along — rather than that the painter's branches are swapped. The
 * swap is one way to get there; a texture matrix or a different cap
 * geometry would be another, and both should pass.
 */
/* The measured cap mapping and the painter, at file scope: the
   colour-side suite below needs both, and measuring twice means two
   chances for the two measurements to disagree. */
let capUvTable;

const paintKit = (fill, number) => {
  const rects = [];
  /* The painter declares its own texture size; this stub only has to
     report the canvas it was handed, and the caller reads the size
     back out of the result rather than assuming it. */
  const S = 256;
  /* Records what the painter does. The text side is recorded too now,
     with the transform, because the number is drawn through a rotate
     and the only way to know where it lands is to follow the matrix
     the painter set. A no-op stub would have hidden that entirely. */
  const ops = [];
  let cur = {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0};   // identity
  const stack = [];
  const ctx = {
    set fillStyle(v) { this._f = v; }, get fillStyle() { return this._f; },
    set strokeStyle(v) { this._s = v; }, get strokeStyle() { return this._s; },
    set font(v) { this._font = v; }, get font() { return this._font; },
    set lineWidth(v) {}, set lineJoin(v) {}, set miterLimit(v) {},
    set textAlign(v) {}, set textBaseline(v) {},
    fillRect: (x, y, w, h) => rects.push({x, y, w, h}),
    save: () => { stack.push(Object.assign({}, cur)); },
    restore: () => { cur = stack.pop() || cur; },
    translate: (x, y) => {
      cur = {a: cur.a, b: cur.b, c: cur.c, d: cur.d,
             e: cur.e + cur.a * x + cur.c * y,
             f: cur.f + cur.b * x + cur.d * y};
    },
    rotate: (t) => {
      const co = Math.cos(t), si = Math.sin(t);
      cur = {a: cur.a * co + cur.c * si, b: cur.b * co + cur.d * si,
             c: cur.c * co - cur.a * si, d: cur.d * co - cur.b * si,
             e: cur.e, f: cur.f};
    },
    /* Enough of TextMetrics for the ink-centring to have something to
       work with; the exact numbers do not matter to any assertion, but
       their PRESENCE decides which branch the painter takes. */
    measureText: () => ({width: 40, actualBoundingBoxAscent: 30,
                         actualBoundingBoxDescent: 2}),
    fillText: (t, x, y) => ops.push({op: 'fill', t, x, y, m: Object.assign({}, cur)}),
    strokeText: (t, x, y) => ops.push({op: 'stroke', t, x, y, m: Object.assign({}, cur)})
  };
  /* The helper block AND the painter: playerTexture reads NUM_SCALE,
     isLight and maxAnisotropy, which live above it. */
  const body = (() => {
    const i = src.indexOf('  const NUM_SCALE =');
    assert.ok(i !== -1, 'the player-texture helpers were not found');
    const j = src.indexOf('  function playerTexture(fill, number) {');
    assert.ok(j !== -1 && j > i, 'playerTexture not found below its helpers');
    return src.slice(i, src.indexOf('\n  }', j) + '\n  }'.length);
  })();
  const fn = new Function('THREE', 'document', 'fillCss', 'parseFill', 'renderer',
      body + '\nreturn playerTexture;')(
    {CanvasTexture: function () { return {}; }, SRGBColorSpace: 'srgb'},
    {createElement: () => ({getContext: () => ctx, width: S, height: S})},
    require('../js/utils.js').fillCss,
    require('../js/utils.js').parseFill,
    null);
  fn(fill, number || '');
  return {rects, ops, S};
};


/* ROOT-LEVEL, not inside one suite's before(). Two suites read this
   table now — the stripes and the shirt number — and a `before` in the
   first of them only feeds the second by accident of file order. */
before(() => {
    /* The real mapping, read off the real geometry: for each cap
       vertex, where it sits in the world and where it samples the
       texture. Hardcoding the table would make this a test of my
       arithmetic rather than of three.js. */
    const R = 0.9;
    const g = new THREE.CylinderGeometry(R, R, 0.35, 24);
    const idx = g.getIndex(), pos = g.getAttribute('position'),
          uv = g.getAttribute('uv');
    const cap = g.groups.find((gr) => gr.materialIndex === 1);  // top cap
    assert.ok(cap, 'no top cap group');
    const seen = new Set();
    capUvTable = [];
    for (let i = cap.start; i < cap.start + cap.count; i++) {
      const v = idx.getX(i);
      if (seen.has(v)) continue;
      seen.add(v);
      capUvTable.push({x: pos.getX(v), z: pos.getZ(v), u: uv.getX(v), v: uv.getY(v)});
    }
    assert.ok(capUvTable.length > 20, 'too few cap vertices to measure');
});

describe('a striped kit reads the same way in 2D and 3D', () => {
  /**
   * Which WORLD axis the painted bands vary along.
   *
   * A band that varies in canvas x varies in texture u; u follows one
   * world axis and v the other. Rather than reasoning about which,
   * look it up in the measured table.
   */
  const bandAxis = (fill) => {
    const {rects, S} = paintKit(fill);
    assert.ok(rects.length >= 2, 'expected several bands, got ' + rects.length);
    const variesInX = rects.some((r) => r.x !== rects[0].x);
    const variesInY = rects.some((r) => r.y !== rects[0].y);
    assert.ok(variesInX !== variesInY,
        'bands must step along exactly one canvas axis');

    // Which world axis does that canvas axis correspond to?
    const spread = (key, axis) => {
      const lo = capUvTable.filter((p) => p[key] < 0.25);
      const hi = capUvTable.filter((p) => p[key] > 0.75);
      if (!lo.length || !hi.length) return 0;
      const avg = (a) => a.reduce((s, p) => s + p[axis], 0) / a.length;
      return Math.abs(avg(hi) - avg(lo));
    };
    const texAxis = variesInX ? 'u' : 'v';
    return spread(texAxis, 'x') > spread(texAxis, 'z') ? 'worldX' : 'worldZ';
  };

  it('a vertical kit stripes along world X — vertical from above', () => {
    /* The 2D board draws `dir:'v'` with a 90deg gradient, whose bands
       are vertical on screen. Under the top-down camera world X is
       screen right, so bands varying along X are vertical there too. */
    assert.strictEqual(bandAxis('s|v|4|#a50044|#004d98'), 'worldX',
        'a vertical kit must vary along world X, or it reads horizontal');
  });

  it('a horizontal kit stripes along world Z', () => {
    /* Checked as well as the vertical case: swapping both branches
       leaves one of them looking correct on its own. */
    assert.strictEqual(bandAxis('s|h|4|#a50044|#004d98'), 'worldZ',
        'a horizontal kit must vary along world Z');
  });

  it('the two directions are not the same, which is the whole point', () => {
    assert.notStrictEqual(bandAxis('s|v|4|#a50044|#004d98'),
        bandAxis('s|h|4|#a50044|#004d98'));
  });

  it('a solid kit paints one band and no stripes', () => {
    const {rects} = paintKit('#a50044');
    assert.strictEqual(rects.length, 1, 'a solid kit is one fill');
  });
});

/* ── And the colours are the same way round ───────────────────────
   Getting the AXIS right still leaves two ways to paint it. The first
   fix put a vertical kit's first colour on the right where 2D puts it
   on the left, because CanvasTexture flips Y on upload and the cap's
   v axis runs -X to +X. Measured: band 0 landed at world X +0.78.
*/
describe('a striped kit starts on the same side in both views', () => {
  /* Where a canvas coordinate lands in the world, from the same
     measured cap table the axis tests use. */
  const worldOf = (texKey, texVal, axis) => {
    const lo = capUvTable.filter((p) => p[texKey] < 0.25);
    const hi = capUvTable.filter((p) => p[texKey] > 0.75);
    const avg = (a) => a.reduce((s, p) => s + p[axis], 0) / a.length;
    return texVal < 0.5 ? avg(lo) : avg(hi);
  };

  /** Where the FIRST band — colour c1 — ends up in world space. */
  const firstBandAt = (fill) => {
    const {rects, S} = paintKit(fill);
    const first = rects[0];
    if (rects.some((r) => r.x !== rects[0].x)) {
      // Bands step along canvas x, which is texture u, no flip.
      return {axis: 'z', at: worldOf('u', (first.x + first.w / 2) / S, 'z')};
    }
    // Bands step along canvas y — texture v, FLIPPED on upload.
    const v = 1 - (first.y + first.h / 2) / S;
    return {axis: 'x', at: worldOf('v', v, 'x')};
  };

  it('a vertical kit starts its first colour on the LEFT, as in 2D', () => {
    /* linear-gradient(90deg, c1 …) runs left to right, so 2D puts c1
       on the left. World -X is screen left under the top view. */
    const r = firstBandAt('s|v|4|#a50044|#004d98');
    assert.strictEqual(r.axis, 'x');
    assert.ok(r.at < 0,
        'c1 must land at negative world X (screen left); got ' + r.at.toFixed(2));
  });

  it('a horizontal kit starts its first colour at the TOP, as in 2D', () => {
    /* linear-gradient(180deg, c1 …) runs top to bottom. World -Z is
       screen up. */
    const r = firstBandAt('s|h|4|#a50044|#004d98');
    assert.strictEqual(r.axis, 'z');
    assert.ok(r.at < 0,
        'c1 must land at negative world Z (screen top); got ' + r.at.toFixed(2));
  });

  it('an odd stripe count keeps c1 first, not last', () => {
    /* Mirroring by swapping the two colours instead of reversing the
       band ORDER looks identical at n=4 and is wrong at n=3. */
    const r = firstBandAt('s|v|3|#a50044|#004d98');
    assert.ok(r.at < 0, 'c1 must still start on the left at n=3; got ' + r.at.toFixed(2));
  });
});

/* ── And the shirt number reads the right way up ──────────────────
 *
 * The same cap mapping, applied to the thing it was never applied to.
 * An upright glyph has its top at canvas -y, which is texture +v,
 * which is world +X — SCREEN RIGHT under the top-down camera. Every
 * number would have lain on its side.
 *
 * Nobody saw it because nobody could put a number on a 3D player
 * until v169: numbering was a double-click on the flat board, and the
 * flat board is hidden in 3D.
 *
 * Measured, not reasoned about. The painter's transform is followed
 * through the stub, the glyph's up vector is pushed through it into
 * texture space, and the measured cap table says where that lands in
 * the world. A different fix — a texture matrix, another geometry —
 * passes this too.
 */
describe('a shirt number reads the right way up from above', () => {
  /* Where a texture-space direction points in the world, from the
     same measured table the stripe tests use. */
  const worldDirOf = (texKey, axis) => {
    const lo = capUvTable.filter((p) => p[texKey] < 0.25);
    const hi = capUvTable.filter((p) => p[texKey] > 0.75);
    assert.ok(lo.length && hi.length, 'the cap table has no spread in ' + texKey);
    const avg = (a) => a.reduce((s, p) => s + p[axis], 0) / a.length;
    return avg(hi) - avg(lo);          // world delta per +1 of that tex axis
  };

  /** Which way the top of the painted glyph points, in world space. */
  const glyphUpWorld = () => {
    const {ops} = paintKit('#ffffff', '9');
    const fill = ops.filter((o) => o.op === 'fill');
    assert.strictEqual(fill.length, 1, 'expected exactly one fillText');
    const m = fill[0].m;
    /* Local up is (0,-1). A canvas matrix maps a DIRECTION by its
       linear part alone — the translation is where the glyph sits,
       not which way it faces. */
    const cx = m.c * -1, cy = m.d * -1;          // canvas-space up
    /* canvas x -> texture u directly; canvas y -> texture v FLIPPED,
       because CanvasTexture flips Y on upload. */
    const du = cx, dv = -cy;
    return {
      x: du * worldDirOf('u', 'x') + dv * worldDirOf('v', 'x'),
      z: du * worldDirOf('u', 'z') + dv * worldDirOf('v', 'z')
    };
  };

  it('its top points at world -Z, which is screen up', () => {
    const up = glyphUpWorld();
    assert.ok(Math.abs(up.z) > Math.abs(up.x),
        'the number must stand along Z, not across it — it is lying on ' +
        'its side; up = (' + up.x.toFixed(2) + ', ' + up.z.toFixed(2) + ')');
    assert.ok(up.z < 0,
        'and point at -Z (screen up), not +Z — it is upside down; got z=' +
        up.z.toFixed(2));
  });

  it('the correction is a real one, not a no-op', () => {
    /* Guards the guard: without the rotate, up lands along X and the
       assertion above is the only thing that would have caught it. */
    const {ops} = paintKit('#ffffff', '9');
    const m = ops.filter((o) => o.op === 'fill')[0].m;
    assert.ok(Math.abs(m.a) < 1e-9 && Math.abs(m.d) < 1e-9,
        'the painter must actually turn the canvas — the matrix is still ' +
        'axis-aligned, so nothing was rotated');
  });

  it('it is drawn twice: an outline, then the fill', () => {
    /* Half a number can sit on each colour of a striped kit, and `fg`
       is only ever right for one of them. */
    const {ops} = paintKit('s|v|4|#ffffff|#111111', '9');
    assert.strictEqual(ops.filter((o) => o.op === 'stroke').length, 1,
        'the number must carry an outline');
    const iStroke = ops.findIndex((o) => o.op === 'stroke');
    const iFill = ops.findIndex((o) => o.op === 'fill');
    assert.ok(iStroke < iFill, 'the outline goes down first, or it covers the ink');
  });

  it('and centred on its own ink, not on the em box', () => {
    /* textBaseline:'middle' centres the em box, which for digits sits
       low — the same mistake the frame delete cross made with flexbox.
       With ascent 30 and descent 2 the offset must be 14. */
    const {ops} = paintKit('#ffffff', '9');
    const fill = ops.filter((o) => o.op === 'fill')[0];
    assert.strictEqual(fill.x, 0, 'centred across by textAlign, so x is 0');
    assert.ok(Math.abs(fill.y - 14) < 1e-9,
        'y must be (ascent - descent) / 2 = 14; got ' + fill.y);
  });

  it('a bare disc paints no text at all', () => {
    assert.strictEqual(paintKit('#ffffff', '').ops.length, 0,
        'an unnumbered player must not get a blank glyph');
  });

  it('it is big enough to read, and the map sharp enough to hold it', () => {
    /* Both of these are REQUIREMENTS rather than implementation
       details, so they are pinned deliberately. A shirt number fills
       most of the back it is printed on; at the old 0.5 it read as a
       small mark in the middle of a disc. And a 1.8m disc covers a lot
       of screen at any real zoom — the old 128px map was visibly soft
       the moment there was anything on it worth reading.

       Named rather than measured because the stub's TextMetrics are
       invented: what can be checked here is that the constants say
       what they should and that the painter actually uses them. */
    const scale = /const NUM_SCALE = ([\d.]+);/.exec(src);
    assert.ok(scale, 'the number scale must be declared once, by name');
    assert.ok(parseFloat(scale[1]) >= 0.6,
        'a shirt number must fill most of the disc; got ' + scale[1]);
    /* THE FONT LINE, not the constant anywhere. A bare search matched
       the no-metrics fallback further down, which also multiplies by
       NUM_SCALE — so hard-coding 0.5 back into the font left the test
       green while the number went small again. */
    assert.ok(/g\.font = 'bold ' \+ Math\.round\(S \* NUM_SCALE\) \+ 'px/.test(src),
        'the font size must come from the constant, or it is decoration');
    const size = /function playerTexture\(fill, number\) \{[\s\S]*?const S = (\d+);/.exec(src);
    assert.ok(size, 'the texture size must be declared inside the painter');
    assert.ok(Number(size[1]) >= 256,
        'the disc map must be at least 256px or the number is soft; got ' + size[1]);
  });
});
