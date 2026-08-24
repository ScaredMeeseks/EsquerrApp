/* Build a standalone visual check of the pitch markings.
 *
 * `node test/make-pitch-preview.js` writes pitch-preview.html at the
 * repo root. The `-preview.html` suffix is what scripts/build-www.js
 * already excludes from the APK, so it cannot ship by accident.
 *
 * The point is that it uses the REAL things: the real board-geom
 * module, the real tbMarkingsHtml sliced out of app.js, and the real
 * pitch rules lifted from css/style.css. A hand-written mock-up of the
 * same board would prove nothing about the board.
 *
 * Only the PITCH rules are pulled in — not the editor chrome — so the
 * page stays small enough to open anywhere and the app's own layout
 * cannot fight the page around it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const BG = require(path.join(ROOT, 'js', 'board-geom.js'));

/* The selectors that draw a pitch. Everything else in style.css is
   toolbar, tag list, saved-board rows — irrelevant here and 36 KB of
   noise if included.

   COMMENTS ARE STRIPPED FIRST, and that is not tidiness. Without it,
   the chunk for a rule preceded by a comment begins with the comment
   text, the `^\s*\.tb-` anchor never matches, and the rule is dropped.
   `.tb-field` is preceded by `/* Horizontal football field *␘/`, so
   the one rule carrying the pitch's green background, its white
   perimeter border and its overflow:hidden was silently missing —
   producing a preview of pitches with no surface, no touchlines and
   no clipping, none of which was true of the app. A preview that
   lies is worse than no preview. */
const PITCH_SEL = /^\s*\.tb-(field|halfway|center-|penalty-|goal-|corner|vertical|half|area)/;
const noComments = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '');
const pitchCss = (noComments.match(/[^{}]+\{[^{}]*\}/g) || [])
    .filter((r) => r.split('{')[0].split(',').some((s) => PITCH_SEL.test(s)))
    .join('\n');
if (!/\.tb-field\s*\{[^}]*border\s*:/.test(pitchCss)) {
  throw new Error('extraction lost .tb-field — the perimeter would be missing');
}

const i = appSrc.indexOf('  function tbMarkingsHtml(');
const j = appSrc.indexOf('  function renderReadOnlyBoard(');
if (i < 0 || j < 0) throw new Error('markers not found in app.js');
const api = new Function('BG',
    appSrc.slice(i, j) +
    '\n; return {tbMarkingsHtml, tbFieldInnerStyle, tbFieldOuterStyle};')(BG);

/* Each plate names what it is FOR, so a wrong one is identifiable
   rather than just "one of them looks odd". `note` is the thing to
   look at; `flag` marks the two that are the actual test. */
const PLATES = [
  {label: 'Futbol 11, horizontal', pitch: null, bt: 'full', vert: false,
    note: 'The default. Every board saved before this change resolves to exactly this.'},
  {label: 'Futbol 11, vertical', pitch: null, bt: 'full', vert: true,
    note: 'Markings rotated in JS, by the same rule the players rotate by.'},
  {label: 'Resized to 60 &times; 45', pitch: [60, 45], bt: 'full', vert: false,
    flag: true,
    note: 'Same markings on a smaller pitch. The box must stay 16.5 m deep and therefore look bigger.'},
  {label: 'Resized to 130 &times; 90', pitch: [130, 90], bt: 'full', vert: false,
    flag: true,
    note: 'Same markings again. Here the box must look smaller. Compare with the plate before this one.'},
  {label: 'Narrowest allowed', pitch: [90, 42.32], bt: 'full', vert: false,
    note: 'The clamp: a pitch cannot be narrower than the 40.32 m penalty area it has to contain.'},
  {label: 'Long and narrow', pitch: [120, 50], bt: 'full', vert: false,
    note: 'Marks unchanged again — only the perimeter moved.'},
  {label: 'Half pitch', pitch: null, bt: 'half', vert: false,
    note: 'One attacking box, two corners. Wider than tall at 77% &mdash; which is what the old CSS hardcoded.'},
  {label: 'Area only', pitch: null, bt: 'area', vert: false,
    note: 'Full pitch width, so both corners are on it — corners and crossing are what this board is for. Depth is the final third.'},
  {label: 'Half pitch, vertical', pitch: null, bt: 'half', vert: true,
    note: 'Rotated by CSS, not by JS. The margins compensating for the rotation are now computed.'},
  {label: 'Area, vertical', pitch: null, bt: 'area', vert: true,
    note: 'Same, rotated by CSS. This and plate 09 are the ones most likely to be subtly misplaced.'}
];

