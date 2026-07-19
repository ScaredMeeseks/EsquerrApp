// ============================================================
// Cloud Functions v2 — EsquerrApp Push Notifications
// ============================================================
// Deploy via: firebase deploy --only functions --project esquerrapp
//
// Triggers:
// 1. onPushQueueCreate — sends FCM when a doc is added to pushQueue
// 2. scheduledTrainingReminder — runs every hour, sends reminders
//    4h before training to players who haven't answered availability
// 3. scheduledRpeReminder — runs at 23:00 daily, reminds players
//    who haven't submitted RPE for today's completed training/match
// ============================================================

const {onDocumentCreated, onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const admin = require("firebase-admin");
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

// ── Helper: get FCM tokens for users (parallel reads) ──
async function getTokensForUsers(userIds) {
  const snaps = await Promise.all(userIds.map((uid) =>
    db.collection("users").doc(uid).collection("tokens").get()));
  const entries = []; // {token, uid}
  snaps.forEach((snap, i) => {
    snap.forEach((doc) => {
      if (doc.data().token) entries.push({token: doc.data().token, uid: userIds[i]});
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

// ── Helper: get all team members ──
async function getAllTeamMembers(teamId) {
  const snap = await db.collection("users")
      .where("teamId", "==", teamId)
      .get();
  const uids = [];
  snap.forEach((doc) => uids.push(doc.id));
  return uids;
}

// ── Helper: send FCM to tokens, clean up stale ones ──
async function sendToTokens(tokenEntries, payload) {
  const tokens = tokenEntries.map((e) => e.token);
  logger.info("sendToTokens", {tokenCount: tokens.length, payload});
  if (!tokens.length) return;
  const response = await fcm.sendEachForMulticast({
    tokens,
    notification: {
      title: payload.title || "EsquerrApp",
      body: payload.body || "",
    },
    data: payload,
    android: {
      priority: "high",
    },
    webpush: {
      headers: {"Urgency": "high"},
      fcmOptions: {link: "/"},
    },
  });
  logger.info("sendToTokens result", {
    successCount: response.successCount,
    failureCount: response.failureCount,
  });
  // Remove invalid tokens (look up by uid, no collectionGroup needed)
  if (response.failureCount > 0) {
    const batch = db.batch();
    let staleCount = 0;
    response.responses.forEach((resp, i) => {
      if (!resp.success &&
        (resp.error?.code === "messaging/invalid-registration-token" ||
         resp.error?.code === "messaging/registration-token-not-registered")) {
        const entry = tokenEntries[i];
        if (entry) {
          batch.delete(
              db.collection("users").doc(entry.uid)
                  .collection("tokens").doc(entry.token));
          staleCount++;
        }
      } else if (!resp.success) {
        logger.warn("FCM send failed for token", {
          token: tokens[i]?.slice(0, 20) + "...",
          error: resp.error?.code,
          message: resp.error?.message,
        });
      }
    });
    if (staleCount > 0) {
      await batch.commit();
      logger.info("Cleaned up stale tokens", {staleCount});
    }
  }
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
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error("Failed to update pushQueue status", {error: err.message});
  }
});

// ════════════════════════════════════════════════════════════
// 2. Training Reminder — runs every hour, checks for training
//    starting in ~4 hours. Default attendance is "Yes", so this
//    only notifies as a general heads-up, not for unanswered players.
// ════════════════════════════════════════════════════════════
exports.scheduledTrainingReminder = onSchedule({
  schedule: "every 60 minutes",
  timeZone: "Europe/Madrid",
  region: "us-central1",
}, async () => {
  const now = new Date();
  // A session ~4h away is today or (for a run near midnight) early tomorrow.
  const fmt = new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Madrid"});
  const today = fmt.format(now);
  const tomorrow = fmt.format(new Date(now.getTime() + 24 * 36e5));

  // Only teams that actually train on these dates (denormalized field
  // maintained by updateTeamDates) — no full collection scan.
  const teamsSnap = await db.collection("teams")
      .where("trainingDates", "array-contains-any", [today, tomorrow]).get();
  if (teamsSnap.empty) {
    logger.info("trainingReminder: no team trains today/tomorrow");
    return;
  }

  await Promise.all(teamsSnap.docs.map(async (teamDoc) => {
    const teamId = teamDoc.id;
    const dataDoc = await db.collection("teams").doc(teamId)
        .collection("data").doc("fa_training").get();
    const training = dataDoc.exists ? JSON.parse(dataDoc.data().v || "[]") : [];
    const upcoming = training.filter((s) =>
      s.status !== "past" && s.time &&
      (s.date === today || s.date === tomorrow));
    if (!upcoming.length) return;

    // Answers come from the canonical record collection
    const availSnap = await db.collection("teams").doc(teamId)
        .collection("trainingAvail").where("date", "in", [today, tomorrow]).get();
    const answered = new Set(availSnap.docs.map((d) => d.data().uid + "_" + d.data().date));

    let playerUids = null;
    for (const session of upcoming) {
      const startTime = session.time.split(" - ")[0]?.trim();
      if (!startTime) continue;
      const sessionDate = parseMadridDate(session.date, startTime);
      const hoursUntil = (sessionDate - now) / (1000 * 60 * 60);
      if (hoursUntil < 3.5 || hoursUntil > 4.5) continue;

      if (!playerUids) playerUids = await getTeamMembersByRole(teamId, "player");
      const unanswered = playerUids.filter((uid) => !answered.has(uid + "_" + session.date));
      logger.info("trainingReminder", {teamId, date: session.date,
        players: playerUids.length, unanswered: unanswered.length});

      if (unanswered.length) {
        const tokens = await getTokensForUsers(unanswered);
        if (tokens.length) {
          await sendToTokens(tokens, {
            title: "🏋️ Entrenament avui!",
            body: (session.focus || "Entrenament") + " a les " +
              startTime + ". Confirma la teva assistència.",
            type: "training_reminder", page: "player-home", tag: "training-" + session.date,
          });
        }
      }
    }
  }));
});

// ════════════════════════════════════════════════════════════
// 3. RPE Reminder — runs at 23:00 CEST daily.
//    Reminds players who completed training/match today but
//    haven't submitted RPE.
// ════════════════════════════════════════════════════════════
exports.scheduledRpeReminder = onSchedule({
  schedule: "0 23 * * *",
  timeZone: "Europe/Madrid",
  region: "us-central1",
}, async () => {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Madrid"}).format(now);

  // Only teams with a training or match today (denormalized fields)
  const [trainTeams, matchTeams] = await Promise.all([
    db.collection("teams").where("trainingDates", "array-contains", today).get(),
    db.collection("teams").where("matchDates", "array-contains", today).get(),
  ]);
  const teamDocs = new Map();
  trainTeams.forEach((d) => teamDocs.set(d.id, d));
  matchTeams.forEach((d) => teamDocs.set(d.id, d));
  if (!teamDocs.size) {
    logger.info("rpeReminder: no team had training or a match today");
    return;
  }

  await Promise.all([...teamDocs.keys()].map(async (teamId) => {
    const dataCol = db.collection("teams").doc(teamId).collection("data");
    const [trainingDoc, matchDoc] = await Promise.all([
      dataCol.doc("fa_training").get(),
      dataCol.doc("fa_matches").get(),
    ]);
    const training = trainingDoc.exists ? JSON.parse(trainingDoc.data().v || "[]") : [];
    const matches = matchDoc.exists ? JSON.parse(matchDoc.data().v || "[]") : [];
    const todayTraining = training.find((t) => t.date === today);
    const todayMatch = matches.find((m) => m.date === today);
    if (!todayTraining && !todayMatch) return;

    // RPE + availability from the canonical record collections
    const teamRef = db.collection("teams").doc(teamId);
    const [rpeSnap, availSnap] = await Promise.all([
      teamRef.collection("rpe").where("date", "==", today).get(),
      teamRef.collection("trainingAvail").where("date", "==", today).get(),
    ]);
    const rpeIds = new Set(rpeSnap.docs.map((d) => d.id));
    const availByUid = {};
    availSnap.forEach((d) => { availByUid[d.data().uid] = d.data().value; });

    const playerUids = await getTeamMembersByRole(teamId, "player");
    const missingRpe = playerUids.filter((uid) => {
      if (todayTraining) {
        const attended = availByUid[uid] === "yes" || availByUid[uid] === "late";
        if (attended && !rpeIds.has(uid + "_training_" + today)) return true;
      }
      if (todayMatch && !rpeIds.has(uid + "_match_" + todayMatch.id)) return true;
      return false;
    });
    logger.info("rpeReminder", {teamId, players: playerUids.length,
      missing: missingRpe.length});

    if (missingRpe.length) {
      const tokens = await getTokensForUsers(missingRpe);
      if (tokens.length) {
        await sendToTokens(tokens, {
          title: "📊 No oblidis el RPE!",
          body: "Registra el teu RPE d'avui abans de dormir.",
          type: "rpe_reminder",
          page: "player-actions",
          tag: "rpe-" + today,
        });
      }
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
    const matchDoc = await db.collection("teams").doc(teamId)
        .collection("data").doc("fa_matches").get();
    if (!matchDoc.exists) return;
    const matches = JSON.parse(matchDoc.data().v || "[]");
    const weekendMatches = matches.filter((m) =>
      m.status !== "past" && m.date && (m.date === satStr || m.date === sunStr));
    if (!weekendMatches.length) return;

    // Answers from the canonical record collection; roster queried ONCE
    const matchIds = weekendMatches.map((m) => String(m.id));
    const availSnap = await db.collection("teams").doc(teamId)
        .collection("matchAvail").where("matchId", "in", matchIds.slice(0, 10)).get();
    const answered = new Set(availSnap.docs.map((d) => d.data().uid + "_" + d.data().matchId));
    const playerUids = await getTeamMembersByRole(teamId, "player");

    for (const match of weekendMatches) {
      const unanswered = playerUids.filter((uid) =>
        !answered.has(uid + "_" + String(match.id)));
      logger.info("matchAvailReminder", {teamId, matchId: match.id,
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
// Allow any fcf.cat classificacio URL (dynamic per club)
exports.fcfClassificacio = onRequest(
    {cors: true, region: "us-central1", memory: "256MiB"},
    async (req, res) => {
      const url = req.query.url;
      // Full-path allowlist: only FCF classification pages, no query
      // strings, fragments or path tricks past the prefix.
      if (!url || !/^https:\/\/www\.fcf\.cat\/classificacio\/[a-zA-Z0-9/_-]+$/.test(url)) {
        res.status(400).json({error: "Invalid URL"});
        return;
      }
      try {
        const resp = await fetch(url, {
          headers: {"User-Agent": "Mozilla/5.0"},
        });
        if (!resp.ok) throw new Error("FCF returned " + resp.status);
        const html = await resp.text();
        res.set("Cache-Control", "public, max-age=300");
        res.send(html);
      } catch (err) {
        logger.error("fcfClassificacio error", err);
        res.status(502).json({error: "Failed to fetch FCF"});
      }
    },
);

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
  await db.collection("users").doc(uid).set(
      {teamId: clubId, isTeamLead: isLead},
      {merge: true},
  );

  // Stamp membership + role as Auth custom claims so security rules can
  // authorize from the token (no per-request doc reads). claimsUpdatedAt
  // tells the client to force-refresh its ID token.
  const userSnap = await db.collection("users").doc(uid).get();
  const roles = (userSnap.exists && userSnap.data().roles) || [];
  const role = isLead ? "lead" : (roles.includes("staff") ? "staff" : "player");
  await admin.auth().setCustomUserClaims(uid, {teamId: clubId, role});
  await db.collection("users").doc(uid).set(
      {claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()},
      {merge: true},
  );
  logger.info("joinClub", {uid, clubId, isLead, role});

  return {
    clubId,
    name: club.name || "",
    badgeUrl: club.badgeUrl || "",
    categories: club.categories || [],
    fcfLinks: club.fcfLinks || [],
    isTeamLead: isLead,
  };
});

// ── 7. setRole — update a member's roles + keep claims in sync ──
// Callers: the member themselves (player/staff self-selection — current
// onboarding design), the club's team lead, or the superuser. All role
// changes should go through here so the token claims stay in sync.
exports.setRole = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cal iniciar sessió.");
  }
  const caller = request.auth;
  const uid = request.data && request.data.uid;
  const roles = (request.data && request.data.roles) || [];
  if (!uid || !Array.isArray(roles) ||
      !roles.every((r) => ["player", "staff"].includes(r))) {
    throw new HttpsError("invalid-argument", "Paràmetres no vàlids.");
  }

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

  const role = target.isTeamLead === true ? "lead" :
    (roles.includes("staff") ? "staff" : "player");
  await admin.auth().setCustomUserClaims(uid, {teamId: teamId || null, role});
  await db.collection("users").doc(uid).set({
    roles,
    claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  logger.info("setRole", {by: caller.uid, uid, roles, role});
  return {ok: true, role};
});

// ── 8. (removed in Phase 3b) bridgeLegacyPlayerData ──
// The Phase-2 trigger that mirrored old clients' legacy blob writes into
// the record collections is gone: old APKs are extinct and the record
// collections are the only write path. The frozen legacy data/ docs stay
// in place until `migrate-player-data.js --delete-legacy` removes them.

// ── 9. updateTeamDates — denormalize schedule dates onto the team doc ──
// Keeps teams/{id}.trainingDates / .matchDates arrays in sync with the
// fa_training / fa_matches blobs (staff-only writers). The schedulers
// query `array-contains` on these instead of scanning every team.
exports.updateTeamDates = onDocumentWritten({
  document: "teams/{teamId}/data/{key}",
  region: "us-central1",
}, async (event) => {
  const key = event.params.key;
  if (key !== "fa_training" && key !== "fa_matches") return;
  let list = [];
  if (event.data.after.exists) {
    const parsed = parseDataDoc(event.data.after, []);
    if (Array.isArray(parsed)) list = parsed;
  }
  const dates = [...new Set(list.map((x) => String(x.date || "")).filter(Boolean))];
  const field = key === "fa_training" ? "trainingDates" : "matchDates";
  await db.collection("teams").doc(event.params.teamId)
      .set({[field]: dates}, {merge: true});
});

// ── 10. archiveSeason — archive & reset season data (admin only) ──
const SEASON_KEYS = [
  "fa_matches", "fa_match_events", "fa_match_goals",
  "fa_training",
  "fa_training_availability", "fa_match_availability",
  "fa_training_staff_override",
  "fa_player_rpe", "fa_player_stats",
  "fa_injuries", "fa_injury_notes", "fa_injury_zone",
  "fa_convocatoria_sent", "fa_convocatoria_callup",
  "fa_standings", "fa_matchday", "fa_news",
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

      logger.info("archiveSeason START", {teamId, label: safeLabel, uid: decoded.uid});

      try {
        const dataRef = db.collection("teams").doc(teamId).collection("data");
        const archiveRef = db.collection("teams").doc(teamId)
            .collection("seasons").doc(safeLabel).collection("data");

        // ── Read all season data docs ──
        const docs = {};
        for (const key of SEASON_KEYS) {
          const snap = await dataRef.doc(key).get();
          if (snap.exists) docs[key] = snap.data();
        }

        // ── Also read fa_users to zero stats ──
        const usersSnap = await dataRef.doc("fa_users").get();
        const usersData = usersSnap.exists ? usersSnap.data() : null;

        // ── Special injury handling: keep active/recovering ──
        let keptInjuries = [];
        let archivedInjuryData = docs["fa_injuries"] || null;
        if (archivedInjuryData) {
          try {
            const allInjuries = JSON.parse(archivedInjuryData.v || "[]");
            const resolved = allInjuries.filter(
                (inj) => inj.status === "resolved");
            const kept = allInjuries.filter(
                (inj) => inj.status !== "resolved");
            keptInjuries = kept;
            // Archive only resolved injuries
            archivedInjuryData = {v: JSON.stringify(resolved)};
          } catch (e) {
            logger.warn("Failed to parse injuries, archiving as-is", e);
          }
        }

        // ── Batch 1: Write archive docs ──
        let batch = db.batch();
        let opCount = 0;
        for (const key of SEASON_KEYS) {
          const data = key === "fa_injuries" ?
            archivedInjuryData : docs[key];
          if (!data) continue;
          batch.set(archiveRef.doc(key), data);
          opCount++;
          // Firestore batch limit is 500 ops
          if (opCount >= 450) {
            await batch.commit();
            batch = db.batch();
            opCount = 0;
          }
        }
        // Write archive metadata
        batch.set(
            db.collection("teams").doc(teamId)
                .collection("seasons").doc(safeLabel),
            {
              label: safeLabel,
              archivedAt: admin.firestore.FieldValue.serverTimestamp(),
              archivedBy: decoded.uid,
            },
        );
        opCount++;
        if (opCount > 0) await batch.commit();

        // ── Archive + clear the per-record player-data collections ──
        // (Canonical data; the legacy availability/RPE blobs reset below
        // are frozen mirrors kept only until --delete-legacy runs.)
        for (const coll of ["trainingAvail", "matchAvail", "rpe"]) {
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

        // ── Batch 2: Reset source docs ──
        batch = db.batch();
        opCount = 0;
        for (const key of SEASON_KEYS) {
          if (!docs[key]) continue;

          if (key === "fa_injuries") {
            // Keep active/recovering injuries
            batch.set(dataRef.doc(key), {v: JSON.stringify(keptInjuries)});
          } else if (MERGE_KEYS.has(key)) {
            // For merge keys: delete all fields, keep _migrated flag
            const fields = {};
            for (const f of Object.keys(docs[key])) {
              if (f === "_migrated") continue;
              fields[f] = admin.firestore.FieldValue.delete();
            }
            if (Object.keys(fields).length > 0) {
              batch.update(dataRef.doc(key), fields);
            }
          } else if (OBJECT_KEYS.has(key)) {
            batch.set(dataRef.doc(key), {v: "{}"});
          } else {
            batch.set(dataRef.doc(key), {v: "[]"});
          }
          opCount++;
          if (opCount >= 450) {
            await batch.commit();
            batch = db.batch();
            opCount = 0;
          }
        }

        // ── Zero player stats (matchesPlayed, minutesPlayed) ──
        if (usersData && usersData.v) {
          try {
            const users = JSON.parse(usersData.v);
            for (const u of users) {
              u.matchesPlayed = 0;
              u.minutesPlayed = 0;
            }
            batch.set(dataRef.doc("fa_users"), {v: JSON.stringify(users)});
            opCount++;
          } catch (e) {
            logger.warn("Failed to zero player stats", e);
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
