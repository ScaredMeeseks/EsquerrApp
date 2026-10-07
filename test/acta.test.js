/* functions/acta.js — turning a closed acta into a match's events (v278).
 *
 * Pure functions, required directly. The rules that matter most:
 *
 *   - a player is linked SILENTLY only when he cannot be anyone else;
 *   - the merge is "FCF wins", but keeps a coach's assist on the same goal;
 *   - the guard's facts ignore uids, so linking a player is not an edit.
 *
 * The parity block at the end runs one table through both this file and the
 * app.js function it mirrors (functions/ deploys alone, so they cannot be
 * one function).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const A = require('../functions/acta');

describe('fcfPersonName — reading "COGNOMS, NOM"', () => {
  const cases = [
    ['CASANOVAS GARCIA, JOSUÉ', 'Josué Casanovas'],
    ['GALINDO ROJAS, JULEN-MARIA', 'Julen-Maria Galindo'],
    ['DE LA FUENTE GARCIA, PABLO', 'Pablo de la Fuente'],
    ['D\'ALMEIDA RUIZ, NIL', 'Nil d\'Almeida'],
    ['BROCO BUENDÍA , MARC', 'Marc Broco'],
    ['FERNÁNDEZ LÓPEZ, JUAN CARLOS ALBERTO', 'Juan Fernández'],
    ['IVÁN', 'Iván'],
  ];
  cases.forEach(([raw, display]) => {
    it(JSON.stringify(raw) + ' → ' + display, () => {
      assert.strictEqual(A.fcfPersonName(raw).display, display);
    });
  });

  it('folds accents and drops particles for matching', () => {
    const p = A.fcfPersonName('DE LA FUENTE MUÑOZ, JOSÉ LUIS');
    assert.deepStrictEqual(p.surnames, ['fuente', 'munoz']);
    assert.deepStrictEqual(p.given, ['jose', 'luis']);
  });

  it('knows a withheld name for what it is', () => {
    ['Jugador/a', 'JUGADOR/A', '', null].forEach((n) => {
      assert.strictEqual(A.fcfPersonName(n).hidden, true, String(n));
    });
  });
});

describe('scoreCandidate — how sure a name match is', () => {
  const tier = (fcf, app) => A.scoreCandidate(A.fcfPersonName(fcf), app);
  it('3 — every app word is in the acta name, given AND surname covered', () => {
    assert.strictEqual(tier('BERNAT QUIROGA, POL', 'Pol Bernat'), 3);
    assert.strictEqual(tier('BERNAT QUIROGA, POL', 'Pol Bernat Quiroga'), 3);
    assert.strictEqual(tier('GALINDO ROJAS, JULEN-MARIA', 'Julen Galindo'), 3);
    assert.strictEqual(tier('PÉREZ MARTÍN, MARC', 'marc perez'), 3);
  });
  it('2 — given and surname match, plus a word the acta does not have', () => {
    assert.strictEqual(tier('BERNAT QUIROGA, POL', 'Pol Bernat (Polet)'), 2);
  });
  it('1 — a hint only: one name, a shortened or translated first name', () => {
    assert.strictEqual(tier('BERNAT QUIROGA, POL', 'Pol'), 1);
    assert.strictEqual(tier('BERNAT QUIROGA, POL', 'Bernat'), 1);
    assert.strictEqual(tier('CHINCHILLA ESCRIBANO, GUILLERMO', 'Guille Chinchilla'), 1);
    assert.strictEqual(tier('BORRAS ZARAGOZA, JUAN', 'Joan'), 1);
  });
  it('a word that is a given name AND a surname cannot count twice', () => {
    assert.strictEqual(tier('MARTÍ PISA, MARTÍ', 'Martí'), 1);
  });
  it('0 — nothing in common, or nobody to match', () => {
    assert.strictEqual(tier('BERNAT QUIROGA, POL', 'Arnau Soler'), 0);
    assert.strictEqual(tier('Jugador/a', 'Pol Bernat'), 0);
    assert.strictEqual(tier('BERNAT QUIROGA, POL', ''), 0);
  });
});

describe('resolveActaPlayers — a silent link only when it cannot be anyone else', () => {
  const ours = [
    {id: 'f1', name: 'BERNAT QUIROGA, POL'},
    {id: 'f2', name: 'SOLER VIDAL, NIL'},
    {id: 'f3', name: 'Jugador/a'},
  ];
  const roster = [
    {uid: 'u1', name: 'Pol Bernat'},
    {uid: 'u2', name: 'Nil Soler', called: true},
    {uid: 'u3', name: 'Nil Puig'},
  ];
  it('links a unique strong match and suggests the rest', () => {
    const r = A.resolveActaPlayers(ours, roster, {});
    assert.deepStrictEqual([r.f1.uid, r.f1.how], ['u1', 'auto']);
    assert.deepStrictEqual([r.f2.uid, r.f2.how], ['u2', 'auto']);
    assert.deepStrictEqual([r.f3.uid, r.f3.how], ['', '']);
  });
  it('does not guess between two app players with the same name', () => {
    const r = A.resolveActaPlayers(ours, roster.concat([{uid: 'u9', name: 'Pol Bernat'}]), {});
    assert.strictEqual(r.f1.uid, '');
    assert.deepStrictEqual(r.f1.cand.slice().sort(), ['u1', 'u9']);
  });
  it('does not give one app player to two acta names that both fit him', () => {
    const two = [{id: 'g1', name: 'GARCIA LOPEZ, MARC'}, {id: 'g2', name: 'GARCIA PEREZ, MARC'}];
    const r = A.resolveActaPlayers(two, [{uid: 'm', name: 'Marc Garcia'}], {});
    assert.strictEqual(r.g1.uid, '');
    assert.strictEqual(r.g2.uid, '');
    assert.deepStrictEqual(r.g1.cand, ['m']);
  });
  it('believes the registry, and never hands a linked player to another name', () => {
    const r = A.resolveActaPlayers(ours, roster, {
      f2: {uid: 'u3', status: 'linked', source: 'staff'},
    });
    assert.deepStrictEqual([r.f2.uid, r.f2.how], ['u3', 'link']);
    const other = A.resolveActaPlayers([{id: 'x', name: 'PUIG ROCA, NIL'}], roster,
        {f2: {uid: 'u3', status: 'linked'}});
    assert.strictEqual(other.x.uid, '', 'u3 is already somebody else');
    assert.ok(other.x.cand.indexOf('u3') === -1);
  });
  it('leaves an ignored name alone', () => {
    const r = A.resolveActaPlayers(ours, roster, {f1: {uid: '', status: 'ignored'}});
    assert.deepStrictEqual([r.f1.uid, r.f1.ignored], ['', true]);
  });
  it('orders suggestions by fit, then by being in the call-up', () => {
    const r = A.resolveActaPlayers([{id: 'n', name: 'XAUS ROCA, NIL'}], roster, {});
    assert.deepStrictEqual(r.n.cand, ['u2', 'u3']);
  });
});

/* A small closed acta, in parseFcfActaEvents' shape. Home is US. */
function sampleActa() {
  return {
    ok: true, closed: true, home: {name: 'US'}, away: {name: 'THEM'}, score: {home: 2, away: 1},
    players: [
      {id: 'h1', name: 'BERNAT QUIROGA, POL', dorsal: '9', side: 'home', titular: true},
      {id: 'h2', name: 'SOLER VIDAL, NIL', dorsal: '10', side: 'home', titular: true},
      {id: 'h3', name: 'Jugador/a', dorsal: '11', side: 'home', titular: false, hidden: true},
      {id: 'a1', name: 'CASANOVAS GARCIA, JOSUÉ', dorsal: '9', side: 'away', titular: true},
      {id: 'a2', name: 'ROCA SERRA, JAN', dorsal: '4', side: 'away', titular: false},
    ],
    goals: [
      {minute: '12', id: 'h1', side: 'home', for: 'home', kind: 'goal'},
      {minute: '40', id: 'a1', side: 'away', for: 'away', kind: 'penalty'},
      {minute: '85', id: 'a1', side: 'away', for: 'home', kind: 'own'},
    ],
    cards: [
      {minute: '30', id: 'h2', side: 'home', kind: 'yellow'},
      {minute: '30', id: 'h2', side: 'home', kind: 'yellow'},
      {minute: '', id: 'a2', side: 'away', kind: 'red'},
    ],
    subs: [
      {minute: '60', side: 'home', inId: 'h3', outId: 'h2'},
      {minute: '70', side: 'away', inId: 'a2', outId: 'a1'},
    ],
  };
}
const RES = {h1: {uid: 'u1', how: 'auto', cand: []}, h2: {uid: '', how: '', cand: ['u2', 'u7']},
  h3: {uid: '', how: '', cand: []}};
