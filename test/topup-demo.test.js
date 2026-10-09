/* The demo-club top-up scripts (functions/topup-demo-*.js), run for real.
 *
 * Pure logic, no emulator and no Firebase: `npm run test:topup`. Each script
 * keeps its Firestore reads and writes in main() and its decisions in a pure
 * `plan()`, so a test hands it what main() would have read and inspects what
 * it would write.
 *
 * ⚠ What these scripts write is shown to prospects, and their failure mode is
 * plausibility, not a crash. The season top-up ran for two months building
 * every Amateur A call-up out of eighteen Amateur B players, and nothing on
 * screen looked broken — a football person just saw the wrong names. Most
 * tests below therefore assert a POSITIVE fact about the output (every called
 * player is of the fixture's squad; the closed injury ends inside the gap), not
 * merely the absence of a bad one: a run that writes nothing passes every
 * negative.
 *
 * TOPUP_SEASON / TOPUP_EXTRAS / TOPUP_METRICS / TOPUP_PLANS let the mutation
 * runner point a suite at a mutated copy without touching the real file.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FN = path.join(__dirname, '..', 'functions');
const load = (env, file) => require(process.env[env] || path.join(FN, file));
const T = load('TOPUP_SEASON', 'topup-demo-season.js');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
function grabApp(from, to) {
  const i = appSrc.indexOf(from);
  const j = appSrc.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return appSrc.slice(i, j);
}

// ── A small club with the real one's shape ─────────────────────────────
// Two squads in ONE category shard, B listed first — the order that made
// `players.slice(0, 18)` field B in A's fixtures.
const TODAY = '2026-10-09';
const POS = ['GK', 'GK', 'CB', 'CB', 'LB', 'RB', 'CB,DM', 'DM', 'OM', 'OM', 'LW', 'RW', 'ST', 'ST,LW', 'OM', 'RB'];
function squad(letter, n) {
  return Array.from({length: n}, (_, i) => ({
    id: `dm_X_${letter}${String(i + 1).padStart(2, '0')}`, name: `P ${letter}${i + 1}`,
    roles: ['player'], category: 'amateur', team: letter, position: POS[i % POS.length],
    fitnessStatus: 'fit', injuryNote: '',
  }));
}
const LEAD = {id: 'dm_X_coach', roles: ['staff'], isTeamLead: true, category: 'amateur', team: ''};

function makeState() {
  const users = squad('B', 22).concat(squad('A', 22), [LEAD]);
  const A = users.filter((u) => u.team === 'A').map((u) => u.id);
  const B = users.filter((u) => u.team === 'B').map((u) => u.id);
  const CLUB = 'C.E. Demo';
  const matches = [
    {id: 9050, home: CLUB, away: 'U.E. Horta', date: '2026-09-05', time: '18:00', status: 'played', team: 'A', category: 'amateur', callupTime: '17:00', score: '2-0'},
    {id: 9051, home: 'C.F. Gràcia', away: CLUB, date: '2026-09-05', time: '16:00', status: 'played', team: 'B', category: 'amateur', callupTime: '15:15', score: ''},
    {id: 9190, home: CLUB, away: 'A.E. Poble-sec', date: '2026-09-19', time: '18:00', status: 'upcoming', team: 'A', category: 'amateur', callupTime: '17:00', score: ''},
    {id: 9191, home: 'U.D. Sarrià', away: CLUB, date: '2026-09-19', time: '16:00', status: 'upcoming', team: 'B', category: 'amateur', callupTime: '15:15', score: ''},
    {id: 1017, home: CLUB, away: 'F.C. Clot', date: '2026-10-17', time: '18:00', status: 'upcoming', team: 'A', category: 'amateur', callupTime: '17:00', score: ''},
    // Before the season boundary: must never be touched.
    {id: 2010, home: CLUB, away: 'C.E. Navas', date: '2026-02-10', time: '18:00', status: 'upcoming', team: 'A', category: 'amateur', score: ''},
  ];
  const training = [
    {id: 'tr_0915', day: 'Dimarts', date: '2026-09-15', time: '20:00', focus: 'Rondos', location: 'X', status: 'upcoming', category: 'amateur', teams: ['A', 'B']},
    {id: 'tr_0922', day: 'Dimarts', date: '2026-09-22', time: '20:00', focus: 'Rondos', location: 'X', status: 'upcoming', category: 'amateur'},
    {id: 'tr_0924', day: 'Dijous', date: '2026-09-24', time: '20:00', focus: 'Joc de posició', location: 'X', status: 'upcoming', category: 'amateur', excluded: [A[5]]},
    {id: 'tr_0929', day: 'Dimarts', date: '2026-09-29', time: '20:00', focus: 'Rondos', location: 'X', status: 'upcoming', category: 'amateur', teams: ['A']},
    {id: 'tr_1001', day: 'Dijous', date: '2026-10-01', time: '20:00', focus: 'Rondos', location: 'X', status: 'upcoming', category: 'amateur'},
    {id: 'tr_1013', day: 'Dimarts', date: '2026-10-13', time: '20:00', focus: 'Rondos', location: 'X', status: 'upcoming', category: 'amateur'},
    {id: 'tr_1015', day: 'Dijous', date: '2026-10-15', time: '20:00', focus: 'Rondos', location: 'X', status: 'upcoming', category: 'amateur'},
  ];
  const injuries = [
    // Seeded, open, expected back in August: stale.
    {id: 'inj_stale', playerId: A[3], bodyZone: 14, bodyZoneLabel: 'Knee', muscleGroup: 'Knee', muscleSub: 'PCL', description: 'x', severity: 'moderate', status: 'active', startDate: '2026-07-22', expectedReturn: '2026-08-11', endDate: null, createdBy: 'dm_X_coach', notes: ''},
    // A coach's own case (it has a note): never closed by the script.
    {id: 'inj_real', playerId: B[4], bodyZone: 2, bodyZoneLabel: 'Ankle', muscleGroup: 'Ankle', muscleSub: '', description: 'y', severity: 'moderate', status: 'active', startDate: '2026-07-20', expectedReturn: '2026-08-01', endDate: null, createdBy: 'dm_X_coach', notes: 'Pendent del traumatòleg'},
  ];
  // The cross-squad call-up an earlier run wrote: A's fixture, B's players.
  const convo = {
    9050: {players: B.slice(0, 14), jersey: 'white', socks: 'striped', videos: [], startingXI: B.slice(0, 11)},
    9051: {players: B.slice(0, 14), jersey: 'white', socks: 'striped', videos: [], startingXI: B.slice(0, 11)},
  };
  const events = {
    9050: [{id: 'e1', side: 'home', type: 'goal', minute: '10', playerId: B[8]}],
    9051: [{id: 'e2', side: 'away', type: 'goal', minute: '12', playerId: B[9]},
      {id: 'e3', side: 'away', type: 'change', minute: '60', playerOutId: B[10], playerInId: B[12]}],
  };
  const rpe = new Map();
  B.slice(0, 11).forEach((u) => rpe.set(`${u}_match_9050`, {uid: u, rpe: 7, minutes: 90, source: 'topup', date: '2026-09-05'}));
  // Filed by a real player from a demo login: no `source`. Must survive.
  rpe.set(`${B[11]}_match_9050`, {uid: B[11], rpe: 6, minutes: 20, date: '2026-09-05'});
  const avail = new Map();
  users.filter((u) => u.roles.includes('player')).forEach((u) => {
    avail.set(`${u.id}_2026-09-15`, {uid: u.id, date: '2026-09-15', source: 'seed',
      value: u.id === A[3] ? 'injured' : 'yes'});
  });
  // A real "no" inside the gap: kept, and no RPE for it.
  avail.set(`${A[0]}_tr_0922`, {uid: A[0], date: '2026-09-22', value: 'no'});
  const shards = new Map([
    ['fa_users__amateur', users],
    ['fa_matches__amateur', matches],
    ['fa_training__amateur', training],
    ['fa_injuries__amateur', injuries],
    ['fa_convocatoria_sent__amateur', convo],
    ['fa_convocatoria_callup__amateur', {}],
    ['fa_match_events__amateur', events],
  ]);
  const fields = new Map([
    ['fa_injury_notes__amateur', {[A[3]]: 'Knee (PCL) – x', [B[4]]: 'Ankle – y'}],
    ['fa_injury_zone__amateur', {[A[3]]: 14, [B[4]]: 2}],
  ]);
  return {
    A, B, CLUB,
    state: {club: {name: CLUB, seasonBoundary: '03-01', demoSeed: true},
      shards, fields, avail, matchAvail: new Map(), rpe},
  };
}

const shardOf = (out, id) => (out.shards.find((w) => w.id === id) || {}).value;
const recs = (out, coll) => out.records.filter((r) => r.coll === coll);

/** What main() would leave behind, as the next run would read it. */
function applyTo(state, out) {
  const next = {club: state.club, shards: new Map(state.shards), fields: new Map(state.fields),
    avail: new Map(state.avail), matchAvail: new Map(state.matchAvail), rpe: new Map(state.rpe)};
  out.shards.forEach((w) => next.shards.set(w.id, JSON.parse(JSON.stringify(w.value))));
  out.fields.forEach((w) => {
    const f = Object.assign({}, next.fields.get(w.id) || {});
    Object.entries(w.data).forEach(([k, v]) => { if (v === T.DELETE) delete f[k]; else f[k] = v; });
    next.fields.set(w.id, f);
  });
  const coll = {trainingAvail: next.avail, matchAvail: next.matchAvail, rpe: next.rpe};
  out.deletes.forEach((d) => coll[d.coll].delete(d.id));
  out.records.forEach((r) => coll[r.coll].set(r.id, r.data));
  return next;
}

