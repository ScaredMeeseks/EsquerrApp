/* Does the calendar page actually RENDER?
 *
 * Pure logic, no emulator: `npm run test:calendar`.
 *
 * There is no jsdom in this suite and no browser automation on the box, so
 * `renderCalendar()` is otherwise only ever exercised by a human opening
 * the app. That matters more here than usual: the page replaced FIVE
 * renderers, then was rebuilt again as week strips against the 2a handoff,
 * and the failure mode of a missing helper in this codebase is a
 * ReferenceError inside innerHTML — a blank screen for every user, with a
 * green test suite.
 *
 * So this runs the real region over stubs and asserts on the HTML string.
 * It cannot tell you the strips LOOK right; it can tell you they exist,
 * that every block the data implies is in one, that collapsed cells carry
 * whole rows, and that a player is shown nothing they may not have.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const U = require(path.join(root, 'js', 'utils.js'));

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

const sanitize = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* March 2026: the 1st is a Sunday, so a Monday-first grid opens on 23
   February. The 3rd and 10th are Tuesdays, the 5th and 12th Thursdays,
   the 7th and 14th Saturdays. */
const TODAY = '2026-03-04';

const CLUB = {
  name: 'Esquerra de l\'Eixample F.C.',
  schedules: {
    'amateur-A': {
      training: [
        {day: 'tue', time: '21:00', endTime: '22:30', location: 'Industrial', link: ''},
        {day: 'thu', time: '21:00', endTime: '22:30', location: 'Industrial', link: ''},
      ],
    },
  },
  fcfLinks: {'amateur-A': 'https://www.fcf.cat/x?grupId=58161881'},
};

const SQUAD = [
  {id: 'p1', roles: ['player'], category: 'amateur', team: 'A'},
  {id: 'p2', roles: ['player'], category: 'amateur', team: 'A'},
  {id: 'p3', roles: ['player'], category: 'amateur', team: 'A'},
  {id: 'p4', roles: ['player'], category: 'amateur', team: 'A'},
];

/**
 * Build renderCalendar over stubs.
 * @param {Object} o trainings / matches / role / avail fixtures.
 */
function make(o) {
  o = o || {};
  const store = {
    fa_training: JSON.stringify(o.trainings || []),
    fa_matches: JSON.stringify(o.matches || []),
    fa_matchday: JSON.stringify(o.drafts || []),
    fa_convocatoria_sent: JSON.stringify(o.sent || {}),
    fa_convocatoria_callup: JSON.stringify(o.callup || {}),
    fa_match_events: JSON.stringify(o.events || {}),
    fa_player_rpe: JSON.stringify(o.rpe || {}),
  };
  const canEdit = o.role !== 'player' && o.role !== 'fitness';
  const code = grab('  // ── The blocks inside a day ─', '  // #endregion Calendar');

  const stubs = {
    localStorage: {getItem: (k) => (k in store ? store[k] : null), setItem: () => {}},
    _clubConfig: CLUB,
    _lang: 'ca',
    // The key returned raw, as the real t() does on a miss — so a typo in a
    // key shows up in the output rather than being papered over.
    t: (k) => k,
    sanitize,
    CATEGORY_LABELS: U.CATEGORY_LABELS,
    canEditPage: () => canEdit,
    /* The REAL predicate, not `() => canEdit`. The two were conflated in the
       app until v198 and a stub that repeated the mistake would have hidden
       it: a fitness coach who may view but not edit still reads the whole
       club's schedule. */
    isStaffViewer: (s) => ((s && s.roles) || []).indexOf('staff') !== -1,
    canAddTraining: () => o.role !== 'player' && o.role !== 'fitness' && o.role !== 'delegate',
    getCurrentCategory: () => o.category || '',
    getVisibleCategories: () => ['amateur'],
    // One squad by default; the letter-filter tests ask for two.
    getTeamLetters: () => (o.letters || ['A']),
    getTrainings: () => JSON.parse(store.fa_training),
    getUsers: () => (o.users || SQUAD),
    // The REAL rule for which sessions and players belong to a session.
    playerTrainings: new Function('playerIsCalled',
        grab('  function trainingTeams(t) {', '  /* THE reader for fa_training.') +
        '\n return playerTrainings;')(
        (t, u) => !u || !t.category || t.category === u.category),
    calledPlayers: (row, users) => (users || []).filter(
      (u) => !row.category || !u.category || row.category === u.category),
    trainingTeams: (t) => ((t.teams || []).length ? t.teams : ['A']),
    clubKits: () => U.DEFAULT_KITS,
    resolveKitPieces: U.resolveKitPieces,
    kitIconsHtml: () => '<span class="kit-icons">KIT</span>',
    isOurTeam: (n) => n === CLUB.name,
    calcMatchScore: (evs) => {
      let home = 0; let away = 0;
      (evs || []).forEach((e) => {
        if (e.type === 'goal') { if (e.side === 'home') home++; else away++; }
      });
      return {home, away};
    },
    getMatchEvents: (id) => JSON.parse(store.fa_match_events)[id] || [],
    matchEndsAt: (m) => (m && m.date
      ? new Date(m.date + 'T' + (m.time || '00:00') + ':00').getTime() + 2 * 36e5
      : 0),
    sessionEndsAt: (t) => (t && t.date && t.time
      ? new Date(t.date + 'T' + t.time + ':00') : null),
    isTrainingLocked: () => false,
    availContext: () => ({availData: o.avail || {}, overrides: {}}),
    getEffectiveAnswer: (uid, sess, locked, ctx) =>
      (ctx.availData[uid + '_' + (sess && sess.id)] || 'yes'),
    buildAvailDonut: () => '',
    safeHttpUrl: U.safeHttpUrl,
    leaguePosLabel: U.leaguePosLabel,
    matchdayLabel: U.matchdayLabel,
    matchdayOffset: U.matchdayOffset,
    monthGrid: U.monthGrid,
    ghostSlots: U.ghostSlots,
    isActivity: U.isActivity,
    activityTitleOf: U.activityTitleOf,
    localDateStr: U.localDateStr,
    fcfGrupId: U.fcfGrupId,
    loadBand: U.loadBand,
    sessionAU: U.sessionAU,
    weekAU: U.weekAU,
    isoWeek: U.isoWeek,
    chunkWeeks: U.chunkWeeks,
    tDayShort: (i) => 'D' + i,
    tDateShort: (d) => d,
    tMonth: (i) => 'M' + i,
    tMonthShort: (i) => 'm' + i,
    viewOnlyBanner: () => '<div class="view-only">READONLY</div>',
    Date: class extends Date {
      constructor(...a) { return a.length ? new Date(...a) : new Date(TODAY + 'T12:00:00'); }
      static now() { return new Date(TODAY + 'T12:00:00').getTime(); }
    },
  };

  /* From `calReset` rather than from `calView`: the letter filter and its
     state live above the month helpers, and slicing under them left
     calInFilter undefined at render time — a ReferenceError inside
     innerHTML, which is a blank page. Takes `let calMonth` with it, so the
     harness no longer declares its own. */
  const fn = new Function(...Object.keys(stubs), `
    ${grab('  let calMonth = null;', '  // ── The blocks inside a day ─')}
    ${code}
    return function (session, month, letter) {
      calMonth = month || null;
      calTeamFilter = letter || 'all';
      return renderCalendar(session);
    };`)(...Object.values(stubs));
  return (session, month, letter) =>
    fn(session || {id: 'coach', roles: ['staff']}, month, letter);
}

