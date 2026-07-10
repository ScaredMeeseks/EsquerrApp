# Firestore rules tests (club isolation)

Self-contained security-rules tests for `../firestore.rules`. They exercise the
Firestore emulator against a demo project — **no production data or credentials**.

## Run in Google Cloud Shell (has Java + firebase-tools)

```bash
cd ~/EsquerrApp/test
npm install
npm test          # boots the Firestore emulator and runs the suite
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

Won't run locally on the dev Windows box (no Java). Requires the emulator.
