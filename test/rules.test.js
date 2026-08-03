// ============================================================
// Firestore security-rules tests — club compartmentalization
// ============================================================
// Exercises firestore.rules against the emulator. No production
// data or credentials — uses a demo project id.
//
// Run (Cloud Shell has Java + firebase-tools):
//   cd ~/EsquerrApp/test && npm install
//   npx firebase emulators:exec --only firestore --project=demo-esquerrapp \
//       "npx mocha rules.test.js --timeout 15000"
//
// Model recap (see ../firestore.rules):
//   superuser = token.email == 'marna96@gmail.com'
//   claims: token.teamId, token.role in ['player','staff','lead']
//   records: teams/{t}/{trainingAvail|matchAvail|rpe}/{uid}_...
// ============================================================

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");

const PROJECT_ID = "demo-esquerrapp";
const SUPER = "marna96@gmail.com";

let env;

// Auth contexts
const A = "uidA"; // player, teamA
const A2 = "uidA2"; // another player, teamA
const STAFF_A = "uidStaffA"; // staff, teamA
const LEAD_A = "uidLeadA"; // lead, teamA
const B = "uidB"; // player, teamB
const SU = "uidSuper"; // superuser

function ctx(uid, claims) {
  return env.authenticatedContext(uid, claims);
}
function db(uid, claims) {
  return ctx(uid, claims).firestore();
}
// Players carry their OWN category in `cats` (Stage A) — it means
// "categories you may SEE", so a player sees exactly one.
const asA = () => db(A, {teamId: "teamA", role: "player", email: "a@x.com", cats: ["cadet"]});
const asA2 = () => db(A2, {teamId: "teamA", role: "player", email: "a2@x.com", cats: ["cadet"]});
// A player with no squad yet: sees only the __none shards.
const asUnassigned = () => db("uidNoCat", {teamId: "teamA", role: "player", email: "u@x.com", cats: []});
// Staff A covers cadet only — the roster tests below lean on that.
const asStaffA = () => db(STAFF_A, {teamId: "teamA", role: "staff", email: "s@x.com", cats: ["cadet"]});
const asLeadA = () => db(LEAD_A, {teamId: "teamA", role: "lead", email: "l@x.com", cats: ["cadet", "juvenil"]});
const asB = () => db(B, {teamId: "teamB", role: "player", email: "b@x.com", cats: []});
const asSuper = () => db(SU, {teamId: "teamA", role: "lead", email: SUPER, cats: []});
// A staff member from before the cats claim existed (no `cats` on the token).
const asStaffNoCats = () => db("uidStaffOld", {teamId: "teamA", role: "staff", email: "old@x.com"});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});
after(async () => { if (env) await env.cleanup(); });

