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

const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onRequest} = require("firebase-functions/v2/https");
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

// ── Helper: get FCM tokens for users ──
async function getTokensForUsers(userIds) {
  const entries = []; // {token, uid}
  for (const uid of userIds) {
    const snap = await db.collection("users").doc(uid)
        .collection("tokens").get();
    snap.forEach((doc) => {
      if (doc.data().token) entries.push({token: doc.data().token, uid});
    });
  }
  // Deduplicate by token
  const seen = new Set();
  const unique = entries.filter((e) => {
    if (seen.has(e.token)) return false;
    seen.add(e.token);
    return true;
  });
  logger.info("getTokensForUsers", {userIds,
    tokenCount: unique.length});
  return unique;
}

// ── Helper: get all team members with a specific role ──
async function getTeamMembersByRole(teamId, role) {
  const snap = await db.collection("users")
      .where("teamId", "==", teamId)
      .get();
  const uids = [];
  const allFound = [];
  snap.forEach((doc) => {
    const data = doc.data();
    allFound.push({uid: doc.id, roles: data.roles || []});
    if (data.roles && data.roles.includes(role)) {
      uids.push(doc.id);
    }
  });
  logger.info("getTeamMembersByRole", {teamId, role, allUsers: allFound,
    matchingUids: uids});
  return uids;
}

