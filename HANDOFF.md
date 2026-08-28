# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-28._

_The **Parking lot** near the foot of this file is the owner's backlog. It is carried forward
verbatim when this document is rewritten — do not regenerate it from the session you just did._

## Where things stand

**Version triple is at 196** — `CACHE_NAME` (sw.js), `APP_VERSION` (js/app.js), `CURRENT`
(functions/check-deploy.js). All three move together; `version-check.test.js` fails the suite if two
of them disagree.

| | |
|---|---|
| Unit tests | **2239** — `cd test && npm run test:unit` (~2 s) |
| Rules tests | 164 — needs the emulator |
| Functions tests | 71 — emulator |

Java 21 is installed and on PATH; the rules suite takes ~20 s and is **not** in `test:unit`.

`firestore.rules` and `storage.rules` were **not touched** this session — no rules deploy needed.

**Deployed.** `main` is at the v196 commit and Pages serves it; verified by fetching the live
`sw.js` and `js/app.js` rather than trusting the push output.

---

## This session: v187 → v196. The staff training detail, twice.

A session plan and material calculator were built (v187), then Claude Design redesigned the whole
screen and it was rebuilt to that handoff (v188), then eight rounds of driving it.

**The feature.** Beside the attendance table there is now a session plan: blocks down a rail, each
one a time slot, everything inside a block running at the same time. From the boards those exercises
point at, the page computes what to carry — cones and balls **summed inside a block, maxed across
blocks**, because equipment is reused between blocks and needed at once within one. Bibs
deliberately do not follow that rule: a colour is a set taken out of the store, so the colours are
unioned across the whole session and one is subtracted, one team always playing peto-less. Then
**Encarregats de material**, which picks who carries it from the lowest duty-count tier so the same
two lads do not do it every week.

Full detail is in CONTEXT.md under the v187–v196 entries. What matters here:

- **The data lives on the `fa_training` row** as `tr.plan` — no new synced key, no new shard route,
  no new rules. A plan is intrinsic to one session.
- **`plan.teams` is the generator's live set; `ex.teams` is a COPY** pinned to an exercise. That
  distinction is the fix for the worst bug of the session: assignments used to be a pointer, so
  re-drafting rewrote every exercise a split was already on, silently.
- **`plan.petos` is `null` until the coach touches a swatch**, and `null` is not `[]` — null means
  "the boards still speak for the bibs", `[]` means he removed every colour on purpose.
- **The printout is its own window.** Printing in place was clipped to one page by the app's scroll
  container, leaked the left pane on top of a flex layout, and dropped every background.

### ⚠ One security fix shipped with it

The match detail page wrote a stored `mapLink` straight into an `href`. `sanitize()` does **not**
stop `javascript:` — it escapes quoting, and there is nothing in `javascript:fetch(…)` to escape.
That link is typed by one staff member and clicked by another, so it would have run on our origin in
their session. All three venue sites now go through `safeHttpUrl` (utils.js), an http(s) allowlist.
Seven tests pin it, including `data:` and protocol-relative.

### ⚠ Three dev pages were public and are not any more

`pitch-preview.html`, `pitch-dark-preview.html` and `pitch-light-preview.html` returned **200** on
the live site while every other dev page 404'd. `_config.yml` excludes by **name**, so a new preview
page is public until someone remembers that file — `scripts/build-www.js` catches them by pattern
and always did, which is why the APK was never affected. Added by name.
---

## ⚠ The weekly AU figure has no colour band, on purpose

The handoff contradicts itself here and the contradiction matters. Its README says AU is
"`RPE × minutes`, the same arithmetic the Readiness engine already uses". Its mock computes
`plannedRpe * 12` — minutes = 12 — and shows weeks of 486–832 AU.

Costed properly, **one 90-minute session at RPE 7 is 630 AU**, and a week of two sessions and a match
is **~1 900**. The mock's bands (`>650` amber, `>800` red) would paint **every real week red**.

So the gutter prints the figure and no dot until real weeks say where the lines are. There is a test
in `session-load.test.js` whose only job is to show why 650 could not survive contact with real data.
**Do not add the band back from the handoff's numbers.**

Two other calls in the same place: the figure is **per player**, not summed over the squad — a squad
total moves when someone is injured, so two identical weeks would read differently — and sessions
that can be costed at neither an actual nor a planned RPE are **counted and flagged**, so a
light-looking week is never actually an unrated one.

---

## ⚠ Things that bit, and will bite again

