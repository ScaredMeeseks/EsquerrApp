/* Convocatòria — the staff call-up tab, redesigned (v227).
 *
 * The sixth Claude Design handoff. The page is one paper surface in bands,
 * built by the `cv*` helpers in js/app.js; they are pure string builders
 * over localStorage and a handful of shared formatters, so this suite grabs
 * the block out of the source and runs it FOR REAL through `new Function`
 * over stubs — the same arrangement partit.test.js uses, and the only
 * coverage app.js has.
 *
 * ⚠ FIVE DEPARTURES FROM THE HANDOFF, all deliberate and all recorded in
 * CONTEXT.md. Three of them are asserted here rather than merely written
 * down, because each is a rule somebody would otherwise "fix" back:
 *
 *   1. The classes are `cv-`, not the `.conv-` the README asks to keep —
 *      `.conv-player` and friends are used by six OTHER surfaces.
 *   2. There is NO `Tard` availability state; nothing in the app produces
 *      one. ("no state the data cannot produce", below.)
 *   3. Unsend is kept, `Buida-ho tot` is dropped. ("the footer".)
 *   4. Drop-on-row inserts in Convocats only; Disponibles is sorted by
 *      position and has nowhere to store an order.
 *   5. The board thumbnail expands rather than drawing a live 34×24 board.
 *
 * The rule worth breaking the build over is "Convocats renders in the
 * stored order". That order IS the acta order — the render this replaced
 * sorted it away with posRank, which is why dragging a player between two
 * others used to do nothing at all.
 *
 * `npm run test:conv`, or as part of test:unit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');
const {readCss} = require('./read-css');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const css = readCss();
/* Comments stripped. Prose explaining a class is not a use of it, and the
   block is heavily commented — the banner alone names `.conv-` half a dozen
   times while explaining why the classes are `cv-`. */
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

const BLOCK = grab('  /* ---------- Convocatòria, redesigned (v227)',
    '  function renderAdminUsers()');
const BIND = grab('  // ---------- Convocatòria: drag-and-drop, menus, bands',
    '  // #endregion Matchday, Calendar & Convocatòria');

/* The `cv-` block sliced out of the stylesheet, so a rule from some other
   page cannot answer a question asked about this one. */
const CVCSS = css.slice(css.indexOf('/* ===== Convocatòria, redesigned (v227)'));

const sanitize = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

let RO = false;
let STORE = {};
let USERS = [];
let FITNESS = {};
let LIBRARY = [];
let CUR_CAT = '';
let VISIBLE_CATS = ['amateur'];
let LETTER = 'all';

/* Stubs return something DISTINCTIVE rather than '': a stub returning the
   empty string makes "the builder rendered nothing" and "the builder
   rendered the stub" indistinguishable, which is how a renderer passes
   while emitting nothing at all. */
function build(selectedId) {
  // eslint-disable-next-line no-new-func
  const api = new Function(
      't', 'sanitize', 'canEditPage', 'localStorage', 'getCurrentCategory',
      'getVisibleCategories', 'getUsers', 'fitnessContext',
      'deriveFitnessStatus', 'playerStatusHtml', 'catSpanOf',
      'catBadgeHtmlGlobal', 'posRankGlobal', 'posCirclesHtmlGlobal',
      'isOurTeam', 'getClubName', 'ptCrestHtml', 'ptOurSide', 'tDateShort',
      'clubKits', 'shirtSvg', 'shortsSvg', 'kitSockSvg', 'safeHttpUrl',
      'viewOnlyBanner', 'TB', 'tbLinkedKey', 'convSelectedMatchId',
      'convTeamFilter',
      BLOCK + '\n return {renderConvocatoria, cvMins, cvQuickTimes, cvDelta,' +
        ' cvAvailability, cvMenu, cvRowHtml, cvHead};')(
      (k) => k,
      sanitize,
      () => !RO,
      {getItem: (k) => (k in STORE ? STORE[k] : null),
        setItem: (k, v) => { STORE[k] = v; }},
      () => CUR_CAT,
      () => VISIBLE_CATS,
      () => USERS,
      () => ({}),
      (id) => ({fitnessStatus: FITNESS[id] || 'fit'}),
      // Echoes the status AND that a context was passed, so a test can tell
      // "the shared path ran" from "something rendered a glyph of its own".
      (p, ctx) => '[FIT:' + (FITNESS[p.id] || 'fit') + ':' + (ctx ? 'ctx' : 'NOCTX') + ']',
      /* catSpanOf, for real rather than a constant. Which rows it is given
         is the thing under test once Convocats can hold a player from
         outside the filter, and a stub returning false could not tell a
         right answer from a wrong one. */
      (rows) => new Set((rows || []).map((r) => r.category).filter(Boolean)).size > 1,
      (p, span) => (span ? '[CAT:' + (p.category || '') + ']' : ''),
      (p) => (p.rank || 0),
      (p) => '[DISC:' + (p.position || '') + ']',
      (n) => n === 'US',
      () => 'US',
      (m, side) => '[CREST:' + sanitize(m[side]) + ']',
      (m) => (m.home === 'US' ? 'home' : 'away'),
      (d) => 'SHORT:' + d,
      () => [{id: 'k1', label: '1a equipació', shirt: 'red', shorts: 'black', socks: 'red'},
        {id: 'k2', label: '2a equipació', shirt: 'white', shorts: 'white', socks: 'white'}],
      (f, b, px) => '[SHIRT:' + f + ':' + px + ']',
      (f, px) => '[SHORTS:' + f + ':' + px + ']',
      (f, px) => '[SOCKS:' + f + ':' + px + ']',
      // The real gate, sliced in rather than stubbed: a stub that let
      // `javascript:` through would make the test pass on a broken page.
      (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : ''),
      () => '[RO-BANNER]',
      {ready: () => true, library: () => LIBRARY,
        meta: (id) => LIBRARY.find((b) => b.id === id) || null},
      (b) => (b.boardId ? 'id:' + b.boardId : 'name:' + (b.name || '')),
      selectedId === undefined ? 1 : selectedId,
      LETTER);
  return api;
}

const MATCH = {id: 1, home: 'US', away: 'THEM', date: '2099-10-05', time: '20:00',
  status: 'upcoming', fcfJornada: 3, category: ''};

function squad(over) {
  return Object.assign([
    {id: 'p1', name: 'Guillem Roca', roles: ['player'], playerNumber: '1', position: 'GK', rank: 0, team: 'A'},
    {id: 'p2', name: 'Marc Vidal', roles: ['player'], playerNumber: '5', position: 'CB', rank: 1, team: 'A'},
    {id: 'p3', name: 'Pol Serrat', roles: ['player'], playerNumber: '11', position: 'LW', rank: 7, team: 'A'},
    {id: 'p4', name: 'Iker Ramos', roles: ['player'], playerNumber: '9', position: 'ST', rank: 8, team: 'A'}
  ], over || []);
}

