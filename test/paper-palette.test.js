/* The paper palette — one set of colours for six pages (v228).
 *
 * Calendari, Pla d'entrenament, Plantilla, Registracions, Partit and
 * Convocatòria are one design system, and each of them used to carry its own
 * copy of its colours as raw hexes: 552 literals across six blocks. Changing
 * one meant finding every copy; adding a seventh page meant copying them
 * again. They are now `--pp-*` custom properties.
 *
 * ⚠ THIS SUITE IS THE THING THAT MAKES IT STICK. The refactor itself is
 * invisible — every page renders byte-identically — so nothing about the app
 * misbehaves if the next person pastes `#2D2926` into a new rule. The guard
 * below is the only thing that notices.
 *
 * `npm run test:palette`, or as part of test:unit.
 */
const assert = require('assert');
const {readCss, readCssRaw, palette} = require('./read-css');

const raw = readCssRaw();
const pp = palette(raw);

/* The design system's values, spelled out here rather than read from the
   stylesheet — a test that takes both sides of the comparison from the same
   file asserts nothing. These are the hexes the six handoffs shipped. */
const EXPECTED = {
  'pp-paper': '#FBFAF7', 'pp-desk': '#E9E6E0',
  'pp-ink': '#2D2926', 'pp-ink-2': '#6B645E', 'pp-ink-3': '#99928B',
  'pp-rule': '#E3DFD8', 'pp-rule-2': '#EDEAE4', 'pp-rule-3': '#DED9D1',
  'pp-rule-4': '#C9C3BB',
  'pp-red': '#BD162C', 'pp-red-dark': '#9E1224',
  'pp-green': '#3F6B44', 'pp-amber': '#B07B00', 'pp-tint': '#F6F2E9',
  'pp-ok': '#5C8F5E', 'pp-warn': '#D39A2F', 'pp-bad': '#C0564C',
  /* The dark edge of each availability colour, plus the two greys and the
     input line that go with them (v230, Inici). Each is one shade from a
     token that already existed — warn-dark is not --pp-amber, bad-dark is
     not --pp-med-inj-ink, input-line is not --pp-rule-4 — so they are
     spelled out here for the same reason the rest are. */
  'pp-ok-dark': '#4A7A4C', 'pp-warn-dark': '#B07F1F',
  'pp-neutral': '#8A857F', 'pp-neutral-dark': '#726D67',
  'pp-bad-dark': '#A2443B', 'pp-input-line': '#C2BDB6',
  'pp-ink-4': '#A8A29B',
  'pp-ok-bg': '#EAF1EA', 'pp-ok-line': '#CBDDCB',
  'pp-med-fit-bg': '#DCE9DC', 'pp-med-fit-ink': '#3F6B44',
  'pp-med-doubt-bg': '#F6E4C4', 'pp-med-doubt-ink': '#9A6614',
  'pp-med-inj-bg': '#F2D2CE', 'pp-med-inj-ink': '#A63A32'
};

/** The stylesheet minus comments and minus the block that DEFINES the
    palette — the only two places a literal is still correct. */
function bodyOfStylesheet() {
  const i = raw.indexOf('/* ===== The paper palette =====');
  assert.notStrictEqual(i, -1, 'the palette block is gone');
  const j = raw.indexOf('}', raw.indexOf(':root {', i)) + 1;
  return (raw.slice(0, i) + raw.slice(j)).replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('the paper palette — the tokens themselves', () => {
  it('defines every one, at the value the handoffs shipped', () => {
    Object.keys(EXPECTED).forEach((k) => {
      assert.strictEqual(pp[k], EXPECTED[k], '--' + k + ' moved');
    });
  });

  it('defines nothing else, so the set stays legible', () => {
    assert.deepStrictEqual(Object.keys(pp).sort(), Object.keys(EXPECTED).sort());
  });

  /* One value, two roles: #3F6B44 is the paper green AND the medical "fit"
     ink. The alias keeps the medical trio reading as a trio; if it is ever
     given its own literal, the two will drift apart silently. */
  it('aliases the medical fit ink rather than repeating the green', () => {
    const block = raw.slice(raw.indexOf('--pp-med-fit-ink'));
    assert.ok(/--pp-med-fit-ink:\s*var\(--pp-green\)/.test(block),
        'the medical fit ink is a second literal instead of an alias');
  });
});

describe('the paper palette — nothing carries a copy', () => {
  /* THE GUARD. A new rule pasting `#2D2926` renders identically and is
     invisible in every other way, which is precisely why this exists. */
  it('leaves no palette literal loose in the stylesheet', () => {
    const body = bodyOfStylesheet();
    const loose = [];
    Object.keys(EXPECTED).forEach((k) => {
      const hex = EXPECTED[k];
      const n = (body.match(new RegExp(hex, 'gi')) || []).length;
      if (n) loose.push(hex + ' ×' + n + '  (use var(--' + k + '))');
    });
    /* The app CHROME's own :root is the one exception, and it must be: those
       four are --primary/--danger/--text/--sidebar-bg, a different palette
       that happens to share two values. See the note on the palette block. */
    const allowed = ['#BD162C ×2  (use var(--pp-red))',
      '#2D2926 ×2  (use var(--pp-ink))'];
    assert.deepStrictEqual(loose.sort(), allowed.sort(),
        'a palette colour is hardcoded somewhere it should be a token');
  });

  /* Not caught by the hex scan: #C0564C written as rgba() for an alpha.
     Left as one literal on purpose — a token cannot carry the alpha — but
     recorded here so it is a known exception rather than a missed one. */
  it('has exactly one rgba spelling of a palette colour', () => {
    const n = (bodyOfStylesheet().match(/rgba\(192,\s*86,\s*76/g) || []).length;
    assert.strictEqual(n, 1,
        'a second rgba() copy of --pp-bad appeared; if alpha is needed in ' +
        'more than one place, the palette should carry the rgb triple');
  });
});

describe('the paper palette — how tests read it', () => {
  /* readCss() expands the tokens, so the fifty-odd colour assertions across
     this suite keep testing the COLOUR rather than the token name. A test
     looking for `var(--pp-tint)` would pass with the token pointed at
     anything at all. */
  it('resolves tokens for every other suite', () => {
    const resolved = readCss();
    assert.ok(!/var\(--pp-/.test(resolved), 'a token survived resolution');
    assert.ok(resolved.includes('#F6F2E9'), 'the tint did not resolve');
    assert.ok(resolved.includes('#2D2926'), 'the ink did not resolve');
  });

  it('resolves the alias too, not to another var()', () => {
    assert.strictEqual(pp['pp-med-fit-ink'], '#3F6B44');
  });

  it('leaves the app chrome tokens alone', () => {
    // --primary and friends are a different axis; readCss must not touch them.
    assert.ok(readCss().includes('--primary: #BD162C'));
    assert.ok(readCss().includes('var(--text)'), 'the chrome vars were expanded');
  });
});
