/* The 3D board — the parts of it that are checkable without a GPU.
 *
 * js/board3d.js cannot be executed here: it is an ES module that
 * imports three.js and builds WebGL contexts. What CAN be checked, and
 * is worth more than it sounds, is the seam between it and the rest of
 * the app — because every bug found while writing it lived in that
 * seam rather than in the graphics.
 *
 * The one that got through review: board3d read `parseFill(...).on`.
 * parseFill returns `{striped, ...}`; `on` is the first ARGUMENT of
 * encodeFill. Reading the parser's output under the encoder's
 * parameter name renders every striped kit solid — a wrong board that
 * throws nothing, on a feature nobody has looked at yet.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');

describe('the seam with the rest of the app', () => {
  it('reads the fill shape parseFill actually returns', () => {
    // `striped`, never `on`.
    assert.ok(/\.striped/.test(src), 'board3d must test p.striped');
    assert.ok(!/\bp\.on\b/.test(src),
        'p.on is encodeFill\'s parameter, not parseFill\'s output');
    assert.ok(/return \{striped: true/.test(utilsSrc),
        'utils.parseFill changed shape — board3d assumes {striped,...}');
  });

  it('imports nothing from app.js', () => {
    /* Everything it needs is injected (BG, fillCss, parseFill), which
       is what lets it be an ES module at all — app.js is a classic
       script sharing one global scope and has no exports. */
    const imports = src.match(/^import .*/gm) || [];
    assert.strictEqual(imports.length, 1, 'expected exactly one import');
    assert.ok(/three\.module\.min\.js/.test(imports[0]), imports[0]);
  });

  it('takes its geometry from board-geom rather than re-deriving it', () => {
    // A second opinion about where the penalty spot is would put the
    // 3D pitch and the 2D pitch quietly out of step.
    ['BG.extent(', 'BG.markings(', 'BG.toWorld(', 'BG.toPercent(']
        .forEach((fn) => assert.ok(src.includes(fn), 'missing ' + fn));
    assert.ok(!/16\.5|40\.32|9\.15|7\.32/.test(src),
        'board3d must not hardcode regulation distances');
  });

  it('writes through the shared setters', () => {
    /* The whole premise: a board edited in 3D must serialise
       identically to one edited in 2D. */
    const mount = appSrc.slice(appSrc.indexOf('async function tbMount3D'));
    assert.ok(/BS\.setPoints\(localStorage, key/.test(mount),
        '3D drags must go through BS.setPoints');
    assert.ok(/BS\.KEYS\[kind\]/.test(mount),
        'the kind must map to a real scratch key');
  });

  it('clamps a drag to the pitch', () => {
    /* A drop outside the board would store a percentage beyond 0-100,
       which the 2D view draws off the edge of its box with no way to
       grab it back. */
    assert.ok(/Math\.max\(0, Math\.min\(100,/.test(src), 'onPointerUp must clamp');
  });
});

describe('the load path', () => {
  it('is lazily imported, never a script tag', () => {
    /* three.js is 733 KB. A <script> tag would spend it on every page
       load for a feature most sessions never open. */
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(!/board3d|three\.module/.test(html),
        'the 3D board must not be in index.html');
    assert.ok(/await import\('\.\/board3d\.js'\)/.test(appSrc),
        'expected a dynamic import');
  });

  it('is not precached by the service worker', () => {
    // Precaching it would download 733 KB on first visit — the exact
    // cost the lazy import exists to avoid.
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    assert.ok(!/board3d|three\./.test(sw));
  });

  it('degrades when WebGL is missing, including when probing THROWS', () => {
    /* Some hardened browsers and remote-desktop sessions throw from
       getContext rather than returning null. An exception there must
       leave a working 2D board, not a broken page. */
    const probe = appSrc.slice(appSrc.indexOf('function tbWebglOk'),
        appSrc.indexOf('var _tb3d ='));
    assert.ok(/try \{/.test(probe) && /catch/.test(probe), probe);
    assert.ok(/_webglOk = false/.test(probe));
  });

  it('says so when the import fails', () => {
    // Offline or a blocked module leaves an empty green rectangle
    // otherwise, which reads as a broken feature rather than a
    // missing download.
    assert.ok(/load_3d_failed/.test(appSrc));
  });
});

describe('the APK never sees any of it', () => {
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-www.js'), 'utf8');

  it('excludes vendor/ and board3d.js', () => {
    assert.ok(/'vendor'/.test(build), 'vendor must be in DENY_EXACT');
    assert.ok(/\^board3d\\\.js\$/.test(build), 'board3d must be in DENY_PATTERN');
  });

  it('applies the patterns at every depth, not just the root', () => {
    /* DENY_EXACT is root-only by design — those are top-level
       directory names — but js/board3d.js is nested, so the patterns
       have to reach it. */
    const copyDir = build.slice(build.indexOf('function copyDir'),
        build.indexOf('function build()'));
    assert.ok(/DENY_PATTERN\.some/.test(copyDir),
        'copyDir must filter by pattern, or nested files always ship');
  });

  it('does not exclude anything the app needs', () => {
    // The patterns now reach every file, so a careless one could drop
    // something load-bearing.
    const DENY = [/\.md$/i, /\.rules$/i, /-preview\.html$/i,
      /-debug\.html$/i, /\.log$/i, /^board3d\.js$/];
    ['app.js', 'utils.js', 'db.js', 'shard.js', 'board-geom.js',
      'board-state.js', 'boards.js', 'style.css', 'index.html', 'sw.js']
        .forEach((f) => {
          assert.ok(!DENY.some((re) => re.test(f)), f + ' would be excluded');
        });
  });
});

describe('the premium gate', () => {
  it('is a superadmin-owned club field, like maxTeams', () => {
    const fn = appSrc.slice(appSrc.indexOf('function clubFeature'),
        appSrc.indexOf('/** Teams the club actually has'));
    assert.ok(/_clubConfig && _clubConfig\.features/.test(fn), fn);
  });

  it('lets the superadmin through', () => {
    const fn = appSrc.slice(appSrc.indexOf('function clubFeature'),
        appSrc.indexOf('/** Teams the club actually has'));
    assert.ok(/s\.isAdmin/.test(fn));
  });

  it('gates both the toggle and the saved preference', () => {
    /* The stored preference alone must not open the view: a club
       whose premium lapses would otherwise keep the 3D board because
       the flag is still in their localStorage. */
    assert.ok(/fa_tactic_view_3d'\) === '1'\s*\n?\s*&& clubFeature\('board3d'\)/
        .test(appSrc), 'the saved preference must be re-checked against the gate');
  });
});

describe('i18n', () => {
  it('every 3D string has all three languages', () => {
    const keys = [...appSrc.matchAll(
        /'(tactics\.(?:view_hint|loading_3d|load_3d_failed))':\s*\{([^}]*)\}/g)];
    assert.strictEqual(keys.length, 3, 'expected 3 keys, found ' + keys.length);
    keys.forEach((m) => {
      ['ca:', 'es:', 'en:'].forEach((l) =>
        assert.ok(m[2].includes(l), m[1] + ' is missing ' + l));
    });
  });
});
