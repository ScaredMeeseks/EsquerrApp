/* "Is this the version the server is serving?"
 *
 * Built because it stopped being hypothetical. A tester sat on a v117
 * service worker across SEVEN releases while `main` was v124 — every deploy
 * landed, every check of the served files said the new code was there, and
 * his browser kept running the old one. Three rounds of "the fix doesn't
 * work" went by before the cache was suspected. The 77 members of this club
 * have no console to paste a cache-clear into.
 *
 * What matters here is the DECISIONS, and they are testable without a
 * browser: what counts as a newer version, what a failed check is allowed to
 * do, and the fact that it must never reload by itself.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const swSrc = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

function grab(from, to) {
  const i = appSrc.indexOf(from);
  const j = appSrc.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found: ' + from);
  return appSrc.slice(i, j);
}

const BLOCK = grab('  /* ═══════════════════════════════════════════════════════════\n' +
  '     Is this the version the server is serving?', '  function bindVersionCheck()');

/* The pure halves, run for real. */
function makeCheck(opts) {
  opts = opts || {};
  const calls = {fetched: [], replaced: [], unregistered: 0, cachesDeleted: []};
  const factory = new Function('APP_VERSION', 'fetch', 'sanitize', 't',
      'document', 'navigator', 'window', 'caches', 'location',
      'requestAnimationFrame',
      BLOCK + '\n return {parseServedVersion, versionIsStale, fetchServedVersion,' +
      ' checkAppVersion, showUpdateBanner, applyUpdate};');
  const api = factory(
      opts.running === undefined ? 127 : opts.running,
      (url, o) => {
        calls.fetched.push({url, cache: (o || {}).cache});
        if (opts.fetchFails) return Promise.reject(new Error('offline'));
        return Promise.resolve({ok: opts.ok !== false,
          text: () => Promise.resolve(opts.swText || '')});
      },
      (s) => String(s === undefined || s === null ? '' : s),
      (k) => k,
      opts.document || {getElementById: () => null, body: {appendChild() {}},
        createElement: () => ({classList: {add() {}}, addEventListener() {}}),
        addEventListener() {}},
      {serviceWorker: {getRegistrations: () => {
        calls.unregistered++;
        return Promise.resolve([{unregister: () => Promise.resolve(true)}]);
      }}},
      {caches: true},
      {keys: () => Promise.resolve(['esquerrapp-v117']),
        delete: (k) => { calls.cachesDeleted.push(k); return Promise.resolve(true); }},
      {pathname: '/EsquerrApp/', replace: (u) => calls.replaced.push(u)},
      (f) => f(),
  );
  api._calls = calls;
  return api;
}

describe('reading the served version', () => {
  it('finds it in a real sw.js', () => {
    /* Against the ACTUAL file, not a hand-written sample: if the constant is
       ever renamed or reformatted, the check silently reads 0 for ever and
       nobody is told about anything again. */
    const V = makeCheck({}).parseServedVersion(swSrc);
    assert.ok(V > 0, 'could not read a version out of the real sw.js');
    const running = /const APP_VERSION = (\d+);/.exec(appSrc);
    assert.strictEqual(V, Number(running[1]),
        'sw.js and app.js disagree about the version — the triple is out of step');
  });

  it('is 0 for anything it cannot read', () => {
    const C = makeCheck({});
    ['', 'nonsense', "const CACHE_NAME = 'other-v3';", null, undefined]
        .forEach((t) => assert.strictEqual(C.parseServedVersion(t), 0, JSON.stringify(t)));
  });

  it('bypasses every cache when it asks', () => {
    /* The whole point. `updateViaCache:'none'` covers the worker's own
       registration; this fetch is an ordinary one and would happily be
       answered from the HTTP cache, which is the very failure being fixed. */
    const C = makeCheck({swText: swSrc});
    return C.fetchServedVersion().then(() => {
      assert.strictEqual(C._calls.fetched.length, 1);
      assert.strictEqual(C._calls.fetched[0].url, 'sw.js');
      assert.strictEqual(C._calls.fetched[0].cache, 'reload');
    });
  });

  it('returns 0 when offline rather than throwing', () => {
    return makeCheck({fetchFails: true}).fetchServedVersion()
        .then((v) => assert.strictEqual(v, 0));
  });

  it('returns 0 on a 404 — a Capacitor build has no sw.js', () => {
    return makeCheck({ok: false}).fetchServedVersion()
        .then((v) => assert.strictEqual(v, 0));
  });
});

