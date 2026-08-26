/* The premium board is gated by NOT SHIPPING IT.
 *
 * `clubFeature('board3d')` hid the toggle and nothing else: while
 * js/board3d.js was a public file, anyone could fetch it and drive
 * createBoard3D directly, or flip `_clubConfig.features` in devtools.
 * Neither hack persists — the write is superadmin-gated — but the board
 * worked.
 *
 * Gating the SAVE cannot work and nobody should try: a saved board is
 * arrows, positions and pen strokes as percentages, byte-identical
 * whichever view drew it. There is nothing for the server to detect.
 *
 * So the module is excluded from both distribution channels and arrives
 * only through a callable that checks the entitlement. Three things have
 * to hold together for that to mean anything, and each is a test here:
 * the file is off Pages, it is off the APK mirror, and the deployable
 * copy has not rotted away from the real one.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const fns = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const cfg = fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8');
const www = fs.readFileSync(path.join(ROOT, 'scripts', 'build-www.js'), 'utf8');

describe('the 3D module is not a public file', () => {
  it('GitHub Pages does not publish it', () => {
    /* Pages serves the whole branch; `exclude` is the only thing that
       keeps anything off it. Comment-stripped, because the block above
       the list explains at length what is excluded and why — and a
       search of the raw file would find the explanation instead of the
       entry. */
    const bare = cfg.replace(/^\s*#.*$/gm, '');
    assert.ok(/^\s*-\s*js\/board3d\.js\s*$/m.test(bare),
        'js/board3d.js must be excluded from the Pages build');
  });

  it('the APK mirror does not carry it either', () => {
    /* Two channels, two lists, and they have to move together — which
       is what this pair of tests is really for. */
    assert.ok(/\/\^board3d\\\.js\$\//.test(www),
        'build-www must deny board3d.js');
    assert.ok(/DENY_PATTERN\.some/.test(www),
        'and deny it at every depth, not only at the root');
  });

  it('and nothing loads it by URL any more', () => {
    /* The whole gate is undone by one static import. */
    assert.ok(!/import\(['"]\.\/board3d\.js['"]\)/.test(app),
        'app.js must not import the module directly');
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    assert.ok(!/board3d/.test(idx), 'index.html must not reference it');
    assert.ok(!/board3d/.test(sw),
        'and the service worker must not precache it — a precache entry ' +
        'for a 404 fails the whole install');
  });
});

