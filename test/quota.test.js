/* Unit tests for the commercial team quota.
 *
 * Pure logic, no emulator: `npm run test:quota`.
 *
 * A "team" is one {category}-{letter} pair counted across every category,
 * so `rosterKeys().length` is the metric. `maxTeams` is what the superadmin
 * sells; a missing field means 1.
 *
 * Two things here are load-bearing and neither is obvious:
 *
 *  1. The quota test is an INCREASE test, not an absolute one. Clubs are
 *     grandfathered onto their existing count, so a club sitting above its
 *     allowance must still be able to save and to remove a team — an
 *     absolute test would lock its lead out of the only screen that can fix
 *     it. The `next=3, prev=3, max=1` case below is that guarantee.
 *  2. `rosterKeys` exists TWICE — js/app.js for the UI and functions/index.js
 *     for enforcement — because functions/ deploys alone and cannot require
 *     ../js at runtime. If the copies drift, the app and the server disagree
 *     about how many teams a club has. The last describe pins them together,
 *     the same idiom test/shard.test.js uses for CATEGORY_ORDER.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const fnSrc = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

function grab(src, from, to, label) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in ' + label + ': ' + from);
  return src.slice(i, j);
}

/** The server's copies, which are the ones that actually enforce. */
const server = (() => {
  const code = grab(fnSrc, 'function rosterKeysOf(categories)',
      'exports.setClubCategories', 'functions/index.js');
  // eslint-disable-next-line no-new-func
  return new Function(`
    const CATEGORY_ORDER = ['amateur','juvenil','cadet','infantil','alevi','benjami'];
    ${code}
    return { rosterKeysOf, maxTeamsOf, exceedsQuota };`)();
})();

const cat = (enabled, letters) => ({ enabled, letters });

describe('quota — counting teams', () => {
  it('counts letters across every enabled category', () => {
    const keys = server.rosterKeysOf({
      amateur: cat(true, ['A', 'B']),
      juvenil: cat(true, ['A']),
    });
    assert.deepStrictEqual(keys, ['amateur-A', 'amateur-B', 'juvenil-A']);
  });

  it('ignores disabled categories however many letters they carry', () => {
    const keys = server.rosterKeysOf({
      amateur: cat(true, ['A']),
      cadet: cat(false, ['A', 'B', 'C']),
    });
    assert.deepStrictEqual(keys, ['amateur-A']);
  });

  it('treats an enabled category with no letters as one team', () => {
    // Both copies fall back to ['A'], so an empty array must not read as
    // zero teams and quietly grant a free slot.
    assert.strictEqual(server.rosterKeysOf({ amateur: cat(true, []) }).length, 1);
  });

  it('is zero for a club with nothing enabled', () => {
    assert.strictEqual(server.rosterKeysOf({}).length, 0);
    assert.strictEqual(server.rosterKeysOf(undefined).length, 0);
  });
});

describe('quota — the allowance', () => {
  [[undefined, 1], [null, 1], [0, 1], [-3, 1], ['not a number', 1],
    [1, 1], [3, 3], ['4', 4], [2.9, 2], [99999, 156]]
      .forEach(([given, want]) => {
        it(`maxTeams ${JSON.stringify(given)} means ${want}`, () => {
          assert.strictEqual(server.maxTeamsOf({ maxTeams: given }), want);
        });
      });

  it('a club document with no maxTeams field means 1', () => {
    assert.strictEqual(server.maxTeamsOf({}), 1);
  });
});

