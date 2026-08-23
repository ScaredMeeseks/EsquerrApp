# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-23._

## ⚠ v121 is uncommitted — FRONTEND ONLY

v120 shipped (`24c12bf`) and the owner reported stripes of visibly different widths. **Not a
stripe-drawing bug — a scaling bug**, and this file's own comments predicted it.

The striped torso is exactly half the shirt's viewBox, so at a rendered size S a band is `S/(2n)`
device pixels; `KIT_ICON_PX = 72` exists because it makes that whole. v119's stylesheet then did
`.md-kit-cell .kit-svg { width: 32px }` — a 16px torso, six bands, 2.667px each, snapped by
crispEdges to 3,2,3,3,2,3.

**Fixed two ways, both needed**: the render size is a parameter (`kitPx`) so the icons are DRAWN
at 32px instead of scaled to it, and the counts now divide a 16px torso — "Rayas" 6 → **8**,
"Rayas anchas" stays **4**. The CSS size rules are deleted, desktop and mobile, with a comment
saying why.

> ⚠ **Never re-add a width/height rule for `.md-kit-cell .kit-svg`.** That single line is the
> entire bug. If a kit needs a different size, change `MD_KIT_PX` — and check it still divides by
> both stripe counts, which a test now enforces.

```
git add -A && git commit && git push      # that is the whole deploy
```

No functions change. Version triple is at **121**.

### v118, for reference — DEPLOYED and verified

`main` is at **v118** (`304630c`). Functions and frontend both shipped, functions first. Verified
by artefact, not by the deploy output:

| | evidence |
|---|---|
| **functions** | `syncFcfFixtures` and `scheduledFcfSync` both `ACTIVE` on revision `-00001`; `fcfClassificacio` moved to revision 38 in the same deploy. A new Cloud Run revision is the proof — a container failing its health check leaves the old one serving. |
| **cron** | `firebase-schedule-scheduledFcfSync-us-central1` → `0 6 * * *`, `Europe/Madrid`, `ENABLED`, read from the Cloud Scheduler API. |
| **frontend** | `APP_VERSION = 118` and `CACHE_NAME = esquerrapp-v118` served from GitHub Pages. |
| **rules** | Unchanged — the new match fields are optional and shards are written whole-document with no per-field validation. |

**No `minAppVersion` bump** — an old APK simply never sees a refresh button, and the nightly sync
improves its calendar anyway.

> **Pages lags the push by a minute or two.** The first version check after pushing said 117 and
> looked like a failed deploy; it was the build still running. Check
> `raw.githubusercontent.com/.../main/js/app.js` to separate "the repo is wrong" from "Pages has
> not rebuilt". Also note `?cb=$(Get-Random)` can repeat within one PowerShell session.

v118's hands-on test is **done** — the owner ran the import against the real club and signed it
off. What has NOT been tested in a browser is v119's two kit columns and the uppercase name.

## Tests — all three suites green

```
916 unit    (834 → 906 → 916)   cd test && npm run test:unit
152 rules   (unchanged)         cd test && npm run test:rules
 71 functions (unchanged)       cd test && npm run test:functions
```

`test/fcf-fixtures.test.js` (54) is new and **was added to `test:unit` by hand** — the standing
trap in this repo. `npm run test:fcf` runs the three FCF suites together.

> **`npm test` (the full chain) flakes** — the functions suite fails with
> `Cannot determine backend specification. Timeout after 10000` when it runs straight after the
> rules suite. Export `FUNCTIONS_DISCOVERY_TIMEOUT=120`, or run the suites separately.

> **Do not serve the app on port 8080** — that is the Firestore emulator's port and it makes the
> whole rules suite fail with `501 Unsupported method ('PUT')`. Use 8000.

---

## What shipped: v118 — the Calendari fills itself

Full writeup in CONTEXT.md. The parts most likely to bite:

**The refresh button and the 06:00 job are two callers of ONE function** (`_syncFcfSquad`). Do not
add a client-side importer for either; that is how they would drift.