describe('the deployable copy has not rotted', () => {
  it('functions/private/board3d.js is byte-identical to js/board3d.js', () => {
    /* THE FAILURE THIS EXISTS FOR: edit the real module, forget the
       copy, and the server serves a board several versions old with
       nothing failing anywhere. `firebase deploy --only functions`
       uploads functions/ and nothing else, so the copy is not optional. */
    const src = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'));
    const dst = path.join(ROOT, 'functions', 'private', 'board3d.js');
    assert.ok(fs.existsSync(dst),
        'the deployable copy is missing — run: node scripts/sync-board3d.js');
    assert.ok(fs.readFileSync(dst).equals(src),
        'functions/private/board3d.js has drifted from js/board3d.js.\n' +
        '      The deployed board would be a different version.\n' +
        '      Run:  node scripts/sync-board3d.js');
  });

  it('and both deploy scripts refresh it before deploying functions', () => {
    /* The suite is not what runs immediately before a deploy. */
    const ps1 = fs.readFileSync(path.join(ROOT, 'deploy.ps1'), 'utf8');
    const sh = fs.readFileSync(path.join(ROOT, 'deploy.sh'), 'utf8');
    assert.ok(/node scripts\/sync-board3d\.js/.test(ps1),
        'deploy.ps1 must sync the copy');
    assert.ok((sh.match(/node scripts\/sync-board3d\.js/g) || []).length >= 2,
        'deploy.sh must sync it for BOTH functions and all');
  });

  it('the sync copies bytes, not text', () => {
    /* A text round-trip on Windows rewrites every line ending and fails
       the byte comparison this whole arrangement rests on. */
    const s = fs.readFileSync(path.join(ROOT, 'scripts', 'sync-board3d.js'), 'utf8');
    assert.ok(/readFileSync\(SRC\);/.test(s) && !/readFileSync\(SRC, ['"]utf8/.test(s),
        'the source must be read as a Buffer');
    assert.ok(/--check/.test(s), 'and it must offer a verify-only mode');
  });
});

describe('the callable checks who is asking', () => {
  const fn = (() => {
    const i = fns.indexOf('exports.getBoard3d = onCall(');
    assert.ok(i !== -1, 'getBoard3d was not found in functions/index.js');
    const j = fns.indexOf('\n});', i);
    return fns.slice(i, j + 4);
  })();

  it('refuses anyone not signed in', () => {
    assert.ok(/if \(!request\.auth\)/.test(fn) &&
              /unauthenticated/.test(fn), fn.slice(0, 200));
  });

  it('takes the club from the TOKEN, never from the request', () => {
    /* A clubId in the payload would let any signed-in user name an
       entitled club and be handed the module — the gate would check a
       real entitlement belonging to somebody else. */
    assert.ok(/const clubId = token\.teamId;/.test(fn),
        'the club must come from the caller\'s own custom claims');
    assert.ok(!/request\.data/.test(fn),
        'nothing in the request body may influence the decision');
  });

  it('requires the entitlement to be exactly true', () => {
    assert.ok(/features\.board3d !== true/.test(fn),
        'a truthy value is not an entitlement — the flag is written as a ' +
        'boolean by setClubFeatures and must be read as one');
    assert.ok(/permission-denied/.test(fn), 'and refuse when it is not');
  });

  it('lets the superadmin through, or the demo account cannot demo it', () => {
    assert.ok(/SUPERUSER_EMAIL/.test(fn),
        'mirroring clubFeature(), which returns true for isAdmin');
  });

  it('reads the file lazily, not at module load', () => {
    /* index.js is loaded by EVERY function in the deployment. 117 KB
       read on each of their cold starts would be paid by callers who
       never open a board. */
    assert.ok(/let _board3dSrc = null;/.test(fns), 'it must be cached');
    assert.ok(/if \(_board3dSrc === null\)/.test(fn),
        'and read inside the handler');
    assert.ok(/private", "board3d\.js"/.test(fn),
        'from the deployable copy');
  });

  it('refuses without leaking why to the log-less caller', () => {
    assert.ok(/logger\.info\("getBoard3d refused"/.test(fn),
        'a refusal must be visible to us — it is either a bug or a ' +
        'prospect worth calling');
  });
});

describe('the client loads it through the callable', () => {
  const loader = (() => {
    const i = app.indexOf('async function tbLoad3D()');
    assert.ok(i !== -1, 'tbLoad3D was not found');
    return app.slice(i, app.indexOf('\n  async function tbMount3D', i));
  })();

  it('asks the server rather than the origin', () => {
    assert.ok(/httpsCallable\('getBoard3d'\)/.test(loader));
  });

  it('rewrites the three.js specifier before evaluating', () => {
    /* ⚠ THE TRAP. board3d.js opens with a RELATIVE import of three.js,
       and a relative specifier inside a blob module has no base path to
       resolve against — the browser tries it against `blob:` and fails
       with a message naming neither file. */
    assert.ok(/vendor\/three\.module\.min\.js', document\.baseURI/.test(loader),
        'the page must resolve it against its own origin');
    assert.ok(/URL\.createObjectURL\(new Blob\(\[patched\]/.test(loader),
        'and the PATCHED source is what gets evaluated, not the original');
  });

  it('and fails loudly if that specifier ever changes', () => {
    /* Silently, the module would 404 on its own import at some later
       date, with an error naming neither this code nor board3d.js. */
    assert.ok(/if \(patched === src\)/.test(loader) && /throw new Error/.test(loader),
        'a no-op rewrite must throw');
  });

  it('the real module still imports three.js the way the patch expects', () => {
    /* The two halves of the same fact, in two files. This is the one
       that catches a rename in board3d.js. */
    const b3d = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');
    const spec = /import \* as THREE from (['"])(\.\.\/vendor\/three\.module\.min\.js)\1/
        .exec(b3d);
    assert.ok(spec, 'board3d.js no longer imports three.js by that path — ' +
        'tbLoad3D\'s rewrite will not match and 3D will not load');
    /* And the file it names is really there, and really public: three.js
       is MIT and is not the part worth protecting. */
    assert.ok(fs.existsSync(path.join(ROOT, 'vendor', 'three.module.min.js')),
        'the vendored three.js is missing');
    const bare = cfg.replace(/^\s*#.*$/gm, '');
    assert.ok(!/^\s*-\s*vendor/m.test(bare),
        'vendor/ must stay on Pages — the blob module fetches three.js by URL');
  });

  it('caches the module for the session', () => {
    /* A coach enters and leaves 3D a dozen times in a sitting; each of
       those is a callable and 117 KB otherwise. */
    assert.ok(/if \(_board3dMod\) return _board3dMod;/.test(loader));
  });

  it('and releases the blob URL', () => {
    assert.ok(/URL\.revokeObjectURL\(url\)/.test(loader),
        'the module is fetched by the time import() settles, so the URL ' +
        'is dead weight after it');
    assert.ok(/finally \{/.test(loader),
        'released even when the import throws');
  });
});
