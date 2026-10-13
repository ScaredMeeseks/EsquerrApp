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

/* v282 — the sign-up form asks for the PERMISSION alone: there is no user
   yet, so nowhere to put a token. Run for real over both platforms. */
describe('the permission, without a token (sign-up)', () => {
  function api(o) {
    const touched = [];
    const db = new Proxy({}, {get: (t, k) => { touched.push(k); return () => db; }});
    // eslint-disable-next-line no-new-func
    const fns = new Function('Capacitor', 'Notification', 'db', 'messaging',
        grab(pushSrc, '  function _isNative()', '  // ── Native Android push') +
        grab(pushSrc, '  /* The permission ALONE', '  async function removeToken()') +
        '\n return {permissionState, askPermission};')(
        o.Capacitor, o.Notification, db, {getToken: () => { touched.push('getToken'); }});
    fns.touched = touched;
    return fns;
  }
  const web = (permission, answer) => {
    const N = {permission, asked: 0};
    N.requestPermission = () => { N.asked++; return Promise.resolve(answer); };
    return N;
  };
  const native = (check, request) => ({
    isNativePlatform: () => true,
    Plugins: {PushNotifications: {
      checkPermissions: async () => ({receive: check}),
      requestPermissions: async () => ({receive: request}),
    }},
  });

  it('web: reads the browser\'s answer, and asks only when told to', async () => {
    const N = web('default', 'granted');
    const a = api({Notification: N});
    assert.strictEqual(await a.permissionState(), 'default');
    assert.strictEqual(N.asked, 0, 'reading the state prompted the user');
    assert.strictEqual(await a.askPermission(), 'granted');
    assert.strictEqual(N.asked, 1);
    assert.strictEqual(await api({Notification: web('denied')}).permissionState(), 'denied');
    assert.deepStrictEqual(a.touched, [], 'no token, no Firestore: there is no user yet');
  });

  it('web: no Notification API (iOS Safari, in-app browsers) is "unsupported"', async () => {
    const a = api({});
    assert.strictEqual(await a.permissionState(), 'unsupported');
    assert.strictEqual(await a.askPermission(), 'unsupported');
  });

  it('web: an old callback-only Safari still answers', async () => {
    const N = {permission: 'default', requestPermission: (cb) => { cb('granted'); }};
    assert.strictEqual(await api({Notification: N}).askPermission(), 'granted');
  });

  it('native: maps the plugin\'s prompt states to "default"', async () => {
    assert.strictEqual(await api({Capacitor: native('prompt')}).permissionState(), 'default');
    assert.strictEqual(await api({Capacitor: native('prompt-with-rationale')}).permissionState(), 'default');
    assert.strictEqual(await api({Capacitor: native('granted')}).permissionState(), 'granted');
    assert.strictEqual(await api({Capacitor: native('prompt', 'denied')}).askPermission(), 'denied');
    const a = api({Capacitor: native('prompt', 'granted')});
    assert.strictEqual(await a.askPermission(), 'granted');
    assert.deepStrictEqual(a.touched, [], 'asked for a token with no user');
  });

  it('native without the plugin, or a plugin that throws, is "unsupported"', async () => {
    assert.strictEqual(await api({Capacitor: {isNativePlatform: () => true, Plugins: {}}})
        .permissionState(), 'unsupported');
    const boom = native('granted');
    boom.Plugins.PushNotifications.checkPermissions = async () => { throw new Error('x'); };
    assert.strictEqual(await api({Capacitor: boom}).permissionState(), 'unsupported');
  });

  it('is exported', () => {
    assert.ok(/return \{[^}]*permissionState, askPermission[^}]*\};/.test(pushSrc));
  });
});

