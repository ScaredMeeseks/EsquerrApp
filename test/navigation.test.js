/* Unit tests for the back-button target and the sidebar highlight.
 *
 * Pure logic, no emulator: `npm run test:nav` (or `mocha navigation.test.js`).
 *
 * app.js is a browser script with no exports, so the block under test is
 * sliced out by marker and eval'd — the same trick shard.test.js uses to
 * read CATEGORY_ORDER out of utils.js, one step further. If a marker stops
 * matching, `grab()` throws naming it, which is a readable failure rather
 * than a silently-skipped test.
 *
 * Worth testing away from a browser because both bugs it covers were
 * invisible until someone navigated a specific way: Back was hardcoded to a
 * single destination, so arriving from anywhere else dumped you on a page
 * you had never visited, and the sidebar `active` class was only updated by
 * the sidebar's own click handler, so any in-page navigation left it
 * pointing at the previous page.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/** A staff-only coach's sidebar. Detail pages are deliberately absent. */
const SIDEBAR = ['staff-home', 'registrations', 'manage-roster', 'staff-training',
  'matchday', 'convocatoria', 'staff-matchday', 'medical', 'tactics',
  'staff-notifications', 'users', 'settings'];

/** Fresh navigator around the real logic block from app.js. */
function makeNav() {
  const logic = grab('  let _prevPage = null;', '  function renderPage(session)');
  let active = null;
  const items = SIDEBAR.map((id) => ({
    dataset: { page: id },
    classList: { toggle: (c, on) => { if (on) active = id; } },
  }));
  const ctx = { currentPage: '', $$: () => items };
  // eslint-disable-next-line no-new-func
  const build = new Function('ctx', `
    let currentPage = ctx.currentPage;
    const $$ = ctx.$$;
    ${logic}
    return {
      backTarget,
      syncSidebarActive,
      get prev() { return _prevPage; },
      go(page) {
        currentPage = page;
        if (_lastRendered && _lastRendered !== currentPage) _prevPage = _lastRendered;
        _lastRendered = currentPage;
        syncSidebarActive();
        return currentPage;
      }
    };`);
  const api = build(ctx);
  return {
    go: (p) => { active = null; api.go(p); return active; },
    back: (fallback) => api.backTarget(fallback),
    get highlight() { return active; }
  };
}

describe('app.js — back target', () => {
  it('returns to the page you came from, not a fixed destination', () => {
    // The reported bug: Home → a training → Back landed on the training
    // LIST, while the sidebar still highlighted Home.
    const nav = makeNav();
    nav.go('staff-home');
    nav.go('staff-training-detail');
    assert.strictEqual(nav.back('staff-training'), 'staff-home');
  });

  it('still falls back to the section list when opened from it', () => {
    const nav = makeNav();
    nav.go('staff-training');
    nav.go('staff-training-detail');
    assert.strictEqual(nav.back('staff-training'), 'staff-training');
  });

  it('works for every detail page reachable from the staff home', () => {
    [['medical-detail', 'medical'],
      ['staff-player-stats', 'manage-roster'],
      ['match-detail', 'player-matchday']].forEach(([page, fallback]) => {
      const nav = makeNav();
      nav.go('staff-home');
      nav.go(page);
      assert.strictEqual(nav.back(fallback), 'staff-home', page);
    });
  });

  it('uses the fallback when there is no previous page', () => {
    const nav = makeNav();
    nav.go('staff-training-detail');
    assert.strictEqual(nav.back('staff-training'), 'staff-training');
  });

  it('is not disturbed by a re-render of the same page', () => {
    // firestore-sync and the category bar both re-render in place. Treating
    // that as a navigation would make Back return to the page you are on.
    const nav = makeNav();
    nav.go('staff-home');
    nav.go('staff-training-detail');
    nav.go('staff-training-detail');
    assert.strictEqual(nav.back('staff-training'), 'staff-home');
  });
});

describe('app.js — sidebar highlight', () => {
  it('follows in-page navigation, not just sidebar clicks', () => {
    const nav = makeNav();
    assert.strictEqual(nav.go('registrations'), 'registrations');
    assert.strictEqual(nav.go('tactics'), 'tactics');
  });

  it('highlights the section a detail page was opened from', () => {
    const nav = makeNav();
    nav.go('staff-home');
    assert.strictEqual(nav.go('staff-training-detail'), 'staff-home');
    const other = makeNav();
    other.go('medical');
    assert.strictEqual(other.go('medical-detail'), 'medical');
  });

  it('never highlights a page that is not in the sidebar', () => {
    const nav = makeNav();
    nav.go('staff-training-detail');
    assert.ok(nav.highlight === null || SIDEBAR.includes(nav.highlight));
  });

  it('agrees with the back target on a detail page', () => {
    // The two must not disagree — that mismatch is exactly what made the
    // original behaviour confusing rather than merely wrong.
    const nav = makeNav();
    nav.go('staff-home');
    const highlight = nav.go('staff-training-detail');
    assert.strictEqual(highlight, nav.back('staff-training'));
  });
});
