/* Signing in and out without leaving anything behind (v285). `npm run test:session`.
 *
 * The owner saw permission messages after a sign-up that a refresh made go
 * away. Driving the real page against the emulators found the pieces this
 * file holds down, each run for real:
 *
 *   1. sign-out stopped the listeners but kept the previous account's club
 *      data on the device, a superadmin's club visit, the last-step flag and
 *      the board library's listener — which the rules refused the moment the
 *      user went, and which a later init for the same pair never replaced;
 *   2. the auth handler loaded the whole session again, in parallel, while
 *      a form handler was already doing it — two DB.init()s tearing each
 *      other's listeners down;
 *   3. a brand-new account never got Push.init or the claims watcher;
 *   4. profile writes carried server-stamped fields the rules refuse, which
 *      sank the whole merge, silently;
 *   5. a burst of identical refusals stacked the same toast down the screen.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {JSDOM} = require('jsdom');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const boardsSrc = fs.readFileSync(path.join(ROOT, 'js', 'boards.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

const SIGN = grab('  /* ── After a sign-in, whichever path made it (v285)', '  /** One test notification to this account');
const BUSY = grab('  /* ── Busy buttons (v285)', '  /* ── A callable, over plain HTTPS (v285)');

function session(o) {
  o = o || {};
  const calls = {clear: 0, flush: 0, tbClean: 0, editor: 0, pushInit: 0, watch: 0, unwatch: 0,
    removeToken: [], signOut: 0, order: []};
  const api = {
    clearSession: () => { calls.clear++; },
    DB: {flush: () => { calls.flush++; }},
    TB: {cleanup: () => { calls.tbClean++; }},
    tbClearEditor: () => { calls.editor++; },
    Push: {
      init: () => { calls.pushInit++; },
      removeToken: async () => { calls.order.push('token'); if (o.tokenFails) throw new Error('offline'); },
    },
    auth: {signOut: async () => { calls.order.push('signOut'); calls.signOut++; if (o.signOutFails) throw new Error('x'); }},
    db: {collection: () => ({doc: () => ({onSnapshot: () => { calls.watch++; return () => { calls.unwatch++; }; }})})},
    sanitize: (x) => String(x), t: (k) => 'T:' + k,
    console: {warn() {}, log() {}, error() {}},
  };
  // eslint-disable-next-line no-new-func
  const fns = new Function(...Object.keys(api),
      'let _clubConfig = {name: "old"}, _claimsUnsub = null, _lastClaimsMs = 99, ' +
      '_appStepInstall = true, currentPage = "x";\n' + BUSY + SIGN +
      '\nreturn {afterSignIn, resetSignedOut, signOutFully,' +
      ' state: () => ({_clubConfig, _claimsUnsub, _lastClaimsMs, _appStepInstall, currentPage})};')(
      ...Object.values(api));
  return {fns, calls};
}

describe('v285 — signing out leaves nothing of that account behind', () => {
  it('flushes the club data, resets the session and the visit, stops the board listener', () => {
    const {fns, calls} = session();
    fns.afterSignIn({uid: 'u1'});        // a watcher to stop
    fns.resetSignedOut();
    assert.strictEqual(calls.clear, 1, 'clearSession() — which ends a superadmin visit — was not called');
    assert.strictEqual(calls.flush, 1, 'the previous account\'s club data stays on the device');
    assert.strictEqual(calls.tbClean, 1, 'the board library listener survives the sign-out');
    assert.strictEqual(calls.editor, 1);
    assert.strictEqual(calls.unwatch, 1, 'the claims watcher survives');
    const st = fns.state();
    assert.strictEqual(st._clubConfig, null);
    assert.strictEqual(st._claimsUnsub, null);
    assert.strictEqual(st._lastClaimsMs, 0);
    assert.strictEqual(st._appStepInstall, false, 'the next account inherits the install step');
  });

  it('the auth handler calls it, and no longer only DB.cleanup()', () => {
    const at = src.indexOf('auth.onAuthStateChanged(async');
    const handler = src.slice(at, src.indexOf('// Re-render current page when Firestore pushes', at));
    assert.ok(/\} else \{\s*resetSignedOut\(\);\s*\}/.test(handler));
    assert.ok(!/DB\.cleanup\(\)/.test(handler), 'the half reset is back');
  });

  it('signOutFully: the token first, while still signed in, then Auth', async () => {
    const {fns, calls} = session();
    await fns.signOutFully(null);
    assert.deepStrictEqual(calls.order, ['token', 'signOut']);
    assert.strictEqual(fns.state().currentPage, '');
    const b = session({tokenFails: true});
    await b.fns.signOutFully(null);
    assert.strictEqual(b.calls.signOut, 1, 'an offline token delete kept the user signed in');
  });

  it('a sign-out that WORKS gives its button back too — for the next account (v287)', async () => {
    /* #btn-logout is static in index.html: left busy, the next person to
       sign in on this device found it stuck on "Sortint…" and disabled. */
    const dom = new JSDOM('<button id="b">Tancar sessió</button>');
    const btn = dom.window.document.getElementById('b');
    const {fns, calls} = session();
    await fns.signOutFully(btn);
    assert.strictEqual(calls.signOut, 1);
    assert.ok(!btn.disabled, 'still disabled');
    assert.strictEqual(btn.textContent, 'Tancar sessió');
    assert.strictEqual(btn.dataset.busy, undefined, 'still marked busy');
  });

  it('a sign-out that fails gives its button back', async () => {
    const dom = new JSDOM('<button id="b">Tancar sessió</button>');
    const btn = dom.window.document.getElementById('b');
    const {fns} = session({signOutFails: true});
    await fns.signOutFully(btn);
    assert.ok(!btn.disabled && btn.textContent === 'Tancar sessió');
  });

  it('both sign-out buttons go through it', () => {
    assert.ok(/\$\('#btn-logout'\)\.addEventListener\('click', \(\) => signOutFully\(\$\('#btn-logout'\)\)\)/.test(src));
    assert.ok(/on\('app-step-logout', function \(\) \{ signOutFully\(/.test(src),
        'the last step\'s sign-out left the push token behind');
  });
});

describe('v285 — one load per sign-in, and every sign-in ends the same way', () => {
  it('afterSignIn: Push.init and ONE claims watcher, replacing any previous one', () => {
    const {fns, calls} = session();
    fns.afterSignIn({uid: 'u1'});
    fns.afterSignIn({uid: 'u1'});
    assert.strictEqual(calls.pushInit, 2);
    assert.strictEqual(calls.watch, 2);
    assert.strictEqual(calls.unwatch, 1, 'the first watcher leaked');
    fns.afterSignIn(null);
    assert.strictEqual(calls.pushInit, 2, 'ran without a user');
  });

  it('the handler stands aside while a form handler signs in', () => {
    const at = src.indexOf('auth.onAuthStateChanged(async');
    const handler = src.slice(at, src.indexOf('// Re-render current page when Firestore pushes', at));
    const skip = handler.indexOf('if (_authFlowBusy) return;');
    const load = handler.indexOf("db.collection('users').doc(firebaseUser.uid).get()");
    assert.ok(skip > 0 && load > 0 && skip < load, 'the parallel load is back');
    assert.ok(handler.indexOf('afterSignIn(firebaseUser);') > load, 'a stored session gets no watcher');
  });

  it('login, sign-up and the handler all end in afterSignIn', () => {
    const login = grab('  async function handleLogin(e) {', '  function _hideSplash() {');
    const reg = grab('  async function handleRegister(e) {', '  /* ── After a sign-in, whichever path made it');
    assert.ok(login.includes('afterSignIn(cred.user)'), 'handleLogin');
    assert.ok(reg.includes('afterSignIn(cred.user)'), 'handleRegister');
  });
});

describe('v285 — the profile write carries no server-owned field', () => {
  it('setSession strips claimsUpdatedAt, prevCategory and prevTeam with the rest', () => {
    const body = grab('  function setSession(user) {', '  function clearSession() {');
    let written = null;
    const api = {
      _currentSession: null, syncDbScope: () => {}, MAX_PIC_SRC: 1024, _visitHome: true,
      auth: {currentUser: {uid: 'u1'}},
      db: {collection: () => ({doc: () => ({set: (d) => { written = d; return Promise.resolve(); }})})},
      console: {error() {}},
    };
    // eslint-disable-next-line no-new-func
    const setSession = new Function(...Object.keys(api), body + '\nreturn setSession;')(...Object.values(api));
    setSession({id: 'u1', name: 'Marc', teamId: 'c1', roles: ['player'], category: 'juvenil',
      claimsUpdatedAt: {seconds: 1}, prevCategory: 'amateur', prevTeam: 'B', phone: '600'});
    assert.ok(written, 'nothing written');
    ['claimsUpdatedAt', 'prevCategory', 'prevTeam', 'teamId', 'roles', 'category'].forEach((k) =>
      assert.ok(!(k in written), k + ' is sent back — the rules refuse the whole merge'));
    assert.strictEqual(written.name, 'Marc');
    assert.strictEqual(written.phone, '600');
  });
});

describe('v285 — one toast of each at a time', () => {
  function toaster() {
    const dom = new JSDOM('<body></body>');
    const w = dom.window;
    // eslint-disable-next-line no-new-func
    const show = new Function('document', 'requestAnimationFrame', 'setTimeout',
        grab('  function _showPushToast(title, body) {', '  // ---------- Acknowledged saves') +
        '\nreturn _showPushToast;')(w.document, () => {}, () => {});
    return {show, d: w.document};
  }

  it('the same message twice is one toast; a different one is another', () => {
    const {show, d} = toaster();
    show('Sincronització', 'No s\'ha pogut desar (permisos).');
    show('Sincronització', 'No s\'ha pogut desar (permisos).');
    show('Sincronització', 'No s\'ha pogut desar (permisos).');
    assert.strictEqual(d.querySelectorAll('.push-toast').length, 1);
    show('Sincronització', 'Error desant les dades.');
    assert.strictEqual(d.querySelectorAll('.push-toast').length, 2);
  });
});

describe('v285 — TB.cleanup: the board library listener goes with the session', () => {
  function boards() {
    const calls = {listen: 0, unsub: 0};
    const q = {get: async () => ({forEach() {}}), where: () => q,
      onSnapshot: (ok) => { calls.listen++; setTimeout(() => ok({docChanges: () => []}), 0); return () => { calls.unsub++; }; }};
    const db = {collection: () => ({doc: () => ({get: async () => ({data: () => ({})}),
      collection: () => ({get: async () => ({forEach() {}})})}), where: () => q})};
    const ctx = {db, console: {warn() {}, log() {}}, setTimeout, Promise, Object, Array, JSON, String, Math, Date,
      module: {exports: {}}, window: {}};
    vm.runInNewContext(boardsSrc, ctx);
    return {TB: ctx.module.exports, calls};
  }

  it('stops the listener and forgets the club', async () => {
    const {TB, calls} = boards();
    await TB.init('c1', 'u1');
    assert.strictEqual(calls.listen, 1);
    TB.cleanup();
    assert.strictEqual(calls.unsub, 1, 'the listener outlives the sign-out');
    assert.strictEqual(TB.ready(), false);
    assert.deepStrictEqual(TB.library(), []);
  });

  it('a sign-in again for the SAME club and user gets a live listener back', async () => {
    const {TB, calls} = boards();
    await TB.init('c1', 'u1');
    TB.cleanup();
    await TB.init('c1', 'u1');
    assert.strictEqual(calls.listen, 2, 'init returned early on a dead listener');
  });
});
