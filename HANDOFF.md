# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-03 (Phase 5 Stages B–D committed on `phase5-sharding`, and Stage E's wipe script written and emulator-tested; the cutover itself is all that is left)._

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI build on push; rules/functions = `./deploy.sh` in Cloud Shell. One-off scripts live in `functions/` (root npm installs are broken on Cloud Shell).
- **Production is on v43.** Stages B, C and D (v44) plus the Stage E wipe script are committed on branch **`phase5-sharding`** — **not pushed, not merged, not deployed.** Working tree clean.
- **Start tomorrow by reading "Stage E — the cutover" below.** It is a runbook; follow it in order. Every artifact it needs now exists — step 0 is done.
- **Tests run on this Windows box.** `cd test && npm test` runs everything; `npm run test:unit` is the fast path (shard + router, pure Node, ~1s, no emulator and no Java), `npm run test:rules` needs the Firestore emulator and `npm run test:functions` needs Firestore + Functions, both against the fake project `demo-esquerrapp`. **143 passing: 42 unit + 87 rules + 14 functions.** If a suite says `Could not spawn java -version`, Java is installed but off this shell's PATH:
  `$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin;$env:PATH"`

### ⚠️ Nothing is deployable until the wipe runs

Client and functions now both address `data/{key}__{category}`, and **no shard documents exist yet** — Stage E's wipe creates the clean slate. Merging this branch to `main` on its own would put a frontend live that reads documents nobody writes. The branch is deliberately unpushed for that reason; pushing it is step 1 of the runbook, not a separate decision.

### Clubs in production (verified 2026-08-02)

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, only `amateur` enabled (A: 2 players, B: 11). 14 users; the only "staff" is the lead himself.
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona, lead `test@test.com`, `juvenil` enabled. Test club.
- **3 users still carry `teamId: 'default'`** with no matching `clubs/default` doc. Already stranded (`navigate()` sends `default` to the join-club screen) and, since Phase 4, unable to rejoin — the gate refuses an address on no roster list. Identify them before someone reports being locked out.

## Phase 5 — split club data per category

Full plan: `~/.claude/plans/working-on-the-esquerrapp-ticklish-beaver.md`. Category scoping used to be **cosmetic**: every data type was one club-wide blob, and rules cannot read inside a JSON string, so a cadet coach was merely *not shown* juvenil's data — medical records included. Stage C made it real.

**Authorised scope decision:** current team data is pre-season test content and **disposable**. At cutover, trainings, matches, injuries, availability, RPE, call-ups and tactics get **wiped**; user accounts, club config and roster email lists are **kept**. That removed dual-writing, the migration script and the legacy-retirement stage outright.

### ✅ Stage A — done (v40–v43, deployed)

Players carry a `cats` claim; tactic boards stamped with a category (injuries deliberately not — history must follow the player); three dead keys dropped; `fa_training` and `fa_tactic_saved` addressed by stable id; in-app update check (`APP_VERSION` vs `clubs/{id}.minAppVersion`).

### ✅ Stage B — done (v44, committed on `phase5-sharding`)

The router. Full detail in CONTEXT.md; the shape of it:

- **New `js/shard.js`** — the routing table and pure partition/merge, no browser globals, `module.exports`ed for Node tests. 17 keys, 3 shapes, 5 ways of finding a category: on the row (6 keys), a uid joined through `fa_users` (4), a matchId joined through `fa_matches` (5), plus the date-keyed training boards whose entries carry their own stamp.
- **`js/db.js` rewritten** around a shadow cache (key → category → JSON string), a per-document diff, a deterministic merge order, and **one `db.batch()` per blob** so a row moving between categories cannot be deleted from its old shard while the add to the new one fails.
- **A review pass found seven write-path defects, all fixed** (detail in CONTEXT.md): rollback is now compare-and-swap (overlapping keystroke writes were rewinding the cache); an unparseable or wrong-shaped blob is refused instead of clearing every shard of the key; shards with an unrecognised category are ignored rather than merged-then-duplicated; the `hasPendingWrites` skip was losing other coaches' merged fields; `flush()` now detaches the listeners; the dead `_uploadAll` is gone.
- **Joins resolve live, never stamped** — a promoted player's injury history re-shards to follow him. When a join stops resolving (player deleted, match erased) the row stays in the shard it came from rather than falling into `__none`.
- **Load order changed**: `utils.js` → `shard.js` → `db.js` → `push.js` → `app.js`. `utils.js` was also missing from the service worker's `STATIC_ASSETS`; added with `shard.js`.
- **Rules**: the player-write allowlist now tests `baseKey(key)` (`key.split('__')[0]`). Reads deliberately unchanged.

