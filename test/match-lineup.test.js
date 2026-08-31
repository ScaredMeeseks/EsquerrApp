/* The past line-up — what each player did in the match.
 *
 * Roadmap item 17. The line-up used to be the starting state and nothing
 * more: a flat list sorted by position with a ★ on the eleven who
 * started. Every substitution, goal and card was already recorded against
 * the match and rendered in the timeline beside it, just never joined
 * back to the players.
 *
 * `matchPlayerMarks` is that join, and it is pure — events in, record
 * out — so this file RUNS it rather than grepping for it. That matters
 * more than usual here: the rules it encodes are the ones a scoresheet
 * gets wrong. An own goal is not a goal. An opponent's booking is not our
 * player's. A second yellow is the LATER of two, not the earlier.
 *
 * `npm run test:lineup`, or as part of test:unit.
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

/* The derivation and the ordinal rule it leans on, run for real over
   stubs. `isOurTeam` is injected rather than sliced because it reads the
   club config through two more layers; which side is ours is exactly the
   axis these tests vary, so a stub is the honest way to control it. */
function load(ourClub) {
  const code =
    grab('  function parseEventMinute(min)', '  function countYellowCards') +
    grab('  function yellowOrdinals(events)', '  /**\n   * Every mark OUR players') +
    grab('  function matchPlayerMarks(m, events)', '  /**\n   * One player\'s marks');
  // eslint-disable-next-line no-new-func
  return new Function('isOurTeam', `
    ${code}
    return { matchPlayerMarks, yellowOrdinals, parseEventMinute };`)(
      (name) => name === ourClub);
}

const HOME = {id: 'm1', home: 'Esquerra', away: 'Rival'};
const AWAY = {id: 'm2', home: 'Rival', away: 'Esquerra'};
const API = load('Esquerra');

/** Our side of `HOME` is 'home'; of `AWAY` it is 'away'. */
const ev = (o) => Object.assign({side: 'home', minute: ''}, o);

describe('matchPlayerMarks — goals', () => {
  it('records every goal with its minute, not a count', () => {
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'goal', playerId: 'p1', minute: '12', goalType: 'jugada_oberta'}),
      ev({type: 'goal', playerId: 'p1', minute: '55', goalType: 'penal'})
    ]);
    /* Minutes, because the row prints the minute — "⚽ 12' ⚽ 55'" says
       more on a team sheet than "⚽ ×2". */
    assert.deepStrictEqual(marks.p1.goals, ['12', '55']);
  });

  it('an own goal is NOT a goal for its scorer', () => {
    /* own_goal is a separate type that credits the OTHER side
       (calcMatchScore). Folding it in would show a player who put one
       through his own net as having scored. */
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'own_goal', playerId: 'p1', minute: '30'})
    ]);
    assert.deepStrictEqual(marks.p1.goals, []);
    assert.deepStrictEqual(marks.p1.ownGoals, ['30']);
  });

  it('credits the assist to the assister, not the scorer', () => {
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'goal', playerId: 'p1', minute: '41',
          goalType: 'jugada_oberta', goalDetail: 'assistencia', assistPlayerId: 'p2'})
    ]);
    assert.deepStrictEqual(marks.p1.goals, ['41']);
    assert.deepStrictEqual(marks.p1.assists, []);
    assert.deepStrictEqual(marks.p2.assists, ['41']);
  });

  it('a penalty carries no assist even if the field is set', () => {
    /* The add-form can only reach assistPlayerId through
       jugada_oberta + assistencia, so a penalty with one is malformed
       data — and the derivation follows the same rule the form does. */
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'goal', playerId: 'p1', minute: '20',
          goalType: 'penal', assistPlayerId: 'p2'})
    ]);
    assert.strictEqual(marks.p2, undefined);
  });
});

