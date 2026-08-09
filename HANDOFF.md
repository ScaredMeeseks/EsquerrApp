# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-09._

**Production is on v85.** Tests **641 passing** (449 unit + 133 rules + 50 functions + 9 backfill), up from 541 at the start of this session.

This session did the tactical-board governance programme end to end — stages 0 to 4 of `~/.claude/plans/working-on-esquerrapp-i-nifty-sunset.md` — plus two reported bugs and a move of deploys off Cloud Shell. Rules and functions were deployed and verified 2026-08-08. Frontend is at v85.

---

## Deploys now run LOCALLY

`firebase-tools` 15.x is installed on the Windows box and `marna96@gmail.com` is bound to the EsquerrApp directory (`firebase login:use`, which is per-directory — `administracion@mov-ment.com` still owns Movment and **cannot see** `esquerrapp`).

```powershell
cd c:\DATA\CLAUDE\EsquerrApp
.\deploy.ps1 rules -DryRun     # validate, release nothing
.\deploy.ps1 rules             # firestore + storage rules
.\deploy.ps1 functions         # cloud functions  (-Install to npm install first)
.\deploy.ps1 all
```

`deploy.ps1` pins itself to `$PSScriptRoot`, so it deploys EsquerrApp even when invoked from another project's folder (verified). It does **not** `git pull`, unlike `deploy.sh`.

**Two local-only failure modes, both of which read like broken code:**

- `Cannot determine backend specification. Timeout after 10000` — the CLI spawns `functions/index.js` to read its exports within 10s. The module loads in ~0.5s warm; a **cold `node_modules`** on Windows blows past it. `deploy.ps1` sets `FUNCTIONS_DISCOVERY_TIMEOUT=120`.
- `Cannot find module '@firebase/app'`, **every** function failing its health check — `functions/package-lock.json` is **gitignored**, so Cloud Shell never had one and always resolved fresh. A local deploy uploads whatever lock is on disk; a stale one makes `npm ci` build a container missing a transitive dependency. **Production survives it** (Cloud Run does not route to a revision that fails its health check). `deploy.ps1` now refuses to start when the lock is present.

**Cloud Shell is still required for the Admin SDK scripts** — no `gcloud` and no service-account key on this machine. The upside is that deploys and scripts no longer share a session, which is what used to cost a VM restart.

## Never write files with PowerShell `Set-Content`

Documented in CLAUDE.md now, with the reversal recipe. It bit again this session: a one-line version bump corrupted every accent in three files including `app.js`. Recovered by re-encoding through CP1252 — `git diff` afterwards should show only the lines you meant to change.

---

## Parking lot — what's left

Ordered roughly by what I would pick up next. Nothing here is blocking.

### 1. Training detail / session planning (reported 2026-08-09)

Four related items, all on the staff training-detail page:

- **Total expected players next to "Assistència Jugadors"** — when a session is generated, show the count of players expected, beside the heading.
- **Strike through a player who did not attend** in the teams associated with an exercise. Teams are generated ahead of the session; if somebody then does not turn up, the coach needs to see at a glance that a replacement is needed, rather than discovering it on the pitch.
- **"Planificació entrenament" sits too far right** — make its width and "Assistència jugadors"' width equal.
- **Make "Planificació entrenament" editable** — it currently only takes the titles associated with the tactical boards. The coach should also be able to write notes and free text there.

The first two touch `renderGeneratedTeams` / `renderStdBoardsSection`; the last two are the planning panel. Note v85 just changed the squad plumbing underneath all of this (`calledPlayers`, session-not-date), so read that section of CONTEXT.md first.

### 2. Drop dual-write — GATED ON AN APK BEING INSTALLED

`TB_DUAL_WRITE = true` in `app.js` keeps mirroring the board library into `fa_tactic_saved` for the v43-era APK, with `frames` and `penLines` stripped. Turning it off:

- flip the constant
- drop `fa_tactic_saved` from `SYNCED_KEYS` (`js/db.js`)
- drop the fat-copy spread in `tbSessionRef`
- run a `--gc` sweep to delete the old shards

