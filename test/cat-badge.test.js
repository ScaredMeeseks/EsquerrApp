/* The category badge beside a player's name.
 *
 * A coach with more than one category sees mixed lists in three different
 * ways, and until now nothing on the row said which category a player was:
 *
 *   1. the "Totes" tab, which switches every filtered page to the whole club
 *   2. lists that are mixed EVEN WHEN filtered — a training session's
 *      `guests` are by definition borrowed from another squad, so
 *      calledPlayers() and the generated teams built from it are mixed
 *      whatever the category bar says
 *   3. renderAdminUsers, which is never filtered at all
 *
 * The badge is a grey, bold, ITALIC capital with no container, because
 * `.conv-team-circle` on the very same row is a circled capital and means a
 * TEAM. A circled letter is a team; a bare italic one is a category. Give
 * this a border or a background and the two become one thing again — which
 * is what the CSS assertions at the bottom exist to prevent.
 *
 * Amateur deliberately has NO letter: it is the senior category, so "no
 * badge" is data in CATEGORY_INITIALS rather than a special case in eleven
 * renderers.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const U = require(path.join(__dirname, '..', 'js', 'utils.js'));
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(
    path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

const P = (category) => ({id: 'p', name: 'X', category: category});

describe('cat badge — the initials map', () => {
  it('covers every category the app knows', () => {
    // A category added to CATEGORY_ORDER and not here would silently lose
    // its badge on every screen, with nothing to notice it.
    U.CATEGORY_ORDER.forEach((k) => {
      assert.ok(k in U.CATEGORY_INITIALS, 'no initial for category: ' + k);
    });
  });

  it('gives amateur NO letter', () => {
    // The spec's load-bearing rule. Amateur is the senior category and the
    // absence of a badge is what identifies it.
    assert.strictEqual(U.CATEGORY_INITIALS.amateur, '');
    assert.strictEqual(U.catBadgeHtmlGlobal(P('amateur'), true), '');
  });

  it('uses the owner\'s letters', () => {
    assert.strictEqual(U.CATEGORY_INITIALS.juvenil, 'J');
    assert.strictEqual(U.CATEGORY_INITIALS.cadet, 'C');
    assert.strictEqual(U.CATEGORY_INITIALS.infantil, 'I');
    assert.strictEqual(U.CATEGORY_INITIALS.alevi, 'A');
    assert.strictEqual(U.CATEGORY_INITIALS.benjami, 'B');
  });

  it('never emits a letter for an unknown category', () => {
    assert.strictEqual(U.catBadgeHtmlGlobal(P('sub23'), true), '');
    assert.strictEqual(U.catBadgeHtmlGlobal({}, true), '');
    assert.strictEqual(U.catBadgeHtmlGlobal(null, true), '');
  });
});

describe('cat badge — when it shows', () => {
  it('stays hidden while the list holds one category', () => {
    assert.strictEqual(U.catSpanOf([P('juvenil'), P('juvenil')]), false);
    assert.strictEqual(U.catBadgeHtmlGlobal(P('juvenil'), false), '');
  });

  it('appears as soon as two categories are on screen', () => {
    assert.strictEqual(U.catSpanOf([P('amateur'), P('juvenil')]), true);
    assert.strictEqual(U.catBadgeHtmlGlobal(P('juvenil'), true),
        '<span class="cat-badge">J</span>');
  });

  it('ignores rows carrying no category at all', () => {
    /* Staff, the lead and legacy uncategorised members appear in
       renderAdminUsers. Counting "no category" as a category of its own
       would badge an entirely amateur club because one row was blank. */
    assert.strictEqual(U.catSpanOf([P('amateur'), P(''), {id: 'x'}]), false);
    assert.strictEqual(U.catSpanOf([]), false);
    assert.strictEqual(U.catSpanOf(null), false);
  });

  it('is decided by the RENDERED list, not by what the coach may see', () => {
    /* The whole point of catSpanOf taking rows. A lead of a two-category
       club who has filtered to juvenil is looking at a one-category list and
       must see no badges — getVisibleCategories() would say 2 and badge
       every row on a screen where the letters carry no information. */
    const filtered = [P('juvenil'), P('juvenil'), P('juvenil')];
    assert.strictEqual(U.catSpanOf(filtered), false);
  });
});