describe('matchPlayerMarks — cards', () => {
  it('a single yellow is ordinal 1', () => {
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'yellow', playerId: 'p1', minute: '67'})
    ]);
    assert.deepStrictEqual(marks.p1.yellows, [{minute: '67', ordinal: 1}]);
  });

  it('the SECOND yellow is the later one', () => {
    /* The bug this replaced: the rule lived inside matchTimelineHtml,
       which walks its events sorted DESCENDING by minute and marked the
       one where a running count reached the total — on a descending walk
       that is the EARLIEST yellow. A player booked at 30' and 70' had the
       "2" drawn on his 30' card, so the timeline said he was sent off
       before his first offence. */
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'yellow', playerId: 'p1', minute: '30'}),
      ev({type: 'yellow', playerId: 'p1', minute: '70'})
    ]);
    const byMin = {};
    marks.p1.yellows.forEach((y) => { byMin[y.minute] = y.ordinal; });
    assert.strictEqual(byMin['30'], 1, "the 30' booking is his first");
    assert.strictEqual(byMin['70'], 2, "the 70' booking is his second");
  });

  it('orders by minute even when the events arrive out of order', () => {
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'yellow', playerId: 'p1', minute: '80'}),
      ev({type: 'yellow', playerId: 'p1', minute: '10'})
    ]);
    const byMin = {};
    marks.p1.yellows.forEach((y) => { byMin[y.minute] = y.ordinal; });
    assert.strictEqual(byMin['10'], 1);
    assert.strictEqual(byMin['80'], 2);
  });

  it('stoppage time sorts inside its half, not after it', () => {
    // parseEventMinute encodes "45+2" as 45.02, so it precedes 46.
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'yellow', playerId: 'p1', minute: '46'}),
      ev({type: 'yellow', playerId: 'p1', minute: '45+2'})
    ]);
    const byMin = {};
    marks.p1.yellows.forEach((y) => { byMin[y.minute] = y.ordinal; });
    assert.strictEqual(byMin['45+2'], 1);
    assert.strictEqual(byMin['46'], 2);
  });

  it('two players booked once each are both firsts', () => {
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'yellow', playerId: 'p1', minute: '20'}),
      ev({type: 'yellow', playerId: 'p2', minute: '40'})
    ]);
    assert.strictEqual(marks.p1.yellows[0].ordinal, 1);
    assert.strictEqual(marks.p2.yellows[0].ordinal, 1);
  });

  it('a red is a single minute, not a list', () => {
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'red', playerId: 'p1', minute: '88'})
    ]);
    assert.strictEqual(marks.p1.red, '88');
  });
});

describe('matchPlayerMarks — substitutions', () => {
  it('carries both ends of the swap to the right players', () => {
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'change', playerOutId: 'p1', playerInId: 'p2', minute: '71'})
    ]);
    assert.strictEqual(marks.p1.off, '71');
    assert.strictEqual(marks.p2.on, '71');
    assert.strictEqual(marks.p1.on, null);
    assert.strictEqual(marks.p2.off, null);
  });

  it('one player can come on and go off again', () => {
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'change', playerOutId: 'p0', playerInId: 'p1', minute: '60'}),
      ev({type: 'change', playerOutId: 'p1', playerInId: 'p9', minute: '80'})
    ]);
    assert.strictEqual(marks.p1.on, '60');
    assert.strictEqual(marks.p1.off, '80');
  });

  it('a substitution never lands on ev.playerId', () => {
    /* The add-form explicitly skips playerId for a change; anything
       reading it would attribute the swap to nobody. */
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'change', playerOutId: 'p1', playerInId: 'p2', minute: '55'})
    ]);
    assert.deepStrictEqual(Object.keys(marks).sort(), ['p1', 'p2']);
  });
});