// Seed docs that tests read/update as `resource`, bypassing rules.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await d.doc("users/" + A).set({teamId: "teamA", roles: ["player"], name: "A"});
    await d.doc("users/" + A2).set({teamId: "teamA", roles: ["player"], name: "A2"});
    await d.doc("users/" + STAFF_A).set({teamId: "teamA", roles: ["staff"], name: "S"});
    await d.doc("users/" + LEAD_A).set({teamId: "teamA", isTeamLead: true, roles: ["staff"], name: "L"});
    await d.doc("users/" + B).set({teamId: "teamB", roles: ["player"], name: "B"});
    // Doc-only membership, NO custom claims — the Phase-2 me() fallback
    // would have honored this; Phase 3b claims-only rules must not.
    await d.doc("users/uidNoClaims").set({teamId: "teamA", isTeamLead: true, roles: ["staff"], name: "NC"});
    await d.doc("clubs/teamA").set({name: "Club A", leadEmail: "l@x.com"});
    await d.doc("clubs/teamB").set({name: "Club B", leadEmail: "lb@x.com"});
    // Roster email lists — the membership gate. PII, so read is restricted
    // to the lead and to staff of that specific category.
    await d.doc("clubs/teamA/rosters/cadet-A")
        .set({staffEmails: ["s@x.com"], playerEmails: ["kid@x.com"]});
    await d.doc("clubs/teamA/rosters/juvenil-A")
        .set({staffEmails: ["other@x.com"], playerEmails: ["teen@x.com"]});
    await d.doc("clubCodes/CODEA").set({clubId: "teamA"});
    // A pre-Phase-5 un-sharded document: no `category`, so nothing can
    // read it any more. Kept deliberately — it is what a Cloud Function
    // that forgets to stamp the field would produce.
    await d.doc("teams/teamA/data/fa_matches").set({v: "[]"});
    // Sharded team data (Phase 5). fa_injuries is the one that matters:
    // it is the medical record the whole phase exists to compartmentalise.
    await d.doc("teams/teamA/data/fa_injuries__cadet").set({v: "[]", category: "cadet"});
    await d.doc("teams/teamA/data/fa_injuries__juvenil").set({v: "[]", category: "juvenil"});
    await d.doc("teams/teamA/data/fa_users__none").set({v: "[]", category: "none"});
    await d.doc("teams/teamB/data/fa_injuries__cadet").set({v: "[]", category: "cadet"});
    await d.doc("teams/teamA/trainingAvail/" + A2 + "_2026-01-01")
        .set({uid: A2, date: "2026-01-01", value: "yes"});
    await d.doc("teams/teamB/trainingAvail/" + B + "_2026-01-01")
        .set({uid: B, date: "2026-01-01", value: "yes"});
  });
});

describe("Cross-club isolation", () => {
  it("teamA member reads a same-team member's user doc", async () => {
    await assertSucceeds(asA().doc("users/" + A2).get());
  });
  it("teamA member CANNOT read a teamB member's user doc", async () => {
    await assertFails(asA().doc("users/" + B).get());
  });
  it("teamA member CANNOT read teamB's data blob", async () => {
    await assertFails(asA().doc("teams/teamB/data/fa_matches").get());
  });
  it("teamA member CANNOT read a teamB record", async () => {
    await assertFails(asA().doc("teams/teamB/trainingAvail/" + B + "_2026-01-01").get());
  });
  it("teamA member CANNOT read teamB's club doc", async () => {
    await assertFails(asA().doc("clubs/teamB").get());
  });
  it("teamA member CAN read own club doc", async () => {
    await assertSucceeds(asA().doc("clubs/teamA").get());
  });
});

describe("Self-escalation is blocked", () => {
  it("player CANNOT set isTeamLead on own doc", async () => {
    await assertFails(asA().doc("users/" + A).update({isTeamLead: true}));
  });
  it("player CANNOT change own teamId", async () => {
    await assertFails(asA().doc("users/" + A).update({teamId: "teamB"}));
  });
  it("player CANNOT set isAdmin", async () => {
    await assertFails(asA().doc("users/" + A).update({isAdmin: true}));
  });
  it("player CAN edit own profile fields", async () => {
    await assertSucceeds(asA().doc("users/" + A).update({name: "New", position: "GK"}));
  });
  it("self-create WITHOUT privileged fields is allowed", async () => {
    await assertSucceeds(
        db("newUid", {email: "n@x.com"}).doc("users/newUid").set({name: "N"}));
  });
  it("self-create WITH teamId is denied", async () => {
    await assertFails(
        db("newUid", {email: "n@x.com"}).doc("users/newUid").set({teamId: "teamA"}));
  });
  // Membership is decided by the club's roster email lists and applied
  // server-side. If a client could write these, the registration gate would
  // be bypassable from the browser console.
  it("player CANNOT change own roles", async () => {
    await assertFails(asA().doc("users/" + A).update({roles: ["staff"]}));
  });
  it("player CANNOT change own category", async () => {
    await assertFails(asA().doc("users/" + A).update({category: "juvenil"}));
  });
  it("player CANNOT change own team letter", async () => {
    await assertFails(asA().doc("users/" + A).update({team: "B"}));
  });
  it("player CANNOT set own staffCategories", async () => {
    await assertFails(asA().doc("users/" + A).update({staffCategories: ["cadet"]}));
  });
  it("self-create WITH roles is denied", async () => {
    await assertFails(
        db("newUid", {email: "n@x.com"}).doc("users/newUid").set({name: "N", roles: ["staff"]}));
  });
});

