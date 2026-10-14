/* Postponed and suspended matches (v286), below the UI.
 *
 * The federation's `partidos` feed carries ESTADO on every fixture —
 * "0" Pendent, "1" played, "2" AJORNAT, "3" SUSPÈS — and until v286 the app
 * read none of it. A postponed match went on being a match: past its
 * kick-off it was a 0–0, an RPE push, a +1 in "Partits" and a load in
 * readiness. These tests pin what the app does with each state now:
 *
 *   functions/fcf.js     the parse, and the merge's stamps and `changes`
 *   matchState           the ONE reading of a row's state, in two copies
 *                        (js/utils.js and functions/fcf.js) held equal here
 *   functions/index.js   the push wording, the matchday watch's cadence and
 *                        the reminder filters
 *   js/app.js            the staff's own "ajornat", and a new date typed by
 *                        hand: stamps, cleared answers, the squad's push
 *
 * The payloads are REAL captures (October 2026), reduced to our club's
 * fixtures plus every ESTADO 2/3 row in the group:
 *   fcf-partidos-postponed.json  grup 58161914 (Esquerra B) — 4149304,
 *                                Salesians Bosco-Horta v us, 11/10 AJORNAT
 *   fcf-partidos-suspended.json  grup 58161881 (Esquerra A) — 4119518,
 *                                03/10, SUSPÈS before it started
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const F = require(path.join(__dirname, '..', 'functions', 'fcf.js'));
const U = require(path.join(__dirname, '..', 'js', 'utils.js'));

const fixture = (n) => JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const PARTIDOS_B = fixture('fcf-partidos-postponed.json');
const PARTIDOS_A = fixture('fcf-partidos-suspended.json');
const B_ID = '40412';    // L'ESQUERRA DE L'EIXAMPLE, F.C. B
const A_ID = '35410';    // L'ESQUERRA DE L'EIXAMPLE, F.C.
const CLUB = 'Esquerra de l\'Eixample F.C.';

const optsB = (over) => Object.assign(
    {clubName: CLUB, category: 'amateur', letter: 'B', today: '2026-10-01'}, over);

const fixturesB = () => F.parseFcfFixtures(PARTIDOS_B, B_ID);
const AJORNAT = () => fixturesB().find((f) => f.actaId === '4149304');
const as = (f, over) => Object.assign({}, f, over);
const rowOf = (r, id) => r.matches.find((m) => String(m.id) === String(id));

describe('parseFcfFixtures reads ESTADO', () => {
  it('the B team\'s 11/10 fixture is postponed — from the real feed', () => {
    const f = AJORNAT();
    assert.ok(f, '4149304 is not in our fixtures');
    assert.strictEqual(f.state, 'postponed');
    assert.strictEqual(f.date, '2026-10-11');
    assert.strictEqual(f.isHome, false);
  });

  it('the A team\'s 03/10 fixture is suspended', () => {
    const f = F.parseFcfFixtures(PARTIDOS_A, A_ID).find((x) => x.actaId === '4119518');
    assert.ok(f);
    assert.strictEqual(f.state, 'suspended');
  });

  it('a pending fixture has no state; a played one says so', () => {
    const all = fixturesB();
    assert.ok(all.some((f) => f.state === ''), 'no pending fixture in the capture');
    assert.ok(all.some((f) => f.state === 'played'), 'no played fixture in the capture');
    assert.strictEqual(all.filter((f) => f.state === 'postponed').length, 1);
  });

  it('fcfStateOf: the four codes, as strings or numbers, and nothing else', () => {
    [['0', ''], ['1', 'played'], ['2', 'postponed'], ['3', 'suspended'],
      [2, 'postponed'], [3, 'suspended'], [' 2 ', 'postponed'],
      ['4', ''], ['', ''], [null, ''], [undefined, '']]
        .forEach(([e, want]) => assert.strictEqual(F.fcfStateOf(e), want, 'ESTADO ' + e));
  });
});

describe('matchState — one reading, two copies', () => {
  const D = '2026-10-11'; const H = '18:00';
  const CASES = [
    [null, ''],
    [{date: D, time: H}, ''],
    [{date: D, time: H, fcfState: 'postponed', postponedFrom: {date: D, time: H}}, 'postponed'],
    // Stamp missing (an old row): still postponed — there is nothing to have moved from.
    [{date: D, time: H, fcfState: 'postponed'}, 'postponed'],
    [{date: D, time: H, manualState: 'postponed', postponedFrom: {date: D, time: H}}, 'postponed'],
    // A new DAY, or a new HOUR: on again, whatever the flag still says.
    [{date: '2026-10-25', time: H, fcfState: 'postponed', postponedFrom: {date: D, time: H}}, ''],
    [{date: D, time: '20:00', fcfState: 'postponed', postponedFrom: {date: D, time: H}}, ''],
    [{date: D, time: H, fcfState: 'suspended', suspendedOn: {date: D, time: H}}, 'suspended'],
    [{date: '2026-10-25', time: H, fcfState: 'suspended', suspendedOn: {date: D, time: H}, suspendedStarted: true}, 'resumption'],
    // The FCF reset ESTADO to 0 on the new date: still the restart.
    [{date: '2026-10-25', time: H, suspendedOn: {date: D, time: H}, suspendedStarted: true}, 'resumption'],
    // v287: one that never started, moved, is just a match on its new date…
    [{date: '2026-10-25', time: H, fcfState: 'suspended', suspendedOn: {date: D, time: H}, suspendedStarted: false}, ''],
    // …and so is one nobody has found out about yet.
    [{date: '2026-10-25', time: H, fcfState: 'suspended', suspendedOn: {date: D, time: H}}, ''],
    // Played on its suspended day after all.
    [{date: D, time: H, suspendedOn: {date: D, time: H}}, ''],
  ];

  it('js/utils.js', () => {
    CASES.forEach(([m, want], i) => assert.strictEqual(U.matchState(m), want, 'case ' + i));
  });

  it('functions/fcf.js agrees on every case', () => {
    /* The functions deploy from their own folder and cannot require ../js,
       so the copy is a fact this test keeps true. */
    CASES.forEach(([m, want], i) => assert.strictEqual(F.matchState(m), want, 'case ' + i));
  });

  it('the two copies are the same code', () => {
    const norm = (fn) => fn.toString().replace(/"/g, '\'').replace(/\s+/g, ' ');
    assert.strictEqual(norm(F.matchState), norm(U.matchState));
  });
});

