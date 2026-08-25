/* The camera presets, read out of js/board3d.js.
 *
 * Not a copy. Two test files had their own hardcoded transcription of
 * the PRESETS table, which is fine right up to the moment board3d
 * changes one — then the tests keep measuring the old camera and
 * report the new one as correct. That is how the overlay drift
 * survived: overlay-align.test.js pinned `phi = 0.001` by hand, so it
 * could never have noticed the value being wrong.
 *
 * The table is a plain object literal whose only dependency is Math,
 * so it evaluates directly.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

function readPresets() {
  const i = SRC.indexOf('const PRESETS = {');
  assert.ok(i !== -1, 'PRESETS not found in js/board3d.js');
  const open = SRC.indexOf('{', i);
  /* Brace-matched rather than bounded by a character count or by the
     next `};` — the table carries a long comment block that has moved
     twice already. */
  let depth = 0, end = -1;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  assert.ok(end !== -1, 'PRESETS braces are unbalanced');
  const table = new Function('return ' + SRC.slice(open, end))();

  ['broadcast', 'top', 'goal', 'side'].forEach((k) => {
    assert.ok(table[k] && typeof table[k].theta === 'number' &&
              typeof table[k].phi === 'number',
        'preset ' + k + ' is missing or malformed');
  });
  return table;
}

module.exports = {SRC, readPresets};
