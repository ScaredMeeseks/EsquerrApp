// ============================================================
// Cloud Functions v2 — EsquerrApp Push Notifications
// ============================================================
// Deploy via: firebase deploy --only functions --project esquerrapp
//
// Triggers:
// 1. onPushQueueCreate — sends FCM when a doc is added to pushQueue
// 2. scheduledTrainingReminder — runs every hour, sends reminders
//    4h before training to players who haven't answered availability
// 3. scheduledRpeReminder — runs every 30 minutes, reminds players
//    as each training/match ENDS (endTime, else start + 90/120 min)
// ============================================================

const {onDocumentCreated, onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const admin = require("firebase-admin");
// FieldValue comes from the modular subpath, NOT `admin.firestore.FieldValue`.
// The Functions emulator stubs firebase-admin and hands back `firestore`
// bound to the module (functionsEmulatorRuntime `Proxied.getOriginal`), and a
// bound function loses its static properties — so `admin.firestore.FieldValue`
// is undefined under the emulator and every delete()/serverTimestamp() throws
// there while working in production. Same sentinels, testable in both.
const {FieldValue} = require("firebase-admin/firestore");
// The functions deploy uploads functions/ alone, so js/utils.js is not
// reachable from this side — see functions/fcf.js on why that helper is a
// second copy and how the two are kept honest.
const {fcfGrupIdOf} = require("./fcf");
admin.initializeApp();

const db = admin.firestore();
const fcm = admin.messaging();

// ── Helper: parse a date+time string as Europe/Madrid local time ──
// Returns a JS Date in UTC that corresponds to the given Madrid local time.
function parseMadridDate(dateStr, timeStr) {
  // Treat the input as UTC temporarily to find Madrid's offset
  const asUtc = new Date(dateStr + "T" + timeStr + ":00Z");
  // Format that UTC instant in Madrid timezone
  const parts = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(asUtc).forEach((p) => {
    parts[p.type] = p.value;
  });
  const h = parts.hour === "24" ? "00" : parts.hour;
  const madridForUtc = new Date(
      `${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}Z`);
  const offsetMs = madridForUtc.getTime() - asUtc.getTime();
  // "21:00 Madrid" → UTC = asUtc - offset
  return new Date(asUtc.getTime() - offsetMs);
}

// ── Helper: parse a teams/{id}/data/{key} doc in EITHER format ──
// Legacy blob format: {v: "<json string>"}.
// Per-field merge format (MERGE_KEYS in js/db.js): the entries ARE the
// doc fields, plus a _migrated marker. Reading only `.v` on a merge-format
// doc silently yields {} — that bug made every player look unanswered.
function parseDataDoc(snap, fallback) {
  if (!snap.exists) return fallback;
  const data = snap.data();
  if (typeof data.v === "string") {
    try {
      return JSON.parse(data.v);
    } catch (e) {
      return fallback;
    }
  }
  const out = {};
  for (const k of Object.keys(data)) {
    if (k !== "_migrated" && k !== "v") out[k] = data[k];
  }
  return out;
}

// ── Phase 5: team data is sharded per category ──────────────────
// Documents are teams/{id}/data/{key}__{category} with a `category`
// field. Nothing addresses a bare `data/fa_x` any more — a read merges
// every shard of the key, a write targets one shard.
//
// Every shard a function writes MUST carry `category`. The client
// queries where('category','in', …) and the rules test the same field,
// so a shard written without it is invisible to the entire app.
const SHARD_SEP = "__";
const SHARD_NONE = "none";
// Mirrors CATEGORY_ORDER in js/utils.js and js/shard.js.
const CATEGORY_ORDER = [
  "amateur", "juvenil", "cadet", "infantil", "alevi", "benjami",
];

function splitShardId(id) {
  const i = String(id).indexOf(SHARD_SEP);
  if (i === -1) return null;
  return {key: String(id).slice(0, i), cat: String(id).slice(i + SHARD_SEP.length)};
}

function shardDocId(key, cat) {
  return key + SHARD_SEP + cat;
}

/** Same order the client merges in, so both sides agree on the result. */
function shardRank(cat) {
  const i = CATEGORY_ORDER.indexOf(cat);
  if (i !== -1) return i;
  return cat === SHARD_NONE ? 90 : 99;
}

/**
 * Every shard document of a team, grouped by base key — ONE collection
 * read rather than a get per key per category. Pre-Phase-5 un-sharded
 * documents are skipped: the cutover wipe removes them, and merging one
 * would double every row it holds.
 *
 * → Map<baseKey, [{cat, ref, snap}]>, each list in category order.
 */
async function readDataShards(teamId, keys) {
  const snap = await db.collection("teams").doc(teamId).collection("data").get();
  const out = new Map();
  snap.forEach((d) => {
    const p = splitShardId(d.id);
    if (!p) return;
    if (keys && !keys.includes(p.key)) return;
    if (!out.has(p.key)) out.set(p.key, []);
    out.get(p.key).push({cat: p.cat, ref: d.ref, snap: d});
  });
  for (const list of out.values()) {
    list.sort((a, b) => shardRank(a.cat) - shardRank(b.cat));
  }
  return out;
}

/** Merge one key's array shards into the single list the old code read. */
function mergeArrayShards(shards) {
  const out = [];
  (shards || []).forEach((s) => {
    const v = parseDataDoc(s.snap, []);
    if (Array.isArray(v)) out.push(...v);
  });
  return out;
}

/**
 * Merge one key's MAP shards into the single object the old code read.
 *
 * Needed for the keys in ROSTER_JOINED_KEYS, which are routed by the
 * PLAYER's category rather than the session's — a juvenil guest at an
 * amateur session has his staff override in `…__juvenil`, so reading only
 * the session's own shard would miss exactly the borrowed players a coach
 * is most likely to have overridden by hand.
 */
function mergeMapShards(shards) {
  const out = {};
  (shards || []).forEach((s) => {
    const v = parseDataDoc(s.snap, {});
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, v);
  });
  return out;
}

// Keys whose category comes from a live join to the roster rather than a
// stamp on the row. Injuries are deliberately NOT stamped — medical history
// follows the player — which is exactly why a category change has to MOVE
// the rows: the old coach can no longer resolve the uid, so the client pins
// them where they are, and the new coach never downloads that shard. The
// history would go dark for everyone. Only the server sees both sides.
//   'array'     rows with playerId === uid
//   'uid'       {uid: …}
//   'uidPrefix' {uid_date: …}
const ROSTER_JOINED_KEYS = {
  fa_injuries: "array",
  fa_injury_notes: "uid",
  fa_injury_zone: "uid",
  fa_injury_dismissed: "uid",
  fa_training_staff_override: "uidPrefix",
};
// Written per FIELD by js/db.js, not as a {v: "<json>"} blob.
const CLIENT_MERGE_KEYS = new Set([
  "fa_injury_notes", "fa_injury_zone", "fa_injury_dismissed",
  "fa_training_staff_override",
]);

function ownsEntryKey(kind, field, uid) {
  if (kind === "uid") return field === uid;
  return field === uid || field.indexOf(uid + "_") === 0;
}

/**
 * Move one member's roster-joined rows into `toCat`'s shards.
 *
 * Scans every shard rather than trusting a "from" category: rows can have
 * been left anywhere by an earlier move, and the point is to end with all
 * of them in one place. A no-op when the member has no such rows.
 */
async function reshardMember(teamId, uid, toCat) {
  if (!teamId || !uid) return;
  const dest = toCat || SHARD_NONE;
  const keys = Object.keys(ROSTER_JOINED_KEYS);
  const shards = await readDataShards(teamId, keys);
  const batch = db.batch();
  let ops = 0;
  let moved = 0;

  for (const key of keys) {
    const kind = ROSTER_JOINED_KEYS[key];
    const list = shards.get(key) || [];
    if (!list.length) continue;
    const isMerge = CLIENT_MERGE_KEYS.has(key);
    const destShard = list.find((s) => s.cat === dest);
    const taken = kind === "array" ? [] : {};

    for (const s of list) {
      if (s.cat === dest) continue;           // already where it belongs
      const parsed = parseDataDoc(s.snap, kind === "array" ? [] : {});
      if (kind === "array") {
        if (!Array.isArray(parsed)) continue;
        const mine = parsed.filter((r) => String(r.playerId || "") === uid);
        if (!mine.length) continue;
        taken.push(...mine);
        batch.set(s.ref, {
          v: JSON.stringify(parsed.filter((r) => String(r.playerId || "") !== uid)),
          category: s.cat,
        }, {merge: true});
        ops++;
      } else {
        const fields = Object.keys(parsed)
            .filter((f) => ownsEntryKey(kind, f, uid));
        if (!fields.length) continue;
        // The format comes from THIS document, not from the key: a merge
        // key can still have a legacy {v:"…"} document, and deleting
        // fields that live inside the blob would remove nothing while the
        // copy below still landed — the rows would exist twice.
        const srcIsBlob = typeof (s.snap.data() || {}).v === "string";
        const removal = {};
        fields.forEach((f) => {
          taken[f] = parsed[f];
          removal[f] = FieldValue.delete();
        });
        if (srcIsBlob) {
          const rest = Object.assign({}, parsed);
          fields.forEach((f) => delete rest[f]);
          batch.set(s.ref, {v: JSON.stringify(rest), category: s.cat}, {merge: true});
        } else {
          batch.update(s.ref, removal);
        }
        ops++;
      }
    }

    const took = kind === "array" ? taken.length : Object.keys(taken).length;
    if (!took) continue;
    moved += took;

    // Land them in the destination, merged with whatever is already there.
    const destRef = destShard ? destShard.ref :
      db.collection("teams").doc(teamId).collection("data")
          .doc(shardDocId(key, dest));
    const existing = destShard ?
      parseDataDoc(destShard.snap, kind === "array" ? [] : {}) :
      (kind === "array" ? [] : {});
    if (kind === "array") {
      const seen = new Set((Array.isArray(existing) ? existing : [])
          .map((r) => String(r.id || "")));
      const add = taken.filter((r) => !seen.has(String(r.id || "")));
      batch.set(destRef, {
        v: JSON.stringify((Array.isArray(existing) ? existing : []).concat(add)),
        category: dest,
      }, {merge: true});
    } else {
      // Same rule for the destination: match the document that is there,
      // and fall back to the key's own format when creating a new shard.
      const destIsBlob = destShard ?
        typeof (destShard.snap.data() || {}).v === "string" : !isMerge;
      if (destIsBlob) {
        batch.set(destRef, {
          v: JSON.stringify(Object.assign({}, existing, taken)),
          category: dest,
        }, {merge: true});
      } else {
        batch.set(destRef, Object.assign({}, taken, {category: dest}), {merge: true});
      }
    }
    ops++;
  }

  if (!ops) return;
  await batch.commit();
  logger.info("reshardMember", {teamId, uid, toCat: dest, rows: moved, ops});
}

// ── Helper: get FCM tokens for users (parallel reads) ──
async function getTokensForUsers(userIds) {
  const snaps = await Promise.all(userIds.map((uid) =>
    db.collection("users").doc(uid).collection("tokens").get()));
  const entries = []; // {token, uid, platform}
  snaps.forEach((snap, i) => {
    snap.forEach((doc) => {
      const d = doc.data();
      // `platform` decides which message shape this token gets — see
      // sendToTokens. Tokens written before it was stored have none, and
      // are treated as web, which is what they were.
      if (d.token) {
        entries.push({token: d.token, uid: userIds[i], platform: d.platform || ""});
      }
    });
  });
  // Deduplicate by token
  const seen = new Set();
  const unique = entries.filter((e) => {
    if (seen.has(e.token)) return false;
    seen.add(e.token);
    return true;
  });
  return unique;
}

// ── Helper: get all team members with a specific role ──
async function getTeamMembersByRole(teamId, role) {
  const snap = await db.collection("users")
      .where("teamId", "==", teamId)
      .get();
  const uids = [];
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.roles && data.roles.includes(role)) {
      uids.push(doc.id);
    }
  });
  return uids;
}

/**
 * The players a training session is actually FOR.
 *
 * The reminders used to nag every player in the club: getTeamMembersByRole
 * has no category clause, so a juvenil player was told to confirm his
 * attendance for an amateur session, and to log RPE for one he never
 * attended. Team letters make that worse, not better -- more sessions per
 * date, each for a different squad.
 *
 * Mirrors playerIsCalled() in js/app.js. An EMPTY `teams` means every
 * letter of the category, which is what a session meant before the field
 * existed; a session with no category at all is legacy and goes to
 * everyone, exactly as it does client-side.
 */
async function squadForSession(teamId, session) {
  const snap = await db.collection("users").where("teamId", "==", teamId).get();
  const guests = Array.isArray(session.guests) ? session.guests.map(String) : [];
  const excluded = Array.isArray(session.excluded) ? session.excluded.map(String) : [];
  const teams = (Array.isArray(session.teams) ? session.teams.filter(Boolean) : []);
  const out = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    if (!d.roles || !d.roles.includes("player")) return;
    const uid = String(doc.id);
    if (excluded.includes(uid)) return;
    if (guests.includes(uid)) { out.push(uid); return; }
    if (!session.category) { out.push(uid); return; }
    if ((d.category || "") !== session.category) return;
    // No letters listed = every letter of the category.
    if (teams.length && !teams.includes(d.team || "")) return;
    out.push(uid);
  });
  return out;
}

/**
 * The players a match RPE reminder is FOR: the convocatòria.
 *
 * This branch used to call getTeamMembersByRole(teamId, "player"), which
 * filters by ROLE alone — no category, no team letter, no call-up. On a
 * match day that nagged EVERY player in the club for a match they were
 * never called up to, juvenil players included.
 *
 * `fa_convocatoria_sent` is exactly "was called up": a map keyed by matchId
 * with {players: [uid], startingXI: [uid], …}, sharded per category through
 * the match (Shard.ROUTES, by: 'match'). An entry that exists and lists
 * nobody means nobody is notified — that is the answer, not a reason to
 * fall back.
 *
 * Only a MISSING entry falls back, because fixtures predate the feature.
 * The fallback is the match's own squad — its category and team letter —
 * never the club.
 *
 * → {uids, source}. `source` is logged so "nobody was called up" can be
 * told apart from "there was no convocatòria" without a second look.
 */
async function squadForMatch(teamId, match, shards) {
  const cat = match.category || SHARD_NONE;
  /* The match's own shard first. The rest are scanned only as a safety net:
     a match that changed category leaves its convocatòria behind until the
     next write re-routes it, and reading a stale one beats notifying the
     whole squad. */
  const all = shards.get("fa_convocatoria_sent") || [];
  const ordered = all.filter((s) => s.cat === cat)
      .concat(all.filter((s) => s.cat !== cat));
  for (const s of ordered) {
    const convo = parseDataDoc(s.snap, {});
    const entry = convo[match.id] || convo[String(match.id)];
    if (entry && Array.isArray(entry.players)) {
      return {uids: entry.players.map(String), source: "convocatoria"};
    }
  }
  return {uids: await squadForSession(teamId, matchAsSession(match)),
    source: "squad"};
}

/**
 * A match, in the shape squadForSession() reads.
 *
 * The squad rule lives in ONE place. Two reminders need "the players this
 * match is for" and re-deriving it in the second is how the two halves of
 * scheduledRpeReminder drifted apart in the first place.
 *
 * A match carries a single `team` letter where a session carries a list; an
 * EMPTY letter means every letter of the category, exactly as an empty
 * `teams` does — which is also the honest reading of a fixture created
 * before letters existed.
 */
function matchAsSession(match) {
  return {
    id: String(match.id),
    date: match.date,
    category: match.category || "",
    teams: match.team ? [match.team] : [],
  };
}

/* ── When an activity finishes ─────────────────────────────────
   Mirrors sessionWindow()/matchEndsAt() in js/app.js, which cannot be
   shared because functions/ deploys on its own. If you change the numbers
   here, change them there: the client decides when a player may ENTER an
   RPE and the server decides when to ask for one, and a mismatch means
   pushing people at a screen that has nothing to answer yet. */
const DEFAULT_SESSION_MINS = 90;
const DEFAULT_MATCH_MINS = 120;
// Must equal scheduledRpeReminder's schedule interval — see endedInWindow.
const RPE_WINDOW_MINS = 30;

/* ── Per-club reminder timing ───────────────────────────────────
   How many hours before a session the "you are counted" push goes out,
   and how many hours before it the answering window closes. Both are set
   by the club lead; these are the fallbacks for a club that has never
   opened the setting. Mirrored in js/app.js — functions/ deploys alone.

   PUSH must be strictly greater than LOCK, or the push announces a
   deadline that has already passed. setClubCategories enforces it. */
const REMINDER_PUSH_HOURS = 4;
const REMINDER_LOCK_HOURS = 3;
const REMINDER_HOURS_MAX = 72;

/** One club's reminder timings, defaulted and sanity-checked. */
function remindersOf(club) {
  const r = (club && club.reminders) || {};
  const num = (v, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= REMINDER_HOURS_MAX ? n : dflt;
  };
  const push = num(r.pushHours, REMINDER_PUSH_HOURS);
  const lock = num(r.lockHours, REMINDER_LOCK_HOURS);
  /* A stored pair that does not satisfy push > lock can only come from a
     write that bypassed the callable. Fall back rather than announce a
     deadline in the past. */
  if (push <= lock) return {pushHours: REMINDER_PUSH_HOURS, lockHours: REMINDER_LOCK_HOURS};
  return {pushHours: push, lockHours: lock};
}