describe("Staff updates of members", () => {
  it("staff CAN update a member's registration fields", async () => {
    await assertSucceeds(asStaffA().doc("users/" + A)
        .update({position: "FW", playerNumber: "9", category: "amateur"}));
  });
  it("staff CANNOT change a member's teamId", async () => {
    await assertFails(asStaffA().doc("users/" + A).update({teamId: "teamB"}));
  });
  it("a non-staff teammate CANNOT edit another member", async () => {
    await assertFails(asA().doc("users/" + A2).update({position: "FW"}));
  });
  // Roles move only through the setRole callable, so the Auth claims stay in
  // step with the doc. Direct writes used to be allowed here.
  it("staff CANNOT change a member's roles directly", async () => {
    await assertFails(asStaffA().doc("users/" + A).update({roles: ["staff"]}));
  });
  it("staff CANNOT set a member's staffCategories", async () => {
    await assertFails(asStaffA().doc("users/" + A).update({staffCategories: ["cadet"]}));
  });
  // "Leave the squad" on the Registrations page: a coach clears the squad
  // assignment but must not be able to remove the person from the club.
  it("staff CAN clear a member's category and team (leave the squad)", async () => {
    await assertSucceeds(asStaffA().doc("users/" + A)
        .update({category: "", team: ""}));
  });
  // prevCategory/prevTeam remember the squad someone was taken out of, so the
  // Unassigned list can offer to put them back.
  it("staff CAN record where a member was before", async () => {
    await assertSucceeds(asStaffA().doc("users/" + A)
        .update({category: "", team: "", prevCategory: "cadet", prevTeam: "A"}));
  });
  it("a player CANNOT fake their own previous team", async () => {
    await assertFails(asA().doc("users/" + A)
        .update({prevCategory: "amateur", prevTeam: "A"}));
  });
  it("staff CANNOT delete a member outright", async () => {
    await assertFails(asStaffA().doc("users/" + A).delete());
  });
  it("the lead CANNOT delete a member either — only the superuser", async () => {
    await assertFails(asLeadA().doc("users/" + A).delete());
  });
  it("a player CANNOT delete themselves", async () => {
    await assertFails(asA().doc("users/" + A).delete());
  });
  it("superuser CAN delete a member", async () => {
    await assertSucceeds(asSuper().doc("users/" + A2).delete());
  });
});

