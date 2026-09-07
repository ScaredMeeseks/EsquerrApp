/* What a PLAYER sees when they open a training.
 *
 * `npm run test:trainingdetail`.
 *
 * The page was rebuilt onto the coach's `.std-` layout (v243) and cut down
 * to three things: the title, the forecast, and who is coming. Two separate
 * risks, and this suite exists for both:
 *
 *   1. It must RENDER. `renderTrainingDetail` is a string builder called
 *      through innerHTML, so a helper that no longer exists is a blank page
 *      for every player with a green suite behind it. Nothing else in the
 *      repo calls this function, so it is called here — not read.
 *
 *   2. It must not leak. Everything the coach's page carries that a player
 *      may not have — the planned intensity, the load, the session plan and
 *      its material, the team generator, and the readiness / ACWR / medical
 *      columns that are a judgement about a team-mate's body — has to be
 *      absent from the OUTPUT, not merely absent from the source.
 *
 * The bar and the answer column are built by the REAL buildDetailBar and
 * stdAvailDot, sliced in beside the page, so an assertion that the row and
 * the segment agree is testing the app rather than the harness.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const U = require(path.join(root, 'js', 'utils.js'));
const {readCss} = require('./read-css');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

const sanitize = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* Catalan, because a coach's word appearing on a player's page is one of the
   things being asserted and `(k) => k` would make every label look alike. */
const LABEL = {
  'avail.yes': 'Sí', 'avail.late': 'Tard', 'avail.no': 'No',
  'avail.injured': 'Lesionat', 'avail.na': 'N/D',
  'btn.back': 'Enrere', 'training.badge': 'Entrenament',
  'cal.activity': 'Activitat', 'cal.training': 'Entrenament',
  'std.player_attendance': 'Assistència de jugadors',
  'std.th_player': 'Jugador', 'std.th_pos': 'Pos', 'std.th_answer': 'Resposta',
  'training.not_found': 'Entrenament no trobat',
  'wx.sun': 'Sol', 'wx.rain': 'Pluja', 'wx.wind': 'Vent',
  'wx.calm': 'Calma', 'wx.breeze': 'Brisa', 'wx.moderate': 'Moderat',
  'wx.strong': 'Fort', 'wx.too_far': 'Previsió disponible 3 dies abans',
  'wx.rain_share_training': 'Pluja durant un {n}% de la sessió',
};

/* Deliberately declared out of playing order — GK last — so an assertion
   about the order is testing posRankGlobal and not the fixture. */
const SQUAD = [
  {id: 'p4', name: 'Aleix Vila', roles: ['player'], category: 'amateur',
    team: 'A', position: 'ST'},
  {id: 'p3', name: 'Joan Serra', roles: ['player'], category: 'amateur',
    team: 'A', position: 'DM'},
  {id: 'p2', name: 'Marc Puig', roles: ['player'], category: 'amateur',
    team: 'A', position: 'CB'},
  {id: 'p1', name: 'Pau Roca', roles: ['player'], category: 'amateur',
    team: 'A', position: 'GK'},
  {id: 's1', name: 'El Mister', roles: ['staff'], category: 'amateur'},
];

const TR = (over) => Object.assign({
  id: 'tr_1', kind: 'training', date: '2026-03-10', time: '21:00 - 22:30',
  focus: 'Pressió alta', category: 'amateur', teams: ['A'],
  location: 'Camp Industrial', mapLink: 'https://maps.example/x',
  plannedRpe: 7, guests: [], excluded: [],
}, over);

/**
 * Render the page over stubs.
 * @param {Object} o `tr`, `avail`, `overrides`, `users`, `locked`.
 * @return {string} the HTML the player would be shown.
 */
