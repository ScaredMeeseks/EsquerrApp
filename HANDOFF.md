# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-04._

**Production is on v54; v55 is built and tested but NOT deployed** (see the runbook below). v46–v52 all shipped: per-club season boundary + demo-club seeder, three demo-walkthrough fixes, the staff home page, two navigation fixes and two rounds of performance work, then readiness presentation. Frontend-only throughout — **no rules or functions have changed since Phase 5**, so `./deploy.sh` has not been needed. Tests **202 passing** (101 unit + 87 rules + 14 functions), up from 143.

The demo club is live and seeded with faces (`Tm96gel58VSQvxgynf45`, see Demo club below).

## Backlog — requested 2026-08-04

### Superadmin sets how many teams a lead may create

**Decided 2026-08-04:** `maxTeams` defaults to **1**, 1 is also the minimum, and a **missing field means 1** — a club that exists has at least one team. The lead may then create up to whatever the superadmin has allowed. **This is a commercial constraint**, which is what decides the implementation.

A "team" is a `{category}-{letter}` pair, created by the lead through *Editar categories* (`showTeamSetup()`). The quota is on the count of enabled combinations — what `rosterKeys()` returns.

**Because it is commercial, the UI cannot be the enforcement point.** `firestore.rules` currently allows the lead to update *any* field on their own club doc:

```
match /clubs/{clubId} {
  allow update: if isSuperUser() || isLeadOf(clubId);
}
```

So a lead could raise their own `maxTeams`, or write `categories` past it, straight from the console. Two things have to change together:

1. **`maxTeams` must be superadmin-only.** Narrow the lead's update with a `hasOnly()` allowlist that excludes it — the same split `users/{uid}` already uses for server-owned fields (`firestore.rules`, the `hasOnly(['position','playerNumber',…])` clause).
2. **The quota check has to run server-side.** Recommended: a `setClubCategories` callable that validates the count before writing, which is exactly why `joinClub`, `setRole` and `deleteMember` are callables. Expressing "count enabled categories × their letters ≤ maxTeams" in rules alone means unrolling all six categories by hand — possible, unpleasant, and easy to get subtly wrong.

**The trap to avoid: never enforce on the absolute count.** A club that is already over quota when this ships must stay editable — if the rule or callable rejects any write where `teams > maxTeams`, the lead of an over-quota club is locked out of editing *anything*, including removing a team to get back under. Enforce on **increase**: a write that does not add a team is always allowed. Existing teams are grandfathered, never removed retroactively.

**Pre-flight before deploying:** count the enabled `{category}-{letter}` pairs on every production club and check which would be over a default of 1. The live club and the demo club each have one (`amateur-A`), but the F.C.Barcelona test club (`lly4GkUxIpBkSgZvzldT`) has juvenil accounts, so it may have more. Read-only, one Admin SDK script.

Open sub-question: does the superadmin set a number of *teams* (letters, across all categories), or a number of *categories*? "3 teams" could mean amateur-A/B/C or amateur-A + juvenil-A + cadet-A. The wording above assumes the former — worth confirming, because it changes the UI.

## v56 — team quota, DEPLOY 2 of 2: deletion + the gate (2026-08-04)

The destructive half. **Not yet deployed.** `deleteTeam` erases one `{category}-{letter}` and everything belonging to it **except the Auth accounts** — its players are detached (profile kept, `category`/`team` cleared) and show as unassigned.

- **Shards are per category, not per letter**, so this filters rows inside documents the surviving team co-owns. A whole-document delete would take both teams.
- **Three ordering constraints**, each a different silent failure: capture match ids before filtering matches; delete the roster doc **last** (or `reshardMember` moves the medical data out from under the delete); refresh claims **early**.
- **Re-running is safe.** A letter already gone from the config means *resume*, not error — that plus the marker doc is the whole partial-failure story.
- **Kept on purpose:** matches with no team letter, and the category's trainings unless this was its last team.
- **The gate**: lead → straight to the category screen; staff → "Contact your lead…" and nothing clickable; **players unaffected**.

**286 tests passing** (162 unit + 93 rules + 31 functions).

### Runbook

```bash
cd ~/EsquerrApp && git pull
./deploy.sh functions     # deleteTeam + the setClubCategories change
./deploy.sh rules         # the teamDeletions marker rule
# then push main (frontend), or confirm Pages already redeployed
```

Rules and functions both changed this time, so **both** are needed — unlike v47–v55, which were frontend-only.

### Try it on the demo club first

`Tm96gel58VSQvxgynf45` has one team, so give it a second before testing deletion: raise `maxTeams` to 2 in the superadmin club list, add `amateur-B`, then delete it. Check afterwards that the players still exist in Auth and appear as unassigned in Registrations.

**Known residual risk:** every client holds the whole blob and writes it back wholesale, so a coach saving *during* a delete can resurrect rows. The early claim refresh closes this when the category is emptied; when the category survives, nothing in the current architecture closes it. Delete when the club is idle — and a second run is safe and cheap.

## v55 — team quota, DEPLOY 1 of 2 (2026-08-04)

The first commercial constraint: `clubs/{id}.maxTeams` caps how many `{category}-{letter}` teams a lead may create. **Not yet deployed — see the runbook below, the order matters.**

