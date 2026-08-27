# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-26._

## Where things stand

**Version triple is at 180** — `CACHE_NAME` (sw.js), `APP_VERSION` (js/app.js), `CURRENT`
(functions/check-deploy.js). All three move together; `version-check.test.js` fails the suite if
two of them disagree.

**Everything is deployed.** Working tree clean, `main` at `7051364`, Pages live at v180, functions
live, `premium-3d-board` merged and no longer needed — its 68 commits are all on `main`.

| | |
|---|---|
| Unit tests | **1907** — `cd test && npm run test:unit` (~2 s) |
| Rules tests | **164** — needs the emulator, see below |
| Functions tests | 71 — emulator |

Java 21 is installed and on PATH; the rules suite takes ~20 s and is **not** in `test:unit`.

---

## READ THIS BEFORE TOUCHING THE 3D BOARD

**`js/board3d.js` IS NOT PART OF THE FRONTEND DEPLOY.** It is the premium feature and is excluded
from GitHub Pages (`_config.yml`) and from the APK mirror (`scripts/build-www.js`). It reaches the
browser only through the **`getBoard3d` callable**, which reads `functions/private/board3d.js`.

**So a change to the 3D module needs `.\deploy.ps1 functions`, not a push to `main`.**

This bit once already, on the day it was built (v179): the version was bumped, the frontend pushed,
and the server went on serving the previous module. The bug the fix addressed was still on screen and
looked as though the fix had simply not worked. `scripts/sync-board3d.js` keeps the copy current and
`test/board3d-gate.test.js` fails on drift — but nothing can detect *forgetting to deploy functions
at all*. Also recorded at the top of CLAUDE.md.

---

## This session: v136 → v180

An unusually long one. The 3D tactical board went from a premium prototype to the layout the whole
app uses, then got gated, then got deployed.

### The flat board took the 3D board's layout (v166)

Every coach, premium or not, now opens the same window: full-bleed, a hamburger top-left that adopts
the whole toolbar into panels, the board name beside it, a frames rail at middle right, and the page
title as a two-second announcement instead of a header. The 3D-only parts stayed 3D-only — the camera
menu, the orbit hint, the z-axis apex handle.

The layout gate stopped being `tbIs3D()` and became `tbEditorOpen()`, which probes the DOM for the
window rather than holding a flag. **Zoom and pan ride a CSS transform**, and that choice is why none
of the editor's arithmetic moved: every drag and hit test already reads
`inner.getBoundingClientRect()`, which is reported *after* transforms.

### Then a long tail of cosmetics (v167 → v174)

Menu entries lost their plates and gained hover-dim-and-grow; panels went see-through except the
library; the frames rail put play on the centre line and made `+` sticky. Three of these were the
same shape of bug — **something measured against the wrong box**:

- the panel gap was reported wrong FOUR times, because the offset was measured in turn from the
  entry's edge, from the label, from the rail's box (whose width comes from the board-name input on
  the top line, not from the labels), and finally from the widest entry. **Each of the first three
  had a passing test**;
- `.tb-m` and `.tb-cams` keep a full-height layout box while their lists are faded out, and neither
  had `pointer-events:none` — so roughly 200x340 of the pitch's top-left corner was dead to clicks.
  In 3D it went unnoticed because the click still bubbled to the wrapper; in 2D the goalkeeper and
  the back line could not be dragged, numbered or selected;
- the rail's dimming was driven by `:hover` on the rail, and the panels open *outside* the rail's
  box, so the whole column flashed on the way into every panel.

### Frames, playback and the ball (v175 → v177)

**The trajectory layer was one frame behind.** `activeFrameIdx` is a local of `bindTactics`;
`fa_tactic_frame_idx` is the copy everything outside reads. Only `saveFrames()` wrote it, and every
caller set the local, applied the frame, and only then saved — so `tb3dTouch()`, which draws the 2D
trajectories synchronously, read an index still pointing at the frame just left. Fixed at the root
with `setActiveFrame()`, and a test forbids any other assignment; writing that test found three more
instances in the playback loop.

