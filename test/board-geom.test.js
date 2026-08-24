/* Pitch geometry: the module that lets a coach resize the pitch
 * without the penalty area resizing with it.
 *
 * The load-bearing property is stated once, here, and everything else
 * in this file is a consequence of it: MARKINGS ARE ABSOLUTE, OBJECTS
 * ARE RELATIVE. Shrink a 105 m pitch to 60 m and the penalty area is
 * still 16.5 m deep — it just occupies a larger share of a smaller
 * pitch. The players, meanwhile, move proportionally, because a 4-3-3
 * on a small pitch is still a 4-3-3.
 *
 * Get that backwards and the bug is quiet: everything scales together,
 * the board still looks like a football pitch, and it is wrong only if
 * you measure it.
 */
const assert = require('assert');
const BG = require('../js/board-geom.js');

const approx = (a, b, eps) => assert.ok(Math.abs(a - b) < (eps || 0.01),
    'expected ' + b + ', got ' + a);

describe('pitchOf — resolving a stored value', () => {
  it('defaults to the historical 105x68 futbol-11 pitch', () => {
    /* Every board saved before this feature has no `pitch` key. If
       this default ever moved, all of them would redraw. */
    const p = BG.pitchOf(null);
    assert.deepStrictEqual([p.L, p.W], [105, 68]);
  });

  it('reads the array off a whole board entry', () => {
    assert.strictEqual(BG.pitchOf({pitch: [60, 45]}).L, 60);
  });

  it('takes the raw array too', () => {
    assert.strictEqual(BG.pitchOf([60, 45]).W, 45);
  });

  it('clamps a width that cannot hold a regulation penalty area', () => {
    /* A CONSEQUENCE of there being one marking set. A 40 m wide pitch
       cannot contain a 40.32 m penalty area, so the narrowest pitch is
       now 42.32 m - narrow enough for any real ground, too wide for a
       30 x 20 rondo grid. Grids are what the 'area' board type is for. */
    assert.strictEqual(BG.pitchOf([60, 40]).W, 42.32);
  });

  it('falls back per-field, not all-or-nothing', () => {
    // A half-written value should not throw away the half that is fine.
    const p = BG.pitchOf([null, 55]);
    assert.strictEqual(p.L, 105);
    assert.strictEqual(p.W, 55);
  });

  it('ignores a third element left over from an older board', () => {
    /* `pitch` was briefly [L, W, format] while futbol-7 and futbol-9
       presets existed. They were dropped — the marks are the Laws of
       the Game and do not vary — but a stray third element must not
       throw or change the geometry. */
    const p = BG.pitchOf([105, 68, 'quidditch']);
    assert.strictEqual(p.marks.paDepth, 16.5);
    assert.strictEqual(p.L, 105);
  });
});

describe('clamp — a pitch has to be able to hold its own markings', () => {
  it('refuses a pitch narrower than the penalty area', () => {
    /* The clamp that matters. Without it, dragging the touchline in
       far enough puts the penalty box outside the pitch. */
    const [, w] = BG.clamp(105, 5);
    assert.ok(w >= BG.MARKS.paWidth,
        'width ' + w + ' cannot contain a 40.32 m penalty area');
  });

  it('refuses a pitch shorter than two penalty areas', () => {
    const [l] = BG.clamp(5, 68);
    assert.ok(l >= BG.MARKS.paDepth * 2, 'length ' + l + ' is too short');
  });

  it('caps the top end as well', () => {
    assert.strictEqual(BG.clamp(9999, 9999)[0], BG.BOUNDS.MAX_L);
  });

  it('leaves a sane pitch untouched', () => {
    assert.deepStrictEqual(BG.clamp(100, 64), [100, 64]);
  });
});