const events = () => A.fcfActaToEvents(sampleActa(), {actaId: '42', ourSide: 'home', resolve: RES});
const byKey = (list, k) => list.find((e) => e.fcfKey === k);

describe('fcfActaToEvents — the acta as app events', () => {
  it('scores to the acta, own goal included', () => {
    assert.deepStrictEqual(A.scoreOfEvents(events()), {home: 2, away: 1});
  });
  it('puts an own goal on the SCORER\'s side, as the app does', () => {
    const og = events().find((e) => e.type === 'own_goal');
    assert.deepStrictEqual([og.side, og.playerNumber, og.playerName], ['away', '9', 'Josué Casanovas']);
  });
  it('marks a penalty as one, and only that', () => {
    const goals = events().filter((e) => e.type === 'goal');
    assert.deepStrictEqual(goals.map((g) => g.goalType || ''), ['', 'penal']);
  });
  it('links our scorer by uid and keeps his acta name; never a dorsal on our side', () => {
    const g = events().find((e) => e.type === 'goal' && e.side === 'home');
    assert.deepStrictEqual([g.playerId, g.fcfPlayerId, g.playerName], ['u1', 'h1', 'Pol Bernat']);
    events().filter((e) => e.side === 'home').forEach((e) => {
      assert.ok(!('playerNumber' in e) && !('playerInNumber' in e), JSON.stringify(e));
    });
  });
  it('leaves an unlinked player of ours with a name and an empty uid', () => {
    const y = events().filter((e) => e.type === 'yellow');
    assert.deepStrictEqual(y.map((e) => [e.playerId, e.playerName]), [['', 'Nil Soler'], ['', 'Nil Soler']]);
  });
  it('gives two bookings in one minute two different keys', () => {
    const keys = events().map((e) => e.fcfKey);
    assert.strictEqual(new Set(keys).size, keys.length);
    assert.ok(keys.indexOf('yellow:home:h2:30:2') !== -1, keys.join());
  });
  it('writes a substitution both ways round, by uid for us and by number for them', () => {
    const ours = events().find((e) => e.type === 'change' && e.side === 'home');
    assert.deepStrictEqual([ours.playerInId, ours.playerOutId, ours.playerInName, ours.playerOutName],
        ['', '', 'Jugador/a #11', 'Nil Soler']);
    const theirs = events().find((e) => e.type === 'change' && e.side === 'away');
    assert.deepStrictEqual([theirs.playerInNumber, theirs.playerOutNumber], ['4', '9']);
  });
  it('keys a card at "(Final)" with an F and keeps its minute empty', () => {
    const red = events().find((e) => e.type === 'red');
    assert.deepStrictEqual([red.minute, red.fcfKey], ['', 'red:away:a2:F']);
  });
});