describe('convStale / convToldList / convCalledIds — told vs called (v287)', () => {
  const D = {date: '2026-10-11', time: '18:00'};
  const NEW = {date: '2026-10-25', time: '12:00'};
  const moved = Object.assign({id: 1, postponedFrom: D}, NEW);

  it('a call-up for a fixture that never moved is never stale', () => {
    assert.strictEqual(U.convStale({players: ['a']}, Object.assign({id: 1}, D)), false);
    assert.strictEqual(U.convStale({players: ['a']}, Object.assign({id: 1, postponedFrom: D}, D)), false);
  });

  it('moved: one sent before v287, or sent for the old kick-off, is stale', () => {
    assert.strictEqual(U.convStale({players: ['a']}, moved), true);
    assert.strictEqual(U.convStale(['a'], moved), true);
    assert.strictEqual(U.convStale({players: ['a'], sentFor: D}, moved), true);
    assert.deepStrictEqual(U.convToldList({players: ['a'], sentFor: D}, moved), []);
  });

  it('sent for the new day it is current; moved AGAIN, it asks again', () => {
    assert.strictEqual(U.convStale({players: ['a'], sentFor: NEW}, moved), false);
    assert.deepStrictEqual(U.convToldList({players: ['a'], sentFor: NEW}, moved), ['a']);
    const again = Object.assign({}, moved, {date: '2026-11-08'});
    assert.strictEqual(U.convStale({players: ['a'], sentFor: NEW}, again), true);
    // A restart moved a second time: suspendedOn is still the first day.
    const restart = Object.assign({id: 1, suspendedOn: D, suspendedStarted: true}, {date: '2026-11-08', time: '12:00'});
    assert.strictEqual(U.convStale({players: ['a'], sentFor: NEW}, restart), true);
  });

  it('an ordinary fixture — never moved through a postponement — is never stale', () => {
    assert.strictEqual(U.convStale({players: ['a'], sentFor: D}, Object.assign({id: 1}, NEW)), false);
  });

  it('called = the call-up AND a stopped game\'s first part, once each', () => {
    assert.deepStrictEqual(U.convCalledIds({players: ['a', 'c'], firstPart: {players: ['a', 'b']}}).sort(),
        ['a', 'b', 'c']);
    assert.deepStrictEqual(U.convCalledIds(['x']), ['x']);
    assert.deepStrictEqual(U.convCalledIds(null), []);
  });
});