describe('quota — the increase test', () => {
  const cases = [
    // prev, next, max, rejected?, why
    [1, 2, 1, true, 'growing past the allowance'],
    [1, 2, 2, false, 'growing up to the allowance'],
    [1, 1, 1, false, 'saving unchanged at the allowance'],
    [3, 3, 1, false, 'GRANDFATHERED: saving unchanged while over'],
    [3, 2, 1, false, 'GRANDFATHERED: removing a team while over'],
    [3, 4, 1, true, 'growing further while already over'],
    [0, 1, 1, false, 'the first team of a new club'],
    [2, 5, 5, false, 'jumping straight to the allowance'],
  ];
  cases.forEach(([prev, next, max, rejected, why]) => {
    it(`${rejected ? 'rejects' : 'allows'} ${prev}->${next} with max ${max} (${why})`, () => {
      assert.strictEqual(server.exceedsQuota(prev, next, max), rejected);
    });
  });

  it('never blocks a club that is not growing, however far over it is', () => {
    // The property the grandfathering rests on. If this ever fails, lowering
    // a quota locks that club's lead out of the screen that would fix it.
    for (let over = 1; over <= 20; over++) {
      assert.strictEqual(server.exceedsQuota(over, over, 1), false, 'stay at ' + over);
      if (over > 1) {
        assert.strictEqual(server.exceedsQuota(over, over - 1, 1), false, 'shrink from ' + over);
      }
    }
  });
});

describe('quota — client and server agree', () => {
  /** The client's copy, lifted out of js/app.js. */
  const client = (() => {
    const code = grab(appSrc, '  function rosterKeys(cfg, onlyCategory)',
        '\n  /**', 'js/app.js');
    // eslint-disable-next-line no-new-func
    return new Function(`
      const CATEGORY_ORDER = ['amateur','juvenil','cadet','infantil','alevi','benjami'];
      ${code}
      return rosterKeys;`)();
  })();

  const configs = [
    { amateur: cat(true, ['A']) },
    { amateur: cat(true, ['A', 'B']), juvenil: cat(true, ['A']) },
    { amateur: cat(false, ['A', 'B']) },
    { amateur: cat(true, []) },
    { cadet: cat(true, ['A', 'B', 'C']), benjami: cat(true, ['A']) },
    {},
  ];

  configs.forEach((categories, i) => {
    it(`same teams for config ${i}`, () => {
      // The client counts to warn; the server counts to enforce. If they
      // disagree, the app blocks a save the server would allow, or offers
      // one it will refuse.
      assert.deepStrictEqual(
          client({ categories }),
          server.rosterKeysOf(categories));
    });
  });

  it('the client helper clamps maxTeams the same way the server does', () => {
    const code = grab(appSrc, '  function clubMaxTeams()', '\n  /** Teams the club', 'js/app.js');
    [[undefined, 1], [0, 1], [-1, 1], [3, 3], ['4', 4], [2.9, 2]].forEach(([given, want]) => {
      // eslint-disable-next-line no-new-func
      const fn = new Function('_clubConfig', `${code}\nreturn clubMaxTeams();`);
      assert.strictEqual(fn({ maxTeams: given }), want, String(given));
    });
  });
});

describe('quota — a new club can still be set up', () => {
  /* Regression. createClub seeded every category with letters ['A','B'],
     so on a club with maxTeams:1 ticking any category tried to add TWO
     teams, the toggle gate refused it, and the lead was stuck forever on
     the mandatory first-run setup screen unable to enable anything. */
  it('createClub seeds one letter per category, not two', () => {
    const i = appSrc.indexOf('async function createClub');
    const body = appSrc.slice(i, appSrc.indexOf('await clubRef.set(clubData)', i));
    const seeded = body.match(/enabled: false, letters: \[([^\]]*)\]/g) || [];
    assert.strictEqual(seeded.length, 6, 'expected all six categories seeded');
    seeded.forEach((line) => {
      assert.ok(!line.includes("'B'"),
          'a second letter here blocks setup under maxTeams:1: ' + line);
    });
  });

  it('the setup screen shows one letter for a DISABLED category', () => {
    // Clubs created before the fix still carry ['A','B'] in Firestore, so
    // the render has to defend too — not just new clubs.
    assert.ok(appSrc.includes("var letters = (cat.enabled && cat.letters && cat.letters.length) ?"),
        'a disabled category must render a single letter whatever is stored');
  });

  it('one team fits in the default allowance', () => {
    // The arithmetic the whole onboarding path depends on.
    assert.strictEqual(
        server.exceedsQuota(0, server.rosterKeysOf({amateur: cat(true, ['A'])}).length, 1),
        false);
  });
});

