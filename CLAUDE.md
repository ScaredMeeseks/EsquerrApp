# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

EsquerrApp — football club management PWA (players, staff, club admins/team leads, superadmin). Vanilla HTML/CSS/JS single-page app, **no build step, no framework, no test suite**. Firebase backend (Auth, Firestore, Storage, FCM, Cloud Functions v2). Capacitor wraps the same code as an Android app. UI language is Catalan (with some English).

- Firebase project: `esquerrapp` · Superadmin: `marna96@gmail.com`
- Frontend hosting: **GitHub Pages from `main`** — pushing to `main` deploys the site AND triggers the Android APK CI build (`.github/workflows/build-android.yml`).

## Development safety net

There is exactly one: after editing any JS file run

```bash
node --check js/app.js   # (and any other edited .js file)
```

A syntax error breaks the entire app for every user.

## Architecture

### Script load order (index.html — order matters, all share global scope)

`js/firebase-config.js` → `js/db.js` → `js/push.js` → `js/utils.js` → `js/app.js`

Firebase compat SDK 10.12.0 loaded from CDN `<script>` tags. `js/app.js` (~15k lines) holds all views: each page has a `render*()` function returning an HTML string set via `innerHTML`; `renderPage()` dispatches on `currentPage`; `bindDynamicActions()` re-binds listeners after every render. All user text must go through `sanitize()` before injection.

### Data model

- `users/{uid}` — global user profiles; `teamId` field points at the club. `users/{uid}/tokens/{id}` — FCM tokens.
- `teams/{teamId}/data/{key}` — team data, one doc per localStorage key, either blob format `{v: "<json>"}` or per-field merge format (MERGE_KEYS). `teams/{teamId}/pushQueue`, `teams/{teamId}/seasons/{label}`.
- `clubs/{clubId}` — club config (name, badge, categories, FCF links). `clubCodes/{CODE}` → `{clubId}` (server-only join codes).

### localStorage-primary sync layer (`js/db.js`)

The app reads/writes everything synchronously via localStorage. `db.js` monkey-patches `localStorage.setItem/removeItem` to mirror `SYNCED_KEYS` into `teams/{teamId}/data/{key}`. `MERGE_KEYS` (availability, RPE, injuries…) use per-field merges so concurrent writers don't clobber each other; the rest are blob replaces. `DB.setItemAcked(key, value)` returns a Promise that resolves on **server** ack — use it (via app.js `ackSave()`) for anything a player submits. `DB.init(teamId)` downloads Firestore → localStorage and starts onSnapshot listeners that dispatch `firestore-sync` events.

**Never call raw `db.collection('users')` without `.where('teamId','==',…)`** — security rules reject unscoped list queries.

### Roles

`player` / `staff` / team lead (`isTeamLead`) per club + hardcoded superadmin email. Club membership is assigned ONLY by the `joinClub` Cloud Function (validates `clubCodes/{CODE}`); clients must never write `teamId`/`isTeamLead`/`roles` for themselves — rules reject it.

### Cloud Functions (`functions/index.js`)

Push fan-out (`onPushQueueCreate`), scheduled reminders (training T-4h hourly check, RPE 23:00, match avail Fri 20:00), `fcfClassificacio` (CORS proxy for FCF standings, allowlisted), `joinClub` (callable), `archiveSeason` (HTTP). Team data docs exist in two formats — always read them with the `parseDataDoc()` helper.

## Key conventions

- **Bump `CACHE_NAME` in `sw.js`** on every change to `js/`, `css/`, or `index.html` (current scheme: `esquerrapp-vNN`).
- **Never edit `www/`** — it is a CI-generated mirror (rsync of root) used only by the Capacitor Android build.
- **Old APKs = old clients**: Android users run old code until they install a new APK. Server-side changes (rules, functions, data model) must stay backward-compatible with the previous frontend until an APK release has circulated.
- New user-facing strings in Catalan.
- Dates are ISO `YYYY-MM-DD` strings; Cloud Functions use `Europe/Madrid`.
- Normalize line endings to LF before committing (`.gitattributes` enforces it, but verify diffs aren't CRLF-noisy).
- **CONTEXT.md must be updated after every code change.**

## Deployment

Frontend: push to `main` (GitHub Pages; no cache-control headers — users may need a hard refresh after breaking changes). APK: built by CI on the same push, downloadable from the Actions run artifacts.

Rules/functions: from Google Cloud Shell ONLY via the guard script (never bare `firebase deploy` — the CLI's remembered project once wiped another project's rules):

```bash
cd ~/EsquerrApp && ./deploy.sh rules       # firestore + storage rules
cd ~/EsquerrApp && ./deploy.sh functions   # cloud functions
# first time: git clone https://github.com/ScaredMeeseks/EsquerrApp.git ~/EsquerrApp
```

One-off data scripts (migrations, backfills) live in `functions/` — NOT a separate scripts/ dir — so they resolve `functions/node_modules` (a root `npm install firebase-admin --no-save` on Cloud Shell yields a broken firebase-admin: npm blocks its postinstall scripts). Run from the repo root: `node functions/<name>.js` (ADC credentials are automatic; `cd functions && npm install` first if node_modules is missing).

Backups before risky changes: `gcloud firestore export gs://esquerrapp-backup/<label>-$(date +%F) --project esquerrapp` (bucket name is singular — `esquerrapp-backups` does not exist).

**Session handoff**: when the user says the session is finished, update `HANDOFF.md` (rolling doc, overwritten each session — current state, session summary, pending items).