/** "HH:MM" → minutes past midnight, or null. */
function hhmmToMins(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * The instant an activity ends, as a real Date, or null when it cannot be
 * timed at all.
 *
 * Built as start + duration rather than by formatting the end back to
 * HH:MM — a 23:30 session with no endTime ends at "25:00", which no date
 * parser accepts and which would silently become an Invalid Date that
 * every comparison answers `false` for.
 *
 * `time` is normally a plain HH:MM; a vestigial "HH:MM - HH:MM" range
 * survives in old rows, so its second half is honoured for a session
 * before the 90-minute fallback. A MATCH has no endTime field and never
 * had one — it is always kick-off + 120 (90 + half time + added time).
 *
 * @param {object} item a training session or a match
 * @param {string} kind "training" or "match"
 * @return {?Date} when it finishes
 */
function activityEndsAt(item, kind) {
  if (!item || !item.date) return null;
  const parts = String(item.time || "").split(" - ");
  const startHhmm = (parts[0] || "").trim();
  const startMins = hhmmToMins(startHhmm);
  if (startMins === null) return null;

  let endMins = null;
  if (kind !== "match") {
    endMins = hhmmToMins(item.endTime);
    if (endMins === null && parts.length > 1) endMins = hhmmToMins(parts[1]);
  }
  if (endMins === null || endMins <= startMins) {
    endMins = startMins +
      (kind === "match" ? DEFAULT_MATCH_MINS : DEFAULT_SESSION_MINS);
  }
  const start = parseMadridDate(item.date, startHhmm);
  if (isNaN(start.getTime())) return null;
  return new Date(start.getTime() + (endMins - startMins) * 60000);
}

/**
 * Did this activity finish inside the window this run is responsible for?
 *
 * The band is half-open and exactly as wide as the schedule interval, so
 * every activity falls to precisely ONE run — no repeats, no gaps, and no
 * per-send bookkeeping doc to go stale. Same shape as the training
 * reminder's 3.5–4.5 h band.
 *
 * @param {object} item a training session or a match
 * @param {string} kind "training" or "match"
 * @param {Date} now this run's clock
 * @return {boolean} true when it is this run's to send
 */
function endedInWindow(item, kind, now) {
  const end = activityEndsAt(item, kind);
  if (!end) return false;
  const mins = (now.getTime() - end.getTime()) / 60000;
  return mins >= 0 && mins < RPE_WINDOW_MINS;
}

/**
 * Has this player answered for this session?
 * New records are keyed by session id; legacy ones by date, and those can
 * only ever have meant the player's OWN session -- the client that wrote
 * one had no concept of a call-up. Kept in step with readRecord() in
 * js/app.js, which cannot be shared because functions/ deploys alone.
 */
function answeredFor(answers, uid, session) {
  if (answers.has(uid + "_" + session.id)) return true;
  const isGuest = Array.isArray(session.guests) &&
    session.guests.map(String).includes(String(uid));
  return !isGuest && answers.has(uid + "_" + session.date);
}

/**
 * The STAFF's call for this player and session, or undefined.
 *
 * Same key shape and the same legacy guard as answeredFor, but a map
 * rather than a set: the value matters, because "no" and "injured" have to
 * be able to CANCEL a player's own "yes", not merely fail to add one.
 * Mirrors readRecord() in js/app.js.
 */
function overrideFor(overrides, uid, session) {
  const v = overrides[uid + "_" + session.id];
  if (v !== undefined) return v;
  const isGuest = Array.isArray(session.guests) &&
    session.guests.map(String).includes(String(uid));
  if (isGuest) return undefined;
  return overrides[uid + "_" + session.date];
}

/**
 * Is this player to be chased for an RPE for this session?
 *
 * THE COACH WINS. A staff override is a human saying "he was there" (or
 * "he was not"), which outranks both the player's own answer and his
 * silence. Two live gaps before this, in opposite directions:
 *
 *   - a player the coach ADDED by hand never got the push. The client
 *     writes fa_training_staff_override, never a record under the player's
 *     own key (deliberately -- see _ntMarkAttending in js/app.js), and the
 *     reminder read only the trainingAvail collection. He saw the RPE
 *     waiting on his home screen and was never told about it.
 *   - a player the coach marked absent still got chased, because his own
 *     stale "yes" was the only thing being read.
 *
 * This is the rule the CLIENT has always applied in renderPlayerActions:
 *   readRecord(staffOverrides, …) || readRecord(availData, …)
 * The two sides now agree on who attended.
 */
function attendedFor(overrides, answers, uid, session) {
  const call = overrideFor(overrides, uid, session);
  if (call !== undefined && call !== "") return call === "yes" || call === "late";
  return answeredFor(answers, uid, session);
}

/**
 * Is this player COUNTED for a session that has not happened yet?
 *
 * Different question from attendedFor, and the difference is the default.
 * Attendance is opt-OUT in this app: silence means yes, which is what
 * getEffectiveAnswer in js/app.js returns for an unlocked session. So the
 * only players not counted are the ones who (or whose coach) actively said
 * `no` or `injured`.
 *
 * That is exactly the audience for the pre-session push: telling a player
 * who has declined that he "is counted" would be wrong, and telling one who
 * has said nothing is the entire point of the reminder.
 *
 * @param {object} overrides staff calls, uid_sessionId → value
 * @param {object} values the players' own answers, uid_sessionId → value
 * @param {string} uid the player
 * @param {object} session the training session
 * @return {boolean} true when he is expected to turn up
 */
function countedFor(overrides, values, uid, session) {
  const call = overrideFor(overrides, uid, session);
  const own = overrideFor(values, uid, session);
  const v = (call !== undefined && call !== "") ? call : own;
  if (v === undefined || v === "") return true; // silence is a yes
  return v !== "no" && v !== "injured";
}

// ── Helper: get all team members ──
async function getAllTeamMembers(teamId) {
  const snap = await db.collection("users")
      .where("teamId", "==", teamId)
      .get();
  const uids = [];
  snap.forEach((doc) => uids.push(doc.id));
  return uids;
}

/* Where a notification click should land. The app is served from a GitHub
   Pages SUBPATH, and the webpush link used to be a bare "/" — so a click
   from a cold start opened the domain root, not the app. */
const APP_BASE_URL = "https://scaredmeeseks.github.io/EsquerrApp/";

/** True for a token registered by the Capacitor app rather than a browser. */
function isNativeToken(entry) {
  return String((entry && entry.platform) || "").indexOf("native") !== -1;
}

/**
 * Build the FCM message for ONE platform family.
 *
 * Web and native need genuinely different shapes, and sending one message to
 * both is what produced duplicate notifications on the web:
 *
 *   - WEB gets `data` ONLY. A `notification` payload is displayed by the SDK
 *     itself, and sw.js ALSO calls showNotification from onBackgroundMessage
 *     — two notifications for one event. Data-only makes the service worker
 *     the single display point, which is also what lets it honour `tag` and
 *     open the right page.
 *   - NATIVE needs `notification`, because a data-only message shows nothing
 *     when the app is killed. It also gets an `android.notification` block:
 *     `tag` lives there, NOT in data, so the per-session tag the reminders
 *     compute was being ignored and reminders stacked up on Android.
 */
function buildMessage(tokens, payload, native) {
  const link = payload.url || APP_BASE_URL;
  if (!native) {
    return {
      tokens,
      data: payload,
      webpush: {
        headers: {"Urgency": "high"},
        fcmOptions: {link},
      },
    };
  }
  return {
    tokens,
    notification: {
      title: payload.title || "EsquerrApp",
      body: payload.body || "",
    },
    data: payload,
    android: {
      priority: "high",
      collapseKey: payload.tag || undefined,
      notification: {
        channelId: "esquerrapp_default",
        tag: payload.tag || undefined,
        icon: "ic_notification",
        color: "#ffa726",
      },
    },
  };
}

// ── Helper: send FCM to tokens, clean up stale ones ──
async function sendToTokens(tokenEntries, payload) {
  logger.info("sendToTokens", {tokenCount: tokenEntries.length, payload});
  if (!tokenEntries.length) return;

  /* sendEachForMulticast caps at 500 tokens and throws over it — a club
     past 500 devices would have lost the whole send, not part of it. */
  const CHUNK = 500;
  const groups = [
    {native: false, entries: tokenEntries.filter((e) => !isNativeToken(e))},
    {native: true, entries: tokenEntries.filter(isNativeToken)},
  ];

  const stale = [];
  let successCount = 0;
  let failureCount = 0;

  for (const group of groups) {
    for (let i = 0; i < group.entries.length; i += CHUNK) {
      const slice = group.entries.slice(i, i + CHUNK);
      const response = await fcm.sendEachForMulticast(
          buildMessage(slice.map((e) => e.token), payload, group.native));
      successCount += response.successCount;
      failureCount += response.failureCount;
      response.responses.forEach((resp, j) => {
        if (resp.success) return;
        const code = resp.error?.code;
        if (code === "messaging/invalid-registration-token" ||
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-argument") {
          if (slice[j]) stale.push(slice[j]);
        } else {
          logger.warn("FCM send failed for token", {
            token: slice[j]?.token?.slice(0, 20) + "...",
            error: code,
            message: resp.error?.message,
          });
        }
      });
    }
  }

  logger.info("sendToTokens result", {successCount, failureCount});

  // Remove invalid tokens (look up by uid, no collectionGroup needed).
  // Chunked for the same reason as the send: a write batch caps at 500.
  for (let i = 0; i < stale.length; i += CHUNK) {
    const batch = db.batch();
    stale.slice(i, i + CHUNK).forEach((entry) => {
      batch.delete(db.collection("users").doc(entry.uid)
          .collection("tokens").doc(entry.token));
    });
    await batch.commit();
  }
  if (stale.length) logger.info("Cleaned up stale tokens", {staleCount: stale.length});
}

// ════════════════════════════════════════════════════════════
// 1. Push Queue Trigger
// ════════════════════════════════════════════════════════════
exports.onPushQueueCreate = onDocumentCreated({
  document: "teams/{teamId}/pushQueue/{docId}",
  region: "us-central1",
}, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data();
  const teamId = event.params.teamId;
  logger.info("onPushQueueCreate fired", {teamId, data});

  let tokenEntries = [];

  if (data.targetPlayers && data.targetPlayers.length) {
    tokenEntries = await getTokensForUsers(data.targetPlayers);
  } else if (data.targetRole) {
    const uids = await getTeamMembersByRole(teamId, data.targetRole);
    tokenEntries = await getTokensForUsers(uids);
  } else {
    const uids = await getAllTeamMembers(teamId);
    tokenEntries = await getTokensForUsers(uids);
  }

  if (tokenEntries.length) {
    const payload = {
      title: data.title || "EsquerrApp",
      body: data.body || "",
      type: data.type || "general",
      tag: data.type || "esquerrapp",
    };
    if (data.matchId) payload.matchId = String(data.matchId);
    if (data.url) payload.url = data.url;

    await sendToTokens(tokenEntries, payload);
  } else {
    logger.warn("No tokens found for any target users, skipping send");
  }

  try {
    await snap.ref.update({
      status: tokenEntries.length ? "sent" : "no_tokens",
      tokenCount: tokenEntries.length,
      sentAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error("Failed to update pushQueue status", {error: err.message});
  }
});

// ════════════════════════════════════════════════════════════
// 2. Training Reminder — runs on the hour and tells every player
//    COUNTED for a session that he is counted, and by when he can
//    still change his mind.
//
//    Attendance is opt-OUT here: silence means yes. The reminder
//    used to go only to players who had not answered, which is the
//    wrong half — a player who has said nothing and a player who
//    said yes are in exactly the same position, both expected at
//    training, and only one of them was being told. Now everyone
//    who is counted hears it, and the message carries the deadline.
//
//    Both timings are per club and set by the lead:
//      pushHours  how long before the session this goes out (4)
//      lockHours  when the answering window closes          (3)
// ════════════════════════════════════════════════════════════
exports.scheduledTrainingReminder = onSchedule({
  // Wall-clock cron, not "every 60 minutes" — see scheduledRpeReminder.
  // The App Engine interval form drifts by each run's duration, and the
  // ±30-minute band below assumes runs are exactly an hour apart.
  schedule: "0 * * * *",
  timeZone: "Europe/Madrid",
  region: "us-central1",
}, async () => {
  const now = new Date();
  /* A session up to REMINDER_HOURS_MAX away can be today, tomorrow or the
     day after. Three dates costs nothing: `array-contains-any` takes 30. */
  const fmt = new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Madrid"});
  const dates = [0, 1, 2].map((d) => fmt.format(new Date(now.getTime() + d * 24 * 36e5)));

  // Only teams that actually train on these dates (denormalized field
  // maintained by updateTeamDates) — no full collection scan.
  const teamsSnap = await db.collection("teams")
      .where("trainingDates", "array-contains-any", dates).get();
  if (teamsSnap.empty) return;

  await Promise.all(teamsSnap.docs.map(async (teamDoc) => {
    const teamId = teamDoc.id;
    /* teams/{id} and clubs/{id} share an id. The lead's timings live on the
       club doc; a club that has never opened the setting gets the defaults. */
    const clubSnap = await db.collection("clubs").doc(teamId).get();
    const {pushHours, lockHours} = remindersOf(clubSnap.data());

    // Every category's sessions, merged: the reminder is per team, and a
    // shard-at-a-time read would remind one squad and silently skip the rest.
    const shards = await readDataShards(teamId,
        ["fa_training", "fa_training_staff_override"]);
    const training = mergeArrayShards(shards.get("fa_training"));
    // The coach's call outranks the player's answer here exactly as it does
    // in the RPE reminder — a player dropped by staff is not counted.
    const overrides = mergeMapShards(shards.get("fa_training_staff_override"));
    const upcoming = training.filter((s) =>
      s.status !== "past" && s.time && dates.includes(s.date));
    if (!upcoming.length) return;

    // Answers come from the canonical record collection
    const availSnap = await db.collection("teams").doc(teamId)
        .collection("trainingAvail").where("date", "in", dates).get();
    /* Both key formats, so a record written by an old client still counts.
       A MAP, not a set: countedFor needs the value — only `no`/`injured`
       take a player out of the audience, and "has answered" cannot say
       which answer it was. */
    const values = {};
    availSnap.docs.forEach((d) => {
      const r = d.data() || {};
      if (r.sessionId) values[r.uid + "_" + r.sessionId] = r.value;
      if (r.date && values[r.uid + "_" + r.date] === undefined) {
        values[r.uid + "_" + r.date] = r.value;
      }
    });

    for (const session of upcoming) {
      const startTime = session.time.split(" - ")[0]?.trim();
      if (!startTime) continue;
      const sessionDate = parseMadridDate(session.date, startTime);
      const hoursUntil = (sessionDate - now) / 36e5;
      /* Half-open, exactly one hour wide, so a session falls to precisely
         one run. The old band was `< 3.5 || > 4.5` -- inclusive at BOTH
         ends, which double-sends for a session landing exactly on 3.5 or
         4.5 hours, i.e. any session at half past the hour. */
      if (hoursUntil < pushHours - 0.5 || hoursUntil >= pushHours + 0.5) continue;

      // The session's own squad, not the whole club.
      const playerUids = await squadForSession(teamId, session);
      // Everyone expected to turn up -- which INCLUDES those who have said
      // nothing, and excludes only a `no`/`injured` from the player or his
      // coach. Telling someone who has declined that he is counted is the
      // one thing this message must never do.
      const counted = playerUids.filter((uid) =>
        countedFor(overrides, values, uid, session));
      const lockAt = new Date(sessionDate.getTime() - lockHours * 36e5);
      const lockHhmm = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit",
        hour12: false,
      }).format(lockAt);
      logger.info("trainingReminder", {teamId, date: session.date,
        sessionId: session.id, players: playerUids.length,
        counted: counted.length, pushHours, lockHours, lockAt: lockHhmm});

      if (!counted.length) continue;
      const tokens = await getTokensForUsers(counted);
      if (!tokens.length) continue;
      await sendToTokens(tokens, {
        title: "🏋️ Entrenament avui!",
        /* Deliberately NOT session.focus. The focus is the coach's own
           planning label ("Força i prevenció", "Partit condicionat") and
           means nothing to a player reading a lock-screen notification. */
        body: "Entrenament a les " + startTime +
          ". Comptem amb tu — si no pots venir, canvia-ho abans de les " +
          lockHhmm + ".",
        // Tagged per SESSION: two squads training the same evening are
        // two notifications, and a date tag would collapse them into one.
        type: "training_reminder", page: "player-home",
        tag: "training-" + (session.id || session.date),
      });
    }
  }));
});

