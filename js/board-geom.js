/* =========================================================
   EsquerrApp — tactical board pitch geometry

   Pure logic: no DOM, no Firestore, no browser globals. The one
   owner of three questions:

     how big is this pitch          pitchOf / clampPitch
     where do its markings sit      markings
     where does percentage [x,y] land   toWorld / toPercent / toCss

   Nothing else may compute any of it. Before this file the markings
   were fixed percentages in css/style.css and the pitch was a fixed
   `padding-top: 62%`, which works exactly as long as every pitch is
   the same size — and stops working the moment a coach wants a
   futbol-7 pitch, or the 3D view wants metres.

   THE RULE THAT MAKES THIS FILE NECESSARY: when the pitch is
   resized, the OUTER perimeter changes and the markings do NOT. A
   penalty area is 16.5 m deep on a 105 m pitch and 16.5 m deep on a
   60 m one. That is why markings are computed from regulation
   distances in metres and only then converted to percentages —
   scaling a percentage would shrink the penalty spot along with the
   pitch, which is the one thing football does not do.

   Coordinates: object positions (players, balls, arrows, …) stay
   percentages 0-100 of the VISIBLE board, exactly as they are
   stored today, so resizing a pitch moves the players
   proportionally and a 4-3-3 stays a 4-3-3. Only markings are
   absolute.

   Loaded before app.js in the browser; exported for the tests.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BG = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Regulation marking sets, in METRES.

     f11 is exact — these are the Laws of the Game, and they do not
     vary: 16.5 m penalty area, 9.15 m circle, 7.32 x 2.44 goal.

     f9 and f7 are NOT standardised the same way. Federations differ,
     and Catalan youth football has its own variants. The numbers
     below are the common Spanish values and are a sensible starting
     point, not a citation — which is precisely why the coach can
     override the pitch size afterwards. If a club needs different
     marks, this table is the one place to change them.

     Futsal is deliberately absent. Its area is a 6 m ARC, not a
     rectangle, so it is a different marking topology rather than
     different numbers, and drawing it as a rectangle would be wrong
     in a way that looks right. */
  var FORMATS = {
    f11: {
      label: 'Futbol 11',
      dim: [105, 68],          // default length x width
      paDepth: 16.5, paWidth: 40.32,
      gaDepth: 5.5,  gaWidth: 18.32,
      spot: 11, circleR: 9.15, arcR: 9.15,
      goalW: 7.32, goalH: 2.44, cornerR: 1
    },
    f9: {
      label: 'Futbol 9',
      dim: [75, 50],
      paDepth: 13, paWidth: 26,
      gaDepth: 4,  gaWidth: 12,
      spot: 9, circleR: 7, arcR: 7,
      goalW: 6, goalH: 2, cornerR: 1
    },
    f7: {
      label: 'Futbol 7',
      dim: [60, 40],
      paDepth: 9,  paWidth: 23,
      gaDepth: 3,  gaWidth: 10,
      spot: 8, circleR: 6, arcR: 6,
      goalW: 6, goalH: 2, cornerR: 0.5
    }
  };

  /* The historical board: 105 x 68, eleven-a-side. A board saved
     before pitches were resizable has no `pitch` key at all, and
     resolves to exactly this — which is what makes the feature need
     no migration. */
  var DEFAULT_PITCH = [105, 68, 'f11'];

  /* Outer bounds. Generous on purpose: these exist to stop a drag
     producing a pitch of zero or of ten kilometres, not to enforce
     competition rules. A coach sketching a 30 x 20 rondo grid is
     doing something legitimate. */
  var MIN_L = 25, MAX_L = 130;
  var MIN_W = 15, MAX_W = 90;

  function fmtOf(key) {
    return FORMATS[key] || FORMATS.f11;
  }

  /**
   * Resolve a stored pitch value into usable geometry.
   *
   * Accepts the raw [L, W, format] array, a whole board entry, or
   * null/undefined. Always returns a complete object — callers must
   * never have to handle "no pitch", because that is the common case
   * and every one of them would get it slightly differently.
   */
  function pitchOf(src) {
    var raw = null;
    if (Array.isArray(src)) raw = src;
    else if (src && Array.isArray(src.pitch)) raw = src.pitch;
    /* IDEMPOTENT: pitchOf must accept its own output. markings() resolves
       once and then hands the result to extent(), which resolves again —
       and without this branch that second call saw an object it did not
       recognise and silently returned the 105x68 default. Every marking
       was then computed for a resized pitch but divided by a default-sized
       box, so a 60 m pitch drew its penalty area at the 105 m proportion.
       Caught by the "share of the pitch grows as the pitch shrinks" test,
       which is the one assertion that compares two different pitches. */
    else if (src && isFinite(src.L) && isFinite(src.W)) raw = [src.L, src.W, src.fmt];
    var fmtKey = (raw && raw[2]) || DEFAULT_PITCH[2];
    var f = fmtOf(fmtKey);
    var L = Number(raw && raw[0]);
    var W = Number(raw && raw[1]);
    if (!isFinite(L) || L <= 0) L = DEFAULT_PITCH[0];
    if (!isFinite(W) || W <= 0) W = DEFAULT_PITCH[1];
    var c = clamp(L, W, fmtKey);
    return {L: c[0], W: c[1], fmt: fmtKey, marks: f};
  }

  /**
   * Constrain a pitch to something drawable.
   *
   * Two clamps, and the second matters more than the first: a pitch
   * may not be narrower than the penalty area it has to contain, nor
   * shorter than two penalty areas plus a sliver. Without it,
   * dragging the touchline far enough inward puts the penalty box
   * outside the pitch and the board stops meaning anything.
   */
  function clamp(L, W, fmtKey) {
    var f = fmtOf(fmtKey);
    var minW = Math.max(MIN_W, f.paWidth + 2);
    var minL = Math.max(MIN_L, f.paDepth * 2 + 4);
    return [
      Math.round(Math.min(MAX_L, Math.max(minL, Number(L) || 0)) * 100) / 100,
      Math.round(Math.min(MAX_W, Math.max(minW, Number(W) || 0)) * 100) / 100
    ];
  }

  /* Does this combination display rotated?

     Only a VERTICAL FULL board. Vertical half and area boards are
     rotated by a CSS transform on the whole .tb-field element, so
     their contents — markings included — come along for the ride and
     must not be pre-rotated as well. This is exactly the condition
     app.js calls useJsSwap(), and it has to stay exactly that
     condition: the markings and the players have to agree. */
  function isRotated(boardType, vertical) {
    return !!vertical && (boardType || 'full') === 'full';
  }

  /**
   * The visible rectangle, in board-display axes.
   *
   * `full` shows the pitch landscape: board x is pitch length.
   * `half` and `area` are drawn PORTRAIT with the goal at the top —
   * board x is pitch WIDTH and board y is pitch length. That axis
   * swap is not new; it is what adaptFormation() in app.js has
   * always done by hand. Naming it here is what lets the 2D markings
   * and the 3D scene agree about it.
   *
   * Returned in metres, so `ax / ay` is also the aspect ratio the
   * CSS box must take (padding-top = ay/ax * 100%).
   */
  function extent(pitch, boardType, vertical) {
    var p = pitchOf(pitch);
    var f = p.marks;
    var e;
    if (boardType === 'half') e = {ax: p.W, ay: p.L / 2, swap: true};
    else if (boardType === 'area') {
      /* The penalty area plus a working margin, so a drill has room
         either side of the box rather than the box filling the frame
         edge to edge. */
      e = {ax: Math.min(p.W, f.paWidth + 12), ay: f.paDepth + 12, swap: true};
    } else e = {ax: p.L, ay: p.W, swap: false};
    if (isRotated(boardType, vertical)) return {ax: e.ay, ay: e.ax, swap: e.swap, rot: true};
    return e;
  }

  /** The CSS aspect of the field box, as the padding-top percentage. */
  function aspectPct(pitch, boardType, vertical) {
    var e = extent(pitch, boardType, vertical);
    return Math.round((e.ay / e.ax) * 10000) / 100;
  }

  /* Rotate a point 90 degrees within its box, in METRES.

     The same transform toDisplay() applies to player positions, only
     against the box's real width instead of a hardcoded 100 — which
     is the whole reason it lives here rather than being duplicated:
     if the markings rotated by a different rule than the players, the
     penalty spot would drift away from the penalty taker. */
  function rot(x, y, ax) { return [y, ax - x]; }

  /* A 0-1 fraction as a clamped 2dp percentage. Clamped because an arc
     whose radius does not reach past its own box would otherwise emit a
     negative inset, which CSS reads as "clip nothing" — the arc would
     appear as a full circle rather than as no arc at all. */
  function pctOf(frac) {
    return Math.round(Math.min(1, Math.max(0, frac)) * 10000) / 100;
  }

  /**
   * Every marking, in board-local METRES, origin at the top-left of
   * the visible box, x rightwards and y downwards — the same axes as
   * CSS left/top, so the 2D renderer is a straight divide and the 3D
   * renderer is a straight centring.
   *
   * Shapes are named for the elements that already exist in the DOM
   * (.tb-halfway, .tb-penalty-left, …) so this changes their NUMBERS
   * without changing the markup or the CSS that styles them.
   *
   * `null` for a shape the board type does not show. The caller
   * omits it rather than drawing a degenerate one.
   */
  function markings(pitch, boardType, vertical) {
    var m = markingsUnrotated(pitch, boardType);
    if (!isRotated(boardType, vertical)) return m;
    /* Rotate the whole set in metres, then hand back the rotated
       extent. Doing it here — once, over every shape — is what stops
       the eleven call sites in app.js each getting the swap slightly
       different, which is how the old CSS overrides drifted. */
    var ax = m.extent.ax;
    var out = {cornerR: m.cornerR, extent: extent(pitch, boardType, vertical)};
    ['penaltyLeft', 'penaltyRight', 'goalAreaLeft', 'goalAreaRight',
      'goalLeft', 'goalRight'].forEach(function (k) {
      var r = m[k];
      if (!r) { out[k] = null; return; }
      // Both corners rotate; the box that survives is their min/max.
      var a = rot(r.x, r.y, ax), b = rot(r.x + r.w, r.y + r.h, ax);
      out[k] = {
        x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]),
        w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1])
      };
    });
    ['centerCircle', 'arcLeft', 'arcRight'].forEach(function (k) {
      var c = m[k];
      if (!c) { out[k] = null; return; }
      var q = rot(c.cx, c.cy, ax);
      // A circle stays a circle: only its centre moves, r is invariant.
      out[k] = {cx: q[0], cy: q[1], r: c.r};
      if (c.clipFrom != null) out[k].clipFromRot = c.clipFrom;
      if (c.clipTo != null) out[k].clipToRot = c.clipTo;
    });
    ['centerSpot', 'penaltySpotL', 'penaltySpotR'].forEach(function (k) {
      var s = m[k];
      if (!s) { out[k] = null; return; }
      var q = rot(s.cx, s.cy, ax);
      out[k] = {cx: q[0], cy: q[1]};
    });
    if (m.halfway) {
      var h1 = rot(m.halfway.x1, m.halfway.y1, ax);
      var h2 = rot(m.halfway.x2, m.halfway.y2, ax);
      out.halfway = {x1: h1[0], y1: h1[1], x2: h2[0], y2: h2[1]};
    } else out.halfway = null;
    return out;
  }

  function markingsUnrotated(pitch, boardType) {
    var p = pitchOf(pitch);
    var f = p.marks;
    var e = extent(p, boardType);
    var bt = boardType || 'full';

    if (bt === 'full') {
      var midY = p.W / 2;
      return {
        halfway:        {x1: p.L / 2, y1: 0, x2: p.L / 2, y2: p.W},
        centerCircle:   {cx: p.L / 2, cy: midY, r: f.circleR},
        centerSpot:     {cx: p.L / 2, cy: midY},
        penaltyLeft:    {x: 0, y: midY - f.paWidth / 2, w: f.paDepth, h: f.paWidth},
        penaltyRight:   {x: p.L - f.paDepth, y: midY - f.paWidth / 2, w: f.paDepth, h: f.paWidth},
        goalAreaLeft:   {x: 0, y: midY - f.gaWidth / 2, w: f.gaDepth, h: f.gaWidth},
        goalAreaRight:  {x: p.L - f.gaDepth, y: midY - f.gaWidth / 2, w: f.gaDepth, h: f.gaWidth},
        penaltySpotL:   {cx: f.spot, cy: midY},
        penaltySpotR:   {cx: p.L - f.spot, cy: midY},
        /* The arc is the part of a circle centred on the penalty
           spot that falls OUTSIDE the box — which is why it is
           described by its full circle plus the line that clips it,
           not as a path. The DOM draws it with clip-path today. */
        arcLeft:        {cx: f.spot, cy: midY, r: f.arcR, clipFrom: f.paDepth},
        arcRight:       {cx: p.L - f.spot, cy: midY, r: f.arcR, clipTo: p.L - f.paDepth},
        goalLeft:       {x: 0, y: midY - f.goalW / 2, w: f.goalW, h: f.goalH},
        goalRight:      {x: p.L, y: midY - f.goalW / 2, w: f.goalW, h: f.goalH},
        cornerR:        f.cornerR,
        extent:         e
      };
    }

    /* Portrait board types. Goal at the top, halfway (or nothing) at
       the bottom; board x runs along the pitch's WIDTH. */
    var midX = e.ax / 2;
    var m = {
      halfway:      bt === 'half' ? {x1: 0, y1: e.ay, x2: e.ax, y2: e.ay} : null,
      centerCircle: null,
      centerSpot:   null,
      penaltyLeft:  {x: midX - f.paWidth / 2, y: 0, w: f.paWidth, h: f.paDepth},
      penaltyRight: null,
      goalAreaLeft: {x: midX - f.gaWidth / 2, y: 0, w: f.gaWidth, h: f.gaDepth},
      goalAreaRight: null,
      penaltySpotL: {cx: midX, cy: f.spot},
      penaltySpotR: null,
      arcLeft:      {cx: midX, cy: f.spot, r: f.arcR, clipFrom: f.paDepth},
      arcRight:     null,
      goalLeft:     {x: midX - f.goalW / 2, y: 0, w: f.goalW, h: f.goalH},
      goalRight:    null,
      cornerR:      f.cornerR,
      extent:       e
    };
    if (bt === 'half') {
      /* A half board shows the centre circle cut in half at the
         bottom edge, which is what the current CSS does with a
         translate. Give the whole circle and let the box clip it. */
      m.centerCircle = {cx: midX, cy: e.ay, r: f.circleR};
      m.centerSpot = {cx: midX, cy: e.ay};
    }
    return m;
  }

  /**
   * The same markings as PERCENTAGES of the visible box, ready for
   * inline styles.
   *
   * Lengths along x divide by ax and along y by ay — the box is not
   * square, so one shared scale factor would be wrong. Circles are
   * the exception: they are sized by their x percentage alone and
   * kept round by `aspect-ratio: 1` in the CSS, which works because
   * the box's pixel aspect matches its metre aspect by construction
   * (see aspectPct).
   */
  function toCss(pitch, boardType, vertical) {
    var m = markings(pitch, boardType, vertical);
    var e = m.extent;
    var px = function (v) { return Math.round((v / e.ax) * 10000) / 100; };
    var py = function (v) { return Math.round((v / e.ay) * 10000) / 100; };
    var out = {extent: e};
    ['penaltyLeft', 'penaltyRight', 'goalAreaLeft', 'goalAreaRight',
      'goalLeft', 'goalRight'].forEach(function (k) {
      var r = m[k];
      out[k] = r ? {left: px(r.x), top: py(r.y), width: px(r.w), height: py(r.h)} : null;
    });
    ['centerCircle', 'arcLeft', 'arcRight'].forEach(function (k) {
      var c = m[k];
      // Diameter as a percentage of WIDTH; aspect-ratio:1 supplies the height.
      out[k] = c ? {left: px(c.cx), top: py(c.cy), size: px(c.r * 2)} : null;
    });
    /* The penalty arcs, clipped to the part of the circle OUTSIDE the
       box. Derived from the geometry rather than hand-written per
       orientation: the old CSS had `inset(0 0 0 75%)` for the left arc
       and a mirrored rule for the right, which is four hardcoded cases
       that all become wrong the moment the pitch or the orientation
       changes. Here the arc simply asks which edge of its own penalty
       area faces the middle of the board, and clips to it — so
       horizontal, vertical, half and area all fall out of one rule. */
    [['arcLeft', 'penaltyLeft'], ['arcRight', 'penaltyRight']].forEach(function (pair) {
      var c = m[pair[0]], box = m[pair[1]];
      if (!out[pair[0]] || !c || !box) return;
      var lo, frac;
      if (box.x <= 0.001) {                       // box on the left edge
        lo = c.cx - c.r; frac = (box.x + box.w - lo) / (c.r * 2);
        out[pair[0]].clip = 'inset(0 0 0 ' + pctOf(frac) + '%)';
      } else if (box.x + box.w >= e.ax - 0.001) { // right edge
        lo = c.cx - c.r; frac = (box.x - lo) / (c.r * 2);
        out[pair[0]].clip = 'inset(0 ' + pctOf(1 - frac) + '% 0 0)';
      } else if (box.y <= 0.001) {                // top edge
        lo = c.cy - c.r; frac = (box.y + box.h - lo) / (c.r * 2);
        out[pair[0]].clip = 'inset(' + pctOf(frac) + '% 0 0 0)';
      } else {                                    // bottom edge
        lo = c.cy - c.r; frac = (box.y - lo) / (c.r * 2);
        out[pair[0]].clip = 'inset(0 0 ' + pctOf(1 - frac) + '% 0)';
      }
    });
    ['centerSpot', 'penaltySpotL', 'penaltySpotR'].forEach(function (k) {
      var s = m[k];
      out[k] = s ? {left: px(s.cx), top: py(s.cy)} : null;
    });
    out.halfway = m.halfway
      ? {left: px(m.halfway.x1), top: py(m.halfway.y1),
        vertical: m.halfway.x1 === m.halfway.x2}
      : null;
    return out;
  }

  /**
   * Percentage [left, top] of the visible board -> world metres,
   * centred on the origin, y up. `z` is the ground-plane depth axis
   * (three.js convention: x right, y up, z toward the viewer).
   *
   * ANISOTROPIC, and this is the trap the tests pin: `x` is a
   * percentage of the board's WIDTH and `y` of its HEIGHT, which are
   * different distances. One uniform scale factor silently squashes
   * every board that is not square — which is all of them.
   */
  function toWorld(x, y, pitch, boardType, vertical) {
    var e = extent(pitch, boardType, vertical);
    return {
      x: (Number(x) / 100 - 0.5) * e.ax,
      z: (Number(y) / 100 - 0.5) * e.ay
    };
  }

  /** The inverse of toWorld. */
  function toPercent(wx, wz, pitch, boardType, vertical) {
    var e = extent(pitch, boardType, vertical);
    return [
      Math.round((wx / e.ax + 0.5) * 10000) / 100,
      Math.round((wz / e.ay + 0.5) * 10000) / 100
    ];
  }

  return {
    FORMATS: FORMATS,
    DEFAULT_PITCH: DEFAULT_PITCH,
    BOUNDS: {MIN_L: MIN_L, MAX_L: MAX_L, MIN_W: MIN_W, MAX_W: MAX_W},
    pitchOf: pitchOf,
    clamp: clamp,
    isRotated: isRotated,
    extent: extent,
    aspectPct: aspectPct,
    markings: markings,
    toCss: toCss,
    toWorld: toWorld,
    toPercent: toPercent
  };
});
