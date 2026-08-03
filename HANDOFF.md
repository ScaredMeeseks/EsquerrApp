# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-03 (Phase 5 complete and live; **v46 adds the per-club season boundary and the demo-club seeder — written and tested, NOT yet pushed or run**)._

## v50 — Sessions list performance (2026-08-03)

"Sessions d'entrenament seem to take a little longer to react and load" — measured at **547 ms of `JSON.parse` per render, now 1.5 ms**.

`getEffectiveAnswer()` re-parsed both availability blobs on *every call*, and it runs once per player per session: 68 sessions × 25 players × 2 = ~3,400 parses of a 49 KB blob, per render. `availContext()` now memoises them, **keyed on the raw string rather than a render-frame counter** — `_renderFrame` only increments in `navigate()`, so a frame-keyed cache would keep showing the old answer after a player taps one.

The cost is O(sessions × players), so **the live club will hit this too** as its season fills up; it is not a demo-only problem.

New `test/availability.test.js` (8 tests). **178 passing.** Frontend only — push to `main`, no `./deploy.sh`.

## v49 — navigation fixes (2026-08-03)

Found by using the new staff home: open a training from Home → Back → you land on the Training Sessions list while the sidebar still highlights Home. **Two separate bugs, both pre-dating the staff home.**

- **Back was hardcoded per page.** Detail pages each had one fixed destination, so arriving from anywhere else dropped you somewhere you had never been. `renderPage()` now tracks `_prevPage` — one place, since every navigation funnels through it — and `backTarget(fallback)` uses it.
- **The sidebar highlight only tracked sidebar clicks.** `active` was set on rebuild and in the sidebar's own click handler, nowhere else, so *any* row link or Back button left it stale. This was always true; the staff home just made it easy to hit. `syncSidebarActive()` now runs on every render.

Detail pages highlight the section they were opened from, which is also where Back now goes — the two agreeing is the fix, since it was their disagreement that made it confusing.

New `test/navigation.test.js` (9 tests, fast unit path). **170 passing.** Frontend only — push to `main`, no `./deploy.sh`.

## v48 — staff home page (2026-08-03)

The coach now lands on **`staff-home`** instead of Registrations: this week and next week's sessions and matches with availability counts and call-up status, players out of action with expected return, and a load-to-watch list. Frontend only — push to `main`, no `./deploy.sh`. Tests green at 161.

Two judgement calls worth knowing:

- **The load-to-watch list is capped at 6 rows.** The readiness classifier flagged **16 of 25** demo players; the card badge shows the true count and "+N more" links to the roster. That ratio is itself an argument for the parked readiness work below — a classifier that flags two thirds of a squad is not discriminating.
- **A coach who is also a player still lands on `player-home`**, because the player section comes first in the sidebar and `renderSidebar()` picks the first item. Say if you would rather staff always win.

## v47 — shipped (2026-08-03)

Three demo-walkthrough fixes. Frontend + seeder only — **no rules or functions changed, so no `./deploy.sh`**. `APP_VERSION` and `sw.js` `CACHE_NAME` are at **47**. Tests green at 161.

1. **Team filter offered a team B that does not exist.** "Auto Generate Teams" passed `_currentSession.category`, which is `''` for staff, hitting `getTeamLetters()`'s fallback. Now uses `getCurrentCategory()`; the fallback is `['A']`; and both this filter and the roster's hide when there is only one team.
2. **"Equal" distribution now groups similar players together** — contiguous blocks of the position-sorted pool, so two groups give defenders + holding midfielders vs attacking midfielders + forwards. It previously dealt round-robin, i.e. did the opposite of its own comment, and behaved like a second Mix button. Also fixed: the trim used to cut **the forwards every time**, `perTeam` could be exceeded, and group numbering was unstable.
3. **`--faces <dir>` on the seeder** uploads profile pictures. See Demo club below.

**Still to do**: push, then re-seed the demo club with faces.

### Deferred, agreed 2026-08-03 — readiness colouring