describe('topup-demo-season — fixtures', () => {
  const {state, A, B} = makeState();
  const out = T.plan(state, {today: TODAY, repairCrossSquad: true});
  const convo = shardOf(out, 'fa_convocatoria_sent__amateur');
  const events = shardOf(out, 'fa_match_events__amateur');
  const matches = shardOf(out, 'fa_matches__amateur');

  it('calls up the fixture\'s OWN squad, never the other one', () => {
    const a = new Set(A); const b = new Set(B);
    assert.ok(convo[9190].players.length >= 11);
    assert.ok(convo[9190].players.every((u) => a.has(u)), 'A fixture called a non-A player');
    assert.ok(convo[9191].players.every((u) => b.has(u)), 'B fixture called a non-B player');
  });

  it('marks past fixtures played, and leaves the future and the pre-season alone', () => {
    const by = (id) => matches.find((m) => m.id === id);
    assert.strictEqual(by(9190).status, 'played');
    assert.strictEqual(by(9191).status, 'played');
    assert.strictEqual(by(1017).status, 'upcoming');
    assert.strictEqual(by(2010).status, 'upcoming');
    assert.ok(!convo[1017] && !convo[2010] && !events[2010]);
  });

  it('starts a keeper and eleven from the call-up', () => {
    const c = convo[9190];
    assert.strictEqual(c.startingXI.length, 11);
    assert.ok(c.startingXI.every((u) => c.players.includes(u)));
    const users = state.shards.get('fa_users__amateur');
    const pos = (u) => users.find((x) => x.id === u).position;
    assert.strictEqual(pos(c.startingXI[0]).split(',')[0], 'GK');
  });

  it('every scorer, assist, card and sub is a called player; nobody assists himself', () => {
    let goals = 0; let assists = 0;
    [9190, 9191].forEach((id) => {
      const called = new Set(convo[id].players);
      events[id].filter((e) => e.playerId || e.assistPlayerId || e.playerInId).forEach((e) => {
        ['playerId', 'assistPlayerId', 'playerOutId', 'playerInId'].forEach((k) => {
          if (e[k]) assert.ok(called.has(e[k]), `${k} ${e[k]} not called up`);
        });
        if (e.type === 'goal') {
          goals++;
          if (e.assistPlayerId) { assists++; assert.notStrictEqual(e.assistPlayerId, e.playerId); }
        }
      });
      // A substitute comes off the bench, never out of the XI and back.
      events[id].filter((e) => e.type === 'change').forEach((e) => {
        assert.ok(convo[id].startingXI.includes(e.playerOutId));
        assert.ok(!convo[id].startingXI.includes(e.playerInId));
      });
    });
    assert.ok(goals > 0, 'no goals at all — the test would prove nothing');
    assert.ok(assists > 0, 'goals but no assists — the owner asked for assists');
  });

  it('stores the score the events produce, by the app\'s own calcMatchScore', () => {
    // eslint-disable-next-line no-new-func
    const appScore = new Function(grabApp('function calcMatchScore(events)', 'function parseEventMinute') +
      '; return calcMatchScore;')();
    [9190, 9191, 9050].forEach((id) => {
      const s = appScore(events[id]);
      assert.strictEqual(matches.find((m) => m.id === id).score, `${s.home}-${s.away}`);
      assert.deepStrictEqual(T.calcMatchScore(events[id]), s);
    });
  });

  it('writes match RPE for every called player who played, with the events\' minutes', () => {
    const c = convo[9190];
    const r = recs(out, 'rpe').filter((x) => x.data.matchId === '9190');
    assert.ok(r.length >= 11);
    r.forEach((x) => {
      assert.ok(c.players.includes(x.data.uid));
      assert.strictEqual(x.data.minutes, T.minutesFromEvents(x.data.uid, c.startingXI, events[9190]));
      assert.strictEqual(x.data.ua, x.data.rpe * x.data.minutes);
    });
    // Every starter played and reported.
    c.startingXI.forEach((u) => assert.ok(r.some((x) => x.data.uid === u), 'starter without RPE'));
  });

  it('answers match availability, and never calls up anyone who said no or was injured', () => {
    const av = recs(out, 'matchAvail').filter((x) => x.data.matchId === '9190');
    assert.ok(av.length >= 14);
    const no = new Set(av.filter((x) => x.data.value === 'no_disponible').map((x) => x.data.uid));
    convo[9190].players.forEach((u) => assert.ok(!no.has(u)));
    // B[4] is injured (the coach's case) on 09-19.
    assert.ok(!convo[9191].players.includes(B[4]));
    // ⚠ Positive half: some fit players DID say no. Without it, a squad small
    // enough to be topped up to sixteen makes the check above vacuous.
    assert.ok(no.size >= 2, 'nobody said no — the check above proves nothing');
  });

  it('never credits a scorer with his own assist, over many fixtures', () => {
    const {state: st} = makeState();
    const players = st.shards.get('fa_users__amateur').filter((u) => u.team === 'A');
    const injuredOn = () => false;
    let assisted = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const b = T.buildMatch({id: seed, date: '2026-09-19', home: 'C.E. Demo', away: 'X', team: 'A'},
          players, {R: T.makeRand(seed), injuredOn, clubName: 'C.E. Demo', answered: new Map()});
      b.events.filter((e) => e.type === 'goal' && e.assistPlayerId).forEach((e) => {
        assisted++;
        assert.notStrictEqual(e.assistPlayerId, e.playerId, `seed ${seed}`);
      });
    }
    assert.ok(assisted > 100, 'too few assists to say anything');
  });
});

