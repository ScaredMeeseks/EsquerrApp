/* Build a standalone visual check of the pitch markings.
 *
 * `node test/make-pitch-preview.js` writes pitch-preview.html at the
 * repo root. It is gitignored by the -preview.html rule the APK build
 * already excludes (scripts/build-www.js DENY_PATTERN), so it cannot
 * ship by accident.
 *
 * The point is that it uses the REAL things: the real board-geom
 * module, the real tbMarkingsHtml sliced out of app.js, and the real
 * css/style.css. A hand-written mock-up of the same board would prove
 * nothing about the board.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const BG = require(path.join(ROOT, 'js', 'board-geom.js'));

const i = appSrc.indexOf('  function tbMarkingsHtml(');
const j = appSrc.indexOf('  function renderReadOnlyBoard(');
if (i < 0 || j < 0) throw new Error('markers not found in app.js');
const api = new Function('BG',
    appSrc.slice(i, j) +
    '\n; return {tbMarkingsHtml, tbFieldInnerStyle, tbFieldOuterStyle};')(BG);

/* Each case names what it is FOR, so a wrong one is identifiable
   rather than just "one of them looks odd". */
const CASES = [
  ['Futbol 11 · 105 × 68 · horizontal', null, 'full', false],
  ['Futbol 11 · 105 × 68 · vertical', null, 'full', true],
  ['Half pitch · horizontal', null, 'half', false],
  ['Area · horizontal', null, 'area', false],
  ['RESIZED 60 × 45 · same f11 markings', [60, 45, 'f11'], 'full', false],
  ['RESIZED 130 × 90 · same f11 markings', [130, 90, 'f11'], 'full', false],
  ['Futbol 7 preset · 60 × 40', [60, 40, 'f7'], 'full', false],
  ['Futbol 9 preset · 75 × 50', [75, 50, 'f9'], 'full', false],
  ['Half pitch · vertical (CSS-rotated)', null, 'half', true],
  ['Area · vertical (CSS-rotated)', null, 'area', true]
];

const board = ([label, pitch, bt, vert]) => {
  const p = BG.pitchOf(pitch);
  let cls = 'tb-field';
  if (bt === 'half') cls += ' tb-half';
  else if (bt === 'area') cls += ' tb-area';
  if (vert) cls += ' tb-vertical';
  return `<figure>
    <figcaption>${label}<br><small>${p.L} × ${p.W} m · ${p.fmt} · aspect ${BG.aspectPct(pitch, bt, vert)}%</small></figcaption>
    <div class="${cls}" style="${api.tbFieldOuterStyle(pitch, bt, vert)}">
      <div class="tb-field-inner" style="${api.tbFieldInnerStyle(pitch, bt, vert)}">
        ${api.tbMarkingsHtml(pitch, bt, vert)}
      </div>
    </div>
  </figure>`;
};

const html = `<!doctype html>
<meta charset="utf-8">
<title>Pitch markings preview</title>
<style>
${css}
body { font-family: system-ui, sans-serif; margin: 2rem; background:#11151a; color:#e8eaed; }
h1 { font-size:1.1rem; font-weight:600; }
p.note { color:#9aa4b2; max-width:60ch; line-height:1.5; font-size:.9rem; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(420px,1fr)); gap:2.5rem; margin-top:2rem; }
figure { margin:0; }
figcaption { font-size:.85rem; margin-bottom:.6rem; color:#c8cdd4; }
figcaption small { color:#7d8794; }
.tb-field { margin-bottom:0 !important; }
</style>
<h1>Pitch markings — generated from js/board-geom.js</h1>
<p class="note">
  What to check: the penalty area, goal area, centre circle and penalty spot must be the
  <strong>same real size</strong> on every board below, however big or small the pitch is —
  they should take up more of a small pitch and less of a large one. The two RESIZED boards
  are the test: same f11 markings, different perimeter.
</p>
<p class="note">
  These are slightly larger than the old board on purpose. The previous CSS used approximations —
  a 14% penalty area is 14.7 m where the Laws say 16.5 m, and the centre circle was 14.7 m across
  against a real 18.3 m.
</p>
<div class="grid">${CASES.map(board).join('')}</div>
`;

const out = path.join(ROOT, 'pitch-preview.html');
fs.writeFileSync(out, html);
console.log('wrote', out);
