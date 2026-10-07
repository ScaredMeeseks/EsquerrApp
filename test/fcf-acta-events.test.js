/* parseFcfActaEvents — a closed acta's goals, cards and substitutions (v278).
 *
 * Two kinds of input. The fixtures are real actas, captured by
 * fixtures/capture-acta-events.js with every person rewritten to an
 * invented name: they pin what the federation actually draws. The
 * hand-built payloads below are for what a real acta has not (yet) shown
 * us — a mark the parser does not know, a score that does not add up, a
 * text row whose length counts bytes — because each of those must FAIL,
 * and an import is only safe if it does.
 *
 * `npm run test:fcf`, or as part of test:unit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const F = require('../functions/fcf');
const {FAKE_NAMES, FAKE_SINGLE} = require('./fixtures/fake-names');

const FIX = path.join(__dirname, 'fixtures');
const load = (n) => fs.readFileSync(path.join(FIX, n), 'utf8');
const OWN = load('acta-events-own-goal.html');
const PEN = load('acta-events-penalty-red.html');
const DBL = load('acta-events-double.html');
const OLD = load('acta-events-old.html');
const SUSP = load('acta-events-suspended.html');
const PEND = load('acta-events-pending.html');
const UNPL = load('acta-events-unplayed.html');
const AWD = load('acta-events-awarded.html');
const ALL = [OWN, PEN, DBL, OLD, SUSP, PEND, UNPL, AWD];

/** The player with this dorsal on this side. */
function who(acta, side, dorsal) {
  const p = acta.players.find((x) => x.side === side && x.dorsal === String(dorsal));
  assert.ok(p, 'no ' + side + ' #' + dorsal);
  return p;
}
const cardsOf = (acta, p) => acta.cards.filter((c) => c.id === p.id)
    .map((c) => c.kind + '@' + c.minute);
const subKey = (acta, s) => s.side[0] + s.minute + ':' + acta.players.find((p) => p.id === s.inId).dorsal +
  '>' + acta.players.find((p) => p.id === s.outId).dorsal;

