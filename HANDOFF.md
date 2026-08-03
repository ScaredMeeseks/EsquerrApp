# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-03 (**Phase 5 is complete and live in production** — the cutover ran today)._

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

What it actually is: Cloud Shell keeps ADC in a **temp directory** and the Admin SDK only finds it when `GOOGLE_APPLICATION_CREDENTIALS` points there. `gcloud auth application-default set-quota-project` prints the path it wrote — export that and it works:

```bash
gcloud auth application-default set-quota-project esquerrapp    # prints "Credentials saved to file: [/tmp/tmp.XXXX/...]"
export GOOGLE_APPLICATION_CREDENTIALS=/tmp/tmp.XXXX/application_default_credentials.json
head -c 120 "$GOOGLE_APPLICATION_CREDENTIALS"                    # healthy = starts {"account": "", "client_id": ...
```

The export lives in **one tab only** — a new tab or a dropped session needs it again. `firebase` and `gcloud` keep their own separate credentials, which is why `./deploy.sh` kept working the whole time the Admin SDK was broken. And `node -e` resolves modules from the **current directory**, so Admin SDK one-liners must run from `~/EsquerrApp/functions`, not the repo root.

### Deliberately not done in this phase

- **The three per-record collections (`trainingAvail`, `matchAvail`, `rpe`) are still club-wide readable.** The plan has them gaining a `category` field, but no stage owned it and the sensitive data — medical — lives in `data/fa_injuries`, which is scoped. Doing it means stamping six `ackSaveRecord` sites, narrowing three listeners and three rules, and it strands a moved player's records the same way the joined `data/` routes did (so it needs `reshardMember` extending too). An incremental privacy improvement, not a blocker.
- Linked match/training tactic board copies are still matched by **name**; now that data is sharded the same name can exist in two categories. Pre-existing, untouched.

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
