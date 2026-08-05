/* Unit tests for buildSeason()'s --add-team options.
 *
 * Pure logic, no emulator and no Firebase: `npm run test:multiteam`.
 *
 * `test/seed-add-team.test.js` proves the MERGE cannot lose the squad that
 * is already there. This file proves the generator cannot produce a squad
 * that collides with it in the first place — the other half of the same
 * guarantee, and the half that fails silently.
 *
 * Every one of these id spaces is shared:
 *   names      two squads in one club must not field the same man
 *   uids       Auth accounts, and the key every record refers to
 *   emails     the roster lists, and how a member is resolved server-side
 *   match ids  amateur-A and amateur-B share fa_matches__amateur
 *
 * The coach is the opposite case: he is CLUB-wide and must stay exactly one
 * account across every run, or the second one collides on his email.
 *
 * The whole generation section is sliced out and evaluated because the
 * module opens a Firebase connection at require() time.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const utils = require(path.join(__dirname, '..', 'js', 'utils.js'));
const src = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'seed-demo-club.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found: ' + from);
  return src.slice(i, j);
}

/** The pure generation half of the script, from the RNG to the self-checks. */
function loadGenerator(opts) {
  const OPTS = Object.assign({
    name: 'Demo', leadEmail: 'coach@demo.test', physioEmail: 'fisio@demo.test',
    domain: 'demo.test', password: 'x', players: 25, asOf: '2026-08-04',
    boundary: null, category: 'amateur', letter: 'A',
  }, opts);
  // ASCII markers only: the section headings use box-drawing characters.
  const code = grab('function mulberry32(seed)', 'function selfCheck(S)');
  // eslint-disable-next-line no-new-func
  const mod = new Function('OPTS', 'path', 'localDateStr', 'seasonStartStr',
      'setSeasonBoundary', 'BODY_ZONES', 'GROUP_SUBS', 'STORAGE_BUCKET', `
    let failures = 0;
    const SEP = '  ';
    const log = () => {}; const step = () => {};
    const ok = () => {}; const bad = () => { failures++; };
    const userError = (m) => Object.assign(new Error(m), { userError: true });
    ${code}
    return { buildSeason, assignFaces };`)(
      OPTS, path, utils.localDateStr, utils.seasonStartStr,
      utils.setSeasonBoundary, utils.BODY_ZONES, utils.GROUP_SUBS, 'bucket.test');
  return { OPTS, ...mod };
}

/* buildSeason() calls setSeasonBoundary(), and that is MODULE state shared
   by every test in the process — utils.test.js asserts the default and runs
   in the same run. These builds happen while the file loads, before any
   mocha hook could undo them, so each one restores the default itself. */
function restoring(fn) {
  try { return fn(); } finally { utils.setSeasonBoundary(null); }
}

/** Build one team the way addTeams() does. */
function team(cat, letter, extra) {
  return restoring(() => buildTeam(cat, letter, extra));
}

function buildTeam(cat, letter, extra) {
  const g = loadGenerator({ category: cat, letter });
  const salt = { 'amateur-B': 101, 'juvenil-A': 202 }[`${cat}-${letter}`] || 1;
  const S = g.buildSeason(`dm_CLUB123456_${cat}${letter}_`, Object.assign({
    seed: 20260803 + salt,
    emailPrefix: `${cat}${letter.toLowerCase()}-`,
    staffUidPrefix: 'dm_CLUB123456_',
    matchIdOffset: salt,
  }, extra));
  return { S, g };
}

/** The first team, as the original --apply mode builds it. */
function baseTeam() {
  return restoring(() => {
    const g = loadGenerator({ category: 'amateur', letter: 'A' });
    return { S: g.buildSeason('dm_CLUB123456_'), g };
  });
}