describe('matchPlayerMarks — which side is ours', () => {
  it('ignores the opponent when we are home', () => {
    /* `ev.side` is POSITIONAL — 'home' or 'away', never "ours". Reading
       it as "ours" would put the opponent's bookings on our players. */
    const marks = API.matchPlayerMarks(HOME, [
      ev({side: 'away', type: 'yellow', playerNumber: '7', minute: '20'}),
      ev({side: 'away', type: 'goal', playerNumber: '9', minute: '30'})
    ]);
    assert.deepStrictEqual(marks, {});
  });

  it('a CLUB DERBY keeps the two teams apart', () => {
    /* The case that makes the side guard load-bearing, and the one the
       first version of this test missed: an ordinary opponent's events
       carry shirt numbers and no uid, so dropping the guard changed
       nothing and the mutation survived.
       A club with two teams can field both in one fixture — then BOTH
       sides are ours, with real uids on each. Without the guard the B
       team's goals land on the A team's sheet. */
    const derby = {id: 'm3', home: 'Esquerra', away: 'Esquerra'};
    const marks = API.matchPlayerMarks(derby, [
      ev({side: 'home', type: 'goal', playerId: 'p1', minute: '10'}),
      ev({side: 'away', type: 'goal', playerId: 'p2', minute: '20'}),
      ev({side: 'away', type: 'red', playerId: 'p3', minute: '80'})
    ]);
    assert.deepStrictEqual(Object.keys(marks), ['p1'],
        'only the side we are reading should appear');
  });

  it('reads the AWAY side when we are the away team', () => {
    const marks = API.matchPlayerMarks(AWAY, [
      ev({side: 'away', type: 'goal', playerId: 'p1', minute: '30'}),
      ev({side: 'home', type: 'goal', playerNumber: '9', minute: '60'})
    ]);
    assert.deepStrictEqual(marks.p1.goals, ['30']);
    assert.deepStrictEqual(Object.keys(marks), ['p1']);
  });

  it('an opponent yellow does not raise OUR player to a second', () => {
    /* Both sides can field a number 7, and yellowOrdinals keys on the
       side for exactly that reason.

       The opponent's card is deliberately the EARLIER of the two. With
       the side dropped from the key both bookings merge, and our
       player's — being the later — becomes ordinal 2: he is drawn as
       sent off for someone else's foul. Ordering it the other way round
       let the mutation survive, because our man stayed ordinal 1. */
    const marks = API.matchPlayerMarks(HOME, [
      ev({side: 'away', type: 'yellow', playerNumber: 'p1', minute: '20'}),
      ev({side: 'home', type: 'yellow', playerId: 'p1', minute: '40'})
    ]);
    assert.strictEqual(marks.p1.yellows.length, 1);
    assert.strictEqual(marks.p1.yellows[0].ordinal, 1,
        "our player's only booking is his first");
  });
});

describe('matchPlayerMarks — the quiet cases', () => {
  it('no events yields no records at all', () => {
    assert.deepStrictEqual(API.matchPlayerMarks(HOME, []), {});
    assert.deepStrictEqual(API.matchPlayerMarks(HOME, null), {});
  });

  it('a player with no events has no entry, so his row draws nothing', () => {
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'goal', playerId: 'p1', minute: '12'})
    ]);
    assert.strictEqual(marks.p2, undefined);
  });

  it('penal_fallat and pal are deliberately not marks', () => {
    /* Recorded and drawn in the timeline, but they feed no summary
       anywhere in the app — and a missed penalty on a team sheet is a
       call nobody has asked for. */
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'penal_fallat', playerId: 'p1', minute: '20'}),
      ev({type: 'pal', playerId: 'p1', minute: '40'})
    ]);
    assert.deepStrictEqual(marks.p1.goals, []);
    assert.strictEqual(marks.p1.red, null);
    assert.deepStrictEqual(marks.p1.yellows, []);
  });

  it('an event with no minute still records the player', () => {
    // `minute` is optional in the add-form; the mark shows with no time.
    const marks = API.matchPlayerMarks(HOME, [
      ev({type: 'goal', playerId: 'p1', minute: ''})
    ]);
    assert.deepStrictEqual(marks.p1.goals, ['']);
  });
});

