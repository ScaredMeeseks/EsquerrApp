# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-04._

**Production is on v74.** The team quota shipped in two deploys (v55 limit, v56 deletion + gate), plus v57 self-verification, v58 an onboarding fix and v59 the readiness engine. Rules and functions changed for the first time since Phase 5 — both deployed and verified 2026-08-04. Tests **511 passing** (370 unit + 103 rules + 38 functions), up from 143 at the start of this work.

v46–v54 and v59 are frontend-only (per-club season boundary, the demo-club seeder, demo-walkthrough fixes, the staff home page, navigation fixes, two rounds of performance work, readiness presentation and then its engine). v55–v58 are the team quota, and the first change since Phase 5 to touch rules and functions.

The demo club is live and seeded with faces (`Tm96gel58VSQvxgynf45`, see Demo club below).

## Backlog — what's left (2026-08-04)

Ordered by what I would pick up next. Nothing here is blocking.

### 1. Readiness — done for now; revisit with REAL data (v52, v59, v60, v61)
Flagging is down from **76% → 40%**, green **24% → 48%**. Presentation (v52), three engine defects (v59), two thresholds (v60) and the consecutive-sessions rule (v61) are all shipped.

What is left is not a code question: **every measurement so far is against synthetic demo data**, so it describes the model's structure rather than real footballers. The live club has had real RPE only since the Phase 5 wipe. Re-run the distribution script against real data before touching another threshold.

The one open *design* question, no longer a defect: the colour is not a function of the score, so two players can show 72 in different colours. The tooltip now names the rule that fired, which answered the original complaint.

### 2. ~~Per-team training~~ - DONE (v70, v71, v73)
Stage 1 (the model, end times, session-id keying, player-page scoping, the slot generator) is v70. Stage 2 (the record re-key, the dual read, the migration, the reminder scoping) is v71. **Stage 3** is the New Training page: pick teams, see the called squad with a total, "+ Add Player" across the club, clash warnings. Plan: `~/.claude/plans/continuing-on-the-esquerrapp-streamed-waffle.md`.

**v71 is fully deployed and migrated (2026-08-05).** Functions deployed; the record migration applied to the demo club and verified: 3,427 `trainingAvail` and 2,684 `rpe` documents re-keyed to the session id, **zero ambiguous**, with every legacy document still present on purpose (the old APK reads them, and they are the rollback path). Match and extra RPE were correctly skipped - they already carry unambiguous ids.

**The real club has NOT been migrated.** It does not need to be: the dual read means the app is correct either way, and the collision only becomes reachable once guest call-ups exist. Run the dry run and read it before applying there.

**Run the backfill before stage 3:** `node functions/backfill-training-teams.js --club Tm96gel58VSQvxgynf45` (dry run first).

#### Original note, for context
Trainings carry only a `category`, never a team letter, so `amateur-A` and `amateur-B` literally share sessions. Giving them a letter means **re-keying the training subsystem from date to session id**: `detailTrainingDate`, eight `find(x => x.date === …)` sites, and the `{uid}_{date}` record ids. Two teams in one category will routinely train the same evening, and `find` by date returns whichever comes first. Deserves its own plan and its own deploy. The one-off guest-list idea rides on top of it.

### 3. ~~Archived seasons broken post-Phase-5~~ - DONE (v69)
Fixed, plus three more defects found in the same feature: attendance was structurally dead, archiving a label twice destroyed the first archive, and archived reads ignored the category claim. See v69 below. **Needs `./deploy.sh all` - rules and functions both changed.**

### 4. Drop the old-APK rules shim
`clubs/{clubId}` currently allows a lead to write `fcfLinks`/`schedules` directly, purely so pre-v55 APKs keep working. Once a v55+ APK is actually on the phones, delete that clause so the club document is superadmin-only in full. Guarded by a rules test that pins the `diff()` behaviour.

### 5. The APK itself
CI has built through v58; the phones are still on a v43-era build. Set `clubs/nDLJCpJfDvFHs8MnwtzW.minAppVersion` **only once a current APK is installed**, not before. The web app is the working client meanwhile.

