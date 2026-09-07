/* Build a self-contained mockup of NOTIFICACIONS, the staff feed (v245).
 *
 * The whole page is the app: `renderStaffNotifications` and its `.nf-`
 * builders are sliced out of js/app.js and CALLED. The suite asserts on the
 * HTML string, and a string cannot tell you that the 116px badge column
 * squeezes the 172px name, or that the two section heads in the two columns
 * fail to share one underline.
 *
 * Three frames: the mixed feed, unread-only, and everything read.
 *
 *   node scripts/build-notificacions-preview.js . notificacions-preview.html
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
const U = require(path.join(ROOT, 'js', 'utils.js'));

function grab(from, to) {
  const i = appSrc.indexOf(from);
  const j = appSrc.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return appSrc.slice(i, j);
}
function esc(v) {
  return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const NOW = new Date(2026, 8, 2, 18, 30);
const ago = (mins) => new Date(NOW.getTime() - mins * 60000).toISOString();

const USERS = [
  ['u1', 'Marc Puig', 'CB'], ['u2', 'Guillem Roca', 'ST'], ['u3', 'Nil Ferrer', 'DM'],
  ['u4', 'Àlex Camps', 'RB'], ['u5', 'Pau Serra', 'LW'], ['u6', 'Oriol Mas', 'GK'],
  ['u7', 'Ivan Soler', 'OM'], ['u8', 'Ibrahim Diallo', 'CB'], ['u9', 'Jordi Vidal', 'LB'],
].map(([id, name, position]) => ({ id, name, position, category: 'amateur', team: 'A', roles: ['player'] }));

/* One of every badge, both read states, and — deliberately — TWO records with
   no `team`, no `answer` and no `page`: what every notification written before
   v245 looks like. They must render, stay visible under the A/B filter, and
   simply not be links. */
const FEED = [
  { id: 'n1', type: 'injury', uid: 'u1', category: 'amateur', team: 'A', read: false,
    playerName: 'Marc Puig', detail: 'Autoreport · isquiotibial dret',
    activity: 'Sessió de força (2026-09-02)', page: 'medical-detail', pageId: 'u1', timestamp: ago(12) },
  { id: 'n2', type: 'match_avail', uid: 'u2', category: 'amateur', team: 'A', read: false,
    playerName: 'Guillem Roca', detail: 'No Disponible', answer: 'no_disponible',
    activity: 'CE L\'Esquerra vs CF Vilassar de Mar · 2026-09-12',
    page: 'match-detail', pageId: 'm1', timestamp: ago(34) },
  { id: 'n3', type: 'training_rpe', uid: 'u3', category: 'amateur', team: 'A', read: false,
    playerName: 'Nil Ferrer', detail: 'RPE 9 · 75 min', activity: 'Sessió tàctica (2026-09-02)',
    page: 'staff-training-detail', pageId: 't2', timestamp: ago(60) },
  { id: 'n4', type: 'extra_training', uid: 'u4', category: 'amateur', team: 'A', read: false,
    playerName: 'Àlex Camps', detail: 'Gimnàs 60 min · RPE 6', activity: 'Gimnàs (2026-09-01)',
    page: 'staff-player-stats', pageId: 'u4', timestamp: ago(120) },
  { id: 'n5', type: 'training_avail', uid: 'u5', category: 'amateur', team: 'A', read: false,
    playerName: 'Pau Serra', detail: 'Tard', answer: 'late', activity: 'Sessió de força (2026-09-03)',
    page: 'staff-training-detail', pageId: 't4', timestamp: ago(180) },
  { id: 'n6', type: 'training_avail', uid: 'u6', category: 'amateur', team: 'A', read: false,
    playerName: 'Oriol Mas', detail: 'Sí', answer: 'yes', activity: 'Sessió tàctica (2026-09-03)',
    page: 'staff-training-detail', pageId: 't4', timestamp: ago(240) },
  { id: 'n7', type: 'match_rpe', uid: 'u7', category: 'amateur', team: 'A', read: true,
    playerName: 'Ivan Soler', detail: 'Canviat · RPE 4 · 62 min', activity: 'CF Sants (2026-08-30)',
    page: 'match-detail', pageId: 'm0', timestamp: ago(1220) },
  /* Pre-v245: no team, no answer, no page. */
  { id: 'n8', type: 'registration', uid: 'u8', category: 'amateur', read: true,
    playerName: 'Ibrahim Diallo', detail: 'Sol·licitud d\'alta pendent d\'aprovació',
    activity: 'dorsal 14', timestamp: ago(1250) },
  { id: 'n9', type: 'training_avail', uid: 'u9', category: 'amateur', read: true,
    playerName: 'Jordi Vidal', detail: 'No', activity: 'Sessió de resistència (2026-08-28)',
    timestamp: ago(1400) },
];

