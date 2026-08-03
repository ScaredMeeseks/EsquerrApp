# Firestore rules tests (club isolation)

Self-contained security-rules tests for `../firestore.rules`. They exercise the
Firestore emulator against a demo project — **no production data or credentials**.

## Run locally (Windows dev box — Java 21 + firebase-tools are installed)

```bash
cd test
npm test            # everything
npm run test:unit   # shard + router — pure Node, no emulator, no Java, ~1s
npm run test:shard  # js/shard.js routing rules only
npm run test:router # js/db.js against an in-memory Firestore
npm run test:rules  # boots the Firestore emulator and runs the rules suite
```

If `npm run test:rules` says `Could not spawn java -version`, Java is installed
but not on this shell's PATH:

```powershell
$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin;$env:PATH"
```

If `java` or `firebase` is missing on a fresh machine:

```powershell
winget install Microsoft.OpenJDK.21
npm install -g firebase-tools
```

## Or in Google Cloud Shell

```bash
cd ~/EsquerrApp/test
npm install
npm test
```

`npm test` runs `firebase emulators:exec --only firestore --project=demo-esquerrapp "mocha rules.test.js"`.

## What it covers

- **Cross-club isolation**: a member of team A cannot read/write team B's users,
  data blobs, records, or club doc.
- **Self-escalation blocked**: a player cannot set `isTeamLead`/`isAdmin` or change
  their own `teamId`; can still edit their own profile fields.
- **Staff scope**: staff may update only a member's registration fields, not membership.
- **Data-key allowlist**: players may write availability/RPE/injury keys but not
  staff-managed keys (e.g. `fa_matches`).
- **Per-record ownership**: players write only records whose id starts with their uid
  and whose `uid` field matches; staff manage all; owners can delete their own.
- **Codes & clubs**: `clubCodes`/`joinAttempts` unreadable by clients; only the lead
  updates the club.
- **Superuser** overrides across teams.

- **Roster email lists** (Phase 4): players cannot read them at all; a coach reads and
  edits only their own categories' player lists; only the lead touches staff lists.
- **Membership fields are not self-writable**: a player cannot grant themselves
  `roles`, `category`, `team`, `staffCategories` or a fake `prevCategory`.
- **Deletion**: neither staff nor the lead may delete a user document directly —
  every removal goes through the `deleteMember` function, keeping the destructive
  path in one audited place. Only the superuser may delete.

- **Sharded data documents** (Phase 5 Stage B): ids are `{key}__{category}`, so the
  player-write allowlist tests the **base** key — matching the whole id would deny
  every player write, and matching a prefix would let `fa_matches__fa_injury_notes`
  through. Cross-club isolation still holds per shard.

The rules suite requires the Firebase Emulator Suite (Java). It uses the fake
project `demo-esquerrapp`, so no credentials and no production data are involved.

## `router.test.js` — `js/db.js` end to end (`npm run test:router`)

Runs the **real** `db.js` in a `vm` context against `fake-firestore.js`, an
in-memory stand-in for the compat Firestore API. No emulator and no Java, so
it runs in about a second.

A fake rather than the emulator on purpose: the router's failure modes are
about *which* documents get written and what the shadow cache believes, not
about rules or networking — and a fake can be told "this commit fails" and
"these two writes overlap", which the emulator cannot. Every test here is a
way rows could silently disappear; most are regressions for defects a review
found after the router was first written.

- **The safety rule**: a cadet-scoped coach edits a training and the juvenil
  document is byte-unchanged. A juvenil row appearing in a cadet-scoped
  client refuses the *whole* write, not just that shard.
- **The per-document diff**: a re-render that changes nothing writes nothing.
- **The keystroke race**: two overlapping writes, the second succeeds and the
  *first* then fails — the rollback must not rewind past the one that landed.
- **Refusals**: an unparseable or wrong-shaped blob leaves every shard
  untouched (one `JSON.stringify(undefined)` used to clear all of them),
  while a genuinely empty blob still clears them.
- **Moves**: a promoted player's injury leaves one shard and lands in the
  other, in a single batch.
- **Remote changes**: merged blob rebuilt, one `firestore-sync` per key not
  per document, removed shards dropped, and a shard with an unrecognised
  category ignored rather than merged and duplicated forever.
- **Per-field merge keys**: only the changed field is written and `category`
  survives, without which the shard falls out of the scoped query.

## `shard.test.js` — the routing rules (`npm run test:shard`)

Pure unit tests for `js/shard.js`, which decides which category document every
row of every synced key belongs to. Worth testing away from Firestore because
these decisions are what keep one squad's medical records out of another
coach's app. Covers: the routing table's three shapes; the live roster and match
joins (including a promoted player's injury history re-sharding to follow him,
and a row staying put when its join stops resolving); the date-keyed training
boards, whose entries route individually because two categories can train the
same evening; merge order and the per-key sorts; and a partition→merge round
trip over a fixture for **every** key in the table — the fixture list is asserted
to match `Shard.ROUTES`, so a new key cannot be added without one.
