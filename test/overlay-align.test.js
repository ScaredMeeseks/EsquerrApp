
/* ── The overlay lands exactly on the 3D pitch, MEASURED ───────────
 *
 * The draw lock lays the 2D board over the turf. Whether it lands in
 * the right place is a claim about two independent mappings agreeing:
 *
 *   2D:  a percent (x%, y%) is a fraction of the overlay rectangle.
 *   3D:  the same percent goes through BG.toWorld and then through
 *        the real perspective camera onto the canvas.
 *
 * Nothing in the source says whether those agree — a source test can
 * confirm both corners are projected and still miss a flip, a swap or
 * a board type whose axes are transposed. So this runs both and
 * compares pixels, for every board type.
 *
 * The one that matters most is `half`/`area`: board-geom draws those
 * PORTRAIT, with the goal at the top and board x = pitch WIDTH. If
 * the 3D scene lays them out the other way round, every stroke drawn
 * on the overlay lands rotated a quarter turn.
 */
const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BG = require(path.join(ROOT, 'js', 'board-geom.js'));

let THREE;
before(async () => { THREE = await import('../vendor/three.module.min.js'); });

const W = 1200, H = 700;          // canvas, in CSS pixels

/* The real preset, not a transcription of it. Pinning `phi = 0.001`
   by hand here is why this suite could never have caught the drift:
   it measured the camera the test believed in rather than the one
   board3d builds. */
const {readPresets} = require('./board3d-presets.js');
const TOP = readPresets().top;

/**
 * A camera placed exactly as board3d's `top` preset places it, then
 * zoomed and panned the way the coach can.
 *
 * `zoom` divides the fitted distance — the wheel multiplies `cam.dist`
 * by 0.9 per notch, so ×4 is about fourteen notches in, well within
 * what someone working on one corner will do. `pan` moves the look-at
 * target across the turf, exactly as `panBy` does.
 */
function topCamera(pitch, boardType, zoom, pan) {
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.5, 1000);
  const e = BG.extent(pitch, boardType, false);
  const halfFov = (45 * Math.PI / 180) / 2;
  const distV = (e.ay / 2) / Math.tan(halfFov);
  const distH = (e.ax / 2) / (Math.tan(halfFov) * Math.max(0.2, camera.aspect));
  const dist = Math.max(distV, distH) * 1.25 / (zoom || 1);
  const [tx, tz] = pan || [0, 0];

  const theta = TOP.theta, phi = TOP.phi;
  camera.position.set(
      tx + dist * Math.sin(phi) * Math.cos(theta),
      dist * Math.cos(phi),
      tz + dist * Math.sin(phi) * Math.sin(theta));
  // upFor(): a horizontal up below phi < 0.02.
  camera.up.copy(phi < 0.02
      ? new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta))
      : new THREE.Vector3(0, 1, 0));
  camera.lookAt(tx, 0, tz);
  camera.updateMatrixWorld(true);
  return camera;
}

const toPx = (camera, x, z) => {
  const v = new THREE.Vector3(x, 0, z).project(camera);
  return {x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H};
};

/** board3d's pitchScreenRect(), reproduced over the real camera. */
function screenRect(camera, pitch, boardType) {
  const e = BG.extent(pitch, boardType, false);
  const a = toPx(camera, -e.ax / 2, -e.ay / 2);
  const b = toPx(camera, e.ax / 2, e.ay / 2);
  return {
    left: Math.min(a.x, b.x), top: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y)
  };
}

describe('the drawing overlay lands on the 3D pitch', () => {
  /* Percent points with no symmetry, so a flip or a transposition
     cannot cancel out and look correct. */
  const PROBES = [
    ['top-left', 0, 0], ['top-right', 100, 0],
    ['bottom-left', 0, 100], ['centre', 50, 50],
    ['off-centre', 20, 75], ['near-corner', 90, 10]
  ];

  /* Zoom and pan, because the drift LIVES there. This suite used to
     measure only the fitted distance, where the error was 0.24px —
     under its own tolerance — so it passed while a coach zoomed in on
     a corner and watched the drawings slide off the grass.

     The reason it depends on zoom: a camera a hair off vertical maps
     the turf PROJECTIVELY, and the overlay interpolates linearly
     inside a bounding box, which assumes an AFFINE map. The error is
     proportional to how much depth varies across the pitch, so it
     grows as the camera comes down. Exactly overhead, every point on
     the turf is equidistant and the two agree to the bit. */
  const VIEWS = [
    ['fitted', 1, null],
    ['zoomed in x2', 2, null],
    ['zoomed in x4', 4, null],
    ['zoomed out x2', 0.5, null],
    ['panned to a corner, zoomed x3', 3, [18, -11]]
  ];

  [['full', null], ['half', null], ['area', null],
   ['full', [90, 55]], ['half', [120, 80]]].forEach(([boardType, pitch]) => {
    VIEWS.forEach(([view, zoom, pan]) => {
      it('agrees for ' + boardType + ' ' + (pitch ? pitch.join('x') : 'default') +
         ', ' + view, () => {
        const camera = topCamera(pitch, boardType, zoom, pan);
        const rect = screenRect(camera, pitch, boardType);

        PROBES.forEach(([name, px, py]) => {
          // Where the 2D overlay puts it: a fraction of its own box.
          const flat = {
            x: rect.left + (px / 100) * rect.width,
            y: rect.top + (py / 100) * rect.height
          };
          // Where the 3D scene puts the same percent.
          const w = BG.toWorld(px, py, pitch, boardType);
          const solid = toPx(camera, w.x, w.z);

          const dx = Math.abs(flat.x - solid.x), dy = Math.abs(flat.y - solid.y);
          assert.ok(dx < 0.5 && dy < 0.5,
              boardType + ' ' + view + ' ' + name + ' (' + px + '%,' + py +
              '%): overlay lands at ' + flat.x.toFixed(1) + ',' + flat.y.toFixed(1) +
              ' but the 3D scene puts it at ' + solid.x.toFixed(1) + ',' +
              solid.y.toFixed(1) + ' — off by ' + dx.toFixed(2) + ',' +
              dy.toFixed(2) + 'px');
        });
      });
    });
  });

  it('the top preset is EXACTLY overhead, which is what makes it affine', () => {
    /* The root cause, stated as the property rather than the number.
       A camera a hair off vertical is not "nearly overhead" for this
       purpose — it is the one thing the overlay maths cannot survive. */
    assert.strictEqual(TOP.phi, 0,
        'PRESETS.top.phi must be exactly 0; a tilted camera maps the turf ' +
        'projectively and the overlay interpolates affinely');
  });

  it('is not accidentally symmetric — the probes would catch a flip', () => {
    /* Guards the test itself: if toWorld were mirrored, the checks
       above must fail. Verified by mirroring one on purpose. */
    const camera = topCamera(null, 'full', 1, null);
    const rect = screenRect(camera, null, 'full');
    const w = BG.toWorld(20, 75, null, 'full');
    const mirrored = toPx(camera, -w.x, w.z);
    const honest = {
      x: rect.left + 0.20 * rect.width,
      y: rect.top + 0.75 * rect.height
    };
    assert.ok(Math.abs(mirrored.x - honest.x) > 50,
        'a mirrored x must be far from the honest one, or the probe proves nothing');
  });
});
