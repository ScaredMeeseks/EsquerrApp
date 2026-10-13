/* Accions — the player's RPE inbox, rebuilt in `.ac-` (v245).
 *
 * WHAT FAILS SILENTLY HERE:
 *
 * 1. ⚠ THE EDIT WINDOW. Before v245 answering was one-way: the card vanished
 *    the moment a record existed. The window is the only new RULE on this
 *    page and the only thing that decides whether a row is a form or a
 *    figure — and a clock bug in it is invisible until the day after.
 *    Every case below freezes the clock; none uses `new Date()`.
 * 2. ⚠ THE BADGE AND THE PAGE DISAGREEING. They kept two copies of the same
 *    filters, with a comment saying they must agree. They read one model now,
 *    and the test that matters compares the two on ONE fixture.
 * 3. ⚠ THE EXTRAS LIST. It was read into a variable and never rendered, so a
 *    logged extra disappeared on the next repaint and the page said the
 *    player had done none. Nothing about that looks broken.
 * 4. ⚠ THE BUILDER NOT BEING CALLED. v238 shipped a Plantilla that rendered
 *    nothing past 3080 green tests. Every render test below CALLS it.
 *
 * `npm run test:ms`'s sibling: `npm run test:accions`.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readCss } = require('./read-css');
const { JSDOM } = require('jsdom');
const utils = require('../js/utils.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
const css = readCss();
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/* The `.ac-` block, bounded by the `.nf-` banner that follows it. */
const ACBANNER = '/* ===== Accions, redesigned (v245)';
const NFBANNER = '/* ===== Notificacions, redesigned (v245)';
const ACSTART = css.indexOf(ACBANNER);
assert.ok(ACSTART !== -1, 'the ac- block banner is gone from css/style.css');
const ACEND = css.indexOf(NFBANNER, ACSTART);
assert.ok(ACEND !== -1, 'the .nf- banner that bounds this slice is gone');
const ACCSS = css.slice(ACSTART, ACEND).replace(/\/\*[\s\S]*?\*\//g, '');

const SANITIZE_SRC = utilsSrc.slice(
    utilsSrc.indexOf('function sanitize(str) {'),
    utilsSrc.indexOf('// ---------- Tactical Formations ----------'));

// ── fixtures ──────────────────────────────────────────────────────────────
const NOW = new Date(2026, 8, 2, 18, 30);          // dc 2 setembre 2026, 18:30
const iso = (d) => utils.localDateStr(d);
const back = (n) => { const d = new Date(NOW); d.setDate(d.getDate() - n); return iso(d); };

const SESSION = { id: 'p1', name: 'Marc Rovira' };
const TRAININGS = [
  { id: 't1', date: back(2), time: '19:30', endTime: '21:00', focus: 'Sessió de força', location: 'Camp' },
  { id: 't2', date: back(1), time: '20:00', endTime: '21:15', focus: 'Sessió tàctica', location: 'Joc' },
  { id: 't3', date: back(6), time: '19:30', endTime: '21:00', focus: 'Resistència', location: 'Camp' },
  // Tonight, not finished yet — must not be askable.
  { id: 't4', date: back(0), time: '20:00', endTime: '21:15', focus: 'Aquesta nit', location: 'Camp' },
];
const MATCHES = [{ id: 'm1', date: back(1), time: '12:15',
  home: 'CF Vilassar de Mar', away: 'CE L\'Esquerra', team: 'A' }];

function load(over) {
  const o = over || {};
  const rpe = o.rpe || {};
  const avail = o.avail || {};
  const store = {
    fa_player_rpe: JSON.stringify(rpe),
    fa_matches: JSON.stringify(o.matches || MATCHES),
    fa_training_availability: JSON.stringify(avail),
    fa_training_staff_override: JSON.stringify(o.override || {}),
  };
  const api = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    getSession: () => (o.session === null ? null : SESSION),
    getTrainings: () => (o.trainings || TRAININGS),
    trainingOnly: (l) => l,
    playerTrainings: (u, l) => l,
    sessionEndsAt: (tr) => new Date(tr.date + 'T' + (tr.endTime || '21:00') + ':00'),
    matchEndsAt: (m) => new Date(m.date + 'T' + m.time + ':00'),
    sessionMinutes: () => 90,
    playerMatchMinutesKnown: () => 78,
    readRecord: (blob, uid, sess, kind) =>
      blob[uid + (kind === 'rpe' ? '_training_' : '_') + sess.id],
    recordKey: (uid, sess, kind) =>
      uid + (kind === 'rpe' ? '_training_' : '_') + sess.id,
    isOurTeam: (n) => n === 'CE L\'Esquerra',
    matchState: utils.matchState,   // v286, the real one
    getSeasonWeek: utils.getSeasonWeek,
    localDateStr: utils.localDateStr,
    ACTION_MINUTES_MAX: 300,
    MATCH_MINUTES_MAX: 100,
    t: (k) => k,
    tv: (k, v) => k + ':' + JSON.stringify(v),
    tDayShort: (i) => 'd' + i,
    tDayDDMM: (d) => String(d).slice(8) + '/' + String(d).slice(5, 7),
    tDateLong: (d) => 'long(' + d + ')',
    document: { createElement: () => ({ set textContent(v) { this._v = v; }, get innerHTML() { return String(this._v); } }) },
  };
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(api), `
    ${SANITIZE_SRC}
    ${grab('  /* ── Accions, redesigned (v245) ──', '  // #endregion Player Pages & Actions')}
    /* Freeze the clock. ⚠ EVERY argument forwarded: rpeEditableUntil builds
       its boundary with new Date(y, m, d), and a shim that passed only the
       first turned that into 2.026 seconds after the epoch — every window
       closed in 1970 and the page rendered no answered rows at all. */
    const _now = new Date(${(o.now || NOW).getTime()});
    const _real = Date;
    Date = function (...a) { return a.length ? new _real(...a) : new _real(_now.getTime()); };
    Date.prototype = _real.prototype; Date.now = () => _now.getTime();
    Date.parse = _real.parse; Date.UTC = _real.UTC;
    try {
      return { html: renderPlayerActions(), badge: getPendingActionCount(),
               model: playerActionModel(getSession(), new Date()),
               rpeEditable, rpeEditableUntil, acRpeBand, extraTagLabel };
    } finally { Date = _real; }
  `)(...Object.values(api));
}