describe("Roster email lists (clubs/{club}/rosters/{cat}-{letter})", () => {
  const cadet = (d) => d.doc("clubs/teamA/rosters/cadet-A");
  const juvenil = (d) => d.doc("clubs/teamA/rosters/juvenil-A");

  it("player CANNOT read a roster (they are PII)", async () => {
    await assertFails(cadet(asA()).get());
  });
  it("player CANNOT write a roster", async () => {
    await assertFails(cadet(asA()).set({playerEmails: ["me@x.com"]}, {merge: true}));
  });
  it("lead CAN read any roster of own club", async () => {
    await assertSucceeds(cadet(asLeadA()).get());
    await assertSucceeds(juvenil(asLeadA()).get());
  });
  it("lead CAN write staffEmails", async () => {
    await assertSucceeds(cadet(asLeadA()).set({staffEmails: ["new@x.com"]}, {merge: true}));
  });
  it("staff CAN read the roster of their own category", async () => {
    await assertSucceeds(cadet(asStaffA()).get());
  });
  it("staff CANNOT read another category's roster", async () => {
    await assertFails(juvenil(asStaffA()).get());
  });
  it("staff CAN edit playerEmails in their own category", async () => {
    await assertSucceeds(cadet(asStaffA()).set({playerEmails: ["kid2@x.com"]}, {merge: true}));
  });
  it("staff CANNOT edit staffEmails (only the lead appoints staff)", async () => {
    await assertFails(cadet(asStaffA()).set({staffEmails: ["me@x.com"]}, {merge: true}));
  });
  it("staff CANNOT edit playerEmails in another category", async () => {
    await assertFails(juvenil(asStaffA()).set({playerEmails: ["x@x.com"]}, {merge: true}));
  });
  it("staff CANNOT create a roster doc carrying staffEmails", async () => {
    await assertFails(asStaffA().doc("clubs/teamA/rosters/cadet-B")
        .set({staffEmails: ["me@x.com"]}));
  });
  it("staff CAN create a missing roster doc with playerEmails only", async () => {
    await assertSucceeds(asStaffA().doc("clubs/teamA/rosters/cadet-B")
        .set({playerEmails: ["kid3@x.com"]}));
  });
  it("staff of another club CANNOT read these rosters", async () => {
    await assertFails(db("uidStaffB", {teamId: "teamB", role: "staff", email: "sb@x.com", cats: ["cadet"]})
        .doc("clubs/teamA/rosters/cadet-A").get());
  });
  it("a token with no cats claim is denied, not errored", async () => {
    await assertFails(cadet(asStaffNoCats()).get());
  });
  it("superuser reads any roster", async () => {
    await assertSucceeds(juvenil(asSuper()).get());
  });
});

describe("Team data-key allowlist", () => {
  it("player CAN write a still-allowlisted key (fa_injury_notes)", async () => {
    await assertSucceeds(asA().doc("teams/teamA/data/fa_injury_notes")
        .set({x: "y"}, {merge: true}));
  });
  it("player CANNOT write the frozen legacy availability doc (Phase 3b)", async () => {
    await assertFails(asA().doc("teams/teamA/data/fa_training_availability")
        .set({x: "y"}, {merge: true}));
  });
  it("player CANNOT write the frozen legacy RPE doc (Phase 3b)", async () => {
    await assertFails(asA().doc("teams/teamA/data/fa_player_rpe")
        .set({x: "y"}, {merge: true}));
  });
  it("player CANNOT write a non-allowlisted key (fa_matches)", async () => {
    await assertFails(asA().doc("teams/teamA/data/fa_matches").set({v: "[]"}));
  });
  it("staff CAN write fa_matches", async () => {
    await assertSucceeds(asStaffA().doc("teams/teamA/data/fa_matches").set({v: "[]"}));
  });
  it("staff CAN still write the frozen legacy docs", async () => {
    await assertSucceeds(asStaffA().doc("teams/teamA/data/fa_training_availability")
        .set({x: "y"}, {merge: true}));
  });
});

describe("Sharded data documents (Phase 5 Stage B)", () => {
  // Ids are now "{key}__{category}". The allowlist has to test the BASE
  // key — matching the whole id would deny every player write at cutover
  // and let a player write anything simply by suffixing it.
  it("player CAN write an allowlisted key's shard", async () => {
    await assertSucceeds(asA().doc("teams/teamA/data/fa_injury_notes__cadet")
        .set({x: "y", category: "cadet"}, {merge: true}));
  });
  it("player CAN write the __none shard of an allowlisted key", async () => {
    await assertSucceeds(asA().doc("teams/teamA/data/fa_users__none")
        .set({v: "[]", category: "none"}));
  });
  it("player CANNOT write a non-allowlisted key's shard", async () => {
    await assertFails(asA().doc("teams/teamA/data/fa_matches__cadet")
        .set({v: "[]", category: "cadet"}));
  });
  it("suffixing a denied key does not smuggle it past the allowlist", async () => {
    await assertFails(asA().doc("teams/teamA/data/fa_matches__fa_injury_notes")
        .set({v: "[]"}));
  });
  it("staff CAN write any shard of their club", async () => {
    await assertSucceeds(asStaffA().doc("teams/teamA/data/fa_matches__juvenil")
        .set({v: "[]", category: "juvenil"}));
  });
  it("shards are still walled off between clubs", async () => {
    await assertFails(asA().doc("teams/teamB/data/fa_injury_notes__cadet").get());
    await assertFails(asStaffA().doc("teams/teamB/data/fa_matches__cadet")
        .set({v: "[]", category: "cadet"}));
  });
});