Also: a new frame no longer inherits the previous one's `paths`; trajectories are not drawn over a
running animation (the trail and the ball's ground shadow stay, since those describe the present);
and **the ball spins** — rolling with the direction of travel, sidespin with the bend, twelve
icosahedral dots so that a spin is visible at all.

### The premium gate (v178)

`clubFeature('board3d')` hid the toggle and nothing else. Gating the SAVE cannot work — a saved board
is arrows and percentages, byte-identical whichever view drew it — so the gate is **not shipping the
code**. See the warning near the top of this file, which is the operational consequence.

### And the board opens on the board (v179 → v180)

The three-card landing screen is gone; the board type is a **Vista** toggle in the Field panel below
the pitch size. On the way, two bugs that only a portrait board could show: the 3D goal was pinned to
the centre line and its mouth centred using the goal's *height* as a plan span (a full pitch hides
both errors at once), and the penalty arc was clipped against an x edge, so a half or area board drew
a sliver hidden inside its own penalty box. That rule now lives once in board-geom, as `arcRange()`.

---

## NEXT SESSION

Nothing is half-finished. The owner is happy with the board and expects to **polish details later**.

### Hand checks: DONE, and they passed

Both shipped on arithmetic the suite cannot see, and the owner confirmed them on the live site
(2026-08-27): **the ball spin** reads correctly, and **half and area boards in 3D** have their goal
on the top line with the arc below the box. Nothing outstanding from them.

Two derivations are therefore confirmed against a real render, which is worth knowing before anyone
"tidies" either: the roll axis `(dir.z, 0, -dir.x)` and the quarter turn on a portrait goal.

### Known rough edges, none blocking

- **The 2D board's own header** was deferred by the owner and never revisited.
- **The APK has no 3D at all**, by design — `vendor/` and `board3d.js` are excluded from the mirror.
  It fails with the "could not load" message rather than hiding the toggle. Nobody has complained.
- `TB_PANEL_ALIGN` (0.5) is the panel-gap taste value, retuned four times. The lever is there.

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

17. **Move hosting off GitHub Pages, so the repo can go private.** *(owner asked 2026-08-25)*

    The repo is **public** — verified, not assumed: `GET api.github.com/repos/ScaredMeeseks/EsquerrApp`
    unauthenticated returns 200 with `"private": false`. 0 forks, 0 stars, 0 watchers, so nothing
    suggests it has been taken. It is public **because Pages requires it**: a private repo needs
    GitHub Pro ($4/mo) to publish Pages.

    `firebase.json` has **no `hosting` block at all** — Firebase Hosting is not set up here, so this
    is real work, not a flag. The shape:

    - add `hosting` to `firebase.json` with an `ignore` list mirroring `_config.yml`'s `exclude`
      (they are two lists for two channels and must be changed together — `scripts/build-www.js` is
      the third);
    - ⚠ **do not** serve `public: "."` without proving the exclusions. See Movment's CLAUDE.md: both
      `"**/.*"` **and** `"**/.*/**"` are required, because `*` does not cross `/` — the first alone
      matches `.gitignore` but not `.git/objects/…`. Sanity check: the CLI should report tens of
      files, not thousands, and `curl <site>/.git/config` must return index.html;
    - deploy, verify the served site, THEN repoint the domain, THEN flip the repo private.

    **What going private actually buys**: git history, `functions/`, `firestore.rules`, the deploy
    scripts, `CONTEXT.md`/`CLAUDE.md`/`HANDOFF.md`, `test/`. **What it does not**: the frontend.
    `js/app.js`, `js/board3d.js` and the CSS ship unminified to every browser whatever the repo
    setting. Private repo ≠ private frontend — see item 18.

    Custom domain: Firebase Hosting takes one for free (no Blaze needed), provisions the TLS
    certificate itself, and serves both apex and `www`. Buy the name anywhere; only DNS records
    change hands. Same for Pages, so the domain and the hosting move are independent decisions.

19. **Follow-ball has no button any more.** *(parked 2026-08-26)*

    The 3D camera menu was rebuilt as three circular views — Realització, Porteria, Zenital —
    plus a crosshair to re-centre. The owner asked for lateral to be dropped and follow-ball
    to be parked.

    **The CODE is untouched**: `setFollowBall`, `isFollowingBall` and the `followBall` flag all
    still work, including the part that clears the flag on any manual orbit or pan. Only the
    button is gone. Bringing it back is one entry in `tbCamsHtml()` and one branch in the click
    handler — but note it is the only camera control that holds STATE, so it also needs its lit
    class read back from the view rather than toggled blind, which is what the old code did and
    what the test `nothing in the camera menu latches` now forbids.

    `PRESETS.side` also stays, deliberately, though lateral has no button:
    `board3d-camera.test.js` measures the transition between every pair of presets, and
    `side -> top` is one of the two that used to whip 172 degrees through the overhead
    singularity. Deleting the preset to match the menu would quietly drop that coverage.

