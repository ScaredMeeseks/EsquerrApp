/* Build a self-contained mockup of PISSARRES, the superadmin board catalogue
 * and platform template library (v257).
 *
 * The whole page is the app: the `#region Superadmin: board catalogue` block
 * is sliced out of js/app.js and CALLED, against stubbed Firestore reads.
 *
 * ⚠ THIS ONE NEEDS A DOM, like build-configuracio-preview.js and unlike the
 * other nine. `renderAdminBoards()` returns nothing but a shell: the real
 * markup is written by `_abRender()` after an async `_abLoad()`, so a
 * string-only harness would produce one <div> and report success.
 *
 * ⚠ IT ALSO NEEDS AN IntersectionObserver. The card grid hydrates on scroll,
 * and jsdom has none — so the stub below fires every card at once, which is
 * what a printed page has to show anyway.
 *
 * jsdom lives in test/node_modules — the repo root has no node_modules.
 *
 *   node scripts/build-pissarres-preview.js . pissarres-preview.html
 *
 * REGENERATED, never hand-edited. The `-preview.html` suffix is load-bearing
 * for scripts/build-www.js, and the NAME must also be in _config.yml.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(process.argv[2] || '.');
const OUT = path.resolve(process.argv[3] || 'mockup.html');

const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const { JSDOM } = require(path.join(ROOT, 'test', 'node_modules', 'jsdom'));

function grab(from, to) {
  const i = appSrc.indexOf(from);
  const j = appSrc.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return appSrc.slice(i, j);
}
function esc(v) {
  return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* The Catalan strings, read out of the app's own table rather than retyped —
   a mockup with its own copy of the copy is a mockup that can drift. */