**The merge rule is the whole feature**: a field is the federation's for as long as it still equals
`fcfSnapshot`. Edit a kick-off and the sync stops touching it — for ever, and only that field. No
`userEdited` flags, so nothing to get out of step.

> ⚠ **A fixture withdrawn by the FCF is MARKED, never deleted.** Call-ups, coach notes,
> availability answers and lineups all hang off the match id. An empty response is an outage, not a
> cancelled season, and is ignored.

**Imported fixtures take the acta number as their id** (~4e6, three orders below the `Date.now()`
ids the manual path mints, so they cannot collide). A double import is idempotent.

### ⚠ A v117 bug this uncovered: the leading article

fcf.cat writes **"L'ESQUERRA DE L'EIXAMPLE, F.C."**; the club calls itself **"Esquerra de
l'Eixample F.C."**. `normTeamName` keeps the article, so they never matched — meaning **v117's
standings were highlighting the wrong row, or none, for the real club.** The live check that
"proved" it worked had passed FCF's own spelling in as the club name, so it proved nothing. Worth
remembering the shape of that mistake.

`sameClubName` fixes it and is deliberately narrow: only for identifying OURSELVES in a group we
already know we are in, **never** in `findFirstLeg`. The article is stripped from the RAW name,
where the separator still exists — off the normalised form, `lajonquera` becomes `ajonquera`
(JS alternation takes `l` before `la`) and `lleida` becomes `leida`.

**Worth checking on the real club after deploy**: its own row in the standings should now be
highlighted, which it may never have been.

### Other things to know

- **The rival's kit renders through the existing `shirtSvg()`.** FCF publishes a named pattern
  (`CLASE_CSS_CAMISETA`); six of the eleven map onto the app's fill encoding, the rest render
  solid on purpose. The mapping is in `js/utils.js` next to `encodeFill`, and the server stores
  FCF's raw fields — reaching `encodeFill` from `functions/` would have meant a third duplicated
  function across that boundary.
- **`.sb-badge` is sized in px with `flex:0 0 auto`, and must stay that way.** `_mnScoreNeed()`
  sums the scoreline's children, so a crest sized in `em` would shrink along with the text it is
  supposed to be measured against.
- **The second leg pairs itself only when BOTH fixtures are FCF-owned.** `normTeamName`, the
  `Enllaçar`/`No` banner and `legDismissed` all stay — friendlies, cup ties and every fixture
  entered before v118 still go through the question, and a coach's stored answer outranks the
  derived one.
- `equipacions` returns a **cross join** (542 rows for 16 teams) and `equipos` is broken outright
  (the same team repeated ~20 times). Neither is a parsing mistake at our end.

## Verifying, once v119 is deployed

v118's steps 1-7 below were all walked through by the owner and passed. **The v119 additions have
NOT been looked at in a browser** — check these first:

- **A) The two kit columns.** Every imported fixture shows the rival's 1a and 2a kits, each with
  shirt, shorts and socks. The change strip only appears after `.\deploy.ps1 functions` AND a
  refresh — `opponentKitAway` is written by the server, not derived on the client.
- **B) The row must not have grown.** 32px is meant to sit inside the height the action buttons
  already set. If rows are taller than they were in v118, the number needs to come down.
- **C) The rival's own crest is on the rival's shirt** — not Esquerra's. This is the bug the
  bigger icons exposed, and the whole reason to look closely at a shirt.
- **D) Our club name is in capitals**, and home/away are still the right way round. If a fixture
  looks inverted, the uppercase went through `toUpperCase()` instead of CSS and `isOurTeam()` is
  failing.

Then re-walk v118's list. Serve on **port 8000**. As a coach on the demo club, or on the real club
(which already has grupId 58161881 configured for `amateur-A`):

1. **Calendari → 🔄 Actualitzar calendari.** 30 fixtures land, each with venue, kick-off, a 📍 maps
   link, the rival's crest and its shirt. The pure pipeline was run end to end against LIVE fcf.cat
   this session and produced exactly that; what needs eyes is the rendering.
