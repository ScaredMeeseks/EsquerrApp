/* Unit tests for the readiness ENGINE (v52 covered its presentation).
 *
 * Pure logic, no emulator: `npm run test:rd`.
 *
 * The classifier flagged 76% of the demo squad, which makes it useless as a
 * watch list. That turned out not to be a threshold problem — three defects
 * were doing most of the work, and each is pinned here:
 *
 *   1. Match fatigue never recovered. `lastMatch` is the most recent match
 *      ANYWHERE in the season, so a player who went 90 minutes in March
 *      still scored 40 in August — permanently 15 points below the 75 that
 *      green requires, for every regular starter. It fired on 13 of the 19
 *      flagged players.
 *   2. The score could be silently stale. The acute week is the last week
 *      WITH DATA, not this week, and hasData had no recency test.
 *   3. A missing RPE counted as ZERO load, dragging the chronic mean down
 *      and inflating the next ACWR — a reporting gap read as risk.
 *
 * Thresholds are deliberately untouched, so nothing here asserts one.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const utils = require(path.join(__dirname, '..', 'js', 'utils.js'));

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

const TODAY = '2026-06-15';
const day = (offset) => {
  const d = new Date('2026-06-15T12:00:00');
  d.setDate(d.getDate() + offset);
  return utils.localDateStr(d);
};

/**
 * Build the engine over a fake localStorage.
 * @param {Object} o trainings/matches/rpe/avail/minutes fixtures.
 */
function engine(o) {
  const store = {
    fa_training: JSON.stringify(o.trainings || []),
    fa_matches: JSON.stringify(o.matches || []),
    fa_player_rpe: JSON.stringify(o.rpe || {}),
    fa_training_availability: JSON.stringify(o.avail || {}),
    fa_training_staff_override: '{}',
    fa_match_availability: '{}',
  };
  const sandbox = {
    localStorage: {getItem: (k) => (k in store ? store[k] : null)},
    // The one reader for fa_training. Stubbed rather than sliced: its job
    // is repairing missing session ids, which is not this file's subject.
    getTrainings: () => JSON.parse(store.fa_training || '[]'),
    window: {_renderFrame: Math.random()},
    // Minutes live in the match events, not the RPE. Stubbed rather than
    // rebuilt: the interval arithmetic has its own coverage.
    computePlayerMatchStats: (uid) => ({
      matchRows: Object.keys(o.minutes || {}).map((mid) => ({
        matchId: Number(mid), minutes: (o.minutes[mid] || {})[uid],
      })).filter((r) => typeof r.minutes === 'number'),
    }),
    localDateStr: utils.localDateStr,
    seasonStartStr: utils.seasonStartStr,
    getSeasonWeek: utils.getSeasonWeek,
    Date: class extends Date {
      constructor(...a) { return a.length ? new Date(...a) : new Date(TODAY + 'T12:00:00'); }
      static now() { return new Date(TODAY + 'T12:00:00').getTime(); }
    },
  };
  const code = grab('  function getReadinessData()', '\n  function buildReadinessCard');
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(sandbox), `
    let _readinessDataCache = null, _readinessDataFrame = -1;
    ${code}
    return computeReadiness;`)(...Object.values(sandbox));
}

/** Enough real weekly load that hasData is satisfied. */
function baseTrainings(uid, weeks) {
  const trainings = [];
  const rpe = {};
  const avail = {};
  for (let i = 0; i < (weeks || 4) * 2; i++) {
    const d = day(-(i * 3 + 1));
    trainings.push({id: 'tr' + i, date: d, time: '20:00', category: 'amateur'});
    rpe[uid + '_training_' + d] = {rpe: 6, minutes: 90, date: d};
    avail[uid + '_' + d] = 'yes';
  }
  return {trainings, rpe, avail};
}