### 6. Smaller / older
- **Three stranded accounts** on `teamId: 'default'` with `cats: []` — you've said losing them is fine.
- **`trainingAvail` / `matchAvail` / `rpe` are still club-wide readable.** Phase 5 stopped short deliberately; the sensitive data (medical) *is* scoped, so this is an incremental privacy improvement, not a hole.
- **Orphaned shards when a category is emptied.** `deleteTeam` removes the category's trainings, but `fa_tactic_saved__{cat}` and `fa_tactic_training_boards__{cat}` are left unreadable. A `--gc` sweep script would clear them.
- **Uncategorised players**: excluded by medical and roster, included by training-detail — three staff pages, two semantics.
- **Tactic board copies are matched by name**, and since sharding the same name can exist in two categories.
- Firebase Hosting migration (real cache-control); multi-club membership (`teamId` is single-valued); delete `fa_users` in favour of the `users` collection; read-time fitness derivation.

### Known residual risk (accepted, not a bug)
A client saving **during** a `deleteTeam` can republish rows, because every client holds the whole blob and writes it back wholesale. v57 retries once and reports `resurrected` in the marker doc rather than failing silently. Re-running is safe. A rules lock would close it properly but costs a document read on every `data/` write, forever.

## Cloud Shell: a deploy DOES strip gcloud's identity (confirmed twice, 2026-08-05)

Cost most of a session. Symptom: every Admin SDK script fails with

    Getting metadata from plugin failed with error:
    Cannot create property 'refresh_token' on string ''

while `firebase deploy` keeps working perfectly — because the Firebase CLI
uses its own stored login, **not** ADC. That mismatch is what disguises it.

**The one diagnostic that identifies it:** `gcloud auth list`. If it says
*No credentialed accounts*, stop reading stack traces — gcloud has no
identity and nothing config-level will fix it.

Root cause seen here: something (Cloud Shell tooling or the Firebase CLI —
**not** our `deploy.sh`, which never touches it) pointed `CLOUDSDK_CONFIG`
at a temp dir; the leftover `__TMP_CLOUDSDK_CONFIG=/tmp/tmp.XXXX` in the
environment is the fingerprint. `~/.config/gcloud` was left without
credentials, and Cloud Shell's metadata endpoint returned nothing either.

**Fix: restart the VM** — three-dots menu -> Restart, not a new tab, not
`unset`. Credentials come back on boot. Then `cd ~/EsquerrApp` (a restart
drops you in `~`) and note nvm resets to the default Node.

**Reproduced twice, both times immediately after `./deploy.sh`.** Treat it
as causal, not bad luck. Two ways to avoid the round trip:

  * **Run Admin SDK scripts BEFORE deploying**, not after. A backfill and a
    deploy in the same sitting will otherwise always cost a restart.
  * Or budget for the restart: deploy, restart, then run the script.

`functions/preflight-adc.js` now catches this in every script, so it costs
one clear line rather than an afternoon of chasing environment variables.

Do NOT run `gcloud auth application-default login` first: it warns it is
unnecessary on a GCE VM and puts personal credentials on a shared disk.

**Still to do:** `functions/backfill-training-teams.js` has no `preflight()`.
`seed-demo-club.js` does, and it turns exactly this failure into one
actionable line instead of a 30-line gRPC stack. Copy it across.

## v73 - the New Training page, stage 3 of 3 (2026-08-05)

"+ Entrenament" opens a page instead of appending a row, and nothing is written until Save. A half-configured session used to be a real row in everybody's calendar the moment you clicked.

- **Pick the teams**; each proposes its own schedule. Differing defaults give one session per team, identical ones collapse into a shared session.
- **The called squad with a running total**, reusing the match call-up's components. `x` per row: a guest is un-invited, a squad member gets an exclusion.
- **"+ Add Player" spans the whole club** - borrowing from another squad is the point. Multi-select, one Add. The generator's "invent a player if no name matches" behaviour is dropped: only real roster players.
- **Clash warnings** on overlapping `[start, end)`, and **Save acts on them** - the player really is removed from the session he was in. Resolved at save, not at Add, so moving the times afterwards still resolves correctly.