describe('mergeFcfFixtures — postponed', () => {
  const pending = () => as(AJORNAT(), {state: ''});
  const imported = () => F.mergeFcfFixtures([], [pending()], optsB()).matches;

  it('a fixture we hold as on, reported AJORNAT: the state, the stamp, ONE change', () => {
    const r = F.mergeFcfFixtures(imported(), [AJORNAT()], optsB());
    const m = rowOf(r, 4149304);
    assert.strictEqual(m.fcfState, 'postponed');
    assert.deepStrictEqual(m.postponedFrom, {date: '2026-10-11', time: '18:00'});
    assert.strictEqual(F.matchState(m), 'postponed');
    assert.deepStrictEqual(r.changes, [{
      kind: 'postponed', id: 4149304, category: 'amateur', letter: 'B',
      rival: 'SALESIANS BOSCO-HORTA CE. A', isHome: false,
      from: {date: '2026-10-11', time: '18:00'}, to: {date: '2026-10-11', time: '18:00'},
    }]);
    assert.strictEqual(r.summary.updated, 1, 'the write would be skipped');
  });

  it('the next sync says nothing more — and writes nothing', () => {
    const once = F.mergeFcfFixtures(imported(), [AJORNAT()], optsB()).matches;
    const r = F.mergeFcfFixtures(once, [AJORNAT()], optsB());
    assert.deepStrictEqual(r.changes, [], 'the squad told twice');
    assert.deepStrictEqual(r.summary, {adopted: 0, added: 0, updated: 0, removed: 0});
  });

  it('its new date: moved in place, the original kept, "rescheduled"', () => {
    const held = F.mergeFcfFixtures(imported(), [AJORNAT()], optsB()).matches;
    const r = F.mergeFcfFixtures(held, [as(AJORNAT(), {date: '2026-10-25', time: '12:00'})], optsB());
    const m = rowOf(r, 4149304);
    assert.strictEqual(m.date, '2026-10-25');
    assert.deepStrictEqual(m.postponedFrom, {date: '2026-10-11', time: '18:00'});
    assert.strictEqual(F.matchState(m), '', 'still postponed on its new date');
    assert.deepStrictEqual(r.changes.map((c) => [c.kind, c.from.date, c.to.date, c.to.time]),
        [['rescheduled', '2026-10-11', '2026-10-25', '12:00']]);
  });

  it('...the same when the federation resets ESTADO to 0 with it', () => {
    const held = F.mergeFcfFixtures(imported(), [AJORNAT()], optsB()).matches;
    const r = F.mergeFcfFixtures(held, [as(AJORNAT(), {state: '', date: '2026-10-25'})], optsB());
    const m = rowOf(r, 4149304);
    assert.strictEqual(m.fcfState, undefined);
    assert.deepStrictEqual(m.postponedFrom, {date: '2026-10-11', time: '18:00'});
    assert.deepStrictEqual(r.changes.map((c) => c.kind), ['rescheduled']);
  });

  it('a time the coach edited BEFORE the postponement gives way to the new date (v287)', () => {
    /* It was a time for a day that is not happening; v286 let it keep the
       federation's new date out, and nobody was told. */
    const rows = imported();
    rows[0].time = '18:30';                         // typed by the coach, before
    const held = F.mergeFcfFixtures(rows, [AJORNAT()], optsB()).matches;
    assert.strictEqual(rowOf({matches: held}, 4149304).time, '18:30', 'a quiet sync moved the coach\'s time');
    const r = F.mergeFcfFixtures(held, [as(AJORNAT(), {date: '2026-10-25', time: '12:00'})], optsB());
    const m = rowOf(r, 4149304);
    assert.deepStrictEqual([m.date, m.time], ['2026-10-25', '12:00']);
    assert.deepStrictEqual(r.changes.map((c) => c.kind), ['rescheduled']);
  });

  it('a date the coach typed WHILE it was postponed still wins', () => {
    let rows = F.mergeFcfFixtures(imported(), [AJORNAT()], optsB()).matches;
    rows = rows.map((m) => Object.assign({}, m, {date: '2026-10-22'}));   // rescheduled by hand
    const r = F.mergeFcfFixtures(rows, [as(AJORNAT(), {date: '2026-10-25'})], optsB());
    assert.strictEqual(rowOf(r, 4149304).date, '2026-10-22');
    assert.deepStrictEqual(r.changes, []);
  });

  it('postponed AGAIN on its new date: re-stamped from that date, and announced', () => {
    let rows = F.mergeFcfFixtures(imported(), [AJORNAT()], optsB()).matches;
    rows = F.mergeFcfFixtures(rows, [as(AJORNAT(), {state: '', date: '2026-10-25'})], optsB()).matches;
    const r = F.mergeFcfFixtures(rows, [as(AJORNAT(), {state: 'postponed', date: '2026-10-25'})], optsB());
    const m = rowOf(r, 4149304);
    assert.deepStrictEqual(m.postponedFrom, {date: '2026-10-25', time: '18:00'});
    assert.strictEqual(F.matchState(m), 'postponed', 'a stale stamp read as "on"');
    assert.deepStrictEqual(r.changes.map((c) => c.kind), ['postponed']);
  });

  it('first seen already postponed: stamped, but nobody is told', () => {
    const r = F.mergeFcfFixtures([], [AJORNAT()], optsB());
    assert.strictEqual(rowOf(r, 4149304).fcfState, 'postponed');
    assert.ok(rowOf(r, 4149304).postponedFrom);
    assert.deepStrictEqual(r.changes, []);
  });

  it('played at last: the state goes', () => {
    const held = F.mergeFcfFixtures(imported(), [AJORNAT()], optsB()).matches;
    const r = F.mergeFcfFixtures(held, [as(AJORNAT(), {state: 'played', date: '2026-10-25'})], optsB());
    assert.strictEqual(rowOf(r, 4149304).fcfState, undefined);
  });

  describe('after the staff\'s own "ajornat"', () => {
    const marked = () => {
      const rows = imported();
      rows[0].manualState = 'postponed';
      rows[0].postponedFrom = {date: rows[0].date, time: rows[0].time};
      return rows;
    };

    it('the federation agreeing is NOT a second push — and the mark gives way', () => {
      const r = F.mergeFcfFixtures(marked(), [AJORNAT()], optsB());
      const m = rowOf(r, 4149304);
      assert.deepStrictEqual(r.changes, [], 'the squad told twice');
      assert.strictEqual(m.manualState, undefined);
      assert.strictEqual(m.fcfState, 'postponed');
    });

    it('while the federation still says Pendent, the mark stands', () => {
      const r = F.mergeFcfFixtures(marked(), [pending()], optsB());
      assert.strictEqual(rowOf(r, 4149304).manualState, 'postponed');
      assert.strictEqual(F.matchState(rowOf(r, 4149304)), 'postponed');
      assert.deepStrictEqual(r.changes, []);
    });

    it('a new date from the federation: "rescheduled", and the mark gives way', () => {
      const r = F.mergeFcfFixtures(marked(), [as(pending(), {date: '2026-10-25'})], optsB());
      assert.strictEqual(rowOf(r, 4149304).manualState, undefined);
      assert.deepStrictEqual(r.changes.map((c) => c.kind), ['rescheduled']);
    });
  });

  it('a hand-typed row adopted already postponed: stamped, not announced', () => {
    const manual = {id: 1700000000001, home: 'SALESIANS BOSCO-HORTA CE. A', away: CLUB,
      date: '2026-10-11', time: '18:00', team: 'B', category: 'amateur',
      score: null, status: 'upcoming', location: '', mapLink: ''};
    const r = F.mergeFcfFixtures([manual], [AJORNAT()], optsB());
    assert.strictEqual(r.summary.adopted, 1, 'the fixture was not adopted');
    const m = rowOf(r, 1700000000001);
    assert.strictEqual(m.fcfState, 'postponed');
    assert.deepStrictEqual(r.changes, []);
  });
});