describe('team setup — letters never gain a new gap', () => {
  /* _nextLetter used to return the LOWEST unused letter while the chip was
     appended at the END, so removing B from A,B,C and pressing + produced
     `A, C, B` — out of order, and persisted that way. */
  const nextLetter = (() => {
    const code = grab(appSrc, '  function _nextLetter(existing)',
        '\n  function ', 'js/app.js');
    // eslint-disable-next-line no-new-func
    return new Function(`${code}\nreturn _nextLetter;`)();
  })();

  it('appends after the highest letter in use', () => {
    assert.strictEqual(nextLetter(['A']), 'B');
    assert.strictEqual(nextLetter(['A', 'B']), 'C');
  });

  it('does NOT backfill a gap left by deleteTeam', () => {
    // deleteTeam legitimately leaves ['A','C']; renaming a saved team would
    // break {category}-{letter} everywhere it is used as a key.
    assert.strictEqual(nextLetter(['A', 'C']), 'D');
    assert.strictEqual(nextLetter(['B']), 'C');
  });

  it('starts at A for a category with nothing yet', () => {
    assert.strictEqual(nextLetter([]), 'A');
    assert.strictEqual(nextLetter(undefined), 'A');
  });

  it('runs out after Z rather than wrapping', () => {
    assert.strictEqual(nextLetter(['Z']), null);
  });
});

describe('team setup — the duplicate-listener bug', () => {
  /* showTeamSetup() rebinds on every entry, but the containers are static
     nodes whose innerHTML is replaced rather than the node — so listeners
     accumulated. On a second visit one "+" click ran twice: the first added
     the chip, the second saw the new count and fired the limit modal. The
     team WAS added; the error was spurious. */
  it('binds the team-setup handlers once per node', () => {
    assert.ok(appSrc.includes('if (container._tsBound) return;'),
        'the bind-once guard is missing — listeners will accumulate again');
  });

  it('ignores a re-dispatch of the same click on the quota-gated handlers', () => {
    // One physical event delivered to two listeners shares a timeStamp.
    ['addBtn._tsClick === e.timeStamp',
      'e.target._tsChange === e.timeStamp',
      'clickedChip._tsClick === e.timeStamp'].forEach((guard) => {
      assert.ok(appSrc.includes(guard), 'missing re-dispatch guard: ' + guard);
    });
  });
});

describe('team setup — leaving the screen', () => {
  it('is cancellable ONLY from the Settings entry', () => {
    // The over-quota redirect and the no-category wizard must stay
    // inescapable: escaping the first defeats the gate, and behind the
    // second there is no configured club to go back to.
    const calls = appSrc.match(/showTeamSetup\((\{[^)]*\})?\)/g) || [];
    const cancellable = calls.filter((c) => c.includes('cancellable'));
    assert.strictEqual(cancellable.length, 1,
        'exactly one call site may pass cancellable, got: ' + calls.join(' | '));
    // Belt and braces: every OTHER entry passes no options at all, so
    // _tsCancellable is false and the back button stays hidden.
    calls.filter((c) => !c.includes('cancellable')).forEach((c) => {
      assert.strictEqual(c, 'showTeamSetup()',
        'a forced entry passes options and could become escapable: ' + c);
    });
  });

  it('resets cancellability on every entry', () => {
    // deleteTeam re-enters via navigate(); a stale flag would let an
    // over-quota lead walk away.
    assert.ok(appSrc.includes('_tsCancellable = !!(opts && opts.cancellable);'),
        'the flag must be assigned unconditionally at the top of showTeamSetup');
  });

  it('has the back button translated in all three languages', () => {
    ['ts.back', 'ts.add_team'].forEach((key) => {
      const i = appSrc.indexOf("'" + key + "':");
      assert.ok(i !== -1, 'missing key ' + key);
      const line = appSrc.slice(i, appSrc.indexOf('},', i));
      ['ca:', 'es:', 'en:'].forEach((l) =>
        assert.ok(line.includes(l), key + ' missing ' + l));
    });
  });
});