describe('parseFcfActaEvents — real actas', () => {
  it('reads the own goal that decided 4119501, credited to the side it counts for', () => {
    const a = F.parseFcfActaEvents(OWN);
    assert.strictEqual(a.ok, true, JSON.stringify(a));
    assert.strictEqual(a.closed, true);
    assert.deepStrictEqual(a.score, {home: 1, away: 0});
    assert.strictEqual(a.goals.length, 1);
    const g = a.goals[0];
    assert.deepStrictEqual([g.kind, g.minute, g.side, g.for, g.running], ['own', '85', 'away', 'home', '1-0']);
    assert.strictEqual(who(a, 'away', 9).id, g.id, 'the scorer is the away #9');
    assert.deepStrictEqual(a.warnings, []);
  });

  it('splits the line-ups by the component\'s own props, eleven starters a side', () => {
    const a = F.parseFcfActaEvents(OWN);
    ['home', 'away'].forEach((s) => {
      assert.strictEqual(a.players.filter((p) => p.side === s && p.titular).length, 11, s);
    });
    assert.strictEqual(a.players.length, 38);
    assert.strictEqual(new Set(a.players.map((p) => p.id)).size, 38, 'a player listed twice');
  });

  it('keeps a withheld name as hidden, with its id and dorsal, and books him', () => {
    const a = F.parseFcfActaEvents(OWN);
    const h = who(a, 'home', 11);
    assert.strictEqual(h.hidden, true);
    assert.strictEqual(h.name, 'Jugador/a');
    assert.deepStrictEqual(cardsOf(a, h), ['yellow@89']);
  });

  it('reads every booking with its minute and nothing from the legend', () => {
    const a = F.parseFcfActaEvents(OWN);
    const list = a.cards.map((c) => c.side[0] + c.kind[0] + c.minute + '#' +
      a.players.find((p) => p.id === c.id).dorsal);
    assert.deepStrictEqual(list, ['hy10#10', 'ay16#10', 'hy29#24', 'ay37#16', 'hy44#18', 'hy89#11']);
  });

  it('pairs ten substitutions, three of them sharing a minute with another', () => {
    const a = F.parseFcfActaEvents(OWN);
    assert.deepStrictEqual(a.subs.map((s) => subKey(a, s)),
        ['h65:22>9', 'h65:16>18', 'h70:6>24', 'h86:2>21', 'h86:8>10',
          'a36:9>17', 'a55:24>3', 'a55:12>8', 'a75:21>20', 'a75:2>16']);
  });

  it('reads a penalty, a direct red and a running score that swings (4119504, 2-3)', () => {
    const a = F.parseFcfActaEvents(PEN);
    assert.strictEqual(a.ok, true, JSON.stringify(a));
    assert.deepStrictEqual(a.score, {home: 2, away: 3});
    assert.deepStrictEqual(a.goals.map((g) => g.minute + g.kind[0] + g.for[0] + g.running),
        ['13gh1-0', '20ga1-1', '32gh2-1', '40pa2-2', '90ga2-3']);
    assert.deepStrictEqual(cardsOf(a, who(a, 'away', 5)), ['red@50']);
  });

  it('keeps a second yellow given in the SAME minute as the first', () => {
    const a = F.parseFcfActaEvents(PEN);
    assert.deepStrictEqual(cardsOf(a, who(a, 'home', 25)), ['yellow@90', 'yellow@90']);
  });

  it('reads a booking drawn at "(Final)" as minute "" — after the whistle, sorted last', () => {
    const a = F.parseFcfActaEvents(PEN);
    assert.deepStrictEqual(cardsOf(a, who(a, 'home', 2)), ['yellow@40', 'yellow@']);
    assert.strictEqual(a.cards[a.cards.length - 1].minute, '');
  });

  it('does not credit a coach\'s red card to the last player listed', () => {
    const a = F.parseFcfActaEvents(PEN);
    assert.ok(a.warnings.indexOf('staff-cards:1') !== -1, a.warnings.join());
    assert.strictEqual(a.cards.filter((c) => c.kind === 'red').length, 1);
    assert.deepStrictEqual(cardsOf(a, who(a, 'home', 19)), [], 'the coach\'s red landed on #19');
  });

  it('reads a sending-off for two yellows as two yellows — there is no other glyph (4119510)', () => {
    const a = F.parseFcfActaEvents(DBL);
    assert.deepStrictEqual(a.score, {home: 1, away: 1});
    assert.deepStrictEqual(cardsOf(a, who(a, 'home', 10)), ['yellow@71', 'yellow@89']);
    assert.strictEqual(a.cards.filter((c) => c.kind === 'red').length, 0);
  });

  it('treats a player registered under one name as named, not hidden', () => {
    const a = F.parseFcfActaEvents(DBL);
    const single = a.players.filter((p) => p.name.indexOf(',') === -1 && !p.hidden);
    assert.strictEqual(single.length, 5);
    assert.strictEqual(a.players.filter((p) => p.hidden).length, 1);
  });

  it('reads last season\'s sheet, which published no substitutions', () => {
    const a = F.parseFcfActaEvents(OLD);
    assert.strictEqual(a.ok, true, JSON.stringify(a));
    assert.deepStrictEqual(a.score, {home: 1, away: 0});
    assert.deepStrictEqual(a.subs, []);
    assert.deepStrictEqual(cardsOf(a, who(a, 'home', 18)), ['yellow@64', 'yellow@65']);
  });

  it('reads nothing more from an acta that is not closed', () => {
    assert.deepStrictEqual(F.parseFcfActaEvents(SUSP), {ok: true, closed: false, status: 'SUSPÈS'});
    assert.deepStrictEqual(F.parseFcfActaEvents(PEND), {ok: true, closed: false, status: 'Pendent'});
  });

  it('reads a result awarded with no goals as awarded, with its score (3833178, 0-3)', () => {
    const a = F.parseFcfActaEvents(AWD);
    assert.deepStrictEqual([a.ok, a.closed, a.awarded, a.score], [true, true, true, {home: 0, away: 3}]);
    assert.strictEqual(a.goals, undefined, 'an awarded result handed out a list to import');
  });

  it('still refuses goals that do not add up when there ARE goals', () => {
    const o = base();
    o.h = 3;
    assert.strictEqual(F.parseFcfActaEvents(acta(o)).reason, 'score-mismatch');
  });

  it('reads a closed acta of a match never played as exactly that', () => {
    assert.deepStrictEqual(F.parseFcfActaEvents(UNPL),
        {ok: true, closed: true, played: false, status: 'Acta Tancada'});
  });
});