// ════════════════════════════════════════════════════════════
// 3. RPE Reminder — runs every 30 minutes and asks each squad for
//    its RPE as ITS OWN activity ends.
//
//    This was a single 23:00 cron. That was wrong in both
//    directions: an 11:30–12:00 session was chased eleven hours
//    late, and a 22:00 session was chased at 23:00 — an hour in,
//    while it was still being trained. The end time the coach
//    actually set is the honest trigger; start + 90 (training) or
//    + 120 (match) is the fallback when none was set.
//
//    One push PER ACTIVITY rather than one per player per day: two
//    squads training the same evening finish at different times and
//    are two different questions.
// ════════════════════════════════════════════════════════════
exports.scheduledRpeReminder = onSchedule({
  // Unix cron, deliberately NOT the App Engine "every 30 minutes" form.
  // That one is an INTERVAL schedule: it waits N minutes after the previous
  // run FINISHES, so consecutive runs drift apart by each run's duration and
  // endedInWindow's bands stop tiling — the last few seconds of one band get
  // covered by nothing, and an activity ending there is chased by no run at
  // all. Unix cron fires on the wall clock at :00 and :30, so consecutive
  // runs are exactly RPE_WINDOW_MINS apart, always.
  schedule: "*/30 * * * *", // keep RPE_WINDOW_MINS in step
  timeZone: "Europe/Madrid",
  region: "us-central1",
}, async () => {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Madrid"});
  const today = fmt.format(now);
  /* A 23:30 session ends after midnight, and the run that owns it is
     tomorrow's 00:00. Yesterday has to stay in scope or that session is
     never chased at all. */
  const yesterday = fmt.format(new Date(now.getTime() - 24 * 36e5));
  const dates = [yesterday, today];

  // Only teams with a training or match on those dates (denormalized fields)
  const [trainTeams, matchTeams] = await Promise.all([
    db.collection("teams")
        .where("trainingDates", "array-contains-any", dates).get(),
    db.collection("teams")
        .where("matchDates", "array-contains-any", dates).get(),
  ]);
  const teamDocs = new Map();
  trainTeams.forEach((d) => teamDocs.set(d.id, d));
  matchTeams.forEach((d) => teamDocs.set(d.id, d));
  if (!teamDocs.size) return;

  await Promise.all([...teamDocs.keys()].map(async (teamId) => {
    const shards = await readDataShards(teamId,
        ["fa_training", "fa_matches", "fa_convocatoria_sent",
          "fa_training_staff_override"]);
    const training = mergeArrayShards(shards.get("fa_training"));
    const matches = mergeArrayShards(shards.get("fa_matches"));
    /* The coach's call, which outranks the player's own answer in BOTH
       directions -- see attendedFor. Free: readDataShards already reads the
       whole data/ collection, so this costs no extra query. */
    const overrides = mergeMapShards(shards.get("fa_training_staff_override"));
    /* filter, not find. Two squads can train the same evening, and `find`
       silently picked one -- so the other squad was never chased, and the
       first squad's session was used to judge everybody. */
    const dueTraining = training.filter((t) =>
      dates.includes(t.date) && endedInWindow(t, "training", now));
    // Same reason: two categories play on the same Saturday.
    const dueMatches = matches.filter((m) =>
      dates.includes(m.date) && endedInWindow(m, "match", now));
    if (!dueTraining.length && !dueMatches.length) return;

    /* Only the dates something actually ended on. `in` takes at most 30
       values and this is at most 2, but reading a date with nothing due on
       it is a wasted query on every one of the 48 daily runs. */
    const dueDates = [...new Set(
        [...dueTraining, ...dueMatches].map((a) => a.date))];

    // RPE + availability from the canonical record collections
    const teamRef = db.collection("teams").doc(teamId);
    const [rpeSnap, availSnap] = await Promise.all([
      teamRef.collection("rpe").where("date", "in", dueDates).get(),
      teamRef.collection("trainingAvail").where("date", "in", dueDates).get(),
    ]);
    const rpeIds = new Set(rpeSnap.docs.map((d) => d.id));
    /* Availability keyed per SESSION: with two sessions on one date a
       single uid->value map answered for whichever record came last. */
    const availBySession = new Set();
    availSnap.forEach((d) => {
      const r = d.data() || {};
      if (r.value !== "yes" && r.value !== "late") return;
      if (r.sessionId) availBySession.add(r.uid + "_" + r.sessionId);
      if (r.date) availBySession.add(r.uid + "_" + r.date);
    });

    for (const session of dueTraining) {
      const squad = await squadForSession(teamId, session);
      const missing = squad.filter((uid) => {
        // The coach's call wins over the player's answer AND over silence.
        if (!attendedFor(overrides, availBySession, uid, session)) return false;
        if (rpeIds.has(uid + "_training_" + session.id)) return false;
        if (!Array.isArray(session.guests) ||
            !session.guests.map(String).includes(String(uid))) {
          if (rpeIds.has(uid + "_training_" + session.date)) return false; // legacy
        }
        return true;
      });
      logger.info("rpeReminder", {teamId, kind: "training", date: session.date,
        sessionId: session.id, squad: squad.length, missing: missing.length});
      if (!missing.length) continue;
      const tokens = await getTokensForUsers(missing);
      if (!tokens.length) continue;
      await sendToTokens(tokens, {
        title: "📊 No oblidis el RPE!",
        // The focus is the coach's planning label, not something a player
        // recognises on a lock screen. Same reason as the training reminder.
        body: "Com ha anat l'entrenament? Registra el teu RPE.",
        type: "rpe_reminder",
        page: "player-actions",
        // Tagged per ACTIVITY: a date tag collapsed two squads' reminders
        // into one notification on Android.
        tag: "rpe-training-" + (session.id || session.date),
      });
    }

    for (const match of dueMatches) {
      const called = await squadForMatch(teamId, match, shards);
      const missing = called.uids.filter((uid) =>
        !rpeIds.has(uid + "_match_" + match.id));
      logger.info("rpeReminder", {teamId, kind: "match", date: match.date,
        matchId: match.id, source: called.source, called: called.uids.length,
        missing: missing.length});
      if (!missing.length) continue;
      const tokens = await getTokensForUsers(missing);
      if (!tokens.length) continue;
      await sendToTokens(tokens, {
        title: "📊 No oblidis el RPE!",
        body: "Com ha anat el partit? Registra el teu RPE.",
        type: "rpe_reminder",
        page: "player-actions",
        tag: "rpe-match-" + match.id,
      });
    }
  }));
});

// ════════════════════════════════════════════════════════════
// 4. Match Availability Reminder — runs every Friday at 20:00.
//    Notifies players who haven't submitted their disponibilitat
//    for matches on Saturday or Sunday.
// ════════════════════════════════════════════════════════════
exports.scheduledMatchAvailReminder = onSchedule({
  schedule: "0 20 * * 5",
  timeZone: "Europe/Madrid",
  region: "us-central1",
}, async () => {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Madrid"});
  const satStr = fmt.format(new Date(now.getTime() + 24 * 36e5));
  const sunStr = fmt.format(new Date(now.getTime() + 48 * 36e5));

  // Only teams with a weekend match (denormalized field)
  const teamsSnap = await db.collection("teams")
      .where("matchDates", "array-contains-any", [satStr, sunStr]).get();
  if (teamsSnap.empty) {
    logger.info("matchAvailReminder: no weekend matches");
    return;
  }

  await Promise.all(teamsSnap.docs.map(async (teamDoc) => {
    const teamId = teamDoc.id;
    const shards = await readDataShards(teamId, ["fa_matches"]);
    const matches = mergeArrayShards(shards.get("fa_matches"));
    if (!matches.length) return;
    const weekendMatches = matches.filter((m) =>
      m.status !== "past" && m.date && (m.date === satStr || m.date === sunStr));
    if (!weekendMatches.length) return;

    // Answers from the canonical record collection; roster queried ONCE
    const matchIds = weekendMatches.map((m) => String(m.id));
    const availSnap = await db.collection("teams").doc(teamId)
        .collection("matchAvail").where("matchId", "in", matchIds.slice(0, 10)).get();
    const answered = new Set(availSnap.docs.map((d) => d.data().uid + "_" + d.data().matchId));

    for (const match of weekendMatches) {
      /* The squad this fixture is for — category AND team letter.

         This asked the club-wide role query, which filters by ROLE alone —
         no category, no letter. On a weekend with three fixtures (amateur A, amateur B,
         juvenil) every player in the club got three separate pushes, two of
         them about teams he is not in, and they do not collapse on the
         device because the tag is per match.

         It cannot use the convocatòria the way scheduledRpeReminder does:
         this runs on FRIDAY, before one exists, and exists precisely so the
         coach has availability answers to pick from on Saturday.

         INJURED PLAYERS ARE STILL ASKED, deliberately. Nothing here consults
         fa_injuries and nothing should: a player recovering may well be
         available by Sunday, and that answer is the coach's to receive
         rather than the server's to assume. Availability is a question, not
         a status.

         A player from another category who is called up by agreement never
         gets this push, and that is correct — he is not in this squad. The
         coach adds him to the convocatòria by hand. */
      const playerUids = await squadForSession(teamId, matchAsSession(match));
      const unanswered = playerUids.filter((uid) =>
        !answered.has(uid + "_" + String(match.id)));
      logger.info("matchAvailReminder", {teamId, matchId: match.id,
        category: match.category || "", team: match.team || "",
        players: playerUids.length, unanswered: unanswered.length});
      if (!unanswered.length) continue;
      const tokens = await getTokensForUsers(unanswered);
      if (tokens.length) {
        const label = (match.home || "") + " vs " + (match.away || "");
        await sendToTokens(tokens, {
          title: "⚽ Confirma la teva disponibilitat!",
          body: label + " · " + match.date +
            (match.time ? " a les " + match.time : "") +
            ". Indica si estàs disponible.",
          type: "match_avail_reminder",
          page: "player-home",
          tag: "match-avail-" + match.id,
        });
      }
    }
  }));
});

// ── 5. fcfClassificacio — proxy FCF league standings ──
//
// Takes a grupId, NOT a URL. fcf.cat's August-2026 rebuild put the standings
// behind /api/competition/classificacio?grupId=…, which sends no
// Access-Control-Allow-Origin, so a browser still cannot read it directly and
// this proxy stays.
//
// The parameter change is also the point. The previous version fetched a
// client-supplied URL behind a regex allowlist — a shape that is one
// loosened character away from an SSRF, and that had to be reasoned about
// every time it was edited. Now the only thing a caller controls is a run of
// digits interpolated into a constant address: there is no URL to get wrong.
//
// Clients built before v117 call this with ?url= and parse HTML. They get a
// 400 and no standings, which is exactly what they get today from the dead
// fcf.cat pages — there is deliberately no compatibility branch keeping an
// HTML path alive that no longer has any HTML to parse.
const FCF_API = "https://www.fcf.cat/api/competition/classificacio?grupId=";

exports.fcfClassificacio = onRequest(
    {cors: true, region: "us-central1", memory: "256MiB"},
    async (req, res) => {
      const grupId = String(req.query.grupId || "");
      if (!/^\d{1,15}$/.test(grupId)) {
        res.status(400).json({error: "Invalid grupId"});
        return;
      }
      try {
        const resp = await fetch(FCF_API + grupId, {
          headers: {"User-Agent": "Mozilla/5.0"},
        });
        if (!resp.ok) throw new Error("FCF returned " + resp.status);
        const json = await resp.json();
        res.set("Cache-Control", "public, max-age=300");
        res.json(json);
      } catch (err) {
        logger.error("fcfClassificacio error", err);
        res.status(502).json({error: "Failed to fetch FCF"});
      }
    },
);

// ── Membership helpers (roster email lists) ──────────────────
// clubs/{clubId}/rosters/{category}-{letter} holds the two email lists that
// decide who may join a club and as what. They live in their own subcollection
// (not on the club doc, which every member can read) because they are PII.

const SUPERUSER_EMAIL = "marna96@gmail.com";

/** Enabled categories of a club, from its `categories` config map. */
function enabledCategories(club) {
  const cats = (club && club.categories) || {};
  return Object.keys(cats).filter((k) => cats[k] && cats[k].enabled);
}

/** Lowercase + trim an email list field off a roster doc. */
function normEmails(arr) {
  return (Array.isArray(arr) ? arr : [])
      .map((e) => String(e || "").trim().toLowerCase()).filter(Boolean);
}

/** The sub-roles under `staff`. "coach" is the default and the most permissive. */
const STAFF_SUB_ROLES = ["coach", "fitness", "delegate"];

/**
 * Normalise the `staffRoles` map off a roster doc: {email: subRole}, both
 * sides lowercased, unknown values dropped. An address absent from the map is
 * a plain coach — that is what every roster written before sub-roles existed
 * looks like, so "absent" must keep meaning "full access".
 */
function normStaffRoles(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  Object.keys(obj).forEach((k) => {
    const email = String(k || "").trim().toLowerCase();
    const role = String(obj[k] || "").trim().toLowerCase();
    if (email && STAFF_SUB_ROLES.includes(role)) out[email] = role;
  });
  return out;
}

/** Read every roster doc of a club once, as [{key, staff[], players[]}]. */
async function loadRosters(clubId) {
  const snap = await db.collection("clubs").doc(clubId)
      .collection("rosters").get();
  return snap.docs.map((doc) => ({
    key: doc.id,
    staff: normEmails((doc.data() || {}).staffEmails),
    players: normEmails((doc.data() || {}).playerEmails),
    staffRoles: normStaffRoles((doc.data() || {}).staffRoles),
  }));
}

/**
 * Collapse the sub-roles an address holds across several rosters into one.
 *
 * A staff member can be on more than one category's list, and the lead sets
 * the dropdown per list — so the values can disagree. Resolution is
 * deliberately PERMISSIVE: any roster that leaves them undowngraded (or says
 * "coach") wins, and two different downgrades cancel out back to coach. The
 * gating is a UI convenience, and the failure that actually hurts is a real
 * head coach locked out of their own sections by a stale dropdown elsewhere.
 *
 * @param {Array<string>} found Sub-role per roster the address is staff on.
 * @return {string} One of STAFF_SUB_ROLES.
 */
function resolveStaffRole(found) {
  if (!found.length) return "coach";
  if (found.includes("coach")) return "coach";
  const distinct = [...new Set(found)];
  return distinct.length === 1 ? distinct[0] : "coach";
}

/**
 * Resolve one address against already-loaded rosters.
 * @param {Array} rosters Result of loadRosters.
 * @param {string} email Lowercased address to look for.
 * @return {Object} {roles, staffCats, staffRole, category, team}. `roles` is
 *   empty when the address is on no list at all — the caller decides whether
 *   that is a rejection. `staffRole` is "" for anyone who is not staff.
 */
function membershipFrom(rosters, email) {
  const out = {roles: [], staffCats: [], staffRole: "", category: "", team: ""};
  if (!email) return out;
  const staffCats = new Set();
  const subRoles = [];
  let playerKey = null;
  rosters.forEach((r) => {
    if (r.staff.includes(email)) {
      staffCats.add(r.key.split("-")[0]);
      subRoles.push((r.staffRoles || {})[email] || "coach");
    }
    // First player match wins — a player belongs to exactly one team.
    if (!playerKey && r.players.includes(email)) playerKey = r.key;
  });
  if (playerKey) {
    const dash = playerKey.indexOf("-");
    out.roles.push("player");
    out.category = dash === -1 ? playerKey : playerKey.slice(0, dash);
    out.team = dash === -1 ? "" : playerKey.slice(dash + 1);
  }
  if (staffCats.size) {
    out.roles.push("staff");
    out.staffCats = [...staffCats];
    out.staffRole = resolveStaffRole(subRoles);
    // A staff-only member still needs a category for the UI's default view.
    if (!out.category) out.category = out.staffCats[0];
  }
  return out;
}

/* `resolveMembership(clubId, email)` used to live here as a convenience for
   the one-address callers. It was removed once every caller also needed the
   roster list for syncBoardAuthor: it hid a loadRosters() inside itself, so
   keeping it meant either reading the rosters twice or having two ways to do
   the same thing. Callers now do `loadRosters` + `membershipFrom` explicitly,
   which is the same single read. */

/**
 * The team a club should show against a tactical board's author: the HIGHEST
 * category they coach here, plus that category's letters.
 *
 * "Highest" is the LOWEST CATEGORY_ORDER index — amateur outranks benjami.
 * Reuses shardRank() rather than adding a fourth copy of the order
 * (js/utils.js, js/shard.js and this file hold one each, pinned against each
 * other by test/shard.test.js), and its "unknown -> 99" already sorts last.
 *
 * @param {Array} rosters Result of loadRosters.
 * @param {string} email Lowercased address.
 * @return {Object|null} {category, rank, letters}, or null when the address is
 *   on no staff list of this club — which syncBoardAuthor reads as "they left".
 */
function authorLabelFrom(rosters, email) {
  if (!email) return null;
  const keys = rosters.filter((r) => r.staff.includes(email)).map((r) => r.key);
  if (!keys.length) return null;
  const catOf = (k) => {
    const dash = k.indexOf("-");
    return dash === -1 ? k : k.slice(0, dash);
  };
  let best = null;
  keys.forEach((k) => {
    const rank = shardRank(catOf(k));
    if (!best || rank < best.rank) best = {category: catOf(k), rank};
  });
  best.letters = keys
      .filter((k) => catOf(k) === best.category)
      .map((k) => {
        const dash = k.indexOf("-");
        return dash === -1 ? "" : k.slice(dash + 1);
      })
      .filter(Boolean)
      .sort();
  return best;
}

/**
 * Maintain clubs/{clubId}/boardAuthors/{uid} — the label a club shows for
 * whoever drew a tactical board.
 *
 * This exists because membership is single-valued: a coach who leaves club A
 * has users/{uid}.teamId == club B, so A can no longer read their profile,
 * while A's board library must still name who drew each board and for which
 * team. Denormalised per club rather than stamped onto every board, so a coach
 * changing category costs ONE write instead of N — and N is not even
 * reachable, since a departed coach's boards are writable by nobody but them.
 *
 * Leaving FREEZES rather than deletes, and does so by writing ONLY the status
 * fields. "Their last team in this club" therefore needs no snapshotting
 * logic: it is simply whatever is already stored, left alone.
 *
 * Deliberately stores `category` + `letters` and NOT a rendered "Cadet A"
 * string — the app is trilingual and the client already localises category
 * names. A server-rendered label would pick one language for everybody.
 *
 * @param {string} clubId Club whose library shows this author.
 * @param {string} uid Author.
 * @param {Object} profile {email, name} from users/{uid}.
 * @param {Array} rosters Result of loadRosters(clubId) — passed in so a bulk
 *   roster edit resolves every address against one read.
 * @param {Object} [opts] {deleted: true} when the person is being erased.
 */
