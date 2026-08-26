/* The ball spins, and carries marks that let you see it.
 *
 * Run, not read. `ballSpinStep` takes plain objects and returns plain
 * numbers, and `ballDots` takes nothing at all, so both are evaluated
 * here and checked against arithmetic done independently — the roll
 * axis against what "rolling forward" means rather than against a
 * pinned vector, and the dot spread against the icosahedron's own
 * defining property rather than against a list somebody typed.
 *
 * What is NOT settled here: whether it looks right. That is a hand
 * check, and it is listed as one in the plan.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

/** A block of board3d, from a marker to the close of the function after it. */
const block = (start, fnName) => {
  const i = src.indexOf(start);
  assert.ok(i !== -1, 'not found: ' + start);
  const j = src.indexOf('\n  }', src.indexOf('function ' + fnName, i));
  assert.ok(j > i, fnName + ' not found below ' + start);
  return src.slice(i, j + 4);
};

describe('the ball spins', () => {
  /* Lifted out with the constants it reads. BALL_R is injected rather
     than sliced: it comes from BG.OBJ, which is board-geom's business
     and already has its own tests. */
  const R = 0.25;                                   // BG.OBJ.ball / 2
  const spin = new Function('BALL_R',
      block('  const SPIN_ROLL =', 'ballSpinStep') +
      '\nreturn {ballSpinStep, SPIN_ROLL, SPIN_BEND};')(R);

  const step = (from, to, dirPrev) =>
    spin.ballSpinStep(from, to, dirPrev || null);

  /* Where a point at the top of the ball is pushed by a rotation about
     `w`: the cross product w x (0,R,0), written out from the
     definition rather than taken from the code under test. */
  const topMoves = (w) => ({x: -w.z * R, z: w.x * R});

  it('rolls FORWARD — the top of the ball goes the way the ball goes', () => {
    /* The whole of "tops down", and the assertion the axis was derived
       for. A sign error here rolls the ball backwards, which reads as
       badly as no spin at all — and is not something source text could
       have told anyone. */
    [[1, 0], [0, 1], [-1, 0], [0.6, -0.8]].forEach(([ux, uz]) => {
      const s = step({x: 0, z: 0}, {x: ux * 4, z: uz * 4});
      const m = topMoves(s.rollAxis);
      const along = m.x * ux + m.z * uz;
      const across = Math.abs(m.x * -uz + m.z * ux);
      assert.ok(along > 0,
          'the top must move WITH the ball, not against it; heading ' +
          ux + ',' + uz + ' gave ' + along.toFixed(3));
      assert.ok(across < 1e-9,
          'and straight along it, not sideways; got ' + across.toFixed(4));
    });
  });

  it('and the axis is level, or the ball tumbles', () => {
    const s = step({x: 0, z: 0}, {x: 1, z: 1});
    assert.strictEqual(s.rollAxis.y, 0);
  });

  it('spins faster the faster it travels', () => {
    const slow = step({x: 0, z: 0}, {x: 1, z: 0});
    const fast = step({x: 0, z: 0}, {x: 2, z: 0});
    assert.ok(Math.abs(fast.roll - slow.roll * 2) < 1e-9,
        'twice the distance in a frame is twice the roll');
    assert.ok(slow.roll > 0);
  });

  it('at a DAMPED rolling-without-slipping rate', () => {
    /* Undamped, dist/R on a quarter-metre ball is about 120 rad/s at a
       hard pass — a blur, not a spin. The factor is a taste value, so
       what is pinned is that it is applied and that it damps. */
    const s = step({x: 0, z: 0}, {x: 1, z: 0});
    assert.ok(Math.abs(s.roll - (1 / R) * spin.SPIN_ROLL) < 1e-9,
        'roll must be dist/R scaled by the damping');
    assert.ok(spin.SPIN_ROLL > 0 && spin.SPIN_ROLL < 1,
        'the damping must damp; got ' + spin.SPIN_ROLL);
  });

  it('a bend to the LEFT of travel spins it clockwise from above', () => {
    /* THE OWNER'S CONVENTION, not a derivation — said plainly so the
       next reader does not go looking for the aerodynamics behind it.

       Travelling +X with +Z as screen-down, a turn toward -Z is a turn
       to the left. Clockwise seen from above is a NEGATIVE rotation
       about +Y, so the yaw must come out negative. */
    const s = step({x: 0, z: 0}, {x: 1, z: -0.2}, {x: 1, z: 0});
    assert.ok(s.yaw < 0,
        'a left-of-travel bend must spin clockwise from above; got ' +
        s.yaw.toFixed(3));
  });

  it('and a bend to the right spins it the other way', () => {
    /* Checked as well as the left case: negating one sign leaves the
       other looking correct on its own. */
    const s = step({x: 0, z: 0}, {x: 1, z: 0.2}, {x: 1, z: 0});
    assert.ok(s.yaw > 0, 'got ' + s.yaw.toFixed(3));
  });

  it('holds for a ball played the other way, which is the point of it', () => {
    /* Left of TRAVEL, not left of screen — the owner's other choice.
       The same drawn bend played back towards the camera must spin the
       same way: travelling -X, a turn to the left is a turn toward +Z. */
    const away = step({x: 0, z: 0}, {x: 1, z: -0.2}, {x: 1, z: 0});
    const back = step({x: 0, z: 0}, {x: -1, z: 0.2}, {x: -1, z: 0});
    assert.ok(away.yaw < 0 && back.yaw < 0,
        'both are left-of-travel and must spin the same way; got ' +
        away.yaw.toFixed(3) + ' and ' + back.yaw.toFixed(3));
    assert.ok(Math.abs(away.yaw - back.yaw) < 1e-9, 'and by the same amount');
  });

  it('spins harder the harder it bends', () => {
    const gentle = step({x: 0, z: 0}, {x: 1, z: -0.1}, {x: 1, z: 0});
    const sharp = step({x: 0, z: 0}, {x: 1, z: -0.5}, {x: 1, z: 0});
    assert.ok(Math.abs(sharp.yaw) > Math.abs(gentle.yaw),
        'a sharper turn must spin harder');
  });

  it('a straight run has no sidespin at all', () => {
    const s = step({x: 0, z: 0}, {x: 2, z: 0}, {x: 1, z: 0});
    /* `===`, not strictEqual: negating atan2(0, 1) yields -0, which
       Object.is — and therefore assert.strictEqual — separates from 0.
       Nothing downstream can tell them apart, and a test that can is
       testing the wrong thing. */
    assert.ok(s.yaw === 0, 'got ' + s.yaw);
    assert.ok(s.roll > 0, 'but it still rolls');
  });

  it('the first step of a flight has no sidespin either', () => {
    /* Nothing to turn against yet. A yaw invented here would put a
       twist on the ball the instant Play was pressed. */
    assert.strictEqual(step({x: 0, z: 0}, {x: 1, z: 1}).yaw, 0);
  });

  it('the two combine rather than replacing each other', () => {
    const s = step({x: 0, z: 0}, {x: 1, z: -0.2}, {x: 1, z: 0});
    assert.ok(s.roll > 0 && s.yaw !== 0, 'a bending pass must roll AND twist');
  });

  it('a ball that has not moved produces no rotation, and no NaN', () => {
    /* An axis of (0,0,0) normalises to NaN and takes the mesh with it —
       every vertex lands off-screen and the ball simply vanishes. */
    assert.strictEqual(step({x: 3, z: 4}, {x: 3, z: 4}, {x: 1, z: 0}), null);
    assert.strictEqual(step({x: 0, z: 0}, {x: 1e-9, z: 0}), null);
  });

  it('reports the heading it used, so the next step can turn against it', () => {
    const s = step({x: 0, z: 0}, {x: 3, z: 4});
    assert.ok(Math.abs(s.dir.x - 0.6) < 1e-9 && Math.abs(s.dir.z - 0.8) < 1e-9,
        'the direction must come back normalised');
  });
});