describe('topup-demo-season — --repair-cross-squad', () => {
  it('rebuilds A\'s fixture from A, and replaces only the RPE this script wrote', () => {
    const {state, A, B} = makeState();
    const out = T.plan(state, {today: TODAY, repairCrossSquad: true});
    const convo = shardOf(out, 'fa_convocatoria_sent__amateur');
    assert.ok(convo[9050].players.every((u) => A.includes(u)));
    const del = out.deletes.map((d) => d.id);
    assert.strictEqual(del.length, 11);
    assert.ok(del.every((id) => id.endsWith('_match_9050') && B.some((b) => id.startsWith(b))));
    assert.ok(!del.includes(`${B[11]}_match_9050`), 'deleted an RPE a real player filed');
    // B's own fixture that day is legitimate and is not rebuilt.
    assert.deepStrictEqual(convo[9051], state.shards.get('fa_convocatoria_sent__amateur')[9051]);
    assert.strictEqual(out.summary.repaired, 1);
  });

  it('without the flag, reports it and changes nothing on it', () => {
    const {state} = makeState();
    const out = T.plan(state, {today: TODAY});
    assert.strictEqual(out.deletes.length, 0);
    assert.strictEqual(out.summary.crossSquadSkipped, 1);
    const convo = shardOf(out, 'fa_convocatoria_sent__amateur');
    assert.deepStrictEqual(convo[9050], state.shards.get('fa_convocatoria_sent__amateur')[9050]);
  });
});

