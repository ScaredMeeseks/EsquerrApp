/* Build a self-contained mockup of GESTIÓ D'USUARIS, the club member list (v255).
 *
 * The whole page is the app: `renderAdminUsers` and its `gu*` builders are
 * sliced out of js/app.js and CALLED. The suite asserts on the HTML string,
 * and a string cannot tell you that the seven-column grid squeezes the email
 * to nothing, or that the role and squad pickers fail to share a baseline.
 *
 * Unlike Configuració this page is a pure string builder — it needs no DOM.
 *
 *   node scripts/build-gestio-usuaris-preview.js . gestio-usuaris-preview.html
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
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* The Catalan strings, read out of the app's own table rather than retyped. */
const CA = {};
const RE = /'((?:gu|users|common|auth|staffrole|btn|page|cat)\.[a-z_0-9]+)':\s*\{\s*ca:\s*'((?:[^'\\]|\\.)*)'/g;
let m;
while ((m = RE.exec(appSrc))) CA[m[1]] = m[2].replace(/\\'/g, "'");
assert.ok(Object.keys(CA).length > 20, 'the i18n table did not parse: ' + Object.keys(CA).length);
['gu.sub', 'gu.note', 'gu.foot', 'users.th_name', 'common.player', 'common.staff',
  'auth.role_lead', 'staffrole.fitness', 'btn.leave_squad']
    .forEach((k) => assert.ok(k in CA, 'i18n key missing from the mockup: ' + k));

/* ⚠ No rendered frame may contain a bare i18n key. The named list above only
   catches keys someone remembered to add to it; this catches the next prefix
   left out of the regex, which has already happened twice on the sibling
   builder (`day.` and `sched.`). */
function assertNoRawKeys(html, label) {
  const raw = (html.match(/>[a-z][a-z_0-9]*\.[a-z_0-9]{3,}</g) || [])
      .filter((s) => !/\.(cat|com|es|org|net|html|js|png|jpg)</.test(s));
  assert.deepStrictEqual(raw, [], 'raw i18n key rendered in ' + label + ': ' + raw.join(', '));
  const attrs = html.match(/placeholder="[a-z][a-z_0-9]*\.[a-z_0-9]{3,}"/g) || [];
  assert.deepStrictEqual(attrs, [],
      'raw i18n key in a placeholder in ' + label + ': ' + attrs.join(', '));
}

const CLUB = {
  id: 'club1',
  name: 'L’Esquerra de l’Eixample FC',
  leadEmail: 'marina.rovira@gmail.com',
  categories: {
    amateur: { enabled: true, letters: ['A', 'B'] },
    juvenil: { enabled: true, letters: ['A'] },
    cadet: { enabled: true, letters: ['A'] }
  },
  rosters: {
    'amateur-A': {
      playerEmails: ['marc.puig@gmail.com', 'oriolmas@gmail.com', 'g.roca@hotmail.com',
        'nilferrer@gmail.com', 'pauserra01@gmail.com', 'jvidal@gmail.com'],
      staffEmails: ['berta.puig@gmail.com', 'hugocamps@gmail.com', 'laia.serra@gmail.com'],
      staffRoles: { 'hugocamps@gmail.com': 'fitness', 'laia.serra@gmail.com': 'delegate' }
    },
    'amateur-B': { playerEmails: ['sergi.bonet@gmail.com', 'rogerpla@gmail.com'], staffEmails: [], staffRoles: {} },
    'juvenil-A': { playerEmails: ['bielcosta@gmail.com', 'adam.khelifi@gmail.com'], staffEmails: [], staffRoles: {} },
    'cadet-A': { playerEmails: [], staffEmails: [], staffRoles: {} }
  }
};

/* One of every circle: four positions, all three staff glyphs, the lead, and
   — deliberately — two members with NO squad, which is the state this page
   exists to resolve and the only one that tints its row. */
const USERS = [
  { id: 'u1', name: 'Marc Puig', email: 'marc.puig@gmail.com', category: 'amateur', team: 'A', position: 'CB', playerNumber: '4', roles: ['player'] },
  { id: 'u2', name: 'Oriol Mas', email: 'oriolmas@gmail.com', category: 'amateur', team: 'A', position: 'GK', playerNumber: '1', roles: ['player'] },
  { id: 'u3', name: 'Guillem Roca', email: 'g.roca@hotmail.com', category: 'amateur', team: 'A', position: 'ST', playerNumber: '9', roles: ['player'] },
  { id: 'u4', name: 'Nil Ferrer', email: 'nilferrer@gmail.com', category: 'amateur', team: 'A', position: 'DM', playerNumber: '6', roles: ['player'] },
  { id: 'u5', name: 'Berta Puig', email: 'berta.puig@gmail.com', category: 'amateur', team: 'A', roles: ['staff'], staffRole: 'coach' },
  { id: 'u6', name: 'Hugo Camps', email: 'hugocamps@gmail.com', category: 'amateur', team: 'A', roles: ['staff'], staffRole: 'fitness' },
  { id: 'u7', name: 'Laia Serra', email: 'laia.serra@gmail.com', category: 'amateur', team: 'A', roles: ['staff'], staffRole: 'delegate' },
  { id: 'u8', name: 'Pau Serra', email: 'pauserra01@gmail.com', category: 'amateur', team: 'A', position: 'LW', playerNumber: '11', roles: ['player'] },
  { id: 'u9', name: 'Sergi Bonet', email: 'sergi.bonet@gmail.com', category: 'amateur', team: 'B', position: 'RW', playerNumber: '7', roles: ['player'] },
  { id: 'u10', name: 'Biel Costa', email: 'bielcosta@gmail.com', category: 'juvenil', team: 'A', position: 'ST', playerNumber: '10', roles: ['player'] },
  { id: 'u11', name: 'Ibrahim Diallo', email: 'i.diallo@gmail.com', category: '', team: '', position: 'CB', playerNumber: '', roles: ['player'] },
  { id: 'u12', name: 'Èric Ribas', email: 'eric.ribas@gmail.com', category: '', team: '', position: 'RB', playerNumber: '', roles: [] },
  { id: 'u13', name: 'Marina Rovira', email: 'marina.rovira@gmail.com', category: '', team: '', roles: ['staff'], isTeamLead: true }
];

const PAGE = grab('  /* ── Gestió d\'usuaris ─', '  /**\n   * Show the shared body-level tooltip');

function render(over) {
  const o = over || {};
  const api = {
    getSession: () => ({ id: 'u0', email: 'marna96@gmail.com', teamId: 'club1',
      isTeamLead: true, isAdmin: false }),
    getUsers: () => JSON.parse(JSON.stringify(USERS)),
    _clubConfig: CLUB,
    CATEGORY_ORDER: ['amateur', 'juvenil', 'cadet', 'infantil', 'alevi', 'benjami'],
    CATEGORY_LABELS: { amateur: 'Amateur', juvenil: 'Juvenil', cadet: 'Cadet',
      infantil: 'Infantil', alevi: 'Aleví', benjami: 'Benjamí' },
    POS_COLORS: U.POS_COLORS,
    /* ⚠ The REAL ones, sliced in. `catSpanOf` answers a question about its
       input — whether the list on screen spans more than one category — and
       a stub returning a constant would make the badge appear or vanish for
       a reason the app never computed. */
    catSpanOf: U.catSpanOf,
    catBadgeHtmlGlobal: U.catBadgeHtmlGlobal,
    normalizeEmail: (v) => String(v || '').trim().toLowerCase(),
    regStaffOf: (rosters, u) => {
      const e = String(u.email || '').trim().toLowerCase();
      const listed = Object.values(rosters || {}).some(
          (r) => (r.staffEmails || []).some((x) => String(x).toLowerCase() === e));
      return listed || (u.roles || []).indexOf('staff') !== -1;
    },
    sanitize: esc,
    t: (k) => (k in CA ? CA[k] : k),
    getCurrentCategory: () => o.cat || '',
    currentSquadOrNull: () => o.letter || null
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function(...Object.keys(api), `
    ${PAGE}
    _guFilter = ${JSON.stringify(o.filter || 'all')};
    _guQuery = ${JSON.stringify(o.query || '')};
    return renderAdminUsers();
  `);
  return fn(...Object.values(api));
}

const all = render();
const amateurA = render({ cat: 'amateur', letter: 'A' });
const staffOnly = render({ filter: 'staff' });
const noSquad = render({ filter: 'nosquad' });
const searched = render({ query: 'serra' });

/* The rules this page exists to enforce, asserted here too so the mockup can
   never be the artefact that quietly shows the wrong thing. */
[['tots', all], ['amateur A', amateurA], ['staff', staffOnly],
  ['sense equip', noSquad], ['cerca', searched]].forEach(([l, h]) => assertNoRawKeys(h, l));

const rowsIn = (h) => (h.match(/class="gu-row/g) || []).length;
assert.strictEqual(rowsIn(all), USERS.length,
    'the default view hides somebody — it must open on everyone');
assert.ok(rowsIn(amateurA) < rowsIn(all), 'the category bar did not narrow the list');
/* ⚠ Narrowing to Amateur A must still show the LEAD and uncategorised staff:
   they carry no category at all, and a lead who cannot see them cannot manage
   them. This is the whole reason the filter skips rows with no category. */
assert.ok(/Marina Rovira/.test(amateurA),
    'the club lead vanished when the list was narrowed to a squad');
assert.strictEqual((noSquad.match(/gu-row-nosquad/g) || []).length, 3,
    'the "sense equip" filter does not reach everyone without a squad');
assert.ok(/gu-lead-badge/.test(all) && !/data-gu-role="u13"/.test(all),
    'the lead is offered an editable role control');
assert.strictEqual((all.match(/gu-db/g) || []).length, 1, 'the fitness dumbbell moved');
/* ⚠ Asserts the glyph is WRAPPED, not that an inline filter is present. The
   filter moved to CSS precisely because on the circle it bleached the
   background too — an assertion naming the old inline style would have
   demanded the bug back. */
assert.ok(/<span class="gu-inv">/.test(all), 'the delegate folder is not wrapped for inversion');
assert.ok(!/gu-circle[^>]*filter:/.test(all),
    'the invert is back on the circle, which bleaches its own background');
assert.strictEqual((searched.match(/class="gu-row/g) || []).length, 2,
    'search matched the wrong number of people');

const html = `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EsquerrApp — Gestió d'usuaris (v255)</title>
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
  <b>EsquerrApp v255 — Gestió d'usuaris, as the club RESPONSABLE sees it.</b>
  Rendered by the app's real <code>renderAdminUsers()</code> and its real CSS.
  The category/squad strip that sits above it is the shared <code>.cat-bar</code>,
  which renderPage draws OUTSIDE the page root and is not part of this mockup —
  frame 2 shows what its filtering does. <b>The last two rows have no squad</b>
  and must stay reachable however the list is narrowed; so must the lead, who
  carries no category at all. Generated ${new Date().toISOString().slice(0, 10)}.
</div>
<div class="mock-h">1 · tots — com s'obre la pàgina</div>
<div class="mock-shell">${all}</div>
<div class="mock-h">2 · filtrat a Amateur A — el responsable i el staff sense categoria hi segueixen</div>
<div class="mock-shell">${amateurA}</div>
<div class="mock-h">3 · només staff</div>
<div class="mock-shell">${staffOnly}</div>
<div class="mock-h">4 · sense equip</div>
<div class="mock-shell">${noSquad}</div>
<div class="mock-h">5 · cerca «serra»</div>
<div class="mock-shell">${searched}</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
console.log('rows=' + rowsIn(all) + ' amateurA=' + rowsIn(amateurA) +
    ' staff=' + rowsIn(staffOnly) + ' nosquad=' + rowsIn(noSquad));
