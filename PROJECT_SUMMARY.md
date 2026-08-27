# EsquerrApp — Project Summary

_Reference overview of what the app is and how it is put together. Per-change history lives in CONTEXT.md; current state and open items in HANDOFF.md; working rules for this repo in CLAUDE.md. Last reviewed 2026-08-03 (v45, post-Phase-5)._

## Overview

**EsquerrApp** is a football club management app, built for **L'Esquerra de l'Eixample Futbol Club** (amateur club in Barcelona, Catalan regional leagues) and since generalised to host **multiple clubs**, each with its own categories and squads. It is a Progressive Web App with an Android wrapper via Capacitor. The UI language is Catalan, with some English.

- **App ID:** `com.esquerrapp.app`
- **Theme color:** `#BD162C` (club red)
- **Firebase project:** `esquerrapp`
- **Superadmin:** `marna96@gmail.com` (hardcoded in the rules and the functions; the only cross-club account)

---

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS — single `index.html` SPA, no build step, no framework |
| Backend | Firebase (Auth, Firestore, Storage, Cloud Messaging, Cloud Functions v2) |
| Mobile | Capacitor 8.x wrapping the web app in an Android shell |
| PWA | Service Worker (`sw.js`) for caching + FCM background push |
| Hosting | GitHub Pages from `main`; APK built by CI on push |

### File Structure

```
EsquerrApp/
├── index.html              # Single-page app (all views in one file)
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (cache + FCM background) — CACHE_NAME bumped per release
├── deploy.sh               # Guarded rules/functions deploy, Cloud Shell only
├── firestore.rules         # Firestore security rules
├── storage.rules
├── css/style.css
├── js/                     # Load order matters — each file assumes the ones above it
│   ├── firebase-config.js  # Firebase init (Auth, Firestore, Storage, FCM)
│   ├── utils.js            # CATEGORY_ORDER, position colors, shared formatters
│   ├── shard.js            # Per-category routing table + pure partition/merge
│   ├── db.js               # Firestore ↔ localStorage sync layer (the router)
│   ├── push.js             # FCM token management + foreground notifications
│   └── app.js              # Main application logic (~16,300 lines)
├── functions/
│   ├── index.js            # Cloud Functions (13 triggers/callables)
│   ├── wipe-team-data.js   # One-off scripts live here so they resolve
│   ├── backfill-*.js       #   functions/node_modules — see CLAUDE.md
│   └── package.json
├── test/                   # Dev-only: shard/router units, rules suite, functions suite
├── img/                    # Logos, icons, body map, pitch silhouettes
├── www/                    # Capacitor build mirror (regenerated, never edited)
└── android/                # Capacitor-generated Android project
```

### Key Design Decisions

1. **Single-file SPA.** All views live in `index.html` and are toggled via `showView()`. No router library — page switching is driven by `currentPage` and a `renderPage()` dispatcher. Each page has a `render*()` returning an HTML string.

2. **localStorage as primary store, Firestore as sync layer.** The app reads and writes `localStorage` for instant synchronous access. `db.js` monkey-patches `localStorage.setItem`/`removeItem` to mirror writes to Firestore, and `onSnapshot` listeners push remote changes back. Anything a *player submits* goes through `ackSave*()`, which resolves on **server** ack — fire-and-forget writes have silently failed here more than once.

3. **Multi-club.** Every club is a `clubs/{clubId}` document plus a `teams/{clubId}` data root (the two ids are the same). Membership is decided by **roster email lists** on the club, applied server-side; `teamId` is single-valued, so one account cannot yet belong to two clubs.

4. **Data is sharded per category.** Team data is `teams/{id}/data/{key}__{category}` — one document per category — and reads are scoped by the `cats` custom claim. This is what makes category separation real: rules cannot read inside a JSON string, so while each key was one club-wide blob a coach could read every squad's medical records. `localStorage` still holds **one merged blob per key**, so the ~128 read sites in `app.js` never had to change. `js/shard.js` decides where each row belongs; `js/db.js` owns the I/O.

5. **Player-submitted data lives in per-record collections** (`trainingAvail`, `matchAvail`, `rpe`), one document per answer, so two players answering at once cannot clobber each other.

