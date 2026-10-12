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
  /* `visiting`: a superadmin visiting another club (v281), whose home club's
     cache must survive the visit. */
  function run(club, cache, visiting) {
    const {w, api} = page(cache);
    let fetched = 0;
    // eslint-disable-next-line no-new-func
    const load = new Function('document', 'localStorage', 'paintCrest', 'getClub', 'fetch', 'FileReader',
        'let _clubConfig = null;' +
        'let _visitHome = ' + (visiting ? '{ teamId: "club1" }' : 'null') + ';' +
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
    const win = {
      navigator: nav, _bip: o.bip || null, _appInstalled: !!o.installed,
      matchMedia: (q) => ({matches: !!o.standalone && /standalone/.test(q)}),
      addEventListener: () => {},
    };
    const Capacitor = o.native ? {isNativePlatform: () => true} : undefined;
    const auth = {createUserWithEmailAndPassword: (email) => {
      calls.created.push(email); calls.order.push('create');
      return Promise.reject(Object.assign(new Error('stop here'), {code: 'auth/email-already-in-use'}));
    }};
    const api = {
      $: (s) => d.querySelector(s), t: (k) => 'T:' + k, Push, navigator: nav, window: win,
      document: d, Capacitor, auth, showView: () => {}, _hideSplash: () => {},
      ADMIN_EMAIL: 'admin@x', console: {warn() {}, log() {}, error() {}},
    };
    // eslint-disable-next-line no-new-func
    const fns = new Function(...Object.keys(api),
        'let _authFlowBusy = false;\n' + REGISTER + CONSENT +
        '\nreturn {regPaintConsent, regConsentSync, bindRegConsent, handleRegister};')(
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

  it('an iPhone in Safari: install-first steps instead of the box', async () => {
    const f = await bound({state: 'unsupported', ua: IPHONE, touch: 5});
    assert.ok(f.el('reg-notif-row').hidden, 'a box that can never be ticked is shown');
    assert.strictEqual(helpKey(f, 'reg-notif-help'), 'auth.notif_ios_steps');
    assert.ok(f.el('reg-submit').disabled);
    assert.ok(f.el('reg-install-row').hidden, 'iOS has no install dialog to offer');
  });

  it('an iPad that says it is a Mac is still an iPad', async () => {
    const f = await bound({state: 'unsupported', ua: IPAD13, touch: 5});
    assert.strictEqual(helpKey(f, 'reg-notif-help'), 'auth.notif_ios_steps');
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

    it('the submit tap opens the install dialog, BEFORE the first await', async () => {
      const bip = bipStub();
      const f = await bound({state: 'granted', bip});
      await submit(f);
      assert.strictEqual(bip.n, 1, 'no install dialog');
      assert.deepStrictEqual(f.calls.order, ['prompt', 'create'],
          'the prompt came after an await — the user activation is gone by then');
      assert.strictEqual(f.win._bip, null, 'a spent prompt can be shown only once');
    });

    it('an unticked box opens nothing', async () => {
      const bip = bipStub();
      const f = await bound({state: 'granted', bip});
      f.el('reg-install').checked = false;
      await submit(f);
      assert.strictEqual(bip.n, 0);
      assert.deepStrictEqual(f.calls.created, ['marc@x.cat'], 'and registration still goes ahead');
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
    ['auth.notif_accept', 'auth.notif_denied', 'auth.notif_retry', 'auth.notif_ios_steps',
      'auth.notif_unsupported', 'auth.install_label', 'auth.install_done', 'error.notif_required']
        .forEach((k) => {
          const m = new RegExp("'" + k.replace('.', '\\.') + "':\\s*\\{(.*)\\},?\\s*$", 'm').exec(src);
          assert.ok(m, k);
          ['ca:', 'es:', 'en:'].forEach((l) => assert.ok(m[1].includes(l), k + ' ' + l));
        });
  });

  it('the new token is saved after sign-up, without awaiting it', () => {
    assert.ok(/Promise\.resolve\(Push\.requestPermission\(\)\)\.catch/.test(REGISTER),
        'the granted permission never becomes a token for the new uid');
    assert.ok(REGISTER.indexOf('Push.requestPermission()') > REGISTER.indexOf('await DB.init('),
        'asked before the account and its club exist');
  });
});