describe('when to say anything at all', () => {
  const stale = (served, running) =>
    makeCheck({running}).versionIsStale(served, running);

  it('only when the server is strictly NEWER', () => {
    assert.strictEqual(stale(128, 127), true);
    assert.strictEqual(stale(127, 127), false);
  });

  it('never nags backwards after a rollback', () => {
    // Deploying an older build is a decision, not something to undo.
    assert.strictEqual(stale(126, 127), false);
  });

  it('says nothing when the check failed', () => {
    /* 0 is "I could not ask". Treating it as a version would show every
       offline user an update banner for a release that does not exist. */
    assert.strictEqual(stale(0, 127), false);
  });
});

describe('the banner', () => {
  function withDom(running, served) {
    const created = [];
    const clicks = {};
    const listeners = {};
    /* The buttons have to EXIST. Returning null for them threw inside a
       promise, which mocha swallowed — the first version of this suite was
       green over a banner whose Update button was never wired. */
    const byId = {
      'btn-update-now': {disabled: false, textContent: '',
        addEventListener: (t, fn) => { clicks.now = fn; }},
      'btn-update-later': {addEventListener: (t, fn) => { clicks.later = fn; }},
    };
    const doc = {
      getElementById: (id) => byId[id] || null,
      body: {appendChild: (el) => { created.push(el); }},
      createElement: () => {
        const el = {classList: {add() {}}, remove() { el.removed = true; },
          addEventListener() {}, set innerHTML(v) { el._html = v; },
          get innerHTML() { return el._html; }};
        return el;
      },
      addEventListener: (type, fn) => {
        (listeners[type] = listeners[type] || []).push(fn);
      },
      hidden: false,
    };
    const C = makeCheck({running, swText: "const CACHE_NAME = 'esquerrapp-v" +
      served + "';", document: doc});
    return {C, created, byId, listeners, doc, clicks};
  }

  it('appears when the served version is newer', () => {
    const {C, created} = withDom(127, 128);
    C.checkAppVersion(true);
    return new Promise((r) => setTimeout(r, 10)).then(() => {
      assert.strictEqual(created.length, 1, 'no banner was added');
      assert.ok(created[0].innerHTML.includes('update.available'));
      assert.ok(created[0].innerHTML.includes('btn-update-now'));
      assert.ok(created[0].innerHTML.includes('btn-update-later'),
          'there must be a way to put it off');
    });
  });

  it('does NOT appear when the versions match', () => {
    const {C, created} = withDom(127, 127);
    C.checkAppVersion(true);
    return new Promise((r) => setTimeout(r, 10)).then(() => {
      assert.strictEqual(created.length, 0, 'nagged about the version it is on');
    });
  });

  it('is added once even if the banner itself is called twice', () => {
    /* Belt and braces, and the braces are the point: checkAppVersion also
       returns early once a banner is up, so going through it would test the
       wrong guard and pass with this one deleted. */
    const {C, created} = withDom(127, 128);
    C.showUpdateBanner(128);
    C.showUpdateBanner(128);
    assert.strictEqual(created.length, 1, 'the banner stacked up');
  });

  it('the Update button is actually wired, and Later just hides it', () => {
    const {C, created, clicks} = withDom(127, 128);
    C.showUpdateBanner(128);
    assert.strictEqual(typeof clicks.now, 'function', 'Update is not wired');
    assert.strictEqual(typeof clicks.later, 'function', 'Later is not wired');
    clicks.later();
    assert.ok(created[0].removed, 'Later did not hide the banner');
    // ...and Later must not reload anything.
    assert.strictEqual(C._calls.replaced.length, 0);
  });

  it('...and pressing Update actually updates', () => {
    /* Not "a handler is attached" — an empty function satisfies that. Press
       it and see the caches go and the page reload. */
    const {C, clicks} = withDom(127, 128);
    C.showUpdateBanner(128);
    clicks.now();
    return new Promise((r) => setTimeout(r, 20)).then(() => {
      assert.strictEqual(C._calls.unregistered, 1, 'the worker survived');
      assert.ok(C._calls.cachesDeleted.length > 0, 'the caches survived');
      assert.strictEqual(C._calls.replaced.length, 1, 'it never reloaded');
    });
  });

  it('is added once, however many times the check runs', () => {
    const {C, created} = withDom(127, 128);
    C.checkAppVersion(true);
    return new Promise((r) => setTimeout(r, 10)).then(() => {
      C.checkAppVersion(true);
      return new Promise((r) => setTimeout(r, 10));
    }).then(() => {
      assert.strictEqual(created.length, 1, 'the banner stacked up');
    });
  });
});

