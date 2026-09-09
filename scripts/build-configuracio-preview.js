/* Build a self-contained mockup of CONFIGURACIÓ, the club settings page (v254).
 *
 * The whole page is the app: `renderConfiguracio()`, `_tsSectionsHtml()` and
 * every `_refreshTeamSetup*()` are sliced out of js/app.js and CALLED.
 *
 * ⚠ UNLIKE THE OTHER NINE BUILDERS, THIS ONE NEEDS A DOM.
 * Configuració is the first paper page that is a form rather than a report:
 * `renderConfiguracio()` returns the shell with every section container
 * EMPTY, and `_tsMount()` fills them by writing into those containers. A
 * string-only harness would therefore render a page of empty panels and
 * cheerfully report success — the exact failure mode CLAUDE.md warns about,
 * one step worse, because here the emptiness is what the string legitimately
 * contains. So the slices are run against jsdom and the mockup is the mounted
 * innerHTML, which is what the lead actually sees.
 *
 * jsdom lives in test/node_modules — the repo root has no node_modules, and
 * this is the only script that needs it.
 *
 *   node scripts/build-configuracio-preview.js . configuracio-preview.html
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
const RE = /'((?:cfg|kits|rem|auth|club|quota|settings|staffrole|ts|page|conv|archive|btn|common|team_del|fcf|error|day|sched)\.[a-z_0-9]+)':\s*\{\s*ca:\s*'((?:[^'\\]|\\.)*)'/g;
let m;
while ((m = RE.exec(appSrc))) CA[m[1]] = m[2].replace(/\\'/g, "'");
assert.ok(Object.keys(CA).length > 60, 'the i18n table did not parse: ' + Object.keys(CA).length);
/* ⚠ `t()` returns the KEY on a miss, so a prefix left out of the regex above
   renders as `day.wednesday` in the mockup and looks like an app bug. Assert
   the ones this page actually shows are present rather than trusting the
   list — the day names were missing on the first run and did exactly that. */
['day.monday', 'day.sunday', 'rem.push_hours', 'kits.title', 'auth.staff_title',
  'sched.place_ph', 'club.home_coords', 'club.home_coords_ph']
    .forEach((k) => assert.ok(k in CA, 'i18n key missing from the mockup: ' + k));
/* ⚠ Belt and braces: no rendered frame may contain a bare i18n key. The
   named list above only catches keys someone remembered to add to it — this
   catches the next prefix left out of the regex, which has now happened
   twice (`day.` and `sched.`). */
function assertNoRawKeys(html, label) {
  const raw = html.match(/>[a-z][a-z_0-9]*\.[a-z_0-9]{3,}</g) || [];
  const bad = raw.filter((s) => !/\.(cat|com|es|org|net|html|js|png|jpg)</.test(s));
  assert.deepStrictEqual(bad, [], 'raw i18n key rendered in ' + label + ': ' + bad.join(', '));
  const attrs = html.match(/placeholder="[a-z][a-z_0-9]*\.[a-z_0-9]{3,}"/g) || [];
  assert.deepStrictEqual(attrs, [],
      'raw i18n key in a placeholder in ' + label + ': ' + attrs.join(', '));
}

