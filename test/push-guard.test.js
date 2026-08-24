/* The two locks on "send a notification to real phones".
 *
 * Writing a document to teams/{id}/pushQueue IS the send — onPushQueueCreate
 * picks it up and pushes. Until v133 there were effectively no locks at all:
 *
 *   · firestore.rules said `create: if sameTeam(teamId)` — ANY member;
 *   · the consumer treated a document with no `targetPlayers` as "send to
 *     every member of the team", and took title, body and url straight from
 *     it.
 *
 * The rules half is proved against the emulator in rules.test.js. This file
 * covers the two halves an emulator cannot see: the CLIENT never writing a
 * targetless document, and the FUNCTION refusing one if it ever arrives.
 *
 * The empty-list case is not hypothetical. The convocatòria sender maps
 * roster ids to Firebase uids and drops seeded numeric ones — so a call-up
 * made entirely of seeded players produced `targetPlayers: []`, which the
 * old consumer read as a broadcast. Publishing a demo squad's call-up would
 * have pushed to the whole club.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pushSrc = fs.readFileSync(path.join(root, 'js', 'push.js'), 'utf8');
const fnSrc = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const rulesSrc = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');

/* The consumer, sliced out of its onDocumentCreated wrapper — index.js may
   export only deployable functions, so it cannot simply be required. */
function grab(src, from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found: ' + from);
  return src.slice(i, j);
}

function makeSender() {
  const writes = [];
  const api = new Function('db', 'firebase', 'console',
      grab(pushSrc, '  async function sendToPlayers', '\n  return {') +
      '\n return {sendToPlayers};')(
      {collection: () => ({doc: () => ({collection: () => ({
        add: (d) => { writes.push(d); return Promise.resolve(); },
      })})})},
      {firestore: {FieldValue: {serverTimestamp: () => 'ts'}}},
      {error() {}},
  );
  api.writes = writes;
  return api;
}

describe('the client never writes a targetless send', () => {
  it('refuses an empty recipient list', async () => {
    /* THE live bug. `[]` is truthy but has no length, so the old consumer
       fell straight through to its broadcast branch. */
    const api = makeSender();
    await api.sendToPlayers('teamA', [], {title: 'x'});
    await api.sendToPlayers('teamA', null, {title: 'x'});
    await api.sendToPlayers('teamA', [null, undefined, ''], {title: 'x'});
    assert.deepStrictEqual(api.writes, [],
        'an empty call-up queued a document, which the consumer broadcasts');
  });

  it('still sends to a real list, dropping the falsy entries', async () => {
    const api = makeSender();
    await api.sendToPlayers('teamA', ['uid1', null, 'uid2'], {title: 'x'});
    assert.strictEqual(api.writes.length, 1);
    assert.deepStrictEqual(api.writes[0].targetPlayers, ['uid1', 'uid2'],
        'the falsy entries should be dropped, not the whole send');
    assert.strictEqual(api.writes[0].status, 'pending');
  });

  it('has no broadcast helper left to call', () => {
    /* `sendToTeam` was never called but WAS exported — one autocomplete away
       from a club-wide send that the rules then happily permitted.
       Comments are stripped first: the note in push.js explaining why it was
       removed names it, and matching that would fail for the one reason that
       is not a problem. */
    const code = pushSrc.replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    assert.ok(code.indexOf('sendToTeam') === -1,
        'sendToTeam is back; it is a broadcast any member could write');
  });
});

describe('the function refuses what the rules would have stopped', () => {
  const BODY = grab(fnSrc, 'exports.onPushQueueCreate = onDocumentCreated(',
      '// 2. Training Reminder');

  it('rejects a document with no recipients instead of broadcasting', () => {
    /* Belt and braces, and the braces are the point: `--only hosting` skips
       a rules deploy silently, so the two locks can fall out of step. */
    assert.ok(/if \(!targets\.length\)/.test(BODY),
        'no guard on an empty target list');
    assert.ok(BODY.indexOf('refusing to') !== -1, 'the refusal is not logged');
    assert.ok(/status: "rejected"/.test(BODY));
  });

  it('has no path at all that sends to everyone', () => {
    /* The old else-branch. Club-wide sends still exist — the training and
       RPE reminders — but they call sendToTokens directly and never come
       through here. */
    assert.ok(BODY.indexOf('getAllTeamMembers') === -1,
        'the broadcast branch is still reachable from a queued document');
    assert.ok(BODY.indexOf('getTeamMembersByRole') === -1,
        'targetRole is another spelling of the same broadcast');
  });

  it('never forwards a click destination from the document', () => {
    /* `url` becomes the notification's link. A push carrying a sender-chosen
       link is phishing wearing the club's own icon. */
    assert.ok(!/payload\.url\s*=/.test(BODY), 'url is still forwarded');
    assert.ok(BODY.indexOf('...data') === -1,
        'the document is spread into the payload, so any field rides along');
  });

  it('clamps the text it does forward', () => {
    ['title', 'body', 'type'].forEach((f) => {
      assert.ok(new RegExp(f + ':\\s*String\\([^)]*\\)\\.slice\\(0,').test(BODY),
          f + ' is not clamped');
    });
  });
});

describe('the rule itself still says what it must', () => {
  /* rules.test.js proves the BEHAVIOUR against the emulator. This is the
     cheap always-on check that the clauses have not been quietly dropped —
     the emulator suite needs Java and is not in the fast path. */
  const RULE = grab(rulesSrc, '      match /pushQueue/{docId} {', '\n      }');

  it('is staff-only', () => {
    assert.ok(/allow create: if isStaffOf\(teamId\)/.test(RULE), RULE);
    assert.ok(!/sameTeam\(teamId\)/.test(RULE),
        'sameTeam is back — that is any member of the club');
  });

  it('demands a non-empty, bounded recipient list', () => {
    assert.ok(/targetPlayers is list/.test(RULE));
    assert.ok(/targetPlayers\.size\(\) > 0/.test(RULE));
    assert.ok(/targetPlayers\.size\(\) <= \d+/.test(RULE));
  });

  it('refuses a url, and the fields the function writes back', () => {
    ['url', 'sentAt', 'tokenCount', 'targetRole'].forEach((f) => {
      assert.ok(RULE.indexOf('!(\'' + f + '\' in request.resource.data)') !== -1,
          f + ' is no longer refused');
    });
  });

  it('bounds the text and pins the status', () => {
    assert.ok(/title\.size\(\) <= \d+/.test(RULE));
    assert.ok(/body\.size\(\) <= \d+/.test(RULE));
    assert.ok(/status == 'pending'/.test(RULE));
  });

  it('lets nobody read the queue back', () => {
    assert.ok(/allow read, update, delete: if false;/.test(RULE));
  });
});