const T = (over) => Object.assign(
    {id: 'tr_1', date: '2026-03-03', time: '21:00', endTime: '22:30',
      focus: 'Pressió alta', category: 'amateur', teams: ['A'],
      location: 'Industrial', guests: [], excluded: []}, over);
const M = (over) => Object.assign(
    {id: 4119501, home: CLUB.name, away: 'INSPIRE SOCCER,F.C.',
      date: '2026-03-07', time: '18:00', team: 'A', category: 'amateur',
      location: 'Camp', mapLink: 'https://maps.example/x'}, over);

const count = (html, re) => (html.match(re) || []).length;

/* One day's markup, class attribute included.
   Split on the opening tag rather than on `data-cal-date`, because the
   class comes BEFORE the date attribute — slicing from the date drops
   exactly the thing most of these tests are about. */
const cellOf = (html, date) => {
  /* Walk BACK from the date attribute to the opening tag, then forward to
     the next cell. Splitting on `<div class="cal-cell` does not work: the
     header and body inside every cell are `cal-cell-h` and
     `cal-cell-body`, so the chunk would end two tags in. */
  const at = html.indexOf('data-cal-date="' + date + '"');
  assert.notStrictEqual(at, -1, 'no cell for ' + date);
  const start = html.lastIndexOf('<div class="', at);
  const next = html.indexOf('data-cal-date="', at + 1);
  const end = next === -1 ? html.length : html.lastIndexOf('<div class="', next);
  return html.slice(start, end);
};

