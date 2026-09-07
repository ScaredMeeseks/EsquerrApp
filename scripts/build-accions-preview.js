/* Build a self-contained mockup of ACCIONS, the player's task inbox (v245).
 *
 * The whole page is the app: `renderPlayerActions` and its `.ac-` builders are
 * sliced out of js/app.js with the same grab() convention test/accions.test.js
 * uses, and CALLED. The suite asserts on the HTML string, and a string cannot
 * tell you that the ten-cell RPE strip wraps at 1440 or that the phone's
 * wheel and its Desa button are different heights.
 *
 * Three frames: work to do, everything answered, and a row inside its edit
 * window showing `Canviar` — the last is the one nobody thinks to look at.
 *
 * Run from the repo root:
 *
 *   node scripts/build-accions-preview.js . accions-preview.html
 *
 * REGENERATED, never hand-edited. The `-preview.html` suffix is load-bearing
 * for scripts/build-www.js, and the NAME must also be in _config.yml, which
 * excludes by name and not by pattern.
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

/* Frozen so the frames do not change shape between runs. Two days after the
   most recent session, which is what puts one row inside its edit window and
   one outside it. */
const NOW = new Date(2026, 8, 2, 18, 30);   // dc 2 setembre 2026
const iso = (d) => U.localDateStr(d);
const back = (n) => { const d = new Date(NOW); d.setDate(d.getDate() - n); return d; };

const SESSION = { id: 'p1', name: 'Marc Rovira' };

const TRAININGS = [
  { id: 't1', date: iso(back(2)), time: '19:30', endTime: '21:00', focus: 'Sessió de força',
    location: 'Camp Municipal', category: 'amateur', teams: ['A'] },
  /* ⚠ back(1), not back(0). A session that has not ENDED is not on this page
     at all — you cannot rate an exertion you are still in the middle of — so a
     fixture dated today at 21:15 renders nothing and looks like a broken edit
     window rather than a correctly-closed one. */
  { id: 't2', date: iso(back(1)), time: '20:00', endTime: '21:15', focus: 'Sessió tàctica',
    location: 'Joc de posició', category: 'amateur', teams: ['A'] },
  { id: 't3', date: iso(back(6)), time: '19:30', endTime: '21:00', focus: 'Sessió de resistència',
    location: 'Camp Municipal', category: 'amateur', teams: ['A'] },
];
const MATCHES = [
  { id: 'm1', date: iso(back(1)), time: '12:15', home: 'CF Vilassar de Mar',
    away: 'CE L\'Esquerra', team: 'A', category: 'amateur' },
];

/* t2 answered today — inside the window, so it shows `Canviar`.
   t3 answered six days ago — outside it, so it is gone from the page. */
const RPE = {
  p1_training_t2: { rpe: 7, minutes: 75, ua: 525, tag: 'training', date: iso(back(1)), sessionId: 't2' },
  p1_training_t3: { rpe: 5, minutes: 90, ua: 450, tag: 'training', date: iso(back(6)), sessionId: 't3' },
  p1_extra_1: { rpe: 6, minutes: 55, ua: 330, tag: 'gym', date: iso(back(2)) },
  p1_extra_2: { rpe: 5, minutes: 40, ua: 200, tag: 'run', date: iso(back(4)) },
  p1_extra_3: { rpe: 7, minutes: 60, ua: 420, tag: 'gym', date: iso(back(6)) },
};

/* The Catalan the page renders, read out of js/app.js rather than retyped so
   the mockup cannot show wording the app does not have. */
const CA = {};
function harvest(from, to, re) {
  const block = grab(from, to);
  let m;
  while ((m = re.exec(block))) CA[m[1]] = m[2].replace(/\\'/g, "'");
}
harvest("    // ── Accions, redesigned (v245) ──", "\n    // ── Matches / Matchday ──",
    /'((?:ac|extra)\.[a-z_0-9]+)':\s*\{\s*\n?\s*ca:\s*'((?:[^'\\]|\\.)*)'/g);
assert.ok(Object.keys(CA).length > 25, 'the ac.* strings did not parse: ' + Object.keys(CA).length);
Object.assign(CA, {
  'page.actions': 'Accions',
  'activity.badge_training': 'Entrenament',
  'activity.badge_match': 'Partit',
  'actions.minutes': 'Minuts',
  'actions.extra_training': 'Entrenament extra',
});

const DAYS = ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'];
const DAYS_L = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
const MONTHS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol',
  'agost', 'setembre', 'octubre', 'novembre', 'desembre'];