`addTraining()` deleted; its slot arithmetic is `buildTrainingDrafts()`, now executable by tests rather than source-asserted.

**A bug the tests caught before it shipped:** `_ntSave()` resolved clashes against `getTrainings()`, which re-parses the blob and hands back FRESH objects, so the exclusion was written to a throwaway copy and lost. It takes the array being saved now.

17 new tests. Frontend only.

## v72 - no category switcher on a training session (2026-08-05)

A session belongs to specific teams now, so it IS one category by definition. The bar invited a coach to change the category out from under a session he was already looking at. `staff-training-detail` came out of `CATEGORY_PAGES`.

## v71 - training records keyed by session (stage 2 of 3, 2026-08-05)

`{uid}_{date}` could only hold one answer per day; guest call-ups break that. Records are keyed by session id now, and legacy ones are still read - the v43-era APK knows only the date form. The fallback applies **only to a session of the player's own team**: a legacy record can only ever have meant his own session, so honouring it for a guest appearance would answer one he was never part of.

All three keys (availability, session RPE, staff override) moved in one commit, along with read and write together - splitting either way loses answers silently.

**The reminders were nagging the whole club.** Not caused by this change, exposed by it: a juvenil player was told to confirm attendance for an amateur session. `scheduledRpeReminder` also used `find` on the date, so with two squads training the same evening only one session was ever considered. Both fixed; `squadForSession()`/`answeredFor()` mirror the client's rules and `test/reminders.test.js` pins the two copies together.

**`functions/preflight-adc.js`** - shared credentials check, used by both backfills. An auth failure now names the diagnostic (`gcloud auth list`) and the fix (restart the VM) instead of printing a gRPC stack.

22 new tests. **Needs `./deploy.sh functions` and the record migration - see backlog item 2.**

## v70 - per-team training, stage 1 of 3 (2026-08-05)

The model. Sessions now carry `teams`, `guests`, `excluded`, `endTime`; an **empty `teams` still means every letter of the category**, so nothing breaks before the backfill. The squad is derived on every read, never stored.

- Club config gained **end times** per training slot - the app had no duration anywhere, and clash detection needs one.
- Detail views keyed by **session id**, not date. Same collision fixed in the generated-teams cache and the tactics-board link button.
- **`getTrainings()`** is now the one reader (29 sites) and repairs missing ids everywhere, **guarded by role** - `fa_training` is not player-writable, so a player repairs in memory only.
- **The player pages were over-sharing:** the week strip, home donut, actions queue and sidebar badge read the whole club calendar with no category filter. A juvenil player saw amateur sessions and could answer for them. All four now use `playerTrainings()`.
- **The generator stopped dropping a team's slot** - it deduped by day+time and discarded the letter.
- The staff detail page stopped reverse-matching schedules to guess which letters shared a slot.

31 new tests.

**Backfill APPLIED to the demo club (2026-08-05).** 136 sessions stamped; a re-run reports `0 to stamp - 136 already set`, so it is idempotent. Result: `amateur -> [A,B]` x67, `juvenil -> [A]` x68, and one `amateur -> [B]`. That last one is a seeding artefact, not a fault: amateur-A was seeded on the 4th and amateur-B on the 5th, so the session that fell between the two runs was "upcoming" for A and "past" for B, and only B players ever answered it. Harmless - A has no records for it either.

**The real club has NOT been backfilled.** Run the dry run first and read the breakdown before applying.

## v69 - archived seasons, broken since Phase 5 (2026-08-05)

Four defects, one feature. It never threw - it rendered every archived season as **empty**.