/* ── Hand-built payloads ──────────────────────────────────────────────── */

const span = (c) => ['$', 'span', null, {children: c}];
const div = (c, cls) => ['$', 'div', null, cls ? {className: cls, children: c} : {children: c}];
const card = (colour) => ['$', 'div', null,
  {className: 'w-[14px] h-[18px] bg-[' + colour + '] border border-gray-400 rounded-[2px]'}];
const arrow = (stroke) => ['$', 'svg', null, {children: ['$', 'path', null, {stroke, strokeWidth: '4'}]}];
const YEL = card('#FFEB3B');
const RED = card('#F30000');
const IN = arrow('#0068A9');
const OUT = arrow('#F30000');
const ball = ['$', 'div', null, {children: ['$', 'svg', null, {children: ['$', 'circle', null, {}]}]}];

function playerEl(id, name, dorsal, team, extra, children) {
  return ['$', '$L9', null, {player: Object.assign({id, nombre: name, dorsal}, extra || {}),
    teamName: team, children: children || span(name)}];
}
/** One line-up row: dorsal, player, then `minute + mark` groups. */
function lineupRow(id, name, dorsal, team, titular, groups) {
  return div([div([span(dorsal), playerEl(id, name, dorsal, team, {titular: titular ? '1' : '0'})]),
    div((groups || []).map((g) => div([span(g[0] + '’')].concat(g.slice(1)))))]);
}
function goalRow(running, id, name, dorsal, team, label, minute) {
  return div([div(running), playerEl(id, name, dorsal, team, null,
      span([name, ' ', span(['(', label, ' ', '(' + minute + '\')', ')'])]))]);
}
function changeRow(minute, inP, outP, team) {
  return div([div([String(minute), '’']), div([
    div([span(inP[2]), playerEl(inP[0], inP[1], inP[2], team), IN]),
    div([span(outP[2]), playerEl(outP[0], outP[1], outP[2], team), OUT])])]);
}

/** A whole acta, from parts, as Next.js would stream it: rows in five
 *  push() chunks, with an optional text row placed first. */
function acta(o) {
  const H = 'HOME F.C.';
  const A = 'AWAY C.F.';
  const header = div([span(H), span(o.status || 'Acta Tancada'), span(String(o.h)), span('-'),
    span(String(o.a)), span(A)]);
  const gols = div([['$', 'h3', null, {children: 'Gols'}]].concat(o.goals || []));
  const lineup = ['$', '$L5', null, {localName: H, visitorName: A,
    localNode: [div(o.home || [])].concat(o.homeExtra || []),
    visitorNode: [div(o.away || [])]}];
  const rows = {'0': {P: null, f: [[div(['$La', '$L1'])]]}, '1': [header, gols, lineup]};
  /* The text row sits BETWEEN the two rows the parse needs, with no
     newline after it (a T row has none): a length miscounted by even one
     byte eats into row 1, and the whole acta goes. */
  let payload = '2:I[123,["x.js"],"default"]\n0:' + JSON.stringify(rows['0']) + '\n';
  if (o.text !== undefined) {
    payload += 'a:T' + Buffer.byteLength(o.text, 'utf8').toString(16) + ',' + o.text;
  }
  payload += '1:' + JSON.stringify(rows['1']) + '\n';
  const n = 5;
  const step = Math.ceil(payload.length / n);
  let out = '<html>';
  for (let i = 0; i < payload.length; i += step) {
    out += '<script>self.__next_f.push([1,' + JSON.stringify(payload.slice(i, i + step)) + '])</script>';
  }
  return out + '</html>';
}
const H = 'HOME F.C.';
const A = 'AWAY C.F.';
const P1 = ['101', 'PUIG FERRER, POL', '9'];
const P2 = ['102', 'SOLER VIDAL, NIL', '14'];
const Q1 = ['201', 'ROCA SERRA, JAN', '7'];
const base = () => ({
  h: 1, a: 0,
  goals: [goalRow('1 - 0', P1[0], P1[1], P1[2], H, 'GOL', 12)],
  home: [lineupRow(P1[0], P1[1], P1[2], H, true, [['12', ball]]),
    lineupRow(P2[0], P2[1], P2[2], H, false)],
  away: [lineupRow(Q1[0], Q1[1], Q1[2], A, true)],
});