async function syncBoardAuthor(clubId, uid, profile, rosters, opts) {
  if (!clubId || !uid) return;
  const email = String((profile && profile.email) || "").trim().toLowerCase();
  const label = authorLabelFrom(rosters, email);
  const ref = db.collection("clubs").doc(clubId)
      .collection("boardAuthors").doc(uid);

  if (!label) {
    // Gone from every staff list. Only freeze a label that EXISTS: a player,
    // or a coach removed before they ever drew anything, should not leave a
    // tombstone behind in a collection that only exists to name authors.
    const cur = await ref.get();
    if (!cur.exists) return;
    const patch = {
      active: false,
      leftAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (opts && opts.deleted) patch.deleted = true;
    await ref.set(patch, {merge: true});
    return;
  }

  const patch = {
    email,
    category: label.category,
    categoryRank: label.rank,
    letters: label.letters,
    active: true,
    deleted: false,
    leftAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  // Only when we actually have one. joinClub runs BEFORE the client writes
  // users/{uid}, so it has no name to offer, and a merge carrying name:""
  // would wipe the good name a later trigger had already stored.
  const name = (profile && profile.name) || "";
  if (name) patch.name = name;
  await ref.set(patch, {merge: true});
}

/**
 * The roles array to persist on users/{uid}.
 *
 * "lead" is a role in its own right, and always server-derived — a client may
 * send it but never grants it. Two reasons it exists:
 *  - a lead may be a player, a coach, both, or neither (just running the
 *    club), so "lead" has to be separable from player/staff;
 *  - an empty roles array strands a member on the role-selection screen, and
 *    a lead's own address is normally on no roster list.
 * @param {boolean} isLead Whether this member is the club's team lead.
 * @param {Array} chosen player/staff entries to keep.
 * @return {Array} the roles to store.
 */
function rolesFor(isLead, chosen) {
  const out = [];
  (chosen || []).forEach((r) => {
    if ((r === "player" || r === "staff") && !out.includes(r)) out.push(r);
  });
  if (isLead) out.push("lead");
  return out;
}

/**
 * Collapse a membership into the single-string `role` claim plus its `cats`.
 *
 * `cats` means "the categories you may SEE", not "the categories you coach".
 * A player therefore carries their own category — it used to be [] , which
 * would make every per-category security rule fail closed against the entire
 * player base the moment Phase 5 narrows them. A player with no squad yet
 * gets [], which is correct: there is nothing for them to see.
 *
 * @param {Object} club The club document data (for its enabled categories).
 * @param {boolean} isLead Whether this member is the club's team lead.
 * @param {Object} m Result of membershipFrom.
 * @return {Object} {role, cats} to write as custom claims.
 */
function claimsFor(club, isLead, m) {
  if (isLead) return {role: "lead", cats: enabledCategories(club)};
  if (m.roles.includes("staff")) return {role: "staff", cats: m.staffCats};
  return {role: "player", cats: m.category ? [m.category] : []};
}

// ── 6. joinClub — validate a club code and assign membership ──
// Club membership is ONLY assigned server-side: clients can no longer
// write their own teamId (security rules reject it). Codes live in
// clubCodes/{CODE} → {clubId}, unreadable by clients.
exports.joinClub = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cal iniciar sessió.");
  }
  const uid = request.auth.uid;
  const email = (request.auth.token.email || "").toLowerCase();
  const code = String((request.data && request.data.code) || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Codi no vàlid.");
  }

  // Brute-force guard: max 10 attempts per hour per user
  const attemptRef = db.collection("joinAttempts").doc(uid);
  const attemptSnap = await attemptRef.get();
  const now = Date.now();
  const a = attemptSnap.exists ? attemptSnap.data() : {count: 0, windowStart: now};
  if (now - a.windowStart > 3600e3) {
    a.count = 0;
    a.windowStart = now;
  }
  if (a.count >= 10) {
    throw new HttpsError("resource-exhausted", "Massa intents. Prova-ho més tard.");
  }
  await attemptRef.set({count: a.count + 1, windowStart: a.windowStart});

  const codeSnap = await db.collection("clubCodes").doc(code).get();
  if (!codeSnap.exists) {
    throw new HttpsError("not-found", "Codi de club incorrecte.");
  }
  const clubId = codeSnap.data().clubId;
  const clubSnap = await db.collection("clubs").doc(clubId).get();
  if (!clubSnap.exists) {
    throw new HttpsError("not-found", "Club no trobat.");
  }
  const club = clubSnap.data();

  const isLead = (club.leadEmail || "").toLowerCase() === email;
  const isSuper = email === SUPERUSER_EMAIL;

  // Membership gate: the address must appear on one of the club's roster
  // lists. The lead and the superuser always bypass it — otherwise nobody
  // could ever bootstrap a brand-new club, whose rosters are empty.
  // Rosters loaded once: membershipFrom and the board-author sync below both
  // read them, and this is a single collection read either way.
  const rosters = await loadRosters(clubId);
  const m = membershipFrom(rosters, email);
  if (!isLead && !isSuper && !m.roles.length) {
    throw new HttpsError("permission-denied",
        "El teu correu no està registrat en cap equip d'aquest club. " +
        "Demana al teu entrenador que t'hi afegeixi.");
  }

  // Role, category and team all come from the lists — the member never picks
  // them. Written here (server-side) because the client may not touch them.
  await db.collection("users").doc(uid).set({
    teamId: clubId,
    isTeamLead: isLead,
    // Left as the lists say, deliberately NOT run through rolesFor(): a fresh
    // lead is normally on no list, so this is [] and navigate() sends them to
    // the role screen to choose whether they also play or coach. Their "lead"
    // role is added when they confirm (setRole), and from then on their roles
    // are never empty again.
    roles: m.roles,
    category: m.category,
    team: m.team,
    staffCategories: m.staffCats,
    // Sub-role under `staff` — "" for a player. Gates which staff sections the
    // client shows; see STAFF_ROLE_ACCESS in js/app.js.
    staffRole: m.staffRole,
  }, {merge: true});

  // Stamp membership + role as Auth custom claims so security rules can
  // authorize from the token (no per-request doc reads). claimsUpdatedAt
  // tells the client to force-refresh its ID token.
  const {role, cats} = claimsFor(club, isLead, m);
  await admin.auth().setCustomUserClaims(uid, {teamId: clubId, role, cats});
  await db.collection("users").doc(uid).set(
      {claimsUpdatedAt: FieldValue.serverTimestamp()},
      {merge: true},
  );
  // Tactical-board author label. THIS is the call site that is easy to miss:
  // when a lead adds a coach's address to a roster, onRosterWritten fires but
  // finds no users/{uid} yet and skips them. joinClub is where that uid first
  // exists, so without this a new coach's boards would render authorless until
  // some unrelated roster edit happened to re-trigger the other path.
  // No name is available here — the client writes users/{uid} AFTER this call
  // returns — so syncBoardAuthor omits it and setRole fills it moments later.
  try {
    await syncBoardAuthor(clubId, uid, {email}, rosters);
  } catch (e) {
    logger.warn("joinClub: boardAuthors sync failed", {clubId, uid, err: String(e)});
  }
  logger.info("joinClub", {uid, clubId, isLead, role, cats});

  return {
    clubId,
    name: club.name || "",
    badgeUrl: club.badgeUrl || "",
    categories: club.categories || [],
    fcfLinks: club.fcfLinks || [],
    isTeamLead: isLead,
    // The client seeds its session from these so a listed member skips the
    // role-selection screen entirely. A fresh lead gets [] here on purpose —
    // see the users-doc write above.
    roles: m.roles,
    category: m.category,
    team: m.team,
    staffCategories: m.staffCats,
    staffRole: m.staffRole,
  };
});

// ── 7. setRole — update a member's roles + keep claims in sync ──
// Callers: the club's team lead, the superuser, or the member themselves.
// A SELF call can no longer choose its own roles: they are re-derived from
// the club's roster email lists and the requested value is ignored. Without
// that, any player could call this with roles:['staff'] from the console and
// walk straight past the membership gate.
exports.setRole = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cal iniciar sessió.");
  }
  const caller = request.auth;
  const uid = request.data && request.data.uid;
  let roles = (request.data && request.data.roles) || [];
  // "lead" is accepted in the payload (the role screen sends back whatever it
  // was given) but is stripped here and re-derived from target.isTeamLead
  // below — it is never something a caller can grant.
  if (!uid || !Array.isArray(roles) ||
      !roles.every((r) => ["player", "staff", "lead"].includes(r))) {
    throw new HttpsError("invalid-argument", "Paràmetres no vàlids.");
  }
  roles = roles.filter((r) => r !== "lead");

  const targetSnap = await db.collection("users").doc(uid).get();
  if (!targetSnap.exists) {
    throw new HttpsError("not-found", "Usuari no trobat.");
  }
  const target = targetSnap.data();
  const teamId = target.teamId;

  const isSuper = caller.token.email === "marna96@gmail.com";
  const isSelf = caller.uid === uid;
  // Lead check: claims first, users-doc fallback (pre-backfill sessions)
  let isLeadOfTeam = caller.token.teamId === teamId && caller.token.role === "lead";
  if (!isLeadOfTeam && !isSelf && !isSuper) {
    const callerSnap = await db.collection("users").doc(caller.uid).get();
    const c = callerSnap.exists ? callerSnap.data() : {};
    isLeadOfTeam = c.teamId === teamId && c.isTeamLead === true;
  }
  if (!isSuper && !isSelf && !isLeadOfTeam) {
    throw new HttpsError("permission-denied",
        "Només el responsable del club pot canviar rols d'altres membres.");
  }

  const email = (target.email || "").toLowerCase();
  const club = teamId ?
    ((await db.collection("clubs").doc(teamId).get()).data() || {}) : {};
  // Rosters loaded once — membershipFrom and the board-author sync below both
  // read them, and this is a single collection read either way.
  const rosters = teamId ? await loadRosters(teamId) : [];
  const m = teamId ? membershipFrom(rosters, email) :
    {roles: [], staffCats: [], staffRole: ""};

  const targetIsLead = target.isTeamLead === true;

  // A self-call may not choose its own roles — take whatever the club's
  // roster lists say. Only the lead and the superuser get a manual override.
  // A club member on no list falls back to plain "player": they are
  // unassigned, not expelled. Without this an empty roles array bounced them
  // straight back to the role-selection screen that called us, forever.
  //
  // The lead is the exception: they DO pick their own player/staff roles
  // (isLeadOfTeam is true when a lead calls about themselves, so this branch
  // is skipped) — running the club, playing for it and coaching in it are
  // three separate things and any combination is valid.
  if (isSelf && !isSuper && !isLeadOfTeam) {
    roles = (!m.roles.length && teamId && !targetIsLead) ? ["player"] : m.roles;
  }
  roles = rolesFor(targetIsLead, roles);

  const role = targetIsLead ? "lead" :
    (roles.includes("staff") ? "staff" : "player");

  // `cats` is never taken from the caller either — always re-derived, so a
  // manual role change can't hand someone categories the lead hasn't
  // assigned. A staff member on no list gets [] and sees the "no category
  // assigned" empty state.
  let cats = [];
  if (teamId) {
    if (role === "lead") cats = enabledCategories(club);
    else if (role === "staff") cats = m.staffCats;
    // A player sees their own category. Kept in step with claimsFor() — if
    // these two disagree, a member's claim depends on which path last
    // touched them, which is exactly the kind of drift that is invisible
    // until a security rule starts reading it.
    else if (m.category) cats = [m.category];
  }

  // Re-derived from the roster lists like `roles` and `cats` above, never
  // taken from the payload: the sub-role is the lead's to set in Config Club,
  // and a self-call must not be able to promote itself out of Fitness. Someone
  // the lead marks staff manually is on no list, so they get the default.
  const staffRole = roles.includes("staff") ? (m.staffRole || "coach") : "";

  await admin.auth().setCustomUserClaims(uid, {teamId: teamId || null, role, cats});
  await db.collection("users").doc(uid).set({
    roles,
    staffCategories: cats,
    staffRole,
    claimsUpdatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  // Board author label — this is usually where a NAME first becomes available
  // for someone who registered moments ago, since joinClub runs before the
  // client writes users/{uid}.
  if (teamId) {
    try {
      await syncBoardAuthor(teamId, uid, {email, name: target.name}, rosters);
    } catch (e) {
      logger.warn("setRole: boardAuthors sync failed", {teamId, uid, err: String(e)});
    }
  }
  logger.info("setRole", {by: caller.uid, uid, roles, role, cats});
  return {ok: true, role, cats};
});

// ── 7a. setClubCategories — the ONLY writer of a club's team layout ──
//
// `maxTeams` is a COMMERCIAL limit on how many teams a lead may create, so
// the UI cannot be the enforcement point: firestore.rules used to let a lead
// write any field on their own club document, including the very quota meant
// to bind them. The rules now refuse `categories` and `maxTeams` outright and
// this callable is the only path, because it is the only place that can count
// the teams before it commits.
//
// It also fixes a pre-existing bug: nothing recomputed a lead's `cats` claim
// when the enabled categories changed, so enabling a NEW category left the
// client querying a category its own token did not authorise — a
// permission-denied on the whole data/ listener. Claims are refreshed here.

/**
 * The live teams of a club, as `{category}-{letter}` keys.
 *
 * A verbatim port of rosterKeys() in js/app.js. It cannot be imported —
 * functions/ deploys on its own and cannot reach ../js at runtime — so
 * test/quota.test.js pins the two copies against each other instead.
 */
function rosterKeysOf(categories) {
  const cats = categories || {};
  const keys = [];
  CATEGORY_ORDER.forEach((cat) => {
    if (!cats[cat] || !cats[cat].enabled) return;
    const letters = (cats[cat].letters && cats[cat].letters.length) ?
      cats[cat].letters : ["A"];
    letters.forEach((l) => keys.push(cat + "-" + l));
  });
  return keys;
}

/** A club's allowance. Missing, malformed or below 1 all mean 1. */
function maxTeamsOf(club) {
  const n = Math.floor(Number(club && club.maxTeams));
  return (isFinite(n) && n >= 1) ? Math.min(n, 156) : 1;
}

/**
 * Would this save break the quota?
 *
 * An INCREASE test, deliberately not an absolute one. A club grandfathered
 * above its allowance must stay editable: it can still save unchanged, and
 * can still remove a team, and is only stopped from growing. An absolute
 * test would lock such a lead out of the very screen they need to fix it.
 */
function exceedsQuota(prevCount, nextCount, max) {
  return nextCount > max && nextCount > prevCount;
}

exports.setClubCategories = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cal iniciar sessió.");
  }
  const caller = request.auth;
  const isSuper = caller.token.email === SUPERUSER_EMAIL;
  // Club identity from the CLAIM, never the payload — otherwise any lead
  // could reconfigure any other club by passing its id.
  const clubId = (isSuper && request.data && request.data.clubId) ?
    String(request.data.clubId) : caller.token.teamId;
  if (!clubId) throw new HttpsError("failed-precondition", "Cap club.");
  if (!isSuper && caller.token.role !== "lead") {
    throw new HttpsError("permission-denied",
        "Només el responsable del club pot configurar les categories.");
  }

  const clubRef = db.collection("clubs").doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) throw new HttpsError("not-found", "Club no trobat.");
  const club = clubSnap.data() || {};

  // Shape. Rejecting unknown keys matters: rosterKeys ignores them, but they
  // would sit forever in a document every member of the club downloads.
  const data = request.data || {};
  const categories = data.categories;
  if (!categories || typeof categories !== "object" || Array.isArray(categories)) {
    throw new HttpsError("invalid-argument", "categories no vàlid.");
  }
  for (const key of Object.keys(categories)) {
    if (!CATEGORY_ORDER.includes(key)) {
      throw new HttpsError("invalid-argument", "Categoria desconeguda: " + key);
    }
    const c = categories[key];
    if (!c || typeof c !== "object" || typeof c.enabled !== "boolean" ||
        !Array.isArray(c.letters) || !c.letters.length || c.letters.length > 26) {
      throw new HttpsError("invalid-argument", "Categoria mal formada: " + key);
    }
    const seen = new Set();
    for (const l of c.letters) {
      if (typeof l !== "string" || !/^[A-Z]$/.test(l) || seen.has(l)) {
        throw new HttpsError("invalid-argument", "Lletra no vàlida a " + key);
      }
      seen.add(l);
    }
  }

  const prevKeys = rosterKeysOf(club.categories);
  const nextKeys = rosterKeysOf(categories);
  if (!nextKeys.length) {
    throw new HttpsError("invalid-argument", "Cal activar almenys una categoria.");
  }

  // fcfLinks / schedules may only address teams that exist in this save.
  const allowed = new Set(nextKeys);
  for (const field of ["fcfLinks", "schedules"]) {
    const map = data[field];
    if (map === undefined) continue;
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      throw new HttpsError("invalid-argument", field + " no vàlid.");
    }
    for (const k of Object.keys(map)) {
      if (!allowed.has(k)) {
        throw new HttpsError("invalid-argument",
            field + " conté un equip inexistent: " + k);
      }
    }
  }

  // An FCF link is only ever consumed for its grupId, so a link with no
  // grupId in it is not a link — it is the pre-rebuild address, which now
  // 404s. Refusing it here is the only place a lead is told BEFORE the
  // standings quietly come back empty.
  if (data.fcfLinks) {
    for (const [k, v] of Object.entries(data.fcfLinks)) {
      if (v === "" || v === null || v === undefined) continue;
      if (typeof v !== "string" || !fcfGrupIdOf(v)) {
        throw new HttpsError("invalid-argument",
            "L'enllaç FCF de " + k + " no és vàlid. Obre la classificació a " +
            "fcf.cat i copia l'adreça sencera (ha de contenir grupId).");
      }
    }
  }

  const max = maxTeamsOf(club);
  if (exceedsQuota(prevKeys.length, nextKeys.length, max)) {
    throw new HttpsError("failed-precondition",
        "Aquest club no pot tenir més de " + max + " equips.");
  }

  // Removals never come through here, even now that deleteTeam exists.
  // Dropping a letter from this map alone would leave the team's matches,
  // medical history and availability behind, its roster doc orphaned — and
  // joinClub still registering new people onto the dead team.
  const removed = prevKeys.filter((k) => !nextKeys.includes(k));
  if (removed.length) {
    throw new HttpsError("failed-precondition",
        "Per eliminar un equip utilitza deleteTeam (" + removed.join(", ") + ").");
  }

  /* Reminder timings. Validated HERE rather than trusted from the client,
     because they drive a push to every player in the club: a lockHours
     above pushHours would announce a deadline that had already passed, and
     a bad number would silently mute the reminder for the whole club. */
  if (data.reminders !== undefined) {
    const r = data.reminders;
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      throw new HttpsError("invalid-argument", "reminders no vàlid.");
    }
    for (const k of Object.keys(r)) {
      if (k !== "pushHours" && k !== "lockHours") {
        throw new HttpsError("invalid-argument", "reminders: camp desconegut " + k);
      }
    }
    const push = Number(r.pushHours);
    const lock = Number(r.lockHours);
    const ok = (n) => Number.isInteger(n) && n >= 1 && n <= REMINDER_HOURS_MAX;
    if (!ok(push) || !ok(lock)) {
      throw new HttpsError("invalid-argument",
          "Les hores han de ser un nombre enter entre 1 i " + REMINDER_HOURS_MAX + ".");
    }
    if (push <= lock) {
      throw new HttpsError("invalid-argument",
          "L'avís s'ha d'enviar abans de tancar les respostes.");
    }
  }

  const payload = {categories};
  if (data.fcfLinks !== undefined) payload.fcfLinks = data.fcfLinks;
  if (data.schedules !== undefined) payload.schedules = data.schedules;
  if (data.reminders !== undefined) {
    payload.reminders = {
      pushHours: Number(data.reminders.pushHours),
      lockHours: Number(data.reminders.lockHours),
    };
  }
  await clubRef.set(payload, {merge: true});

  // Claims: the enabled set drives every member's `cats`, and nothing else
  // recomputes it when this map changes.
  const prevEnabled = enabledCategories(club).sort().join(",");
  const nextEnabled = enabledCategories({categories}).sort().join(",");
  let refreshed = 0;
  if (prevEnabled !== nextEnabled) {
    const updated = {categories};
    const rosters = await loadRosters(clubId);
    const members = await db.collection("users").where("teamId", "==", clubId).get();
    const leadEmail = String(club.leadEmail || "").toLowerCase();
    for (const doc of members.docs) {
      const u = doc.data() || {};
      const email = String(u.email || "").toLowerCase();
      const isLead = email === leadEmail || u.isTeamLead === true;
      const m = membershipFrom(rosters, email);
      const next = claimsFor(updated, isLead, m);
      const before = (u.staffCategories || []).slice().sort().join(",");
      if (before === next.cats.slice().sort().join(",")) continue;
      try {
        await admin.auth().setCustomUserClaims(doc.id,
            {teamId: clubId, role: next.role, cats: next.cats});
        await doc.ref.set({
          staffCategories: next.cats,
          staffRole: m.staffRole,
          claimsUpdatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        refreshed++;
      } catch (e) {
        // No Auth account yet (a pre-registered invitee) — nothing to claim.
        logger.warn("setClubCategories: claim refresh skipped",
            {uid: doc.id, err: e.message});
      }
    }
  }

  logger.info("setClubCategories", {
    clubId, by: caller.uid, teams: nextKeys.length, max, refreshed,
  });
  return {ok: true, teams: nextKeys.length, max, refreshed};
});