const CLUB = {
  id: 'club1',
  name: 'L’Esquerra de l’Eixample FC',
  leadEmail: 'marna96@gmail.com',
  badgeUrl: '',
  maxTeams: 4,
  categories: {
    amateur:  { enabled: true,  letters: ['A', 'B'] },
    juvenil:  { enabled: true,  letters: ['A'] },
    cadet:    { enabled: true,  letters: ['A'] },
    infantil: { enabled: false, letters: ['A'] },
    alevi:    { enabled: false, letters: ['A'] },
    benjami:  { enabled: false, letters: ['A'] }
  },
  fcfLinks: {
    'amateur-A': 'https://www.fcf.cat/classificacio/2526/futbol-11/tercera-catalana/grup-5?grupId=1234',
    'amateur-B': 'https://www.fcf.cat/classificacio/2526/futbol-11/quarta-catalana/grup-3?grupId=5678'
  },
  /* `day` is a DAY_VALUES string ('mon'…'sun'), never an index — the select
     is built from that array and a number would select nothing. */
  schedules: {
    'amateur-A': { training: [
      { day: 'wed', time: '20:00', endTime: '21:30', location: 'Camp Municipal Joan Serrahima', link: '' },
      { day: 'fri', time: '21:00', endTime: '22:30', location: 'Pista coberta Sant Antoni', link: '' }
    ], homeGame: { day: 'sat', time: '17:00', location: 'Camp Municipal Joan Serrahima', link: '' } },
    'amateur-B': { training: [
      { day: 'tue', time: '21:15', endTime: '22:45', location: 'Camp Municipal Joan Serrahima', link: '' }
    ], homeGame: { day: 'sat', time: '19:00', location: '', link: '' } },
    'juvenil-A': { training: [
      { day: 'mon', time: '18:30', endTime: '20:00', location: 'Camp Municipal Joan Serrahima', link: '' }
    ], homeGame: { day: 'sun', time: '12:00', location: '', link: '' } },
    /* Deliberately empty: this is the squad the rail must flag in red. */
    'cadet-A': { training: [], homeGame: { day: 'sat', time: '10:00', location: '', link: '' } }
  },
  reminders: { pushHours: 4, lockHours: 3 },
  homeCoords: { lat: 41.3874, lon: 2.1686 },
  kits: [
    { id: 'k1', label: '1a equipació', shirt: '#BD162C', shorts: '#2D2926', socks: '#BD162C' },
    { id: 'k2', label: '2a equipació', shirt: '#FBFAF7', shorts: '#FBFAF7', socks: '#FBFAF7' }
  ],
  rosters: {
    'amateur-A': { staffEmails: ['berta.puig@gmail.com', 'hugocamps@gmail.com', 'laia.serra@gmail.com'],
      staffRoles: { 'hugocamps@gmail.com': 'fitness', 'laia.serra@gmail.com': 'delegate' } },
    'amateur-B': { staffEmails: ['quim.tena@gmail.com'], staffRoles: {} },
    'juvenil-A': { staffEmails: ['raul.mena@gmail.com', 'nuria.gil@gmail.com'], staffRoles: {} },
    'cadet-A': { staffEmails: [], staffRoles: {} }
  }
};

/* Four clubs, one of them deliberately OVER its allowance (3 teams, max 2) so
   the quota column has to turn red, and one with no town. */
const OTHER_CLUBS = [
  { id: 'c1', name: 'UE Esquerra', town: 'Barcelona', maxTeams: 4, minAppVersion: 250,
    leadEmail: 'marna96@gmail.com', features: { board3d: true }, members: 78, since: 2024,
    categories: { amateur: { enabled: true, letters: ['A', 'B'] }, juvenil: { enabled: true, letters: ['A'] },
      cadet: { enabled: true, letters: ['A'] } } },
  { id: 'c2', name: 'CF Poble Sec', town: 'Barcelona', maxTeams: 6, minAppVersion: 0,
    leadEmail: 'quim.tena@gmail.com', features: {}, members: 41, since: 2025,
    categories: { amateur: { enabled: true, letters: ['A'] }, juvenil: { enabled: true, letters: ['A'] } } },
  { id: 'c3', name: 'CE Gavà Nord', town: '', maxTeams: 2, minAppVersion: 0,
    leadEmail: 'raul.mena@gmail.com', features: {}, members: 56, since: 2025,
    categories: { amateur: { enabled: true, letters: ['A', 'B'] }, cadet: { enabled: true, letters: ['A'] } } },
  { id: 'c4', name: 'AE Sants Vell', town: 'Barcelona', maxTeams: 2, minAppVersion: 0,
    leadEmail: '', features: {}, members: 19, since: 2023,
    categories: { amateur: { enabled: true, letters: ['A'] } } }
];
const CODES = { c1: 'ESQ2026', c2: 'PSC2026', c3: 'GAV2026', c4: 'SAN2025' };