describe("Category-scoped reads (Phase 5 Stage C)", () => {
  const inj = (d, cat) => d.doc("teams/teamA/data/fa_injuries__" + cat);

  // THE test this whole phase exists for. Before Stage C a cadet coach was
  // merely not SHOWN juvenil's medical records — the rules could not read
  // inside a JSON blob to stop him fetching them.
  it("a cadet coach CANNOT read juvenil's injuries", async () => {
    await assertFails(inj(asStaffA(), "juvenil").get());
  });
  it("a cadet coach CAN read cadet's injuries", async () => {
    await assertSucceeds(inj(asStaffA(), "cadet").get());
  });
  it("a player reads their own category only", async () => {
    await assertSucceeds(inj(asA(), "cadet").get());
    await assertFails(inj(asA(), "juvenil").get());
  });
  it("the lead reads every category of their club", async () => {
    await assertSucceeds(inj(asLeadA(), "cadet").get());
    await assertSucceeds(inj(asLeadA(), "juvenil").get());
  });
  it("__none is readable by every member, including the unassigned", async () => {
    await assertSucceeds(asA().doc("teams/teamA/data/fa_users__none").get());
    await assertSucceeds(asUnassigned().doc("teams/teamA/data/fa_users__none").get());
  });
  it("an unassigned player reads nothing else", async () => {
    await assertFails(inj(asUnassigned(), "cadet").get());
  });
  it("a document with NO category is unreadable", async () => {
    // The failure mode of a Cloud Function that forgets to stamp the field:
    // it goes dark rather than leaking. Loud, and the safe direction.
    await assertFails(asStaffA().doc("teams/teamA/data/fa_matches").get());
    await assertFails(asLeadA().doc("teams/teamA/data/fa_matches").get());
  });
  it("a token with no cats claim is denied, not errored", async () => {
    await assertFails(inj(asStaffNoCats(), "cadet").get());
  });
  it("superuser still reads across categories and clubs", async () => {
    await assertSucceeds(inj(asSuper(), "juvenil").get());
    await assertSucceeds(asSuper().doc("teams/teamB/data/fa_injuries__cadet").get());
  });
});

describe("Category-scoped QUERIES (the db.js listener)", () => {
  // The rule above is only usable if the collection query db.js issues is
  // accepted. Firestore rejects a query outright if ANY document it could
  // return might be denied — so if these fail, sync is dead for every
  // scoped user at once and the rule has to be redesigned, not patched.
  const data = (d) => d.collection("teams/teamA/data");

  it("the scoped query db.js issues is accepted", async () => {
    await assertSucceeds(data(asStaffA()).where("category", "in", ["none", "cadet"]).get());
  });
  it("the scoped query returns ONLY the permitted shards", async () => {
    const snap = await data(asStaffA()).where("category", "in", ["none", "cadet"]).get();
    const ids = snap.docs.map((d) => d.id).sort();
    assert.deepStrictEqual(ids, ["fa_injuries__cadet", "fa_users__none"]);
  });
  it("an UNFILTERED collection read is rejected", async () => {
    await assertFails(data(asStaffA()).get());
  });
  it("querying a category outside the claim is rejected", async () => {
    await assertFails(data(asStaffA()).where("category", "in", ["none", "juvenil"]).get());
    await assertFails(data(asStaffA()).where("category", "==", "juvenil").get());
  });
  it("the lead's wider query is accepted", async () => {
    await assertSucceeds(
        data(asLeadA()).where("category", "in", ["none", "cadet", "juvenil"]).get());
  });
});

