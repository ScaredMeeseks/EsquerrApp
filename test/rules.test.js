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
const asA = () => db(A, {teamId: "teamA", role: "player", email: "a@x.com"});
const asA2 = () => db(A2, {teamId: "teamA", role: "player", email: "a2@x.com"});
const asStaffA = () => db(STAFF_A, {teamId: "teamA", role: "staff", email: "s@x.com"});
const asLeadA = () => db(LEAD_A, {teamId: "teamA", role: "lead", email: "l@x.com"});
const asB = () => db(B, {teamId: "teamB", role: "player", email: "b@x.com"});
const asSuper = () => db(SU, {teamId: "teamA", role: "lead", email: SUPER});

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
    await d.doc("clubs/teamA").set({name: "Club A", leadEmail: "l@x.com"});
    await d.doc("clubs/teamB").set({name: "Club B", leadEmail: "lb@x.com"});
    await d.doc("clubCodes/CODEA").set({clubId: "teamA"});
    await d.doc("teams/teamA/data/fa_matches").set({v: "[]"});
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
        db("newUid", {email: "n@x.com"}).doc("users/newUid").set({name: "N", roles: []}));
  });
  it("self-create WITH teamId is denied", async () => {
    await assertFails(
        db("newUid", {email: "n@x.com"}).doc("users/newUid").set({teamId: "teamA"}));
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
});

describe("Team data-key allowlist", () => {
  it("player CAN write an allowlisted key (fa_training_availability)", async () => {
    await assertSucceeds(asA().doc("teams/teamA/data/fa_training_availability")
        .set({x: "y"}, {merge: true}));
  });
  it("player CANNOT write a non-allowlisted key (fa_matches)", async () => {
    await assertFails(asA().doc("teams/teamA/data/fa_matches").set({v: "[]"}));
  });
  it("staff CAN write fa_matches", async () => {
    await assertSucceeds(asStaffA().doc("teams/teamA/data/fa_matches").set({v: "[]"}));
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
