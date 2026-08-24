# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-24._

## Where things stand

**Version triple is at 135** — `CACHE_NAME` (sw.js), `APP_VERSION` (js/app.js), `CURRENT`
(functions/check-deploy.js). All three move together; `version-check.test.js` fails the suite if
two of them disagree.

**Everything is deployed and pushed.** Working tree clean, `main` at `4d93c3a`, functions and rules
both live. Nothing is half-finished.

| | |
|---|---|
| Unit tests | **1182** — `cd test && npm run test:unit` (~1 s) |
| Rules tests | **164** — needs the emulator, see below |
| Functions tests | 71 — emulator |

```
cd test && npx firebase emulators:exec --only firestore --project=demo-esquerrapp \
    "npx mocha rules.test.js --timeout 20000"
```
Java 21 is installed and on PATH; the rules suite takes ~20 s and is **not** in `test:unit`.

---

## This session: v129 → v135

### The referee database (v129–v132)

Who refereed a match, and his record **in the division this squad plays in**. Referees are
published only on the acta page — nowhere in the JSON API — so this is the app's one scraping job,
bounded to the five senior Futbol 11 tiers: 64 groups, 14,390 matches a season, about a twentieth
of all Futbol 11.

- `parseFcfActa` in `functions/fcf.js`, bounded at `<h3>Àrbitres</h3>` and the next `<h3>`, rows
  filtered on containing a comma. 240/240 extraction on a full real group.
- `fcfRefIndex/{season}_{grupId}` holds acta → officials, result, goals and the sanctions join.
  `fcfReferees/{slug}` holds the derived profile, keyed **by division**.
- `crawlFcfActas` nightly (played matches only), `fcfWeeklyRefs` Fridays at 6/7/8 — **two cursors
  over one queue**, because a shared one let Saturday's backfill skate past groups Friday had not
  reached.
- **Yellow cards do not exist** anywhere in the federation's data. Reds and second bookings come
  from `sanciones`, which carries `codacta`. `articulo_salida` gives the *offence* — `338.1d` and
  `338.2b` are both dissent.
- The match detail card adds the assistants and **our own past matches under him**, with the
  scoreline flipped to our side.

### Two parking-lot items closed

- **Item 14 — push governance.** Writing to `pushQueue` *is* the send, and the rule was
  `create: if sameTeam(teamId)` — any of the 77. Now staff-only, explicit recipients, bounded text,
  no `url`. A live bug sat inside it: a call-up made entirely of seeded players sent
  `targetPlayers: []`, which the old consumer read as a broadcast to the whole club.
- **Item 13 — the Friday availability push.** Neither v112/v113 trap applied, but the answered-set
  query was truncated to ten while the loop walked every fixture, so from the eleventh onwards
  players who *had* replied were pushed again. Cancelled (`fcfRemoved`) fixtures were asked about
  too. Both fixed.

### What a real run showed that no test could

The crawl was switched on for one group: 240 actas indexed, 240 with a referee — and **every
referee panel still said "no record"**. The app reads `fcfReferees`, not the raw index, and only
the Friday job rebuilt it. Both jobs were individually correct; the gap was *between* them.
`crawlFcfActas` now rebuilds on completion too. **Run the thing and look at what the user would
actually see.**

---

## ▶ NEXT SESSION

### The crawl is PAUSED, on purpose

`fcfCrawl/config` has `enabled: false` — the owner wants to wait until fcf.cat is more settled.
The scope beside it is ready (all five tiers, both seasons), so **resuming is that one field**.

What it already produced is kept and will not be re-fetched: `fcfRefIndex/21_54486121` (Tercera
Grup 1, 240 actas) and **44 referee profiles**.

How it was driven: write the config by REST, trigger
`firebase-schedule-crawlFcfActas-us-central1` by name, poll `fcfRefIndex`. That exercises the
**deployed** code path rather than a local re-implementation of it. No service-account key is
involved — see "Reading production without a browser" below for the token, and note that the REST
route needs no ADC file and no scratch script inside `functions/`, unlike the Admin SDK.

### Still open on the referee work

- **Do referees appear BEFORE a match?** Every unplayed acta today says *"Sense àrbitres
  assignats"*, and no 2026-27 fixture has been played. Check on the season's first Friday. If they
  never appear in advance the feature is retrospective only — the Friday job's other half still
  works.
- **Dissent counts are thin** — about twelve per group-season across forty-odd referees, so most
  show 0–1. Revisit after a full backfill whether the figure earns its space on the card.
- **Sancions has never been seen with real bans** (parking-lot item 3). Once a round is played:
  confirm the ban window on screen (a ban at jornada N covers N+1 … N+P), that **our own** bans
  appear, and that club rulings stay out of the missing-players list.