describe('topup-demo-season — injuries', () => {
  const {state, A, B} = makeState();
  const out = T.plan(state, {today: TODAY, repairCrossSquad: true});
  const inj = shardOf(out, 'fa_injuries__amateur');
  const byId = (id) => inj.find((i) => i.id === id);

  it('closes the stale seeded case INSIDE the gap, with a coach\'s note', () => {
    const i = byId('inj_stale');
    assert.strictEqual(i.status, 'resolved');
    assert.strictEqual(out.gapStart, '2026-09-16');
    assert.ok(i.endDate >= out.gapStart && i.endDate <= T.addDays(TODAY, -3), i.endDate);
    assert.ok(i.notes.length > 10);
  });

  it('never closes a case a coach wrote a note on', () => {
    assert.deepStrictEqual(byId('inj_real'), state.shards.get('fa_injuries__amateur')[1]);
  });

  it('opens fresh cases per squad — resolved, recovering and active — with notes', () => {
    const fresh = inj.filter((i) => i.startDate >= '2026-09-01');
    ['A', 'B'].forEach((letter) => {
      const ids = new Set((letter === 'A' ? A : B));
      const mine = fresh.filter((i) => ids.has(i.playerId));
      assert.deepStrictEqual(mine.map((i) => i.status).sort(),
          ['active', 'active', 'recovering', 'resolved', 'resolved']);
      mine.forEach((i) => {
        assert.ok(i.notes && i.muscleGroup && i.expectedReturn && i.startDate <= TODAY);
        if (i.status === 'resolved') assert.ok(i.endDate && i.endDate < TODAY);
        else assert.ok(!i.endDate && i.expectedReturn > TODAY);
      });
    });
  });

  it('every injured player answers "injured" on each session inside his injury', () => {
    const fresh = inj.filter((i) => i.startDate >= '2026-09-01' || i.id === 'inj_stale');
    const av = recs(out, 'trainingAvail');
    let inside = 0;
    fresh.forEach((i) => {
      const until = i.status === 'resolved' ? i.endDate : TODAY;
      av.filter((r) => r.data.uid === i.playerId && r.data.date >= i.startDate && r.data.date <= until)
          .forEach((r) => { inside++; assert.strictEqual(r.data.value, 'injured', `${i.id} ${r.data.date}`); });
    });
    assert.ok(inside >= 5, `only ${inside} sessions fell inside an injury — proves nothing`);
  });

  it('the stale player answers "injured" until his discharge and trains after it', () => {
    const end = byId('inj_stale').endDate;
    const av = recs(out, 'trainingAvail').filter((r) => r.data.uid === A[3]);
    assert.ok(av.length >= 3);
    av.forEach((r) => {
      if (r.data.date <= end) assert.strictEqual(r.data.value, 'injured', r.data.date);
      else assert.notStrictEqual(r.data.value, 'injured', r.data.date);
    });
  });

  it('brings roster fitness and the two per-field keys into line', () => {
    const users = shardOf(out, 'fa_users__amateur');
    const u = (id) => users.find((x) => x.id === id);
    assert.strictEqual(u(A[3]).fitnessStatus, 'fit');
    const active = inj.filter((i) => i.status === 'active' && i.startDate >= '2026-09-01');
    active.forEach((i) => {
      assert.strictEqual(u(i.playerId).fitnessStatus, 'injured');
      assert.ok(u(i.playerId).injuryNote.startsWith(i.muscleGroup));
    });
    const notes = out.fields.find((f) => f.id === 'fa_injury_notes__amateur').data;
    assert.strictEqual(notes[A[3]], T.DELETE);
    active.forEach((i) => assert.ok(typeof notes[i.playerId] === 'string'));
    assert.ok(!(B[4] in notes), 'rewrote an entry that was already right');
  });
});

