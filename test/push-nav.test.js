/* Unit tests for applyPushNav() — where a tapped notification lands.
 *
 * Pure logic, no emulator: `npm run test:pushnav`.
 *
 * The routing itself was never the broken part; the delivery was. But the
 * routing had a live trap in it, and it is the sort that only fires long
 * after the change that arms it:
 *
 *   the coach's client queues `page: 'convocatoria'` for a call-up, and
 *   `convocatoria` is a STAFF page. onPushQueueCreate happens to drop `page`
 *   on the way out, so the type fallback runs and players reach the match —
 *   but every APK in the field goes on sending that field, and the day it is
 *   forwarded every player who taps a call-up is bounced to fallbackPage()
 *   with no explanation. The third test below is the guard for it.
 *
 * applyPushNav is not exported (app.js is one big IIFE), so it is lifted out
 * of the source the way the other app.js suites lift their subjects.
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

/** The real applyPushNav, over the module-level state it writes. */
function load() {
  const logic = grab('  function applyPushNav(d) {', '  function _drainPushNav()');
  // eslint-disable-next-line no-new-func
  return new Function(`
    let currentPage = 'player-home';
    let detailMatchId = null;
    let detailMatchFrom = null;
    ${logic}
    return {
      run: (d) => applyPushNav(d),
      state: () => ({ currentPage, detailMatchId, detailMatchFrom }),
    };`)();
}

describe('app.js — applyPushNav', () => {
  it('sends an RPE reminder to the Accions tab', () => {
    // The exact payload scheduledRpeReminder sends, for a training and for
    // a match — both carry page, neither carries an id.
    const a = load();
    assert.strictEqual(
        a.run({ type: 'rpe_reminder', page: 'player-actions' }), true);
    assert.strictEqual(a.state().currentPage, 'player-actions');
  });

  it('falls back to the Accions tab when the payload names no page', () => {
    // An older sender, or onPushQueueCreate, which strips `page`.
    const a = load();
    assert.strictEqual(a.run({ type: 'rpe_reminder' }), true);
    assert.strictEqual(a.state().currentPage, 'player-actions');
  });

  it('opens the match detail for a convocatòria', () => {
    const a = load();
    assert.strictEqual(a.run({ type: 'convocatoria', matchId: '7' }), true);
    const s = a.state();
    assert.strictEqual(s.currentPage, 'match-detail');
    // A NUMBER: renderMatchDetail does `matches.find(x => x.id === detailMatchId)`
    // and the ids on the rows are numbers, so a string finds nothing.
    assert.strictEqual(s.detailMatchId, 7);
    // Back has to lead somewhere.
    assert.ok(s.detailMatchFrom);
  });

  it('ignores a convocatòria payload that names the staff page', () => {
    // The old-APK regression guard: page must not win here.
    const a = load();
    assert.strictEqual(
        a.run({ type: 'convocatoria', page: 'convocatoria', matchId: '7' }),
        true);
    const s = a.state();
    assert.strictEqual(s.currentPage, 'match-detail');
    assert.strictEqual(s.detailMatchId, 7);
  });

  it('does not strand a player on the staff page when the id is missing', () => {
    const a = load();
    assert.strictEqual(a.run({ type: 'convocatoria' }), false);
    assert.strictEqual(a.state().currentPage, 'player-home');
  });

  it('routes the other reminders to the home page', () => {
    const a = load();
    assert.strictEqual(a.run({ type: 'training_reminder' }), true);
    assert.strictEqual(a.state().currentPage, 'player-home');

    const b = load();
    assert.strictEqual(b.run({ type: 'match_avail_reminder' }), true);
    assert.strictEqual(b.state().currentPage, 'player-home');
  });

  it('carries the match id when a payload names match-detail directly', () => {
    const a = load();
    assert.strictEqual(
        a.run({ type: 'general', page: 'match-detail', matchId: '12' }), true);
    const s = a.state();
    assert.strictEqual(s.currentPage, 'match-detail');
    assert.strictEqual(s.detailMatchId, 12);
  });

  it('leaves the page alone for a notification it does not recognise', () => {
    // Returning false is what stops the caller re-rendering for nothing.
    const a = load();
    assert.strictEqual(a.run({ type: 'new_season' }), false);
    assert.strictEqual(a.state().currentPage, 'player-home');
  });

  it('survives an empty payload', () => {
    const a = load();
    assert.strictEqual(a.run(null), false);
    assert.strictEqual(a.run({}), false);
    assert.strictEqual(a.state().currentPage, 'player-home');
  });
});