const CA = {};
const I18N = grab("    /* ── Notificacions, redesigned (v245) ──", "\n    // ── Settings ──");
let m;
const RE = /'(nf\.[a-z_0-9]+)':\s*\{\s*\n?\s*ca:\s*'((?:[^'\\]|\\.)*)'/g;
while ((m = RE.exec(I18N))) CA[m[1]] = m[2].replace(/\\'/g, "'");
assert.ok(Object.keys(CA).length > 20, 'the nf.* strings did not parse: ' + Object.keys(CA).length);
Object.assign(CA, { 'page.notifications': 'Notificacions', 'cat.all': 'Totes' });

function stubs(over) {
  return Object.assign({
    getStaffNotifications: () => JSON.parse(JSON.stringify(FEED)),
    getUsers: () => USERS,
    getVisibleCategories: () => ['amateur'],
    getTeamLetters: () => ['A', 'B'],
    getCurrentCategory: () => 'amateur',
    inMyNotifScope: () => true,
    canViewPage: () => true,
    CATEGORY_LABELS: { amateur: 'Amateur' },
    POS_COLORS: U.POS_COLORS,
    localDateStr: U.localDateStr,
    /* v247: one `_viewSquad` for every page, read through these two. */
    getCurrentSquad: () => 'A',
    currentSquadOrNull: () => 'A',
    notifUnreadOnly: false,
    sanitize: esc,
    t: (k) => (k in CA ? CA[k] : k),
    tv: (k, vars) => String(k in CA ? CA[k] : k)
        .replace(/\{(\w+)\}/g, (mm, n) => (n in vars ? String(vars[n]) : mm)),
    tDayDDMM: (d) => { const p = String(d).split('-'); return p[2] + '/' + p[1]; },
  }, over || {});
}

function render(over) {
  const api = stubs(over);
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(api), `
    ${/* ⚠ The leading newline is load-bearing: the i18n block carries the same
          banner text at four spaces of indent, and it comes FIRST in the file —
          so a two-space marker matches inside it and the slice starts in the
          middle of a string table. */
    grab('\n  /* ── Notificacions, redesigned (v245) ──', '  /** The position circle beside a name.')}
    ${grab('  function nfPosOf(n) {', '\n  // #endregion')}
    const _now = new Date(${NOW.getTime()});
    const _real = Date;
    Date = function (...a) { return a.length ? new _real(...a) : new _real(_now.getTime()); };
    Date.prototype = _real.prototype; Date.now = () => _now.getTime();
    Date.parse = _real.parse; Date.UTC = _real.UTC;
    try { return renderStaffNotifications(); } finally { Date = _real; }
  `)(...Object.values(api));
}

const mixed = render();
const unreadOnly = render({ notifUnreadOnly: true });
const allRead = render({
  getStaffNotifications: () => FEED.map(n => Object.assign({}, n, { read: true })),
});

/* The rules the page exists to enforce, asserted here too so the mockup can
   never be the artefact that quietly shows the wrong thing. */
assert.ok(/Ibrahim Diallo/.test(mixed) && /Jordi Vidal/.test(mixed),
    'a pre-v245 record with no `team` vanished under the letter filter');
assert.strictEqual((mixed.match(/nf-row-new/g) || []).length, 6, 'unread count moved');
assert.strictEqual((allRead.match(/nf-row-new/g) || []).length, 0,
    'a row is still unread after everything was marked read');
assert.ok(/nf-a-ok/.test(mixed) && /nf-a-warn/.test(mixed) && /nf-a-off/.test(mixed),
    'the availability badge is not being coloured by the answer');

const html = `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EsquerrApp — Notificacions (v245)</title>
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
  <b>EsquerrApp v245 — Notificacions, as a COACH sees it.</b>
  Rendered by the app's real <code>renderStaffNotifications()</code> and its
  real CSS. The category/squad strip above it is the shared <code>.cat-bar</code>,
  which renderPage draws outside the page root and is not part of this mockup.
  The last two rows are <b>pre-v245 records</b> — no squad letter, no answer,
  no link — and must stay visible and unbadged rather than disappearing.
  Clock frozen at 2 Sep 2026. Generated ${new Date().toISOString().slice(0, 10)}.
</div>
<div class="mock-h">1 · sis sense llegir</div>
<div class="mock-shell">${mixed}</div>
<div class="mock-h">2 · només sense llegir</div>
<div class="mock-shell">${unreadOnly}</div>
<div class="mock-h">3 · tot llegit</div>
<div class="mock-shell">${allRead}</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
console.log('rows=' + (mixed.match(/class="nf-row/g) || []).length +
    ' unread=' + (mixed.match(/nf-row-new/g) || []).length +
    ' links=' + (mixed.match(/nf-row-go/g) || []).length);