1. **`loadSeasonData` keyed by raw doc id.** Post-Phase-5 those are `fa_matches__amateur`, so `data.fa_matches` was absent and every `|| []` fallback turned a full season into an empty one. Now grouped by `Shard.parseDocId` and reassembled with `Shard.merge`, the same function the live loader uses. **Both id formats work permanently** - a pre-migration archive keeps flat ids for ever.
2. **Attendance was structurally dead**, reading a key the server stopped archiving. Now loaded from `seasons/{label}/trainingAvail`, lazily, reusing `RECORD_COLLECTIONS` exported from `db.js`.
3. **Archiving a label twice destroyed the first archive** - no existence check, and run two wrote the emptied live data over it with a 200. Now 409, `?overwrite=true` to force.
4. **Archived reads ignored the `cats` claim**, so archiving declassified medical data. Now scoped like live data. The per-record collections are **enumerated, not wildcarded** - overlapping rule matches are OR'd, so a wildcard would have silently re-granted the club-wide read.

32 new tests where there were **zero**. **DEPLOY: `./deploy.sh all`** - rules and functions both changed.

## v68 - every navigation lands at the top (2026-08-05)

Pages opened at whatever offset the previous one was scrolled to. `#view-dashboard` is a fixed shell, so `.dashboard-content` is the scroller, and `renderPage()` replaces its `innerHTML` without replacing the element - the browser keeps `scrollTop`.

**The guard is the load-bearing part.** ~70 callers of `renderPage()`, only ~20 change the page; the rest re-render in place (firestore sync, category bar, language, optimistic redraws). An unguarded reset would jerk a coach to the top every time a sync landed.

`renderPage()` already knew the difference for Back and the sidebar highlight; those two lines are now `trackNavigation(page)` and all three behaviours key off it. `showView()` also resets the document scroll, for the auth views, which are not the fixed shell.

Back lands at the top too - one rule, no exceptions. Restoring a list position on Back is a deliberate non-goal.

Incidental: `navigation.test.js`'s `go()` re-implemented the tracking lines instead of calling them, so its assertions were pinning a duplicate. Fixed. 8 new tests.

## v67b - `--add-team`, for a club that already has data (2026-08-05)

Dev tooling only, nothing shipped. `apply()` builds a club from nothing and would destroy a populated one three silent ways: it rewrites the whole `categories` map, it replaces shards with a bare `set()` (and `fa_users` is routed by category with **no team letter**, so `amateur-A` and `amateur-B` share one document), and its uids/emails derive from the club id alone.

`--add-team {category}-{LETTER}`, repeatable, is the additive mode: read-modify-write on every shard, dotted field paths on `clubs/{id}`, and it **refuses** any club not stamped `demoSeed`, any `PROTECTED_CLUB`, and any team that already has players. Its dry run reads, unlike the offline one.

`fa_training` has no team letter, so `amateur-B` reuses amateur's existing sessions with its own attendance and RPE; `juvenil-A` gets a fresh calendar.

38 new tests. **The team must be configured in the app first** - the quota stays enforced in `setClubCategories`, and the seeder does not hand out teams.

**Done and verified in production (2026-08-05).** `--verify` reports 19 data docs, `fa_users` merging to **77 members** (25 amateur-A + 25 amateur-B + 25 juvenil-A + 2 staff, so nothing was overwritten), 77 users stamped `demoSeed`, 75 profile pictures each backed by a real Storage object.

One cosmetic bug found in the dry run and fixed after: `report()` read `OPTS.letter`, which `addTeams()` mutates per team, so `amateur-B` was announced as "team A". Data was correct. `buildSeason()` now stamps `S.letter` and the post-loop readers use it.

**Demo credentials for the new squads:** `amateurb-player01@demo.esquerrapp.app` and `juvenila-player01@demo.esquerrapp.app`, same password as the rest.

## v67 — "Totes" never did anything (2026-08-04)

Not disabled, not a permissions problem. `_viewCategory` held three states in two values: `''` meant both "never chosen" and "pressed Totes", and `getCurrentCategory()` tested it with `if (_viewCategory && …)` — so the explicit branch was falsy and the session's default category won.