describe('team setup — typed input survives a re-render', () => {
  /* A chip click or a category toggle re-renders the FCF and schedule
     sections. They used to rebuild straight from _clubConfig, throwing away
     anything half-typed; the staff list had always layered the DOM over the
     stored values, and now all three do. */
  it('reads the FCF inputs before rebuilding them', () => {
    assert.ok(appSrc.includes('var typedLinks = _collectFcfFromDom();'));
    assert.ok(appSrc.includes("(linkKey in typedLinks) ? typedLinks[linkKey]"));
  });

  it('reads the schedule inputs before rebuilding them', () => {
    assert.ok(appSrc.includes('var typedSchedules = _collectSchedulesFromDom();'));
    assert.ok(appSrc.includes('typedSchedules[schedKey] || existingSchedules[schedKey]'));
  });

  it('uses ONE schedule reader for both the save and the re-render', () => {
    // Two copies of that shape would drift.
    // Calls only — the `function _collectSchedulesFromDom()` declaration
    // matches the same shape.
    const uses = (appSrc.match(/(?<!function )_collectSchedulesFromDom\(\)/g) || []).length;
    assert.strictEqual(uses, 2, 'expected the refresher and the save path');
  });
});

describe('quota — the over-quota gate', () => {
  /** The client predicate the whole gate hangs off. */
  const overQuota = (() => {
    const code = grab(appSrc, '  function clubMaxTeams()',
        '\n  /* Tell db.js which categories', 'js/app.js');
    // eslint-disable-next-line no-new-func
    return (cfg) => new Function('_clubConfig', 'rosterKeys',
        `${code}\nreturn isClubOverQuota();`)(cfg,
        (c) => ({ length: server.rosterKeysOf(c && c.categories).length }));
  })();

  it('is false at or under the allowance', () => {
    assert.strictEqual(overQuota({
      maxTeams: 2, categories: { amateur: cat(true, ['A', 'B']) },
    }), false);
  });

  it('is true once the allowance is lowered below the count', () => {
    assert.strictEqual(overQuota({
      maxTeams: 1, categories: { amateur: cat(true, ['A', 'B']) },
    }), true);
  });

  it('is true for a multi-team club with no maxTeams at all', () => {
    // Missing means 1 — which is exactly why the grandfathering migration
    // has to run before this gate ships.
    assert.strictEqual(overQuota({
      categories: { amateur: cat(true, ['A', 'B']) },
    }), true);
  });

  it('is false when there is no club loaded', () => {
    assert.strictEqual(overQuota(null), false);
  });

  /* The gate differentiates lead / staff / player, and gets it wrong in a
     different way at each site if the condition drifts. Pinned by source so
     a future edit cannot quietly drop one. */
  it('exempts the superadmin and the lead from the staff sidebar gate', () => {
    // Blocking the lead here would leave nobody able to fix the club.
    assert.ok(appSrc.includes(
        "!(isClubOverQuota() && !session.isAdmin && !session.isTeamLead)"),
    'the sidebar gate must exempt admin and lead');
  });

  it('exempts the superadmin and the lead from the page gate', () => {
    assert.ok(appSrc.includes(
        "if (isClubOverQuota() && !session.isAdmin && !session.isTeamLead &&"),
    'the page gate must exempt admin and lead');
  });

  it('leaves players alone — the gate only covers staff pages', () => {
    // A staff+player member keeps the player section and player-home; a
    // plain player never meets the gate at all.
    const i = appSrc.indexOf('if (isClubOverQuota() && !session.isAdmin');
    const gate = appSrc.slice(i, i + 220);
    assert.ok(gate.includes('STAFF_PAGES.has(currentPage)'),
        'the gate must be scoped to staff pages');
    assert.ok(!/player-home|player-actions/.test(gate),
        'the gate must not name any player page');
  });

  it('routes the lead to the setup screen rather than blocking them', () => {
    assert.ok(/session\.isTeamLead && isClubOverQuota\(\)[\s\S]{0,120}showTeamSetup\(\)/.test(appSrc),
        'the lead must be sent to the category screen, not shown the message');
  });

  it('handles the empty currentPage a staff-only member lands on', () => {
    // Their sidebar is now empty, so renderSidebar sets currentPage to ''.
    // Without this arm they get "page not found" instead of the explanation.
    assert.ok(appSrc.includes("currentPage === '' || STAFF_PAGES.has(currentPage)"),
        'the empty-currentPage arm is missing');
  });
});

