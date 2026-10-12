/* Superadmin club visit (v281).
 *
 * On 2026-10-06 the superadmin created C.E. Europa with their own address
 * as responsable. The create handler joined them to it with a raw
 * users/{uid} write — and a user has ONE teamId, so that moved them out of
 * Esquerra. Handing Europa to its real lead then made onClubLeadChanged
 * drop them from Europa too, and with no club Configuració returned before
 * building the one table that lists every club. They were locked out of
 * every club, their own included.
 *
 * v281 answers it three ways, and each is RUN here, not read:
 *   - visitClub()/leaveVisit(): the superadmin opens any club without
 *     joining it — the in-memory session changes, users/{uid} never does;
 *   - the guards that keep a visit from leaking: the claims listener and
 *     setSession();
 *   - the create handler joins only when the superadmin has no club, and
 *     through the joinClub callable rather than a client write.
 * Configuració's no-club page for the superadmin is in configuracio.test.js,
 * beside the rest of that page's render tests.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function grab(from, to) {
  const i = appSrc.indexOf(from);
  const j = appSrc.indexOf(to, i + from.length);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + (i === -1 ? from : to));
  return appSrc.slice(i, j);
}

const VISIT = grab('  let _visitHome = null;', '  // ---------- View switching ----------');
const CLEAR = grab('  function clearSession() {', '  /* ── Superadmin club visit (v281)');
const SET_SESSION = grab('  function setSession(user) {', '  function clearSession() {');
// v285: the watcher lives in afterSignIn() and closes with its error callback.
const CLAIMS = grab('onSnapshot(async (doc) => {', "}, (err) => console.warn('claims watcher:'")
    .slice('onSnapshot('.length);
const CREATE = grab("      createClubBtn.addEventListener('click', async () => {",
    '\n    }\n\n    // SuperUser / Team Lead / Player: delegated handlers');
const CLUB_LIST = grab('  async function _loadClubList() {', '\n  /* Team-lead field in the club table');
const NO_CLUB_GATE = grab('    /* A superadmin in no club (v281).',
    '\n\n    // Recorded AFTER the role checks above');

const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const CA = {};
const RE = /'((?:visit|cfg)\.[a-z_0-9]+)':\s*\{\s*ca:\s*'((?:[^'\\]|\\.)*)'/g;
let mm;
while ((mm = RE.exec(appSrc))) CA[mm[1]] = mm[2].replace(/\\'/g, "'");
const t = (k) => (k in CA ? CA[k] : k);

const HOME = () => ({
  id: 'u1', email: 'su@x.com', name: 'SU', isAdmin: true,
  teamId: 'home', roles: ['player', 'staff', 'lead'], isTeamLead: true,
  staffCategories: ['amateur'], staffRole: 'coach', category: 'amateur', team: 'B'
});
const MEMBERSHIP = ['teamId', 'roles', 'isTeamLead', 'staffCategories', 'staffRole', 'category', 'team'];
const membership = (s) => {
  const o = {};
  MEMBERSHIP.forEach((f) => { o[f] = s[f]; });
  return o;
};

/** A Firestore stand-in that records every call and every write. */
function recordingDb(log) {
  const ref = (p) => ({
    set: async (d, o) => { log.push(['db.set', p, d, o]); },
    update: async (d) => { log.push(['db.update', p, d]); },
    get: async () => ({ exists: false, data: () => ({}) }),
    collection: (c) => coll(p + '/' + c),
  });
  const coll = (p) => ({ doc: (id) => ref(p + '/' + id), where: () => coll(p) });
  return { collection: (c) => coll(c) };
}

/* The visit block, clearSession and their state, over stubs. `fail` names a
   club whose config load throws. */