describe('the rule lives in one place', () => {
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* Slice a function body out of the COMMENT-STRIPPED source, bounded by
     the next declaration at the same indent.

     ⚠ The first version of this bounded matchMarksHtml on `\n  /**` — a
     comment opener, in a string whose comments have just been removed.
     It found nothing nearby and ran on for thousands of lines, swallowing
     other functions that legitimately call getEventIcon, so a mutation
     that tore the call OUT of matchMarksHtml still satisfied the
     assertion. board3d-menu.test.js records the same mistake twice. */
  function fn(name) {
    const i = bare.indexOf('function ' + name);
    assert.notStrictEqual(i, -1, name + ' not found in js/app.js');
    const lineStart = bare.lastIndexOf('\n', i) + 1;
    const indent = bare.slice(lineStart, i).match(/^\s*/)[0];
    const j = bare.indexOf('\n' + indent + 'function ', i + 10);
    return bare.slice(i, j === -1 ? bare.length : j);
  }

  it('the timeline asks yellowOrdinals rather than counting again', () => {
    /* Two copies of a rule this fiddly is how the timeline and the team
       sheet come to disagree about who was sent off — and the copy that
       was here had the badge on the wrong card. */
    const body = fn('matchTimelineHtml');
    assert.ok(/yellowOrdinals\(events\)/.test(body),
        'matchTimelineHtml must use the shared ordinal helper');
    assert.ok(!/yellowCounts/.test(body) && !/yellowSeen/.test(body),
        'the old two-pass count must be gone, not merely bypassed');
  });

  it('the marks strip draws through getEventIcon', () => {
    /* The only icon source in the app. A second one would let the team
       sheet and the timeline draw the same event differently. */
    const body = fn('matchMarksHtml');
    assert.ok(/getEventIcon\(ev, ord \|\| 0\)/.test(body),
        'marks must draw through the shared icon factory');
    /* The sub arrows are the documented exception: getEventIcon's
       'change' glyph is one icon for the whole swap, and a team sheet has
       to say which END of it this player was. */
    assert.ok(/pm-on/.test(body) && /pm-off/.test(body),
        'on and off need their own marks');
  });

  it('the line-up intersects startingXI with the called-up list', () => {
    /* convSentEntry() overwrites `players` and never re-filters the XI,
       so a player dropped from the call-up is still in it. The flat list
       simply never drew him; grouping by XI would turn that into a ghost
       row. Same reason `Titulars: 12/11` is reachable. */
    const i = bare.indexOf('const starters = calledPlayers.filter');
    assert.notStrictEqual(i, -1,
        'starters must be filtered FROM calledPlayers, not read off startingXI');
    const body = bare.slice(i, i + 400);
    assert.ok(/const bench = calledPlayers\.filter/.test(body),
        'and the bench likewise');
  });

  it('marks appear on events, not on the clock', () => {
    /* A fixture logged days later still reads correctly, and a match that
       kicked off ten minutes ago does not sprout an empty split. */
    const i = bare.indexOf('const detailEvents = getMatchEvents(m.id);');
    assert.notStrictEqual(i, -1, 'the called-up block must read the events');
    const body = bare.slice(i, i + 220);
    assert.ok(/detailEvents\.length \? matchPlayerMarks/.test(body),
        'the split must be gated on there being events');
  });

  it('the briefing chips are given their own leg’s events', () => {
    /* The CALL, not the declaration. `mnLineupChipsHtml(m, users, events)`
       matched `function mnLineupChipsHtml(m, users, events)` — so the
       assertion was satisfied by the signature while the caller passed
       two arguments and every chip rendered bare. */
    assert.ok(/mnLineupChipsHtml\(first, users, events\)/.test(bare),
        "the briefing must pass the first leg's events to the chips");
    const body = fn('mnLineupChipsHtml');
    assert.ok(/matchPlayerMarks\(m, events\)/.test(body),
        'and the chips must use the same derivation');
  });
});