function reset() {
  RO = false;
  FITNESS = {};
  CUR_CAT = '';
  VISIBLE_CATS = ['amateur'];
  LETTER = 'all';
  USERS = squad();
  LIBRARY = [{id: 'b1', name: 'Pressió alta 4-3-3', frameCount: 4, hasFrames: true},
    {id: 'b2', name: 'Córner defensiu', frameCount: 1, hasFrames: false}];
  STORE = {
    fa_matches: JSON.stringify([MATCH]),
    fa_convocatoria: JSON.stringify({1: []}),
    fa_convocatoria_sent: '{}',
    fa_convocatoria_callup: JSON.stringify({1: '18:45'}),
    fa_convocatoria_uniform: '{}',
    fa_convocatoria_videos: '{}',
    fa_match_availability: '{}',
    fa_tactic_match_boards: '{}'
  };
}

/** Every `data-id` in one column, in render order. */
function idsIn(html, colId) {
  const col = html.slice(html.indexOf('id="' + colId + '"'));
  const end = col.indexOf('<div class="cv-col"', 1);
  const seg = end === -1 ? col : col.slice(0, end);
  return [...seg.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]);
}

describe('Convocatòria — the acta order', () => {
  beforeEach(reset);

  /* THE rule. `fa_convocatoria[matchId]` is an array of ids and it IS the
     order the coach dragged the rows into. The render this replaced piped it
     through `.sort(posRank)` on the way out, so every insertion the drag
     code performed was thrown away before it reached the screen. */
  it('renders Convocats in the STORED order, not by position', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['p4', 'p1', 'p3']});
    const html = build().renderConvocatoria();
    assert.deepStrictEqual(idsIn(html, 'cv-called'), ['p4', 'p1', 'p3']);
  });

  it('still sorts Disponibles by position', () => {
    // p3 (rank 7) and p2 (rank 1) are stored the other way round in the
    // roster; the column must come back in positional order regardless.
    USERS = [squad()[2], squad()[1], squad()[0]];
    const html = build().renderConvocatoria();
    assert.deepStrictEqual(idsIn(html, 'cv-avail'), ['p1', 'p2', 'p3']);
  });

  it('drops a called-up player who is no longer in the roster', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['p1', 'ghost', 'p3']});
    const html = build().renderConvocatoria();
    assert.deepStrictEqual(idsIn(html, 'cv-called'), ['p1', 'p3']);
  });

  it('warns in red past 18 on the acta', () => {
    const many = [];
    for (let i = 0; i < 19; i++) {
      many.push({id: 'x' + i, name: 'P' + i, roles: ['player'], playerNumber: String(i), position: 'CB'});
    }
    USERS = many;
    STORE.fa_convocatoria = JSON.stringify({1: many.map((p) => p.id)});
    const html = build().renderConvocatoria();
    assert.ok(/class="cv-big cv-over"/.test(html), 'the count is not flagged');
    assert.ok(html.includes('cv.max_acta'), 'the column note does not warn');

    STORE.fa_convocatoria = JSON.stringify({1: many.slice(0, 18).map((p) => p.id)});
    const ok = build().renderConvocatoria();
    assert.ok(!/cv-big cv-over/.test(ok), '18 is not over the limit');
    assert.ok(ok.includes('cv.acta_order'), 'the note should read the acta order');
  });
});

describe('Convocatòria — availability', () => {
  beforeEach(reset);

  /* One column, two sources. The medical record wins over the player's own
     answer: a player who said "disponible" on Tuesday and tore a hamstring
     on Thursday is Lesionat, and a coach reading "Disponible" under those
     circumstances is the failure this column exists to prevent. */
  const cases = [
    ['fit + no answer', 'fit', null, 'cv.st_none', false],
    ['fit + disponible', 'fit', 'disponible', 'cv.st_disp', false],
    ['fit + no_disponible', 'fit', 'no_disponible', 'cv.st_nodisp', true],
    ['doubt beats the answer', 'doubt', 'disponible', 'cv.st_doubt', false],
    ['injured beats the answer', 'injured', 'disponible', 'cv.st_injured', true]
  ];
  cases.forEach((c) => {
    it('maps ' + c[0], () => {
      FITNESS.p1 = c[1];
      const got = build().cvAvailability({id: 'p1'}, c[2], {});
      assert.strictEqual(got.label, c[3]);
      assert.strictEqual(got.blocked, c[4]);
    });
  });

  /* ⚠ NO STATE THE DATA CANNOT PRODUCE. The design lists six and `Tard` is
     the sixth; fa_match_availability holds `disponible`, `no_disponible` or
     nothing, so a Tard would be a colour that never appears on screen. If
     an "arribaré tard" answer is ever added on the player side, this is the
     test that should fail. */
  it('has no Tard state', () => {
    assert.ok(!/cv\.st_late|'Tard'/.test(BLOCK),
        'a Tard state appeared without a source in fa_match_availability');
    const got = build().cvAvailability({id: 'p1'}, 'tard', {});
    assert.strictEqual(got.label, 'cv.st_none');
  });

  it('makes injured and unavailable rows inert, and leaves them visible', () => {
    FITNESS.p1 = 'injured';
    STORE.fa_match_availability = JSON.stringify({p2_1: 'no_disponible'});
    const html = build().renderConvocatoria();
    const rows = [...html.matchAll(/<div class="([^"]*cv-row[^"]*)" data-id="(p\d)" draggable="(\w+)"/g)]
        .reduce((a, m) => Object.assign(a, {[m[2]]: {cls: m[1], drag: m[3]}}), {});
    ['p1', 'p2'].forEach((id) => {
      assert.ok(rows[id], id + ' vanished from the pool instead of being faded');
      assert.ok(rows[id].cls.includes('cv-row-off'), id + ' is not faded');
      assert.strictEqual(rows[id].drag, 'false', id + ' is still draggable');
    });
    assert.strictEqual(rows.p3.drag, 'true', 'a fit player must stay draggable');
    // …and cannot be convoked: no → glyph on a blocked row in Disponibles.
    assert.ok(!/data-cv-move="p1"/.test(html), 'an injured player can still be called up');
    assert.ok(/data-cv-move="p3"/.test(html), 'a fit player lost his call-up glyph');
  });

  it('keeps the ✕ on a player who was called up and THEN got injured', () => {
    FITNESS.p1 = 'injured';
    STORE.fa_convocatoria = JSON.stringify({1: ['p1']});
    const html = build().renderConvocatoria();
    assert.ok(/data-cv-move="p1"/.test(html),
        'an injured player already on the acta must still be removable');
  });
});

