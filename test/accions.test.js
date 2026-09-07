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

  it('pre-fills the minutes and carries the right ceiling per kind', () => {
    const r = load();
    const tr = r.model.rows.find((x) => x.kind === 'training');
    const m = r.model.rows.find((x) => x.kind === 'match');
    assert.strictEqual(tr.minutes, 90);
    assert.strictEqual(tr.minutesMax, 300);
    assert.strictEqual(m.minutes, 78);
    assert.strictEqual(m.minutesMax, 100);
    assert.ok(r.html.includes('data-max="100"') && r.html.includes('data-max="300"'));
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