describe('mergeFcfFixtures — suspended', () => {
  const fixtureA = () => F.parseFcfFixtures(PARTIDOS_A, A_ID).find((f) => f.actaId === '4119518');
  const optsA = (o) => Object.assign(optsB(o), {letter: 'A', today: '2026-09-01'});

  it('on → SUSPÈS: stamped with the day it was played, and announced', () => {
    const rows = F.mergeFcfFixtures([], [as(fixtureA(), {state: ''})], optsA()).matches;
    const r = F.mergeFcfFixtures(rows, [fixtureA()], optsA());
    const m = rowOf(r, 4119518);
    assert.deepStrictEqual(m.suspendedOn, {date: '2026-10-03', time: '18:00'});
    assert.strictEqual(F.matchState(m), 'suspended');
    assert.deepStrictEqual(r.changes.map((c) => c.kind), ['suspended']);
  });

  it('its restart date: the same row, "resumption", the first day kept', () => {
    let rows = F.mergeFcfFixtures([], [fixtureA()], optsA()).matches;
    rows = rows.map((m) => (m.id === 4119518 ? Object.assign({}, m, {suspendedStarted: true}) : m));
    const r = F.mergeFcfFixtures(rows, [as(fixtureA(), {state: '', date: '2026-11-08', time: '10:00'})], optsA());
    const m = rowOf(r, 4119518);
    assert.strictEqual(r.matches.length, rows.length, 'a second row for the restart');
    assert.strictEqual(m.date, '2026-11-08');
    assert.deepStrictEqual(m.suspendedOn, {date: '2026-10-03', time: '18:00'});
    assert.strictEqual(F.matchState(m), 'resumption');
    assert.deepStrictEqual(r.changes.map((c) => [c.kind, c.to.date]), [['resumption', '2026-11-08']]);
    rows = r.matches;
  });

  it('one that never started, given a new date: "rescheduled", not a restart (v287)', () => {
    let rows = F.mergeFcfFixtures([], [fixtureA()], optsA()).matches;
    rows = rows.map((m) => (m.id === 4119518 ? Object.assign({}, m, {suspendedStarted: false}) : m));
    const r = F.mergeFcfFixtures(rows, [as(fixtureA(), {state: '', date: '2026-11-08'})], optsA());
    assert.deepStrictEqual(r.changes.map((c) => c.kind), ['rescheduled']);
    assert.strictEqual(F.matchState(rowOf(r, 4119518)), '');
    assert.deepStrictEqual(F.matchParts(rowOf(r, 4119518)).map((p) => [p.date, p.part]), [['2026-11-08', 'whole']]);
  });

  it('the real A group, first import: every SUSPÈS of ours stamped, nothing announced', () => {
    const r = F.mergeFcfFixtures([], F.parseFcfFixtures(PARTIDOS_A, A_ID), optsA());
    assert.strictEqual(rowOf(r, 4119518).fcfState, 'suspended');
    assert.deepStrictEqual(r.changes, []);
  });
});

describe('mergeFcfFixtures — a re-issued acta', () => {
  /* Not seen yet — the postponed fixtures in the wild keep their acta — but
     if the federation does re-issue one, the call-ups, answers and notes on
     our row must follow it rather than sit on a struck-through duplicate. */
  const held = () => F.mergeFcfFixtures([], [AJORNAT()], optsB()).matches;
  const reissued = () => as(AJORNAT(), {actaId: '4999999', state: '', date: '2026-10-25'});

  it('a postponed row is claimed by the new acta: one row, our id, not removed', () => {
    const r = F.mergeFcfFixtures(held(), [reissued()], optsB());
    assert.strictEqual(r.matches.length, 1, 'duplicated');
    const m = r.matches[0];
    assert.strictEqual(m.id, 4149304, 'the row lost its id');
    assert.strictEqual(m.fcfActaId, '4999999');
    assert.strictEqual(m.fcfRemoved, undefined);
    assert.strictEqual(m.date, '2026-10-25');
  });

  it('an ordinary row is not — a new acta is a new fixture', () => {
    const rows = F.mergeFcfFixtures([], [as(AJORNAT(), {state: ''})], optsB()).matches;
    const r = F.mergeFcfFixtures(rows, [reissued()], optsB());
    assert.strictEqual(r.matches.length, 2);
    assert.strictEqual(rowOf(r, 4149304).fcfRemoved, true);
  });

  it('nor a postponed row of ANOTHER jornada or rival', () => {
    const r1 = F.mergeFcfFixtures(held(), [as(reissued(), {jornada: 9})], optsB());
    assert.strictEqual(r1.matches.length, 2);
    const r2 = F.mergeFcfFixtures(held(), [as(reissued(), {opponentTeamId: '1'})], optsB());
    assert.strictEqual(r2.matches.length, 2);
  });
});