describe('Convocatòria — hora de citació', () => {
  beforeEach(reset);

  it('derives the four pills from the kickoff', () => {
    assert.deepStrictEqual(build().cvQuickTimes('20:00'),
        ['18:15', '18:30', '18:45', '19:00']);
    assert.deepStrictEqual(build().cvQuickTimes('12:30'),
        ['10:45', '11:00', '11:15', '11:30']);
  });

  /* Wrapped, not clamped: a 00:30 kickoff cites the evening before, and a
     pill reading 0:00 would be a time nobody meant. */
  it('wraps through midnight rather than clamping at zero', () => {
    assert.deepStrictEqual(build().cvQuickTimes('00:30'),
        ['22:45', '23:00', '23:15', '23:30']);
  });

  it('offers no pills without a kickoff', () => {
    assert.deepStrictEqual(build().cvQuickTimes(''), []);
    assert.deepStrictEqual(build().cvQuickTimes('nonsense'), []);
  });

  it('accepts only hh:mm', () => {
    const {cvMins} = build();
    assert.strictEqual(cvMins('18:45'), 1125);
    assert.strictEqual(cvMins('9:05'), 545);
    ['18:4', '18:456', '24:00', '18:60', '', '1845', 'ab:cd', null]
        .forEach((v) => assert.strictEqual(cvMins(v), null, 'accepted ' + v));
  });

  it('says how long before kick-off, or why the field is red', () => {
    const {cvDelta} = build();
    assert.strictEqual(cvDelta('18:45', '20:00'), '1 h 15 min cv.time_before');
    assert.strictEqual(cvDelta('19:00', '20:00'), '1 h cv.time_before');
    assert.strictEqual(cvDelta('19:30', '20:00'), '30 min cv.time_before');
    assert.strictEqual(cvDelta('18:4', '20:00'), 'cv.time_bad');
    assert.strictEqual(cvDelta('20:30', '20:00'), 'cv.time_after');
    assert.strictEqual(cvDelta('20:00', '20:00'), 'cv.time_after');
  });

  /* A malformed value writes NOTHING — the field goes red and the stored
     citation is left as it was, so closing the page mid-typo cannot lose a
     time the coach already set. The guard is one line and this pins it. */
  it('refuses to persist a malformed citation time', () => {
    const fn = BIND.slice(BIND.indexOf('function writeCallup'));
    assert.ok(/cvMins\(v\) == null\) return;/.test(fn.slice(0, 200)),
        'writeCallup no longer bails on an unparseable time');
  });
});

describe('Convocatòria — pissarres', () => {
  beforeEach(reset);

  it('offers only boards that are not linked yet', () => {
    STORE.fa_tactic_match_boards = JSON.stringify({1: [{boardId: 'b1', name: 'Pressió alta 4-3-3'}]});
    const html = build().renderConvocatoria();
    assert.ok(html.includes('data-cv-link="b2"'), 'an unlinked board is missing');
    assert.ok(!html.includes('data-cv-link="b1"'), 'a linked board is offered twice');
    assert.ok(html.includes('data-cv-unlink="id:b1"'), 'the linked board has no ✕');
  });

  it('says so when everything is linked', () => {
    STORE.fa_tactic_match_boards = JSON.stringify({1: LIBRARY.map((b) => ({boardId: b.id, name: b.name}))});
    const html = build().renderConvocatoria();
    assert.ok(html.includes('cv.all_linked'));
    assert.ok(!html.includes('data-cv-link='));
  });

  it('reads the frame count off the registry meta, not off a payload', () => {
    STORE.fa_tactic_match_boards = JSON.stringify({1: [{boardId: 'b1', name: 'x'}, {boardId: 'b2', name: 'y'}]});
    const html = build().renderConvocatoria();
    assert.ok(html.includes('4 cv.frames · cv.animated'), 'the animated board reads wrong');
    assert.ok(html.includes('1 cv.frame'), 'a single-frame board should not be plural');
    assert.ok(!/1 cv\.frame · cv\.animated/.test(html), 'one frame is not an animation');
  });

  /* ⚠ THE THUMBNAIL EXPANDS. The README asks for the real read-only board
     drawn at 34×24; a pitch that size is not readable and tbRoBoardHtml
     hydrates asynchronously, so the row keeps the designed hairline box and
     opens the real board beneath it on click. Deleting the boards outright
     would have cost the coach the review of what he attached. */
  it('keeps a way to see the real board', () => {
    assert.ok(/tbRoBoardHtml\(b, 'cvb'/.test(BIND),
        'the expand path no longer renders a real board');
    assert.ok(BIND.includes('hydrateRoBoards()'),
        'an expanded board would never fill in');
  });
});

describe('Convocatòria — enllaços de vídeo', () => {
  beforeEach(reset);

  /* This page had NO url validation at all, while the match-notes rows
     beside it have had `.mn-video-bad` for a refused scheme all along. */
  it('strikes through a link that is not http(s)', () => {
    STORE.fa_convocatoria_videos = JSON.stringify({1: [
      {title: 'a', url: 'https://youtu.be/x', comment: 'ok'},
      {title: 'b', url: 'javascript:alert(1)', comment: 'bad'}
    ]});
    const html = build().renderConvocatoria();
    assert.ok(html.includes('href="https://youtu.be/x"'), 'a good link lost its href');
    assert.ok(html.includes('mn-video-bad'), 'a javascript: url was not refused');
    assert.ok(!/href="javascript:/.test(html), 'a javascript: url reached an href');
  });

  it('refuses a bad url before it is stored', () => {
    assert.ok(/if \(!safeHttpUrl\(url\)\) \{ urlEl\.classList\.add\('cv-bad'\); return; \}/.test(BIND),
        'the add path no longer gates the url');
  });

  /* The Title input is gone; the stored `title` is not — the player-facing
     views use it as the link text, so a new row puts the URL there. */
  it('still writes a title, because the player views read one', () => {
    assert.ok(/title: url, url: url, comment:/.test(BIND),
        'new video rows would reach the player views with no link text');
  });
});

describe('Convocatòria — the footer', () => {
  beforeEach(reset);

  it('offers Envia on a draft', () => {
    const html = build().renderConvocatoria();
    assert.ok(html.includes('cv.send'));
    assert.ok(html.includes('cv.foot_draft'));
    assert.ok(!html.includes('data-cv-unsend'));
  });

  /* ⚠ UNSEND IS KEPT, and the design has no button for it — it flips the
     primary, the way the page did before. Retracting a published call-up is
     a real recovery path. `Buida-ho tot` is the one that went. */
  it('flips to Desenvia once sent and unchanged', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['p1']});
    STORE.fa_convocatoria_sent = JSON.stringify({1: {players: ['p1']}});
    const html = build().renderConvocatoria();
    assert.ok(html.includes('data-cv-unsend="1"'), 'a sent call-up cannot be retracted');
    assert.ok(html.includes('cv.unsend'));
    assert.ok(html.includes('cv.foot_sent'));
  });

  it('goes back to Envia while there are unsent changes', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['p1', 'p2']});
    STORE.fa_convocatoria_sent = JSON.stringify({1: {players: ['p1']}});
    const html = build().renderConvocatoria();
    assert.ok(!html.includes('data-cv-unsend'), 'a changed call-up must be re-sendable');
    assert.ok(html.includes('cv.foot_changes'));
  });

  it('has no clear-all button', () => {
    assert.ok(!/btn-conv-clear/.test(bare), 'Buida-ho tot came back');
  });
});