function render(o) {
  o = o || {};
  const tr = o.tr === undefined ? TR() : o.tr;
  const users = o.users || SQUAD;

  const stubs = {
    detailTrainingId: tr ? tr.id : 'tr_missing',
    getTrainings: () => (tr ? [tr] : []),
    getUsers: () => users,
    t: (k) => (k in LABEL ? LABEL[k] : k),
    sanitize,
    /* The REAL rule for who is called. A stub that let everyone through
       could not tell an excluded player from an included one, which is half
       of what the squad list is for. */
    calledPlayers: new Function('playerIsCalled',
        grab('  function calledPlayers(t, users) {',
            '  /** The sessions a player is called to')
        + '\n return calledPlayers;')(
        (t, u) => (t.category ? t.category === u.category : true)
          && (t.excluded || []).map(String).indexOf(String(u.id)) === -1),
    catSpanOf: U.catSpanOf,
    catBadgeHtmlGlobal: () => '',
    posCirclesHtmlGlobal: (p) => '<span class="pos-circle">' +
      sanitize(String(p.position || '').split(',')[0]) + '</span>',
    posRankGlobal: U.posRankGlobal,
    isActivity: U.isActivity,
    activityTitleOf: U.activityTitleOf,
    isTrainingLocked: () => !!o.locked,
    availContext: () => ({availData: o.avail || {}, overrides: o.overrides || {}}),
    /* Sliced, not stubbed: the staff override winning over the player's own
       answer is exactly what the answer column claims to show. A stub would
       be asserting the harness. */
    getEffectiveAnswer: new Function('readRecord', 'availContext',
        grab('  function getEffectiveAnswer(playerId, sess, locked, ctx) {',
            '  // #region Session plan')
        + '\n return getEffectiveAnswer;')(
        (bag, uid, sess, kind) => (bag || {})[uid + '_' + sess.id + '_' + kind],
        () => ({availData: o.avail || {}, overrides: o.overrides || {}})),
    tDateLong: (d) => 'dimarts, 10 de març',
    locationHtml: (row) => '<a class="std-place" href="' +
      sanitize(row.mapLink || '') + '">' + sanitize(row.location || '—') + '</a>',
    backTarget: (fallback) => fallback,
    safeHttpUrl: U.safeHttpUrl,
    wxDaysOut: () => (o.daysOut === undefined ? 1 : o.daysOut),
    Date: class extends Date {
      constructor(...a) { return a.length ? new Date(...a) : new Date('2026-03-10T12:00:00'); }
      static now() { return new Date('2026-03-10T12:00:00').getTime(); }
    },
  };

  const fn = new Function(...Object.keys(stubs), `
    ${grab('  const STP_WEATHER_ICON = {', '  function wxDaysOut(row) {')}
    ${grab('  /* The five attendance colours', '  // ── Team generation ──')}
    ${grab('  function renderTrainingDetail', '  // getSeasonWeek → utils.js')}
    return renderTrainingDetail;`)(...Object.values(stubs));
  return fn();
}

const A = (uid, ans) => ({[uid + '_tr_1_avail']: ans});
const count = (html, re) => (html.match(re) || []).length;

/* The <tbody>, so counting rows does not also count the header — and
   `<th[ >]`, because `/<th/` matches `<thead>` too. Both caught a green
   assertion that was counting one more than it meant to. */
const bodyOf = (html) =>
  html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));

/* One <tr> of the squad table, by the name in it. */
const rowOf = (html, name) => {
  const at = html.indexOf(name);
  assert.notStrictEqual(at, -1, 'no row for ' + name);
  const start = html.lastIndexOf('<tr>', at);
  return html.slice(start, html.indexOf('</tr>', at));
};

describe('the player training page renders at all', () => {
  it('produces the coach page\'s shell, not the old detail cards', () => {
    const html = render({});
    ['std-page', 'std-topbar', 'std-body', 'std-main', 'std-hero',
      'std-title', 'std-meta', 'std-attbar', 'std-table'].forEach((c) => {
      assert.ok(html.includes('class="' + c + '"') ||
          html.includes(c + '"') || html.includes(c + ' '),
      'the ' + c + ' block is missing — this is not the coach\'s layout');
    });
    assert.ok(!/detail-hero|detail-grid|detail-card/.test(html),
        'the old .detail-* card layout is still being built');
  });

  it('says so when the session is gone, without throwing', () => {
    const html = render({tr: null});
    assert.ok(/Entrenament no trobat/.test(html));
    assert.ok(!/std-page/.test(html), 'the empty state is not the page');
  });

  it('carries the title, the date, the time and the place', () => {
    const html = render({});
    assert.ok(/<h1 class="std-title">Pressió alta<\/h1>/.test(html));
    assert.ok(html.includes('dimarts, 10 de març'));
    assert.ok(html.includes('21:00 - 22:30'));
    assert.ok(html.includes('Camp Industrial'));
  });

  it('titles an activity with its own name and badge', () => {
    const html = render({tr: TR({kind: 'activity', title: 'Sopar d\'equip',
      focus: ''})});
    assert.ok(/<h1 class="std-title">Sopar d&#039;equip|Sopar d'equip/.test(html) ||
        html.includes('Sopar d&quot;equip') || html.includes('Sopar d\'equip'),
    'the activity title is not on the page');
    assert.ok(html.includes('Activitat'), 'an activity is badged as one');
  });

  it('escapes a title that is trying to be markup', () => {
    const html = render({tr: TR({focus: '<img src=x onerror=alert(1)>'})});
    assert.ok(!/<img src=x/.test(html), 'the focus went in unsanitised');
    assert.ok(html.includes('&lt;img'));
  });
});

