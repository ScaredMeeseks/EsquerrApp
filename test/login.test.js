/* The sign-in screen on paper, and the crest that replaced the Esquerra logo
 * (v280). `npm run test:login`.
 *
 * The owner's rule: a device that has never signed in shows NO crest; after a
 * sign-in it shows that club's, also after logging out; and the browser tab
 * carries it too. Four pieces make that true and each is run here for real:
 *
 *   1. the two inline scripts in index.html (tab icon, splash), executed by
 *      jsdom against the real file with and without a cached crest;
 *   2. paintCrest(), sliced out of js/app.js and run over the real markup;
 *   3. loadClubConfig()'s cache, sliced and run over stubs — a club with a
 *      crest fills it, a club without one CLEARS it (or the previous club's
 *      would show), and signing out leaves it alone;
 *   4. db.js's own logout paths (cleanup, flush), run for real, which must
 *      not remove the cache.
 *
 * Plus the two fixes that shipped beside it: the coach's session page reading
 * a date-keyed answer, and "Partits" counting one category's fixtures.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {JSDOM} = require('jsdom');
const {readCss} = require('./read-css');

const ROOT = path.join(__dirname, '..');
// LOGIN_APP / LOGIN_HTML let the mutation runner point the suite at a copy.
const src = fs.readFileSync(process.env.LOGIN_APP || path.join(ROOT, 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(process.env.LOGIN_HTML || path.join(ROOT, 'index.html'), 'utf8');
const css = readCss();

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

const BADGE = 'data:image/png;base64,QkFER0U=';
const CLUB = 'C.E. Sant Andreu del Palomar';

/** index.html with its INLINE scripts run (external ones are not fetched). */
function boot(cache) {
  const dom = new JSDOM(html, {
    url: 'http://localhost/', runScripts: 'dangerously',
    beforeParse(w) {
      Object.entries(cache || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
    },
  });
  return dom.window;
}

/** index.html as a DOM only, plus paintCrest/applyI18nHtml from app.js. */
function page(cache, lang) {
  const dom = new JSDOM(html, {url: 'http://localhost/'});
  const w = dom.window;
  Object.entries(cache || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
  const t = (k) => (lang || 'ca') + ':' + k;
  // eslint-disable-next-line no-new-func
  const api = new Function('document', 'localStorage', 't',
      grab('  const BLANK_ICON', '  /** The club crest, or the app logo.') +
      grab('  function applyI18nHtml()', '  // ---------- i18n Date Helpers') +
      'return {paintCrest, cachedCrest, applyI18nHtml, BLANK_ICON};')(w.document, w.localStorage, t);
  return {w, d: w.document, api};
}

describe('login — the inline boot scripts in index.html', () => {
  it('first visit: a blank tab icon and a blank splash, never the Esquerra logo', () => {
    const w = boot();
    const fav = w.document.getElementById('app-favicon');
    assert.ok(fav, 'there is a tab icon link');
    assert.ok(/^data:image\/gif/.test(fav.getAttribute('href')), 'a blank image, so no /favicon.ico 404');
    const splash = w.document.getElementById('splash-badge');
    assert.strictEqual(splash.style.visibility, 'hidden');
    assert.ok(!/logo\.png/.test(splash.getAttribute('src') || ''));
  });

  it('a device that has signed in: the club crest in the tab and on the splash', () => {
    const w = boot({_splash_badge: BADGE});
    assert.strictEqual(w.document.getElementById('app-favicon').getAttribute('href'), BADGE);
    const splash = w.document.getElementById('splash-badge');
    assert.strictEqual(splash.getAttribute('src'), BADGE);
    assert.notStrictEqual(splash.style.visibility, 'hidden');
  });

  it('the tab icon is set in <head>, before the body renders', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes('id="app-favicon"'));
    assert.ok(/getElementById\('app-favicon'\)/.test(head));
  });
});

describe('login — paintCrest', () => {
  it('first visit: no crest anywhere, the app name, the first-visit wording', () => {
    const {d, api} = page();
    api.paintCrest();
    const crests = d.querySelectorAll('img[data-crest]');
    assert.strictEqual(crests.length, 3, 'login, register, profile setup');
    crests.forEach((img) => { assert.ok(img.hidden); assert.ok(!img.getAttribute('src')); });
    d.querySelectorAll('#view-login [data-crest-name], #view-register [data-crest-name]')
        .forEach((el) => assert.strictEqual(el.textContent, 'EsquerrApp'));
    assert.strictEqual(d.querySelector('#view-login .lg-h1').getAttribute('data-i18n'), 'auth.welcome');
    assert.strictEqual(d.querySelector('#view-login .lg-sub').textContent, 'ca:auth.subtitle');
    assert.strictEqual(d.getElementById('app-favicon').getAttribute('href'), api.BLANK_ICON);
  });

  it('returning: the crest, the club name and "welcome back"', () => {
    const {d, api} = page({_splash_badge: BADGE, _splash_club_name: CLUB});
    api.paintCrest();
    d.querySelectorAll('img[data-crest]').forEach((img) => {
      assert.ok(!img.hidden); assert.strictEqual(img.getAttribute('src'), BADGE);
    });
    assert.strictEqual(d.querySelector('#view-login [data-crest-name]').textContent, CLUB);
    assert.strictEqual(d.querySelector('#view-login .lg-h1').textContent, 'ca:auth.welcome_back');
    assert.strictEqual(d.querySelector('#view-login .lg-sub').textContent, 'ca:auth.subtitle_back');
    assert.strictEqual(d.getElementById('app-favicon').getAttribute('href'), BADGE);
  });

  it('a language change keeps the returning wording', () => {
    const {d, api} = page({_splash_badge: BADGE, _splash_club_name: CLUB}, 'es');
    api.paintCrest();
    api.applyI18nHtml(); // what the language switcher runs
    assert.strictEqual(d.querySelector('#view-login .lg-h1').textContent, 'es:auth.welcome_back');
  });

  it('the join screen shows no crest at all: that person has no club yet', () => {
    const {d} = page({_splash_badge: BADGE});
    assert.strictEqual(d.querySelectorAll('#view-join-club img').length, 0);
  });

  it('no screen before sign-in still points at the Esquerra logo', () => {
    ['view-login', 'view-register', 'view-join-club', 'view-profile-setup'].forEach((id) => {
      const {d} = page();
      assert.ok(!/logo\.png/.test(d.getElementById(id).innerHTML), id);
    });
    assert.ok(!/document\.getElementById\('splash-badge'\)\.src=cached\|\|'img\/logo\.png'/.test(html));
  });
});