describe('--add-team — the generator keeps the id spaces apart', () => {
  const base = baseTeam();
  const shared = new Set(base.S.players.map((p) => p.name));
  const b = team('amateur', 'B', { usedNames: shared });
  const j = team('juvenil', 'A', { usedNames: shared });

  it('generates the squad it was asked for', () => {
    assert.strictEqual(b.S.players.length, 25);
    assert.strictEqual(j.S.players.length, 25);
  });

  it('never repeats a name across the whole club', () => {
    const all = base.S.players.concat(b.S.players, j.S.players).map((p) => p.name);
    assert.strictEqual(new Set(all).size, 75,
        'a shared usedNames set is the only thing preventing this');
  });

  it('gives every player a unique uid', () => {
    const all = base.S.players.concat(b.S.players, j.S.players).map((p) => p.uid);
    assert.strictEqual(new Set(all).size, 75);
  });

  it('gives every player a unique email', () => {
    const all = base.S.players.concat(b.S.players, j.S.players).map((p) => p.email);
    assert.strictEqual(new Set(all).size, 75);
    assert.ok(b.S.players[0].email.startsWith('amateurb-player01@'));
    assert.ok(j.S.players[0].email.startsWith('juvenila-player01@'));
  });

  it('keeps the coach as ONE club-wide account', () => {
    // A per-team coach uid would collide on his email the moment the second
    // team is added, and ensureAccount cannot recover from that.
    const coach = (t) => t.S.staff.find((s) => s.isLead);
    assert.strictEqual(coach(b).uid, 'dm_CLUB123456_coach');
    assert.strictEqual(coach(b).uid, coach(j).uid);
    assert.strictEqual(coach(b).uid, coach(base).uid);
    assert.strictEqual(coach(b).email, coach(base).email);
  });

  it('separates match ids inside the shared fa_matches shard', () => {
    // amateur-A and amateur-B land in fa_matches__amateur together.
    const ids = base.S.matches.map((m) => m.id);
    const bIds = b.S.matches.map((m) => m.id);
    assert.strictEqual(new Set(ids.concat(bIds)).size, ids.length + bIds.length);
  });

  it('stamps the team letter on every match', () => {
    assert.ok(b.S.matches.every((m) => m.team === 'B'));
    assert.ok(j.S.matches.every((m) => m.team === 'A'));
  });

  it('stamps the category on every player and match', () => {
    assert.ok(j.S.matches.every((m) => m.category === 'juvenil'));
    assert.strictEqual(j.S.cat, 'juvenil');
  });

  it('produces genuinely different squads, not the same 25 renamed', () => {
    const pos = (S) => S.players.map((p) => p.position).join(',');
    const dob = (S) => S.players.map((p) => p.dob).join(',');
    assert.notStrictEqual(dob(b.S), dob(base.S), 'a different seed per team');
    assert.strictEqual(pos(b.S), pos(base.S), 'but the same position plan');
  });
});

describe('--add-team — a second team in a category reuses its calendar', () => {
  const base = baseTeam();
  const shared = new Set();
  const b = team('amateur', 'B', { usedNames: shared, trainings: base.S.trainings });

  it('adopts the existing sessions rather than inventing its own', () => {
    // fa_training is routed by category with NO team letter, so generating
    // a second calendar would duplicate or replace the first team's.
    assert.deepStrictEqual(b.S.trainings.map((t) => t.id),
        base.S.trainings.map((t) => t.id));
  });

  it('still gives its own players their own attendance and RPE', () => {
    const mine = new Set(b.S.players.map((p) => p.uid));
    assert.ok(b.S.trainingAvail.length > 0);
    assert.ok(b.S.trainingAvail.every((a) => mine.has(a.uid)),
        'never writes an attendance row for the other squad');
    assert.ok(b.S.rpe.every((r) => mine.has(r.uid)));
  });

  it('attaches attendance only to sessions that exist', () => {
    const dates = new Set(base.S.trainings.map((t) => t.date));
    assert.ok(b.S.trainingAvail.every((a) => dates.has(a.date)));
  });

  it('sorts an out-of-order calendar before using it', () => {
    // The stored shard is newest-first by its route; nextTrainings takes the
    // FIRST three upcoming, so descending input would pick the wrong ones.
    const reversed = base.S.trainings.slice().reverse();
    const r = team('amateur', 'B', { usedNames: new Set(), trainings: reversed });
    const dates = r.S.trainings.map((t) => t.date);
    assert.deepStrictEqual(dates, dates.slice().sort());
  });

  it('generates a full calendar when the category has none', () => {
    const j = team('juvenil', 'A', { usedNames: new Set() });
    assert.ok(j.S.trainings.length > 50, 'a whole season of sessions');
    assert.ok(j.S.trainings.every((t) => t.category === 'juvenil'));
  });
});

/* The letter has to travel WITH the season, not be read back off OPTS.
   addTeams() builds several teams in one process and mutates OPTS between
   them, so anything reading it after the loops sees the last team's letter.
   That is what made the dry run announce amateur-B as "team A" — the data
   was correct, but only because every read happened to sit inside the loop
   that had just set it. One reordering away from a real bug. */
describe('--add-team — the team letter travels with the season', () => {
  const b = team('amateur', 'B', { usedNames: new Set() });
  const j = team('juvenil', 'A', { usedNames: new Set() });

  it('is stamped on the season object', () => {
    assert.strictEqual(b.S.letter, 'B');
    assert.strictEqual(j.S.letter, 'A');
  });

  it('survives another team being built afterwards', () => {
    // The second build mutates OPTS. The first season must not notice.
    team('cadet', 'C', { usedNames: new Set() });
    assert.strictEqual(b.S.letter, 'B', 'a later build reached back in time');
    assert.ok(b.S.matches.every((m) => m.team === 'B'));
  });

  /* The two functions that run AFTER every team has been built are the ones
     that must not reach for OPTS. Reads inside buildSeason are fine — OPTS
     is correct at that moment, and stamping S.letter is the whole point. */
  ['function buildShards(S)', 'function report(S, docs)'].forEach((marker) => {
    it(`${marker.slice(9, marker.indexOf('('))} does not read OPTS.letter`, () => {
      const body = grab(marker, '\n// =====');
      assert.ok(!body.includes('OPTS.letter'),
          'runs after the build loops, so OPTS holds the LAST team\'s letter');
    });
  });
});