Found while explaining the roster's Status and Ready columns. **Deliberately parked** for a proper look at readiness as a whole, and worth stressing: `computeReadiness()` runs for **every club**, so this is a real-users change, not a demo tweak.

- **No data renders green.** `rd.hasData` false paints the dot green with a `—` tooltip (`renderStaffRoster`, and the same at the training-detail and convocatòria call sites). A player with almost no RPE history therefore reads as maximally ready. Grey would be honest.
- **Readiness never reads the injury log**, so an injured player can show a green readiness dot — the Status and Ready columns contradict each other on the same row. Status comes from `deriveFitnessStatus()`, readiness purely from training load; the two pipelines never cross-check.
- Related, if it is being opened up anyway: the readiness **number only exists in a hover tooltip**, and the tooltip is mouse-only — on a phone the score is invisible. And the colour is not a function of the score (a separate ACWR + risk-flag + override classifier), which is why two players can both show 72 in different colours with nothing on screen explaining it.

## v46 — shipped and verified (2026-08-03)

1. ✅ **Pushed to `main`** (`337b6f5`, `f579ecf`) — frontend live on GitHub Pages, APK built by CI. `APP_VERSION` and `sw.js` `CACHE_NAME` both at **v46**. No rules or functions changed, so **no `./deploy.sh` was needed** and none should be run: it would redeploy identical rules for no reason.
2. ✅ **Live club confirmed unchanged** — roster, players and injuries all render as before. `nDLJCpJfDvFHs8MnwtzW` has no `seasonBoundary` field, so `seasonStartStr()` still returns 15 August. That was the entire safety claim of the change.
3. ✅ **Demo club seeded** — `Tm96gel58VSQvxgynf45`, see below.

Remaining: the APK on the phones is still the v43-era build (deliberate, see Open items). **Use the web app for demos.**

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI build on push to `main`; rules/functions = `./deploy.sh` in Cloud Shell. One-off scripts live in `functions/` (root npm installs are broken on Cloud Shell).
- **Production is on v45 (web), fully sharded.** `phase5-sharding` is merged into `main` and everything is deployed: frontend, functions, and the narrowed read rule. Working tree clean, nothing unpushed.
- **Category separation is now enforced by the database**, not by what the UI chooses to show. A coach scoped to one category cannot read another's data documents — medical records included.
- **Tests run on this Windows box.** `cd test && npm test` runs everything; `npm run test:unit` is the fast path (shard + router, pure Node, ~1s, no emulator and no Java), `npm run test:rules` needs the Firestore emulator and `npm run test:functions` needs Firestore + Functions, both against the fake project `demo-esquerrapp`. **143 passing: 42 unit + 87 rules + 14 functions.** If a suite says `Could not spawn java -version`, Java is installed but off this shell's PATH:
  `$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin;$env:PATH"`

### Open items (none are blocking)

1. **The APK has not been installed on the phones yet — deliberately parked.** CI has built it (v44, and again at v45). Old v43 builds address documents nobody writes and will show an **empty app** — that is what the v43 version check exists to warn about. **Set `clubs/nDLJCpJfDvFHs8MnwtzW.minAppVersion` to the shipped version only once that APK is actually on the phones**, not before. Until then the web app is the working client.
2. ~~Roster → player detail shows no injury history.~~ **Fixed and deployed in v45** — `buildInjuryHistoryHtml(uid)` is now shared by "My stats" and the staff view, with the hover popup and the `KEY_PAGES.fa_injuries` re-render wired for `staff-player-stats` too. Confirmed working in production; the APK is a version behind by choice.
3. **Three stranded accounts** (`mariogbaena@`, `oriol.garciaizq@`, `argi@esquerra.com`) still carry `teamId: 'default'` with `cats: []`. `teams/default`'s data was wiped; the accounts remain. The owner has said losing them is fine — delete or re-invite whenever.