describe('parseFcfActaEvents — what must make it refuse', () => {
  it('reads the minimal acta it is built on', () => {
    const r = F.parseFcfActaEvents(acta(base()));
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(r.goals.map((g) => g.id + '@' + g.minute), ['101@12']);
    assert.deepStrictEqual(r.warnings, []);
  });

  it('counts a text row in BYTES — an accented line before the rows does not shift them', () => {
    const o = base();
    o.text = 'Política de galetes — línia 1\nlínia 2 amb àccents: ÀÉÍÒÚ ç ñ l·l';
    const r = F.parseFcfActaEvents(acta(o));
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.goals.length, 1);
  });

  it('refuses when the goals do not add up to the header', () => {
    const o = base();
    o.h = 2;
    const r = F.parseFcfActaEvents(acta(o));
    assert.deepStrictEqual([r.ok, r.reason], [false, 'score-mismatch']);
  });

  it('refuses when a goal row\'s running score disagrees with the goals before it', () => {
    const o = base();
    o.goals = [goalRow('0 - 1', P1[0], P1[1], P1[2], H, 'GOL', 12)];
    const r = F.parseFcfActaEvents(acta(o));
    assert.deepStrictEqual([r.ok, r.reason], [false, 'running-score']);
  });

  it('refuses a mark it cannot classify rather than guess', () => {
    const o = base();
    o.home[1] = lineupRow(P2[0], P2[1], P2[2], H, false, [['30', card('#00FF00')]]);
    const r = F.parseFcfActaEvents(acta(o));
    assert.deepStrictEqual([r.ok, r.reason], [false, 'unknown-mark']);
  });

  it('refuses when the sub arrows and the Canvis pairs disagree', () => {
    const o = base();
    o.home[1] = lineupRow(P2[0], P2[1], P2[2], H, false, [['60', IN]]);
    o.home[0] = lineupRow(P1[0], P1[1], P1[2], H, true, [['12', ball], ['61', OUT]]);
    o.homeExtra = [changeRow(60, P2, P1, H)];
    const r = F.parseFcfActaEvents(acta(o));
    assert.deepStrictEqual([r.ok, r.reason], [false, 'subs-mismatch']);
  });

  it('pairs a substitution when the arrows and the pair agree', () => {
    const o = base();
    o.home[1] = lineupRow(P2[0], P2[1], P2[2], H, false, [['60', IN]]);
    o.home[0] = lineupRow(P1[0], P1[1], P1[2], H, true, [['12', ball], ['60', OUT]]);
    o.homeExtra = [changeRow(60, P2, P1, H)];
    const r = F.parseFcfActaEvents(acta(o));
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(r.subs, [{minute: '60', side: 'home', inId: '102', outId: '101'}]);
  });

  it('refuses a substitution arrow it cannot pin on one player', () => {
    // A staff row with an arrow: a card there is a coach's, but an arrow
    // belongs to a player or to nobody — the structure has moved.
    const o = base();
    o.homeExtra = [div([div([span('ENTRENADOR'), span('PUIG ROCA, PEP')]), div([div([span('70’'), IN])])])];
    const r = F.parseFcfActaEvents(acta(o));
    assert.deepStrictEqual([r.ok, r.reason], [false, 'unattached-mark']);
  });

  it('ignores a card in a staff row, and says it did', () => {
    const o = base();
    o.homeExtra = [div([div([span('ENTRENADOR'), span('PUIG ROCA, PEP')]), div([div([span('70’'), RED])])])];
    const r = F.parseFcfActaEvents(acta(o));
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(r.cards, []);
    assert.deepStrictEqual(r.warnings, ['staff-cards:1']);
  });

  it('keeps two yellows per player at most — the first two by minute — and says so', () => {
    const o = base();
    o.home[1] = lineupRow(P2[0], P2[1], P2[2], H, false, [['80', YEL], ['20', YEL], ['50', YEL]]);
    const r = F.parseFcfActaEvents(acta(o));
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(r.cards.map((c) => c.minute), ['20', '50']);
    assert.ok(r.warnings.indexOf('extra-yellow:102') !== -1);
  });

  it('reads added time and a red after a yellow', () => {
    const o = base();
    o.home[1] = lineupRow(P2[0], P2[1], P2[2], H, false, [['45+2', YEL], ['90+3', RED]]);
    const r = F.parseFcfActaEvents(acta(o));
    assert.deepStrictEqual(r.cards.map((c) => c.kind + '@' + c.minute), ['yellow@45+2', 'red@90+3']);
  });

  it('reads a closed acta with no result as an unplayed match, not a failure (4119514)', () => {
    const o = base();
    o.h = '-';
    o.a = '-';
    o.goals = [];
    o.home = [];
    o.away = [];
    assert.deepStrictEqual(F.parseFcfActaEvents(acta(o)),
        {ok: true, closed: true, played: false, status: 'Acta Tancada'});
  });

  it('says played:true on every acta it did read', () => {
    assert.strictEqual(F.parseFcfActaEvents(acta(base())).played, true);
  });

  it('never throws, whatever it is given', () => {
    [undefined, null, '', 'garbage', '<html></html>',
      '<script>self.__next_f.push([1,"0:{not json\\n"])</script>',
      '<script>self.__next_f.push([1,"broken \\u"])</script>',
      acta(base()).slice(0, 900)].forEach((h) => {
      const r = F.parseFcfActaEvents(h);
      assert.strictEqual(typeof r, 'object');
      assert.strictEqual(r.ok, false, JSON.stringify(r));
    });
  });
});

