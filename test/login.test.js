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

describe('login — the crest cache (loadClubConfig)', () => {
  function run(club, cache) {
    const {w, api} = page(cache);
    let fetched = 0;
    // eslint-disable-next-line no-new-func
    const load = new Function('document', 'localStorage', 'paintCrest', 'getClub', 'fetch', 'FileReader',
        'let _clubConfig = null;' +
        'const pruneStaleLeagueCache = () => {}; const setSeasonBoundary = () => {};' +
        'const syncDbScope = () => {}; const loadRosters = async () => ({});' +
        grab('  async function loadClubConfig(clubId) {', '  // Get the club display name') +
        'return loadClubConfig;')(w.document, w.localStorage, api.paintCrest,
        async () => club, async () => { fetched++; throw new Error('CORS'); }, w.FileReader);
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
    return new Function('getUsers', 'isOurTeam', 'localStorage',
        grab('  function calcMatchScore(events)', '  function formatEventMinute') +
        grab('  function getStartingXI(matchId, sentData)', '  // ── Match history table builder ──') +
        'return computePlayerMatchStats;')(() => players, (n) => n === 'Club', {getItem: () => null});
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
    assert.strictEqual(s.totals.matches, 3);
  });

  it('an Amateur A player still has all of Amateur A', () => {
    const s = stats('a1', ctx);
    assert.deepStrictEqual(s.matchRows.map((r) => r.matchId).sort(), [2, 3, 4]);
  });
});