describe('topup-demo-season — training', () => {
  const {state, A, B} = makeState();
  const out = T.plan(state, {today: TODAY, repairCrossSquad: true});
  const av = recs(out, 'trainingAvail');

  it('answers every past session in the gap, for the players called to it', () => {
    const dates = [...new Set(av.map((r) => r.data.date))].sort();
    assert.deepStrictEqual(dates, ['2026-09-22', '2026-09-24', '2026-09-29', '2026-10-01']);
    // teams:['A'] on 09-29 — B is not called.
    assert.ok(av.filter((r) => r.data.date === '2026-09-29').every((r) => A.includes(r.data.uid)));
    // excluded on 09-24.
    assert.ok(!av.some((r) => r.data.date === '2026-09-24' && r.data.uid === A[5]));
    assert.ok(av.filter((r) => r.data.date === '2026-09-22').length === A.length + B.length - 1);
  });

  it('keeps a real answer, and files RPE only for those who came', () => {
    assert.ok(!av.some((r) => r.data.uid === A[0] && r.data.date === '2026-09-22'));
    const r = recs(out, 'rpe').filter((x) => x.data.tag === 'training');
    assert.ok(r.length > 50);
    assert.ok(!r.some((x) => x.data.uid === A[0] && x.data.date === '2026-09-22'));
    const value = new Map([...state.avail.values()].map((x) => [`${x.uid}_${x.date}`, x.value])
        .concat(av.map((x) => [`${x.data.uid}_${x.data.date}`, x.data.value])));
    r.forEach((x) => assert.ok(['yes', 'late'].includes(value.get(`${x.data.uid}_${x.data.date}`))));
  });

  it('files every answer and load under the key the coach\'s session page reads', () => {
    // eslint-disable-next-line no-new-func
    const recordKey = new Function(grabApp('function recordKey(playerId, sess, kind)', 'function legacyRecordKey') +
      '; return recordKey;')();
    const sessions = new Map(state.shards.get('fa_training__amateur').map((t) => [t.id, t]));
    assert.ok(av.length > 50);
    av.forEach((r) => assert.strictEqual(r.id, recordKey(r.data.uid, sessions.get(r.data.sessionId), 'avail')));
    const tr = recs(out, 'rpe').filter((x) => x.data.tag === 'training');
    assert.ok(tr.length > 50);
    tr.forEach((r) => assert.strictEqual(r.id, recordKey(r.data.uid, sessions.get(r.data.sessionId), 'rpe')));
  });

  it('writes nothing in the future and nothing before the season', () => {
    out.records.forEach((r) => {
      if (r.data.date) assert.ok(r.data.date < TODAY && r.data.date >= '2026-03-01', r.data.date);
    });
  });
});

describe('topup-demo-season — re-running', () => {
  it('a second run over the first run\'s result writes nothing new', () => {
    const {state} = makeState();
    const first = T.plan(state, {today: TODAY, repairCrossSquad: true});
    const second = T.plan(applyTo(state, first), {today: TODAY, repairCrossSquad: true});
    assert.ok(first.records.length > 100);
    assert.strictEqual(second.records.length, 0, JSON.stringify(second.records[0]));
    assert.strictEqual(second.deletes.length, 0);
    assert.strictEqual(second.summary.injuriesCreated + second.summary.injuriesClosed, 0);
    assert.strictEqual(second.fields.length, 0);
  });

  it('does not write into the state it was given', () => {
    const {state} = makeState();
    const snap = JSON.stringify([...state.shards], null, 0) + JSON.stringify([...state.avail]);
    T.plan(state, {today: TODAY, repairCrossSquad: true});
    assert.strictEqual(JSON.stringify([...state.shards], null, 0) + JSON.stringify([...state.avail]), snap);
  });

  it('dry run and apply agree: the same input gives the same output', () => {
    const a = T.plan(makeState().state, {today: TODAY, repairCrossSquad: true});
    const b = T.plan(makeState().state, {today: TODAY, repairCrossSquad: true});
    assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  });
});

describe('topup-demo-season — minutes', () => {
  const xi = ['s1', 's2'];
  const ev = [
    {type: 'change', minute: '60', playerOutId: 's1', playerInId: 'b1'},
    {type: 'red', minute: '75', playerId: 's2'},
  ];
  it('starter subbed off, starter sent off, substitute, unused', () => {
    assert.strictEqual(T.minutesFromEvents('s1', xi, ev), 60);
    assert.strictEqual(T.minutesFromEvents('s2', xi, ev), 75);
    assert.strictEqual(T.minutesFromEvents('b1', xi, ev), 30);
    assert.strictEqual(T.minutesFromEvents('b2', xi, ev), 0);
  });
});

