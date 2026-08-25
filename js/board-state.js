/* =========================================================
   EsquerrApp — tactical board scratch state

   Pure logic: no DOM, no Firestore, no browser globals. `store` is
   injected, following js/boards.js, so the Node tests run with no
   browser.

   Two jobs.

   ONE: own the SHAPE of the editor's scratch keys. Every
   `fa_tactic_*` value is written through a setter here, so the 2 dp
   rounding — which was `Math.round(v * 100) / 100` copied into six
   save functions — has a single definition, and a 3D view writing a
   dragged player lands on byte-identical output to the 2D one. The
   save functions still read the DOM; that is their job as a view.
   What moved here is what the value IS.

   TWO: own the frame TWEEN. Playback existed twice — once in the
   editor (`interpolateAndApply`) and once in the read-only renderer
   (`interpolateRo`) — as two ~120-line functions doing the same
   matching and the same lerp against different DOM. They drifted, and
   the drift shipped: v91 records the editor preferring the current
   colour array over the frame's, the opposite of every other
   renderer, so a player changed colour mid-animation in the editor
   and not anywhere else. v88's opposition flash was the same shape of
   bug. A third copy for 3D would have been the third chance to
   diverge.

   The tween reduces to one question per index — where is this thing
   at time t, or is it not there — and that question has no DOM in it.

   Loaded after board-geom.js; exported for the tests.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BS = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Two decimal places, everywhere. The board stores percentages of
     the pitch, so 0.01% of a 105 m pitch is about a centimetre —
     far below what anyone can drag, and enough to keep the serialised
     blob from growing floating-point tails that make db.js see a
     changed shard on every save. */
  function round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function roundPt(p) {
    return p ? [round2(p[0]), round2(p[1])] : null;
  }

  function roundPts(arr) {
    return (arr || []).map(roundPt);
  }

  /* ── The scratch keys ──────────────────────────────────────────
     Named so the callers never spell a key as a string literal. A
     typo in a literal is silent: the write goes to a key nothing
     reads, the board looks fine until reload, and the value is gone. */
  var K = {
    positions:    'fa_tactic_positions',
    numbers:      'fa_tactic_numbers',
    colors:       'fa_tactic_colors',
    oppPositions: 'fa_tactic_opp_positions',
    oppNumbers:   'fa_tactic_opp_numbers',
    oppColors:    'fa_tactic_opp_colors',
    balls:        'fa_tactic_balls',
    arrows:       'fa_tactic_arrows',
    rects:        'fa_tactic_rects',
    texts:        'fa_tactic_texts',
    penLines:     'fa_tactic_pen_lines',
    cones:        'fa_tactic_cones',
    silhouette:   'fa_tactic_silhouette',
    pitch:        'fa_tactic_pitch',
    penSpace:     'fa_tactic_pen_space'
  };

  function readJson(store, key, fallback) {
    var raw = store.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      /* A corrupt value must not take the board down. localStorage is
         shared with other tabs and survives version changes, so this
         is reachable in the wild rather than merely defensive. */
      return fallback;
    }
  }

  function writeJson(store, key, value) {
    store.setItem(key, JSON.stringify(value));
  }

  /* Point tracks: players, opposition, balls, cones. Rounded on the
     way in, so nothing downstream has to remember to. */
  function setPoints(store, key, arr) {
    writeJson(store, key, roundPts(arr));
  }

  function getPoints(store, key) {
    var v = readJson(store, key, null);
    return Array.isArray(v) ? v : null;
  }

  /* Arrows: [x1, y1, x2, y2, colour, dashed]. Both endpoints round;
     the colour and the flag pass through untouched. */
  function setArrows(store, arr) {
    writeJson(store, K.arrows, (arr || []).map(function (a) {
      return [round2(a[0]), round2(a[1]), round2(a[2]), round2(a[3]), a[4], a[5]];
    }));
  }

  /* Rects: [x, y, w, h, colour, fillOpacity]. */
  function setRects(store, arr) {
    writeJson(store, K.rects, (arr || []).map(function (r) {
      return [round2(r[0]), round2(r[1]), round2(r[2]), round2(r[3]), r[4], r[5]];
    }));
  }

  /* Texts: [x, y, text, bg, opacity, wPx, hPx, fontPx]. Only the
     first two are pitch coordinates — the pixel sizes are pixels and
     must NOT be rounded to 2 dp as though they were percentages. */
  function setTexts(store, arr) {
    writeJson(store, K.texts, (arr || []).map(function (t) {
      return [round2(t[0]), round2(t[1]), t[2], t[3], t[4], t[5], t[6], t[7]];
    }));
  }

  /* ── The tween ─────────────────────────────────────────────────
     Where is each thing at time t, or is it not there?

     Four cases, and only the first is interesting:

       in both frames      lerp between them
       only in `to`        SNAP to it — it appears at its final place
                           rather than sliding in from wherever index
                           i happened to be last
       not in `to`         null: gone. A null entry is a DELETED slot,
                           not an empty one, which is why indices are
                           stable and never compacted.
       in neither          null

     Returns positions only. Whether that means create an element,
     move one or remove one depends on what is already on screen,
     which is the caller's business and the reason this function has
     no DOM in it. */
  function tweenTrack(from, to, t, paths) {
    var a = from || [];
    var b = to || [];
    var n = Math.max(a.length, b.length);
    var out = [];
    for (var i = 0; i < n; i++) {
      var f = a[i];
      var g = b[i];
      if (!g) { out.push(null); continue; }
      if (!f) { out.push([g[0], g[1]]); continue; }   // snap
      /* `paths` is optional and sparse. Without one this is the same
         straight lerp it has always been — pathPoint's no-bend branch
         is the identical expression, so nothing that predates
         trajectories moves by a pixel. */
      var path = paths && paths[i];
      var shaped = path && (path.bend || (path.pts && path.pts.length));
      if (shaped) out.push(pathPoint(f, g, path, t));
      else out.push([f[0] + (g[0] - f[0]) * t, f[1] + (g[1] - f[1]) * t]);
    }
    return out;
  }

  /* A whole frame at time t.

     Positions tween; everything else is taken from the TARGET frame.
     That is not laziness — it is the v91 rule, stated once. A frame
     OWNS its colours, so stepping back to frame 0 restores frame 0's
     colours instead of keeping a later recolour. Arrows, rects, texts,
     pen strokes and cones are drawings rather than moving objects:
     they belong to the moment, and half an arrow tweening into
     another arrow is not a thing anyone wants to watch.

     Numbers are the exception the caller handles: a shirt number is a
     property of the PLAYER, not of the moment, so it is merged across
     frames rather than taken from one. It is left out of here because
     the merge needs the live editor state, which is not frame data. */
  function tweenFrame(from, to, t) {
    var f = from || {};
    var g = to || {};
    return {
      positions:    tweenTrack(f.positions, g.positions, t),
      oppPositions: tweenTrack(f.oppPositions, g.oppPositions, t),
      balls:        tweenTrack(f.balls, g.balls, t),
      cones:        tweenTrack(f.cones, g.cones, t),
      colors:       g.colors || [],
      oppColors:    g.oppColors || [],
      arrows:       g.arrows || [],
      rects:        g.rects || [],
      texts:        g.texts || [],
      penLines:     g.penLines || [],
      silhouette:   g.silhouette || ''
    };
  }

  /* ── Trajectories ──────────────────────────────────────────────
     A path describes HOW something got from its place in one frame to
     its place in the next. It belongs to the frame it leads INTO, so
     `frames[n].paths` is about the move from frame n-1 to frame n.

       {bend: [x, y] | null, apex: metres}

     `bend` is the point the coach drags — the middle of the curve, on
     the curve. Storing the on-curve midpoint rather than the Bézier
     control point matters: the handle is what the user manipulates,
     so round-tripping it must be exact, and `null` (no bend) then
     means precisely "the midpoint is where a straight line would put
     it". Deriving the control point is one line; deriving the handle
     from a stored control point is one line the UI would have to get
     right in three places.

     Both curves are parabolas, as specified:
       - in PLAN, a quadratic Bézier, which is a parabola by
         definition;
       - in ELEVATION, 4h·t(1-t), which peaks at exactly h when
         t = 0.5.

     `apex` is in METRES above the turf, so it means the same thing on
     any size of pitch — a 3 m chip is a 3 m chip. It has no top-down
     representation, so the 2D board ignores it. */

  /** The Bézier control point that puts the curve's midpoint on `bend`. */
  function bendToControl(p0, p1, bend) {
    if (!bend) return [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    // B(0.5) = (P0 + 2C + P1) / 4  =>  C = (4M - P0 - P1) / 2
    return [(4 * bend[0] - p0[0] - p1[0]) / 2,
      (4 * bend[1] - p0[1] - p1[1]) / 2];
  }

  /* A player's bend points, tolerating the shape that came before.

     Ball and player paths are deliberately DIFFERENT shapes, because
     they are different things: a ball flight is a parabola and carries
     {bend, apex}; a player run is a shaped path and carries {pts}.
     Player paths written before multi-point runs existed have a single
     `bend`, which reads perfectly well as a one-element `pts`. */
  function pointsOf(path) {
    if (!path) return [];
    if (Array.isArray(path.pts)) return path.pts.filter(Boolean);
    return path.bend ? [path.bend] : [];
  }

  /* Centripetal Catmull-Rom through one segment.

     CENTRIPETAL (alpha = 0.5), not uniform. Uniform Catmull-Rom forms
     cusps and self-intersecting loops when the points are unevenly
     spaced — and a coach dropping bend dots by hand spaces them very
     unevenly. Centripetal is the variant with the proof that it never
     does that, which is the whole reason to prefer it here. */
  function crSeg(p0, p1, p2, p3, u) {
    const knot = (a, b, t0) => {
      const d = Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]));
      // Coincident points would make a zero-length knot span and
      // divide by zero; nudge rather than special-case downstream.
      return t0 + (d < 1e-6 ? 1e-6 : d);
    };
    const t0 = 0;
    const t1 = knot(p0, p1, t0);
    const t2 = knot(p1, p2, t1);
    const t3 = knot(p2, p3, t2);
    const t = t1 + (t2 - t1) * u;

    const lerpP = (a, b, ta, tb) => {
      const w = (tb - t) / (tb - ta);
      const v = (t - ta) / (tb - ta);
      return [a[0] * w + b[0] * v, a[1] * w + b[1] * v];
    };
    const a1 = lerpP(p0, p1, t0, t1);
    const a2 = lerpP(p1, p2, t1, t2);
    const a3 = lerpP(p2, p3, t2, t3);
    const b1 = lerpP(a1, a2, t0, t2);
    const b2 = lerpP(a2, a3, t1, t3);
    return lerpP(b1, b2, t1, t2);
  }

  /**
   * A run through every bend dot, at time t.
   *
   * The curve PASSES THROUGH each dot — that is the point of a spline
   * here rather than a Bézier: the coach drops a dot where the player
   * should be, and the player goes there.
   *
   * End tangents come from duplicating the endpoints, which makes the
   * curve leave the start and arrive at the end without the overshoot
   * a phantom control point would introduce.
   */
  function splinePoint(p0, pts, p1, t) {
    const P = [p0].concat(pts || []).concat([p1]);
    const n = P.length - 1;
    if (n < 1) return p0;
    const clamped = Math.max(0, Math.min(1, t));
    let seg = Math.floor(clamped * n);
    if (seg >= n) seg = n - 1;
    const u = clamped * n - seg;
    return crSeg(
        P[seg - 1] || P[seg],
        P[seg],
        P[seg + 1],
        P[seg + 2] || P[seg + 1],
        u);
  }

  /**
   * Keep a ball's bend handle at the MIDDLE of its flight.
   *
   * Projects the dragged point onto the perpendicular bisector of the
   * start-end line, so the handle can be pushed sideways but never
   * slid toward either end. Two consequences, both wanted:
   *
   *   - the handle is always equidistant from both ends, so it reads
   *     as the midpoint from any camera angle;
   *   - the parabola is symmetric, which is what a struck ball
   *     actually does. A late-bending ball flight is not a thing.
   *
   * Player runs are NOT constrained — a run bends wherever the coach
   * puts the dot, and can bend late.
   */
  function constrainBend(p0, p1, at) {
    const mx = (p0[0] + p1[0]) / 2;
    const my = (p0[1] + p1[1]) / 2;
    let dx = p1[0] - p0[0];
    let dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    // Start and end on top of each other: no chord, no bisector.
    if (len < 1e-9) return [round2(at[0]), round2(at[1])];
    dx /= len; dy /= len;
    const nx = -dy, ny = dx;                       // the chord's normal
    const s = (at[0] - mx) * nx + (at[1] - my) * ny;
    return [round2(mx + nx * s), round2(my + ny * s)];
  }

  /** Where the thing is at time t, in board percentages. */
  function pathPoint(p0, p1, path, t) {
    if (!p0 || !p1) return p1 || p0 || null;
    const pts = path && Array.isArray(path.pts) ? path.pts.filter(Boolean) : null;
    // A player run: a spline through every dot.
    if (pts && pts.length) return splinePoint(p0, pts, p1, t);
    const bend = path && path.bend;
    if (!bend) {
      // No bend is a straight line, and must be EXACTLY the old lerp.
      return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
    }
    // A ball flight: one control point, therefore a parabola.
    const c = bendToControl(p0, p1, bend);
    const u = 1 - t;
    return [
      u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]
    ];
  }

  /** Squared distance from `p` to the segment `a`-`b`. */
  function distToSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let u = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
    u = Math.max(0, Math.min(1, u));
    const qx = a[0] + dx * u, qy = a[1] + dy * u;
    return (p[0] - qx) * (p[0] - qx) + (p[1] - qy) * (p[1] - qy);
  }

  /**
   * Add a bend dot where the coach clicked, IN THE RIGHT PLACE.
   *
   * The index matters as much as the position: appending would send a
   * dot dropped near the start of a run to the end of the list, and
   * the run would loop back on itself to collect it. So the nearest
   * segment of the current control polygon decides where it goes —
   * segment i sits between control point i and i+1, and `pts` is the
   * polygon minus its two endpoints, so segment i inserts at index i.
   */
  function insertPointAt(path, p0, p1, at) {
    const pts = pointsOf(path).slice();
    const P = [p0].concat(pts).concat([p1]);
    let best = 0, bestD = Infinity;
    for (let i = 0; i < P.length - 1; i++) {
      const d = distToSeg(at, P[i], P[i + 1]);
      if (d < bestD) { bestD = d; best = i; }
    }
    pts.splice(best, 0, [round2(at[0]), round2(at[1])]);
    return pts;
  }

  /** Height above the turf at time t, in metres. Zero without an apex. */
  function pathHeight(path, t) {
    const h = path && Number(path.apex);
    if (!isFinite(h) || h <= 0) return 0;
    return 4 * h * t * (1 - t);
  }

  /** The curve as `n` points, for drawing it. */
  function samplePath(p0, p1, path, n) {
    const out = [];
    const steps = Math.max(2, n || 24);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const p = pathPoint(p0, p1, path, t);
      out.push([p[0], p[1], pathHeight(path, t)]);
    }
    return out;
  }

  /** Read one object's path out of a frame. Null when it has none. */
  function pathOf(frame, kind, index) {
    const paths = frame && frame.paths;
    const forKind = paths && paths[kind];
    return (forKind && forKind[index]) || null;
  }

  return {
    KEYS: K,
    bendToControl: bendToControl,
    constrainBend: constrainBend,
    pointsOf: pointsOf,
    splinePoint: splinePoint,
    insertPointAt: insertPointAt,
    pathPoint: pathPoint,
    pathHeight: pathHeight,
    samplePath: samplePath,
    pathOf: pathOf,
    round2: round2,
    roundPt: roundPt,
    roundPts: roundPts,
    readJson: readJson,
    writeJson: writeJson,
    setPoints: setPoints,
    getPoints: getPoints,
    setArrows: setArrows,
    setRects: setRects,
    setTexts: setTexts,
    tweenTrack: tweenTrack,
    tweenFrame: tweenFrame
  };
});
