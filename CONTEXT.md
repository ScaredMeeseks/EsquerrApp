# CONTEXT.md — EsquerrApp living architecture doc

_Updated after every code change. Newest changelog entries at the bottom._

## Snapshot (2026-07-07, before the overhaul)

Football club management PWA for L'Esquerra de l'Eixample FC, designed to become multi-club. Vanilla JS SPA (`js/app.js` ~14,900 lines), Firebase (Auth/Firestore/Storage/FCM/Functions v2), GitHub Pages frontend, Capacitor Android wrapper, CI APK build on push.

### Data flow
localStorage is the primary synchronous store. `js/db.js` monkey-patches `localStorage.setItem/removeItem` and mirrors ~22 `SYNCED_KEYS` into `teams/{teamId}/data/{key}` docs — blob format `{v:"<json>"}` except `MERGE_KEYS` (training/match availability, staff override) which use per-field merges. `DB.init(teamId)` downloads Firestore→localStorage on login and starts one `onSnapshot` per key; remote changes dispatch `firestore-sync` → debounced full-page re-render.

### Known problems driving the 3-phase overhaul (plan: `~/.claude/plans/i-have-another-project-inherited-castle.md`)
1. **Attendance loss**: fire-and-forget writes (no ack/feedback), `fa_player_rpe` & side-effect blobs (`fa_users`, `fa_staff_notifications`) are last-write-wins whole-blob replaces, `seedMockAvailability()` injects RANDOM answers into real clubs (local `fa_seeded` flag never clears), admin "reset data" mirrors demo data into the live club, multi-tab disables offline write queuing silently.
2. **Club isolation broken**: `clubs` docs (incl. join `code`) world-readable; `users` self-update unrestricted (self-assign `teamId`/`isTeamLead`); players can write/delete ANY `data/{key}`; `archiveSeason` trusts self-reported doc flags; `storage.rules` not wired into firebase.json; profilePics writable by anyone.
3. **Scalability**: blob-per-key docs (1MB limit looming), 22 listeners + full-page re-render per remote change, schedulers full-scan all teams hourly with sequential per-user reads, `www/` (3MB) committed but CI-generated, Esquerra's FCF leagues hardcoded as every club's default. Live bug: `scheduledTrainingReminder` reads `.v` on merge-format availability docs → treats everyone as unanswered.

### Overhaul plan summary
- **Phase 1 (this effort)**: remove seed system; acked player writes with pending/confirmed/queued UI; extend MERGE_KEYS (rpe, injury notes/zone); `joinClub` callable + secret `clubCodes/`; rules rewrite (team-scoped reads, field-level user updates, player write allowlist); storage rules wired+fixed; scheduler dual-format fix; cleanup-seed extended to RPE.
- **Phase 2**: per-record collections (`trainingAvail/{uid}_{date}`, `matchAvail`, `rpe`, `injuries`, `notifications`) with ownership-by-docId rules; Auth custom claims (`teamId`, `role`) via joinClub v2/setRole/backfill; dual-write + server bridge for old clients; migration script.
- **Phase 3** (gated on old-client extinction): retire dual-write/legacy blobs; 1 collection listener + targeted re-render; schedulers query `nextTrainingDate` denormalized fields + collectionGroup tokens; gitignore www/; remove hardcoded FCF defaults; CI CACHE_NAME guard.

## Changelog

### 2026-07-07 — Part A: workspace + workflow setup
- Added `.firebaserc` (esquerrapp), `.gitattributes` (LF normalization), guarded `deploy.sh` (Cloud Shell rules/functions deploys with repo/project asserts), `CLAUDE.md`, this file, `HANDOFF.md`.
- `firebase.json`: wired `storage.rules` (existed but was never deployed).

### 2026-07-10 — Phase 1: attendance reliability + security hotfix (branch `phase1-reliability-security`)

**1. Demo/seed system removed entirely** (`js/app.js`): `seedData`/`seedDemoPlayers`/`seedPlayerResponses`/`seedMockAvailability` deleted, along with the boot call, the staff-training-detail `fa_seeded` invocation (the source of RANDOM fabricated availability in the real club), the admin "reset data" button+handler (`localStorage.clear()`+reseed mirrored demo data into the live club), and all seed-flag references. Orphaned i18n keys (`settings.reset_*`, `confirm.erase_all`) left in place, harmless.

**2. Acknowledged player writes**:
- `js/db.js`: `fa_player_rpe`, `fa_injury_notes`, `fa_injury_zone` added to `MERGE_KEYS` (flat `{uid}_...` keys → per-field merges; existing legacy-blob migration converts docs on next client load). New `DB.setItemAcked(key,val)` returns the Firestore SERVER-ack promise. All silent `.catch(console.error)` now dispatch a `db-write-error` window event via `_onWriteError`.
- `js/app.js`: new `ackSave(key, value, el)` helper — localStorage write is instant, tapped control shows `save-pending` spinner → `save-confirmed` (green ring) on server ack, or `save-queued` (amber ring) after 4s timeout with a Catalan warning toast when offline/persistence-failed; `db-write-error` listener shows error/permission toasts (reuses `_showPushToast`). Converted ALL player submit paths: training availability (3 handlers + injured path via `commitInjuryNote`), match availability (set/unset), RPE (actions page + extra training), injury note/zone. Page re-render now happens AFTER ack/queue resolution, so the indicator is visible and the UI never claims success early. New i18n keys `save.*` (ca/es/en); CSS states appended to `css/style.css`.
- `js/firebase-config.js`: `enablePersistence` failure sets `window._persistenceFailed` (multi-tab = offline writes NOT queued → ackSave warns loudly).
- Clobber reducers: `deriveFitnessStatus` only rewrites `fa_users` when status/note actually changed; `pruneOldRpe` gated to once/day/device (`fa_last_rpe_prune`, local-only).

**3. Server-side club membership** (`joinClub` callable, `functions/index.js`): validates code format, per-uid rate limit (10/h via `joinAttempts/{uid}`), looks up `clubCodes/{CODE}` → `{clubId}` (new server-only collection), writes `users/{uid}.teamId/isTeamLead` server-side, returns club public config. Client (`js/app.js`): `handleJoinClub` + register flow call the function (register: auth account → joinClub → THEN profile doc create, so failed codes leave no orphan); lead auto-match-by-email queries REMOVED everywhere (leads join with the code; function detects them via `leadEmail`); `getClubByCode` deleted; `createClub` writes `clubCodes/{code}` and no longer stores `code` on the club doc; `_loadClubList` reads codes from `clubCodes` (superuser-only); `setSession` strips server-owned fields (`teamId`/`isTeamLead`/`isAdmin`) from every profile merge. `index.html`: added `firebase-functions-compat.js`. One-time migration `functions/setup-club-codes.js` moves existing codes.