describe('the forecast', () => {
  it('is beside the title when there is one', () => {
    const html = render({tr: TR({weather: {cond: 'rain', windMs: 6.2,
      tempC: 11, rainPct: 40}})});
    assert.ok(/class="std-wx"/.test(html), 'no forecast strip');
    assert.ok(html.includes('🌧️'), 'the condition icon is missing');
    assert.ok(html.includes('11°'), 'the temperature is missing');
    assert.ok(/std-wx-rain/.test(html) && html.includes('40'),
        'a 40% rain share must be said');
    // Inside the hero row, above the attendance — not loose at the bottom.
    assert.ok(html.indexOf('std-wx') < html.indexOf('std-attbar'));
  });

  it('explains itself more than three days out', () => {
    const html = render({tr: TR({weather: null}), daysOut: 5});
    assert.ok(/std-wx-soon/.test(html));
    assert.ok(html.includes('Previsió disponible 3 dies abans'));
  });

  it('says nothing at all for a past session that never had one', () => {
    const html = render({tr: TR({weather: null}), daysOut: -2});
    assert.ok(!/std-wx/.test(html), 'an empty forecast is not information');
  });

  it('is left off an activity, like the coach\'s page', () => {
    const html = render({tr: TR({kind: 'activity', title: 'Sopar',
      weather: {cond: 'sun', windMs: 1, tempC: 20, rainPct: 0}})});
    assert.ok(!/std-wx/.test(html));
  });
});

