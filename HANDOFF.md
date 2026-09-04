# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-09-04._

_The **Parking lot** near the foot of this file is the owner's backlog. It is carried forward
verbatim when this document is rewritten — do not regenerate it from the session you just did._

## Where things stand

**Version triple is at 231** — `CACHE_NAME` (sw.js), `APP_VERSION` (js/app.js), `CURRENT`
(functions/check-deploy.js). All three move together; `version-check.test.js` fails the suite if two
of them disagree.

| | |
|---|---|
| Unit tests | **2924** — `cd test && npm run test:unit` (~10 s), all passing |
| Rules tests | **170** — re-run and passing; `firestore.rules` CHANGED and was deployed |
| Functions tests | 71 — **not re-run this session**; `functions/` logic was not touched |

Java 21 is installed and on PATH; the rules suite takes ~20 s and is **not** in `test:unit`.

⚠ **`firestore.rules` CHANGED this session and WAS DEPLOYED** (`.\deploy.ps1 rules`, released to
`esquerrapp`) — `phone` and `agent` joined the staff allowlist on `users/{uid}`. Rules went out
BEFORE the frontend push, because the other order leaves a window where the new input is on screen
and every save it makes is refused. `storage.rules` is unchanged (the deploy re-releases it
together; it reported "already up to date"). No functions deploy — the only edit under `functions/`
is the version constant in `check-deploy.js`, a diagnostic script. The frontend shipped by pushing
`main`.

⚠ **Not yet driven by hand.** The owner is testing v230 after the deploy. The path worth clicking
first is **clearing an answer** — tapping the chosen pill a second time — because it deletes both
the new `uid_sessionId` record and the legacy `uid_date` one, and it is the branch with the least
coverage upstream of this change.

---

## This session: v230. Inici — the two landing pages, and the page attendance is
## answered on.

The seventh Claude Design handoff (`Baixades/EsquerrApp Home UI/design_handoff_inici/`), and the
first that is not a staff screen: one `.ini-` block dresses BOTH landing pages, the player's
(`player-home`, sidebar label now "Inici") and the coach's (`staff-home`).
**Per-version detail is in CONTEXT.md**; this is what a reader needs before touching it again.

### The thing that made this different from the six before it

`renderWeekActivities` is the app's **primary answering surface** — the Accions page carries match
availability only. So a "format change" here is a change to the control players use to tell their
coach whether they are coming.

The handlers in `bindDynamicActions()` bind **by name**: `.avail-btns[data-avail-sid]`,
`.avail-btn[data-avail]`, `.avail-chosen`, and the `.mavail-*` pair. Rename one and it does not
throw and does not log — the pill stops saving, and the coach's sheet goes on reading "available"
because `getEffectiveAnswer()` counts a silent player as a yes. **There is no louder failure
available**, which is why `test/inici.test.js` renders the real builders, mounts the real handlers
over the result in jsdom, and asserts the write that comes out rather than asserting the markup.

The write path itself was not touched: `ackSaveRecord` → `DB.submit`, `recordKey`, the body-map
picker, the lock rule, the staff notification.

### What shipped

`renderPlayerHome` and `renderStaffHome` rebuilt as `ini-` builders over one paper surface;
`renderWeekActivities` and `renderStaffWeek` return `{html, pending, count}` instead of a string.
New `test/inici.test.js` (44 tests, 12 driving the real binder in jsdom), six `sanitize()` tests in
`test/utils.test.js`, and `scripts/build-inici-preview.js`. Unit 2845 → 2897.

**One deliberate simplification.** The old markup was a single `.avail-chosen.avail-default` badge
that grew four buttons on click; because those buttons were injected *after* `bindDynamicActions()`
had run, they had to be bound on the spot — a duplicate of the whole save path. The two copies had
already drifted: the inline one never cleared `fa_injury_notes`, so a player who reported an injury
and then answered "Sí" stayed flagged injured on the coach's roster. All four pills are visible up
front now, so there is one writer. ⚠ If a future design wants an expanding control again,
**re-render the row** — `renderPage()` rebinds everything and costs one frame — rather than
injecting into it.

### Two decisions worth not re-litigating

**Default-Yes stays visible.** The handoff draws an unanswered session as four empty outlines.
`getEffectiveAnswer()` counts no-answer AS yes and every coach-facing figure relies on it, so four
empty outlines would tell the player nobody knows while the coach's sheet already had them down as
available. Unanswered renders `Sí` as ASSUMED (`ini-assumed`, pale) instead. The honest half is the
section head's pending count, computed from **raw** records — the one place the two views are
allowed to differ, and it is the half that tells the truth to the person who can fix it.

