# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

EsquerrApp — football club management PWA (players, staff, club admins/team leads, superadmin). Vanilla HTML/CSS/JS single-page app, **no build step and no framework**. Automated tests live in `test/`: the Firestore rules suite, unit tests for `js/shard.js` and `js/db.js`, and an emulator suite that drives the real Cloud Functions triggers (see the safety net below). There is no coverage of `app.js`, so changes there are verified by hand. Firebase backend (Auth, Firestore, Storage, FCM, Cloud Functions v2). Capacitor wraps the same code as an Android app. UI language is Catalan (with some English).

- Firebase project: `esquerrapp` · Superadmin: `marna96@gmail.com`
- Frontend hosting: **GitHub Pages from `main`** — pushing to `main` deploys the site AND triggers the Android APK CI build (`.github/workflows/build-android.yml`).

## Development safety net

**1. Syntax check after editing any JS file** — a syntax error breaks the entire app for every user:

```bash
node --check js/app.js   # (and any other edited .js file)
```

**2. Automated tests — these DO run locally** (Java 21 + firebase-tools are installed on the dev box; older notes saying otherwise are stale):

```bash
cd test && npm run test:unit      # ~1s, pure Node — no emulator, no Java
cd test && npm run test:functions # Firestore + Functions emulators, real triggers
cd test && npm test               # the above plus the rules suite
```

143 tests today (42 unit + 87 rules + 14 functions). `test:unit` covers `js/shard.js` (which category each row of each key belongs to) and `js/db.js` (the router, run for real against an in-memory Firestore fake). `test:functions` runs `functions/index.js` itself in the Functions emulator — `reshardMember`/`onMemberCategoryChanged`, `updateTeamDates`, and the `wipe-team-data.js` cutover script. Everything uses the fake project `demo-esquerrapp` — no credentials, no Cloud Shell round-trip.

Run `test:unit` after **any** change to `js/db.js` or `js/shard.js`, `test:functions` after **any** change to `functions/`, and the full suite after **any** change to `firestore.rules` or to the custom claims that rules read (`teamId`, `role`, `cats`).

**Inside the Functions emulator `admin.firestore.FieldValue` is undefined** — firebase-tools stubs firebase-admin and returns `firestore` bound to the module, and a bound function loses its statics. `functions/index.js` imports `FieldValue` from `firebase-admin/firestore` instead; keep new code doing the same, or it will work in production and throw in every test.

If the rules suite says `Could not spawn java -version`, Java is installed but off that shell's PATH:
`$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspotin;$env:PATH"`

**3. i18n completeness** — `t()` returns the key itself on a miss, so a typo ships as raw `auth.foo` on screen. Every key needs all three of `ca`/`es`/`en`.

## Architecture

### Script load order (index.html — order matters, all share global scope)

`js/firebase-config.js` → `js/utils.js` → `js/shard.js` → `js/db.js` → `js/push.js` → `js/app.js`

`utils.js` owns `CATEGORY_ORDER`, which `shard.js` reads; `db.js` asserts at load that every synced key has a shard route. Anything added to `STATIC_ASSETS` in `sw.js` must match.

Firebase compat SDK 10.12.0 loaded from CDN `<script>` tags. `js/app.js` (~15k lines) holds all views: each page has a `render*()` function returning an HTML string set via `innerHTML`; `renderPage()` dispatches on `currentPage`; `bindDynamicActions()` re-binds listeners after every render. All user text must go through `sanitize()` before injection.

### Data model

- `users/{uid}` — global user profiles; `teamId` field points at the club. `users/{uid}/tokens/{id}` — FCM tokens.
- `teams/{teamId}/data/{key}__{category}` — team data, **one doc per localStorage key PER CATEGORY** (Phase 5), fields `{v: "<json>", category}` or per-field merge format (MERGE_KEYS) plus `category`. Rows belonging to no squad go to `__none`. Every writer must set `category`: the client queries `where('category','in', …)` and the rules test the same field, so a shard without it is invisible to the whole app. `teams/{teamId}/pushQueue`, `teams/{teamId}/seasons/{label}`.
- `clubs/{clubId}` — club config (name, badge, categories, FCF links). `clubCodes/{CODE}` → `{clubId}` (server-only join codes).

### localStorage-primary sync layer (`js/db.js`)