**A Python round-trip truncated `js/app.js` to zero bytes.** The write raised
`UnicodeEncodeError: surrogates not allowed`, but `io.open(p,'w')` had already truncated the file, so
the exception left nothing. `node --check` passes on an empty file, which is how it briefly looked
fine. Restored from a scratchpad copy. **Now a rule in CLAUDE.md**: use the editor for content edits
of `app.js`; Python is for read-only inspection.

**`replace(old, new, 1)` across 27k lines is a coin flip about which occurrence it hits.** Adding one
gate landed it in `renderTrainingDetail` — the *player* page, which has no `isAct` — instead of the
staff one. A ReferenceError inside `innerHTML`, so: a blank page for every player, a green suite, and
a passing syntax check. Bound on the enclosing function.

**A source-scanning test matched its own comment THREE separate times this session.** The rule is
already in this file's lessons and it kept happening anyway: **strip comments before scanning
source**. The last one asserted `.dashboard-tight` was gone and found the note explaining why it went.

**Deleting 1003 lines silently swallowed six shared helpers** — `trainingLockAt`, `isTrainingLocked`,
`availContext`, `getEffectiveAnswer`, `buildDetailDonut`, `computeStatus` all lived between two
renderers, and `node --check` was perfectly happy. A crude scan for calls to functions that no longer
exist caught it; nothing else would have until a coach opened a session.

**A test can be about a slightly different thing than its name.** After the six v183 fixes went in,
**all 47 existing render tests still passed** — none covered anything that changed. Two mutations
survived the first v182 pass, both because the assertion matched a sibling element. Mutation-test
every round; it is the only thing that has caught these.

---

## NEXT SESSION

Nothing is half-finished. v196 is deployed and the owner is happy with the training detail.

### The owner's next item — player routing, and their home page

**Players cannot reach a training properly.** From the Calendar and from the player Home, the route
into `training-detail` is wrong. And the player home page shows trainings but **not other
activities** — a team meal or a gym block is a `fa_training` row with `kind:'activity'`
(`isActivity()` in utils.js), it rides the same blob and has the same call-ups and availability, so
it should appear there too.

Where to start:

- `renderPage()` dispatches on `currentPage`; the split is at the calendar click handler, which
  chooses `staff-training-detail` when `canEditPage('calendar')` and `training-detail` otherwise.
  Check both entry points set `detailTrainingId` before navigating — it is module state, and a page
  that navigates without setting it renders the previous session.
- `renderTrainingDetail()` is the player-facing page. It was deliberately left untouched through the
  whole v187–v196 rebuild, so it is still the pre-redesign layout.
- The player home is `renderPlayerHome` / `renderWeekActivities`. Anything that aggregates LOAD must
  keep using `trainingOnly()` — activities ride the same blob and a team dinner in the acute:chronic
  ratio tells a coach his squad is overloaded because they ate.

### Known rough edges, none blocking

- **No jsdom coverage of anything that measures.** The calendar's strip heights and the read-only
  board's scaling both only run in a browser. `material.test.js` executes the renderers over stubs,
  which catches a mistyped identifier but not a layout mistake.
- **`fa_matchday` is write-retired but not removed.** Its shard route, `SYNCED_KEYS` and
  `SEASON_KEYS` entries all stay; dropping a synced key is a separate, riskier change.
- **Dead CSS from the redesign.** `.matchday-table`, `.std-donut*`, `.tg-config*` and friends have
  no markup left (verified: 0 hits across `js/` and `index.html`), but `.tg-btn` **is** still used by
  the injury severity picker and the `.std-donut` animation rule is shared with `.assistance-circle`.
  Prune it in its own pass with the page in front of you, not by grep.
- **The tree is committed CRLF.** `.gitattributes` says `eol=lf` but everything predates it. A
  `git add --renormalize .` is the fix and deserves its own quiet commit — doing it inside a feature
  commit turns a 5k-line diff into a 45k-line one.
- The 2D board's own header was deferred by the owner and never revisited.
- The APK has no 3D at all, by design.
---

## Deployment

Frontend: **push to `main`** (GitHub Pages, plus the APK CI build). Rules/functions: `.\deploy.ps1`.

⚠ **`js/board3d.js` is NOT part of the frontend deploy** — it is the premium feature, excluded from
Pages (`_config.yml`) and from the APK mirror. It reaches the browser only through the `getBoard3d`
callable, which reads `functions/private/board3d.js`. **A change to it needs `.\deploy.ps1 functions`,
not a push.** This bit once (v179).