/* ── functions/index.js ──────────────────────────────────────────────── */
const fnSrc = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
function grabFn(from, to) {
  const i = fnSrc.indexOf(from);
  const j = fnSrc.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in functions/index.js: ' + from);
  return fnSrc.slice(i, j);
}
const SERVER = new Function(
    grabFn('const CA_DOW = ', '/**\n * Tell a squad what the federation did') +
    grabFn('const WATCH_AHEAD_H = ', 'exports.fcfMatchdayWatch') +
    '\nreturn {matchChangeMessage, _caDay, watchDue};')();

describe('the push the squad gets', () => {
  const c = (kind, over) => Object.assign({kind, rival: 'SALESIANS BOSCO-HORTA CE. A',
    from: {date: '2026-10-11', time: '18:00'}, to: {date: '2026-10-25', time: '12:00'}}, over);

  it('the day as the app writes it', () => {
    assert.strictEqual(SERVER._caDay('2026-10-11'), 'dg 11/10');
    assert.strictEqual(SERVER._caDay('2026-10-17'), 'ds 17/10');
  });

  it('one per kind, in Catalan, naming the rival and the day', () => {
    assert.deepStrictEqual(SERVER.matchChangeMessage(c('postponed')), {title: 'Partit ajornat',
      body: 'SALESIANS BOSCO-HORTA CE. A (dg 11/10) queda ajornat per la Federació. Et direm la nova data.'});
    assert.strictEqual(SERVER.matchChangeMessage(c('suspended')).title, 'Partit suspès');
    assert.deepStrictEqual(SERVER.matchChangeMessage(c('rescheduled')), {title: 'Nova data',
      body: 'SALESIANS BOSCO-HORTA CE. A: dg 25/10 a les 12:00. Torna a dir si hi pots anar.'});
    assert.deepStrictEqual(SERVER.matchChangeMessage(c('resumption')), {title: 'Represa',
      body: 'SALESIANS BOSCO-HORTA CE. A es reprèn el dg 25/10 a les 12:00.'});
  });
});

describe('the matchday watch: when a squad is due a look', () => {
  const NOW = Date.UTC(2026, 9, 10, 10, 0);
  const h = (n) => n * 36e5;
  const due = (kickIn, lastAgo) => SERVER.watchDue(NOW + h(kickIn),
      lastAgo == null ? 0 : NOW - h(lastAgo), NOW);

  it('nothing beyond 72 h, or more than 3 h after kick-off, or with no fixture', () => {
    assert.strictEqual(due(73), false);
    assert.strictEqual(due(-3.5), false);
    assert.strictEqual(SERVER.watchDue(0, 0, NOW), false);
  });

  it('72–24 h out: every 3 h', () => {
    assert.strictEqual(due(71), true, 'never looked');
    assert.strictEqual(due(48, 2), false);
    assert.strictEqual(due(48, 3), true);
  });

  it('the last 24 h and the first 3 after kick-off: every hour', () => {
    assert.strictEqual(due(10, 0.5), false);
    assert.strictEqual(due(10, 1), true);
    assert.strictEqual(due(-2, 1), true, 'a postponement announced at the ground');
  });

  it('a run a few minutes early still counts as an hour', () => {
    // The schedule fires at :05 and the run itself takes time.
    assert.strictEqual(due(10, 1 - 3 / 60), true);
  });
});