// ═══════════════════════════════════════════════════════════════════════════
describe('Accions — the page renders at all', () => {
  it('builds a page, not an exception', () => {
    const h = load().html;
    assert.ok(h.includes('id="ac-page"'), 'no page root');
    assert.ok(h.length > 1500, 'suspiciously short: ' + h.length);
  });

  it('names every ac.* and extra.* key it renders in all three languages', () => {
    const used = [...new Set((bare.match(/'(?:ac|extra)\.[a-z_0-9]+'/g) || [])
        .map((s) => s.slice(1, -1)))];
    assert.ok(used.length > 25, 'only ' + used.length + ' keys are used');
    const table = src.slice(src.indexOf("'ac.todo_n':"), src.indexOf("// ── Matches / Matchday ──"));
    used.forEach((k) => {
      const j = table.indexOf("'" + k + "':");
      assert.ok(j !== -1, k + ' is rendered but not translated');
      const entry = table.slice(j, table.indexOf('},', j));
      ['ca:', 'es:', 'en:'].forEach((lang) => {
        assert.ok(entry.includes(lang), k + ' has no ' + lang.slice(0, 2));
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Accions — the RPE edit window', () => {
  /* ⚠ THE EDGES ARE THE TEST. "It works" is true of almost any arithmetic
     here; what matters is where it stops. */
  it('ends at 23:59:59 of the day AFTER the activity', () => {
    const { rpeEditableUntil } = load();
    const end = new Date(rpeEditableUntil('2026-09-01'));
    assert.strictEqual(end.getFullYear(), 2026);
    assert.strictEqual(end.getMonth(), 8);
    assert.strictEqual(end.getDate(), 2, 'the window closes on the wrong day');
    assert.strictEqual(end.getHours(), 23);
    assert.strictEqual(end.getMinutes(), 59);
  });

  it('is open today, open yesterday, shut the day before that', () => {
    const { rpeEditable } = load();
    const now = new Date(2026, 8, 2, 18, 30);
    assert.strictEqual(rpeEditable('2026-09-02', now), true, 'today must be editable');
    assert.strictEqual(rpeEditable('2026-09-01', now), true, 'yesterday must be editable');
    assert.strictEqual(rpeEditable('2026-08-31', now), false, 'two days ago must be shut');
  });

  it('is still open at 23:59 and shut one minute later', () => {
    const { rpeEditable } = load();
    assert.strictEqual(rpeEditable('2026-09-01', new Date(2026, 8, 2, 23, 59, 59)), true);
    assert.strictEqual(rpeEditable('2026-09-01', new Date(2026, 8, 3, 0, 0, 0)), false);
  });

  it('refuses a record with no usable date rather than opening for ever', () => {
    const { rpeEditable, rpeEditableUntil } = load();
    assert.strictEqual(rpeEditableUntil(''), 0);
    assert.strictEqual(rpeEditable(undefined, NOW), false);
  });

  it('keeps an answered row on the page while the window is open', () => {
    const r = load({ rpe: { p1_training_t2: { rpe: 7, minutes: 75, date: back(1) } } });
    assert.ok(r.html.includes('ac-row-done'), 'the answered row is gone from the page');
    assert.ok(r.html.includes('ac.change'), 'there is no way to change it');
    assert.ok(r.model.rows.some((x) => x.key === 'p1_training_t2' && x.rpe === 7));
  });

  it('drops it once the window has shut', () => {
    const r = load({ rpe: { p1_training_t3: { rpe: 5, minutes: 90, date: back(6) } } });
    assert.ok(!r.model.rows.some((x) => x.key === 'p1_training_t3'),
        'a session answered six days ago is still on the page');
  });

  /* Nothing on the page may say the window is enforced anywhere but here.
     firestore.rules deliberately still accepts a late write — see CONTEXT.md
     — and a test asserting otherwise would be describing a rule that is not
     there. */
  it('is a client rule, and the code says so', () => {
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    assert.ok(!/rpeEdit|RPE_EDIT|editableUntil/i.test(rules),
        'a server-side copy of the window appeared; the two will drift');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Accions — what is on the list', () => {
  it('asks only about activities that have ENDED', () => {
    const r = load();
    assert.ok(!r.model.rows.some((x) => x.id === 't4'),
        'a session still in progress is being asked about');
  });

  it('does not ask someone who told the club they were not coming', () => {
    const r = load({ avail: { p1_t1: 'no', p1_t2: 'injured' } });
    const ids = r.model.rows.map((x) => x.id);
    assert.ok(!ids.includes('t1') && !ids.includes('t2'),
        'a player who was absent or hurt is being asked for an RPE');
  });

  it('lets a staff override win over the player\'s own answer', () => {
    const r = load({ avail: { p1_t1: 'yes' }, override: { p1_t1: 'injured' } });
    assert.ok(!r.model.rows.some((x) => x.id === 't1'));
  });

  /* ⚠ Training had a bound and matches did NOT, so an unanswered friendly
     from August sat on the page for ever while the hero counted it as
     something to do today. */
  it('bounds matches the same way it bounds sessions', () => {
    const many = [];
    for (let i = 1; i <= 9; i++) {
      many.push({ id: 'mx' + i, date: back(i + 1), time: '12:00',
        home: 'Rival ' + i, away: 'CE L\'Esquerra', team: 'A' });
    }
    const r = load({ matches: many });
    assert.ok(r.model.rows.filter((x) => x.kind === 'match').length <= 5,
        'every past match ever is still pending');
  });

  it('puts unanswered rows first, under a heading that says "pendent"', () => {
    const r = load({ rpe: { p1_training_t2: { rpe: 7, minutes: 75, date: back(1) } } });
    const kinds = r.model.rows.map((x) => (x.rpe == null ? 0 : 1));
    assert.ok(kinds.length > 1, 'the fixture needs both kinds to say anything');
    kinds.forEach((k, i) => assert.ok(i === 0 || kinds[i - 1] <= k,
        'an answered row sorts above a pending one: ' + JSON.stringify(kinds)));
  });

  it('names the RIVAL on a match row, not our own club', () => {
    const r = load();
    const m = r.model.rows.find((x) => x.kind === 'match');
    assert.strictEqual(m.title, 'CF Vilassar de Mar');
  });

  it('answers "nothing pending" rather than drawing an empty list', () => {
    const r = load({ trainings: [], matches: [] });
    assert.ok(r.html.includes('ac.all_clear'), 'the empty state is missing');
    assert.ok(!r.html.includes('class="ac-row'), 'a row was drawn over nothing');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Accions — the badge and the page cannot disagree', () => {
  /* ⚠ THE WHOLE REASON playerActionModel EXISTS. The two used to keep
     separate copies of these filters with a comment asking them to agree. */
  it('counts exactly the rows the page draws as pending', () => {
    [{}, { rpe: { p1_training_t2: { rpe: 7, minutes: 75, date: back(1) } } },
      { avail: { p1_t1: 'no' } }, { trainings: [], matches: [] }].forEach((o, i) => {
      const r = load(o);
      const drawn = (r.html.match(/class="ac-row"/g) || []).length;
      assert.strictEqual(r.badge, drawn,
          'fixture ' + i + ': badge ' + r.badge + ' vs ' + drawn + ' pending rows');
    });
  });

  it('is zero, not an exception, with no session', () => {
    assert.strictEqual(load({ session: null }).badge, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Accions — the extras that used to vanish', () => {
  const EXTRAS = {
    p1_extra_1: { rpe: 6, minutes: 55, tag: 'gym', date: back(2) },
    p1_extra_2: { rpe: 5, minutes: 40, tag: 'run', date: back(4) },
  };

  it('RENDERS a logged extra, which the old page did not', () => {
    const h = load({ rpe: EXTRAS }).html;
    assert.strictEqual((h.match(/class="ac-ex-row"/g) || []).length, 2,
        'the extras list is empty again');
    assert.ok(h.includes('extra.gym') && h.includes('extra.run'));
  });

  it('says so when there are none', () => {
    assert.ok(load().html.includes('ac.no_extras'));
  });

  /* Records written before v245 hold `Running`/`Gym`; the key set is
     `gym`/`run`/`ball` now, and t() would render `extra.Running`. */
  it('renders a pre-v245 tag as what it says, not as a missing key', () => {
    const { extraTagLabel } = load();
    assert.strictEqual(extraTagLabel('Running'), 'Running');
    assert.strictEqual(extraTagLabel('gym'), 'extra.gym');
    assert.strictEqual(extraTagLabel(''), '');
  });

  it('counts this SEASON week, the same window the load engine uses', () => {
    const r = load({ rpe: EXTRAS });
    const wk = utils.getSeasonWeek(iso(NOW));
    const want = Object.values(EXTRAS).filter((e) => utils.getSeasonWeek(e.date) === wk);
    assert.strictEqual(r.model.extrasWeek, want.length);
    assert.strictEqual(r.model.loadWeek, want.reduce((s, e) => s + e.minutes, 0));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Accions — the answer strip', () => {
  it('offers 1 to 10 and nothing else', () => {
    const h = load().html;
    const cells = (h.match(/data-ac-rpe="(\d+)"/g) || []).map((s) => s.match(/\d+/)[0]);
    const perRow = cells.slice(0, 10);
    assert.deepStrictEqual(perRow, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    assert.ok(!h.includes('data-ac-rpe="0"'), 'zero is not an effort');
  });

  it('bands a value by the ramp', () => {
    const { acRpeBand } = load();
    assert.deepStrictEqual([1, 3, 4, 6, 7, 8, 9, 10].map(acRpeBand),
        ['ok', 'ok', 'warn', 'warn', 'bad', 'bad', 'red', 'red']);
    assert.strictEqual(acRpeBand(0), '');
    assert.strictEqual(acRpeBand(null), '');
  });

  it('carries the scale captions, which are what a number means', () => {
    const h = load().html;
    ['ac.scale_low', 'ac.scale_mid', 'ac.scale_high'].forEach((k) =>
      assert.ok(h.includes(k), k + ' is missing'));
  });

  /* v282: players do not see their minutes played, so a MATCH row draws no
     minutes box — the stub's 78 must not reach the page. A training keeps
     its pre-filled length and its ceiling. */
  it('pre-fills a training\'s minutes, and asks a match for none', () => {
    const r = load();
    const tr = r.model.rows.find((x) => x.kind === 'training');
    const m = r.model.rows.find((x) => x.kind === 'match');
    assert.strictEqual(tr.minutes, 90);
    assert.strictEqual(tr.minutesMax, 300);
    assert.strictEqual(m.minutes, null, 'the model carries match minutes to the page');
    const d = new JSDOM(r.html).window.document;
    const mRow = d.querySelector('.ac-row[data-action-type="match"]');
    const tRow = d.querySelector('.ac-row[data-action-type="training"]');
    assert.ok(mRow && tRow, 'the fixture lost a row kind');
    assert.strictEqual(mRow.querySelector('.action-minutes'), null, 'a match row has a minutes box');
    // The 1-10 strip spells "...78..." on its own; read the row without it.
    const meta = mRow.querySelector('.ac-meta');
    assert.ok(meta && !/78/.test(meta.innerHTML), 'the lineup minutes reach the match row');
    assert.ok(!mRow.innerHTML.includes('ac.min'), 'a minutes caption is left on the match row');
    const box = tRow.querySelector('.action-minutes');
    assert.ok(box, 'the training lost its box');
    assert.strictEqual(box.getAttribute('value'), '90');
    assert.strictEqual(box.getAttribute('data-max'), '300');
  });

  /* ⚠ The wheel has to eat its own scroll or the page moves under the finger
     while the value changes. `passive:false` or preventDefault is ignored. */
  it('stops the phone wheel scrolling the page behind it', () => {
    const b = bare.slice(bare.indexOf("page.querySelectorAll('.ac-strip')"),
        bare.indexOf("[data-ac-change]"));
    assert.ok(b.includes('ev.preventDefault()'), 'the wheel scrolls the page');
    assert.ok(b.includes('ev.stopPropagation()'), 'an ancestor scroller still moves');
    assert.ok(b.includes('passive: false'), 'preventDefault will be ignored');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
/* v282 — the SAVE, run for real over the real markup. A match row has no
   minutes box, so the handler takes them from the lineup; until the lineup
   is recorded it saves null, and computeReadiness looks them up again. */
describe('Accions — saving a match takes the lineup\'s minutes', () => {
  const HANDLER = grab('    // Player actions: RPE submit', '    /* Player actions: log an extra training.');

  function saveRun(kind, lineupMins, minutesTyped) {
    const dom = new JSDOM('<body>' + load().html + '</body>', { url: 'http://localhost/' });
    const w = dom.window, d = w.document;
    const errors = [];
    w.addEventListener('error', (e) => errors.push(e.error || e.message));
    const store = { fa_player_rpe: '{}', fa_matches: JSON.stringify(MATCHES) };
    const asked = [], saved = [], notes = [];
    const api = {
      $$: (sel) => Array.from(d.querySelectorAll(sel)),
      getSession: () => SESSION,
      getTrainings: () => TRAININGS,
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
      playerMatchMinutesKnown: (uid, mid) => { asked.push([uid, mid]); return lineupMins; },
      addStaffNotification: (n) => notes.push(n),
      ackSaveRecord: (coll, id, data) => { saved.push({ coll, id, data }); return Promise.resolve(); },
      renderPage: () => {}, updateActionsBadge: () => {},
      t: (k) => k, ACTION_MINUTES_MAX: 300,
    };
    // eslint-disable-next-line no-new-func
    new Function(...Object.keys(api), HANDLER)(...Object.values(api));
    const row = d.querySelector('.ac-row[data-action-type="' + kind + '"]:not(.ac-row-done)');
    assert.ok(row, 'no open ' + kind + ' row in the fixture');
    row.querySelector('.ac-cell[data-ac-rpe="7"]').classList.add('ac-cell-on');
    if (minutesTyped !== undefined) row.querySelector('.action-minutes').value = minutesTyped;
    row.querySelector('.ac-save').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.deepStrictEqual(errors, [], 'the handler threw: ' + errors.join(' | '));
    return { asked, saved, notes, row };
  }

  it('records the lineup\'s minutes, and the load they make', () => {
    const r = saveRun('match', 78);
    assert.deepStrictEqual(r.asked, [['p1', 'm1']], 'it did not ask the lineup about THIS match');
    assert.strictEqual(r.saved.length, 1);
    const data = r.saved[0].data;
    assert.strictEqual(data.minutes, 78);
    assert.strictEqual(data.ua, 7 * 78);
    assert.strictEqual(data.tag, 'match');
    assert.strictEqual(r.notes[0].detail, 'RPE 7 · 78 min');
  });

  it('saves null, not a refusal, while the lineup is unrecorded', () => {
    const r = saveRun('match', null);
    assert.strictEqual(r.saved.length, 1, 'an RPE with no lineup yet was refused');
    assert.strictEqual(r.saved[0].data.minutes, null);
    assert.strictEqual(r.saved[0].data.ua, null, 'a load was made up from no minutes');
    assert.strictEqual(r.notes[0].detail, 'RPE 7', 'the coach\'s feed says "null min"');
  });

  /* v286. A suspended match is ONE match in two sessions: its first part
     on the day it was stopped, its restart on the new date, each asked
     for an RPE of its own. */
  describe('postponed and suspended matches', () => {
    const RIVAL = { home: 'CF Vilassar de Mar', away: 'CE L\'Esquerra', team: 'A' };
    const POSTPONED = Object.assign({ id: 'mp', date: back(1), time: '12:15',
      fcfState: 'postponed', postponedFrom: { date: back(1), time: '12:15' } }, RIVAL);
    const STOPPED = Object.assign({ id: 'ms', date: back(1), time: '12:15',
      fcfState: 'suspended', suspendedOn: { date: back(1), time: '12:15' } }, RIVAL);
    // Stopped five days ago, resumed yesterday.
    const RESUMED = Object.assign({ id: 'mr', date: back(1), time: '12:15',
      suspendedOn: { date: back(5), time: '18:00' } }, RIVAL);
    const matchRows = (r) => r.model.rows.filter((x) => x.kind === 'match');

    it('a postponed match is not asked about', () => {
      assert.deepStrictEqual(matchRows(load({ matches: [POSTPONED] })), []);
    });

    it('nor one the federation withdrew', () => {
      const gone = Object.assign({}, MATCHES[0], { id: 'mw', fcfRemoved: true });
      assert.deepStrictEqual(matchRows(load({ matches: [gone] })), []);
    });

    it('a suspended one IS — its first part was played', () => {
      const rows = matchRows(load({ matches: [STOPPED] }));
      assert.deepStrictEqual(rows.map((x) => x.key), ['p1_match_ms']);
    });

    it('resumed: two rows, the first on the day it was stopped, the restart tagged', () => {
      const rows = matchRows(load({ matches: [RESUMED] }));
      const byKey = {};
      rows.forEach((x) => { byKey[x.key] = x; });
      assert.deepStrictEqual(Object.keys(byKey).sort(), ['p1_match_mr', 'p1_match_mr_r']);
      assert.strictEqual(byKey.p1_match_mr.date, back(5));
      assert.strictEqual(byKey.p1_match_mr.title, 'CF Vilassar de Mar');
      assert.strictEqual(byKey.p1_match_mr_r.date, back(1));
      assert.strictEqual(byKey.p1_match_mr_r.title, 'CF Vilassar de Mar · match.resumption_tag');
    });

    it('answering the first part leaves the restart pending', () => {
      const r = load({ matches: [RESUMED],
        rpe: { p1_match_mr: { rpe: 6, minutes: 45, date: back(5) } } });
      const open = matchRows(r).filter((x) => x.rpe == null).map((x) => x.key);
      assert.deepStrictEqual(open, ['p1_match_mr_r']);
    });

    /* The save, over the real handler and the real rows. */
    function save(matches, key) {
      const dom = new JSDOM('<body>' + load({ matches }).html + '</body>', { url: 'http://localhost/' });
      const w = dom.window; const d = w.document;
      const errors = [];
      w.addEventListener('error', (e) => errors.push(e.error || e.message));
      const store = { fa_player_rpe: '{}', fa_matches: JSON.stringify(matches) };
      const asked = []; const saved = [];
      const api = {
        $$: (sel) => Array.from(d.querySelectorAll(sel)),
        getSession: () => SESSION,
        getTrainings: () => TRAININGS,
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
        playerMatchMinutesKnown: (uid, mid) => { asked.push(mid); return 78; },
        addStaffNotification: () => {},
        ackSaveRecord: (coll, id, data) => { saved.push({ coll, id, data }); return Promise.resolve(); },
        renderPage: () => {}, updateActionsBadge: () => {},
        t: (k) => k, ACTION_MINUTES_MAX: 300,
      };
      // eslint-disable-next-line no-new-func
      new Function(...Object.keys(api), HANDLER)(...Object.values(api));
      const row = d.querySelector('.ac-row[data-action-key="' + key + '"]');
      assert.ok(row, 'no row for ' + key);
      row.querySelector('.ac-cell[data-ac-rpe="7"]').classList.add('ac-cell-on');
      row.querySelector('.ac-save').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      assert.deepStrictEqual(errors, [], 'the handler threw: ' + errors.join(' | '));
      assert.strictEqual(saved.length, 1, 'nothing saved');
      return { asked, data: saved[0].data, id: saved[0].id };
    }

    it('the first part saves on the day it was played, with the lineup\'s minutes', () => {
      const r = save([RESUMED], 'p1_match_mr');
      assert.strictEqual(r.data.date, back(5), 'loaded on the restart day');
      assert.deepStrictEqual(r.asked, ['mr']);
      assert.strictEqual(r.data.minutes, 78);
    });

    it('the restart saves on its own day, under its own key, with no minutes of its own', () => {
      /* The lineup's minutes are the WHOLE match's and already sit on the
         first part; counting them twice would double the match's load. */
      const r = save([RESUMED], 'p1_match_mr_r');
      assert.strictEqual(r.id, 'p1_match_mr_r');
      assert.strictEqual(r.data.date, back(1));
      assert.strictEqual(r.data.minutes, null);
      assert.deepStrictEqual(r.asked, [], 'the lineup asked about "mr_r"');
    });
  });

  it('still reads, and still caps, a training\'s typed minutes', () => {
    const ok = saveRun('training', 999, '75');
    assert.deepStrictEqual(ok.asked, [], 'a training asked the lineup');
    assert.strictEqual(ok.saved[0].data.minutes, 75);
    const over = saveRun('training', null, '400');
    assert.strictEqual(over.saved.length, 0, 'a training over its ceiling was saved');
    assert.ok(over.row.querySelector('.action-minutes').classList.contains('input-error'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Accions — availability is gone, and gone cleanly', () => {
  /* Inici owns it, and draws the SAME `.mavail-*` pair with a changeable
     `.mavail-chosen` this page never had. Deleting the markup is safe; the
     names are bound by name in bindDynamicActions() and are untouched. */
  it('draws no availability control', () => {
    const h = load().html;
    assert.ok(!/mavail|avail-btn|action-avail/.test(h),
        'an availability control is back on Accions');
  });

  it('leaves the binders that Inici depends on alone', () => {
    assert.ok(bare.includes("$$('.mavail-btn')"), 'the match binder went with the markup');
    assert.ok(bare.includes("$$('.avail-btn')"), 'the training binder went with the markup');
    assert.ok(bare.includes("$$('.mavail-chosen')"), 'click-to-clear went with it');
  });

  it('still renders those controls somewhere — on Inici', () => {
    const ini = bare.slice(bare.indexOf('function iniAvailPillsHtml') !== -1
      ? bare.indexOf('function iniAvailPillsHtml') : 0);
    assert.ok(/mavail-btn|mavail-chosen/.test(ini), 'nobody draws them any more');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Accions — the extra-training date', () => {
  it('cannot be a day that has not happened', () => {
    const b = bare.slice(bare.indexOf('function acRenderCal'), bare.indexOf('function bindNotifications('));
    assert.ok(b.includes('const future = iso > today'), 'the future gate is gone');
    assert.ok(b.includes("' disabled'"), 'future days are still clickable');
    const submit = bare.slice(bare.indexOf("document.getElementById('ac-x-submit')"));
    assert.ok(submit.includes("dateVal > localDateStr(new Date())"),
        'the submit accepts a forward-dated extra');
  });

  it('greys the forward arrow at the current month', () => {
    const b = bare.slice(bare.indexOf('function acRenderCal'), bare.indexOf('function bindNotifications('));
    assert.ok(b.includes('atNow'), 'the month can be paged into the future');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Accions — the stylesheet', () => {
  it('sits between Les meves estadístiques and Notificacions', () => {
    assert.ok(ACSTART > css.indexOf('/* ===== Les meves estadístiques, redesigned (v244)'));
    assert.ok(ACEND > ACSTART);
  });

  it('picks one row markup per frame instead of reordering a shared one', () => {
    assert.ok(!/\border:\s*-?\d/.test(ACCSS), 'a row is being reordered by CSS');
  });

  /* ⚠ THIS TEST USED TO ASSERT NOTHING. Its second line was
     `assert.ok(at600 === '' || true)` — unconditionally true — and it was the
     one assertion that would have caught `.ac-page` having no 600px negation
     at all. Written as a copy of the `.ms-page` case and defanged in the
     copying. The rule itself now lives in test/layout.test.js, across all ten
     roots at once; what stays here is that Accions is IN that set, so
     deleting its root from the shared rule cannot pass quietly. */
  it('leaves the page geometry to the shared rule', () => {
    /* ⚠ `\s*\{`, not `[^{]*\{` — the latter happily crosses a `}` and finds a
       margin in some later rule entirely. */
    assert.ok(!/\.ac-page\s*\{[^}]*margin\s*:/.test(ACCSS),
        'the .ac- block set its own root margin again; layout.test.js owns it');
  });

  /* ⚠ The captions must be a CHILD of the strip's column. As siblings inside
     the row's flex they sized to their own text and `space-between` had
     nothing to spread — "MOLT SUAUMODERATMÀXIM" as one word. */
  it('gives the scale captions a column to spread across', () => {
    assert.ok(/\.ac-answer-col\s*\{[^}]*flex-direction:\s*column/.test(ACCSS));
    assert.ok(bare.includes('ac-answer-col'), 'the wrapper is not built');
  });

  it('marks the wheel\'s centre slot rather than its edges', () => {
    const phone = ACCSS.slice(ACCSS.indexOf('@media (max-width: 700px)'));
    assert.ok(/background-position:\s*0 32px, 0 63px/.test(phone),
        'the hairlines are not on the centre slot');
  });
});