2. **Press it again** — "Tot al dia. Cap canvi a la FCF." and no duplicated season.
3. **The merge rule, which nothing else proves in a browser**: edit a kick-off by hand, refresh,
   confirm it survived AND that the venue on the same row still updated.
4. **Add a friendly manually**, refresh, confirm it is untouched and carries no jornada tag.
5. **The second leg**: open a J16+ fixture and confirm the briefing is linked with **no** banner;
   open the return of a manual fixture and confirm the banner is still offered.
6. **The match sheet** shows both crests, and a long club name shrinks the NAMES, not the crests.
7. **Confirm the artefact, not the operation:**
   ```bash
   curl -s "https://scaredmeeseks.github.io/EsquerrApp/js/app.js?cb=$RANDOM" | grep APP_VERSION
   curl -s "https://scaredmeeseks.github.io/EsquerrApp/sw.js?cb=$RANDOM" | grep CACHE_NAME
   # both must say 119
   ```
8. ~~Confirm the cron's REAL schedule~~ — **done, 2026-08-23**. Verified through the Cloud
   Scheduler API (`functions:list` only ever says `scheduled`, and v112 and v113 were both
   interval-band bugs found exactly this way):
   `firebase-schedule-scheduledFcfSync-us-central1` → `0 6 * * *`, `Europe/Madrid`, `ENABLED`.
   `syncFcfFixtures` and `scheduledFcfSync` are both `ACTIVE` on revision `-00001`, and
   `fcfClassificacio` moved to revision 38 in the same deploy.

---

## Next: v119 — the Sancions and Top Scorers tabs

Planned with the owner, deliberately deferred out of v118. Both are new sidebar pages
(`buildSidebarItems` + `STAFF_PAGES` + a render function + a `renderPage` case).

**Sancions.** `sanciones?grupId=&temporada=` returns rows keyed by jornada with
`participante_nombre`, `nombre_equipo`, `partidos_sancion` and `motivo_sancion`. A ban issued at
jornada N covers N+1 … N+`partidos_sancion`, so "who misses the next game" is derivable for our
squad and for the opposition. `tipo` is `participante` or `equipo`; the `equipo` rows with
`partidos_sancion: "0"` are procedural rulings, **not** bans, and must not be listed as missing
players.

