/* Partit — the match detail screen, redesigned (v212).
 *
 * The page is one paper surface in horizontal bands, built by the `pt*`
 * helpers in js/app.js. Those helpers are pure string builders over
 * localStorage and a handful of shared formatters, so most of this suite
 * runs them FOR REAL through `new Function` over stubs. The band layout
 * itself — which column sits where, what stacks below 1100px — is geometry
 * and is pinned as source and CSS properties instead, because the
 * alternative is a browser.
 *
 * ⚠ TWO DEPARTURES FROM THE HANDOFF, both deliberate and both recorded in
 * CONTEXT.md:
 *
 *   1. The classes are `pt-`, not the `md-` the design asks for. `md-`
 *      already names the matchday cards, the referee record, the kit cells
 *      and the calendar datepicker across five clusters of css/style.css.
 *
 *   2. The Convocats rows carry NO per-player marks strip. The design's
 *      block is star · dorsal · name · discs, and Esdeveniments now sits
 *      beside it in the same band rather than far below it. The rule that
 *      used to pin the old behaviour lived in match-lineup.test.js and
 *      says there what replaced it.
 *
 * The one rule worth breaking the build over is in "a player never sees the
 * eleven before kick-off". It is asserted here against real output and
 * again in match-lineup.test.js against the source, because it is the only
 * thing on this page that leaks something if it is got wrong.
 *
 * `npm run test:partit`, or as part of test:unit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');
const {readCss} = require('./read-css');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const css = readCss();
/* Comments stripped. Prose explaining a class is not a use of it, and this
   block is heavily commented — the banner alone names `pt-` half a dozen
   times while explaining why it is not `md-`. */
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const bareCss = css.replace(/\/\*[\s\S]*?\*\//g, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/* From the first builder in the block to the renderer that composes them.
   The start marker is `ptOurSide`'s doc comment and not `ptHead`'s, because
   ptOurSide sits above it and the helpers below call it — slicing from
   ptHead left the block referring to a function it did not contain, and
   every test in the file died at load with a bare ReferenceError. */
const BLOCK = grab('  /**\n   * Which side of this fixture is US',
    '  function renderMatchDetail()');

const sanitize = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* The REAL name resolvers, sliced in rather than stubbed.
   ⚠ They were stubbed first, and the stub returned "Núm. 9" where the
   shipped function returns "#9" — so an assertion about the rival's name
   was checking the stub, not the app. They are eight lines of pure string
   work with a documented fallback ladder; there is no reason to have a
   second opinion about them in here. */
const NAMES_API = (() => {
  const code = grab('  function resolveEventName', '  function getEventIcon');
  // eslint-disable-next-line no-new-func
  return new Function('sanitize',
      code + '\n return {resolveEventName, getEventPlayerName};')(sanitize);
})();

/* The stubs stand in for the shared formatters, and each one returns
   something DISTINCTIVE rather than '' — a stub that returns the empty
   string makes "the block rendered nothing" and "the block rendered the
   stub" indistinguishable, which is how a renderer under test passes while
   emitting nothing at all. */
let LEAGUE = {};
let STORE = {};
let USERS = [];
let XI = [];
let FIRST_LEG = null;
let MARKS = null;
let MINUTES = {};
let OUTCOME = 'win';
let LEG_NOTE = null;

function build() {
  // eslint-disable-next-line no-new-func
  return new Function(
      't', 'sanitize', 'isOurTeam', 'clubBadgeUrl', 'safeHttpUrl', 'opponentOf',
      'getClubName', '_leagueCache', 'leaguePosLabel', '_lang', 'kitIconsHtml',
      'calcMatchScore', 'CATEGORY_LABELS', 'tDateLong', 'locationHtml', 'getUsers',
      'getStartingXI', 'posRankGlobal', 'posCirclesHtmlGlobal', 'localStorage',
      'tbRoBoardHtml',
      'yellowOrdinals', 'parseEventMinute', 'formatEventMinute', 'getEventIcon',
      'getEventPlayerName', 'resolveEventName', 'stdSelect',
      'mnLinkedFirstLeg', 'matchPlayerMarks', 'matchMarksHtml',
      'playerMatchMinutesKnown', 'mnOutcome', 'mnSentBoards', 'mnSentVideos',
      'mnMediaColHtml', 'MN', 'MN_BRIEF_COLLAPSED', 'tDateShort',
      'getMatchEvents', 'fcfKitPieces', 'fcfShirtSvg', 'shortsSvg', 'kitSockSvg',
      BLOCK + '\n return {ptHead, ptCrestHtml, ptRivalStanding, ptFactHtml,' +
        ' ptFactsHtml, ptScoreboardHtml, ptCallupHtml, ptBoardsHtml,' +
        ' ptEventTypes, ptSecondField, ptEventDetail, ptTimelineHtml,' +
        ' ptEventName, ptOurSide, ptRivalRow, ptFormRunHtml,' +
        ' ptAnadaHtml, ptFormation, ptLegRowHtml,' +
        ' ptEventFormHtml, setForm: function (f) { _evForm = f; }};')(
      (k) => k,
      sanitize,
      (name) => name === 'US',
      () => 'https://cdn/us.png',
      (u) => u,
      (m) => (m.home === 'US' ? m.away : m.home),
      () => 'US',
      LEAGUE,
      (n) => (n > 0 ? n + 'X' : ''),
      'ca',
      // Echoes the size it is given, so a test can assert one was passed.
      (pieces, o) => '[KITS:' + ((o && o.size) || 'DEFAULT') + ']',
      (evs) => ({home: evs.filter((e) => e.side === 'home').length,
        away: evs.filter((e) => e.side === 'away').length}),
      {amateur: 'Amateur'},
      (d) => 'LONG:' + d,
      () => '[PLACE]',
      () => USERS,
      () => XI,
      (p) => (p.rank || 0),
      (p) => '[DISC:' + (p.position || '') + ']',
      {getItem: (k) => (k in STORE ? STORE[k] : null)},
      // Escapes, like the real tbRoBoardHtml — a stub that does not turns
      // "the name is escaped" into a test of the stub.
      (b) => '[BOARD:' + sanitize(b.name) + ']',
      // yellowOrdinals — a real Map, so `.get(ev)` behaves as it does live.
      () => new Map(),
      (v) => parseInt(String(v || '0'), 10) || 0,
      (v) => (v ? v + "'" : ''),
      (ev) => '[ICON:' + ev.type + ']',
      NAMES_API.getEventPlayerName,
      NAMES_API.resolveEventName,
      /* Carries `cls` as well as kind/value/count. It did not, and a test
         asserting the menu is viewport-aware (`.std-sel-esc`) then failed
         against a stub that had thrown the class away rather than against
         the code. A stub that drops an argument cannot answer questions
         about that argument. */
      (o) => '[SEL:' + o.kind + ':' + o.value + ':' +
        (o.options || []).length + ':' + (o.cls || '') + ']',
      () => FIRST_LEG,
      () => MARKS,
      (mk) => (mk ? '[MARKS]' : ''),
      (uid) => (uid in MINUTES ? MINUTES[uid] : null),
      () => OUTCOME,
      () => [],
      () => [],
      (title) => '[MEDIA:' + title + ']',
      {get: () => LEG_NOTE, PHASES: ['pre', 'live', 'post']},
      'fa_mn_brief_collapsed',
      (d) => 'SHORT:' + d,
      (id) => (JSON.parse(STORE.fa_match_events || '{}')[id] || []),
      // The rival's kit, from the FCF string. `null` for a kit we do not have.
      (kit) => (kit ? {c1: '#fff', shorts: '#000', socks: '#fff'} : null),
      // Each echoes the SIZE it is given, so a test can assert it was passed.
      (p, badge, size) => '[FSHIRT:' + size + ']',
      (fill, size) => '[SHORTS:' + size + ']',
      (fill, size) => '[SOCKS:' + size + ']');
}

let API = build();

/* ⚠ NOT a root-level `beforeEach`. A hook at the top level of a file is a
   mocha ROOT hook: it runs before every test in the whole `test:unit` run,
   including std-select.test.js, which drives real jsdom and has a 2s
   timeout. Called from inside each describe instead. */
function reset() {
  LEAGUE = {}; STORE = {}; USERS = []; XI = [];
  FIRST_LEG = null; MARKS = null; MINUTES = {}; OUTCOME = 'win'; LEG_NOTE = null;
  API = build();
}

const MATCH = {id: 7, home: 'US', away: 'Sauleda, A.D.', date: '2026-09-02',
  time: '20:00', category: 'amateur', team: 'A'};

/* Four called-up players, deliberately NOT in dorsal order in the stored
   list — the flat player view has to sort them, and a fixture already in
   order would let a missing sort pass. */
const SQUAD = [
  {id: 'p1', name: 'Roc Amat', playerNumber: '7', position: 'RW', team: 'A', rank: 4},
  {id: 'p2', name: 'Guillem Roca', playerNumber: '1', position: 'GK', team: 'A', rank: 1},
  {id: 'p3', name: 'Marc Vidal', playerNumber: '5', position: 'CB', team: 'A', rank: 2},
  {id: 'p4', name: 'Nil Bosch', playerNumber: '14', position: 'DM', team: 'B', rank: 3}
];

function ctx(over) {
  return Object.assign({
    convSent: true, sentPlayers: ['p1', 'p2', 'p3', 'p4'], sentPieces: null,
    callupTime: '18:45', isStaff: false, isPast: false, isPlayerViewer: true,
    sessionId: 'p2', kitLabel: ''
  }, over || {});
}

describe('ptCrestHtml — a crest, or something in its place', () => {
  beforeEach(reset);

  it('draws our own crest from the club config', () => {
    const html = API.ptCrestHtml(MATCH, 'home');
    assert.ok(/<img[^>]+src="https:\/\/cdn\/us\.png"/.test(html), html);
    assert.ok(/onerror=/.test(html),
        'files.fcf.cat 404s on its own schedule; a broken crest must hide');
  });

  it('falls back to a MONOGRAM, not to nothing', () => {
    /* matchSideBadgeHtml returns '' with no badge, which is right for a
       fixture row and wrong for a 64px slot: the gap reads as a broken
       image rather than as a club we have no crest for. */
    const html = API.ptCrestHtml(MATCH, 'away');
    assert.ok(/pt-crest-mono/.test(html), html);
    assert.ok(/>SA</.test(html), 'two initials of "Sauleda, A.D." — got ' + html);
    assert.ok(!/<img/.test(html), 'no image element without a URL');
  });

  it('uses the rival badge when the fixture carries one', () => {
    const html = API.ptCrestHtml(
        Object.assign({}, MATCH, {opponentBadge: 'https://cdn/them.png'}), 'away');
    assert.ok(/src="https:\/\/cdn\/them\.png"/.test(html), html);
  });

  it('escapes a club name before putting it in the monogram', () => {
    const html = API.ptCrestHtml({home: 'US', away: '<script>x</script> Bad'}, 'away');
    assert.ok(!/<script>/.test(html), html);
  });

  it('survives a fixture with no name on that side', () => {
    const html = API.ptCrestHtml({home: 'US', away: ''}, 'away');
    assert.ok(/pt-crest-mono/.test(html), 'still a disc, just an empty one');
  });
});

describe('ptScoreboardHtml — the score, or the kick-off', () => {
  beforeEach(reset);

  it('shows the score once there is a result', () => {
    const html = API.ptScoreboardHtml(MATCH,
        [{side: 'home'}, {side: 'home'}, {side: 'away'}], true);
    assert.ok(/class="pt-score">2 – 1</.test(html), html);
    assert.ok(!/pt-kickoff/.test(html), 'the kick-off time is not also shown');
  });

  it('shows the KICK-OFF before there is one — never 0 – 0', () => {
    /* A zero-zero the app invented is worse than no score at all: it reads
       as a result, and there is nothing on the page to say otherwise. */
    const html = API.ptScoreboardHtml(MATCH, [], false);
    assert.ok(/class="pt-kickoff">20:00</.test(html), html);
    assert.ok(!/pt-score/.test(html), html);
    assert.ok(!/0 – 0/.test(html), html);
  });

  it('has NO live badge — the score carries the state', () => {
    /* Nothing here knows the match kicked off, only that its clock time
       passed. A badge saying "EN JOC" would be a claim the app cannot back. */
    const html = API.ptScoreboardHtml(MATCH, [{side: 'home'}], true);
    assert.ok(!/live|en joc|EN JOC/i.test(html), html);
  });

  it('names the jornada when the fixture came from the federation', () => {
    const html = API.ptScoreboardHtml(
        Object.assign({}, MATCH, {fcfJornada: 4}), [], false);
    assert.ok(/pt-sb-eyebrow/.test(html) && /pt\.jornada 4/.test(html), html);
    assert.ok(/Amateur/.test(html), 'and the squad label stands in for the division');
  });

  it('omits the eyebrow entirely for a friendly', () => {
    // Rather than "Jornada undefined", which is what a template would give.
    const html = API.ptScoreboardHtml({id: 1, home: 'US', away: 'X', time: '12:00'},
        [], false);
    assert.ok(!/pt-sb-eyebrow/.test(html), html);
  });

  it('escapes both team names', () => {
    const html = API.ptScoreboardHtml(
        {id: 1, home: 'US', away: '<b>X</b>', time: '1'}, [], false);
    assert.ok(!/<b>/.test(html), html);
  });
});

describe('ptCallupHtml — a player never sees the eleven before kick-off', () => {
  beforeEach(reset);

  it('gives a player a flat list, locked, in DORSAL order', () => {
    USERS = SQUAD;
    XI = ['p2', 'p3'];
    const html = API.ptCallupHtml(MATCH, ctx());

    assert.ok(/pt\.xi_locked/.test(html), 'the promise about when must be there');
    assert.ok(!/pt-cu-group/.test(html), 'no Titulars/Banqueta heading');
    assert.ok(!/pt-star/.test(html), 'no star, on or off');
    assert.ok(!/pt-starters/.test(html), 'and no Titulars n/11 counter');

    const order = (html.match(/class="pt-dorsal">(\d+)</g) || [])
        .map((s) => Number(s.replace(/\D/g, '')));
    assert.deepStrictEqual(order, [1, 5, 7, 14], 'dorsal order, not the stored order');
  });

  it('leaks NOTHING about who starts — not even a class', () => {
    /* The strongest form of the rule: two players are in the XI and two
       are not, and the rendered string must not distinguish them anywhere. */
    USERS = SQUAD;
    XI = ['p2', 'p3'];
    const locked = API.ptCallupHtml(MATCH, ctx());
    /* Compare the row CLASS ATTRIBUTES, with the viewer's own-row highlight
       taken out — that one legitimately differs, and it is keyed on the
       session, not on the eleven. What must not vary is anything else. */
    const classes = (locked.match(/<div class="pt-cu-row[^"]*"/g) || [])
        .map((s) => s.replace(' pt-row-mine', ''));
    assert.strictEqual(classes.length, 4, locked);
    assert.deepStrictEqual([...new Set(classes)], ['<div class="pt-cu-row"'],
        'a starter\'s row is distinguishable from a substitute\'s');
    // And no star markup at all, lit or unlit, to read the eleven off.
    assert.ok(!/pt-star/.test(locked), locked);
  });

  it('flips to the grouped view at kick-off', () => {
    USERS = SQUAD;
    XI = ['p2', 'p3'];
    const html = API.ptCallupHtml(MATCH, ctx({isPast: true}));
    assert.ok(!/pt\.xi_locked/.test(html), 'the lock line is gone');
    assert.ok(/pt\.titulars/.test(html) && /pt\.bench/.test(html), html);
    assert.ok(!/pt-star/.test(html), 'but a player still cannot edit it');
  });

  it('gives staff the stars and the counter, before kick-off too', () => {
    USERS = SQUAD;
    XI = ['p2', 'p3'];
    const html = API.ptCallupHtml(MATCH, ctx({isStaff: true, isPlayerViewer: false}));
    assert.ok(/pt\.titulars/.test(html), 'staff see the split immediately');
    assert.ok(!/pt\.xi_locked/.test(html), html);
    /* `class="pt-star` is a PREFIX of `class="pt-starters`, so the loose
       pattern counted the Titulars n/11 chip as a fifth star. */
    assert.strictEqual((html.match(/class="pt-star["\s]/g) || []).length, 4,
        'one star per row');
    assert.strictEqual((html.match(/pt-star-on/g) || []).length, 2,
        'lit for the two in the XI');
    assert.ok(/pt-starters-off/.test(html), '2 of 11 is not eleven');
  });

  it('turns the counter green at exactly eleven', () => {
    USERS = SQUAD;
    XI = ['p1', 'p2', 'p3', 'p4', 'x5', 'x6', 'x7', 'x8', 'x9', 'x10', 'x11'];
    const html = API.ptCallupHtml(MATCH, ctx({isStaff: true}));
    assert.ok(/pt-starters-ok/.test(html), html);
    assert.ok(/11 \/ 11/.test(html), html);
  });

  it('does NOT draw a ghost starter who is no longer called up', () => {
    /* Entries written before convSentEntry() filtered the XI on save can
       still name a player who has since been dropped. Reading the groups
       off the XI would render him as a row with no player behind it. */
    USERS = SQUAD;
    XI = ['p2', 'gone'];
    const html = API.ptCallupHtml(MATCH, ctx({isStaff: true}));
    assert.strictEqual((html.match(/pt-cu-row/g) || []).length, 4,
        'four called up, four rows — the eleven does not add a fifth');
    assert.ok(!/gone/.test(html), html);
  });

  it('marks the viewer\'s own row, and only theirs', () => {
    USERS = SQUAD;
    const html = API.ptCallupHtml(MATCH, ctx({sessionId: 'p2'}));
    assert.strictEqual((html.match(/pt-row-mine/g) || []).length, 1, html);
  });

  it('does not highlight a coach\'s row — he is not on his own call-up', () => {
    USERS = SQUAD;
    const html = API.ptCallupHtml(MATCH,
        ctx({isStaff: true, isPlayerViewer: false, sessionId: 'p2'}));
    assert.ok(!/pt-row-mine/.test(html), html);
  });

  it('says the call-up has not been sent rather than rendering an empty list', () => {
    /* A broken state and an empty one must not look alike. */
    const html = API.ptCallupHtml(MATCH, ctx({convSent: false, sentPlayers: []}));
    assert.ok(/pt\.no_callup/.test(html), html);
    assert.ok(!/pt-cu-row/.test(html), html);
  });

  it('says the same when every called-up id has no user behind it', () => {
    USERS = [];
    const html = API.ptCallupHtml(MATCH, ctx());
    assert.ok(/pt\.no_callup/.test(html), html);
  });

  it('carries the dorsal, the squad letter and the position discs', () => {
    USERS = SQUAD;
    const html = API.ptCallupHtml(MATCH, ctx());
    assert.ok(/pt-squad">B</.test(html), 'Nil Bosch is squad B');
    assert.ok(/\[DISC:GK\]/.test(html), 'discs come from posCirclesHtmlGlobal');
  });

  it('sorts a player with no dorsal to the end, not to the front', () => {
    // parseInt('') is NaN, and NaN comparisons make a sort silently random.
    USERS = [{id: 'p1', name: 'No Number', playerNumber: ''},
      {id: 'p2', name: 'Nine', playerNumber: '9'}];
    const html = API.ptCallupHtml(MATCH, ctx({sentPlayers: ['p1', 'p2']}));
    assert.ok(html.indexOf('Nine') < html.indexOf('No Number'), html);
  });

  it('escapes a player name', () => {
    USERS = [{id: 'p1', name: '<img src=x>', playerNumber: '9'}];
    const html = API.ptCallupHtml(MATCH, ctx({sentPlayers: ['p1']}));
    assert.ok(!/<img src=x>/.test(html), html);
  });
});

describe('ptRivalStanding — position and points, or nothing', () => {
  beforeEach(reset);

  it('matches on the federation id when the fixture has one', () => {
    LEAGUE['league-amateur-A'] = [
      {teamId: '99', rawName: 'Someone Else', pos: 1, pts: 50},
      {teamId: '42', rawName: 'Sauleda, A.D.', pos: 4, pts: 41}
    ];
    API = build();
    const s = API.ptRivalStanding(Object.assign({}, MATCH, {opponentTeamId: '42'}));
    assert.strictEqual(s, '4X · 41 pt.pts');
  });

  it('does NOT fall back to the name once the fixture has an id', () => {
    /* An id is a claim of certainty. If it matches nothing in the group the
       honest answer is the frozen position, not a name that looks similar. */
    LEAGUE['league-amateur-A'] = [{teamId: '99', rawName: 'Sauleda, A.D.', pos: 4, pts: 41}];
    API = build();
    const s = API.ptRivalStanding(
        Object.assign({}, MATCH, {opponentTeamId: '42', opponentPos: 7}));
    assert.strictEqual(s, '7X', 'the frozen position, with no points');
  });

  it('matches on the exact name when there is no id', () => {
    LEAGUE['league-amateur-A'] = [{teamId: '', rawName: 'Sauleda, A.D.', pos: 4, pts: 41}];
    API = build();
    assert.strictEqual(API.ptRivalStanding(MATCH), '4X · 41 pt.pts');
  });

  it('falls back to the position frozen on the fixture', () => {
    assert.strictEqual(API.ptRivalStanding(
        Object.assign({}, MATCH, {opponentPos: 4})), '4X');
  });

  it('returns nothing at all when there is no position anywhere', () => {
    assert.strictEqual(API.ptRivalStanding(MATCH), '');
  });

  it('is not confused by a group cached for a different squad', () => {
    LEAGUE['league-amateur-B'] = [{teamId: '', rawName: 'Sauleda, A.D.', pos: 4, pts: 41}];
    API = build();
    assert.strictEqual(API.ptRivalStanding(MATCH), '');
  });
});

describe('ptFormRunHtml — the rival\'s last five', () => {
  beforeEach(reset);

  const FORM = [
    {res: 'W', date: '2026-05-16', label: 'A 2–0 B'},
    {res: 'L', date: '2026-05-09', label: 'B 1–0 A'},
    {res: 'D', date: '2026-05-02', label: 'A 1–1 C'}
  ];

  it('draws one square per result, in the order given', () => {
    const html = API.ptFormRunHtml(FORM);
    const classes = (html.match(/pt-form-[wdl]/g) || []);
    assert.deepStrictEqual(classes, ['pt-form-w', 'pt-form-l', 'pt-form-d'],
        'the run must not be re-sorted — most recent is first: ' + html);
  });

  it('⚠ renders NOTHING at all for an empty run', () => {
    /* Pre-season every team's form is []. Five blank squares would read as
       a broken feed; a season that has not started and a proxy that is down
       must not look alike. */
    assert.strictEqual(API.ptFormRunHtml([]), '');
    assert.strictEqual(API.ptFormRunHtml(undefined), '');
    assert.strictEqual(API.ptFormRunHtml(null), '');
  });

  it('carries the fixture in a title, and escapes it', () => {
    const html = API.ptFormRunHtml(
        [{res: 'W', date: '2026-05-16', label: '<b>A</b> 2–0 B'}]);
    assert.ok(/title="2026-05-16 · /.test(html), html);
    assert.ok(!/<b>A<\/b>/.test(html), html);
  });

  it('labels each square through t(), not a hardcoded letter', () => {
    // "P" is the letter for a WIN in English; the run is translated.
    const html = API.ptFormRunHtml(FORM);
    assert.ok(/pt\.res_w/.test(html) && /pt\.res_l/.test(html) &&
      /pt\.res_d/.test(html), html);
  });

  it('is hidden by the facts column when the rival has no run', () => {
    LEAGUE['league-amateur-A'] = [
      {teamId: '42', rawName: 'Sauleda, A.D.', pos: 4, pts: 41, form: []}
    ];
    API = build();
    const html = API.ptFactsHtml(
        Object.assign({}, MATCH, {opponentTeamId: '42'}), ctx());
    assert.ok(/pt\.f_rival/.test(html), 'the rival row itself should still be there');
    assert.ok(!/pt-form/.test(html), html);
  });

  it('is drawn by the facts column when it has one', () => {
    LEAGUE['league-amateur-A'] = [
      {teamId: '42', rawName: 'Sauleda, A.D.', pos: 4, pts: 41, form: FORM}
    ];
    API = build();
    const html = API.ptFactsHtml(
        Object.assign({}, MATCH, {opponentTeamId: '42'}), ctx());
    assert.strictEqual((html.match(/pt-form-b/g) || []).length, 3, html);
    assert.ok(/pt-form-cap/.test(html), 'the caption says which way round it reads');
  });

  it('survives a cached row written before form existed', () => {
    // v2 cache entries have no `form` key at all.
    LEAGUE['league-amateur-A'] = [
      {teamId: '42', rawName: 'Sauleda, A.D.', pos: 4, pts: 41}
    ];
    API = build();
    const html = API.ptFactsHtml(
        Object.assign({}, MATCH, {opponentTeamId: '42'}), ctx());
    assert.ok(!/pt-form/.test(html), html);
  });
});

describe('ptFactsHtml — a row per fact it actually has', () => {
  beforeEach(reset);

  it('omits a row rather than printing an em dash', () => {
    /* Four rows of "—" is a page telling the coach it knows nothing, which
       is the wrong impression for a fixture that simply has no call-up yet. */
    const html = API.ptFactsHtml(MATCH, ctx({convSent: false, sentPlayers: []}));
    assert.strictEqual(html, '', 'nothing to say, so nothing rendered');
  });

  it('draws the call-up time, the count and the kit when they exist', () => {
    const html = API.ptFactsHtml(MATCH,
        ctx({sentPieces: {shirt: '#fff'}, kitLabel: '1a equipació'}));
    assert.ok(/pt\.f_callup/.test(html) && /18:45/.test(html), html);
    assert.ok(/pt\.f_called/.test(html) && />4</.test(html), html);
    assert.ok(/\[KITS:/.test(html) && /1a equipació/.test(html), html);
  });

  it('leaves the call-up row out when the time is the em-dash default', () => {
    const html = API.ptFactsHtml(MATCH, ctx({callupTime: '—'}));
    assert.ok(!/pt\.f_callup/.test(html), html);
  });

  it('shows the rival\'s kits under our own, at the FCF-safe size', () => {
    const html = API.ptFactsHtml(
        Object.assign({}, MATCH, {opponentKit: 'x', opponentKitAway: 'y'}), ctx());
    assert.ok(/pt\.f_kit_opp/.test(html), 'no Uniforme del rival row: ' + html);
    assert.strictEqual((html.match(/pt-oppkit"/g) || []).length, 2,
        'both the rival strips should be there');
    // The size is PASSED, never CSS — 32 for fcfShirtSvg's 4/8-band torso.
    assert.ok(/\[FSHIRT:32\]/.test(html), 'the rival shirt was not given a size: ' + html);
    assert.ok(/\[SOCKS:32\]/.test(html), html);
  });

  it('draws only the strips the fixture actually has', () => {
    const html = API.ptFactsHtml(
        Object.assign({}, MATCH, {opponentKit: 'x'}), ctx());
    assert.strictEqual((html.match(/pt-oppkit"/g) || []).length, 1, html);
  });

  it('omits the rival row entirely when neither kit is known', () => {
    // A friendly against a club the federation does not carry.
    assert.ok(!/pt\.f_kit_opp/.test(API.ptFactsHtml(MATCH, ctx())));
  });

  it('⚠ gives OUR kit an explicit size too', () => {
    /* Without one it renders at KIT_ICON_PX (72) — a card-sized icon in a
       label/value row, which is what this row was doing. */
    const html = API.ptFactsHtml(MATCH,
        ctx({sentPieces: {shirt: '#fff'}, kitLabel: '1a'}));
    assert.ok(/\[KITS:36\]/.test(html),
        'our kit is back to the 72px default: ' + html);
  });

  it('adds the rival row only when there is a standing', () => {
    assert.ok(!/pt\.f_rival/.test(API.ptFactsHtml(MATCH, ctx())));
    assert.ok(/pt\.f_rival/.test(
        API.ptFactsHtml(Object.assign({}, MATCH, {opponentPos: 4}), ctx())));
  });
});

describe('ptBoardsHtml — no longer behind the convocatòria', () => {
  beforeEach(reset);

  it('renders linked boards with no reference to convSent at all', () => {
    /* The whole block — call-up AND boards — used to sit behind convSent,
       so a coach who had attached three boards to a fixture he had not yet
       sent saw none of them, on the page whose job is to show him what he
       prepared. */
    STORE.fa_tactic_match_boards = JSON.stringify({7: [{name: 'Pressió alta'}]});
    API = build();
    const html = API.ptBoardsHtml(MATCH);
    assert.ok(/\[BOARD:Pressió alta\]/.test(html), html);
    const body = bare.slice(bare.indexOf('function ptBoardsHtml'),
        bare.indexOf('function renderMatchDetail'));
    assert.ok(!/convSent/.test(body), 'the gate must be gone, not merely bypassed');
  });

  it('renders nothing when no board is linked', () => {
    STORE.fa_tactic_match_boards = JSON.stringify({});
    API = build();
    assert.strictEqual(API.ptBoardsHtml(MATCH), '');
  });

  it('gives staff an unlink ✕ per card and players none', () => {
    STORE.fa_tactic_match_boards = JSON.stringify(
        {7: [{name: 'A'}, {name: 'B'}]});
    API = build();
    assert.strictEqual(
        (API.ptBoardsHtml(MATCH, true).match(/data-pt-unlink=/g) || []).length, 2);
    assert.ok(!/pt-board-x/.test(API.ptBoardsHtml(MATCH, false)));
  });

  it('⚠ addresses each board by INDEX, never by name', () => {
    /* Everywhere else in app.js a linked board is removed by matching
       `b.name`: renaming a board orphans its link, and two boards sharing a
       name unlink each other. Two cards with the SAME name here must still
       be individually addressable. */
    STORE.fa_tactic_match_boards = JSON.stringify(
        {7: [{name: 'Pressió'}, {name: 'Pressió'}]});
    API = build();
    const html = API.ptBoardsHtml(MATCH, true);
    assert.ok(/data-pt-unlink="0"/.test(html) && /data-pt-unlink="1"/.test(html), html);
    assert.ok(/data-pt-board="0"/.test(html) && /data-pt-board="1"/.test(html), html);
  });

  /* ⚠ THE ASSERTION WHOSE ABSENCE LET v214 SHIP BROKEN.
   *
   * ptBoardsHtml wrapped each board in `<button class="pt-board-open">`, and
   * renderReadOnlyBoard emits `<button class="tb-ro-play">`, `.tb-ro-stop`
   * and `.tb-ro-3d` inside it. Nested buttons are invalid HTML: the parser
   * closes the outer one when it meets the inner one, so the DOM the browser
   * builds is not the DOM the string describes. In the app that meant one
   * click firing two handlers — the 3D view opening *and* the overlay — and
   * the ✕ landing outside the card.
   *
   * Every other test here matched the markup STRING, where the nesting is
   * invisible because the string is exactly what was written. Only a parser
   * shows it. Parse, do not match.
   */
  const parse = (html) => new JSDOM('<div id="r">' + html + '</div>')
      .window.document.getElementById('r');

  it('nests no button inside another', () => {
    STORE.fa_tactic_match_boards = JSON.stringify({7: [{name: 'A'}, {name: 'B'}]});
    API = build();
    // The real board's own control strip, which is what got nested.
    const withCtl = API.ptBoardsHtml(MATCH, true).replace(/\[BOARD:([^\]]*)\]/g,
        '<div class="tb-ro-ctl"><button class="tb-ro-play"></button>' +
        '<button class="tb-ro-3d">3D</button></div>');

    /* ⚠ SCANNED ON THE STRING, not on the parsed DOM — and the first version
       of this test made exactly that mistake. `querySelectorAll('button
       button')` comes back EMPTY for the broken markup, because the parser
       has already rescued it by closing the outer button early. It reports
       success for the very input it is meant to catch. What is wrong is the
       markup the browser is handed, so that is what gets checked. */
    let depth = 0;
    let worst = 0;
    withCtl.replace(/<(\/?)button\b/g, function (_, close) {
      depth += close ? -1 : 1;
      worst = Math.max(worst, depth);
      return '';
    });
    assert.strictEqual(worst, 1,
        'a <button> opens inside another (depth ' + worst + '). The parser ' +
        'will close the outer one early, so the DOM will not be what this ' +
        'markup says — one click fires two handlers.');
  });

  it('keeps the ✕ inside its own card once parsed', () => {
    /* Not merely present in the string: the nesting bug moved it out of the
       card in the real DOM, which is why it never appeared. */
    STORE.fa_tactic_match_boards = JSON.stringify({7: [{name: 'A'}, {name: 'B'}]});
    API = build();
    const root = parse(API.ptBoardsHtml(MATCH, true));
    const cards = root.querySelectorAll('.pt-board');
    assert.strictEqual(cards.length, 2);
    cards.forEach((c, i) => {
      const x = c.querySelector('[data-pt-unlink]');
      assert.ok(x, 'card ' + i + ' has no unlink button inside it');
      assert.strictEqual(x.dataset.ptUnlink, String(i));
    });
  });

  it('carries the open target on the card, not on a wrapper button', () => {
    STORE.fa_tactic_match_boards = JSON.stringify({7: [{name: 'A'}]});
    API = build();
    const root = parse(API.ptBoardsHtml(MATCH, true));
    const card = root.querySelector('.pt-board');
    assert.strictEqual(card.dataset.ptBoard, '0',
        'the card itself must carry the board index');
    assert.ok(!card.querySelector('button.pt-board-open'),
        'the wrapper button is back — it cannot contain the board controls');
  });

  it('escapes a board name and its tag', () => {
    STORE.fa_tactic_match_boards = JSON.stringify(
        {7: [{name: '<b>x</b>', tag: '<i>y</i>'}]});
    API = build();
    const html = API.ptBoardsHtml(MATCH, true);
    assert.ok(!/<b>x<\/b>/.test(html) && !/<i>y<\/i>/.test(html), html);
  });
});

describe('the board overlay closes only on the scrim', () => {
  /* Source assertions: the overlay is DOM plus an await, and this suite has
     no jsdom. Each pins a property whose absence is silent — an overlay that
     shuts on every click inside itself looks like a broken play button. */
  const body = bare.slice(bare.indexOf('async function ptOpenBoard'),
      bare.indexOf('function renderMatchDetail'));

  it('tests the click target against the overlay itself', () => {
    assert.ok(/if \(e\.target === overlay\) close\(\)/.test(body),
        'a looser test shuts the panel whenever the coach presses play');
  });

  it('re-reads the board list rather than closing over it', () => {
    // The page re-renders under it; a captured array would unlink a stale index.
    assert.ok(/localStorage\.getItem\('fa_tactic_match_boards'\)/.test(body), body);
  });

  it('checks the panel is still there after the async read', () => {
    /* `await TB.get(...)` resolves after the coach may have closed the
       overlay; writing into a removed node throws nothing and shows nothing. */
    assert.ok(/if \(!body\) return;/.test(body),
        'the overlay must not write into a panel that has gone');
  });

  it('follows the render → scale → bind order _abPreview establishes', () => {
    const render = body.indexOf('renderReadOnlyBoard');
    const scale = body.indexOf('scaleRoBoards');
    const bind = body.indexOf('bindRoBoardAnimations');
    assert.ok(render !== -1 && scale > render && bind > scale,
        'the board must be rendered, then sized, then bound');
  });

  it('⚠ does NOT ship frame pills, and says why', () => {
    /* The handoff asks for them. applyRoFrame is a closure inside
       bindRoBoardAnimations — the function ro-playback.test.js pins with 41
       assertions — so pills would mean lifting it out of that closure or
       writing a second frame applier. Recorded in CONTEXT.md. If pills are
       ever added, this test is the one to delete deliberately. */
    assert.ok(!/pt-ov-pill|data-pt-frame/.test(bare),
        'frame pills appeared without applyRoFrame being lifted out first');
  });
});

describe('ptOurSide — which half of the fixture is us', () => {
  beforeEach(reset);

  it('is home when we are the home team', () => {
    assert.strictEqual(API.ptOurSide({home: 'US', away: 'Them'}), 'home');
  });

  it('is away when we are the away team', () => {
    assert.strictEqual(API.ptOurSide({home: 'Them', away: 'US'}), 'away');
  });

  it('⚠ does NOT answer "away" just because home is not us', () => {
    /* THE BUG THIS EXISTS FOR. Every call site was the inline
       `isOurTeam(m.home) ? 'home' : 'away'`, which never tests the away
       side: it assumes that if home is not ours, away must be. isOurTeam
       is a strict === on the configured club name, so an FCF import
       spelled "L'ESQUERRA DE L'EIXAMPLE, F.C." against a config reading
       "L'Esquerra de l'Eixample" matched NEITHER side — and the timeline
       silently decided we were the away team and drew our own goals under
       the rival's name, at our own ground. */
    assert.strictEqual(
        API.ptOurSide({home: "L'ESQUERRA DE L'EIXAMPLE, F.C.", away: 'Sauleda'}),
        'home',
        'a fixture matching neither side must not be called an away game');
  });

  it('survives no fixture at all', () => {
    assert.strictEqual(API.ptOurSide(null), 'home');
  });
});

describe('ptTimelineHtml — home on the left, away on the right', () => {
  beforeEach(reset);

  /* ⚠ THIS SUITE WAS REVERSED IN v215, ON THE OWNER'S CORRECTION.
     v213 read the handoff's "our events on the left" literally and pinned
     ours-always-left. Seen against real fixtures that was wrong: the
     scoreboard directly above prints `home — away`, so at an away ground
     our column sat under the rival's name. The columns follow the
     SCOREBOARD now, and an away fixture swaps sides — which is what the
     original pre-redesign code did, and what these tests now protect.

     `ptOurSide` is still right and still used; it decides ours/theirs for
     the event FORM, where the data differs (our squad vs a shirt number). */
  const AWAY = Object.assign({}, MATCH, {home: 'Sauleda, A.D.', away: 'US'});
  const EV = (o) => Object.assign({id: 'e' + Math.random(), minute: '12'}, o);
  const homeCell = (h) => h.slice(h.indexOf('pt-ev-home'), h.indexOf('pt-ev-min'));
  const awayCell = (h) => h.slice(h.indexOf('pt-ev-away'));

  it('puts a HOME event in the left cell', () => {
    USERS = SQUAD;
    const html = API.ptTimelineHtml(MATCH,
        [EV({side: 'home', type: 'goal', playerId: 'p1'})], USERS, false);
    assert.ok(/Roc Amat/.test(homeCell(html)), html);
    assert.ok(!/Roc Amat/.test(awayCell(html)), html);
  });

  it('puts an AWAY event in the right cell', () => {
    USERS = SQUAD;
    const html = API.ptTimelineHtml(MATCH,
        [EV({side: 'away', type: 'goal', playerNumber: '9'})], USERS, false);
    assert.ok(/pt-ev-name">#9</.test(awayCell(html)), html);
    assert.ok(!/#9/.test(homeCell(html)), html);
  });

  it('SWAPS which side we are on when we play away', () => {
    /* The owner's report, as a test. Same club, two grounds: at home our
       goal is on the left, away it is on the right — because in both cases
       it is on the side the scoreboard prints us on. */
    USERS = SQUAD;
    const atHome = API.ptTimelineHtml(MATCH,
        [EV({side: 'home', type: 'goal', playerId: 'p1'})], USERS, false);
    const atAway = API.ptTimelineHtml(AWAY,
        [EV({side: 'away', type: 'goal', playerId: 'p1'})], USERS, false);
    assert.ok(/Roc Amat/.test(homeCell(atHome)), 'not on the left at home');
    assert.ok(/Roc Amat/.test(awayCell(atAway)), 'not on the right away');
    assert.ok(!/Roc Amat/.test(homeCell(atAway)),
        'our away goal is still being drawn in the home column');
  });

  it('never puts both sides in the same column', () => {
    USERS = SQUAD;
    [MATCH, AWAY].forEach((fixture) => {
      const html = API.ptTimelineHtml(fixture, [
        EV({side: 'home', type: 'goal', playerId: 'p1', minute: '10'}),
        EV({side: 'away', type: 'goal', playerNumber: '9', minute: '20'})
      ], USERS, false);
      const rows = html.split('pt-ev-row').slice(1);
      assert.strictEqual(rows.length, 2);
      assert.ok(rows[0].indexOf('Roc Amat') < rows[0].indexOf('pt-ev-min'),
          'the home goal is not left of the minute: ' + rows[0]);
      assert.ok(rows[1].indexOf('#9') > rows[1].indexOf('pt-ev-min'),
          'the away goal is not right of the minute: ' + rows[1]);
    });
  });

  it('names an unknown player by shirt number as `#9`', () => {
    /* ⚠ `#9`, not the handoff's `Núm. 9`. The number-vs-name fallback is
       `resolveEventName`, one shared formatter used by this timeline, the
       anada briefing, the team-sheet marks and the player stats. Forking it
       for a label would put two spellings of the same rival on two halves
       of the same screen. Recorded in CONTEXT.md. */
    USERS = SQUAD;
    const html = API.ptTimelineHtml(MATCH,
        [EV({side: 'away', type: 'goal', playerNumber: '9'})], USERS, false);
    assert.ok(/pt-ev-name">#9</.test(html), html);
  });

  it('sorts EARLIEST first — a timeline reads downwards', () => {
    USERS = SQUAD;
    const html = API.ptTimelineHtml(MATCH, [
      EV({side: 'home', type: 'goal', playerId: 'p1', minute: '61'}),
      EV({side: 'home', type: 'goal', playerId: 'p2', minute: '12'})
    ], USERS, false);
    assert.ok(html.indexOf("12'") < html.indexOf("61'"), html);
  });

  it('names the assister under a goal', () => {
    USERS = SQUAD;
    const html = API.ptTimelineHtml(MATCH, [EV({side: 'home', type: 'goal',
      playerId: 'p1', goalDetail: 'assistencia', assistPlayerId: 'p3'})], USERS, false);
    assert.ok(/pt-ev-detail">pt\.assist_by Marc Vidal/.test(html), html);
  });

  it('puts the player coming ON in the name, and the one going off below', () => {
    /* ⚠ A substitution has NO playerId — it carries playerInId/playerOutId.
       The first version of this row called getEventPlayerName, which reads
       playerId, so every sub in the timeline rendered its name as a bare
       "?". The old layout never noticed because it overwrote the name for a
       change with both halves of the swap.

       This test originally asserted only the detail line, and passed
       against that "?" — which is why it now names both. */
    USERS = SQUAD;
    const html = API.ptTimelineHtml(MATCH, [EV({side: 'home', type: 'change',
      playerInId: 'p2', playerOutId: 'p4'})], USERS, false);
    assert.ok(/pt-ev-name">Guillem Roca</.test(html),
        'the incoming player is not the name on the row: ' + html);
    assert.ok(/pt-ev-detail">pt\.off_for Nil Bosch</.test(html), html);
    assert.ok(!/>\?</.test(html), 'something resolved to an unknown name: ' + html);
  });

  it('falls back to a shirt number for a rival substitution', () => {
    // Their squad is not in the app, so both halves are numbers.
    USERS = SQUAD;
    const html = API.ptTimelineHtml(MATCH, [EV({side: 'away', type: 'change',
      playerInNumber: '14', playerOutNumber: '9'})], USERS, false);
    assert.ok(/pt-ev-name">#14</.test(html), html);
    assert.ok(/pt\.off_for #9/.test(html), html);
  });

  it('gives a card NO detail line — there is no reason field', () => {
    /* The design shows "Joc perillós" under a booking. Nothing in this app
       has ever stored a reason, and a control that writes nowhere is worse
       than the blank. */
    USERS = SQUAD;
    const html = API.ptTimelineHtml(MATCH,
        [EV({side: 'home', type: 'yellow', playerId: 'p1'})], USERS, false);
    assert.ok(!/pt-ev-detail/.test(html), html);
  });

  it('gives staff a ✕ per row and players none', () => {
    USERS = SQUAD;
    const evs = [EV({side: 'home', type: 'goal', playerId: 'p1'})];
    assert.ok(/pt-ev-x/.test(API.ptTimelineHtml(MATCH, evs, USERS, true)));
    assert.ok(!/pt-ev-x"/.test(API.ptTimelineHtml(MATCH, evs, USERS, false)));
  });

  it('says so when there is nothing yet', () => {
    const html = API.ptTimelineHtml(MATCH, [], [], true);
    assert.ok(/pt\.no_events/.test(html), html);
    assert.ok(!/pt-ev-row/.test(html), html);
  });
});

describe('ptEventFormHtml — the inline form', () => {
  beforeEach(reset);

  const form = (over) => {
    API.setForm(Object.assign({matchId: 7, side: 'home', type: '', min: '',
      who: '', second: '', goalType: 'jugada_oberta'}, over || {}));
    return API.ptEventFormHtml(MATCH, SQUAD);
  };

  it('offers all seven types as chips, none selected at first', () => {
    const html = form();
    assert.strictEqual((html.match(/data-ev-type=/g) || []).length, 7, html);
    assert.ok(!/pt-chip-on/.test(html), 'nothing is chosen yet');
    assert.ok(/disabled/.test(html), 'and the submit is not available');
  });

  it('shows no fields at all until a type is chosen', () => {
    /* The minute and the player mean nothing without one, and three empty
       controls read as a form that has failed to load. */
    assert.ok(!/pt-ev-fields/.test(form()), form());
  });

  it('marks the chosen chip and enables the submit', () => {
    const html = form({type: 'yellow'});
    assert.strictEqual((html.match(/pt-chip-on/g) || []).length, 1, html);
    assert.ok(!/disabled/.test(html), html);
  });

  it('a plain card asks for the minute and the player, and nothing else', () => {
    const html = form({type: 'yellow'});
    assert.ok(/pt\.f_minute/.test(html) && /pt\.f_player/.test(html), html);
    assert.ok(!/pt\.f_assist/.test(html) && !/pt\.f_out/.test(html), html);
  });

  it('an OPEN-PLAY goal adds ASSISTÈNCIA', () => {
    const html = form({type: 'goal'});
    assert.ok(/pt\.f_assist/.test(html), html);
    assert.ok(!/pt\.f_out/.test(html), html);
  });

  it('⚠ a penalty or a free kick offers NO assist field', () => {
    ['penal', 'falta_directa'].forEach((gt) => {
      const html = form({type: 'goal', goalType: gt});
      assert.ok(!/pt\.f_assist/.test(html),
          gt + ' must not offer an assist: ' + html);
      // The goal-type chips are still there — only the picker goes.
      assert.ok(/pt\.f_goal_type/.test(html), html);
    });
  });

  it('uses the viewport-aware menu so a long squad can be scrolled', () => {
    /* `.std-sel-esc` makes the menu fixed and lets stdSelPlace flip it above
       the trigger. Without it an eighteen-player list grew the page instead
       of floating over it, and the bottom of the squad was unreachable. */
    assert.ok(/std-sel-esc/.test(form({type: 'goal'})),
        'the player picker is back to an absolutely-positioned menu');
  });

  it('a substitution asks ENTRA and SURT, not JUGADOR', () => {
    const html = form({type: 'change'});
    assert.ok(/pt\.f_in/.test(html) && /pt\.f_out/.test(html), html);
    assert.ok(!/pt\.f_player/.test(html), html);
  });

  it('⚠ a goal of OURS also asks the goal type — not in the handoff', () => {
    /* computePlayerStats counts penalties, direct free kicks and open play
       off ev.goalType and puts the breakdown on the player's stats page.
       Dropping the input would not remove the statistic; it would leave it
       silently recording every new goal as open play. */
    const html = form({type: 'goal'});
    assert.ok(/pt\.f_goal_type/.test(html), html);
    assert.strictEqual((html.match(/data-ev-goaltype=/g) || []).length, 3, html);
    // Open play is the default, and it is pre-selected rather than blank.
    assert.ok(/data-ev-goaltype="jugada_oberta"/.test(html), html);
    const chips = html.slice(html.indexOf('pt.f_goal_type'));
    assert.ok(/pt-chip-on[^>]*data-ev-goaltype="jugada_oberta"/.test(chips) ||
      /pt-chip pt-chip-on" data-ev-goaltype="jugada_oberta"/.test(chips), chips);
  });

  it('does NOT ask the goal type for the rival — we cannot know', () => {
    const html = form({side: 'away', type: 'goal'});
    assert.ok(!/pt\.f_goal_type/.test(html), html);
  });

  it('uses the shared stdSelect for OUR side', () => {
    // And not a fourth bespoke dropdown: .ev-custom-select is gone.
    const html = form({type: 'goal'});
    assert.ok(/\[SEL:evwho:/.test(html) && /\[SEL:evsecond:/.test(html), html);
    assert.ok(!/ev-custom-select/.test(html), html);
  });

  it('uses a free NUMBER box for the rival, who has no squad here', () => {
    const html = form({side: 'away', type: 'goal'});
    assert.ok(/pt-ev-num/.test(html), html);
    assert.ok(!/\[SEL:evwho/.test(html), 'the rival has no player list to pick from');
  });

  it('offers only the called-up players it was given', () => {
    const html = form({type: 'goal'});
    // SQUAD is 4 long, plus the "Tria un jugador" placeholder.
    assert.ok(/\[SEL:evwho:[^:]*:5:/.test(html), html);
  });

  it('keeps the minute the coach already typed across a re-render', () => {
    assert.ok(/value="63"/.test(form({type: 'goal', min: '63'})), 'the minute was lost');
  });

  it('escapes the team name in its own heading', () => {
    API.setForm({matchId: 7, side: 'away', type: '', min: '', who: '', second: ''});
    const html = API.ptEventFormHtml(
        Object.assign({}, MATCH, {away: '<b>X</b>'}), SQUAD);
    assert.ok(!/<b>X<\/b>/.test(html), html);
  });
});

describe('ptSecondField — one rule about which types need a second name', () => {
  beforeEach(reset);

  it('is the assist for an OPEN-PLAY goal and the outgoing player for a change', () => {
    assert.strictEqual(API.ptSecondField('goal', 'jugada_oberta'), 'assist');
    assert.strictEqual(API.ptSecondField('change'), 'out');
  });

  it('defaults a goal with no type to open play', () => {
    // The chip row pre-selects open play, so that is what "unset" means.
    assert.strictEqual(API.ptSecondField('goal'), 'assist');
    assert.strictEqual(API.ptSecondField('goal', ''), 'assist');
  });

  it('⚠ gives a PENALTY and a FREE KICK no assist at all', () => {
    /* They are restarts; nobody assists them. This is not only clutter: the
       picker's value was written to `assistPlayerId`, which
       computePlayerStats counts, so a player could be credited with an
       assist on a penalty for the rest of the season. */
    assert.strictEqual(API.ptSecondField('goal', 'penal'), '');
    assert.strictEqual(API.ptSecondField('goal', 'falta_directa'), '');
  });

  it('is nothing for every other type', () => {
    ['yellow', 'red', 'own_goal', 'penal_fallat', 'pal', ''].forEach((tp) => {
      assert.strictEqual(API.ptSecondField(tp), '', tp + ' should need no second field');
    });
  });
});

/* The anada block — the first leg, in full.
 *
 * v212 kept mnBriefingHtml's markup here and v215 tried to restyle it into
 * the design. That could not work: the briefing has no minutes column, no
 * team badges and no collapse row, and CSS does not reorganise a layout.
 * v216 built the real block, and this is what pins it.
 */
describe('ptFormation — derived, never guessed', () => {
  beforeEach(reset);

  const P = (pos) => ({id: 'x' + Math.random(), position: pos});
  const ELEVEN = (...pos) => pos.map(P);

  it('reads 4-3-3 off the eleven\'s positions', () => {
    assert.strictEqual(API.ptFormation(ELEVEN(
        'GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'OM', 'RW', 'ST', 'LW')),
    '4-3-3');
  });

  it('reads a different shape as a different shape', () => {
    assert.strictEqual(API.ptFormation(ELEVEN(
        'GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'OM', 'OM', 'ST', 'ST')),
    '4-4-2');
  });

  it('says NOTHING when the XI is not eleven', () => {
    /* A formation is a claim about how the team set up. With nine names
       recorded, any answer is invented. */
    assert.strictEqual(API.ptFormation(ELEVEN('GK', 'CB', 'CB', 'ST')), '');
    assert.strictEqual(API.ptFormation([]), '');
    assert.strictEqual(API.ptFormation(null), '');
  });

  it('says nothing when a position is missing or unrecognised', () => {
    assert.strictEqual(API.ptFormation(ELEVEN(
        'GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'OM', 'RW', 'ST', '')), '');
  });

  it('says nothing without exactly one goalkeeper', () => {
    assert.strictEqual(API.ptFormation(ELEVEN(
        'CB', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'OM', 'RW', 'ST', 'LW')), '');
  });
});

describe('ptAnadaHtml — the first leg', () => {
  beforeEach(reset);

  const LEG = {id: 99, home: 'US', away: 'Sauleda, A.D.', date: '2026-08-23',
    category: 'amateur', team: 'A'};

  function setUp(over) {
    FIRST_LEG = Object.assign({}, LEG, (over || {}).leg);
    USERS = SQUAD;
    XI = ['p1', 'p2', 'p3'];
    STORE.fa_convocatoria_sent = JSON.stringify(
        {99: {players: ['p1', 'p2', 'p3', 'p4'], startingXI: XI}});
    STORE.fa_match_events = JSON.stringify({99: (over || {}).events || []});
    MINUTES = (over || {}).minutes || {p1: 90, p2: 90, p3: 72, p4: null};
    OUTCOME = (over || {}).outcome || 'win';
    API = build();
    return API.ptAnadaHtml(MATCH, []);
  }

  it('renders nothing at all when there is no first leg', () => {
    FIRST_LEG = null;
    API = build();
    assert.strictEqual(API.ptAnadaHtml(MATCH, []), '');
  });

  it('lists the starters, then the bench under its own head', () => {
    const html = setUp();
    assert.ok(/pt-cu-group">pt\.subs/.test(html), 'no SUPLENTS sub-head: ' + html);
    /* Counted on the opening tag. Splitting on `pt-leg-row` counts the
       unused row twice, because its class is `pt-leg-row pt-leg-row-unused`. */
    const rows = (html.match(/<div class="pt-leg-row/g) || []).length;
    assert.strictEqual(rows, 4, 'one row per called-up player');
    assert.ok(html.indexOf('Guillem Roca') < html.indexOf('pt.subs'),
        'a starter is listed below the bench heading');
  });

  it('⚠ shows — for NULL minutes but a real 0 as 0\'', () => {
    /* THE WHOLE POINT OF THIS COLUMN. `playerMatchMinutesKnown` returns null
       when no line-up was ever recorded and a NUMBER when it was — and 0 is
       a number. Treating them alike is the bug the helper exists to prevent,
       and the first version of this test could not tell them apart because
       no fixture player had 0.

       p4 is unused (null) and p3 played 0. Both must render, differently. */
    const html = setUp({minutes: {p1: 90, p2: 90, p3: 0, p4: null}});
    assert.strictEqual((html.match(/pt-leg-row-unused/g) || []).length, 1,
        'exactly one row is unused — a real 0 is not: ' + html);
    assert.strictEqual((html.match(/pt-leg-min">—</g) || []).length, 1, html);
    assert.ok(/pt-leg-min">0'</.test(html),
        'a recorded 0 must read as 0\', not as an em dash: ' + html);
  });

  it('prints real minutes for everyone who played', () => {
    const html = setUp();
    assert.ok(/pt-leg-min">90'</.test(html) && /pt-leg-min">72'</.test(html), html);
  });

  it('⚠ reads the score in FIXTURE order, coloured by OUR result', () => {
    /* The badge sits between the two club names, so it follows them —
       the same correction the timeline needed in v215. The colour is the
       thing that is from our side, and mnOutcome already decides it. */
    const html = setUp({events: [{side: 'away', type: 'goal', minute: '10'},
      {side: 'away', type: 'goal', minute: '20'},
      {side: 'home', type: 'goal', minute: '30'}], outcome: 'loss'});
    assert.ok(/pt-leg-score pt-leg-loss">1 – 2</.test(html),
        'expected the home-away score with a loss colour: ' + html);
  });

  it('marks the events with a crest and never a team name', () => {
    const html = setUp({events: [{side: 'home', type: 'goal', minute: '41',
      playerId: 'p1'}]});
    assert.ok(/pt-leg-ev-crest/.test(html), html);
    assert.ok(!/Sauleda/.test(html.slice(html.indexOf('pt-leg-evs'))),
        'a team name leaked into the events column: ' + html);
  });

  it('⚠ keeps the RESULT visible when collapsed', () => {
    /* Everything inside <summary> survives the collapse. The score used to
       be below it, so shutting the block hid the one thing a coach shuts it
       down to — the eyebrow alone said there had been a first leg without
       saying how it went. */
    const html = setUp();
    const summary = html.slice(html.indexOf('<summary'), html.indexOf('</summary>'));
    assert.notStrictEqual(summary.length, 0, 'no summary at all');
    assert.ok(/pt-leg-score/.test(summary), 'the score is outside the summary');
    assert.ok(/pt-anada-when/.test(summary), 'the date is outside the summary');
    assert.ok(/US/.test(summary), 'the team names are outside the summary');
    // The columns are the part that folds away.
    assert.ok(!/pt-anada-cols/.test(summary), html);
  });

  it('keeps the collapse hook the remembered preference is wired to', () => {
    /* The <details> keeps `.mn-brief` so the existing toggle handler goes on
       writing MN_BRIEF_COLLAPSED — a coach who collapsed the old briefing
       finds this collapsed too. */
    const html = setUp();
    assert.ok(/<details class="mn-brief pt-anada"/.test(html), html);
  });

  it('opens by default and closes when the preference says so', () => {
    assert.ok(/pt-anada" open>/.test(setUp()), 'should default to open');
    STORE.fa_mn_brief_collapsed = '1';
    API = build();
    assert.ok(!/ open>/.test(API.ptAnadaHtml(MATCH, [])), 'should honour the collapse');
  });

  it('⚠ carries neither the open-fixture nor the reject link', () => {
    /* Both removed on the owner's instruction in v218. Asserted rather than
       merely deleted, because the second one was the ONLY way to reject a
       linked first leg: mnLegBannerHtml offers one too, but only while the
       suggestion is unanswered, so a wrongly linked leg now has no undo.
       MN.dismissLeg is still exported — putting it back is one button, and
       this test is the reminder that it was a decision. */
    const html = setUp();
    assert.ok(!/pt-leg-open|pt-leg-reject|pt-leg-links/.test(html), html);
    assert.ok(!/mn-leg-dismiss/.test(html), html);
  });

  it('escapes both club names in the header', () => {
    const html = setUp({leg: {away: '<b>X</b>'}});
    assert.ok(!/<b>X<\/b>/.test(html), html);
  });
});

describe('the page holds together', () => {
  beforeEach(reset);

  it('has a CSS rule for every pt- class it emits', () => {
    /* v125: a whole feature shipped with no stylesheet because a `cat >>`
       was chained behind a failing `node --check`. */
    const emitted = new Set();
    /* ⚠ Scan for the TOKEN, not for a whole class attribute. Half of these
       attributes are built by concatenation — `class="pt-star' + (on ? ...`
       — so a `class="([^"]*)"` capture runs past the closing quote of the
       JS string and yields `pt-star'` and `pt-starters-off')`, which match
       nothing in the CSS and fail as if the rules were missing. */
    /* ⚠ The lookbehind is not decoration. `\b` finds a word boundary after
       the hyphen in `data-pt-unlink`, so a bare `\bpt-…` scan reports
       `pt-unlink` — a DATA ATTRIBUTE name — as a class with no CSS rule. */
    const re = /(?<![-\w])pt-[a-z0-9-]+/g;
    let m;
    while ((m = re.exec(bare))) emitted.add(m[0]);
    assert.ok(emitted.size > 15, 'the scan found almost nothing: ' + emitted.size);
    const missing = [...emitted].filter((c) => bareCss.indexOf('.' + c) === -1);
    assert.deepStrictEqual(missing, [],
        'emitted with no CSS rule: ' + missing.join(', '));
  });

  it('every pt. string exists in all three languages', () => {
    /* t() returns the KEY on a miss, so a gap ships as `pt.f_rival` on
       screen rather than as an error. */
    const used = new Set();
    const re = /t\('(pt\.[a-z0-9_]+)'\)/g;
    let m;
    while ((m = re.exec(bare))) used.add(m[1]);
    assert.ok(used.size > 15, 'the scan found almost nothing: ' + used.size);
    const bad = [];
    used.forEach((k) => {
      const at = src.indexOf("'" + k + "':");
      if (at === -1) { bad.push(k + ' (undeclared)'); return; }
      const line = src.slice(at, src.indexOf('\n', at));
      ['ca:', 'es:', 'en:'].forEach((l) => {
        if (line.indexOf(l) === -1) bad.push(k + ' (no ' + l.slice(0, 2) + ')');
      });
    });
    assert.deepStrictEqual(bad, [], bad.join(', '));
  });

  it('neutralises the .card shell the un-redesigned blocks still emit', () => {
    /* The referee record, the coach notes and the events list are restyled
       in v213/v214 and still emit `.card`. Until then a white box with a
       radius and a shadow would sit in the middle of a surface whose whole
       idiom is that it has neither. */
    const i = bareCss.indexOf('.pt-page .card {');
    assert.notStrictEqual(i, -1, 'the card bridge is missing');
    const rule = bareCss.slice(i, bareCss.indexOf('}', i));
    ['background: transparent', 'border: none', 'border-radius: 0', 'box-shadow: none']
        .forEach((d) => assert.ok(rule.indexOf(d) !== -1, 'bridge is missing: ' + d));
  });

  it('stacks both bands to one column on a narrow screen', () => {
    /* 2c in the handoff. Two 1fr columns of events and call-up at 390px is
       the layout that made the redesign necessary in the first place. */
    const i = bareCss.indexOf('@media (max-width: 1100px)');
    assert.notStrictEqual(i, -1, 'the stacking breakpoint is gone');
    /* To the closing brace of the MEDIA BLOCK, not of the first rule in it
       — `indexOf('}\n')` finds the end of `.pt-context { … }` and cuts the
       slice before .pt-play is ever reached, so the second assertion fails
       against a rule that is present. */
    const block = bareCss.slice(i, bareCss.indexOf('\n}', i) + 2);
    assert.ok(/\.pt-context \{ grid-template-columns: 1fr/.test(block), block);
    assert.ok(/\.pt-play \{ grid-template-columns: 1fr/.test(block), block);
  });

  it('keeps the shared video handler rather than opening its own window', () => {
    /* safeHttpUrl is applied centrally in that handler. A second render
       site with its own click handler is a second place to forget it. */
    const i = bare.indexOf('const videosHtml');
    assert.notStrictEqual(i, -1, 'the videos block moved');
    const body = bare.slice(i, i + 700);
    assert.ok(/class="detail-video-link"/.test(body), body);
    assert.ok(!/window\.open/.test(body), 'must not open its own window');
  });

  /* The coach's notes and the anada briefing keep their own markup inside
     .pt-page and are restyled by scoped CSS. Two things can go wrong and
     neither raises anything: the restyle can be dropped, and the markup can
     be rewritten out from under it, taking the save paths with it. */
  it('restyles the notes, which still keep their own markup', () => {
    /* The briefing used to be in this list. v216 replaced it with the real
       `.pt-anada` block, so those `.pt-page .mn-brief*` rules were deleted —
       they existed only to restyle markup that no longer renders. The NOTES
       block is still the old markup by design and still needs them. */
    ['.pt-page .mn-text', '.pt-page .mn-phase', '.pt-page .mn-group-title',
      '.pt-page .mn-leg-banner'].forEach((sel) => {
      assert.ok(bareCss.indexOf(sel) !== -1,
          sel + ' has no rule — that block is back to its old look');
    });
  });

  it('has no leftover rules for the briefing markup it replaced', () => {
    // Dead rules that would fight the new block if the class ever returned.
    ['.pt-page .mn-brief-summary', '.pt-page .mn-brief-grid',
      '.pt-page .mn-brief-caret'].forEach((sel) => {
      assert.strictEqual(bareCss.indexOf(sel), -1,
          sel + ' survived the v216 rewrite — mnBriefingHtml no longer renders');
    });
  });

  it('scopes that restyle, so the Calendari\'s leg banner is untouched', () => {
    /* mnLegBannerHtml renders on the Calendari too. An unscoped `.mn-leg-banner`
       rule here would silently restyle a page this redesign has not touched. */
    const i = bareCss.indexOf('.pt-page .mn-leg-banner');
    assert.notStrictEqual(i, -1);
    assert.ok(!/^\.mn-leg-banner\s*\{/m.test(bareCss.slice(i - 200, i + 400)),
        'the leg banner is being restyled unscoped');
  });

  it('keeps the hooks the notes SAVE path reads', () => {
    /* `.mn-text` blurs into MN.saveText and the phase comes off the dataset;
       the video rows blur into MN.saveVideos. Restyling must not have
       renamed any of it. */
    assert.ok(/class="reg-input mn-text" data-mn-phase="/.test(bare),
        'the notes textarea lost its class or its phase attribute');
    assert.ok(/mn-video-row" data-mn-phase="/.test(bare),
        'the video rows lost the phase the save handler reads');
  });

  it('⚠ keeps the referee section even with no referee appointed', () => {
    /* mdRefDetailHtml returns '' when the federation has published no
       appointment, and the whole third of the band used to vanish with it —
       the page looked as though it had lost a section. A fixture with no
       referee yet is a normal state before the weekend. */
    const i = bare.indexOf('const ref = mdRefereeFor(m);');
    assert.notStrictEqual(i, -1, 'the referee lookup moved');
    const body = bare.slice(i, i + 900);
    assert.ok(/let refHtml = ptHead\(t\('pt.referee'\)\)/.test(body),
        'the heading must be built before the lookup is judged: ' + body);
    assert.ok(/pt\.no_referee/.test(body),
        'nothing says the referee is not appointed yet');
    assert.ok(!/refHtml = ''/.test(body),
        'the column can still come back empty');
  });

  it('the board picker is the shared control, not a native select', () => {
    /* It was the last `<select>` in the app: a native popup is drawn by the
       OS and ignores every rule here, so on a page of hairlines it opened as
       a stray system widget. */
    const i = bare.indexOf('function mnBoardsEditHtml');
    const body = bare.slice(i, bare.indexOf('function mnNotesCardHtml'));
    assert.ok(!/<select/.test(body), 'a native <select> is back: ' + body);
    assert.ok(/stdSelect\(\{kind: 'mnboard'/.test(body), body);
    assert.ok(/std-sel-esc/.test(body),
        'a long board library would run off the bottom of the page');
    // And the Add button must read the value stdSelect actually writes.
    assert.ok(/sel\.dataset\.value/.test(bare),
        'the Add button still reads `.value` from an element that has none');
  });

  it('the back button keeps the handler hook it is bound by', () => {
    // `.pt-back` is the look; `.detail-back` is what bindDynamicActions binds.
    assert.ok(/class="pt-back detail-back"/.test(bare), 'the back button lost its hook');
  });
});