describe('what the update button does', () => {
  it('unregisters the worker AND drops every cache before reloading', () => {
    /* A plain reload is exactly what was NOT enough — that is the whole
       history of this bug. */
    const C = makeCheck({});
    C.applyUpdate();
    return new Promise((r) => setTimeout(r, 20))
        .then(() => {
          assert.strictEqual(C._calls.unregistered, 1, 'the worker survived');
          assert.deepStrictEqual(C._calls.cachesDeleted, ['esquerrapp-v117'],
              'the caches survived');
          assert.strictEqual(C._calls.replaced.length, 1, 'it never reloaded');
          assert.ok(/\?v=\d+$/.test(C._calls.replaced[0]),
              'the reload must land on a URL the browser treats as new: ' +
              C._calls.replaced[0]);
        });
  });
});

describe('the rules this must not break', () => {
  it('NEVER reloads without being asked', () => {
    /* A delegate halfway through a convocatòria would lose what he typed.
       The only call to location.replace is inside applyUpdate, which only
       runs from the button. */
    const code = ('/*' + BLOCK).replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const reloads = (code.match(/location\.(replace|reload)/g) || []);
    assert.strictEqual(reloads.length, 1,
        'more than one reload path: ' + reloads.join(', '));
    const applyAt = code.indexOf('function applyUpdate');
    assert.ok(code.indexOf('location.replace') > applyAt,
        'something outside applyUpdate() reloads the page');
  });

  it('checks on load and when the tab comes back', () => {
    const bind = grab('  function bindVersionCheck()', '\n  function ');
    assert.ok(/checkAppVersion\(true\)/.test(bind), 'no check on load');
    assert.ok(/visibilitychange/.test(bind),
        'a phone left open since Tuesday is the case this exists for');
    assert.ok(/document\.hidden/.test(bind), 'it should check when SHOWN, not hidden');
  });

  it('is throttled, so it is not a poll', () => {
    assert.ok(/VERSION_CHECK_MS\s*=\s*\d+\s*\*\s*60\s*\*\s*1000/.test(BLOCK),
        'no throttle — every tab focus would hit the server');
  });

  it('is wired into boot', () => {
    assert.ok(/DOMContentLoaded', bindVersionCheck/.test(appSrc),
        'the check is never started');
  });

  it('the banner is styled, and cannot cover the screen', () => {
    // v125 shipped a whole feature with no stylesheet; not again.
    assert.ok(/\.update-banner\s*\{/.test(cssSrc), '.update-banner has no rule');
    assert.ok(/\.update-banner\s*\{[^}]*position:\s*fixed/.test(cssSrc));
    assert.ok(/\.update-banner-x\s*\{/.test(cssSrc), 'no dismiss button styling');
    assert.ok(!/\.update-banner\s*\{[^}]*(width|height):\s*100%/.test(cssSrc),
        'the banner must not cover the page');
  });
});