```powershell
cd c:\DATA\CLAUDE\EsquerrApp
.\deploy.ps1 rules -DryRun    # validate without releasing
.\deploy.ps1 rules            # firestore + storage rules
.\deploy.ps1 functions        # cloud functions  (-Install to npm install first)
```

**Accounts are per-directory.** `administracion@mov-ment.com` owns Movment and cannot see
`esquerrapp`; `firebase login:use <email>` binds an account to the current directory.

**`Cannot find module '@firebase/app'`, every function failing its health check** — not broken code.
`functions/package-lock.json` is gitignored; a local deploy uploads whatever lock is on disk and
Cloud Build runs `npm ci` against it. `deploy.ps1` refuses to start if the lock exists; move it aside.

**When the CLI and the API disagree, believe the API.** A functions deploy has printed
`Deploy failed (exit 2)` and then `No changes detected` on retry, reading as though nothing shipped.
It had — the Functions API showed the new revision and all functions ACTIVE.

### A local dev server

`node <scratch>/esquerrapp-dev-server.js` → http://localhost:8081. Serves the working tree off disk
with caching disabled and **deliberately 404s `sw.js`** (cache-first would serve you the code you
wrote twenty minutes ago, and a 404 also unregisters a worker already installed on that origin).
`GET /__version` prints what is actually on disk. **Do not serve on 8080** — that is the Firestore
emulator's port and it makes the whole rules suite fail with `501 Unsupported method ('PUT')`.

---

## Tests

```
2106 unit      cd test && npm run test:unit          (~2 s, no emulator)
 164 rules     cd test && npm run test:rules         (emulator + Java)
  71 functions cd test && npm run test:functions     (emulator + Java)
```

> **New test files must be added to `test:unit` / `test:functions` BY HAND.**
> `suite-registry.test.js` fails if any suite on disk is unregistered — it caught
> `session-load.test.js` this session, which is exactly what it is for.

> **`npm test` (the full chain) flakes** — the functions suite fails with
> `Cannot determine backend specification. Timeout after 10000` straight after the rules suite.
> Export `FUNCTIONS_DISCOVERY_TIMEOUT=120`, or run the suites separately.

New this session: `calendar.test.js` (60), `calendar-render.test.js` (76), `session-load.test.js` (30).
The render suite is the one worth knowing about: there is no jsdom here and no browser automation, so
`renderCalendar` would otherwise only ever be exercised by a human opening the app — and the failure
mode of a missing helper is a ReferenceError inside `innerHTML`, a blank screen with a green suite.

---

## How the FCF fixture import works

Full writeup in CONTEXT.md. The parts most likely to bite:

**The refresh button and the 06:00 job are two callers of ONE function** (`_syncFcfSquad`). Do not add
a client-side importer for either; that is how they would drift.

**The merge rule is the whole feature**: a field is the federation's for as long as it still equals
`fcfSnapshot`. Edit a kick-off and the sync stops touching it — for ever, and only that field.

> ⚠ **A fixture withdrawn by the FCF is MARKED, never deleted.** Call-ups, coach notes, availability
> answers and lineups all hang off the match id. An empty response is an outage, not a cancelled
> season, and is ignored.

**Imported fixtures take the acta number as their id** (~4e6, three orders below the `Date.now()` ids
the manual path mints, so they cannot collide). A double import is idempotent.

**`opponentPos` is NOT in `FCF_OWNED`** — that list is about which fields a coach's edit takes
ownership of, and a league position is never coach-editable. It is gated on kick-off instead, and
never deleted: a rival who drops out of the standings must not erase what we recorded about games
already played against them.

### The FCF API

Base `https://www.fcf.cat/api/competition/`. No key, no auth. An internal Next.js route set found by
reading their JS chunks, not a published contract.

> ⚠ **Numeric fields are home and away CONCATENATED as strings** in `classificacio`
> (`played:"1515"` = 30) and in `goleadores` (`goles`). `points`, `position`, `goalsFor`,
> `goalsAgainst` and `coefficient` are clean — which is why `parseFcfPositions` can read `position`
> directly.

---

## Reading production without a browser

ADC from firebase-tools' stored refresh token — no service-account key needed.
`~/.config/configstore/firebase-tools.json` → `additionalAccounts[]` (marna96@gmail.com). Write
`{type:"authorized_user", client_id, client_secret, refresh_token}` to a scratch file, point
`GOOGLE_APPLICATION_CREDENTIALS` at it. **Never print the token; delete after.**

