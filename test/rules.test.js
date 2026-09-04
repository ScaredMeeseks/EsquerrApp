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
    // `categories` and `maxTeams` are seeded so the team-quota rules can be
    // exercised: the shim below turns on whether a submitted `categories`
    // map is deep-equal to the stored one.
    await d.doc("clubs/teamA").set({
      name: "Club A", leadEmail: "l@x.com", maxTeams: 2,
      categories: {
        cadet: {enabled: true, letters: ["A"]},
        juvenil: {enabled: true, letters: ["A"]},
      },
    });
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
    /* An archived season. Its shards keep both the {key}__{cat} id and the
       `category` field, which is exactly what lets the archive be scoped
       the same way live data is. */
    await d.doc("teams/teamA/seasons/2024-2025").set({label: "2024-2025"});
    await d.doc("teams/teamA/seasons/2024-2025/data/fa_injuries__cadet")
        .set({v: "[]", category: "cadet"});
    await d.doc("teams/teamA/seasons/2024-2025/data/fa_injuries__juvenil")
        .set({v: "[]", category: "juvenil"});
    await d.doc("teams/teamA/seasons/2024-2025/data/fa_users__none")
        .set({v: "[]", category: "none"});
    await d.doc("teams/teamA/seasons/2024-2025/trainingAvail/" + A + "_2025-01-01")
        .set({uid: A, date: "2025-01-01", value: "yes"});
    /* Coach match notes. Doc id is the match id; `category` is duplicated
       onto the doc so the rule never needs a get() of fa_matches. */
    await d.doc("teams/teamA/matchNotes/2001").set({
      matchId: "2001", category: "cadet", team: "A",
      pre: {text: "press high"}, post: {text: ""},
      videos: [], boards: [], firstLegId: null, legDismissed: false,
    });
    await d.doc("teams/teamA/matchNotes/2002").set({
      matchId: "2002", category: "juvenil", team: "A",
      pre: {text: "juvenil plan"}, post: {text: ""},
      videos: [], boards: [], firstLegId: null, legDismissed: false,
    });
    await d.doc("teams/teamA/seasons/2024-2025/matchNotes/1901").set({
      matchId: "1901", category: "cadet", team: "A",
      pre: {text: "last season"}, post: {text: ""},
      videos: [], boards: [], firstLegId: null, legDismissed: false,
    });
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
  // The sub-role the client's section gating reads. The lead sets it on the
  // roster doc and the server re-derives it; self-promoting out of Fitness
  // by writing your own user doc is the obvious way round that.
  it("player CANNOT set own staffRole", async () => {
    await assertFails(asA().doc("users/" + A).update({staffRole: "coach"}));
  });
  it("self-create WITH staffRole is denied", async () => {
    await assertFails(db("newUid2", {email: "n2@x.com"})
        .doc("users/newUid2").set({name: "N", staffRole: "coach"}));
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
  it("staff CANNOT set a member's staffRole", async () => {
    await assertFails(asStaffA().doc("users/" + A).update({staffRole: "delegate"}));
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
  /* Phone and agent joined the staff allowlist in v231. The Registracions
     page writes both, and the write is a SINGLE merge covering position,
     dorsal, squad and these two — so if the rules refuse one key the whole
     save is refused and the coach's other edits vanish with it. */
  it("staff CAN set a member's phone and agent", async () => {
    await assertSucceeds(asStaffA().doc("users/" + A)
        .update({phone: "+34600000000", agent: "Gestió Esportiva SL"}));
  });
  it("staff CAN write them in the same merge as the registration fields", async () => {
    // The shape autoSaveFromRow actually sends. Passing the two keys alone
    // would not prove the real call is allowed.
    await assertSucceeds(asStaffA().doc("users/" + A).update({
      position: "FW", playerNumber: "9", team: "A", category: "amateur",
      phone: "+34600000001", agent: "Nova Agència"
    }));
  });
  it("a member CAN set their OWN phone (profile setup does this)", async () => {
    await assertSucceeds(asA().doc("users/" + A).update({phone: "+34600000002"}));
  });
  /* ⚠ THE POINT OF WIDENING AN ALLOWLIST IS WHAT IT STILL REFUSES.
     The three above only prove the list grew. */
  it("a non-staff teammate CANNOT set someone else's phone or agent", async () => {
    await assertFails(asA().doc("users/" + A2).update({phone: "+34600000003"}));
    await assertFails(asA().doc("users/" + A2).update({agent: "Whoever"}));
  });
  it("staff of ANOTHER club still cannot touch them", async () => {
    // Defined here rather than reused: the asStaffB helper lives inside a
    // later describe and is not in scope.
    const otherClubStaff = db("uidStaffOther",
        {teamId: "teamB", role: "staff", email: "sb@x.com", cats: ["cadet"]});
    await assertFails(otherClubStaff.doc("users/" + A).update({agent: "Wrong club"}));
    await assertFails(otherClubStaff.doc("users/" + A).update({phone: "+34600000005"}));
  });
  it("phone and agent did not become a way in for anything else", async () => {
    // A write that smuggles a privilege flag alongside an allowed key must
    // still fail as a whole.
    await assertFails(asStaffA().doc("users/" + A)
        .update({agent: "X", isTeamLead: true}));
    await assertFails(asStaffA().doc("users/" + A)
        .update({phone: "+34600000004", roles: ["staff"]}));
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
  // staffRoles rides on the same doc and is covered by the same hasOnly:
  // appointing a coach and downgrading one are the same decision.
  it("lead CAN write staffRoles", async () => {
    await assertSucceeds(cadet(asLeadA())
        .set({staffRoles: {"pf@x.com": "fitness"}}, {merge: true}));
  });
  it("staff CANNOT edit staffRoles", async () => {
    await assertFails(cadet(asStaffA())
        .set({staffRoles: {"me@x.com": "coach"}}, {merge: true}));
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
  /* The club document is the superadmin's. `maxTeams` is a commercial limit
     and `categories` is what it limits, so a lead can write neither — both
     go through the setClubCategories callable, the only writer that can
     count teams before committing. This rule used to be a bare
     `isLeadOf(clubId)`, which let a lead raise their own quota. */
  it("lead CANNOT rename own club", async () => {
    await assertFails(asLeadA().doc("clubs/teamA").update({name: "Renamed"}));
  });
  it("lead CANNOT write categories", async () => {
    await assertFails(asLeadA().doc("clubs/teamA")
        .update({categories: {amateur: {enabled: true, letters: ["A", "B"]}}}));
  });
  it("lead CANNOT raise their own maxTeams", async () => {
    // The whole point of the feature.
    await assertFails(asLeadA().doc("clubs/teamA").update({maxTeams: 99}));
  });
  it("lead CAN still edit fcfLinks and schedules", async () => {
    await assertSucceeds(asLeadA().doc("clubs/teamA")
        .update({fcfLinks: {"amateur-A": "https://example.test/x"}}));
  });
  it("superuser CAN set maxTeams", async () => {
    await assertSucceeds(asSuper().doc("clubs/teamA").update({maxTeams: 3}));
  });

  /* The back-compat shim for pre-v55 APKs, which still save team setup with
     a direct write. It works only because affectedKeys() lists the keys
     whose value actually CHANGED — an unchanged `categories` map is not in
     the diff, so the write passes the hasOnly() check.
     If this test ever goes red, every old APK has silently lost the ability
     to edit schedules, and nothing else in the suite would say so. */
  it("lead CAN send an UNCHANGED categories map alongside a real edit", async () => {
    await assertSucceeds(asLeadA().doc("clubs/teamA").update({
      categories: {
        cadet: {enabled: true, letters: ["A"]},
        juvenil: {enabled: true, letters: ["A"]},
      },
      fcfLinks: {"cadet-A": "https://example.test/y"},
    }));
  });

  it("lead CANNOT sneak a changed categories map past the shim", async () => {
    await assertFails(asLeadA().doc("clubs/teamA").update({
      categories: {
        cadet: {enabled: true, letters: ["A", "B"]},   // added a team
        juvenil: {enabled: true, letters: ["A"]},
      },
      fcfLinks: {"cadet-A": "https://example.test/z"},
    }));
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

/* ------------------------------------------------------------------ *
 * Archived seasons.
 *
 * Archiving is not declassification. A coach who cannot read juvenil's
 * medical records while the season is running must not be able to read the
 * same rows the moment they are archived — the archive rule was
 * `sameTeam` only, so he could.
 *
 * The wildcard trap is the reason the per-record collections are
 * enumerated in the rules rather than matched with `/{archiveColl}/`:
 * overlapping match blocks are OR'd, never overridden, so a wildcard would
 * ALSO match seasons/{id}/data/* and hand back the club-wide read the
 * narrower block just removed. It would look correct and do nothing.
 * ------------------------------------------------------------------ */
describe("Coach match notes (teams/{t}/matchNotes/{matchId})", () => {
  const note = (d, id) => d.doc("teams/teamA/matchNotes/" + id);
  const CADET = "2001";     // seeded, category cadet
  const JUVENIL = "2002";   // seeded, category juvenil

  /* THE assertion this whole collection exists for. Everything else about
     the feature is a UI choice; this one is the security claim. */
  it("a PLAYER of the same club and category cannot read a note", async () => {
    await assertFails(note(asA(), CADET).get());
  });
  it("a player cannot write one either", async () => {
    await assertFails(note(asA(), CADET).update({pre: {text: "hi"}}));
    await assertFails(note(asA(), "9999").set({matchId: "9999", category: "cadet"}));
    await assertFails(note(asA(), CADET).delete());
  });
  it("an unassigned player is not a special case", async () => {
    await assertFails(note(asUnassigned(), CADET).get());
  });

  it("a cadet coach reads and writes cadet notes", async () => {
    await assertSucceeds(note(asStaffA(), CADET).get());
    await assertSucceeds(note(asStaffA(), CADET).update({pre: {text: "v2"}}));
  });
  it("a cadet coach CANNOT read juvenil's notes", async () => {
    // Same compartmentalisation as the medical record: a coach's read of
    // another squad's preparation is not his to have.
    await assertFails(note(asStaffA(), JUVENIL).get());
    await assertFails(note(asStaffA(), JUVENIL).update({pre: {text: "x"}}));
    await assertFails(note(asStaffA(), JUVENIL).delete());
  });
  it("a cadet coach cannot CREATE one in juvenil either", async () => {
    // create tests request.resource, not resource — a separate arm of the
    // rule, and the one an attacker would reach for.
    await assertFails(note(asStaffA(), "3001")
        .set({matchId: "3001", category: "juvenil", team: "A"}));
    await assertSucceeds(note(asStaffA(), "3002")
        .set({matchId: "3002", category: "cadet", team: "A"}));
  });
  it("the category is immutable — a note cannot be moved between squads", async () => {
    // Otherwise a cadet coach could hand his own note to juvenil, or walk a
    // juvenil note into cadet one write at a time.
    await assertFails(note(asStaffA(), CADET).update({category: "juvenil"}));
  });
  it("the lead reads every category of their club", async () => {
    await assertSucceeds(note(asLeadA(), CADET).get());
    await assertSucceeds(note(asLeadA(), JUVENIL).get());
  });
  it("another club cannot touch them at all", async () => {
    await assertFails(note(asB(), CADET).get());
  });
  it("a token with no cats claim is denied, not errored", async () => {
    await assertFails(note(asStaffNoCats(), CADET).get());
  });
  it("a note with NO category is unreadable", async () => {
    // Same failure direction as an unstamped data/ shard: it goes dark
    // rather than leaking.
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc("teams/teamA/matchNotes/4001").set({matchId: "4001"});
    });
    await assertFails(note(asStaffA(), "4001").get());
    await assertFails(note(asLeadA(), "4001").get());
  });
  it("superuser reads across categories and clubs", async () => {
    await assertSucceeds(note(asSuper(), JUVENIL).get());
  });
});

describe("Archived seasons", () => {
  const arch = (d, cat) =>
    d.doc("teams/teamA/seasons/2024-2025/data/fa_injuries__" + cat);

  it("a cadet coach CANNOT read juvenil's ARCHIVED injuries", async () => {
    await assertFails(arch(asStaffA(), "juvenil").get());
  });
  it("a cadet coach CAN read cadet's archived injuries", async () => {
    await assertSucceeds(arch(asStaffA(), "cadet").get());
  });
  it("a player reads only their own category's archive", async () => {
    await assertSucceeds(arch(asA(), "cadet").get());
    await assertFails(arch(asA(), "juvenil").get());
  });
  it("the lead reads every category of their club's archive", async () => {
    await assertSucceeds(arch(asLeadA(), "cadet").get());
    await assertSucceeds(arch(asLeadA(), "juvenil").get());
  });
  it("__none stays readable by every member", async () => {
    await assertSucceeds(
        asUnassigned().doc("teams/teamA/seasons/2024-2025/data/fa_users__none").get());
  });
  it("a token with no cats claim is denied", async () => {
    await assertFails(arch(asStaffNoCats(), "cadet").get());
  });
  it("another club cannot read the archive at all", async () => {
    await assertFails(arch(asB(), "cadet").get());
  });

  it("the season doc itself is club-wide readable", async () => {
    // Just a label and a timestamp — the list page needs it.
    await assertSucceeds(asA().doc("teams/teamA/seasons/2024-2025").get());
    await assertFails(asB().doc("teams/teamA/seasons/2024-2025").get());
  });

  it("per-record archives stay club-wide, like their live counterparts", async () => {
    // Narrowing only the archived copy would be theatre: teams/{id}/rpe
    // and friends are club-wide readable too.
    await assertSucceeds(asA()
        .doc("teams/teamA/seasons/2024-2025/trainingAvail/" + A + "_2025-01-01").get());
    await assertFails(asB()
        .doc("teams/teamA/seasons/2024-2025/trainingAvail/" + A + "_2025-01-01").get());
  });

  it("archived coach notes stay STAFF-only, unlike the per-record archives", async () => {
    // The three per-record archives above are club-wide because their live
    // counterparts are. matchNotes' live counterpart is not, so archiving
    // must not declassify it.
    const an = (d) => d.doc("teams/teamA/seasons/2024-2025/matchNotes/1901");
    await assertSucceeds(an(asStaffA()).get());
    await assertSucceeds(an(asLeadA()).get());
    await assertFails(an(asA()).get());
    await assertFails(an(asB()).get());
    await assertFails(an(asStaffA()).update({pre: {text: "rewrite history"}}));
  });

  it("nobody but the superuser writes an archive", async () => {
    // archiveSeason runs with the Admin SDK and bypasses rules entirely.
    await assertFails(arch(asLeadA(), "cadet").set({v: "[]", category: "cadet"}));
    await assertFails(arch(asStaffA(), "cadet").set({v: "[]", category: "cadet"}));
    await assertFails(asLeadA().doc("teams/teamA/seasons/2024-2025").set({label: "x"}));
    await assertSucceeds(arch(asSuper(), "cadet").set({v: "[]", category: "cadet"}));
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

// ============================================================
// Tactical boards — one document per board, two ways in
// ============================================================
describe("Tactical boards", () => {
  // Staff of the OTHER club. `asB` is only a player, and the interesting
  // cross-club cases all need someone who could legitimately create a board.
  const STAFF_B = "uidStaffB";
  const asStaffB = () => db(STAFF_B, {teamId: "teamB", role: "staff", email: "sb@x.com", cats: ["cadet"]});
  const asLeadB = () => db("uidLeadB", {teamId: "teamB", role: "lead", email: "lb@x.com", cats: ["cadet"]});
  const asAnon = () => env.unauthenticatedContext().firestore();

  /** Seed a board pair past the rules, the way the backfill will. */
  async function seedBoard(id, ownerUid, clubId, extra) {
    await env.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore();
      await d.doc("tacticBoards/" + id).set(Object.assign({
        ownerUid, clubId, ownerName: "Someone", category: "cadet",
        name: "Pressió alta", tag: "Presión", formation: "4-3-3",
        boardType: "full", hasFrames: false, frameCount: 0, bytes: 900,
        schema: 1,
      }, extra || {}));
      await d.doc("tacticBoardData/" + id).set({ownerUid, clubId, v: "{}", schema: 1});
    });
  }

  const meta = (dbc, id) => dbc.doc("tacticBoards/" + id);
  const data = (dbc, id) => dbc.doc("tacticBoardData/" + id);

  const NEW_META = {
    ownerUid: STAFF_A, clubId: "teamA", ownerName: "S", category: "cadet",
    name: "Nova", tag: "", formation: "4-4-2", boardType: "full",
    hasFrames: false, frameCount: 0, bytes: 100, schema: 1,
  };

  describe("create", () => {
    it("staff creates a board in their own club, owned by themselves", async () => {
      await assertSucceeds(meta(asStaffA(), "b1").set(NEW_META));
      await assertSucceeds(data(asStaffA(), "b1")
          .set({ownerUid: STAFF_A, clubId: "teamA", v: "{}", schema: 1}));
    });

    it("a lead creates boards too — lead is a superset of staff", async () => {
      await assertSucceeds(meta(asLeadA(), "b2")
          .set(Object.assign({}, NEW_META, {ownerUid: LEAD_A})));
    });

    it("cannot plant a board in another club's library", async () => {
      await assertFails(meta(asStaffA(), "b3")
          .set(Object.assign({}, NEW_META, {clubId: "teamB"})));
      await assertFails(data(asStaffA(), "b3")
          .set({ownerUid: STAFF_A, clubId: "teamB", v: "{}", schema: 1}));
    });

    it("cannot forge another coach as the author", async () => {
      await assertFails(meta(asStaffA(), "b4")
          .set(Object.assign({}, NEW_META, {ownerUid: LEAD_A})));
    });

    it("a player cannot create a board", async () => {
      await assertFails(meta(asA(), "b5")
          .set(Object.assign({}, NEW_META, {ownerUid: A})));
    });
  });

  describe("read", () => {
    it("any member of the board's club can read it — players included", async () => {
      await seedBoard("own", STAFF_A, "teamA");
      await assertSucceeds(meta(asStaffA(), "own").get());
      await assertSucceeds(meta(asLeadA(), "own").get());
      // A player sees boards on the match and training detail pages.
      await assertSucceeds(meta(asA(), "own").get());
      await assertSucceeds(data(asA(), "own").get());
    });

    it("NO category gate — a coach scoped to juvenil reads a cadet board", async () => {
      // Deliberate divergence from teams/{id}/data. Requirement (c) is that
      // any coach of the club sees any board of the club.
      await seedBoard("cat", LEAD_A, "teamA", {category: "juvenil"});
      await assertSucceeds(meta(asStaffA(), "cat").get()); // staffA is cadet-only
    });

    it("another club cannot read it", async () => {
      await seedBoard("own", STAFF_A, "teamA");
      await assertFails(meta(asStaffB(), "own").get());
      await assertFails(data(asStaffB(), "own").get());
      await assertFails(meta(asB(), "own").get());
    });

    it("THE CREATOR KEEPS ACCESS AFTER MOVING CLUB", async () => {
      // Requirement b.2, and the case most likely to regress: the board is
      // club A's, the coach is now in club B. teamId is single-valued, so
      // without the owner arm they lose every board they ever drew.
      await seedBoard("moved", STAFF_B, "teamA");
      await assertSucceeds(meta(asStaffB(), "moved").get());
      await assertSucceeds(data(asStaffB(), "moved").get());
      // ...and club A still sees it, because the coach left but the board did not.
      await assertSucceeds(meta(asStaffA(), "moved").get());
    });

    it("a departed coach's board stays readable by their old club", async () => {
      await seedBoard("legacy", "uidGoneForever", "teamA");
      await assertSucceeds(meta(asStaffA(), "legacy").get());
      await assertSucceeds(meta(asLeadA(), "legacy").get());
    });
  });

  describe("update and delete", () => {
    it("the owner may edit", async () => {
      await seedBoard("own", STAFF_A, "teamA");
      await assertSucceeds(meta(asStaffA(), "own").update({name: "Renamed"}));
      await assertSucceeds(data(asStaffA(), "own").update({v: "{\"a\":1}"}));
    });

    it("a peer coach in the same club may NOT edit or delete", async () => {
      await seedBoard("own", STAFF_A, "teamA");
      await assertFails(meta(asLeadA(), "own").update({name: "Hijacked"}));
      await assertFails(meta(asA(), "own").update({name: "Hijacked"}));
      await assertFails(meta(asA(), "own").delete());
    });

    it("the LEAD may delete but not edit — pruning is governance, editing is authorship", async () => {
      await seedBoard("own", STAFF_A, "teamA");
      await assertFails(meta(asLeadA(), "own").update({name: "Hijacked"}));
      await assertSucceeds(meta(asLeadA(), "own").delete());
    });

    it("a lead cannot delete another club's board", async () => {
      await seedBoard("own", STAFF_A, "teamA");
      await assertFails(meta(asLeadB(), "own").delete());
    });

    it("ownerUid and clubId are immutable", async () => {
      await seedBoard("own", STAFF_A, "teamA");
      // Moving a board out of a club would be a covert delete.
      await assertFails(meta(asStaffA(), "own").update({clubId: "teamB"}));
      await assertFails(meta(asStaffA(), "own").update({ownerUid: LEAD_A}));
    });
  });

  describe("adopting an unowned board", () => {
    // The migration cannot invent an author, and a seeded template has none,
    // so both land with ownerUid ''. Without adoption they are permanently
    // read-only, since update requires the owner arm.
    it("staff of the club may claim an unowned board", async () => {
      await seedBoard("orphan", "", "teamA");
      await assertSucceeds(meta(asStaffA(), "orphan").update({ownerUid: STAFF_A}));
    });

    it("staff of ANOTHER club may not", async () => {
      await seedBoard("orphan", "", "teamA");
      await assertFails(meta(asStaffB(), "orphan").update({ownerUid: STAFF_B}));
    });

    it("adoption cannot be used to steal an OWNED board", async () => {
      await seedBoard("own", LEAD_A, "teamA");
      await assertFails(meta(asStaffA(), "own").update({ownerUid: STAFF_A}));
    });

    it("adoption cannot smuggle the board into another club", async () => {
      await seedBoard("orphan", "", "teamA");
      await assertFails(meta(asStaffA(), "orphan")
          .update({ownerUid: STAFF_A, clubId: "teamB"}));
    });

    it("a player cannot adopt", async () => {
      await seedBoard("orphan", "", "teamA");
      await assertFails(meta(asA(), "orphan").update({ownerUid: A}));
    });
  });

  describe("query satisfiability", () => {
    // A rule can be per-document correct and still leave the client unable to
    // list anything: Firestore rejects a query outright if ANY returned
    // document could be denied. This is the trap db.js:213 documents.
    beforeEach(async () => {
      await seedBoard("a1", STAFF_A, "teamA");
      await seedBoard("a2", LEAD_A, "teamA");
      await seedBoard("b1", STAFF_B, "teamB");
    });

    it("the club library query works", async () => {
      await assertSucceeds(asStaffA().collection("tacticBoards")
          .where("clubId", "==", "teamA").get());
    });

    it("the my-boards query works", async () => {
      await assertSucceeds(asStaffA().collection("tacticBoards")
          .where("ownerUid", "==", STAFF_A).get());
    });

    it("an unfiltered list is refused", async () => {
      await assertFails(asStaffA().collection("tacticBoards").get());
    });

    it("another club's library is refused", async () => {
      await assertFails(asStaffA().collection("tacticBoards")
          .where("clubId", "==", "teamB").get());
    });
  });

  describe("boardAuthors", () => {
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (c) => {
        await c.firestore().doc("clubs/teamA/boardAuthors/" + STAFF_A).set({
          name: "S", email: "s@x.com", teamLabel: "Cadet A",
          category: "cadet", categoryRank: 2, active: true,
        });
      });
    });

    it("club members read the labels", async () => {
      await assertSucceeds(asStaffA().doc("clubs/teamA/boardAuthors/" + STAFF_A).get());
      await assertSucceeds(asA().doc("clubs/teamA/boardAuthors/" + STAFF_A).get());
    });

    it("another club cannot", async () => {
      await assertFails(asStaffB().doc("clubs/teamA/boardAuthors/" + STAFF_A).get());
    });

    it("NOBODY writes them from a client — not the lead, not the subject", async () => {
      // Admin SDK only. Client-writable would let a coach relabel themselves
      // into a team they never coached.
      await assertFails(asLeadA().doc("clubs/teamA/boardAuthors/" + STAFF_A).update({teamLabel: "Amateur A"}));
      await assertFails(asStaffA().doc("clubs/teamA/boardAuthors/" + STAFF_A).update({teamLabel: "Amateur A"}));
      await assertFails(asSuper().doc("clubs/teamA/boardAuthors/" + STAFF_A).update({teamLabel: "Amateur A"}));
    });
  });

  describe("platform templates", () => {
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (c) => {
        const d = c.firestore();
        await d.doc("tacticTemplates/t1").set({name: "Rondo", category: "cadet", schema: 1});
        await d.doc("tacticTemplateData/t1").set({v: "{}", schema: 1});
      });
    });

    it("any signed-in user may browse — they are anonymous by construction", async () => {
      await assertSucceeds(asStaffA().doc("tacticTemplates/t1").get());
      await assertSucceeds(asStaffB().doc("tacticTemplates/t1").get());
      await assertSucceeds(asA().doc("tacticTemplateData/t1").get());
    });

    it("but not anonymously", async () => {
      await assertFails(asAnon().doc("tacticTemplates/t1").get());
    });

    it("only the superuser writes them", async () => {
      await assertFails(asLeadA().doc("tacticTemplates/t1").update({name: "Mine"}));
      await assertFails(asStaffA().doc("tacticTemplates/t2").set({name: "New", schema: 1}));
      await assertSucceeds(asSuper().doc("tacticTemplates/t1").update({name: "Rondo v2"}));
    });

    /* Provenance is the reason this collection exists separately: it says
       which club board a template was copied from, which is exactly what
       tacticTemplates must never say. Nobody but the superuser reads it —
       not even the lead of the club the board came from. */
    it("provenance is superuser-only, read as well as write", async () => {
      await env.withSecurityRulesDisabled(async (c) => {
        await c.firestore().doc("tacticTemplateSources/bA1")
            .set({templateId: "t1", clubId: "teamA"});
      });
      await assertFails(asLeadA().doc("tacticTemplateSources/bA1").get());
      await assertFails(asStaffA().doc("tacticTemplateSources/bA1").get());
      await assertFails(asStaffB().doc("tacticTemplateSources/bA1").set({templateId: "x"}));
      await assertSucceeds(asSuper().doc("tacticTemplateSources/bA1").get());
      await assertSucceeds(asSuper().doc("tacticTemplateSources/bA2").set({templateId: "t1"}));
    });
  });

  /* ── Push notifications ─────────────────────────────────────────────
     Writing to pushQueue SENDS a notification: onPushQueueCreate picks the
     document up and pushes it to real phones. Until v133 the rule was
     `create: if sameTeam(teamId)` — any of the club's members — and the
     consumer treated a document with no `targetPlayers` as "send to EVERY
     member of the team", taking title, body and url straight from it.
});

   So these tests are the fix's whole justification: the first one is the
   hole, and it must fail now. */
describe("pushQueue — writing here rings real phones", () => {
  const push = (extra) => Object.assign({
    targetPlayers: ["uidA"],
    title: "Convocatòria publicada",
    body: "L'Escala vs Sauleda",
    type: "convocatoria",
    status: "pending",
  }, extra || {});

  it("an ordinary player CANNOT send anything at all", async () => {
    // The hole. Before v133 this succeeded.
    await assertFails(asA().collection("teams/teamA/pushQueue").add(push()));
  });

  it("...and certainly not to the whole club", async () => {
    /* No targetPlayers is the broadcast path: the consumer read it as
       every member of the team. An arbitrary message with the club's own
       app icon, to all 77. */
    await assertFails(asA().collection("teams/teamA/pushQueue")
        .add(push({targetPlayers: null})));
  });

  it("staff can send a call-up, which is the one real use", async () => {
    await assertSucceeds(
        asStaffA().collection("teams/teamA/pushQueue").add(push()));
  });

  it("a lead can too", async () => {
    await assertSucceeds(
        asLeadA().collection("teams/teamA/pushQueue").add(push()));
  });

  it("staff of another club cannot reach this one", async () => {
    await assertFails(
        asStaffB().collection("teams/teamA/pushQueue").add(push()));
  });

  it("even staff must name their recipients", async () => {
    /* The broadcast path is closed to the CLIENT entirely, staff included.
       Club-wide sends still exist — the training and RPE reminders — but
       they are written by Cloud Functions, which bypass these rules. */
    await assertFails(asStaffA().collection("teams/teamA/pushQueue")
        .add(push({targetPlayers: []})));
    const noField = push();
    delete noField.targetPlayers;
    await assertFails(
        asStaffA().collection("teams/teamA/pushQueue").add(noField));
  });

  it("no targetRole either — it is the same broadcast by another name", async () => {
    const byRole = push({targetRole: "player"});
    delete byRole.targetPlayers;
    await assertFails(
        asStaffA().collection("teams/teamA/pushQueue").add(byRole));
  });

  it("a url is refused, because a push with a link is phishing", async () => {
    /* `url` becomes the notification's click destination. Nothing in the
       app sets one, so nothing legitimate is lost. */
    await assertFails(asStaffA().collection("teams/teamA/pushQueue")
        .add(push({url: "https://not-the-club.example/login"})));
  });

  it("the text is bounded", async () => {
    await assertFails(asStaffA().collection("teams/teamA/pushQueue")
        .add(push({title: "x".repeat(121)})));
    await assertFails(asStaffA().collection("teams/teamA/pushQueue")
        .add(push({body: "x".repeat(301)})));
    await assertFails(asStaffA().collection("teams/teamA/pushQueue")
        .add(push({title: ""})));
  });

  it("a sender cannot pre-mark a send as done", async () => {
    /* status/sentAt/tokenCount are the FUNCTION's fields. A document that
       arrives already saying "sent" is a document trying to look handled. */
    await assertFails(asStaffA().collection("teams/teamA/pushQueue")
        .add(push({status: "sent"})));
    await assertFails(asStaffA().collection("teams/teamA/pushQueue")
        .add(push({sentAt: new Date()})));
    await assertFails(asStaffA().collection("teams/teamA/pushQueue")
        .add(push({tokenCount: 99})));
  });

  it("a send cannot target a hundred and one people", async () => {
    const many = [];
    for (let i = 0; i < 101; i++) many.push("uid" + i);
    await assertFails(asStaffA().collection("teams/teamA/pushQueue")
        .add(push({targetPlayers: many})));
  });

  it("nobody reads, edits or deletes the queue", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc("teams/teamA/pushQueue/p1").set(push());
    });
    await assertFails(asStaffA().doc("teams/teamA/pushQueue/p1").get());
    await assertFails(asLeadA().doc("teams/teamA/pushQueue/p1").get());
    await assertFails(asStaffA().doc("teams/teamA/pushQueue/p1").update({title: "x"}));
    await assertFails(asStaffA().doc("teams/teamA/pushQueue/p1").delete());
  });
});
});