describe('the reminders skip what was not played', () => {
  /* The two filters, lifted from their scheduled functions and run over
     the same rows — the expressions themselves, not a paraphrase. */
  const expr = (start) => {
    const at = fnSrc.indexOf(start);
    assert.ok(at !== -1, 'gone: ' + start);
    const body = fnSrc.slice(at + start.length, fnSrc.indexOf(');\n', at));
    return body;
  };
  const RPE = new Function('dates', 'now', 'endedInWindow', 'matchState', 'matchParts',
      'return (m) => ' + expr('const dueMatches = matches.filter((m) =>') + ';');
  const FRI = new Function('satStr', 'sunStr', 'matchState',
      'return (m) => ' + expr('const weekendMatches = matches.filter((m) =>') + ';');
  const D = '2026-10-11';
  const rpe = RPE([D], 0, () => true, F.matchState, F.matchParts);
  const fri = FRI('2026-10-10', D, F.matchState);
  const on = {id: 1, date: D, time: '18:00'};
  const postponed = Object.assign({}, on, {fcfState: 'postponed', postponedFrom: {date: D, time: '18:00'}});
  const suspended = Object.assign({}, on, {fcfState: 'suspended', suspendedOn: {date: D, time: '18:00'}});

  it('the RPE push: not postponed, not withdrawn — a suspended one only if it started', () => {
    assert.strictEqual(rpe(on), true);
    assert.strictEqual(rpe(postponed), false);
    assert.strictEqual(rpe(Object.assign({}, on, {manualState: 'postponed'})), false);
    assert.strictEqual(rpe(Object.assign({}, on, {fcfRemoved: true})), false);
    assert.strictEqual(rpe(Object.assign({}, suspended, {suspendedStarted: true})), true);
    // v287: stopped before it started — or not known yet — is no match to ask about.
    assert.strictEqual(rpe(Object.assign({}, suspended, {suspendedStarted: false})), false);
    assert.strictEqual(rpe(suspended), false);
  });

  it('the restart of a suspended match is chased for its OWN answer', () => {
    /* The first part's answer sits under the base key; asked about that,
       the restart's reminder found it answered and nobody was reminded. */
    const at = fnSrc.indexOf('const rpeKey =');
    assert.ok(at !== -1, 'gone: rpeKey');
    const KEY = new Function('match', 'matchState',
        'return ' + fnSrc.slice(at + 'const rpeKey ='.length, fnSrc.indexOf(';\n', at)) + ';');
    const resumed = Object.assign({}, on, {date: '2026-10-25', suspendedOn: {date: D, time: '18:00'},
      suspendedStarted: true});
    assert.strictEqual(KEY(resumed, F.matchState)('p1'), 'p1_match_1_r');
    assert.strictEqual(KEY(suspended, F.matchState)('p1'), 'p1_match_1');
    assert.strictEqual(KEY(on, F.matchState)('p1'), 'p1_match_1');
  });

  it('the acta queue skips postponed and suspended-and-waiting, not a restart', () => {
    const at = fnSrc.indexOf('skip: (r) =>');
    assert.ok(at !== -1, 'gone: the queue\'s skip');
    const SKIP = new Function('matchState',
        'return ' + fnSrc.slice(at + 'skip:'.length, fnSrc.indexOf(',\n', at)) + ';')(F.matchState);
    const resumed = Object.assign({}, on, {date: '2026-10-25', suspendedOn: {date: D, time: '18:00'}});
    assert.deepStrictEqual([on, postponed, suspended, resumed].map(SKIP), [false, true, true, false]);
  });

  it('Friday\'s availability: neither postponed nor suspended', () => {
    assert.strictEqual(fri(on), true);
    assert.strictEqual(fri(postponed), false);
    assert.strictEqual(fri(suspended), false);
  });
});

/* ── js/app.js: the staff's own changes ──────────────────────────────── */
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
function grabApp(from, to) {
  const i = appSrc.indexOf(from);
  const j = appSrc.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return appSrc.slice(i, j);
}
const CLIENT_CODE = grabApp('  /** Edit a fixture in place.', '  function calDeleteMatch(id)') +
  // The REAL record-key rule: `p1_9` is match 9's, `p1_99` is not.
  grabApp('  function trainingRecordKeys(map, sessionId, kind) {', '  /**\n   * Delete a session');

const SQUAD = [
  {id: 'uidA1', roles: ['player'], category: 'amateur', team: 'A'},
  {id: 'uidA2', roles: ['player', 'staff'], category: 'amateur', team: 'A'},
  {id: 'uidB1', roles: ['player'], category: 'amateur', team: 'B'},
  {id: 'uidJ1', roles: ['player'], category: 'juvenil', team: 'A'},
  {id: 'uidS1', roles: ['staff'], category: 'amateur', team: 'A'},
  {id: '17', roles: ['player'], category: 'amateur', team: 'A'},     // seeded, no account
];

function client(o) {
  o = o || {};
  const store = {
    fa_matches: JSON.stringify(o.matches || []),
    fa_match_availability: JSON.stringify(o.avail || {}),
  };
  const pushes = []; const removed = [];
  const stubs = {
    localStorage: {getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }},
    _clubConfig: {name: CLUB},
    matchState: U.matchState,
    fcfMatchFields: () => ({}),
    getUsers: () => SQUAD,
    isOurTeam: (n) => n === CLUB,
    getSession: () => ('session' in o ? o.session : {id: 'coach', teamId: 'T1'}),
    Push: {sendToPlayers: (teamId, uids, n) => pushes.push({teamId, uids, n})},
    DB: {removeRecord: (coll, k) => { removed.push(coll + '/' + k); return Promise.resolve(); }},
  };
  // eslint-disable-next-line no-new-func
  const api = new Function(...Object.keys(stubs), CLIENT_CODE +
      '\nreturn {calUpdateMatch, setMatchPostponedByHand, matchClearAvailability,' +
      ' matchSquadUids, matchNoticeText, setSuspendedStart};')(...Object.values(stubs));
  return {api, pushes, removed, store,
    match: (id) => JSON.parse(store.fa_matches).find((m) => String(m.id) === String(id)),
    avail: () => JSON.parse(store.fa_match_availability)};
}