describe('markings stay put when the pitch resizes', () => {
  /* THE test. Everything else is detail. */
  const big = BG.markings([105, 68], 'full');
  const small = BG.markings([60, 45], 'full');

  it('the penalty area keeps its metres', () => {
    assert.strictEqual(big.penaltyLeft.w, small.penaltyLeft.w);
    assert.strictEqual(big.penaltyLeft.h, small.penaltyLeft.h);
    assert.strictEqual(big.penaltyLeft.w, 16.5);
  });

  it('so do the goal area, the circle and the penalty spot', () => {
    assert.strictEqual(big.goalAreaLeft.w, small.goalAreaLeft.w);
    assert.strictEqual(big.centerCircle.r, small.centerCircle.r);
    assert.strictEqual(big.penaltySpotL.cx, small.penaltySpotL.cx);
    assert.strictEqual(big.centerCircle.r, 9.15);
  });

  it('the goal keeps its 7.32 m mouth', () => {
    assert.strictEqual(big.goalLeft.w, small.goalLeft.w);
    assert.strictEqual(big.goalLeft.w, 7.32);
  });

  it('but their SHARE of the pitch grows as the pitch shrinks', () => {
    /* The visible consequence, and the thing that proves the
       percentages are derived rather than stored. */
    const bigPct = BG.toCss([105, 68], 'full').penaltyLeft.width;
    const smallPct = BG.toCss([60, 45], 'full').penaltyLeft.width;
    assert.ok(smallPct > bigPct,
        'penalty area should occupy more of a smaller pitch: ' +
        smallPct + ' vs ' + bigPct);
  });

  it('the right-hand box tracks the moved goal line', () => {
    // It is positioned from the far edge, so it must move with it.
    assert.strictEqual(big.penaltyRight.x, 105 - 16.5);
    assert.strictEqual(small.penaltyRight.x, 60 - 16.5);
  });

  it('everything stays inside the pitch', () => {
    const p = BG.markings([60, 45], 'full');
    assert.ok(p.penaltyLeft.y >= 0, 'penalty area runs off the top');
    assert.ok(p.penaltyLeft.y + p.penaltyLeft.h <= 45 + 0.001,
        'penalty area runs off the bottom');
    assert.ok(p.penaltyRight.x + p.penaltyRight.w <= 60 + 0.001);
  });
});

describe('regulation values are the real ones', () => {
  it('futbol 11 matches the Laws of the Game', () => {
    const f = BG.MARKS;
    assert.strictEqual(f.paDepth, 16.5);
    assert.strictEqual(f.paWidth, 40.32);
    assert.strictEqual(f.gaDepth, 5.5);
    assert.strictEqual(f.gaWidth, 18.32);
    assert.strictEqual(f.spot, 11);
    assert.strictEqual(f.circleR, 9.15);
    assert.strictEqual(f.goalW, 7.32);
    assert.strictEqual(f.goalH, 2.44);
  });

  it('has a 1 m corner arc', () => {
    assert.strictEqual(BG.MARKS.cornerR, 1);
  });

  it('is ONE set — there are no per-format variants', () => {
    /* Futbol-7 and futbol-9 presets existed briefly and were removed.
       Those formats are not standardised the way the Laws of the Game
       are: federations differ, so any numbers would have been a
       plausible guess dressed as a citation. A coach who wants a
       smaller pitch resizes the perimeter and keeps regulation marks —
       which is what actually happens when you set up on half a pitch. */
    assert.strictEqual(BG.FORMATS, undefined);
    assert.ok(BG.MARKS.paDepth, 'the single marking set must be exported');
  });
});

describe('corner arcs', () => {
  it('a full board has four', () => {
    const m = BG.markings([105, 68], 'full');
    assert.strictEqual(m.corners.length, 4);
  });

  it('they sit exactly ON the corners', () => {
    /* Centred on the corner, so three quarters fall outside the pitch
       and .tb-field's overflow:hidden clips them away. That is why
       there is no clip-path and nothing to re-derive on rotation. */
    const m = BG.markings([105, 68], 'full');
    assert.deepStrictEqual(
        m.corners.map((c) => [c.cx, c.cy]).sort(),
        [[0, 0], [0, 68], [105, 0], [105, 68]].sort());
  });

  it('a half board has two, at the goal line only', () => {
    /* The other edge is the halfway line. An arc there would invent a
       pitch boundary that is not there. */
    const m = BG.markings([105, 68], 'half');
    assert.strictEqual(m.corners.length, 2);
    m.corners.forEach((c) => assert.strictEqual(c.cy, 0));
  });

  it('an area board has two as well, because it spans the full width', () => {
    /* An area board used to be the penalty box plus a margin, which
       cropped the touchlines off and left no corner to cross from —
       and corners and crossing are the most common thing the board is
       for. It now spans the whole pitch width, so both corners are on
       it. */
    const m = BG.markings([105, 68], 'area');
    assert.strictEqual(m.corners.length, 2);
    m.corners.forEach((c) => assert.strictEqual(c.cy, 0));
  });

  it('the area board really does reach both touchlines', () => {
    const e = BG.extent([105, 68], 'area');
    assert.strictEqual(e.ax, 68, 'area must be as wide as the pitch');
    const m = BG.markings([105, 68], 'area');
    assert.strictEqual(m.corners[0].cx, 0);
    assert.strictEqual(m.corners[1].cx, 68);
  });

  it('a resized pitch keeps the area board full-width', () => {
    assert.strictEqual(BG.extent([90, 50], 'area').ax, 50);
  });

  it('rotate with everything else', () => {
    const v = BG.markings([105, 68], 'full', true);
    const e = v.extent;
    assert.strictEqual(v.corners.length, 4);
    v.corners.forEach((c) => {
      assert.ok((c.cx === 0 || Math.abs(c.cx - e.ax) < 0.001) &&
                (c.cy === 0 || Math.abs(c.cy - e.ay) < 0.001),
      'a rotated corner left the corner: ' + JSON.stringify(c));
    });
  });

  it('come through toCss sized as a full diameter', () => {
    const css = BG.toCss([105, 68], 'full');
    assert.strictEqual(css.corners.length, 4);
    approx(css.corners[0].size, (2 / 105) * 100, 0.02);
  });

  it('grow as a share of a smaller pitch, like every other marking', () => {
    const big = BG.toCss([105, 68], 'full').corners[0].size;
    const small = BG.toCss([60, 45], 'full').corners[0].size;
    assert.ok(small > big, 'a 1 m arc is a bigger fraction of a 60 m pitch');
  });
});