18. ~~**Code-gate the 3D board.**~~ **DONE 2026-08-26 (v178).** `getBoard3d` serves the module only
    to an entitled club; it is off Pages and off the APK mirror. The sketch below was followed almost
    exactly, and the blob-module specifier trap it warned about was real. **Kept for the reasoning
    about why gating the SAVE cannot work** — that argument is still true and someone will propose it
    again. The operational consequence is at the top of this file.

    <details><summary>the original note</summary>


    `clubFeature('board3d')` gates **the toggle button and nothing else**. Someone IT-savvy can flip
    `_clubConfig.features` in devtools, or fetch `js/board3d.js` and drive `createBoard3D` directly —
    both files are served publicly. They cannot make it *persist* (the callable is superadmin-gated
    and the club update rule allows a lead only `fcfLinks`/`schedules`), so it is a per-session hack,
    but the board works.

    **Gating the SAVE cannot work**, and it is worth writing down why so nobody tries: a saved board
    carries no evidence of which view drew it. It is arrows, positions and pen strokes as
    percentages — byte-identical from 2D or 3D. There is nothing for the server to detect. The one
    exception is 3D-only *content*: `paths` carrying a non-zero height cannot come from the 2D board,
    so a server-side reject on that is enforceable — but narrow.

    **The gate that works is not shipping the code.** Sketch:

    - a callable `getBoard3d` verifies auth, reads the club doc, checks `features.board3d === true`,
      and returns the module source as a string;
    - the client wraps it: `import(URL.createObjectURL(new Blob([src], {type:'text/javascript'})))`;
    - ⚠ **the import specifier has to be rewritten first.** `board3d.js` line 30 is
      `import * as THREE from '../vendor/three.module.min.js'`, and a relative specifier inside a
      blob module has no base path to resolve against. The client knows its own origin, so let it do
      the rewrite: `new URL('vendor/three.module.min.js', location.href).href`. three.js itself stays
      public — MIT, and not the IP worth protecting;
    - remove `js/board3d.js` from hosting (`firebase.json` `ignore`, `_config.yml` `exclude`); it is
      already denied from `www/` by `scripts/build-www.js`;
    - the function needs its own copy of the source. Copy `js/board3d.js` → `functions/private/` in
      the deploy script and add a test asserting the two are byte-identical, so a stale copy fails
      the suite rather than shipping a board two versions old.

    Cost: one callable per session that opens the board, ~76 KB. Effect: an unentitled club gets a
    hard refusal from the server; an entitled user can still extract the source from devtools, which
    is unavoidable for anything that runs in a browser. It moves the bar from "read a URL" to
    "deliberately exfiltrate".

    </details>

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

- **A mutation result is a claim about the TESTS, and only as good as the harness making it.**
  Twice in one day: a harness that restored files with `git checkout --` reverted uncommitted WORK
  rather than the mutation and reported a survivor on code that was fine; and every mutation of
  `js/board3d.js` "died" against the byte-identity guard noticing the private copy had drifted,
  which hid that nothing tested the arcs were drawn at all. Restore by copy, and sync before running.
- **A passing test can be about the wrong quantity.** The tactical panel gap was reported wrong four
  times; three of those had a precise, true assertion measuring a distance that was not the one the
  eye judges. Mutation testing cannot find this — only a screenshot did.
- **An overlay keeps its layout box while it is faded out.** `opacity:0` still hit-tests. Two menus
  were eating clicks on a third of the pitch with nothing drawn to show for it.
- **When one code path hides a bug in another, fix the reference and not the symptom.** The 3D goal
  was placed with a wrong coordinate AND that coordinate was discarded — on a full pitch the two
  errors cancelled, so the bug existed only on board types nobody had opened.
- **A fixed-width source slice in a test is a bug waiting for the next edit.** Seven of them bit
  this session, one of them written the same day. Bound on a real marker.

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