describe('mergeActaEvents — "FCF wins", keeping the coach\'s assist', () => {
  const opts = {ourSide: 'home', resolve: RES};
  it('fills an empty match and is idempotent', () => {
    const one = A.mergeActaEvents([], events(), opts);
    assert.strictEqual(one.summary.added, events().length);
    const two = A.mergeActaEvents(one.events, events(), opts);
    assert.deepStrictEqual(two.events, one.events);
    assert.strictEqual(two.summary.refreshed, events().length);
  });

  it('adopts the coach\'s goal for the same player within 3 minutes, assist and id kept', () => {
    const hand = [{id: 'h-1', side: 'home', type: 'goal', minute: '14', playerId: 'u1',
      goalType: 'jugada_oberta', goalDetail: 'assistencia', assistPlayerId: 'u5'}];
    const r = A.mergeActaEvents(hand, events(), opts);
    const g = byKey(r.events, 'goal:home:h1:12');
    assert.deepStrictEqual([g.id, g.minute, g.goalDetail, g.assistPlayerId], ['h-1', '12', 'assistencia', 'u5']);
    assert.strictEqual(r.summary.adopted, 1);
  });

  it('adopts at exactly 3 minutes and not at 4', () => {
    const at = (min) => A.mergeActaEvents([{id: 'x', side: 'home', type: 'goal', minute: min,
      playerId: 'u1', goalDetail: 'assistencia', assistPlayerId: 'u5'}], events(), opts);
    assert.strictEqual(byKey(at('15').events, 'goal:home:h1:12').assistPlayerId, 'u5');
    const far = at('16');
    assert.strictEqual(byKey(far.events, 'goal:home:h1:12').assistPlayerId, undefined);
    assert.strictEqual(far.events.filter((e) => e.type === 'goal' && e.side === 'home').length, 1,
        'the coach\'s goal 4 minutes off was kept beside the acta\'s');
  });

  it('counts added time as minutes: 45+2 is 47', () => {
    assert.strictEqual(A.minuteGap('45+2', '47'), 0);
    assert.strictEqual(A.minuteGap('90+3', '90'), 3);
  });

  it('removes a coach\'s goal the acta does not have, and keeps his penal fallat', () => {
    const hand = [
      {id: 'a', side: 'home', type: 'goal', minute: '50', playerId: 'u9'},
      {id: 'b', side: 'home', type: 'penal_fallat', minute: '20', playerId: 'u1'},
      {id: 'c', side: 'away', type: 'pal', minute: '33', playerNumber: '7'},
    ];
    const r = A.mergeActaEvents(hand, events(), opts);
    assert.ok(!r.events.some((e) => e.id === 'a'));
    assert.ok(r.events.some((e) => e.id === 'b') && r.events.some((e) => e.id === 'c'));
    assert.deepStrictEqual(A.scoreOfEvents(r.events), {home: 2, away: 1});
    assert.deepStrictEqual([r.summary.removed, r.summary.kept], [1, 2]);
  });

  it('matches an unlinked acta player to the coach\'s event by his suggested uids', () => {
    const hand = [{id: 'y', side: 'home', type: 'yellow', minute: '31', playerId: 'u7'}];
    const r = A.mergeActaEvents(hand, events(), opts);
    assert.strictEqual(r.events.filter((e) => e.id === 'y').length, 1);
    assert.strictEqual(r.summary.adopted, 1);
  });

  it('matches the rival by this match\'s shirt number', () => {
    const r = A.mergeActaEvents([{id: 'p', side: 'away', type: 'goal', minute: '41',
      playerNumber: '9'}], events(), opts);
    assert.strictEqual(byKey(r.events, 'goal:away:a1:40').id, 'p');
    const wrong = A.mergeActaEvents([{id: 'p', side: 'away', type: 'goal', minute: '41',
      playerNumber: '8'}], events(), opts);
    assert.ok(!wrong.events.some((e) => e.id === 'p'));
  });

  it('needs BOTH ends of a substitution to match', () => {
    const hand = (inN, outN) => [{id: 's', side: 'away', type: 'change', minute: '70',
      playerInNumber: inN, playerOutNumber: outN}];
    assert.strictEqual(A.mergeActaEvents(hand('4', '9'), events(), opts).summary.adopted, 1);
    assert.strictEqual(A.mergeActaEvents(hand('4', '8'), events(), opts).summary.adopted, 0);
  });

  it('a penalty never keeps an assist; a free kick never keeps one either', () => {
    const pen = A.mergeActaEvents([{id: 'p', side: 'away', type: 'goal', minute: '40',
      playerNumber: '9', goalType: 'jugada_oberta', goalDetail: 'assistencia', assistPlayerId: 'z'}],
    events(), opts);
    const g = byKey(pen.events, 'goal:away:a1:40');
    assert.deepStrictEqual([g.goalType, g.goalDetail, g.assistPlayerId], ['penal', undefined, undefined]);
    const fk = A.mergeActaEvents([{id: 'f', side: 'home', type: 'goal', minute: '12', playerId: 'u1',
      goalType: 'falta_directa', goalDetail: 'assistencia', assistPlayerId: 'u5'}], events(), opts);
    const k = byKey(fk.events, 'goal:home:h1:12');
    assert.deepStrictEqual([k.goalType, k.goalDetail, k.assistPlayerId], ['falta_directa', undefined, undefined]);
  });

  it('the acta\'s GOL overrules a coach who called it a penalty', () => {
    const r = A.mergeActaEvents([{id: 'q', side: 'home', type: 'goal', minute: '12', playerId: 'u1',
      goalType: 'penal'}], events(), opts);
    assert.strictEqual(byKey(r.events, 'goal:home:h1:12').goalType, undefined);
  });

  it('adopts a coach\'s event with no minute only when it is the one candidate', () => {
    const one = A.mergeActaEvents([{id: 'n', side: 'home', type: 'goal', minute: '', playerId: 'u1',
      goalDetail: 'assistencia', assistPlayerId: 'u5'}], events(), opts);
    assert.strictEqual(byKey(one.events, 'goal:home:h1:12').assistPlayerId, 'u5');
    const two = A.mergeActaEvents([{id: 'n', side: 'home', type: 'yellow', minute: '',
      playerId: 'u7'}], events(), opts);
    assert.strictEqual(two.summary.adopted, 0, 'two acta bookings — which one is it?');
  });

  it('a re-import keeps what the coach added since, and drops what the acta took back', () => {
    const first = A.mergeActaEvents([], events(), opts).events;
    const g = byKey(first, 'goal:home:h1:12');
    g.goalType = 'jugada_oberta';
    g.goalDetail = 'assistencia';
    g.assistPlayerId = 'u5';
    const shorter = A.fcfActaToEvents(Object.assign(sampleActa(), {cards: []}),
        {actaId: '42', ourSide: 'home', resolve: RES});
    const r = A.mergeActaEvents(first, shorter, opts);
    assert.strictEqual(byKey(r.events, 'goal:home:h1:12').assistPlayerId, 'u5');
    assert.strictEqual(r.events.filter((e) => e.type === 'yellow' || e.type === 'red').length, 0);
  });

  it('orders the result the same way every time', () => {
    const hand = [{id: 'b', side: 'home', type: 'pal', minute: '12'}];
    const a1 = A.mergeActaEvents(hand, events(), opts).events.map((e) => e.id);
    const a2 = A.mergeActaEvents(hand, events().reverse(), opts).events.map((e) => e.id);
    assert.deepStrictEqual(a1, a2);
  });
});