describe('topup-demo-extras — --fill-empty', () => {
  const X = load('TOPUP_EXTRAS', 'topup-demo-extras.js');
  const CLUB = 'C.E. Demo';
  const lead = {id: 'dm_X_coach', roles: ['staff'], isTeamLead: true};
  const m = (id, date, home, away) => ({id, date, time: '18:00', home, away, team: 'A', category: 'amateur', status: date < TODAY ? 'played' : 'upcoming'});
  const matches = [
    m(1, '2026-09-12', CLUB, 'U.E. Horta'),   // played, stub
    m(2, '2026-09-19', 'C.F. Gràcia', CLUB),  // played, a typed plan
    m(3, '2026-09-26', CLUB, 'A.E. Poble-sec'), // played, cleared by the coach
    m(4, '2026-10-17', CLUB, 'F.C. Clot'),    // future, no first leg, stub
    m(5, '2026-10-03', CLUB, 'U.D. Sarrià'),  // played, no note at all
  ];
  const events = {1: [{type: 'goal', side: 'home'}, {type: 'goal', side: 'home'}], 2: [], 3: [], 5: [{type: 'goal', side: 'away'}]};
  const typed = {text: 'Pressió alta a la seva sortida.', updatedAt: '2026-09-18T19:30:00.000Z', updatedBy: 'dm_X_coach'};
  const cleared = {text: '', updatedAt: '2026-09-27T10:00:00.000Z', updatedBy: 'dm_X_coach'};
  const notes = new Map([
    ['1', {matchId: '1', category: 'amateur', team: 'A', firstLegId: null, legDismissed: false}],
    ['2', {matchId: '2', category: 'amateur', team: 'A', pre: typed, videos: [{id: 'v', title: 't', url: 'https://x', phase: 'pre'}]}],
    ['3', {matchId: '3', category: 'amateur', team: 'A', post: cleared}],
    ['4', {matchId: '4', category: 'amateur', team: 'A'}],
  ]);
  const state = {club: {name: CLUB, seasonBoundary: '03-01'},
    shards: new Map([['fa_users__amateur', [lead]], ['fa_matches__amateur', matches], ['fa_match_events__amateur', events]]),
    notes};
  const out = X.plan(state, {today: TODAY, fillEmpty: true});
  const upd = (id) => (out.updates.find((u) => u.id === id) || {}).data;

  it('fills every phase of a played stub, with the debrief the result calls for', () => {
    const u = upd('1');
    assert.ok(u.pre.text && u.post.text);
    assert.strictEqual(u.post.updatedBy, 'dm_X_coach');
    assert.ok(u.post.updatedAt.startsWith('2026-09-12'));
    // 2-0 at home: a win's debrief, never a loss's.
    assert.ok(!/Derrota|oblidar|còmodes/.test(u.post.text), u.post.text);
    assert.ok(Array.isArray(u.videos) && u.videos.length >= 1);
  });

  it('never touches a phase with text, nor the videos a note already has', () => {
    const u = upd('2');
    assert.ok(u, 'the empty phases of note 2 were not filled');
    assert.ok(!('pre' in u) && !('videos' in u));
    assert.ok(u.post.text);
  });

  it('leaves a phase the coach cleared (it has an author) as it is', () => {
    const u = upd('3');
    assert.ok(u && !('post' in u), JSON.stringify(u));
    assert.ok(u.pre.text);
  });

  it('writes nothing on a future fixture with no first leg', () => {
    assert.strictEqual(upd('4'), undefined);
  });

  it('still creates a note where there is none, and touches nothing without the flag', () => {
    assert.ok(out.creates.some((c) => c.id === '5' && c.data.post.text));
    const plain = X.plan(state, {today: TODAY});
    assert.strictEqual(plain.updates.length, 0);
  });

  it('does not write into the notes it was given', () => {
    assert.ok(!notes.get('1').pre && !notes.get('5'));
  });

  it('a second run over the first run\'s result writes nothing', () => {
    const next = new Map(notes);
    out.updates.forEach((u) => next.set(u.id, Object.assign({}, next.get(u.id), u.data)));
    out.creates.forEach((c) => next.set(c.id, c.data));
    // Several seeds, so a half-time note left empty by the draw is in play.
    for (let seed = 1; seed <= 20; seed++) {
      const again = X.plan(Object.assign({}, state, {notes: next}), {today: TODAY, fillEmpty: true, seed});
      assert.strictEqual(again.updates.length, 0, `seed ${seed}: ${JSON.stringify(again.updates[0])}`);
    }
  });
});

