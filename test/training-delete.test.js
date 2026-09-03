/* Deleting a session — and everything answered about it.
 *
 * A session is not just its row. Players answer availability, submit an RPE
 * afterwards, and a coach can overrule an answer. Dropping the row alone
 * leaves all three orphaned: invisible, because every screen reaches them
 * THROUGH the session, but still counted by the load and attendance figures,
 * which walk the record blobs directly.
 *
 * deleteTraining is RUN here against fake storage, not grepped — the point of
 * this file is what ends up deleted, which no source assertion can state.
 *
 * `npm run test:trainingdelete`, or as part of test:unit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {readCss} = require('./read-css');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const css = readCss();
const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/** deleteTraining + its helper, over a fake localStorage and a fake DB. */
function load(store) {
  const removed = [];
  const acked = [];
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; }
  };
  const DB = {
    removeRecord: (coll, id) => { removed.push(coll + '/' + id); return Promise.resolve(); },
    setItemAcked: (k, v) => { store[k] = v; acked.push(k); return Promise.resolve(); }
  };
  const code = grab('  function trainingRecordKeys', '  /**\n   * Anything that is neither');
  // eslint-disable-next-line no-new-func
  const api = new Function('localStorage', 'DB', 'getTrainings',
    code + '\n return {trainingRecordKeys, deleteTraining};')(
      ls, DB, () => JSON.parse(store.fa_training || '[]'));
  return {api, removed, acked, store,
    trainings: () => JSON.parse(store.fa_training || '[]'),
    avail: () => JSON.parse(store.fa_training_availability || '{}'),
    rpe: () => JSON.parse(store.fa_player_rpe || '{}'),
    over: () => JSON.parse(store.fa_training_staff_override || '{}')};
}

const S1 = 'tr_1700000000000_a1b2';
const S2 = 'tr_1700000000001_c3d4';

function fixture() {
  return {
    fa_training: JSON.stringify([
      {id: S1, date: '2026-03-10', title: 'Dimarts', kind: 'training'},
      {id: S2, date: '2026-03-12', title: 'Dijous', kind: 'training'}
    ]),
    fa_training_availability: JSON.stringify({
      ['7_' + S1]: 'yes', ['8_' + S1]: 'no',
      ['7_' + S2]: 'yes',
      '7_2026-03-10': 'late'          // legacy, written by an old APK
    }),
    fa_player_rpe: JSON.stringify({
      ['7_training_' + S1]: {rpe: 7, minutes: 90},
      ['8_training_' + S1]: {rpe: 5, minutes: 90},
      ['7_training_' + S2]: {rpe: 6, minutes: 90},
      '7_training_2026-03-10': {rpe: 4, minutes: 60}
    }),
    fa_training_staff_override: JSON.stringify({
      ['7_' + S1]: 'injured', ['7_' + S2]: 'yes'
    })
  };
}

describe('trainingRecordKeys — which records belong to a session', () => {
  const {api} = load(fixture());

  it('finds the availability records for one session only', () => {
    const map = {['7_' + S1]: 1, ['8_' + S1]: 1, ['7_' + S2]: 1};
    assert.deepStrictEqual(
        api.trainingRecordKeys(map, S1, 'avail').sort(), ['7_' + S1, '8_' + S1]);
  });

  it('does not confuse an RPE key with an availability one', () => {
    /* They live in different blobs, but the suffixes overlap: `7_training_X`
       also ends in `_X`. If the two ever shared a map this is the assertion
       that catches it. */
    const map = {['7_' + S1]: 1, ['7_training_' + S1]: 1};
    assert.deepStrictEqual(api.trainingRecordKeys(map, S1, 'rpe'), ['7_training_' + S1]);
  });

  it('matches the whole session id, underscores and all', () => {
    /* A session id is `tr_1700…_a1b2`. Splitting on the last underscore
       would compare against `a1b2` and match every session minted in the
       same millisecond-and-suffix shape. */
    assert.deepStrictEqual(api.trainingRecordKeys({['7_' + S1]: 1}, 'a1b2', 'avail'), []);
    assert.deepStrictEqual(api.trainingRecordKeys({['7_' + S1]: 1}, S1, 'avail'),
        ['7_' + S1]);
  });

  it('needs a player id in front, so a headless key is not a record', () => {
    /* `_tr_17…` splits into an EMPTY player id and the right tail. Without
       the `cut > 0` guard it passes as somebody's answer and gets deleted
       from the server — for a player who does not exist. */
    assert.deepStrictEqual(api.trainingRecordKeys({['_' + S1]: 1}, S1, 'avail'), []);
    assert.deepStrictEqual(api.trainingRecordKeys({[S1]: 1}, S1, 'avail'), [],
        'and a key that is only the id is not one either');
  });

  it('is empty for a session nobody answered, and for no map at all', () => {
    assert.deepStrictEqual(api.trainingRecordKeys({['7_' + S1]: 1}, S2, 'avail'), []);
    assert.deepStrictEqual(api.trainingRecordKeys(null, S1, 'avail'), []);
  });
});