const SETUP = grab('  function _letterChipsHtml(catKey, letters, enabled) {',
    '  // ---------- Profile Setup ----------');
/* Runs to the END of _loadClubList, not to its comment: the clubs table is
   the most intricate markup on the page and it is built asynchronously, so a
   slice that stopped short would leave the mockup showing "Carregant clubs…"
   — a table nobody had ever looked at. */
const PAGE = grab('  /** Which tab is showing.',
    '  /* Team-lead field in the club table (superadmin only).');
/* Sliced in, not stubbed. It marks the SELECTED quarter-hour, so a stub
   returning a fixed option list would render every time field blank while
   every assertion about the schedule section went on passing. */
const TIMES = grab('  function buildTimeOptions(selected) {', '\n  /**');

function render(over) {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="dashboard-content"></div></body>');
  const doc = dom.window.document;
  const club = Object.assign({}, CLUB, (over && over.club) || {});
  const session = Object.assign({ id: 'u0', email: 'marna96@gmail.com', teamId: 'club1',
    isTeamLead: true, isAdmin: false }, (over && over.session) || {});

  const api = {
    document: doc,
    window: dom.window,
    requestAnimationFrame: (fn) => fn(),
    DAY_VALUES: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    REMINDER_PUSH_HOURS: 4, REMINDER_LOCK_HOURS: 3, REMINDER_HOURS_MAX: 72,
    CATEGORY_ORDER: ['amateur', 'juvenil', 'cadet', 'infantil', 'alevi', 'benjami'],
    CATEGORY_LABELS: { amateur: 'Amateur', juvenil: 'Juvenil', cadet: 'Cadet',
      infantil: 'Infantil', alevi: 'Aleví', benjami: 'Benjamí' },
    _clubConfig: club,
    currentPage: 'settings',
    getSession: () => session,
    sanitize: esc,
    t: (k) => (k in CA ? CA[k] : k),
    tv: (k, vars) => String(k in CA ? CA[k] : k)
        .replace(/\{(\w+)\}/g, (mm, n) => (n in vars ? String(vars[n]) : mm)),
    /* ⚠ Sliced in for real, not stubbed to a constant: every figure on this
       page is derived from them, and `() => 4` would make the quota colour
       and the rail agree with each other about a number neither computed. */
    seasonStartStr: () => '2026-08-15',
    showModal: () => {},
    showView: () => {},
    navigate: () => {},
    renderPage: () => {},
    renderDashboard: () => {},
    showDeleteTeamModal: () => {},
    _showPushToast: () => {},
    _showQuotaBlockedModal: () => {},
    normalizeEmail: (v) => String(v || '').trim().toLowerCase(),
    isValidEmail: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    fcfGrupId: (v) => (/grupId=(\d+)/.exec(v || '') || [])[1] || '',
    defaultEndTime: (v) => v,
    parseCoordsInput: (v) => v,
    shirtSvg: () => '<svg viewBox="0 0 24 24" width="22" height="22"><rect width="24" height="24" fill="#BD162C"/></svg>',
    shortsSvg: () => '<svg viewBox="0 0 24 24" width="22" height="22"><rect width="24" height="24" fill="#2D2926"/></svg>',
    kitSockSvg: () => '<svg viewBox="0 0 24 24" width="22" height="22"><rect width="24" height="24" fill="#BD162C"/></svg>',
    parseFill: (v) => ({ c1: v || '#ffffff', striped: false, n: 2, dir: 'v', c2: '#ffffff' }),
    fillFrom: (c1) => c1,
    stripeRowEl: () => doc.createElement('span'),
    kitsOf: (c) => (c && c.kits && c.kits.length ? c.kits : [
      { id: 'k1', label: '1a equipació', shirt: '#ffffff', shorts: '#000000', socks: '#ffffff' }]),
    clubReminders: (c) => (c && c.reminders) || { pushHours: 4, lockHours: 3 },
    clubMaxTeams: () => Math.max(1, Number(club.maxTeams || 1)),
    rosterKeys: (cfg) => {
      const cats = (cfg && cfg.categories) || {};
      const out = [];
      ['amateur', 'juvenil', 'cadet', 'infantil', 'alevi', 'benjami'].forEach((k) => {
        if (!cats[k] || !cats[k].enabled) return;
        (cats[k].letters && cats[k].letters.length ? cats[k].letters : ['A'])
            .forEach((l) => out.push(k + '-' + l));
      });
      return out;
    },
    isClubOverQuota: () => false,
    STAFF_SUB_ROLES: ['coach', 'fitness', 'delegate'],
    /* Enough Firestore for the real `_loadClubList()` to run: the clubs
       collection, the join codes, and the per-club COUNT aggregation. Faked
       rather than skipped because the table is superadmin-only markup that
       nothing else renders — stubbing _loadClubList itself would leave it
       unlooked-at, which is how the first screenshot showed "Carregant
       clubs…" where the table should be. */
    db: {
      collection: (name) => ({
        get: async () => (name === 'clubs'
          ? { empty: false, forEach: (f) => OTHER_CLUBS.forEach((c) => f({ id: c.id, data: () => c })) }
          : { empty: false, forEach: (f) => Object.keys(CODES).forEach(
              (cid) => f({ id: CODES[cid], data: () => ({ clubId: cid }) })) }),
        where: (_f, _op, id) => ({
          count: () => ({ get: async () => ({
            data: () => ({ count: (OTHER_CLUBS.filter((c) => c.id === id)[0] || {}).members || 0 })
          }) })
        })
      })
    },
    firebase: null, storage: null,
    getClub: async () => club,
    loadRosters: async () => club.rosters,
    saveRosterFields: async () => {},
    DB: { setItemAcked: async () => {} },
    getTeamLetters: () => ['A', 'B']
  };

  /* AsyncFunction, because _loadClubList() is async and the table it builds
     is the point of the superadmin frame. */
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction(...Object.keys(api), `
    ${TIMES}
    ${SETUP}
    ${PAGE}
    _cfgTab = ${JSON.stringify((over && over.tab) || 'club')};
    const host = document.getElementById('dashboard-content');
    host.innerHTML = renderConfiguracio();
    const page = host.querySelector('.cfg-page');
    if (page) _tsMount(page);
    if (host.querySelector('#club-list')) await _loadClubList();
    /* ⚠ REFLECT LIVE VALUES INTO ATTRIBUTES BEFORE SERIALISING.
       innerHTML writes attributes, not properties, and the kit editor builds
       its rows with createElement + \`.value =\` — so the mockup showed every
       kit NAME as an empty placeholder while the real screen shows "1a
       equipació". A mockup that under-reports is worse than no mockup: it
       invites a fix for a bug that is not there. */
    host.querySelectorAll('input').forEach((el) => {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) el.setAttribute('checked', ''); else el.removeAttribute('checked');
      } else if (el.value !== '') {
        el.setAttribute('value', el.value);
      }
    });
    host.querySelectorAll('select').forEach((sel) => {
      Array.prototype.forEach.call(sel.options, (o) => {
        if (o.selected) o.setAttribute('selected', ''); else o.removeAttribute('selected');
      });
    });
    return host.innerHTML;
  `);
  return fn(...Object.values(api));
}