describe('readiness — match fatigue recovers', () => {
  /** A 90-minute match `daysAgo` ago, on top of normal training load. */
  function withMatch(daysAgo) {
    const b = baseTrainings('p1');
    const d = day(-daysAgo);
    b.matches = [{id: 1, date: d, category: 'amateur', team: 'A'}];
    b.rpe['p1_match_1'] = {rpe: 8, minutes: 90, date: d};
    return engine(b)('p1').matchFatigueScore;
  }

  it('is heaviest on the day of the match', () => {
    assert.ok(withMatch(0) <= 40, 'day 0 was ' + withMatch(0));
  });

  it('has partly recovered by day 3', () => {
    const d3 = withMatch(3);
    assert.ok(d3 > withMatch(0), 'day 3 must beat day 0');
    assert.ok(d3 < 100, 'day 3 must not be full recovery');
  });

  it('is fully recovered at day 5', () => {
    assert.strictEqual(withMatch(5), 100);
  });

  it('is STILL fully recovered a month later — the defect', () => {
    // Before this, a 90-minute match in March scored 40 in August.
    assert.strictEqual(withMatch(30), 100);
  });

  it('never penalises a player who has not played at all', () => {
    assert.strictEqual(engine(baseTrainings('p1'))('p1').matchFatigueScore, 100);
  });
});

describe('readiness — a stale score stops pretending', () => {
  /** Load that stops `gapDays` before today. */
  function stopping(gapDays) {
    const trainings = [];
    const rpe = {};
    const avail = {};
    for (let i = 0; i < 8; i++) {
      const d = day(-(gapDays + i * 3));
      trainings.push({id: 'tr' + i, date: d, time: '20:00'});
      rpe['p1_training_' + d] = {rpe: 6, minutes: 90, date: d};
      avail['p1_' + d] = 'yes';
    }
    return engine({trainings, rpe, avail})('p1');
  }

  it('still reports while the data is recent', () => {
    assert.strictEqual(stopping(1).hasData, true);
  });

  it('still reports at exactly 10 days', () => {
    assert.strictEqual(stopping(10).hasData, true);
  });

  it('goes to no-data once the last real session is older than 10 days', () => {
    // Otherwise a May score is displayed as today's, for ever.
    assert.strictEqual(stopping(11).hasData, false);
    assert.strictEqual(stopping(60).hasData, false);
  });
});

describe('readiness — a missing RPE borrows from the squad', () => {
  /* p1 attended every session but only reported some. p2 reported all of
     them, so p1 can borrow. */
  function patchy(reportAll) {
    const trainings = [];
    const rpe = {};
    const avail = {};
    for (let i = 0; i < 8; i++) {
      const d = day(-(i * 3 + 1));
      trainings.push({id: 'tr' + i, date: d, time: '20:00'});
      avail['p1_' + d] = 'yes';
      avail['p2_' + d] = 'yes';
      rpe['p2_training_' + d] = {rpe: 7, minutes: 90, date: d};
      if (reportAll || i % 2 === 0) {
        rpe['p1_training_' + d] = {rpe: 7, minutes: 90, date: d};
      }
    }
    return engine({trainings, rpe, avail})('p1');
  }

  it('fills the gap instead of counting the session as zero load', () => {
    assert.strictEqual(patchy(false).estimated, true);
  });

  it('gives nearly the same ACWR as if the player had reported everything', () => {
    // The point of the fix: a reporting gap must not look like a load spike.
    const gap = patchy(false).acwr;
    const full = patchy(true).acwr;
    assert.ok(Math.abs(gap - full) < 0.25,
        'estimated ' + gap + ' vs reported ' + full);
  });

  it('does NOT count borrowed load as evidence the player is monitored', () => {
    // Nobody has reported anything for p3, so every session is borrowed.
    const trainings = [];
    const rpe = {};
    const avail = {};
    for (let i = 0; i < 8; i++) {
      const d = day(-(i * 3 + 1));
      trainings.push({id: 'tr' + i, date: d, time: '20:00'});
      avail['p3_' + d] = 'yes';
      avail['p2_' + d] = 'yes';
      rpe['p2_training_' + d] = {rpe: 7, minutes: 90, date: d};
    }
    const rd = engine({trainings, rpe, avail})('p3');
    assert.strictEqual(rd.hasData, false,
        'a score built entirely from team-mates is a number about nobody');
  });

  it('borrows nothing for a session the player missed', () => {
    const trainings = [];
    const rpe = {};
    const avail = {};
    const d = day(-2);
    trainings.push({id: 'tr0', date: d, time: '20:00'});
    avail['p1_' + d] = 'no';
    rpe['p2_training_' + d] = {rpe: 9, minutes: 90, date: d};
    assert.strictEqual(engine({trainings, rpe, avail})('p1').estimated, false);
  });
});