describe('actaFacts / actaFactsIntact — what the guard protects', () => {
  const merged = () => A.mergeActaEvents([], events(), {ourSide: 'home', resolve: RES}).events;
  it('is not changed by linking a player — uids are not facts', () => {
    const list = merged();
    const facts = A.actaFacts(list);
    list.forEach((e) => {
      if (e.fcfPlayerId === 'h2') e.playerId = 'u2';
    });
    assert.ok(A.actaFactsIntact(list, facts));
  });
  it('allows an assist and a penal fallat', () => {
    const list = merged();
    const facts = A.actaFacts(list);
    byKey(list, 'goal:home:h1:12').assistPlayerId = 'u5';
    list.push({id: 'pf', side: 'home', type: 'penal_fallat', minute: '70'});
    assert.ok(A.actaFactsIntact(list, facts));
  });
  it('catches a moved minute, a deleted card, and a goal typed back in by hand', () => {
    const facts = A.actaFacts(merged());
    const moved = merged();
    byKey(moved, 'goal:home:h1:12').minute = '13';
    assert.ok(!A.actaFactsIntact(moved, facts));
    assert.ok(!A.actaFactsIntact(merged().filter((e) => e.type !== 'red'), facts));
    assert.ok(!A.actaFactsIntact(merged().concat([{id: 'x', side: 'home', type: 'goal', minute: '5'}]), facts));
  });
});

