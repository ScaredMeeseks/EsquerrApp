# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-22._

## ⚠ Read this first: v116 AND v117 are written, neither is shipped

`main` is still at **v115** (`cebf286`). Two versions of work sit in the working tree,
uncommitted. v117 was written on top of v116 without committing v116 first, so they ship
together.

```
 M CONTEXT.md  HANDOFF.md  css/style.css  firestore.rules
 M functions/check-deploy.js  functions/index.js  index.html
 M js/app.js  js/db.js  js/utils.js  sw.js  test/package.json  test/rules.test.js
?? functions/fcf.js  js/match-notes.js  test/fixtures/
?? test/fcf.test.js  test/fcf-app.test.js  test/match-legs.test.js
?? test/match-notes.test.js  test/match-notes-render.test.js
```

`test/fixtures/` is new and untracked — it holds the two captured FCF payloads the unit tests
read. `git add -A` picks it up; do not let it be missed, the suite fails without it.

| | state |
|---|---|
| **firestore.rules** | **DEPLOYED** (v116's block, mid-session last time). v117 changes nothing in rules. Re-running `.\deploy.ps1 rules` is idempotent if in doubt. |
| **functions** | **NOT deployed, and v117 makes this URGENT.** See the deploy order below. |
| **frontend** | **NOT pushed.** `git add -A`, commit, push to `main`. That also triggers the APK CI build. |

### ⚠ Deploy order, and why it matters more than last session

```
1. .\deploy.ps1 functions      ← MUST be first
2. git add -A && git commit && git push
```

v117 changes the `fcfClassificacio` proxy from `?url=` to `?grupId=`. Pushing the frontend first
leaves every client calling a proxy that still demands the old parameter — **verified, not
assumed**: the currently deployed v116 proxy returns **400** for `?grupId=58161881`. The standings
would stay broken with a fresh version number on them.

`archiveSeason` and `deleteTeam` also changed in v116 and are still undeployed; neither runs until
a season rollover or a squad deletion, but the functions deploy above covers them too.

Version triple is consistent at **117**: `sw.js` `CACHE_NAME`, `js/app.js` `APP_VERSION`,
`functions/check-deploy.js` `CURRENT`.

**No `minAppVersion` bump.** An old APK never fetches `matchNotes`, and its standings are already
broken by fcf.cat's own rebuild — v117 does not make anything worse for it.

## Tests — all three suites green

```
834 unit    (was 769)      cd test && npm run test:unit
152 rules   (unchanged)    cd test && npm run test:rules
 71 functions (unchanged)  cd test && npm run test:functions
```

New this session, **both added to `test:unit` by hand** — the standing trap in this repo:
`test/fcf.test.js` (30) and `test/fcf-app.test.js` (29), plus 6 new cases in
`test/match-legs.test.js`. There is also a `test:fcf` shortcut.

> **`npm test` (the full chain) flakes.** The functions suite fails with
> `Cannot determine backend specification. Timeout after 10000` when it runs straight after the
> rules suite — the emulator's 10s function-discovery budget on a busy machine, the same trap
> `deploy.ps1` sets `FUNCTIONS_DISCOVERY_TIMEOUT=120` for. The three suites pass individually
> every time. Export that variable, or run them separately.

> **Do not serve the app on port 8080.** That is the Firestore emulator's port, and a
> `python -m http.server 8080` makes the whole rules suite fail with
> `501 Unsupported method ('PUT')`. Use 8000.

---

## What shipped: v117 — FCF standings, and an opponent picker fed by them

Full writeup in CONTEXT.md. The parts most likely to bite:

**fcf.cat's rebuild killed the scrape twice over.** The old
`https://www.fcf.cat/classificacio/…` addresses 307 to `/ca/classificacio/…` and then **404**, and
the page that replaced them ships no server-rendered table — the standings arrive from
`/api/competition/classificacio?grupId=…` after hydration. `parseFcfHtml()` is deleted.

**The new source is a public JSON API**, no key, no auth. Worth knowing what else is on it, since
the fixture-import idea in the parking lot lives here: `partidos?grupId=` gives the entire calendar
(jornada, kickoff, venue, coordinates, both escuts, scores), and `grupos` / `competicions` /
`disciplines` / `temporadas` walk the competition tree. **`equipos?grupId=` is broken on FCF's
side** — the same team repeated 16 times — so the team list comes from `classificacio`.

> ⚠ **`played`, `won`, `drawn` and `lost` are the home and away halves glued together as
> strings.** `played:"1515"` is 30. `won:"139"` is 22. `drawn:"05"` is 5. FCF's own site renders
> them raw and shows "1515", so this is their bug arriving in our JSON. The split is not
> recoverable — "139" is 13|9 or 1|39 and nothing chooses. **J is derived from
> `points / coefficient`** instead. If someone ever "fixes" `parseFcfClassificacio` by reading the
> field literally called `played`, `test/fcf.test.js` fails four ways.

**Every club must re-paste its FCF links.** There is no migration and there cannot be one: the old
slug names the group by name, and last season's at that. A saved old-format link now renders in
Team Setup with a ⚠ and the sentence that fixes it, and the standings table says so instead of
sitting there empty.

**The proxy takes a grupId, not a URL.** That is also the fix for a shape that was one loosened
regex character from an SSRF: the only thing a caller controls now is a run of digits.

**`fcfLookup` is EXACT-match, deliberately.** Picking a rival from the datalist inserts the
federation's own string and earns the fixture an `opponentTeamId`; typing "Can Buxeres FC" by hand
does not. An id is a claim of certainty, and `normTeamName` is tuned for a suggestion a human
confirms — the two leniencies are not interchangeable. `normTeamName` and the `Enllaçar`/`No`
confirm step **stay**, because every fixture already in the database predates the picker.

**`mdRowSquad()` is one definition, and that is load-bearing.** The ✓ beside the opponent box
promises the save will store an id. Written separately, the tick resolved the squad from the
active chip while the save used `g.team` — `''` for every club with one team per category, which
is most of them. Those clubs would have seen a ✓ and got no id. Found by reading, not by a test;
now pinned by four.

### What is NOT unit-tested, and why that is stated rather than faked

`renderOpponentDatalists()`, `markOpponentMatch()` and `refreshLeagueTables()` read and write a
live DOM, and this suite has no jsdom. A hand-rolled `document` stub would only assert that the
stub behaves the way the test author imagined. **These three need a browser check** — see below.
Everything that decides *what* they render is covered.

## Verify v117 by hand once functions are deployed

Serve on **port 8000** and sign in to the demo club as a coach.

1. **Team Setup → FCF links.** Paste
   `https://www.fcf.cat/ca/competicio?temporadaId=22&disciplinaId=19308233&competicioId=58161869&grupId=58161881&tab=classificacio`
   for `amateur-A`. Then paste an old `fcf.cat/classificacio/…` link and confirm the save is
   **blocked** with an inline message, not silently accepted.
2. **Player home → standings.** 16 rows, L'ESQUERRA DE L'EIXAMPLE highlighted (it is 6th in the
   array pre-season), badges loading from `files.fcf.cat`, and **J showing 0, never "1515"**.
   The pure path was confirmed end to end against live FCF this session; what needs eyes is the
   rendering.
3. **A league that cannot load says so.** Easiest check: leave a stale link saved and confirm the
   table shows the "enllaç antic" row rather than an empty body.
4. **Calendari → opponent box.** The 16 group teams autocomplete. Switch the squad letter on a
   row and confirm the list changes. Type a name freely and confirm it still saves.
5. **The ✓.** Pick a rival from the list — tick appears. Save, then confirm in the console that
   the match carries `opponentTeamId`:
   `JSON.parse(localStorage.fa_matches).slice(-1)[0]`
6. **The leg pairing via id.** Create that fixture's return with venues swapped and confirm the
   anada banner appears.
7. **Confirm the artefact, not the operation:**
   ```bash
   curl -s "https://scaredmeeseks.github.io/EsquerrApp/js/app.js?cb=$RANDOM" | grep APP_VERSION
   curl -s "https://scaredmeeseks.github.io/EsquerrApp/sw.js?cb=$RANDOM" | grep CACHE_NAME
   # both must say 117
   ```

Still outstanding from v116 and worth re-checking after the push: a player is DENIED on
`teams/{id}/matchNotes/{matchId}` (confirmed on localhost 2026-08-22), and the **scoreline fitter**
— jsdom has no layout so no test proves it; check a long club name shrinks the NAMES, not the
title.

---

## Parking lot

Renumbered items are the same items.

1. **Fixture import from `partidos?grupId=`.** Now clearly within reach and the natural next step:
   the endpoint gives dates, kick-off times, venues, coordinates and both escuts for the whole
   season. It needs its own data-model decisions (what wins when FCF and the coach disagree about
   a kick-off time) and was deliberately left out of v117.
2. **Opponent badges and league position on the match page.** `opponentBadge` is now stored, and
   `mnScoreBlockHtml()` / `mnLegBannerHtml()` already have the club names in hand. The position
   *at the time of the game* still has no source — the API only serves the current table.
3. **Neither week strip re-renders on a timer.** Pre-existing.
4. **The cross-category call-up** — decide before building. Within a category it already works;
   across them the picker filters to the coach's category and `getVisibleCategories()` returns
   `[s.category]` for a player, so he never downloads the other shard. Not a push blocker.
5. **Training detail / session planning** (reported 2026-08-09, untouched).
6. **Fill in `privacy.html`** — blocks both stores, no code dependency.
7. **The APK** — CI has built through v115; phones are on v43-era. Set
   `clubs/nDLJCpJfDvFHs8MnwtzW.minAppVersion` only once a current APK is actually installed.
8. **Drop dual-write** — `TB_DUAL_WRITE` still mirrors the board library into `fa_tactic_saved`.
   Gated on 7.
9. **Play Console** — $25 plus identity verification, then four secrets turn on the signed AAB.
10. **iOS** — the owner may have access to two Macs. Try web push on a home-screen PWA first
    (iOS 16.4+, and v95 shipped what it needs) before spending the $99.
11. **Readiness thresholds** — every measurement is against demo data that has since changed.
12. **Old-APK rules shim** — `clubs/{clubId}` still lets a lead write `fcfLinks`/`schedules`
    directly, bypassing the new server-side link validation in `setClubCategories`. Delete once a
    v55+ APK circulates.
13. **`scheduledMatchAvailReminder`** is the last `onSchedule` not checked for the interval/band
    traps v112 and v113 fixed.
14. **Push governance** — `firestore.rules` lets any team member enqueue a push to the whole team,
    with no staff check and no validation of `title`/`body`. `Push.sendToTeam` is dead code.
15. **The demo club's 19-vs-9** — still a hypothesis, never checked.
16. Smaller: three stranded accounts on `teamId: 'default'`; availability still club-wide
    readable; orphaned shards when a category is emptied; uncategorised players inconsistent
    across three staff pages; `backfill-training-teams.js` has no `preflight()`.

---

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase
  project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI on push;
  rules/functions = `.\deploy.ps1`; Admin SDK = local, see below.
- **Bump the version in THREE places together**: `CACHE_NAME` in `sw.js`, `APP_VERSION` in
  `js/app.js`, `CURRENT` in `functions/check-deploy.js`. All three are at **117**.
- A new JS/CSS file must be added to **`STATIC_ASSETS` in `sw.js`** and to the `<script>` list in
  `index.html`, in load order. v117 added no frontend file (the FCF helpers went into the existing
  `js/utils.js` and `js/app.js`); `functions/fcf.js` is server-side and needs neither.
- Tests: `cd test && npm test`. Fast path `npm run test:unit` (~1s). If a suite says
  `Could not spawn java -version`:
  `$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin;$env:PATH"`
- **New test files must be added to `test:unit` / `test:functions` by hand.**
- `gh` is **not** installed. The GitHub REST API with `curl` works; unauthenticated is 60/hour.
- No browser automation (playwright/puppeteer) is installed — DOM behaviour is verified by hand.
- **Never edit `www/`** — CI-generated mirror for the Capacitor build.

### Reading production without a browser

ADC from firebase-tools' stored refresh token — no service-account key needed.
`~/.config/configstore/firebase-tools.json` → `additionalAccounts[]` (marna96@gmail.com). Write
`{type:"authorized_user", client_id, client_secret, refresh_token}` to a scratch file, point
`GOOGLE_APPLICATION_CREDENTIALS` at it. **Never print the token; delete after.**

- **A scratch script must live inside `functions/`**, or `require("firebase-admin")` cannot
  resolve.
- **`teams/{id}` is keyed by CLUB id.** There is no `clubId` field on a team doc — a
  `where("clubId","==",…)` query returns empty, which reads as "no teams" rather than "wrong
  query". `teams/nDLJCpJfDvFHs8MnwtzW` *is* Esquerra de l'Eixample.
- The same refresh token exchanges at `oauth2.googleapis.com/token` for a `cloud-platform` access
  token, which reaches **Cloud Scheduler** (`…/v1/projects/esquerrapp/locations/us-central1/jobs`
  — the only way to see a cron's real schedule; `functions:list` only ever says `scheduled`) and
  **Cloud Functions v2** (`…/v2/…/functions` — a new Cloud Run `revision` is the proof a deploy
  took, since a container failing its health check leaves the old one serving).

### Clubs in production

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, `amateur`
  only. **No matches at all**, so the anada briefing has nothing to find here — test it on the
  demo club. Its FCF group for 2026-27 is **grupId 58161881** (Quarta Catalana, Grup 10), the
  group captured in `test/fixtures/fcf-preseason.json`.
- `Tm96gel58VSQvxgynf45` — **demo club** ("C.E. Sant Andreu del Palomar"), join code `9CA4RR`,
  `coach@demo.esquerrapp.app` / `DemoEsquerra2026!`. 3 teams / 77 members, 102 matches (72 with
  events). Topped up 2026-08-20. **It goes stale**: `hasData` expires at `STALE_AFTER_DAYS = 10`.
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona test club. Seeded boards from template testing.

### ⚠ Never run `seed-demo-club.js --apply` at the demo club

`apply()` builds a club from nothing. Pointed at the populated demo club it destroys it three
ways, silently: it rewrites the whole `categories` map, **replaces** data shards with a bare
`set()`, and resets all 77 Auth passwords. Guarded by neither the `demoSeed` stamp nor
`PROTECTED_CLUBS`.

```bash
node functions/seed-demo-club.js --verify --club Tm96gel58VSQvxgynf45   # read-only
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45         # dry run
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45 --apply # additive only
```

**Do not run `cleanup-seed.js`** — it keys on pre-Phase-1 numeric uids.

---

## Lessons that keep repeating

- **A broken feed and an empty one must not look alike.** The FCF outage went unnoticed for weeks
  because `applyLeagueRows()` returned early on zero rows, and an empty league table reads as "the
  season has not started". Every no-data path now renders a reason.
- **An upstream field can be wrong, not just missing.** `played:"1515"` parses cleanly to a
  number, passes every type check, and is nonsense. The only way this was caught was recomputing
  the table from a second endpoint and comparing — the check has to come from outside the thing
  being checked.
- **Two leniencies are not one leniency.** `normTeamName` is right for a suggestion a human
  confirms and wrong for a stored identifier. Ask what the value will be USED for before reusing a
  comparison that already exists.
- **One definition, or it drifts.** `mdRowSquad()` exists because a ✓ that promises an id and a
  save that stores one were computing "which squad is this row" two different ways.
- **Escaping and validation are different jobs.** `sanitize()` makes a string safe as HTML and
  says nothing about what the string MEANS.
- **Test the thing the user will see, not the function you happened to write.**
- **A guard you have not seen fail is not a guard.** Every guard added this session was checked by
  mutating the source and watching exactly one test go red.
- **When layout or a live DOM is involved, ask whether the measurement is even possible.** jsdom
  has no layout, and this suite has no jsdom at all — say what is not covered instead of writing
  assertions that pass against a stub.
- **An empty query result is not evidence of absence** — it is often the wrong query.
- **Check the artefact, not the operation** — `curl` the served `sw.js`, not the push output. This
  session's version: the deployed proxy was probed with the NEW parameter and returned 400, which
  is how the deploy order above stopped being a guess.
- **Ask which default a question carries.** `countedFor` and `attendedFor` read the same two
  stores and disagree only about silence.
- **A duplicated rule needs a test that reads BOTH copies**, not one that tests each side's
  behaviour separately. `js/utils.js` and `functions/fcf.js` are checked against one input table.
- **`deploy.ps1` is Windows-only and Cloud Shell is not the local machine.**
