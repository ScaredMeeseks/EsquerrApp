/* Partit — the FCF acta on the match page (v278).
 *
 * Everything here runs the REAL code: the pt* builders, the events band
 * of renderMatchDetail, stdSelect and its binder, the event helpers, the
 * callable runners and the bindDynamicActions handlers, all sliced from
 * js/app.js into ONE scope over a jsdom page — one scope because the form's
 * state (`_evForm`) is shared by the builders that draw it and the
 * handlers that write it. Only the network (firebase), the toast and the
 * confirm dialog are stand-ins, and they record what they were asked.
 *
 * What it pins, in the owner's words: "when an acta is published, it is
 * final" — and the coach can still add what it does not say.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}
const HELPERS = grab('  // ── Match Events helpers ──', '  // ── Starting XI helpers ──');
const STDSEL = grab('  function stdSelect(o) {', '  /**\n   * A place, linked to its map');
const BLOCK = grab('  /**\n   * Which side of this fixture is US', '  function renderMatchDetail()');
const BAND = grab('    const events = getMatchEvents(m.id);', '    /* The rival\'s two strips');
const RUNNERS = grab('  /**\n   * Resolves once every key in `keys` has arrived',
    '  /**\n   * The referee panel\'s own bindings.');
const HANDLERS = grab('    /* ── Match Events bindings (v213)', '    // Date tap popup (mobile)');
const SANITIZE = 'function sanitize(s) { return String(s === undefined || s === null ? "" : s)' +
  '.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }';

const US = 'US F.C.';
const MID = 4119501;
const USERS = [
  {id: 'u1', name: 'Pol Bernat', roles: ['player'], category: 'amateur', playerNumber: '9'},
  {id: 'u2', name: 'Nil Soler', roles: ['player'], category: 'amateur'},
  {id: 'u5', name: 'Marc Puig', roles: ['player'], category: 'amateur'},
  {id: 'c1', name: 'Coach', roles: ['staff'], category: 'amateur'},
];
const fcf = (o) => Object.assign({src: 'fcf'}, o);
function importedEvents() {
  return [
    fcf({id: 'g1', fcfKey: 'goal:home:h1:12', side: 'home', type: 'goal', minute: '12',
      playerId: 'u1', fcfPlayerId: 'h1', playerName: 'Pol Bernat'}),
    fcf({id: 'g2', fcfKey: 'goal:away:a1:40', side: 'away', type: 'goal', minute: '40',
      goalType: 'penal', fcfPlayerId: 'a1', playerName: 'Josué Casanovas', playerNumber: '9'}),
    fcf({id: 'y1', fcfKey: 'yellow:home:h2:30', side: 'home', type: 'yellow', minute: '30',
      playerId: '', fcfPlayerId: 'h2', playerName: 'Nil Soler'}),
    {id: 'hand-pal', side: 'home', type: 'pal', minute: '50', playerId: 'u5'},
  ];
}
function importedMatch() {
  return {id: MID, home: US, away: 'THEM C.F.', date: '2026-09-19', time: '18:00',
    category: 'amateur', team: 'A', fcfActaId: '4119501', score: '1-1', status: 'played',
    fcfActa: {at: '2026-09-19T19:40:00.000Z', src: 'auto', unlinked: 2, lineup: [
      {f: 'h1', n: 'Pol Bernat', d: '9', t: 1, on: '', u: 'u1', x: 0, a: 1},
      {f: 'h2', n: 'Nil Soler', d: '10', t: 1, on: '', u: '', x: 0, a: 0, c: ['u2']},
      {f: 'h3', n: '', d: '11', t: 0, on: '60', u: '', x: 0, a: 0, c: []},
    ]}};
}

/** One page, one scope. `opts.events`, `opts.match`, `opts.staff`. */
function mount(opts) {
  const o = opts || {};
  const dom = new JSDOM('<!doctype html><body><div id="page"></div></body>',
      {runScripts: 'outside-only', pretendToBeVisual: true});
  const win = dom.window;
  const doc = win.document;
  const errors = [];
  win.addEventListener('error', (e) => errors.push(e.error || e.message));

  const match = o.match || importedMatch();
  const store = {
    fa_matches: JSON.stringify([match]),
    fa_match_events: JSON.stringify({[MID]: o.events || importedEvents()}),
    fa_convocatoria_sent: JSON.stringify({[MID]: {players: ['u1', 'u2', 'u5']}}),
  };
  const calls = {callable: [], toast: [], modal: [], rendered: 0};
  let answer = o.answer || {status: 'imported', counts: {goals: 2, cards: 1, subs: 0, unlinked: 2}};
  const api = {
    document: doc,
    window: win,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = v;
      },
    },
    t: (k) => (k === 'pt.acta_imported_at' ? 'importada {when}' : k),
    isOurTeam: (n) => n === US,
    getUsers: () => USERS,
    getSession: () => ({id: 'c1', roles: ['staff']}),
    posRankGlobal: () => 0,
    showModal: (title, msg, onConfirm, mo) => calls.modal.push({title, msg, onConfirm, mo}),
    showTbConfirm: () => {},
    ptOpenBoard: () => {},
    _showPushToast: (title, body) => calls.toast.push([title, body]),
    firebase: {app: () => ({functions: () => ({httpsCallable: (name) => (data) => {
      calls.callable.push({name, data});
      return Promise.resolve({data: answer});
    }})})},
  };
  const stubs = ['clubBadgeUrl', 'safeHttpUrl', 'opponentOf', 'getClubName', 'leaguePosLabel',
    'kitIconsHtml', 'tDateLong', 'locationHtml', 'getStartingXI', 'posCirclesHtmlGlobal',
    'tbRoBoardHtml', 'mnLinkedFirstLeg', 'playerMatchMinutesKnown', 'mnOutcome', 'mnSentBoards',
    'mnSentVideos', 'mnMediaColHtml', 'tDateShort', 'fcfKitPieces', 'fcfShirtSvg', 'shortsSvg',
    'kitSockSvg'];
  stubs.forEach((k) => {
    api[k] = () => '';
  });
  Object.assign(api, {_leagueCache: {}, _lang: 'ca', CATEGORY_LABELS: {}, MN: {get: () => null},
    MN_BRIEF_COLLAPSED: 'k'});
  const page = doc.getElementById('page');
  const isStaff = o.staff !== false;
  // eslint-disable-next-line no-new-func
  const R = new Function(...Object.keys(api), `
    ${SANITIZE}
    var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
    var detailMatchId = ${MID};
    var __rendered = 0;
    ${HELPERS}
    ${STDSEL}
    ${BLOCK}
    ${RUNNERS}
    function band(m, isStaff, isPast, convSent, sentPlayers) {
      ${BAND}
      return eventsHtml;
    }
    function draw() {
      var m = JSON.parse(localStorage.getItem('fa_matches'))[0];
      var sent = JSON.parse(localStorage.getItem('fa_convocatoria_sent'))[m.id] || {};
      document.getElementById('page').innerHTML =
        band(m, ${isStaff}, true, true, sent.players || []);
      bind();
    }
    function renderPage() { __rendered++; draw(); }
    function bind() {
      ${HANDLERS}
    }
    return {draw: draw, rendered: function () { return __rendered; },
      bind: bind, form: function () { return _evForm; }, setForm: function (f) { _evForm = f; },
      ptTimelineHtml: ptTimelineHtml, ptEventTypes: ptEventTypes, ptActaBarHtml: ptActaBarHtml,
      ptActaLinkHtml: ptActaLinkHtml, getMatchEvents: getMatchEvents};
  `)(...Object.values(api));
  R.draw();
  const fire = (el, type) => {
    el.dispatchEvent(new win.Event(type || 'click', {bubbles: true}));
    assert.deepStrictEqual(errors, [], 'a handler threw: ' + errors.join(', '));
  };
  return {
    R, doc, win, page, calls, store,
    setAnswer: (a) => {
      answer = a;
    },
    $: (sel) => page.querySelector(sel),
    $$: (sel) => Array.prototype.slice.call(page.querySelectorAll(sel)),
    click(sel) {
      const el = page.querySelector(sel);
      assert.ok(el, 'nothing matched ' + sel + ' — the markup contract moved');
      fire(el);
    },
    /** Open a stdSelect by kind and pick the option with this value. */
    pick(kind, value, scope) {
      const root = (scope || page).querySelector('.std-sel[data-std-sel="' + kind + '"]');
      assert.ok(root, 'no ' + kind + ' picker');
      fire(root.querySelector('.std-sel-t'));
      const opt = root.querySelector('.std-sel-o[data-v="' + value + '"]');
      assert.ok(opt, 'no option ' + value + ' in ' + kind);
      fire(opt);
    },
    events: () => JSON.parse(store.fa_match_events)[MID],
    synced(keys) {
      keys.forEach((key) => win.dispatchEvent(new win.CustomEvent('firestore-sync', {detail: {key}})));
    },
    errors,
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const ev = (P, id) => P.events().find((e) => e.id === id);

describe('Partit — an imported acta is final', () => {
  it('draws no ✕ on any of the acta\'s rows, and keeps it on the coach\'s own', () => {
    const P = mount();
    const xs = P.$$('.pt-ev-x').map((b) => b.dataset.evId);
    assert.deepStrictEqual(xs, ['hand-pal']);
  });

  it('offers a pencil only on our own non-penalty goal; the rest are locked', () => {
    const P = mount();
    assert.deepStrictEqual(P.$$('.pt-ev-edit').map((b) => b.dataset.evId), ['g1']);
    assert.strictEqual(P.$$('.pt-ev-lock').length, 2, 'the penalty and the booking');
  });

  it('shows a player nothing to press', () => {
    const P = mount({staff: false});
    assert.strictEqual(P.$$('.pt-ev-x, .pt-ev-edit, .pt-ev-lock, .pt-acta-import, .pt-link').length, 0);
    assert.ok(P.$('.pt-acta-badge'), 'a player still sees where the result came from');
  });

  it('tags our acta player nobody has linked yet', () => {
    const P = mount();
    const rows = P.$$('.pt-ev-row').filter((r) => r.querySelector('.pt-ev-tag'));
    assert.strictEqual(rows.length, 1);
    assert.ok(rows[0].textContent.indexOf('Nil Soler') !== -1);
  });

  it('only offers the types an acta never records once it is in', () => {
    const P = mount();
    assert.deepStrictEqual(P.R.ptEventTypes('home', true).map((o) => o.v), ['penal_fallat', 'pal']);
    assert.strictEqual(P.R.ptEventTypes('home', false).length, 7);
    P.click('.pt-ev-add-btn[data-ev-side="home"]');
    assert.deepStrictEqual(P.$$('.pt-chip[data-ev-type]').map((c) => c.dataset.evType),
        ['penal_fallat', 'pal']);
  });

  it('refuses to add an acta type by hand even if the form is forced to one', () => {
    const P = mount();
    P.R.setForm({matchId: MID, side: 'home', type: 'goal', min: '70', who: 'u5', second: '',
      goalType: 'jugada_oberta'});
    P.R.draw();
    const before = P.events().length;
    P.click('.pt-ev-submit');
    assert.strictEqual(P.events().length, before);
  });

  it('still adds a penal fallat after the import', () => {
    const P = mount();
    P.click('.pt-ev-add-btn[data-ev-side="home"]');
    P.click('.pt-chip[data-ev-type="penal_fallat"]');
    P.pick('evwho', 'u5');
    P.click('.pt-ev-submit');
    assert.ok(P.events().some((e) => e.type === 'penal_fallat' && e.playerId === 'u5'));
  });

  it('will not delete an acta row through a stray ✕ either — an old page, another tab', () => {
    const P = mount();
    P.page.insertAdjacentHTML('beforeend', '<button class="pt-ev-x" id="forged" data-ev-id="y1">✕</button>');
    P.R.bind();                                // the real handler, on the forged button
    const n = P.events().length;
    P.click('#forged');
    assert.strictEqual(P.events().length, n);
    assert.ok(ev(P, 'y1'), 'the booking is gone');
    // …while the same handler still deletes the coach's own row
    P.click('.pt-ev-x[data-ev-id="hand-pal"]');
    assert.ok(!ev(P, 'hand-pal'));
  });

  it('numbers bookings per acta player, even before anyone is linked', () => {
    /* Two different unlinked players of ours, one booking each. Keyed on
       uid-or-number alone, both had neither, became one player, and the
       second booking was drawn as a sending-off. */
    const P = mount({events: [
      fcf({id: 'ya', fcfKey: 'yellow:home:h2:30', side: 'home', type: 'yellow', minute: '30',
        playerId: '', fcfPlayerId: 'h2', playerName: 'Nil Soler'}),
      fcf({id: 'yb', fcfKey: 'yellow:home:h3:50', side: 'home', type: 'yellow', minute: '50',
        playerId: '', fcfPlayerId: 'h3', playerName: 'Jugador/a #11'}),
    ]});
    assert.strictEqual(P.$$('.ev-yellow-second').length, 0, 'an unlinked booking drawn as a second yellow');
  });
});

describe('Partit — editing an acta goal: only what the acta does not say', () => {
  it('opens on the goal with the minute and scorer fixed', () => {
    const P = mount();
    P.click('.pt-ev-edit[data-ev-id="g1"]');
    assert.strictEqual(P.R.form().mode, 'edit');
    const fixed = P.$('.pt-ev-fixed');
    assert.ok(fixed && /12'/.test(fixed.textContent) && /Pol Bernat/.test(fixed.textContent));
    assert.strictEqual(P.$$('.pt-ev-min-in').length, 0, 'the minute is editable');
    assert.strictEqual(P.$$('.pt-chip[data-ev-type]').length, 0, 'the type is editable');
    assert.deepStrictEqual(P.$$('.pt-chip[data-ev-goaltype]').map((c) => c.dataset.evGoaltype),
        ['jugada_oberta', 'falta_directa']);
  });

  it('saves an assist as the pair the readers need, and nothing else changes', () => {
    const P = mount();
    const was = Object.assign({}, ev(P, 'g1'));
    P.click('.pt-ev-edit[data-ev-id="g1"]');
    P.pick('evsecond', 'u5');
    P.click('.pt-ev-submit');
    const g = ev(P, 'g1');
    assert.deepStrictEqual([g.goalType, g.goalDetail, g.assistPlayerId], ['jugada_oberta', 'assistencia', 'u5']);
    ['minute', 'playerId', 'side', 'type', 'fcfKey', 'src', 'fcfPlayerId'].forEach((k) => {
      assert.strictEqual(g[k], was[k], k + ' changed');
    });
    assert.strictEqual(P.R.form(), null, 'the form stayed open');
  });

  it('a direct free kick drops the assist, and says it was individual', () => {
    const P = mount({events: importedEvents().map((e) => (e.id === 'g1'
      ? Object.assign({}, e, {goalType: 'jugada_oberta', goalDetail: 'assistencia', assistPlayerId: 'u5'})
      : e))});
    P.click('.pt-ev-edit[data-ev-id="g1"]');
    assert.ok(P.$('.std-sel[data-std-sel="evsecond"]'), 'the assist picker is missing on open play');
    P.click('.pt-chip[data-ev-goaltype="falta_directa"]');
    assert.ok(!P.$('.std-sel[data-std-sel="evsecond"]'), 'a free kick still offers an assist');
    P.click('.pt-ev-submit');
    const g = ev(P, 'g1');
    assert.deepStrictEqual([g.goalType, g.goalDetail, 'assistPlayerId' in g], ['falta_directa', 'individual', false]);
  });

  it('keeps the score the acta says', () => {
    const P = mount();
    P.click('.pt-ev-edit[data-ev-id="g1"]');
    P.pick('evsecond', 'u5');
    P.click('.pt-ev-submit');
    assert.strictEqual(JSON.parse(P.store.fa_matches)[0].score, '1-1');
  });
});

describe('Partit — the acta line and the import button', () => {
  it('says when the acta came in', () => {
    const P = mount();
    assert.ok(P.$('.pt-acta-badge'));
    assert.ok(/importada \d\d\/\d\d \d\d:\d\d/.test(P.$('.pt-acta').textContent),
        P.$('.pt-acta').textContent);
  });

  it('before the import: a button for staff once kicked off; "late" only after 2h45', () => {
    const P = mount();
    const m = Object.assign(importedMatch(), {fcfActa: undefined});
    const kick = new Date(m.date + 'T' + m.time + ':00').getTime();
    const early = P.R.ptActaBarHtml(m, true, true, kick + 60 * 60000);
    assert.ok(/pt-acta-import/.test(early) && !/pt\.acta_pending/.test(early));
    const late = P.R.ptActaBarHtml(m, true, true, kick + 170 * 60000);
    assert.ok(/pt\.acta_pending/.test(late));
    assert.strictEqual(P.R.ptActaBarHtml(m, false, true, kick + 60 * 60000), '');
    assert.strictEqual(P.R.ptActaBarHtml(m, true, false, kick), '', 'before kick-off');
    assert.strictEqual(P.R.ptActaBarHtml(Object.assign({}, m, {fcfActaId: ''}), true, true, kick), '',
        'a friendly has no acta');
  });

  it('imports straight away into a timeline with nothing typed by hand', async () => {
    const P = mount({match: Object.assign(importedMatch(), {fcfActa: undefined}), events: []});
    P.click('.pt-acta-import');
    assert.deepStrictEqual(P.calls.callable, [{name: 'importFcfActa', data: {matchId: String(MID)}}]);
    await tick();
    P.synced(['fa_match_events', 'fa_matches']);
    await tick();
    await tick();
    assert.ok(P.calls.toast.length === 1 && /pt\.acta_done/.test(P.calls.toast[0][1]), P.calls.toast.join());
    assert.ok(P.R.rendered() > 0, 'nothing redrew the page');
  });

  it('asks first when the coach typed goals or cards by hand', () => {
    const P = mount({match: Object.assign(importedMatch(), {fcfActa: undefined}), events: [
      {id: 'h', side: 'home', type: 'goal', minute: '10', playerId: 'u1'}]});
    P.click('.pt-acta-import');
    assert.strictEqual(P.calls.callable.length, 0, 'imported without asking');
    assert.strictEqual(P.calls.modal.length, 1);
    P.calls.modal[0].onConfirm();
    assert.strictEqual(P.calls.callable.length, 1);
  });

  it('says what an awarded result was, and that nothing was imported', async () => {
    const P = mount({match: Object.assign(importedMatch(), {fcfActa: undefined}), events: []});
    P.setAnswer({status: 'awarded', score: '0-3'});
    P.click('.pt-acta-import');
    await tick();
    await tick();
    assert.ok(/pt.acta_awarded/.test(P.calls.toast[0][1]), P.calls.toast.join());
  });

  it('says plainly when the federation has not closed it', async () => {
    const P = mount({match: Object.assign(importedMatch(), {fcfActa: undefined}), events: []});
    P.setAnswer({status: 'not-closed'});
    P.click('.pt-acta-import');
    await tick();
    await tick();
    assert.ok(/pt\.acta_not_closed/.test(P.calls.toast[0][1]));
  });
});

describe('Partit — "Vincula jugadors"', () => {
  it('lists the unlinked acta names, suggestions first, and folds the linked ones', () => {
    const P = mount();
    const open = P.$$('.pt-link > .pt-link-row');
    assert.strictEqual(open.length, 2);
    const nil = open[0];
    const labels = Array.prototype.map.call(nil.querySelectorAll('.std-sel-o'), (o) => o.textContent);
    assert.strictEqual(labels[0], 'pt.link_pick');
    assert.strictEqual(labels[1], '★ Nil Soler');
    assert.strictEqual(labels.filter((l) => /Nil Soler/.test(l)).length, 1, 'a suggestion listed twice');
    assert.ok(labels.indexOf('Coach') === -1, 'staff offered as a player');
    assert.strictEqual(labels[labels.length - 1], 'pt.link_ignore');
    assert.ok(/pt\.hidden_player #11/.test(open[1].textContent));
    const done = P.$('.pt-link-done');
    assert.ok(done && /Pol Bernat/.test(done.textContent) && /pt\.link_auto/.test(done.textContent));
  });

  it('links a name through the server and redraws when the data is back', async () => {
    const P = mount();
    P.setAnswer({matches: 3, displaced: ''});
    const row = P.$$('.pt-link > .pt-link-row')[0];
    P.pick('ptlink', 'u2', row);
    assert.deepStrictEqual(P.calls.callable, [{name: 'linkFcfPlayer', data: {fcfId: 'h2', uid: 'u2'}}]);
    await tick();
    P.synced(['fa_match_events', 'fa_matches']);
    await tick();
    await tick();
    assert.ok(/pt\.link_done/.test(P.calls.toast[0][1]));
  });

  it('unlinks with an empty uid and ignores with the marker', () => {
    const P = mount();
    P.pick('ptlink', '__unlink__', P.$('.pt-link-done'));
    assert.deepStrictEqual(P.calls.callable[0].data, {fcfId: 'h1', uid: ''});
    const Q = mount();
    Q.pick('ptlink', '__ignore__', Q.$$('.pt-link > .pt-link-row')[1]);
    assert.deepStrictEqual(Q.calls.callable[0].data, {fcfId: 'h3', uid: '__ignore__'});
  });
});