### Clubs in production (verified 2026-08-03, post-cutover)

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, only `amateur` enabled. 15 accounts, **all carrying `cats: ["amateur"]`** — checked before the read narrowing, which is why nobody went dark.
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona test club, lead `test@test.com` … `test@barcelona.com` has `cats: ["juvenil"]`, `testjugador1@barcelona.com` has `cats: []`.
- `teams/default` — the pre-migration legacy club. Data wiped at cutover; no `clubs/default` doc exists, so it is unreachable.

## Phase 5 — split club data per category (COMPLETE)

Full plan: `~/.claude/plans/working-on-the-esquerrapp-ticklish-beaver.md`. Category scoping used to be **cosmetic**: every data type was one club-wide blob, and rules cannot read inside a JSON string, so a cadet coach was merely *not shown* juvenil's data — medical records included. It is real now.

Architecture detail lives in CONTEXT.md. The shape of it:

- **`js/shard.js`** — routing table and pure partition/merge, no browser globals, `module.exports`ed for Node tests. 17 keys, 3 shapes, 5 ways of finding a category. Joins resolve **live**, never stamped, so a promoted player's injury history follows him.
- **`js/db.js`** — shadow cache (key → category → JSON string), per-document diff, deterministic merge order, one `db.batch()` per blob so a row moving between categories cannot be deleted from its old shard while the add to the new one fails. `localStorage` stays byte-identical — one merged blob per key — so the ~128 read sites in app.js were untouched.
- **Reads are scoped**: the `data/` `.get()` and `onSnapshot` run `where('category','in', scope)`, and the same list is the router's write assert. `_scope` is the READ scope, not the UI's category filter.
- **Cloud Functions** address shards throughout; `onMemberCategoryChanged` → `reshardMember` moves a member's roster-joined rows when their category changes.

### The cutover, as it actually ran (2026-08-03)

Order mattered and held: rules (write allowlist, read temporarily permissive) → functions → wipe → frontend → verify → rules again (read narrowing restored, commit `6a3341f` reverting `3fe7bb7`).

- **Wiped**: 37 data docs and 108 record docs across three teams, plus `pushQueue` and both date arrays. `teams/default`'s 69 trainings went with it, by explicit decision.
- **`fa_users` rebuilt itself** from the kept `users/` collection on first login, exactly as the wipe design assumed. This is the one behaviour the whole "wipe instead of migrate" decision rested on, and it worked in production.
- **Verified in production**: 6 shards on the live club, every id `{key}__amateur` and every one carrying a `category` field; `trainingDates` repopulated by the `updateTeamDates` trigger; app normal after the read narrowing.
- **`backfill-team-dates.js` was a no-op** and was skipped — after a full wipe there are no shards to rebuild from, and the wipe already set both arrays to `[]`. It stays the repair tool if reminders ever go quiet.

### What cost the most time: Application Default Credentials

The wipe script died on its first read with `Cannot create property 'refresh_token' on string ''` — **twenty minutes lost**, and the diagnosis in the old handoff (`gcloud auth login`) was wrong.

**Superseded 2026-08-03 — see "ADC on Cloud Shell" under Demo club.** The `GOOGLE_APPLICATION_CREDENTIALS` export described here is not the fix and is itself a trap: Cloud Shell's metadata server supplies ADC with no setup, and a *stale* value of that variable is the thing that actually breaks the Admin SDK. If a script cannot authenticate, `unset GOOGLE_APPLICATION_CREDENTIALS` before anything else.

Still true regardless: `firebase` and `gcloud` keep their own separate credentials, which is why `./deploy.sh` kept working the whole time the Admin SDK was broken. And `node -e` resolves modules from the **current directory**, so Admin SDK one-liners must run from `~/EsquerrApp/functions`, not the repo root.

### Deliberately not done in this phase

