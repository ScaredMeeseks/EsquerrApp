# EsquerrApp — Project Summary

## Overview

**EsquerrApp** is the official management app for **L'Esquerra de l'Eixample Futbol Club**, an amateur football club in Barcelona competing in the Catalan regional leagues (Tercera Catalana for the A team, Quarta Catalana for the B team). The app is a full-featured Progressive Web App (PWA) with an Android wrapper via Capacitor. The UI language is a mix of Catalan and English.

- **App ID:** `com.esquerrapp.app`
- **Theme color:** `#BD162C` (club red)
- **Firebase project:** `esquerrapp`
- **Admin email:** `marna96@gmail.com` (hardcoded as the sole admin)

---

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS — single `index.html` SPA, no build step |
| Backend | Firebase (Auth, Firestore, Storage, Cloud Messaging, Cloud Functions v2) |
| Mobile | Capacitor 8.x wrapping the web app in an Android shell |
| PWA | Service Worker (`sw.js`) for caching + FCM background push |

### File Structure

```
football-app/
├── index.html              # Single-page app (all views in one file)
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (cache + FCM background)
├── capacitor.config.json   # Capacitor config (webDir: www)
├── package.json            # Capacitor dependencies + build scripts
├── firestore.rules         # Firestore security rules
├── css/
│   └── style.css           # All styles (~single file)
├── js/
│   ├── firebase-config.js  # Firebase init (Auth, Firestore, Storage, FCM)
│   ├── db.js               # Firestore ↔ localStorage sync layer
│   ├── push.js             # FCM token management + foreground notifications
│   └── app.js              # Main application logic (~9,450 lines)
├── functions/
│   ├── index.js            # Cloud Functions (push triggers, reminders, proxy)
│   └── package.json
├── img/                    # Logos, icons, body map images, pitch silhouettes
├── www/                    # Build output (copy of root files for Capacitor)
└── android/                # Capacitor-generated Android project
```

### Key Design Decisions

1. **Single-file SPA:** All views (login, register, profile setup, role selection, dashboard with ~20 sub-pages) live in `index.html` and are toggled via JS (`showView()`). No router library — page switching is driven by `currentPage` state and a `renderPage()` dispatcher.

2. **localStorage as primary store, Firestore as sync layer:** The app reads/writes all data to `localStorage` for instant synchronous access. `db.js` monkey-patches `localStorage.setItem` and `localStorage.removeItem` to transparently mirror writes to Firestore. On login, Firestore data is downloaded into localStorage. Real-time `onSnapshot` listeners push remote changes from other devices.

3. **Team-scoped data:** All team data lives under `teams/{teamId}/data/{key}` in Firestore, where each key maps 1:1 to a localStorage key. The default team ID is `"default"`.

4. **Firebase Auth for identity:** Registration/login use `createUserWithEmailAndPassword` / `signInWithEmailAndPassword`. User profiles are stored in `users/{uid}` in Firestore.

5. **Firestore offline persistence** is enabled (`synchronizeTabs: true`) so the app works without internet.

---

## Data Model

### Firestore Collections

```
users/{uid}
  ├── name, email, roles[], isAdmin, position, playerNumber,
  │   profilePic, dob, profileSetupDone, teamId, team, fitnessStatus, injuryNote
  └── tokens/{tokenId}          # FCM push tokens per device
      └── token, createdAt, platform

teams/{teamId}
  ├── name, createdAt
  ├── data/{key}                # Synced localStorage keys (see below)
  │   └── v: <JSON string>
  └── pushQueue/{docId}         # Outbound push notification requests
      └── title, body, type, targetPlayers[], targetRole, status
```

### Synced localStorage Keys (mirrored to Firestore)