> ⚠ **Take the token from `additionalAccounts[]`, NOT from the top-level `tokens`.** That file holds
> several accounts: `tokens` is whichever was primary — here `administracion@mov-ment.com`, the
> **Movment** account — while `activeAccounts` maps this directory to `marna96@gmail.com`. The
> Movment token is in a reauth state, so exchanging it fails with `400 invalid_grant`, which reads as
> a broken script rather than the wrong account.

- **A scratch script must live inside `functions/`**, or `require("firebase-admin")` cannot resolve.
- **`teams/{id}` is keyed by CLUB id.** There is no `clubId` field on a team doc — a
  `where("clubId","==",…)` query returns empty, which reads as "no teams" rather than "wrong query".

The same refresh token exchanges at `oauth2.googleapis.com/token` for a `cloud-platform` token,
which reaches Cloud Scheduler (the only way to see a cron's REAL schedule), Cloud Functions v2 (a new
revision is the proof a deploy took), Firestore REST (the ADMIN surface, not gated by
`firestore.rules`) and Firebase Rules (read the live ruleset back).

## Clubs in production

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, `amateur` only.
  FCF group for 2026-27 is **grupId 58161881** (Quarta Catalana, Grup 10), FCF team id **35410**.
- `Tm96gel58VSQvxgynf45` — **demo club** ("C.E. Sant Andreu del Palomar"), join code `9CA4RR`,
  `coach@demo.esquerrapp.app` / `DemoEsquerra2026!`. 3 teams / 77 members, 102 matches.
  **It goes stale**: `hasData` expires at `STALE_AFTER_DAYS = 10`.
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona test club.

### ⚠ Never run `seed-demo-club.js --apply` at the demo club

`apply()` builds a club from nothing. Pointed at the populated demo club it destroys it three ways,
silently: it rewrites the whole `categories` map, **replaces** data shards with a bare `set()`, and
resets all 77 Auth passwords. Guarded by neither the `demoSeed` stamp nor `PROTECTED_CLUBS`.

```bash
node functions/seed-demo-club.js --verify --club Tm96gel58VSQvxgynf45   # read-only
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45         # dry run
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45 --apply # additive only
```

**Do not run `cleanup-seed.js`** — it keys on pre-Phase-1 numeric uids.

---

## Parking lot

0. **The FCF's broken goal figures — deliberately NOT corrected.** `goles` is the home and away
   tallies concatenated as strings. Across 160 teams, 32% publish more scorer-goals than the team
   scored all season; after splitting home|away, 0% do. **The owner's call is to leave it**: this is a
   bug in FCF's new site they will likely fix, and if they fix it while we are splitting we would
   double-correct and be silently wrong. `FCF_SCORERS_RAW = true` in js/utils.js is the switch;
   `splitFcfTally` is written and tested for the day it is wanted.
1. **Fixture import covers the LEAGUE only.** A cup tie is a different `competicioId`; supporting
   cups means a second link per squad, or a competition picker.
2. **Results are not imported into the app's own fixtures.** The app computes its scoreline from
   coach-entered events. The referee index does store the federation's `gh`/`ga` per acta, so their
   result is already on the device if that decision is ever taken.
3. **Neither week strip re-renders on a timer.** Pre-existing.
4. **The cross-category call-up** — within a category it works; across them the picker filters to the
   coach's category and a player never downloads the other shard.
5. **Fill in `privacy.html`** — blocks both stores, no code dependency.
6. **The APK** — phones are on v43-era. Set `clubs/…​.minAppVersion` only once a current APK is
   actually installed.
7. **Drop dual-write** — `TB_DUAL_WRITE` still mirrors the board library into `fa_tactic_saved`.
   Gated on 6.
8. **Play Console** — $25 plus identity verification.
9. **iOS** — try web push on a home-screen PWA first (iOS 16.4+) before spending the $99.
10. **Readiness thresholds** — every measurement is against demo data that has since changed.
11. **Old-APK rules shim** — `clubs/{clubId}` still lets a lead write `fcfLinks`/`schedules` directly,
    bypassing the server-side validation in `setClubCategories`. Delete once a v55+ APK circulates.
12. Smaller: three stranded accounts on `teamId: 'default'`; availability still club-wide readable;
    orphaned shards when a category is emptied; `backfill-training-teams.js` has no `preflight()`.
13. **Follow-ball has no button any more.** The CODE is untouched (`setFollowBall`, `isFollowingBall`,
    the `followBall` flag); only the button is gone. Bringing it back is one entry in `tbCamsHtml()`
    and one branch in the click handler — but it is the only camera control that holds STATE, so it
    also needs its lit class read back from the view rather than toggled blind.