function makeVisit(opts) {
  opts = opts || {};
  const log = [];
  const configs = {
    home: { id: 'home', name: 'Home FC' },
    away: { id: 'away', name: 'Away CF' },
    third: { id: 'third', name: 'Third UD' },
    evil: { id: 'evil', name: '<img src=x onerror=alert(1)>' },
  };
  const session = Object.assign(HOME(), opts.session || {});
  const api = {
    t, sanitize: esc,
    db: recordingDb(log),
    DB: {
      init: async (id, cats) => { log.push(['init', id, cats]); },
      flush: () => { log.push(['flush']); },
    },
    getVisibleCategories: () => ['amateur', 'juvenil'],
    navigate: (p) => { log.push(['nav', p]); },
    loadClubConfigImpl: async (id) => {
      log.push(['load', id]);
      if (id === opts.fail) throw new Error('boom');
      return configs[id] || null;
    },
  };
  const fn = new Function(...Object.keys(api), 'S0', 'CFG0', `
    let _currentSession = S0;
    let _clubConfig = CFG0;
    let _viewCategory = 'juvenil';
    let _viewSquad = 'B';
    function getSession() { return _currentSession; }
    async function loadClubConfig(id) { _clubConfig = await loadClubConfigImpl(id); }
    ${VISIT}
    ${CLEAR}
    return {
      visitClub, leaveVisit, renderVisitBanner, clearSession,
      state: () => ({ s: _currentSession, home: _visitHome, club: _clubConfig,
        viewCategory: _viewCategory, viewSquad: _viewSquad }),
    };
  `);
  const cfg0 = session.teamId === 'home' ? configs.home : null;
  return Object.assign(fn(...Object.values(api), session, cfg0), { log });
}

describe('visitClub — the superadmin opens a club without joining it', () => {
  it('swaps the membership in MEMORY to staff of the visited club', async () => {
    const v = makeVisit();
    await v.visitClub('away');
    assert.deepStrictEqual(membership(v.state().s), {
      teamId: 'away', roles: ['staff'], isTeamLead: false,
      staffCategories: [], staffRole: '', category: '', team: ''
    });
  });

  it('loads the visited club, re-points the data layer, then lands on staff-home', async () => {
    const v = makeVisit();
    await v.visitClub('away');
    assert.deepStrictEqual(v.log, [
      ['load', 'away'], ['init', 'away', ['amateur', 'juvenil']], ['nav', 'staff-home']
    ]);
    assert.strictEqual(v.state().club.name, 'Away CF');
  });

  it('never writes the superadmin\'s user document', async () => {
    const v = makeVisit();
    await v.visitClub('away');
    await v.leaveVisit();
    assert.deepStrictEqual(v.log.filter((e) => /^db\./.test(e[0])), []);
  });

  it('forgets the home club\'s category and squad filters', async () => {
    const v = makeVisit();
    await v.visitClub('away');
    assert.strictEqual(v.state().viewCategory, null);
    assert.strictEqual(v.state().viewSquad, 'all');
  });

  it('is the superadmin\'s alone', async () => {
    const v = makeVisit({ session: { isAdmin: false } });
    await v.visitClub('away');
    assert.strictEqual(v.state().s.teamId, 'home');
    assert.deepStrictEqual(v.log, []);
  });
});

describe('leaveVisit — the way back', () => {
  it('restores the exact home membership and reloads the home club', async () => {
    const v = makeVisit();
    await v.visitClub('away');
    v.log.length = 0;
    await v.leaveVisit();
    assert.deepStrictEqual(membership(v.state().s), membership(HOME()));
    assert.strictEqual(v.state().home, null, 'still marked as visiting');
    assert.deepStrictEqual(v.log, [
      ['load', 'home'], ['init', 'home', ['amateur', 'juvenil']], ['nav', 'settings']
    ]);
  });

  it('keeps the ORIGINAL home across a second visit', async () => {
    const v = makeVisit();
    await v.visitClub('away');
    await v.visitClub('third');
    assert.strictEqual(v.state().s.teamId, 'third');
    await v.leaveVisit();
    assert.deepStrictEqual(membership(v.state().s), membership(HOME()));
  });

  it('opening your own club from a visit is going back', async () => {
    const v = makeVisit();
    await v.visitClub('away');
    await v.visitClub('home');
    assert.strictEqual(v.state().home, null);
    assert.deepStrictEqual(membership(v.state().s), membership(HOME()));
  });

  it('with no home club, clears the data instead of re-initialising it', async () => {
    const v = makeVisit({ session: { teamId: 'none', isTeamLead: false, roles: ['staff'] } });
    await v.visitClub('away');
    v.log.length = 0;
    await v.leaveVisit();
    assert.strictEqual(v.state().s.teamId, 'none');
    assert.deepStrictEqual(v.log, [['load', 'none'], ['flush'], ['nav', 'settings']]);
  });

  it('a club that fails to load leaves the superadmin at home, not half-visiting', async () => {
    const v = makeVisit({ fail: 'away' });
    await assert.rejects(v.visitClub('away'), /boom/);
    assert.strictEqual(v.state().home, null);
    assert.deepStrictEqual(membership(v.state().s), membership(HOME()));
  });

  it('signing out ends the visit', async () => {
    const v = makeVisit();
    await v.visitClub('away');
    v.clearSession();
    assert.strictEqual(v.state().home, null);
  });
});