/* v285 — "Prova les notificacions": the server half, run over stubs. */
describe('sendTestPush — one test, to the caller\'s own devices only', () => {
  class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
  function server(o) {
    o = o || {};
    const calls = {sent: [], stamped: 0};
    const userDoc = {
      get: async () => ({exists: true, data: () => ({lastTestPushAt: o.lastMs ? {toMillis: () => o.lastMs} : null})}),
      set: async () => { calls.stamped++; },
      collection: () => ({get: async () => ({docs: (o.tokens || []).map((t) => ({data: () => t}))})}),
    };
    const db = {collection: (c) => { assert.strictEqual(c, 'users'); return {doc: (id) => { calls.doc = id; return userDoc; }}; }};
    // eslint-disable-next-line no-new-func
    const fn = new Function('onCall', 'HttpsError', 'db', 'FieldValue', 'sendToTokens', 'logger', 'SUPERUSER_EMAIL',
        'var exports = {};\n' + grab(fnSrc, 'const TEST_PUSH_GAP_MS', '\n});\n') +
        '\n});\nreturn exports.sendTestPush;')(
        (opts, h) => h, HttpsError, db, {serverTimestamp: () => 'ts'},
        async (entries, payload) => { calls.sent.push({entries, payload}); return {successCount: entries.length, failureCount: 0}; },
        {info() {}}, 'su@x.cat');
    return {fn, calls};
  }
  const exportsShim = 'var exports = {};';

  it('refuses without a signed-in caller', async () => {
    const {fn} = server();
    await assert.rejects(() => fn({}), (e) => e.code === 'unauthenticated');
  });

  it('sends to the CALLER\'s tokens, whatever the request says', async () => {
    const {fn, calls} = server({tokens: [{token: 'a', platform: 'android'}, {token: 'b', platform: 'web'}, {platform: 'web'}]});
    const r = await fn({auth: {uid: 'me', token: {email: 'SU@x.cat'}}, data: {uid: 'someone-else'}});
    assert.strictEqual(calls.doc, 'me', 'the target came from the request');
    assert.deepStrictEqual(r, {tokens: 2, sent: 2});
    assert.deepStrictEqual(calls.sent[0].entries.map((e) => e.uid + ':' + e.token), ['me:a', 'me:b']);
    assert.strictEqual(calls.stamped, 1, 'not stamped, so not rate-limited');
  });

  // v286: the superadmin's tool only. Anybody else is refused before anything is read.
  it('refuses anybody but the superadmin', async () => {
    const {fn, calls} = server({tokens: [{token: 'a'}]});
    await assert.rejects(() => fn({auth: {uid: 'me', token: {email: 'coach@x.cat'}}}),
        (e) => e.code === 'permission-denied');
    await assert.rejects(() => fn({auth: {uid: 'me', token: {}}}), (e) => e.code === 'permission-denied');
    assert.strictEqual(calls.sent.length, 0);
    assert.strictEqual(calls.stamped, 0);
  });

  it('one per minute', async () => {
    const {fn, calls} = server({lastMs: Date.now() - 20e3, tokens: [{token: 'a'}]});
    await assert.rejects(() => fn({auth: {uid: 'me', token: {email: 'su@x.cat'}}}), (e) => e.code === 'resource-exhausted');
    assert.strictEqual(calls.sent.length, 0);
  });

  it('no device registered: says so, sends nothing', async () => {
    const {fn, calls} = server({tokens: []});
    assert.deepStrictEqual(await fn({auth: {uid: 'me', token: {email: 'su@x.cat'}}}), {tokens: 0, sent: 0});
    assert.strictEqual(calls.sent.length, 0);
  });

  it('sendToTokens reports what it did', () => {
    const body = grab(fnSrc, 'async function sendToTokens(tokenEntries, payload) {', '\n// ════');
    assert.ok(/if \(!tokenEntries\.length\) return \{successCount: 0, failureCount: 0\};/.test(body));
    assert.ok(/return \{successCount, failureCount\};\s*\}\s*$/.test(body.trim() + '\n'), 'no counts returned');
    void exportsShim;
  });
});

describe('Push.init — a second account in the same tab gets a token too (v285)', () => {
  function push(native) {
    const calls = {initWeb: 0, ensureWeb: 0, initNative: 0, ensureNative: 0};
    /* No named stubs (suite-registry checks every one exists in the app):
       push.js's own private names are declared in the body, and the spy
       arrives through the one argument of the returned factory. */
    // eslint-disable-next-line no-new-func
    const factory = new Function('return function (spy) {\n' +
        'let _initialized = false;\n' +
        'const _isNative = () => spy.native;\n' +
        'function _initWeb() { _initialized = true; spy.initWeb++; }\n' +
        'function _initNative() { _initialized = true; spy.initNative++; }\n' +
        'function _ensureWebToken() { spy.ensureWeb++; }\n' +
        'function _ensureNativeToken() { spy.ensureNative++; }\n' +
        grab(pushSrc, '  function init() {', '\n  function _ensureNativeToken()') +
        '\nreturn init; };')();
    calls.native = native;
    const init = factory(calls);
    return {init, calls};
  }

  it('web: the listeners once, then the token for each sign-in', () => {
    const {init, calls} = push(false);
    init(); init(); init();
    assert.strictEqual(calls.initWeb, 1, 'listeners attached twice');
    assert.strictEqual(calls.ensureWeb, 2, 'a second sign-in got no token');
  });

  it('native: the same', () => {
    const {init, calls} = push(true);
    init(); init();
    assert.strictEqual(calls.initNative, 1);
    assert.strictEqual(calls.ensureNative, 1);
  });
});