describe('quota — i18n', () => {
  // t() returns the raw key on a miss, so a missing translation ships as
  // `quota.add_blocked` on screen rather than failing loudly.
  ['quota.title', 'quota.add_blocked', 'quota.counter', 'quota.max_teams',
    'quota.saved', 'common.ok', 'error.quota_exceeded',
    'error.remove_team_unavailable',
    'quota.over_staff', 'quota.over_lead', 'team_del.title', 'team_del.msg',
    'team_del.kept', 'team_del.confirm_hint', 'team_del.deleting',
    'team_del.done', 'team_del.failed', 'team_del.last_team',
    'team_del.button', 'team_del.disable_blocked'].forEach((key) => {
    it(`${key} is translated into ca, es and en`, () => {
      const i = appSrc.indexOf("'" + key + "':");
      assert.ok(i !== -1, 'key missing: ' + key);
      const line = appSrc.slice(i, appSrc.indexOf('},', i));
      ['ca:', 'es:', 'en:'].forEach((l) =>
        assert.ok(line.includes(l), key + ' is missing ' + l));
    });
  });

  it('the counter keeps both placeholders in every language', () => {
    const i = appSrc.indexOf("'quota.counter':");
    const line = appSrc.slice(i, appSrc.indexOf('},', i));
    assert.strictEqual((line.match(/\{n\}/g) || []).length, 3);
    assert.strictEqual((line.match(/\{max\}/g) || []).length, 3);
  });
});

/* ------------------------------------------------------------------ *
 * Enabling a category: counted once, and repainted.
 *
 * `_domTeamCount` reads the DOM because on this screen the DOM is the
 * source of truth until save. The toggle handler runs on `change`, which
 * fires AFTER the browser has ticked the box — so the row being enabled is
 * already inside the total. v55 added its letters on top, and a club with
 * 2 of 3 teams used was told it was at the limit when it ticked a second
 * category. `exceptRow` is what makes "everyone else, plus the one I am
 * about to add" expressible.
 * ------------------------------------------------------------------ */