// ── 7a-bis. setClubKits — the club's shirts, shorts and socks ──
//
// A separate callable rather than a field on setClubCategories, and rather
// than a wider allow-list in firestore.rules. Three reasons, heaviest first:
//
//   1. The rules clause a lead writes through — hasOnly(['fcfLinks',
//      'schedules']) — is documented as a BACK-COMPAT SHIM to be dropped
//      once a v55+ APK circulates. Adding 'kits' there would make a
//      permanent feature depend on a clause the next maintainer is
//      instructed to delete, and kits would break from a rules change
//      nobody connected to them.
//   2. setClubCategories does quota accounting, roster-key removal checks
//      and a claims refresh over every member. Saving a colour must not be
//      able to trip "Per eliminar un equip utilitza deleteTeam", and must
//      not re-stamp custom claims. Kits and categories share no invariant.
//   3. This document is downloaded by every member of the club, which is
//      the stated reason unknown category keys are rejected above. Kits are
//      free-form colour data and need the same strictness.
//
// firestore.rules is deliberately UNTOUCHED: members can already read the
// club doc, and the Admin SDK bypasses rules for the write.
const KIT_HEX = /^#[0-9a-fA-F]{6}$/;
const KIT_ID = /^[a-z0-9][a-z0-9-]{2,31}$/;
// Mirrors STRIPE_MAX in js/utils.js. functions/ deploys on its own and cannot
// require ../js at runtime, so the two are kept in step by hand — and
// kits.test.js asserts they agree, because a server cap BELOW the client's
// would reject a kit the editor happily offered.
const STRIPE_MAX = 9;

/**
 * A stored fill: a bare hex, or `s|<v|h>|<n>|<c1>|<c2>`.
 * `allowStripes` is false for shorts — real ones are single-colour, and
 * parseFill() degrades a striped value to solid SILENTLY, so enforcing it
 * only in the UI would leave a bad value sitting in the document looking
 * fine.
 */
function validKitFill(v, allowStripes) {
  if (typeof v !== "string") return false;
  if (v.slice(0, 2) !== "s|") return KIT_HEX.test(v);
  if (!allowStripes) return false;
  const p = v.split("|");
  if (p.length !== 5) return false;
  if (p[1] !== "v" && p[1] !== "h") return false;
  const n = Number(p[2]);
  if (!Number.isInteger(n) || n < 2 || n > STRIPE_MAX) return false;
  return KIT_HEX.test(p[3]) && KIT_HEX.test(p[4]);
}

exports.setClubKits = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cal iniciar sessió.");
  }
  const caller = request.auth;
  const isSuper = caller.token.email === SUPERUSER_EMAIL;
  // Same rule as setClubCategories: the club comes from the CLAIM, never the
  // payload, or any lead could restyle any other club.
  const clubId = (isSuper && request.data && request.data.clubId) ?
    String(request.data.clubId) : caller.token.teamId;
  if (!clubId) throw new HttpsError("failed-precondition", "Cap club.");
  if (!isSuper && caller.token.role !== "lead") {
    throw new HttpsError("permission-denied",
        "Només el responsable del club pot configurar les equipacions.");
  }

  const kits = (request.data || {}).kits;
  if (!Array.isArray(kits)) {
    throw new HttpsError("invalid-argument", "kits no vàlid.");
  }
  // At least one: kitsOf() falls back to the defaults on an empty list, so
  // saving zero would silently resurrect them after the lead deleted
  // everything — a save that appears to do the opposite of what was asked.
  if (kits.length < 1 || kits.length > 3) {
    throw new HttpsError("invalid-argument", "Entre 1 i 3 equipacions.");
  }

  const seen = new Set();
  const clean = kits.map((k) => {
    if (!k || typeof k !== "object" || Array.isArray(k)) {
      throw new HttpsError("invalid-argument", "Equipació no vàlida.");
    }
    const extra = Object.keys(k).filter((f) =>
      ["id", "label", "shirt", "shorts", "socks"].indexOf(f) === -1);
    if (extra.length) {
      throw new HttpsError("invalid-argument",
          "Camps desconeguts: " + extra.join(", "));
    }
    const id = String(k.id || "");
    if (!KIT_ID.test(id)) {
      throw new HttpsError("invalid-argument", "id d'equipació no vàlid.");
    }
    if (seen.has(id)) {
      throw new HttpsError("invalid-argument", "ids d'equipació repetits.");
    }
    seen.add(id);
    const label = String(k.label == null ? "" : k.label);
    // Control characters would render as mojibake in a button title on
    // every member's device.
    // eslint-disable-next-line no-control-regex
    if (label.length > 24 || /[\x00-\x1f\x7f]/.test(label)) {
      throw new HttpsError("invalid-argument", "Nom d'equipació no vàlid.");
    }
    if (!validKitFill(k.shirt, true) || !validKitFill(k.socks, true)) {
      throw new HttpsError("invalid-argument", "Color d'equipació no vàlid.");
    }
    if (!validKitFill(k.shorts, false)) {
      throw new HttpsError("invalid-argument",
          "Els pantalons han de ser d'un sol color.");
    }
    return {id, label, shirt: k.shirt, shorts: k.shorts, socks: k.socks};
  });

  // merge:true — this callable owns `kits` and must not disturb categories,
  // fcfLinks, badgeUrl or anything else on the document.
  await db.collection("clubs").doc(clubId).set({kits: clean}, {merge: true});
  logger.info("setClubKits", {clubId, by: caller.uid, kits: clean.length});
  return {ok: true, kits: clean.length};
});

// ── 7b. onRosterWritten — roster list edits re-apply to existing members ──
// When the lead adds a staff email (or staff add a player email) belonging to
// somebody who has ALREADY registered, joinClub has long since run for them.
// This trigger re-derives their membership so the change lands without a
// reinstall — and, just as importantly, revokes access when an address is
// removed. The client's users/{uid} listener watches claimsUpdatedAt, force-
// refreshes the ID token and re-navigates, so an open app updates live.
exports.onRosterWritten = onDocumentWritten({
  document: "clubs/{clubId}/rosters/{teamKey}",
  region: "us-central1",
}, async (event) => {
  const clubId = event.params.clubId;
  // Membership signature per address: "s:{subRole}" if on staffEmails, "p" if
  // on playerEmails. Comparing signatures (rather than a flat email list) also
  // catches an address MOVED between the two lists in a single edit — and,
  // because the staff signature carries the sub-role, a lead flipping only the
  // Coach/Fitness/Delegate dropdown. Without the sub-role in here that edit
  // looks like a no-op and returns below, leaving users/{uid}.staffRole stale.
  const sigOf = (snap) => {
    const out = {};
    if (!snap || !snap.exists) return out;
    const d = snap.data() || {};
    const subs = normStaffRoles(d.staffRoles);
    normEmails(d.staffEmails).forEach((e) => {
      out[e] = (out[e] || "") + "s:" + (subs[e] || "coach");
    });
    normEmails(d.playerEmails).forEach((e) => {
      out[e] = (out[e] || "") + "p";
    });
    return out;
  };

  // Everyone touched by this edit: added, removed AND moved addresses all
  // need recomputing (removal is what revokes access).
  const before = sigOf(event.data && event.data.before);
  const after = sigOf(event.data && event.data.after);
  const touched = [...new Set(Object.keys(before).concat(Object.keys(after)))]
      .filter((e) => (before[e] || "") !== (after[e] || ""));
  if (!touched.length) return;

  const clubSnap = await db.collection("clubs").doc(clubId).get();
  if (!clubSnap.exists) return;
  const club = clubSnap.data();
  // Read the club's rosters ONCE — a bulk paste can touch a whole squad, and
  // resolving each address separately would re-read every doc per person.
  const rosters = await loadRosters(clubId);

  for (const email of touched) {
    // Only members of THIS club — an address may exist in another club too.
    const userSnap = await db.collection("users")
        .where("teamId", "==", clubId).where("email", "==", email)
        .limit(1).get();
    if (userSnap.empty) continue; // not registered yet; joinClub will apply it
    const doc = userSnap.docs[0];
    const isLead = (club.leadEmail || "").toLowerCase() === email;
    const m = membershipFrom(rosters, email);
    const {role, cats} = claimsFor(club, isLead, m);
    // Taken off every list but still a club member = UNASSIGNED, not locked
    // out. Keeping roles empty stranded them on the role-selection screen
    // forever: setRole re-derives a self-call's roles from these same lists,
    // so picking "player" handed back [] and looped. This is also the path a
    // coach uses to move a player up a category — the squad assignment is
    // cleared here and the next coach's list re-fills it. Membership itself
    // (teamId) is untouched: only joinClub writes it, so clearing it would
    // make re-adding their email unable to bring them back.
    const detached = !isLead && !m.roles.length;
    await admin.auth().setCustomUserClaims(doc.id, {teamId: clubId, role, cats});
    // update(), NOT set({merge:true}): we only ever reach here for a user that
    // already exists, and a merge-set would RECREATE the doc if it vanished in
    // between. deleteMember strips roster entries before deleting the person,
    // so that race is real — a zombie users/{uid} would resurrect them in the
    // roster reconcile.
    // A lead's player/staff roles are their own choice, not something the
    // roster lists dictate — merge rather than overwrite, or an unrelated
    // list edit would silently strip whatever they picked.
    const prev = doc.data().roles || [];
    const nextRoles = isLead ?
      rolesFor(true, [...new Set([...prev, ...m.roles])]) :
      rolesFor(false, detached ? ["player"] : m.roles);
    // Remember the squad they came out of, so the Unassigned list can show a
    // coach where to put them back. Only recorded when there was one.
    const prevCat = doc.data().category || "";
    const prevTeam = doc.data().team || "";
    const patch = {
      roles: nextRoles,
      staffCategories: m.staffCats,
      // Re-derived, never merged: a lead who drops someone from Fitness back
      // to Coach must see the downgrade reversed, and a member taken off every
      // staff list keeps no sub-role at all.
      staffRole: m.staffRole,
      category: detached ? "" : (m.category || prevCat),
      team: detached ? "" : (m.team || prevTeam),
      claimsUpdatedAt: FieldValue.serverTimestamp(),
    };
    if (detached && prevCat) {
      patch.prevCategory = prevCat;
      patch.prevTeam = prevTeam;
    }
    try {
      await doc.ref.update(patch);
    } catch (e) {
      logger.info("onRosterWritten: user gone, skipping", {clubId, email});
      continue;
    }
    // The category change re-shards their injury history — see
    // onMemberCategoryChanged, which watches the user doc so EVERY writer
    // is covered, not just this one (staff re-assign an unassigned player
    // straight from the client).
    //
    // Tactical-board author label. Deliberately AFTER the user update and
    // outside its try/catch: a label is cosmetic, and failing to write one
    // must not abort the membership change that has already been applied.
    try {
      await syncBoardAuthor(clubId, doc.id,
          {email, name: doc.data().name}, rosters);
    } catch (e) {
      logger.warn("onRosterWritten: boardAuthors sync failed",
          {clubId, uid: doc.id, err: String(e)});
    }
    logger.info("onRosterWritten",
        {clubId, uid: doc.id, email, role, cats, staffRole: m.staffRole, detached});
  }
});