describe('renderVisitBanner', () => {
  it('is empty when not visiting', () => {
    assert.strictEqual(makeVisit().renderVisitBanner(), '');
  });

  it('names the club on screen and the way back to the home club', async () => {
    const v = makeVisit();
    await v.visitClub('away');
    const doc = new JSDOM('<body>' + v.renderVisitBanner() + '</body>').window.document;
    assert.ok(doc.querySelector('.upd-banner b').textContent === 'Away CF', 'visited club not named');
    assert.strictEqual(doc.querySelector('#visit-back').textContent,
        CA['visit.back'].replace('{club}', 'Home FC'));
  });

  it('says only "Tornar" when there is no home club to name', async () => {
    const v = makeVisit({ session: { teamId: 'none' } });
    await v.visitClub('away');
    const doc = new JSDOM('<body>' + v.renderVisitBanner() + '</body>').window.document;
    assert.strictEqual(doc.querySelector('#visit-back').textContent, CA['visit.back_none']);
  });

  it('escapes the club name', async () => {
    const v = makeVisit();
    await v.visitClub('evil');
    const doc = new JSDOM('<body>' + v.renderVisitBanner() + '</body>').window.document;
    assert.strictEqual(doc.querySelector('img'), null, 'a club name became markup');
  });

  it('its button goes back — through the page\'s delegated click handler', async () => {
    const HANDLER = grab("        // The visit banner's way back", "        if (e.target.closest('#push-ask')) {");
    const v = makeVisit();
    await v.visitClub('away');
    const dom = new JSDOM('<body><div id="dashboard-content">' + v.renderVisitBanner() + '</div></body>');
    const content = dom.window.document.getElementById('dashboard-content');
    const left = [];
    content.addEventListener('click', (e) => {
      new Function('e', 'leaveVisit', HANDLER)(e, () => { left.push(1); return Promise.resolve(); });
    });
    content.querySelector('.upd-text').click();
    assert.deepStrictEqual(left, [], 'a click on the text went back');
    content.querySelector('#visit-back').click();
    assert.deepStrictEqual(left, [1], 'the button did not go back');
    const back = content.querySelector('#visit-back');
    assert.ok(back.querySelector('.btn-spinner'), 'no spinner while the home club downloads');
    assert.strictEqual(back.disabled, true, 'a second press would start a second switch');
    assert.strictEqual(back.textContent, CA['visit.back'].replace('{club}', 'Home FC'), 'the label went');
  });

  it('sits in the banner slot every page renders through', () => {
    const body = grab('  function renderPage(session)', '\n  // #endregion Dashboard');
    assert.ok(/content\.innerHTML = renderVisitBanner\(\) \+ renderUpdateBanner\(\)/.test(body));
  });
});

/* The claims listener re-points the app when the server moves a member. A
   visit is the one time the session is DELIBERATELY elsewhere. */
function makeClaims(opts) {
  const log = [];
  const session = Object.assign(HOME(), opts.session || {});
  const api = {
    firebaseUser: {
      getIdToken: async () => {},
      getIdTokenResult: async () => ({ claims: { teamId: opts.claimTeam } }),
    },
    loadClubConfig: async (id) => { log.push(['load', id]); },
    DB: { init: async (id) => { log.push(['init', id]); } },
    navigate: () => { log.push(['nav']); },
    getVisibleCategories: () => ['amateur'],
    loadRosters: async () => ({}),
    syncDbScope: () => {},
  };
  const fn = new Function(...Object.keys(api), 'S0', 'HOME0', `
    let _currentSession = S0;
    let _visitHome = HOME0;
    let _lastClaimsMs = 1;
    let _clubConfig = null;
    let _viewCategory = null;
    let currentPage = 'staff-home';
    function getSession() { return _currentSession; }
    function hasClub(id) { return !!id && id !== 'none' && id !== 'default'; }
    const cb = ${CLAIMS}};
    return { cb, state: () => ({ s: _currentSession, home: _visitHome }) };
  `);
  const out = fn(...Object.values(api), session, opts.visitHome || null);
  const snap = (data) => ({ exists: true, data: () => Object.assign({ claimsUpdatedAt: { toMillis: () => 5 } }, data) });
  return Object.assign(out, { log, snap });
}

