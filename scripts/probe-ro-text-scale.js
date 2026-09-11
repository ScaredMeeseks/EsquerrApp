/* What a resized / 3D-authored TEXT LABEL actually does in a read-only board.
 *
 * ⚠ A MEASUREMENT, NOT A MOCKUP. Reading the source produced two plausible and
 * contradictory answers — the box is too big, or the font is too small — and
 * both turned out to be true at once. This renders the REAL
 * renderReadOnlyBoard and the REAL scaleRoField against the real CSS in
 * headless Chrome, at a catalogue card's width and at a session panel's, and
 * reads the computed font size and box back out.
 *
 * Findings are written up under v258 in CONTEXT.md. Kept in the repo because
 * the bug is NOT fixed yet and this is what will tell us when it is.
 *
 *   node scripts/probe-ro-text-scale.js .        # writes probe-text.html
 *   node scripts/probe-ro-text-run.js            # drives it, prints the table
 *
 * Writes into the OS temp directory, never into the repo — it is a diagnostic,
 * not an artefact anything ships.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const OUTDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ro-text-probe-'));
const app = fs.readFileSync(ROOT + '/js/app.js', 'utf8');
const css = fs.readFileSync(ROOT + '/css/style.css', 'utf8');
const geom = fs.readFileSync(ROOT + '/js/board-geom.js', 'utf8');
const utils = fs.readFileSync(ROOT + '/js/utils.js', 'utf8');

function grab(from, to) {
  const i = app.indexOf(from);
  const j = app.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found: ' + from);
  return app.slice(i, j);
}

const parts = [
  grab('  function _roRemember(bid, board) {', '\n  function tbMarkingsHtml'),
  grab('  function tbMarkingsHtml(pitch, boardType, vertical) {', '\n  function tbCan3D'),
  grab('  function tbFieldInnerStyle(pitch, boardType, vertical) {', '\n  /**'),
  grab('  function tbFieldWidthPx(pitch, boardType, vertical) {', '\n  /**'),
  grab('  function renderReadOnlyBoard(b, prefix, thin, key) {',
      '\n  /**\n   * Turn a session'),
  grab('  function scaleRoBoards() {', "\n  /* ── One match's result")
].join('\n');

/* One text label the coach RESIZED — width/height in editor pixels — and one
   they only set a font size on. Both are shapes the editor stores today. */
const BOARD = {
  name: 'probe', boardType: 'full',
  positions: [[50, 80], [30, 50], [70, 50]],
  numbers: ['1', '4', '9'],
  texts: [
    // resized: 300 x 96 px, authored font 20px
    [50, 30, 'Variant 1: no canvia la disposicio de l equip', '#2D2926', 0.85, 300, 96, 20],
    // never resized, authored font 20px
    [50, 65, 'nomes font-size', '#BD162C', 0.85, null, null, 20],
    // untouched: the default
    [20, 90, 'per defecte', '#3F6B44', 0.85, null, null, null]
  ]
};

const page = `<!doctype html><meta charset="utf-8">
<style>${css}</style>
<style>
  body { margin:0; background:#FBFAF7; }
  /* The catalogue card, at the width the grid gives it. */
  #card { width:250px; border:1px solid #E3DFD8; background:#fff; }
  .ab-thumb > div { margin-bottom:0 !important; }
  .ab-thumb > div > div:first-child { display:none !important; }
  #wide { width:820px; margin-top:20px; border:1px solid #E3DFD8; background:#fff; }
</style>
<div id="card"><div class="ab-thumb" id="slotA"></div></div>
<div id="wide"><div class="ab-thumb" id="slotB"></div></div>
<script>${geom}</script>
<script>${utils}</script>
<script>
window.__probe = (function () {
  /* board-geom.js sets self.BG; utils.js declares fillCss/textColorFor as
     top-level globals. Both are already in scope here. */
  const sanitize = (v) => String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const t = (k) => k;
  const tbCan3D = () => false;
  const hexToRgba = (h, a) => {
    const x = String(h).replace('#','');
    return 'rgba(' + parseInt(x.slice(0,2),16) + ',' + parseInt(x.slice(2,4),16) +
      ',' + parseInt(x.slice(4,6),16) + ',' + a + ')';
  };
  let _roBoardIdx = 0;
  const _roBoards = {};
  ${parts}
  return function (board) {
    document.getElementById('slotA').innerHTML = renderReadOnlyBoard(board, 'p-');
    document.getElementById('slotB').innerHTML = renderReadOnlyBoard(board, 'q-');
    scaleRoBoards();
    const out = [];
    ['slotA','slotB'].forEach(function (id) {
      const host = document.getElementById(id);
      const inner = host.querySelector('.tb-field-inner');
      const row = { slot: id,
        fieldW: host.querySelector('.tb-field-readonly').offsetWidth,
        innerW: inner ? inner.offsetWidth : 0,
        labels: [] };
      host.querySelectorAll('.tb-text-label').forEach(function (el) {
        const cs = getComputedStyle(el);
        row.labels.push({
          text: el.textContent.slice(0, 18),
          fontPx: cs.fontSize,
          boxW: Math.round(el.getBoundingClientRect().width),
          boxH: Math.round(el.getBoundingClientRect().height),
          inlineW: el.style.width || '(auto)',
          inlineFs: el.style.fontSize || '(none)'
        });
      });
      out.push(row);
    });
    return out;
  };
})();
</script>`;

const OUT = path.join(OUTDIR, 'probe-text.html');
fs.writeFileSync(OUT, page, 'utf8');
fs.writeFileSync(path.join(OUTDIR, 'probe-board.json'), JSON.stringify(BOARD), 'utf8');
console.log(OUTDIR);