function stubs(over) {
  const store = { fa_player_rpe: JSON.stringify(RPE), fa_matches: JSON.stringify(MATCHES) };
  return Object.assign({
    localStorage: { getItem: (k) => store[k] || null },
    getSession: () => SESSION,
    getTrainings: () => TRAININGS,
    trainingOnly: (l) => l,
    playerTrainings: (u, l) => l,
    sessionEndsAt: (tr) => new Date(tr.date + 'T' + (tr.endTime || '21:00') + ':00'),
    matchEndsAt: (m) => new Date(m.date + 'T' + m.time + ':00'),
    sessionMinutes: () => 90,
    playerMatchMinutesKnown: () => 78,
    /* The REAL key shapes: an RPE is `uid_training_<sessionId>` and an
       availability answer `uid_<sessionId>`. Getting this wrong in a stub is
       the difference between a page with two pending rows and one with four. */
    readRecord: (blob, uid, sess, kind) =>
      blob[uid + (kind === 'rpe' ? '_training_' : '_') + sess.id],
    recordKey: (uid, sess, kind) =>
      uid + (kind === 'rpe' ? '_training_' : '_') + sess.id,
    isOurTeam: (n) => n === 'CE L\'Esquerra',
    getSeasonWeek: U.getSeasonWeek,
    localDateStr: U.localDateStr,
    ACTION_MINUTES_MAX: 300,
    MATCH_MINUTES_MAX: 100,
    avatarHtmlGlobal: () => '',
    sanitize: esc,
    t: (k) => (k in CA ? CA[k] : k),
    tv: (k, vars) => String(k in CA ? CA[k] : k)
        .replace(/\{(\w+)\}/g, (m, n) => (n in vars ? String(vars[n]) : m)),
    tDayShort: (i) => DAYS[i],
    tDayDDMM: (d) => { const p = String(d).split('-'); return p[2] + '/' + p[1]; },
    tDateLong: (d) => {
      const dt = new Date(d + 'T12:00:00');
      return DAYS_L[dt.getDay()] + ' ' + dt.getDate() + ' de ' + MONTHS[dt.getMonth()];
    },
  }, over || {});
}

function render(over) {
  const api = stubs(over);
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(api), `
    ${grab('  /* ── Accions, redesigned (v245) ──', '  // #endregion Player Pages & Actions')}
    /* Freeze the clock. ⚠ EVERY ARGUMENT HAS TO BE FORWARDED: rpeEditableUntil
       builds its boundary with \`new Date(y, m, d)\`, and a shim that only
       passed the first one turned that into \`new Date(2026)\` — 2.026 seconds
       after the epoch. Every edit window then closed in 1970 and the page
       rendered no answered rows at all, which read as the window being broken
       rather than the harness. */
    const _now = new Date(${NOW.getTime()});
    const _real = Date;
    Date = function (...a) { return a.length ? new _real(...a) : new _real(_now.getTime()); };
    Date.prototype = _real.prototype; Date.now = () => _now.getTime();
    Date.parse = _real.parse; Date.UTC = _real.UTC;
    try {
      /* The page, and — separately — one row in the state \`Canviar\` puts it
         in: the strip re-opened with the saved value already chosen.
         ⚠ THE PAGE ALONE NEVER SHOWS A CHOSEN CELL. Every pending row starts
         at null and every answered one collapses to a figure, so the whole
         selected-cell treatment was invisible in this mockup — which is how a
         specificity bug that greyed out the chosen value survived a look at
         it. Rendering the mid-edit row is the only way to see it. */
      const rows = playerActionModel(getSession(), new Date()).rows;
      const answered = rows.filter(function (r) { return r.rpe != null; });
      return { page: renderPlayerActions(),
               editing: answered.map(function (r) { return acRowHtml(r, true); }).join('') };
    } finally { Date = _real; }
  `)(...Object.values(api));
}

const busyR = render();
const busy = busyR.page;
const editing = busyR.editing;
const clearR = render({
  localStorage: { getItem: (k) => (k === 'fa_player_rpe'
    ? JSON.stringify(Object.assign({}, RPE, {
      p1_training_t1: { rpe: 6, minutes: 90, ua: 540, tag: 'training', date: iso(back(2)), sessionId: 't1' },
      p1_match_m1: { rpe: 8, minutes: 78, ua: 624, tag: 'match', date: iso(back(1)) },
    }))
    : JSON.stringify(MATCHES)) },
});
const clear = clearR.page;

/* The mockup asserts the two rules the page exists to enforce, so it can
   never be the artefact that quietly shows the wrong thing. */
assert.ok(/ac-row-done/.test(busy),
    'the edit window never renders — no answered row is inside it');
assert.ok(!/mavail-btn|avail-btn/.test(busy),
    'an availability control is back on Accions; it belongs on Inici');
assert.ok(!busy.includes('Sessió de resistència'),
    'a session outside its edit window is still on the page');
/* ⚠ The chosen cell must be FILLED, not merely bordered. v245 shipped it dim:
   `.ac-strip-set .ac-cell` is (0,2,0) and outranked both `.ac-cell-on` and the
   ramp class, so every cell including the chosen one came out grey. */
assert.ok(/ac-cell-on ac-band-\w+/.test(editing),
    'the re-opened strip carries no chosen cell at all');

const html = `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EsquerrApp — Accions (v245)</title>
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
  <b>EsquerrApp v246 — Accions, as a PLAYER sees it.</b>
  Rendered by the app's real <code>renderPlayerActions()</code> and its real CSS;
  only the grey shell stands in for the dashboard. Availability is <b>not</b>
  here any more — Inici owns it. The last row is inside its RPE edit window
  (until 23:59 the day after) and so carries <b>Canviar</b>; a session from six
  days ago is gone. Clock frozen at 2 Sep 2026.
  Generated ${new Date().toISOString().slice(0, 10)}.
</div>
<div class="mock-h">1 · dues coses per fer, i una encara editable</div>
<div class="mock-shell">${busy}</div>
<div class="mock-h">2 · tot desat</div>
<div class="mock-shell">${clear}</div>
<div class="mock-h">3 · una fila després de prémer «Canviar» — el valor triat, omplert</div>
<div class="mock-shell">${editing}</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
console.log('rows=' + (busy.match(/class="ac-row/g) || []).length +
    ' answered=' + (busy.match(/ac-row-done/g) || []).length +
    ' extras=' + (busy.match(/class="ac-ex-row"/g) || []).length);