/* v283: the installed app's icon follows the club. The real builder, shared
   by paintAppIcon() and checked against index.html's head script below. */
const APP_ICON_SRC = grab("  /* ── The installed app's icon follows the club (v283)",
    "  /** This club's kits");
const MANIFEST_FN = 'https://appmanifest-674dkdzfja-uc.a.run.app';
const ICON_FN = 'https://appicon-674dkdzfja-uc.a.run.app';

describe('login — the crest cache (loadClubConfig)', () => {
  /* `visiting`: a superadmin visiting another club (v281), whose home club's
     cache must survive the visit. */
  function run(club, cache, visiting) {
    const {w, api} = page(cache);
    let fetched = 0;
    // eslint-disable-next-line no-new-func
    const load = new Function('document', 'localStorage', 'paintCrest', 'getClub', 'fetch', 'FileReader',
        'location',
        'let _clubConfig = null;' +
        'let _visitHome = ' + (visiting ? '{ teamId: "club1" }' : 'null') + ';' +
        'const pruneStaleLeagueCache = () => {}; const setSeasonBoundary = () => {};' +
        'const syncDbScope = () => {}; const loadRosters = async () => ({});' +
        APP_ICON_SRC +
        grab('  async function loadClubConfig(clubId) {', '  // Get the club display name') +
        'return loadClubConfig;')(w.document, w.localStorage, api.paintCrest,
        async () => club, async () => { fetched++; throw new Error('CORS'); }, w.FileReader,
        w.location);
    return {w, api, load, fetched: () => fetched};
  }

  it('a club with a crest: cached at once, name too, tab icon follows', async () => {
    const r = run({name: CLUB, badgeUrl: 'https://x/badge.png'});
    await r.load('club1');
    assert.strictEqual(r.w.localStorage.getItem('_splash_badge'), 'https://x/badge.png');
    assert.strictEqual(r.w.localStorage.getItem('_splash_club_name'), CLUB);
    assert.strictEqual(r.w.document.getElementById('app-favicon').getAttribute('href'), 'https://x/badge.png');
    assert.strictEqual(r.fetched(), 1, 'and it tried to upgrade it to a data URL');
  });

  it('v283: a club with a crest points the install at ITS icon', async () => {
    const r = run({name: CLUB, badgeUrl: 'https://x/badge.png'});
    await r.load('club1');
    const d = r.w.document;
    assert.strictEqual(r.w.localStorage.getItem('_app_icon_club'), 'club1');
    assert.strictEqual(d.getElementById('app-manifest').getAttribute('href'),
        MANIFEST_FN + '?club=club1&app=' + encodeURIComponent('http://localhost/'));
    assert.strictEqual(d.getElementById('app-touch-icon').getAttribute('href'),
        ICON_FN + '?club=club1&s=180');
  });

  it('v283: a club without one goes back to the app\'s own icon', async () => {
    const r = run({name: 'C.F. Nou'}, {_app_icon_club: 'club1'});
    const d = r.w.document;
    d.getElementById('app-manifest').setAttribute('href', MANIFEST_FN + '?club=club1');
    await r.load('club2');
    assert.strictEqual(r.w.localStorage.getItem('_app_icon_club'), null);
    assert.strictEqual(d.getElementById('app-manifest').getAttribute('href'), 'manifest.json');
    assert.strictEqual(d.getElementById('app-touch-icon').getAttribute('href'), 'img/logo-192.png');
  });

  it('v283: a VISIT leaves the home club\'s icon alone', async () => {
    const r = run({name: 'C.E. Europa', badgeUrl: 'https://x/europa.png'}, {_app_icon_club: 'club1'}, true);
    await r.load('club2');
    assert.strictEqual(r.w.localStorage.getItem('_app_icon_club'), 'club1');
  });

  it('v283: the head script builds the SAME two addresses before anything renders', () => {
    const w = boot({_app_icon_club: 'club1'});
    // eslint-disable-next-line no-new-func
    const hrefs = new Function('location', APP_ICON_SRC + 'return appIconHrefs;')(w.location)('club1');
    assert.strictEqual(w.document.getElementById('app-manifest').getAttribute('href'), hrefs.manifest);
    assert.strictEqual(w.document.getElementById('app-touch-icon').getAttribute('href'), hrefs.touch);
    // An id that could steer the URL is refused, by both.
    const bad = boot({_app_icon_club: 'x&app=https://evil'});
    assert.strictEqual(bad.document.getElementById('app-manifest').getAttribute('href'), 'manifest.json');
    // eslint-disable-next-line no-new-func
    assert.strictEqual(new Function('location', APP_ICON_SRC + 'return appIconHrefs;')(w.location)(
        'x&app=https://evil').manifest, 'manifest.json');
  });

  it('a club WITHOUT a crest clears the previous club\'s', async () => {
    const r = run({name: 'C.F. Nou'}, {_splash_badge: BADGE, _splash_badge_url: 'https://old', _splash_club_name: CLUB});
    r.api.paintCrest(); // the old club's crest is on screen
    assert.ok(!r.w.document.querySelector('#view-login img[data-crest]').hidden);
    await r.load('club2');
    assert.strictEqual(r.w.localStorage.getItem('_splash_badge'), null);
    assert.strictEqual(r.w.localStorage.getItem('_splash_club_name'), 'C.F. Nou');
    const img = r.w.document.querySelector('#view-login img[data-crest]');
    assert.ok(img.hidden && !img.getAttribute('src'));
  });

  /* v281. The superadmin opening another club from the Clubs table: the
     visited club is on screen, but the device still belongs to the home
     club — a reload mid-visit must find the home crest on the sign-in screen. */
  it('a superadmin VISITING another club leaves the home club\'s cache alone', async () => {
    const r = run({name: 'C.E. Europa', badgeUrl: 'https://x/europa.png'},
        {_splash_badge: BADGE, _splash_badge_url: 'https://old', _splash_club_name: CLUB}, true);
    const cfg = await r.load('club2');
    assert.strictEqual(cfg.name, 'C.E. Europa', 'the visited club was not loaded');
    assert.strictEqual(r.w.localStorage.getItem('_splash_badge'), BADGE);
    assert.strictEqual(r.w.localStorage.getItem('_splash_badge_url'), 'https://old');
    assert.strictEqual(r.w.localStorage.getItem('_splash_club_name'), CLUB);
    assert.strictEqual(r.fetched(), 0, 'it downloaded the visited club\'s crest');
  });

  it('signing out (no club) leaves the cache alone', async () => {
    const r = run(null, {_splash_badge: BADGE, _splash_club_name: CLUB});
    await r.load(null);
    assert.strictEqual(r.w.localStorage.getItem('_splash_badge'), BADGE);
    assert.strictEqual(r.w.localStorage.getItem('_splash_club_name'), CLUB);
  });

  it('db.js\'s logout paths do not remove it either', () => {
    const {FakeStore, makeApi, FakeLocalStorage} = require('./fake-firestore');
    const {db, firebase} = makeApi(new FakeStore());
    const localStorage = new FakeLocalStorage();
    const sandbox = {localStorage, db, firebase, Shard: require('../js/shard.js'), console,
      window: {dispatchEvent: () => {}}, CustomEvent: class {}, Promise, JSON, Object, Array,
      Error, String, Set, Map};
    sandbox.globalThis = sandbox;
    const DB = vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'db.js'), 'utf8') + '\n;DB;', sandbox);
    localStorage.setItem('_splash_badge', BADGE);
    localStorage.setItem('_splash_club_name', CLUB);
    localStorage.setItem('fa_matches', '[]');
    DB.cleanup();
    DB.flush();
    assert.strictEqual(localStorage.getItem('fa_matches'), null, 'flush did run (control)');
    assert.strictEqual(localStorage.getItem('_splash_badge'), BADGE);
    assert.strictEqual(localStorage.getItem('_splash_club_name'), CLUB);
  });
});