**Top Scorers.** `goleadores?grupId=&temporada=`, filterable by discipline (Masculí
`disciplinaId 19308233`, Femení `19308237`), division and group — one group per view, so no bulk
sweep is needed. Sortable on goals, penalties and matches played. `total` is matches played, not
goals (FCF's own frontend names it `matchesPlayed`).

> ⚠ **`licencia` is a Spanish DNI/NIE** (`41566132A`, `40449950B`) for players who include minors.
> It is the only extra identifier in the payload — **there is no contact information of any kind**,
> so the "scouting contact details" idea has no source — and it must be dropped at the parse
> boundary, not merely left unrendered.

> ⚠ **The goal figures are arithmetically impossible as published.** Empuriabrava's five listed
> scorers sum to 157 for a team that scored 106 all season; six of eight teams in that group fail
> the same check. It is the same home|away string concatenation as the standings' `played:"1515"`,
> in FCF's aggregation rather than in the referees' match sheets. **The owner's decision is to show
> the official figure as published** — so v119 does that, behind a single constant, so the derived
> reading can be switched on if the table looks wrong in use.

---

## Parking lot

Renumbered items are the same items.

1. **Fixture import covers the LEAGUE only.** A cup tie is a different `competicioId` with its own
   group, and `fcfLinks` holds one link per squad. Supporting cups means a second link per squad,
   or a competition picker.
2. **Results are not imported.** `GOLES_*` and `CERRADA` are there; the app computes its scoreline
   from coach-entered events, and reconciling the two needs a decision first.
3. **Neither week strip re-renders on a timer.** Pre-existing.
4. **The cross-category call-up** — decide before building. Within a category it already works;
   across them the picker filters to the coach's category and `getVisibleCategories()` returns
   `[s.category]` for a player, so he never downloads the other shard.
5. **Training detail / session planning** (reported 2026-08-09, untouched).
6. **Fill in `privacy.html`** — blocks both stores, no code dependency.
7. **The APK** — CI has built through v117; phones are on v43-era. Set
   `clubs/nDLJCpJfDvFHs8MnwtzW.minAppVersion` only once a current APK is actually installed.
8. **Drop dual-write** — `TB_DUAL_WRITE` still mirrors the board library into `fa_tactic_saved`.
   Gated on 7.
9. **Play Console** — $25 plus identity verification, then four secrets turn on the signed AAB.
10. **iOS** — the owner may have access to two Macs. Try web push on a home-screen PWA first
    (iOS 16.4+, and v95 shipped what it needs) before spending the $99.
11. **Readiness thresholds** — every measurement is against demo data that has since changed.
12. **Old-APK rules shim** — `clubs/{clubId}` still lets a lead write `fcfLinks`/`schedules`
    directly, bypassing the server-side link validation in `setClubCategories`. Delete once a
    v55+ APK circulates.
13. **`scheduledMatchAvailReminder`** is the last `onSchedule` not checked for the interval/band
    traps v112 and v113 fixed. `scheduledFcfSync` is a plain daily cron and does not have them.
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
  `js/app.js`, `CURRENT` in `functions/check-deploy.js`. All three are at **119**.
- A new JS/CSS file must be added to **`STATIC_ASSETS` in `sw.js`** and to the `<script>` list in
  `index.html`, in load order. v118 added no frontend file; `functions/fcf.js` is server-side and
  needs neither.
- Tests: `cd test && npm test`. Fast path `npm run test:unit` (~1s). If a suite says
  `Could not spawn java -version`:
  `$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin;$env:PATH"`
- **New test files must be added to `test:unit` / `test:functions` by hand.**
- `gh` is **not** installed. The GitHub REST API with `curl` works; unauthenticated is 60/hour.
- No browser automation (playwright/puppeteer) is installed — DOM behaviour is verified by hand.
- **Never edit `www/`** — CI-generated mirror for the Capacitor build.
- **Editing a source file with a Python round-trip rewrites its line endings** (`io.open` in text
  mode translates on write). Two test suites broke that way this session because
  `match-notes-render.test.js` slices app.js on a MULTI-LINE marker. Use `newline=''` on both read
  and write, or use `sed`.

### The FCF API — what is on it

Base `https://www.fcf.cat/api/competition/`. No key, no auth, no cookie, no Referer; CloudFront
caches with `s-maxage=60`. It is an internal Next.js route set found by reading their JS chunks,
not a published contract — it can change shape without notice, which is precisely what happened to
the HTML in v117.

`classificacio?grupId=` · `partidos?grupId=` · `equipacions?grupId=` · `goleadores?grupId=&temporada=`
· `sanciones?grupId=&temporada=` · `grupos?competicioId=` · `competicions?disciplinaId=&temporada=`
· `disciplines` · `temporadas` · `goles-favor`/`goles-contra?grupId=&equipId=`.
**`equipos?grupId=` is broken** — the same team repeated ~20 times.

> ⚠ **Numeric fields are home and away CONCATENATED as strings** in `classificacio`
> (`played:"1515"` = 30, `won:"139"` = 22) and in `goleadores` (`goles`). `points`, `position`,
> `goalsFor`, `goalsAgainst`, `coefficient` and `goles-favor` are clean. J is derived as
> `round(points / coefficient)`; there is no equivalent derivation for a player's goals.

### Reading production without a browser

ADC from firebase-tools' stored refresh token — no service-account key needed.
`~/.config/configstore/firebase-tools.json` → `additionalAccounts[]` (marna96@gmail.com). Write
`{type:"authorized_user", client_id, client_secret, refresh_token}` to a scratch file, point
`GOOGLE_APPLICATION_CREDENTIALS` at it. **Never print the token; delete after.**

> ⚠ **Take the token from `additionalAccounts[]`, NOT from the top-level `tokens`.** That file
> holds several accounts: `tokens` is whichever was primary — here
> `administracion@mov-ment.com`, the **Movment** account — while `activeAccounts` maps
> `C:\DATA\CLAUDE\EsquerrApp` → `marna96@gmail.com`, which lives in `additionalAccounts[]`.
> The Movment token is currently in a reauth state, so exchanging it fails with
> `400 invalid_grant / invalid_rapt`, which reads as a broken script rather than the wrong
> account. Cost a round trip on 2026-08-23.
>
> ```powershell
> $cfg = Get-Content "$env:USERPROFILE\.config\configstore\firebase-tools.json" | ConvertFrom-Json
> $rt  = ($cfg.additionalAccounts | Where-Object { $_.user.email -eq 'marna96@gmail.com' }).tokens.refresh_token
> ```

- **A scratch script must live inside `functions/`**, or `require("firebase-admin")` cannot
  resolve.
- **`teams/{id}` is keyed by CLUB id.** There is no `clubId` field on a team doc — a
  `where("clubId","==",…)` query returns empty, which reads as "no teams" rather than "wrong
  query". `teams/nDLJCpJfDvFHs8MnwtzW` *is* Esquerra de l'Eixample.
- The same refresh token exchanges at `oauth2.googleapis.com/token` for a `cloud-platform` access
  token, which reaches **Cloud Scheduler** (`…/v1/projects/esquerrapp/locations/us-central1/jobs`
  — the only way to see a cron's real schedule) and **Cloud Functions v2** (`…/v2/…/functions` —
  a new Cloud Run `revision` is the proof a deploy took, since a container failing its health
  check leaves the old one serving).

### Clubs in production

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, `amateur`
  only. **No matches at all** before v118 — the import should now fill its whole season. Its FCF
  group for 2026-27 is **grupId 58161881** (Quarta Catalana, Grup 10), FCF team id **35410**; that
  group is captured in `test/fixtures/`.
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

- **A test that passes against a mutation is telling you something.** The `adopting ?` branch in
  `mergeFcfFixtures` was removed because the mutation meant to break it changed nothing — it was a
  second spelling of a condition the general rule already expressed.
- **Check the thing against a value it did not come from.** The v117 "our row is highlighted" check
  passed FCF's own club name in as the club name, so it proved nothing; the real club's row was
  never highlighted. Feed a check the value the PRODUCT would use, not the one that makes it pass.
- **A broken feed and an empty one must not look alike.** Every no-data path in the standings and
  the calendar renders a reason.
- **An upstream field can be wrong, not just missing.** `played:"1515"` parses cleanly to a number,
  passes every type check, and is nonsense. Recomputing from a second endpoint is what caught it.
- **Two leniencies are not one leniency.** `sameClubName` is right for finding ourselves in a group
  and wrong for pairing two strangers' fixtures; `normTeamName` is right for a suggestion a human
  confirms and wrong for a stored identifier.
- **One definition, or it drifts.** `_syncFcfSquad` serves both the button and the cron;
  `mdRowSquad` serves the tick and both save paths.
- **Escaping and validation are different jobs.** `sanitize()` makes a string safe as HTML and says
  nothing about what the string MEANS.
- **A guard you have not seen fail is not a guard.** Thirteen mutations this session, each failing
  exactly one test.
- **When a live DOM is involved, ask whether the test is possible.** There is no jsdom in this
  suite; say what is not covered instead of asserting against a stub of your own imagination.
- **An empty query result is not evidence of absence** — it is often the wrong query.
- **Check the artefact, not the operation** — `curl` the served `sw.js`, not the push output.
- **A duplicated rule needs a test that reads BOTH copies.** `js/utils.js` and `functions/fcf.js`
  are checked against one input table, for `fcfGrupId` and now `sameClubName` too.
- **`deploy.ps1` is Windows-only and Cloud Shell is not the local machine.**