**`_scope` is the READ scope, not the UI's category filter** — the assert means "never write a shard you did not download", and a coach browsing one category still holds every category the listener fetched. `SCOPED_READS` names the switch that ties the query and the assert to one list; Stage C turned it on.

### ✅ Stage C — done (v44, committed on `phase5-sharding`)

`SCOPED_READS` is on: the `data/` `.get()` and `onSnapshot` run `where('category','in', scope)`, and the same list is the router's write assert. The read rule gains `resource.data.category in request.auth.token.cats`, with `none` readable club-wide. All six `DB.init` sites pass `getVisibleCategories()` explicitly and `init()` throws if the scope is unknown.

**Settled empirically, and worth knowing**: Firestore *does* accept a collection query whose `in` filter is a dynamic list from a custom claim. Five tests pin it down — the scoped query is accepted, an unfiltered read is rejected, and a query naming a category outside the claim is rejected. Had it gone the other way the rule would have needed redesigning, not patching.

A document with **no** `category` field is now unreadable by everyone but the superuser — deliberate and tested. It is what a function that forgets to stamp the field produces, and going dark is the safe direction.

### ✅ Stage D — done (v44, committed on `phase5-sharding`)

Two helpers carry it: `readDataShards()` (one collection read, grouped by base key) and `mergeArrayShards()`. The three schedulers merge across shards; `deleteMember` scrubs every shard via `scrubShards`; `onClubLeadChanged` and `archiveSeason` likewise, with the injury carry-over done per shard so an open injury stays in its own category. `updateTeamDates` **unions** across shards, and `backfill-team-dates.js` — the repair tool for that exact failure — is sharded too.

**New trigger `onMemberCategoryChanged`** moves a member's roster-joined rows when their category changes. It watches `users/{uid}` rather than hooking each writer, so `onRosterWritten`, `setRole` and the client's re-assign flow are all covered.

✅ **Stage D is tested now.** `npm run test:functions` boots the Firestore **and Functions** emulators and drives the real triggers by writing documents: `reshardMember` (rows collected from every shard including `__none`, landing exactly once; `category` preserved; merge- and blob-format sources both emptied; `uid_date` keys moved without touching neighbours; same-category write a no-op; move back; unassign → `__none`) and `updateTeamDates` (unions across shards). `test/wipe.test.js` covers the cutover script the same way.

⚠️ **One production change came out of writing those tests**: `functions/index.js` now imports `FieldValue` from `firebase-admin/firestore` instead of using `admin.firestore.FieldValue`. Inside the Functions emulator that property is undefined — firebase-tools stubs firebase-admin and returns `firestore` *bound*, which drops its statics — so every `delete()`/`serverTimestamp()` threw there while working in production. Same sentinels, 13 call sites, no behaviour change; **but it is a functions change, so step 2 of the runbook is not optional.**

### ⬜ Stage E — the cutover (RUNBOOK — follow in order)

Everything else is done. This is one maintenance window: announce a short outage, work through the steps, and do not stop half way.

**Why the order matters.** Two rule changes are in flight and they have opposite constraints:

- The **write** change (`baseKey(key)` in the player allowlist) must go out **BEFORE** the new frontend. Composite ids like `fa_injury_notes__cadet` fail the old exact-match allowlist, so until it lands every *player* write is denied. It is backward compatible — `baseKey('fa_injury_notes')` is `'fa_injury_notes'` — so old clients keep working.
- The **read** narrowing must go out **AFTER** the new frontend. Firestore rejects a collection query outright if any document it could return might be denied, so narrowing the rule before the query narrows kills sync for every scoped user at once.

They cannot ship together. Step 1 deploys the file with the read narrowing temporarily backed out; step 7 puts it back.

---

**Step 0 — ✅ done: `functions/wipe-team-data.js`** (written and emulator-tested, 2026-08-03).

- Deletes `teams/{id}/data/*` (sharded **and** pre-Phase-5 un-sharded docs), `trainingAvail`, `matchAvail`, `rpe`, and the spent `pushQueue`; clears `trainingDates`/`matchDates` so no reminder fires for a wiped session before step 5 rebuilds them.
- Keeps `users/*` (+ `tokens/*`), `clubs/*` with `rosters/*`, `clubCodes/*`, `joinAttempts/*`, the `teams/{id}` documents, and `seasons/**` unless `--include-seasons` is passed.
- Dry run by default with a full per-document inventory; `--apply` to act; `--team <id>` to rehearse on the F.C.Barcelona test club first.
- **`fa_users` goes with the rest, deliberately** — `DB.init()` reconciles the kept `users/` collection back into the blob on the next login, so the member list rebuilds itself from the accounts.

**Step 1 — rules, write change only.** Temporarily replace the `match /data/{key}` read line in `firestore.rules` with the permissive one, commit on the branch, push, then in Cloud Shell:

```
# firestore.rules — TEMPORARY for this step only:
#   allow read: if sameTeam(teamId) || isSuperUser();
# (leave the baseKey write allowlist exactly as committed)
cd ~/EsquerrApp && git fetch && git checkout phase5-sharding && ./deploy.sh rules
```

**Step 2 — deploy the functions**, still from the branch:

```
cd ~/EsquerrApp && ./deploy.sh functions
```

**Step 3 — wipe.** Read the dry run in full before applying. Rehearsing on the test club first is free.

```
cd ~/EsquerrApp && node functions/wipe-team-data.js                            # dry run, all clubs
cd ~/EsquerrApp && node functions/wipe-team-data.js --apply --team lly4GkUxIpBkSgZvzldT   # test club only
cd ~/EsquerrApp && node functions/wipe-team-data.js --apply                    # everything
```

**Step 4 — frontend.** Merge to `main` and push; GitHub Pages deploys and CI builds the APK.

```
git checkout main && git merge phase5-sharding && git push
```

**Step 5 — rebuild the denormalized dates.** Until this runs the schedulers see no teams and send nothing.

```
cd ~/EsquerrApp && node functions/backfill-team-dates.js
```

**Step 6 — verify.** See the checklist below. Do not skip the first item.