describe('the claims listener during a visit', () => {
  const visiting = () => ({
    session: { teamId: 'away', roles: ['staff'], isTeamLead: false, staffCategories: [],
      staffRole: '', category: '', team: '' },
    visitHome: Object.assign(membership(HOME()), { clubName: 'Home FC' }),
  });

  it('control: NOT visiting, a claim on another club re-points the session', async () => {
    const c = makeClaims({ claimTeam: 'elsewhere' });
    await c.cb(c.snap({ teamId: 'elsewhere' }));
    assert.strictEqual(c.state().s.teamId, 'elsewhere');
  });

  it('leaves the visit on screen', async () => {
    const c = makeClaims(Object.assign({ claimTeam: 'home' }, visiting()));
    await c.cb(c.snap(Object.assign(membership(HOME()), { roles: ['player', 'lead'] })));
    assert.strictEqual(c.state().s.teamId, 'away');
    assert.deepStrictEqual(c.state().s.roles, ['staff'], 'the visit took the home roles');
    assert.deepStrictEqual(c.log, []);
  });

  it('keeps the new home membership for the way back', async () => {
    const c = makeClaims(Object.assign({ claimTeam: 'home' }, visiting()));
    await c.cb(c.snap(Object.assign(membership(HOME()), { roles: ['player', 'lead'], team: 'A' })));
    assert.deepStrictEqual(c.state().home.roles, ['player', 'lead']);
    assert.strictEqual(c.state().home.team, 'A');
    assert.strictEqual(c.state().home.clubName, 'Home FC', 'same club, the name still holds');
  });

  it('forgets the home club\'s name when the home club itself changed', async () => {
    const c = makeClaims(Object.assign({ claimTeam: null }, visiting()));
    await c.cb(c.snap({ teamId: undefined, isTeamLead: false, roles: [] }));
    assert.strictEqual(c.state().home.teamId, 'none');
    assert.strictEqual(c.state().home.clubName, '');
  });
});

describe('setSession during a visit', () => {
  function run(visiting) {
    const log = [];
    const api = {
      syncDbScope: () => {},
      auth: { currentUser: { uid: 'u1' } },
      db: recordingDb(log),
      MAX_PIC_SRC: 1e6,
      getUsers: () => [],
      saveUsers: (u) => { log.push(['saveUsers', u.map((x) => x.id)]); },
    };
    const fn = new Function(...Object.keys(api), 'VISITING', `
      let _currentSession = null;
      let _visitHome = VISITING ? { teamId: 'home' } : null;
      ${SET_SESSION}
      return setSession;
    `);
    fn(...Object.values(api), visiting)(Object.assign(HOME(), { teamId: 'away', roles: ['staff'] }));
    return log;
  }

  it('control: at home, the session goes into the club\'s member list', () => {
    assert.ok(run(false).some((e) => e[0] === 'saveUsers'));
  });

  it('visiting, the profile is saved but the visited club\'s member list is left alone', () => {
    const log = run(true);
    assert.ok(log.some((e) => e[0] === 'db.set' && e[1] === 'users/u1'), 'profile not saved');
    assert.ok(!log.some((e) => e[0] === 'saveUsers'), 'the superadmin was pushed into the visited club');
  });
});