describe('the spin survives a rebuild', () => {
  /* rebuild() recreates every mesh, and applyFrameState triggers one
     at every frame boundary DURING playback — so a rotation living
     only on the mesh would snap back to identity at each keyframe.
     Source, because there is no scene to run here; but the trap is
     specific enough to name. */
  it('is kept outside the objects it belongs to', () => {
    assert.ok(/const ballSpin = new Map\(\);/.test(src),
        'the spin state must outlive the mesh, like handleModes does');
    assert.ok(/refreshObjects\(\) \{ rebuild\(\); invalidate\(\); \}/.test(src),
        'the premise: a refresh is a full rebuild');
  });

  it('and is put back on the new mesh', () => {
    const add = src.slice(src.indexOf('function addBall'),
        src.indexOf('function addCone'));
    assert.ok(/ballSpin\.get\(i\)/.test(add) &&
              /mesh\.quaternion\.copy\(st\.quat\)/.test(add),
        'addBall must restore the orientation the old mesh had');
  });

  it('and written back after every step', () => {
    const sp = src.slice(src.indexOf('setPosition(kind, index, pct, height)'),
        src.indexOf('setPlaying(on) {'));
    assert.ok(/st\.quat = o\.mesh\.quaternion\.clone\(\)/.test(sp),
        'a reference to the live quaternion would die with the mesh');
    assert.ok(/ballSpin\.set\(index, st\)/.test(sp), 'and be stored');
  });

  it('play forgets where the ball WAS, never how it is turned', () => {
    /* Without the first, the opening step of a playback is a jump from
       wherever the ball last sat and the spin arrives as a snap.
       Clearing the quaternion instead would snap the ball to a fresh
       orientation the instant Play was pressed. */
    const sp = src.slice(src.indexOf('setPlaying(on) {'),
        src.indexOf('getSelected()'));
    assert.ok(/st\.pos = null; st\.dir = null;/.test(sp),
        'the last position and heading must be dropped');
    assert.ok(!/st\.quat = null|ballSpin\.clear\(\)/.test(sp),
        'but the orientation must survive');
  });
});