describe('deleteTraining — the row and what was answered about it', () => {
  it('removes the row and leaves the others', () => {
    const h = load(fixture());
    h.api.deleteTraining(S1);
    assert.deepStrictEqual(h.trainings().map((x) => x.id), [S2]);
  });

  it('deletes the availability answers ON THE SERVER, not only the cache', () => {
    /* ⚠ The blobs are read CACHES. Availability and RPE live in per-record
       Firestore collections and localStorage is rebuilt from their
       snapshots, so a purely local delete comes straight back on the next
       sync — the session would be gone and its answers would return. */
    const h = load(fixture());
    h.api.deleteTraining(S1);
    assert.ok(h.removed.includes('trainingAvail/7_' + S1), h.removed.join(', '));
    assert.ok(h.removed.includes('trainingAvail/8_' + S1));
    assert.deepStrictEqual(Object.keys(h.avail()).filter((k) => k.endsWith(S1)), [],
        'and the cache is rewritten so the page redraws at once');
  });

  it('deletes the RPE entries too', () => {
    const h = load(fixture());
    h.api.deleteTraining(S1);
    assert.ok(h.removed.includes('rpe/7_training_' + S1), h.removed.join(', '));
    assert.ok(h.removed.includes('rpe/8_training_' + S1));
    assert.deepStrictEqual(Object.keys(h.rpe()).filter((k) => k.endsWith(S1)), []);
  });

  it('drops the coach overrides, which share the availability key', () => {
    const h = load(fixture());
    h.api.deleteTraining(S1);
    assert.deepStrictEqual(Object.keys(h.over()), ['7_' + S2]);
    assert.ok(h.acked.includes('fa_training_staff_override'),
        'the override blob is synced, so it has to be written through');
  });

  it('leaves another session entirely alone', () => {
    const h = load(fixture());
    h.api.deleteTraining(S1);
    assert.strictEqual(h.avail()['7_' + S2], 'yes');
    assert.ok(h.rpe()['7_training_' + S2], 'its RPE survives');
    assert.strictEqual(h.over()['7_' + S2], 'yes');
    assert.ok(!h.removed.some((r) => r.includes(S2)), h.removed.join(', '));
  });

  it('writes the row through the synced path, not just localStorage', () => {
    // Otherwise the session reappears on the next snapshot, and the server
    // never recomputes trainingDates, so the reminders keep firing.
    const h = load(fixture());
    h.api.deleteTraining(S1);
    assert.ok(h.acked.includes('fa_training'));
  });

  it('resolves only once the server has acknowledged every part', () => {
    const h = load(fixture());
    const p = h.api.deleteTraining(S1);
    assert.ok(p && typeof p.then === 'function', 'it must be awaitable');
    return p;
  });

  it('survives a session nobody ever answered', () => {
    const h = load(fixture());
    h.api.deleteTraining(S2);
    assert.deepStrictEqual(h.trainings().map((x) => x.id), [S1]);
  });

  it('does nothing to the records of an id that does not exist', () => {
    const h = load(fixture());
    h.api.deleteTraining('tr_nope');
    assert.strictEqual(h.trainings().length, 2);
    assert.deepStrictEqual(h.removed, []);
  });
});

describe('deleteTraining — the date-keyed records are ambiguous', () => {
  /* A v43-era phone still writes `{player}_{date}`, and readRecord() falls
     back to that key for ANY session on that date. So a legacy record cannot
     be attributed to one of two sessions sharing a day. */

  it('keeps a legacy record while another session shares the date', () => {
    const store = fixture();
    const all = JSON.parse(store.fa_training);
    all.push({id: 'tr_same_day', date: '2026-03-10', title: 'Segona', kind: 'training'});
    store.fa_training = JSON.stringify(all);
    const h = load(store);
    h.api.deleteTraining(S1);
    assert.strictEqual(h.avail()['7_2026-03-10'], 'late',
        'deleting it would silently un-answer the session that survives');
    assert.ok(h.rpe()['7_training_2026-03-10']);
    assert.ok(!h.removed.includes('trainingAvail/7_2026-03-10'), h.removed.join(', '));
  });

  it('removes it once no session is left on that date', () => {
    // Then it can only ever have meant this one, and leaving it lets the
    // date fallback resurrect the answer on the next render.
    const h = load(fixture());
    h.api.deleteTraining(S1);
    assert.strictEqual(h.avail()['7_2026-03-10'], undefined);
    assert.strictEqual(h.rpe()['7_training_2026-03-10'], undefined);
    assert.ok(h.removed.includes('trainingAvail/7_2026-03-10'), h.removed.join(', '));
    assert.ok(h.removed.includes('rpe/7_training_2026-03-10'));
  });

  it('does not touch a legacy record belonging to another date', () => {
    const store = fixture();
    const av = JSON.parse(store.fa_training_availability);
    av['7_2026-03-12'] = 'no';
    store.fa_training_availability = JSON.stringify(av);
    const h = load(store);
    h.api.deleteTraining(S1);
    assert.strictEqual(h.avail()['7_2026-03-12'], 'no');
  });
});