**Do not take this step until a current APK is actually on the phones.** Old builds would stop seeing boards entirely. Note the old APK has ALREADY lost animation playback as of v83 — the frames cap is what closed the 1 MiB document limit without waiting.

### 3. The APK itself

CI has built through v85; the phones are still on a v43-era build. Set `clubs/nDLJCpJfDvFHs8MnwtzW.minAppVersion` **only once a current APK is installed**, not before. The web app is the working client meanwhile. This one blocks item 2.

### 4. Readiness — done for now; revisit with REAL data

Flagging is down from **76% → 40%**, green **24% → 48%** (v52, v59, v60, v61). What is left is not a code question: **every measurement so far is against synthetic demo data**. Re-run the distribution script against real data before touching another threshold. The one open *design* question, not a defect: the colour is not a function of the score, so two players can show 72 in different colours.

### 5. Drop the old-APK rules shim

`clubs/{clubId}` still lets a lead write `fcfLinks`/`schedules` directly, purely so pre-v55 APKs keep working. Delete that clause once a v55+ APK circulates; guarded by a rules test pinning the `diff()` behaviour.

### 6. Smaller / older

- **Three stranded accounts** on `teamId: 'default'` with `cats: []` — losing them is fine.
- **`trainingAvail` / `matchAvail` / `rpe` are still club-wide readable.** Phase 5 stopped short deliberately; the sensitive data (medical) *is* scoped.
- **Orphaned shards when a category is emptied** — `deleteTeam` removes the category's trainings but leaves `fa_tactic_saved__{cat}` and `fa_tactic_training_boards__{cat}` unreadable. A `--gc` sweep would clear them; fold into item 2.
- **Uncategorised players**: excluded by medical and roster, included by training-detail — three staff pages, two semantics.
- **Superadmin template UI is not built.** `promoteBoardTemplate` and `seedClubFromTemplates` are deployed and tested but nothing calls them yet — see "Tactic boards" below.
- Firebase Hosting migration (real cache-control); multi-club membership (`teamId` is single-valued); delete `fa_users` in favour of the `users` collection; read-time fitness derivation.

### Known residual risk (accepted, not a bug)

A client saving **during** a `deleteTeam` can republish rows, because every client holds the whole blob and writes it back wholesale. v57 retries once and reports `resurrected` in the marker doc. Re-running is safe.

---

## Tactic boards — what shipped this session

Full architecture in CONTEXT.md. The shape of it:

**The model.** One document per board instead of one blob per category: `tacticBoards/{id}` (metadata, listed) and `tacticBoardData/{id}` (payload, a JSON string). Two read arms and only two — the board's **club**, and the **creator wherever they are now**, because `teamId` is single-valued and a coach who moves club would otherwise lose every board they ever drew. `clubId` is a scalar forced to the creator's token at create and immutable after, which answers "what stops a coach planting a board in someone else's library" by construction.

**Why it mattered.** A category's whole library was one document: unsaveable at ~85 boards, and ~8 MB was being pulled on every cold login. Boards were also COPIED into every linked session and re-synced by matching on NAME.

**Authors.** `clubs/{clubId}/boardAuthors/{uid}`, Admin-SDK-only, maintained by six call sites across five functions. Highest category = **lowest** `CATEGORY_ORDER` index. Leaving **freezes** the label by writing only the status fields, so "their last team in this club" needs no snapshotting logic — it is what is already stored, left alone.

**Migration.** `functions/backfill-tactic-boards.js`, run 2026-08-08 with `--apply --authors`. Legacy boards land `ownerUid: ''` because there is genuinely no author information to recover; attributing them to the lead would be a lie that also followed them to their next club through the owner read arm. Unowned boards are adoptable in one click. **The old shards were not deleted** — see item 2.

**Templates.** Two superuser callables, deployed and tested, **no UI yet**. Promotion takes an anonymised COPY (the strip parses and re-stringifies, so removing `linkedTeams` is real); seeding copies into the club so it can edit and delete its own starter set.

### If a board looks wrong, check these first

- **`ownerUid: ''` is normal** for anything migrated. It means "a board of the club, authored by nobody in particular", and Save is hidden until somebody adopts it.
- **Linking never writes the board.** If "Add to training" fails, it is not a permissions problem with linking — look at whether something is trying to save.
- The **club library is deliberately never category-filtered**; `'tactics'` is intentionally NOT in `CATEGORY_PAGES`.