That default is stamped on every staff member by `membershipFrom()` *"for the UI's default view"*, so the button was a guaranteed no-op for **every lead and every multi-category coach**, and never lit up either (`renderCategoryBar` marks it active on `!cur`). Xavier Bonet, the demo club's lead, sees all categories while his own stays `amateur`.

`null` = unset, `''` = Totes. Branch order is the fix: scoping first (one visible category outranks any stored choice), then the explicit press, then the default. Both reset sites go to `null`, never `''`. `clearSession()` clears it so a filter cannot cross a logout.

7 new tests in `test/context.test.js`. **Relevant to the demo seeding below** — the bar only renders with 2+ visible categories, so this bug was invisible until the demo club got a second one.

## v66 — an invisible div was hanging off the bottom of every page (2026-08-04)

The last 29px of the band. Every box measured 2484 — `.auth-container`, `.view`, `body`, `html` — while `scrollHeight` read 2513, so the gap could only be **scrollable overflow**. Enumerating elements below the gradient named it outright: `DIV#roster-tooltip | bottom 2501 | absolute`.

It is appended to `<body>` once and never removed, hidden by **`opacity: 0` alone**, which still occupies layout. Absolutely positioned with no `top` yet set, it sat at its static position — the end of the body's content, just past the foot of the page — adding ~29px of overflow to **every** page since whenever the roster was last rendered.

`position: fixed` takes it out of the document's scrollable overflow for good. The three sites placing it now use client coordinates (`clientX/clientY`, and no `window.scrollY`); two of them were internally inconsistent before, taking `left` from the viewport and `top` from document space.

**New `test/layout.test.js`** — 11 tests pinning all three causes from this run, wired into `test:unit`.

**Three passes for one band, and the lesson is the method:** all three causes look identical in a screenshot. Numbers separated them — `scrollWidth` vs `innerWidth` (not a scrollbar), `scrollHeight` vs `innerHeight` (how big), `getBoundingClientRect()` on the gradient (where), then enumerating what sat below it (what).

## v65 — the same band, on the one auth page taller than the screen (2026-08-04)

v64 fixed login and left team setup, the only auth page whose content exceeds the viewport. Second measurement: `scrollWidth` 1275 vs `innerWidth` 1290 (15px smaller — the vertical scrollbar, so still no sideways overflow), `scrollHeight` **2513** vs `innerHeight` 911.

**v64's own `min-height` on `.auth-container` caused it.** `flex: 1` means `1 1 0%` — base size **zero** — and it survived a tall card only because a flex item's `min-height: auto` resolves to the content height. An explicit `min-height` replaces that and removes the floor, so the box collapsed to one viewport while the card overflowed past it.

`flex: 1 0 auto` restores a content-based base size. The min-height then does only what it was added for: the viewport floor when content is short.

**Rule worth remembering:** an explicit `min-height` on a flex item silently disables its automatic content-based minimum.

## v64 — the band at the foot of the auth pages (2026-08-04)

Measured, not guessed. Login page, nothing to scroll: `scrollWidth` 400 = `innerWidth` 400 (so not a horizontal scrollbar), but `scrollHeight` **854** vs `innerHeight` **824**.

Those 30px are the gap between the two mobile viewports: `100vh` is the **large** viewport (toolbars retracted), `innerHeight` is what is visible now. `body` and `.view` both used `min-height: 100vh`, so the page was 30px taller than the window and those 30px were bare `--bg` below the gradient.

`100dvh` added after `100vh` on `body`, `.view` and `.auth-container`. `#view-dashboard` already did this; the auth views were missed. `.auth-container` also stops relying on `flex: 1` to stretch — the element that paints the background now guarantees its own coverage.

## v63 — the toggle counted the row it was about to enable (2026-08-04)

The "2 de 3 and adding still errors" report was **two** bugs, and v62 fixed only one of them.

`_domTeamCount` counts letters in **checked** rows, and `change` fires *after* the box is ticked — so the row being enabled was already in the total, and v55 added its letters again on top. Amateur A+B saved, `maxTeams: 3`, tick Juvenil → computed 4 → limit modal. Adding a `C` to amateur worked, because that path counts *before* mutating. That asymmetry is exactly what was reported.