describe('actaLineup / applyActaLineup — the eleven and the call-up', () => {
  const lineup = () => A.actaLineup(sampleActa(), {ourSide: 'home', resolve: RES});
  it('lists our acta players, who came on when, and suggestions only while unlinked', () => {
    const l = lineup();
    assert.deepStrictEqual(l.map((r) => [r.f, r.u, r.t, r.on, r.a]),
        [['h1', 'u1', 1, '', 1], ['h2', '', 1, '', 0], ['h3', '', 0, '60', 0]]);
    assert.ok(!('c' in l[0]) && Array.isArray(l[1].c));
    assert.strictEqual(l[2].n, '', 'a withheld name is not invented');
  });
  it('fills an empty call-up and eleven with the linked players', () => {
    const e = A.applyActaLineup(undefined, lineup());
    assert.deepStrictEqual([e.players, e.startingXI], [['u1'], ['u1']]);
    assert.deepStrictEqual([e.fcfFill.players, e.fcfFill.xi], [true, true]);
  });
  it('never creates an entry with nobody in it — that would read as "call-up sent"', () => {
    assert.strictEqual(A.applyActaLineup(undefined, lineup().map((r) => Object.assign({}, r, {u: ''}))), null);
  });
  it('adds to a coach\'s call-up only who played, and leaves his eleven alone', () => {
    const l = lineup();
    l[2].u = 'u8';                             // came on at 60'
    const e = A.applyActaLineup({players: ['u3'], startingXI: ['u3']}, l);
    assert.deepStrictEqual(e.players, ['u3', 'u1', 'u8']);
    assert.deepStrictEqual(e.startingXI, ['u3']);
    assert.deepStrictEqual(e.fcfFill.added, ['u1', 'u8']);
  });
  it('reads a legacy array entry as the call-up', () => {
    const e = A.applyActaLineup(['u3'], lineup());
    assert.deepStrictEqual(e.players, ['u3', 'u1']);
  });
});

