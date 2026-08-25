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

  /* Roughly the shipped presets. Top is the one that used to flip. */
  const PRESETS = {
    broadcast: {theta: -Math.PI / 2, phi: 1.0},
    top: {theta: -Math.PI / 2, phi: 0.001},
    goal: {theta: Math.PI, phi: 1.32},
    side: {theta: -Math.PI / 2, phi: 1.38}
  };

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
  let addArrow, added;

  before(() => {
    /* addArrow needs BG.toWorld, a colour and somewhere to add to.
       Everything else it touches is three.js. */
    const body = (() => {
      const i = src.indexOf('  function addArrow(a) {');
      const j = src.indexOf('\n  }', i) + '\n  }'.length;
      assert.ok(i !== -1, 'addArrow not found');
      return src.slice(i, j);
    })();
    added = [];
    addArrow = new Function('THREE', 'BG', 'getPitch', 'getBoardType', 'drawRoot',
        body + '\nreturn addArrow;')(
      THREE,
      {toWorld: (x, y) => ({x: (x - 50) * 1.05, z: (y - 50) * 0.68})},
      () => null, () => 'full',
      {add: (m) => added.push(m)});
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
      assert.ok(Math.min.apply(null, ys) > 0,
          'and sit above the turf, not inside it');
      assert.ok(Math.max.apply(null, ys) < 0.2,
          'barely above it — a mark, not an object');
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

  it('zones and pen strokes were already flat, and stay that way', () => {
    /* Both are built in the turf plane; this is a regression guard,
       not a fix. A zone is a rotated plane, a stroke is a line — and
       neither may quietly become an extruded solid. */
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const rect = bare.slice(bare.indexOf('function addRect('), bare.indexOf('function addPenLine('));
    assert.ok(/PlaneGeometry/.test(rect) && /rotation\.x = -Math\.PI \/ 2/.test(rect),
        'a zone must stay a plane laid flat');
    const pen = bare.slice(bare.indexOf('function addPenLine('), bare.indexOf('function addText('));
    assert.ok(/THREE\.Line\(/.test(pen), 'a pen stroke must stay a line');
    assert.ok(!/(Cylinder|Cone|Box|Extrude|Tube|Sphere)Geometry/.test(rect + pen),
        'no solids among the drawn marks');
  });
});