- **The three per-record collections (`trainingAvail`, `matchAvail`, `rpe`) are still club-wide readable.** The plan has them gaining a `category` field, but no stage owned it and the sensitive data — medical — lives in `data/fa_injuries`, which is scoped. Doing it means stamping six `ackSaveRecord` sites, narrowing three listeners and three rules, and it strands a moved player's records the same way the joined `data/` routes did (so it needs `reshardMember` extending too). An incremental privacy improvement, not a blocker.
- Linked match/training tactic board copies are still matched by **name**; now that data is sharded the same name can exist in two categories. Pre-existing, untouched.

## Demo club (v46, `functions/seed-demo-club.js`)

A full season for showing the app to prospects: 25 players, 34 matchdays, 68 trainings, ~3,000 documents, in a **club of its own**. Not yet run — no demo club exists in production.

**Live since 2026-08-03.** Substitute the id into every command below:

| | |
|---|---|
| club id | `Tm96gel58VSQvxgynf45` |
| join code | `9CA4RR` |
| coach (lead) | `coach@demo.esquerrapp.app` / `DemoEsquerra2026!` |
| physio | `fisio@demo.esquerrapp.app` / `DemoEsquerra2026!` |
| players | `player01@…` – `player25@demo.esquerrapp.app`, same password |
| season | 2026-03-01 → 2027-02-28 (`seasonBoundary: '03-01'`) |

```bash
cd ~/EsquerrApp
node functions/seed-demo-club.js                       # dry run — OFFLINE, no credentials
node functions/seed-demo-club.js --apply               # create; prints id + join code
node functions/seed-demo-club.js --verify --club Tm96gel58VSQvxgynf45
node functions/seed-demo-club.js --apply --purge Tm96gel58VSQvxgynf45   # delete it all

# Profile pictures (v47). Upload the folder to Cloud Shell ONCE — its home
# directory persists — then re-seed in place. Name files after the slug
# (player01.jpg … player25.jpg, coach.jpg, fisio.jpg) or drop in any images
# and they are handed out alphabetically. Fewer than 27 is fine.
node functions/seed-demo-club.js --apply --club Tm96gel58VSQvxgynf45 --faces ~/demo-faces
```

Pictures go to `profilePics/{uid}.{ext}`, the same path real uploads use, and are written to **both** `users/{uid}` and the `fa_users` shard — the roster reads the shard, the profile screen reads the doc. `--verify` checks the two agree and that every URL resolves to a real object; `--purge` deletes the blobs. Use AI-generated faces: these are shown to prospective clients, and photos of identifiable real people carry likeness questions that synthetic ones do not.

### ADC on Cloud Shell — the guidance that was wrong twice

**Do nothing. Cloud Shell is a GCE VM and its metadata server already supplies Application Default Credentials.** The Admin SDK picks them up with no setup at all.

The two failures this note used to cause, both fixed:

- `gcloud auth application-default set-quota-project` only *re-points* credentials that already exist. On a session that has none it fails with "Application default credentials have not been set up" — and prints no path.
- `gcloud auth application-default login` then warns that it is **unnecessary on a GCE VM** and that personal credentials on a shared VM disk are a downgrade. Answer **N**.

The one thing that genuinely breaks it: **a stale `GOOGLE_APPLICATION_CREDENTIALS`**. If it is set, the SDK reads that file *instead of* the metadata credentials, and a wrong path kills every call. If anything looks unauthenticated, `unset GOOGLE_APPLICATION_CREDENTIALS` first. `gcloud config set project esquerrapp` if a quota project is wanted.

`--apply` runs a credentials preflight before its first write, so a bad setup is refused outright instead of leaving a half-created club — which is exactly what happened on the first attempt.