6. **Claims-only authorization.** `teamId`, `role` and `cats` are Firebase Auth custom claims set by the functions; rules read them directly with no per-request document lookups.

7. **Firestore offline persistence** is enabled (`synchronizeTabs: true`), so the app works without internet.

---

## Data Model

```
users/{uid}                        # GLOBAL, not club-scoped
  ├── name, email, teamId, roles[], category, team, staffCategories[],
  │   position, playerNumber, profilePic, dob, fitnessStatus, injuryNote,
  │   prevCategory, prevTeam, claimsUpdatedAt
  └── tokens/{tokenId}             # FCM push tokens per device

clubs/{clubId}
  ├── name, crest, categories{cat: {enabled, letters[]}}, minAppVersion, leadEmail
  └── rosters/{teamKey}            # The registration gate: email allowlists
      └── players[], staff[]

clubCodes/{code}                   # Join codes → clubId (unreadable by clients)
joinAttempts/{uid}                 # Brute-force guard, 10/hour

teams/{teamId}                     # teamId === clubId
  ├── name, trainingDates[], matchDates[]   # denormalized schedule index
  ├── data/{key}__{category}       # sharded club data
  │   └── v: <JSON string>, category      (or per-FIELD merge docs, see below)
  ├── trainingAvail/{uid}_{date}   # per-record player answers
  ├── matchAvail/{uid}_{matchId}
  ├── rpe/{uid}_{type}_{ref}
  ├── pushQueue/{docId}            # outbound push requests
  └── seasons/{label}/…            # archived season copies of the above
```

Custom claims: `{ teamId, role: 'player'|'staff'|'lead', cats: ['amateur', …] }`.

### Synced keys (localStorage blob ⇄ sharded Firestore documents)

All 17 are routed by `js/shard.js`; five different rules decide a row's category (a field on the row, a uid joined through `fa_users`, a matchId joined through `fa_matches`, and so on). Rows belonging to no squad go to a `__none` shard, readable club-wide.

