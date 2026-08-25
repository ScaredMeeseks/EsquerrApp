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
