/* =========================================================
   EsquerrApp — tactical board entry construction

   Pure logic: no Firestore, no DOM, no browser globals. The
   editor in app.js owns the drawing surface and the localStorage
   scratch keys; this file owns the one question "what does a
   saved board look like".

   It existed as FOUR hand-maintained copies of the same object
   literal — Save, Save As, Add to Training and Add to Match —
   differing only in whether they carried an `id` and a
   `category`. Four copies of twenty fields is a drift waiting to
   happen: a field added to the editor reaches whichever of the
   four the author happened to be looking at, and a board linked
   to a match silently loses it.

   `store` is injected rather than read from `localStorage`
   directly so the Node tests can build an entry with no browser.

   Loaded after db.js in the browser; exported for the tests.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TB = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Build one saved-board entry from the editor's scratch state.
   *
   * `opts.id` and `opts.category` are OMITTED when not supplied,
   * rather than set to undefined — the four call sites genuinely
   * carry different shapes and the difference is meaningful:
   *
   *   Save / Save As      id + category   the library is an array
   *                                       routed on its own stamp
   *   Add to Training     category        the bucket is keyed by
   *                                       DATE, which two categories
   *                                       can share, so the entry has
   *                                       to say whose it is
   *   Add to Match        neither         routed by joining the map
   *                                       key (a matchId) through
   *                                       fa_matches — see shard.js
   *
   * Key insertion order matches the literals this replaced. That is
   * not cosmetic: db.js diffs shards as SERIALISED STRINGS
   * (`prevJson === nextJson`), so reordering keys would mark every
   * board shard in every club as changed and rewrite them all once
   * for no reason.
   */
  function buildBoardEntry(store, opts) {
    opts = opts || {};
    var e = {};
    if (opts.id !== undefined) e.id = opts.id;
    if (opts.category !== undefined) e.category = opts.category;
    e.name = opts.name;
    e.formation = store.getItem('fa_tactic_formation') || '';
    e.positions = JSON.parse(store.getItem('fa_tactic_positions') || 'null');
    e.numbers = JSON.parse(store.getItem('fa_tactic_numbers') || 'null');
    e.boardType = store.getItem('fa_tactic_board_type') || 'full';
    e.teamColor = store.getItem('fa_tactic_team_color') || '#ffffff';
    e.oppColor = store.getItem('fa_tactic_opp_color') || '#e53935';
    e.showOpp = store.getItem('fa_tactic_show_opp') === 'true';
    e.oppPositions = JSON.parse(store.getItem('fa_tactic_opp_positions') || 'null');
    e.oppNumbers = JSON.parse(store.getItem('fa_tactic_opp_numbers') || 'null');
    e.balls = JSON.parse(store.getItem('fa_tactic_balls') || '[]');
    e.colors = JSON.parse(store.getItem('fa_tactic_colors') || 'null');
    e.arrows = JSON.parse(store.getItem('fa_tactic_arrows') || '[]');
    e.rects = JSON.parse(store.getItem('fa_tactic_rects') || '[]');
    e.texts = JSON.parse(store.getItem('fa_tactic_texts') || '[]');
    e.penLines = JSON.parse(store.getItem('fa_tactic_pen_lines') || '[]');
    e.frames = JSON.parse(store.getItem('fa_tactic_frames') || '[]');
    e.tag = store.getItem('fa_tactic_tag') || '';
    e.silhouette = store.getItem('fa_tactic_silhouette') || '';
    e.cones = JSON.parse(store.getItem('fa_tactic_cones') || '[]');
    return e;
  }

  /** Mint a board id. Kept here so `ensureBoardIds` and the save
   *  paths cannot drift into two different formats. */
  function newBoardId() {
    return 'tb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  return {
    buildBoardEntry: buildBoardEntry,
    newBoardId: newBoardId
  };
});