describe('the board types', () => {
  it('half swaps the axes — board x is the pitch WIDTH', () => {
    /* Not new behaviour: adaptFormation() in app.js has always done
       this by hand. Naming it is what lets 2D and 3D agree. */
    const e = BG.extent([105, 68], 'half');
    assert.strictEqual(e.ax, 68);
    assert.strictEqual(e.ay, 52.5);
    assert.strictEqual(e.swap, true);
  });

  it('derives the half-board aspect the hardcoded CSS already used', () => {
    /* 52.5 m of pitch length across 68 m of width is 77.2% — and
       `.tb-half .tb-field-inner` has said `padding-top: 77%` since
       long before any of this existed. Independent agreement between
       a hand-tuned constant and the geometry, which is the strongest
       evidence available that the axis swap is the right way round.
       A half board is WIDER than it is tall, despite being drawn
       goal-at-top; that surprises people, hence this test. */
    approx(BG.aspectPct([105, 68], 'half'), 77, 0.3);
  });

  it('a half board shows one penalty area, not two', () => {
    const m = BG.markings([105, 68], 'half');
    assert.ok(m.penaltyLeft, 'the attacking box must be drawn');
    assert.strictEqual(m.penaltyRight, null);
    assert.strictEqual(m.arcRight, null);
  });

  it('an area board has no halfway line or centre circle at all', () => {
    const m = BG.markings([105, 68], 'area');
    assert.strictEqual(m.halfway, null);
    assert.strictEqual(m.centerCircle, null);
  });

  it('the area board still contains its penalty box', () => {
    const m = BG.markings([105, 68], 'area');
    assert.ok(m.penaltyLeft.x >= 0);
    assert.ok(m.penaltyLeft.x + m.penaltyLeft.w <= m.extent.ax + 0.001);
    assert.ok(m.penaltyLeft.h <= m.extent.ay + 0.001);
  });

  it('the area board is deep enough for the whole penalty arc', () => {
    /* The arc reaches spot + radius from the goal line. A board that
       stops short of it cuts the D in half, which is the one marking a
       corner or free-kick drill is positioned against. Checked on a
       SHORT pitch, where a plain third of the length would not be
       enough and the floor has to do the work. */
    [[105, 68], [37, 68], [60, 45]].forEach((pitch) => {
      const e = BG.extent(pitch, 'area');
      assert.ok(e.ay >= BG.MARKS.spot + BG.MARKS.arcR,
          pitch + ' area depth ' + e.ay + ' crops the penalty arc');
    });
  });

  it('the CSS aspect follows the extent, not a hardcoded 62%', () => {
    // padding-top = ay/ax * 100. The old value was 62 for every pitch.
    approx(BG.aspectPct([105, 68], 'full'), 64.76, 0.02);
    approx(BG.aspectPct([105, 50], 'full'), 47.62, 0.02);
  });
});