- **`setClubCategories` is now the only writer of a club's team layout.** The rules no longer let a lead write `categories` or `maxTeams` at all; a lead could previously have raised their own quota from a console.
- **The quota is an INCREASE test** (`next > max && next > prev`), which is what makes grandfathering safe: a club above its allowance can still save and still remove a team, and is only stopped from growing.
- **Old APKs keep working** via a `diff().affectedKeys().hasOnly(['fcfLinks','schedules'])` shim — an unchanged `categories` map is not in the diff. Verified against the emulator; drop the clause once a v55+ APK circulates.
- **Two pre-existing bugs fixed**: ticking a category created *two* teams (`['A','B']` default), and a lead's `cats` claim was never refreshed when categories changed — which meant enabling a new category caused `permission-denied` on the whole data listener.
- **Removals are refused in deploy 1.** Deploy 2 adds `deleteTeam`.

**248 tests passing** (141 unit + 93 rules + 14 functions).

### Runbook — this order has no broken window

```bash
cd ~/EsquerrApp && git pull

# 1. Grandfather existing clubs. Dry run first; read it.
node functions/migrate-max-teams.js
node functions/migrate-max-teams.js --apply

# 2. Functions: the callable exists, nothing calls it yet.
./deploy.sh functions

# 3. Push main: the frontend starts using the callable. Old rules still
#    allow the direct write, so old and new clients both work.

# 4. Rules LAST: narrows clubs/{clubId}.
./deploy.sh rules
```

**Step 3 before step 4.** The reverse leaves a window where every lead on a cached frontend gets `permission-denied` saving team setup.

**Do not lower any club's `maxTeams` below its current count until deploy 2 is live** — until `deleteTeam` exists, an over-quota lead has no way to resolve it.

### Deploy 2 — still to build

`deleteTeam` callable + the over-quota gate (staff see "Contact your lead…", the lead is routed to the category screen). Full design in `~/.claude/plans/continuing-on-the-esquerrapp-streamed-waffle.md`, including the three load-bearing ordering constraints: capture match ids before filtering matches, delete the roster doc **last** (or `reshardMember` moves the data out from under the delete), and refresh claims **early**.

## v53/v54 — readiness score colour + column headers (2026-08-04)

- **v53**: the readiness number now uses the dot's *exact* colour. It had been set a shade darker for text contrast, which made the pair read as two signals rather than one. Note: `#4caf50` and `#ff9800` as small bold text sit below the WCAG 4.5:1 ratio on white — reverting to the darker text is a three-line CSS change if it proves hard to read outdoors.
- **v54**: roster and training-detail column headers renamed — **Estat → Estat Mèdic**, **Punt → Forma Física** (`Estado Médico` / `Forma Física`, `Medical Status` / `Fitness`). Both tables show the same two columns, so both key pairs changed; `training.th_status` and `reg.th_status` mean different things and were left alone. The new labels are ~3× wider and `.roster-table th` is `nowrap`, so those two headers now wrap over two lines rather than pushing an 11-column table into horizontal scroll on a phone. **Worth eyeballing on mobile.**

## v52 — readiness presentation (2026-08-04)

The parked readiness item, **presentation only** — the sports-science thresholds are untouched.

**The bug worth knowing about:** a player with not enough data rendered **green** everywhere. The live club's data was wiped at the Phase 5 cutover, so almost nobody had the 2 weeks of RPE history required — the roster was telling coaches a squad the app knew nothing about was fully ready.

- **No data → grey dot, no number**, tooltip "not enough data yet". The A/C ratio cell had the same fallback and is grey now too.
- **The score shows in the cell**, not only in a mouse tooltip — it was invisible on phones.
- **Injured players keep their load colour** (readiness is a load metric and does not read the injury log) but the cell now warns "Careful — player currently injured", so the Ready and Status columns stop appearing to contradict each other.
- Roster, training detail and convocatòria now share `readinessCellHtml()` instead of three drifted copies.

New `test/readiness.test.js` (13 tests). **202 passing.** Frontend only — push to `main`, no `./deploy.sh`.

### Still open on readiness (calibration, not presentation)

- The classifier flags roughly **two thirds of a squad** orange or red. Worth calibrating against real data — I offered to report the distribution per rule whenever you want it.
- **Colour is not a function of the score**: it comes from a separate ACWR + risk-flag + force-override classifier, so two players can both show 72 in different colours with nothing on screen explaining why.

## v51 — performance sweep (2026-08-03)

The same parse-per-call pattern v50 fixed, found in the two other helpers that run once per player. The roster was doing **~1,050 parses per render** (25 players × 42): `deriveFitnessStatus()` parsed 5 blobs per call, `computePlayerMatchStats()` 3 more plus `getStartingXI()` once per match. **69 ms → 0.4 ms.**

`fitnessContext()` / `matchStatsContext()` build the blobs once; both helpers take an **optional** context, so the 15 call sites that pass nothing are untouched. Hoisted at the five that loop players: roster, medical, staff training detail, convocatòria.

**Deliberately not a global blob cache.** A shared `readBlob(key)` memo would have fixed everything at once with no signature changes, but several read paths feed read-modify-write cycles (`getInjuries()` → mutate → `saveInjuries()`), and a caller mutating a shared object leaves phantom data in the cache. Not worth 0.4 ms.

New `test/context.test.js` (11 tests) pinning the one property it all rests on: **passing a context must never change the answer.** **189 passing.** Frontend only — push to `main`, no `./deploy.sh`.

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

### Deferred, agreed 2026-08-03 — readiness colouring (PRESENTATION DONE in v52; calibration still open)

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
