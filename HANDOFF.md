# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-13._

**Production is on v87.** Tests **645 passing** (449 unit + 134 rules + 53 functions + 9 backfill).

This session built the superadmin tactical-board catalogue and the platform template library — the UI `promoteBoardTemplate` and `seedClubFromTemplates` had been waiting for since 2026-08-08 — plus a hardcoded-badge fix, and four defects found by the owner's testing. Rules, functions and frontend all deployed and **verified against the deployed artefacts**, not against deploy output.

---

## ⚠ START HERE — the one thing left open

**Template edits may not be saving correctly.** Reported at the end of the session ("the Edit button works and I can edit, I'm not sure the edits are being saved correctly") and **not investigated with the owner present**. I read the code afterwards and found **two real defects**, either of which would produce exactly that impression. Neither is speculative — both are confirmed by reading, neither has been reproduced in the browser.

### Defect A — every template Save wipes the template's category

`_tbTemplateEntry(name)` (`js/app.js:10619`) calls `TB.buildBoardEntry(localStorage, {name})` with **no category**. `buildBoardEntry` only sets the field when it is passed (`js/boards.js:56`), so the entry has no `category`, and `saveTemplate` then writes `category: String(entry.category || '')` → **`''`** (`js/boards.js:559`).

So: set a category in the Biblioteca table, open the board in the editor, press Save — the category is gone.

**The fix is in `saveTemplate`, not in the caller.** Category is *library* metadata, edited in the table; the editor has no control for it, so the editor must not write it. Make it conditional, exactly as `packs` and `published` already are two lines below:

```js
if (entry.category !== undefined) metaDoc.category = String(entry.category);
```

`tag` is the opposite case and must keep writing through unconditionally — the editor *does* have a tag control, so the editor is its source of truth.

### Defect B — the Biblioteca list is stale after you come back from the editor

`_abLoad(force)` early-returns when `_abState.loaded` (`js/app.js:14035`). The "Tornar a la biblioteca" button re-renders through `renderPage` → `bindDynamicActions` → `_abLoad(false)`, so the row still shows the **pre-edit name and size**. The payload did save; the list is lying.

This is my best guess at what the owner actually saw, because the drawing itself round-trips correctly — re-opening the template re-reads `tacticTemplateData` from Firestore.

Fix: invalidate before leaving the editor — `if (_abState) _abState.loaded = false;` in the `tb-tpl-exit` handler (`js/app.js` ~19180), or call `_abLoad(true)` after that render.

### How to verify, properly

Do not trust the row. Read the documents:

```python
# Cloud Shell, Admin SDK
db.collection('tacticTemplates').document(TPL).get().to_dict()      # name/tag/category/bytes/updatedAt
json.loads(db.collection('tacticTemplateData').document(TPL).get().to_dict()['v'])  # the drawing
```

Move one player, Save, and compare `bytes` + `updatedAt` + the position array. That distinguishes "did not save" from "saved but the list is stale", which the UI cannot.

---

## Two verification lessons this session, both learned the hard way

These cost several rounds of "it's fixed" / "no it isn't". **Both are about checking the artefact rather than the operation.**

### 1. A callable can deploy cleanly for days and be unreachable

`promoteBoardTemplate` returned a bare `internal` to every caller. Not the code: **Google's front end answered 403 before the container ran**, because `allUsers` did not hold `roles/run.invoker` on its Cloud Run service. firebase-tools grants that binding **on the CREATE path only** — and this function's create failed on 2026-08-08 at the container healthcheck (the stale `functions/package-lock.json`), so the retry went through `UpdateFunction` and it never got one. Five days of clean deploys followed. **The August package-lock incident charged twice.**

The check, which needs no credentials and has no side effects:

```bash
curl -s -o - -w '\nHTTP=%{http_code}' -X POST \
  https://us-central1-esquerrapp.cloudfunctions.net/promoteBoardTemplate \
  -H 'Content-Type: application/json' -d '{"data":{}}'
```

- **401** + `{"error":{"status":"UNAUTHENTICATED"}}` — healthy. That JSON is `functions/index.js` talking, so the request cleared IAM.
- **403** + an HTML page — broken. Run it after any deploy that **creates** a callable.

**`invoker: "public"` in the onCall options does NOT fix this.** It type-checks (`CallableOptions extends HttpsOptions`) and is then silently dropped — `onCall` builds `callableTrigger: {}` and never copies the field; only `onRequest` does. I shipped it as a fix and it changed nothing, along with a source-assertion test that would have stayed green for ever while the function stayed broken. Both backed out. **The repair is to DELETE the function and let a deploy create it again.**

The emulator cannot catch this: `.run()` invokes the handler directly and never touches IAM, so `test/templates.test.js` passed throughout.

### 2. A push to `main` is not a deploy

v87 was pushed, and **the GitHub Pages deploy step failed seven seconds later** — the Jekyll build succeeded, the deploy did not. The site kept serving v86, so two genuine fixes appeared to do nothing and the owner was told to hard-refresh for no reason.

