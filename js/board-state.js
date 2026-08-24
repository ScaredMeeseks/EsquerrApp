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
  function tweenTrack(from, to, t) {
    var a = from || [];
    var b = to || [];
    var n = Math.max(a.length, b.length);
    var out = [];
    for (var i = 0; i < n; i++) {
      var f = a[i];
      var g = b[i];
      if (!g) { out.push(null); continue; }
      if (!f) { out.push([g[0], g[1]]); continue; }   // snap
      out.push([f[0] + (g[0] - f[0]) * t, f[1] + (g[1] - f[1]) * t]);
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

  return {
    KEYS: K,
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
