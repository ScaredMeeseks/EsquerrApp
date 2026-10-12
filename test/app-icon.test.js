/* The installed app's icon, per club (v283) — functions/app-icon.js, run for
 * real, sharp included. `npm run test:appicon`.
 *
 * What fails silently here:
 *   1. a manifest that is not the SAME app as manifest.json — Chrome keys an
 *      install on start_url, so a drift would install a second app beside
 *      everyone's first;
 *   2. three copies of one address (the function's own, app.js, index.html's
 *      head script) — a typo in one points the icon at nothing, and the
 *      browser shows a generic tile without a word;
 *   3. an icon that is not square, white-backed and padded — iOS paints a
 *      transparent background black, and a launcher mask crops a crest that
 *      fills the square.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const A = require(path.join(ROOT, 'functions', 'app-icon.js'));
const sharp = require(path.join(ROOT, 'functions', 'node_modules', 'sharp'));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const fnSrc = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const ICON = 'https://appicon-674dkdzfja-uc.a.run.app';
const MAN = 'https://appmanifest-674dkdzfja-uc.a.run.app';

describe('app icon — what the endpoints believe', () => {
  it('serves start_url only for the app\'s own addresses', () => {
    assert.strictEqual(A.appBase('https://scaredmeeseks.github.io/EsquerrApp/'), A.PROD_APP);
    assert.strictEqual(A.appBase('http://localhost:8087/'), 'http://localhost:8087/');
    assert.strictEqual(A.appBase('http://127.0.0.1:5500/'), 'http://127.0.0.1:5500/');
    ['https://evil.example/', 'https://scaredmeeseks.github.io/Other/', 'http://localhost/x/',
      'javascript:alert(1)', '', undefined].forEach((b) =>
      assert.strictEqual(A.appBase(b), A.PROD_APP, String(b)));
  });

  it('fetches a crest only from Storage, over https', () => {
    const ok = 'https://firebasestorage.googleapis.com/v0/b/esquerrapp.appspot.com/o/clubBadges%2Fc1.png?alt=media&token=t';
    assert.strictEqual(A.safeBadgeUrl(ok), ok);
    assert.strictEqual(A.safeBadgeUrl('http://firebasestorage.googleapis.com/x.png'), '');
    assert.strictEqual(A.safeBadgeUrl('https://169.254.169.254/computeMetadata/'), '');
    assert.strictEqual(A.safeBadgeUrl('https://evil.example/x.png'), '');
    assert.strictEqual(A.safeBadgeUrl('not a url'), '');
  });

  it('takes a Firestore id and a known size, nothing else', () => {
    assert.strictEqual(A.validClubId('Tm96gel58VSQvxgynf45'), 'Tm96gel58VSQvxgynf45');
    assert.strictEqual(A.validClubId('../x'), '');
    assert.strictEqual(A.validClubId('a&b=c'), '');
    assert.deepStrictEqual([180, 192, 512, 7, 'x'].map(A.iconSize), [180, 192, 512, 512, 512]);
  });
});

describe('app icon — the manifest', () => {
  const withCrest = A.buildManifest({clubId: 'c1', clubName: 'C.E. Sant Andreu', hasBadge: true,
    app: 'https://scaredmeeseks.github.io/EsquerrApp/', iconBase: ICON});

  it('is the SAME app as manifest.json — only the icons and description move', () => {
    ['name', 'short_name', 'display', 'background_color', 'theme_color', 'orientation',
      'gcm_sender_id'].forEach((k) => assert.strictEqual(withCrest[k], MANIFEST[k], k));
    assert.strictEqual(withCrest.start_url,
        new URL(MANIFEST.start_url, A.PROD_APP).href, 'a second app would install beside the first');
    assert.strictEqual(withCrest.scope, A.PROD_APP);
    assert.strictEqual(withCrest.description, 'C.E. Sant Andreu');
  });

  it('names the club\'s icons, a maskable one among them', () => {
    assert.deepStrictEqual(withCrest.icons.map((i) => [i.src, i.sizes, i.purpose]), [
      [ICON + '?club=c1&s=192', '192x192', 'any'],
      [ICON + '?club=c1&s=512', '512x512', 'any'],
      [ICON + '?club=c1&s=512&m=1', '512x512', 'maskable'],
    ]);
  });

  it('a club with no crest gets the app\'s own icons, as absolute addresses', () => {
    const m = A.buildManifest({clubId: 'c2', hasBadge: false,
      app: 'http://localhost:8087/', iconBase: ICON});
    assert.deepStrictEqual(m.icons.map((i) => i.src),
        ['http://localhost:8087/img/logo-192.png', 'http://localhost:8087/img/logo-512.png']);
    assert.strictEqual(m.start_url, 'http://localhost:8087/index.html');
  });

  it('a hostile app= cannot move start_url off the app', () => {
    const m = A.buildManifest({clubId: 'c1', hasBadge: true, app: 'https://evil.example/', iconBase: ICON});
    assert.strictEqual(m.start_url, A.PROD_APP + 'index.html');
  });
});

describe('app icon — the PNG', () => {
  // A wide, opaque red crest: 300×200, so "contain" has to letterbox it.
  const crest = () => sharp({create: {width: 300, height: 200, channels: 4,
    background: {r: 200, g: 20, b: 30, alpha: 1}}}).png().toBuffer();
  const pixel = async (png, x, y) => {
    const {data, info} = await sharp(png).raw().toBuffer({resolveWithObject: true});
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const isWhite = (p) => p.every((v) => v > 245);
  const isRed = (p) => p[0] > 150 && p[1] < 80 && p[2] < 80;

  [180, 192, 512].forEach((size) => {
    it('a square ' + size + ' PNG on white, crest in the middle', async () => {
      const png = await A.renderIcon(sharp, await crest(), size, false);
      const meta = await sharp(png).metadata();
      assert.strictEqual(meta.format, 'png');
      assert.strictEqual(meta.width, size);
      assert.strictEqual(meta.height, size);
      // No alpha channel at all: transparent white reads as white in RGB.
      assert.strictEqual(meta.hasAlpha, false, 'transparent pixels survive — iOS paints them black');
      assert.ok(isWhite(await pixel(png, 0, 0)), 'the corner is not white — iOS would paint it black');
      assert.ok(isRed(await pixel(png, size >> 1, size >> 1)), 'the crest is not there');
    });
  });

  it('a transparent crest still lands on white, not black', async () => {
    const clear = await sharp({create: {width: 100, height: 100, channels: 4,
      background: {r: 0, g: 0, b: 0, alpha: 0}}}).png().toBuffer();
    const png = await A.renderIcon(sharp, clear, 180, false);
    assert.ok(isWhite(await pixel(png, 90, 90)), 'transparency came out dark');
  });

  it('the maskable one keeps the crest inside the safe zone', async () => {
    const x = Math.round(512 * 0.12);
    assert.ok(isRed(await pixel(await A.renderIcon(sharp, await crest(), 512, false), x, 256)),
        'the plain icon wastes its edge');
    assert.ok(isWhite(await pixel(await A.renderIcon(sharp, await crest(), 512, true), x, 256)),
        'the maskable crest reaches where a launcher mask cuts');
  });
});

describe('app icon — the three copies of the addresses agree', () => {
  it('index.js, app.js and index.html name the same two endpoints', () => {
    assert.ok(fnSrc.includes('const APP_ICON_BASE = "' + ICON + '"'), 'index.js');
    assert.ok(appSrc.includes("const APP_ICON_FN = '" + ICON + "'"), 'app.js icon');
    assert.ok(appSrc.includes("const APP_MANIFEST_FN = '" + MAN + "'"), 'app.js manifest');
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes(ICON + '?club=') && head.includes(MAN + '?club='), 'index.html head');
  });

  it('the endpoints are exported, public and CORS-open (a manifest is fetched cross-origin)', () => {
    ['appManifest', 'appIcon'].forEach((n) => {
      const m = new RegExp('exports\\.' + n + ' = onRequest\\(\\s*\\{cors: true, region: "us-central1"').exec(fnSrc);
      assert.ok(m, n);
    });
    // The Run service name is the function's, lower-cased: the addresses above
    // are only right while these two names stay what they are.
    assert.ok(/appicon-/.test(ICON) && /appmanifest-/.test(MAN));
  });

  it('sharp is a declared dependency of the functions, not only installed here', () => {
    const pkg = require(path.join(ROOT, 'functions', 'package.json'));
    assert.ok(pkg.dependencies && pkg.dependencies.sharp, 'Cloud Build would deploy without it');
  });
});