### Two log lines that mean something

- `FCF acta parser found NO referees at all` — the v117 failure repeating. Everything else would
  keep running and look healthy.
- `FCF actas now draw MORE card marks than the legend` — **the yellow-card tripwire.** Every acta
  today draws exactly four card-sized boxes whether or not anyone was booked. More means the
  federation has started publishing bookings; teach `parseFcfActa` to read them and re-run the
  aggregation — the raw index means **no re-crawl**.

`node test/fixtures/capture-acta.js` re-captures the fixtures and prints that count for four known
actas, including 3781800 — which carries two recorded sanctions and still draws only the legend.

### Small things needing the owner, not code

- **Watch the update banner fire once.** Unit-tested and the parser runs against the live `sw.js`,
  but nobody has seen it in a browser. Load the app, deploy, switch back to the tab.
- **The APK gap is the longest pole and it is widening.** Phones are on a v43-era build; `main` is
  at 135. Parking-lot items 8 and 12 sit behind installing a current one. Old APKs still satisfy
  the tightened push rules — checked — but only because the document shape happened to match.
- **`privacy.html` is empty and blocks both stores.** Needs the club's legal name and address, a
  contact address for data requests, and confirmation of whether Google Analytics is active (there
  is a `measurementId` in the config).

---

### ⚠ If a screen looks stale, suspect the service worker FIRST

This cost a long round of wrong diagnoses. A tester sat on a **v117 worker across seven releases**:
`caches.keys()` said `esquerrapp-v117` while `main` was v124, and the page kept executing old
`app.js`. The tell was an error string that only existed in the older version.

```js
navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))
  .then(() => caches.keys()).then(ks => Promise.all(ks.map(k => caches.delete(k))))
  .then(() => location.reload(true));
```

`typeof parseFcfScorers` is a good "which version am I running" probe — a top-level global in
js/utils.js since v124. **`APP_VERSION` is NOT usable**: it lives inside app.js's IIFE. A private
window is the fastest way to rule caching in or out.

**v128 fixed the underlying problem**: the app now fetches `sw.js` with `cache: 'reload'`, compares
`CACHE_NAME` against its own `APP_VERSION`, and offers a banner. So a member should no longer sit
on old code silently — but **nobody has yet watched that banner appear in a browser**, which is why
it is still on the list above. Until someone has, treat a stale screen as this bug first.

## Tests

```
1182 unit      cd test && npm run test:unit          (~1 s, no emulator)
 164 rules     cd test && npm run test:rules         (emulator + Java)
  71 functions cd test && npm run test:functions     (emulator + Java)
```

> **New test files must be added to `test:unit` / `test:functions` BY HAND.** The standing trap in
> this repo — `focus-plan.test.js` was missing for several versions and silently never ran.
> `suite-registry.test.js` now fails if any suite on disk is unregistered, or if the list names a
> file that no longer exists.

> **`npm test` (the full chain) flakes** — the functions suite fails with
> `Cannot determine backend specification. Timeout after 10000` when it runs straight after the
> rules suite. Export `FUNCTIONS_DISCOVERY_TIMEOUT=120`, or run the suites separately.

> **Do not serve the app on port 8080** — that is the Firestore emulator's port and it makes the
> whole rules suite fail with `501 Unsupported method ('PUT')`. Use 8000.

> **Any test that greps source must strip comments first.** Three separate suites this session
> matched their own explanatory comment — a note naming the very thing it was guarding against.

---

## How the FCF fixture import works

The parts most likely to bite (full writeup in CONTEXT.md):
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

---

## Parking lot

0. **The FCF's broken goal figures — deliberately NOT corrected.**

   `goles` is the home and away tallies concatenated as strings: 5 at home and 10 away prints as
   `510`. The evidence is not in doubt —

   - across 160 teams, **32%** publish more scorer-goals than the team scored all season; after
     splitting home|away, **0%** do;
   - the one 3-digit value in 2650 rows (Quarta Catalana, Grup 22) reads `110` for a player whose
     team scored **111** all season. Both possible splits agree on **11**, in 25 appearances;
   - it is the same bug as `played:"1515"` in the standings, which IS corrected because
     `coefficient` gives an exact derivation there. No such second field exists per player.

   **The owner's call is to leave it**, and the reasoning is sound beyond "publish the official
   number": this is a bug in FCF's new website that they will very likely fix. **If they fix it
   and we are splitting, we would double-correct and be silently wrong** — showing 11 where the
   feed now correctly says 76. Staying raw is the position that survives their fix without anyone
   noticing.

   `FCF_SCORERS_RAW = true` in js/utils.js is the switch; `splitFcfTally` is written and tested
   for the day it is wanted. If it is ever flipped, the note under the table must stop calling the
   figures official.

   > Watch for the upstream fix: when a group's scorer sums stop exceeding its teams' goal totals,
   > FCF has repaired it and nothing here needs to change.



