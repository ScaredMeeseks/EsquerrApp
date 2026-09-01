/* =========================================================
   Turning an XWeather forecast into a session's weather line
   =========================================================

   Everything here is PURE: no firebase-admin, no network, no clock beyond
   what a caller passes in. Same rule as functions/fcf.js, and for the same
   reason — test/weather.test.js requires this file directly, with no
   emulator and no API key, so every rule below is exercised on a laptop in
   about a second.

   The one thing this file decides that a reader cannot get from the vendor's
   docs: what a coach is being told. XWeather publishes `pop`, a PROBABILITY
   per hour. The app shows a share of the SESSION — "es preveu pluja durant el
   50% de l'entrenament" — which is a different quantity, computed here by
   weighting each hourly period by the minutes it actually overlaps the
   session. Those two numbers are easy to confuse and impossible to swap back
   once they are on screen, so the conversion lives in one named function
   (summarise) rather than being spread over the caller.
   ========================================================= */

/* The seven conditions the UI can draw. Fixed by STP_WEATHER_ICON and the
   `wx.*` i18n block in js/app.js — a value not in this list renders as the
   sun with a missing i18n key beside it, so nothing here may invent one. */
const WX_CONDS = ["sun", "cloud", "overcast", "rain", "storm", "snow", "fog"];

/* Most notable first. A storm in the last twenty minutes of a session is the
   headline even if the other seventy are dry; "mostly sunny" is not what a
   coach needs to hear when he is deciding whether to move indoors. */
const WX_RANK = ["storm", "snow", "rain", "fog", "overcast", "cloud", "sun"];

/* XWeather's `weatherPrimaryCoded` is "coverage:intensity:type" — the TYPE is
   the third field and the only one this maps. See
   https://www.xweather.com/docs/weather-api/reference/weather-codes */
const WX_TYPE = {
  T: "storm", TO: "storm", FC: "storm",
  S: "snow", SW: "snow", BS: "snow", WM: "snow", IP: "snow",
  ZR: "snow", RS: "snow",
  R: "rain", RW: "rain", A: "rain",
  F: "fog", BR: "fog", H: "fog",
};

/* Cloud cover, used only when there is no weather type at all ("::FW"). */
const WX_CLOUDS = {
  CL: "sun", FW: "sun", SC: "cloud", BK: "overcast", OV: "overcast",
};

/* What counts as "it will be raining" for one hourly period.
   ONE constant, deliberately: the threshold is a judgement about what a coach
   should be warned of, and a judgement spread over three call sites is a
   judgement nobody can change. 50 is "more likely than not" — below that the
   honest answer is that it might rain, which the strip has no room to say.

   `precipMM` is deliberately NOT part of this. A trace of drizzle and a
   downpour are the same decision on a football pitch, and the amount would
   only add a second threshold to keep in step with this one. */
const WET_POP = 50;

/* ── Coordinates ──────────────────────────────────────────── */

/**
 * The `{lat, lon}` a maps URL points at, or null.
 *
 * Three forms, in the order they turn up in this app's data:
 *
 *   ?query=41.3,2.1     what fcfMapsLink() writes for every imported fixture
 *   @41.3,2.1,17z       what a browser's address bar shows on maps.google.com
 *   !3d41.3!4d2.1       the embed/place form of the same
 *
 * A `share.google` / `goo.gl` short link carries NO coordinates — it is an
 * opaque id that only Google can resolve — and correctly returns null here.
 * That is not a gap: TRAINING_DEFAULT_MAP in js/app.js is exactly such a
 * link, which is the whole reason a club also configures home coordinates.
 *
 * 0,0 is refused. FCF sends "0" for an unknown venue and fcfMapsLink already
 * treats it as absent; a forecast for the Gulf of Guinea is worse than none,
 * because it looks like an answer.
 */
function coordsFromMapLink(url) {
  const s = String(url === undefined || url === null ? "" : url);
  if (!s) return null;
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const patterns = [
    new RegExp("[?&]query=" + num + "\\s*,\\s*" + num),
    new RegExp("[?&]q=" + num + "\\s*,\\s*" + num),
    new RegExp("@" + num + "," + num),
    new RegExp("!3d" + num + "!4d" + num),
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (lat === 0 && lon === 0) continue;
    return {lat: lat, lon: lon};
  }
  return null;
}