// ── Helper: get all team members ──
async function getAllTeamMembers(teamId) {
  const snap = await db.collection("users")
      .where("teamId", "==", teamId)
      .get();
  const uids = [];
  snap.forEach((doc) => uids.push(doc.id));
  logger.info("getAllTeamMembers", {teamId, uids});
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
      notification: {
        icon: "ic_notification",
        color: "#1a1a2e",
        channelId: "esquerrapp_default",
      },
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
  logger.info("scheduledTrainingReminder START");
  const teamsSnap = await db.collection("teams").get();
  logger.info("Teams found", {count: teamsSnap.size,
    ids: teamsSnap.docs.map((d) => d.id)});

  for (const teamDoc of teamsSnap.docs) {
    const teamId = teamDoc.id;
    const dataDoc = await db.collection("teams").doc(teamId)
        .collection("data").doc("fa_training").get();
    if (!dataDoc.exists) {
      logger.warn("No fa_training doc for team", {teamId});
      continue;
    }

    const training = JSON.parse(dataDoc.data().v || "[]");
    logger.info("Training sessions loaded", {teamId,
      count: training.length,
      sessions: training.map((s) => ({
        date: s.date, time: s.time, status: s.status,
      }))});

    const availDoc = await db.collection("teams").doc(teamId)
        .collection("data").doc("fa_training_availability").get();
    const avail = availDoc.exists ?
      JSON.parse(availDoc.data().v || "{}") : {};

    const now = new Date();
    logger.info("Current time (server)", {iso: now.toISOString()});

    for (const session of training) {
      if (session.status === "past") continue;
      if (!session.date || !session.time) continue;

      const startTime = session.time.split(" - ")[0]?.trim();
      if (!startTime) continue;

      const sessionDate = parseMadridDate(session.date, startTime);
      const hoursUntil = (sessionDate - now) / (1000 * 60 * 60);

      logger.info("Checking session", {date: session.date,
        startTime, sessionDate: sessionDate.toISOString(),
        hoursUntil: hoursUntil.toFixed(2)});

      if (hoursUntil >= 3.5 && hoursUntil <= 4.5) {
        const playerUids = await getTeamMembersByRole(teamId, "player");
        const unanswered = playerUids.filter((uid) => {
          const key = uid + "_" + session.date;
          return !avail[key];
        });
        logger.info("Unanswered players", {sessionDate: session.date,
          unanswered});

        if (unanswered.length) {
          const tokens = await getTokensForUsers(unanswered);
          if (tokens.length) {
            await sendToTokens(tokens, {
              title: "\uD83C\uDFCB\uFE0F Entrenament avui!",
              body: (session.focus || "Entrenament") + " a les " +
                startTime + ". Confirma la teva assistència.",
              type: "training_reminder",              page: "player-home",              tag: "training-" + session.date,
            });
          } else {
            logger.warn("No tokens found for unanswered players");
          }
        } else {
          logger.info("All players already answered for this session");
        }
      }
    }
  }
  logger.info("scheduledTrainingReminder END");
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
  const today = new Date().toISOString().slice(0, 10);
  logger.info("scheduledRpeReminder START", {today});
  const teamsSnap = await db.collection("teams").get();
  logger.info("Teams found", {count: teamsSnap.size,
    ids: teamsSnap.docs.map((d) => d.id)});

  for (const teamDoc of teamsSnap.docs) {
    const teamId = teamDoc.id;

    const trainingDoc = await db.collection("teams").doc(teamId)
        .collection("data").doc("fa_training").get();
    const training = trainingDoc.exists ?
      JSON.parse(trainingDoc.data().v || "[]") : [];
    const todayTraining = training.find((t) => t.date === today);
    logger.info("Training check", {teamId, totalSessions: training.length,
      todayTraining: todayTraining || "none",
      recentDates: training.slice(-5).map((t) => t.date)});

    const matchDoc = await db.collection("teams").doc(teamId)
        .collection("data").doc("fa_matches").get();
    const matches = matchDoc.exists ?
      JSON.parse(matchDoc.data().v || "[]") : [];
    const todayMatch = matches.find((m) => m.date === today);
    logger.info("Match check", {teamId, totalMatches: matches.length,
      todayMatch: todayMatch || "none",
      recentDates: matches.slice(-5).map((m) => m.date)});

    if (!todayTraining && !todayMatch) {
      logger.info("No training or match today, skipping team", {teamId});
      continue;
    }

    const rpeDoc = await db.collection("teams").doc(teamId)
        .collection("data").doc("fa_player_rpe").get();
    const rpeData = rpeDoc.exists ?
      JSON.parse(rpeDoc.data().v || "{}") : {};

    const availDoc = await db.collection("teams").doc(teamId)
        .collection("data").doc("fa_training_availability").get();
    const avail = availDoc.exists ?
      JSON.parse(availDoc.data().v || "{}") : {};

    const playerUids = await getTeamMembersByRole(teamId, "player");
    const missingRpe = [];

    for (const uid of playerUids) {
      let shouldRemind = false;

      if (todayTraining) {
        const availKey = uid + "_" + today;
        const attended = avail[availKey] === "yes" ||
          avail[availKey] === "late";
        const rpeKey = uid + "_training_" + today;
        logger.info("RPE check (training)", {uid, availKey,
          availValue: avail[availKey], attended,
          rpeKey, hasRpe: !!rpeData[rpeKey]});
        if (attended && !rpeData[rpeKey]) shouldRemind = true;
      }

      if (todayMatch) {
        const rpeKey = uid + "_match_" + todayMatch.id;
        logger.info("RPE check (match)", {uid, rpeKey,
          hasRpe: !!rpeData[rpeKey]});
        if (!rpeData[rpeKey]) shouldRemind = true;
      }

      if (shouldRemind) missingRpe.push(uid);
    }

    logger.info("Missing RPE players", {teamId, missingRpe});

    if (missingRpe.length) {
      const tokens = await getTokensForUsers(missingRpe);
      if (tokens.length) {
        await sendToTokens(tokens, {
          title: "\uD83D\uDCCA No oblidis el RPE!",
          body: "Registra el teu RPE d'avui abans de dormir.",
          type: "rpe_reminder",
          page: "player-actions",
          tag: "rpe-" + today,
        });
      } else {
        logger.warn("No tokens found for RPE-missing players");
      }
    } else {
      logger.info("No players missing RPE (or no players found)");
    }
  }
  logger.info("scheduledRpeReminder END");
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
  logger.info("scheduledMatchAvailReminder START (Friday 20:00)");
  const teamsSnap = await db.collection("teams").get();

  // Calculate Saturday and Sunday dates
  const now = new Date();
  const satDate = new Date(now);
  satDate.setDate(satDate.getDate() + 1);
  const sunDate = new Date(now);
  sunDate.setDate(sunDate.getDate() + 2);
  const satStr = satDate.toISOString().slice(0, 10);
  const sunStr = sunDate.toISOString().slice(0, 10);
  logger.info("Weekend dates", {satStr, sunStr});

  for (const teamDoc of teamsSnap.docs) {
    const teamId = teamDoc.id;
    const matchDoc = await db.collection("teams").doc(teamId)
        .collection("data").doc("fa_matches").get();
    if (!matchDoc.exists) continue;

    const matches = JSON.parse(matchDoc.data().v || "[]");
    const availDoc = await db.collection("teams").doc(teamId)
        .collection("data").doc("fa_match_availability").get();
    const avail = availDoc.exists ?
      JSON.parse(availDoc.data().v || "{}") : {};

    // Filter to weekend matches only
    const weekendMatches = matches.filter((m) => {
      if (m.status === "past" || !m.date) return false;
      return m.date === satStr || m.date === sunStr;
    });

    for (const match of weekendMatches) {
      const playerUids = await getTeamMembersByRole(teamId, "player");
      const unanswered = playerUids.filter((uid) => {
        const key = uid + "_" + match.id;
        return !avail[key];
      });

      if (unanswered.length) {
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
    }
  }
  logger.info("scheduledMatchAvailReminder END");
});

// ── 5. fcfClassificacio — proxy FCF league standings ──
// Allow any fcf.cat classificacio URL (dynamic per club)
exports.fcfClassificacio = onRequest(
    {cors: true, region: "us-central1", memory: "256MiB"},
    async (req, res) => {
      const url = req.query.url;
      if (!url || !url.startsWith("https://www.fcf.cat/classificacio/")) {
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
