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

/** Read every roster doc of a club once, as [{key, staff[], players[]}]. */
async function loadRosters(clubId) {
  const snap = await db.collection("clubs").doc(clubId)
      .collection("rosters").get();
  return snap.docs.map((doc) => ({
    key: doc.id,
    staff: normEmails((doc.data() || {}).staffEmails),
    players: normEmails((doc.data() || {}).playerEmails),
  }));
}

/**
 * Resolve one address against already-loaded rosters.
 * @param {Array} rosters Result of loadRosters.
 * @param {string} email Lowercased address to look for.
 * @return {Object} {roles, staffCats, category, team}. `roles` is empty when
 *   the address is on no list at all — the caller decides whether that is a
 *   rejection.
 */
function membershipFrom(rosters, email) {
  const out = {roles: [], staffCats: [], category: "", team: ""};
  if (!email) return out;
  const staffCats = new Set();
  let playerKey = null;
  rosters.forEach((r) => {
    if (r.staff.includes(email)) staffCats.add(r.key.split("-")[0]);
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
    // A staff-only member still needs a category for the UI's default view.
    if (!out.category) out.category = out.staffCats[0];
  }
  return out;
}

/** Convenience for the one-address callers. */
async function resolveMembership(clubId, email) {
  if (!email) return membershipFrom([], email);
  return membershipFrom(await loadRosters(clubId), email);
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
 * @param {Object} club The club document data (for its enabled categories).
 * @param {boolean} isLead Whether this member is the club's team lead.
 * @param {Object} m Result of resolveMembership / membershipFrom.
 * @return {Object} {role, cats} to write as custom claims.
 */
function claimsFor(club, isLead, m) {
  if (isLead) return {role: "lead", cats: enabledCategories(club)};
  if (m.roles.includes("staff")) return {role: "staff", cats: m.staffCats};
  return {role: "player", cats: []};
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
  const m = await resolveMembership(clubId, email);
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
  }, {merge: true});

  // Stamp membership + role as Auth custom claims so security rules can
  // authorize from the token (no per-request doc reads). claimsUpdatedAt
  // tells the client to force-refresh its ID token.
  const {role, cats} = claimsFor(club, isLead, m);
  await admin.auth().setCustomUserClaims(uid, {teamId: clubId, role, cats});
  await db.collection("users").doc(uid).set(
      {claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()},
      {merge: true},
  );
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
  const m = teamId ? await resolveMembership(teamId, email) : {roles: [], staffCats: []};

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
  }

  await admin.auth().setCustomUserClaims(uid, {teamId: teamId || null, role, cats});
  await db.collection("users").doc(uid).set({
    roles,
    staffCategories: cats,
    claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  logger.info("setRole", {by: caller.uid, uid, roles, role, cats});
  return {ok: true, role, cats};
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
  // Membership signature per address: "s" if on staffEmails, "p" if on
  // playerEmails. Comparing signatures (rather than a flat email list) also
  // catches an address MOVED between the two lists in a single edit.
  const sigOf = (snap) => {
    const out = {};
    if (!snap || !snap.exists) return out;
    const d = snap.data() || {};
    normEmails(d.staffEmails).forEach((e) => {
      out[e] = (out[e] || "") + "s";
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
    try {
      await doc.ref.update({
        roles: nextRoles,
        staffCategories: m.staffCats,
        category: detached ? "" : (m.category || doc.data().category || ""),
        team: detached ? "" : (m.team || doc.data().team || ""),
        claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      logger.info("onRosterWritten: user gone, skipping", {clubId, email});
      continue;
    }
    logger.info("onRosterWritten",
        {clubId, uid: doc.id, email, role, cats, detached});
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
        category: m.category || outgoing.data().category || "",
        team: m.team || outgoing.data().team || "",
        claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Neither player nor staff: leading the club was their only reason to
      // be in it, so they leave it. Their records stay keyed by uid, so
      // adding them back to a roster list later restores everything.
      await admin.auth().setCustomUserClaims(outgoing.id,
          {teamId: null, role: "player", cats: []});
      await outgoing.ref.update({
        teamId: admin.firestore.FieldValue.delete(),
        isTeamLead: false,
        roles: [],
        staffCategories: [],
        category: "",
        team: "",
        claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Drop them from the club roster blob, or they linger in every squad
      // list until something else rewrites it.
      await scrubDataDoc(
          db.collection("teams").doc(clubId).collection("data").doc("fa_users"),
          (arr) => (Array.isArray(arr) ?
            arr.filter((u) => String(u.id) !== outgoing.id) : null));
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
      claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
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
    fields[f] = admin.firestore.FieldValue.delete();
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
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, {merge: true});
          touched++;
        }
        done.rosterDocs = touched;
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

        // Roster list.
        await scrubDataDoc(dataRef.doc("fa_users"), (arr) =>
          Array.isArray(arr) ? arr.filter((u) => String(u.id) !== uid) : null);

        // Injuries — as the subject, and as the staff member who logged one.
        await scrubDataDoc(dataRef.doc("fa_injuries"), (arr) => {
          if (!Array.isArray(arr)) return null;
          return arr.filter((i) => String(i.playerId) !== uid)
              .map((i) => (String(i.createdBy) === uid ?
                Object.assign({}, i, {createdBy: ""}) : i));
        });

        // Notifications carry uid + playerName.
        await scrubDataDoc(dataRef.doc("fa_staff_notifications"), (arr) =>
          Array.isArray(arr) ?
            arr.filter((n) => String(n.uid || "") !== uid) : null);

        // Call-up lists: {matchId: {players:[uid], startingXI:[uid], …}}.
        await scrubDataDoc(dataRef.doc("fa_convocatoria_sent"), (obj) => {
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
        await scrubDataDoc(dataRef.doc("fa_match_events"), (obj) => {
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
        await scrubDataDoc(dataRef.doc("fa_match_goals"), (obj) => {
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
          await scrubDataDoc(dataRef.doc(key), (fields) => {
            if (fields && typeof fields.v === "string") return null;
            return Object.keys(fields || {}).filter((f) => f === uid);
          });
        }

        // Keys of the form {uid}_{date}: the staff override map and the
        // frozen legacy availability/RPE docs, which still hold the same
        // shape until migrate-player-data --delete-legacy runs.
        for (const key of ["fa_training_staff_override",
          "fa_training_availability", "fa_match_availability",
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
