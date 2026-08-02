# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-03 (Phase 4 + follow-ups DEPLOYED; Phase 5 Stage A done, Stage B next)._

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI build on push; rules/functions = `./deploy.sh` in Cloud Shell. One-off scripts live in `functions/` (root npm installs are broken on Cloud Shell).
- **Production is on v43**, everything merged to `main`. Rules and functions deployed through Phase 5 Stage A part 1; **v41–v43 are frontend-only and need no deploy.**
- **Rules tests now run on this Windows box** — Java 21 and firebase-tools are installed. `cd test && npm test` → 67 passing, against the fake project `demo-esquerrapp`. No Cloud Shell round-trip for rules work any more.

### Clubs in production (verified 2026-08-02)

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, only `amateur` enabled (A: 2 players, B: 11). 14 users; the only "staff" is the lead himself.
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona, lead `test@test.com`, `juvenil` enabled. Test club.
- **3 users still carry `teamId: 'default'`** with no matching `clubs/default` doc. Already stranded (`navigate()` sends `default` to the join-club screen) and, since Phase 4, unable to rejoin — the gate refuses an address on no roster list. Identify them before someone reports being locked out.

## What shipped this session (v23 → v43)

**Phase 4 — roster-driven membership.** The lead decides who is staff (email lists per `{category}-{letter}` in "Configura el teu club"); staff decide who plays (Registrations). Registration is a **hard gate** against those lists; a listed address gets its role, category and team server-side and skips the role picker. Staff see only their own categories.

Then, in order: the two deletes (leave-the-squad vs. erase-the-person), lead handover, the lead getting user management, the Registrations rework around pre-registration, re-assigning unassigned players, and Phase 5 Stage A. Full detail per version in CONTEXT.md.

**Bugs found and fixed along the way that were not in any plan** — worth knowing the pattern:

- **Silent-write failures, three times.** A control appears to work, the local blob updates, the server write is rejected or never made. Hit on the Registrations role dropdown, the availability writes, and the user-management role toggles (which never called `setRole` at all). If a control seems to work but nothing downstream changes, suspect this first.
- **The stale-roster gap.** `db.js`'s reconcile only ever **adds** missing members to `fa_users`; it never refreshes an existing one. Any server-side change to a member is invisible on other devices until something rewrites the blob. Patched at two call sites; the real fix belongs in Phase 5.
- **`backfill-claims.js` would have wiped every `cats` claim.** It predated Phase 4 and still wrote only `{teamId, role}`. Rewritten. **Read one-off scripts before running them** — they rot silently.
- The season window (`getMonth() >= 7` but a 15 August start date) emptied every season-scoped view for the first fortnight of August, in seven places.
- The bottom-of-page strip took four attempts: two were reasoned from the stylesheet and both wrong. It was fixed only after measuring the actual boxes. **Measure layout bugs; do not reason about them.**

## Phase 5 — split club data per category

Full plan: `~/.claude/plans/working-on-the-esquerrapp-ticklish-beaver.md`. Category scoping is **cosmetic** today: every data type is one club-wide blob, rules cannot read inside a JSON string, so a cadet coach is merely *not shown* juvenil's data — medical records included.

**Authorised scope decision:** current team data is pre-season test content and **disposable**. At cutover, trainings, matches, injuries, availability, RPE, call-ups and tactics get **wiped**; user accounts, club config and roster email lists are **kept**. That removed dual-writing, the migration script and the legacy-retirement stage outright, and made splitting all 16 keys at once cheaper than a medical-only slice.

Exploration corrected the earlier sketch: there are **20** keys not 19, only **5** carry a category (not 8), and three are dead.

### ✅ Stage A — done (v40–v43)

Groundwork only; nothing is split yet, and every piece is independently useful.