describe('the calendar renders at all', () => {
  it('produces six week strips of seven days', () => {
    const html = make({})(null, '2026-03');
    assert.strictEqual(count(html, /data-cal-week="/g), 6);
    // data-cal-date, not the class: `cal-cell-h` and `cal-cell-body` are
    // inside every cell and a \b boundary matches at their hyphens.
    assert.strictEqual(count(html, /data-cal-date="/g), 42);
    assert.strictEqual(count(html, /class="cal-gutter"/g), 6);
  });

  it('has no weekday header row', () => {
    /* Every cell opens with its own weekday — "Dt 1" — so a DL DT DC strip
       above the grid was the same seven words repeated six times. */
    const html = make({})(null, '2026-03');
    assert.ok(!/class="cal-dows?"/.test(html), 'the weekday header is back');
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    assert.ok(!/\.cal-dows?\s*[{,]/.test(css), '.cal-dow(s) is still styled');
  });

  it('names the month and both arrows', () => {
    const html = make({})(null, '2026-03');
    assert.ok(html.includes('M2 2026'), 'March is month index 2');
    assert.ok(html.includes('data-cal-shift="-1"'));
    assert.ok(html.includes('data-cal-shift="1"'));
  });

  it('labels each strip with its ISO week, not its row number', () => {
    /* 2 March 2026 is the Monday of ISO week 10. A grid that numbered its
       own rows would say "week 1" here, and a coach saying "week 10" to
       the federation would be talking about something else. */
    const html = make({})(null, '2026-03');
    assert.ok(html.includes('cal.week_n'), 'the week label is missing');
    const gutters = html.match(/class="cal-range">([^<]*)</g) || [];
    assert.strictEqual(gutters.length, 6);
  });

  it('spills into the neighbouring months and marks those cells', () => {
    const html = make({})(null, '2026-03');
    assert.ok(html.includes('data-cal-date="2026-02-23"'), 'the grid opens in February');
    assert.ok(count(html, /cal-cell-out/g) > 0);
  });

  it('marks today, once', () => {
    assert.strictEqual(count(make({})(null, '2026-03'), /cal-cell-today/g), 1);
  });

  it('emits no untranslated key into an attribute', () => {
    const html = make({trainings: [T()], matches: [M()]})(null, '2026-03');
    assert.ok(!/="[a-z]+\.[a-z_]+"/.test(html.replace(/title="[^"]*"/g, '')),
        'an i18n key leaked into an attribute');
  });
});

describe('the cell tells you what is on that day', () => {
  it('takes its fill from the highest-priority thing on it', () => {
    assert.ok(cellOf(make({trainings: [T()]})(null, '2026-03'), '2026-03-03')
        .includes('cal-k-train'));
    assert.ok(cellOf(make({matches: [M()]})(null, '2026-03'), '2026-03-07')
        .includes('cal-k-match'));
    assert.ok(cellOf(make({trainings: [T({id: 'a', kind: 'activity', title: 'Sopar',
      date: '2026-03-04'})]})(null, '2026-03'), '2026-03-04').includes('cal-k-act'));
  });

  it('a MATCH outranks a session on the same day', () => {
    // The fixture is what a coach is looking for; the +N says what is under it.
    const html = make({matches: [M()], trainings: [T({date: '2026-03-07'})]})(null, '2026-03');
    const cell = cellOf(html, '2026-03-07');
    assert.ok(cell.includes('cal-k-match'), 'the training took the cell');
    assert.ok(cell.includes('cal-more'), 'nothing said a second thing was there');
    assert.ok(cell.includes('+1'));
  });

  it('marks a weekend apart from a weekday when both are empty', () => {
    const html = make({})(null, '2026-03');
    assert.ok(cellOf(html, '2026-03-06').includes('cal-k-empty'), 'Friday');
    assert.ok(cellOf(html, '2026-03-08').includes('cal-k-weekend'), 'Sunday');
  });

  it('dims a past day, but barely dims a played match', () => {
    /* The result is the one thing anybody looks for on a past day, so it
       keeps its weight where an ordinary past session gives it up. */
    const html = make({
      trainings: [T({date: '2026-03-02'})],
      matches: [M({id: 9, date: '2026-03-01', time: '12:00'})],
      events: {9: [{type: 'goal', side: 'home'}]},
    })(null, '2026-03');
    assert.ok(cellOf(html, '2026-03-02').includes('cal-cell-past'));
    assert.ok(cellOf(html, '2026-03-01').includes('cal-cell-past-res'));
  });
});

describe('the training block', () => {
  it('carries the focus, the time and the microcycle position', () => {
    const html = make({trainings: [T()], matches: [M()]})(null, '2026-03');
    const cell = cellOf(html, '2026-03-03');
    assert.ok(cell.includes('data-cal-session="tr_1"'));
    assert.ok(cell.includes('Pressió alta'));
    assert.ok(cell.includes('21:00'));
    // Tuesday the 3rd, fixture Saturday the 7th → M-4.
    assert.ok(cell.includes('>M-4<'), 'the MD chip is missing');
  });

  it('shows the intensity dot only once somebody has set one', () => {
    /* Absent, not green: "nobody has estimated this" and "this is an easy
       session" are different facts and must not share a colour. */
    const none = cellOf(make({trainings: [T()]})(null, '2026-03'), '2026-03-03');
    assert.ok(!/cal-load-/.test(none), 'an unestimated session got a dot');
    const set = cellOf(make({trainings: [T({plannedRpe: 6})]})(null, '2026-03'), '2026-03-03');
    assert.ok(set.includes('cal-load-mid'));
    const hard = cellOf(make({trainings: [T({plannedRpe: 9})]})(null, '2026-03'), '2026-03-03');
    assert.ok(hard.includes('cal-load-high'));
  });

  it('costs an upcoming session at the plan and a past one at what was reported', () => {
    const up = make({trainings: [T({date: '2026-03-10', plannedRpe: 7})]})(null, '2026-03');
    assert.ok(up.includes('load.planned_rpe'), 'the planned line is missing');
    const past = make({
      trainings: [T({id: 'old', date: '2026-03-02', plannedRpe: 7})],
      rpe: {p1_training_old: {rpe: 8}, p2_training_old: {rpe: 8}},
    })(null, '2026-03');
    assert.ok(past.includes('load.actual_rpe'), 'a reported session still shows the plan');
  });

  it('falls back to a label when the session has no focus', () => {
    assert.ok(make({trainings: [T({focus: ''})]})(null, '2026-03').includes('cal.training'));
  });
});

describe('the match block', () => {
  it('an upcoming one: side, rival, kick-off, call-up and crest', () => {
    const html = make({matches: [M()]})(null, '2026-03');
    const cell = cellOf(html, '2026-03-07');
    assert.ok(cell.includes('data-cal-match="4119501"'));
    assert.ok(cell.includes('cal-ha-h'), 'we are the home side');
    assert.ok(cell.includes('INSPIRE SOCCER,F.C.'));
    assert.ok(cell.includes('18:00'));
    assert.ok(cell.includes('>IS<'), 'the crest monogram is missing');
  });

  it('the away tag when we are the away side', () => {
    assert.ok(make({matches: [M({home: 'INSPIRE SOCCER,F.C.', away: CLUB.name})]})(null, '2026-03')
        .includes('cal-ha-a'));
  });

  it('a house and a plane, not H and A', () => {
    const home = make({matches: [M()]})(null, '2026-03');
    assert.ok(home.includes('🏠'), 'no house on a home fixture');
    assert.ok(!/class="cal-ha[^"]*"[^>]*>H</.test(home), 'the H chip is still there');
    const away = make({matches: [M({home: 'INSPIRE SOCCER,F.C.', away: CLUB.name})]})(null, '2026-03');
    assert.ok(away.includes('✈️'), 'no plane on an away fixture');
    assert.ok(!/class="cal-ha[^"]*"[^>]*>A</.test(away), 'the A chip is still there');
  });

  it('keeps the classes that say WHICH, so the markup is still readable', () => {
    // The glyphs carry the meaning visually; these carry it to the title
    // attribute and to everything that has to tell the two apart.
    assert.ok(make({matches: [M()]})(null, '2026-03').includes('cal-ha-h'));
    assert.ok(make({matches: [M({home: 'INSPIRE SOCCER,F.C.', away: CLUB.name})]})(null, '2026-03')
        .includes('cal-ha-a'));
  });

  it('puts the crest against the NAME, before the position', () => {
    /* At `flex: 1 1 auto` the name grew to fill the row and pushed the
       badge out to the right margin, where it read as the cell's rather
       than the club's. Order in the markup is what fixes it, and the
       stylesheet has to let the name shrink. */
    const cell = cellOf(make({matches: [M({opponentPos: 4})]})(null, '2026-03'), '2026-03-07');
    const name = cell.indexOf('cal-opp');
    const crest = cell.indexOf('cal-crest');
    const pos = cell.indexOf('cal-pos');
    assert.ok(name < crest, 'the crest is before the name');
    assert.ok(crest < pos, 'the position comes between the name and the crest');
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    assert.ok(/\.cal-opp\s*\{[^}]*flex:\s*0 1 auto/.test(css),
        '.cal-opp still grows, so the crest will float to the margin');
  });

  it('the FROZEN league position, in Catalan', () => {
    assert.ok(make({matches: [M({opponentPos: 4})]})(null, '2026-03').includes('>4t</span>'));
    assert.ok(!make({matches: [M()]})(null, '2026-03').includes('cal-pos'),
        'a position appeared for a fixture that was never stamped');
  });

  it('the call-up dot only once a convocatòria has gone out', () => {
    const bare = make({matches: [M()]})(null, '2026-03');
    assert.ok(!bare.includes('conv-blink-dot'), 'a dot with nothing sent');
    assert.ok(bare.includes('cal.squad_not_sent'));
    const sent = make({matches: [M()], sent: {4119501: {players: ['p1']}}})(null, '2026-03');
    assert.ok(sent.includes('conv-blink-dot'));
    assert.ok(sent.includes('16:30'), 'kick-off minus 90, floored to the quarter hour');
    assert.ok(sent.includes('cal.squad_sent'));
  });

  it('our kit, but only once the squad has been told', () => {
    assert.ok(!make({matches: [M()]})(null, '2026-03').includes('kit-icons'));
    assert.ok(make({matches: [M()], sent: {4119501: {players: ['p1']}}})(null, '2026-03')
        .includes('kit-icons'));
  });

  it('a PAST one shows the result and drops the instructions', () => {
    const past = M({id: 999, date: '2026-03-01', time: '12:00'});
    const html = make({matches: [past], sent: {999: {players: ['p1']}},
      events: {999: [{type: 'goal', side: 'home'}, {type: 'goal', side: 'home'},
        {type: 'goal', side: 'away'}]}})(null, '2026-03');
    const cell = cellOf(html, '2026-03-01');
    assert.ok(cell.includes('cal-k-win'));
    assert.ok(cell.includes('2 – 1'));
    assert.ok(!cell.includes('conv-blink-dot'), 'a played game still nagging about the call-up');
    assert.ok(!cell.includes('cal-kick'), 'a played game still showing kick-off');
    assert.ok(!cell.includes('kit-icons'), 'a played game still showing the kit');
  });

  it('colours the result from OUR side, not the home side', () => {
    const ev = {9: [{type: 'goal', side: 'home'}, {type: 'goal', side: 'away'},
      {type: 'goal', side: 'away'}]};
    assert.ok(make({matches: [M({id: 9, date: '2026-03-01'})], events: ev})(null, '2026-03')
        .includes('cal-k-loss'), '1-2 at home is a loss');
    assert.ok(make({matches: [M({id: 9, date: '2026-03-01',
      home: 'INSPIRE SOCCER,F.C.', away: CLUB.name})], events: ev})(null, '2026-03')
        .includes('cal-k-win'), 'the same scoreline away is a win');
  });

  it('a draw is a draw either way', () => {
    const ev = {9: [{type: 'goal', side: 'home'}, {type: 'goal', side: 'away'}]};
    assert.ok(make({matches: [M({id: 9, date: '2026-03-01'})], events: ev})(null, '2026-03')
        .includes('cal-k-draw'));
  });
});

describe('the availability donut', () => {
  const MIXED = {
    p1_tr_1: 'yes', p2_tr_1: 'no', p3_tr_1: 'injured', p4_tr_1: 'late',
  };

  it('draws one arc per answer, in the app\'s own palette', () => {
    /* The same five the other four donuts use — renderPlayerHome,
       renderStaffPlayerStats, buildDetailDonut, buildAvailDonut. A single
       arc could say how many were coming; it could not say who had not
       replied, which is the question a coach actually has. */
    const html = make({trainings: [T()], avail: MIXED})(null, '2026-03');
    ['#66bb6a', '#ffa726', '#78909c', '#ef5350'].forEach((c) =>
      assert.ok(html.includes('stroke="' + c + '"'), 'missing arc ' + c));
    assert.strictEqual(count(html, /stroke-dashoffset=/g), 4,
        'expected four arcs for four different answers');
  });

  it('renders no arc for a state nobody is in', () => {
    // Not a zero-length one: a zero arc with a round cap still paints a dot.
    const html = make({trainings: [T()], avail: {
      p1_tr_1: 'yes', p2_tr_1: 'yes', p3_tr_1: 'yes', p4_tr_1: 'yes',
    }})(null, '2026-03');
    assert.strictEqual(count(html, /stroke-dashoffset=/g), 1);
    assert.ok(!html.includes('stroke="#ef5350"'), 'an empty injured arc was drawn');
  });

  it('counts an unrecognised or missing answer as not-answered', () => {
    const html = make({trainings: [T()], avail: {p1_tr_1: 'yes'}})(null, '2026-03');
    // The stub answers 'yes' by default, so force the others to nonsense.
    const na = make({trainings: [T()], avail: {
      p1_tr_1: 'yes', p2_tr_1: '?', p3_tr_1: '?', p4_tr_1: '?',
    }})(null, '2026-03');
    assert.ok(na.includes('stroke="#d0d0d0"'), 'no not-answered arc');
    assert.ok(html.length > 0);
  });

  it('keeps the count in the middle, and drops the word beside it', () => {
    const html = make({trainings: [T()], avail: MIXED})(null, '2026-03');
    assert.ok(html.includes('cal-donut-num'), 'the centre count is gone');
    assert.ok(html.includes('2/4'), 'yes + late is what "attending" means');
    assert.ok(!html.includes('cal-donut-lbl'), 'the label is still rendered');
    assert.ok(!/cal\.available|cal\.attended/.test(html), 'the label key is still used');
  });

  it('no longer distinguishes a past ring from an upcoming one', () => {
    // The segments carry the state now, so the single brown/teal value
    // stroke and its two classes have nothing left to say.
    const html = make({trainings: [
      T({id: 'tr_1', date: '2026-03-02'}),
      T({id: 'tr_2', date: '2026-03-10'}),
    ], avail: MIXED})(null, '2026-03');
    assert.ok(!/cal-donut-(next|past)/.test(html));
  });
});

describe('collapsed cells hold whole rows', () => {
  /* The handoff's one hard rule about the animation: every expanded-only
     field is conditionally hidden, never clipped, or a cell growing
     between two fixed heights shows half a line of text at its bottom
     edge for the length of the transition. */
  it('wraps every expanded-only field in the class that hides it', () => {
    const html = make({trainings: [T({plannedRpe: 7})], matches: [M()]})(null, '2026-03');
    assert.ok(count(html, /class="cal-x/g) > 0, 'nothing is marked expanded-only');
  });

  it('hides the SECOND thing on a day, not the first', () => {
    /* Split on the exact WRAPPER, `<div class="cal-x">`, not on the class
       name: expanded-only meta lines inside a block are `cal-x cal-meta`,
       so a substring test finds one of those and passes however the blocks
       are nested. That version of this test survived a mutation that
       unwrapped every block. */
    const html = make({matches: [M()], trainings: [T({date: '2026-03-07'})]})(null, '2026-03');
    const cell = cellOf(html, '2026-03-07');
    const parts = cell.split('<div class="cal-x">');
    assert.ok(parts.length > 1, 'nothing was wrapped as expanded-only');
    assert.ok(parts[0].includes('data-cal-match'),
        'the highest-priority block must survive collapsing');
    assert.ok(!parts[0].includes('data-cal-session'),
        'the second block was left visible when collapsed');
    assert.ok(parts.slice(1).join('').includes('data-cal-session'),
        'the hidden one is still rendered, just wrapped');
  });

  it('the stylesheet actually hides it, and shows it on an open strip', () => {
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    assert.ok(/\.cal-x\s*\{[^}]*display:\s*none/.test(css), '.cal-x does not hide anything');
    assert.ok(/\.cal-week:hover\s+\.cal-x/.test(css), 'hover does not reveal it');
    assert.ok(/\.cal-week-open\s+\.cal-x/.test(css), 'touch has no way to reveal it');
  });

  it('emits a FALLBACK open height, which bindCalendar then overwrites', () => {
    /* 172, or 262 when a day doubles up. These are no longer the heights
       the page uses: a Saturday with three fixtures was cut through a line
       of text, because block heights differ by kind and no constant can be
       right. bindCalendar measures each strip after render and writes the
       real value back as an inline custom property.

       That measurement needs a live layout, and there is no jsdom here, so
       what this pins is the fallback — the value a browser that never runs
       the measurement would fall back to. The measured behaviour is on the
       by-hand list. */
    const plain = make({trainings: [T()]})(null, '2026-03');
    assert.ok(plain.includes('--cal-open-h:172px'));
    const doubled = make({matches: [M()], trainings: [T({date: '2026-03-07'})]})(null, '2026-03');
    assert.ok(doubled.includes('--cal-open-h:262px'));
  });

  it('the source really does measure, and the stylesheet lets it', () => {
    // The half this file cannot execute, asserted where it can be seen.
    /* Comments stripped first, and the ADD asserted specifically. A plain
       substring test for `cal-week-measure` passes on the `remove()` call
       and on the note explaining it — a mutation deleting the `add()`
       survived exactly that. This repo's standing trap. */
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

    /* calMeasure is module-level, not a closure in bindCalendar: the
       resize listener outlives any one render and has to measure what is
       on screen rather than what was there when it was bound. */
    const measure = strip(src.slice(src.indexOf('  function calMeasure() {'),
        src.indexOf('  function calShift(')));
    assert.ok(/classList\.add\('cal-week-measure'\)/.test(measure),
        'nothing puts a strip into the measuring state');
    assert.ok(/classList\.remove\('cal-week-measure'\)/.test(measure),
        'the measuring state is never taken off again');
    assert.ok(/scrollHeight/.test(measure), 'nothing reads a natural height');
    assert.ok(/setProperty\('--cal-open-h'/.test(measure), 'the measurement is discarded');

    const bind = strip(src.slice(src.indexOf('  function bindCalendar()'),
        src.indexOf('  function calScheduleGhost')));
    assert.ok(/calMeasure\(\)/.test(bind), 'nothing measures after a render');
    assert.ok(/document\.fonts/.test(bind),
        'nothing re-measures once the webfont has loaded');
    assert.ok(/_calResizeBound/.test(bind),
        'the resize listener is unguarded and will stack up per render');

    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    assert.ok(/\.cal-week-measure \.cal-cell\s*\{[^}]*height:\s*auto/.test(css),
        'the measuring state does not open the cells');
    assert.ok(/\.cal-week-measure \.cal-x\s*\{[^}]*display:\s*block/.test(css),
        'the measuring state does not reveal the expanded rows');
  });

  it('NEVER puts a scrollbar in a cell', () => {
    /* A scrollbar inside an 80px cell is worse than anything it could
       rescue. The rule is: the measurement is right, or the cell clips. */
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    const open = /\.cal-week:hover \.cal-cell[^{]*\{([^}]*)\}/.exec(css);
    assert.ok(open, 'the open-cell rule is gone');
    assert.ok(!/overflow/.test(open[1]),
        'an open cell can scroll again: ' + open[1].trim());
  });

  it('measures in a state that MATCHES the open one', () => {
    /* The defect behind the scrollbars, and the reason it is asserted
       structurally rather than by outcome: `:hover` released `white-space`
       on the titles and the measuring state did not, so every wrapping
       focus name was measured one line short.

       Both declarations are shared rules naming the two selectors
       together — the only version of this that cannot drift apart again. */
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');

    /* Anchored on `.cal-b-ttl`, not on the declaration: the stylesheet has
       other `white-space: normal` rules and `exec` returns the first
       match in the file, which was a rule about something else entirely. */
    const ruleFor = (decl) => {
      const re = new RegExp('([^{}]*\\.cal-b-ttl[^{}]*)\\{([^}]*' + decl + '[^}]*)\\}');
      return re.exec(css);
    };

    const wrap = ruleFor('white-space:\\s*normal');
    assert.ok(wrap, 'nothing releases white-space on a title when a strip opens');
    assert.ok(/\.cal-week:hover \.cal-b-ttl/.test(wrap[1]) &&
      /\.cal-week-measure \.cal-b-ttl/.test(wrap[1]),
    'the open state and the measuring state do not share the wrap rule: ' + wrap[1].trim());

    const big = ruleFor('font-size:\\s*\\.88rem');
    assert.ok(big, 'the hover enlargement is gone');
    assert.ok(/\.cal-b:hover \.cal-b-ttl/.test(big[1]) &&
      /\.cal-week-measure \.cal-b-ttl/.test(big[1]),
    'hovering can grow a block past the height measured for it: ' + big[1].trim());
  });
});

describe('the week gutter', () => {
  it('prints the load as a NUMBER, with no colour band', () => {
    /* The handoff's bands (>650 amber, >800 red) were calibrated against
       `plannedRpe * 12` in the mock. Costed properly, two sessions and a
       match clear both — every week would be red. The figure ships; the
       band waits for real weeks. */
    const html = make({trainings: [
      T({id: 'a', date: '2026-03-03', plannedRpe: 7}),
      T({id: 'b', date: '2026-03-05', plannedRpe: 7}),
    ]})(null, '2026-03');
    assert.ok(html.includes('1.260') || html.includes('1,260'),
        'expected 2 x 630 AU in the gutter');
    assert.ok(!/cal-week-load-(low|mid|high)/.test(html), 'a week load band was rendered');
  });

  it('says so when a week has nothing to cost', () => {
    assert.ok(make({})(null, '2026-03').includes('load.no_data'));
  });

  it('flags a week holding sessions nobody rated', () => {
    // A light-looking week must never actually be an unrated one.
    const html = make({trainings: [
      T({id: 'a', date: '2026-03-03', plannedRpe: 7}),
      T({id: 'b', date: '2026-03-05'}),
    ]})(null, '2026-03');
    assert.ok(html.includes('cal-au-warn'), 'the unrated session is invisible');
  });

  it('leaves activities out of the load', () => {
    // A team dinner is not training load — the same rule trainingOnly()
    // enforces everywhere else.
    const withAct = make({trainings: [
      T({id: 'a', date: '2026-03-03', plannedRpe: 7}),
      T({id: 'x', date: '2026-03-04', kind: 'activity', title: 'Sopar', plannedRpe: 9}),
    ]})(null, '2026-03');
    const without = make({trainings: [
      T({id: 'a', date: '2026-03-03', plannedRpe: 7}),
    ]})(null, '2026-03');
    const au = (h) => (h.match(/<b>([\d.,]+)<\/b>/) || [])[1];
    assert.strictEqual(au(withAct), au(without));
  });
});

describe('a day that holds more than one match', () => {
  const GOALS = (h, a) => [].concat(
    Array.from({length: h}, () => ({type: 'goal', side: 'home'})),
    Array.from({length: a}, () => ({type: 'goal', side: 'away'})));

  /* Three fixtures on one past Saturday, one of each outcome — home wins
     2-1, home draws 1-1, away (us) loses 0-3. */
  const THREE = {
    matches: [
      M({id: 1, date: '2026-03-01', time: '10:00'}),
      M({id: 2, date: '2026-03-01', time: '12:00'}),
      M({id: 3, date: '2026-03-01', time: '16:00',
        home: 'INSPIRE SOCCER,F.C.', away: CLUB.name}),
    ],
    events: {1: GOALS(2, 1), 2: GOALS(1, 1), 3: GOALS(3, 0)},
  };

  it('keeps the cell NEUTRAL — there is no single result to colour it with', () => {
    const cell = cellOf(make(THREE)(null, '2026-03'), '2026-03-01');
    assert.ok(cell.includes('cal-k-match'), 'expected the neutral match fill');
    assert.ok(!/cal-k-(win|draw|loss)/.test(cell),
        'one arbitrary result coloured the whole day');
  });

  it('gives every score its OWN colour, beside its own rival', () => {
    const cell = cellOf(make(THREE)(null, '2026-03'), '2026-03-01');
    assert.strictEqual(count(cell, /cal-b-res/g), 3, 'expected three scores');
    ['cal-b-win', 'cal-b-draw', 'cal-b-loss'].forEach((c) =>
      assert.ok(cell.includes(c), 'missing ' + c));
    assert.ok(cell.includes('2 – 1') && cell.includes('1 – 1') && cell.includes('0 – 3'));
  });

  it('still colours a day that holds ONE game', () => {
    const one = make({matches: [M({id: 1, date: '2026-03-01', time: '12:00'})],
      events: {1: GOALS(2, 1)}})(null, '2026-03');
    const cell = cellOf(one, '2026-03-01');
    assert.ok(cell.includes('cal-k-win'), 'a single result no longer colours its day');
    assert.ok(cell.includes('cal-b-res'), 'the score should be beside the name either way');
  });

  it('a fixture PLUS a training is still one fixture', () => {
    // The neutral rule counts matches, not blocks.
    const cell = cellOf(make({
      matches: [M({id: 1, date: '2026-03-01', time: '12:00'})],
      events: {1: GOALS(2, 1)},
      trainings: [T({date: '2026-03-01'})],
    })(null, '2026-03'), '2026-03-01');
    assert.ok(cell.includes('cal-k-win'), 'a training stole the day\'s colour');
  });

  it('keeps a past day with ANY played match at full weight', () => {
    const cell = cellOf(make(THREE)(null, '2026-03'), '2026-03-01');
    assert.ok(cell.includes('cal-cell-past-res'),
        'three results faded like an ordinary past day');
  });

  it('no longer puts a score in the cell header', () => {
    // The header holds one, which is what made a three-game day wrong.
    const html = make(THREE)(null, '2026-03');
    assert.ok(!/class="cal-res"/.test(html), 'the header score is back');
  });
});

describe('the team-letter filter', () => {
  const MIXED = {
    trainings: [
      T({id: 'ta', date: '2026-03-03', teams: ['A']}),
      T({id: 'tb', date: '2026-03-05', teams: ['B']}),
      T({id: 'tall', date: '2026-03-04', teams: []}),
    ],
    matches: [
      M({id: 11, date: '2026-03-07', team: 'A'}),
      M({id: 12, date: '2026-03-14', team: 'B'}),
    ],
  };
  it('shows everything under "all"', () => {
    const html = make(Object.assign({letters: ['A', 'B']}, MIXED))(null, '2026-03', 'all');
    ['ta', 'tb', 'tall'].forEach((id) =>
      assert.ok(html.includes('data-cal-session="' + id + '"'), id + ' is missing'));
    assert.ok(html.includes('data-cal-match="11"') && html.includes('data-cal-match="12"'));
  });

  it('narrows sessions and fixtures to the chosen squad', () => {
    const html = make(Object.assign({letters: ['A', 'B']}, MIXED))(null, '2026-03', 'A');
    assert.ok(html.includes('data-cal-session="ta"'), 'A\'s session vanished');
    assert.ok(!html.includes('data-cal-session="tb"'), 'B\'s session survived the A filter');
    assert.ok(html.includes('data-cal-match="11"'), 'A\'s fixture vanished');
    assert.ok(!html.includes('data-cal-match="12"'), 'B\'s fixture survived the A filter');
  });

  it('keeps a row that belongs to NO squad — it belongs to all of them', () => {
    /* `teams: []` means every letter of the category, the rule
       trainingTeams() already encodes. Same for a fixture with no team. */
    const html = make(Object.assign({letters: ['A', 'B']}, MIXED))(null, '2026-03', 'B');
    assert.ok(html.includes('data-cal-session="tall"'),
        'a letter-less session was filtered out of its own category');
  });

  it('narrows the greyed placeholders too', () => {
    // Filtering to A and still being offered B's empty slots would be the
    // filter half-applied.
    const html = make({letters: ['A', 'B']})(null, '2026-03', 'A');
    assert.ok(html.includes('|A|'), 'A\'s placeholders vanished');
    assert.ok(!html.includes('|B|'), 'B\'s placeholders survived the A filter');
  });
});

describe('the greyed placeholders survived the redesign', () => {
  /* 2a gives an empty day a staff "+ Add" and nothing else. These are kept
     deliberately — one click still schedules the slot, which is the
     feature, so they render as a dashed block rather than as an absence. */
  it('appear on the club\'s own training days, in the future only', () => {
    const html = make({})(null, '2026-03');
    assert.ok(html.includes('data-cal-ghost="amateur|A|2026-03-05|21:00"'));
    assert.ok(html.includes('data-cal-ghost="amateur|A|2026-03-10|21:00"'));
    assert.ok(!html.includes('2026-03-03|21:00'), 'a placeholder in the past');
  });

  it('give way to a real session on the same slot', () => {
    const html = make({trainings: [T({date: '2026-03-05'})]})(null, '2026-03');
    assert.ok(!html.includes('data-cal-ghost="amateur|A|2026-03-05|21:00"'));
    assert.ok(html.includes('data-cal-ghost="amateur|A|2026-03-10|21:00"'),
        'the other placeholders must survive');
  });

  it('rank below everything real, so they never take a cell', () => {
    const html = make({matches: [M({date: '2026-03-10', time: '20:00'})]})(null, '2026-03');
    const cell = cellOf(html, '2026-03-10');
    assert.ok(cell.includes('cal-k-match'), 'a placeholder outranked a fixture');
    assert.ok(cell.includes('data-cal-ghost'), 'and it is still there, under it');
  });

  it('carry the microcycle position too — a coach plans with it', () => {
    const html = make({matches: [M()]})(null, '2026-03');
    const cell = cellOf(html, '2026-03-05');
    assert.ok(cell.includes('cal-b-ghost'));
    assert.ok(cell.includes('>M-2<'));
  });
});

describe('the calendar and who is looking at it', () => {
  const player = {id: 'p1', roles: ['player'], category: 'amateur', team: 'A'};

  it('a player gets no placeholders — an unscheduled slot is not an announcement', () => {
    const html = make({role: 'player'})(player, '2026-03');
    assert.ok(!html.includes('data-cal-ghost'));
  });

  it('a player gets no add button and no refresh', () => {
    const html = make({role: 'player'})(player, '2026-03');
    assert.ok(!html.includes('data-cal-add'));
    assert.ok(!html.includes('btn-fcf-refresh'));
  });

  it('a player still SEES his sessions and fixtures', () => {
    const html = make({role: 'player', trainings: [T()], matches: [M()]})(player, '2026-03');
    assert.ok(html.includes('data-cal-session="tr_1"'));
    assert.ok(html.includes('data-cal-match="4119501"'));
  });

  it('a player is not shown another squad\'s fixture', () => {
    assert.ok(!make({role: 'player', matches: [M({team: 'B'})]})(player, '2026-03')
        .includes('data-cal-match'));
  });

  /* A physio is staff, is called to no session, and may edit nothing. The
     calendar used to pick its training list on canEditPage('calendar'), so
     she fell into the PLAYER path — which shows only what the viewer is
     personally called to — and the whole month came up with no trainings at
     all while the fixtures showed, because the fixture filter narrows on
     session.category/team and both are empty for staff. */
  const physio = {id: 'nuria', roles: ['staff'], staffRole: 'fitness',
    category: '', team: ''};

  it('a VIEW-ONLY staff member still sees the club\'s sessions', () => {
    const html = make({role: 'fitness', trainings: [T()], matches: [M()]})(
        physio, '2026-03');
    assert.ok(html.includes('data-cal-session="tr_1"'),
        'she reads the schedule even though she writes nothing on it');
    assert.ok(html.includes('data-cal-match="4119501"'));
  });

  it('and sees a session for a squad she is not in', () => {
    // Staff are in no squad at all; narrowing by hers would show nothing.
    const html = make({role: 'fitness', trainings: [T({teams: ['B']})]})(
        physio, '2026-03');
    assert.ok(html.includes('data-cal-session="tr_1"'));
  });

  it('but still gets no controls', () => {
    const html = make({role: 'fitness', trainings: [T()]})(physio, '2026-03');
    assert.ok(!html.includes('data-cal-add'));
    assert.ok(!html.includes('data-cal-ghost'));
  });

  it('a read-only staff member gets the banner and no controls', () => {
    const html = make({role: 'fitness'})(null, '2026-03');
    assert.ok(html.includes('READONLY'));
    assert.ok(!html.includes('data-cal-add'));
  });

  it('a coach gets the add button on every day of the month, and the refresh', () => {
    const html = make({category: 'amateur'})(null, '2026-03');
    assert.strictEqual(count(html, /data-cal-add=/g), 31, 'March has 31 days');
    assert.ok(html.includes('btn-fcf-refresh'));
    assert.ok(!html.includes('READONLY'));
  });

  it('the refresh is live once a category with an FCF link is selected', () => {
    const html = make({category: 'amateur'})(null, '2026-03');
    assert.ok(!/id="btn-fcf-refresh"[^>]*disabled/.test(html));
  });

  it('and disabled, with a reason, when it cannot know which group to pull', () => {
    const html = make({})(null, '2026-03');
    assert.ok(/id="btn-fcf-refresh"[^>]*disabled/.test(html));
    assert.ok(html.includes('cal.refresh_none'), 'no reason given');
  });
});

describe('the top bar', () => {
  it('does NOT duplicate the app\'s category bar', () => {
    /* 2a puts category tabs in the calendar's own header. The app already
       renders one above every page in CATEGORY_PAGES, and two controls for
       one piece of state is how they end up disagreeing. */
    const html = make({})(null, '2026-03');
    assert.ok(!/cal-cat-tab|data-cal-cat/.test(html));
  });

  it('reclaims width WITHOUT trimming the page\'s own padding', () => {
    /* `.dashboard-tight` cut `.dashboard-content` to .75rem, and `.cat-bar`
       bleeds edge-to-edge with `margin:-2rem` sized to cancel the full 2rem
       — so the filter bar overshot by the difference and was clipped. The
       calendar pulls its OWN blocks out instead, which touches nothing
       shared. */
    /* Comments stripped from BOTH — the note explaining why the class was
       removed names it, and an unstripped scan finds that instead of a
       rule. The standing trap in this repo. */
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');
    const js = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    assert.ok(!/dashboard-tight/.test(css), '.dashboard-tight is back');
    assert.ok(!/dashboard-tight/.test(js), 'renderPage still toggles it');
    assert.ok(/\.cal-bar,\s*\.cal-weeks\s*\{[^}]*margin-left:\s*-1\.25rem/.test(css),
        'the calendar no longer reclaims any width');
    // And it must be undone where the page padding shrinks, or it overshoots
    // again one breakpoint down.
    const narrow = css.slice(css.indexOf('@media (max-width: 900px)'));
    assert.ok(/\.cal-bar,\s*\.cal-weeks\s*\{[^}]*margin-left:\s*0/.test(narrow),
        'the negative margin survives into the narrow layout');
  });

  it('offers letter chips only for a category that HAS more than one squad', () => {
    /* ONE builder for both pages since v203. The calendar and the roster
       differ only in which variable holds the active letter and which
       attribute the binder reads; the "one squad is not a choice" rule
       and the separator are shared, and were going to drift the moment
       they were written twice. */
    const chips = (letters, cat, active, attr) => {
      const stubs = {
        getCurrentCategory: () => cat, getTeamLetters: () => letters,
        sanitize, t: (k) => k,
      };
      return new Function(...Object.keys(stubs),
          grab('  function catBarLettersHtml(active, attr) {',
               '  /**\n   * Does this row belong') +
          '\n return catBarLettersHtml(' + JSON.stringify(active) + ', ' +
          JSON.stringify(attr) + ');')(...Object.values(stubs));
    };
    const cal = (l, c) => chips(l, c, 'all', 'data-cal-letter');
    assert.strictEqual(cal(['A'], 'amateur'), '', 'one squad is not a choice');
    assert.strictEqual(cal(['A', 'B'], ''), '', '"Totes" has no letter set to offer');
    const two = cal(['A', 'B'], 'amateur');
    assert.ok(two.includes('data-cal-letter="A"') && two.includes('data-cal-letter="B"'));
    assert.ok(two.includes('data-cal-letter="all"'), 'no way back to every squad');
    assert.ok(two.includes('cat-bar-sep'), 'nothing separates them from the categories');

    // The roster's chips, from the same builder, on its own attribute.
    const ros = chips(['A', 'B'], 'amateur', 'B', 'data-roster-filter');
    assert.ok(ros.includes('data-roster-filter="B"'), 'the roster gets its own attribute');
    assert.ok(!ros.includes('data-cal-letter'), "and none of the calendar's");
    /* The lit chip is whichever the CALLER named — that is the whole
       reason `active` is a parameter and not a captured variable. */
    const lit = ros.split('<button').filter((s) => s.includes('roster-team-btn-active'));
    assert.strictEqual(lit.length, 1, 'exactly one chip is lit');
    assert.ok(lit[0].includes('data-roster-filter="B"'), 'and it is the one passed in');
  });

  it('the roster bar drives the roster filter, the calendar its own', () => {
    /* Two pages share the builder; they must not share the state. The
       roster's top-bar chips and the chips beside its Jugadors heading
       both read and write `rosterTeamFilter`, which is what keeps the
       two sets in step without a second copy to synchronise. */
    const bar = src.slice(src.indexOf('function renderCategoryBar'),
        src.indexOf('// ---------- Club helpers'));
    assert.ok(/catBarLettersHtml\(calTeamFilter, 'data-cal-letter'\)/.test(bar),
        'the calendar keeps its own filter');
    assert.ok(/catBarLettersHtml\(rosterTeamFilter, 'data-roster-filter'\)/.test(bar),
        'the roster bar must drive rosterTeamFilter, not a third variable');
  });

  it('resets the letter when the category changes', () => {
    /* A letter means nothing in a category that does not have it. The
       cat-bar handler already did this for the roster and medical
       filters; the calendar's has to sit with them. */
    const handler = src.slice(src.indexOf("$$('.cat-bar-btn')"),
        src.indexOf("$$('[data-cal-letter]')"));
    assert.ok(/calTeamFilter = 'all'/.test(handler),
        'the calendar letter survives a category change');
    assert.ok(/rosterTeamFilter = 'all'/.test(handler),
        'expected it beside the filters that already do this');
  });

  it('has no page heading and no card around it', () => {
    /* "Calendari" was a heading over a page that fills the pane and is
       already named by the lit sidebar item; the frame was a border with
       nothing on the far side. The month label is the heading now. */
    const html = make({})(null, '2026-03');
    assert.ok(!html.includes('page-title'), 'the h2 is still there');
    assert.ok(!html.includes('cal-card'), 'the frame is still there');
    assert.ok(html.indexOf('cal-bar') < html.indexOf('cal-weeks'),
        'the bar should now open the page');
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    assert.ok(!/\.cal-card\s*\{/.test(css), '.cal-card is still styled');
    assert.ok(/\.cal-month\s*\{[^}]*font-size:\s*1\.5rem/.test(css),
        'the month label did not take the heading size');
  });

  it('separates weeks with a rule, not a box', () => {
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');
    const wk = /\.cal-week\s*\{([^}]*)\}/.exec(css);
    assert.ok(wk, '.cal-week is gone');
    assert.ok(/border-bottom:\s*1px/.test(wk[1]), 'no rule between weeks');
    assert.ok(!/border-radius/.test(wk[1]), 'the box corners are still there');
    assert.ok(!/^\s*border:\s/m.test(wk[1]), 'the box border is still there');
    assert.ok(/\.cal-week:last-child\s*\{[^}]*border-bottom:\s*0/.test(css),
        'the last week draws a rule with nothing under it');
    // The tint replaces the border as the "this one is open" cue.
    assert.ok(/\.cal-week:hover[^{]*\{[^}]*background:/.test(css),
        'nothing marks the open strip now the border has gone');
  });

  it('gives the month arrows no box, and the week number weight', () => {
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');
    const arrow = /\.cal-arrow\s*\{([^}]*)\}/.exec(css);
    assert.ok(arrow, '.cal-arrow is gone');
    assert.ok(/border:\s*0/.test(arrow[1]), 'the arrows still have a box');
    assert.ok(/color:\s*var\(--primary\)/.test(arrow[1]), 'the arrows are not red');
    assert.ok(/width:\s*30px/.test(arrow[1]), 'the hit area shrank to the glyph');
    assert.ok(/\.cal-arrow:hover\s*\{[^}]*font-weight:\s*800/.test(css),
        'the arrows do not bolden on hover');
    // The border was carrying focus; something has to replace it.
    assert.ok(/\.cal-arrow:focus-visible/.test(css), 'keyboard focus is now invisible');
    assert.ok(/\.cal-wk\s*\{[^}]*font-weight:\s*700/.test(css),
        'the week number is not bold');
  });

  it('draws are GREY, not the amber the handoff specifies', () => {
    // The one place the design and the owner disagree. Fill and scoreline
    // both, or a grey cell would carry an amber number.
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    const draw = /\.cal-k-draw\s*\{([^}]*)\}/.exec(css);
    assert.ok(draw, '.cal-k-draw is gone');
    assert.ok(!/B0781A|F4EDDC/.test(draw[1]), 'the amber draw is still there: ' + draw[1]);
    // The scoreline moved into the block, so the selector did too.
    const res = /\.cal-b-draw \.cal-b-res\s*\{([^}]*)\}/.exec(css);
    assert.ok(res, 'the drawn scoreline has no colour of its own');
    assert.ok(!/B0781A/.test(res[1]), 'the drawn scoreline is still amber');
  });

  it('carries the load legend, which documents a dot that is real', () => {
    const html = make({})(null, '2026-03');
    assert.ok(html.includes('load.legend'));
    ['cal-load-low', 'cal-load-mid', 'cal-load-high'].forEach((c) =>
      assert.ok(html.includes(c), c + ' missing from the legend'));
    assert.ok(html.includes('1–4') && html.includes('5–7') && html.includes('8–10'));
  });
});

describe('the stranded drafts from the old Calendari', () => {
  it('are offered back, not dropped', () => {
    const html = make({drafts: [
      {opponent: 'X', date: '2026-04-01', category: 'amateur'},
      {opponent: 'Y', date: '2026-04-08', category: 'amateur'},
    ]})(null, '2026-03');
    assert.ok(html.includes('btn-cal-drafts-keep'));
    assert.ok(html.includes('btn-cal-drafts-drop'));
  });

  it('ignore an empty form — that is not work worth rescuing', () => {
    assert.ok(!make({drafts: [{opponent: '', date: ''}]})(null, '2026-03').includes('cal-drafts'));
  });

  it('are never offered to someone who could not act on them', () => {
    assert.ok(!make({role: 'player', drafts: [{opponent: 'X', date: '2026-04-01'}]})(
        {id: 'p1', roles: ['player'], category: 'amateur', team: 'A'}, '2026-03')
        .includes('cal-drafts'));
  });
});