const FIX = (over) => Object.assign({id: 9, home: CLUB, away: 'CE Rival', date: '2026-03-07',
  time: '18:00', team: 'A', category: 'amateur', location: 'Camp', mapLink: ''}, over);
// What calOpenMatchModal hands calUpdateMatch.
const FORM = (over) => Object.assign({homeAway: 'home', opponent: 'CE Rival', date: '2026-03-07',
  kickoff: '18:00', location: 'Camp', mapLink: '', team: 'A', category: 'amateur', squadLetter: 'A'}, over);
const ANSWERS = {uidA1_9: 'disponible', uidB1_9: 'no', uidA1_99: 'disponible', uidA1_tr_9: 'yes'};

describe('the staff mark a fixture postponed by hand', () => {
  it('stamped from its own kick-off, read as postponed, and the squad is told', () => {
    const c = client({matches: [FIX()]});
    c.api.setMatchPostponedByHand(9, true);
    const m = c.match(9);
    assert.strictEqual(m.manualState, 'postponed');
    assert.deepStrictEqual(m.postponedFrom, {date: '2026-03-07', time: '18:00'});
    assert.strictEqual(U.matchState(m), 'postponed');
    assert.strictEqual(c.pushes.length, 1);
    const p = c.pushes[0];
    assert.strictEqual(p.teamId, 'T1');
    assert.deepStrictEqual(p.uids, ['uidA1', 'uidA2'], 'the wrong people');
    assert.deepStrictEqual(p.n, {type: 'match_change', title: 'Partit ajornat',
      body: 'CE Rival (ds 07/03) queda ajornat. Et direm la nova data.', matchId: '9'});
  });

  it('postponed a second time, it is postponed from its SECOND date', () => {
    const c = client({matches: [FIX({date: '2026-03-14',
      postponedFrom: {date: '2026-03-07', time: '18:00'}})]});
    c.api.setMatchPostponedByHand(9, true);
    assert.deepStrictEqual(c.match(9).postponedFrom, {date: '2026-03-14', time: '18:00'});
    assert.strictEqual(U.matchState(c.match(9)), 'postponed');
  });

  it('undone: the mark and its own stamp go, and nobody is pushed', () => {
    const c = client({matches: [FIX()]});
    c.api.setMatchPostponedByHand(9, true);
    c.api.setMatchPostponedByHand(9, false);
    const m = c.match(9);
    assert.strictEqual(m.manualState, undefined);
    assert.strictEqual(m.postponedFrom, undefined);
    assert.strictEqual(U.matchState(m), '');
    assert.strictEqual(c.pushes.length, 1, 'the undo pushed');
  });

  it('undone over the federation\'s state: the stamp it stands on stays', () => {
    const c = client({matches: [FIX({fcfState: 'postponed', manualState: 'postponed',
      postponedFrom: {date: '2026-03-07', time: '18:00'}})]});
    c.api.setMatchPostponedByHand(9, false);
    assert.ok(c.match(9).postponedFrom);
  });

  it('no club session: marked, but no push queued', () => {
    const c = client({matches: [FIX()], session: {id: 'x', teamId: 'none'}});
    c.api.setMatchPostponedByHand(9, true);
    assert.strictEqual(c.match(9).manualState, 'postponed');
    assert.strictEqual(c.pushes.length, 0);
  });
});

describe('the staff say whether a suspended game started (v287)', () => {
  const SUSP = () => FIX({fcfState: 'suspended', suspendedOn: {date: '2026-03-07', time: '18:00'},
    suspendedStarted: true, suspendedAt: {minute: 79, src: 'acta'}});

  it('a corrected stop minute is theirs from then on', () => {
    const c = client({matches: [SUSP()]});
    assert.ok(c.api.setSuspendedStart(9, true, '86'));
    assert.deepStrictEqual(c.match(9).suspendedAt, {minute: 86, src: 'staff'});
  });

  it('a minute that is no minute is refused, and nothing is written', () => {
    const c = client({matches: [SUSP()]});
    ['0', '131', '', 'x'].forEach((v) => assert.strictEqual(c.api.setSuspendedStart(9, true, v), null, v));
    assert.deepStrictEqual(c.match(9).suspendedAt, {minute: 79, src: 'acta'});
  });

  it('"it did not start": not a match played that day, and the guess goes', () => {
    const c = client({matches: [SUSP()]});
    c.api.setSuspendedStart(9, false);
    const m = c.match(9);
    assert.strictEqual(m.suspendedStarted, false);
    assert.strictEqual(m.suspendedAt, undefined);
    assert.deepStrictEqual(U.matchParts(m), []);
  });

  it('"it started" with no minute yet: counted, and the minute left for later', () => {
    const c = client({matches: [FIX({fcfState: 'suspended', suspendedOn: {date: '2026-03-07', time: '18:00'}})]});
    c.api.setSuspendedStart(9, true);
    assert.strictEqual(c.match(9).suspendedStarted, true);
    assert.strictEqual(c.match(9).suspendedAt, undefined);
    assert.strictEqual(U.matchParts(c.match(9)).length, 1);
  });
});