| Key | Description |
|---|---|
| `fa_users` | Club member cache (rebuilt from `users/` on login) |
| `fa_training` | Training sessions (date, time, focus, location, category, `plannedRpe`) **and activities** — a row with `kind:'activity'` is a team meal / gym block / club event, riding the same key so it inherits the call-up, the availability records and the T-4h reminder |
| `fa_matches` | Matches (id, home, away, date, time, score, location, team, `opponentPos` frozen at kick-off) |
| `fa_matchday` | Matchday drafts — **retired v181**: nothing writes it any more (the calendar's dialog commits straight to `fa_matches`). The key, its shard route and its `SEASON_KEYS` entry stay so existing drafts can still be read back and offered to the coach once |
| `fa_staff_notifications` | Staff notification feed (capped at 200, oldest trimmed) |
| `fa_injuries` | Injury records — the canonical medical history |
| `fa_injury_notes` | Injury description per player *(per-field merge doc)* |
| `fa_injury_zone` | Body-zone index per player *(per-field merge doc)* |
| `fa_injury_dismissed` | Dismissed self-reports *(per-field merge doc)* |
| `fa_training_staff_override` | Staff overrides of player availability *(per-field merge doc)* |
| `fa_match_events` | Match events per match |
| `fa_match_goals` | Goal scorers per match |
| `fa_convocatoria_sent` | Sent call-up data (players, uniform, videos) |
| `fa_convocatoria_callup` | Call-up times per match |
| `fa_tactic_saved` | Saved tactical boards |
| `fa_tactic_match_boards` | Boards linked to a match |
| `fa_tactic_training_boards` | Boards linked to a training date |

`fa_standings`, `fa_news` and `fa_player_stats` were removed — nothing ever wrote them. Standings come live from the FCF proxy; player stats are computed from `fa_matches` + `fa_match_events`. Training/match availability and RPE are **not** in this list: they are per-record collections.

---

## Roles & Permissions

| Role | Description |
|---|---|
| **Player** | Own schedule, availability, RPE, personal stats, match details |
| **Staff (coach)** | Training, roster, convocatòria, tactics, medical and notifications — **for their own categories only** |
| **Club lead** | Everything staff can do, plus club config, roster email lists, role assignment and the club's categories |
| **Superadmin** | `marna96@gmail.com`. Crosses club boundaries; the only account that can hand over a club lead or erase a person |

Membership is **not self-assignable**: `roles`, `category`, `team` and `staffCategories` are written only by `joinClub`, `onRosterWritten` and `setRole`. A person joins with a club code, and the club's roster email lists decide what they become.

---

## Features (by Page)

### Player Pages

| Page | Description |
|---|---|
| **Overview** | Player card, position circles, team badge, attendance donut, live league standings (FCF), this/next week's activities |
| **Training Schedule** | Upcoming and past sessions with date, time, focus, location |
| **My Stats** | Goals, assists, matches, attendance donut, injury history with body map, Readiness Score, RPE / UA / ACWR charts |
| **Matchday** | Matches with scores and convocatòria status |
| **Match Detail** | Kick-off, location and map link, call-up list and uniform, tactical boards with animation playback, videos, score and scorers |
| **Training Detail** | Time, day, location, attendance donut |
| **Actions** | Pending RPE, training and match availability, extra-training log |

### Staff Pages

| Page | Description |
|---|---|
| **Registrations** | Pending applicants and members: roles, squad, position, number |
| **Manage roster** | Roster table with fitness, readiness, matches, minutes; team-aggregate RPE/UA/ACWR. Player detail shows the same stats, injury history and body map the player sees |
| **Training Sessions** | Sessions with per-player availability, attendance donut, RPE summary; staff can override an answer |
| **Set Calendar** | Add/edit matches (home/away, squad, date, opponent, location, kick-off) |
| **Convocatòria** | Drag-and-drop squad selection with positions, fitness, readiness and availability; uniform, call-up time, attached boards and videos; send/unsend |
| **Medical** | Currently injured, season totals, per-player injury detail with body zone, history |
| **Tactical Board** | Pitch editor: formations, board types, draggable players, arrows, shapes, pen, text, cones, silhouettes, **multi-frame animation**, save/load, link to a match or training |
| **Notifications** | Feed of player actions with unread badge |

### Club lead pages

| Page | Description |
|---|---|
| **Configura el teu club** | Crest, categories and squad letters, schedule, and the roster email lists that gate registration |
| **Gestió d'usuaris** | Roles, squad re-assignment, remove from squad, and (superadmin) erase a person entirely |

---

## Readiness Score Engine

A composite player fitness metric from RPE data:

| Component (Weight) | Calculation |
|---|---|
| **Load Ratio (40%)** | ACWR. Optimal 0.8–1.3 = 100, <0.8 = 60, 1.3–1.5 = 70, >1.5 = 30 |
| **Match Fatigue (25%)** | Minutes in last match + recency. >80 min = 40, 60–80 = 60, 30–60 = 80. Penalties for <3 days recovery or 2 matches in 5 days |
| **Load Spike (20%)** | Week-over-week UA change. >+30% = 30, +10–30% = 60, ±10% = 100, <−10% = 80 |
| **RPE Trend (15%)** | 28-day trend. Sharp increase = 40, mild = 60, stable = 80, decreasing = 100 |

Green (≥75, optimal ACWR, 0 risk flags), Red (<55, ACWR >1.5, or ≥2 flags), Orange otherwise. Force-red for ACWR >1.7, 2 heavy matches in 4 days, or 2 consecutive RPE ≥9.

---

## Cloud Functions (`functions/index.js`, all `us-central1`)

| Function | Trigger | Description |
|---|---|---|
| `onPushQueueCreate` | onCreate `teams/{id}/pushQueue/{doc}` | FCM multicast to targeted players/roles; prunes stale tokens |
| `scheduledTrainingReminder` | Hourly (Europe/Madrid) | 4h before training, nudges players who haven't answered |
| `scheduledRpeReminder` | Daily 23:00 | Reminds players who attended but didn't submit RPE |
| `scheduledMatchAvailReminder` | Weekly | Chases unanswered match availability |
| `fcfClassificacio` | HTTP | CORS proxy for FCF standings (allowlisted URLs only) |
| `joinClub` | Callable | Validates a club code, applies the roster email lists, sets claims |
| `setRole` | Callable | Role/category changes with claims kept in sync |
| `onRosterWritten` | onWrite `clubs/{id}/rosters/{key}` | Roster list edits → membership and claims |
| `onClubLeadChanged` | onWrite `clubs/{id}` | Lead handover |
| `onMemberCategoryChanged` | onWrite `users/{uid}` | Moves a member's roster-joined rows between category shards |
| `updateTeamDates` | onWrite `teams/{id}/data/{key}` | Unions `trainingDates`/`matchDates` across shards for the schedulers |
| `deleteMember` | Callable | Erases a person everywhere: Auth, profile, tokens, records, blobs, rosters, storage |
| `archiveSeason` | HTTP (lead/superadmin) | Archives and resets a season, shard by shard, carrying open injuries forward |

---

## Testing (`test/`, dev-only)

**143 passing**: 42 unit + 87 rules + 14 functions.

| Suite | Command | Needs |
|---|---|---|
| `shard.test.js`, `router.test.js` | `npm run test:unit` | Nothing — pure Node against an in-memory Firestore fake, ~1s |
| `rules.test.js` | `npm run test:rules` | Firestore emulator (Java) |
| `functions.test.js`, `wipe.test.js` | `npm run test:functions` | Firestore + Functions emulators |

Everything runs against the fake project `demo-esquerrapp` — no credentials, no production data. `app.js` has no automated coverage; changes there are verified by hand.

---

## Build & Deploy

**Frontend** is GitHub Pages from `main` — a push deploys it, and CI builds the Android APK from the same commit. Bump `sw.js` `CACHE_NAME` and `APP_VERSION` together or browsers serve the old bundle (`check-deploy.js` asserts they agree).

**Rules and functions** deploy from Google Cloud Shell through the guard script, never a bare `firebase deploy`:

```bash
cd ~/EsquerrApp && ./deploy.sh rules       # firestore + storage rules
cd ~/EsquerrApp && ./deploy.sh functions   # cloud functions
```

**Capacitor:**

```bash
npm run build:www    # Copies project files into www/
npm run cap:sync     # build:www + cap copy/update android
npm run cap:open     # Opens Android Studio
```

**Old APKs are old clients** — Capacitor bundles a copy of the web assets, so Android users run whatever build they installed. Server-side changes must stay backward-compatible until an APK has circulated; `clubs/{id}.minAppVersion` vs `APP_VERSION` makes staleness visible but does not fix it.

### Dependencies

- `@capacitor/core` / `@capacitor/android` ^8.3.0, `@capacitor/cli` ^7.6.1
- Firebase 10.x Compat SDK (CDN `<script>` tags)
- Functions: `firebase-functions` ^6, `firebase-admin` ^13

---

## Known Patterns & Notes

- **No framework.** Manual DOM rendering; listeners re-bound after each render via `bindDynamicActions()`. Page-specific bindings are dispatched **by page name** in the router — a new page reusing existing markup must be added there or its interactions are silently dead.
- **`KEY_PAGES`** maps each synced key to the pages that must re-render when it changes remotely. A page missing from a key's list won't update from another device.
- **The safety rule.** Every writer parses a whole blob, mutates it and writes it back. Since a client only downloads its own categories, the router **refuses to write a shard it did not read** — otherwise saving would delete every other squad's rows.
- **Sanitization.** All user text goes through `sanitize()` before injection into HTML strings.
- **Charts** are hand-built SVG (no library), with Catmull-Rom interpolation.
- **Dates** are ISO `YYYY-MM-DD`; Cloud Functions work in `Europe/Madrid`. Custom datepicker in JS.
- **Body map**: SVG polygon zones over `img/cuerpos.png` for injury location.
- **Responsive**: flexbox/grid, mobile-first, collapsing sidebar, `ResizeObserver` scaling for tactical boards.
- **Demo seed data is gone** (removed by `cleanup-seed.js`). A new club starts empty, and the lead bootstraps it.