/* The create handler, run against a real DOM. */
function makeCreate(opts) {
  const log = [];
  const dom = new JSDOM('<body>' +
      '<input id="new-club-name" value="C.E. Nou"><input id="new-club-email" value="' + opts.lead + '">' +
      '<input id="new-club-badge" type="file"><input id="new-club-town" value="">' +
      '<input id="new-club-maxteams" value="2"><div id="create-club-result" hidden></div>' +
      '<button id="btn-create-club">Crea</button></body>');
  const doc = dom.window.document;
  const session = Object.assign(HOME(), opts.session || {});
  const api = {
    document: doc,
    t, sanitize: esc,
    db: recordingDb(log),
    auth: { currentUser: { getIdToken: async () => { log.push(['token']); } } },
    firebase: { app: () => ({ functions: () => ({ httpsCallable: (name) => async (payload) => {
      log.push(['call', name, payload]);
      return { data: { clubId: 'new1', isTeamLead: true, roles: [], category: '', team: '',
        staffCategories: [], staffRole: '' } };
    } }) }) },
    createClub: async (name, email) => ({ id: 'new1', code: 'NEWC0DE', leadEmail: email.toLowerCase() }),
    loadClubConfig: async (id) => { log.push(['load', id]); },
    DB: { init: async (id) => { log.push(['init', id]); } },
    getVisibleCategories: () => [],
    _loadClubList: () => {},
    renderPage: () => {},
  };
  const fn = new Function(...Object.keys(api), 'S0', 'VISITING', `
    let _currentSession = S0;
    let _visitHome = VISITING ? { teamId: 'none' } : null;
    function getSession() { return _currentSession; }
    function hasClub(id) { return !!id && id !== 'none' && id !== 'default'; }
    const createClubBtn = document.getElementById('btn-create-club');
    ${CREATE}
    return { btn: createClubBtn, state: () => ({ s: _currentSession }) };
  `);
  const out = fn(...Object.values(api), session, !!opts.visiting);
  out.create = async () => {
    out.btn.click();
    // The handler is async; let its awaits run out.
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  };
  return Object.assign(out, { log });
}

describe('creating a club no longer moves the superadmin', () => {
  it('in a club already, naming yourself responsable does NOT join you', async () => {
    const c = makeCreate({ lead: 'su@x.com' });
    await c.create();
    assert.strictEqual(c.state().s.teamId, 'home', 'the superadmin was moved out of their club');
    assert.ok(!c.log.some((e) => e[0] === 'call'), 'joinClub was called');
    assert.ok(!c.log.some((e) => e[0] === 'init'), 'the app was re-pointed');
  });

  it('in no club, joins through the joinClub callable with the new code', async () => {
    const c = makeCreate({ lead: 'su@x.com', session: { teamId: 'none', isTeamLead: false, roles: ['staff'] } });
    await c.create();
    assert.deepStrictEqual(c.log.filter((e) => e[0] === 'call'), [['call', 'joinClub', { code: 'NEWC0DE' }]]);
    assert.strictEqual(c.state().s.teamId, 'new1');
    assert.strictEqual(c.state().s.isTeamLead, true);
    assert.ok(c.log.some((e) => e[0] === 'token'), 'the ID token was not refreshed');
    assert.deepStrictEqual(c.log.filter((e) => e[0] === 'load' || e[0] === 'init'),
        [['load', 'new1'], ['init', 'new1']]);
  });

  it('never writes teamId to the user document from the client', async () => {
    const c = makeCreate({ lead: 'su@x.com', session: { teamId: 'none' } });
    await c.create();
    assert.deepStrictEqual(c.log.filter((e) => /^db\./.test(e[0])), []);
  });

  it('someone else as responsable: nobody joins', async () => {
    const c = makeCreate({ lead: 'lead@club.cat', session: { teamId: 'none' } });
    await c.create();
    assert.strictEqual(c.state().s.teamId, 'none');
    assert.ok(!c.log.some((e) => e[0] === 'call'));
  });

  it('mid-visit, the club on screen is not "no club": nobody joins', async () => {
    const c = makeCreate({ lead: 'su@x.com', visiting: true, session: { teamId: 'none' } });
    await c.create();
    assert.ok(!c.log.some((e) => e[0] === 'call'));
  });
});