describe('Convocatòria — the delegate view', () => {
  beforeEach(() => { reset(); RO = true; });

  it('strips every write, and keeps the fixture picker', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['p1']});
    STORE.fa_convocatoria_videos = JSON.stringify({1: [{title: 'a', url: 'https://x.tv/a', comment: 'c'}]});
    STORE.fa_tactic_match_boards = JSON.stringify({1: [{boardId: 'b1', name: 'Pressió alta'}]});
    const html = build().renderConvocatoria();

    assert.ok(html.includes('[RO-BANNER]'), 'no view-only banner');
    ['data-cv-move', 'data-cv-unlink', 'data-cv-vrm', 'data-cv-link',
      'btn-conv-save', 'btn-conv-send', 'cv-vadd', 'id="cv-time"',
      'data-cv-kit'].forEach((frag) => {
      assert.ok(!html.includes(frag), 'a delegate can still ' + frag);
    });
    assert.ok(!/draggable="true"/.test(html), 'a delegate can still drag');

    /* The one control that stays live. Which fixture you are LOOKING at is
       view state, not a write, and a delegate reading the call-up has to be
       able to change it — this was true of the page before the redesign and
       is the easiest thing to lose by gating the whole page on `ro`. */
    assert.ok(html.includes('data-cv-menu="match"'),
        'the fixture picker was gated on read-only');
    assert.ok(html.includes('data-cv-match="1"'), 'no fixture to pick');
  });

  it('shows the chosen kit as a static swatch', () => {
    const html = build().renderConvocatoria();
    assert.ok(html.includes('[SHIRT:red:44]'), 'the chosen shirt is missing');
    assert.ok(!html.includes('[SHIRT:white:44]'), 'the alternatives are still offered');
  });

  /* Two things a delegate must not be shown, both of which the first cut
     got wrong: a grip beside every row (a control that is not there) and a
     citation group with no rule under it — the pills carry that rule for a
     coach, and a delegate has no pills, so the middle of the three columns
     was the only one with nothing on the shared baseline. */
  it('drops the drag grips and keeps the three baselines', () => {
    const html = build().renderConvocatoria();
    assert.ok(/class="cv-page cv-page-ro"/.test(html), 'the page is not marked read-only');
    assert.ok(/\.cv-page-ro \.cv-handle \{ display: none/.test(CVCSS),
        'the grips survive on a page nothing can be dragged on');
    assert.ok(html.includes('cv-time-ruled'), 'the citation value lost its rule');
    assert.ok(/\.cv-time-ruled \{[^}]*border-bottom: 1px solid #2D2926/.test(CVCSS),
        'cv-time-ruled draws no rule');
  });
});

/* ---------------------------------------------------------------------
   The binder, against a real DOM.
   Everything above tests the string builders, which cannot notice a
   selector that names nothing: `[data-cv-move]` and `.cv-act` would both
   render happily while the handler bound to neither. So the rendered page
   goes into jsdom and bindConvocatoria runs over it for real.
   --------------------------------------------------------------------- */
function wire(selectedId) {
  const api = build(selectedId);
  const dom = new JSDOM('<body><div id="app">' +
      api.renderConvocatoria() + '</div></body>');
  const {window} = dom;
  const bindSrc = BIND + '\n return bindConvocatoria;';
  let renders = 0;
  // eslint-disable-next-line no-new-func
  const bind = new Function(
      'document', 'window', 'navigator', 'setTimeout', 't', 'safeHttpUrl',
      'canEditPage', 'localStorage', 'convSelectedMatchId', 'renderPage',
      'getSession', 'getUsers', 'clubKits', 'cvMins', 'cvDelta',
      'tbFindLinked', 'tbSessionRef', 'tbRoBoardHtml', 'hydrateRoBoards',
      'TB', 'Push', '_currentSession', 'console',
      bindSrc)(
      window.document, window, window.navigator, () => {},
      (k) => k,
      (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : ''),
      () => !RO,
      {getItem: (k) => (k in STORE ? STORE[k] : null),
        setItem: (k, v) => { STORE[k] = v; }},
      selectedId === undefined ? 1 : selectedId,
      () => { renders++; },
      () => ({id: 'me'}),
      () => USERS,
      () => [{id: 'k1', label: '1a', shirt: 'red', shorts: 'black', socks: 'red'}],
      api.cvMins, api.cvDelta,
      (list, key) => list.find((b) => ('id:' + b.boardId) === key) || null,
      (entry) => ({boardId: entry.id, name: entry.name, tag: ''}),
      () => '[BOARD]',
      () => {},
      {ready: () => true, library: () => LIBRARY,
        meta: (id) => LIBRARY.find((b) => b.id === id) || null},
      {sendToPlayers: () => {}},
      {teamId: 'T1'},
      {warn: () => {}});
  /* ⚠ jsdom SWALLOWS an exception thrown inside a listener — it reports it
     on the window and carries on, so a handler that dies on a global the
     stubs forgot looks exactly like a handler that decided to do nothing.
     That is not hypothetical: `safeHttpUrl` was missing from the list above
     and the "a bad url is not stored" assertion passed for the wrong
     reason. Every wired test asserts `errors` is empty. */
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.error || e.message)));
  WIRED.push(errors);
  bind();
  return {window, doc: window.document, renders: () => renders, errors};
}
/* Collected per test and drained in afterEach, so a handler cannot die
   quietly in ANY of these cases without failing the one it died in. */
const WIRED = [];

/** Fire a real bubbling click on the first match for `sel`. */
function click(doc, sel) {
  const el = doc.querySelector(sel);
  assert.ok(el, 'nothing matches ' + sel);
  el.dispatchEvent(new doc.defaultView.MouseEvent('click', {bubbles: true}));
  return el;
}