describe('team setup — counting the row being toggled', () => {
  const domTeamCount = (() => {
    const code = grab(appSrc, '  function _domTeamCount(container, exceptRow)',
        '\n  /* Show the allowance', 'js/app.js');
    // eslint-disable-next-line no-new-func
    return new Function(`${code}\nreturn _domTeamCount;`)();
  })();

  /* Just enough DOM for _domTeamCount: rows that answer for their checkbox
     and their chips. A real jsdom would test the browser, not this logic. */
  const row = (checked, letters) => ({
    querySelector: (sel) =>
      (sel === 'input[type="checkbox"]' ? { checked } : null),
    querySelectorAll: (sel) => (sel === '.ts-letter-chip' ? letters : []),
  });
  const container = (rows) => ({
    querySelectorAll: (sel) => (sel === '.ts-cat-row' ? rows : []),
  });

  it('counts letters in enabled rows only', () => {
    const c = container([row(true, ['A', 'B']), row(false, ['A'])]);
    assert.strictEqual(domTeamCount(c), 2);
  });

  it('skips the excepted row', () => {
    const juvenil = row(true, ['A']);
    const c = container([row(true, ['A', 'B']), juvenil]);
    assert.strictEqual(domTeamCount(c), 3, 'without the exception');
    assert.strictEqual(domTeamCount(c, juvenil), 2, 'with it');
  });

  it('lets a third team onto a 2-of-3 club — the reported bug', () => {
    // amateur A+B saved, lead ticks juvenil, whose box is ALREADY checked.
    const juvenil = row(true, ['A']);
    const c = container([row(true, ['A', 'B']), juvenil]);
    const max = 3;
    assert.ok(domTeamCount(c, juvenil) + 1 <= max, 'must be allowed');
    // The v55 arithmetic, kept here so the regression cannot come back.
    assert.ok(domTeamCount(c) + 1 > max, 'double-counted, which blocked it');
  });

  it('still refuses the one that genuinely does not fit', () => {
    const cadet = row(true, ['A']);
    const c = container([row(true, ['A', 'B']), row(true, ['A']), cadet]);
    assert.ok(domTeamCount(c, cadet) + 1 > 3);
  });

  it('the toggle handler excepts its own row', () => {
    const handler = grab(appSrc, 'if (e.target.checked) {',
        'row.classList.add', 'js/app.js');
    assert.ok(handler.includes('_domTeamCount(container, row) + 1'),
        'the enable branch must count everyone ELSE, then add its one team');
  });
});

/* Chip markup has ONE builder. It had two — the render and the toggle —
   and they disagreed: enabling a category left the row painted as
   disabled, greyed and with no "+", so no team could be added to it. */
describe('team setup — letter chip markup', () => {
  const chipsHtml = (() => {
    const code = grab(appSrc, '  function _letterChipsHtml(catKey, letters, enabled)',
        '\n  /* Repaint one row', 'js/app.js');
    // eslint-disable-next-line no-new-func
    return new Function('t', `${code}\nreturn _letterChipsHtml;`)((k) => k);
  })();

  it('a disabled row is one greyed A with no "+"', () => {
    const html = chipsHtml('juvenil', ['A'], false);
    assert.ok(html.includes('ts-letter-chip-off'));
    assert.ok(!html.includes('ts-letter-add'), 'nothing to add a team to yet');
    assert.strictEqual((html.match(/ts-letter-chip/g) || []).length, 2,
        'one chip (the class appears twice on it)');
  });

  it('an enabled row marks only the last chip removable', () => {
    const html = chipsHtml('amateur', ['A', 'B', 'C'], true);
    assert.strictEqual((html.match(/ts-letter-chip-last/g) || []).length, 1);
    assert.strictEqual((html.match(/ts-letter-chip-fixed/g) || []).length, 2);
    assert.ok(html.indexOf('ts-letter-chip-last') > html.indexOf('>B<'),
        'the removable one is C, not A or B');
  });

  it('an enabled row offers exactly one "+"', () => {
    const html = chipsHtml('amateur', ['A', 'B'], true);
    assert.strictEqual((html.match(/ts-letter-add/g) || []).length, 1);
  });

  it('carries the category on every chip, never an index', () => {
    const html = chipsHtml('cadet', ['A', 'C'], true);
    assert.strictEqual((html.match(/data-cat="cadet"/g) || []).length, 3);
    assert.ok(html.includes('data-letter="C"'), 'gaps are preserved, not renumbered');
  });

  it('is the only place that builds a chip', () => {
    const uses = (appSrc.match(/ts-letter-chip-off/g) || []).length;
    assert.strictEqual(uses, 1, 'a second builder is how the two drifted apart');
  });
});