// ── 7d. onClubLeadChanged — hand the club over to a new team lead ──
// Fires on any club write but returns immediately unless leadEmail actually
// changed. A trigger rather than a callable so the club doc and the user
// records can never drift apart, whatever route the change came in by.
//
// Only the superuser can edit the club doc's leadEmail in practice (the rules
// also allow the current lead, but the UI is superadmin-only) — a club that
// could demote itself to a mistyped address would be unrecoverable.
exports.onClubLeadChanged = onDocumentWritten({
  document: "clubs/{clubId}",
  region: "us-central1",
}, async (event) => {
  const clubId = event.params.clubId;
  const before = event.data && event.data.before;
  const after = event.data && event.data.after;
  if (!after || !after.exists) return; // club deleted — nothing to hand over
  const club = after.data() || {};
  const norm = (v) => String(v || "").trim().toLowerCase();
  const prevEmail = norm(before && before.exists ? before.data().leadEmail : "");
  const nextEmail = norm(club.leadEmail);
  // Guard: every other club edit (categories, schedules, badge…) lands here
  // too. Unchanged lead = nothing to do.
  if (prevEmail === nextEmail) return;

  const rosters = await loadRosters(clubId);
  const memberByEmail = async (email) => {
    if (!email) return null;
    const snap = await db.collection("users")
        .where("teamId", "==", clubId).where("email", "==", email)
        .limit(1).get();
    return snap.empty ? null : snap.docs[0];
  };

  // ── Outgoing lead ──
  const outgoing = await memberByEmail(prevEmail);
  if (outgoing) {
    const m = membershipFrom(rosters, prevEmail);
    if (m.roles.length) {
      // Still a player and/or coach by the roster lists — they stay in the
      // club with exactly that, just no longer running it.
      const {role, cats} = claimsFor(club, false, m);
      await admin.auth().setCustomUserClaims(outgoing.id,
          {teamId: clubId, role, cats});
      await outgoing.ref.update({
        isTeamLead: false,
        roles: rolesFor(false, m.roles),
        staffCategories: m.staffCats,
        staffRole: m.staffRole,
        category: m.category || outgoing.data().category || "",
        team: m.team || outgoing.data().team || "",
        claimsUpdatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // Neither player nor staff: leading the club was their only reason to
      // be in it, so they leave it. Their records stay keyed by uid, so
      // adding them back to a roster list later restores everything.
      await admin.auth().setCustomUserClaims(outgoing.id,
          {teamId: null, role: "player", cats: []});
      await outgoing.ref.update({
        teamId: FieldValue.delete(),
        isTeamLead: false,
        roles: [],
        staffCategories: [],
        staffRole: "",
        category: "",
        team: "",
        claimsUpdatedAt: FieldValue.serverTimestamp(),
      });
      // Drop them from the club roster blob, or they linger in every squad
      // list until something else rewrites it. Every shard: a lead has no
      // category of their own, but which shard holds them depends on what
      // they were before, so all of them have to be checked.
      const leadShards = await readDataShards(clubId, ["fa_users"]);
      await scrubShards(leadShards, "fa_users", (arr) => (Array.isArray(arr) ?
        arr.filter((u) => String(u.id) !== outgoing.id) : null));
    }
    // Board author label. In the first branch they are still staff somewhere,
    // so this refreshes it; in the second they are on no list at all, so
    // authorLabelFrom returns null and the label FREEZES at whatever team they
    // last coached — which is exactly what the club library must keep showing
    // for the boards they leave behind.
    try {
      await syncBoardAuthor(clubId, outgoing.id,
          {email: prevEmail, name: outgoing.data().name}, rosters);
    } catch (e) {
      logger.warn("onClubLeadChanged: boardAuthors sync failed",
          {clubId, uid: outgoing.id, err: String(e)});
    }
    logger.info("onClubLeadChanged: demoted",
        {clubId, uid: outgoing.id, keptRoles: m.roles});
  }

  // ── Incoming lead ──
  const incoming = await memberByEmail(nextEmail);
  if (incoming) {
    // Already a member: they keep whatever they were — a coach who takes over
    // the club is still a coach — and simply gain the lead role. No role
    // picker: their roles are already non-empty.
    const m = membershipFrom(rosters, nextEmail);
    const prev = incoming.data().roles || [];
    const {role, cats} = claimsFor(club, true, m);
    await admin.auth().setCustomUserClaims(incoming.id,
        {teamId: clubId, role, cats});
    await incoming.ref.update({
      isTeamLead: true,
      roles: rolesFor(true, [...new Set([...prev, ...m.roles])]),
      // Re-derived from the lists like everywhere else. A lead is on no roster
      // of their own, so this is usually "" — harmless, because a lead is
      // never gated by sub-role in the first place.
      staffRole: m.staffRole,
      claimsUpdatedAt: FieldValue.serverTimestamp(),
    });
    // A lead's claim is role:'lead', which passes isStaffOf in the rules, so
    // leads author boards too and need a label like anyone else.
    try {
      await syncBoardAuthor(clubId, incoming.id,
          {email: nextEmail, name: incoming.data().name}, rosters);
    } catch (e) {
      logger.warn("onClubLeadChanged: boardAuthors sync failed",
          {clubId, uid: incoming.id, err: String(e)});
    }
    logger.info("onClubLeadChanged: promoted", {clubId, uid: incoming.id});
  } else {
    // Not registered in this club yet. Nothing to do: joinClub matches on
    // leadEmail, so they become lead when they sign up with the club code —
    // and the membership gate lets a lead through without a roster entry.
    logger.info("onClubLeadChanged: new lead not registered yet",
        {clubId, email: nextEmail});
  }
});

// ── 7c. deleteMember — erase a person and their data (superuser only) ──
// The counterpart to "leave the squad" on the Registrations page, which only
// detaches someone. This is the irreversible one.
//
// It has to be a function rather than a client write: the FCM token
// subcollection is owner-only in the rules (and deleting a user document does
// NOT delete its subcollections), joinAttempts is unreachable from any client,
// the Auth account needs the Admin SDK, and storage.rules cannot express a
// working delete for profile pictures.
//
// Archived seasons are deliberately LEFT ALONE so past squads and statistics
// still add up — an erase covers the live club, not the history books.
// Match events keep the person's NAME (snapshotted below before the uid goes)
// so scorelines stay correct and attributed.

/**
 * Apply a scrub to EVERY shard of a base key.
 *
 * The mutate contract is unchanged: a shard's content has the same shape
 * as the old whole-club blob, so each callback below works per shard
 * without knowing sharding exists. Both write paths in scrubDataDoc
 * preserve the document's `category` field — the blob branch merges and
 * the per-field branch updates — so a scrubbed shard stays visible.
 */
async function scrubShards(shardsByKey, key, mutate) {
  let changed = false;
  for (const s of shardsByKey.get(key) || []) {
    if (await scrubDataDoc(s.ref, mutate)) changed = true;
  }
  return changed;
}

/** Rewrite a data/{key} doc, handling blob and per-field-merge formats. */
async function scrubDataDoc(ref, mutate) {
  const snap = await ref.get();
  if (!snap.exists) return false;
  const raw = snap.data() || {};
  if (typeof raw.v === "string") {
    let parsed;
    try {
      parsed = JSON.parse(raw.v);
    } catch (e) {
      return false;
    }
    const next = mutate(parsed);
    if (next === null) return false;
    await ref.set({v: JSON.stringify(next)}, {merge: true});
    return true;
  }
  // Per-field merge doc: mutate() returns the field names to remove.
  const fields = {};
  const drop = mutate(raw) || [];
  drop.forEach((f) => {
    fields[f] = FieldValue.delete();
  });
  if (!Object.keys(fields).length) return false;
  await ref.update(fields);
  return true;
}

exports.deleteMember = onCall({region: "us-central1", timeoutSeconds: 300},
    async (request) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Cal iniciar sessió.");
      }
      const uid = request.data && request.data.uid;
      if (!uid || typeof uid !== "string") {
        throw new HttpsError("invalid-argument", "Falta l'identificador.");
      }
      if (uid === request.auth.uid) {
        throw new HttpsError("failed-precondition",
            "No et pots esborrar a tu mateix.");
      }

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const user = userSnap.exists ? userSnap.data() : {};
      const email = String(user.email || "").trim().toLowerCase();
      const name = String(user.name || "").trim();
      const teamId = user.teamId;
      const done = {uid, email, name, teamId: teamId || null};

      // ── Authorization ──
      // The superuser, or the lead of the target's OWN club. A lead must be
      // able to remove someone from their club without going through the
      // superuser, but never from anyone else's — so the club comparison is
      // taken from the caller's token claims, never from the request.
      const callerEmail = (request.auth.token.email || "").toLowerCase();
      const isSuper = callerEmail === SUPERUSER_EMAIL;
      const isLeadOfTargetClub = !!teamId &&
        request.auth.token.role === "lead" &&
        request.auth.token.teamId === teamId;
      if (!isSuper && !isLeadOfTargetClub) {
        throw new HttpsError("permission-denied",
            "Només l'administrador o el responsable del club pot esborrar " +
            "un membre.");
      }
      // The superuser's own account is never deletable through here.
      if (email === SUPERUSER_EMAIL) {
        throw new HttpsError("failed-precondition",
            "No es pot esborrar el compte d'administrador.");
      }

      // ── 1. Roster email lists — do this FIRST, so that even if a later
      // step fails the person cannot simply register again. ──
      if (teamId && email) {
        const rosterSnap = await db.collection("clubs").doc(teamId)
            .collection("rosters").get();
        let touched = 0;
        for (const d of rosterSnap.docs) {
          const v = d.data() || {};
          const keep = (arr) => (Array.isArray(arr) ? arr : [])
              .filter((e) => String(e || "").trim().toLowerCase() !== email);
          const staffKeep = keep(v.staffEmails);
          const playerKeep = keep(v.playerEmails);
          const changed = staffKeep.length !== (v.staffEmails || []).length ||
            playerKeep.length !== (v.playerEmails || []).length;
          if (!changed) continue;
          // NB: this write fires onRosterWritten, which will try to update a
          // user doc we are about to delete. A merge-set on a missing doc
          // recreates it, so the user delete in step 6 must come after.
          await d.ref.set({
            staffEmails: staffKeep,
            playerEmails: playerKeep,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          touched++;
        }
        done.rosterDocs = touched;
      }

      // ── 1b. Board author label: FREEZE it, never delete it. ──
      // Their tactical boards SURVIVE this — nothing cascades, because a
      // club's library is meant to outlive the coach who drew it — so removing
      // the label would turn every one of those boards into "—" in the club
      // library. Step 1 already fires onRosterWritten, which freezes it as a
      // side effect; doing it explicitly makes the intent legible and records
      // WHY they are gone. Empty rosters: someone being erased is by
      // definition on no list.
      if (teamId) {
        try {
          await syncBoardAuthor(teamId, uid, {email, name}, [], {deleted: true});
        } catch (e) {
          logger.warn("deleteMember: boardAuthors freeze failed",
              {teamId, uid, err: String(e)});
        }
      }

      // ── 2. Per-record collections. Every record carries a `uid` field, so
      // query on it rather than matching the {uid}_… doc-id prefix. ──
      if (teamId) {
        done.records = 0;
        for (const coll of ["trainingAvail", "matchAvail", "rpe"]) {
          const snap = await db.collection("teams").doc(teamId)
              .collection(coll).where("uid", "==", uid).get();
          let batch = db.batch();
          let ops = 0;
          for (const d of snap.docs) {
            batch.delete(d.ref);
            if (++ops >= 450) {
              await batch.commit();
              batch = db.batch();
              ops = 0;
            }
          }
          if (ops > 0) await batch.commit();
          done.records += snap.size;
        }
      }

      // ── 3. Shared blobs ── */
      if (teamId) {
        const dataRef = db.collection("teams").doc(teamId).collection("data");
        // Read the whole sharded collection ONCE, then scrub every shard of
        // each key. A member can appear in any category's shard — the one
        // they play in, plus __none for anything logged before they were
        // assigned — so scrubbing only their current category would leave
        // the person half-erased.
        const shards = await readDataShards(teamId);

        // Roster list.
        await scrubShards(shards, "fa_users", (arr) =>
          Array.isArray(arr) ? arr.filter((u) => String(u.id) !== uid) : null);

        // Injuries — as the subject, and as the staff member who logged one.
        await scrubShards(shards, "fa_injuries", (arr) => {
          if (!Array.isArray(arr)) return null;
          return arr.filter((i) => String(i.playerId) !== uid)
              .map((i) => (String(i.createdBy) === uid ?
                Object.assign({}, i, {createdBy: ""}) : i));
        });

        // Notifications carry uid + playerName.
        await scrubShards(shards, "fa_staff_notifications", (arr) =>
          Array.isArray(arr) ?
            arr.filter((n) => String(n.uid || "") !== uid) : null);

        // Call-up lists: {matchId: {players:[uid], startingXI:[uid], …}}.
        await scrubShards(shards, "fa_convocatoria_sent", (obj) => {
          if (!obj || typeof obj !== "object") return null;
          Object.keys(obj).forEach((mid) => {
            const e = obj[mid] || {};
            if (Array.isArray(e.players)) {
              e.players = e.players.filter((p) => String(p) !== uid);
            }
            if (Array.isArray(e.startingXI)) {
              e.startingXI = e.startingXI.filter((p) => String(p) !== uid);
            }
          });
          return obj;
        });

        // Match events: keep the event AND the name, drop the uid. This is
        // what stops a 3-1 quietly becoming a 2-1.
        await scrubShards(shards, "fa_match_events", (obj) => {
          if (!obj || typeof obj !== "object") return null;
          const pairs = [
            ["playerId", "playerName"],
            ["assistPlayerId", "assistPlayerName"],
            ["playerOutId", "playerOutName"],
            ["playerInId", "playerInName"],
          ];
          Object.keys(obj).forEach((mid) => {
            (obj[mid] || []).forEach((ev) => {
              pairs.forEach(([idField, nameField]) => {
                if (String(ev[idField] || "") !== uid) return;
                if (name && !ev[nameField]) ev[nameField] = name;
                ev[idField] = "";
              });
            });
          });
          return obj;
        });

        // Legacy goals blob, same treatment.
        await scrubShards(shards, "fa_match_goals", (obj) => {
          if (!obj || typeof obj !== "object") return null;
          Object.keys(obj).forEach((mid) => {
            (obj[mid] || []).forEach((g) => {
              if (String(g.playerId || "") !== uid) return;
              if (name && !g.playerName) g.playerName = name;
              g.playerId = "";
            });
          });
          return obj;
        });

        // Flat {uid: …} maps.
        for (const key of ["fa_injury_notes", "fa_injury_zone",
          "fa_injury_dismissed"]) {
          await scrubShards(shards, key, (fields) => {
            if (fields && typeof fields.v === "string") return null;
            return Object.keys(fields || {}).filter((f) => f === uid);
          });
        }

        // Keys of the form {uid}_{date}. `category` is a field on the shard
        // document, not an entry, and matches neither filter below.
        await scrubShards(shards, "fa_training_staff_override", (fields) =>
          Object.keys(fields || {})
              .filter((f) => f === uid || f.indexOf(uid + "_") === 0));

        // The frozen legacy availability/RPE docs are NOT sharded — Phase 3b
        // stopped writing them and the record collections took over, but
        // they still hold this person's answers until
        // migrate-player-data --delete-legacy runs, so an erase must still
        // reach them.
        for (const key of ["fa_training_availability", "fa_match_availability",
          "fa_player_rpe"]) {
          await scrubDataDoc(dataRef.doc(key), (fields) =>
            Object.keys(fields || {})
                .filter((f) => f === uid || f.indexOf(uid + "_") === 0));
        }
      }

      // ── 4. FCM tokens (subcollection — not removed by deleting the parent) ──
      const tokenSnap = await userRef.collection("tokens").get();
      if (!tokenSnap.empty) {
        const batch = db.batch();
        tokenSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      done.tokens = tokenSnap.size;

      // ── 5. Profile picture. The extension is whatever they uploaded, so
      // list the prefix rather than guessing. A base64 fallback lives inside
      // the user doc and goes with it. ──
      try {
        // Name the bucket explicitly: initializeApp() has no config here, so
        // the default resolves to the legacy <project>.appspot.com, which is
        // not this project's bucket (see js/firebase-config.js).
        const [files] = await admin.storage().bucket("esquerrapp.firebasestorage.app")
            .getFiles({prefix: "profilePics/" + uid + "."});
        await Promise.all(files.map((f) => f.delete()));
        done.storageFiles = files.length;
      } catch (e) {
        logger.warn("deleteMember: storage cleanup failed", {uid, err: e.message});
        done.storageFiles = -1;
      }

      // ── 6. The person. joinAttempts is keyed by uid and unreachable from
      // any client, so it would orphan otherwise. ──
      await db.collection("joinAttempts").doc(uid).delete();
      await userRef.delete();
      try {
        await admin.auth().deleteUser(uid);
        done.authDeleted = true;
      } catch (e) {
        // Already gone, or never existed — not a failure worth aborting on.
        logger.warn("deleteMember: auth delete", {uid, err: e.message});
        done.authDeleted = false;
      }

      logger.info("deleteMember", done);
      return {ok: true, ...done};
    });

// ── 7f. deleteTeam — erase one {category}-{letter} and its data ──
//
// The destructive half of the team quota: "to add a team, remove one".
// Everything belonging to the team goes EXCEPT the Firebase Auth accounts —
// its players are DETACHED (profile kept, category/team cleared) so they
// appear as unassigned and can be put on another team.
//
// Three ordering constraints, each of which causes a different SILENT
// failure if broken. They are called out at their step below:
//   A. capture the match ids BEFORE filtering fa_matches
//   B. delete the roster document LAST
//   C. refresh claims EARLY
//
// Shards are per CATEGORY, never per letter, so when the category has
// another team this filters rows inside documents that team co-owns. Whole
// documents are only ever deleted when the category itself is going.

/** Chunk a list for Firestore's `in` queries, which cap at 10 values. */
function chunk10(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i += 10) out.push(arr.slice(i, i + 10));
  return out;
}

/** Delete every doc a query matches, paged so collection size cannot time us out. */
async function deleteByQuery(query) {
  let removed = 0;
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) return removed;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 400) return removed;
  }
}