describe('topup-demo-plans', () => {
  const PL = load('TOPUP_PLANS', 'topup-demo-plans.js');
  // The app's own normaliser, run over what the script writes.
  // eslint-disable-next-line no-new-func
  const stdPlan = new Function(
      grabApp('function _planId(prefix)', '/** Fisher–Yates on a COPY') +
      grabApp('const STP_DEFAULT_MINS = 15;', '/**\n   * When each block starts') +
      '; return stdPlan;')();

  const {state, A, B} = makeState();
  const typed = {blocks: [{id: 'b', mins: 30, label: '', items: [{id: 'e', title: 'Meu', desc: '', tag: '', boardId: ''}]}]};
  const training = state.shards.get('fa_training__amateur').map((t) =>
    t.id === 'tr_1001' ? Object.assign({}, t, {plan: typed, plannedRpe: 9}) :
    // A coach set the load and the end, but drew no plan yet.
    t.id === 'tr_0922' ? Object.assign({}, t, {plannedRpe: 4, endTime: '21:15'}) : t).concat([
    // Outside the window, either side.
    {id: 'tr_0901', date: '2026-09-01', time: '20:00', focus: 'Rondos', status: 'upcoming', category: 'amateur'},
    {id: 'tr_1105', date: '2026-11-05', time: '20:00', focus: 'Rondos', status: 'upcoming', category: 'amateur'},
  ]);
  const st = {club: state.club, shards: new Map(state.shards)};
  st.shards.set('fa_training__amateur', training);
  const out = PL.plan(st, {today: TODAY});
  const rows = out.shards[0].value;
  const row = (id) => rows.find((t) => t.id === id);

  it('plans the sessions in the window that have none, and only those', () => {
    ['tr_0915', 'tr_0922', 'tr_0924', 'tr_0929', 'tr_1013', 'tr_1015'].forEach((id) => assert.ok(row(id).plan, id));
    assert.deepStrictEqual(row('tr_1001').plan, typed);
    assert.strictEqual(row('tr_1001').plannedRpe, 9);
    assert.strictEqual(out.summary.skippedHasPlan, 1);
    assert.ok(!row('tr_0901').plan && !row('tr_1105').plan, 'planned outside the window');
  });

  it('keeps the load and end a coach already set', () => {
    assert.ok(row('tr_0922').plan);
    assert.strictEqual(row('tr_0922').plannedRpe, 4);
    assert.strictEqual(row('tr_0922').endTime, '21:15');
  });

  it('the rondo and the game carry the bib teams; the warm-up does not', () => {
    const t = row('tr_0924');
    const tagged = (tag) => t.plan.blocks.find((b) => b.items[0].tag === tag).items[0];
    ['Rondo', 'Partit'].forEach((tag) => {
      assert.ok(Array.isArray(tagged(tag).teams) && tagged(tag).teams.length >= 2, tag);
      assert.ok(tagged(tag).teams.every((g) => g.color && g.ids.length));
    });
    assert.strictEqual(tagged('Escalfament').teams, null);
  });

  it('survives the app\'s stdPlan untouched: every block, item and team', () => {
    rows.filter((t) => t.plan && t.id !== 'tr_1001').forEach((t) => {
      const n = stdPlan(t);
      assert.strictEqual(n.blocks.length, t.plan.blocks.length);
      n.blocks.forEach((b, i) => {
        const raw = t.plan.blocks[i];
        assert.strictEqual(b.mins, raw.mins);
        assert.strictEqual(b.items.length, raw.items.length);
        assert.strictEqual(b.id, raw.id);
        b.items.forEach((e, k) => {
          assert.strictEqual(e.title, raw.items[k].title);
          assert.ok(e.title && e.desc);
          assert.deepStrictEqual(e.teams, raw.items[k].teams);
        });
      });
      assert.deepStrictEqual(n.duty.ids, t.plan.duty.ids);
      assert.deepStrictEqual(n.petos, t.plan.petos);
      assert.strictEqual(n.extra.length, t.plan.extra.length);
      if (t.plan.teams) assert.strictEqual(n.teams.groups.length, t.plan.teams.n);
    });
  });

  it('runs ninety minutes, ends ninety minutes after the start, plans an RPE', () => {
    const t = row('tr_0929');
    assert.strictEqual(t.plan.blocks.reduce((s, b) => s + b.mins, 0), 90);
    assert.strictEqual(t.endTime, '21:30');
    assert.ok(t.plannedRpe >= 3 && t.plannedRpe <= 10);
  });

  it('puts in the bibs only players called to the session and fit that day', () => {
    const ids = (t) => t.plan.teams.groups.reduce((a, g) => a.concat(g.ids), []);
    // 09-29 is A only.
    const t29 = ids(row('tr_0929'));
    assert.ok(t29.length >= 18 && t29.every((u) => A.includes(u)));
    // 09-24 excludes A[5].
    assert.ok(!ids(row('tr_0924')).includes(A[5]));
    // B[4] has an open injury: never in a bib team.
    rows.filter((t) => t.plan && t.plan.teams).forEach((t) => assert.ok(!ids(t).includes(B[4]), t.id));
    // Every player once.
    assert.strictEqual(new Set(t29).size, t29.length);
  });

  it('gives every block and exercise its own id', () => {
    const all = [];
    rows.filter((t) => t.plan && t.id !== 'tr_1001').forEach((t) => t.plan.blocks.forEach((b) => {
      all.push(b.id); b.items.forEach((e) => all.push(e.id));
    }));
    assert.strictEqual(new Set(all).size, all.length);
  });

  it('a second run plans nothing', () => {
    const again = PL.plan({club: st.club, shards: new Map([...st.shards, ['fa_training__amateur', rows]])}, {today: TODAY});
    assert.strictEqual(again.summary.planned, 0);
    assert.strictEqual(again.shards.length, 0);
  });
});