```bash
# what is actually served
curl -s "https://scaredmeeseks.github.io/EsquerrApp/sw.js?cb=$RANDOM" | grep CACHE_NAME

# deployment history — no auth needed, public repo
curl -s "https://api.github.com/repos/ScaredMeeseks/EsquerrApp/deployments?environment=github-pages&per_page=3"
# then GET its statuses_url → state: success | failure
```

If the served `CACHE_NAME` lags local `sw.js`, **nothing shipped and the browser is innocent**. A failed *deploy* step is transient and GitHub-side — push again. A failed *build* step is Jekyll and would be ours; there is no `.nojekyll`, so the site IS Jekyll-processed.

Related: `firebase functions:delete` and `deploy` were both flaky today and lied about it — two bare `Error: An unexpected error has occurred.`, one client-side timeout on an operation that had **completed server-side**, a source-discovery hiccup and a DNS failure. **Re-run, then check the resulting STATE rather than the exit code.**

---

## What shipped

Full architecture in CONTEXT.md. The shape of it:

**The catalogue** (`Pissarres`, sidebar → admin section, `SUPERADMIN_PAGES`). Every club's boards in one table — club, name, author, the author's team and category, tag, date, size, and whether it has already been copied. `ADMIN_PAGES` could not be reused: it is deliberately open to club leads, and this page shows every club's data.

**Club boards are READ-ONLY here, by decision.** The rules would allow the superuser to edit them — `isSuperUser()` is an arm of every `tacticBoards` write — but a club's library is the club's. The only way a board leaves it is `promoteBoardTemplate`, which takes an anonymised COPY.

**The draft stage.** A promoted board lands `published: false`. `seedClubFromTemplates` refuses anything unpublished, gated in the per-template loop so the explicit-ids path is covered as well as the pack path. Publishing requires at least one pack — a published template with no pack is one the send panel can never offer. Say so if that friction is unwanted; it is a one-line change.

**Provenance** lives in `tacticTemplateSources/{boardId}`, superadmin-only, **not** as a field on the template: `tacticTemplates` is readable by every signed-in user and stays anonymous by construction. It drives the "✓ copiada" marker, and boards seeded from the library are hidden from the catalogue entirely (filtered on `sourceTemplateId`, which survives the club editing the board because `TB.save()` merges metadata).

**Template editing is a MODE of the ordinary board editor**, not a second editor. `fa_tactic_loaded_id` and `fa_tactic_template_id` are mutually exclusive. `tbHydrateEditor()` / `tbClearEditor()` were extracted so the ~35 scratch keys are not maintained in two places.

### The four defects the owner's testing produced

1. **The crest on "Configura el teu club" was hardcoded** to `img/logo.png`. The same line in the other four auth cards is correct — they run before any club is known.
2. **Every toast in the app has been unreadable.** `.push-toast` set `background: var(--dark)`, and `--dark` has never been defined — it appears once in `style.css`, in that line. `var()` on an unknown property with no fallback is invalid at computed-value time, so the background fell back to `transparent`. Long-standing; only obvious now because the new page reports through toasts constantly.
3. **`navigate()` took no arguments** while six call sites passed `'tactics'`. All six fire *from* the tactics page, so the argument was ignored and nobody could tell. `_abOpenTemplate` was the first cross-page caller, so **Editar** hydrated the template and then re-rendered the admin page — the button looked dead while having already changed editor state. `navigate(page)` now honours the name; safe because it is never used as a listener, where the first argument would be an Event.
4. **Editor state leaked between sessions.** The `fa_tactic_*` keys survived logout, so signing in as an FCB coach opened the editor on the template just sent to them. Cleared on sign-out, and again in `renderPage` for any non-superadmin.

(3) is what made (4) visible.

---

## Parking lot — what's left

Ordered roughly by what I would pick up next. **Item 0 is the open one above.**

### 1. Seeded boards and Save As

A club that uses **Save As** on a board you sent gets a new id with **no `sourceTemplateId`**, so it appears in the catalogue as their own work. I judged that correct — it is a derivative, not your pack — but it was a judgement call and is easy to reverse.

### 2. Training detail / session planning (reported 2026-08-09, untouched)

- **Total expected players** beside "Assistència Jugadors" when a session is generated.
- **Strike through a player who did not attend** in the teams attached to an exercise — teams are generated ahead of the session, so the coach needs to see at a glance that a replacement is needed.
- **"Planificació entrenament" sits too far right** — equalise its width with "Assistència jugadors".
- **Make "Planificació entrenament" editable** — it only takes tactical-board titles today; the coach should be able to write free text.

First two touch `renderGeneratedTeams` / `renderStdBoardsSection`; last two are the planning panel. v85 changed the squad plumbing underneath all of it (`calledPlayers`, session-not-date) — read that part of CONTEXT.md first.