`_domTeamCount(container, exceptRow)` now takes a row to skip, and the enable branch asks for **everyone else, plus the one team it is about to add** — phrasing that does not depend on when the browser applies `checked`.

**A second defect, this one introduced by v62:** enabling a category only added `.active` and never repainted the chips, so the row stayed drawn as disabled — greyed `A`, no `+` — and no team could be added to the category just enabled. Chip markup now has one builder, `_letterChipsHtml`, shared by the first render and the toggle, with a test pinning it as the only one.

**339 passing** (213 unit). Frontend-only.

## v62 — team setup: a listener leak, and four UX fixes (2026-08-04)

Reported as a quota bug — *"I gave the club a third slot, it shows 2 de 3, and adding still errors"*. **It was not the quota.**

`_bindTeamSetupEvents` runs on every `showTeamSetup()`, but the four containers are static nodes whose `innerHTML` is replaced rather than the node — so listeners **accumulated on every entry**. On a second visit one "+" click ran twice: the first added the chip, the second saw the new count and fired the limit modal. **The team was added; the error was spurious.** Same cause let a category tick un-tick itself and made "add staff" / "+ Entrenament" double.

Fixed with a `container._tsBound` guard (the same idiom the dashboard already uses), plus re-dispatch guards on the three quota-gated handlers — one physical click delivered to two listeners shares a `timeStamp`, which distinguishes a stray dispatch from a real second click.

- **Back button**, shown only for the voluntary entry from Settings. The over-quota redirect and the no-category wizard stay inescapable. A successful save now also returns to Settings when entered from there.
- **A disabled category shows one greyed `A` and no `+`**; clicking it enables the category through the existing toggle handler (which carries the quota gate).
- **Only the last chip is removable**, so letters stay contiguous and the destructive affordance is on the one chip that is actually destructive.
- **`_nextLetter` appends after the highest letter** instead of backfilling a gap. **Existing gaps are left alone** — `deleteTeam` legitimately leaves `['A','C']`, and renaming a saved team would break `{category}-{letter}` everywhere it is used as a key.
- **Typed FCF links and schedules survive a re-render**, as the staff list already did. `_collectSchedulesFromDom()` extracted so the save path and the re-render share one reader.

**329 passing.** Frontend-only — push to `main`, no `./deploy.sh`.

**Reminder for the training rework:** letters are an arbitrary subset of A–Z in arbitrary order. Key everything by `{category}-{letter}`, never by index.

## v61 — "two hard sessions" now means consecutive (2026-08-04)

Spotted in use: players were force-red for two brutal sessions that had **a rest day between them**. The rule sliced the last two sessions *carrying an RPE*, and a session the player sat out has none — so hard Monday → rest Wednesday → hard Friday read as back-to-back. The rest day was invisible to the rule, which is exactly the recovery that makes the pair fine.

It now slices from every session in the window. A session with no data at all also breaks the chain, deliberately: we cannot tell whether he trained, and this is a force-override to **red**.

On the demo squad `hard_sessions` went **3 → 1** and reds **4 → 2**. Total flagged is unchanged at 40% — the two moved to amber — but the severity is honest.

**Two fixtures were also wrong** and passing for the wrong reason: they reused a base history that already had a session on the same day, so "the last two sessions" was one session counted twice. Rewritten to be collision-free.

**317 passing.** Frontend-only — push to `main`, no `./deploy.sh`.

## v60 — readiness thresholds (2026-08-04)

The two the evidence pointed at, now that the defects are gone. Flagging **56% → 40%**, green **32% → 48%**. Cumulatively from where this started: **76% → 40%**.