The app reads/writes everything synchronously via localStorage. `db.js` monkey-patches `localStorage.setItem/removeItem` to mirror `SYNCED_KEYS` into `teams/{teamId}/data/{key}__{category}`. `MERGE_KEYS` (injury notes/zone/dismissed, staff override) use per-field merges so concurrent writers don't clobber each other; the rest are blob replaces.

**localStorage stays one merged blob per key** — the ~128 read sites in `app.js` know nothing about sharding. `js/shard.js` decides which category each row belongs to (some keys carry it, others join live through `fa_users` or `fa_matches`); `db.js` keeps a shadow cache of the parsed shards, diffs per document, and writes all shards of one blob in a single `db.batch()`.

**The safety rule, non-negotiable:** never write a shard the client did not download. Every writer parses the whole blob and writes it back, so a coach scoped to one category would otherwise hand back a blob missing every other one. `_scope` in `db.js` is the READ scope — what the listener fetched, not the UI's category filter — and `_routeWrite` refuses anything outside it. If you touch this file, run `cd test && npm run test:unit`. `DB.setItemAcked(key, value)` returns a Promise that resolves on **server** ack — use it (via app.js `ackSave()`) for anything a player submits. `DB.init(teamId)` downloads Firestore → localStorage and starts onSnapshot listeners that dispatch `firestore-sync` events.

**Never call raw `db.collection('users')` without `.where('teamId','==',…)`** — security rules reject unscoped list queries.

### Roles

`player` / `staff` / team lead (`isTeamLead`) per club + hardcoded superadmin email. Club membership is assigned ONLY by the `joinClub` Cloud Function (validates `clubCodes/{CODE}`); clients must never write `teamId`/`isTeamLead`/`roles` for themselves — rules reject it.

### Cloud Functions (`functions/index.js`)

Push fan-out (`onPushQueueCreate`), scheduled reminders (training T-4h hourly check, RPE 23:00, match avail Fri 20:00), `fcfClassificacio` (CORS proxy for FCF standings, allowlisted), `joinClub` (callable), `archiveSeason` (HTTP). Team data docs exist in two formats — always read them with the `parseDataDoc()` helper.

## Key conventions

- **Bump the version in THREE places together** on every change to `js/`, `css/` or `index.html`: `CACHE_NAME` in `sw.js` (`esquerrapp-vNN`), `APP_VERSION` in `js/app.js`, and `CURRENT` in `functions/check-deploy.js`. `check-deploy` asserts `APP_VERSION` matches `sw.js` — if it lags, every bundled APK claims to be current and the "old build" banner never fires.
- **Never edit `www/`** — it is a CI-generated mirror (rsync of root) used only by the Capacitor Android build.
- **Old APKs = old clients**: Android users run old code until they install a new APK, because Capacitor bundles a copy of the web assets. Server-side changes must stay backward-compatible until an APK has circulated. The v43 update banner (`clubs/{id}.minAppVersion` vs `APP_VERSION`) makes staleness visible; it does not fix it.
  **Do not set `server.url` to make the shell load the live site.** It would end staleness instantly but loading a whole app from a remote URL is a reliable App Store rejection (guideline 4.2), and Play + App Store are on the roadmap.