describe('Convocatòria — the binder, wired to a real DOM', () => {
  beforeEach(() => { reset(); WIRED.length = 0; });
  afterEach(() => {
    const thrown = WIRED.flat();
    assert.deepStrictEqual(thrown, [],
        'a listener threw and jsdom swallowed it: ' + thrown.join(' | '));
  });

  it('binds without throwing', () => {
    assert.doesNotThrow(() => wire());
  });

  /* Every path that changes the squad goes through ONE place(): the glyph,
     the double-click, the tap and the drop. The old page had four separate
     copies of "push, or filter out", which is why reordering within
     Convocats could not be expressed at all. */
  it('the → glyph appends to the acta', () => {
    const {doc} = wire();
    click(doc, '[data-cv-move="p2"]');
    assert.deepStrictEqual(JSON.parse(STORE.fa_convocatoria)['1'], ['p2']);
  });

  it('the ✕ glyph removes without disturbing the rest of the order', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['p4', 'p1', 'p3']});
    const {doc} = wire();
    click(doc, '#cv-called [data-cv-move="p1"]');
    assert.deepStrictEqual(JSON.parse(STORE.fa_convocatoria)['1'], ['p4', 'p3']);
  });

  it('a double-click moves a player either way', () => {
    const {doc} = wire();
    const row = doc.querySelector('#cv-avail [data-id="p3"]');
    row.dispatchEvent(new doc.defaultView.MouseEvent('dblclick', {bubbles: true}));
    assert.deepStrictEqual(JSON.parse(STORE.fa_convocatoria)['1'], ['p3']);
  });

  /* THE feature. A drop ON a row inserts AT that row — one splice — which
     is what makes Convocats an order the coach controls rather than a set.
     jsdom has no drag, so the events are dispatched by hand; that is also
     exactly what the Android WebView does with an empty dataTransfer, which
     is why the drag id is held in a closure as well. */
  it('a drop on a row inserts at that position', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['p1', 'p2', 'p3', 'p4']});
    const {doc} = wire();
    const fire = (el, type) => el.dispatchEvent(
        new doc.defaultView.Event(type, {bubbles: true, cancelable: true}));
    fire(doc.querySelector('#cv-called [data-id="p4"]'), 'dragstart');
    fire(doc.querySelector('#cv-called [data-id="p2"]'), 'drop');
    assert.deepStrictEqual(JSON.parse(STORE.fa_convocatoria)['1'],
        ['p1', 'p4', 'p2', 'p3']);
  });

  it('a drop on the Disponibles column un-convokes', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['p1', 'p2']});
    const {doc} = wire();
    const fire = (el, type) => el.dispatchEvent(
        new doc.defaultView.Event(type, {bubbles: true, cancelable: true}));
    fire(doc.querySelector('#cv-called [data-id="p1"]'), 'dragstart');
    fire(doc.querySelector('#cv-avail'), 'drop');
    assert.deepStrictEqual(JSON.parse(STORE.fa_convocatoria)['1'], ['p2']);
  });

  it('opens one menu at a time and closes the others', () => {
    const {doc} = wire();
    const menuOf = (id) => doc.querySelector('[data-cv-menu="' + id + '"] .cv-menu-m');
    click(doc, '[data-cv-menu="match"] .cv-menu-t');
    assert.strictEqual(menuOf('match').hidden, false, 'the fixture menu did not open');
    click(doc, '[data-cv-menu="kit-shirtId"] .cv-menu-t');
    assert.strictEqual(menuOf('match').hidden, true, 'two menus are open at once');
    assert.strictEqual(menuOf('kit-shirtId').hidden, false);
    click(doc, '[data-cv-menu="kit-shirtId"] .cv-menu-t');
    assert.strictEqual(menuOf('kit-shirtId').hidden, true, 'the toggle does not close');
  });

  it('a malformed citation time is refused, and the good one survives', () => {
    const {doc} = wire();
    const el = doc.getElementById('cv-time');
    el.value = '18:4';
    el.dispatchEvent(new doc.defaultView.Event('input', {bubbles: true}));
    assert.ok(el.classList.contains('cv-bad'), 'the field is not flagged');
    assert.strictEqual(doc.getElementById('cv-time-delta').textContent, 'cv.time_bad');
    assert.strictEqual(JSON.parse(STORE.fa_convocatoria_callup)['1'], '18:45',
        'a typo overwrote the stored citation time');

    el.value = '18:30';
    el.dispatchEvent(new doc.defaultView.Event('input', {bubbles: true}));
    assert.ok(!el.classList.contains('cv-bad'));
    assert.strictEqual(JSON.parse(STORE.fa_convocatoria_callup)['1'], '18:30');
    assert.strictEqual(JSON.parse(STORE.fa_matches)[0].callupTime, '18:30',
        'the fixture the Partit page reads was not updated');
  });

  it('links and unlinks a board through the same ref shape as the editor', () => {
    const {doc} = wire();
    click(doc, '[data-cv-link="b1"]');
    assert.deepStrictEqual(JSON.parse(STORE.fa_tactic_match_boards)['1'],
        [{boardId: 'b1', name: 'Pressió alta 4-3-3', tag: ''}]);

    const second = wire();
    click(second.doc, '[data-cv-unlink="id:b1"]');
    assert.strictEqual(JSON.parse(STORE.fa_tactic_match_boards)['1'], undefined,
        'an empty board list should be deleted, not left as []');
  });

  it('refuses a video url that is not http(s), and keeps a good one', () => {
    const {doc} = wire();
    doc.getElementById('cv-vurl').value = 'javascript:alert(1)';
    click(doc, '#cv-vadd');
    assert.strictEqual(STORE.fa_convocatoria_videos, '{}', 'a javascript: url was stored');
    assert.ok(doc.getElementById('cv-vurl').classList.contains('cv-bad'));

    doc.getElementById('cv-vurl').value = 'https://youtu.be/x';
    doc.getElementById('cv-vnote').value = 'els seus córners';
    click(doc, '#cv-vadd');
    assert.deepStrictEqual(JSON.parse(STORE.fa_convocatoria_videos)['1'],
        [{title: 'https://youtu.be/x', url: 'https://youtu.be/x', comment: 'els seus córners'}]);
  });

  it('sends, and then unsends', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['p1', 'p2']});
    click(wire().doc, '#btn-conv-send');
    const sent = JSON.parse(STORE.fa_convocatoria_sent)['1'];
    assert.deepStrictEqual(sent.players, ['p1', 'p2']);
    assert.strictEqual(sent.shirtId, 'k1', 'the kit did not travel with the call-up');

    click(wire().doc, '#btn-conv-send');
    assert.strictEqual(JSON.parse(STORE.fa_convocatoria_sent)['1'], undefined,
        'the call-up could not be retracted');
  });

  it('will not send an empty acta', () => {
    click(wire().doc, '#btn-conv-send');
    assert.strictEqual(STORE.fa_convocatoria_sent, '{}');
  });

  /* THE XI FOLLOWS THE CALL-UP OUT. convSentEntry survived the redesign
     verbatim and this is the rule inside it that a re-save must not lose:
     a starter dropped from the squad must leave the line-up with it, or the
     entry claims twelve starters and the renderer draws eleven. */
  it('drops a starter who is no longer called up', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['p1']});
    STORE.fa_convocatoria_sent = JSON.stringify({1: {players: ['p1', 'p2'], startingXI: ['p1', 'p2']}});
    click(wire().doc, '#btn-conv-save');
    assert.deepStrictEqual(JSON.parse(STORE.fa_convocatoria_sent)['1'].startingXI, ['p1']);
  });

  /* The render strips the controls; the BINDER has to stop as well. A
     delegate's rows carry `draggable="false"`, which stops a real drag and
     stops nothing else — a synthetic drop, or a stylesheet that never
     loaded, would still reach a bound handler and write the acta. `if (ro)
     return` before every write binding is the guard, and this is what
     notices when it goes. */
  it('binds nothing that writes for a delegate', () => {
    RO = true;
    STORE.fa_convocatoria = JSON.stringify({1: ['p1']});
    const {doc} = wire();
    assert.strictEqual(doc.querySelector('[data-cv-move]'), null);

    const fire = (el, type) => el.dispatchEvent(
        new doc.defaultView.Event(type, {bubbles: true, cancelable: true}));
    fire(doc.querySelector('#cv-called [data-id="p1"]'), 'dragstart');
    fire(doc.querySelector('#cv-avail'), 'drop');
    assert.deepStrictEqual(JSON.parse(STORE.fa_convocatoria)['1'], ['p1'],
        'a delegate moved a player off the acta');

    // …but the fixture picker still opens.
    click(doc, '[data-cv-menu="match"] .cv-menu-t');
    assert.strictEqual(doc.querySelector('[data-cv-menu="match"] .cv-menu-m').hidden, false);
  });
});