describe('vertical boards', () => {
  it('only a FULL board pre-rotates', () => {
    /* Vertical half and area are rotated by a CSS transform on the
       whole .tb-field, so their contents ride along and must NOT be
       rotated again. Exactly the useJsSwap() condition in app.js —
       if these two ever disagree, the penalty spot drifts away from
       the penalty taker. */
    assert.strictEqual(BG.isRotated('full', true), true);
    assert.strictEqual(BG.isRotated('half', true), false);
    assert.strictEqual(BG.isRotated('area', true), false);
    assert.strictEqual(BG.isRotated('full', false), false);
  });

  it('swaps the extent, so the box becomes portrait', () => {
    const h = BG.extent([105, 68], 'full', false);
    const v = BG.extent([105, 68], 'full', true);
    assert.strictEqual(v.ax, h.ay);
    assert.strictEqual(v.ay, h.ax);
    approx(BG.aspectPct([105, 68], 'full', true), (105 / 68) * 100, 0.02);
  });

  it('markings rotate by the SAME rule the players do', () => {
    /* The load-bearing agreement. app.js maps a player position with
       toDisplay(hL, hT) = [hT, 100 - hL]. A marking at the same spot
       must land on the same place, or the pitch and the people
       standing on it come apart.

       Checked with the penalty spot, which is the easiest to see
       wrong: it is 11 m from the goal line, dead centre. */
    const pitch = [105, 68];
    const cssV = BG.toCss(pitch, 'full', true);
    // The same point, expressed as a percentage and run through the
    // player transform: toDisplay(hLeft, hTop) = [hTop, 100 - hLeft].
    const cssH = BG.toCss(pitch, 'full', false);
    const expected = [cssH.penaltySpotL.top, 100 - cssH.penaltySpotL.left];
    approx(cssV.penaltySpotL.left, expected[0], 0.05);
    approx(cssV.penaltySpotL.top, expected[1], 0.05);
  });

  it('a rotated penalty area swaps its width and height', () => {
    const h = BG.markings([105, 68], 'full', false).penaltyLeft;
    const v = BG.markings([105, 68], 'full', true).penaltyLeft;
    approx(v.w, h.h);
    approx(v.h, h.w);
  });

  it('a rotated circle is still a circle', () => {
    const v = BG.markings([105, 68], 'full', true).centerCircle;
    assert.strictEqual(v.r, 9.15);
  });

  it('keeps every marking inside the rotated box', () => {
    const m = BG.markings([105, 68], 'full', true);
    const e = m.extent;
    ['penaltyLeft', 'penaltyRight', 'goalAreaLeft', 'goalAreaRight'].forEach((k) => {
      assert.ok(m[k].x >= -0.001, k + ' runs off the left: ' + m[k].x);
      assert.ok(m[k].y >= -0.001, k + ' runs off the top: ' + m[k].y);
      assert.ok(m[k].x + m[k].w <= e.ax + 0.001, k + ' runs off the right');
      assert.ok(m[k].y + m[k].h <= e.ay + 0.001, k + ' runs off the bottom');
    });
  });

  it('rotating twice is not the identity — it is a quarter turn', () => {
    // Guards against a swap that silently cancels itself out.
    const h = BG.markings([105, 68], 'full', false).penaltySpotL;
    const v = BG.markings([105, 68], 'full', true).penaltySpotL;
    assert.notStrictEqual(h.cx, v.cx);
  });
});

describe('percentage <-> world', () => {
  it('the centre of the board is the origin', () => {
    const w = BG.toWorld(50, 50, [105, 68], 'full');
    approx(w.x, 0);
    approx(w.z, 0);
  });

  it('the corners are half the pitch away, in each axis separately', () => {
    const w = BG.toWorld(100, 100, [105, 68], 'full');
    approx(w.x, 52.5);
    approx(w.z, 34);
  });

  it('round-trips across board types and pitch sizes', () => {
    const cases = [
      [[105, 68], 'full'], [[60, 40], 'full'],
      [[105, 68], 'half'], [[75, 50], 'area']
    ];
    cases.forEach(([pitch, bt]) => {
      [[0, 0], [12.5, 87.5], [50, 50], [100, 100], [33.33, 66.67]].forEach(([x, y]) => {
        const w = BG.toWorld(x, y, pitch, bt);
        const back = BG.toPercent(w.x, w.z, pitch, bt);
        approx(back[0], x, 0.02);
        approx(back[1], y, 0.02);
      });
    });
  });

  it('is ANISOTROPIC — one scale factor is not enough', () => {
    /* The trap. x is a percentage of the board's width and y of its
       height, and those are different distances on every pitch that
       is not square. A single scale factor squashes the board in a
       way that looks plausible and measures wrong. */
    const w = BG.toWorld(100, 100, [105, 68], 'full');
    assert.notStrictEqual(w.x, w.z);
    approx(w.x / w.z, 105 / 68, 0.001);
  });

  it('a resized pitch moves objects proportionally', () => {
    // The other half of the rule: markings absolute, objects relative.
    const big = BG.toWorld(25, 50, [105, 68], 'full');
    const small = BG.toWorld(25, 50, [60, 40], 'full');
    approx(big.x / small.x, 105 / 60, 0.001);
  });
});