describe('the button that reaches it', () => {
  it('is in the session detail topbar, and only for a coach who may edit', () => {
    /* `ro` is the flag the squad, the staff call and the team generator all
       use. A fitness coach and a delegate read a session; removing one is
       the head coach's. */
    const page = grab('  function renderStaffTrainingDetail', '  function buildDetailBar');
    assert.ok(/const delBtn = ro \? '' :/.test(page), 'view-only sub-roles get no button');
    assert.ok(/id="std-delete"/.test(page));
    assert.ok(/std-topbar-r">\$\{actEdit\}\$\{delBtn\}/.test(page),
        'it belongs in the topbar beside Edita, not loose in the page');
  });

  it('asks first, and says what else goes', () => {
    /* Availability answers and RPE entries are the players' own work and
       there is no undo. A bare "are you sure" does not tell a coach that. */
    const bind = grab("    const delBtn = document.getElementById('std-delete');",
        "    const actEdit = document.getElementById('std-edit-activity');");
    assert.ok(/if \(!confirm\(/.test(bind), 'it must confirm');
    assert.ok(/'std\.confirm_delete_act' : 'std\.confirm_delete'/.test(bind),
        'an activity has no RPE, so it gets its own wording');
    ['std.confirm_delete', 'std.confirm_delete_act'].forEach((k) => {
      const m = new RegExp("'" + k.replace('.', '\\.') + "':\\s*\\{([^}]+)\\}").exec(src);
      assert.ok(m, k + ' missing');
      /* Per LANGUAGE, not across the block: one translation left saying
         only "this cannot be undone" still passes a search over all three,
         and it is the one a coach reading in that language would see. */
      [['ca:', /disponibilitat/], ['es:', /disponibilidad/], ['en:', /availability/]]
          .forEach(([tag, word]) => {
            assert.ok(m[1].includes(tag), k + ' is missing ' + tag);
            const from = m[1].indexOf(tag);
            const next = m[1].slice(from + tag.length).search(/,\s*(ca|es|en):/);
            const one = next === -1 ? m[1].slice(from) : m[1].slice(from, from + tag.length + next);
            assert.ok(word.test(one),
                k + ' (' + tag + ') must name what else is deleted');
          });
    });
  });

  it('leaves the page before the row goes', () => {
    // Re-rendering a detail view whose session has just been deleted lands
    // on the "not found" empty state.
    const bind = grab("    const delBtn = document.getElementById('std-delete');",
        "    const actEdit = document.getElementById('std-edit-activity');");
    const nav = bind.indexOf("currentPage = 'calendar'");
    const del = bind.indexOf('deleteTraining(');
    assert.ok(nav !== -1 && nav < del, 'navigate away first, then delete');
    assert.ok(/detailTrainingId = null/.test(bind), 'and drop the id it was showing');
  });

  it('reads quieter than the Edita beside it', () => {
    // `.stp-a` is the club red; a delete in the same red is the loudest
    // thing in the bar.
    const m = /\.stp-a-danger \{([^}]*)\}/.exec(css);
    assert.ok(m, '.stp-a-danger has no rule');
    assert.ok(/color:\s*#6B645E/i.test(m[1]), 'muted until hover');
    assert.ok(/\.stp-a-danger:hover \{[^}]*color:\s*#BD162C/i.test(css));
  });
});

describe('what the server will allow', () => {
  it('staff may delete these records, so no rules change was needed', () => {
    ['trainingAvail', 'rpe'].forEach((coll) => {
      const block = rules.slice(rules.indexOf('match /' + coll + '/{docId}'));
      const at = block.indexOf('allow delete');
      const del = block.slice(at, block.indexOf('}', at));
      assert.ok(/isStaffOf\(teamId\)/.test(del),
          coll + ': a coach must be able to delete another player\'s record');
    });
  });

  it('there is no per-session reminder job to cancel', () => {
    /* The reminders are scheduled scans that read the team's `trainingDates`,
       which updateTeamDates recomputes from the fa_training write. Nothing is
       queued per session, so deleting the row IS cancelling the reminder. */
    const fns = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    assert.ok(/exports\.updateTeamDates = onDocumentWritten/.test(fns));
    assert.ok(/parts\.key !== "fa_training"/.test(fns),
        'the trigger must still watch fa_training');
    assert.ok(!/scheduledTrainingReminder[\s\S]{0,4000}?reminderSent/.test(fns),
        'a per-session marker would have to be cleaned up here too');
  });

  it('the tactical board a session links to is left alone', () => {
    // Boards are library items a session points at; other sessions point at
    // the same ones.
    const fn = grab('  function deleteTraining', '  /**\n   * Anything that is neither');
    assert.ok(!/board/i.test(fn.replace(/\/\*[\s\S]*?\*\//g, '')),
        'deleting a session must not delete a board');
  });
});