exports.deleteTeam = onCall({region: "us-central1", timeoutSeconds: 540},
    async (request) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Cal iniciar sessió.");
      }
      const caller = request.auth;
      const isSuper = caller.token.email === SUPERUSER_EMAIL;
      const clubId = (isSuper && request.data && request.data.clubId) ?
        String(request.data.clubId) : caller.token.teamId;
      const category = String((request.data || {}).category || "");
      const letter = String((request.data || {}).letter || "");
      if (!clubId) throw new HttpsError("failed-precondition", "Cap club.");
      if (!isSuper && caller.token.role !== "lead") {
        throw new HttpsError("permission-denied",
            "Només el responsable del club pot eliminar un equip.");
      }
      if (!CATEGORY_ORDER.includes(category) || !/^[A-Z]$/.test(letter)) {
        throw new HttpsError("invalid-argument", "Equip no vàlid.");
      }
      const teamKey = category + "-" + letter;

      const clubRef = db.collection("clubs").doc(clubId);
      const clubSnap = await clubRef.get();
      if (!clubSnap.exists) throw new HttpsError("not-found", "Club no trobat.");
      const club = clubSnap.data() || {};
      const liveKeys = rosterKeysOf(club.categories);

      // TOLERANT validation. A letter already missing from the config means a
      // previous run got past the club-doc write and stopped — resume rather
      // than refuse, or a partial failure bricks the team permanently.
      const resuming = !liveKeys.includes(teamKey);
      if (!resuming && liveKeys.length <= 1) {
        throw new HttpsError("failed-precondition",
            "Un club ha de tenir com a mínim un equip.");
      }

      const markerRef = clubRef.collection("teamDeletions").doc(teamKey);
      await markerRef.set({
        status: "running", by: caller.uid, resuming,
        startedAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      // ── Phase 1: capture (reads only) ────────────────────────
      const rosters = await loadRosters(clubId);
      const mine = rosters.find((r) => r.key === teamKey);
      const otherPlayers = new Set();
      rosters.forEach((r) => {
        if (r.key === teamKey) return;
        r.players.forEach((e) => otherPlayers.add(e));
      });

      const members = await db.collection("users")
          .where("teamId", "==", clubId).get();
      const teamUids = [];
      members.forEach((doc) => {
        const u = doc.data() || {};
        const email = String(u.email || "").toLowerCase();
        // On this team's list, or assigned to it directly from the roster
        // screen without ever being listed. Anyone ALSO on another team's
        // list is left alone — a duplicated address must not cost somebody
        // all of their data.
        const listed = !!mine && mine.players.includes(email) && !otherPlayers.has(email);
        const assigned = (u.category || "") === category && (u.team || "") === letter;
        if (listed || assigned) teamUids.push(doc.id);
      });

      const shards = await readDataShards(clubId);
      const catShard = (key) => (shards.get(key) || []).find((s) => s.cat === category);

      // CONSTRAINT A: the five match-joined keys resolve only through the
      // match id. Filter fa_matches first and the join is destroyed, leaving
      // their events and call-ups orphaned in the shard forever.
      const matchesShard = catShard("fa_matches");
      const deletedMatchIds = [];
      if (matchesShard) {
        const rows = parseDataDoc(matchesShard.snap, []);
        (Array.isArray(rows) ? rows : []).forEach((m) => {
          // Only rows explicitly stamped with this letter. A match with no
          // team cannot be attributed here, and deleting it would destroy
          // the surviving team's history.
          if (String(m.team || "") === letter) deletedMatchIds.push(String(m.id));
        });
      }
      const killMatch = new Set(deletedMatchIds);
      const killUid = new Set(teamUids);
      const remaining = (club.categories && club.categories[category] &&
        Array.isArray(club.categories[category].letters)) ?
        club.categories[category].letters.filter((l) => l !== letter) : [];
      const catGone = remaining.length === 0;

      // ── Phase 2: the club document ───────────────────────────
      const clubPatch = {};
      if (!resuming) {
        clubPatch["categories." + category + ".letters"] =
          catGone ? ["A"] : remaining;
        // Leaving letters: [] would be read back as ['A'] by rosterKeys and
        // getTeamLetters, silently resurrecting a team on re-enable.
        if (catGone) clubPatch["categories." + category + ".enabled"] = false;
      }
      // Dotted paths, not set(merge): merge preserves nested map keys, which
      // is exactly why the old team's config would otherwise survive.
      clubPatch["fcfLinks." + teamKey] = FieldValue.delete();
      clubPatch["schedules." + teamKey] = FieldValue.delete();
      await clubRef.update(clubPatch);

      // ── Phase 3: claims (CONSTRAINT C — early, not at the end) ──
      // When the category is going, this strips it from every open client's
      // token immediately, so a stale client can no longer write back the
      // rows we are about to delete.
      let refreshed = 0;
      if (catGone) {
        const after = (await clubRef.get()).data() || {};
        const leadEmail = String(club.leadEmail || "").toLowerCase();
        for (const doc of members.docs) {
          const u = doc.data() || {};
          const email = String(u.email || "").toLowerCase();
          const isLead = email === leadEmail || u.isTeamLead === true;
          const m = membershipFrom(rosters, email);
          const next = claimsFor(after, isLead, m);
          try {
            await admin.auth().setCustomUserClaims(doc.id,
                {teamId: clubId, role: next.role, cats: next.cats});
            await doc.ref.set({
              staffCategories: next.cats,
              staffRole: m.staffRole,
              claimsUpdatedAt: FieldValue.serverTimestamp(),
            }, {merge: true});
            refreshed++;
          } catch (e) { /* no Auth account — nothing to claim */ }
        }
      }

      /* ── Phase 4: the data ──────────────────────────────────
         Wrapped so it can be RUN TWICE. Every client holds the whole blob in
         localStorage and writes it back wholesale, so a coach saving during
         the delete re-adds the rows just removed. Nothing short of locking
         every data/ write can prevent that — and that would cost a document
         read on every staff notification, forever, to guard an operation
         that runs about once a year. Instead: do the work, look again, and
         do it once more if anything came back. That shrinks the window from
         the length of the delete to the length of one re-read.

         Re-reads the shards on each pass; the captured id and uid sets stay
         valid because they describe the team, not the documents. */
      let records = 0;
      async function runDataPhase(shards) {
      const catShard = (key) => (shards.get(key) || []).find((s) => s.cat === category);
      const matchesShard = catShard("fa_matches");
      const dropRows = (pred) => (arr) =>
        (Array.isArray(arr) ? arr.filter((r) => !pred(r)) : null);

      /* Remove map entries by key, in EITHER storage format.
         scrubDataDoc has a dual contract that is easy to get subtly wrong: a
         blob doc gets the PARSED value and wants the new value back, while a
         per-field doc gets the RAW document and wants an ARRAY of field names
         to delete. Both arrive as plain objects, so the mutate cannot tell
         them apart — decide from the snapshot instead, which can. */
      const INTERNAL = new Set(["v", "category", "_migrated"]);
      async function dropEntriesByKey(key, pred) {
        for (const s of shards.get(key) || []) {
          const isBlob = typeof (s.snap.data() || {}).v === "string";
          await scrubDataDoc(s.ref, isBlob ?
            (parsed) => {
              if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
              const out = {};
              Object.keys(parsed).forEach((k) => {
                if (!pred(k)) out[k] = parsed[k];
              });
              return out;
            } :
            (raw) => Object.keys(raw).filter((k) => !INTERNAL.has(k) && pred(k)));
        }
      }

      // Matches first (safe now that the ids are captured). This write fires
      // updateTeamDates, which re-derives teams/{id}.matchDates from every
      // shard — so the reminder schedulers stop firing for dead fixtures.
      if (matchesShard) {
        await scrubDataDoc(matchesShard.ref,
            dropRows((m) => String(m.team || "") === letter));
      }
      await scrubShards(shards, "fa_matchday",
          dropRows((g) => String(g.team || "") === letter));

      // Match-joined maps, across ALL shards: a row can sit anywhere.
      for (const key of ["fa_match_events", "fa_match_goals",
        "fa_convocatoria_sent", "fa_convocatoria_callup",
        "fa_tactic_match_boards"]) {
        await dropEntriesByKey(key, (k) => killMatch.has(String(k)));
      }

      // Roster-joined keys by uid — the medical and availability history.
      if (teamUids.length) {
        await scrubShards(shards, "fa_injuries",
            dropRows((i) => killUid.has(String(i.playerId))));
        for (const key of ["fa_injury_notes", "fa_injury_zone", "fa_injury_dismissed"]) {
          await dropEntriesByKey(key, (k) => killUid.has(k));
        }
        await dropEntriesByKey("fa_training_staff_override",
            (k) => teamUids.some((u) => ownsEntryKey("uidPrefix", k, u)));
        await scrubShards(shards, "fa_staff_notifications",
            dropRows((n) => killUid.has(String(n.uid))));
      }

      // Record collections. Every record carries `uid`, so query on it
      // rather than matching the {uid}_… doc-id prefix.
      const teamRef = db.collection("teams").doc(clubId);
      for (const c of chunk10(teamUids)) {
        for (const coll of ["trainingAvail", "matchAvail", "rpe"]) {
          records += await deleteByQuery(
              teamRef.collection(coll).where("uid", "in", c));
        }
      }
      // A player from ANOTHER team who answered availability for one of this
      // team's matches: the record belongs to a fixture that no longer exists.
      for (const c of chunk10(deletedMatchIds)) {
        records += await deleteByQuery(
            teamRef.collection("matchAvail").where("matchId", "in", c));
      }

      /* The staff's notes for those fixtures. The doc id IS the match id, so
         this deletes by reference rather than by query — and a delete of a
         document that never existed is a no-op in the Admin SDK, so there is
         nothing to check first. Left behind they would be unreachable but
         not gone: notes on a squad the club has disbanded. */
      if (deletedMatchIds.length) {
        let nbatch = db.batch();
        let nops = 0;
        for (const mid of deletedMatchIds) {
          nbatch.delete(teamRef.collection("matchNotes").doc(String(mid)));
          if (++nops >= 450) {
            await nbatch.commit();
            nbatch = db.batch();
            nops = 0;
          }
        }
        if (nops > 0) await nbatch.commit();
      }

      // fa_users is a MOVE, not an edit. Clearing the fields in place would
      // leave the shard document's `category` disagreeing with the row, and
      // the client's next whole-blob write would re-route and duplicate the
      // person; removing the row outright means db.js's users→fa_users
      // reconcile re-adds them with stale fields on the next login.
      let moved = [];
      if (teamUids.length) {
        for (const s of shards.get("fa_users") || []) {
          const rows = parseDataDoc(s.snap, []);
          if (!Array.isArray(rows)) continue;
          const taken = rows.filter((u) => killUid.has(String(u.id)));
          if (!taken.length) continue;
          moved = moved.concat(taken.map((u) =>
            Object.assign({}, u, {category: "", team: ""})));
          await scrubDataDoc(s.ref, dropRows((u) => killUid.has(String(u.id))));
        }
      }
      if (moved.length) {
        const noneRef = teamRef.collection("data").doc("fa_users__none");
        const noneSnap = await noneRef.get();
        const existing = noneSnap.exists ? parseDataDoc(noneSnap, []) : [];
        const list = Array.isArray(existing) ? existing.slice() : [];
        const seen = new Set(list.map((u) => String(u.id)));
        moved.forEach((u) => {
          if (seen.has(String(u.id))) return;
          seen.add(String(u.id));
          list.push(u);
        });
        // `category` is not decoration: a shard without it is invisible to
        // the client's where('category','in',…) query — dark, not misfiled.
        await noneRef.set({v: JSON.stringify(list), category: "none"}, {merge: true});
      }

      // The category itself is going, so its sessions belong to nobody and
      // would otherwise sit unreadable forever — no one's claims include the
      // category any more. Only on catGone: while another team survives, the
      // sessions are still theirs.
      if (catGone) {
        const trShard = catShard("fa_training");
        if (trShard) await trShard.ref.delete();
      }
      } // end runDataPhase

      await runDataPhase(shards);

      /* Did anything come back? Re-read and look for the team's rows again.
         A client that saved mid-delete republishes the whole blob, so a
         single surviving match or uid means the pass raced a write. */
      async function survivors() {
        const fresh = await readDataShards(clubId);
        const found = [];
        // parseDataDoc dereferences snap.exists, so never hand it a null.
        const ms = (fresh.get("fa_matches") || []).find((x) => x.cat === category);
        const mrows = ms ? parseDataDoc(ms.snap, []) : [];
        if (Array.isArray(mrows) &&
            mrows.some((m) => String(m.team || "") === letter)) found.push("fa_matches");
        for (const s of fresh.get("fa_users") || []) {
          if (s.cat === "none") continue;
          const rows = parseDataDoc(s.snap, []);
          if (Array.isArray(rows) && rows.some((u) => killUid.has(String(u.id)))) {
            found.push("fa_users__" + s.cat);
          }
        }
        for (const s of fresh.get("fa_injuries") || []) {
          const rows = parseDataDoc(s.snap, []);
          if (Array.isArray(rows) && rows.some((i) => killUid.has(String(i.playerId)))) {
            found.push("fa_injuries__" + s.cat);
          }
        }
        return {fresh, found};
      }

      let resurrected = [];
      {
        const first = await survivors();
        if (first.found.length) {
          // One retry, not a loop: a client that keeps saving would spin this
          // forever, and the marker doc records what happened either way.
          resurrected = first.found;
          await runDataPhase(first.fresh);
          const second = await survivors();
          resurrected = second.found.length ? second.found : [];
          if (second.found.length) {
            logger.warn("deleteTeam: rows survived a retry — a client is " +
              "writing during the delete; re-run when the club is idle",
            {clubId, teamKey, shards: second.found});
          }
        }
      }

      // ── Phase 5: the roster doc (CONSTRAINT B — LAST) ────────
      // Deleting it fires onRosterWritten, which detaches every listed member
      // (roles/category/team cleared, prevCategory/prevTeam stamped, claims
      // re-set, Auth untouched). That in turn fires reshardMember, which
      // MOVES roster-joined rows into __none — so doing this first would let
      // the medical data escape to a shard already processed and survive.
      await clubRef.collection("rosters").doc(teamKey).delete();

      await markerRef.set({
        status: resurrected.length ? "done-with-conflict" : "done",
        finishedAt: FieldValue.serverTimestamp(),
        uids: teamUids.length, matches: deletedMatchIds.length,
        records, catGone, refreshed,
        resurrected: resurrected,
      }, {merge: true});

      logger.info("deleteTeam", {
        clubId, teamKey, by: caller.uid, uids: teamUids.length,
        matches: deletedMatchIds.length, records, catGone, resuming,
      });
      return {
        ok: true, teamKey, uids: teamUids.length,
        matches: deletedMatchIds.length, records, catGone,
        // Non-empty means a client wrote during the delete and won the race
        // even after a retry. Re-running is safe and cheap.
        resurrected,
      };
    });

// ── 8. (removed in Phase 3b) bridgeLegacyPlayerData ──
// The Phase-2 trigger that mirrored old clients' legacy blob writes into
// the record collections is gone: old APKs are extinct and the record
// collections are the only write path. The frozen legacy data/ docs stay
// in place until `migrate-player-data.js --delete-legacy` removes them.

// ── 8c. Tactical board templates — the platform's starter library ──
//
// Both callables are superuser-only AND must run on the Admin SDK, because
// both write documents the caller does not own: the superuser is not a member
// of the club being read from or seeded into, so firestore.rules would refuse
// them. That is the reason these are callables at all — creating an ordinary
// board is a direct client write, since its rule is fully self-enforcing.
//
// Promotion takes an independent COPY with the author and origin club
// stripped. Three properties follow from copying rather than from any rule:
// the origin club keeps full control of its own board, deleting that board
// does not break the template, and editing it does not silently mutate every
// club that was seeded from it.

/** Reject anyone who is not the superuser. */
function assertSuperUser(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cal iniciar sessió.");
  }
  const email = (request.auth.token.email || "").toLowerCase();
  if (email !== SUPERUSER_EMAIL) {
    throw new HttpsError("permission-denied",
        "Només l'administrador de la plataforma pot fer això.");
  }
}

/** The board fields a template carries. Author and club are NOT among them. */
function templateMetaFrom(board) {
  return {
    name: String(board.name || "").slice(0, 120),
    tag: String(board.tag || ""),
    category: String(board.category || ""),
    formation: String(board.formation || ""),
    boardType: String(board.boardType || "full"),
    hasFrames: !!board.hasFrames,
    frameCount: Number(board.frameCount || 0),
  };
}

/**
 * Strip anything personal from a board payload before it leaves its club.
 *
 * `linkedTeams` embeds player ids and names. It has no business in a payload
 * at all (it is per-session data) and absolutely none in a library shown to
 * other clubs — so the strip is done on the PARSED object and re-stringified,
 * not by a regex over the JSON, which would be cosmetic.
 */
function anonymiseBoardPayload(v) {
  let parsed;
  try {
    parsed = JSON.parse(v || "{}");
  } catch (e) {
    throw new HttpsError("failed-precondition",
        "El contingut de la pissarra no es pot llegir.");
  }
  if (parsed && typeof parsed === "object") {
    delete parsed.linkedTeams;
    delete parsed.ownerUid;
    delete parsed.ownerName;
    delete parsed.clubId;
  }
  return JSON.stringify(parsed);
}

/* ⚠ A callable needs `allUsers` to hold roles/run.invoker on its Cloud Run
   service, and firebase-tools grants that ONLY on the create path.

   It is not a security decision: a callable authenticates inside the
   function against the Firebase ID token, and assertSuperUser() below is
   the real gate. Without the binding, Google's front end answers 403 before
   the container runs, so the client sees a bare "internal", the function log
   is EMPTY, and the deploy reports success.

   Both of these functions shipped that way. Their create on 2026-08-08 died
   at the container healthcheck (the stale package-lock) and the retry went
   through UpdateFunction, which does not touch IAM. Five days of clean
   deploys later, neither had ever been callable.

   `invoker: "public"` in these options does NOT fix it — the type checks,
   because CallableOptions extends HttpsOptions, but onCall builds
   `callableTrigger: {}` and never copies the field. Only onRequest does.
   The repair is to DELETE the function and let a deploy create it again.

   To check, with no credentials and no side effects — an unauthenticated
   POST must reach the function, not the front end:

     curl -s -o - -w '\nHTTP=%{http_code}' -X POST \
       https://us-central1-esquerrapp.cloudfunctions.net/promoteBoardTemplate \
       -H 'Content-Type: application/json' -d '{"data":{}}'

   401 + {"error":{"status":"UNAUTHENTICATED"}} is healthy — that is this
   file talking. A 403 HTML page is the broken state. */