/* Google's Maps SHORTENERS. `maps.app.goo.gl` is what the Maps app's own
   Share button produces, so it is the link an ordinary person actually has
   to paste — the long `@lat,lon` address bar URL is the exception, not the
   rule. Each of these 302s straight to a full maps URL with coordinates in
   it, so one redirect hop recovers them (see resolveShortLink in index.js).

   `share.google` is NOT here and must not be added: it redirects to
   `google.com/share.google?q=…`, a JS-driven page with no coordinate pair
   anywhere in the HTML. Verified, not assumed. Nothing short of a headless
   browser gets coordinates out of one. */
const SHORT_MAP_HOSTS = ["maps.app.goo.gl", "goo.gl", "g.co", "maps.google.com"];

/**
 * Is this a link whose coordinates might be one redirect away?
 *
 * Only asked when coordsFromMapLink() has already returned null, so a
 * `maps.google.com` URL that carries `@lat,lon` never reaches here — this is
 * about deciding whether a network hop is worth making, nothing more.
 */
function isShortMapLink(url) {
  const s = String(url === undefined || url === null ? "" : url).trim();
  const m = /^https?:\/\/([^/?#]+)/i.exec(s);
  if (!m) return false;
  const host = m[1].toLowerCase().replace(/^www\./, "");
  return SHORT_MAP_HOSTS.indexOf(host) !== -1;
}

/**
 * Coordinates for a link, consulting a map of already-resolved short links.
 *
 * `resolved` is Map(url → {lat,lon}) built by the caller, which is where the
 * network lives — everything in this file stays pure and testable.
 */
function coordsFromLink(url, resolved) {
  const direct = coordsFromMapLink(url);
  if (direct) return direct;
  if (!resolved || !url) return null;
  return resolved.get(String(url).trim()) || null;
}

/**
 * A `{lat, lon}` from whatever a club has stored, or null.
 *
 * Tolerant on purpose: `homeCoords` is validated by setClubCategories on the
 * way in, but a club document is years-lived and this runs unattended at
 * 08:00, so a string "41.38" or a missing field must skip the club rather
 * than throw and take every other club's forecast down with it.
 */
function coordsOf(obj) {
  if (!obj || typeof obj !== "object") return null;
  const lat = parseFloat(obj.lat);
  const lon = parseFloat(obj.lon);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (lat === 0 && lon === 0) return null;
  return {lat: lat, lon: lon};
}

/* ── The club's own grounds, from the links the lead already types ──
   `clubs/{id}.schedules['{cat}-{letter}']` is
       { training: [{day, time, endTime, location, link}], homeGame: {…} }
   and those `link` fields are the SAME maps links the lead pastes in team
   setup, which trainingFromSlot() then copies onto every session it mints.
   Reading them here means a home session gets its coordinates from the club
   configuration whether or not the individual row inherited the link — a
   fixture typed by hand, or one created before the link was set, is covered
   by the same answer.

   Deliberately NOT a copy of scheduleSlots() from js/utils.js: that one
   fills in DEFAULT_TRAINING_SLOTS when a squad has no schedule, and a
   defaulted slot has no link, so there is nothing here for it to add. */

/* Written by code point rather than as literal combining marks, like
   COMBINING_MARKS in fcf.js: an invisible character class is one bad
   re-encoding away from silently matching nothing. */
const COMBINING_MARKS = new RegExp(
    "[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");

/** A ground name as a comparison key — accents, case and spacing folded. */
function placeKey(s) {
  return String(s || "").toLowerCase().normalize("NFD")
      .replace(COMBINING_MARKS, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Every coordinate a club's schedule links point at.
 *
 * Returns `{place, squad, any}`:
 *   place  Map(placeKey(location) → coords)  — the strongest match, because
 *          a ground is identified by its name wherever it was configured.
 *   squad  Map("{cat}-{letter}" → coords)    — this squad trains here.
 *   any    the first readable one, for the ordinary club with one ground.
 *
 * Links that carry no coordinates — a `share.google` short link, an empty
 * box — contribute nothing and are simply skipped. A club whose every link
 * is a short link yields an empty index, which is what `homeCoords` is the
 * last resort for.
 */
function scheduleCoordIndex(club, resolved) {
  const out = {place: new Map(), squad: new Map(), any: null};
  const scheds = (club && club.schedules) || {};
  Object.keys(scheds).forEach((key) => {
    const s = scheds[key] || {};
    const rows = [].concat(
        Array.isArray(s.training) ? s.training : [],
        s.homeGame ? [s.homeGame] : []);
    rows.forEach((r) => {
      const c = coordsFromLink(r && r.link, resolved);
      if (!c) return;
      const pk = placeKey(r.location);
      // First writer wins throughout: the schedule is ordered, and a second
      // link for the same ground is the same ground.
      if (pk && !out.place.has(pk)) out.place.set(pk, c);
      if (!out.squad.has(key)) out.squad.set(key, c);
      if (!out.any) out.any = c;
    });
  });
  return out;
}

/**
 * Where this row is played, or null.
 *
 * The order is most-specific-first, and each step answers a real case:
 *
 *   1. the row's OWN link      an away fixture (the federation's own
 *                              coordinates), or a venue a coach typed for
 *                              this one session
 *   2. the same ground NAME    the row says "Escola Industrial" and some
 *                              squad's schedule has a link for it
 *   3. this squad's schedule   the row's location is blank or unrecognised,
 *                              but we know where this team trains
 *   4. any configured ground   the ordinary club, which has one
 *   5. clubs/{id}.homeCoords   the explicit escape hatch, for a club whose
 *                              every link is an unreadable short link
 *
 * @param {object} row a training session or a match
 * @param {object} index from scheduleCoordIndex()
 * @param {?object} home coordsOf(club.homeCoords)
 * @return {?object} {lat, lon}
 */
function coordsForRow(row, index, home, resolved) {
  const r = row || {};
  const own = coordsFromLink(r.mapLink, resolved);
  if (own) return own;
  const idx = index || {place: new Map(), squad: new Map(), any: null};

  const pk = placeKey(r.location);
  if (pk && idx.place.has(pk)) return idx.place.get(pk);

  /* A training carries `teams` (it can be shared by A and B); a match
     carries a single `team`. Both are letters against the same category. */
  const cat = String(r.category || "");
  const letters = Array.isArray(r.teams) ? r.teams :
    (r.team ? [r.team] : []);
  for (const l of letters) {
    const k = cat + "-" + l;
    if (idx.squad.has(k)) return idx.squad.get(k);
  }

  return idx.any || home || null;
}

/**
 * The cache key for a coordinate: 3 decimals, ~100 m.
 *
 * Every home fixture and every training at the same ground collapses onto one
 * key, so a club with one pitch costs ONE API call per run no matter how many
 * sessions it has. Weather does not vary within 100 m; the rounding is free.
 */
function coordKey(c) {
  return c.lat.toFixed(3) + "," + c.lon.toFixed(3);
}

/* ── Reading one forecast period ──────────────────────────── */

/**
 * Which of the seven drawable conditions one hourly period is.
 *
 * The third field of `weatherPrimaryCoded` is NOT always a weather type.
 * When nothing is expected, XWeather puts the CLOUD code there instead —
 * "::FW" is "a few clouds and no weather", not an unrecognised type. So the
 * lookup tries the weather table, then the cloud table, and only then falls
 * back to the separate `cloudsCoded` field. Reading it as a type alone turns
 * every clear hour into "cloud", which is wrong in the direction nobody
 * notices: an overcast forecast for a sunny evening looks merely pessimistic.
 *
 * Unknown codes fall back to "cloud" rather than throwing. XWeather adds
 * codes; a code this app has never heard of must render as an ordinary
 * overcast hour, not blank the strip for everyone.
 */
function wxCondOf(period) {
  const p = period || {};
  const coded = String(p.weatherPrimaryCoded || "");
  const type = coded.split(":")[2] || "";
  if (type && WX_TYPE[type]) return WX_TYPE[type];
  if (type && WX_CLOUDS[type]) return WX_CLOUDS[type];
  const clouds = String(p.cloudsCoded || "");
  if (WX_CLOUDS[clouds]) return WX_CLOUDS[clouds];
  return "cloud";
}

/** Will it be raining this hour? See WET_POP. */
function isWetPeriod(period) {
  const pop = Number((period || {}).pop);
  return isFinite(pop) && pop >= WET_POP;
}

/**
 * How many minutes of one hourly period fall inside [startMs, endMs).
 *
 * The period is stamped at its START and covers the hour after it. Clamping
 * both ends is what makes an 18:00–19:30 session weight the 18:00 period at
 * 60 minutes and the 19:00 one at 30, instead of counting them equally and
 * reporting every mixed session as exactly 50%.
 */
function overlapMins(period, startMs, endMs) {
  const t0 = Date.parse(String((period || {}).dateTimeISO || ""));
  if (!isFinite(t0)) return 0;
  const t1 = t0 + 3600000;
  const lo = Math.max(t0, startMs);
  const hi = Math.min(t1, endMs);
  return hi > lo ? (hi - lo) / 60000 : 0;
}

/* ── Daylight ─────────────────────────────────────────────── */

/**
 * Is this session mostly after dark?
 *
 * TWO sources, and the difference matters more than it looks. XWeather's
 * `isDay` is stamped per HOUR, so a 20:00–21:30 session against a 20:21
 * sunset counts the whole 20:00 hour as daylight: 60 minutes of "day"
 * against 30 of night, and the strip draws a sun over a session played
 * almost entirely in the dark. Evening trainings are most trainings, so
 * that is the common case, not a corner.
 *
 * `sun` — `{riseMs, setMs}` from the /sunmoon endpoint — gives the real
 * instant, and the same session then reads 21 minutes of day against 69 of
 * night. When it is absent (the call failed, or a caller has none) this
 * falls back to the hourly tally, which is approximate but never absurd.
 *
 * Ties go to day: an exactly half-and-half session is a sunset, and a sun
 * over a sunset is the more forgiving of the two mistakes.
 *
 * @param {number} startMs session start, epoch ms
 * @param {number} endMs session end, epoch ms
 * @param {?object} sun {riseMs, setMs} for the session's own date
 * @param {number} dayMins daylight minutes from the hourly isDay tally
 * @param {number} total overlapping minutes in total
 * @return {boolean} true when it is mostly dark
 */
function nightOf(startMs, endMs, sun, dayMins, total) {
  const rise = sun && Number(sun.riseMs);
  const set = sun && Number(sun.setMs);
  if (isFinite(rise) && isFinite(set) && set > rise) {
    const lo = Math.max(rise, startMs);
    const hi = Math.min(set, endMs);
    const lit = hi > lo ? hi - lo : 0;
    return lit * 2 < (endMs - startMs);
  }
  return dayMins * 2 < total;
}

/* ── The session's forecast ───────────────────────────────── */

/**
 * Fold the hourly periods covering a session into the one line the app draws.
 *
 * Returns `{cond, windMs, tempC, rainPct}`, or **null** when no period
 * overlaps the window at all. Null rather than a zeroed object on purpose: an
 * empty forecast is not information, and a `{tempC: 0}` written into a session
 * would show a coach a plausible freezing evening he has no way to disbelieve.
 *
 * `windMs` is the MAX across the window, not the mean. The gust is what moves
 * a ball in flight and blows a set of cones over; averaging it away is how a
 * strip ends up saying "breeze" for a session nobody could hold a drill in.
 *
 * `tempC` is the mean, weighted by overlap — temperature is a background
 * condition and its peak says nothing useful.
 *
 * @param {Array<object>} periods XWeather 1hr forecast periods
 * @param {number} startMs session start, epoch ms
 * @param {number} endMs session end, epoch ms
 * @return {?object} the stored weather shape, minus `at`
 */
function summarise(periods, startMs, endMs, sun) {
  if (!Array.isArray(periods) || !(endMs > startMs)) return null;
  let total = 0;
  let wet = 0;
  let tempSum = 0;
  let tempMins = 0;
  let dayMins = 0;
  let windMs = null;
  let condRank = WX_RANK.length;

  periods.forEach((p) => {
    const mins = overlapMins(p, startMs, endMs);
    if (mins <= 0) return;
    total += mins;
    if (isWetPeriod(p)) wet += mins;
    /* XWeather stamps isDay per hour against the real sunrise/sunset for
       THAT location and date, so a 19:00 session is day in June and night in
       December with no almanac of our own. Absent (an older payload) counts
       as day, which is what the app did before this existed. */
    if (p.isDay !== false) dayMins += mins;

    const rank = WX_RANK.indexOf(wxCondOf(p));
    if (rank !== -1 && rank < condRank) condRank = rank;

    const w = Number(p.windSpeedMPS);
    if (isFinite(w) && (windMs === null || w > windMs)) windMs = w;

    const c = Number(p.tempC);
    if (isFinite(c)) {
      tempSum += c * mins;
      tempMins += mins;
    }
  });

  if (!total) return null;
  const out = {
    cond: condRank < WX_RANK.length ? WX_RANK[condRank] : "cloud",
    rainPct: Math.round((wet / total) * 100),
    /* Whichever the session is MOSTLY in, weighted by overlap like
       everything else here, so one straddling sunset gets a single icon
       rather than half of each. Ties go to day.

       A separate flag rather than a `cond` of its own: a clear sky is the
       same FACT at midnight as at noon, and only the drawing differs. Same
       reasoning as storing windMs and banding it at render time — the band
       is a presentation choice, the number is the fact. */
    night: nightOf(startMs, endMs, sun, dayMins, total),
  };
  if (windMs !== null) out.windMs = Math.round(windMs * 10) / 10;
  if (tempMins) out.tempC = Math.round((tempSum / tempMins) * 10) / 10;
  return out;
}

/* ── When to refresh ──────────────────────────────────────── */

/* Nothing runs overnight — a forecast refreshed at 03:00 is read by nobody
   and costs the same as one refreshed at 09:00. The cron is `0 8-21 * * *`,
   so these bounds and that schedule have to agree; the check is repeated here
   because this function is also what the tests pin the rule to. */
const WX_HOUR_FROM = 8;
const WX_HOUR_TO = 21;

/**
 * Is this event due a refresh on this run?
 *
 * The cadence tightens as the event approaches, which is the honest shape:
 * three days out the forecast barely moves between runs, and on the day it
 * moves hour to hour.
 *
 *   D-3   once, at 08:00
 *   D-2   every 4 hours   (08, 12, 16, 20)
 *   D-1   every 2 hours   (08, 10, 12, 14, 16, 18, 20)
 *   D     every run       (08 … 21)
 *
 * What this saves is not really API quota — one call covers a venue's whole
 * three-day window, so the fetch count is driven by venues and runs, not by
 * events. It saves Firestore WRITES: every write dirties a shard, re-fires
 * updateTeamDates, and re-renders the calendar on every open client.
 *
 * @param {number} daysOut calendar days from today to the event's date
 * @param {number} hour hour of day, Europe/Madrid, 0-23
 * @return {boolean} true when this run owns this event
 */
function wxDue(daysOut, hour) {
  /* Number(null) is 0 and Number("") is 0, and 0 is "today" — the one value
     that refreshes on every run. So the emptiness check comes BEFORE the
     numeric one, or an event whose date failed to parse gets fetched hourly
     for ever. */
  if (daysOut === null || daysOut === undefined || daysOut === "") return false;
  if (hour === null || hour === undefined || hour === "") return false;
  const d = Number(daysOut);
  const h = Number(hour);
  if (!isFinite(d) || !isFinite(h)) return false;
  if (h < WX_HOUR_FROM || h > WX_HOUR_TO) return false;
  if (d < 0 || d > 3) return false;
  if (d === 3) return h === WX_HOUR_FROM;
  if (d === 2) return h % 4 === 0;
  if (d === 1) return h % 2 === 0;
  return true;
}

/**
 * Whole days from `fromISO` to `toISO`, both "YYYY-MM-DD".
 *
 * Midday UTC on both sides so a DST change cannot round a gap to the wrong
 * integer — the same trick _dayGap uses in fcf.js. Returns null when either
 * date is unusable, which callers treat as "not due".
 */
function dayGap(fromISO, toISO) {
  const a = Date.parse(String(fromISO) + "T12:00:00Z");
  const b = Date.parse(String(toISO) + "T12:00:00Z");
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* ── Is the write worth making? ───────────────────────────── */

/**
 * Has anything a USER could see changed?
 *
 * Compared at DISPLAY precision, not at stored precision: the strip rounds
 * wind to 0.1 m/s and temperature to a whole degree, so a forecast that
 * wobbles by 0.02° is not a change — it is a shard write, an updateTeamDates
 * fire, and a full calendar re-render on every open client, for nothing.
 * Same guard, and the same reasoning, as the `if (!touched)` skip in
 * _syncFcfSquad.
 *
 * `at` is ignored on purpose: it moves on every fetch by definition, so
 * including it would make this function always true and delete the point.
 */
function weatherChanged(before, after) {
  if (!after) return false;
  if (!before) return true;
  const num = (v, dp) => {
    const n = Number(v);
    return isFinite(n) ? n.toFixed(dp) : "";
  };
  return before.cond !== after.cond ||
    // `night` picks the icon, so a flip is as visible as a cond change.
    !!before.night !== !!after.night ||
    num(before.windMs, 1) !== num(after.windMs, 1) ||
    num(before.tempC, 0) !== num(after.tempC, 0) ||
    num(before.rainPct, 0) !== num(after.rainPct, 0);
}

module.exports = {
  WX_CONDS,
  WET_POP,
  WX_HOUR_FROM,
  WX_HOUR_TO,
  coordsFromMapLink,
  coordsFromLink,
  isShortMapLink,
  SHORT_MAP_HOSTS,
  coordsOf,
  coordKey,
  placeKey,
  scheduleCoordIndex,
  coordsForRow,
  nightOf,
  wxCondOf,
  isWetPeriod,
  overlapMins,
  summarise,
  wxDue,
  dayGap,
  weatherChanged,
};