14. **Move hosting off GitHub Pages, so the repo can go private.** *(owner asked 2026-08-25)* The repo
    is public because Pages requires it (a private repo needs GitHub Pro). `firebase.json` has **no
    `hosting` block**, so this is real work. ⚠ **Do not serve `public: "."` without proving the
    exclusions** — both `"**/.*"` and `"**/.*/**"` are required, because `*` does not cross `/`.
    Sanity check: the CLI should report tens of files, not thousands. **What going private does not
    buy**: the frontend. `js/app.js` and the CSS ship unminified to every browser whatever the repo
    setting.

### The owner's roadmap *(given 2026-08-28)*

Not ordered by priority except the first, which is next. Sizes are a first read, not estimates.

**15. Player routing, and activities on the player home.** *(NEXT — see the top of this file.)*

**Match and squad**

16. **Past line-ups should show the substitutions.** Today the line-up and bench are the starting
    state; the events already hold the subs (`fa_match_events`), so this is a read, not new data.
17. **Coaches and fitness grade a player's training or match.** New per-player, per-session record —
    the `trainingAvail`/`rpe` subcollections are the shape to copy, not a blob.
18. **Coaches and fitness enter weight and height.** Fields on the user profile; note that
    `roles`/`category` are server-owned and clients cannot write them, so check what a coach may
    write to another player's doc before designing the form.
19. **Fitness performance tests** — Squat Jump (both and single-leg), CMJ, Abalakov, Drop Jump.
    A test has a date, a value and a unit; keep it one record per test so a new test is data, not a
    schema change.
20. **Players vote for the MVP.** Only the called-up squad, never for themselves, and the vote is
    final once cast. ⚠ The "cannot change it" part has to be enforced in `firestore.rules`, not in
    the UI — a client-side lock on a client-written document is decoration.
21. **RPE hidden from players.** It is a coach's planning number; check every render path, not just
    the obvious one.

**Communication**

22. **Simple messaging to players**, able to carry links and tactical boards. Push already exists
    (`onPushQueueCreate`, `teams/{id}/pushQueue`) — the hard part is the thread model, not delivery.
23. **Discipline code with fines and tracking.** Money in the app; decide early whether it records
    or settles, because they are different products.
24. **Carpooling for away games.** Offers, seats, who has a place.

**Opponents and the federation**

25. **Opponent's last five matches.** The FCF payload already carries last-5 form for every team in
    the same response the standings come from — see the note in utils.js.
26. **Search the FCF by player name.**

**Tactical board**

27. **The 9.15 m corner arc**, drawn outside the pitch. `BG.MARKS` is where the regulation
    distances live; `board-markings-render.test.js` pins the rest.
28. **Advertising boards around the pitch.**

**Data**

29. **Wire the Xweather free API.** The strip is already reading `tr.weather`
    (`{cond, windMs, tempC}`) and rendering placeholders — this is the write side only. Wind stays
    in **m/s** and is banded at render time; the band is a presentation choice, the number is the
    fact.

---

## Lessons that keep repeating

- **A mutation result is a claim about the TESTS, and only as good as the harness making it.**
  Restore by copy, and sync generated copies before running.
- **A passing test can be about the wrong quantity.** Or about a sibling element — two mutations
  survived this session because the assertion matched a `cal-x` on an inner line rather than the
  wrapper it was named for.
- **A test that greps source will match its own comment.** Three suites this session. Strip comments.
- **Check the thing against a value it did not come from.** The v117 "our row is highlighted" check
  passed FCF's own club name in as the club name, so it proved nothing.
- **An upstream field can be wrong, not just missing.** `played:"1515"` parses cleanly and is nonsense.
- **A broken feed and an empty one must not look alike.** Every no-data path renders a reason.
- **One definition, or it drifts.** `_syncFcfSquad` serves both the button and the cron;
  `scheduleSlots` serves both the placeholders and the New Training page. And when two states must
  agree — the calendar's open state and the state it is measured in — make them **share the rule**,
  not merely match: they drifted the day they were written as two lists.
- **An empty query result is not evidence of absence** — it is often the wrong query.
- **Check the artefact, not the operation** — `curl` the served `sw.js`, not the push output.
- **`deploy.ps1` is Windows-only and Cloud Shell is not the local machine.**
- **Two correct jobs can leave a gap between them.** Ship it, then go and look.