describe("Claims-only auth (Phase 3b: me() fallback removed)", () => {
  const asNC = () => db("uidNoClaims", {email: "nc@x.com"}); // users doc says teamA lead
  it("doc-only membership CANNOT read team data", async () => {
    await assertFails(asNC().doc("teams/teamA/data/fa_matches").get());
  });
  it("doc-only membership CANNOT read a teammate's user doc", async () => {
    await assertFails(asNC().doc("users/" + A).get());
  });
  it("doc-only membership CANNOT read a teammate's record", async () => {
    await assertFails(asNC().doc("teams/teamA/trainingAvail/" + A2 + "_2026-01-01").get());
  });
  it("doc-only 'lead' CANNOT update the club", async () => {
    await assertFails(asNC().doc("clubs/teamA").update({name: "X"}));
  });
});

describe("Per-record ownership", () => {
  const rec = (uid) => "teams/teamA/trainingAvail/" + uid + "_2026-02-02";
  it("player creates own record (id prefix + uid match)", async () => {
    await assertSucceeds(asA().doc(rec(A)).set({uid: A, date: "2026-02-02", value: "yes"}));
  });
  it("player CANNOT create a record under another uid's id", async () => {
    await assertFails(asA().doc(rec(A2)).set({uid: A2, date: "2026-02-02", value: "yes"}));
  });
  it("player CANNOT create own-id record with a mismatched uid field", async () => {
    await assertFails(asA().doc(rec(A)).set({uid: A2, date: "2026-02-02", value: "yes"}));
  });
  it("player CANNOT overwrite another player's record", async () => {
    await assertFails(asA().doc("teams/teamA/trainingAvail/" + A2 + "_2026-01-01")
        .set({uid: A2, date: "2026-01-01", value: "no"}));
  });
  it("staff CAN update any member's record", async () => {
    await assertSucceeds(asStaffA().doc("teams/teamA/trainingAvail/" + A2 + "_2026-01-01")
        .set({uid: A2, date: "2026-01-01", value: "no"}, {merge: true}));
  });
  it("player CAN read a teammate's record", async () => {
    await assertSucceeds(asA().doc("teams/teamA/trainingAvail/" + A2 + "_2026-01-01").get());
  });
  it("player CAN delete own record", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc(rec(A)).set({uid: A, date: "2026-02-02", value: "yes"});
    });
    await assertSucceeds(asA().doc(rec(A)).delete());
  });
  it("player CANNOT delete another player's record", async () => {
    await assertFails(asA().doc("teams/teamA/trainingAvail/" + A2 + "_2026-01-01").delete());
  });
});

describe("Clubs, codes, join-attempts", () => {
  it("lead CAN update own club", async () => {
    await assertSucceeds(asLeadA().doc("clubs/teamA").update({name: "Renamed"}));
  });
  it("player CANNOT update the club", async () => {
    await assertFails(asA().doc("clubs/teamA").update({name: "Hacked"}));
  });
  it("client CANNOT read clubCodes", async () => {
    await assertFails(asA().doc("clubCodes/CODEA").get());
  });
  it("client CANNOT read joinAttempts", async () => {
    await assertFails(asA().doc("joinAttempts/" + A).get());
  });
});

describe("Superuser overrides", () => {
  it("superuser reads across teams", async () => {
    await assertSucceeds(asSuper().doc("users/" + B).get());
    await assertSucceeds(asSuper().doc("teams/teamB/data/fa_matches").get());
  });
  it("superuser reads clubCodes", async () => {
    await assertSucceeds(asSuper().doc("clubCodes/CODEA").get());
  });
});
