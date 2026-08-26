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
   the same size — and stops working the moment a coach sets up on
   a smaller pitch, or the 3D view wants metres.

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

  /* The regulation marking set, in METRES.

     One set, not a table of them. These are the Laws of the Game and
     they do not vary: 16.5 m penalty area, 9.15 m circle, 11 m spot,
     7.32 x 2.44 goal, 1 m corner arc.

     There is deliberately no futbol-7 or futbol-9 variant. Those are
     not standardised the way this is — federations differ, and any
     numbers here would have been a plausible guess dressed as a
     citation. A coach who wants a smaller pitch resizes the
     PERIMETER, which is the thing this whole module exists to make
     possible; the marks stay regulation, which is what happens on a
     real training ground when you set up on half a pitch. */
  var MARKS = {
    paDepth: 16.5, paWidth: 40.32,
    gaDepth: 5.5,  gaWidth: 18.32,
    spot: 11, circleR: 9.15, arcR: 9.15,
    goalW: 7.32, goalH: 2.44, cornerR: 1
  };

  /* ═══ HOW BIG THINGS ARE, IN METRES ═══════════════════════════
     One table, both views, because the alternative was tried and it
     does not work: 2D sized objects in fixed PIXELS and 3D in metres,
     so they could never agree — and 2D could not even agree with
     itself. The same 24px disc was a 3.07 m player on a full board
     and a 1.99 m player on a half board, because the two have
     different px-per-metre (7.81 vs 12.06). Fixed pixels are also why
     nothing grew when the drawing overlay was zoomed: a pixel is a
     pixel however large the pitch behind it has become.

     Metres are the unit both views can express. 2D multiplies by its
     own px-per-metre (`--tb-ppm`); 3D uses them directly.

     OBJ takes the 3D figures as the reference — a 1.8 m disc is about
     a player's personal space, where 3.07 m was a UI affordance that
     had drifted into being a measurement. The 2D board floors them in
     CSS so a shirt number still fits on a phone; see .tb-circle. */
  var OBJ = {
    player: 1.80,      // disc diameter
    ball: 0.50,
    cone: 0.70,        // base diameter
    coneHeight: 0.70
  };

  /* MARK is the 2D board's pixel weights converted at the full
     board's 7.81 px/m, so the marks a coach already draws keep the
     weight they have and 3D adopts it. `dash` is 6 4 in pixels. */
  /* ONE stroke weight for every drawn mark. Pen strokes and arrow
     shafts were 0.32 (the 2D board's 2.5px) against a 0.19 zone
     outline (1.5px), so three marks drawn with the same hand came out
     at two weights. Written once rather than as three equal numbers:
     three numbers that happen to agree are three numbers that will
     stop agreeing. */
  var STROKE = 0.19;   // 1.5px on the 820px board
  var MARK = {
    pen: STROKE,
    arrowShaft: STROKE,
    rectStroke: STROKE,
    /* The head is a SHAPE, not a weight, so it keeps its own figures:
       aLen 12px and aHW 5px either side, as refreshArrowheads uses. */
    arrowHead: 1.54,
    arrowHeadW: 1.28,
    rectRadius: 0.26,  // rx 2px
    dash: [0.77, 0.51]
  };

  /* The historical board: 105 x 68. A board saved before pitches were
     resizable has no `pitch` key at all and resolves to exactly this,
     which is what makes the feature need no migration. */
  var DEFAULT_PITCH = [105, 68];

  /* ═══ THE PITCH SIZE LIMITS — change them here, nowhere else ═══

     These four numbers are the only place the allowed range is
     written down. The typed inputs take their `min`/`max` from them,
     the drag grips clamp against them, and the tests read them rather
     than repeating the figures, so moving one moves everything.
     Metres.

     Currently generous on purpose: they exist to stop a drag
     producing a pitch of zero or of ten kilometres, not to enforce
     competition rules. The Laws of the Game would say 90-120 x 45-90
     for eleven-a-side, which is the obvious thing to tighten to.

     Note the FLOOR IS NOT ALWAYS THESE NUMBERS: clamp() also refuses
     any pitch too small to contain its own penalty areas, which for
     the regulation marks works out at 42.32 m wide and 37 m long. So
     lowering MIN_W below 42.32 has no effect without also changing
     the marking set. Raising it does. */
  var MIN_L = 25, MAX_L = 130;
  var MIN_W = 15, MAX_W = 90;

  /**
   * Resolve a stored pitch value into usable geometry.
   *
   * Accepts the raw [L, W] array, a whole board entry, or
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
    else if (src && isFinite(src.L) && isFinite(src.W)) raw = [src.L, src.W];
    var L = Number(raw && raw[0]);
    var W = Number(raw && raw[1]);
    if (!isFinite(L) || L <= 0) L = DEFAULT_PITCH[0];
    if (!isFinite(W) || W <= 0) W = DEFAULT_PITCH[1];
    var c = clamp(L, W);
    return {L: c[0], W: c[1], marks: MARKS};
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
  function clamp(L, W) {
    var minW = Math.max(MIN_W, MARKS.paWidth + 2);
    var minL = Math.max(MIN_L, MARKS.paDepth * 2 + 4);
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
      /* THE FULL WIDTH OF THE PITCH, and therefore both corners.

         It used to be the penalty area plus a margin either side,
         which cropped the touchlines away — and the most common thing
         an area board is actually for is corners and crossing, which
         you cannot set up on a board with no corner to cross from.

         The depth is the final third, in the footballing sense, so it
         scales with the pitch instead of being a fixed number of
         metres. The floor stops a short pitch cropping the penalty
         arc, which reaches spot + radius from the goal line. */
      e = {ax: p.W, ay: Math.max(p.L / 3, f.spot + f.arcR + 4), swap: true};
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
    out.corners = (m.corners || []).map(function (c) {
      var q = rot(c.cx, c.cy, ax);
      return {cx: q[0], cy: q[1]};
    });
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
        /* All four, because a full board shows all four. Drawn as
           whole circles centred exactly ON the corner and clipped by
           the pitch's own `overflow:hidden` — the quarter that stays
           is the quarter inside the pitch, with no clip-path needed
           and nothing to get wrong when the board rotates. */
        corners:        [{cx: 0, cy: 0}, {cx: p.L, cy: 0},
          {cx: 0, cy: p.W}, {cx: p.L, cy: p.W}],
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
      /* Both portrait board types show the goal line and both
         touchlines, so both have two real corners. The far edge is a
         halfway line or an arbitrary cut across the pitch — an arc
         there would invent a boundary that is not on the ground. */
      corners:      [{cx: 0, cy: 0}, {cx: e.ax, cy: 0}],
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
  /**
   * Which edge of the board a penalty area is pinned to.
   *
   * The one question a penalty arc has to answer: it shows the part of
   * its circle on the far side of the box from that edge. Four
   * hardcoded cases — the old CSS had `inset(0 0 0 75%)` for the left
   * arc and a mirror for the right — all become wrong the moment the
   * pitch or the orientation changes; asking the geometry instead
   * makes horizontal, vertical, half and area fall out of one rule.
   */
  function arcEdge(box, e) {
    if (box.x <= 0.001) return 'left';
    if (box.x + box.w >= e.ax - 0.001) return 'right';
    if (box.y <= 0.001) return 'top';
    return 'bottom';
  }

  /**
   * The VISIBLE sweep of a penalty arc, in radians.
   *
   * The same rule as the CSS clip below, in the form a canvas wants —
   * board3d draws its markings into a texture and cannot use an
   * `inset()`. It had its own derivation, which handled only the two
   * landscape cases: on a half or area board, where the box is at the
   * TOP, it clipped against an x edge and drew a sliver hidden inside
   * the box. The arc was simply missing, which is what a user saw.
   *
   * Angles are in the same frame as the markings: x right, y DOWN, so
   * they hand straight to CanvasRenderingContext2D.arc.
   */
  function arcRange(m, which) {
    var c = m[which === 'right' ? 'arcRight' : 'arcLeft'];
    var box = m[which === 'right' ? 'penaltyRight' : 'penaltyLeft'];
    if (!c || !box || !(c.r > 0)) return null;
    var cl = function (v) { return Math.min(1, Math.max(-1, v)); };
    var a;
    switch (arcEdge(box, m.extent)) {
      /* Box on the left edge: show the part with x beyond its right
         side, so cos(t) > k and the sweep straddles 0. */
      case 'left':
        a = Math.acos(cl((box.x + box.w - c.cx) / c.r));
        return {from: -a, to: a};
      // Mirror: cos(t) < k, straddling pi.
      case 'right':
        a = Math.acos(cl((box.x - c.cx) / c.r));
        return {from: a, to: 2 * Math.PI - a};
      /* Box on the top edge: show the part BELOW it, so sin(t) > k —
         and with y pointing down that is the sweep straddling pi/2. */
      case 'top':
        a = Math.asin(cl((box.y + box.h - c.cy) / c.r));
        return {from: a, to: Math.PI - a};
      // Mirror: sin(t) < k, straddling 3pi/2.
      default:
        a = Math.asin(cl((box.y - c.cy) / c.r));
        return {from: Math.PI - a, to: 2 * Math.PI + a};
    }
  }

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
      switch (arcEdge(box, e)) {
        case 'left':
          lo = c.cx - c.r; frac = (box.x + box.w - lo) / (c.r * 2);
          out[pair[0]].clip = 'inset(0 0 0 ' + pctOf(frac) + '%)';
          break;
        case 'right':
          lo = c.cx - c.r; frac = (box.x - lo) / (c.r * 2);
          out[pair[0]].clip = 'inset(0 ' + pctOf(1 - frac) + '% 0 0)';
          break;
        case 'top':
          lo = c.cy - c.r; frac = (box.y + box.h - lo) / (c.r * 2);
          out[pair[0]].clip = 'inset(' + pctOf(frac) + '% 0 0 0)';
          break;
        default:
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
    /* Corner arcs. `size` is the full diameter as a percentage of the
       board width; the circle is centred on the corner, so three
       quarters of it fall outside the pitch and are clipped away by
       .tb-field's overflow:hidden. */
    out.corners = (m.corners || []).map(function (c) {
      return {left: px(c.cx), top: py(c.cy), size: px(m.cornerR * 2)};
    });
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

  /**
   * Pixels per metre for a board rendered `widthPx` wide.
   *
   * The one bridge between the metric sizes above and the 2D board's
   * pixels. `extent().ax` is what the board's width REPRESENTS, so
   * the ratio holds for any board type, any pitch size and any zoom —
   * including the drawing overlay, whose width changes every frame.
   */
  function ppm(widthPx, pitch, boardType, vertical) {
    var ax = extent(pitch, boardType, vertical).ax;
    return ax > 0 ? widthPx / ax : 0;
  }

  return {
    MARKS: MARKS,
    OBJ: OBJ,
    MARK: MARK,
    /** px per metre for a board of this size — the 2D bridge. */
    ppm: ppm,
    DEFAULT_PITCH: DEFAULT_PITCH,
    BOUNDS: {MIN_L: MIN_L, MAX_L: MAX_L, MIN_W: MIN_W, MAX_W: MAX_W},
    pitchOf: pitchOf,
    clamp: clamp,
    isRotated: isRotated,
    extent: extent,
    aspectPct: aspectPct,
    /** The visible sweep of a penalty arc — see arcRange. */
    arcRange: arcRange,
    markings: markings,
    toCss: toCss,
    toWorld: toWorld,
    toPercent: toPercent
  };
});