describe('a new date typed on a postponed or suspended fixture', () => {
  it('postponed → rescheduled: the mark goes, the original stays, answers cleared, squad told', () => {
    const c = client({avail: ANSWERS, matches: [FIX({manualState: 'postponed',
      postponedFrom: {date: '2026-03-07', time: '18:00'}})]});
    c.api.calUpdateMatch(9, FORM({date: '2026-03-21', kickoff: '20:00'}));
    const m = c.match(9);
    assert.strictEqual(m.manualState, undefined);
    assert.deepStrictEqual(m.postponedFrom, {date: '2026-03-07', time: '18:00'});
    assert.strictEqual(U.matchState(m), '');
    // Match 9's answers, locally and on the server; match 99's and a session's stay.
    assert.deepStrictEqual(c.avail(), {uidA1_99: 'disponible', uidA1_tr_9: 'yes'});
    assert.deepStrictEqual(c.removed.sort(), ['matchAvail/uidA1_9', 'matchAvail/uidB1_9']);
    assert.strictEqual(c.pushes.length, 1);
    assert.deepStrictEqual(c.pushes[0].n, {type: 'match_change', title: 'Nova data',
      body: 'CE Rival: ds 21/03 a les 20:00. Torna a dir si hi pots anar.', matchId: '9'});
  });

  it('a federation-postponed one with no stamp gets one from the old date', () => {
    const c = client({matches: [FIX({fcfState: 'postponed'})]});
    c.api.calUpdateMatch(9, FORM({date: '2026-03-21'}));
    assert.deepStrictEqual(c.match(9).postponedFrom, {date: '2026-03-07', time: '18:00'});
  });

  it('suspended → its restart: the first day kept, "Represa"', () => {
    const c = client({avail: ANSWERS, matches: [FIX({fcfState: 'suspended', suspendedStarted: true,
      suspendedOn: {date: '2026-03-07', time: '18:00'}})]});
    c.api.calUpdateMatch(9, FORM({date: '2026-03-21', kickoff: '10:00'}));
    assert.strictEqual(U.matchState(c.match(9)), 'resumption');
    assert.deepStrictEqual(c.match(9).suspendedOn, {date: '2026-03-07', time: '18:00'});
    assert.strictEqual(c.removed.length, 2);
    assert.strictEqual(c.pushes[0].n.title, 'Represa');
    assert.strictEqual(c.pushes[0].n.body, 'CE Rival es reprèn el ds 21/03 a les 10:00.');
  });

  it('a suspended one with no stamp gets one, or it would stay "suspended" on its new day', () => {
    const c = client({matches: [FIX({fcfState: 'suspended', suspendedStarted: true})]});
    c.api.calUpdateMatch(9, FORM({date: '2026-03-21'}));
    assert.deepStrictEqual(c.match(9).suspendedOn, {date: '2026-03-07', time: '18:00'});
    assert.strictEqual(U.matchState(c.match(9)), 'resumption');
  });

  it('one that never started: "Nova data", its own stamp, and a plain match on the new day (v287)', () => {
    const c = client({avail: ANSWERS, matches: [FIX({fcfState: 'suspended', suspendedStarted: false,
      suspendedOn: {date: '2026-03-07', time: '18:00'}})]});
    c.api.calUpdateMatch(9, FORM({date: '2026-03-21'}));
    assert.strictEqual(c.pushes[0].n.title, 'Nova data');
    assert.strictEqual(c.match(9).postponedFrom, undefined, 'a suspended game stamped as postponed');
    assert.strictEqual(U.matchState(c.match(9)), '');
    assert.strictEqual(c.removed.length, 2, 'the old day\'s answers stayed');
  });

  it('a postponed one whose VENUE is corrected: still postponed, nothing sent', () => {
    const c = client({avail: ANSWERS, matches: [FIX({manualState: 'postponed',
      postponedFrom: {date: '2026-03-07', time: '18:00'}})]});
    c.api.calUpdateMatch(9, FORM({location: 'Un altre camp'}));
    assert.strictEqual(U.matchState(c.match(9)), 'postponed');
    assert.strictEqual(c.pushes.length + c.removed.length, 0);
    assert.strictEqual(Object.keys(c.avail()).length, 4);
  });

  it('an ordinary fixture moved: just moved — no push, no answers lost', () => {
    const c = client({avail: ANSWERS, matches: [FIX()]});
    c.api.calUpdateMatch(9, FORM({date: '2026-03-21'}));
    assert.strictEqual(c.match(9).date, '2026-03-21');
    assert.strictEqual(c.pushes.length + c.removed.length, 0);
    assert.strictEqual(c.match(9).postponedFrom, undefined);
  });
});

describe('the push wording agrees with the server\'s', () => {
  it('for a new date and a restart, word for word', () => {
    const c = client();
    const m = FIX({date: '2026-10-25', time: '12:00', home: 'SALESIANS BOSCO-HORTA CE. A', away: CLUB});
    ['rescheduled', 'resumption'].forEach((kind) => {
      assert.deepStrictEqual(c.api.matchNoticeText(m, kind),
          SERVER.matchChangeMessage({kind, rival: 'SALESIANS BOSCO-HORTA CE. A',
            from: {date: '2026-10-11', time: '18:00'}, to: {date: '2026-10-25', time: '12:00'}}), kind);
    });
  });
});