describe('Convocatòria — the controls row', () => {
  beforeEach(reset);

  it('draws both crests and the full when-line', () => {
    const html = build().renderConvocatoria();
    assert.ok(html.includes('[CREST:US]') && html.includes('[CREST:THEM]'));
    assert.ok(html.includes('SHORT:2099-10-05 · 20:00 · mn.at_home · pt.jornada 3'),
        'the fixture line is not date · hora · Casa/Fora · Jornada');
  });

  it('drops the jornada from a friendly rather than reading undefined', () => {
    STORE.fa_matches = JSON.stringify([Object.assign({}, MATCH, {fcfJornada: null})]);
    const html = build().renderConvocatoria();
    assert.ok(!html.includes('pt.jornada'), 'a friendly claimed a matchday');
    assert.ok(html.includes('mn.at_home'), 'the rest of the line went with it');
  });

  it('draws the kit pieces at the designed 44px', () => {
    const html = build().renderConvocatoria();
    ['[SHIRT:red:44]', '[SHORTS:black:44]', '[SOCKS:red:44]']
        .forEach((s) => assert.ok(html.includes(s), 'missing ' + s));
  });

  it('falls back to the first kit when the draft names a deleted one', () => {
    STORE.fa_convocatoria_uniform = JSON.stringify({1: {shirtId: 'gone'}});
    const html = build().renderConvocatoria();
    assert.ok(html.includes('[SHIRT:red:44]'), 'a deleted kit blanked the toggle');
  });

  it('marks the pill that matches the stored citation time', () => {
    const html = build().renderConvocatoria();
    assert.ok(html.includes('class="cv-pill cv-pill-on" data-cv-time="18:45"'),
        '18:45 is stored and its pill is not marked');
  });
});

describe('Convocatòria — the fixture picker', () => {
  beforeEach(reset);

  const FIXTURES = [
    {id: 3, home: 'US', away: 'C', date: '2099-11-01', time: '12:30', status: 'upcoming', category: 'amateur'},
    {id: 1, home: 'US', away: 'A', date: '2099-10-05', time: '20:00', status: 'upcoming', category: 'amateur'},
    {id: 9, home: 'US', away: 'J', date: '2099-10-12', time: '10:00', status: 'upcoming', category: 'juvenil'},
    {id: 2, home: 'US', away: 'B', date: '2099-10-20', time: '18:30', status: 'upcoming', category: 'amateur'},
    // No kickoff AND no category — the shape a lead creates on Totes.
    {id: 7, home: 'US', away: 'X', status: 'upcoming'}
  ];
  const shown = (html) =>
    [...html.matchAll(/data-cv-match="(\d+)"/g)].map((m) => Number(m[1]));

  /* `fa_matches` is a blob in insertion order, so the list used to come back
     in whatever order the fixtures were created or imported. The one a coach
     wants is almost always the next one. */
  it('lists fixtures soonest first', () => {
    STORE.fa_matches = JSON.stringify(FIXTURES);
    VISIBLE_CATS = ['amateur', 'juvenil'];
    assert.deepStrictEqual(shown(build(1).renderConvocatoria()), [1, 9, 2, 3, 7]);
  });

  it('sorts a fixture with no kickoff LAST, not first', () => {
    // An empty date sorts before every real one as a string; the '9999'
    // sentinel is what stops a TBC fixture heading the list.
    STORE.fa_matches = JSON.stringify(FIXTURES);
    VISIBLE_CATS = ['amateur'];
    assert.strictEqual(shown(build(1).renderConvocatoria()).pop(), 7);
  });

  it('defaults to the soonest fixture, not the first stored', () => {
    STORE.fa_matches = JSON.stringify(FIXTURES);
    STORE.fa_convocatoria = '{}';
    VISIBLE_CATS = ['amateur'];
    const html = build(null).renderConvocatoria();
    assert.ok(html.includes('data-cv-match="1" class') ||
        /data-cv-match="1"[^>]*>/.test(html), 'fixture 1 is not offered');
    assert.ok(/cv-menu-o cv-menu-o-on" data-cv-match="1"/.test(html),
        'the default selection is not the soonest fixture');
  });

  /* `getCurrentCategory()` returns '' for "Totes", and its own doc comment
     says that means "all VISIBLE categories". The `!curCat ||` idiom every
     other page uses reads it as "all categories, full stop" — which for a
     coach holding two of the club's four offered him fixtures no squad of
     his can be convoked for. */
  it('offers only fixtures from the visible categories on Totes', () => {
    STORE.fa_matches = JSON.stringify(FIXTURES);
    VISIBLE_CATS = ['amateur'];
    const ids = shown(build(1).renderConvocatoria());
    assert.ok(!ids.includes(9), 'a juvenil fixture reached an amateur-only coach');
    assert.deepStrictEqual(ids, [1, 2, 3, 7]);
  });

  it('narrows to the chosen category when one is selected', () => {
    STORE.fa_matches = JSON.stringify(FIXTURES);
    VISIBLE_CATS = ['amateur', 'juvenil'];
    CUR_CAT = 'juvenil';
    assert.deepStrictEqual(shown(build(9).renderConvocatoria()), [9, 7]);
  });

  /* A fixture with no category belongs to no squad, and it is a shape the
     app still produces: a lead creating one on Totes stamps
     `category: getCurrentCategory()`, which is ''. Filtering it out would
     make those fixtures unreachable rather than merely unfiltered. */
  it('keeps an uncategorised fixture whatever the filter', () => {
    STORE.fa_matches = JSON.stringify(FIXTURES);
    VISIBLE_CATS = ['juvenil'];
    CUR_CAT = 'juvenil';
    assert.ok(shown(build(9).renderConvocatoria()).includes(7));
  });

  it('filters the player pool by the same rule', () => {
    STORE.fa_matches = JSON.stringify(FIXTURES);
    USERS = squad().map((p, i) => Object.assign({}, p,
        {category: i === 0 ? 'juvenil' : 'amateur'}));
    VISIBLE_CATS = ['amateur'];
    const html = build(1).renderConvocatoria();
    assert.ok(!html.includes('data-id="p1"'),
        'a juvenil player is convocable for a fixture the picker will not offer');
    assert.ok(html.includes('data-id="p2"'));
  });
});