exports.promoteBoardTemplate = onCall({region: "us-central1"},
    async (request) => {
      assertSuperUser(request);
      const boardId = request.data && request.data.boardId;
      if (!boardId || typeof boardId !== "string") {
        throw new HttpsError("invalid-argument", "Falta l'identificador.");
      }
      const packs = Array.isArray(request.data.packs) ?
        request.data.packs.map(String).filter(Boolean) : [];

      const [metaSnap, dataSnap] = await Promise.all([
        db.collection("tacticBoards").doc(boardId).get(),
        db.collection("tacticBoardData").doc(boardId).get(),
      ]);
      if (!metaSnap.exists || !dataSnap.exists) {
        throw new HttpsError("not-found", "Pissarra no trobada.");
      }

      const board = metaSnap.data() || {};
      const v = anonymiseBoardPayload((dataSnap.data() || {}).v);
      const templateId = "tt_" + Date.now() + "_" +
        Math.random().toString(36).slice(2, 8);

      /* The template's category defaults to THE AUTHOR'S — the highest
         category they coach — not to the board's own stamp.

         A board is stamped with `getCurrentCategory()`, whichever squad the
         coach happened to be looking at when they saved. The author label in
         clubs/{clubId}/boardAuthors already holds something better: their
         highest category, picked by authorLabelFrom as the LOWEST index in
         CATEGORY_ORDER, and frozen if they leave. For a library sold by
         level, "what a cadet coach drew" is the useful default; "which tab
         was open" is not.

         Falls back to the board's stamp when there is no author to ask —
         ownerUid is '' for everything the migration produced and for seeded
         boards — and the superadmin can override it in the Biblioteca table
         either way. This is a DEFAULT, not a constraint. */
      let category = String(board.category || "");
      if (board.ownerUid && board.clubId) {
        try {
          const authorSnap = await db.collection("clubs").doc(String(board.clubId))
              .collection("boardAuthors").doc(String(board.ownerUid)).get();
          const authorCat = authorSnap.exists ?
            String((authorSnap.data() || {}).category || "") : "";
          if (authorCat) category = authorCat;
        } catch (e) {
          // A label is cosmetic. Never fail a promotion over one.
          logger.warn("boardAuthors lookup failed", {boardId, error: e.message});
        }
      }

      // One batch: a template whose payload is missing is a row in the
      // superadmin library that cannot be seeded, and nothing would say why.
      //
      // `published: false` is the draft stage. A promoted board is a COPY to
      // work on, not a product — it is edited in the platform library and
      // only then published, and seedClubFromTemplates refuses anything that
      // has not been.
      const batch = db.batch();
      batch.set(db.collection("tacticTemplates").doc(templateId),
          Object.assign(templateMetaFrom(board), {
            category,
            packs,
            published: false,
            bytes: Buffer.byteLength(v, "utf8"),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            schema: 1,
          }));
      batch.set(db.collection("tacticTemplateData").doc(templateId),
          {v, schema: 1});
      // Provenance, in its OWN superadmin-only collection rather than as a
      // field on the template: tacticTemplates is world-readable to signed-in
      // users and stays anonymous by construction. Keyed by boardId so
      // re-promoting the same board overwrites rather than accumulating.
      batch.set(db.collection("tacticTemplateSources").doc(boardId), {
        templateId,
        clubId: String(board.clubId || ""),
        promotedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();

      logger.info("promoteBoardTemplate", {boardId, templateId, packs});
      return {ok: true, templateId};
    });

/**
 * Seed a club with copies of chosen templates.
 *
 * COPIES, deliberately, rather than granting the club read access to the
 * platform library: a seeded board has to be editable and deletable by the
 * club that got it, and neither can be true of a document 200 other clubs
 * share. The cost is nothing — a few KB per board, once.
 *
 * ownerUid is '' — the same "unowned" value the migration uses. Whichever
 * coach starts working on one adopts it through the rules. Attributing them
 * to the club lead would be a lie, and worse, would follow that lead to their
 * next club through the owner read arm.
 */
// Invoker binding: see the warning on promoteBoardTemplate above.
exports.seedClubFromTemplates = onCall(
    {region: "us-central1", timeoutSeconds: 120},
    async (request) => {
      assertSuperUser(request);
      const clubId = request.data && request.data.clubId;
      if (!clubId || typeof clubId !== "string") {
        throw new HttpsError("invalid-argument", "Falta el club.");
      }
      const clubSnap = await db.collection("clubs").doc(clubId).get();
      if (!clubSnap.exists) {
        throw new HttpsError("not-found", "Club no trobat.");
      }

      let ids = Array.isArray(request.data.templateIds) ?
        request.data.templateIds.map(String).filter(Boolean) : [];
      const pack = request.data.pack ? String(request.data.pack) : "";
      if (!ids.length && pack) {
        const packSnap = await db.collection("tacticTemplates")
            .where("packs", "array-contains", pack).get();
        ids = packSnap.docs.map((d) => d.id);
      }
      if (!ids.length) {
        throw new HttpsError("invalid-argument", "Cap plantilla seleccionada.");
      }

      // Idempotent: re-seeding must not double the club's starter set, and a
      // partial failure has to be safe to retry.
      const already = new Set();
      const seededSnap = await db.collection("tacticBoards")
          .where("clubId", "==", clubId).get();
      seededSnap.forEach((d) => {
        const t = (d.data() || {}).sourceTemplateId;
        if (t) already.add(t);
      });

      let created = 0;
      let skipped = 0;
      for (const templateId of ids) {
        if (already.has(templateId)) {
          skipped++;
          continue;
        }
        const [tMeta, tData] = await Promise.all([
          db.collection("tacticTemplates").doc(templateId).get(),
          db.collection("tacticTemplateData").doc(templateId).get(),
        ]);
        if (!tMeta.exists || !tData.exists) {
          skipped++;
          continue;
        }
        // Drafts are not products. Checked here rather than in the pack
        // query so the explicit-ids path is gated too — and so it needs no
        // composite index.
        if ((tMeta.data() || {}).published !== true) {
          skipped++;
          continue;
        }
        const boardId = "tb_" + Date.now() + "_" +
          Math.random().toString(36).slice(2, 8);
        const v = (tData.data() || {}).v || "{}";
        const batch = db.batch();
        batch.set(db.collection("tacticBoards").doc(boardId),
            Object.assign(templateMetaFrom(tMeta.data() || {}), {
              ownerUid: "",
              clubId,
              ownerName: "",
              sourceTemplateId: templateId,
              bytes: Buffer.byteLength(v, "utf8"),
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              schema: 1,
            }));
        batch.set(db.collection("tacticBoardData").doc(boardId),
            {ownerUid: "", clubId, v, schema: 1});
        await batch.commit();
        created++;
      }

      logger.info("seedClubFromTemplates", {clubId, created, skipped});
      return {ok: true, created, skipped};
    });

// ── 8b. onMemberCategoryChanged — move joined rows between shards ──
// Injuries and injury notes are sharded by the player's CURRENT category,
// resolved through a live join rather than a stamp, because medical history
// has to follow the player. The cost is that a category change has to move
// the documents, and only the server can: the old coach can no longer
// resolve the uid so his client pins the rows where they are, and the new
// coach never downloads the old shard. Without this the history goes dark
// for everyone.
//
// Watches the user doc rather than hooking each writer — onRosterWritten,
// setRole and the client's "re-assign to a squad" flow all end up here, and
// so will anything added later.
exports.onMemberCategoryChanged = onDocumentWritten({
  document: "users/{uid}",
  region: "us-central1",
}, async (event) => {
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;             // deletion — deleteMember does the scrub
  const before = event.data.before.exists ? event.data.before.data() : null;
  const prev = before ? (before.category || "") : "";
  const next = after.category || "";
  if (prev === next) return;
  const teamId = after.teamId;
  if (!teamId || teamId === "none" || teamId === "default") return;
  // Idempotent: it scans every shard and lands the rows in one, so a repeat
  // delivery (or a double write) is a no-op rather than a duplication.
  await reshardMember(teamId, event.params.uid, next);
});

// ── 9. updateTeamDates — denormalize schedule dates onto the team doc ──
// Keeps teams/{id}.trainingDates / .matchDates arrays in sync with the
// fa_training / fa_matches blobs (staff-only writers). The schedulers
// query `array-contains` on these instead of scanning every team.
exports.updateTeamDates = onDocumentWritten({
  document: "teams/{teamId}/data/{key}",
  region: "us-central1",
}, async (event) => {
  // Phase 5: the trigger fires per SHARD, but the field it maintains is
  // per TEAM. Deriving the dates from the shard that just changed would
  // replace the whole array with one category's dates — and since the
  // schedulers query `array-contains` on it, every other category's
  // reminders would stop, silently, with nothing in the logs. So re-read
  // every shard of the key and UNION.
  const parts = splitShardId(event.params.key);
  if (!parts) return;                 // pre-Phase-5 doc; nothing writes those
  if (parts.key !== "fa_training" && parts.key !== "fa_matches") return;
  const teamId = event.params.teamId;
  const shards = await readDataShards(teamId, [parts.key]);
  const list = mergeArrayShards(shards.get(parts.key));
  const dates = [...new Set(list.map((x) => String(x.date || "")).filter(Boolean))];
  const field = parts.key === "fa_training" ? "trainingDates" : "matchDates";
  await db.collection("teams").doc(teamId).set({[field]: dates}, {merge: true});
});

// ── 10. archiveSeason — archive & reset season data (admin only) ──
// The only copy. js/app.js used to hold a duplicate that nothing read and
// that had drifted from this one; it is gone.
// fa_standings / fa_news / fa_player_stats dropped: no writer exists for any
// of them, so this was archiving and resetting documents that never existed.
// fa_training_availability / fa_match_availability / fa_player_rpe dropped
// too: those data/ docs were frozen in Phase 3b and are not sharded, so
// they hold nothing a season needs archiving. The canonical records are
// archived from their own collections further down.
const SEASON_KEYS = [
  "fa_matches", "fa_match_events", "fa_match_goals",
  "fa_training",
  "fa_training_staff_override",
  "fa_injuries", "fa_injury_notes", "fa_injury_zone",
  "fa_convocatoria_sent", "fa_convocatoria_callup",
  "fa_matchday",
  /* Board LINKS, keyed by matchId — not the boards themselves, which live in
     tacticBoards/ and outlive any season. This was missing: fa_matches was
     emptied and this map was not, so every rollover left a season's worth of
     links pointing at fixtures that no longer existed, and nothing ever
     cleaned them up. (There is a one-off client-side sweep for orphans by
     NAME, `fa_cleanup_orphan_match_boards` in js/app.js, which never ran
     again after its first pass.) */
  "fa_tactic_match_boards",
];

// Keys stored as per-field merge (not blob {v: "..."}). Describes the
// FORMAT of existing data/ docs so archiveSeason resets them correctly —
// includes the frozen legacy availability/RPE docs, which is a superset
// of the still-synced MERGE_KEYS in js/db.js.
const MERGE_KEYS = new Set([
  "fa_training_availability",
  "fa_match_availability",
  "fa_training_staff_override",
  "fa_player_rpe",
  "fa_injury_notes",
  "fa_injury_zone",
]);

// Keys whose value is an object (not array)
const OBJECT_KEYS = new Set([
  "fa_match_events", "fa_match_goals",
  "fa_training_availability", "fa_match_availability",
  "fa_training_staff_override",
  "fa_player_rpe",
  "fa_convocatoria_sent", "fa_convocatoria_callup",
  "fa_injury_notes", "fa_injury_zone",
  // Keyed by matchId — an object, so the reset must write {} and not [].
  "fa_tactic_match_boards",
]);

exports.archiveSeason = onRequest(
    {cors: true, region: "us-central1", memory: "512MiB", timeoutSeconds: 120},
    async (req, res) => {
      // Only POST allowed
      if (req.method !== "POST") {
        res.status(405).json({error: "Method not allowed"});
        return;
      }

      // ── Auth: verify Firebase ID token ──
      const authHeader = req.headers.authorization || "";
      if (!authHeader.startsWith("Bearer ")) {
        res.status(401).json({error: "Missing auth token"});
        return;
      }
      let decoded;
      try {
        decoded = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
      } catch (e) {
        logger.error("archiveSeason: invalid token", e);
        res.status(401).json({error: "Invalid auth token"});
        return;
      }

      const {teamId, label} = req.body || {};
      if (!teamId || !label) {
        res.status(400).json({error: "teamId and label required"});
        return;
      }

      // ── Auth: superuser, or team lead of the requested team ──
      // Claims first (set by joinClub/setRole/backfill); users-doc
      // fallback for sessions whose token predates the claims backfill.
      const isSuper = decoded.email === "marna96@gmail.com";
      let isTeamLeadOfTeam =
          decoded.teamId === teamId && decoded.role === "lead";
      if (!isSuper && !isTeamLeadOfTeam) {
        const callerDoc = await db.collection("users").doc(decoded.uid).get();
        const callerData = callerDoc.exists ? callerDoc.data() : {};
        isTeamLeadOfTeam = callerData.isTeamLead === true &&
            callerData.teamId === teamId;
      }
      if (!isSuper && !isTeamLeadOfTeam) {
        res.status(403).json({error: "Admin or Team Lead access required"});
        return;
      }

      // Sanitize label (only allow alphanumeric, hyphens, underscores)
      const safeLabel = String(label).replace(/[^a-zA-Z0-9_-]/g, "");
      if (!safeLabel) {
        res.status(400).json({error: "Invalid label"});
        return;
      }

      /* Refuse a label that has already been archived.
         There was no check at all, and the second run is silently
         destructive: the first run empties the live shards, so the second
         reads nothing and batch.set()s that nothing OVER the archive — a
         full replace, no merge. The season was then gone from both the live
         data and its own archive, with a 200 and a success toast.
         Reachable in one click: the label is free text pre-filled from the
         date, so re-running a rollover lands on the same one. */
      const seasonRef = db.collection("teams").doc(teamId)
          .collection("seasons").doc(safeLabel);
      const overwrite = (req.query || {}).overwrite === "true";
      if (!overwrite) {
        const existing = await seasonRef.get();
        if (existing.exists) {
          const at = (existing.data() || {}).archivedAt;
          logger.warn("archiveSeason REFUSED — label exists",
              {teamId, label: safeLabel, uid: decoded.uid});
          res.status(409).json({
            error: `La temporada "${safeLabel}" ja està arxivada` +
              (at && at.toDate ? ` (${at.toDate().toISOString().slice(0, 10)})` : "") +
              ". Fes servir un nom diferent.",
            code: "season-exists",
            label: safeLabel,
          });
          return;
        }
      }

      logger.info("archiveSeason START", {teamId, label: safeLabel, uid: decoded.uid, overwrite});

      try {
        const archiveRef = db.collection("teams").doc(teamId)
            .collection("seasons").doc(safeLabel).collection("data");

        // ── Read every shard of every season key (ONE collection read) ──
        // Archived shards keep their {key}__{category} id, so a restored
        // season lands back in the right categories and an archive can be
        // read by the same scoped queries as live data.
        const allShards = await readDataShards(teamId);

        // ── Special injury handling: keep active/recovering, PER SHARD ──
        // Carrying an unresolved injury forward has to happen inside its own
        // category, or a player's open injury would surface in another
        // squad's medical page after the rollover.
        const keptInjuries = new Map();   // cat → still-open injuries
        const archivedInjuries = new Map(); // cat → resolved injuries
        for (const s of allShards.get("fa_injuries") || []) {
          const all = parseDataDoc(s.snap, []);
          if (!Array.isArray(all)) continue;
          keptInjuries.set(s.cat, all.filter((i) => i.status !== "resolved"));
          archivedInjuries.set(s.cat, all.filter((i) => i.status === "resolved"));
        }

        // ── Batch 1: Write archive docs ──
        let batch = db.batch();
        let opCount = 0;
        for (const key of SEASON_KEYS) {
          for (const s of allShards.get(key) || []) {
            const data = key === "fa_injuries" ?
              {v: JSON.stringify(archivedInjuries.get(s.cat) || []), category: s.cat} :
              s.snap.data();
            batch.set(archiveRef.doc(shardDocId(key, s.cat)), data);
            opCount++;
            // Firestore batch limit is 500 ops
            if (opCount >= 450) {
              await batch.commit();
              batch = db.batch();
              opCount = 0;
            }
          }
        }
        // Write archive metadata
        batch.set(
            db.collection("teams").doc(teamId)
                .collection("seasons").doc(safeLabel),
            {
              label: safeLabel,
              archivedAt: FieldValue.serverTimestamp(),
              archivedBy: decoded.uid,
            },
        );
        opCount++;
        if (opCount > 0) await batch.commit();

        // ── Archive + clear the per-record player-data collections ──
        // (Canonical data; the legacy availability/RPE blobs reset below
        // are frozen mirrors kept only until --delete-legacy runs.)
        /* matchNotes rides in this loop rather than in SEASON_KEYS because
           it is a per-record collection, not a data/ blob — one document per
           match, keyed by the match id. Archiving it matters more than it
           looks: fa_matches is emptied further down, so a note left behind
           would point at a fixture that no longer exists, for ever. */
        for (const coll of ["trainingAvail", "matchAvail", "rpe", "matchNotes"]) {
          const collSnap = await db.collection("teams").doc(teamId)
              .collection(coll).get();
          if (collSnap.empty) continue;
          const archColl = db.collection("teams").doc(teamId)
              .collection("seasons").doc(safeLabel).collection(coll);
          let rbatch = db.batch();
          let rops = 0;
          for (const d of collSnap.docs) {
            rbatch.set(archColl.doc(d.id), d.data());
            rbatch.delete(d.ref);
            rops += 2;
            if (rops >= 450) {
              await rbatch.commit();
              rbatch = db.batch();
              rops = 0;
            }
          }
          if (rops > 0) await rbatch.commit();
          logger.info("archiveSeason: archived records", {coll, count: collSnap.size});
        }

        // ── Batch 2: Reset source docs, shard by shard ──
        // Every write carries `category`. A reset shard that lost the field
        // would drop out of the client's where('category','in', …) query and
        // the new season would start invisible.
        batch = db.batch();
        opCount = 0;
        for (const key of SEASON_KEYS) {
          for (const s of allShards.get(key) || []) {
            if (key === "fa_injuries") {
              // Keep this category's active/recovering injuries
              batch.set(s.ref, {
                v: JSON.stringify(keptInjuries.get(s.cat) || []),
                category: s.cat,
              });
            } else if (MERGE_KEYS.has(key)) {
              // For merge keys: delete all fields, keep _migrated + category
              const fields = {};
              for (const f of Object.keys(s.snap.data() || {})) {
                if (f === "_migrated" || f === "category") continue;
                fields[f] = FieldValue.delete();
              }
              fields.category = s.cat;
              batch.update(s.ref, fields);
            } else if (OBJECT_KEYS.has(key)) {
              batch.set(s.ref, {v: "{}", category: s.cat});
            } else {
              batch.set(s.ref, {v: "[]", category: s.cat});
            }
            opCount++;
            if (opCount >= 450) {
              await batch.commit();
              batch = db.batch();
              opCount = 0;
            }
          }
        }

        // ── Zero player stats (matchesPlayed, minutesPlayed) ──
        for (const s of allShards.get("fa_users") || []) {
          try {
            const users = parseDataDoc(s.snap, null);
            if (!Array.isArray(users)) continue;
            for (const u of users) {
              u.matchesPlayed = 0;
              u.minutesPlayed = 0;
            }
            batch.set(s.ref, {v: JSON.stringify(users), category: s.cat});
            opCount++;
          } catch (e) {
            logger.warn("Failed to zero player stats", {cat: s.cat, e});
          }
        }

        if (opCount > 0) await batch.commit();

        // ── Send push notification to team ──
        try {
          const allUids = await getAllTeamMembers(teamId);
          const tokens = await getTokensForUsers(allUids);
          if (tokens.length > 0) {
            await sendToTokens(tokens, {
              title: "⚽ Nova temporada!",
              body: "S'ha arxivat la temporada " + safeLabel +
                " i s'ha iniciat una nova temporada.",
              type: "new_season",
              page: "player-home",
              tag: "new-season-" + safeLabel,
            });
          }
        } catch (e) {
          // Don't fail the whole operation if push fails
          logger.warn("Failed to send season push", e);
        }

        logger.info("archiveSeason SUCCESS", {teamId, label: safeLabel});
        res.json({success: true, archived: safeLabel});
      } catch (err) {
        logger.error("archiveSeason FAILED", err);
        res.status(500).json({error: "Archive failed: " + err.message});
      }
    },
);
