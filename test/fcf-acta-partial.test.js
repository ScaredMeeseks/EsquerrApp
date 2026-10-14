/* A SUSPÈS acta, read on (v287).
 *
 * Until v287 parseFcfActaEvents stopped at any pill that was not "Acta
 * Tancada". A SUSPÈS page is worth reading: a game stopped mid-way carries
 * its line-ups and every goal, card and sub up to the stop; one stopped
 * before it started carries no line-ups at all. That difference is how the
 * app knows whether the game counts, and the first part is imported from it.
 *
 * Both fixtures are real, people rewritten by capture-acta-events.js:
 *   acta-events-suspended.html            4119507, stopped mid-way (8'…79', 2-1)
 *   acta-events-suspended-unstarted.html  4119518, SUSPÈS before it started
 * Of the 7 SUSPÈS in the linked groups on 13/10/2026, 6 never started; none
 * of the pages says the minute a game stopped.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const F = require(path.join(__dirname, '..', 'functions', 'fcf.js'));

const load = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
const STOPPED = F.parseFcfActaEvents(load('acta-events-suspended.html'));
const UNSTARTED = F.parseFcfActaEvents(load('acta-events-suspended-unstarted.html'));

describe('parseFcfActaEvents — a SUSPÈS acta (v287)', () => {
  it('never started: ok, not closed, started:false — and nothing else', () => {
    assert.deepStrictEqual(UNSTARTED, {ok: true, closed: false, status: 'SUSPÈS', started: false});
  });

  it('stopped mid-way: the first part, as a closed acta would give it', () => {
    assert.strictEqual(STOPPED.ok, true, JSON.stringify(STOPPED));
    assert.deepStrictEqual([STOPPED.closed, STOPPED.started, STOPPED.partial], [false, true, true]);
    assert.strictEqual(STOPPED.players.length, 36);
    assert.strictEqual(STOPPED.goals.length, 3);
    assert.strictEqual(STOPPED.subs.length, 4);
    assert.strictEqual(STOPPED.cards.length, 6);
  });

  it('the score is the goals — the header says "- - -"', () => {
    assert.deepStrictEqual(STOPPED.score, {home: 2, away: 1});
    assert.deepStrictEqual(STOPPED.goals.map((g) => g.running), ['1-0', '1-1', '2-1']);
  });

  it('lastMinute is the latest thing on the page — the best guess at the stop it allows', () => {
    assert.strictEqual(STOPPED.lastMinute, 79);
    const all = STOPPED.goals.concat(STOPPED.cards, STOPPED.subs).map((x) => parseInt(x.minute, 10));
    assert.strictEqual(STOPPED.lastMinute, Math.max(...all));
  });

  it('a closed acta is untouched by it', () => {
    const closed = F.parseFcfActaEvents(load('acta-events-own-goal.html'));
    assert.deepStrictEqual([closed.closed, closed.played, closed.partial, closed.lastMinute],
        [true, true, undefined, undefined]);
  });

  it('nor is a PENDENT or AJORNAT page read on', () => {
    assert.deepStrictEqual(F.parseFcfActaEvents(load('acta-events-pending.html')),
        {ok: true, closed: false, status: 'Pendent'});
  });
});