const CA = {};
const RE = /'((?:ab|tactics|cat|common)\.[a-z_0-9]+)':\s*\{\s*ca:\s*'((?:[^'\\]|\\.)*)'/g;
let m;
while ((m = RE.exec(appSrc))) CA[m[1]] = m[2].replace(/\\'/g, "'");
assert.ok(Object.keys(CA).length > 50,
    'the i18n table did not parse: ' + Object.keys(CA).length);
/* ⚠ `t()` returns the KEY on a miss, so a prefix left out of the regex above
   renders as `tactics.loading` in the mockup and looks like an app bug. This
   has happened twice on other pages (`day.` and `sched.`). */
['ab.h1', 'ab.tab_clubs', 'ab.send_title', 'tactics.loading']
    .forEach((k) => assert.ok(k in CA, 'i18n key missing from the mockup: ' + k));
function assertNoRawKeys(html, label) {
  const raw = html.match(/>[a-z][a-z_0-9]*\.[a-z_0-9]{3,}</g) || [];
  const bad = raw.filter((s) => !/\.(cat|com|es|org|net|html|js|png|jpg)</.test(s));
  assert.deepStrictEqual(bad, [], 'raw i18n key rendered in ' + label + ': ' + bad.join(', '));
  const attrs = html.match(/(?:placeholder|title)="[a-z][a-z_0-9]*\.[a-z_0-9]{3,}"/g) || [];
  assert.deepStrictEqual(attrs, [],
      'raw i18n key in an attribute in ' + label + ': ' + attrs.join(', '));
}

// ── Fixtures, in the mockup's own names ─────────────────────────────
const CLUBS = [
  { id: 'c-esq', name: 'CE L’Esquerra de l’Eixample' },
  { id: 'c-gav', name: 'CE Gavà Nord' },
  { id: 'c-pob', name: 'CF Poble Sec' }
];
const BOARDS = [
  { id: 'b1', clubId: 'c-esq', name: 'Sortida de pilota 3-2', tag: 'Atac',
    category: 'amateur', formation: '4-3-3', ownerUid: 'u1', bytes: 4096,
    hasFrames: true, frameCount: 4, updatedAt: { seconds: 1757300000 } },
  { id: 'b2', clubId: 'c-esq', name: 'Pressió alta al servei', tag: 'Defensa',
    category: 'amateur', formation: '4-4-2', ownerUid: 'u1', bytes: 6100,
    hasFrames: true, frameCount: 6, updatedAt: { seconds: 1757100000 } },
  { id: 'b3', clubId: 'c-esq', name: 'Córner ofensiu curt', tag: 'Estratègia',
    category: 'juvenil', formation: '4-4-2', ownerUid: 'u2', bytes: 2200,
    updatedAt: { seconds: 1756700000 } },
  { id: 'b4', clubId: 'c-esq', name: 'Replegament per banda', tag: 'Defensa',
    category: 'cadet', formation: '5-3-2', ownerUid: 'u3', bytes: 3400,
    hasFrames: true, frameCount: 5, updatedAt: { seconds: 1756500000 } },
  { id: 'b5', clubId: 'c-esq', name: 'Transició ràpida', tag: 'Atac',
    category: 'amateur', formation: '4-3-3', ownerUid: 'u2', bytes: 5200,
    updatedAt: { seconds: 1756100000 } },
  /* ⚠ NO PAYLOAD BELOW. TB.warm swallows its errors, so a board whose drawing
     never arrives is otherwise silent — this frame is the only place that
     failed state is ever looked at. */
  { id: 'b6', clubId: 'c-esq', name: 'Falta lateral assajada', tag: 'Estratègia',
    category: 'juvenil', formation: '4-4-2', ownerUid: 'u3', bytes: 1800,
    updatedAt: { seconds: 1755600000 } },
  // Seeded FROM the library: not club work, so not in a catalogue of club work.
  { id: 'b7', clubId: 'c-esq', name: 'Rondo 4v2', formation: '4-3-3',
    sourceTemplateId: 't1', bytes: 900 }
];
const TEMPLATES = [
  { id: 't1', name: 'Rondo 4v2 · escalfament', tag: 'Escalfament', category: '',
    packs: ['Escola', 'Base'], published: true, bytes: 900 },
  { id: 't2', name: 'Bloc mig 4-4-2', tag: 'Defensa', category: 'amateur',
    packs: ['Amateur'], published: true, bytes: 5100 },
  { id: 't3', name: 'Estructura de rebuig', tag: 'Estratègia', category: '',
    packs: ['Estratègia'], published: true, bytes: 3300 },
  { id: 't4', name: 'Sortida des del porter', tag: '', category: 'juvenil',
    packs: [], published: false, bytes: 2400 }
];
const AUTHORS = {
  'c-esq': {
    u1: { name: 'Berta Puig', category: 'amateur', letters: ['A'], active: true },
    u2: { name: 'Quim Tena', category: 'juvenil', letters: ['A'], active: true },
    u3: { name: 'Hugo Camps', category: 'cadet', letters: ['A'], active: false }
  }
};
const SOURCES = { b2: { templateId: 't2', clubId: 'c-esq' } };

/* Real-looking drawings, so the cards show pitches rather than six identical
   placeholders. `positions` is what tbResolveRef needs to call it a drawing. */
function drawing(n, nFrames) {
  const rows = [[50, 88], [26, 70], [42, 72], [58, 72], [74, 70],
    [36, 50], [64, 50], [50, 38], [30, 28], [70, 28], [50, 18]];
  const b = {
    positions: rows.slice(0, 11),
    numbers: ['1', '2', '4', '5', '3', '8', '6', '10', '7', '9', '11'],
    boardType: 'full', showOpp: n % 2 === 0,
    oppPositions: [[30, 12], [50, 10], [70, 12]],
    oppNumbers: ['R', 'R', 'R'],
    arrows: n % 2 ? [{ x1: 42, y1: 72, x2: 30, y2: 44 }] : []
  };
  /* ⚠ The frame count on the CARD comes from the metadata doc's `frameCount`;
     the ▶ puck on the PITCH comes from `frames.length > 1` on the payload.
     Two sources, and they have to agree here or the mockup shows a card
     claiming frames beside a board offering no way to play them. */
  if (nFrames > 1) b.frames = new Array(nFrames).fill(null).map(() => b.positions);
  return b;
}
const PAYLOADS = { b1: drawing(1, 4), b2: drawing(2, 6), b3: drawing(3),
  b4: drawing(4, 5), b5: drawing(5) };

// ── Slices ──────────────────────────────────────────────────────────
const PAGE = grab('  // #region Superadmin: board catalogue & platform template library',
    '  // #endregion Superadmin board catalogue');
const REF = grab('  function tbResolveRef(ref) {', '  /**\n   * Is this drawing');
const THIN = grab('  function tbRefIsThin(ref, board) {', '  /**\n   * How a linked board');
const RO_HTML = grab('  /** One read-only board, or a placeholder to be filled in after render. */',
    '  /**\n   * Fill in any placeholders left by tbRoBoardHtml');
const HYDRATE = grab('  async function hydrateRoBoards(roots) {',
    '  function bindRoBoardAnimations() {');
/* ⚠ THE PITCH ITSELF IS A STAND-IN, and deliberately — the same call
   build-training-plan-preview.js makes, for the same reason. The real
   renderReadOnlyBoard pulls in the board-geometry module, the pitch-scale
   chain and a live DOM to size against; none of that is what this mockup is
   for, and the artwork has its own suite and its own previews.

   What IS real here is the path: the card emits a skeleton, the viewport gate
   fires, hydration swaps the skeleton for whatever the renderer returns. That
   is exactly the sequence a metadata doc passed as the ref would SKIP, so the
   trap this page has stays covered by the assertions below. */
/* ⚠ THE WRAPPER SHAPE IS THE REAL ONE, and it has to be. renderReadOnlyBoard
   returns `<div style="margin-bottom:1rem"><div style="font-weight:600…">NAME
   </div><div class="tb-field-readonly">…</div></div>`, and BOTH of those inline
   styles are things `.ab-thumb` overrides — the duplicate title is hidden and
   the bottom margin zeroed. A stub that emitted only the field would make those
   two rules untestable here and the mockup would show a card the app cannot
   produce. So the stand-in is only the ARTWORK inside the field. */
const PUCK = Math.max(13, Math.round(30 * (250 / 814)));

function mockPitch(name, frames) {
  const dots = [[50, 86], [26, 70], [42, 72], [58, 72], [74, 70],
    [36, 50], [64, 50], [50, 36], [32, 22], [68, 22], [50, 14]];
  /* The ▶ / 3D strip at the size scaleRoField computes for a card this wide:
     `Math.max(--ro-ctl-min, 30 * w / 814)`. The scale term is about 9px here,
     so the FLOOR is what sizes them — 13px since v258, 16px before, which is
     why they read as oversized on a card while being right on a session
     panel. Drawn rather than computed live because the preview stubs the
     pitch renderer, so nothing calls scaleRoField. */
  const puck = 'width:' + PUCK + 'px;height:' + PUCK + 'px;border-radius:50%;' +
    'background:rgba(0,0,0,.55);color:#fff;display:inline-flex;' +
    'align-items:center;justify-content:center;';
  return '<div style="margin-bottom:1rem;">' +
    '<div style="font-weight:600;font-size:.92rem;margin-bottom:.4rem;">' +
      esc(name) + '</div>' +
    '<div class="tb-field-readonly" style="position:relative;' +
      'aspect-ratio:3/2;background:#5C8F5E;overflow:hidden;">' +
    '<div style="position:absolute;inset:8px;border:1px solid rgba(255,255,255,.5);"></div>' +
    '<div style="position:absolute;left:50%;top:8px;bottom:8px;width:1px;' +
      'background:rgba(255,255,255,.5);"></div>' +
    '<div style="position:absolute;left:50%;top:50%;width:52px;height:52px;' +
      'margin:-26px 0 0 -26px;border:1px solid rgba(255,255,255,.5);' +
      'border-radius:50%;"></div>' +
    dots.map((d, i) => '<span style="position:absolute;left:' + d[0] + '%;top:' +
      d[1] + '%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;' +
      'background:' + (i > 7 ? '#e53935' : '#FFFFFF') + ';"></span>').join('') +
    '<div class="tb-ro-ctl" style="position:absolute;right:1%;bottom:1%;' +
      'display:flex;gap:4px;">' +
      '<span style="' + puck + 'font-size:7px;">3D</span>' +
      (frames > 1 ? '<span style="' + puck + 'font-size:' + PUCK + 'px;' +
        'line-height:1;">▸</span>' : '') +
    '</div>' +
    '</div></div>';
}

async function render(over) {
  const o = over || {};
  const dom = new JSDOM('<!DOCTYPE html><body><div id="dashboard-content"></div></body>');
  const doc = dom.window.document;

  const cached = {};
  const observed = [];
  function FakeIO(cb) { this.cb = cb; this.nodes = []; observed.push(this); }
  FakeIO.prototype.observe = function (n) {
    this.nodes.push(n);
    // Everything is "on screen" in a printed page.
    this.cb([{ target: n, isIntersecting: true }]);
  };
  FakeIO.prototype.unobserve = function () {};
  FakeIO.prototype.disconnect = function () {};

  const snapOf = (rows) => ({
    docs: rows.map((r) => ({ id: r.id, data: () => r })),
    size: rows.length,
    forEach(f) { this.docs.forEach(f); }
  });

  const api = {
    document: doc,
    window: dom.window,
    IntersectionObserver: FakeIO,
    setTimeout: dom.window.setTimeout.bind(dom.window),
    clearTimeout: dom.window.clearTimeout.bind(dom.window),
    console: { error: () => {}, warn: () => {} },
    alert: () => {},
    ResizeObserver: function () { this.observe = function () {}; },
    CATEGORY_ORDER: ['amateur', 'juvenil', 'cadet', 'infantil', 'alevi', 'benjami'],
    CATEGORY_LABELS: { amateur: 'Amateur', juvenil: 'Juvenil', cadet: 'Cadet',
      infantil: 'Infantil', alevi: 'Aleví', benjami: 'Benjamí' },
    sanitize: esc,
    t: (k) => (k in CA ? CA[k] : k),
    navigate: () => {},
    tbClearEditor: () => {},
    tbHydrateEditor: () => {},
    showTbConfirm: () => {},
    _showPushToast: () => {},
    scaleRoBoards: () => {},
    bindRoBoardAnimations: () => {},
    renderReadOnlyBoard: (bd) => mockPitch((bd && bd.name) || '',
        (bd && bd.frames && bd.frames.length) || 0),
    firebase: { app: () => ({ functions: () => ({ httpsCallable: () => async () => ({}) }) }) },
    db: {
      collection(name) {
        const q = { name, where: null, limit: 0 };
        const self = {
          where(f, op, v) { q.where = [f, op, v]; return self; },
          limit(n) { q.limit = n; return self; },
          async get() {
            if (name === 'clubs') return snapOf(CLUBS);
            if (name === 'tacticTemplateSources') {
              return snapOf(Object.keys(SOURCES).map(
                  (k) => Object.assign({ id: k }, SOURCES[k])));
            }
            if (name === 'tacticBoards') {
              let rows = BOARDS;
              if (q.where) rows = rows.filter((b) => b[q.where[0]] === q.where[2]);
              return snapOf(rows);
            }
            return snapOf([]);
          },
          doc: (id) => ({
            collection: () => ({
              async get() {
                const mm = AUTHORS[id] || {};
                return snapOf(Object.keys(mm).map((k) => Object.assign({ id: k }, mm[k])));
              }
            })
          })
        };
        return self;
      }
    },
    TB: {
      templates: async () => JSON.parse(JSON.stringify(TEMPLATES)),
      peek: (id) => cached[id] || null,
      warm: async (ids) => {
        ids.forEach((id) => { if (PAYLOADS[id]) cached[id] = PAYLOADS[id]; });
      },
      get: async (id) => PAYLOADS[id] || null,
      getTemplate: async () => null,
      patchTemplate: async () => {},
      removeTemplate: async () => {}
    }
  };

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction(...Object.keys(api), `
    ${REF}
    ${THIN}
    ${RO_HTML}
    ${HYDRATE}
    ${PAGE}
    const host = document.getElementById('dashboard-content');
    host.innerHTML = renderAdminBoards();
    await _abLoad(true);
    /* ⚠ THE SCOPE IS SET AND THEN RELOADED, not set and re-rendered. The club
       is a where() on the query since v257, so pointing the state at another
       club without reading again leaves the previous club's boards in memory
       and the grid filters them all away — a blank page, and how this builder
       failed on its first run. (No backticks in here: this whole block is
       inside a template literal.) */
    _abState.tab = ${JSON.stringify(o.tab || 'clubs')};
    ${o.club === undefined ? '' : '_abState.club = ' + JSON.stringify(o.club) + ';'}
    ${o.tag ? '_abState.tag = ' + JSON.stringify(o.tag) + ';' : ''}
    ${o.sendClubs ? '_abState.sendClubs = ' + JSON.stringify(o.sendClubs) + ';' : ''}
    ${o.sendPacks ? '_abState.sendPacks = ' + JSON.stringify(o.sendPacks) + ';' : ''}
    await _abLoad(true);
    await new Promise((r) => setTimeout(r, 80));
    /* ⚠ REFLECT LIVE VALUES INTO ATTRIBUTES BEFORE SERIALISING. innerHTML
       writes attributes, not properties, so a checkbox ticked by the binder
       and a <select> option chosen at render both serialise as unset. */
    host.querySelectorAll('input').forEach((el) => {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) el.setAttribute('checked', ''); else el.removeAttribute('checked');
      } else if (el.value !== '') {
        el.setAttribute('value', el.value);
      }
    });
    host.querySelectorAll('select').forEach((sel) => {
      Array.prototype.forEach.call(sel.options, (op) => {
        if (op.selected) op.setAttribute('selected', ''); else op.removeAttribute('selected');
      });
    });
    return host.innerHTML;
  `);
  return fn(...Object.values(api));
}

main();

async function main() {
const clubs = await render({ club: 'c-esq' });
const tagged = await render({ club: 'c-esq', tag: 'Defensa' });
const editor = await render({ club: 'c-esq', tab: 'editor' });
const library = await render({ club: 'c-esq', tab: 'library',
  sendClubs: ['c-esq', 'c-gav'], sendPacks: ['Base'] });

/* The rules this page exists to enforce, asserted here too so the mockup can
   never be the artefact that quietly shows the wrong thing. */
assert.ok(/class="ab-hero"/.test(clubs), 'the header band is missing');
assert.strictEqual((clubs.match(/data-ab-card=/g) || []).length, 6,
    'wrong card count — is the seeded board being listed as club work?');
assert.ok(!/Rondo 4v2<\/div>/.test(clubs),
    'a board seeded from the library is listed back as club work');
/* ⚠ THE SILENT ONE. Five of the six have payloads and must be DRAWN; the
   sixth has none and must say so rather than reading "Carregant…" for ever. */
assert.strictEqual((clubs.match(/tb-field-readonly/g) || []).length, 5,
    'the mini pitches did not hydrate — was the metadata doc passed as the ref?');
assert.ok(/ab-thumb-failed/.test(clubs),
    'a board whose drawing never arrived is not marked');
assert.ok(!/ab-thumb-failed[^>]*>Carregant/.test(clubs),
    'the failed card still reads as loading');
assert.strictEqual((tagged.match(/data-ab-card=/g) || []).length, 2,
    'the tag chip does not narrow the grid');
assert.ok(/ab-chip-on/.test(tagged), 'the selected tag chip is not marked');
assert.ok(/data-ab-edit-tpl="t4"/.test(editor), 'the editor tab lists no draft');
assert.strictEqual((library.match(/class="ab-row"/g) || []).length, 4,
    'the library is not listing every template');
assert.ok(/ab-pchip-on/.test(library), 'no pack is assigned to anything');
assert.strictEqual((library.match(/ab-box-on/g) || []).length, 3,
    'the send panel does not reflect what is chosen');
[['clubs', clubs], ['tagged', tagged], ['editor', editor], ['library', library]]
    .forEach(([label, h]) => assertNoRawKeys(h, label));
[clubs, tagged, editor, library].forEach((h) => {
  assert.ok(!/\{(scope|n|t|total|c|s|p|e)\}/.test(h),
      'an unreplaced placeholder reached the page');
});

const html = `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EsquerrApp — Pissarres (v257)</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">
<style>
${cssSrc}
</style>
<style>
body { margin:0; background:#E9E6E0; font-family:'Oswald','Arial Narrow',sans-serif; }
.mock-note { background:#2D2926; color:#e0ddd9; padding:.7rem 1.2rem; font-size:.82rem; line-height:1.5; }
.mock-note b { color:#FFD662; }
.mock-shell { padding:2rem; background:#FBFAF7; }
.mock-h { background:#E9E6E0; padding:.6rem 1.2rem; font-size:.78rem; color:#6B645E; letter-spacing:.14em; text-transform:uppercase; }
</style>
</head>
<body>
<div class="mock-note">
  <b>EsquerrApp v257 — Pissarres, as the SUPERADMIN sees it.</b>
  Rendered by the app's real <code>renderAdminBoards()</code> / <code>_abLoad()</code>
  / <code>_abRender()</code> against the real CSS, mounted in a DOM because the
  page is written after an async read. The mini pitches are the app's real
  <code>renderReadOnlyBoard()</code>, hydrated through the real viewport-gated
  path with every card treated as on screen.
  <b>«Falta lateral assajada» deliberately has no payload</b> — it must show the
  failed state, not «Carregant…».
  Generated ${new Date().toISOString().slice(0, 10)}.
</div>
<div class="mock-h">1 · pissarres dels clubs — un club, sis targetes</div>
<div class="mock-shell">${clubs}</div>
<div class="mock-h">2 · el mateix, filtrat per l'etiqueta Defensa</div>
<div class="mock-shell">${tagged}</div>
<div class="mock-h">3 · editor — el llançador, no un segon editor</div>
<div class="mock-shell">${editor}</div>
<div class="mock-h">4 · biblioteca de plataforma — paquets i enviament a diversos clubs</div>
<div class="mock-shell">${library}</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
console.log('cards=' + (clubs.match(/data-ab-card=/g) || []).length +
    ' pitches=' + (clubs.match(/tb-field-readonly/g) || []).length +
    ' failed=' + (clubs.match(/ab-thumb-failed/g) || []).length +
    ' rows=' + (library.match(/class="ab-row"/g) || []).length +
    ' packs=' + (library.match(/class="ab-pack[ "]/g) || []).length);
}