### 3. Drop dual-write — GATED ON AN APK BEING INSTALLED

`TB_DUAL_WRITE = true` in `app.js` still mirrors the board library into `fa_tactic_saved` for the v43-era APK, with `frames` and `penLines` stripped. To turn off: flip the constant, drop `fa_tactic_saved` from `SYNCED_KEYS` (`js/db.js`), drop the fat-copy spread in `tbSessionRef`, run a `--gc` sweep for the old shards.

**Do not take this step until a current APK is actually on the phones.** Old builds would stop seeing boards entirely.

### 4. The APK itself

CI has built through v87; the phones are still on a v43-era build. Set `clubs/nDLJCpJfDvFHs8MnwtzW.minAppVersion` **only once a current APK is installed**. Blocks item 3.

### 5. Readiness — revisit with REAL data

Flagging is down from 76% → 40%, green 24% → 48% (v52, v59–v61). Every measurement so far is against **synthetic demo data**; re-run the distribution script against real data before touching another threshold. One open design question, not a defect: the colour is not a function of the score, so two players can show 72 in different colours.

### 6. Drop the old-APK rules shim

`clubs/{clubId}` still lets a lead write `fcfLinks`/`schedules` directly, purely so pre-v55 APKs keep working. Delete once a v55+ APK circulates; a rules test pins the `diff()` behaviour.

### 7. Smaller / older

- **Three stranded accounts** on `teamId: 'default'` with `cats: []` — losing them is fine.
- **`trainingAvail` / `matchAvail` / `rpe` are still club-wide readable.** Phase 5 stopped short deliberately; the sensitive data (medical) *is* scoped.
- **Orphaned shards when a category is emptied** — `deleteTeam` leaves `fa_tactic_saved__{cat}` and `fa_tactic_training_boards__{cat}` unreadable. Fold into item 3's `--gc` sweep.
- **Uncategorised players**: excluded by medical and roster, included by training-detail — three staff pages, two semantics.
- **`functions/backfill-training-teams.js` has no `preflight()`** — copy it from `seed-demo-club.js`.
- Firebase Hosting migration (real cache-control); multi-club membership (`teamId` is single-valued); delete `fa_users` in favour of `users`; read-time fitness derivation.

### Known residual risk (accepted, not a bug)

A client saving **during** a `deleteTeam` can republish rows, because every client holds the whole blob and writes it back wholesale. v57 retries once and reports `resurrected` in the marker doc. Re-running is safe.

---

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI on push to `main`; rules/functions = `.\deploy.ps1` locally.
- **`main` is at v87 (`c10daf2`), working tree clean, nothing unpushed.** v87 confirmed SERVED — `sw.js`, `APP_VERSION`, the toast background, `navigate(page)` and the seeded filter were each checked on the live site.
- Tests: `cd test && npm test`. Fast path `npm run test:unit` (~1s, no Java). If a suite says `Could not spawn java -version`:
  `$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin;$env:PATH"`
- **New test files must be added to `test:unit` / `test:functions` by hand** — the script lists files explicitly, so an unregistered file silently never runs.
- **`gh` is NOT installed** on this box. Use the GitHub REST API with `curl` (public repo, no auth needed for deployments and Actions runs).
- The Admin SDK still needs Cloud Shell — no `gcloud`, no service-account key here. **The stored firebase-tools credential cannot make IAM writes**: minting a `cloud-platform` token from `~/.config/configstore/firebase-tools.json` returns `invalid_grant / invalid_rapt` for `setIamPolicy`. Google wants an interactive reauth.

### Clubs in production

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, only `amateur` enabled.
- `Tm96gel58VSQvxgynf45` — **demo club**, join code `9CA4RR`, `coach@demo.esquerrapp.app` / `DemoEsquerra2026!`. Re-run the seeder whenever it looks thin.
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona test club. **Holds seeded boards from this session's testing** — worth knowing before reading its library.

---

## Lessons that keep repeating

- **Check the artefact, not the operation.** The two big time sinks this session were a deploy that reported success while the function was unreachable, and a push that reported success while the site served the previous version. Both had a free, unambiguous probe available from the start.
- **Read the implementation, not just the type.** `invoker: "public"` type-checks on `onCall` and does nothing.
- **A test that pins a no-op is worse than no test.** It goes green for ever while the thing stays broken.
- **Silent-write failures.** A control appears to work, the local blob updates, the server write is rejected or never made.
- **Read one-off scripts before running them.** `backfill-claims.js` predated Phase 4 and would have stripped every user's `cats` claim.
- **Measure layout bugs; do not reason about them.**
- **A bug found during a change is not necessarily caused by it.** Two of this session's four defects were pre-existing and years-visible (the toast, `navigate()`).
- **Source-assertion tests earn their keep** — the `buildBoardEntry` call-site guard fired again and was right again. But see the no-op lesson above: assert a property that can actually fail.