---

## Read this before debugging "the fix didn't work"

`sw.js` is network-first for JS/CSS, but a plain `fetch(event.request)` is answered from the **browser's HTTP cache**. Fixed in v80, and the check is still worth running before diagnosing anything that looks like a fix not landing:

```js
(async () => {
  const server = (await (await fetch('sw.js', {cache:'no-store'})).text()).match(/CACHE_NAME\s*=\s*'([^']+)'/)[1];
  console.log('server:', server, '| TB:', typeof TB !== 'undefined' ? Object.keys(TB).join(', ') : 'MISSING — old build');
})();
```

The `TB` line is the decisive one: it proves the *new code* is executing, which a version string cached alongside stale JS does not.

---

## Cloud Shell: a deploy DOES strip gcloud's identity

Still true, still worth knowing for the Admin SDK scripts. Symptom: `Cannot create property 'refresh_token' on string ''` while `firebase deploy` keeps working — because the CLI uses its own stored login, not ADC. **The one diagnostic: `gcloud auth list`.** "No credentialed accounts" means restart the VM (three-dots → Restart, not a new tab). `functions/preflight-adc.js` catches this in every script.

Do **not** run `gcloud auth application-default login` — Cloud Shell's metadata server already supplies ADC. A stale `GOOGLE_APPLICATION_CREDENTIALS` is the one thing that genuinely breaks it.

**Still to do:** `functions/backfill-training-teams.js` has no `preflight()`; copy it from `seed-demo-club.js`.

---

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI on push to `main`; rules/functions = `.\deploy.ps1` locally.
- **`main` is at v85, working tree clean, nothing unpushed.**
- Tests run on this Windows box: `cd test && npm test`. Fast path `npm run test:unit` (~1s, no Java). `npm run test:rules` and `npm run test:functions` need the emulator; `npm run test:backfill-boards` drives the real backfill script against it. If a suite says `Could not spawn java -version`:
  `$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin;$env:PATH"`
- **New test files must be added to `test:unit` / `test:functions` by hand** — the script lists files explicitly, so an unregistered file silently never runs.

### Clubs in production

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, only `amateur` enabled.
- `Tm96gel58VSQvxgynf45` — **demo club**, join code `9CA4RR`, `coach@demo.esquerrapp.app` / `DemoEsquerra2026!` (also `fisio@` and `player01@`–`player25@`, plus `amateurb-player01@` / `juvenila-player01@`). Re-run the seeder whenever it looks thin — the season boundary derives from the run date, so there is no expiry to diary. Full reference in CONTEXT.md; the commands:

  ```bash
  node functions/seed-demo-club.js                       # dry run — OFFLINE, no credentials
  node functions/seed-demo-club.js --verify --club Tm96gel58VSQvxgynf45
  node functions/seed-demo-club.js --apply --club Tm96gel58VSQvxgynf45 --faces ~/demo-faces
  node functions/seed-demo-club.js --apply --purge Tm96gel58VSQvxgynf45   # refuses unstamped clubs
  ```
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona test club.

---

## Lessons that keep repeating

- **Silent-write failures.** A control appears to work, the local blob updates, the server write is rejected or never made.
- **Read one-off scripts before running them.** `backfill-claims.js` predated Phase 4 and would have stripped every user's `cats` claim.
- **Measure layout bugs; do not reason about them.** The bottom-of-page strip took four attempts, two reasoned from the stylesheet and both wrong.
- **Check the claims before narrowing a rule that reads them.**
- **A bug found during a change is not necessarily caused by it.** The formation leak and the replay flash landed in the same session and were unrelated; v85 turned up two pre-existing defects while fixing a third.
- **When the client gets a permission error, suspect the client.** The linking failure looked like a rules bug; the rules were correct and the client was asking for the wrong permission.
- **Source-assertion tests earn their keep.** The `buildBoardEntry` call-site guard fired three times this session, and was right every time — twice flagging genuine architectural drift, once pushing toward a better implementation.
