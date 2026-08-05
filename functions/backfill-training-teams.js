// ============================================================
// Backfill `teams` onto existing training sessions.
//
// Sessions used to carry only a `category`, so every squad in a category
// shared one calendar. They now carry `teams` — the letters the session is
// for — and an EMPTY list still means "every letter", which is exactly what
// a session meant before the field existed. So nothing is broken while this
// has not run; it only makes the existing calendar precise.
//
// The letters are DERIVED FROM WHO ACTUALLY ATTENDED: a session's teams are
// the letters of the players holding an availability record against it. A
// club with one squad lands on ['A']; the demo club's amateur sessions land
// on ['A','B'], because both squads genuinely answered for them. Guessing
// ['A'] for everything would have been simpler and would have hidden 25
// players' whole season from team B.
//
// A session with NO attendance records keeps every letter of its category.
// An unattended session must not become invisible.
//
//   node functions/backfill-training-teams.js                 # dry run, ALL clubs
//   node functions/backfill-training-teams.js --club <id>     # dry run, one club
//   node functions/backfill-training-teams.js --apply         # write
//
// Run from the repo root on Cloud Shell — it requires ../js/shard.js, so
// running from ~ fails MODULE_NOT_FOUND. Credentials come from ADC, which
// is automatic on Cloud Shell; a stale GOOGLE_APPLICATION_CREDENTIALS is
// the usual cause of an auth failure, so unset it.
//
// Idempotent: a session that already has a non-empty `teams` is left alone,
// so a coach's manual edit is never overwritten and a re-run is a no-op.
// ============================================================
"use strict";

const path = require("path");
const admin = require("firebase-admin");
const Shard = require(path.join(__dirname, "..", "js", "shard.js"));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};

const APPLY = has("--apply");
const ONLY_CLUB = val("--club", null);

const SEP = "  ";
const log = (...a) => console.log(...a);
const step = (m) => log(`\n${m}`);
const ok = (m) => log(`${SEP}✔ ${m}`);

admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

/** Letters configured for a category, mirroring getTeamLetters() in app.js. */
function lettersOf(club, category) {
  const cats = (club && club.categories) || {};
  const c = cats[category];
  if (c && c.enabled && Array.isArray(c.letters) && c.letters.length) return c.letters;
  return ["A"];
}

function parseBlob(d) {
  if (!d || typeof d.v !== "string") return [];
  try {
    const p = JSON.parse(d.v);
    return Array.isArray(p) ? p : [];
  } catch (e) {
    // Never treat an unparseable shard as empty: writing over it would
    // discard a whole category's calendar. Stop and let a human look.
    throw new Error("unparseable fa_training shard — refusing to touch it");
  }
}

async function backfillTeam(teamId, club) {
  const dataCol = db.collection("teams").doc(teamId).collection("data");

  // uid → the player's team letter and category, from the roster shards.
  const memberOf = new Map();
  const usersSnap = await dataCol.get();
  const trainingDocs = [];
  usersSnap.forEach((d) => {
    const parts = Shard.parseDocId(d.id);
    if (!parts) return;
    if (parts.key === "fa_users") {
      parseBlob(d.data()).forEach((u) => {
        if (u && u.id) {
          memberOf.set(String(u.id), {team: u.team || "", category: u.category || ""});
        }
      });
    }
    if (parts.key === "fa_training") trainingDocs.push({id: d.id, cat: parts.cat, data: d.data()});
  });
  if (!trainingDocs.length) return {sessions: 0, changed: 0, skipped: 0, unattended: 0};

  // date → letters seen, per category. One collection read, not one per
  // session: a season is thousands of records.
  const attend = new Map(); // `${category}|${date}` → Set(letter)
  const availSnap = await db.collection("teams").doc(teamId).collection("trainingAvail").get();
  availSnap.forEach((d) => {
    const r = d.data() || {};
    const m = memberOf.get(String(r.uid));
    if (!m || !r.date) return;
    const key = m.category + "|" + r.date;
    if (!attend.has(key)) attend.set(key, new Set());
    if (m.team) attend.get(key).add(m.team);
  });

  let sessions = 0; let changed = 0; let skipped = 0; let unattended = 0;
  const writes = [];
  /* Tallied INSIDE the loop, from the rows actually stamped. It used to be
     computed afterwards by re-parsing doc.data -- the untouched original --
     so every row still had no `teams` and the whole breakdown printed
     nothing. The counts looked fine, which is what made it easy to miss. */
  const byLetters = {};

  for (const doc of trainingDocs) {
    const rows = parseBlob(doc.data);
    let touched = false;
    rows.forEach((t) => {
      if (!t) return;
      sessions++;
      if (Array.isArray(t.teams) && t.teams.filter(Boolean).length) { skipped++; return; }
      const cat = t.category || doc.cat;
      const seen = attend.get(cat + "|" + t.date);
      let teams;
      if (seen && seen.size) {
        teams = [...seen].sort();
      } else {
        // Nobody answered. Keep every letter rather than hiding it.
        teams = lettersOf(club, cat).slice();
        unattended++;
      }
      t.teams = teams;
      if (!Array.isArray(t.guests)) t.guests = [];
      if (!Array.isArray(t.excluded)) t.excluded = [];
      const k = cat + " -> [" + teams.join(",") + "]";
      byLetters[k] = (byLetters[k] || 0) + 1;
      changed++;
      touched = true;
    });
    if (touched) {
      writes.push({
        ref: dataCol.doc(doc.id),
        data: {v: JSON.stringify(rows), category: doc.cat},
      });
    }
  }

  const summary = {sessions, changed, skipped, unattended};
  Object.keys(byLetters).sort().forEach((k) =>
    log(`${SEP}${SEP}${k.padEnd(30)} ${byLetters[k]}`));

  if (APPLY && writes.length) {
    const batch = db.batch();
    writes.forEach((w) => batch.set(w.ref, w.data, {merge: true}));
    await batch.commit();
  }
  return summary;
}

(async () => {
  log("=== backfill training teams ===");
  log(APPLY ? "MODE: APPLY (writing)" : "MODE: dry run (nothing will be written)");

  const clubsSnap = ONLY_CLUB ?
    [await db.collection("clubs").doc(ONLY_CLUB).get()] :
    (await db.collection("clubs").get()).docs;

  let totalChanged = 0;
  for (const c of clubsSnap) {
    if (!c.exists) { log(`\nclub ${ONLY_CLUB} does not exist`); continue; }
    const club = c.data() || {};
    step(`${c.id} — ${club.name || "(unnamed)"}`);
    const r = await backfillTeam(c.id, club);
    if (!r.sessions) { log(`${SEP}no sessions`); continue; }
    ok(`${r.sessions} sessions · ${r.changed} to stamp · ${r.skipped} already set · ` +
       `${r.unattended} with no attendance (kept every letter)`);
    totalChanged += r.changed;
  }

  step("Done");
  log(`${SEP}${totalChanged} session(s) ${APPLY ? "stamped" : "would be stamped"}`);
  if (!APPLY) log(`${SEP}Re-run with --apply to write.`);
})().catch((e) => {
  console.error(`\nFAILED: ${e && e.stack || e}`);
  process.exit(1);
});