describe('the ball is marked so a spin can be seen at all', () => {
  const dots = new Function(
      block('  const PHI =', 'ballDots') + '\nreturn ballDots;')();

  /* Back out of the equirectangular mapping, using the INVERSE of what
     the code wrote — repeating the forward transform would only
     confirm the code agrees with itself. */
  const asVectors = () => dots().map((d) => {
    const lat = (0.5 - d.v) * Math.PI;
    const lon = (d.u - 0.5) * 2 * Math.PI;
    return [Math.cos(lat) * Math.cos(lon), Math.sin(lat),
      Math.cos(lat) * Math.sin(lon)];
  });

  it('there are twelve of them', () => {
    assert.strictEqual(dots().length, 12);
  });

  it('and they are EVENLY spread, which is why an icosahedron', () => {
    /* The defining property, and the one a hand-placed list fails:
       every vertex of a regular icosahedron has its nearest neighbours
       at the same angle. Checked as a SPREAD across all twelve rather
       than against 63.43 degrees, so a different but still-regular
       arrangement would pass and only a lopsided one fails. */
    const v = asVectors();
    const nearest = v.map((a, i) => {
      let best = -2;
      v.forEach((b, j) => {
        if (i === j) return;
        const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        if (d > best) best = d;
      });
      return Math.acos(Math.max(-1, Math.min(1, best))) * 180 / Math.PI;
    });
    const lo = Math.min.apply(null, nearest);
    const hi = Math.max.apply(null, nearest);
    assert.ok(hi - lo < 0.01,
        'every dot must be the same distance from its closest neighbour; ' +
        'got ' + lo.toFixed(2) + ' to ' + hi.toFixed(2) + ' degrees');
    /* AND AS FAR APART AS TWELVE POINTS CAN BE. Uniform is not enough
       on its own — found by mutation: setting PHI to 1 turns the solid
       into a cuboctahedron, whose twelve vertices are also all
       equivalent, at 60 degrees. 63.435 is the proven maximum for
       twelve points on a sphere and the icosahedron is the arrangement
       that reaches it, so anything below it is a worse spread and
       leaves a larger bare patch for the camera to catch. */
    assert.ok(lo > 63,
        'twelve points can be 63.4 degrees apart and these are ' +
        lo.toFixed(2) + ' — a worse arrangement than an icosahedron');
  });

  it('every one is a distinct point', () => {
    const seen = new Set(dots().map((d) => d.u.toFixed(6) + ',' + d.v.toFixed(6)));
    assert.strictEqual(seen.size, 12, 'two dots landed in the same place');
  });

  it('none of them sits at a pole', () => {
    /* An equirectangular map smears a polar dot across the entire top
       row of the canvas, so a vertex there paints a band rather than a
       spot. This ORIENTATION of the solid avoids it; another would
       not, which is why the choice is checked and not assumed. */
    dots().forEach((d) => {
      const deg = Math.abs(d.lat) * 180 / Math.PI;
      assert.ok(deg < 85, 'a dot at latitude ' + deg.toFixed(1) +
          ' degrees will smear across the pole');
    });
  });

  it('they are all inside the canvas', () => {
    dots().forEach((d) => {
      assert.ok(d.u >= 0 && d.u < 1, 'u out of range: ' + d.u);
      assert.ok(d.v >= 0 && d.v <= 1, 'v out of range: ' + d.v);
    });
  });

  it('a dot on the seam is painted twice, or it is cut in half', () => {
    const tex = src.slice(src.indexOf('function ballTexture'),
        src.indexOf('const SPIN_ROLL'));
    assert.ok(/if \(cx < rx\) blob\(cx \+ W\)/.test(tex) &&
              /else if \(cx > W - rx\) blob\(cx - W\)/.test(tex),
        'the wrap-around halves must both be drawn');
    /* And the horizontal stretch of the map undone, or a dot near the
       poles comes out squashed on the sphere. */
    assert.ok(/const rx = r \/ Math\.max\([\d.]+, Math\.cos\(d\.lat\)\)/.test(tex),
        'the dot must be widened by 1/cos(lat)');
  });

  it('the texture is built once and kept', () => {
    /* rebuild() runs on every drag and recreates every mesh. The
       player discs rebuild their textures with them because each one
       differs; this one never does. */
    assert.ok(/let _ballTex = null;/.test(src), 'the cache must exist');
    assert.ok(/if \(_ballTex\) return _ballTex;/.test(src),
        'and be returned before any canvas work');
    assert.ok(/map: ballTexture\(\)/.test(src), 'and the ball must wear it');
  });
});
