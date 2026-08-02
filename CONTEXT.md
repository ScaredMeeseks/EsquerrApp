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