- **The dry run needs no credentials and writes nothing** — the season is generated and self-checked in memory. Fourteen consistency checks run before any write and refuse it on failure. Read it in full first.
- **Safety**: everything created is stamped `demoSeed: true`. `--purge` refuses any club without the stamp, refuses the live club and the Barcelona test club outright, and skips unstamped accounts. The live club cannot be reached by this script.
- **Re-running is idempotent** — uids derive from the club id, so `--apply --club <id>` overwrites the same accounts and the demo credentials keep working.
- **Credentials it creates**: `coach@demo.esquerrapp.app` (lead), `fisio@demo.esquerrapp.app`, `player01@…`–`player25@…`, all with the password printed at the end (`--password` to change it). The lead login is the one to demo from; a player login shows the player side.
- **The season boundary is derived from the run date**, five months back, and written to `clubs/{id}.seasonBoundary`. That is what keeps "today" mid-season whenever it is run, so the demo has both history and upcoming fixtures. Verified across five run dates from 2026-08 to 2027-06. **Just re-run it** whenever the demo starts looking thin — there is no fixed expiry date to diary.
- `teams/{id}.trainingDates` / `.matchDates` are filled by the `updateTeamDates` trigger. If reminders look wrong afterwards: `node functions/backfill-team-dates.js`.

## Known trade-offs / notes

- A shard document written without a `category` field is invisible to the scoped query — going dark, not merely misfiled. Everything the router and the functions write sets it.
- **`admin.firestore.FieldValue` is undefined inside the Functions emulator** — firebase-tools stubs firebase-admin and returns `firestore` *bound*, which drops its statics. `functions/index.js` imports `FieldValue` from `firebase-admin/firestore`; keep new code doing the same or it works in production and throws in every test. The one-off scripts in `functions/` still use the namespaced form — they only ever run under plain Node.
- Whole-blob writers that filter must carry out-of-scope entries through explicitly (matchday drafts and notifications already do). Any new page that filters and then saves must do the same, or it deletes what it isn't showing.
- The lead and superuser always bypass the registration gate, so a new club can be bootstrapped with empty lists.
- **Distribution: keep APK assets bundled.** Pointing the shell at a live URL (`server.url`) would end staleness instantly but is a reliable App Store rejection (guideline 4.2), and Play + App Store are on the roadmap. The store-friendly path is bundled assets plus an OTA bundle swap; the v43 version check is the stepping stone to either.
- Legacy availability/RPE `data/` docs are **gone** — the cutover wipe took them along with everything else in `data/`, so the Phase 3b rollback net no longer exists. `migrate-player-data.js --delete-legacy` is now moot.
- Still outstanding elsewhere: Firebase Hosting migration (real cache-control), multi-club membership (`teamId` is single-valued, so one account cannot be in two clubs), deleting `fa_users` in favour of the `users` collection, read-time fitness derivation.
- Uncategorised players are excluded by medical and roster but included by training-detail — three staff pages, two semantics.
- Cloud Shell gotchas: `.firebaserc` is tracked — never `rm` it; scripts run from the **repo root** (`cd ~/EsquerrApp` first — a script run from `~` fails with MODULE_NOT_FOUND) except Admin SDK one-liners, which need `functions/`; read every dry-run before `--apply`; backup bucket is `gs://esquerrapp-backup` (singular). For the ADC error, see the section above — it is not a lapsed login.
- This machine mojibakes Catalan accents through PowerShell `Set-Content` — use the editor for all file writes.

## Lessons that keep repeating

- **Silent-write failures.** A control appears to work, the local blob updates, the server write is rejected or never made. Hit three times in Phase 4. The Stage B shadow-cache rollback exists for exactly this shape.
- **Read one-off scripts before running them.** `backfill-claims.js` predated Phase 4 and would have stripped every user's `cats` claim.
- **Measure layout bugs; do not reason about them.** The bottom-of-page strip took four attempts, two reasoned from the stylesheet and both wrong.
- **Check the claims before narrowing a rule that reads them.** One `listUsers` call proved all 15 live accounts had `cats: ["amateur"]`, which turned the riskiest step of the cutover into a formality. Behaviour under a permissive rule tells you nothing about behaviour under a narrow one.
- **A bug found during a cutover is not necessarily caused by it.** The missing injury history looked like a sharding fault; the diff showed Phase 5 touched no injury code, and the feature had simply never existed on that page.
