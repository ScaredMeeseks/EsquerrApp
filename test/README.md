# Firestore rules tests (club isolation)

Self-contained security-rules tests for `../firestore.rules`. They exercise the
Firestore emulator against a demo project — **no production data or credentials**.

## Run locally (Windows dev box — Java 21 + firebase-tools are installed)

```bash
cd test
npm test          # boots the Firestore emulator and runs the suite
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

Requires the Firebase Emulator Suite (Java). Uses the fake project
`demo-esquerrapp`, so no credentials and no production data are involved.