describe('Convocatòria — the squad-letter filter', () => {
  beforeEach(() => {
    reset();
    CUR_CAT = 'amateur';
    VISIBLE_CATS = ['amateur', 'juvenil'];
    STORE.fa_matches = JSON.stringify([
      {id: 1, home: 'US', away: 'A', date: '2099-10-05', time: '20:00',
        status: 'upcoming', category: 'amateur', team: 'A'},
      {id: 2, home: 'US', away: 'B', date: '2099-10-06', time: '20:00',
        status: 'upcoming', category: 'amateur', team: 'B'},
      // No letter: belongs to every squad, the rule calInFilter encodes.
      {id: 3, home: 'US', away: 'C', date: '2099-10-07', time: '20:00',
        status: 'upcoming', category: 'amateur'}
    ]);
    USERS = [
      {id: 'a1', name: 'A One', roles: ['player'], playerNumber: '1', position: 'GK', team: 'A', category: 'amateur'},
      {id: 'b1', name: 'B One', roles: ['player'], playerNumber: '2', position: 'CB', team: 'B', category: 'amateur'},
      {id: 'n1', name: 'No Letter', roles: ['player'], playerNumber: '3', position: 'DM', category: 'amateur'},
      {id: 'j1', name: 'Juvenil One', roles: ['player'], playerNumber: '4', position: 'ST', team: 'A', category: 'juvenil'}
    ];
  });
  const shown = (html) =>
    [...html.matchAll(/data-cv-match="(\d+)"/g)].map((m) => Number(m[1]));

  it('offers every squad\'s fixture with no letter chosen', () => {
    assert.deepStrictEqual(shown(build(1).renderConvocatoria()), [1, 2, 3]);
  });

  it('narrows the fixtures to the chosen letter', () => {
    LETTER = 'B';
    assert.deepStrictEqual(shown(build(2).renderConvocatoria()), [2, 3],
        'a B fixture and the unassigned one, never the A fixture');
  });

  it('narrows Disponibles to the chosen letter', () => {
    LETTER = 'B';
    const ids = idsIn(build(2).renderConvocatoria(), 'cv-avail');
    assert.ok(ids.includes('b1'), 'the B player is missing');
    assert.ok(ids.includes('n1'), 'a player with no letter belongs to every squad');
    assert.ok(!ids.includes('a1'), 'the A player survived the B filter');
  });

  /* ⚠ THE RULE THIS FILTER MUST NOT BREAK. A filter is a way of looking;
     the acta is a decision already taken. A coach who narrows to B must not
     watch the players he convoked vanish from the sheet he is about to
     send — and the send reads `fa_convocatoria`, not the screen, so they
     would go out anyway. A list that disagrees with what it sends is worse
     than no list. */
  it('does NOT touch Convocats', () => {
    STORE.fa_convocatoria = JSON.stringify({2: ['a1', 'b1', 'n1']});
    LETTER = 'B';
    const html = build(2).renderConvocatoria();
    assert.deepStrictEqual(idsIn(html, 'cv-called'), ['a1', 'b1', 'n1'],
        'the filter reached the acta');
    // …and none of them come back in Disponibles as well.
    assert.deepStrictEqual(idsIn(html, 'cv-avail'), []);
  });

  /* The cross-category call-up is the case that makes the rule bite: a
     juvenil player convoked for an amateur fixture is legitimate, and the
     category filter must not drop him from the acta either. */
  it('keeps a convoked player from another category', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['j1', 'a1']});
    const html = build(1).renderConvocatoria();
    assert.deepStrictEqual(idsIn(html, 'cv-called'), ['j1', 'a1']);
    assert.ok(!idsIn(html, 'cv-avail').includes('j1'),
        'he is on the acta, so he is not also available');
  });

  it('badges the category on both sides once the acta crosses one', () => {
    // catSpan is computed over the RENDERED rows: a category that appears
    // in one column has to be drawn in the other.
    STORE.fa_convocatoria = JSON.stringify({1: ['j1']});
    const html = build(1).renderConvocatoria();
    assert.ok(html.includes('[CAT:juvenil]'), 'the convoked juvenil is unbadged');
    assert.ok(html.includes('[CAT:amateur]'), 'the amateur rows lost their badge');
  });

  /* Letters are per category and catBarLettersHtml draws no chips on Totes,
     so a filter left over from a previous category would hide rows with no
     control on screen to explain why. */
  it('ignores a stale letter when no category is chosen', () => {
    CUR_CAT = '';
    LETTER = 'B';
    const html = build(1).renderConvocatoria();
    assert.deepStrictEqual(shown(html), [1, 2, 3], 'a stale letter filtered Totes');
    assert.ok(idsIn(html, 'cv-avail').includes('a1'));
  });

  it('is drawn by the shared category-bar chips, not a second control', () => {
    assert.ok(/currentPage === 'convocatoria'\s*\?\s*catBarLettersHtml\(convTeamFilter, 'data-conv-letter'\)/
        .test(bare), 'the chips are not the ones the calendar and roster use');
    assert.ok(/convTeamFilter = btn\.dataset\.convLetter \|\| 'all';/.test(bare),
        'nothing writes the filter');
  });

  /* Every one of these is reset when the category changes, because a letter
     belongs to a category. Missing one is a filter that silently persists. */
  it('resets with the category, like the other three', () => {
    const i = bare.indexOf("var want = btn.dataset.cat || '';");
    const body = bare.slice(i, bare.indexOf('renderPage', i));
    ['medicalTeamFilter', 'rosterTeamFilter', 'calTeamFilter', 'convTeamFilter']
        .forEach((v) => assert.ok(new RegExp(v + " = 'all';").test(body),
            v + ' survives a category change'));
  });
});

describe('Convocatòria — the crest, out of its circle', () => {
  /* ⚠ NO CIRCLE ANYWHERE IN THE FIXTURE PICKER. A real crest is an <img>
     and never had one; the monogram that stands in for a club we have no
     badge for carries a disc EVERYWHERE ELSE, because lettering needs a
     ground. Here it does not — the design draws a plain rectangular slot,
     and a filled circle beside a bare crest makes the two clubs in one row
     read as two different kinds of thing. The ground stays, squared off. */
  it('squares off the monogram in the dropdown', () => {
    assert.ok(/\.cv-page \.cv-mt-row \.pt-crest-mono \{[^}]*border-radius: 0/.test(CVCSS),
        'the monogram is still a disc inside the fixture picker');
  });

  it('never paints a ground behind the real crest', () => {
    /* The <img> path takes `.pt-crest` alone. If the cv- block ever gave
       that class a background or a radius, a transparent federation PNG
       would sit on a shape the club did not design. */
    // Comments stripped, or the block's own banner — which explains all of
    // this in prose — is matched as a rule and fails on the word it uses.
    const rules = CVCSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const own = (rules.match(/^[^@{}]*\.pt-crest\b(?![-\w])[^{}]*\{[^}]*\}/gms) || []);
    own.forEach((rule) => {
      assert.ok(!/background|border-radius/.test(rule),
          'the cv- block paints something behind a real crest: ' + rule.trim());
    });
  });
});