Renumbered items are the same items.

1. **Fixture import covers the LEAGUE only.** A cup tie is a different `competicioId` with its own
   group, and `fcfLinks` holds one link per squad. Supporting cups means a second link per squad,
   or a competition picker.
2. **Results are not imported into the app's own fixtures.** `GOLES_*` and `CERRADA` are there;
   the app computes its scoreline from coach-entered events, and reconciling the two needs a
   decision first. **Partly overtaken by v131**: the referee index now stores the federation's
   `gh`/`ga` per acta, so the referee history shows real scorelines. That is a separate store
   from `fa_matches` and does not touch the coach's own score — but it does mean the federation's
   result is already on the device if that decision is ever taken.
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
13. ~~**`scheduledMatchAvailReminder`**~~ — **CHECKED and CLOSED in v134.** Neither trap applied
    (`0 20 * * 5` is wall-clock; there is no band). Reading it found two other bugs instead: the
    answered-set query was truncated to ten while the loop walked every weekend fixture, so from
    the eleventh onwards players who HAD replied were pushed again; and fixtures the federation
    had cancelled (`fcfRemoved`) were still asked about. Both fixed, three mutations.
14. ~~**Push governance**~~ — **CLOSED in v133.** Staff-only, a non-empty bounded `targetPlayers`
    required, `title`/`body` bounded, `url`/`targetRole`/`sentAt`/`tokenCount` refused, and the
    consumer repeats all of it rather than trusting the rule. `Push.sendToTeam` deleted.
    Proved both ways: 11 emulator tests, and reverting to the old rule turns 8 of them red.
    A live bug was inside it — a call-up made entirely of seeded players sent `targetPlayers: []`,
    which the old consumer read as a broadcast to the whole club.
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
  `js/app.js`, `CURRENT` in `functions/check-deploy.js`. All three are at **135**.
  (`version-check.test.js` asserts `sw.js` and `js/app.js` agree, so a half-bump fails the suite.)
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
  token. That one token reaches four surfaces, and between them they cover almost everything the
  Console is otherwise needed for:

  | surface | what it is good for |
  |---|---|
  | **Cloud Scheduler** `…/v1/projects/esquerrapp/locations/us-central1/jobs` | the only way to see a cron's REAL schedule; `…/{job}:run` triggers a scheduled job by hand, exercising the deployed code path rather than a local re-implementation |
  | **Cloud Functions v2** `…/v2/…/functions` | a new Cloud Run `revision` is the proof a deploy took — a container failing its health check leaves the old one serving |
  | **Firestore REST** `firestore.googleapis.com/v1/projects/esquerrapp/databases/(default)/documents` | read and write production documents. This is the ADMIN surface, gated by IAM and **not** by `firestore.rules` — which is why it can write `fcfCrawl/*` even though clients are denied outright |
  | **Firebase Rules** `firebaserules.googleapis.com/v1/projects/esquerrapp/releases/cloud.firestore` | read the LIVE ruleset back after a deploy, rather than trusting the CLI's summary |

  > **When the CLI and the API disagree, believe the API.** A functions deploy this session printed
  > `Deploy failed (exit 2)` and then `No changes detected` on retry — reading as though nothing
  > had shipped. It had: the Functions API showed the new revision and all 24 functions ACTIVE.

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
- **A test that greps source will match its own comment.** Three suites this session asserted "the
  bad pattern is gone" and found it in the note explaining why it had been removed. Strip comments
  before scanning.
- **A test built from the constant it is checking proves nothing.** The yellow-card legend test
  composed its legend from `FCF_ACTA_LEGEND_MARKS`, so it passed just as happily with the constant
  wrong. Pin an observed value as a literal.
- **Assert the thing the code chose, not the thing you passed in.** The tier test checked labels —
  which the function echoes back from the wanted list — so it passed even when every competition
  resolved to the wrong id. Assert the ids.
- **Two correct jobs can leave a gap between them.** The crawl filled its index and the app read a
  different collection that nothing rebuilt. Unit tests could not see it; running it and looking at
  what the USER would see could. **Ship it, then go and look.**
- **A guard shadowed by another guard is untested.** The club-ruling filter was covered by the
  code filter, so removing it changed nothing. If a mutation survives, either delete the guard or
  write the case where it is the only thing standing.