| Key | Description |
|---|---|
| `fa_users` | All registered users (local roster cache) |
| `fa_training` | Array of training sessions (date, time, focus, location, status) |
| `fa_matches` | Array of matches (id, home, away, date, time, score, location, team) |
| `fa_matchday` | Calendar entries for upcoming matches |
| `fa_standings` | League standings table |
| `fa_news` | News articles |
| `fa_player_stats` | Player statistics (goals, assists, matches, rating) |
| `fa_training_availability` | Per-player training attendance answers (`yes`/`late`/`no`/`injured`) |
| `fa_match_availability` | Per-player match availability (`disponible`/`no_disponible`) |
| `fa_player_rpe` | RPE (Rate of Perceived Exertion) entries per player per session |
| `fa_staff_notifications` | Staff notification feed |
| `fa_injury_notes` | Injury descriptions per player |
| `fa_injury_zone` | Body zone index for current injury (links to body map) |
| `fa_training_staff_override` | Staff overrides of player availability |
| `fa_convocatoria_sent` | Sent match call-up data (player IDs, jersey, socks, videos) |
| `fa_convocatoria_callup` | Call-up times per match |
| `fa_match_goals` | Goal scorers per match |
| `fa_tactic_saved` | Saved tactical boards |
| `fa_tactic_match_boards` | Tactical boards linked to specific matches |

---

## Roles & Permissions

The app has three role levels:

| Role | Description |
|---|---|
| **Player** | Can view schedule, submit availability/RPE, see personal stats and match details |
| **Staff** | Can manage training, roster, convocatòria, tactics, medical, and send notifications |
| **Admin** | Has full access: manage users, assign roles, settings. Can toggle player+staff for themselves. Only `marna96@gmail.com` is admin. |

Role selection happens after first login. Regular users pick one role; admin can enable both.

---

## Features (by Page)

### Player Pages

| Page | Description |
|---|---|
| **Overview** | Player card with profile pic, position circles (color-coded by GK/DF/MF/FW), team badge (A/B), attendance donut chart, live league standings (scraped from FCF), and this/next week's activities |
| **Training Schedule** | List of upcoming and past training sessions with date, time, focus, and location |
| **My Stats** | Goals, assists, matches, attendance donut, injury history with body map, **Readiness Score** (composite metric), RPE per Session chart, UA per Week chart, ACWR chart |
| **Matchday** | Upcoming and past matches with scores, convocatòria status |
| **Match Detail** | Full match info: date, kick-off, location (with map link), convocatòria (called up list, uniform), tactical boards (with animation playback), video links, score & goal scorers |
| **Training Detail** | Single training info: time, day, location, attendance donut |
| **Actions** | Pending items: RPE submissions for completed trainings/matches, training availability responses, match availability responses, extra training log |

### Staff Pages

| Page | Description |
|---|---|
| **Registrations** | Manage all members: set roles, assign team (A/B), position (multi-select), player number |
| **Player Roster** | Full roster table with fitness status (fit/doubt/injured), readiness dots, matches, minutes. Filter by team. Includes team-aggregate RPE, UA, and ACWR charts |
| **Training Sessions** | View all training sessions with per-player availability breakdown, attendance percentage donut, RPE summary. Editable (add/remove sessions). Staff can override player availability |
| **Set Calendar** | Add/edit upcoming matches: home/away, team (A/B), date (datepicker), opponent, location, map link, kick-off time |
| **Convocatòria** | Drag-and-drop match squad selection. Shows player positions, fitness, readiness, match availability. Configurable uniform (jersey + socks), call-up time, attached tactical boards and video links. Send/unsend to players |
| **Matchday** | Same match list as player but with staff context (score editing, goal scorer entry) |
| **Medical** | Dashboard: currently injured count, season total. Lists injured players with injury description, duration, body zone. Past injuries history |
| **Tactical Board** | Full-featured pitch editor: 10 formations, 3 board types (full/half/area), draggable player circles with numbers and colors, opponent team, balls, arrows (straight/dashed with arrowheads), rectangles, freehand pen, text labels, cones, silhouette overlays. **Multi-frame animation** with playback. Save/load boards, link to matches, tag by category (Presión/Salida/Estrategia). Vertical/horizontal orientation |
| **Notifications** | Feed of player actions (RPE submissions, availability responses, extra training). Unread badge in sidebar |

### Admin Pages

| Page | Description |
|---|---|
| **Manage Users** | Toggle player/staff roles, delete users |
| **Settings** | App configuration |

---

## Readiness Score Engine

A composite player fitness metric calculated from RPE data:

| Component (Weight) | Calculation |
|---|---|
| **Load Ratio (40%)** | Based on ACWR (Acute:Chronic Workload Ratio). Optimal 0.8–1.3 = 100, <0.8 = 60, 1.3–1.5 = 70, >1.5 = 30 |
| **Match Fatigue (25%)** | Based on minutes in last match + recency. >80 min = 40, 60–80 = 60, 30–60 = 80. Penalties for <3 days recovery or 2 matches in 5 days |
| **Load Spike (20%)** | Week-over-week UA change. >+30% = 30, +10–30% = 60, ±10% = 100, <-10% = 80 |
| **RPE Trend (15%)** | 28-day RPE trend. Sharp increase = 40, mild = 60, stable = 80, decreasing = 100 |