describe('Convocatòria — the fitness status', () => {
  beforeEach(reset);

  /* Added after the first cut shipped without it. It is NOT a second opinion
     about the availability text beside it: that column says whether he is
     playable and is driven by an answer the player gave, this one says how
     well he is loaded. Both resolve `deriveFitnessStatus`, through the
     SHARED playerStatusHtml — the same path the New Training squad list
     uses, which is what stops the two screens disagreeing about "doubt". */
  it('renders through the shared playerStatusHtml, with the context', () => {
    FITNESS.p1 = 'injured';
    FITNESS.p3 = 'doubt';
    const html = build().renderConvocatoria();
    assert.ok(html.includes('[FIT:injured:ctx]'), 'the injured glyph is missing');
    assert.ok(html.includes('[FIT:doubt:ctx]'), 'the doubt glyph is missing');
    assert.ok(html.includes('[FIT:fit:ctx]'), 'a fit player gets no glyph');
    assert.ok(!html.includes('NOCTX'),
        'the fitness context is rebuilt per row instead of once per render');
  });

  it('shows it in both columns', () => {
    STORE.fa_convocatoria = JSON.stringify({1: ['p1']});
    const html = build().renderConvocatoria();
    const called = html.slice(html.indexOf('id="cv-called"'));
    assert.ok(called.includes('[FIT:'), 'the called-up rows lost the glyph');
    assert.strictEqual((html.match(/\[FIT:/g) || []).length, 4,
        'one glyph per player, in whichever column he is in');
  });

  it('is styled in the paper palette, not the roster pastels', () => {
    assert.ok(/\.cv-page \.roster-status-icon \{[^}]*width: 22px/.test(CVCSS),
        'the 28px roster disc leaks into a hairline row');
    assert.ok(/\.cv-page \.roster-status-injured \{ background: #F2D2CE/.test(CVCSS));
    assert.ok(/\.cv-page \.readiness-score \{[^}]*font-size: 13px/.test(CVCSS));
  });

  it('drops the readiness number on a phone and keeps the glyph', () => {
    const mq = CVCSS.slice(CVCSS.indexOf('@media (max-width: 900px)'));
    assert.ok(/\.cv-fit \.readiness-score \{ display: none/.test(mq),
        'the readiness figure survives on a row with no room for it');
    assert.ok(!/\.cv-fit \{ display: none/.test(mq),
        'the medical glyph is what a coach scans a phone row for');
  });
});

describe('Convocatòria — one dropdown, five menus', () => {
  beforeEach(reset);

  /* `stdSelect` was the first instinct and cannot serve: it renders text
     labels only, and two of these toggles carry a 40px crest pair and a
     44px kit swatch. One builder and one delegated handler is what keeps a
     fifth near-identical dropdown from being written — the mistake this
     codebase has already made once with four of them. */
  it('builds every menu with cvMenu', () => {
    STORE.fa_tactic_match_boards = JSON.stringify({1: []});
    const html = build().renderConvocatoria();
    ['match', 'kit-shirtId', 'kit-shortsId', 'kit-socksId']
        .forEach((id) => assert.ok(html.includes('data-cv-menu="' + id + '"'),
            'no menu for ' + id));
    assert.ok(html.includes('data-cv-menu="boards"'), 'the board picker is not a menu');
    assert.strictEqual((html.match(/class="cv-menu-m/g) || []).length, 5,
        'there should be exactly five menus on this page');
  });

  it('starts every menu closed', () => {
    const html = build().renderConvocatoria();
    const menus = html.match(/<div class="cv-menu-m[^>]*>/g) || [];
    menus.forEach((m) => assert.ok(m.includes('hidden'), 'a menu renders open: ' + m));
  });

  /* bindConvocatoria runs after EVERY render and this page re-renders on
     every drop, so a document listener added unguarded would be added once
     per move. The flag has to be the condition, not merely present. */
  it('binds the document closer only once', () => {
    assert.ok(/if \(!document\._cvDocClose\) \{\s*document\._cvDocClose = true;/.test(BIND),
        'the outside-click closer would stack a listener on every re-render');
  });
});

describe('Convocatòria — the paper idiom', () => {
  it('is scoped: every rule sits under .cv-page or a cv- class', () => {
    const selectors = CVCSS.replace(/\/\*[\s\S]*?\*\//g, '')
        .split('}').map((b) => b.split('{')[0].trim())
        .filter((s) => s && !s.startsWith('@'));
    selectors.forEach((sel) => {
      sel.split(',').map((s) => s.trim()).filter(Boolean).forEach((one) => {
        assert.ok(/(^|\s|\.)cv-/.test(one), 'unscoped selector in the cv- block: ' + one);
      });
    });
  });

  /* The three families this page BORROWS — .conv-pos-circle from
     posCirclesHtmlGlobal, .cat-badge and .pt-crest — are used by other
     pages at other sizes. Overriding them unscoped would resize the
     Plantilla table and the Partit scoreboard from here. */
  it('scopes the borrowed families under .cv-page', () => {
    ['.conv-pos-circle', '.cat-badge', '.pt-crest'].forEach((fam) => {
      const re = new RegExp('^[^@{}]*' + fam.replace('.', '\\.') + '[^{}]*\\{', 'gm');
      (CVCSS.match(re) || []).forEach((sel) => {
        assert.ok(sel.includes('.cv-'),
            'the cv- block reaches ' + fam + ' outside this page: ' + sel.trim());
      });
    });
  });

  it('has no cards: no shadow but the insertion line, no radius but the discs', () => {
    const rules = CVCSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const shadows = rules.match(/box-shadow:[^;]+;/g) || [];
    assert.deepStrictEqual(shadows, ['box-shadow: inset 0 2px 0 0 #BD162C;'],
        'the only shadow on this page is the drop-insertion line');
    const radii = [...new Set((rules.match(/border-radius:\s*([^;]+);/g) || [])
        .map((r) => r.split(':')[1].trim().replace(';', '')))].sort();
    /* `50%` is the team circle and the position discs; `0` is the crest
       monogram having its disc taken OFF, which is the opposite of a card
       creeping in. Any other value is one. */
    assert.deepStrictEqual(radii, ['0', '50%'],
        'the only rounded things here are the team circle and the position discs');
  });

  it('stacks the two columns on a phone', () => {
    const mq = CVCSS.slice(CVCSS.indexOf('@media (max-width: 900px)'));
    assert.ok(mq.length > 100, 'the narrow block is missing');
    assert.ok(/\.cv-lists \{[^}]*flex-direction: column/.test(mq),
        'the lists do not stack below 900px');
    assert.ok(/\.cv-handle \{ display: none/.test(mq),
        'the drag handle survives on a phone, where there is no drag');
  });

  /* Below 900px the handle is gone and a TAP is the move. Bound off
     `ontouchstart` rather than a width query, so a touchscreen laptop gets
     both the drag and the tap. */
  it('keeps tap-to-move on touch devices', () => {
    assert.ok(/'ontouchstart' in window \|\| navigator\.maxTouchPoints > 0/.test(BIND),
        'the touch path is gone; a phone would have no way to convoke');
  });
});

describe('Convocatòria — the classes are cv-, not conv-', () => {
  /* ⚠ THE ONE DEPARTURE THE README ARGUES AGAINST. `.conv-player`,
     `.conv-pos-circles`, `.conv-team-circle`, `.conv-name-wrap`,
     `.conv-status`, `.conv-count` and `.conv-remove` are used by six OTHER
     surfaces — the new-training squad list, Les meves estadístiques, the
     season-history rows, the standings team grid, the matchday sent-dot and
     the player activity tags. Repainting them to the paper language would
     silently repaint five pages nobody asked about. */
  it('leaves the shared conv- families alone', () => {
    const shared = ['conv-player', 'conv-name-wrap', 'conv-status',
      'conv-count', 'conv-remove', 'conv-team-circle'];
    shared.forEach((cls) => {
      assert.ok(!CVCSS.includes('.' + cls),
          'the cv- block restyles ' + cls + ', which five other pages use');
    });
  });

  it('still uses the shared position discs, at its own size', () => {
    const html = build().renderConvocatoria();
    assert.ok(html.includes('[DISC:GK]'), 'the discs are no longer posCirclesHtmlGlobal');
    assert.ok(/\.cv-page \.conv-pos-circle \{[^}]*width: 24px/.test(CVCSS),
        'the 24px override is missing or unscoped');
  });
});
