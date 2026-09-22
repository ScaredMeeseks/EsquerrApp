/* Kit colour swatches — the common colours offered before the full picker.
 *
 * Driven over a real DOM: the swatches work by SETTING a colour input and
 * firing its own events, so the test is whether the code already listening
 * to that input reacts — not whether the source mentions it.
 *
 * `npx mocha kit-swatches.test.js`
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

function load() {
  const dom = new JSDOM('<!DOCTYPE html><body><input type="color" id="c" value="#123456"></body>');
  const win = dom.window;
  const code = grab('  const TB_KIT_COLOURS = [', '  /* Stripe controls for one side');
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  // eslint-disable-next-line no-new-func
  const api = new win.Function('document', 'Event', 'sanitize', 't',
    code + '\nreturn {TB_KIT_COLOURS, tbKitSwatchesEl, tbKitSwatchesFor};')(
    win.document, win.Event, esc, (k) => k);
  return { win, doc: win.document, api };
}

describe('kit colour swatches', () => {
  it('offers the common kit colours, and never the goalkeeper yellow', () => {
    const { api } = load();
    const hexes = api.TB_KIT_COLOURS.map((c) => c[1]);
    ['#ffffff', '#212529', '#e53935', '#fdd835', '#fb8c00', '#43a047', '#1e88e5']
      .forEach((h) => assert.ok(hexes.includes(h), h + ' is missing'));
    // STP_GK_FILL: the bib count reads this exact fill as "a keeper, no bib".
    assert.ok(!hexes.includes('#f5c842'), 'a player picked this yellow would drop out of the bib count');
  });

  it('a tap sets the input and fires the events its listeners wait for', () => {
    const { doc, win, api } = load();
    const input = doc.getElementById('c');
    const heard = [];
    input.addEventListener('input', () => heard.push('input:' + input.value));
    input.addEventListener('change', () => heard.push('change:' + input.value));
    const row = api.tbKitSwatchesFor(input);
    doc.body.insertBefore(row, input);
    const red = row.querySelector('[data-kc="#e53935"]');
    red.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(input.value, '#e53935');
    assert.deepStrictEqual(heard, ['input:#e53935', 'change:#e53935']);
  });

  it('rings the chosen swatch, and un-rings it when the wheel picks something else', () => {
    const { doc, win, api } = load();
    const input = doc.getElementById('c');
    const row = api.tbKitSwatchesFor(input);
    doc.body.appendChild(row);
    const on = () => Array.from(row.querySelectorAll('.tb-prop-sw-on')).map((b) => b.dataset.kc);
    assert.deepStrictEqual(on(), [], 'the starting #123456 is no kit colour');
    row.querySelector('[data-kc="#43a047"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.deepStrictEqual(on(), ['#43a047']);
    input.value = '#abcdef';
    input.dispatchEvent(new win.Event('input'));
    assert.deepStrictEqual(on(), [], 'a colour from the wheel is not a swatch');
  });

  it('every swatch has a readable name', () => {
    const { api } = load();
    const i18n = grab('  var _i18n = {', '\n  function t(key)');
    api.TB_KIT_COLOURS.forEach(([id]) =>
      assert.ok(i18n.indexOf("'kitc." + id + "':") !== -1, 'kitc.' + id + ' has no label'));
  });

  it('the player menu and both team kits ask for them', () => {
    /* The menu and panel are built inside closures no test can mount; these
       pin that the three call sites opt in. */
    assert.strictEqual((src.match(/type: 'color', kit: true/g) || []).length, 2,
        'the single and the multi-select player menus');
    // The squad panel adopts #tb-team-color and #tb-opp-color into its kit
    // slots; the swatches must go in with them, ahead of the picker.
    const slots = grab("    [['#tb-team-color'", '    /* The opponent\'s kit is only meaningful');
    assert.ok(/tbKitSwatchesFor\(col\)/.test(slots), 'the squad panel kit slots');
    assert.ok(slots.indexOf('slot.appendChild(sws)') < slots.indexOf('slot.appendChild(col)'),
        'the swatches come first, the full picker after');
  });
});