Color classification: Green (≥75, optimal ACWR, 0 risk flags), Red (<55, ACWR >1.5, or ≥2 risk flags), Orange (everything else). Force-red overrides for ACWR >1.7, 2 heavy matches in 4 days, or 2 consecutive RPE ≥9.

---

## Live League Standings

The player overview scrapes real-time league standings from the Catalan Football Federation website (`fcf.cat`). A Cloud Function (`fcfClassificacio`) acts as a CORS proxy, limited to two allowed URLs (A team Tercera Catalana and B team Quarta Catalana). Results are parsed client-side from the HTML table and cached for 5 minutes. Fallback hardcoded standings are embedded in the code.

---

## Push Notifications

### Client-side (`push.js`)
- Requests notification permission on login
- Saves FCM token to `users/{uid}/tokens/{token}` in Firestore
- Handles foreground messages with in-app toast + native notification
- Cleans up token on logout

### Cloud Functions (`functions/index.js`)

| Function | Trigger | Description |
|---|---|
| `onPushQueueCreate` | Firestore onCreate on `teams/{teamId}/pushQueue/{docId}` | Sends FCM multicast to targeted players/roles. Cleans stale tokens |
| `scheduledTrainingReminder` | Every 60 minutes (Europe/Madrid) | 4 hours before training, notifies players who haven't confirmed attendance |
| `scheduledRpeReminder` | Daily at 23:00 (Europe/Madrid) | Reminds players who attended today's session but haven't submitted RPE |
| `fcfClassificacio` | HTTP request | CORS proxy for FCF league standings (allowlisted URLs only) |

---

## Service Worker (`sw.js`)

- **Cache-first** for static assets (CSS, JS, images, fonts)
- **Network-first** for everything else
- Imports Firebase SDK for **background push** handling
- Notification click opens the app

---

## Seed Data

On first use, the app auto-generates realistic demo data:
- ~7 months of training sessions (Tue/Thu) + 2 weeks ahead
- Bi-weekly matches against local Catalan clubs
- 6 demo players with positions, stats, and fitness states
- Simulated RPE, availability, and injury data per player
- League standings and news articles

---

## Build & Deploy

### NPM Scripts

```bash
npm run build:www    # Copies project files (minus android/node_modules/www) into www/
npm run cap:sync     # build:www + cap copy android + cap update android
npm run cap:open     # Opens Android Studio with the android/ project
```

### Firebase Deploy

```bash
firebase deploy --only functions --project esquerrapp
firebase deploy --only firestore:rules
```

### Dependencies

- `@capacitor/core` ^8.3.0
- `@capacitor/android` ^8.3.0
- `@capacitor/cli` ^7.6.1
- Firebase 10.x Compat SDK (loaded via CDN `<script>` tags)
- Cloud Functions: `firebase-functions` ^6, `firebase-admin` ^13

---

## Known Patterns & Notes

- **No framework:** Pure vanilla JS with manual DOM rendering. Each page has a `render*()` function returning an HTML string, which is set via `innerHTML`. Event listeners are re-bound after each render via `bindDynamicActions()`.
- **Sanitization:** All user-generated text is escaped via a `sanitize()` helper before injection into HTML strings.
- **Charts:** SVG-based RPE, UA, and ACWR charts are built manually in JS (no charting library). Catmull-Rom spline interpolation for smooth lines.
- **Tactical board animations:** Multi-frame keyframe system with `requestAnimationFrame` interpolation. Positions, arrows, rects, balls, cones, text labels, and pen lines are all animated between frames.
- **Date handling:** All dates are ISO format strings (`YYYY-MM-DD`). Training schedule uses `Europe/Madrid` timezone for Cloud Functions. A custom datepicker is implemented in JS.
- **Body map:** SVG polygon zones overlaid on a body image (`img/cuerpos.png`) for injury location tracking.
- **Responsive:** CSS uses flexbox/grid with mobile-first approach. Sidebar collapses. Tactical board scales proportionally using `ResizeObserver`.