describe('readiness — match RPE is banded by minutes', () => {
  /* A squad-wide mean would be meaningless: 20 minutes off the bench and a
     full 90 are different sessions. */
  function matchCase(p1Minutes, others) {
    const b = baseTrainings('p1');
    const d = day(-1);
    b.matches = [{id: 7, date: d, category: 'amateur'}];
    b.minutes = {7: Object.assign({p1: p1Minutes}, others.minutes)};
    Object.keys(others.rpe).forEach((uid) => {
      b.rpe[uid + '_match_7'] = {
        rpe: others.rpe[uid], minutes: others.minutes[uid], date: d,
      };
    });
    return engine(b)('p1');
  }

  it('uses only players who played a similar amount', () => {
    const rd = matchCase(90, {
      minutes: {starter: 90, sub: 15},
      rpe: {starter: 9, sub: 3},
    });
    assert.strictEqual(rd.estimated, true);
    // Banded to the 90-minute starter, so the heavy session shows up.
    assert.ok(rd.matchFatigueScore < 100, 'a 90-minute match must register');
  });

  it('falls back to every reporter when nobody played a similar amount', () => {
    const rd = matchCase(45, {minutes: {starter: 90}, rpe: {starter: 9}});
    assert.strictEqual(rd.estimated, true);
  });

  it('estimates nothing when nobody reported the match at all', () => {
    const rd = matchCase(90, {minutes: {}, rpe: {}});
    assert.strictEqual(rd.estimated, false);
  });
});

describe('readiness — low load is not a risk flag', () => {
  /* `acwr >= 0.8` used to sit in the green gate, so a player training below
     their four-week average could NEVER be green — whatever their score, and
     up to a score of 84. Four demo players sat at 77–80 showing amber purely
     for this. The dot means risk-from-load; low load has its own list. */
  function tapering() {
    // Four normal weeks, then a very light one — a taper, or exams.
    const trainings = [];
    const rpe = {};
    const avail = {};
    let i = 0;
    for (let w = 5; w >= 2; w--) {
      for (let k = 0; k < 3; k++, i++) {
        const d = day(-(w * 7 + k * 2));
        trainings.push({id: 'tr' + i, date: d, time: '20:00'});
        rpe['p1_training_' + d] = {rpe: 7, minutes: 90, date: d};
        avail['p1_' + d] = 'yes';
      }
    }
    const light = day(-2);
    trainings.push({id: 'light', date: light, time: '20:00'});
    rpe['p1_training_' + light] = {rpe: 3, minutes: 30, date: light};
    avail['p1_' + light] = 'yes';
    return engine({trainings, rpe, avail})('p1');
  }

  it('reports the player as underloaded', () => {
    const rd = tapering();
    assert.ok(rd.acwr < 0.8, 'fixture should produce a low ACWR, got ' + rd.acwr);
    assert.strictEqual(rd.underloaded, true);
  });

  it('no longer forces the dot off green', () => {
    // The gate must not reject on ACWR being LOW. High is still rejected.
    assert.ok(!src.includes('acwr >= 0.8 && acwr <= 1.3'),
        'the green gate still blocks low load');
  });

  it('never marks a player with no data as underloaded', () => {
    assert.strictEqual(engine({})('nobody').underloaded, false);
  });
});