describe('when to try — the import queue', () => {
  const H = 3600000;
  const row = (o) => Object.assign({id: 7, fcfActaId: '42', date: 'd', time: 't'}, o);
  const clock = {kickoffMsOf: () => 100 * H, endMsOf: () => 102 * H};
  it('first tries 45 minutes after the end', () => {
    const p = A.planActaQueue([row()], Object.assign({nowMs: 90 * H}, clock));
    assert.deepStrictEqual(p, [{matchId: 7, actaId: '42', kickoffAt: 100 * H, dueAt: 102 * H + 45 * 60000}]);
  });
  it('skips a fixture with no acta, one already imported, one the federation dropped', () => {
    [{fcfActaId: ''}, {fcfActa: {at: 'x'}}, {fcfRemoved: true}].forEach((o) => {
      assert.deepStrictEqual(A.planActaQueue([row(o)], Object.assign({nowMs: 90 * H}, clock)), []);
    });
  });
  it('re-arms for ten days, and not beyond', () => {
    assert.strictEqual(A.planActaQueue([row()], Object.assign({nowMs: 100 * H + 9 * 24 * H}, clock)).length, 1);
    assert.strictEqual(A.planActaQueue([row()], Object.assign({nowMs: 100 * H + 11 * 24 * H}, clock)).length, 0);
  });
  it('backs off, then gives up 72 hours after kick-off', () => {
    const k = 0;
    assert.strictEqual(A.nextActaAttemptMs(0, 3 * H, k), 3 * H + 15 * 60000);
    assert.strictEqual(A.nextActaAttemptMs(8, 3 * H, k), 3 * H + 480 * 60000);
    assert.strictEqual(A.nextActaAttemptMs(20, 50 * H, k), 62 * H);
    assert.strictEqual(A.nextActaAttemptMs(20, 61 * H, k), null);
  });
});

/* ── Parity with js/app.js ─────────────────────────────────────────────── */
describe('acta.js agrees with the app', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const grab = (from, to) => {
    const i = src.indexOf(from);
    const j = src.indexOf(to, i);
    assert.ok(i !== -1 && j !== -1, 'marker not found: ' + from);
    return src.slice(i, j);
  };
  // eslint-disable-next-line no-new-func
  const app = new Function('isOurTeam',
      grab('  function calcMatchScore(events)', '  function countYellowCards') +
      grab('  function ptOurSide(m)', '  /** A section eyebrow') +
      grab('  function ptSecondField(type, goalType)', '  /**\n   * Whose name the row is in.') +
      'return {calcMatchScore, parseEventMinute, ptOurSide, ptSecondField};')((n) => n === 'US');

  it('on the score (calcMatchScore)', () => {
    [events(), [], [{type: 'own_goal', side: 'home'}, {type: 'goal', side: 'away'}, {type: 'pal', side: 'home'}]]
        .forEach((list) => assert.deepStrictEqual(A.scoreOfEvents(list), app.calcMatchScore(list)));
  });
  it('on sorting minutes (parseEventMinute)', () => {
    ['', '1', '45+2', '90+10', 'x'].forEach((m) => {
      assert.strictEqual(A.minuteValue(m), app.parseEventMinute(m), m);
    });
  });
  it('on which side is ours (ptOurSide)', () => {
    [{home: 'US', away: 'X'}, {home: 'X', away: 'US'}, {home: 'X', away: 'Y'}, null].forEach((r) => {
      assert.strictEqual(A.ourSideOfRow(r, 'US'), app.ptOurSide(r), JSON.stringify(r));
    });
  });
  it('on when a goal takes an assist (ptSecondField)', () => {
    [undefined, '', 'jugada_oberta', 'penal', 'falta_directa'].forEach((g) => {
      assert.strictEqual(A.assistAllowed(g), app.ptSecondField('goal', g) === 'assist', String(g));
    });
  });
});