describe('who is coming', () => {
  it('lists the called squad, and only players', () => {
    const html = render({});
    assert.strictEqual(count(bodyOf(html), /<tr>/g), 4, 'one row per called player');
    ['Pau Roca', 'Marc Puig', 'Joan Serra', 'Aleix Vila'].forEach((n) => {
      assert.ok(html.includes(n), n + ' is missing');
    });
    assert.ok(!html.includes('El Mister'), 'staff are not in the squad list');
  });

  it('honours the session\'s exclusions', () => {
    const html = render({tr: TR({excluded: ['p3']})});
    assert.ok(!html.includes('Joan Serra'),
        'an excluded player is not coming and must not be listed');
    assert.strictEqual(count(bodyOf(html), /<tr>/g), 3);
  });

  it('is ordered keepers first, then by name', () => {
    const html = render({});
    const at = (n) => html.indexOf(n);
    assert.ok(at('Pau Roca') < at('Marc Puig'), 'the keeper leads the list');
    assert.ok(at('Marc Puig') < at('Joan Serra'));
    assert.ok(at('Joan Serra') < at('Aleix Vila'));
  });

  it('has exactly three columns: player, position, answer', () => {
    const html = render({});
    const head = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
    assert.strictEqual(count(head, /<th[ >]/g), 3, head);
    assert.ok(head.includes('Jugador') && head.includes('Pos') &&
        head.includes('Resposta'));
    // Three cells per row too — a header that lies about the body is worse
    // than either being wrong.
    assert.strictEqual(count(rowOf(html, 'Marc Puig'), /<td/g), 3);
  });

  it('shows each answer with the bar\'s own colour', () => {
    const html = render({avail: Object.assign(A('p1', 'yes'), A('p2', 'late'),
        A('p3', 'no'), A('p4', 'injured'))});
    assert.ok(/Pau Roca[\s\S]*?background:#7CA982/.test(rowOf(html, 'Pau Roca')));
    assert.ok(/background:#E3B341/.test(rowOf(html, 'Marc Puig')));
    assert.ok(/background:#A8A29B/.test(rowOf(html, 'Joan Serra')));
    assert.ok(/background:#C0564C/.test(rowOf(html, 'Aleix Vila')));
    ['Sí', 'Tard', 'No', 'Lesionat'].forEach((w) => assert.ok(html.includes(w)));
  });

  it('shows the STAFF answer when the coach has overridden one', () => {
    /* The override is the answer that stands — it is what the bar counts and
       what the coach is planning around. A row still showing the player's
       own "Sí" would say the squad is one bigger than it is. */
    const html = render({avail: A('p2', 'yes'), overrides: A('p2', 'injured')});
    const row = rowOf(html, 'Marc Puig');
    assert.ok(row.includes('Lesionat'), 'the override is not shown');
    assert.ok(!row.includes('>Sí'), 'the superseded answer is still there');
  });

  it('agrees with the bar above it, count for count', () => {
    const html = render({avail: Object.assign(A('p1', 'no'), A('p2', 'no'),
        A('p3', 'late'))});
    // p4 never answered and the session is open, so getEffectiveAnswer
    // counts them as a yes — in the bar AND in the row.
    const key = html.slice(html.indexOf('std-bar-key'), html.indexOf('</thead>'));
    assert.ok(/No 2/.test(key), key);
    assert.ok(/Tard 1/.test(key), key);
    assert.ok(/Sí 1/.test(key), key);
    assert.ok(rowOf(html, 'Aleix Vila').includes('Sí'));
    assert.strictEqual(count(html, /background:#A8A29B/g), 4,
        'two rows, plus the bar\'s segment and its key square');
  });

  it('reads every unanswered player as N/D once answers are frozen', () => {
    const html = render({locked: true});
    assert.strictEqual(count(html, /N\/D/g), 5, 'four rows and one key entry');
  });

  it('draws no bar for a session nobody is called to', () => {
    const html = render({tr: TR({excluded: ['p1', 'p2', 'p3', 'p4']})});
    assert.ok(!/std-bar/.test(html), 'an empty bar is a 0%-wide nothing');
    assert.ok(/std-table/.test(html), 'the table still frames the emptiness');
  });
});

describe('what a player must NOT be shown', () => {
  const html = () => render({tr: TR({weather: {cond: 'sun', windMs: 2,
    tempC: 18, rainPct: 0}})});

  it('gets none of the coach\'s dosing figures', () => {
    const h = html();
    assert.ok(!/std-stats|std-stat-v|std-stat-hot/.test(h),
        'the planned RPE / load / duration strip is on the player page');
    assert.ok(!h.includes('7'.padStart(1) + ' · '), 'the planned RPE leaked');
    assert.ok(!/UA/.test(h), 'the session load in UA leaked');
  });

  it('gets no session plan and no material list', () => {
    const h = html();
    assert.ok(!/std-rail|stp-|plan\./.test(h));
  });

  it('gets no team generator', () => {
    const h = html();
    assert.ok(!/std-teams-block|std-tg-|std-chip/.test(h));
  });

  it('gets no judgement about a team-mate\'s body', () => {
    const h = html();
    assert.ok(!/roster-status-icon/.test(h), 'the medical glyph leaked');
    assert.ok(!/rdn-|readiness/i.test(h), 'the readiness dot leaked');
    assert.ok(!/std-num/.test(h), 'the A/C ratio column leaked');
  });

  it('gets no tactical boards', () => {
    const h = html();
    assert.ok(!/ro-ptd-|detail-boards-panel|tb-linked-teams/.test(h));
  });

  it('gets nothing that writes', () => {
    /* Every control on the coach's page is an edit. If one of them reached a
       player it would either fail the rules or, worse, succeed — so the page
       must carry no select, no button beyond Back, and no data- hook that
       bindDynamicActions binds by name. */
    const h = html();
    assert.ok(!/std-sel|<select/.test(h), 'a dropdown reached the player');
    assert.ok(!/std-drop|std-add-player|std-delete|std-edit-activity/.test(h));
    assert.ok(!/data-std-|data-avail|data-player=/.test(h),
        'a bound write hook reached the player');
    assert.strictEqual(count(h, /<button/g), 1, 'Back is the only button');
    assert.ok(/class="std-back detail-back"/.test(h));
  });

  it('gets no squad filter — that is a coach\'s working control', () => {
    const h = html();
    assert.ok(!/std-team-btn/.test(h));
  });
});

describe('the pieces it leans on', () => {
  it('has the answer heading in all three languages', () => {
    const m = /'std\.th_answer':\s*\{([^}]+)\}/.exec(src);
    assert.ok(m, 'std.th_answer is not defined — t() would print the key');
    ['ca:', 'es:', 'en:'].forEach((tag) => assert.ok(m[1].includes(tag),
        'std.th_answer is missing ' + tag));
  });

  it('styles .std-ans, inside the Pla d\'entrenament block', () => {
    const css = readCss();
    const at = css.indexOf('.std-ans {');
    assert.notStrictEqual(at, -1, '.std-ans has no rule');
    /* Between .std-table and the next page's banner: the paper blocks are
       sliced by position and a rule appended after the file's last block is
       read as that page's. */
    assert.ok(at > css.indexOf('.std-table {'), '.std-ans is above its block');
    /* ⚠ `.pl-page {` with its brace, not the bare name. Since v246 the ten
       paper roots share one geometry rule up beside `.dashboard-content`, so
       the bare `.pl-page` first appears in a selector LIST near the top of the
       file — above `.std-ans` — and this bound inverted. */
    assert.ok(at < css.indexOf('.pl-page {'), '.std-ans is outside .std-');
    const rule = css.slice(at, css.indexOf('}', at));
    assert.ok(/inline-flex/.test(rule), 'the dot and the word must share a line');
  });

  it('paints the bar and the answer column from one table', () => {
    /* Both are inline styles, and a second literal inside this block is
       exactly how a legend and the rows it explains end up disagreeing about
       what "Tard" looks like. Scoped to the block rather than the whole file:
       Plantilla's load charts use the same green for their own reasons and
       are not part of this page's contract. */
    const block = grab('  /* The five attendance colours',
        '  // ── Team generation ──');
    assert.ok(/const STD_AVAIL_COLORS = \{/.test(block));
    assert.strictEqual((block.match(/#[0-9A-F]{6}/gi) || []).length, 5,
        'a colour literal has crept back in beside the table');
    assert.ok(/STD_AVAIL_COLORS\[k\]/.test(block),
        'buildDetailBar must read the table, not its own list');
    assert.ok(/function stdAvailDot/.test(block) &&
        /STD_AVAIL_COLORS\[k\] \|\| STD_AVAIL_COLORS\.na/.test(block),
    'an unknown answer must still get a square');
    assert.strictEqual((readCss().match(/#7CA982/gi) || []).length, 0,
        'the palette must not be duplicated into the stylesheet');
  });

  /* ── Geometry. These four were all found by RENDERING the page in headless
     Chrome, and not one of them is visible in the HTML string the assertions
     above read. They are pinned here because the rules are load-bearing and
     read like tidying. ── */
  it('caps the column, because it has no rail to share the width with', () => {
    const css = readCss();
    assert.ok(/\.std-main-solo \{[^}]*max-width:\s*960px/.test(css),
        'without this the 3-column table stretched to 1376px at 1440');
    const page = grab('  function renderTrainingDetail', '  // getSeasonWeek');
    assert.ok(/class="std-main std-main-solo"/.test(page),
        'the modifier is not on the column');
    const staff = grab('  function renderStaffTrainingDetail', '  function buildDetailBar');
    assert.ok(!/std-main-solo/.test(staff),
        'the coach HAS a rail — capping his column would leave a gap beside it');
  });

  it('stops the stacked column shrink-wrapping to the table', () => {
    /* `.std-body` is align-items:flex-start, so below 900px the cross axis is
       shrink-to-fit and .std-main sized itself to `min-width:560px`. At 390px
       the document was 592px wide and the whole page scrolled sideways. */
    const css = readCss();
    const mq = css.slice(css.indexOf('@media (max-width: 900px)'));
    const block = mq.slice(0, mq.indexOf('\n}'));
    assert.ok(/\.std-main \{[^}]*width:\s*100%/.test(block),
        '.std-main must stretch once the rail stacks under it');
    assert.ok(/\.std-main-solo \.std-table \{[^}]*min-width:\s*0/.test(block),
        '560px pushed Resposta behind a horizontal scroll on a phone');
  });

  it('drops the forecast below the title on a phone', () => {
    /* 392px of `flex:none` nowrap strip in a 318px hero row — the second
       source of the sideways scroll, and the one a screenshot at 1440 can
       never show. */
    const css = readCss();
    const mq = css.slice(css.indexOf('@media (max-width: 900px)'));
    const block = mq.slice(0, mq.indexOf('\n}'));
    assert.ok(/\.std-wx \{[^}]*flex:\s*1 1 100%/.test(block));
    assert.ok(/\.std-wx \{[^}]*justify-content:\s*flex-start/.test(block));
    // The fixture page's strip is centred by a more specific rule and must
    // stay that way.
    assert.ok(/\.detail-hero \.std-wx \{[^}]*justify-content:\s*center/.test(css));
  });

  it('no longer builds the donut nothing calls', () => {
    assert.ok(!/function buildAssistanceCircle/.test(src),
        'the old assistance donut is back');
    // The CLASS is still alive elsewhere — My Stats builds that markup itself.
    assert.ok(/assistance-circle/.test(src));
  });
});