**4. `firestore.rules` rewritten**: `users` reads team-scoped (list queries MUST filter `where('teamId','==',…)`); self-create without `teamId/isTeamLead/isAdmin`; self-update may not CHANGE those three (roles self-selection kept — onboarding design, tightens in Phase 2); staff-of-team updates limited to `[roles, position, playerNumber, team, category, fitnessStatus, injuryNote]` (exactly what the registrations page writes); `data/{key}` writes staff-only except a player-key allowlist (availability/RPE/injuries/fa_users/fa_staff_notifications — the last two still needed by player flows until Phase 2); `clubs` readable by own members only; `clubCodes` superuser-only; `joinAttempts` functions-only. `js/db.js` reconcile now queries `users` with `where('teamId','==',teamId)` (was a FULL collection scan of all clubs' users).

**5. `storage.rules`**: profilePics writes now owner-only (`{uid}.{ext}` filename enforced against auth uid; was: any authed user could overwrite anyone's photo).

**6. Scheduler dual-format fix** (`functions/index.js`): new `parseDataDoc()` reads data docs in blob OR per-field format; applied to availability/RPE reads in all three schedulers (fixes live bug: merge-format docs read via `.v` made every player look unanswered → reminder spam). Server `MERGE_KEYS` synced with client (adds rpe/injury notes/zone) so `archiveSeason` resets those docs per-field.

**7. `functions/cleanup-seed.js` rewritten**: dry-run by default (`--apply` to delete), dual-format reads, covers `fa_player_rpe` (uid-in-roster + real date/matchId; `extra_` entries kept if uid real), demo uids 100001–100006 excluded from the "real" roster, and **fixes a latent bug**: match ids are numbers in `fa_matches` but strings in availability keys — the old `Set.has()` comparison never matched, so the old script would have deleted ALL legitimate match availability. Everything normalized to strings now.

**8. `sw.js`**: `CACHE_NAME` → `esquerrapp-v18`.

**Deploy order (critical)**: functions → `setup-club-codes.js` → `cleanup-seed.js` dry-run/apply → rules → frontend push → APK. Rules before functions would break joins; frontend before functions would break joins for new-JS users.

### 2026-07-10 — Phase 2: per-record player data + custom claims (branch `phase2-records-claims`)

**Data model**: player-submitted data is now CANONICAL in per-record subcollections — `teams/{id}/trainingAvail/{uid}_{date}` (`{uid, date, value, updatedAt, source}`), `teams/{id}/matchAvail/{uid}_{matchId}`, `teams/{id}/rpe/{legacy key verbatim}` (`{uid, rpe, minutes, ua, tag, date, …}`). Doc IDs = the legacy blob keys, so rules enforce ownership by ID prefix and migration is an identity map. `source` ∈ `client|bridge|migration`.

**Dual-write + bridge (old-client compatibility until Phase 3)**:
- New clients: `ackSaveRecord()`/`ackRemoveRecord()` in app.js write the legacy localStorage blob (mirrored to the legacy merge doc by the monkey-patch — old clients keep seeing new answers) AND the canonical record via `DB.submit()`/`DB.removeRecord()`; the Phase-1 ack UI (pending/confirmed/queued) now tracks the RECORD write. All 8 player write sites converted (training avail ×3 + injured path, match avail set/unset, RPE actions + extra, un-answer paths).
- Old clients: `bridgeLegacyPlayerData` Firestore trigger (functions/index.js) diffs every write to the 3 legacy keys and upserts/deletes record docs (`source:'bridge'`). Loop-safe: value-identical rebuilds don't re-dispatch.
- db.js: record-collection `onSnapshot` listeners rebuild the localStorage blobs (read paths unchanged); guard skips rebuild when the collection is empty but the blob isn't (pre-migration safety). Legacy doc listeners removed for those 3 keys.

**Custom claims `{teamId, role: lead|staff|player}`**:
- `joinClub` v2 sets claims + stamps `users/{uid}.claimsUpdatedAt`; new callable `setRole({uid, roles[]})` — self (player/staff, current onboarding design), lead-of-team, or superuser; keeps doc roles + claims in sync. `archiveSeason` authorizes via claims (users-doc fallback) and now archives+clears the record collections BEFORE resetting blobs (bridge would otherwise delete records pre-archive).
- Client: token force-refresh after join/register; `claimsUpdatedAt` snapshot watcher refreshes the token and re-inits DB if the teamId claim changes (e.g. setRole by lead — no re-login needed); `persistSessionRoles` (onboarding pick) and registrations `autoSaveFromRow` route roles through `setRole`.
- `functions/backfill-claims.js`: one-time claims stamp for existing users (NOTE: the real club's teamId is literally `default`).
- `functions/migrate-player-data.js`: blob→records; `create()` ignoring ALREADY_EXISTS (idempotent, never clobbers dual-written records); `--apply`/`--verify` modes; legacy docs left in place.

**Rules (HYBRID — claims first, `me()` doc fallback for pre-refresh tokens; fallback removed in Phase 3)**: no deploy-wait needed. Per-record collections: read same-team; create/update owner-only (`docId` prefix + `uid` field match) or staff; delete owner/staff. Legacy `data/{key}` player allowlist unchanged (transitional). `users` self-update also blocks `claimsUpdatedAt`; roles self-changes still allowed transitionally (old clients write them directly). Seasons wildcard covers record archives. Storage rules unchanged (lead badge upload isn't a feature yet).

**Deviations from the approved plan (deliberate scope cuts, moved to Phase 3)**: injuries records (`fa_injuries` array is staff-dominated; notes/zone already merge-safe) and the notifications collection (informational; blob kept). `deriveFitnessStatus` keeps the Phase-1 write-on-change behavior instead of full read-time derivation.

**`sw.js`**: `CACHE_NAME` → `esquerrapp-v19`.

**Deploy order (critical)**: functions (bridge starts materializing records) → `backfill-claims.js` → `migrate-player-data.js` dry→apply→verify → rules → frontend merge+push (records need rules BEFORE new JS) → APK. No wait needed between backfill and rules thanks to the hybrid fallback.

**Phase 2 deploy incidents (2026-07-10, all resolved)**: the first pass deployed only functions (backfill/migrate/rules/frontend skipped) — caught by `functions/check-deploy.js`; Phase 1's `cleanup-seed --apply` had also been skipped AND had a silent no-op bug on blob-format docs (`FieldValue.delete()` on `{v}` docs does nothing) so the fabricated data got migrated into the record collections — fixed cleanup to rewrite the `v` blob (bridge then pruned the fake records automatically) and re-ran the whole sequence. `check-deploy.js` now guards every deploy.

### 2026-07-10 — Phase 3a: performance + housekeeping (branch `phase3-performance`)

Phase 3 is split: **3a (this)** = everything not gated on old clients; **3b (later, gated on `bridgeLegacyPlayerData` invocations ≈ 0)** = retire dual-write/legacy player blobs/rules fallback + transitional allowlist, injuries records, notifications collection.

- **db.js**: ONE `onSnapshot` on the whole `data/` collection using `docChanges()` (was one listener per key). Total listeners per client now ~5 (data + 3 record collections + own user doc), down from 22+.
- **app.js targeted re-render**: `KEY_PAGES` map gates the `firestore-sync` full-page re-render to pages that actually display the changed key; unmapped keys (e.g. `fa_users`) still re-render everywhere; badges (`updateActionsBadge`, `updateStaffNotifBadge`) refresh on every sync event. Debounce + edit-page skip-list kept.
- **FCF**: removed the hardcoded Esquerra league defaults — clubs without `fcfLinks` config show a setup hint to leads (nothing to players). `fcfClassificacio` proxy allowlist tightened to a full-path regex.
- **Schedulers rewritten** (functions/index.js): new `updateTeamDates` trigger denormalizes `trainingDates[]`/`matchDates[]` onto team docs from the fa_training/fa_matches blobs; all three schedulers now query `array-contains`(-any) on those instead of full team scans, read availability/RPE from the **record collections**, query the roster once per team (was per-match), fan out with `Promise.all`, and log one summary line per team (was per-user/session). `getTokensForUsers` parallelized. **`functions/backfill-team-dates.js` MUST run right after deploying — until then schedulers see no teams.**
- **Housekeeping**: `www/` untracked + gitignored (CI rsyncs it fresh every build); CI guard step fails the build when `js/`/`css/`/`index.html` change without an `sw.js` bump (checkout fetch-depth: 2); `check-deploy.js` expects the current cache version (single `CURRENT` constant).
- **`sw.js`**: `CACHE_NAME` → `esquerrapp-v20`.

**Deploy order**: functions → `backfill-team-dates.js` (immediately!) → frontend merge+push. No rules changes in 3a.

### 2026-07-11 — Automated verification (audit + rules tests)

Spawned two subagents (Sonnet: rules tests; Opus: adversarial audit) — both hit the shared session limit early, so the work was done inline instead.

- **Adversarial audit** of the full overhaul diff: verified setRole can't escalate to lead (claim role derives from the target's existing `isTeamLead`; requested roles constrained to player/staff), matchId is consistently stringified across bridge/migration/scheduler, the claims watcher no-ops on the first snapshot (no refresh storm; guards pending serverTimestamp), archiveSeason archives record collections BEFORE the blob reset, KEY_PAGES falls back to re-render-everywhere for unmapped keys, and `removeItem` only touches local-only `fa_tactic_*` keys (never synced docs).
- **Bug found + fixed** (js/db.js): the record-listener empty-guard (`if (snap.empty && existing !== '{}') return`) also fired when the LAST record in a collection was deleted on another device, leaving a stale entry in that device's blob (e.g. a coach still seeing a withdrawn availability). Now tracks a per-collection "seen populated" flag so only the genuine pre-migration first-load is guarded; real "all deleted" snapshots clear the blob. Frontend → **v21**, deployed.
- **Rules test suite** (`test/`): self-contained `@firebase/rules-unit-testing` covering cross-club isolation, self-escalation, staff scope, data-key allowlist, per-record ownership, club-code secrecy, superuser overrides. Can't run on the dev Windows box (no Java); run in Cloud Shell: `cd ~/EsquerrApp/test && npm install && npm test`.

### 2026-07-19 — Phase 3b: legacy retirement (branch `phase3b-legacy-retirement`)

**Scope note**: implemented WITHOUT the manual UX pass (user time constraint). Risk contained by: bridge-extinction Cloud Logging check is step 1 of the deploy (abort if old APKs still write); legacy blob docs NOT deleted (`--delete-legacy` exists but deliberately not run — full rollback = redeploy previous functions/rules + revert frontend). The deferred 3b tail (injuries per-record collection, notifications collection, read-time fitness derivation, staff-role self-selection tightening) is new-feature work needing its own testing — **still pending**.

- **js/db.js**: `fa_training_availability`/`fa_match_availability`/`fa_player_rpe` removed from `SYNCED_KEYS`+`MERGE_KEYS` — their localStorage blobs are now local-only read caches rebuilt from record snapshots; the monkey-patch no longer mirrors them to `data/` docs (dual-write half gone). Legacy docs are never loaded at init; instead `init()` awaits the FIRST snapshot of each record collection (cache or server, error-safe) so the first render still sees availability/RPE. Record-cache keys flushed on team switch + `flush()`. Data-listener `RECORD_LS_KEYS` skip removed (redundant now).
- **js/app.js**: `ackSaveRecord`/`ackRemoveRecord` unchanged in behavior (their blob write is now local-only) — comments updated. `pruneOldRpe` rewritten: deletes >1yr `rpe` RECORD docs via `DB.removeRecord` (players only own-uid records, staff everything) instead of rewriting the blob — the old blob-prune would have been resurrected by every record snapshot.
- **firestore.rules**: claims-only auth — `me()` users-doc fallback DELETED from `sameTeam`/`isStaffOf`/`isLeadOf` (claims backfilled 2026-07-10, tokens refresh hourly; no live session can lack them). `data/{key}` player allowlist shrunk: the 3 record-backed keys removed (frozen legacy docs now staff-only); `fa_injury_notes`/`fa_injury_zone`/`fa_injuries`/`fa_users`/`fa_staff_notifications` remain until the deferred items land.
- **functions/index.js**: `bridgeLegacyPlayerData` + `BRIDGE_KEYS` DELETED (deploy prompts to confirm the function deletion — answer yes). archiveSeason unchanged (server `MERGE_KEYS` intentionally still lists the frozen merge docs — it describes doc FORMAT for resets, now a superset of client MERGE_KEYS).
- **functions/migrate-player-data.js**: new `--delete-legacy` mode (dry-run by default, `--apply` to act; per-doc guard refuses deletion while records < blob entries). NOT run this phase.
- **functions/check-deploy.js**: bridge check INVERTED (legacy write must produce NO record within 30s); migration-count mismatches downgraded to warnings (frozen blob legitimately diverges once un-answers/pruning delete records); expects **v22**.
- **test/rules.test.js**: legacy-availability player write flipped to DENIED (+ RPE), staff-still-can case added, new "claims-only" suite proving doc-only membership (no claims) is denied everywhere the `me()` fallback used to allow.
- **sw.js**: `CACHE_NAME` → `esquerrapp-v22`.

**Deploy order (critical)**: bridge-extinction logging check (GATE — abort if invocations) → backup → functions (confirm bridge deletion) → `migrate-player-data.js` final reconcile `--apply` + `--verify` → rules → frontend merge+push → `check-deploy.js`. Rules before the reconcile would be harmless (players stopped writing legacy docs when v21 clients dual-wrote records anyway), but keep the order — the reconcile snapshots whatever the last legacy writes were.

### 2026-08-02 — Phase 4: roster-driven membership + category-scoped staff

Closes the "lead-controlled staff-role tightening" item that has been on the deferred list since 3b, and answers the two questions it left open: there was nowhere to say who the staff are, and nowhere to say who the players are. Membership now comes from per-team email lists that the lead and staff maintain; registration is a **hard gate** against them, and staff see only their own categories.

**Data model** — new subcollection `clubs/{clubId}/rosters/{category}-{letter}` (same key shape as `fcfLinks`/`schedules`) holding `{staffEmails[], playerEmails[], updatedAt}`. Deliberately NOT on the club doc: that is readable by every member and these are addresses, often of minors. New server-owned `users/{uid}.staffCategories[]` and a third custom claim **`cats`** alongside `{teamId, role}`.

- **firestore.rules**: new nested `match /rosters/{teamKey}` (subcollections do not inherit the parent match). Read = superuser | lead | staff whose `cats` claim contains `teamKey.split('-')[0]`; staff writes restricted to `playerEmails` in their own categories, with `create` and `update` as separate rules because `resource` is null on create. `users` self-update and self-create now also block **`roles`, `category`, `team`, `staffCategories`** — leaving them open made the gate bypassable from the console — and `roles` is out of the staff allowlist (it only moves through `setRole`).
- **functions/index.js**: `loadRosters`/`membershipFrom`/`resolveMembership`/`claimsFor` helpers. **`joinClub`** refuses any address on no list (lead + superuser bypass, or a new club could never bootstrap) and writes `roles`/`category`/`team`/`staffCategories` + the `cats` claim server-side, returning them so the client skips the role screen. **`setRole`**: a SELF call can no longer choose its own roles — they are re-derived from the lists (this was a straight path to staff); `cats` is never caller-supplied. New **`onRosterWritten`** trigger (`clubs/{clubId}/rosters/{teamKey}`) diffs per-address membership *signatures* (so an address moved between the two lists is caught too) and re-applies claims to already-registered members — that is what makes a grant or a revoke land live.
- **js/app.js — lead UI**: fourth section in "Configura el teu club" (`_refreshTeamSetupStaff`, `_buildStaffEmailRow`, `_collectStaffEmailsFromDom`), one block per team, reusing the `.ts-training-list` repeatable-row pattern. Unlike the FCF/schedule sections it re-renders from the DOM first, so toggling a letter does not wipe half-typed addresses. Saved as separate roster writes, only for lists that actually changed.
- **js/app.js — staff UI**: `renderPreRegisteredPlayers` card on Registrations, scoped to the selected category, showing per address whether it has been claimed. `savePlayerEmailList` is awaited and toasts on failure.
- **js/app.js — scoping**: `canSeeAllCategories()` → **`getVisibleCategories()`** (lead/admin: all enabled; staff: intersection with `staffCategories`; player: own). `getCurrentCategory()` clamps a stale `_viewCategory`, the cat-bar click handler clamps again, and staff with no categories get an `error.no_categories` empty state instead of blank pages. Roster docs are fetched **by id, never as a collection query** (one denied doc fails the whole query).
- **Pages that never filtered, now do**: medical (+`medical-detail` drill-down guard, + added to `CATEGORY_PAGES`), matchday **draft** rows, notifications (new `uid`/`category` on each entry; historic ones with neither stay visible to all). `tactics` REMOVED from `CATEGORY_PAGES` — its boards have no category, so the bar implied a filter that did nothing. Uncategorised players no longer leak into every squad list (`manage-roster`); they still show on Registrations, which is where they get assigned.

**Three pre-existing bugs fixed because the feature depends on them:**
1. **Silent `setRole` rejection** — a non-lead staff member changing a role got `permission-denied` swallowed into `console.warn` while `fa_users` kept the new value, so the roster displayed a role that did not exist. Now awaited, reverted and toasted; the status dropdown is lead-only (dead path for anyone else).
2. **`renderStaffTraining` index misalignment** — rows were numbered off the *filtered* list but `readTraining()`/remove index into the full `fa_training` blob, on every keystroke. Rarely bit before because staff usually had no filter; with scoping they always do. Rows now carry their index into the full array.
3. **`handleRegister` overwriting the server** — it merged `roles:[]`, `category:''`, `team:''` straight over what `joinClub` had just derived. `setSession` stripped only `teamId/isAdmin/isTeamLead`; it now strips the membership fields too.

Also: whole-blob writes that the new filtering would have turned into data loss are now merge-aware — matchday draft save/remove/add and notification mark-read/clear-all all carry the out-of-scope entries through instead of writing only what is on screen. Fixed `cat + '_' + letter` → `cat + '-' + letter` in the matchday add-row handler (schedules are hyphen-keyed, so home-game defaults never resolved). Staff self-selection removed from the role screen.

**New**: `functions/prefill-rosters.js` (dry-run + `--apply`) seeds the lists from current members and reports anyone it cannot place. `check-deploy.js` gains a `[1b/5]` roster check (everyone listed, staff have categories, `cats` claim matches the doc) and expects **v23**. `test/rules.test.js` gains a roster suite + membership-field self-write denials; the pre-existing "self-create with roles" case flipped to denied.

**Deploy order (critical)**: `prefill-rosters.js` dry-run → fix every UNPLACEABLE (they are locked out otherwise) → `--apply` → `./deploy.sh` (rules + functions) → bump/push frontend → fresh APK → `check-deploy.js`. Rules and functions MUST precede the frontend, or the new UI writes into a ruleset that rejects it.

### 2026-08-02b — "+ Entrenament" could create a session in the past (v24)

Reported straight after the Phase 4 deploy, unrelated to it. `addTraining()` seeds from the latest existing training and steps forward to the next configured weekday. With the club's last session back in May, that stepped to the next Tue/Thu **in May** — right weekday, months in the past. The no-history branch already seeded from yesterday so its result was always in the future; the has-history branch had no such floor.

- `js/app.js` `addTraining()`: the seed is now `max(lastDate, yesterday-noon)`, so an old last session falls back to the from-today search while a current one still cycles on from itself exactly as before. Noon anchoring kept, since `toISOString()` would otherwise shift the date across the UTC offset.
- `lastDate` is now scoped to the **current category** (leniently — undated/uncategorised legacy rows still count, matching how the list filters). The slots it pairs with come from that category's schedule, so taking the last date from a different category was inconsistent.
- Removed a leftover `console.log` that dumped the whole club schedule on every click.

`sw.js` → `esquerrapp-v24`, and `check-deploy.js`'s `CURRENT` bumped to match.

**check-deploy fix (same day)**: `[1b/5]` treated "no roster docs" as a hard failure. That is wrong for a club whose only member is its lead — prefill correctly writes nothing there, and the F.C.Barcelona test club tripped it on the first real run. The check now counts non-lead members first: no members and no docs is a `⚠` note (registration stays closed until the lead adds addresses, which is the design), members but no docs is still a `✘`. Unlisted members were already reported individually, so nothing is lost by dropping the early bail.

### 2026-08-02c — Medical: season window, counter reconciliation, team filter (v25)

Reported symptom: Medical showed **0 Lesions actives** while "Estat físic de l'equip" on the same screen showed Lesionats (1) and Recuperant-se (2).

**Root cause — the season window was in the future.** `getMonth() >= 7` rolled the season over on **1 August** but `seasonStart` was **15 August**, so for the first fortnight of every August every season-scoped view filtered out everything. This was copy-pasted in **seven** places, so it was not only Medical: player stats (×3), the staff roster, the injury migration and `getSeasonWeek()` were all silently empty or, in the case of `getSeasonWeek('2026-08-02')`, returning **week −1**.

- **`js/utils.js`**: new `seasonStartStr(when)` — the most recent 15 August on or before the date. `getSeasonWeek()` now uses it. All six inline copies in `js/app.js` replaced with a call.

**Two further reasons the counters could disagree, both fixed:**
1. The active/recovering lists were season-filtered, so an unresolved injury that started before 15 August was hidden forever while still marking its player injured. The window now applies to **history only** (season total, average recovery, past injuries, analytics); `activeInj`/`recoveringInj` come from all in-scope injuries.
2. A player whose availability answers make him injured/doubt with **no record in `fa_injuries`** counted in the tiles but could never appear in the list. Those now render as dashed "Reportada pel jugador" cards after the real records, with a button that opens the existing logger preselected on that player (`.med-btn-log-for` → `showStaffInjuryLogger(uid)`). Verified the two always reconcile now, including under the team filter.

Also: the squad-grid card fell back to the derived note when there is no logged record, so a red border never appears with no explanation.

**Team-letter filter on Medical** (asked for): `medicalTeamFilter`, single-select All/A/B/C reusing the roster page's `.roster-team-filter` markup and styles, in the squad-fitness card header because it scopes the whole page. Hidden when the category has one team. Injuries are filtered through the in-scope player map, since a record carries no team of its own. **The injury filter's `!curCat ||` short-circuit had to go** — it let the whole club's injuries through whenever "Totes" was selected, which would have made the new filter a no-op for the lead. All three letter filters (medical, roster, training-detail) now reset when the category changes.

Also scoped `showStaffInjuryLogger`'s player dropdown to the visible squad — it listed every player in the club regardless of category or team.

`sw.js` → `esquerrapp-v25`, `check-deploy.js` `CURRENT` to match. Frontend-only; no rules or functions change.

**Still inconsistent, deliberately not fixed here**: uncategorised players are excluded by medical and roster but included by training-detail. Belongs with the Phase 5 data split.

### 2026-08-02d — Medical: discard a self-report, and stop reserving 3 position slots (v26)

- **Discard (`✕`) on the self-reported cards.** New `fa_injury_dismissed` key — a flat `{uid: 'YYYY-MM-DD'}` map holding the date of the latest answer that staff discarded. `deriveFitnessStatus` maps an `'injured'` answer dated on or before that to a plain `'no'`, so it drives neither the injured nor the doubt rule. **Deliberately not implemented by rewriting the player's availability answer**: attendance history stays intact, and if he reports himself injured again on a LATER date the flag comes back by itself. The free-text `fa_injury_notes` entry is dropped at the same time so it doesn't linger elsewhere. Added to `SYNCED_KEYS` **and** `MERGE_KEYS` in db.js (flat per-uid map — merge-safe, no clobbering) and to the live-resync page map. No rules change needed: `data/{key}` writes are already staff-only unless the key is on the player allowlist, and only staff ever write this one; players read it, which `sameTeam` already permits.
- **Position circles no longer reserve three slots in medical cards.** The shared `.conv-pos-circles` is `width:68px; justify-content:flex-end` so columns line up in list views; inside `.med-card-top` / `.med-inj-player` there is no column to align to, so a one-position player wasted ~45px and pushed the name into an ellipsis. Overridden to `width:auto; justify-content:flex-start` for those two containers only — the list views keep their alignment. `.med-card-name` also gained `min-width:0` so the ellipsis works inside the flex row.

`sw.js` → `esquerrapp-v26`, `check-deploy.js` `CURRENT` to match. Frontend-only.

**Old-client note**: `fa_injury_dismissed` is unknown to v25-and-earlier clients (and old APKs), which will not sync it and will keep showing a discarded player as injured until they update. Degrades gracefully — nothing breaks, the flag just persists on stale clients.

### 2026-08-02e — Two different deletes: leave the squad vs. erase the person (v27)

The two "delete" buttons ran **byte-for-byte identical code** — filter the person out of the local `fa_users` blob and save. Neither touched Firestore, Auth, records or roster lists, so both were no-ops that `DB.init()`'s reconcile undid at the next login. The Registrations modal claimed to remove "this player and all his data"; both halves were false.

**Registrations → "Treure de l'equip" (detach, keep everything).** The case is a player moving up a category. The button now takes their address off that team's `playerEmails` and clears `category`/`team`; club membership, availability, RPE, injuries and stats are untouched. When the next coach adds the same address, `onRosterWritten` re-assigns them and everything is simply there. Shown only for someone actually in a squad, and — because the rules put `staffEmails` out of a coach's reach — only the lead sees it for a staff member.

- **`onRosterWritten` / `setRole`**: a member on no list but still holding a `teamId` now keeps `roles: ['player']` and has `category`/`team` cleared. Previously they got `roles: []`, which dropped them on the role-selection screen — and `setRole` re-derives a self-call's roles from the same lists, so picking "player" handed back `[]` and looped **forever**. Unlisted means unassigned, not expelled. `teamId` is deliberately never touched: only `joinClub` writes it, so clearing it would leave re-adding their email unable to bring them back.
- `onRosterWritten` also switched from `set({merge:true})` to `update()`: a merge-set **recreates** a deleted doc, and `deleteMember` strips roster entries before deleting the person, so the trigger could resurrect a zombie `users/{uid}`.

**Gestió d'usuaris → erase (superadmin only).** New **`deleteMember`** callable. It has to be server-side: the FCM token subcollection is owner-only in the rules (and deleting a user doc does not delete subcollections), `joinAttempts` is unreachable from any client, the Auth account needs the Admin SDK, and `storage.rules` could not express a working delete. Erases the Auth account, `users/{uid}`, tokens, `joinAttempts`, every `trainingAvail`/`matchAvail`/`rpe` record (queried on the `uid` field, not the doc-id prefix), the person's entries in every shared blob and per-uid map (including the frozen legacy availability/RPE docs), their addresses on every roster list, and `profilePics/{uid}.*` — listed by prefix, since the extension is whatever they uploaded. Roster removal runs **first** so a partial failure cannot leave them able to re-register; the user doc goes **last** so the reconcile cannot resurrect them.

- **Archived seasons are deliberately left intact** so past squads and statistics still add up. An erase covers the live club, not the history books.
- **Match events keep the name.** Before the uid is blanked, the person's name is snapshotted onto every event they appear in (scorer, assister, sub in/out). New shared `resolveEventName(id, snapName, number, users)` resolves live member → snapshot → shirt number; `getEventPlayerName` and the inline assist/substitution lookups all route through it. Without this a 3-1 would quietly become a 2-1. Trade-off recorded: their **name survives on the scoresheet**.
- Typed confirmation (name must be typed), modelled on the new-season dialog, with a result toast reporting how many records went.

**Also**: `storage.rules` split `write` into `create, update` + `delete`. The old single rule inspected `request.resource.size`, which is null on a delete, so **nobody could ever delete a profile picture** — not even its owner; changing your photo to a different extension stranded the old file forever. `showModal` gained optional `{confirmLabel, danger}` (its buttons were hard-coded "No" / "Yes, remove") and now uses translated labels. Defined `common.edit`, `common.player_not_found` and `matches.no_past`, which were referenced but never defined and rendered as raw key text.

Rules suite: **65 passing** (5 new: staff may clear category/team but not delete; neither staff nor lead may delete a member; superuser may).

`sw.js` → `esquerrapp-v27`, `check-deploy.js` to match. **Deploy needs functions + storage rules**, then the frontend.

### 2026-08-02f — The team lead picks their own roles (v28)

Phase 4 removed the "Staff" card from the role screen so nobody could self-promote. That was right for players and wrong for the lead: `joinClub` writes `roles` from the roster lists, a lead's own address is normally on no list, so a **freshly created lead got `roles: []`** → role screen → only "Player" available → `roles: ['player']` → **no staff pages at all**. The person meant to run the club could configure it but not manage anyone in it. Server-side they were fine (the rules already treat `role == 'lead'` as staff); it was purely the client roles array. Only bit a brand-new lead, so the existing club never saw it.

Running the club, playing for it and coaching in it are three separate things, so **"lead" is now a role in its own right** and any combination is valid.

- **`rolesFor(isLead, chosen)`** in functions/index.js: the single place the roles array is built. Always appends `"lead"` when `isTeamLead`, so a lead's roles are never empty — an empty array is what strands someone on the role screen.
- **`setRole`** now accepts `"lead"` in the payload (the screen sends back what it was given) but **strips and re-derives it** from `target.isTeamLead` — never grantable by a caller, same stance as `cats`. A lead calling about themselves already passed the `isLeadOfTeam` check, so they *do* choose their own player/staff, unlike everyone else.
- **`joinClub` deliberately does NOT use `rolesFor`** — a fresh lead must get `[]` so `navigate()` sends them to the picker once. Their `lead` role is added when they confirm, and from then on their roles are never empty again.
- **`onRosterWritten`** merges rather than overwrites for a lead: an unrelated list edit would otherwise silently strip whatever they picked.
- **Role screen**: the lead gets the multi-select (previously superadmin-only) plus a non-interactive "Responsable del club" card showing the role as granted, and may confirm with **both toggles off** = "I only run the club". Everyone else still must pick something.
- **Page gating**: new `fallbackPage()` — staff → registrations, player → player-home, lead/admin → settings. The old fallback was a hard-coded `player-home`, which a lead-only does not have. `renderSidebar` already lands them on their first available page.

Verified by simulating the full lifecycle: picker shown exactly once, all four combinations stick, and no path returns to it — including a detached player and a later roster edit.

`sw.js` → `esquerrapp-v28`, `check-deploy.js` to match. Rules suite: 65 passing. **Needs a functions deploy.**

### 2026-08-02g — Changing a club's team lead (v29)

`leadEmail` was written once, by `createClub`, and `isTeamLead` on a user was written once, by `joinClub`. Nothing read `leadEmail` afterwards, so editing it (which the rules already allow) **half-applied**: the club doc named one person while the app still treated the old one as lead, recoverable only by deleting and re-registering the account.

**`onClubLeadChanged`** — a trigger on `clubs/{clubId}` that returns immediately unless `leadEmail` actually changed (every other club edit lands there too). A trigger rather than a callable, so the club doc and the user records cannot drift apart whatever route the change arrives by.

- **Incoming lead already a member**: keeps whatever they were — a coach who takes over is still a coach — and gains `lead`. No role picker, since their roles are already non-empty. As lead they see all categories regardless of their staff lists.
- **Incoming lead not registered**: nothing to do. `joinClub` matches on `leadEmail`, and the membership gate already lets a lead through without a roster entry, so they become lead when they sign up with the code. They also **skip "Configura el teu club"** automatically — that screen is gated on *no category being enabled*, so it only ever appears for a genuinely new club.
- **Outgoing lead**: access is recomputed from the roster lists. On a staff list → stays a coach for those categories; on a player list → stays a player. **On no list → they leave the club entirely** (`teamId` deleted, claims cleared, dropped from the `fa_users` blob) — running it was their only reason to be there. Their records stay keyed by uid, so adding them to a list later restores everything.

**Superadmin UI**: a 👤 button per row in Gestió de Clubs. It looks the address up *before* writing and reports which case you are in — "already a member (staff), keeps those roles" or "no member with that address, check it is not a typo". Guards: malformed address refused, unchanged address refused, unregistered address allowed but warned. **Cross-club is deliberately not blocked** (someone may manage one club while playing for another) — but see the limitation below.

**Known limitation, not addressed here**: `users/{uid}.teamId` is a single value, so one account cannot belong to two clubs. Leaving the cross-club guard open lets you *set* such an address, but that person would still need a separate account per club. Real multi-club membership is a data-model change, adjacent to the Phase 5 work.

`sw.js` → `esquerrapp-v29`, `check-deploy.js` to match. Rules suite: 65 passing. **Needs a functions deploy.**

**v30 (same day)**: the change-lead UI became an inline **textbox per club row** in Gestió de Clubs rather than an icon opening a modal — the modal was too hidden to find. Same guards, now as inline feedback under the field as you type; Enter or 💾 saves. `showChangeLeadModal` and two orphaned i18n keys removed.

### 2026-08-02h — The team lead gets the user-management page (v31)

Permanent deletion was superadmin-only, so every removal in every club queued behind one person. Each lead now manages their own club's members.

- **Sidebar / router**: the users page is added to the Team Lead section and the `ADMIN_PAGES` guard admits `isTeamLead`. No extra scoping needed — the page reads this club's `fa_users`, so it can only ever show the caller's own members.
- **`deleteMember` authorization**: superuser **or** a lead whose `teamId` claim matches the *target's* club. Taken from the token, never the request. Three refusals: self (already there), the superuser's own account, and anyone outside the caller's club — which also covers a clubless user, deletable by the superuser only. Verified against a nine-case matrix including a staff member attempting it.
- **Rules unchanged**: direct client deletion of `users/{uid}` stays superuser-only and every lead deletion goes through the function, keeping the destructive path in one audited place. The existing test asserting "the lead CANNOT delete a member either" now documents that deliberately.

**Removed the Player/Staff toggle buttons** from that page. They only ever rewrote the local `fa_users` blob and never called `setRole`, so the badge flipped, the blob synced, and `users/{uid}.roles` — and the person's real permissions — did not. Third instance of that silent-write shape this session. Not repaired but removed: roles are list-driven now (staff in "Configura el teu club", players in Registrations), and a manually-toggled staff member would get no categories and land on the empty-state screen anyway. Roles are read-only on the page now, `lead` included in the badges; `users.toggle_desc` replaced with `users.delete_desc`. Delete is also hidden for the superadmin row.

`sw.js` → `esquerrapp-v31`, `check-deploy.js` to match. Rules suite: 65 passing. **Needs a functions deploy.**

### 2026-08-02i — Post-deploy fixes from the first real test pass (v32)

- **Users table lines misaligned.** `.user-actions` was `display:flex` **on a `<td>`**, which takes the cell out of the table layout. The admin row has no Delete button, so its empty cell collapsed to a different height and drew its bottom border out of line. Now a plain table cell (the flex was only there for the two role toggles, which are gone).
- **Registration flashed the login screen** before profile setup, and a **rejected registration showed no error at all** — the applicant just landed back on login. Same cause: `onAuthStateChanged` ends in an unconditional `navigate()`. Creating the Auth account fires it before `joinClub` has run and the profile doc exists (→ login flash), and on rejection the rolled-back `cred.user.delete()` fires it again, switching away from the register view and taking the error message with it. New **`_authFlowBusy`** flag: while a login/register handler is mid-flight it owns navigation and the listener returns early. Both handlers now clear it on every path and explicitly re-show their own view with the message on failure — so the "your address is on no roster list" rejection is finally readable, which is the whole point of that message.
- **Registrations split into two cards**: *Membres assignats* (in a squad, category-filtered as before) and *Sense equip assignat* (in the club, in no squad — name and email only). Uncategorised members used to be mixed into every category view; they now have their own place, which is also where someone lands after "Treure de l'equip".
- **The ✕ on the pre-registered card and "Treure de l'equip" now do the same thing.** Both took the address off the list, but only the button cleared the assignment locally, so the ✕ left the page showing a stale squad until `onRosterWritten` came back. Extracted `detachMemberByEmail(email)`, used by both.

`sw.js` → `esquerrapp-v32`, `check-deploy.js` to match. Frontend-only — **no deploy needed**.

### 2026-08-02j — Registrations reworked around pre-registration (v33)

Pre-registering meant editing a list of email rows, one block per team, each with a badge and a ✕ — and the person you had just invited was invisible in the members table until they signed up. Two half-views of the same thing.

- **Pre-registration is now one form**: an address, a team-letter select, and Add (Enter works too). No rows, no badges, no ✕. `addPreRegisteredPlayer` refuses a malformed address, one already on **any** list in the club, and one already held by an assigned member — a duplicate would show as two rows for one person and put them on two teams.
- **The members table is now the single view of the squad**: registered members **plus** unclaimed pre-registered addresses, so an invited player is visible from the moment you add them. That union is what makes the dot meaningful — every row in a members-only table is registered by definition.
- **Green/orange dot** next to the name (`regDot()`), with a CSS hover tooltip rather than a native `title` so it appears instantly. Pending rows are tinted and have no user document, so Estat/Categoria/Equip are static text and Posició/Dorsal are absent; `autoSaveFromRow` already no-ops on them since it keys off `data-uid`.
- **Email column** added to both cards.
- **Estat** lost the "Cap" option and is now a dropdown **only on staff rows** (Jugador/Staff/Ambdós, lead-only as before). A player's status follows from being on a player list; promotion to staff goes through the staff email lists. The lead's own row shows a static "Responsable" label — with "Cap" gone there was no sensible option for someone whose only role is running the club. `autoSaveFromRow` now preserves the server-derived `lead` role instead of dropping it locally until the server restores it.
- **Removal**: pending rows get the same "Treure de l'equip" button, handled by `removePreRegisteredPlayer` (list entry only — there is no user doc). Registered members keep `.btn-remove-reg` → `detachMemberByEmail`. One control, one meaning.
- Deleted `savePlayerEmailList` and `buildPlayerEmailRow`: the old blur handler read a whole team's list back out of the DOM on every keystroke-blur; the two new functions write only the address that changed. Orphaned keys `reg.pre_claimed` and `reg.all_members` removed.

`sw.js` → `esquerrapp-v33`, `check-deploy.js` to match. Rules suite: 65 passing. Frontend-only — **no deploy needed**.

### 2026-08-02k — Re-assigning an unassigned player (v34)

There was no way back: "Treure de l'equip" moved someone to the Unassigned card and left them there, with the only route back being to type their address into a team list by hand.

- **`prevCategory` / `prevTeam`** now record the squad someone was taken out of — detaching used to clear `category`/`team` outright, so the information was simply gone. Written by both detach paths (`detachMemberByEmail` client-side, `onRosterWritten` server-side). Added to the staff allowlist in `firestore.rules` and to the self-write blocklist: staff-owned like the assignment itself, or a player could invent a history.
- **Unassigned card** gains an *Equip anterior* column and, on the right, a category select + letter select + **Assignar**. The letter dropdown follows the category. It defaults to where they came from when that category is still available — overwhelmingly the likely destination.
- **`assignMemberToTeam(uid, category, letter)`** adds the address to that team's player list (the gate that actually decides membership) and mirrors `category`/`team` locally so the row moves to the assigned table at once instead of waiting for `onRosterWritten`. Skips the roster write if the address is already listed.
- **The category dropdown offers only `getVisibleCategories()`** — the rules scope `playerEmails` edits to a coach's own categories, so offering the whole club would just produce a permission error for anyone but the lead. Decided deliberately over widening the rules, which would have undone the Phase 4 category scoping. A coach with no categories sees the `error.no_categories` message instead of dead controls.
- Works for members who never had a squad too (registered before the lists existed): *Equip anterior* shows a dash and the controls behave the same.

Rules suite: **67 passing** (2 new: staff may record a previous team; a player may not fake their own). `sw.js` → `esquerrapp-v34`. **Needs a rules + functions deploy** — first one since v32.

### 2026-08-02l — Fix: an assigned player displayed as "Responsable del club" (v35)

Reported straight after v34: a re-assigned test player showed up with the lead's label. Two faults, both mine, compounding.

1. **The label test was a superset.** `isLeadOnly = !roles.includes('player') && !isStaffRow` is also true of anyone whose roles array is **empty**, so a role-less member rendered as *Responsable del club*. Now tests the lead role explicitly (`roles.includes('lead') || u.isTeamLead`); empty roles fall through to the plain status label, which reads "Cap" — wrong-looking, but honestly wrong rather than misleading.
2. **Stale local roles.** `onRosterWritten` correctly gave him `player` server-side when his address went onto the list, but `db.js`'s reconcile only ever **adds** missing members to the `fa_users` blob and never refreshes an existing one, so the stale empty array kept rendering. `assignMemberToTeam` now mirrors the `player` role locally, matching what the server just did.

Verified against a seven-case label matrix (plain player, empty roles, lead-only, lead who plays, lead who coaches, plain staff, both).

**The underlying reconcile gap is unchanged and still bites elsewhere**: any server-side change to an existing member's fields is invisible to other devices' `fa_users` blob until something rewrites it. Worth folding into the Phase 5 data split rather than patching per-caller.

`sw.js` → `esquerrapp-v35`. Frontend-only — **no deploy needed**.

### 2026-08-02m — Deleted member reappeared as "pending"; bare strip at page foot (v36)

- **A fully deleted member came straight back in Miembros asignados as a pending row.** `deleteMember` strips their address from the roster docs server-side, but the client renders from the cached `_clubConfig.rosters`, which still held it — so the person vanished from `fa_users` and immediately reappeared with an orange dot, looking like the delete half-failed. The success path now strips the address from the cached lists too. (Same class as the stale-`fa_users` bug in v35: a server-side change with no local mirror.)
- **The unstyled strip at the bottom of the page** was `.dashboard-layout { min-height: calc(100vh - 50px) }` — a hard-coded guess at the navbar height. `.topnav` has no fixed height (it is padding around a logo image), so whenever it rendered taller than 50px the layout fell short and bare body background showed underneath, across the full width including below the sidebar. Removed the calc: `.view` is a 100vh flex column and `.dashboard-layout` already has `flex: 1`, which fills the remainder exactly whatever the bar measures.

`sw.js` → `esquerrapp-v36`. Frontend-only — **no deploy needed** (the v34 rules + functions deploy is still outstanding).

### 2026-08-02n — Click a club crest to replace it (v37)

Superadmin, in Gestió de Clubs: the crest in each row is now clickable and opens a file picker. Uploads to `clubBadges/{clubId}.{ext}` (same path `createClub` uses), writes the URL back with `updateClub`, and refreshes the table. Clubs with no crest show a dashed `+` placeholder in its place.

`storage.rules` already restricted `clubBadges` writes to the superuser, under 5 MB, image content-type — **no rules change needed**; the client checks mirror those three so the failure is a readable toast rather than a raw storage error. When the crest belongs to the user's *own* club the cached splash badge (`_splash_badge`, base64) is dropped, or the old one keeps showing on next load.

Known and accepted: uploading a different file extension leaves the previous file orphaned in the bucket. Clients can't list `clubBadges`, so tidying it would need the Admin SDK; not worth a function for a handful of clubs.

**The bottom strip is NOT fixed** — v36's `min-height: calc(100vh - 50px)` removal was the wrong diagnosis (it was a real latent bug, but not this one). Still reproduces on every page. Awaiting a console probe of which element exceeds `documentElement.clientWidth` before guessing again.

`sw.js` → `esquerrapp-v37`. Frontend-only.

### 2026-08-02o — The bottom strip, properly diagnosed (v38)

Two wrong guesses (v36's navbar-height calc, then a suspected horizontal scrollbar) before measuring. The numbers settled it — viewport 824, layout 810, **sidebar 824**: the sidebar was taller than its own parent, and 824 was exactly the viewport.

**Root cause: nothing in the chain had a definite height.** `.view` uses `min-height: 100vh`, which is not definite, so `overflow-y: auto` on both the sidebar and the content pane did nothing at all — a box with an auto height simply grows. The document scrolled instead of the panes, the sidebar overflowed the layout, and its dark background stopped where its box ended, leaving bare page background across the foot of every page. (`documentScroll` 889 vs `body` 859 was the same fact from the other side.)

Fix: `#view-dashboard { height: 100dvh; overflow: hidden; }` — a fixed-height shell with two independently scrolling panes, which is what the existing `flex: 1` / `min-height: 0` / `overflow-y: auto` were always written for. `dvh` so a mobile browser toolbar doesn't cut it off. Scoped to the dashboard view: the auth/setup views must still grow and scroll normally.

Consequence handled: the document no longer scrolls, so `window.scrollY` is permanently 0. The four popups positioned as `rect.top + window.scrollY` are therefore still placed correctly on open (document coords now equal viewport coords) — and `.pmt-tooltip`, which is `position: fixed`, was previously double-counting the offset, so this quietly fixes it. The datepicker now also dismisses on scroll, since a popup at document coordinates no longer travels with an input inside a scrolling pane.

`sw.js` → `esquerrapp-v38`. Frontend-only.

### 2026-08-02p — Page scrollbar and truncated dot tooltip (v39)

Both turned out to be the same CSS fact: **when one overflow axis is `auto`, the other computes to `auto` too, not `visible`.** `.table-wrap { overflow-x: auto }` therefore clips vertically as well.

- **Tooltip truncated** (screenshot: the bubble cut off mid-word). It was a `::after` pseudo-element on `.reg-dot`, trapped inside `.table-wrap`. Now rendered into the shared body-level `.ua-tooltip` — which already existed for exactly this problem elsewhere — via `showHoverTip`/`hideHoverTip` and a delegated `mouseover`/`mouseout` pair (those bubble; `mouseenter`/`mouseleave` do not, and the rows re-render). `.ua-tooltip` switched from `absolute` to `fixed`: it is positioned from a `getBoundingClientRect()`, which is viewport-relative, and it now has to escape clipping ancestors. Hidden on pane scroll, since a viewport-pinned bubble does not follow its dot.
- **Window scrollbar still present** despite v38's `height: 100dvh; overflow: hidden`. `height` alone was not enough — `.view`'s own `min-height: 100vh` still applied, and any stray descendant could add a few pixels back. `#view-dashboard` is now **`position: fixed; inset: 0`**, so the shell is out of flow and cannot contribute to document height at all. `.view[hidden] { display:none !important }` still wins over it, so hiding on the auth screens is unaffected.

Third and fourth attempts at the strip. The first two were reasoned from the stylesheet and both wrong; the fix only came from measuring the boxes. Worth remembering for the next layout bug here.

`sw.js` → `esquerrapp-v39`. Frontend-only.

## Phase 5 — split club data per category

Full plan: `~/.claude/plans/working-on-the-esquerrapp-ticklish-beaver.md`. Category scoping is cosmetic today — every data type is one club-wide blob and rules cannot read inside a JSON string, so a cadet coach is merely *not shown* juvenil's data, medical records included. Phase 5 shards each key per category.

**Scope decision (2026-08-03)**: current team data is pre-season test content and disposable. Trainings, matches, injuries, availability, RPE, call-ups and tactics get **wiped** at cutover; user accounts, club config and roster email lists are **kept**. That removes dual-writing, the migration script, the legacy-retirement stage and the "uncategorised legacy row" problem outright, and made splitting all 16 keys at once cheaper than a medical-only slice.

Exploration corrected three things: there are **20** keys not 19, only **5** carry a category (not 8), and three are dead.

### 2026-08-03 — Stage A, part 1 (v40)

- **Players now get a `cats` claim** — their own category. It was `[]`, which would make every per-category rule fail closed against the entire player base. `cats` now means "categories you may SEE" rather than "categories you coach"; staff and lead unchanged. Fixed in **both** `claimsFor` and `setRole`, which compute it independently — if those drift, a member's access depends on which path last touched them.
- **`backfill-claims.js` rewritten.** It still wrote only `{teamId, role}` from before Phase 4 existed, so re-running it would have **silently stripped `cats` from every user** and locked every coach out of their own roster lists. It now derives the same way `membershipFrom` does, reading the club's roster lists, and gained a dry-run/`--apply` gate like the other scripts.
- **Dropped the three dead keys** (`fa_standings`, `fa_news`, `fa_player_stats`) from `SYNCED_KEYS`, both `SEASON_KEYS` lists and `KEY_PAGES`. None has a writer anywhere, so `archiveSeason` was archiving and resetting documents that never existed. Also removed the two dead `fa_player_stats` reads in `renderPlayerHome`/`renderPlayerStats` — both assigned a `me` variable that is never used; real stats come from `computePlayerMatchStats`.

Rules suite: 67 passing. `sw.js` → v40. **Deploy: functions, then run `backfill-claims.js --apply`.**

### 2026-08-03 — Stage A, part 2 (v41)

- **Tactic boards carry a `category`.** Stamped, not derived, at all three creation sites (Save, Save As, training board) because a saved board is attached to no player, match or date. Training boards especially: that map is keyed by training **date**, and two categories training the same evening share one bucket — the date cannot say whose board it is. Match boards are deliberately left unstamped; they join live through the match, like the other matchId-keyed data.
- **Injuries are NOT stamped** — decided against, deliberately. Injury history **follows the player**, so the shard has to come from a live join to the player's *current* category. A frozen stamp would strand a promoted player's medical history with his old coach, which defeats the point of recording it. The cost is a re-shard on reassignment, handled in Stage B. Notifications stay frozen: a notification records a moment, not a person.
- **`fa_training` rows now carry a stable `id`** and every consumer addresses them by it — the render, `readTraining` (which fires on every keystroke), the remove button and the row click. Positional addressing was fragile even today; once Phase 5 merges several category documents into that list, a remote change to another category reorders it between render and keystroke and silently writes one squad's edits onto another's session. Existing rows get an id lazily on first render.

**Deferred, deliberately: the same fix for `fa_tactic_saved`.** It is a 14-site refactor of the most intricate page in the app, including index-shifting arithmetic and a selected index persisted in a separate local key. Post-Stage-C the exposure is narrower than it looks — a coach's merged blob will contain only their own visible categories, so cross-category reordering cannot reach them; the lead, who sees everything, is the only one at risk. Worth doing as its own focused piece rather than rushed.

Rules suite: 67 passing. `sw.js` → v41. Frontend-only.

### 2026-08-03 — Stage A, part 3: tactic boards by id (v42)

The deferred half of A4, done properly. Saved boards were addressed by array position in two places at once — `data-board-idx` in the DOM **and** a selected index persisted in `fa_tactic_loaded_idx` across renders — so deleting a board had to renumber the selection by hand (`if (li > idx) li - 1`). Once Phase 5 merges several category documents into that array, a remote change reorders it and the persisted index quietly points at somebody else's board.

- Boards carry a stable `id`, backfilled lazily by the new `getSavedBoards()`.
- New `tbSavedListHtml()` renders the list — the same markup was duplicated in **four** places (the picker screen, the board screen, `refreshSavedList` and the delete handler's inline re-render), each with its own copy of the index logic.
- Save, Save As, load, delete and `hasTacticUnsavedChanges` all address by id. The delete renumbering is gone entirely: with ids, removing one board cannot invalidate the selection of another.
- `fa_tactic_frames` deliberately still uses indices — animation keyframes inside a single board, local-only, never synced, so sharding cannot reorder them.

Linked match/training board copies are still matched by **name**, unchanged. That is a pre-existing weakness (renaming propagates by name, and once sharded the same name can exist in two categories) but it is a separate contract from the positional bug fixed here.

Verified both failure modes: a remote insert makes the old index resolve to the wrong board while the id lookup stays correct, and deleting an earlier board no longer disturbs the selection.

Rules suite: 67 passing. `sw.js` → v42. Frontend-only.

### 2026-08-03 — Stage A complete: in-app update check (v43)

The web app updates on reload; a bundled APK does not, because Capacitor ships a copy of the web assets — so a phone can run months-old code against a current backend and nobody notices. That is the constraint that would otherwise have forced dual-writing through all of Phase 5.

- **`APP_VERSION` constant** in `js/app.js`, bumped alongside `sw.js`. `check-deploy.js` now fetches the live `js/app.js` and **asserts the two agree** — a lagging `APP_VERSION` would make every bundled APK claim to be current and the banner would never fire.
- **`clubs/{clubId}.minAppVersion`** drives it, set from a per-row input in Gestió de Clubs. No rules change: the club doc is already member-readable and lead/superuser-writable.
- **Soft nag, not a block** — deliberately. A wrong value here would lock the club out and only the superadmin could undo it. Dismissal is remembered *per required version*, so raising the bar nags again but a single release does not nag on every page.
- **`updateUrl` is a club field, not a constant**: GitHub Actions artifacts have no stable public URL. Without one the banner still says what is wrong, it just cannot offer the download. When Play/App Store lands, this becomes the store link with no other change.

**Not chosen: pointing the APK at the live site** (`server.url`). It would end APK staleness instantly, but loading an entire app from a remote URL is a reliable App Store rejection (guideline 4.2), and stores are on the roadmap. The store-friendly path is bundled assets plus an OTA bundle swap later; this version check is the stepping stone to either.

**Stage A is done.** Next is Stage B: the `db.js` router. Nothing in Stage A splits anything — it is all groundwork, and all of it is independently useful.

Rules suite: 67 passing. `sw.js` → v43, `APP_VERSION` 43. Frontend-only.

### 2026-08-03 — Stage B: the sharding router (v44)

Every synced key is now written as one document **per category** instead of one per club:

```
teams/{teamId}/data/{key}__{category}   { v: "<json>", category: "cadet" }
```

`localStorage` is untouched — still one merged blob per key — so none of the ~128 read sites in `app.js` know this happened. Only the Firestore mapping changed.

- **New `js/shard.js`** holds the routing table and the pure partition/merge functions: no Firestore, no localStorage, no DOM, and `module.exports`ed so it can be unit-tested in Node. Seventeen keys, three shapes (`array`, `map`, `mapOfArrays`) and five ways of finding the category: read it off the row (6 keys), join a uid through `fa_users` (4), join a matchId through `fa_matches` (5), and the date-keyed training boards, whose entries carry their own stamp.
- **Joins are resolved live, never stamped** — that is the whole reason injuries were deliberately left unstamped in Stage A. A promoted player's medical history re-shards to follow him. Tested both ways round.
- **Provenance fallback for joined routes only.** When a join stops resolving — the player was deleted, the match erased — the row stays in the shard it came from instead of falling into `__none`, which would move a squad's history out from under its coach. Field-routed keys get no fallback: for them a missing category is a real answer.
- **Per-document diff.** `readTraining` fires on every keystroke and `renderStaffTraining` writes on every render; without the diff each would become N writes per render. Only shards whose serialised content actually changed are written.
- **Shadow cache** (`_shards`: key → category → JSON string). A merged blob cannot be rebuilt from one `docChange`, so the parsed shards are kept. It is updated optimistically before the write resolves — and **rolled back to the server's value if the write is rejected**, because a cache claiming content the server does not have would make the *next* write diff against it and skip. That is the silent-loss shape this project has already been bitten by three times.
- **Deterministic merge order** — `CATEGORY_ORDER`, then `__none`, then anything unrecognised (merged last rather than dropped). `fa_training` re-sorts by date descending and `fa_staff_notifications` by timestamp descending; the latter matters because `addStaffNotification` caps the list at 200, and concatenating shards would make the cap drop one whole category instead of the oldest entries.
- **`fa_tactic_training_boards` gets a real fix, not just a shard.** The map is keyed by training date, and two categories training the same evening shared one bucket. Each entry now routes on its own Stage-A stamp, so the bucket is split across shards and rebuilt on merge.

**The safety rule** — never write a shard whose input the client could not see — is implemented as `_scope`, and `_scope` is deliberately the **read** scope (what the listener downloaded), not the UI's category filter. A coach browsing cadet still holds every category the listener fetched and must write all of them back. `_routeWrite` refuses any shard outside it, surfaces `shard-out-of-scope` through the existing `db-write-error` event, and **rejects the returned promise** so an acked save can never report success on a refused write.

**`SCOPED_READS` is the Stage C switch**, currently `false`. While false the listener fetches the whole collection, so the read scope is every category and the assert has nothing to refuse. Flipping it makes the same list drive both the `where('category','in', …)` query and the assert — they must never be different lists. `init()` re-subscribes when the scope changes; `DB.setScope()` only records the wanted set, because narrowing the write scope without re-subscribing would refuse writes for data we still hold, and widening it without re-subscribing would authorise writes for data we never downloaded. `app.js` calls it from `setSession` and `loadClubConfig` (`syncDbScope`).

**Rules**: doc ids are now composite, so the player-write allowlist tests `baseKey(key)` — `key.split('__')[0]` — instead of the whole id. Matching the whole id would have denied every player write at cutover; matching a prefix would have let `fa_matches__fa_injury_notes` through. Both cases are tested. **Reads are deliberately NOT narrowed yet**: a collection query is rejected outright if any document in it could be denied, so the query must narrow before the rule does.

**Load order changed**: `utils.js` (owns `CATEGORY_ORDER`) and the new `shard.js` now load *before* `db.js`, which asserts at load time that every synced key has a route. `utils.js` was also missing from the service worker's `STATIC_ASSETS` — added along with `shard.js`.

**Not deployable on its own.** Cloud Functions still address `data/fa_x` directly (Stage D), and the shards only exist after the Stage E wipe. Stage B, C, D and E ship together.

Tests: 20 new `shard.test.js` unit tests (`npm run test:shard`, no emulator needed) plus 6 new rules cases — 73 rules passing. `sw.js` → v44, `APP_VERSION` 44, `check-deploy.js` expectation bumped.

Also in v44: the claims-change handler re-inits `DB` on a same-club membership change (it only did so on a team change). A no-op today, because `init()` early-returns while the scope is unchanged — but from Stage C a promoted coach who keeps the old category-filtered subscription never sees his new squad.

**Review pass on the router, same day.** An independent read of `db.js` found seven real defects, all in the write path, all of the same family — the shadow cache and the server disagreeing:

1. **`_rollback` was not compare-and-swap.** `readTraining` writes on every keystroke, so two writes to one key overlap constantly. If W1 failed *after* W2 succeeded, restoring W1's `prevJson` rewound the cache past W2's content and the next rebuild dropped everything typed in between. It now rolls back only if the cache still holds exactly what that write put there — which also covers Firestore's own revert snapshot, which absorbs the server's value before the rejection handler runs.
2. **The shard fan-out was not atomic.** A row moving between categories is "delete from the old shard" plus "add to the new one"; as independent `set()` calls the delete could land while the add failed, leaving the row on the server nowhere while localStorage still showed it. All shards of one blob now go in **one `db.batch()`** — at most seven documents, far inside the 500-op limit. `removeItem` batches its deletes too, and only clears the shadow cache once the server has agreed.
3. **A malformed blob wiped every shard of the key.** `JSON.parse` failure was treated as "legitimately empty", so one `JSON.stringify(undefined)` at a call site would have partitioned to nothing and cleared all seven shards — a club-wide delete. A blob that cannot be read, or whose shape disagrees with the route, is now **refused** and the server left untouched.
4. **A shard with an unrecognised category duplicated rows forever.** `mergeOrder` merges unknown shards rather than dropping them, but `_norm` rejects the same category on the way back out — so its rows were merged into localStorage, re-routed to `__none` on the next write, and written there while the original shard stayed put (out of scope), duplicating every row and refusing every later save on that key. `_absorbDoc` now ignores such shards and warns once.
5. **The `hasPendingWrites` skip lost other coaches' merged fields.** A document carrying our pending write can also carry another coach's fields; skipping it lost them for the session, because once our write acked the value already matched our prediction and the ack was a metadata-only change this listener never saw. It now absorbs unconditionally — our own echo diffs to nothing, and a rejected write reverts the document and returns as a real change.
6. **`flush()` left `_teamId` and the listeners live**, so one remote docChange on the no-club path could repopulate the cache with a single shard and render a fraction of a club the user is not a member of. It calls `cleanup()` first.
7. **`_uploadAll` was dead code** — it read the synced keys back after `init()` had just flushed them — and had it worked it would have uploaded the *previous* club's data into the new one, which is precisely what the flush prevents. Removed; a club with no data documents starts empty.

Also hardened for Stage C: `_readScope()` returns null instead of silently narrowing to `['none']` when the visible set is unknown, and `init()` throws rather than downloading almost nothing and then refusing every write.

**Known gap for Stage C, not fixable here:** once reads are scoped, a player moved cadet→juvenil strands his joined rows (injuries, notes). His old coach no longer resolves him through the roster, so provenance pins the rows to `__cadet`; his new coach never downloads `__cadet`. The provenance fallback is right for a *deleted* player and wrong for a *moved* one, and the client cannot tell them apart. The fix belongs server-side in Stage D — `setRole`/`onRosterWritten` already run when a player changes category and should re-shard his joined rows there.

### 2026-08-03 — Stage C: scoped reads and the narrowed rule (v44)

Category separation is **real** from here. Before this, a cadet coach was merely not *shown* juvenil's medical records; the rules could not see inside a JSON blob to stop him fetching them.

- **`SCOPED_READS` flipped on.** The `data/` `.get()` and `onSnapshot` both run `where('category','in', scope)`, and the same list is the router's write assert — the query and the assert are one list by construction, which is the only reason the safety rule means anything.
- **The read rule** gains `resource.data.category in request.auth.token.cats`, with `none` readable club-wide (staff accounts, unassigned players, pre-category rows) and the `'cats' in token` guard so an old token denies rather than errors.
- **Query-before-rule, in that order** — a collection query is rejected outright if any document it could return might be denied, so narrowing the rule first would have killed sync for every scoped user at once.
- **All six `DB.init` call sites now pass `getVisibleCategories()` explicitly.** Each was already preceded by `loadClubConfig` → `syncDbScope`, but the ordering was an invariant nobody would notice breaking; `init()` throws if the scope is unknown rather than silently narrowing to `['none']`.

**The open question this settled empirically**: whether Firestore accepts a collection query whose filter is `in` against a *dynamic* list from a custom claim. It does — `where('category','in',[...])` against `resource.data.category in request.auth.token.cats` is allowed, an unfiltered read is rejected, and a query naming a category outside the claim is rejected. Five tests pin that down, because if it had gone the other way the rule would have needed redesigning rather than patching.

A document with **no** `category` field is now unreadable by everyone but the superuser. That is deliberate and tested: it is what a Cloud Function that forgets to stamp the field would produce, and going dark is the safe direction.

Rules suite: 87 passing (+14). Shard suite: 22.

**Still club-wide, and deliberately not done here:** the three per-record collections (`trainingAvail`, `matchAvail`, `rpe`). The plan has them gaining a `category` field, but no stage owns it and the sensitive data — medical — lives in `data/fa_injuries`, which is now scoped. Doing it means stamping six `ackSaveRecord` sites, narrowing three listeners and three rules, and it strands a moved player's records exactly like the joined `data/` routes do. Sized and listed in HANDOFF; it is an incremental privacy improvement, not a blocker.

### 2026-08-03 — Stage D: the Cloud Functions (v44)

Every hardcoded `data/fa_x` is gone. Two helpers carry the whole change: `readDataShards(teamId, keys?)` reads a team's data collection **once** and groups it by base key in category order, and `mergeArrayShards()` reassembles the single list the old code expected. Pre-Phase-5 un-sharded documents are skipped — merging one would double every row it holds.

- **The three schedulers** merge across shards. Reading one shard would have reminded one squad and silently skipped the rest.
- **`updateTeamDates` unions.** The trigger fires per *shard* but the field it maintains is per *team*, and the schedulers query `array-contains` on it — so deriving the dates from the shard that just changed would have replaced the array with one category's dates and stopped every other category's reminders, with nothing in the logs. It now re-reads all shards of the key and unions. **`backfill-team-dates.js`, the repair tool for exactly that failure, is sharded too** — unsharded it would have found nothing and written empty arrays, becoming the thing that silenced the club.
- **`deleteMember`** scrubs every shard of each key via the new `scrubShards`; the mutate callbacks are untouched, because a shard has the same shape as the old whole-club blob. A member can appear in any category's shard plus `__none`, so scrubbing only their current category would leave the person half-erased. The three **frozen legacy** availability/RPE docs are deliberately still addressed directly — they are not sharded, and an erase must still reach them.
- **`onClubLeadChanged`** scrubs `fa_users` across shards.
- **`archiveSeason`** archives and resets shard by shard, keeping the `{key}__{category}` id in the archive so a restored season lands back in the right categories. The injury carry-over is **per shard**: an unresolved injury has to stay inside its own category, or a player's open injury would surface in another squad's medical page after the rollover. Every reset write carries `category` — a shard that lost the field would drop out of the client's query and the new season would start invisible. The three frozen record keys were dropped from `SEASON_KEYS`: they are not sharded and hold nothing a season needs, and the canonical records are archived from their own collections a few lines below.

**New trigger `onMemberCategoryChanged`** closes the gap the router review found. Injuries and injury notes are sharded by the player's *current* category through a live join — deliberately, so medical history follows the player — and the cost is that a category change has to move the documents. Only the server can: the old coach can no longer resolve the uid so his client pins the rows where they are, and the new coach never downloads the old shard. It watches `users/{uid}` rather than hooking each writer, because `onRosterWritten`, `setRole` and the client's "re-assign to a squad" flow all change the field. `reshardMember` scans every shard rather than trusting a "from" category, which also makes it idempotent against repeat deliveries.

One subtlety worth keeping: the read/write format is taken from **the document**, not from the key. A merge key can still have a legacy `{v:"…"}` document, and deleting fields that live inside a blob would remove nothing while the copy still landed — the rows would exist twice.

**Stage D had no automated test when it was written** — there was no functions harness in this repo. There is one now (`npm run test:functions`, added later the same day); `reshardMember` and `updateTeamDates` are covered against the real triggers in the Functions emulator. Confirming the same move in production during the cutover is still worth doing, but it is no longer the only evidence.

### 2026-08-03 — Test harness for the router

`db.js` had no test coverage, which is why a review had to find seven write-path defects by reading. `test/router.test.js` now runs the **real** `db.js` in a `vm` context against `test/fake-firestore.js`, an in-memory stand-in for the compat Firestore API. No emulator and no Java — about a second.

A fake rather than the emulator, deliberately: the router's failure modes are about *which* documents get written and what the shadow cache believes, not about rules or networking, and a fake can be told "this commit fails" and "these two writes overlap". The emulator cannot. The rules suite covers the emulator side separately.

The two tests that matter most are the ones that were bugs:

- **The keystroke race** — two overlapping writes, the second succeeds, the *first* then fails. The rollback must not rewind past the one that landed. Asserted by checking that a subsequent identical save writes nothing, which is only true if the cache and the server agree.
- **The safety rule** — a cadet-scoped coach edits a training and the juvenil document is byte-unchanged; a juvenil row appearing in a cadet-scoped client refuses the *whole* write rather than half a re-partition.

Plus: the per-document diff (a re-render that changes nothing writes nothing), refusal of unparseable and wrong-shaped blobs while a genuinely empty blob still clears, a row moving between shards in one batch, one `firestore-sync` per key not per document, removed and unrecognised shards, and per-field merge keys keeping `category`.

**129 passing at the time**: 42 unit (`npm run test:unit`, no Java) + 87 rules. The functions harness that closed the remaining gap came later the same day — see below.

**Committed as `02fe60e` on branch `phase5-sharding`** — not pushed, not merged, not deployed *at the time*; merged and shipped at the cutover below. `HANDOFF.md` carried the Stage E runbook; `CLAUDE.md` was updated for the new script load order, the sharded data model and the `npm run test:unit` safety net.

The one non-obvious thing about the cutover, spelled out in the runbook: **the two rule changes cannot ship together.** The `baseKey` write allowlist must land BEFORE the new frontend (composite ids fail the old exact-match allowlist, so every player write would be denied), and the read narrowing must land AFTER it (Firestore rejects a collection query outright if any document it could return might be denied). So the rules deploy twice, with the read narrowing temporarily backed out the first time.

### 2026-08-03 — Stage E, step 0: the wipe script

`functions/wipe-team-data.js` is the last artifact the cutover was missing. Dry run by default, `--apply` to act, `--team <id>` to rehearse on one club, `--include-seasons` to take the archives too.

It deletes `teams/{id}/data/*` (sharded **and** pre-Phase-5 un-sharded docs), the three record collections, and the spent `pushQueue`. It keeps `users/*` (+ `tokens/*`), `clubs/*` with `rosters/*`, `clubCodes/*`, `joinAttempts/*`, the `teams/{id}` documents themselves and, by default, `seasons/**`.

Two decisions worth the ink:

- **`fa_users` is wiped with everything else, and that is safe** because `DB.init()` reconciles the kept `users/` collection back into the blob on the next login — the member list rebuilds itself from the accounts, per category as each coach signs in. Nothing else in `data/` has a source to rebuild from; that is what makes it a wipe.
- **`trainingDates`/`matchDates` are cleared, not left.** They are the schedulers' index. Left pointing at wiped trainings they would fire reminders for sessions nobody can open, in the window between step 3 and `backfill-team-dates.js` in step 5.

`seasons/**` is reported in the inventory but kept unless asked for: an archive is a season that already happened, not the disposable pre-season content the wipe scope covers.

### 2026-08-03 — A test harness for the Cloud Functions

Stage D was the last untested code, and `reshardMember` the piece that most deserved a test. `test/functions.test.js` and `test/wipe.test.js` now run under the **Functions** emulator (`npm run test:functions`), driving the real `functions/index.js` the way production does — write a document, wait for the trigger. **143 passing**: 42 unit + 87 rules + 14 functions.

`reshardMember` is covered on every axis that can lose or duplicate a row: rows collected from *every* shard including `__none` and landing exactly once; `category` surviving on each shard it touches; merge-format **and** legacy blob-format sources emptied (the format is read off the document, not the key); `uid_date` keys moved while a `{uid}_legacy` neighbour stays put; a same-category write being a no-op; the move back; and an unassigned member's rows parking in `__none`. `updateTeamDates` gets the union-across-shards test that its silent-failure mode deserves. `wipe.test.js` runs the wipe script as a child process and asserts both halves of its contract.

**One production change came out of this.** `admin.firestore.FieldValue` is **undefined inside the Functions emulator**: firebase-tools stubs firebase-admin and returns `firestore` bound to the module (`Proxied.getOriginal` → `value.bind(target)`), and a bound function loses its statics. The first run of the reshard test died on `FieldValue.delete()` — code that works in production, since the deployed `deleteMember` uses the same expression. `functions/index.js` now takes `FieldValue` from the modular `firebase-admin/firestore` subpath: identical sentinels, and testable in both places. Thirteen call sites, no behaviour change. The one-off scripts in `functions/` still use `admin.firestore.FieldValue` — they run under plain Node, never the emulator.

The suites share one emulator but not one project: `wipe.test.js` talks to it under the script's own hardcoded `esquerrapp` id while the emulator's project is `demo-esquerrapp`, so a `--apply` with no `--team` cannot reach the other suite's teams and the production script needs no test hook.

### 2026-08-03 — Stage E: the cutover ran (v44 live)

Phase 5 is in production. The order held: rules with the write allowlist and the read temporarily permissive (`3fe7bb7`) → functions → wipe → frontend → verify → the read narrowing restored (`6a3341f`, a revert of the first). The two rule changes could not ship together, and that constraint drove the whole runbook.

**The wipe** took 37 data docs and 108 record docs across three teams, plus `pushQueue` and both date arrays. A third team surfaced in the dry run that the plan had not accounted for: `teams/default`, the pre-migration legacy club, holding the *largest* history of the three (69 trainings, 11 members, 12 injuries) and unreachable through the app because no `clubs/default` document exists. Wiped by explicit decision.

**`fa_users` rebuilt itself** from the kept `users/` collection on the first login, in production, exactly as designed. That behaviour is the load-bearing assumption under the whole "wipe instead of migrate" decision — it is what made deleting the member list safe — and it had never been proven outside a test until now.

**Verified against production**: 6 shards on the live club, every id in `{key}__amateur` form and every one carrying a `category` field; `trainingDates` repopulated by the `updateTeamDates` trigger from a sharded write; the app normal after the narrowing.

`backfill-team-dates.js` was **skipped as a no-op** — the runbook had it rebuilding the date arrays, but after a *full* wipe there are no shards to rebuild from and the wipe had already set both to `[]`. It remains the repair tool for the case it was written for.

**One check turned the riskiest step into a formality.** Before narrowing the read rule, a single `listUsers` call confirmed all 15 live accounts carried `cats: ["amateur"]`. The failure mode of that step is every scoped user's app going empty at once, and behaviour under the permissive rule says nothing about behaviour under the narrow one. The empty-`cats` accounts that turned up were only the three known `teamId: 'default'` strays and two test-club logins.

**What actually cost time: Application Default Credentials, not the cutover.** The wipe script died on its first read with `Cannot create property 'refresh_token' on string ''` — the error the old handoff attributed to a lapsed `gcloud auth login`. That diagnosis was wrong, and so was a second guess about a corrupt credentials file (there was none). Cloud Shell keeps ADC in a **temp directory**, and the Admin SDK only finds it when `GOOGLE_APPLICATION_CREDENTIALS` points there; `gcloud auth application-default set-quota-project` prints the path it wrote, and exporting that fixed it instantly. The export survives only in the tab it was run in. `firebase` and `gcloud` hold their own separate credentials, which is why `./deploy.sh` kept working throughout — a useful signal that the problem was ADC specifically, not authentication in general.

**A bug found during the cutover that the cutover did not cause**: an injury created from the Medical page did not appear under roster → player detail. It looked like a routing fault. It was not — `renderStaffPlayerStats()` had no injury section at all, the block existed only in the player's own "My stats", and the Phase 5 diff touches no injury code. A pre-existing feature gap, fixed below.

### 2026-08-03 — Injury history on the staff's player detail (v45)

Roster → player detail now shows the same injury history card and body map the player sees on "My stats". Extracted rather than copied: `buildInjuryHistoryHtml(uid)` holds the list, the duration arithmetic, the status/severity dots and the centroid-dotted body map, and both `renderPlayerStats()` and `renderStaffPlayerStats()` call it. One template, so the two views cannot drift.

Two bindings the card needs, easy to miss because neither is in the render function:

- **`bindMyStatsInjuryPopup()`** is called from the page router by page name, and only `my-stats` was listed. Without `staff-player-stats` the rows render with `cursor:help` and no popup ever appears — the markup is identical, so nothing looks broken.
- **`KEY_PAGES.fa_injuries`** decides which pages re-render on a `firestore-sync`, and `staff-player-stats` was absent. A coach sitting on a player's detail page would not have seen an injury logged from another device.

Deployed and confirmed working in production the same day. `PROJECT_SUMMARY.md` was rewritten alongside it: it still described the pre-Phase-1 app (one club-wide blob per key, `teamId: "default"`, three roles, demo seed data, four Cloud Functions), which made it actively misleading rather than merely thin.

### 2026-08-03 — The season boundary is per-club (v46)

`seasonStartStr()` hard-coded 15 August. Six places in `app.js` filter on it (`date < seasonStart || date > todayStr`), so it alone decides whether a club's stats, medical, attendance and load views have any content — and a club whose league does not run August–June had no way to say so.

Written for the demo club (below), which needs "today" to sit mid-season rather than 12 days from a rollover, but it stands on its own: calendar-year and spring–winter competitions both exist.

- **`js/utils.js`**: module-level `_seasonBoundary` (`'MM-DD'`, default `'08-15'`) with `setSeasonBoundary()` / `getSeasonBoundary()`. `seasonStartStr()` reads it. **No call site changed** — the six filters still pass only a date. A module-level variable is sufficient because `teamId` is single-valued, so a session never holds two clubs.
- **`js/app.js`** `loadClubConfig()`: `setSeasonBoundary(_clubConfig && _clubConfig.seasonBoundary)`, **and** a reset on the no-club early return — otherwise logging out of a club with a custom boundary leaves the next session slicing dates by the wrong year.
- **`clubs/{id}.seasonBoundary`** is optional. Anything missing or malformed falls back to `'08-15'`, so a club without the field is byte-identical to the old behaviour. No rules change (`clubs/{id}` update was already lead-or-superuser with no field allowlist) and no backend involvement — `functions/` never calls `seasonStartStr`, and archive/reset are manual, not date-triggered.

Nothing stored is season-stamped; the boundary only slices plain `YYYY-MM-DD` dates at read time, so setting or deleting the field is fully reversible with no migration. `getSeasonWeek()` follows it too — week numbering is derived, never stored.

**`js/utils.js` is now requireable from Node**, via a `typeof module !== 'undefined'` guard at the end of the file exporting the pure helpers. Deliberately *not* the UMD wrapper `shard.js` uses: `app.js` reads every constant and function in utils.js as a global, so a closure would take them all out of scope. Nothing above the guard touches the DOM at load time (`sanitize` uses `document`, but only when called).

**Cold start was checked, not assumed**: `init()` has no eager render, and the only boot-time `navigate()` is at the end of the `onAuthStateChanged` handler, after `await loadClubConfig(tid)`. The boundary is always set before the first season-scoped render, so no localStorage cache was needed.

New `test/utils.test.js` (18 tests) in the fast `npm run test:unit` path — **161 passing** now (60 unit + 87 rules + 14 functions). The suite leans on the negative case: nine malformed values must all fall back to `'08-15'`, and the boundary must reset cleanly. `check-deploy.js`'s `CURRENT` constant was bumped to `esquerrapp-v46` (it had been left at v44 while production ran v45).

### 2026-08-03 — `functions/seed-demo-club.js`: a demo season for sales

A complete season — 25 players, 34 matchdays, 68 trainings, ~3,000 documents — in a **separate club**, so prospects can be shown a full app instead of an empty one. Nothing production is touched.

- **Everything it creates is stamped `demoSeed: true`** (club doc and every `users/` doc). `--purge` refuses a club without the stamp, refuses the three ids in `PROTECTED_CLUBS`, and leaves any unstamped account in the club alone. That stamp is the whole safety model.
- **Uids are derived from the club id** (`dm_{clubId10}_{slug}`), so `--apply --club <id>` re-seeds the same accounts rather than duplicating them and the demo credentials keep working.
- **Routing goes through `js/shard.js`**, never by hand: `Shard.partition()` then `Shard.docId()`. Hand-written shard ids are how a document ends up without a `category` and goes dark, and this way the seeder's output is identical to the app's by construction.
- **Order matters**: accounts are written before shards, because `onMemberCategoryChanged` → `reshardMember` fires on every `users/` write whose category changed. Writing people first means it finds nothing to move.
- `calcMatchScore()` is copied verbatim from app.js and the score is **derived** from the events, never assigned — the app recomputes it on render, so an invented score would contradict itself on screen.

**The dry run is offline and needs no credentials.** The season is generated and self-checked in memory; only `--apply` initialises firebase-admin. Fourteen consistency checks run before any write and refuse it on failure — scores against events, events against call-ups, subs XI→bench, one keeper per XI and never substituted, `ua = rpe × minutes`, `fitnessStatus` against the injury log, and an injured player never marked available.

Three bugs the checks and the multi-date runs caught, all worth recording:

- **`addDays()` did millisecond arithmetic.** On the autumn DST transition Spain has a 25-hour day, so `t + 86400000` from local midnight lands at 23:00 the *same* day and `for (d = start; d <= end; d = addDays(d, 1))` **spins forever**. Dates are now `setDate()`-based and anchored at noon. The first test date only escaped because its calendar stopped the day before 2026-10-25.
- **Substitute goalkeepers.** The bench was "squad minus XI", so the reserve keepers were the first three subs — two came on in one match. Selection is now by line (4-3-3), the bench is outfield-only, and the keeper is never subbed.
- **An injury extended after its unavailable days were blocked out** left a gap where the player showed as available in the middle of his own injury. The end date is now decided before the days are blocked, not patched afterwards.

**The season boundary is derived from the run date** (five months back, snapped to the 1st) unless `--boundary` is passed. (Superseded note: the ADC guidance in this script's header and in HANDOFF.md was wrong — Cloud Shell is a GCE VM whose metadata server supplies Application Default Credentials automatically, and a *stale* `GOOGLE_APPLICATION_CREDENTIALS` is what actually breaks the Admin SDK. `--apply` now runs a credentials preflight before its first write.) That is what makes the script re-runnable: "today" always lands ~40% into the season, so there is both a played history for the stats views and a fixture list for the live flows. Verified across five run dates spanning 2026-08 → 2027-06; all pass every check. Pinning a fixed boundary works until the season rolls over and then produces an empty demo.

### 2026-08-03 — Demo walkthrough fixes: team filter, squad distribution, profile pictures (v47)

Three things a walkthrough of the demo club surfaced. All frontend plus the seeder, so it ships by push to `main`; no rules or functions changed.

**Phantom team filter.** "Auto Generate Teams" offered `All / A / B` on a club whose only team is `amateur-A`. The bug was the argument, not the helper: it passed `_currentSession.category`, but `category` is a *player's* squad field and is `''` for staff, so a coach resolved to no category and fell through to `getTeamLetters()`'s `['A','B']` fallback.

- The call site now uses `getCurrentCategory()`, which resolves the *viewed* category and already handles staff. Two sibling filters were doing this correctly all along.
- **`getTeamLetters()` now falls back to `['A']`**, matching `rosterKeys()` and `prefill-rosters.js`, which had always disagreed with it. Omitting a real team is recoverable; inventing one is not — and because the club config loads async, *every* render before it resolves hit that fallback.
- Both this filter and the roster's now hide entirely when there is only one letter, as the training-detail and medical filters already did. Hiding cannot strand a selection: the category switcher resets all three filters, and the generate handler defaults to `all` when the bar is absent.

**"Equal" distribution did the opposite of its own comment.** It read *"sort by position rank, then chunk sequentially"* and then dealt `teams[i % numTeams]` — which scatters adjacent, i.e. positionally similar, players into *different* groups. Equal and Mix produced the same kind of split; only the shuffle differed. Equal now cuts the sorted pool into **contiguous** blocks, so two groups give defenders + holding midfielders against attacking midfielders + forwards.

Three further defects fixed in the same function, none of them reported:

- **The trim was positionally biased.** `while (team.length > perTeam) team.pop()` popped the end of a position-ordered array, so the players dropped into "No inclosos" were **reliably the forwards**, in both modes. The pool is now capped *before* distribution from a shuffled order; measured over 500 runs across seven group/size configurations, exclusions now track squad share to within a point.
- **Capping the pool first can strand the keepers**, which is why one keeper per group is reserved before the cut, and why `perTeam` is enforced during placement rather than by a trailing trim — a group holding a spare keeper has one slot fewer for outfielders, and sizing the chunks off the outfielder count alone overfilled exactly those groups.
- **`teams.sort()` reordered the array in place** to find the smallest group, so "Equip 1…N" reflected the last size-sort rather than a stable identity. Replaced with an index scan that also skips full groups.

`posGroup()` now keys off `posRankGlobal()` rather than `positions[0]`, so a player listed `"ST,CB"` no longer groups as a forward here while sorting as a defender everywhere else. Seven existing i18n keys for this panel (`std.num_teams`, `std.distribution`, `std.mix`, …) were defined but never used — now wired up, plus a new `common.yes` kept deliberately separate from `avail.yes`, which is an *answer* and may be reworded on its own.

The two buttons were **renamed to say what they do**: `std.mix` is now *Equips Mixtes / Equipos Mixtos / Mixed Teams* and `std.equal` *Per Posicions / Por Posiciones / By Position*. The old *Igualat / Igualado* described the behaviour being replaced, where both modes produced a positionally balanced split.

**Demo profile pictures** — `seed-demo-club.js --faces <dir>` uploads images to `profilePics/{uid}.{ext}`, the same path real uploads use, with the Admin SDK bypassing the owner check in `storage.rules`. Files named after a slug (`player01.jpg`, `coach.png`) go to that person; anything else is handed out alphabetically to whoever is still bare. Fewer images than people is fine.

The alphabetical pass fills **players before staff**: a folder of squad faces typically holds exactly as many images as there are players, and filling staff first left two players on initials while the coach and physio got portraits. With the 25-image demo folder, all 25 players get a face and the two staff keep initials.

The download token is minted **before** upload, not after: a Firebase download URL is just the object path plus a token *we* supply as metadata, so it can be known in advance — which is what lets `profilePic` be set on the person object before `fa_users` is assembled, and lets the offline dry run print the exact URLs it will produce. `profilePic` is written to **both** `users/{uid}` and the `fa_users` shard, because the roster reads the shard while the profile screen reads the doc; setting one alone half-applies the picture, and `--verify` now checks the two agree and that every URL is backed by a real object. `--purge` deletes the blobs too — Storage objects are not reachable from Firestore, so a document-only purge stranded every image in the bucket.

**Schedule dates are written directly, not waited for.** The first re-seed with faces ended on `trainingDates 68, matchDates 0`, which looks exactly like a broken `updateTeamDates` and is not one: the trigger writes only its own field with `{merge: true}`, but it fires once per shard and finishes when it finishes, so a `--verify` seconds later caught one invocation done and the other still queued. `apply()` no longer resets the two arrays when it touches the team doc, and writes both from the generated calendar as its final step. The trigger's own write then lands the same values and is a no-op. `backfill-team-dates.js` remains the repair tool for clubs seeded before this.

### 2026-08-03 — Staff home: the coach gets a landing page (v48)

Coaches landed on Registrations — a queue that is empty most of the time, and a poor first screen both for daily use and for a demo. `staff-home` is now the first staff sidebar item, so `renderSidebar()`'s "first page in the list" rule makes it the landing page; `fallbackPage()` sends staff there too.

**Deliberately not `renderWeekActivities()`.** That function answers "what have I got on, and have I replied?" for the logged-in *player* — it renders their own availability buttons, their call-up status, their RPE prompts. A coach's question is the inverse, so `renderStaffWeek()` is a separate function showing counts rather than personal answers. It does reuse `getWeekBounds()`, `matchLabel()`, `tDayDDMM()` and `computeReadiness()`.

The page has four cards: this week, next week, out of action, load to watch.

- **Availability counts read RAW**, not through `getEffectiveAnswer()`. That helper assumes `'yes'` for an unlocked session — correct for showing a player their default, but it would report the entire squad as having replied. The staff override still wins, matching the helper's own precedence.
- **"0 available" is suppressed before anyone has answered.** Technically true, reads as alarming; only the "no answer" count shows until somebody replies.
- **Out of action** lists active and recovering injuries sorted by expected return, tagging a return inside 7 days, a date already passed, and no date at all as three different things.
- **Load to watch caps at 6 rows.** The readiness classifier flags orange generously — on the demo squad it lights up **16 of 25** — and a list that long is a wall, not a warning. The card badge still carries the true count and a "+N more" link goes to the roster. Anyone already listed as injured is skipped rather than reported twice, since readiness is load-only and knows nothing about injuries.
- Rows are whole-row links that set the same page-state variables the existing links do (`detailTrainingDate`, `detailMatchId`, `medicalDetailPlayerId`, `staffViewPlayerId`) — navigating without setting them lands on a detail page showing whatever was selected last.
- `staff-home` was added to `STAFF_PAGES`, `CATEGORY_PAGES` and to all eight `KEY_PAGES` entries whose data it reads, so a remote change re-renders it.

That 16-of-25 figure is itself evidence for the parked readiness work: a classifier that flags two thirds of a squad is not discriminating. The cap is a presentation fix, not a fix for that.

Verified headlessly against a seeder dump — the render path was driven with the real demo blobs to check counts, sorting and the injury tags before it ever reached a browser.

### 2026-08-03 — Back returns where you came from; the sidebar highlight stops lying (v49)

Reported from the new staff home: open a training from Home, press Back, and you land on the **Training Sessions list** while the sidebar still highlights **Home**. Two independent bugs with the same symptom, both older than the staff home — which merely made them easy to hit, because Home is now a sidebar page people land on.

**1. Back was hardcoded.** Every detail page shipped a fixed destination: training detail always returned to the training list, player stats to the roster, medical records to Medical. Arriving from anywhere else dropped you on a page you had never visited. Only `match-detail` had ever solved this, with its own `detailMatchFrom`.

`_prevPage` is now tracked inside `renderPage()` — the single funnel every navigation passes through, so one place instead of the dozen call sites that assign `currentPage`. `backTarget(fallback)` returns it, falling back to the old fixed page when there is no origin. Two details that matter:

- It is recorded **after** the role-enforcement redirects, so the origin is the page that actually rendered rather than the one requested.
- A re-render of the *same* page — a firestore sync, a category switch — is explicitly not a navigation. Treating it as one would make Back return to the page you are already on.

`bindMedicalDetail()` captures the target at bind time rather than reading it in the click handler, because by click time another render may have moved `_prevPage` on.

**2. The sidebar highlight only tracked sidebar clicks.** `active` was set when the sidebar was rebuilt (`renderDashboard`) and in the sidebar's own click handler — nowhere else. Every in-page navigation therefore left it pointing at the previous page. This had always been true of row links and Back buttons; nothing had made it obvious before. `syncSidebarActive()` now runs on both of `renderPage()`'s exit paths, including the no-categories early return.

A detail page is not a sidebar item, so it highlights the section it was opened from — the convention, and now also exactly where Back goes. The two agreeing is the point: the original behaviour was confusing rather than merely wrong *because* they disagreed.

New `test/navigation.test.js`, 9 tests in the fast unit path — **170 passing** (69 unit + 87 rules + 14 functions). It slices the logic block out of app.js by marker and evaluates it, one step beyond what `shard.test.js` already does with utils.js; a stale marker throws by name rather than silently skipping. Covered: the reported path, the pre-existing paths that must not regress, the no-origin fallback, re-render immunity, and that the highlight and the back target never disagree.

### 2026-08-03 — Sessions list was re-parsing a 49 KB blob 3,400 times per render (v50)

Reported as "Sessions d'entrenament seem to take a little longer to react and load". Measured, not guessed: **547 ms of pure `JSON.parse` per render**, now **1.5 ms**.

`getEffectiveAnswer()` parsed *both* availability blobs on **every call**, and it is called once per player per session. The Sessions list renders one attendance donut per row, so a 68-session season with 25 players ran 68 × 25 × 2 = **~3,400 parses** of a 49 KB blob, plus 68 more parses of the training list because `buildAvailDonut()` re-read it to find a session its caller was already holding. The cost is O(sessions × players), which is why it only became noticeable once the demo season filled up — and why the live club will hit it as its own season grows.

Two changes:

- **`availContext()` memoises the parsed blobs, keyed on the raw string.** Deliberately *not* on `window._renderFrame`, which is how `getUsers()` and `getReadinessData()` cache: `_renderFrame` only increments in `navigate()`, never in `renderPage()`, so a frame-keyed cache would keep serving the old answers after a player taps one. A stale read here is worse than a slow one, and this repo has been bitten by silent-staleness three times already. Any write changes the string, so the memo cannot outlive it.
- **`getEffectiveAnswer(…, ctx)` takes an optional context**, hoisted once per loop at the five hottest call sites (season attendance, both attendance donuts, the player-home and player-stats donuts). Callers that pass nothing behave exactly as before. `buildAvailDonut()` also takes the session object when the caller has it.

New `test/availability.test.js`, 8 tests — **178 passing** (77 unit + 87 rules + 14 functions). They pin the precedence rules (override beats answer, unanswered is `yes` until locked, then `na`), that passing a context changes no answer, that an unchanged blob is not re-parsed, and — the important one — that a write is visible to the very next read. One test documents that a held context is a *snapshot*, so nobody caches one across renders and reintroduces the staleness this avoided.

Worth noting for later: `renderStaffTraining()` also rewrites `fa_training` to localStorage on every render (to backfill missing ids), which puts the whole blob through the shard router each time. The router's per-document diff means nothing reaches Firestore, so it is wasted work rather than a bug — left alone.