describe('what the acta-event fixtures may contain', () => {
  /* The repo is public. Every person in these files is invented by
     fake-names.js; a re-capture that slipped a real name through fails
     here rather than being published. */
  const ROLE = new Set(['PREPARADOR FÍSIC, MERGE O A.T.S']);
  it('names nobody who is not invented', () => {
    const allowed = new Set(FAKE_NAMES.concat(FAKE_SINGLE, ['Jugador/a']));
    ALL.forEach((h, i) => {
      const payload = F.fcfRscPayload(h);
      (payload.match(/"nombre":"((?:[^"\\]|\\.)*)"/g) || []).forEach((m) => {
        const name = JSON.parse(m.slice(9));
        assert.ok(allowed.has(name.trim()), 'fixture ' + i + ' names ' + JSON.stringify(name));
      });
      const a = F.parseFcfActaEvents(h);
      const teams = a.closed && a.played ? [a.home.name, a.away.name] : [];
      (payload.match(/"([A-ZÀ-ÝÑÇ][A-ZÀ-ÝÑÇ'’·.\- ]*\s*,\s*[A-ZÀ-ÝÑÇ][A-ZÀ-ÝÑÇ'’·.\- ]*)"/g) || [])
          .forEach((m) => {
            const s = m.slice(1, -1).trim();
            if (allowed.has(s) || ROLE.has(s) || teams.indexOf(s) !== -1) return;
            assert.ok(/\b(F\.?C|C\.?F|U\.?D|U\.?E|C\.?E|A\.?E|S\.?D|C\.?D|E\.?F|A\.?D)\.?$/.test(s),
                'fixture ' + i + ' holds ' + JSON.stringify(s));
          });
    });
  });

  it('carries no identity documents and no real player ids', () => {
    ALL.forEach((h) => {
      assert.ok(!/licencia|ficha/i.test(h));
      assert.ok(!/\b\d{7,8}[ -]?[A-Z]\b/.test(h), 'a DNI');
      (F.fcfRscPayload(h).match(/"player":\{"id":"(\d+)"/g) || []).forEach((m) => {
        const id = Number(/(\d+)"$/.exec(m)[1]);
        assert.ok(id > 800000 && id < 801000, 'a real federation id: ' + id);
      });
    });
  });
});