1. **Players carry a `cats` claim** (their own category). It was `[]`, which would make every per-category rule fail closed against the whole player base. Fixed in `claimsFor` **and** `setRole` — they compute it independently.
2. **Tactic boards stamped with a category.** Saved boards and training boards only: a saved board is attached to nothing, and the training-board map is keyed by **date**, which two categories can share. Match boards join live through the match.
   **Injuries are deliberately NOT stamped** — injury history follows the player, so the shard must come from a live join to their *current* category. A frozen stamp would strand a promoted player's history with his old coach.
3. **Three dead keys dropped** (`fa_standings`, `fa_news`, `fa_player_stats`).
4. **`fa_training` and `fa_tactic_saved` addressed by stable id**, not array position. Both would become silent corruption once a remote change can reorder a merged array.
5. **In-app update check** — `APP_VERSION` vs `clubs/{id}.minAppVersion`, soft dismissable banner. `check-deploy.js` asserts `APP_VERSION` matches `sw.js`.

### ⬜ Stage B — next: the `db.js` router

The `setItem` patch maps one key to one document. It needs: a **router** partitioning a blob by category on write, writing only shards whose content changed; a **shadow cache** of parsed shards (a merged blob cannot be rebuilt from one `docChange`); a **deterministic merge order**; and per-key routing (5 direct, uid-keyed maps join through the roster, matchId-keyed join through `fa_matches`).

**The safety rule is the whole risk of this phase:** never write a shard whose input the client could not see. Every writer parses the whole blob and writes it back, so a coach who can only *see* cadet would otherwise silently delete every other category's rows. The router holds the visible-category set and asserts before every write.

### ⬜ Stages C–E

- **C — reads then rules, in that order.** The two whole-collection reads (`collection('data').get()` at init and the collection `onSnapshot`) must become `where('category','in', visible)` **before** the rules narrow. Firestore rejects a collection query outright if any document could be denied, so the wrong order kills sync for every scoped user at once.
- **D — functions.** Every hardcoded `data/fa_x` becomes a loop over shards: three schedulers, `archiveSeason`, `deleteMember`'s eleven scrub sites, `onClubLeadChanged`. **`updateTeamDates` is the dangerous one** — it replaces `trainingDates` wholesale and the push schedulers query it, so with shards racing, reminders die silently for every category but the last writer. It must union.
- **E — cutover.** Guarded wipe script (dry-run first) → deploy functions + frontend → verify → narrow the rules → fresh APK.

## Known trade-offs / notes

- **Category scoping is still cosmetic until Stage C lands.** Only the roster email lists are genuinely restricted today.
- Whole-blob writers that filter must carry out-of-scope entries through explicitly (matchday drafts and notifications already do). Any new page that filters and then saves must do the same, or it deletes what it isn't showing.
- The lead and superuser always bypass the registration gate, so a new club can be bootstrapped with empty lists.
- **Distribution: keep APK assets bundled.** Pointing the shell at a live URL (`server.url`) would end staleness instantly but is a reliable App Store rejection (guideline 4.2), and Play + App Store are on the roadmap. The store-friendly path is bundled assets plus an OTA bundle swap; the v43 version check is the stepping stone to either.
- Legacy availability/RPE `data/` docs remain **frozen but not deleted** — the 3b rollback net. `migrate-player-data.js --delete-legacy` still deliberately unrun.
- Still outstanding elsewhere: Firebase Hosting migration (real cache-control), multi-club membership (`teamId` is single-valued, so one account cannot be in two clubs), deleting `fa_users` in favour of the `users` collection, read-time fitness derivation.
- Uncategorised players are excluded by medical and roster but included by training-detail — three staff pages, two semantics. Belongs with Phase 5.
- Cloud Shell gotchas: `.firebaserc` is tracked — never `rm` it; scripts run from the **repo root** (`cd ~/EsquerrApp` first — a script run from `~` fails with MODULE_NOT_FOUND); read every dry-run before `--apply`; backup bucket is `gs://esquerrapp-backup` (singular). If the Admin SDK throws `Cannot create property 'refresh_token' on string ''`, the gcloud session has lapsed — `gcloud auth login`.
- This machine mojibakes Catalan accents through PowerShell `Set-Content` — use the editor for all file writes.