describe('the Clubs table opens a club', () => {
  /* `visit` replaces the visitClub stub — a promise that never settles is
     a switch still downloading; one that rejects is a switch that failed. */
  async function mount(here, visit) {
    const visits = [];
    const toasts = [];
    const dom = new JSDOM('<body><div id="club-list"></div></body>');
    const doc = dom.window.document;
    const clubs = [{ id: 'home', name: 'Home FC' }, { id: 'away', name: 'Away CF' },
      { id: 'third', name: 'Third UD' }];
    const snap = (docs) => ({ empty: !docs.length, forEach: (f) => docs.forEach(f) });
    const db = {
      collection: (c) => ({
        get: async () => (c === 'clubs'
          ? snap(clubs.map((x) => ({ id: x.id, data: () => ({ name: x.name }) })))
          : snap([])),
        where: () => ({ count: () => ({ get: async () => ({ data: () => ({ count: 3 }) }) }) }),
      }),
    };
    const api = {
      document: doc, db, t, sanitize: esc,
      getSession: () => Object.assign(HOME(), { teamId: here }),
      rosterKeys: () => [],
      visitClub: (id) => { visits.push(id); return visit ? visit() : Promise.resolve(); },
      _checkLeadEmail: () => {}, _saveLeadEmail: () => {}, updateClub: async () => {},
      _showPushToast: (a, b) => { toasts.push(b); }, firebase: {},
    };
    const fn = new Function(...Object.keys(api), `${CLUB_LIST}\n return _loadClubList;`);
    await fn(...Object.values(api))();
    const btn = (id) => doc.querySelector('.btn-open-club[data-club="' + id + '"]');
    return { doc, btn, visits, toasts };
  }

  it('every row has an Obrir button', async () => {
    const m = await mount('home');
    assert.ok(m.btn('home') && m.btn('away'), 'a row has no Obrir');
    assert.strictEqual(m.btn('away').textContent, CA['cfg.open_club']);
  });

  it('a click spins THAT button and holds the others while the club downloads', async () => {
    const m = await mount('home', () => new Promise(() => {}));
    m.btn('away').click();
    assert.ok(m.btn('away').querySelector('.btn-spinner'), 'no spinner on the pressed button');
    assert.strictEqual(m.btn('away').textContent, CA['cfg.open_club'], 'the label went');
    assert.ok(!m.btn('third').querySelector('.btn-spinner'), 'a button nobody pressed spins');
    ['home', 'away', 'third'].forEach((id) =>
      assert.strictEqual(m.btn(id).disabled, true, id + ' can still start a second switch'));
    m.btn('third').click();
    assert.deepStrictEqual(m.visits, ['away'], 'a second switch started underneath the first');
  });

  it('a failed switch puts every button back as it was, and says so', async () => {
    const m = await mount('home', () => Promise.reject(new Error('offline')));
    m.btn('away').click();
    await new Promise((r) => setImmediate(r));
    assert.ok(!m.btn('away').querySelector('.btn-spinner'), 'still spinning');
    assert.strictEqual(m.btn('away').disabled, false);
    assert.strictEqual(m.btn('third').disabled, false);
    assert.strictEqual(m.btn('home').disabled, true, 'the club on screen became openable');
    assert.strictEqual(m.toasts.length, 1, 'the failure was silent');
  });

  it('the club on screen cannot be opened again', async () => {
    const m = await mount('home');
    assert.strictEqual(m.btn('home').disabled, true);
    assert.strictEqual(m.btn('away').disabled, false);
  });

  it('a click opens THAT club', async () => {
    const m = await mount('home');
    m.btn('away').click();
    assert.deepStrictEqual(m.visits, ['away']);
  });
});

describe('a superadmin in no club lands on Configuració', () => {
  function gate(session, page) {
    return new Function('session', 'currentPage', 'hasClub',
        NO_CLUB_GATE + '\n return currentPage;')(
        session, page, (id) => !!id && id !== 'none' && id !== 'default');
  }

  it('from a page that needs a club', () => {
    assert.strictEqual(gate({ isAdmin: true, teamId: 'none' }, 'staff-home'), 'settings');
    assert.strictEqual(gate({ isAdmin: true, teamId: undefined }, 'calendar'), 'settings');
  });

  it('but not from the platform board pages, which need none', () => {
    assert.strictEqual(gate({ isAdmin: true, teamId: 'none' }, 'admin-boards'), 'admin-boards');
    assert.strictEqual(gate({ isAdmin: true, teamId: 'none' }, 'tactics'), 'tactics');
  });

  it('and nobody else, and not a superadmin who has a club', () => {
    assert.strictEqual(gate({ isAdmin: false, teamId: 'none' }, 'staff-home'), 'staff-home');
    assert.strictEqual(gate({ isAdmin: true, teamId: 'home' }, 'staff-home'), 'staff-home');
  });
});