/* One frame per tab. Only the active panel is VISIBLE, so a single frame
   would show one seventh of the page — and the six sections that carry the
   actual controls are the ones a string assertion can say least about. */
const TABS = [
  ['club', 'pestanya Club'],
  ['cats', 'pestanya Categories'],
  ['horaris', 'pestanya Horaris i avisos'],
  ['kits', 'pestanya Equipacions'],
  ['llistes', 'pestanya Llistes'],
  ['temporades', 'pestanya Temporades']
];
main();

async function main() {
const frames = [];
for (const [tab, label] of TABS) frames.push([label, await render({ tab })]);
const lead = frames[0][1];
const superadmin = await render({ session: { isAdmin: true }, tab: 'clubs' });
/* The Club tab as the SUPERADMIN sees it — the only place the crest editor
   is rendered, so without this frame that control is never looked at. */
const superClub = await render({ session: { isAdmin: true }, tab: 'club' });
assert.ok(/cfg-crest-edit/.test(superClub), 'the crest editor is missing for the superadmin');

/* The rules this page exists to enforce, asserted here too so the mockup can
   never be the artefact that quietly shows the wrong thing. */
assert.ok(/data-cfg-panel="horaris"/.test(lead), 'the horaris panel is missing');
/* EVERY panel must be present, not just the active one — an absent section
   reads as empty to _handleSaveTeamSetup and a save would wipe it. */
['club', 'cats', 'horaris', 'kits', 'llistes', 'temporades'].forEach((p) => {
  assert.ok(lead.includes('data-cfg-panel="' + p + '"'), 'panel not rendered: ' + p);
});
assert.ok(!lead.includes('data-cfg-panel="clubs"'),
    'a plain lead can see the superadmin clubs panel');
assert.ok(superadmin.includes('data-cfg-panel="clubs"'),
    'the superadmin cannot see the clubs panel');
/* The sections are MOUNTED, not empty shells. This is the whole reason this
   builder runs a DOM: the string alone contains the containers either way. */
assert.ok(/ts-cat-row/.test(lead), 'the categories section did not mount');
assert.ok(/data-fcf-key/.test(lead), 'the FCF section did not mount');
assert.ok(/data-train-time/.test(lead), 'the schedules section did not mount');
assert.ok(/data-staff-email/.test(lead), 'the staff lists did not mount');
assert.ok(/ts-kit-block/.test(lead), 'the kit editor did not mount');
assert.strictEqual((lead.match(/ts-kit-block/g) || []).length, 2, 'kit count moved');
/* cadet-A has no session, so the rail must say so in red. */
frames.forEach(([label, h]) => assertNoRawKeys(h, label));
assertNoRawKeys(superadmin, 'superadmin');
assertNoRawKeys(superClub, 'superadmin club tab');
assert.ok(/cfg-dot-bad/.test(lead), 'the rail does not flag the squad with no session');
assert.ok(/Cadet A/.test(lead), 'the rail does not name the squad with no session');
/* The kit names are set as a PROPERTY by the real builder; if the reflection
   step above is ever dropped, this catches it rather than letting the mockup
   quietly show three empty boxes. */
const kitsFrame = frames.filter(([l]) => /Equipacions/.test(l))[0][1];
assert.ok(kitsFrame.includes('1a equipació') && kitsFrame.includes('2a equipació'),
    'the kit names did not survive serialisation — is the value reflection gone?');

const html = `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EsquerrApp — Configuració (v254)</title>
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
  <b>EsquerrApp v254 — Configuració, as the club RESPONSABLE sees it.</b>
  Rendered by the app's real <code>renderConfiguracio()</code> and the real
  <code>_refreshTeamSetup*()</code> builders, against the real CSS. Unlike the
  other mockups this one is <b>mounted in a DOM</b>, because the page is a form:
  the string alone contains empty containers, and only the mount fills them.
  <b>Cadet A deliberately has no session</b> — the rail must flag it in red.
  Generated ${new Date().toISOString().slice(0, 10)}.
</div>
${frames.map(([label, h], i) =>
    `<div class="mock-h">${i + 1} · responsable del club — ${label}</div>\n<div class="mock-shell">${h}</div>`
  ).join('\n')}
<div class="mock-h">${frames.length + 1} · superadmin — la pestanya Club (amb l'editor d'escut)</div>
<div class="mock-shell">${superClub}</div>
<div class="mock-h">${frames.length + 2} · superadmin — la pestanya Clubs · superadmin</div>
<div class="mock-shell">${superadmin}</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
console.log('panels=' + (lead.match(/data-cfg-panel/g) || []).length +
    ' tabs=' + (lead.match(/class="cfg-tab[ "]/g) || []).length +
    ' kits=' + (lead.match(/ts-kit-block/g) || []).length +
    ' staffRows=' + (lead.match(/data-staff-email/g) || []).length +
    ' clubRows=' + (superadmin.match(/club-maxteams-input/g) || []).length);
}