describe('topup-demo-metrics', () => {
  const M = load('TOPUP_METRICS', 'topup-demo-metrics.js');
  // eslint-disable-next-line no-new-func
  const plmSlug = new Function(grabApp('function plmSlug(name)', 'function getMetricCatalog()') + '; return plmSlug;')();
  const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');

  const {state, A, B} = makeState();
  const metrics = new Map([
    // A reading a coach already took: never duplicated.
    ['x1', {uid: A[0], metricId: 'weight', slug: 'weight', name: 'Pes', unit: 'kg', value: 80.1, date: '2026-03-02'}],
  ]);
  const catalog = [{id: 'm_coach', slug: 'cmj', name: 'CMJ', unit: 'cm', category: 'amateur', team: 'A'}];
  const st = {club: state.club, shards: new Map(state.shards), metrics};
  st.shards.set('fa_metric_catalog__amateur', catalog);
  // A test day the stale-injured A[3] cannot have made (he was out all summer).
  const out = M.plan(st, {today: TODAY});
  const recsOf = (uid, slug) => out.records.filter((r) => r.data.uid === uid && r.data.slug === slug)
      .sort((a, b) => a.data.date.localeCompare(b.data.date));

  it('names its tests with the slug the app\'s plmSlug would make', () => {
    M.TESTS.forEach((t) => assert.strictEqual(plmSlug(t.name), t.slug));
  });

  it('adds the tests to each squad\'s catalogue, keeping a squad\'s own', () => {
    const cat = out.catalog.find((c) => c.id === 'fa_metric_catalog__amateur').value;
    ['A', 'B'].forEach((letter) => M.TESTS.forEach((t) => {
      const rows = cat.filter((m) => m.slug === t.slug && m.team === letter && m.category === 'amateur');
      assert.strictEqual(rows.length, 1, `${letter} ${t.slug}`);
      assert.ok(/^m_/.test(rows[0].id) && rows[0].name && rows[0].unit);
    }));
    assert.ok(cat.some((m) => m.id === 'm_coach'), 'the coach\'s own CMJ was replaced');
    // A's CMJ readings point at the coach's row.
    assert.ok(recsOf(A[1], 'cmj').every((r) => r.data.metricId === 'm_coach'));
    assert.ok(recsOf(B[1], 'cmj').every((r) => r.data.metricId !== 'm_coach'));
  });

  it('weighs every player every second Monday, in kilos, as the built-in', () => {
    const w = recsOf(A[2], 'weight');
    assert.ok(w.length >= 12, `${w.length} weigh-ins`);
    w.forEach((r) => {
      assert.strictEqual(r.data.metricId, 'weight');
      assert.strictEqual(r.data.unit, 'kg');
      assert.strictEqual(new Date(r.data.date + 'T12:00:00').getDay(), 1);
      assert.ok(r.data.value > 50 && r.data.value < 100, r.data.value);
    });
    // No week jumps by more than a couple of kilos.
    for (let i = 1; i < w.length; i++) assert.ok(Math.abs(w[i].data.value - w[i - 1].data.value) < 2.5);
    [...A, ...B].forEach((u) => assert.ok(recsOf(u, 'weight').length, u));
  });

  it('never duplicates a reading already on record', () => {
    assert.ok(!recsOf(A[0], 'weight').some((r) => r.data.date === '2026-03-02'));
    assert.ok(recsOf(A[0], 'weight').length > 5);
  });

  it('records height once for seniors', () => {
    [...A, ...B].forEach((u) => {
      const h = recsOf(u, 'height');
      assert.strictEqual(h.length, 1, u);
      assert.ok(h[0].data.value >= 160 && h[0].data.value <= 200 && h[0].data.unit === 'cm');
    });
  });

  it('tests only players fit that day', () => {
    const injured = recsOf(A[3], 'cmj').map((r) => r.data.date);
    // A[3] was out from July until mid-September.
    assert.ok(!injured.some((d) => d >= '2026-07-22' && d <= '2026-09-15'), injured.join(' '));
    assert.ok(recsOf(A[1], 'cmj').length >= 2 && recsOf(A[1], 'yo-yo-ir1').length >= 2);
  });

  it('writes the record shape db.js reads, under the app\'s doc id', () => {
    const fieldsRead = dbSrc.match(/playerMetrics:[\s\S]*?return \{([^}]*)\}/)[1]
        .split(',').map((s) => s.split(':')[0].trim()).filter(Boolean).sort();
    out.records.slice(0, 50).forEach((r) => {
      assert.deepStrictEqual(Object.keys(r.data).sort(), fieldsRead);
      assert.ok(r.id.startsWith(`${r.data.uid}_${r.data.metricId}_${r.data.date}_`), r.id);
    });
    assert.strictEqual(new Set(out.records.map((r) => r.id)).size, out.records.length);
  });

  it('a second run writes nothing', () => {
    const m2 = new Map(metrics);
    out.records.forEach((r) => m2.set(r.id, r.data));
    const shards = new Map(st.shards);
    out.catalog.forEach((c) => shards.set(c.id, c.value));
    const again = M.plan({club: st.club, shards, metrics: m2}, {today: TODAY});
    assert.strictEqual(again.records.length, 0);
    assert.strictEqual(again.catalog.length, 0);
  });
});
