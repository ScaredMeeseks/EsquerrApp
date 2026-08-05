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
      /* Calls the real trackNavigation() rather than repeating its two
         lines. It used to repeat them, which meant these tests could not
         fail if renderPage's copy changed — they pinned a duplicate. */
      go(page) {
        currentPage = page;
        const isNav = trackNavigation(currentPage);
        syncSidebarActive();
        return isNav;
      }
    };`);
  const api = build(ctx);
  return {
    go: (p) => { active = null; api.go(p); return active; },
    /** Same move, but reporting "was this a navigation" instead. */
    navGo: (p) => api.go(p),
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

/* ------------------------------------------------------------------ *
 * Landing at the top.
 *
 * #view-dashboard is a fixed shell, so the window never scrolls on a
 * dashboard page — .dashboard-content is the scroller, and renderPage()
 * replaces its innerHTML without replacing the element, so the browser
 * keeps its scrollTop. Opening a player from the foot of the roster
 * dropped you half way down his profile.
 *
 * The reset itself is one line. The GUARD is the load-bearing part:
 * renderPage() has ~70 callers and only about twenty change the page. An
 * unguarded reset would jerk a coach back to the top every time the
 * debounced firestore sync redrew the page underneath him — a worse bug
 * than the one being fixed, and one nobody would connect to this change.
 * ------------------------------------------------------------------ */
describe('app.js — scroll resets on navigation only', () => {
  it('reports a real navigation', () => {
    const nav = makeNav();
    assert.strictEqual(nav.navGo('staff-home'), true, 'the first page counts');
    assert.strictEqual(nav.navGo('medical'), true);
    assert.strictEqual(nav.navGo('medical-detail'), true, 'opening a detail page');
  });

  it('reports a re-render of the same page as NOT a navigation', () => {
    // firestore-sync, the category bar, the language switch and every
    // optimistic redraw after a write all land here.
    const nav = makeNav();
    nav.navGo('staff-training');
    assert.strictEqual(nav.navGo('staff-training'), false);
    assert.strictEqual(nav.navGo('staff-training'), false, 'still false on the third');
  });

  it('counts Back as a navigation', () => {
    // The owner's call: one rule, no exceptions. Back lands at the top too.
    const nav = makeNav();
    nav.navGo('manage-roster');
    nav.navGo('staff-player-stats');
    assert.strictEqual(nav.navGo('manage-roster'), true);
  });

  it('counts a return to a page you have already seen', () => {
    // Not "have I ever rendered this", but "is it different from the last".
    const nav = makeNav();
    nav.navGo('medical');
    nav.navGo('tactics');
    assert.strictEqual(nav.navGo('medical'), true);
  });

  it('still tracks the back target exactly as before', () => {
    // trackNavigation now owns both jobs; neither may drift from the other.
    const nav = makeNav();
    nav.navGo('staff-home');
    nav.navGo('match-detail');
    nav.navGo('match-detail');
    assert.strictEqual(nav.back('player-matchday'), 'staff-home');
  });

  it('the reset in renderPage is guarded by that answer', () => {
    // A source assertion because the guard is invisible in review: an
    // unguarded `content.scrollTop = 0` looks identical at a glance.
    const body = grab('  function renderPage(session)', '\n  // #endregion Dashboard');
    assert.ok(body.includes('const isNav = trackNavigation(currentPage);'),
        'renderPage must ask trackNavigation, not re-derive the answer');
    assert.ok(/if \(isNav\) content\.scrollTop = 0;/.test(body),
        'the scroll reset must be guarded by isNav');
    assert.ok(!/^\s*content\.scrollTop = 0;/m.test(body),
        'an UNGUARDED reset would fire on every firestore sync');
  });

  it('leaves the nested scrollers to position themselves', () => {
    // .rpe-chart-scroll ends at the right and scrollLeagueToCentre() centres
    // the club's row. Both run after the reset and must still be there.
    const body = grab('  function renderPage(session)', '\n  // #endregion Dashboard');
    assert.ok(body.includes(".rpe-chart-scroll"), 'chart still scrolled to its end');
    assert.ok(body.includes('scrollLeagueToCentre()'), 'league still centred');
  });
});

describe('app.js — the auth views start at the top too', () => {
  it('showView resets the document scroll', () => {
    // Those views are not the fixed shell: they scroll the DOCUMENT, and
    // team setup is long enough to. showView only runs on a view switch,
    // never on a re-render, so this cannot fight a page render.
    const body = grab('  function showView(id)', '\n  //');
    assert.ok(body.includes('window.scrollTo(0, 0);'));
  });
});
