/* Does every test file actually get RUN?
 *
 * Mocha is handed an explicit list of files in package.json rather than a
 * directory, so a new suite runs only if someone remembers to add its name to
 * that list. `focus-plan.test.js` was missing from it for several versions and
 * silently never ran — the worst possible failure for a test file, because a
 * suite nobody runs looks exactly like a suite that passes.
 *
 * This is the one test that cannot be forgotten in the same way: it is itself
 * in the list, and it fails the moment a sibling is not.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};

/* Every filename mentioned by ANY script — unit suites, the emulator suites
   under test:functions and test:rules, and the one-off backfill checks. Where
   a suite runs is a judgement call; whether it runs at all is not. */
const registered = new Set();
Object.values(scripts).forEach((cmd) => {
  (String(cmd).match(/[\w.-]+\.test\.js/g) || []).forEach((f) => registered.add(f));
});

describe('the suite registry', () => {
  it('runs every test file in this directory', () => {
    const onDisk = fs.readdirSync(__dirname).filter((f) => /\.test\.js$/.test(f));
    const orphans = onDisk.filter((f) => !registered.has(f));
    assert.deepStrictEqual(orphans, [],
        'these suites are never run by any npm script — add them to ' +
        'package.json: ' + orphans.join(', '));
  });

  it('does not name test files that no longer exist', () => {
    /* The other direction: a renamed or deleted suite leaves a name behind
       that makes mocha exit non-zero, which reads as "the tests are broken"
       rather than "the list is stale". */
    const missing = [...registered]
        .filter((f) => !fs.existsSync(path.join(__dirname, f)));
    assert.deepStrictEqual(missing, [],
        'package.json names suites that are not here: ' + missing.join(', '));
  });

  it('has this very file in the list', () => {
    // Otherwise the guard is as forgettable as what it guards.
    assert.ok(registered.has('suite-registry.test.js'));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   A STUB MAY ONLY STAND IN FOR SOMETHING THAT EXISTS
   ═══════════════════════════════════════════════════════════════════════════
   ⚠ THE OUTAGE THIS EXISTS FOR (v250 → v251). `fcfBadgeById` was written
   calling `getMatches()` — a function that exists NOWHERE in this app; every
   other site reads `localStorage.getItem('fa_matches')` directly. It shipped,
   the ReferenceError landed inside a render, and because `renderDashboard()`
   runs BEFORE `_hideSplash()` the app never got past its loading screen. Not
   a broken page: no app at all.

   Three separate green signals said it was fine, and all three were the same
   mistake. `test/inici.test.js`, `test/fcf-app.test.js` and
   `scripts/build-inici-preview.js` each named `getMatches` in a `new Function`
   parameter list. `new Function` binds ANY identifier you name, so stubbing an
   invention manufactures a scope the app does not have: the test proves the
   code runs THERE and guarantees nothing about whether it runs HERE.

   ⚠ This is the inverse of the v238 lesson and strictly nastier. v238 was "a
   test that reads the source is not a test that the code RUNS", and the answer
   was to run it over stubs. This is "code that runs over stubs is not code
   that runs in the app" — and the guard is that every stub must name something
   the app actually has.
   ═══════════════════════════════════════════════════════════════════════════ */
describe('every stub names something the app actually has', () => {
  const ROOT = path.join(__dirname, '..');

  /** Every source a harness could legitimately be standing in for. */
  function sources() {
    const out = [];
    ['js', 'functions', 'scripts'].forEach((dir) => {
      const d = path.join(ROOT, dir);
      let names = [];
      try { names = fs.readdirSync(d); } catch (e) { return; }
      names.filter((f) => /\.js$/.test(f)).forEach((f) => {
        out.push(fs.readFileSync(path.join(d, f), 'utf8'));
      });
    });
    /* ⚠ COMMENTS STRIPPED. The standing trap in this repo, and it bit this
       very test: the comment in js/app.js explaining the v250 outage writes
       `getMatches()` in prose, so an unstripped scan read the name as
       DECLARED and reported the app as having it. A name mentioned only in a
       paragraph about how it does not exist must not count as existing. */
    return out.join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');
  }

  /* Deliberately generous — this asks whether a name exists AT ALL, not where.
     A false accusation would be worse than a miss: it would push the next
     author into deleting a stub that is standing in for something real. */
  function declaredIn(src) {
    const names = new Set();
    [
      /(?:^|[\s;{(])(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g,
      /(?:^|[\s;{(])(?:var|let|const)\s+([A-Za-z_$][\w$]*)/g,
      /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?function/g,
      /([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function|\()/g,
      /([A-Za-z_$][\w$]*)\s*\(/g,
      /* ⚠ Two more shapes, both found by this guard's own first run:
         `var TB_ZOOM_MIN = 0.5, TB_ZOOM_MAX = 6;` declares a second name after
         a comma, and the module globals `BG`, `BS`, `TB`, `MN` are only ever
         SEEN as `BG.MARKS` — never declared in a file this scans, because
         board-geom.js and its siblings assign them to `window`. Both are real
         and a stub for either is legitimate. */
      /,\s*([A-Za-z_$][\w$]*)\s*=/g,
      /([A-Za-z_$][\w$]*)\s*\./g,
      /* The UMD tail every module here ends with: `else root.BG = api;`. That
         is the only place `BG`, `BS`, `TB` and `MN` are ever named as
         themselves, so without this the four module globals read as
         inventions. */
      /\.\s*([A-Za-z_$][\w$]*)\s*=[^=]/g,
    ].forEach((re) => {
      let m;
      while ((m = re.exec(src))) names.add(m[1]);
    });
    return names;
  }

  /* Host globals a harness may hand in. They cannot be found by scanning app
     code because they are not app code — and each one is a real thing, which
     is the whole point of the list. */
  const GLOBALS = new Set(['Math', 'JSON', 'Object', 'String', 'Number', 'Array',
    'Date', 'Set', 'Map', 'WeakMap', 'Promise', 'Error', 'Boolean', 'RegExp',
    'Symbol', 'Proxy', 'Reflect', 'BigInt', 'document', 'window', 'localStorage',
    'sessionStorage', 'console', 'fetch', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'requestAnimationFrame',
    'cancelAnimationFrame', 'navigator', 'location', 'history', 'screen',
    'alert', 'confirm', 'prompt', 'URL', 'URLSearchParams', 'Blob', 'File',
    'FileReader', 'Image', 'Event', 'CustomEvent', 'globalThis', 'caches',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
    'decodeURIComponent', 'btoa', 'atob', 'structuredClone', 'Intl',
    'TextEncoder', 'TextDecoder', 'crypto', 'performance', 'AbortController',
    'WebSocket', 'XMLHttpRequest', 'FormData', 'Headers', 'Request', 'Response',
    'getComputedStyle', 'matchMedia', 'IntersectionObserver', 'ResizeObserver',
    'MutationObserver', 'HTMLElement', 'Node', 'NodeList', 'DOMParser',
    'requestIdleCallback', 'process', 'Buffer', 'require', 'module', 'exports',
    '__dirname', '__filename', 'assert', 'THREE', 'gl', 'firebase']);

  /** The parameter names of every `new Function(...)` in a file. */
  function stubNames(text) {
    const found = [];
    let i = 0;
    while ((i = text.indexOf('new Function(', i)) !== -1) {
      let p = i + 'new Function('.length;
      for (;;) {
        /* Consecutive `'ident',` only. The body follows as a template literal
           or a concatenation, and the moment the shape stops matching we are
           past the parameter list — which is what stops ordinary strings in
           the body being read as stub names. */
        const m = /^\s*'([A-Za-z_$][\w$]*)'\s*,/.exec(text.slice(p, p + 120));
        if (!m) break;
        found.push(m[1]);
        p += m[0].length;
      }
      i = p;
    }
    return found;
  }

  /* ⚠ ONE ALLOWANCE, AND IT IS NOT THE v250 SHAPE. `_esc` is a parameter the
     Convocatòria builder invents for ITSELF and immediately binds onto the
     app's real name — `sanitize = _esc;` on the next line. It is a harness
     alias, not a claim that the app has an `_esc`, and the thing it stands in
     for (`sanitize`) does exist. The v250 defect was the opposite: a stub
     named after a function the app CALLS and does not have. Kept to one
     entry, named, with the reason — an allowance list that grows silently is
     how this guard would rot into decoration. */
  const ALIASES = new Set(['_esc']);

  function offencesIn(dir, files) {
    const declared = declaredIn(sources());
    const out = [];
    files.forEach((f) => {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      stubNames(text).forEach((name) => {
        if (GLOBALS.has(name) || declared.has(name) || ALIASES.has(name)) return;
        out.push(f + ' stubs `' + name + '`');
      });
    });
    return out;
  }

  it('no harness stubs a function the app does not declare', () => {
    const files = fs.readdirSync(__dirname).filter((f) => /\.test\.js$/.test(f));
    const offences = offencesIn(__dirname, files);
    assert.deepStrictEqual(offences, [],
        'a stub names something that exists nowhere in js/, functions/ or ' +
        'scripts/. `new Function` binds whatever you name, so the suite would ' +
        'pass over code that throws ReferenceError in the app:\n  ' +
        offences.join('\n  '));
  });

  /* ⚠ The preview builders run the same slices through the same `new Function`
     and invent a scope the same way — `build-inici-preview.js` stubbed
     `getMatches` too, and "the mockup built" was read as evidence. */
  it('no preview builder stubs a function the app does not declare', () => {
    const dir = path.join(ROOT, 'scripts');
    const files = fs.readdirSync(dir).filter((f) => /\.js$/.test(f));
    const offences = offencesIn(dir, files);
    assert.deepStrictEqual(offences, [], offences.join('\n  '));
  });

  /* ⚠ AND THE GUARD MUST BE ABLE TO SEE ONE. A scanner looking for a shape
     nobody writes passes for the wrong reason, which is the failure mode this
     whole block is about. Fed the exact line v250 shipped. */
  it('would have caught the v250 outage', () => {
    /* ⚠ THE PROBE NAME IS NO LONGER `getMatches`, AND THE GUARD IS WHAT TOLD
       ME SO. v252 added that accessor — its absence beside `getUsers` and
       `getTrainings` was the whole trap — and this test's own self-check
       started failing, correctly refusing to let itself quietly become a test
       of nothing. The name below is one nobody would ever add, and the
       assertion under it keeps checking that stays true. */
    const PROBE = 'zzNotAFunctionThisAppWillEverHave';
    const sample = 'const f = new Function(\'' + PROBE + '\', \'Object\', `body`);';
    assert.deepStrictEqual(stubNames(sample), [PROBE, 'Object'],
        'the parameter-list scanner no longer reads a stub list');
    assert.ok(!declaredIn(sources()).has(PROBE),
        PROBE + ' exists in the app now — this probe needs another name');
    assert.ok(!GLOBALS.has(PROBE), 'the probe name was allowlisted');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   AND THE OTHER DIRECTION: THE APP MAY ONLY CALL WHAT EXISTS
   ═══════════════════════════════════════════════════════════════════════════
   ⚠ TWO LIVE BUGS THIS FOUND (v254). Commit 90812ff — the v237 Registracions
   redesign — deleted `detachMemberByEmail` and `loadArchivedSeasons` and left
   BOTH of their call sites behind. They were broken for nine days:

     · "Treu de l'equip" threw inside the handler's try/catch, which reports
       it as `save.error_perms` — so it blamed permissions while the roster
       write on the line above had already gone through. Half-done, and
       misattributed.
     · `loadArchivedSeasons` is worse: it is called from renderArchivedSeasons()
       directly, and renderPage() puts no try/catch around a renderer, so
       Temporades arxivades threw mid-render and the page never appeared.
       Exactly the v250 shape, contained only because `currentPage` is not
       persisted and a reload could not land back on it.

   ⚠ THE GUARD ABOVE CANNOT CATCH THIS, and that is not an oversight in it.
   `declaredIn()` counts `name(` as a declaration — deliberately generous,
   because a false accusation there would push someone into deleting a stub
   that stands in for something real. That generosity makes a call
   indistinguishable from a definition, so the scan below is the strict twin:
   it strips strings as well as comments (an i18n value with a `(` in it reads
   as a call otherwise) and counts ONLY real declaration and parameter forms.

   It runs at zero candidates. If it ever reports one, the answer is almost
   never to widen the allowlist.
   ═══════════════════════════════════════════════════════════════════════════ */
describe('the app only calls functions that exist', () => {
  const ROOT = path.join(__dirname, '..');
  const NAME = /^[A-Za-z_$][\w$]*$/;

  /* ⚠ STRINGS GO TOO, not just comments. The i18n table is full of Catalan
     that happens to contain a bracket — `correus (correos` and the like — and
     without this they read as calls to undeclared functions. That noise is
     what made the first draft of this scan unusable at 76 candidates. */
  function strip(s) {
    return s
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ')
        .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  }

  const read = (f) => {
    try { return strip(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')); }
    catch (e) { return ''; }
  };
  const app = read('app.js');
  /* Every script index.html loads before app.js, plus board3d which reaches
     the browser through the getBoard3d callable. */
  const libs = ['utils.js', 'db.js', 'shard.js', 'push.js', 'boards.js',
    'board-geom.js', 'board-state.js', 'board3d.js', 'firebase-config.js']
      .map(read).join('\n');

  function declared() {
    const names = new Set();
    [
      /(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g,
      /(?:var|let|const)\s+([A-Za-z_$][\w$]*)/g,
      /,\s*([A-Za-z_$][\w$]*)\s*=/g,
      /([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g,
      /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?function/g,
      /(?:^|[^\w$)])([A-Za-z_$][\w$]*)\s*=>/g,
    ].forEach((re) => [app, libs].forEach((src) => {
      let m; re.lastIndex = 0;
      while ((m = re.exec(src))) names.add(m[1]);
    }));
    // Parameter lists: a callback named `onPick` is declared by being a
    // parameter, and nothing else in the file will ever declare it.
    [/function[^(]*\(([^)]*)\)/g, /\(([^()]*)\)\s*=>/g].forEach((re) =>
      [app, libs].forEach((src) => {
        let m; re.lastIndex = 0;
        while ((m = re.exec(src))) {
          String(m[1]).split(',').forEach((p) => {
            const n = p.trim().replace(/[=:].*$/, '').replace(/[{}[\].]/g, '').trim();
            if (NAME.test(n)) names.add(n);
          });
        }
      }));
    return names;
  }

  const KEYWORDS = new Set(('if for while switch catch return typeof function new await do ' +
    'else delete void in of case throw yield super this var let const async import export ' +
    'instanceof').split(' '));
  /* Browser globals node does not have. Anything added here must be a real
     platform API — this list is not the place to silence a missing function. */
  const BROWSER = new Set(('requestAnimationFrame cancelAnimationFrame FileReader Image alert ' +
    'confirm prompt MutationObserver IntersectionObserver ResizeObserver fetch setTimeout ' +
    'setInterval clearTimeout clearInterval Blob FormData URL Notification WebSocket atob btoa ' +
    'structuredClone queueMicrotask getComputedStyle matchMedia scrollTo print CustomEvent ' +
    'Event MouseEvent XMLHttpRequest AbortController Audio DOMParser').split(' '));
  /* CSS functions written inside style strings that survive stripping — they
     appear in template literals whose `${}` holes keep them out of the blanks. */
  const CSSFN = new Set(('rgba rgb hsl hsla calc rotate translate translateX translateY ' +
    'translateZ scale scaleX scaleY url matrix skew perspective blur brightness invert ' +
    'cubic-bezier steps clamp minmax repeat polygon inset circle ellipse counter attr ' +
    'env').split(' '));

  it('calls nothing it has not declared', () => {
    const decl = declared();
    const called = new Set();
    const re = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(app))) called.add(m[1]);
    const missing = [...called].filter((n) =>
      !decl.has(n) && !KEYWORDS.has(n) && !BROWSER.has(n) &&
      !CSSFN.has(n) && !(n in globalThis));
    assert.deepStrictEqual(missing, [],
        'js/app.js calls these, and nothing declares them — a ReferenceError ' +
        'wherever the line runs: ' + missing.join(', '));
  });

  it('would have caught the two v254 deletions', () => {
    // The probe: pretend both definitions were renamed away, exactly as
    // 90812ff left them, and confirm the scan names them.
    const broken = app
        .replace('async function detachMemberByEmail', 'async function detachRenamedAway')
        .replace('async function loadArchivedSeasons', 'async function loadRenamedAway');
    assert.notStrictEqual(broken, app, 'neither definition is where this probe expects');
    const decl = new Set();
    [/(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g].forEach((re) => {
      let m; re.lastIndex = 0;
      while ((m = re.exec(broken))) decl.add(m[1]);
    });
    assert.ok(!decl.has('detachMemberByEmail') && !decl.has('loadArchivedSeasons'),
        'the probe did not actually remove the declarations');
    assert.ok(/[^\w$.]detachMemberByEmail\s*\(/.test(broken),
        'the call site this guard exists for is gone');
    assert.ok(/[^\w$.]loadArchivedSeasons\s*\(/.test(broken),
        'the call site this guard exists for is gone');
  });
});