describe('cat badge — every mixed player row carries it', () => {
  /* The negative that makes this suite worth having: before the change,
     twelve player rows emitted a team circle and no badge. */
  const PLAYER_ROW = /conv-team-circle">' \+ sanitize\(p\.team\)|conv-team-circle">\$\{sanitize\(p\.team\)\}|conv-team-circle">\$\{sanitize\(pTeam\)\}/;

  it('leaves the MATCH team letter alone', () => {
    /* Some sites render a circled letter for a MATCH's team, not a
       player's. A category badge there would be meaningless: a match has no
       player to categorise.

       There were five when this was written. The calendar replaced the
       Calendari table, the Jornada list and the training list with one
       page, taking three; the 2a week strips then moved the squad letter
       into the match block's meta line ("Camp Municipal · Squad A"),
       taking a fourth. `matchLabel` is the one left.

       The floor is only here to catch the regex matching NOTHING — a count
       that quietly fell to zero would make every assertion below vacuous.
       It is not a number worth defending in itself. */
    const matchRows = (src.match(/.*conv-team-circle.*/g) || [])
        .filter((l) => /isOurTeam\(|m\.team/.test(l));
    assert.ok(matchRows.length >= 1,
        'expected the match-row sites to still exist');
    matchRows.forEach((l) => {
      assert.ok(!/catBadge/.test(l),
        'a match team letter must not carry a category badge: ' + l.trim());
    });
  });

  it('routes every badge through the helper', () => {
    // No renderer may index CATEGORY_INITIALS itself; the amateur-is-blank
    // rule lives in exactly one place.
    assert.strictEqual((src.match(/CATEGORY_INITIALS\[/g) || []).length, 0,
        'a renderer is building the badge by hand');
  });

  it('keeps _ntPlayerRow on its own, better marker', () => {
    /* _ntPlayerRow already shows `nt-cat-tag`, which answers a strictly more
       useful question than the span badge: "this player is a guest relative
       to THIS session's category". In the club-wide picker a 'J' on a
       juvenil player in a juvenil session is pure noise. One marker per row,
       and the more informative one wins — so this site is deliberately NOT
       part of the rollout. */
    const i = src.indexOf('function _ntPlayerRow');
    const body = src.slice(i, src.indexOf('\n  function ', i + 10));
    assert.ok(/nt-cat-tag/.test(body), 'the guest tag is the marker here');
    assert.ok(!/catBadgeHtmlGlobal/.test(body),
        '_ntPlayerRow would then carry two category markers');
  });

  it('computes the span once per render, never per row', () => {
    /* catSpanOf inside a .map() is O(n²) and, worse, would be computed over
       whatever array is in scope at that point — which in renderConvocatoria
       is one PANE, so the two columns could disagree. */
    const lines = src.match(/.*catSpanOf\(.*/g) || [];
    assert.ok(lines.length >= 6, 'expected the span at every mixed surface');
    lines.forEach((l) => {
      assert.ok(!/\.map\(|=>.*catSpanOf/.test(l),
        'span computed inside a row loop: ' + l.trim());
    });
  });
});

describe('cat badge — the CSS keeps it distinct from a team letter', () => {
  function rule(selector) {
    const i = css.indexOf(selector + ' {');
    assert.notStrictEqual(i, -1, 'no CSS rule for ' + selector);
    return css.slice(i, css.indexOf('}', i));
  }

  it('is italic and bold, as specified', () => {
    const r = rule('.cat-badge');
    assert.ok(/font-style:\s*italic/.test(r), 'the badge must be italic');
    assert.ok(/font-weight:\s*700/.test(r), 'the badge must be bold');
  });

  it('is grey, not a colour of its own', () => {
    assert.ok(/color:\s*var\(--text-secondary\)/.test(rule('.cat-badge')));
  });

  it('is NOT a circle, pill or box — the whole point', () => {
    /* .conv-team-circle immediately above it in style.css is a 22px filled
       circle meaning a TEAM. Anything that gives the category letter a
       background, border or radius makes two different things look alike. */
    const r = rule('.cat-badge');
    assert.ok(!/border-radius/.test(r), 'a rounded badge reads as a team circle');
    assert.ok(!/background/.test(r), 'a filled badge reads as a team circle');
    assert.ok(!/border:/.test(r), 'a bordered badge reads as a team circle');
  });

  it('still leaves the team circle a circle', () => {
    assert.ok(/border-radius:\s*50%/.test(rule('.conv-team-circle')));
  });
});