describe('login — on paper', () => {
  it('both screens wear it; the join and setup screens do not', () => {
    const {d} = page();
    assert.ok(d.getElementById('view-login').classList.contains('lg-view'));
    assert.ok(d.getElementById('view-register').classList.contains('lg-view'));
    ['view-join-club', 'view-team-setup', 'view-profile-setup'].forEach((id) =>
      assert.ok(!d.getElementById(id).classList.contains('lg-view'), id));
  });

  it('every new rule is scoped, and the red gradient is gone from these two', () => {
    const block = css.slice(css.indexOf('/* ── Sign-in and register, on paper (v280)'),
        css.indexOf('/* ===== Role Selection ===== */'));
    assert.ok(block.length > 500);
    const selectors = block.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g)
        .map((s) => s.trim()).filter((s) => s && !s.startsWith('@media'));
    selectors.forEach((s) => s.split(',').forEach((one) =>
      assert.ok(/^\.lg-/.test(one.trim()), 'unscoped selector: ' + one.trim())));
    assert.ok(/\.lg-view \.auth-container \{ background: #E9E6E0; \}/.test(block), 'the desk, not the gradient');
  });

  it('every new string exists in ca, es and en', () => {
    ['auth.welcome', 'auth.welcome_back', 'auth.subtitle', 'auth.subtitle_back', 'auth.register_title']
        .forEach((k) => {
          const m = new RegExp("'" + k.replace('.', '\\.') + "':\\s*\\{([^}]+)\\}").exec(src);
          assert.ok(m, k);
          ['ca:', 'es:', 'en:'].forEach((l) => assert.ok(m[1].includes(l), k + ' ' + l));
        });
    assert.ok(!/millor club del barri/.test(src), 'the screen serves every club now');
  });
});

describe('v280 — the coach\'s session page reads date-keyed answers', () => {
  // eslint-disable-next-line no-new-func
  const R = new Function(grab('  function recordKey(playerId, sess, kind)', '  /* ── Attendance: ONE rule') +
    'return {recordKey, readRecord};')();
  const tr = {id: 'tr_1', date: '2026-08-11'};

  it('the answer column goes through readRecord', () => {
    const page = grab('  function renderStaffTrainingDetail()', '  /**\n   * The stacked attendance bar');
    assert.ok(/const playerAnswer = readRecord\(availData, p\.id, tr, 'avail'\)/.test(page));
    assert.ok(!/const playerAnswer = availData\[key\]/.test(page));
  });

  it('which finds an answer filed under the session date', () => {
    assert.strictEqual(R.readRecord({'u1_2026-08-11': 'late'}, 'u1', tr, 'avail'), 'late');
    assert.strictEqual(R.readRecord({u1_tr_1: 'yes', 'u1_2026-08-11': 'no'}, 'u1', tr, 'avail'), 'yes');
  });
});

describe('v280 — "Partits" counts the player\'s own category', () => {
  const players = [
    {id: 'j1', team: 'A', category: 'juvenil'},
    {id: 'a1', team: 'A', category: 'amateur'},
  ];
  const stats = (() => {
    // eslint-disable-next-line no-new-func
    // A FIXED season start: the fixtures below are dated, and a real
    // seasonStartStr() would move them into "last season" one August.
    return new Function('getUsers', 'isOurTeam', 'localStorage', 'seasonStartStr',
        grab('  function calcMatchScore(events)', '  function formatEventMinute') +
        grab('  function getStartingXI(matchId, sentData)', '  // ── Match history table builder ──') +
        'return computePlayerMatchStats;')(() => players, (n) => n === 'Club', {getItem: () => null},
        () => '2026-08-15');
  })();
  const m = (id, cat, team) => ({id, date: '2026-09-05', time: '18:00', home: 'Club', away: 'X', team, category: cat});
  const ctx = {
    matches: [m(1, 'juvenil', 'A'), m(2, 'amateur', 'A'), m(3, 'amateur', 'A'), m(4, undefined, 'A')],
    allEvents: {},
    sentData: {3: {players: ['j1'], startingXI: []}},
  };

  it('a Juvenil A player: his fixtures, a call-up up a category, a legacy row — not the rest', () => {
    const s = stats('j1', ctx);
    assert.deepStrictEqual(s.matchRows.map((r) => r.matchId).sort(), [1, 3, 4]);
    // v284: "Partits" is his CALL-UPS — one, match 3. Rows 1 and 4 are NC.
    assert.strictEqual(s.totals.matches, 1);
  });

  it('an Amateur A player still has all of Amateur A', () => {
    const s = stats('a1', ctx);
    assert.deepStrictEqual(s.matchRows.map((r) => r.matchId).sort(), [2, 3, 4]);
  });
});

/* v284 — the owner's own profile read "34 partits": last season's 27 fixtures
   of his squad (all withdrawn by the FCF sync once the new group arrived),
   plus this season's 7, none of them asked whether he had been called up
   (he had, 3 times). The real computePlayerMatchStats over that shape. */
describe('v284 — "Partits" is this season\'s call-ups', () => {
  const players = [{id: 'me', team: 'B', category: 'amateur'}];
  const stats = new Function('getUsers', 'isOurTeam', 'localStorage', 'seasonStartStr',
      grab('  function calcMatchScore(events)', '  function formatEventMinute') +
      grab('  function getStartingXI(matchId, sentData)', '  // ── Match history table builder ──') +
      'return computePlayerMatchStats;')(() => players, (n) => n === 'Club', {getItem: () => null},
      () => '2026-08-15');
  const fx = (id, date, extra) => Object.assign(
      {id, date, time: '18:00', home: 'Club', away: 'X', team: 'B', category: 'amateur'}, extra);
  const last = Array.from({length: 27}, (_, i) =>
    fx('old' + i, '2026-0' + (1 + (i % 5)) + '-1' + (i % 9), {fcfRemoved: true}));
  const now = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04', '2026-10-05', '2026-10-11']
      .map((d, i) => fx('new' + i, d));
  const sentData = {new1: {players: ['me'], startingXI: ['me']}, new3: {players: ['me'], startingXI: []},
    new5: {players: ['me'], startingXI: ['x']}, old2: {players: ['me'], startingXI: ['me']}};
  const ctx = {matches: last.concat(now), allEvents: {}, sentData};

  it('the owner\'s case: 3, not 34', () => {
    const s = stats('me', ctx);
    assert.strictEqual(s.totals.matches, 3, 'counted ' + s.totals.matches);
  });

  it('nothing from before the season boundary, even a call-up', () => {
    const s = stats('me', ctx);
    assert.ok(s.matchRows.every((r) => r.date >= '2026-08-15'),
        'a last-season row is still listed');
  });

  it('a fixture the federation withdrew is not a match, this season either', () => {
    const c = {matches: [fx('w', '2026-09-30', {fcfRemoved: true}), fx('p', '2026-09-28')],
      allEvents: {}, sentData: {w: {players: ['me'], startingXI: ['me']}}};
    const s = stats('me', c);
    assert.deepStrictEqual(s.matchRows.map((r) => r.matchId), ['p']);
    assert.strictEqual(s.totals.matches, 0);
    assert.strictEqual(s.totals.titulars, 0, 'the withdrawn start still counts');
  });

  it('keeps the squad\'s NC rows for the coach, and still counts T / S', () => {
    const s = stats('me', ctx);
    assert.strictEqual(s.matchRows.length, 7, 'the coach\'s T / S / NC lost the NC rows');
    assert.strictEqual(s.matchRows.filter((r) => r.status === 'NC').length, 4);
    assert.strictEqual(s.totals.titulars, 1);
  });

  it('a call-up to the OTHER squad counts — a member of two squads comes out right', () => {
    const c = {matches: [fx('a1', '2026-09-27', {team: 'A'})], allEvents: {},
      sentData: {a1: {players: ['me'], startingXI: []}}};
    assert.strictEqual(stats('me', c).totals.matches, 1);
  });

  it('the season start is the club\'s boundary, read at run time', () => {
    const src2 = grab('  function computePlayerMatchStats(playerId, ctx) {', '  // ── Match history table builder ──');
    assert.ok(/var seasonFrom = seasonStartStr\(now\);/.test(src2));
    assert.ok(/if \(m\.date < seasonFrom\) return;/.test(src2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
/* v282 — the sign-up consents. The owner's rule: no account without
   notifications, and the submit opens on a GRANTED permission, not on a tick.
   Everything here runs the real code over the real index.html form:
   regPaintConsent / bindRegConsent, and handleRegister's own guard. */
describe('v282 — sign-up needs notifications', () => {
  const CONSENT = grab('  /* ── Sign-up consents (v282)', '  async function handleLogin(e) {');
  const REGISTER = grab('  async function handleRegister(e) {', '  /* ── Sign-up consents (v282)');
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const IPAD13 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const utilsSrc = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  const realSanitize = new Function('document', utilsSrc.slice(
      utilsSrc.indexOf('function sanitize(str) {'),
      utilsSrc.indexOf('// ---------- Tactical Formations ----------')) +
      '\n return sanitize;')(new JSDOM('').window.document);

  /**
   * The form, with the consent code bound over it.
   * @param {Object} o state / ask (what Push answers), ua, touch, standalone,
   *   bip (a stub beforeinstallprompt), installed, native.
   */
  function form(o) {
    o = o || {};
    const dom = new JSDOM(html, {url: 'http://localhost/'});
    const w = dom.window, d = w.document;
    const errors = [];
    w.addEventListener('error', (e) => errors.push(e.error || e.message));
    const calls = {ask: 0, state: 0, created: [], order: []};
    const Push = {
      permissionState: async () => { calls.state++; return o.state || 'default'; },
      askPermission: async () => { calls.ask++; return o.ask || 'default'; },
      requestPermission: async () => null,
    };
    const nav = {userAgent: o.ua || ANDROID, maxTouchPoints: o.touch || 0, standalone: !!o.iosStandalone};
    calls.navigated = 0; calls.tokens = 0; calls.profile = null; calls.signedOut = 0;
    const win = {
      navigator: nav, _bip: o.bip || null, _appInstalled: !!o.installed,
      matchMedia: (q) => ({matches: !!o.standalone && /standalone/.test(q)}),
      addEventListener: () => {},
    };
    const Capacitor = o.native ? {isNativePlatform: () => true} : undefined;
    Push.requestPermission = async () => { calls.tokens++; return 'tok'; };
    const auth = {
      createUserWithEmailAndPassword: (email) => {
        calls.created.push(email); calls.order.push('create');
        if (o.succeed) {
          return Promise.resolve({user: {uid: 'u1', delete: async () => {}, getIdToken: async () => ''}});
        }
        return Promise.reject(Object.assign(new Error('stop here'), {code: 'auth/email-already-in-use'}));
      },
      signOut: () => { calls.signedOut++; },
    };
    const firebase = {app: () => ({functions: () => ({httpsCallable: () => async () =>
      ({data: {clubId: 'c1', roles: ['player']}})})})};
    const db = {collection: () => ({doc: () => ({set: async (data) => { calls.profile = data; }})})};
    const api = {
      $: (s) => d.querySelector(s), t: (k) => 'T:' + k, Push, navigator: nav, window: win,
      document: d, Capacitor, auth, showView: (id) => { calls.view = id; }, _hideSplash: () => {},
      ADMIN_EMAIL: 'admin@x', console: {warn() {}, log() {}, error() {}},
      firebase, db, loadClubConfig: async () => {}, getUsers: () => [], saveUsers: () => {},
      DB: {init: async () => {}}, getVisibleCategories: () => [], addStaffNotification: () => {},
      navigate: () => { calls.navigated++; }, Notification: o.Notification,
      sanitize: realSanitize, cachedCrest: () => ({badge: o.crest || '', name: o.club || ''}),
    };
    // eslint-disable-next-line no-new-func
    const fns = new Function(...Object.keys(api),
        'let _authFlowBusy = false; let _currentSession = null;\n' + REGISTER + CONSENT +
        '\nreturn {regPaintConsent, regConsentSync, bindRegConsent, handleRegister,' +
        ' appStepMode, showAppStep, step: () => _appStepInstall,' +
        ' setStep: (v) => { _appStepInstall = v; }};')(
        ...Object.values(api));
    if (o.bip) {
      const p = o.bip.prompt;
      o.bip.prompt = () => { calls.order.push('prompt'); return p(); };
    }
    return {w, d, fns, calls, errors, win, el: (id) => d.getElementById(id)};
  }
  async function bound(o) {
    const f = form(o);
    f.fns.bindRegConsent();
    await tick();
    return f;
  }
  const helpKey = (f, id) => f.el(id).hidden ? '' : f.el(id).getAttribute('data-i18n');
  async function submit(f) {
    f.el('reg-name').value = 'Marc';
    f.el('reg-email').value = 'marc@x.cat';
    f.el('reg-password').value = 'secret1';
    f.el('reg-password2').value = 'secret1';
    f.el('reg-team-code').value = 'ESQ001';
    const ev = new f.w.Event('submit', {cancelable: true});
    Object.defineProperty(ev, 'target', {value: f.el('form-register')});
    await f.fns.handleRegister(ev);
  }

  it('the form ships the two boxes, and the submit starts DISABLED', () => {
    const d = new JSDOM(html).window.document;
    assert.ok(d.querySelector('#form-register #reg-notif[type="checkbox"]'), 'no notifications box');
    assert.ok(!d.getElementById('reg-notif').checked, 'pre-ticked consent is not consent');
    assert.ok(d.querySelector('#form-register #reg-install[type="checkbox"]').checked,
        'the install box is the pre-ticked suggestion');
    assert.ok(d.getElementById('reg-install-row').hidden, 'the install row shows before Chrome offered it');
    assert.ok(d.getElementById('reg-submit').disabled, 'a fresh form can be submitted');
  });

  it('already granted: ticked, and the submit opens', async () => {
    const f = await bound({state: 'granted'});
    assert.ok(f.el('reg-notif').checked);
    assert.ok(!f.el('reg-submit').disabled);
    assert.strictEqual(helpKey(f, 'reg-notif-help'), '', 'a help line is showing over a grant');
  });

  it('a tick asks — and a GRANT opens the submit', async () => {
    const f = await bound({state: 'default', ask: 'granted'});
    assert.ok(f.el('reg-submit').disabled);
    f.el('reg-notif').checked = true;
    f.el('reg-notif').dispatchEvent(new f.w.Event('change'));
    await tick();
    assert.strictEqual(f.calls.ask, 1, 'the tap did not open the prompt');
    assert.ok(f.el('reg-notif').checked && !f.el('reg-submit').disabled);
    assert.deepStrictEqual(f.errors, []);
  });

  it('a tick over a dismissed prompt does not stay ticked, and says why', async () => {
    const f = await bound({state: 'default', ask: 'default'});
    f.el('reg-notif').checked = true;
    f.el('reg-notif').dispatchEvent(new f.w.Event('change'));
    await tick();
    assert.ok(!f.el('reg-notif').checked, 'the tick survived a refusal');
    assert.ok(f.el('reg-submit').disabled, 'a refusal opened the submit');
    assert.strictEqual(helpKey(f, 'reg-notif-help'), 'auth.notif_retry');
    assert.ok(!f.el('reg-notif').disabled, 'another tap must be able to ask again');
  });

  it('a tick that ends in a block: disabled box and the unblock help', async () => {
    const f = await bound({state: 'default', ask: 'denied'});
    f.el('reg-notif').checked = true;
    f.el('reg-notif').dispatchEvent(new f.w.Event('change'));
    await tick();
    assert.ok(f.el('reg-notif').disabled && f.el('reg-submit').disabled);
    assert.strictEqual(helpKey(f, 'reg-notif-help'), 'auth.notif_denied');
  });

  it('untick after a grant closes the submit again', async () => {
    const f = await bound({state: 'granted'});
    f.el('reg-notif').checked = false;
    f.el('reg-notif').dispatchEvent(new f.w.Event('change'));
    await tick();
    assert.ok(f.el('reg-submit').disabled);
    assert.strictEqual(f.calls.ask, 0);
  });

  /* v283: the owner's call — an iPhone registers in Safari, is told on the
     form that notifications come from the home-screen app, and the screen
     after sign-up walks through it (see 'the last step after sign-up'). */
  it('an iPhone in Safari may register, and the form says what comes next', async () => {
    const f = await bound({state: 'unsupported', ua: IPHONE, touch: 5});
    assert.ok(f.el('reg-notif-row').hidden, 'a box that can never be ticked is shown');
    assert.strictEqual(helpKey(f, 'reg-notif-help'), 'auth.notif_ios_later');
    assert.ok(!f.el('reg-submit').disabled, 'the iPhone is locked out of registering');
    assert.ok(f.el('reg-install-row').hidden, 'iOS has no install dialog to offer');
  });

  it('...and handleRegister lets it through, marking the account', async () => {
    const f = await bound({state: 'unsupported', ua: IPHONE, touch: 5, succeed: true});
    await submit(f);
    assert.deepStrictEqual(f.calls.created, ['marc@x.cat']);
    assert.strictEqual(f.calls.profile.notifRequired, true, 'the app will not know to ask');
  });

  it('a non-iPhone browser with no API is still refused', async () => {
    const f = await bound({state: 'unsupported', succeed: true});
    await submit(f);
    assert.deepStrictEqual(f.calls.created, [], 'an in-app browser registered without notifications');
  });

  it('an iPad that says it is a Mac is still an iPad', async () => {
    const f = await bound({state: 'unsupported', ua: IPAD13, touch: 5});
    assert.strictEqual(helpKey(f, 'reg-notif-help'), 'auth.notif_ios_later');
    const mac = await bound({state: 'unsupported', ua: IPAD13, touch: 0});
    assert.strictEqual(helpKey(mac, 'reg-notif-help'), 'auth.notif_unsupported', 'a real Mac is not an iPad');
  });

  it('elsewhere, no API at all: open the link in a real browser', async () => {
    const f = await bound({state: 'unsupported'});
    assert.ok(!f.el('reg-notif-row').hidden && f.el('reg-notif').disabled);
    assert.strictEqual(helpKey(f, 'reg-notif-help'), 'auth.notif_unsupported');
  });

  it('the help line carries its key, so a language switch retranslates it', async () => {
    const f = await bound({state: 'denied'});
    assert.strictEqual(f.el('reg-notif-help').textContent, 'T:auth.notif_denied');
    assert.strictEqual(f.el('reg-notif-help').getAttribute('data-i18n'), 'auth.notif_denied');
  });

  it('handleRegister refuses without a grant, before touching Auth', async () => {
    const f = await bound({state: 'default'});
    // A box ticked by hand (devtools, a stale paint) is not a grant.
    f.el('reg-notif').checked = true;
    await submit(f);
    assert.deepStrictEqual(f.calls.created, [], 'an account was created without notifications');
    assert.strictEqual(f.el('register-error').textContent, 'T:error.notif_required');
    assert.ok(!f.el('register-error').hidden);
  });

  it('handleRegister goes ahead once granted', async () => {
    const f = await bound({state: 'granted'});
    await submit(f);
    assert.deepStrictEqual(f.calls.created, ['marc@x.cat']);
  });

  describe('the home-screen box', () => {
    const bipStub = () => {
      const b = {n: 0};
      b.prompt = () => { b.n++; return Promise.resolve(); };
      return b;
    };

    it('shows, pre-ticked, once Chrome offered an install', async () => {
      const f = await bound({state: 'granted', bip: bipStub()});
      assert.ok(!f.el('reg-install-row').hidden);
      assert.ok(f.el('reg-install').checked);
    });

    it('hides in the APK, when already installed, and with nothing to offer', async () => {
      assert.ok((await bound({state: 'granted', bip: bipStub(), native: true})).el('reg-install-row').hidden, 'APK');
      assert.ok((await bound({state: 'granted', bip: bipStub(), standalone: true})).el('reg-install-row').hidden, 'standalone');
      assert.ok((await bound({state: 'granted'})).el('reg-install-row').hidden, 'no prompt');
    });

    it('says so once the app was installed from here', async () => {
      const f = await bound({state: 'granted', installed: true});
      assert.ok(f.el('reg-install-row').hidden);
      assert.strictEqual(helpKey(f, 'reg-install-help'), 'auth.install_done');
    });

    /* v283: the dialog moved OFF the submit, to the last-step screen —
       only once the account exists is the club, and so its crest, known. */
    it('a ticked box queues the last step; the submit opens no dialog', async () => {
      const bip = bipStub();
      const f = await bound({state: 'granted', bip, succeed: true});
      await submit(f);
      assert.strictEqual(bip.n, 0, 'the dialog opened before the club was known');
      assert.strictEqual(f.fns.step(), true, 'the last step was not queued');
      assert.strictEqual(f.calls.navigated, 1);
      assert.ok(f.win._bip, 'the prompt was spent');
    });

    it('an unticked box queues nothing', async () => {
      const bip = bipStub();
      const f = await bound({state: 'granted', bip, succeed: true});
      f.el('reg-install').checked = false;
      await submit(f);
      assert.strictEqual(f.fns.step(), false);
      assert.deepStrictEqual(f.calls.created, ['marc@x.cat'], 'and registration still goes ahead');
    });

    it('a failed registration queues nothing either', async () => {
      const f = await bound({state: 'granted', bip: bipStub()});
      await submit(f);
      assert.strictEqual(f.fns.step(), false);
    });

    it('a refused registration does not spend the install prompt either', async () => {
      const bip = bipStub();
      const f = await bound({state: 'default', bip});
      await submit(f);
      assert.strictEqual(bip.n, 0, 'the dialog opened for a form that was then refused');
    });
  });

  it('the inline head script catches beforeinstallprompt and holds it', () => {
    const w = boot();
    let readies = 0;
    w.document.addEventListener('bip-ready', () => readies++);
    const ev = new w.Event('beforeinstallprompt', {cancelable: true});
    w.dispatchEvent(ev);
    assert.ok(ev.defaultPrevented, 'Chrome would show its own mini-bar and spend the event');
    assert.strictEqual(w._bip, ev);
    assert.strictEqual(readies, 1);
    w.dispatchEvent(new w.Event('appinstalled'));
    assert.strictEqual(w._bip, null);
    assert.strictEqual(w._appInstalled, true);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes("'beforeinstallprompt'"), 'it must be in <head>, ahead of the app script');
  });

  it('every new string exists in ca, es and en', () => {
    ['auth.notif_accept', 'auth.notif_denied', 'auth.notif_retry', 'auth.notif_ios_later',
      'auth.notif_unsupported', 'auth.install_label', 'auth.install_done', 'error.notif_required',
      'app.install_title', 'app.install_sub', 'app.install_btn', 'app.later', 'app.ios_title',
      'app.ios_sub', 'app.ios_1', 'app.ios_2', 'app.ios_3', 'app.ios_4', 'app.notif_title',
      'app.notif_sub', 'app.notif_btn', 'app.notif_denied', 'app.notif_check']
        .forEach((k) => {
          const m = new RegExp("'" + k.replace('.', '\\.') + "':\\s*\\{(.*)\\},?\\s*$", 'm').exec(src);
          assert.ok(m, k);
          ['ca:', 'es:', 'en:'].forEach((l) => assert.ok(m[1].includes(l), k + ' ' + l));
        });
  });

  describe('v283 — the last step after sign-up', () => {
    const NEW = {id: 'u1', notifRequired: true};
    const OLD = {id: 'u0'};
    const N = (permission, answer) => ({permission, requestPermission: async () => answer});

    it('an iPhone in Safari: the four steps, "tap Allow" in bold, and no way on', () => {
      const f = form({ua: IPHONE, touch: 5, crest: 'https://x/c.png', club: 'C.E. Sant Andreu'});
      assert.strictEqual(f.fns.appStepMode(NEW), 'ios');
      f.fns.showAppStep('ios');
      assert.strictEqual(f.calls.view, '#view-app-step');
      const card = f.el('app-step-card');
      const li = [...card.querySelectorAll('ol.lg-steps li')];
      assert.deepStrictEqual(li.map((x) => x.textContent),
          ['T:app.ios_1', 'T:app.ios_2', 'T:app.ios_3', 'T:app.ios_4']);
      assert.ok(li[3].classList.contains('lg-step-key'), 'the Allow step does not stand out');
      assert.strictEqual(card.querySelector('img.lg-crest').getAttribute('src'), 'https://x/c.png');
      assert.strictEqual(card.querySelector('button'), null, 'there is a button that skips it');
      f.el('app-step-logout').click();
      assert.strictEqual(f.calls.signedOut, 1);
    });

    it('a member from before the rule is not stopped in Safari', () => {
      assert.strictEqual(form({ua: IPHONE, touch: 5}).fns.appStepMode(OLD), '');
    });

    it('the iPhone home-screen app asks — and a yes saves the token and goes on', async () => {
      const f = form({ua: IPHONE, touch: 5, iosStandalone: true, Notification: N('default'),
        ask: 'granted'});
      assert.strictEqual(f.fns.appStepMode(NEW), 'notif');
      assert.strictEqual(f.fns.appStepMode(OLD), '', 'an old account is gated too');
      f.fns.showAppStep('notif');
      f.el('app-step-notif').click();
      await tick();
      assert.strictEqual(f.calls.ask, 1, 'the tap did not ask');
      assert.strictEqual(f.calls.tokens, 1, 'no token was saved for the yes');
      assert.strictEqual(f.calls.navigated, 1);
      assert.deepStrictEqual(f.errors, []);
    });

    it('after a refusal: the Settings path, and a re-check', () => {
      const f = form({ua: IPHONE, touch: 5, iosStandalone: true, Notification: N('denied')});
      assert.strictEqual(f.fns.appStepMode(NEW), 'notif');
      f.fns.showAppStep('notif');
      assert.ok(f.el('app-step-card').querySelector('.lg-step-warn').textContent.includes('app.notif_denied'));
      assert.strictEqual(f.el('app-step-notif'), null, 'a prompt iOS will not show again');
      f.el('app-step-check').click();
      assert.strictEqual(f.calls.navigated, 1);
    });

    it('a home-screen app on an iOS too old for web push is not sent round in circles', () => {
      // No API even when installed (iOS < 16.4): the install steps would loop.
      const f = form({ua: IPHONE, touch: 5, iosStandalone: true});
      assert.strictEqual(f.fns.appStepMode(NEW), '');
    });

    it('a granted home-screen app goes straight on', () => {
      const f = form({ua: IPHONE, touch: 5, iosStandalone: true, Notification: N('granted')});
      assert.strictEqual(f.fns.appStepMode(NEW), '');
    });

    it('Chrome: the install, behind a tap, once', async () => {
      const b = {n: 0, userChoice: Promise.resolve({outcome: 'accepted'})};
      b.prompt = () => { b.n++; return Promise.resolve(); };
      const f = form({bip: b});
      assert.strictEqual(f.fns.appStepMode(NEW), '', 'shown without the box being ticked');
      f.fns.setStep(true);
      assert.strictEqual(f.fns.appStepMode(NEW), 'install');
      f.fns.showAppStep('install');
      f.el('app-step-install').click();
      await tick(); await tick();
      assert.strictEqual(b.n, 1);
      assert.strictEqual(f.fns.step(), false, 'it would ask again on the next navigate');
      assert.strictEqual(f.win._bip, null);
      assert.strictEqual(f.calls.navigated, 1, 'did not go on after the answer');
    });

    it('"Ara no" goes on and does not come back', () => {
      const f = form({bip: {prompt() {}}});
      f.fns.setStep(true);
      f.fns.showAppStep('install');
      f.el('app-step-later').click();
      assert.strictEqual(f.fns.step(), false);
      assert.strictEqual(f.calls.navigated, 1);
    });

    it('never in the APK', () => {
      const f = form({ua: IPHONE, touch: 5, native: true, bip: {prompt() {}}});
      f.fns.setStep(true);
      assert.strictEqual(f.fns.appStepMode(NEW), '');
    });

    it('navigate() asks before the profile, so it is the first thing a new member sees', () => {
      const nav = grab('  function navigate(page) {', '  function applyPushNav(d) {');
      const at = nav.indexOf('appStepMode(session)');
      assert.ok(at > 0 && at < nav.indexOf('showProfileSetup(session)'));
      assert.ok(at > nav.indexOf("showView('#view-join-club')"), 'before the club is joined');
    });

    it('the view exists, on paper', () => {
      const d = new JSDOM(html).window.document;
      const v = d.getElementById('view-app-step');
      assert.ok(v && v.classList.contains('lg-view') && v.hidden);
      assert.ok(d.querySelector('#view-app-step #app-step-card'));
    });
  });

  it('the new token is saved after sign-up, without awaiting it', () => {
    assert.ok(/Promise\.resolve\(Push\.requestPermission\(\)\)\.catch/.test(REGISTER),
        'the granted permission never becomes a token for the new uid');
    assert.ok(REGISTER.indexOf('Push.requestPermission()') > REGISTER.indexOf('await DB.init('),
        'asked before the account and its club exist');
  });
});