- **Low load no longer blocks green.** `acwr >= 0.8` sat in the green gate, so a player training below their four-week average could never be green — whatever their score, up to a score of 84. It conflated opposite states: high ACWR means protect them today, low means build them up over weeks. The dot now means **risk from load**; low load appears as its own list on the staff home, under the watch list, sorted by ACWR and showing the ratio.
- **A force-red needs the player's own numbers.** `hard_sessions` (last two sessions both RPE ≥ 9) no longer fires on imputed values. Borrowed load still feeds the ACWR and the score — but jumping straight to red is the strongest statement the app makes about someone. It still fires three times on the demo squad, so those are genuine.

**315 passing.** Frontend-only — push to `main`, no `./deploy.sh`.

### What is genuinely left on readiness

- **The colour is still not a function of the score** — two players can show 72 in different colours. The tooltip explains why, which answers the original complaint; whether the *design* should change is a separate judgement, not a defect.
- **Every measurement so far is against synthetic demo data.** It describes the model's structure, not real footballers. The live club has had real RPE only since the Phase 5 wipe — **re-measure before tuning anything further.**

## v59 — readiness engine (2026-08-04)

The classifier flagged **76% of the demo squad**. Not a threshold problem — three defects, all now fixed, **thresholds untouched**. Flagged **76% → 56%**, and `matchFatigue` went from firing on 13 of the 19 flagged players to **none**.

1. **Match fatigue never recovered** — a 90-minute match in March still scored 40 in August, keeping every regular starter 15 points below green. Now fades to nothing by day 5.
2. **Stale scores were shown as current** — no recency test, so a May score displayed as today's for ever. Past 10 days it falls back to the grey dot.
3. **A missing RPE counted as zero load**, inflating the next ACWR. Now borrowed from the squad (matches banded by ±10 minutes played). Read-time only, never written, and it does **not** count toward `hasData`.

`computeReadiness` returns `reasons`, so the tooltip names what fired.

**309 passing.** Frontend-only — push to `main`, no `./deploy.sh`.

### The threshold conversation — now with evidence

The remaining 56% is no longer defect noise. Two things stand out, and they are worth deciding together:

- **`acwr_low` flags 6 of the 14** — amber for training *less* than usual. Under-loading is a real concern but it is not injury risk, and lumping both into one amber dot is much of what makes the list unactionable.
- **`hard_sessions` (last two RPE ≥ 9) forces RED** on players scoring 79 and 72 — an override overriding a perfectly decent score.

Re-run the measurement any time from a seeder dump; the script reads the engine's own `reasons` array rather than keeping a second copy of the rules.

## v57/v58 — self-verification and an onboarding fix (2026-08-04)

- **v57**: `deleteTeam` re-reads the shards after its data phase and runs it once more if any of the team's rows came back — a client that saves mid-delete republishes the whole blob. It does not *guarantee* anything (a write landing after the final read still wins) but it can no longer happen **silently**: `resurrected` is returned and written to the marker doc, whose status becomes `done-with-conflict`. Re-running is safe and cheap. A rules-level lock was rejected on cost: it would add a document read to every `data/` write — including every staff notification a player's availability answer generates — to guard a once-a-year operation.
- **v58**: **`createClub` seeded every category with `letters: ['A','B']`.** On a new club with `maxTeams: 1`, ticking any category tried to add two teams, the quota gate refused it, and the lead was **stuck on the mandatory first-run setup screen unable to enable anything**. Fixed at both ends — new clubs seed one letter, and the setup screen renders a single letter for any *disabled* category, since clubs created earlier still carry the old seed in Firestore. Regression test added; this would have blocked onboarding every new client.

## v56 — team quota, DEPLOY 2 of 2: deletion + the gate (2026-08-04)

The destructive half. **Deployed and verified 2026-08-04.** `deleteTeam` erases one `{category}-{letter}` and everything belonging to it **except the Auth accounts** — its players are detached (profile kept, `category`/`team` cleared) and show as unassigned.

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

The first commercial constraint: `clubs/{id}.maxTeams` caps how many `{category}-{letter}` teams a lead may create. **Deployed and verified 2026-08-04.**

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

~~Do not lower a club's `maxTeams` below its current count until deploy 2 is live.~~ **Lifted** — `deleteTeam` is live, so an over-quota lead can now resolve it themselves.

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