**Staff Inici renders no answer control and writes nothing**, and the suite asserts it emits zero
`data-avail`/`data-mavail` attributes. A coach answering *for* a player is the staff override on
the session page, where it is recorded as an override.

Smaller ones: `N absències avisades` counts answers of value `no` (the app has no justified-absence
concept, and inventing one would be a figure with nothing behind it); every active FCF league is
stacked in the rail and the per-league eye is retired (`fa_hidden_leagues` was never a synced key,
so a table hidden on the phone was still there on the laptop and nothing said why); `Fora de
combat` + `Watch list` merged into one `LESIONATS I RISC` block.

### `sanitize()` now escapes quotes — app-wide, not just here

It was `textContent` → `innerHTML`: `&`, `<`, `>`. Complete between tags, silently incomplete
inside a double-quoted attribute, because the quote is what ends an attribute and no `<` is needed
to break out of one. `app.js` builds 30 attributes through `sanitize()`; most carry app-generated
ids, but a handful carry typed text (a coach's injury note, a session's focus and location, a
player's own name). Reachable only from inside the club, so low severity — but it also broke a
plain form field with no malice: a location typed as `Camp "El Nou"` truncated its own `value=""`.

⚠ **It was safe to fix globally only because the escaping is invisible where the old behaviour was
already correct**: between tags `&quot;` RENDERS as `"`, and read back off an attribute the browser
decodes it, so the two places that put JSON in an attribute and parse it back (`data-frames` on a
tactical board, `data-pl-tip` on the Plantilla chart) still parse. Both are pinned in
`test/utils.test.js`, with the ordering trap: `&` is escaped FIRST by `textContent`, quotes after,
or every quote ships as the literal text `&amp;quot;`.

### Two traps for whoever is here next

**The preview is not optional, and `--window-size` lies.** 43 assertions were green when the 390px
render showed the `Convocatòria` button sitting *before* the "N sense resposta" it belongs to, so
the count read as the next row's — `order` is a property of a container's children, and the two
cases sharing `.ini-ev-right` (a session's donut-plus-text, an unsent match's text-plus-button)
have different children. Third time the render step has earned itself.

⚠ And headless Chrome on this machine **clamps its window to ~485 CSS px**, lays the page out at
485 and crops the bitmap to whatever width was asked for — so a `--window-size=390` shot looks like
a page overflowing its phone breakpoint and is neither the overflow nor the phone. That cost a
round of chasing a defect that was not there. Use `Emulation.setDeviceMetricsOverride` over the
DevTools protocol (node 22+ has a built-in `WebSocket`, nothing to install) and have the probe
print `document.documentElement.clientWidth` back, so a run cannot silently lie about its width.

**Anchor a slice on a declaration, not on the comment above it.** Both `test/inici.test.js` and
`scripts/build-inici-preview.js` sliced the Inici block from a doc comment, and both broke the
moment that comment was deleted. They anchor on `const INI_SEGS = [` now.

### Where the seams are, if something looks wrong

- `test/convocatoria.test.js` sliced the stylesheet with an **open-ended** `css.slice()` that worked
  only because `.cv-` was the last block in the file. Appending `.ini-` put every Inici rule inside
  `CVCSS`, where it could satisfy a question asked about Convocatòria. It has an end bound now —
  **if an eighth page is appended, that bound must name it.**
- `test/fcf-tabs-render.test.js` grabs the FCF tabs region and scans it for calls to undeclared
  globals. Its end marker was `function renderPlayerHome()`, which swept the new Inici helpers in
  and read the string `var(--pp-ok)` inside a donut's inline style as a call to a global named
  `var`. It ends at the INICI banner now.
- Nine `--pp-*` tokens were added and the matching literals at `.std-sel-pill` and `.pt-leg-draw`
  converted. Proved inert by resolving every token back to its literal and diffing the stylesheet
  byte for byte against HEAD — the v228 method. ⚠ Three of the nine are one shade from a token that
  already existed: `--pp-warn-dark` is **not** `--pp-amber`, `--pp-bad-dark` is **not**
  `--pp-med-inj-ink`, `--pp-input-line` is **not** `--pp-rule-4`.
- 19 deliberate mutations (renamed attributes, an unscoped borrowed rule, a presentation-attribute
  `var()`, a dropped `KEY_PAGES` entry, a missing Spanish string, both geometry regressions, both
  halves of the sanitize fix) all turn the suite red, tree restored byte-for-byte afterwards.

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
4. **The cross-category call-up — mostly NOT open, and the wording here was misleading for a
   long time.** It **works today** for anyone whose remit covers both squads: a coach with
   `staffCategories: ['amateur','juvenil']` on "Totes", or any lead or admin, sees both squads in
   Disponibles and can drag a juvenil player onto an amateur fixture's acta. Verified against the
   real render, not inferred. Since v229 that player also STAYS on the acta whatever the filter
   says, and is badged on both sides.

   The only person who cannot is a coach the club has **not** made staff of that category — and for
   him it is the correct answer, not a defect. `staffCategories` is written server-side from the
   club's rosters, `getVisibleCategories()` intersects it with the enabled list, `DB.setScope` turns
   that into `where('category','in',…)`, and `firestore.rules` would REFUSE the read anyway
   (`resource.data.category in request.auth.token.cats`). `fa_users` is sharded per category, so the
   other squad's names are not on his device at all. That is Phase 5 working: before it, one
   club-wide blob per key let any coach read every squad's medical records.

   ⚠ So "let him convoke outside his categories" is not a fix, it is **widening his `cats` claim** —
   which widens medical-record access with it. Club policy, not a bug.
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
12b. **A failed profile-photo upload poisons `fa_users`.** *(found v231, not fixed.)* The upload
    falls back to a `FileReader` data URI of up to 2 MB, and `setSession` persists it verbatim to
    `users/{uid}` **and** to the synced `fa_users` blob — a Firestore document with a **1 MB
    limit**. One failed upload by one player can therefore break `fa_users` syncing for the whole
    club, and the symptom would look nothing like its cause. The fix is to drop the fallback (an
    upload that failed should say so) or downscale to a thumbnail before encoding. The two fallback
    sites are `js/app.js` ~32820 (the Inici hero) and ~5210 (profile setup).
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

**15. Player routing, and activities on the player home.** ✅ **Done — v197/v198/v199.** Routing
    fixed (`trainingDetailPageFor`), a view-only staff member sees the schedule again
    (`isStaffViewer`), and activities now show on the player home under their own name and badge with
    their availability buttons intact. All three were the same class of mistake: a permission or a
    field standing in for a question it does not answer. **Worth grepping `canEditPage(` and
    `.focus ||` for more of the same.**

**16. ~~⚠ IMPORTANT — the tactical boards' animation playback is broken.~~** ✅ **FIXED, and this entry was stale.** *(owner, 2026-08-28; found already done in v214.)* `test/ro-playback.test.js` opens by naming SIX defects and the two that mattered — the per-tick `scaleRoField` relayout, and the RAF loop guarding on a `_roPlaying` expando that a detached node keeps. Both fixes are in the source (`roDead()` guards on `isConnected`; the width is measured once at click time) and 41 assertions pin them. The pointers below are kept only because they are still an accurate map of that code.
    A board with more than one frame renders a `▶` and is supposed to tween between them; it does
    not play properly. Nothing about it has been diagnosed yet, so treat the pointers below as where
    to look, not as the cause:

    - `bindRoBoardAnimations()` (js/app.js ~8631) binds every `.tb-ro-play` in the DOCUMENT, and the
      panels that re-render themselves call it again afterwards. There is a `btn._roBound` guard for
      exactly that, and a comment recording the last time a double listener made one click start and
      immediately stop the animation — a flash that reverts, with no error. **Check that guard still
      holds now that `stdRefreshPlan()` is a third caller** (v188 added it).
    - The frames travel in a `data-frames` attribute on the field (~8535), JSON with quotes escaped.
      `renderReadOnlyBoard` emits frame 0 when `frames.length > 1`.
    - The tween is `BS.tweenFrame` (js/board-state.js) over four tracks only — `positions`,
      `oppPositions`, `balls`, `cones`. Everything else comes from the target frame by design.
    - `_roPlaying` is a flag hung on the field ELEMENT (~8659), so anything that replaces that
      element mid-play leaves the old flag with it and the button out of step.
    - There is a stale-closure note at ~7230 about the frames array that names this same button.

    No test covers playback, and it cannot be seen in the unit suite: it is timers plus DOM. Reproduce
    it in the browser first and write down what "broken" is — does it not start, start and stop,
    play once, or drift — because those are four different bugs.

**Match and squad**

17. **Past line-ups should show the substitutions.** ✅ **Already done — discovered in v214, not
    built.** `mnLineupChipsHtml` has drawn on/off marks through `matchPlayerMarks` since the
    briefing was written, and the v216 anada block shows them with minutes beside them.
18. **Coaches and fitness grade a player's training or match.** New per-player, per-session record —
    the `trainingAvail`/`rpe` subcollections are the shape to copy, not a blob.
19. **Coaches and fitness enter weight and height.** Fields on the user profile; note that
    `roles`/`category` are server-owned and clients cannot write them, so check what a coach may
    write to another player's doc before designing the form.
20. **Fitness performance tests** — Squat Jump (both and single-leg), CMJ, Abalakov, Drop Jump.
    A test has a date, a value and a unit; keep it one record per test so a new test is data, not a
    schema change.
21. **Players vote for the MVP.** Only the called-up squad, never for themselves, and the vote is
    final once cast. ⚠ The "cannot change it" part has to be enforced in `firestore.rules`, not in
    the UI — a client-side lock on a client-written document is decoration.
22. **RPE hidden from players.** It is a coach's planning number; check every render path, not just
    the obvious one.

**Communication**

23. **Simple messaging to players**, able to carry links and tactical boards. Push already exists
    (`onPushQueueCreate`, `teams/{id}/pushQueue`) — the hard part is the thread model, not delivery.
24. **Discipline code with fines and tracking.** Money in the app; decide early whether it records
    or settles, because they are different products.
25. **Carpooling for away games.** Offers, seats, who has a place.

**Opponents and the federation**

26. **Opponent's last five matches.** ✅ **Done — v214.** The note was right: `form` was in the
    classificacio payload all along, five entries, most recent first, G/E/P from that row's own
    point of view. `parseFcfForm` maps to W/D/L (P is the letter for a WIN in English) and drops an
    unknown letter rather than inventing a draw. ⚠ Pre-season every row's `form` is `[]`, so the
    strip renders nothing rather than five blanks.
27. **Search the FCF by player name.**

**Tactical board**

28. **The 9.15 m corner arc**, drawn outside the pitch. `BG.MARKS` is where the regulation
    distances live; `board-markings-render.test.js` pins the rest.
29. **Advertising boards around the pitch.**

**Data**

30. **Wire the Xweather free API.** The strip is already reading `tr.weather`
    (`{cond, windMs, tempC}`) and rendering placeholders — this is the write side only. Wind stays
    in **m/s** and is banded at render time; the band is a presentation choice, the number is the
    fact.

---

## Lessons that keep repeating

- **The bug is often not where the feature is.** This session's routing code was correct throughout;
  three separate delivery paths were dropping the event before it reached it. Follow the event in
  from the edge — the OS, the service worker, the plugin — not out from the handler.
- **A mutation result is a claim about the TESTS, and only as good as the harness making it.**
  Restore by copy, and sync generated copies before running.
- **A passing test can be about the wrong quantity.** Or about a sibling element — two mutations
  survived once because the assertion matched a `cal-x` on an inner line rather than the wrapper.
- **A test that greps source will match its own comment.** Strip comments.
- **Check the thing against a value it did not come from.** The v117 "our row is highlighted" check
  passed FCF's own club name in as the club name, so it proved nothing.
- **An upstream field can be wrong, not just missing.** `played:"1515"` parses cleanly and is nonsense.
- **A broken feed and an empty one must not look alike.** Every no-data path renders a reason.
- **A silent `return` is a bug that leaves no trace.** `if (!s) return;` swallowed every cold-start
  notification tap, and there was nothing to find afterwards — no error, no log, no wrong screen,
  just the home page. Prefer buffering or logging to dropping.
- **One definition, or it drifts.** `_syncFcfSquad` serves both the button and the cron;
  `scheduleSlots` serves both the placeholders and the New Training page; `applyPushNav` now serves
  both the live tap and the replayed one. And when two states must agree, make them **share the
  rule**, not merely match: they drifted the day they were written as two lists.
- **An empty query result is not evidence of absence** — it is often the wrong query.
- **Check the artefact, not the operation** — `curl` the served `sw.js`, not the push output.
- **An old APK is an old client.** A frontend fix is not live for the club until a build circulates,
  and "it still does not work" from a phone is not evidence about the code until you know which
  build that phone is running.
- **`deploy.ps1` is Windows-only and Cloud Shell is not the local machine.**
- **Two correct jobs can leave a gap between them.** Ship it, then go and look.