describe('readiness — a force-red needs the player\'s own numbers', () => {
  /* Self-contained history, so no date collides with another fixture's
     sessions — a duplicate date puts two entries on the same RPE key and
     silently makes "the last two sessions" the same session twice.
     `spec` is [daysAgo, rpe|null] oldest-last; null means he sat it out. */
  function history(spec, opts) {
    const o = opts || {};
    const trainings = [];
    const rpe = {};
    const avail = {};
    spec.forEach(([ago, val], i) => {
      const d = day(-ago);
      trainings.push({id: 's' + i, date: d, time: '20:00'});
      if (val == null) { avail['p1_' + d] = 'no'; return; }
      avail['p1_' + d] = 'yes';
      if (o.imputed) {
        // A team-mate reports so p1 can borrow; p1 himself reports nothing.
        avail['mate_' + d] = 'yes';
        rpe['mate_training_' + d] = {rpe: val, minutes: 90, date: d};
      } else {
        rpe['p1_training_' + d] = {rpe: val, minutes: 90, date: d};
      }
    });
    return engine({trainings, rpe, avail})('p1');
  }

  /** Enough weeks of ordinary load for hasData, then two brutal sessions. */
  const BASE = [[22, 6], [19, 6], [16, 6], [13, 6], [10, 6], [8, 6]];

  /** Two brutal sessions; `real` decides whether they are his. */
  function twoHard(real) {
    return history(BASE.concat([[5, 10], [2, 10]]), {imputed: !real});
  }

  it('fires when the player reported both sessions himself', () => {
    assert.ok(twoHard(true).reasons.includes('hard_sessions'));
  });

  it('does NOT fire on borrowed numbers', () => {
    // Jumping straight to red is the strongest statement the app makes; it
    // should not rest on two numbers he never gave.
    const rd = twoHard(false);
    assert.ok(rd.estimated, 'fixture should be imputing');
    assert.ok(!rd.reasons.includes('hard_sessions'));
  });

  it('still counts the borrowed load toward the score', () => {
    // Imputation feeds the ACWR either way — only the override is gated.
    assert.ok(twoHard(false).acwr > 0);
  });

  /* The pair has to be BACK TO BACK. The rule used to slice the last two
     sessions carrying an RPE, which skips over sessions the player sat out —
     so hard Monday → rest Wednesday → hard Friday read as consecutive, when
     the rest day is exactly the recovery that makes it fine. */
  function hardRestHard(restBetween) {
    const tail = restBetween ?
      [[5, 10], [3, null], [1, 10]] :   // hard · rested · hard
      [[5, 10], [1, 10]];               // hard · hard
    return history(BASE.concat(tail));
  }

  it('fires when the two hard sessions really are consecutive', () => {
    assert.ok(hardRestHard(false).reasons.includes('hard_sessions'));
  });

  it('does NOT fire when the player rested in between', () => {
    assert.ok(!hardRestHard(true).reasons.includes('hard_sessions'),
        'a rest day between them is the recovery that makes the pair fine');
  });
});

describe('readiness — the tooltip can say why', () => {
  it('gives no reasons for a green dot', () => {
    const rd = engine(baseTrainings('p1'))('p1');
    if (rd.color === 'green') assert.deepStrictEqual(rd.reasons, []);
  });

  it('always names at least one reason for orange or red', () => {
    // A dot with no explanation is what made two 72s in different colours
    // read as a bug.
    const b = baseTrainings('p1');
    const d = day(-1);
    b.matches = [{id: 1, date: d, category: 'amateur'}];
    b.rpe['p1_match_1'] = {rpe: 10, minutes: 90, date: d};
    const spike = day(-2);
    b.trainings.push({id: 'spike', date: spike, time: '20:00'});
    b.rpe['p1_training_' + spike] = {rpe: 10, minutes: 200, date: spike};
    b.avail['p1_' + spike] = 'yes';
    const rd = engine(b)('p1');
    if (rd.color !== 'green' && rd.hasData) {
      assert.ok(rd.reasons.length > 0, 'flagged with no reason given');
    }
  });

  it('has a translation for every reason it can emit', () => {
    ['acwr_high', 'acwr_over', 'acwr_low', 'spike', 'trend', 'fatigue',
      'two_matches', 'hard_sessions', 'low_score', 'estimated'].forEach((r) => {
      const i = src.indexOf("'rd." + r + "':");
      assert.ok(i !== -1, 'missing key rd.' + r);
      const line = src.slice(i, src.indexOf('},', i));
      ['ca:', 'es:', 'en:'].forEach((l) =>
        assert.ok(line.includes(l), 'rd.' + r + ' missing ' + l));
    });
  });
});