const plate = (p, n) => {
  const g = BG.pitchOf(p.pitch);
  let cls = 'tb-field';
  if (p.bt === 'half') cls += ' tb-half';
  else if (p.bt === 'area') cls += ' tb-area';
  if (p.vert) cls += ' tb-vertical';
  const m = BG.MARKS;
  return `<figure class="plate${p.flag ? ' plate--test' : ''}">
      <div class="plate__head">
        <span class="plate__no">${String(n + 1).padStart(2, '0')}</span>
        <h2 class="plate__title">${p.label}</h2>
        ${p.flag ? '<span class="plate__tag">the test</span>' : ''}
      </div>
      <div class="plate__stage${p.vert && p.bt !== 'full' ? ' plate__stage--rot' : ''}">
        <div class="${cls}" style="${api.tbFieldOuterStyle(p.pitch, p.bt, p.vert)}">
          <div class="tb-field-inner" style="${api.tbFieldInnerStyle(p.pitch, p.bt, p.vert)}">
            ${api.tbMarkingsHtml(p.pitch, p.bt, p.vert)}
          </div>
        </div>
      </div>
      <dl class="spec">
        <div><dt>Pitch</dt><dd>${g.L} &times; ${g.W} m</dd></div>
        <div><dt>Box</dt><dd>${m.paDepth} &times; ${m.paWidth} m</dd></div>
        <div><dt>Circle</dt><dd>r ${m.circleR} m</dd></div>
        <div><dt>Spot</dt><dd>${m.spot} m</dd></div>
        <div><dt>Corner</dt><dd>r ${m.cornerR} m</dd></div>
        <div><dt>Aspect</dt><dd>${BG.aspectPct(p.pitch, p.bt, p.vert)}%</dd></div>
      </dl>
      <p class="plate__note">${p.note}</p>
    </figure>`;
};

