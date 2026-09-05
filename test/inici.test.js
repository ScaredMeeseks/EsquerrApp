/* Inici — the two landing pages, redesigned (v230).  `npm run test:ini`
 *
 * ⚠ WHAT THIS SUITE IS ACTUALLY FOR.
 *
 * The player Inici is the page attendance is answered on. The pills were
 * redrawn; the handlers in bindDynamicActions() were not. Those handlers bind
 * BY NAME — `.avail-btn[data-avail]` inside `.avail-btns[data-avail-sid]`,
 * `.avail-chosen[data-avail-sid]`, and the `.mavail-*` pair — so a renamed
 * class or attribute does not throw and does not log. The pill simply stops
 * saving, and the coach's sheet goes on reading "available" because
 * getEffectiveAnswer() counts a silent player as a yes. There is no louder
 * failure available; this suite is it.
 *
 * So the centre of gravity here is: render the REAL markup with the REAL
 * builders, put it in a jsdom document, run the REAL handlers over it, and
 * assert the write that came out the other end.
 *
 * Two traps this repo has already paid for, both live in here:
 *  · a stub that returns a constant cannot answer a question about its input,
 *    so recordKey/readRecord/sanitize are SLICED IN rather than faked; and
 *  · jsdom swallows an exception thrown inside a listener, so a handler that
 *    dies on a missing stub looks exactly like one that did nothing — every
 *    test that dispatches an event drains a window `error` collector.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { readCss, readCssRaw } = require('./read-css');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
const css = readCss();
/* Comment-stripped for every "is this class used" question. The Inici block
   is heavily commented and names its own hooks in prose — counting
   `data-avail-sid` over the raw source matches the banner explaining it as
   well as the markup. Written down three times in this repo already. */
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const bareCss = css.replace(/\/\*[\s\S]*?\*\//g, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/* The `.ini-` block on its own, so a rule from another paper page cannot
   answer a question asked about this one.

   ⚠ THE END BOUND IS NOT DECORATION, and this file predicted its own bug:
   until v234 the slice ran to the END OF FILE and worked only because Inici
   happened to be last in the stylesheet. Mèdic was appended after it, and
   every `.md2-` rule fell inside INICSS where the palette guard below would
   have read them as Inici's. Exactly what test/convocatoria.test.js:57 had
   to fix when Inici was appended after IT. If a ninth page lands after
   Mèdic, this bound must name it instead. */
const INICSTART = css.indexOf('/* ===== Inici, redesigned (v230)');
assert.ok(INICSTART !== -1, 'the ini- block banner is gone from css/style.css');
const INIEND = css.indexOf('/* ===== Mèdic, redesigned (v234)', INICSTART);
assert.ok(INIEND !== -1, 'the md2- block banner is gone — this slice has no end bound again');
/* ⚠ TWO COPIES, AND THE DIFFERENCE MATTERS. `readCss()` resolves every
   `var(--pp-*)` back to its literal, which is what makes a colour assertion
   test the COLOUR rather than the token name. But it also means the resolved
   copy is full of hexes by construction, so "is anything hardcoded here"
   can only be asked of the RAW file. Asking it of the resolved one produces
   a list of forty violations that are not violations. */
const INICSS = css.slice(INICSTART, INIEND).replace(/\/\*[\s\S]*?\*\//g, '');
const rawCss = readCssRaw();
const RAWSTART = rawCss.indexOf('/* ===== Inici, redesigned (v230)');
const INIRAW = rawCss.slice(RAWSTART, rawCss.indexOf('/* ===== Mèdic, redesigned (v234)', RAWSTART))
    .replace(/\/\*[\s\S]*?\*\//g, '');

// ── the real sanitize(), which needs a document ───────────────────────────
const SANITIZE_SRC = utilsSrc.slice(
    utilsSrc.indexOf('function sanitize(str) {'),
    utilsSrc.indexOf('// ---------- Tactical Formations ----------'));

/**
 * The pill builders and the donut, run for real.
 *
 * `t` and `trainingLockedTitle` are stubs, but neither is asked a question
 * about its input that matters here — `t` is an identity over the key, which
 * makes every label assertion below read as the key rather than as Catalan
 * and keeps the suite honest about WHICH string was chosen. sanitize is the
 * real one.
 */
function loadBuilders() {
  const dom = new JSDOM('<!doctype html><body></body>');
  /* From the segment table, which is the first thing in the Inici block that
     is code rather than prose. The marker was a doc comment for one version
     and broke the moment that comment was deleted — anchor a slice on a
     declaration, not on a paragraph about one. */
  const block = grab('  const INI_SEGS = [', '  function renderPlayerHome() {') +
    grab('  /** The four training pills.', '  /** Both weeks, plus the honest pending count');
  // eslint-disable-next-line no-new-func
  return new Function('document', 't', 'trainingLockedTitle', 'tDay',
      'isOurTeam', 'clubBadgeUrl', 'getWeekBounds', 'tMonth', 'clubMonogram', `
    ${SANITIZE_SRC}
    ${block}
    return { iniAvailPillsHtml, iniMatchPillsHtml, iniDonutHtml,
             iniDateStackHtml, iniSideBadgeHtml, iniSentTagHtml };`)(
    dom.window.document,
    (k) => k,
    () => 'Respostes tancades a les 15:30',
    (d) => ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'][d],
    (n) => n === 'U.E. Esquerra',
    () => 'img/logo-192.png',
    () => ({ start: '2026-08-31', end: '2026-09-06' }),
    (m) => ['gen', 'feb', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'des'][m],
    (name) => String(name || '?').slice(0, 2).toUpperCase());
}

/**
 * A jsdom page holding real pill markup, with the REAL availability handlers
 * from bindDynamicActions() bound over it. Everything the handlers reach for
 * is recorded rather than performed, except the key builders, which are the
 * real ones — a stubbed `recordKey` would be free to drift from the one the
 * scheduler and the coach's sheet read.
 */
function mountHandlers(bodyHtml, opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><body>' + bodyHtml + '</body>', {
    runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  const doc = win.document;

  // ⚠ jsdom swallows exceptions thrown inside listeners. Without this, a
  // handler that dies on a missing stub is indistinguishable from one that
  // decided not to act.
  const errors = [];
  win.addEventListener('error', (e) => errors.push(e.error || e.message));

  const calls = { save: [], remove: [], bodyMap: [], notify: [], rendered: 0 };
  const store = {
    fa_training_availability: JSON.stringify(opts.avail || {}),
    fa_match_availability: JSON.stringify(opts.matchAvail || {}),
    fa_injury_notes: '{}',
    fa_matches: JSON.stringify(opts.matches || []),
  };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
  };

  const KEYS = grab('  function recordKey(playerId, sess, kind)',
      '  async function handleRegister');
  const handlers = grab('    // Match availability buttons\n    $$(\'.mavail-btn\')',
      '    $$(\'[data-go-training]\').forEach(el => {') +
    grab('    // Training availability buttons\n    $$(\'.avail-btn\')',
        '    // Clear all staff notifications');

  const session = { id: 'u1', name: 'Marc Rovira' };
  const trainings = opts.trainings || [];
  const api = {
    $$: (sel) => Array.prototype.slice.call(doc.querySelectorAll(sel)),
    document: doc,
    localStorage,
    getSession: () => session,
    getTrainings: () => trainings,
    getUsers: () => [{ id: 'u1', name: 'Marc Rovira' }],
    saveUsers: () => {},
    deriveFitnessStatus: () => {},
    addStaffNotification: (n) => calls.notify.push(n),
    showInjurySelfReport: (wrap, sid) => calls.bodyMap.push({ wrap, sid }),
    ackSaveRecord: (coll, key, data) => {
      calls.save.push({ coll, key, data });
      return Promise.resolve();
    },
    ackRemoveRecord: (coll, key) => {
      calls.remove.push({ coll, key });
      return Promise.resolve();
    },
    renderPage: () => { calls.rendered++; },
    updateActionsBadge: () => {},
    DB: { removeRecord: () => Promise.resolve() },
    t: (k) => k,
  };

  // eslint-disable-next-line no-new-func
  new Function(...Object.keys(api), `
    ${SANITIZE_SRC}
    ${KEYS}
    ${handlers}
  `)(...Object.values(api));

  return {
    doc, calls, errors, store,
    click(sel) {
      const el = doc.querySelector(sel);
      assert.ok(el, 'nothing matched ' + sel + ' — the markup contract moved');
      el.dispatchEvent(new win.Event('click', { bubbles: true }));
      assert.deepStrictEqual(errors, [], 'a handler threw: ' + errors.join(', '));
    },
  };
}

const SESS = { id: 't7', date: '2026-09-02', time: '19:30', focus: 'Pressing' };

/* ═══════════════════════════════════════════════════════════════════
   THE CONTRACT — what bindDynamicActions() binds by name
   ═══════════════════════════════════════════════════════════════════ */
describe('Inici — the answer pills keep the attributes the handlers bind', () => {
  const B = loadBuilders();

  it('unanswered: one wrapper carrying the session id, four buttons carrying values', () => {
    const html = B.iniAvailPillsHtml('t7', SESS, '', false);
    assert.ok(html.includes('class="avail-btns" data-avail-sid="t7"'), html);
    ['yes', 'late', 'no', 'injured'].forEach((k) => {
      assert.ok(new RegExp('data-avail="' + k + '"').test(html),
          k + ' has no data-avail — its handler will never fire');
    });
    // ⚠ the trailing space: `class="avail-btn` also matches the WRAPPER's
    // `class="avail-btns"`, and this counted five for a while.
    assert.strictEqual((html.match(/class="avail-btn /g) || []).length, 4, html);
  });

  it('unanswered: the four are ALL there, not a badge waiting to expand', () => {
    /* The old markup was one `.avail-chosen.avail-default` badge that grew
       buttons on click, and the save logic therefore existed twice. If a
       `avail-default` ever comes back, so does the second copy. */
    const html = B.iniAvailPillsHtml('t7', SESS, '', false);
    assert.ok(!html.includes('avail-default'), 'the expand-on-click badge is back');
  });

  it('answered: the choice is `.avail-chosen` with its own sid, so tapping it clears', () => {
    const html = B.iniAvailPillsHtml('t7', SESS, 'late', false);
    assert.ok(/class="avail-chosen avail-late" data-avail-sid="t7"/.test(html), html);
    // and the other three stay writable, so changing an answer is one tap
    assert.strictEqual((html.match(/class="avail-btn /g) || []).length, 3, html);
    assert.ok(!/data-avail="late"/.test(html), 'the chosen pill also offers to re-save itself');
  });

  it('locked: no data attribute anywhere, so no handler can match it', () => {
    const html = B.iniAvailPillsHtml('t7', SESS, 'yes', true);
    assert.ok(!html.includes('data-avail-sid'), html);
    assert.ok(!html.includes('data-avail='), html);
    assert.ok(!html.includes('avail-btns'), html);
    // and it says WHY, which is the half a player is owed
    assert.ok(html.includes('Respostes tancades'), html);
  });

  it('locked with no answer shows the assumption, not a blank', () => {
    // getEffectiveAnswer() counts a silent player as available; a locked row
    // showing four empty outlines would contradict the coach's sheet.
    const html = B.iniAvailPillsHtml('t7', SESS, '', true);
    assert.ok(/ini-pill avail-yes ini-on/.test(html), html);
  });

  it('open with no answer marks `Sí` as ASSUMED, and it is still clickable', () => {
    const html = B.iniAvailPillsHtml('t7', SESS, '', false);
    assert.ok(/avail-btn avail-yes ini-assumed" data-avail="yes"/.test(html), html);
  });

  it('the match pair keeps `.mavail-btns` + `data-mavail-match` + `data-mavail`', () => {
    const html = B.iniMatchPillsHtml(42, null);
    assert.ok(html.includes('class="mavail-btns" data-mavail-match="42"'), html);
    assert.ok(html.includes('data-mavail="disponible"'), html);
    assert.ok(html.includes('data-mavail="no_disponible"'), html);
  });

  it('an answered match puts the sid on the chosen pill, for the un-answer handler', () => {
    const html = B.iniMatchPillsHtml(42, 'disponible');
    assert.ok(/class="mavail-chosen mavail-disp" data-mavail-match="42"/.test(html), html);
    assert.ok(html.includes('data-mavail="no_disponible"'), 'cannot change the answer');
  });

  it('escapes a session id, which reaches the markup as an attribute', () => {
    const html = B.iniAvailPillsHtml('" onclick="alert(1)', SESS, '', false);
    assert.ok(!/onclick="alert/.test(html), html);
    assert.ok(html.includes('&quot;'), html);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   THE HANDLERS, RUN FOR REAL over that markup
   ═══════════════════════════════════════════════════════════════════ */
describe('Inici — the real handlers over the real markup', () => {
  const B = loadBuilders();

  it('each pill saves its own value under the session key', () => {
    ['yes', 'late', 'no'].forEach((val) => {
      const m = mountHandlers(B.iniAvailPillsHtml('t7', SESS, '', false),
          { trainings: [SESS] });
      m.click('[data-avail="' + val + '"]');
      assert.strictEqual(m.calls.save.length, 1, val + ' saved nothing');
      const s = m.calls.save[0];
      assert.strictEqual(s.coll, 'trainingAvail');
      // The SESSION key, not the date key — dual-writing the legacy one
      // brings back the same-day last-write-wins it exists to remove.
      assert.strictEqual(s.key, 'u1_t7');
      assert.strictEqual(s.data.value, val);
      assert.strictEqual(s.data.sessionId, 't7');
      assert.strictEqual(s.data.date, '2026-09-02');
    });
  });

  it('`Lesionat` opens the self-report sheet and saves NOTHING yet', () => {
    /* The sheet owns the write, and since v234 it makes it whichever way the
       player leaves — Enviar, Ometre, the ×, or Escape all call
       commitInjuryNote(). So "nothing yet" here is about THIS handler, not
       about the flow: the answer is recorded a moment later and cannot be
       lost, which is the fix the sheet exists to carry. Before v234 only the
       commit button wrote, and dismissing the picker dropped the answer
       silently — into getEffectiveAnswer(), which reads a silent player as
       available. */
    const m = mountHandlers(B.iniAvailPillsHtml('t7', SESS, '', false),
        { trainings: [SESS] });
    m.click('[data-avail="injured"]');
    assert.strictEqual(m.calls.save.length, 0, 'saved before the zone was picked');
    assert.strictEqual(m.calls.bodyMap.length, 1);
    assert.strictEqual(m.calls.bodyMap[0].sid, 't7');
    // it is handed the WRAPPER, which it hides and restores by display
    assert.ok(m.calls.bodyMap[0].wrap.classList.contains('avail-btns'));
  });

  it('tapping the chosen pill again clears the answer', () => {
    const m = mountHandlers(B.iniAvailPillsHtml('t7', SESS, 'no', false),
        { trainings: [SESS], avail: { u1_t7: 'no' } });
    m.click('.avail-chosen');
    assert.strictEqual(m.calls.remove.length, 1);
    assert.strictEqual(m.calls.remove[0].coll, 'trainingAvail');
    assert.strictEqual(m.calls.remove[0].key, 'u1_t7');
    assert.strictEqual(m.calls.save.length, 0, 'clearing re-saved instead');
  });

  it('changing an answer saves the new one and does not clear', () => {
    const m = mountHandlers(B.iniAvailPillsHtml('t7', SESS, 'yes', false),
        { trainings: [SESS], avail: { u1_t7: 'yes' } });
    m.click('[data-avail="no"]');
    assert.strictEqual(m.calls.save.length, 1);
    assert.strictEqual(m.calls.save[0].data.value, 'no');
    assert.strictEqual(m.calls.remove.length, 0);
  });

  it('a locked row is inert — the click reaches nothing', () => {
    const m = mountHandlers(B.iniAvailPillsHtml('t7', SESS, 'yes', true),
        { trainings: [SESS] });
    m.doc.querySelectorAll('.ini-pill').forEach((el) => {
      el.dispatchEvent(new m.doc.defaultView.Event('click', { bubbles: true }));
    });
    assert.deepStrictEqual(m.errors, []);
    assert.strictEqual(m.calls.save.length, 0);
    assert.strictEqual(m.calls.remove.length, 0);
  });

  it('a match answer writes matchAvail under uid_matchId', () => {
    const m = mountHandlers(B.iniMatchPillsHtml(42, null),
        { matches: [{ id: 42, home: 'A', away: 'B', date: '2026-09-05' }] });
    m.click('[data-mavail="disponible"]');
    assert.strictEqual(m.calls.save.length, 1);
    assert.strictEqual(m.calls.save[0].coll, 'matchAvail');
    assert.strictEqual(m.calls.save[0].key, 'u1_42');
    assert.strictEqual(m.calls.save[0].data.value, 'disponible');
    assert.strictEqual(m.calls.save[0].data.matchId, '42');
  });

  it('tapping the chosen match pill clears it', () => {
    const m = mountHandlers(B.iniMatchPillsHtml(42, 'disponible'),
        { matches: [{ id: 42, home: 'A', away: 'B' }], matchAvail: { u1_42: 'disponible' } });
    m.click('.mavail-chosen');
    assert.strictEqual(m.calls.remove.length, 1);
    assert.strictEqual(m.calls.remove[0].key, 'u1_42');
  });

  it('every answer raises a staff notification', () => {
    // The coach's feed is how a change reaches someone who is not looking at
    // the page; a silent write is a change nobody is told about.
    const m = mountHandlers(B.iniAvailPillsHtml('t7', SESS, '', false),
        { trainings: [SESS] });
    m.click('[data-avail="yes"]');
    assert.strictEqual(m.calls.notify.length, 1);
    assert.strictEqual(m.calls.notify[0].type, 'training_avail');
  });

  it('there is exactly ONE writer for a training answer', () => {
    /* The old expanding badge injected its four buttons after
       bindDynamicActions() had run, so they had to be bound on the spot —
       a duplicate of the whole save path. The two copies had already
       drifted: the inline one never cleared `fa_injury_notes` when a player
       answered something other than `injured`, so a player who had reported
       an injury and then said "Sí" stayed flagged injured on the coach's
       roster. Counting the calls is what keeps a second copy from returning. */
    const binder = grab('    // Training availability buttons\n    $$(\'.avail-btn\')',
        '    // Clear all staff notifications')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.strictEqual((binder.match(/ackSaveRecord\('trainingAvail'/g) || []).length, 1,
        'a second copy of the training save path is back');
    assert.ok(!binder.includes('insertAdjacentHTML'),
        'buttons are being injected after binding again — re-render the row instead');
  });

  it('an unknown session id saves nothing rather than writing a bad key', () => {
    const m = mountHandlers(B.iniAvailPillsHtml('ghost', SESS, '', false),
        { trainings: [SESS] });
    m.click('[data-avail="yes"]');
    assert.strictEqual(m.calls.save.length, 0);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   THE DONUT — the arithmetic the handoff specifies
   ═══════════════════════════════════════════════════════════════════ */
describe('Inici — the availability donut', () => {
  const B = loadBuilders();

  it('r is chosen so a segment length IS its percentage', () => {
    const html = B.iniDonutHtml([{ n: 1, css: 'var(--pp-ok)', label: 'y' },
      { n: 3, css: 'var(--pp-warn)', label: 'l' }], { size: 44 });
    assert.ok(html.includes('stroke-dasharray="25.00 75.00"'), html);
    assert.ok(html.includes('stroke-dasharray="75.00 25.00"'), html);
  });

  it('offsets each arc by the ones before it, so they do not overlap', () => {
    const html = B.iniDonutHtml([{ n: 1, css: 'a', label: 'y' },
      { n: 1, css: 'b', label: 'l' }], {});
    assert.ok(html.includes('stroke-dashoffset="0.00"'), html);
    assert.ok(html.includes('stroke-dashoffset="-50.00"'), html);
  });

  it('leaves the no-answer share as bare track rather than drawing it', () => {
    // 4 of a squad of 22 answered: the ring is 4/4 of what was answered and
    // the rest of the circle is the track. Nothing invents a fifth segment.
    const html = B.iniDonutHtml([{ n: 4, css: 'a', label: 'y' }], {});
    assert.strictEqual((html.match(/stroke-dasharray/g) || []).length, 1, html);
  });

  it('an all-zero donut is a bare track, not a division by zero', () => {
    const html = B.iniDonutHtml([{ n: 0, css: 'a', label: 'y' }], { centre: '0%' });
    assert.ok(!html.includes('NaN'), html);
    assert.ok(!html.includes('stroke-dasharray'), html);
  });

  it('⚠ colours go in `style`, never in a stroke attribute', () => {
    /* A presentation attribute does not resolve var(). `stroke="var(--pp-ok)"`
       renders BLACK with no error anywhere — the ring simply comes out the
       wrong colour and the palette test cannot see it either. */
    const html = B.iniDonutHtml([{ n: 1, css: 'var(--pp-ok)', label: 'y' }], {});
    assert.ok(html.includes('style="stroke:var(--pp-ok)"'), html);
    assert.ok(!/\sstroke="var\(/.test(html), 'a var() went into a presentation attribute');
  });

  it('escapes the tooltip it builds from a label', () => {
    const html = B.iniDonutHtml([{ n: 1, css: 'a', label: '<img src=x onerror=alert(1)>' }], {});
    assert.ok(!html.includes('<img'), html);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   THE ROW — badges, dates, the sent tag
   ═══════════════════════════════════════════════════════════════════ */
describe('Inici — the event row furniture', () => {
  const B = loadBuilders();

  it('our side gets the crest, the rival gets a monogram disc', () => {
    /* Deliberate: the club has no rival crest library, and a broken <img>
       beside a fixture reads as a fault in the app. */
    assert.ok(B.iniSideBadgeHtml('U.E. Esquerra').includes('<img'));
    assert.ok(!B.iniSideBadgeHtml('C.F. Vallcarca').includes('<img'));
    assert.ok(B.iniSideBadgeHtml('C.F. Vallcarca').includes('ini-mono'));
  });

  it('the sent tag carries the binder hook that opens the match', () => {
    const html = B.iniSentTagHtml(42);
    assert.ok(html.includes('data-conv-link'), html);
    assert.ok(html.includes('data-conv-match="42"'), html);
    assert.ok(html.includes('ini-sent-dot'), 'the blink is the whole point of it');
  });

  it('the date stack shows the weekday over the day number', () => {
    const html = B.iniDateStackHtml('2026-09-02');
    assert.ok(html.includes('>dc<'), html);   // 2 Sept 2026 is a Wednesday
    assert.ok(html.includes('>2<'), html);
  });

  it('a row with no date does not render an Invalid Date', () => {
    assert.ok(!/NaN|Invalid/.test(B.iniDateStackHtml('')), B.iniDateStackHtml(''));
  });
});

/* ═══════════════════════════════════════════════════════════════════
   THE STAFF PAGE — read-only, and it has to stay that way
   ═══════════════════════════════════════════════════════════════════ */
describe('Inici — the staff page writes nothing', () => {
  const staff = grab('  function renderStaffWeek(weekOffset, players, letter) {',
      '  let medicalDetailPlayerId = null;')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('emits no availability attribute anywhere', () => {
    /* A coach's page that could answer FOR a player would put words in
       someone's mouth, and the staff override is the supported way to do it —
       on the session page, where it is recorded as an override. */
    ['data-avail-sid', 'data-avail=', 'data-mavail', 'avail-btns', 'mavail-btns']
        .forEach((hook) => {
          assert.ok(!staff.includes(hook),
              'the staff Inici renders ' + hook + ' — it can now answer for a player');
        });
  });

  it('counts RAW answers, never getEffectiveAnswer', () => {
    // getEffectiveAnswer() assumes 'yes' for an unlocked session, which would
    // report every silent player as having replied and make "N sense
    // resposta" permanently zero.
    assert.ok(!staff.includes('getEffectiveAnswer'), staff.slice(0, 400));
    assert.ok(/overrides\[k\] \|\| availData\[k\]/.test(staff),
        'the staff override no longer wins over the player answer');
  });

  it('the Convocatòria button is gated on being able to edit the page', () => {
    assert.ok(/canEditPage\('convocatoria'\)/.test(staff),
        'a delegate is offered a button that will refuse him');
  });

  it('the call-up figure REPLACES the button once it is sent', () => {
    // That swap is the whole state model: a sent call-up has no button.
    const i = staff.indexOf('r.convSent');
    assert.ok(i !== -1);
    const sentBranch = staff.slice(i, staff.indexOf('} else {', i));
    assert.ok(sentBranch.includes('ini-conv-n'), sentBranch);
    assert.ok(!sentBranch.includes('ini-conv-btn'), 'the button survives the send');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   WIRING — the things whose absence is silent
   ═══════════════════════════════════════════════════════════════════ */
describe('Inici — wiring', () => {
  it('every key the pages read is in KEY_PAGES for both of them', () => {
    /* A key a page reads but is not listed for does NOT re-render it. The
       coach sets the citació on his laptop and the player's phone shows the
       old one until they navigate away and back — silent, and blamed on the
       phone. */
    const map = src.slice(src.indexOf('const KEY_PAGES = {'));
    [['fa_convocatoria_callup', ['player-home', 'staff-home']],
      ['fa_match_events', ['player-home', 'staff-home']],
      ['fa_convocatoria_sent', ['player-home', 'staff-home']],
      ['fa_training_availability', ['player-home', 'staff-home']],
      ['fa_match_availability', ['player-home', 'staff-home']],
      ['fa_injuries', ['player-home', 'staff-home']]].forEach(([key, pages]) => {
      const line = new RegExp(key + ':\\s*\\[([^\\]]*)\\]').exec(map);
      assert.ok(line, key + ' is not in KEY_PAGES at all');
      pages.forEach((p) => assert.ok(line[1].includes("'" + p + "'"),
          key + ' does not re-render ' + p));
    });
  });

  it('every ini.* key the source uses is declared in all three languages', () => {
    /* t() returns the KEY on a miss, so a typo ships as a literal `ini.foo`
       on the first screen anyone sees. */
    const used = new Set([...src.matchAll(/\bt\(['"](ini\.[\w_]+)['"]\)/g)].map((m) => m[1]));
    [...src.matchAll(/\btv\(['"](ini\.[\w_]+)['"]/g)].forEach((m) => used.add(m[1]));
    assert.ok(used.size > 20, 'the scan found almost nothing — the pattern moved');
    /* ⚠ Matched to the end of the LINE, not to the next `}`. Several of these
       strings carry `{n}` placeholders, and a `[^}]*` capture stops inside
       the placeholder — which reported every interpolated key as missing its
       Spanish. The declarations are one per line by convention. */
    used.forEach((key) => {
      const row = new RegExp("^\\s*'" + key.replace('.', '\\.') + "':.*$", 'm').exec(src);
      assert.ok(row, key + ' is used but never declared — it ships as raw text');
      ['ca:', 'es:', 'en:'].forEach((lang) => assert.ok(row[0].includes(lang),
          key + ' is missing ' + lang + ': ' + row[0].trim()));
    });
  });

  it('the squad-letter filter is reset with the category, like the other four', () => {
    // A stale 'B' under a category with no B filters the whole page away with
    // no visible control saying why.
    const reset = bare.slice(bare.indexOf('convTeamFilter = \'all\';', bare.indexOf('data-cat')));
    assert.ok(/iniTeamFilter = 'all'/.test(reset.slice(0, 400)), reset.slice(0, 400));
  });

  it('the eye that hid a standings table is gone, and so is its key', () => {
    // It wrote fa_hidden_leagues on one device only, so a table hidden on the
    // phone was still there on the laptop and nothing said why.
    ['_getHiddenLeagues', '_setHiddenLeagues', 'league-toggle-btn'].forEach((n) => {
      assert.ok(!bare.includes(n), n + ' survived the redesign');
    });
    assert.ok(!bare.includes('fa_hidden_leagues'), 'the key is still written');
  });

  it('the standings still centre our own row on load', () => {
    assert.ok(bare.includes('scrollLeagueToCentre()'), 'the centring call is gone');
    /* ⚠ Asked of the BUILDERS, not of the whole file. Grepping the source
       for `league-scroll` passes on scrollLeagueToCentre's own querySelector
       — the test matched the half that LOOKS for the hook while the half
       that EMITS it was gone. It survived a mutation for exactly that. */
    const snippet = grab('  function buildLeagueSnippet(title, rows, snippetId) {',
        '  /* ═══════════════════════════════════════════════════════════\n' +
        '     Sancions and Top Scorers');
    const row = grab('  function iniLeagueRowHtml(r) {', '  function clubMonogram(name)');
    assert.ok(snippet.includes('league-scroll'), 'the scroll box lost its hook');
    assert.ok(row.includes('league-ours'), 'our row lost its hook');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — what a string-builder test cannot see, but can at
   least confirm exists
   ═══════════════════════════════════════════════════════════════════ */
describe('Inici — the .ini- block', () => {
  it('re-dresses the borrowed availability classes UNDER its own page root', () => {
    /* .avail-* and .mavail-* belong to the Accions page too, at other sizes.
       An unscoped rule here would repaint that page as a side effect — the
       exact failure CLAUDE.md records for .pt-page .mn-* and .cv-page. */
    /* ⚠ The leading `.` is optional in this match. An earlier version made
       it mandatory via `[^@}].*\.`, which needed a dot that was not the
       first character — so a selector that BEGINS with the borrowed class,
       `.avail-btn:hover,`, was the one shape it could not see. That is
       precisely the shape an unscoped rule has, and it survived the
       mutation that wrote it. */
    const borrowed = INICSS.split('\n')
        .filter((l) => /^\s*[^@}\s]/.test(l))
        .filter((l) => /\.(m?avail-(btn|btns|chosen)\b|conv-pos-circle\b)/.test(l));
    assert.ok(borrowed.length > 4, 'the pills carry almost no rules — the scan missed them');
    borrowed.forEach((l) => assert.ok(l.includes('.ini-page') || l.includes('.ini-pills'),
        'unscoped borrowed rule repaints another page: ' + l.trim()));
  });

  it('the hero photo slot is a circle with no frame around it (v231)', () => {
    /* The handoff drew a square drop target with a 1px border. In practice
       people upload avatars that are already circles on transparent corners,
       and the border then reads as a stray box drawn around someone's head.
       The background stays — it is the chip the initial sits on when there
       is no photo. */
    const m = /\.ini-photo\s*\{([^}]*)\}/.exec(INICSS);
    assert.ok(m, 'the photo rule is gone');
    assert.ok(/border-radius:\s*50%/.test(m[1]), m[1]);
    assert.ok(!/(^|;)\s*border\s*:/.test(m[1]), 'the square frame is back: ' + m[1]);
    assert.ok(/background:/.test(m[1]), 'the initials lost the chip behind them');
  });

  it('gives the phone a 44px answer target', () => {
    /* A mis-tapped availability answer is a wrong answer sent to the coach.
       ⚠ Asked of the PILL rule, not of the phone block: `.ini-conv-btn` is
       44px in the same block, so scanning the block for "44px" went on
       passing with the pills shrunk to 30. */
    const phone = INICSS.slice(INICSS.indexOf('@media (max-width: 700px)'));
    const i = phone.indexOf('.ini-page .avail-btn, .ini-page .avail-chosen,');
    assert.ok(i !== -1, 'the phone rule for the pills is gone entirely');
    const rule = phone.slice(i, phone.indexOf('}', i));
    assert.ok(/height:\s*44px/.test(rule),
        'the answer pills are under 44px on a phone: ' + rule.trim());
  });

  /* ── the two defects the 390px render caught, with the suite green ──
     Both are geometry, which is exactly what a string-builder test cannot
     see. They are pinned here as the shapes they are, not as pixel values. */

  it('the counters share a baseline however long a label is', () => {
    /* "Convocatòries pendents" wraps to two lines on a phone. Centred, its
       figure then sits half a line above the other three and the row reads
       as four unrelated numbers. */
    const rule = INICSS.slice(INICSS.indexOf('.ini-counters {'));
    assert.ok(/align-items:\s*flex-end/.test(rule.slice(0, 120)),
        'the counters are centred: ' + rule.slice(0, 120));
  });

  it('the Convocatòria button never precedes the count it belongs to', () => {
    /* `order` on `.ini-ev-txt` put the button BEFORE its "N sense resposta"
       on an unsent match — the count then read as the next row's. The two
       cases that share `.ini-ev-right` have different children, so ordering
       one reorders the other. */
    const phone = INICSS.slice(INICSS.indexOf('@media (max-width: 700px)'));
    const i = phone.indexOf('.ini-ev-txt {');
    assert.ok(i !== -1, 'the phone rule for the text slot is gone');
    assert.ok(!/order:/.test(phone.slice(i, phone.indexOf('}', i))),
        'ordering is back on .ini-ev-txt: ' + phone.slice(i, phone.indexOf('}', i)));
  });

  it('the blink can be turned off by someone who asked for that', () => {
    assert.ok(/prefers-reduced-motion[\s\S]*?ini-sent-dot[\s\S]*?animation:\s*none/
        .test(INICSS), 'the tag blinks at everyone regardless');
  });

  it('writes no palette colour as a literal', () => {
    /* Asked of the RAW file, not the resolved one. paper-palette.test.js is
       the real guard and fails with the token to use; this one names the
       page, because a hex pasted here renders identically to the token and
       is invisible in every other way. White is the block's one literal,
       following .std- and .cv- — it is the chrome axis's --card as well, so
       tokenising it would need the palette guard's allowlist edited. */
    const loose = (INIRAW.match(/#[0-9A-Fa-f]{3,8}\b/g) || [])
        .filter((h) => h.toUpperCase() !== '#FFFFFF');
    assert.deepStrictEqual(loose, [],
        'a paper colour is hardcoded in .ini- instead of a --pp- token');
  });

  it('paints the page and the hero, so neither inherits the app chrome', () => {
    // Resolved, so this tests the colour and not the token's spelling.
    assert.ok(/\.ini-page\s*\{[^}]*background:\s*#FBFAF7/.test(INICSS), INICSS.slice(0, 300));
    assert.ok(/\.ini-hero\s*\{[^}]*background:\s*#FFFFFF/.test(INICSS));
  });

  it('the old standings table rules are gone from the whole sheet', () => {
    ['.league-tbl', '.league-badge-cell', '.league-pos-cell', '.league-hidden']
        .forEach((c) => assert.ok(!bareCss.includes(c), c + ' is dead CSS'));
  });
});