describe('toCss', () => {
  it('divides x by the width and y by the height, not both by one', () => {
    const css = BG.toCss([105, 68], 'full');
    approx(css.penaltyLeft.width, (16.5 / 105) * 100, 0.02);
    approx(css.penaltyLeft.height, (40.32 / 68) * 100, 0.02);
  });

  it('sizes circles by their x percentage alone', () => {
    /* They are kept round by aspect-ratio:1 in the CSS, which only
       works because the box's pixel aspect matches its metre aspect
       — see aspectPct. A height percentage here would double-apply
       the aspect and produce an ellipse. */
    const css = BG.toCss([105, 68], 'full');
    approx(css.centerCircle.size, (18.3 / 105) * 100, 0.02);
    assert.strictEqual(css.centerCircle.height, undefined);
  });

  it('clips the penalty arc to the part outside the box', () => {
    /* The old CSS said `inset(0 0 0 75%)` — a hand-tuned constant that
       is only right for one pitch size. The real figure for a 105 m
       f11 pitch: the arc circle spans 1.85 m to 20.15 m, the box edge
       is at 16.5 m, so 80.05% of the circle is hidden. */
    const css = BG.toCss([105, 68], 'full');
    const m = css.arcLeft.clip.match(/inset\(0 0 0 ([\d.]+)%\)/);
    assert.ok(m, 'left arc should clip from the left, got ' + css.arcLeft.clip);
    approx(parseFloat(m[1]), ((16.5 - 1.85) / 18.3) * 100, 0.1);
  });

  it('the right arc clips from the other side', () => {
    const css = BG.toCss([105, 68], 'full');
    assert.ok(/inset\(0 [\d.]+% 0 0\)/.test(css.arcRight.clip),
        'got ' + css.arcRight.clip);
  });

  it('a rotated arc clips along the other axis', () => {
    /* The whole reason the clip is derived rather than written down:
       on a vertical board the arc opens up or down, not left or right,
       and four hardcoded CSS rules cannot express that. */
    const css = BG.toCss([105, 68], 'full', true);
    assert.ok(/inset\(0 0 [\d.]+% 0\)|inset\([\d.]+% 0 0 0\)/.test(css.arcLeft.clip),
        'rotated arc should clip vertically, got ' + css.arcLeft.clip);
  });

  it('never emits a negative inset', () => {
    /* A negative inset reads as "clip nothing", so an arc too small to
       escape its box would draw as a full circle — the opposite of the
       intent. Checked across a range of pitch sizes because the arc and
       the box scale differently as the pitch changes. */
    [[105, 68], [60, 45], [130, 90], [40, 45]].forEach((pitch) => {
      const css = BG.toCss(pitch, 'full');
      [css.arcLeft.clip, css.arcRight.clip].forEach((c) => {
        (c.match(/[d.]+(?=%)/g) || []).forEach((n) => {
          assert.ok(parseFloat(n) >= 0 && parseFloat(n) <= 100,
              pitch + ' emitted an out-of-range inset: ' + c);
        });
      });
    });
  });

  it('omits what the board type does not draw', () => {
    const css = BG.toCss([105, 68], 'area');
    assert.strictEqual(css.centerCircle, null);
    assert.strictEqual(css.halfway, null);
  });

  it('every percentage lands inside the box', () => {
    [['full', [105, 68]], ['half', [60, 40]],
      ['area', [75, 50]]].forEach(([bt, pitch]) => {
      const css = BG.toCss(pitch, bt);
      Object.keys(css).forEach((k) => {
        const v = css[k];
        if (!v || k === 'extent') return;
        if (v.left != null) {
          assert.ok(v.left >= -0.01 && v.left <= 100.01,
              bt + '.' + k + '.left = ' + v.left);
        }
        if (v.top != null) {
          assert.ok(v.top >= -0.01 && v.top <= 100.01,
              bt + '.' + k + '.top = ' + v.top);
        }
      });
    });
  });
});