**Step 7 — rules, read narrowing.** Restore the committed read rule (undo step 1's temporary edit), push, and deploy:

```
cd ~/EsquerrApp && git pull && ./deploy.sh rules
```

**Step 8 — APK.** Install the new build on the test phones. Old builds address documents nobody writes and will show an empty app; that is what the v43 version check exists to warn about. Set `clubs/{id}.minAppVersion` to 44 once the APK is out.

### Verification (step 6) — first item is not optional

- **The safety rule.** As a coach scoped to one category, edit a training. Then confirm with the Admin SDK that another category's shard is **byte-unchanged**. This is the property the entire phase exists for; `test/router.test.js` proves it against a fake, this proves it against production.
- **`reshardMember`** — move a player between categories and confirm the rows left one shard and arrived in the other **exactly once**. Covered by `npm run test:functions` against the emulator, so this is confirmation rather than the only evidence — but it is still the riskiest path in the functions and production is where it matters.
- **Per key** — create one record of each type, confirm it lands in the right shard with a `category` field, and confirm a coach in another category cannot read it.
- **Schedulers** — confirm a training reminder still finds its team, i.e. that `updateTeamDates` unioned across shards rather than replacing.
- **Two devices, two categories, editing at once** — the clobber case that motivated the phase.

### If it goes wrong

- **Reminders go quiet** → `node functions/backfill-team-dates.js` rebuilds `trainingDates`/`matchDates` from all shards. That is its whole purpose.
- **Everyone's app is empty after step 7** → the read narrowing is the suspect; redeploy the permissive read line from step 1 and investigate before retrying.
- **Players see save errors** → the write allowlist did not land; check step 1 actually deployed (read the `=== Deploying to '...'` header).
- **Rolling back the frontend** is `git revert` on `main` and a push. The wipe is **not** reversible — the pre-wipe data is disposable test content by prior decision, but take a Firestore export to `gs://esquerrapp-backup` first if you want the option.

### Deliberately not done in this phase

- **The three per-record collections (`trainingAvail`, `matchAvail`, `rpe`) are still club-wide readable.** The plan has them gaining a `category` field, but no stage owned it and the sensitive data — medical — lives in `data/fa_injuries`, which is scoped. Doing it means stamping six `ackSaveRecord` sites, narrowing three listeners and three rules, and it strands a moved player's records the same way the joined `data/` routes did (so it needs `reshardMember` extending too). An incremental privacy improvement, not a blocker.
- Linked match/training tactic board copies are still matched by **name**; once sharded the same name can exist in two categories. Pre-existing, untouched.

## Known trade-offs / notes

- A shard document written without a `category` field would be invisible to the Stage C query. Everything the router writes sets it; the Cloud Functions must too (Stage D).
- Whole-blob writers that filter must carry out-of-scope entries through explicitly (matchday drafts and notifications already do). Any new page that filters and then saves must do the same, or it deletes what it isn't showing.
- Linked match/training tactic board copies are still matched by **name**. Once sharded, the same name can exist in two categories — a pre-existing weakness, untouched.
- The lead and superuser always bypass the registration gate, so a new club can be bootstrapped with empty lists.
- **Distribution: keep APK assets bundled.** Pointing the shell at a live URL (`server.url`) would end staleness instantly but is a reliable App Store rejection (guideline 4.2), and Play + App Store are on the roadmap. The store-friendly path is bundled assets plus an OTA bundle swap; the v43 version check is the stepping stone to either.
- Legacy availability/RPE `data/` docs remain **frozen but not deleted** — the 3b rollback net. `migrate-player-data.js --delete-legacy` still deliberately unrun.
- Still outstanding elsewhere: Firebase Hosting migration (real cache-control), multi-club membership (`teamId` is single-valued, so one account cannot be in two clubs), deleting `fa_users` in favour of the `users` collection, read-time fitness derivation.
- Uncategorised players are excluded by medical and roster but included by training-detail — three staff pages, two semantics. Belongs with Phase 5.
- Cloud Shell gotchas: `.firebaserc` is tracked — never `rm` it; scripts run from the **repo root** (`cd ~/EsquerrApp` first — a script run from `~` fails with MODULE_NOT_FOUND); read every dry-run before `--apply`; backup bucket is `gs://esquerrapp-backup` (singular). If the Admin SDK throws `Cannot create property 'refresh_token' on string ''`, the gcloud session has lapsed — `gcloud auth login`.
- This machine mojibakes Catalan accents through PowerShell `Set-Content` — use the editor for all file writes.

## Lessons that keep repeating

- **Silent-write failures.** A control appears to work, the local blob updates, the server write is rejected or never made. Hit three times in Phase 4. The Stage B shadow-cache rollback exists for exactly this shape: a cache claiming content the server does not have would make the next write diff against it and skip.
- **Read one-off scripts before running them.** `backfill-claims.js` predated Phase 4 and would have stripped every user's `cats` claim.
- **Measure layout bugs; do not reason about them.** The bottom-of-page strip took four attempts, two reasoned from the stylesheet and both wrong.