- **One-off scripts in `functions/` rot.** They are written against the data model of the day and are not exercised by anything. `backfill-claims.js` still wrote pre-Phase-4 claims months later and would have stripped `cats` from every user. **Read one before running it**, and prefer a dry-run/`--apply` gate on anything that writes.
- New user-facing strings in Catalan.
- Dates are ISO `YYYY-MM-DD` strings; Cloud Functions use `Europe/Madrid`.
- Normalize line endings to LF before committing (`.gitattributes` enforces it, but verify diffs aren't CRLF-noisy).
- **CONTEXT.md must be updated after every code change.**

## Deployment

Frontend: push to `main` (GitHub Pages; no cache-control headers — users may need a hard refresh after breaking changes). APK: built by CI on the same push, downloadable from the Actions run artifacts.

Rules/functions: via a guard script, never bare `firebase deploy` — the CLI's remembered project once wiped another project's rules, and there are now **two Firebase projects and two accounts on this machine**. Both scripts pass `--project esquerrapp` explicitly; read the `=== Deploying to 'esquerrapp'...` header before confirming.

**Locally (preferred, since 2026-08-08)** — `firebase-tools` 15.x is installed on Windows and `marna96@gmail.com` is bound to this directory:

```powershell
cd c:\DATA\CLAUDE\EsquerrApp
.\deploy.ps1 rules -DryRun    # validate without releasing
.\deploy.ps1 rules            # firestore + storage rules
.\deploy.ps1 functions        # cloud functions  (-Install to npm install first)
.\deploy.ps1 all
```

`deploy.ps1` pins itself to `$PSScriptRoot`, so it deploys EsquerrApp even when invoked from another project's folder. It does **not** `git pull` (unlike `deploy.sh`, whose Cloud Shell clone is usually stale) — this machine holds the working tree you are editing.

**Accounts are per-directory.** `administracion@mov-ment.com` owns Movment and *cannot see* `esquerrapp`; `firebase login:use <email>` binds an account to the current directory, so the two projects do not fight. `firebase login:list` shows which is active.

**`Cannot determine backend specification. Timeout after 10000`** is not broken code. To decide what to deploy the CLI spawns `functions/index.js` and reads its exports within 10s; the module loads in ~0.5s warm, but a **cold `node_modules`** on Windows (antivirus scanning thousands of files) exceeds it. Retrying works; `deploy.ps1` sets `FUNCTIONS_DISCOVERY_TIMEOUT=120` so it does not arise.

**`Cannot find module '@firebase/app'`, every function failing its health check** — also not broken code, and the one trap that is *created* by deploying locally. `functions/package-lock.json` is **gitignored**, so Cloud Shell never had one and always resolved dependencies fresh. A local deploy uploads whatever lock is on disk, Cloud Build runs `npm ci` against it, and a lock older than the installed tree yields a container missing a transitive dependency. Every function then fails to start. **Production survives it** — Cloud Run does not route traffic to a revision that fails its health check, so the previous revisions keep serving — but the whole deploy is refused. `deploy.ps1` now refuses to start if the lock exists; move it aside and redeploy. (Hit once, 2026-08-08, on the first local functions deploy.)

**From Cloud Shell (fallback)** — still valid, and still the only way to run the Admin SDK scripts below:

```bash
cd ~/EsquerrApp && ./deploy.sh rules       # firestore + storage rules
cd ~/EsquerrApp && ./deploy.sh functions   # cloud functions
# first time: git clone https://github.com/ScaredMeeseks/EsquerrApp.git ~/EsquerrApp
```

One-off data scripts (migrations, backfills) live in `functions/` — NOT a separate scripts/ dir — so they resolve `functions/node_modules` (a root `npm install firebase-admin --no-save` on Cloud Shell yields a broken firebase-admin: npm blocks its postinstall scripts). Run from the repo root: `node functions/<name>.js` (`cd functions && npm install` first if node_modules is missing). An **Admin SDK one-liner** (`node -e '…'`) resolves modules from the *current directory*, so it must be run from `~/EsquerrApp/functions`, not the repo root.

**ADC on Cloud Shell: do nothing.** Cloud Shell is a GCE VM and its metadata server already supplies Application Default Credentials; the Admin SDK picks them up with no setup. *(An earlier version of this section told you to export `GOOGLE_APPLICATION_CREDENTIALS` at a `/tmp` path. That was wrong twice over — `set-quota-project` only re-points credentials that already exist, and a **stale** `GOOGLE_APPLICATION_CREDENTIALS` is itself the one thing that reliably breaks the SDK. If anything looks unauthenticated, `unset GOOGLE_APPLICATION_CREDENTIALS` first.)*

If a script dies with `Cannot create property 'refresh_token' on string ''`, run **`gcloud auth list`**. *No credentialed accounts* means gcloud has no identity and nothing config-level will fix it — **restart the VM** (three-dots menu → Restart, not a new tab), then `cd ~/EsquerrApp`.

**A deploy strips gcloud's identity** — reproduced twice, treat it as causal. `firebase` and `gcloud` hold separate credentials, so `./deploy.sh` working proves nothing about the Admin SDK. **Run Admin SDK scripts BEFORE deploying**, or budget for the restart. Deploying locally with `deploy.ps1` sidesteps this entirely, since the two no longer share a session.

Locally there are **no** Admin SDK credentials: `gcloud` is not installed and there is no `esquerrapp` service-account key. Backfills and one-off scripts therefore still run from Cloud Shell.

Backups before risky changes: `gcloud firestore export gs://esquerrapp-backup/<label>-$(date +%F) --project esquerrapp` (bucket name is singular — `esquerrapp-backups` does not exist).

**Session handoff**: when the user says the session is finished, update `HANDOFF.md` (rolling doc, overwritten each session — current state, session summary, pending items).