const html = `<title>Regulation Marks</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* ── Tokens. Neutrals are biased green, toward the subject, rather
      than sampled off a pure grey axis. ─────────────────────────── */
:root {
  --turf: #2E7D32;
  --ink: #171C18;
  --paper: #F6F8F4;
  --surface: #FFFFFF;
  --rule: #D6DCD4;
  --muted: #5C6A5E;
  --accent: #C2410C;       /* surveyor's orange: this page measures things */
  --accent-soft: #FDEDE3;
  --shadow: 0 1px 2px rgba(23,28,24,.06), 0 8px 24px rgba(23,28,24,.06);
  --bg: var(--paper);
  --fg: var(--ink);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ink: #E7EBE6;
    --paper: #12160F;
    --surface: #1A1F19;
    --rule: #2C332B;
    --muted: #96A398;
    --accent: #FB923C;
    --accent-soft: #2A1D12;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.3);
    --bg: var(--paper);
    --fg: var(--ink);
  }
}
:root[data-theme="dark"] {
  --ink: #E7EBE6;
  --paper: #12160F;
  --surface: #1A1F19;
  --rule: #2C332B;
  --muted: #96A398;
  --accent: #FB923C;
  --accent-soft: #2A1D12;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.3);
  --bg: var(--paper);
  --fg: var(--ink);
}

*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: Barlow, ui-sans-serif, system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 3.5rem 1.5rem 6rem; }

/* ── Masthead ─────────────────────────────────────────────────── */
.mast { display: grid; gap: 1.25rem; padding-bottom: 2rem; border-bottom: 2px solid var(--fg); }
.eyebrow {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: .72rem; letter-spacing: .14em; text-transform: uppercase;
  color: var(--accent); margin: 0;
}
h1 {
  font-family: 'Barlow Condensed', Barlow, sans-serif;
  font-weight: 600; font-size: clamp(2.6rem, 7vw, 4.2rem);
  line-height: .95; letter-spacing: -.01em; margin: 0;
  text-wrap: balance; text-transform: uppercase;
}
.lede { max-width: 62ch; margin: 0; font-size: 1.05rem; color: var(--muted); }
.lede strong { color: var(--fg); font-weight: 600; }

/* ── The brief: what to actually look at ──────────────────────── */
.brief {
  margin: 2rem 0 0; padding: 1.1rem 1.25rem;
  background: var(--accent-soft); border-left: 3px solid var(--accent);
  border-radius: 0 6px 6px 0;
}
.brief p { margin: 0; max-width: 68ch; }
.brief p + p { margin-top: .6rem; }

/* ── Plates ───────────────────────────────────────────────────── */
.plates {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
  gap: 2.5rem; margin-top: 3rem;
}
@media (max-width: 560px) { .plates { grid-template-columns: 1fr; } }
.plate {
  margin: 0; display: flex; flex-direction: column; gap: .9rem;
  background: var(--surface); border: 1px solid var(--rule);
  border-radius: 10px; padding: 1.25rem; box-shadow: var(--shadow);
}
.plate--test { border-color: var(--accent); }
.plate__head { display: flex; align-items: baseline; gap: .7rem; }
.plate__no {
  font-family: 'IBM Plex Mono', monospace; font-size: .8rem;
  color: var(--accent); font-variant-numeric: tabular-nums;
}
.plate__title {
  font-family: 'Barlow Condensed', Barlow, sans-serif; text-transform: uppercase;
  font-weight: 600; font-size: 1.3rem; letter-spacing: .01em; margin: 0; flex: 1;
}
.plate__tag {
  font-family: 'IBM Plex Mono', monospace; font-size: .65rem;
  letter-spacing: .1em; text-transform: uppercase;
  color: var(--surface); background: var(--accent);
  padding: .18rem .45rem; border-radius: 3px;
}
/* The rotated board types are transformed, which does not change the
   space the layout reserves — the same reason tbFieldOuterStyle
   exists. Give them a stage that will not clip the result. */
.plate__stage { display: flow-root; }
.plate__stage--rot { overflow: hidden; }

.spec {
  display: flex; flex-wrap: wrap; gap: .1rem 1.5rem; margin: 0;
  padding-top: .8rem; border-top: 1px solid var(--rule);
}
.spec > div { display: flex; gap: .4rem; align-items: baseline; }
.spec dt {
  font-size: .7rem; letter-spacing: .08em; text-transform: uppercase;
  color: var(--muted);
}
.spec dd {
  margin: 0; font-family: 'IBM Plex Mono', monospace; font-size: .82rem;
  font-variant-numeric: tabular-nums;
}
.plate__note { margin: 0; font-size: .88rem; color: var(--muted); max-width: 52ch; }

/* ── The real pitch rules, lifted verbatim from css/style.css ──── */
:root { --radius: 8px; }
${pitchCss}
/* The app centres the board in a page column; here each one sits in
   its own plate. */
.tb-field { margin-left: 0; margin-right: 0; max-width: 100%; }
</style>
<div class="wrap">
  <header class="mast">
    <p class="eyebrow">EsquerrApp &middot; tactical board &middot; v136</p>
    <h1>Regulation marks</h1>
    <p class="lede">
      Ten pitches drawn by <strong>js/board-geom.js</strong>, through the real
      <strong>tbMarkingsHtml</strong> sliced out of app.js, styled by the real pitch rules
      from css/style.css. Nothing here is a mock-up.
    </p>
  </header>

  <div class="brief">
    <p>
      <strong>What to check.</strong> The penalty area, goal area, centre circle and penalty spot
      must be the same <em>real</em> size on every f11 plate below, however big the pitch is.
      They should therefore take up <em>more</em> of a small pitch and <em>less</em> of a large one.
      Plates 03 and 04 are that test.
    </p>
    <p>
      <strong>These are slightly larger than the old board, on purpose.</strong> The previous CSS
      used approximations: a 14% penalty area is 14.7 m where the Laws of the Game say 16.5, and
      the centre circle was 14.7 m across against a real 18.3. Existing boards will shift a little.
    </p>
  </div>

  <div class="plates">
    ${PLATES.map(plate).join('\n')}
  </div>
</div>
`;

const out = path.join(ROOT, 'pitch-preview.html');
fs.writeFileSync(out, html);
console.log('wrote', out, '(' + Math.round(html.length / 1024) + ' KB)');
