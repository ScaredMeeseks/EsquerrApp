/* =========================================================
   EsquerrApp — Shared constants & pure utilities
   Loaded before app.js — no closure dependencies
   ========================================================= */

// ---------- Date Helpers ----------
function localDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
const DAY_VALUES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/* The season boundary as 'MM-DD'. Defaults to 15 August, the Catalan
   amateur calendar; a club may override it with clubs/{id}.seasonBoundary
   for leagues that run on a different year (calendar-year and
   spring–winter competitions both exist).

   Deliberately a module-level variable rather than a parameter: the six
   call sites all pass only a date, and `teamId` is single-valued, so a
   session never has two clubs loaded at once. loadClubConfig() owns it. */
let _seasonBoundary = '08-15';

function setSeasonBoundary(mmdd) {
  // Anything malformed falls back to the default rather than producing a
  // window nobody asked for — a club with no field must behave exactly as
  // it did before this existed.
  _seasonBoundary = /^\d{2}-\d{2}$/.test(mmdd) ? mmdd : '08-15';
}

function getSeasonBoundary() { return _seasonBoundary; }

/* Returns the most recent season boundary on or before `when`, as
   'YYYY-MM-DD'.

   This used to be inlined in seven places as `getMonth() >= 7 ? year : year-1`
   followed by `year + '-08-15'`, which rolled the season over on 1 August but
   dated it 15 August — so for the first fortnight of every August the window
   started in the FUTURE and silently emptied every season-scoped view
   (medical injuries, player stats, roster stats, season week). */
function seasonStartStr(when) {
  const d = when || new Date();
  const cut = d.getFullYear() + '-' + _seasonBoundary;
  return localDateStr(d) >= cut ? cut : (d.getFullYear() - 1) + '-' + _seasonBoundary;
}

function getSeasonWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const aug15 = new Date(seasonStartStr(d) + 'T12:00:00');
  const aug15Day = aug15.getDay();
  const mondayOfW1 = new Date(aug15.getTime() - ((aug15Day === 0 ? 6 : aug15Day - 1)) * 86400000);
  const diff = d.getTime() - mondayOfW1.getTime();
  return Math.floor(diff / (7 * 86400000)) + 1;
}

/* ---------- Calendar ----------

   The month grid, the placeholder ("ghost") trainings the club's own
   schedule implies, and a session's position in the microcycle.

   All of it is pure and lives here rather than in app.js so it can be
   tested: app.js has no harness beyond grab(), and every one of these is
   date arithmetic, which is exactly the kind of code that is wrong in a
   way nobody notices until March. */

/** Whole days from `aISO` to `bISO`; negative when b is earlier.

    Noon on both ends, so a DST boundary between them cannot turn 7 days
    into 6.96 and round to 7 by luck rather than by construction. */
function daysBetweenISO(aISO, bISO) {
  const a = new Date(aISO + 'T12:00:00');
  const b = new Date(bISO + 'T12:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * The 42 ISO dates of a Monday-first month grid, spilling into the
 * neighbouring months so every row has seven cells.
 *
 * `monthIdx` is 0-11, as `Date` uses. Always 6 rows, never 5: a grid that
 * changes height as you page through the year makes the whole page jump.
 */
function monthGrid(year, monthIdx) {
  /* Local noon throughout. `new Date(y, m, 1)` is local midnight, and in a
     zone that springs forward at midnight (Brazil, historically) that is
     the day before — localDateStr would then report the wrong first day. */
  const first = new Date(year, monthIdx, 1, 12, 0, 0, 0);
  const dow = first.getDay();                   // 0 = Sunday
  const back = (dow === 0) ? 6 : dow - 1;       // Monday-first
  const cur = new Date(first.getTime());
  cur.setDate(cur.getDate() - back);
  const out = [];
  for (let i = 0; i < 42; i++) {
    out.push(localDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const DAY_TO_JS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/* The fallback when a squad has no configured schedule. Lifted out of
   buildTrainingDrafts in app.js, which now calls scheduleSlots — two copies
   of "what does this team do on a normal week" would drift, and the ghosts
   and the New Training page must agree or a coach sees a placeholder that
   creates a session on a different day. */
const DEFAULT_TRAINING_SLOTS = [
  { jsDay: 2, time: '21:00', endTime: '', location: '', link: '' },
  { jsDay: 4, time: '22:00', endTime: '', location: '', link: '' }
];

/**
 * One squad's weekly training slots, sorted by weekday then start.
 *
 * `clubConfig.schedules` is keyed "{category}-{letter}", the same key as
 * fcfLinks and clubs/{id}/rosters/{key}. A row with no recognised day is
 * dropped rather than defaulted: a half-filled row in Config Club means the
 * lead has not finished, not that they meant Sunday.
 */
function scheduleSlots(clubConfig, cat, letter) {
  const sched = (clubConfig && clubConfig.schedules)
    ? clubConfig.schedules[cat + '-' + letter] : null;
  const slots = [];
  if (sched && Array.isArray(sched.training)) {
    sched.training.forEach(function (tr) {
      if (!tr || !tr.day || DAY_TO_JS[tr.day] === undefined) return;
      slots.push({
        jsDay: DAY_TO_JS[tr.day],
        time: tr.time || '',
        endTime: tr.endTime || '',
        location: tr.location || '',
        link: tr.link || ''
      });
    });
  }
  // Fresh copies: a caller that edits a slot must not rewrite the constant
  // for every other squad in the club for the rest of the session.
  if (!slots.length) {
    DEFAULT_TRAINING_SLOTS.forEach(function (s) { slots.push(Object.assign({}, s)); });
  }
  slots.sort(function (a, b) {
    return (a.jsDay - b.jsDay) || String(a.time).localeCompare(String(b.time));
  });
  return slots;
}

/**
 * Which of a day's slots are still free, given the sessions really there.
 *
 * Greedy nearest-time matching rather than exact-time equality. A coach who
 * moves Tuesday's session from 21:00 to 20:00 has USED Tuesday's slot — on
 * an equality test the ghost would sit next to the real session offering to
 * create a second one. Counting alone is not enough either: a club that
 * trains morning AND evening must keep the evening placeholder after the
 * morning session is scheduled, and the nearest-time match is what decides
 * which of the two was consumed.
 *
 * Both arrays are `{time}`-bearing; returns the unconsumed slots.
 */
function freeSlots(slots, taken) {
  const left = (slots || []).slice();
  (taken || []).slice()
    .sort(function (a, b) { return String(a.time || '').localeCompare(String(b.time || '')); })
    .forEach(function (real) {
      if (!left.length) return;
      const t = hhmmMins(real.time);
      let best = 0;
      if (t !== null) {
        let bestGap = Infinity;
        left.forEach(function (slot, i) {
          const s = hhmmMins(slot.time);
          // A slot with no time cannot be nearest to anything, but it is
          // still consumable — Infinity keeps it last rather than first.
          const gap = (s === null) ? Infinity : Math.abs(s - t);
          if (gap < bestGap) { bestGap = gap; best = i; }
        });
      }
      left.splice(best, 1);
    });
  return left;
}

/** 'HH:MM' → minutes since midnight, or null. Tolerates 'HH:MM - HH:MM',
    the shape legacy fa_training rows still carry in `time`. */
function hhmmMins(v) {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(v || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * The greyed placeholder trainings for a date window.
 *
 * Nothing is stored. A ghost is a slot in `clubConfig.schedules` that no
 * real session occupies, and it exists only for as long as that stays true
 * — which is why deleting a session brings its placeholder back with no
 * code to do it.
 *
 * `squads` is `[{category, letter}]`; `existing` is the fa_training blob
 * (activities included — a squad busy with an activity is not free to
 * train). `todayISO` is inclusive: a slot later today is still schedulable,
 * yesterday's is not.
 */
function ghostSlots(clubConfig, squads, existing, fromISO, toISO, todayISO) {
  const out = [];
  if (!Array.isArray(squads) || !squads.length) return out;

  /* Index the real sessions by squad and date once. The alternative is a
     scan of the whole blob per cell per squad, which on a 6-row grid with
     three squads is 126 passes over a season of sessions. */
  const byKey = {};
  (existing || []).forEach(function (t) {
    if (!t || !t.date) return;
    const cat = t.category || '';
    // teams:[] means "every letter of the category" — see trainingTeams()
    // in app.js. Such a session occupies every squad's slot that day.
    const letters = (Array.isArray(t.teams) && t.teams.length) ? t.teams : ['*'];
    letters.forEach(function (l) {
      const k = cat + '|' + l + '|' + t.date;
      (byKey[k] = byKey[k] || []).push(t);
    });
  });

  const dates = [];
  const cur = new Date(fromISO + 'T12:00:00');
  const end = new Date(toISO + 'T12:00:00');
  while (cur.getTime() <= end.getTime()) {
    dates.push(localDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }

  squads.forEach(function (sq) {
    const slots = scheduleSlots(clubConfig, sq.category, sq.letter);
    dates.forEach(function (date) {
      if (todayISO && date < todayISO) return;
      const jsDay = new Date(date + 'T12:00:00').getDay();
      const daySlots = slots.filter(function (s) { return s.jsDay === jsDay; });
      if (!daySlots.length) return;
      const taken = (byKey[sq.category + '|' + sq.letter + '|' + date] || [])
        .concat(byKey[sq.category + '|*|' + date] || []);
      freeSlots(daySlots, taken).forEach(function (slot) {
        out.push({
          ghost: true,
          // Stable across renders and unique per placeholder, so a click
          // identifies exactly which slot to materialise.
          key: sq.category + '|' + sq.letter + '|' + date + '|' + slot.time,
          date: date,
          time: slot.time,
          endTime: slot.endTime,
          location: slot.location,
          link: slot.link,
          category: sq.category,
          letter: sq.letter
        });
      });
    });
  });
  return out;
}

/**
 * A date's position in the microcycle, relative to the CLOSER of the
 * previous and next fixture.
 *
 * `{sign:'0'}` when a match falls on the date itself, `'-'` counting down to
 * the next one (M-3), `'+'` counting up from the last (M+2), null when the
 * squad has no fixtures either side. A tie goes to the next match: a coach
 * planning Wednesday between two Saturdays cares about the one he is
 * preparing for, not the one he is recovering from.
 *
 * `matchDates` must already be narrowed to the same category and an
 * overlapping squad letter, and must exclude withdrawn fixtures — a
 * juvenil kick-off says nothing about the amateur team's week.
 */
function matchdayOffset(dateISO, matchDates) {
  if (!dateISO || !Array.isArray(matchDates)) return null;
  let prev = null;
  let next = null;
  for (let i = 0; i < matchDates.length; i++) {
    const m = String(matchDates[i] || '');
    if (!m) continue;
    if (m === dateISO) return { sign: '0', n: 0 };
    if (m < dateISO) { if (prev === null || m > prev) prev = m; }
    else if (next === null || m < next) next = m;
  }
  const dPrev = (prev === null) ? null : daysBetweenISO(prev, dateISO);
  const dNext = (next === null) ? null : daysBetweenISO(dateISO, next);
  if (dPrev === null && dNext === null) return null;
  if (dPrev === null) return { sign: '-', n: dNext };
  if (dNext === null) return { sign: '+', n: dPrev };
  return (dNext <= dPrev) ? { sign: '-', n: dNext } : { sign: '+', n: dPrev };
}

/** 'MD' / 'M-3' / 'M+2', or '' when there is nothing to say. */
function matchdayLabel(off) {
  if (!off) return '';
  if (off.sign === '0') return 'MD';
  return 'M' + off.sign + off.n;
}

/* Catalan ordinals are irregular only below five: 1r, 2n, 3r, 4t, then è
   for everything above. `-è` is the masculine form, which is what agrees
   with "lloc" — the word a reader supplies for a league position. */
const CA_ORDINALS = {1: '1r', 2: '2n', 3: '3r', 4: '4t'};
const EN_ORDINALS = {1: 'st', 2: 'nd', 3: 'rd'};

/**
 * A league position as a reader would say it: `4t` / `4º` / `4th`.
 *
 * Returns '' for anything that is not a position, so a card with no
 * standings simply shows nothing rather than "0è" or "undefinedth".
 */
function leaguePosLabel(n, lang) {
  const v = parseInt(n, 10);
  if (!(v > 0)) return '';
  if (lang === 'es') return v + 'º';
  if (lang === 'en') {
    /* 11th, 12th and 13th are the exception every naive version of this
       gets wrong: they end in 1, 2, 3 and still take -th. */
    const teen = v % 100;
    const suffix = (teen >= 11 && teen <= 13) ? 'th' : (EN_ORDINALS[v % 10] || 'th');
    return v + suffix;
  }
  return CA_ORDINALS[v] || (v + 'è');
}

/* ---------- Session load ----------

   `plannedRpe` is a coach's 1-10 estimate of how hard a session is meant to
   be, set when the session is created or edited. It is what the calendar's
   intensity dot reads, and it is the only part of the load picture that
   exists before anybody has trained.

   The bands are the design's: <=4 light, 5-7 moderate, 8+ hard. They are
   meaningful because 1-10 is a scale a coach sets directly — unlike the
   WEEKLY thresholds in the same mock, which were calibrated against
   placeholder arithmetic (`rpe * 12`) and would paint every real week red.
   The gutter prints its AU figure and no dot until real weeks say where
   those lines are. */
const LOAD_LOW = 'low';
const LOAD_MID = 'mid';
const LOAD_HIGH = 'high';

/** '' for anything that is not a usable 1-10 estimate. */
function loadBand(rpe) {
  const v = Number(rpe);
  if (!isFinite(v) || v <= 0) return '';
  if (v <= 4) return LOAD_LOW;
  if (v <= 7) return LOAD_MID;
  return LOAD_HIGH;
}

/**
 * How long a session runs, in minutes.
 *
 * Mirrors sessionWindow() in app.js, including the vestigial
 * "HH:MM - HH:MM" range that old rows still carry in `time`, and the
 * 90-minute last resort. app.js keeps its own copy because it needs the
 * start and end as separate values for the badge arithmetic; this one is
 * the duration alone, which is all the load maths wants.
 * `session-load.test.js` pins the two against one input table.
 */
function sessionMinutesOf(row, fallbackMins) {
  if (!row) return 0;
  const parts = String(row.time || '').split(' - ');
  const start = hhmmMins(parts[0]);
  if (start === null) return 0;
  let end = hhmmMins(row.endTime);
  if (end === null && parts.length > 1) end = hhmmMins(parts[1]);
  if (end === null || end <= start) {
    end = start + (fallbackMins > 0 ? fallbackMins : 90);
  }
  return end - start;
}

/**
 * One session's load in arbitrary units: RPE x minutes.
 *
 * The same arithmetic the readiness engine sums into `weekUA`, so a figure
 * here and a figure there mean the same thing. `rpe` is passed in rather
 * than read off the row: a PAST session should be costed at what players
 * actually reported, an upcoming one at what the coach planned, and only
 * the caller knows which it is holding.
 *
 * null when it cannot be costed — never 0, which would read as "they
 * trained and it was effortless" rather than "nobody has said yet".
 */
function sessionAU(row, rpe) {
  const r = Number(rpe);
  if (!isFinite(r) || r <= 0) return null;
  const mins = sessionMinutesOf(row);
  if (!mins) return null;
  return Math.round(r * mins);
}

/**
 * A week's load, as one number per player.
 *
 * Per player, not summed across the squad: a squad total moves when someone
 * is injured, so two identical weeks would read differently and the figure
 * could not be compared with itself a month later.
 *
 * `rpeFor(row)` hands back the RPE to cost each row at, or null. Rows it
 * cannot cost are counted in `unknown` and left out of the total, so the
 * caller can say "1 840 AU, 2 sessions unrated" instead of quietly
 * under-reporting a week.
 */
function weekAU(rows, rpeFor) {
  let au = 0;
  let counted = 0;
  let unknown = 0;
  (rows || []).forEach(function (row) {
    const v = sessionAU(row, rpeFor ? rpeFor(row) : null);
    if (v === null) { unknown++; return; }
    au += v;
    counted++;
  });
  return { au: au, counted: counted, unknown: unknown };
}

/* ---------- ISO weeks ----------

   The gutter is labelled WEEK 42, which is the ISO 8601 week — not "the
   42nd row of this grid". They differ, and the one a coach says out loud
   is the ISO one, because it is what the federation's calendar uses. */

/** The Monday of `dateISO`'s week, as an ISO date. */
function mondayOf(dateISO) {
  const d = new Date(dateISO + 'T12:00:00');
  const dow = d.getDay();                    // 0 = Sunday
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return localDateStr(d);
}

/**
 * The ISO 8601 week number, and the year it belongs to.
 *
 * The year matters and is not always the date's own: 1 January 2027 is a
 * Friday, so 28-31 December 2026 are week 53 OF 2026 while 1-3 January
 * 2027 are also week 53 of 2026. Returning the date's calendar year would
 * label those three days "week 53 of 2027", which does not exist.
 */
function isoWeek(dateISO) {
  // Thursday of this week decides the year — the ISO rule, and the reason
  // this is not simply "days since 1 January divided by seven".
  const d = new Date(dateISO + 'T12:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + 3);
  const year = d.getFullYear();
  const jan4 = new Date(year, 0, 4, 12, 0, 0, 0);
  const jan4Dow = jan4.getDay();
  const week1Mon = new Date(jan4.getTime());
  week1Mon.setDate(jan4.getDate() - (jan4Dow === 0 ? 6 : jan4Dow - 1));
  const week = Math.round((d.getTime() - week1Mon.getTime()) / (7 * 86400000)) + 1;
  return { week: week, year: year };
}

/** Split a flat run of dates into rows of seven. */
function chunkWeeks(dates) {
  const out = [];
  for (let i = 0; i < (dates || []).length; i += 7) out.push(dates.slice(i, i + 7));
  return out;
}

/* ---------- Activities ----------

   An activity — a team meal, a gym block, a club event — is a fa_training
   row with `kind:'activity'` and a `title` where a session has a `focus`.

   It rides the training blob deliberately: the shard route, the Firestore
   rule, the availability records, the call-up UI and the T-4h reminder all
   already work on that key, so an activity gets every one of them without a
   new collection, a new rule or a new push path.

   An ABSENT `kind` is a training. That is what lets every row written
   before this existed keep working with no backfill. */
const TRAINING_KIND = 'training';
const ACTIVITY_KIND = 'activity';

function isActivity(row) {
  return !!row && row.kind === ACTIVITY_KIND;
}

/** The bold line on the card: an activity's title, or a session's focus. */
function activityTitleOf(row, fallback) {
  if (!row) return fallback || '';
  const s = String((isActivity(row) ? row.title : row.focus) || '').trim();
  return s || fallback || '';
}

/* ---------- Link safety ----------

   A URL we are willing to hand to window.open(), or ''.

   This is NOT what sanitize() does, and the difference is the whole point.
   sanitize() escapes < > & " so a string cannot break out of the attribute
   it is written into — an HTML problem. It leaves `javascript:fetch(…)`
   completely untouched, because there is nothing in it to escape, and
   `dataset.*` decodes the escaping back to the original string anyway.

   window.open() on a `javascript:` or `data:` URL does not navigate: it
   opens a window and RUNS the code, on our own origin, in the viewer's
   signed-in session. Only staff can enter a video link, so the exposure is a
   stored value shared BETWEEN staff — which is exactly the case worth
   closing, since one account then reaches what another can do.

   Allowlist, not a blocklist: `javascript:` and `data:` are the two everyone
   remembers, and there is no reason a match video is ever anything but
   http(s). */
function safeHttpUrl(u) {
  const s = String(u === undefined || u === null ? '' : u).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/* ---------- FCF (Federació Catalana de Futbol) ----------

   fcf.cat was rebuilt as a Next.js app in August 2026. The old
   `https://www.fcf.cat/classificacio/{season}/{discipline}/{division}/{group}`
   pages 307 to `/ca/classificacio/…` and then 404, and the page that replaced
   them ships NO server-rendered table — the standings arrive from
   `/api/competition/classificacio?grupId=…` after hydration. So the old
   scrape had two independent deaths: a dead URL and, had it resolved, an
   empty document.

   Every link a club lead saved before that date is unrecoverable. The new
   slug does not encode the old one and vice versa, and the old slug names
   LAST season anyway, so there is no migration to write: the lead re-pastes.

   What we consume now is the JSON, which is better in every way — stable
   `teamId`s, badge filenames, and last-5 form all arrive in the same payload
   the standings table needs. */

/* The `grupId` of a pasted FCF link, as a digit string, or ''.

   Deliberately tolerant about the SHAPE of what is pasted and strict about
   what it returns: leads paste the whole address bar, sometimes with a
   trailing `&tab=classificacio`, sometimes the bare number from a colleague.
   Anything that does not yield digits — an old-format link above all —
   returns '' rather than throwing, because '' is what the config UI keys its
   "this link is out of date" warning off. */
function fcfGrupId(url) {
  const s = String(url === undefined || url === null ? '' : url).trim();
  if (/^\d{1,15}$/.test(s)) return s;                 // pasted the bare id
  const m = /[?&]grupId=(\d{1,15})\b/.exec(s);
  return m ? m[1] : '';
}

const FCF_BADGE_BASE = 'https://files.fcf.cat/escudos/clubes/escudos/';

/**
 * The rows of `/api/competition/classificacio?grupId=…`, in the shape both
 * league renderers in app.js already consume, plus `teamId`/`rawName` for the
 * opponent picker.
 *
 * ⚠ `played`, `won`, `drawn` and `lost` are NOT numbers. FCF concatenates the
 * home and away halves as strings: `played:"1515"` is 15 + 15 = 30,
 * `won:"139"` is 13 + 9 = 22, `drawn:"05"` is 0 + 5 = 5. Their own site
 * renders them raw, so fcf.cat displays "1515" too — this is not a decoding
 * we are missing, it is their bug, and it will not be fixed for us. The split
 * cannot be recovered in general either: "139" is 13|9 or 1|39 with nothing
 * in the payload to choose between them.
 *
 * `coefficient` is points-per-game, and points is clean, so matches played
 * comes back exactly as points / coefficient — verified against 258 rows
 * across five divisions, every one landing on an integer. That is why J is
 * derived and the field literally called `played` is ignored.
 */
function parseFcfClassificacio(json, clubName) {
  const data = (json && json.data) || [];
  // Only "is the club named at all" — the comparison itself is sameClubName
  // below, which knows about the federation's leading article.
  const ours = !!normTeamName(clubName || '');
  return data.map(function (r, i) {
    const team = r.team || {};
    const pts = parseFloat(r.points) || 0;
    const coef = parseFloat(r.coefficient) || 0;
    const logo = team.logo || '';
    return {
      /* Pre-season FCF sends position:"0" for every team and orders the
         array by teamId. Falling back to the index keeps the column
         readable instead of printing a column of zeros. */
      pos: parseInt(r.position, 10) || (i + 1),
      club: String(team.name || '').trim(),
      rawName: String(team.name || '').trim(),
      teamId: String(team.teamId || ''),
      pts: Math.round(pts),
      j: coef > 0 ? Math.round(pts / coef) : 0,
      f: parseInt(r.goalsFor, 10) || 0,
      c: parseInt(r.goalsAgainst, 10) || 0,
      badge: (!logo || logo.indexOf('escutbase') !== -1) ? '' : FCF_BADGE_BASE + logo,
      /* The last five, from THIS team's point of view. Parking-lot item 26,
         and it needed no new request: the array was in this payload the
         whole time (see the section note above) and was simply dropped. */
      form: parseFcfForm(r.form),
      /* The promotion/relegation stripe. `promociones` came back empty for
         every group sampled after the rebuild, so there is nothing to colour
         — but the field and both renderers' `r.zone` branches stay, so it
         lights up again the day FCF starts populating it. */
      zone: '',
      /* Not the old substring test: "Gràcia" is contained in "Gràcia
         Atlètic", and the old needle highlighted whichever came first.
         sameClubName rather than bare equality because the federation writes
         the leading article a club usually drops from its own name — without
         it, L'Esquerra de l'Eixample's own row is the one row in the table
         that never gets highlighted. */
      ours: ours && sameClubName(team.name, clubName)
    };
  });
}

/* The federation's letters for a result, from the row team's point of view:
   Guanyat, Empatat, Perdut. Mapped to machine tokens rather than kept as
   Catalan, because the strip that draws them is translated and `P` would be
   the letter for a WIN in English. */
const FCF_RESULT = {G: 'W', E: 'D', P: 'L'};

/**
 * A team's recent results, most recent first — the `form` array that has
 * been arriving in the classificacio payload all along (see the note at the
 * head of this section) and that nothing parsed until v214.
 *
 * → [{res: 'W'|'D'|'L', date: 'YYYY-MM-DD', label: 'A 1–0 B'}]
 *
 * ⚠ EMPTY IS A REAL ANSWER, not a failure. Pre-season every row carries
 * `form: []`, because no match has been played — verified against
 * test/fixtures/fcf-preseason.json, where all sixteen are empty, and
 * against fcf-finished.json, where all sixteen have exactly five. The
 * caller must hide the strip rather than draw five blank squares: a feed
 * that is not there and a season that has not started must not look alike.
 *
 * An unrecognised letter is DROPPED rather than defaulted. Defaulting it to
 * a draw would invent a result, and the federation inventing a sixth letter
 * should cost us a square, not put a wrong one on a coach's screen.
 */
function parseFcfForm(form) {
  if (!Array.isArray(form)) return [];
  return form.map(function (f) {
    const res = FCF_RESULT[String((f && f.result) || '').toUpperCase()];
    if (!res) return null;
    const h = (f && f.home) || {};
    const a = (f && f.away) || {};
    return {
      res: res,
      date: String((f && f.date) || '').slice(0, 10),
      /* For the hover title. Per-MATCH goals, so the concatenation bug that
         ruins `played`/`won`/`drawn`/`lost` does not apply: there are no two
         halves to glue together. */
      label: String(h.name || '').trim() + ' ' + String(h.goals || '0') +
        '–' + String(a.goals || '0') + ' ' + String(a.name || '').trim()
    };
  }).filter(Boolean);
}

/** An absolute crest URL from FCF's filename, or ''. */
function fcfBadgeOf(logo) {
  const s = String(logo || '');
  return (!s || s.indexOf('escutbase') !== -1) ? '' : FCF_BADGE_BASE + s;
}

/* ── Sancions and top scorers ─────────────────────────────────
 *
 * These live HERE, in js/utils.js, and not in functions/fcf.js — which is
 * where they were first written, and where the browser cannot see them. The
 * two tabs call them directly from js/app.js; nothing on the server parses a
 * sanction or a scorer at all. Putting them the wrong side of that boundary
 * cost a release: every request succeeded, the parser threw ReferenceError,
 * and the catch reported it to the user as "could not load".
 *
 * ── Sancions ─────────────────────────────────────────────────
 *
 * `/api/competition/sanciones?grupId=&temporada=` returns an object keyed by
 * jornada. Each row is one ruling.
 *
 * ⚠ `licencia` is a Spanish DNI/NIE — "41566132A" — for players who in most
 * of this app's categories are MINORS. It is dropped HERE, at the parse
 * boundary, and never reaches a caller: a field that is merely "not
 * rendered" is one careless console.log or one JSON.stringify away from
 * being stored, and there is no use for it anywhere in this product.
 * `codparticipante` is the federation's own opaque id and is kept instead.
 */
function parseFcfSanctions(json) {
  const out = [];
  Object.keys(json && typeof json === "object" ? json : {}).forEach((jornada) => {
    const list = Array.isArray(json[jornada]) ? json[jornada] : [];
    list.forEach((r) => {
      const isTeam = String(r.tipo || "") === "equipo";
      const matches = parseInt(r.partidos_sancion, 10) || 0;
      out.push({
        jornada: parseInt(r.jornada, 10) || parseInt(jornada, 10) || 0,
        /* A ruling against the CLUB — a fine, a closed ground, a match
           ordered to resume. Carried, because a coach wants to see it, but
           flagged: listing one as a missing player is simply wrong, and the
           42 of them in a single season's group all have matches === 0. */
        isTeam: isTeam,
        player: isTeam ? "" : String(r.participante_nombre || "").trim(),
        playerId: isTeam ? "" : String(r.codparticipante || ""),
        teamId: String(r.codequipo || ""),
        teamName: String(r.nombre_equipo || "").trim(),
        badge: fcfBadgeOf(r.escudo),
        matches: matches,
        reason: String(r.motivo_sancion || "").trim(),
        article: String(r.articulo_salida || ""),
      });
    });
  });
  out.sort((a, b) => b.jornada - a.jornada);
  return out;
}

/**
 * Does this ruling keep the player out of jornada `j`?
 *
 * A ban handed down at jornada N for P matches covers N+1 … N+P — the round
 * it was issued in is the one he was sent off in, not one he misses. A team
 * ruling and a zero-match ruling keep nobody out of anything.
 */
function banCoversJornada(row, j) {
  const target = parseInt(j, 10);
  if (!row || row.isTeam || !row.matches || !isFinite(target)) return false;
  return target > row.jornada && target <= row.jornada + row.matches;
}

/** Every ruling that keeps someone out of jornada `j`, for one team or all. */
function bansForJornada(rows, jornada, teamId) {
  const want = String(teamId || "");
  return (rows || []).filter((r) =>
    banCoversJornada(r, jornada) && (!want || String(r.teamId) === want));
}

/* ── Top scorers ──────────────────────────────────────────────
 *
 * ⚠ Same DNI, same treatment: `licencia` is dropped here.
 *
 * ⚠ `goles` is NOT a goal count. It is the home and away tallies
 * concatenated as strings, exactly like `played:"1515"` in the standings —
 * Empuriabrava's five listed scorers sum to 157 for a team that scored 106
 * all season, and six of eight teams in that group fail the same check. The
 * OWNER'S DECISION is to publish what the federation publishes, so the raw
 * value is what comes out of here and `FCF_SCORERS_RAW` is the one line to
 * flip if the table ever looks wrong in use. `total` is matches played —
 * FCF's own frontend names it `matchesPlayed`.
 */
var FCF_SCORERS_RAW = true;

function parseFcfScorers(json) {
  const rows = (Array.isArray(json) ? json : []).map((r, i) => ({
    rank: i + 1,
    player: String(r.nombre_jugador || "").trim(),
    playerId: String(r.codjugador || ""),
    teamId: String(r.codequipo || ""),
    teamName: String(r.nombre_equipo || "").trim(),
    badge: fcfBadgeOf(r.escudo),
    goals: FCF_SCORERS_RAW ? (parseInt(r.goles, 10) || 0) : splitFcfTally(r.goles),
    penalties: FCF_SCORERS_RAW ?
      (parseInt(r.penalti, 10) || 0) : splitFcfTally(r.penalti),
    played: parseInt(r.total, 10) || 0,
  }));
  return rows;
}

/** The home|away split, for the day the raw figure is abandoned. */
function splitFcfTally(v) {
  const s = String(v == null ? "" : v);
  if (!/^\d+$/.test(s)) return 0;
  if (s.length === 1) return parseInt(s, 10);
  return Math.min(...Array.from({length: s.length - 1}, (_, i) =>
    parseInt(s.slice(0, i + 1), 10) + parseInt(s.slice(i + 1), 10)));
}

/* ---------- Match legs (anada / tornada) ----------

   Nothing on a match row says "this is the return fixture": there is no
   competition, no round, no leg field, and no fixture import to supply one —
   `fcfLinks` is a standings URL per squad and nothing more. The pairing is
   therefore DERIVED (same rival, venue swapped, earlier date, same season)
   and then confirmed by a human, because a friendly and a league game against
   the same club satisfy that rule equally well.

   Pure and dependency-free so test/match-legs.test.js can require this file
   directly, the way shard.test.js requires js/shard.js. */

/* Rival names are typed by hand into the Calendari, so the same club arrives
   as "C.F. Gràcia", "CF Gracia" and "Gràcia F.C." across one season. Strip the
   parts that carry no identity — accents, punctuation, and the legal-form
   prefixes every Catalan club shares — and compare what is left.

   Deliberately NOT an edit-distance match: two different clubs from the same
   town ("Gràcia" and "Gràcia Atlètic") are a few characters apart and must
   never collapse into each other. "Atlètic" is deliberately NOT on the list
   for exactly that reason — a parent club and its feeder often differ by that
   one word, and stripping it would merge them. */
const TEAM_NAME_NOISE = /\b(c\s*f|f\s*c|u\s*e|c\s*e|a\s*e|c\s*d|u\s*d|s\s*d|club|futbol|football|esportiu|esportiva|unio|union|associacio|asociacion|societat|sociedad|deportivo|deportiva)\b/g;

/* U+0300–U+036F, the combining diacritical marks that NFD splits off.
   Built from char codes rather than written as a literal character class:
   the characters themselves are invisible in an editor and would silently
   vanish if this file were ever normalised back to NFC. */
const COMBINING_MARKS = new RegExp(
  '[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

function normTeamName(s) {
  const raw = String(s || '').toLowerCase()
    .normalize('NFD').replace(COMBINING_MARKS, '');   // Gracia, from Gràcia
  const bare = raw.replace(/[^a-z0-9]/g, '');
  const stripped = raw
    .replace(/[.\-_]/g, ' ')          // "C.F." → "c f ", so the noise list matches
    .replace(TEAM_NAME_NOISE, ' ')
    .replace(/[^a-z0-9]/g, '');
  /* A name that is NOTHING BUT noise ("C.F.", "U.E.") keeps its letters: an
     empty string here would make every such rival equal to every other one. */
  return stripped || bare;
}

/* ── Referees ──────────────────────────────────────────────────────────
 *
 * A referee's key, and the figures the match page shows for him.
 *
 * fcfRefereeSlug is a DUPLICATE of the copy in functions/fcf.js, and has to
 * be: the functions deploy uploads functions/ alone, so js/ does not exist
 * there and a require would resolve on the dev machine and fail in
 * production. test/fcf-acta.test.js runs one input table through BOTH copies
 * and asserts they agree — the crawler keys profile documents with its copy
 * and the app looks them up with this one, so a disagreement means every
 * referee silently has no record.
 */
function fcfRefereeSlug(name) {
  return String(name === undefined || name === null ? '' : name)
    .toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* Below this many matches in a division, the percentages are suppressed.
   Six is not a statistical threshold, it is an honesty one: a referee three
   games into a tier has a "100% home wins" that means nothing, and a delegate
   reading it before a match would be worse informed than if we had shown him
   nothing. The counts are still shown — those are facts. */
const REF_MIN_SAMPLE = 6;

/**
 * What to show about a referee FOR ONE DIVISION, or null if there is nothing.
 *
 * Only the division the team plays in, deliberately. A referee's Quarta record
 * says nothing useful about how he handles a Segona match, and a blended
 * career average mixes the two without saying so.
 *
 * `thin` is true when the sample is too small to draw a percentage from;
 * `pct` is null in that case rather than a number the caller might render
 * anyway.
 */
function refereeDivisionStats(profile, division, minSample) {
  const min = minSample === undefined ? REF_MIN_SAMPLE : minSample;
  const d = ((profile || {}).byDivision || {})[division];
  if (!d || !d.matches) return null;
  const n = d.matches;
  const thin = n < min;
  const pct = thin ? null : {
    H: Math.round((d.H || 0) * 100 / n),
    D: Math.round((d.D || 0) * 100 / n),
    A: Math.round((d.A || 0) * 100 / n)
  };
  /* What the sendings-off were FOR, most frequent first. Counts only, never
     a rate: the federation records an offence solely when it produced a
     suspension, so a referee who books dissent and stops there leaves no
     trace. "3 for dissent" is a fact; "30% of his cards are dissent" would
     be arithmetic over a denominator that does not exist. */
  const offences = Object.keys(d.off || {})
    .filter(function (k) { return d.off[k] > 0; })
    .map(function (k) { return {key: k, n: d.off[k]}; })
    .sort(function (a, b) { return b.n - a.n || a.key.localeCompare(b.key); });

  return {
    name: (profile || {}).name || '',
    division: division,
    matches: n,
    H: d.H || 0, D: d.D || 0, A: d.A || 0,
    reds: d.reds || 0, doubles: d.doubles || 0,
    perMatch: Math.round(((d.reds || 0) + (d.doubles || 0)) * 100 / n) / 100,
    offences: offences,
    thin: thin,
    pct: pct
  };
}

/**
 * Our result, from the federation's home-side view of it.
 *
 * The index stores `res` as "H"/"D"/"A" — who won, not whether we did — so
 * turning it into W/D/L needs to know which side we were. Taken from the
 * stored fixture rather than from a coach-entered score: the score is only
 * as complete as the events somebody remembered to enter, while `res` came
 * off the federation's own closed match sheet.
 */
function ourResultFrom(res, weWereHome) {
  if (res !== 'H' && res !== 'D' && res !== 'A') return '';
  if (res === 'D') return 'D';
  return (res === 'H') === !!weWereHome ? 'W' : 'L';
}

/**
 * Our own past fixtures that THIS referee took, newest first.
 *
 * The question a delegate actually asks — "have we had him before, and how
 * did it go?" — and it needs no extra data: the club's fixtures already carry
 * `fcfActaId`, and the group index already maps acta → officials. This is the
 * join, and nothing more.
 *
 * Only PLAYED matches (`c`), and only where he was the referee rather than an
 * assistant, for the same reason the profiles are built that way.
 *
 * `isOurTeam` is passed in rather than reached for: this file is pure, and
 * the app's own version compares against the configured club name.
 */
function refereeHistoryWithUs(matches, actas, refereeName, isOurTeam) {
  const want = fcfRefereeSlug(refereeName);
  if (!want || !actas) return [];
  const mine = typeof isOurTeam === 'function' ? isOurTeam : function () { return false; };
  const out = [];
  (Array.isArray(matches) ? matches : []).forEach(function (m) {
    if (!m || !m.fcfActaId) return;
    const e = actas[String(m.fcfActaId)];
    if (!e || !e.c) return;
    if (fcfRefereeSlug((e.r || [])[0]) !== want) return;
    const weWereHome = mine(m.home);
    /* The scoreline OUR way round, from the federation's home/away goals.
       `!= null` on purpose — a 0-0 is a real result, and `if (e.gh)` would
       silently drop every goalless draw. */
    const haveGoals = e.gh !== undefined && e.gh !== null &&
      e.ga !== undefined && e.ga !== null;
    out.push({
      matchId: m.id,
      date: m.date || e.d || '',
      weWereHome: weWereHome,
      opponent: weWereHome ? (m.away || '') : (m.home || ''),
      outcome: ourResultFrom(e.res, weWereHome),
      ourGoals: haveGoals ? (weWereHome ? e.gh : e.ga) : null,
      theirGoals: haveGoals ? (weWereHome ? e.ga : e.gh) : null,
      score: haveGoals ?
        (weWereHome ? e.gh : e.ga) + '-' + (weWereHome ? e.ga : e.gh) : ''
    });
  });
  out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  return out;
}

/** W/D/L counts of a history list, for the one-line summary above it. */
function refereeHistoryTally(rows) {
  const t = {W: 0, D: 0, L: 0, played: 0};
  (rows || []).forEach(function (r) {
    t.played++;
    if (r && (r.outcome === 'W' || r.outcome === 'D' || r.outcome === 'L')) t[r.outcome]++;
  });
  return t;
}

/* The leading article, which the federation writes and clubs usually do not.
   "L'ESQUERRA DE L'EIXAMPLE, F.C." on fcf.cat is "Esquerra de l'Eixample
   F.C." in its own app; "EL PRAT" is "Prat"; "LA JONQUERA" is "Jonquera".
   normTeamName keeps the l/el/la, so the two spellings do not match.

   Stripping it inside normTeamName was the obvious fix and is the wrong one:
   it would silently merge "La Jonquera" with a different club called
   "Jonquera" for every fixture in the app, for ever, to solve a problem that
   only exists in ONE place. So it stays a separate, narrower comparison —
   see sameClubName.

   Applied to the RAW name, before normalising, because that is where the
   SEPARATOR still exists. Stripping "l" off the normalised "lleida" leaves
   "leida"; stripping it off the raw "lleida" cannot happen, because there is
   no apostrophe or space after it. The article is only an article when
   something separates it from the name. */
var LEADING_ARTICLE = /^\s*(l\s*['’]\s*|el\s+|la\s+|els\s+|les\s+)/;

/**
 * Are these two strings the same club, allowing for the federation's
 * leading article?
 *
 * ONLY for identifying OURSELVES inside a group we have already been told we
 * are in — sixteen teams, one of which is us, and the club's own name came
 * from its own configuration. A false positive there is close to impossible.
 *
 * NOT a replacement for normTeamName in findFirstLeg: pairing two fixtures is
 * a question about two clubs that are both strangers to the app, and there
 * the extra leniency buys a wrong answer rather than a right one.
 */
function sameClubName(a, b) {
  const x = normTeamName(a);
  const y = normTeamName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const bare = (s) => normTeamName(
      String(s || '').toLowerCase().replace(LEADING_ARTICLE, ''));
  const bx = bare(a);
  const by = bare(b);
  return !!bx && bx === by;
}

/* Mirrors isOurTeam() in app.js — EXACT equality on the club name, not the
   normalised form. Being lenient would let this helper and the match
   scoreboard disagree about which side is ours on the same screen. A club that
   renames mid-season therefore loses the suggestion (opponentOf returns the
   old club name and nothing pairs) rather than getting a wrong one, which is
   the right way round to fail. */
function ourSideOf(m, clubName) {
  return (m && m.home === clubName) ? 'home' : 'away';
}

function opponentOf(m, clubName) {
  if (!m) return '';
  return ourSideOf(m, clubName) === 'home' ? (m.away || '') : (m.home || '');
}

/**
 * The first leg of `candidate` within the same season, or null.
 *
 * Returns the MOST RECENT qualifying earlier match: a club met three times in
 * a season (league double plus a cup tie) should pair with the game just
 * played, not the one from September.
 *
 * `seasonStart` is a parameter only so the tests can pin a season without
 * reaching into the module-level boundary; callers omit it.
 */
function findFirstLeg(candidate, allMatches, clubName, seasonStart) {
  if (!candidate || !candidate.date) return null;
  const start = seasonStart || seasonStartStr();
  const rival = normTeamName(opponentOf(candidate, clubName));
  if (!rival) return null;
  const side = ourSideOf(candidate, clubName);
  const cid = String(candidate.id);
  /* Fixtures whose rival was picked from the FCF group carry the
     federation's own team id. When BOTH sides of a pairing have one, that id
     answers the question outright and normTeamName never runs: two squads of
     the same club, or two clubs whose names normalise together, stop being
     ambiguous. Everything else — every fixture created before the picker
     shipped, every friendly, every club with no FCF link — still pairs by
     name, which is why normTeamName stays. */
  const cRival = String(candidate.opponentTeamId || '');

  return (allMatches || []).filter(function (m) {
    if (!m || !m.date || String(m.id) === cid) return false;
    // amateur-A and amateur-B play different leagues against different clubs.
    if ((m.category || '') !== (candidate.category || '')) return false;
    if ((m.team || '') !== (candidate.team || '')) return false;
    if (m.date >= candidate.date) return false;         // strictly earlier
    if (m.date < start) return false;                   // this season only
    if (ourSideOf(m, clubName) === side) return false;  // venue must be swapped
    const mRival = String(m.opponentTeamId || '');
    if (cRival && mRival) return mRival === cRival;
    return normTeamName(opponentOf(m, clubName)) === rival;
  }).sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  })[0] || null;
}

// ---------- Category & Position Constants ----------
const CATEGORY_LABELS = {
  amateur: 'Amateur', juvenil: 'Juvenil', cadet: 'Cadet',
  infantil: 'Infantil', alevi: 'Aleví', benjami: 'Benjamí'
};
const CATEGORY_ORDER = ['amateur', 'juvenil', 'cadet', 'infantil', 'alevi', 'benjami'];

/* The one-letter marker beside a player's name when a list mixes categories.
   AMATEUR IS DELIBERATELY '' — it is the senior category, so "no badge" is
   DATA here rather than a special case in twelve renderers.
   Every CATEGORY_ORDER key must have an entry; a missing one would silently
   drop the badge for a whole category, which cat-badge.test.js asserts. */
const CATEGORY_INITIALS = {
  amateur: '', juvenil: 'J', cadet: 'C',
  infantil: 'I', alevi: 'A', benjami: 'B'
};

/* Does the list ON SCREEN span more than one category?
   Computed from the RENDERED ARRAY, never from getVisibleCategories(): a lead
   of a two-category club who has filtered to juvenil is looking at a
   one-category list and must see no badges, and getVisibleCategories() would
   say 2. Rows with no category at all (staff, legacy members) are ignored
   rather than counted as a category of their own — counting them would badge
   an entirely amateur list because one row was uncategorised. */
function catSpanOf(rows) {
  const seen = new Set();
  (rows || []).forEach(function (r) { if (r && r.category) seen.add(r.category); });
  return seen.size > 1;
}

/* Grey, bold, italic, and deliberately NOT in a circle, pill or box:
   .conv-team-circle IS a circle and means a TEAM, so a bordered category
   letter would be a second thing that looks like the first. A circled letter
   is always a team; a bare italic one is always a category.
   The letter comes from a fixed map, never from user input, so this needs no
   sanitize() — which is also what keeps it require()-able without a DOM. */
function catBadgeHtmlGlobal(p, span) {
  if (!span) return '';
  const ch = CATEGORY_INITIALS[(p && p.category) || ''] || '';
  return ch ? '<span class="cat-badge">' + ch + '</span>' : '';
}

const POS_COLORS = {
  GK: '#f9a825', CB: '#1e88e5', LB: '#1e88e5', RB: '#1e88e5',
  DM: '#43a047', OM: '#43a047', LW: '#e53935', RW: '#e53935', ST: '#e53935'
};
const POS_ORDER = ['GK','CB','LB','RB','DM','OM','LW','RW','ST'];

function posRankGlobal(p) {
  const positions = (p.position || '').split(',').map(s => s.trim()).filter(Boolean);
  return positions.reduce((min, pos) => Math.min(min, POS_ORDER.indexOf(pos) === -1 ? 99 : POS_ORDER.indexOf(pos)), 99);
}
function posCirclesHtmlGlobal(p) {
  const positions = (p.position || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!positions.length) return '<span class="conv-pos-circle" style="background:#9e9e9e">—</span>';
  return positions.map(pos => {
    const bg = POS_COLORS[pos] || '#9e9e9e';
    return `<span class="conv-pos-circle" style="background:${bg}">${sanitize(pos)}</span>`;
  }).join('');
}

/**
 * A person's face, or their initial when there is no photo (v231).
 *
 * ⚠ THE FALLBACK IS LOAD-BEARING, not a nicety. `js/db.js`'s users→`fa_users`
 * reconcile only ADDS members it has never seen and never refreshes a row it
 * already has, so a team-mate's photo reaches this device only once THEY next
 * sign in and their own client writes their row back into the synced blob.
 * Rows with an empty `profilePic` are the normal case, not an error.
 *
 * ⚠ `profilePic` is an OPAQUE src string. It is normally a Firebase Storage
 * download URL, but a failed upload falls back to a `data:` URI, so nothing
 * here may assume `http`. It is sanitized because it lands in an attribute —
 * three of the five hand-rolled copies this replaces did not do that.
 *
 * Geometry lives on `cls`, the fill on `cls + '-ph'`, which is the two-class
 * idiom `.player-overview-pic` / `.player-overview-pic-placeholder` already
 * uses: one size definition, and the placeholder cannot drift from the photo.
 *
 * @param {{name?:string, profilePic?:string}} u
 * @param {string} cls Base class; the placeholder gets `${cls}-ph` as well.
 */
function avatarHtmlGlobal(u, cls) {
  const base = sanitize(cls || 'avatar');
  const pic = (u && u.profilePic) || '';
  if (pic) {
    /* onerror rather than a URL check: a Storage token can expire and a
       data: URI can be truncated, and a broken image icon in a table reads
       as a fault in the app. Hiding it leaves the row clean. */
    return '<img class="' + base + '" src="' + sanitize(pic) + '" alt="" ' +
      'onerror="this.style.display=&quot;none&quot;">';
  }
  // One letter, which is what every existing call site in this app uses.
  const initial = sanitize(String((u && u.name) || '').trim()).charAt(0).toUpperCase();
  return '<span class="' + base + ' ' + base + '-ph">' + (initial || '?') + '</span>';
}

// ---------- Color Utilities ----------
function lightenHex(hex, amt) {
  hex = hex.replace('#','');
  let r = Math.min(255, parseInt(hex.substr(0,2),16) + amt);
  let g = Math.min(255, parseInt(hex.substr(2,2),16) + amt);
  let b = Math.min(255, parseInt(hex.substr(4,2),16) + amt);
  return '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('');
}
function darkenHex(hex, amt) {
  hex = hex.replace('#','');
  let r = Math.max(0, parseInt(hex.substr(0,2),16) - amt);
  let g = Math.max(0, parseInt(hex.substr(2,2),16) - amt);
  let b = Math.max(0, parseInt(hex.substr(4,2),16) - amt);
  return '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('');
}
function hexToRgba(hex, a) {
  const ri = parseInt(hex.slice(1,3),16), gi = parseInt(hex.slice(3,5),16), bi = parseInt(hex.slice(5,7),16);
  return 'rgba('+ri+','+gi+','+bi+','+a+')';
}
function textColorFor(hex) {
  hex = hex.replace('#','');
  const r = parseInt(hex.substr(0,2),16), g = parseInt(hex.substr(2,2),16), b = parseInt(hex.substr(4,2),16);
  return (r*299 + g*587 + b*114) / 1000 > 150 ? '#222' : '#fff';
}

/* ── Circle fills: a flat colour, or a striped kit ───────────────
   A player marker used to be one hex string, held in a dozen places —
   fa_tactic_colors / fa_tactic_opp_colors (arrays, per animation frame),
   every frames[i].colors, buildBoardEntry's colors/oppColors, the undo
   snapshots, copy/paste, and the read-only renderer's buildCircles().

   A striped fill is therefore encoded as a STRING and stored in those same
   slots, so none of them had to learn a new shape:

       s|<v|h>|<n>|<c1>|<c2>        e.g.  s|v|4|#e53935|#ffffff

   Not JSON, and that is not a style choice: circle colours are interpolated
   raw into DOUBLE-QUOTED html attributes in three places (data-color= in the
   editor's markup for both teams, data-tc=/data-oc= on read-only boards). A
   value containing `"` would break the markup. The pipe form has no quotes.

   Anything not starting with `s|` is a plain hex, exactly as before, and a
   malformed value degrades to a solid colour rather than throwing — these
   run on every repaint of every circle, and a board that fails to draw is
   worse than one drawn in the wrong colour. */

/* The most bands a striped fill may have. ONE constant, because the cap was
   enforced in seven independent places — parseFill, encodeFill,
   normalizeStripeState, two number inputs, the board's commit handler and the
   server validator — and raising it meant finding all of them. Miss one and
   the UI offers a value parseFill then silently rejects, so the stripes just
   vanish. Raised 6 → 9 on request (2026-08-21). */
var STRIPE_MAX = 9;

/** @return {{striped:boolean, dir?:string, n?:number, c1:string, c2?:string}} */
function parseFill(v) {
  const s = String(v == null ? '' : v);
  if (s.slice(0, 2) !== 's|') return {striped: false, c1: s || '#ffffff'};
  const p = s.split('|');
  const n = parseInt(p[2], 10);
  const dir = p[1] === 'h' ? 'h' : 'v';
  const c1 = p[3] || '#ffffff';
  const c2 = p[4] || '#ffffff';
  if (!(n >= 2 && n <= STRIPE_MAX)) return {striped: false, c1: c1};
  return {striped: true, dir: dir, n: n, c1: c1, c2: c2};
}

/** Build the stored string. Solid when `on` is false, so callers stay simple. */
function encodeFill(on, dir, n, c1, c2) {
  if (!on) return c1;
  const clamped = Math.min(STRIPE_MAX, Math.max(2, parseInt(n, 10) || 2));
  return 's|' + (dir === 'h' ? 'h' : 'v') + '|' + clamped + '|' + c1 + '|' + c2;
}

/* ---------- The rival's kit, from the federation ----------

   FCF publishes every team's kit as six hex colours plus a NAMED pattern in
   `CLASE_CSS_CAMISETA` — their own stylesheet's class. Eleven distinct ones
   appear in a single group. Six of them are stripes and map exactly onto the
   fill encoding above, so the rival's shirt renders through shirtSvg() with
   no new drawing code at all.

   The other five — diagonals, side bands, coloured sleeves — have no
   representation in parseFill, and they render SOLID in the base colour.
   That is a decision, not a gap waiting to be filled: a delegate looking at
   next Sunday's fixture needs to know the rival plays in red so he does not
   bring the red strip, and inventing a diagonal renderer for someone else's
   shirt earns nothing.

   The mapping lives here, next to encodeFill, rather than server-side: the
   sync stores FCF's raw fields, because reaching encodeFill from functions/
   would mean a THIRD duplicated function across that boundary. */
/* FCF's own class name → what the shirt actually LOOKS like.

   The payload also carries `NOMBRE_CAMISETA`, a plain-language description
   in Spanish — "3 rayas horizontales", "Franja lateral izquierda", "Mangas
   colores" — and the class is that description in machine-readable form.
   Following it is the whole point: a shirt drawn as generic stripes when the
   federation says "one band across the top" is a picture of a different
   shirt.

   The five band/diagonal/sleeve forms have NO representation in parseFill —
   that encoding knows only solid and evenly-spaced stripes — so they are
   drawn directly by fcfShirtSvg() in js/app.js. This table is the single
   place the vocabulary is decoded, and it is pure so it can be tested
   against the real payload. */
var FCF_SHIRT_PATTERNS = {
  'faf-base': 'plain',                     // Lisa
  'faf-barres': 'stripes',                 // Rayas
  'faf-barres2': 'wide-stripes',           // Rayas anchas
  'faf-barres3': 'wide-stripes',           // Rayas anchas, the other spelling
  'faf-fineshoritzontals': 'fine-hoops',   // Rayas finas horizontales
  'faf-horitzontals3': 'hoops3',           // 3 rayas horizontales
  'faf-franjahoritzontal': 'band-top',     // Franja horizontal arriba
  'faf-lateralesquerra': 'band-left',      // Franja lateral izquierda
  'faf-lateraldreta': 'band-right',        // Franja lateral derecha
  'faf-obliquesinverted': 'diagonal',      // Rayas oblicuas invertidas
  'faf-sinmangas': 'sleeves'               // Mangas colores
};

/** FCF's `CLASE_CSS_CAMISETA` → one of the keys above, or 'plain'. */
function fcfShirtPattern(pattern) {
  const key = String(pattern || '').split(/\s+/)
      .filter(function (c) { return c.indexOf('faf-') === 0; })[0] || '';
  return FCF_SHIRT_PATTERNS[key] || 'plain';
}

/* The three patterns parseFill CAN express, so they keep the pixel-aligned
   stripe machinery rather than being redrawn by hand.

   ⚠ The COUNTS are constrained by arithmetic, not taste, and the constraint
   is stricter than it first looks.

   The striped torso is exactly 32 of the shirt's 64 viewBox units, so at a
   rendered size S a band is S/(2n) CSS pixels — but what has to be whole is
   DEVICE pixels, and Windows runs at 125%, 150% and 175% as happily as at
   100%. A band is even at every one of those only when S/(2n) is a multiple
   of 4.

     32px, 8 bands → 2px at 100%, 2.5px at 125%  → snapped 2,3,2,3
     48px, 6 bands → 4px at 100%, 5px at 125%, 6px at 150%  → always even

   Two rounds of this were spent getting it wrong: first by scaling a 72px
   SVG down in CSS, then by dividing exactly at 100% and no other scaling.
   The screenshot that finally settled it was a 125% display.

   So the Calendari draws at 48px, "Rayas" is 6 and "Rayas anchas" is 3.
   Changing any of the three means re-checking the other two — there is a
   test that does exactly that. */
var FCF_FILL_PATTERNS = {
  'stripes': ['v', 6],
  'wide-stripes': ['v', 3],
  'fine-hoops': ['h', 6]
};

/** The fill string for an FCF shirt: `s|dir|n|c1|c2`, or a bare hex. */
function fcfShirtFill(pattern, c1, c2) {
  const base = c1 || '#ffffff';
  const other = c2 || '#ffffff';
  /* Two identical colours are how FCF spells a plain shirt even when the
     pattern says stripes (#FFFFFF/#FFFFFF is all over the payload). Striping
     one colour against itself draws a solid shirt the slow way and, worse,
     makes parseFill report `striped` to callers that then reason about it. */
  if (base.toLowerCase() === other.toLowerCase()) return base;
  const spec = FCF_FILL_PATTERNS[fcfShirtPattern(pattern)];
  if (!spec) return base;
  return encodeFill(true, spec[0], spec[1], base, other);
}

/**
 * An FCF kit as the three fill values the app's own renderers take.
 *
 * → {shirt, shorts, socks}, or null when there is nothing to draw.
 * Shorts are always solid: real shorts are single-colour, and the kit editor
 * enforces the same rule. Socks too — FCF sends two sock colours but no sock
 * pattern, and guessing one from the shirt's would be inventing a kit.
 */
function fcfKitPieces(kit) {
  if (!kit || !kit.shirt1) return null;
  const c1 = kit.shirt1;
  const c2 = kit.shirt2 || kit.shirt1;
  /* `pattern` is carried alongside `shirt` rather than replacing it: the
     three stripe forms ARE expressible as a fill and every existing renderer
     understands one, so `shirt` stays useful on its own. fcfShirtSvg() reads
     `pattern` to draw the five that a fill cannot describe. Two identical
     colours mean a plain shirt whatever the class says. */
  const same = String(c1).toLowerCase() === String(c2).toLowerCase();
  return {
    shirt: fcfShirtFill(kit.pattern, c1, c2),
    shorts: kit.shorts1 || '#ffffff',
    socks: kit.socks1 || '#ffffff',
    pattern: same ? 'plain' : fcfShirtPattern(kit.pattern),
    c1: c1,
    c2: c2
  };
}

/**
 * The three CSS values a circle needs, from either kind of fill.
 *
 * Stops are PERCENTAGES, deliberately: a circle is 24px, and 16px on a
 * phone, so px stripe widths would not survive scaleRoField()'s resizing of
 * read-only boards.
 *
 * 90deg gives vertical bands, 180deg horizontal. `w = 100/n` is one stripe;
 * the gradient repeats every two, so an odd count still renders n bands.
 * The border and the shirt number follow c1 — darkenHex and textColorFor
 * take a hex and would return '#NaNNaNNaN' on an encoded fill, which is the
 * whole reason this function exists.
 */
/* The shirt number when the two stripes disagree about black vs white.
   No FLAT colour contrasts with both black and white, so the yellow carries
   a dark halo — without it the number vanishes on the white stripe, which is
   the exact case this branch exists for. Applied nowhere else: a solid
   colour, and a striped kit whose colours agree, always have a readable
   black or white. */
var FILL_CONFLICT_FG = '#ffe000';
var FILL_CONFLICT_SHADOW = '0 0 2px rgba(0,0,0,.95), 0 0 3px rgba(0,0,0,.75)';

function fillCss(v) {
  const f = parseFill(v);
  if (!f.striped) {
    return {background: f.c1, borderColor: darkenHex(f.c1, 50),
      fg: textColorFor(f.c1), fgShadow: ''};
  }
  // Rounded: 100/3 is 33.333333333333336 raw, and that lands in a style
  // attribute on every circle of every board.
  const w = Math.round((100 / f.n) * 1e4) / 1e4;
  const angle = f.dir === 'h' ? '180deg' : '90deg';
  /* textColorFor answers "black or white on THIS colour". Asking it about
     both stripes turns the legibility question into a precise test: if the
     two answers differ, no single black-or-white number can sit on both —
     a black-and-white kit being the obvious case, red-and-white the one
     people forget. */
  const fg1 = textColorFor(f.c1);
  const fg2 = textColorFor(f.c2);
  const conflict = fg1 !== fg2;
  return {
    background: 'repeating-linear-gradient(' + angle + ',' +
      f.c1 + ' 0 ' + w + '%,' + f.c2 + ' ' + w + '% ' + (w * 2) + '%)',
    borderColor: darkenHex(f.c1, 50),
    fg: conflict ? FILL_CONFLICT_FG : fg1,
    fgShadow: conflict ? FILL_CONFLICT_SHADOW : ''
  };
}

/**
 * Paint a live circle. The editor mutates DOM nodes; the read-only renderer
 * builds html strings and uses fillCss directly.
 *
 * `style.background` is the SHORTHAND on purpose — it clears any previous
 * background-image, so switching a striped circle back to solid works. Note
 * that a gradient makes style.backgroundColor read back as '', which is why
 * callers must ask dataset.color what a circle's fill is, never the style.
 */
function paintCircle(el, v) {
  if (!el) return;
  const css = fillCss(v);
  el.style.background = css.background;
  el.style.borderColor = css.borderColor;
  const num = el.querySelector('.tb-num');
  if (num) {
    num.style.color = css.fg;
    // Always assigned, so switching a circle back to a solid fill clears
    // the halo rather than leaving it behind.
    num.style.textShadow = css.fgShadow || '';
  }
}

// ---------- Club kits ----------
/*
 * A club's kits live at clubs/{clubId}.kits, up to three of them, and each
 * one is a SOURCE OF PIECES rather than an atomic outfit: the convocatòria
 * keeps a separate toggle per garment, so a coach can still send the 1a
 * shirt with the 2a socks. What changed is that both of those now have to be
 * pieces the club actually owns.
 *
 *   {id, label, shirt, shorts, socks}
 *
 * `shirt` and `socks` are encodeFill() strings — a bare hex, or `s|…` for
 * stripes — so the kit editor reuses the tactical board's colour tool
 * unchanged. `shorts` is ALWAYS a bare hex: real shorts are single-colour,
 * and parseFill degrades a striped value to solid silently, so the rule is
 * enforced server-side rather than left to the UI.
 */

/* What a club that has never configured a kit wears.
 *
 * These reproduce TODAY'S hardcoded icons exactly, which is the entire
 * point: every club on the platform currently renders Esquerra de
 * l'Eixample's white and yellow kit, so a default that IS that kit leaves
 * all of them looking precisely as they do now. Two, not three — inventing a
 * third would show every club a kit nobody owns.
 *
 * Shorts had no representation at all before this, so black is a new
 * assertion rather than a preserved one; a club that cares sets its own. */
var DEFAULT_KITS = [
  {id: 'kit-1', label: '1a', shirt: '#FFFFFF', shorts: '#000000',
    socks: 's|h|6|#ffffff|#222222'},
  {id: 'kit-2', label: '2a', shirt: '#FFD662', shorts: '#000000',
    socks: '#FFD662'}
];

/** A club's kits, or the defaults. NEVER an empty array: an empty picker is
    a screen with no way to answer, and every caller would need the guard. */
function kitsOf(clubConfig) {
  const k = clubConfig && clubConfig.kits;
  return (Array.isArray(k) && k.length) ? k : DEFAULT_KITS;
}

/**
 * What one stored convocatòria says the team wore — across three eras of
 * this field, without a backfill.
 *
 *   era 1  a bare ARRAY of player ids. No kit ever existed. → null, so the
 *          renderers show nothing, exactly as the `(jersey || socks)` guard
 *          does today. Never invent a kit for a record that had none.
 *   era 2  {jersey:'white'|'yellow', socks:'striped'|'yellow'}. Resolved to
 *          the literal colours those words meant, INCLUDING the mixes — a
 *          coach could already send a white shirt with yellow socks, and
 *          that record must keep rendering as what was actually sent.
 *          Shorts did not exist, so they stay null and go undrawn.
 *   era 3  {shirtId, shortsId, socksId} into the club's kits.
 *
 * → {shirt, shorts, socks} of fill values (any may be null), or null.
 * Returns VALUES, not ids: era 2 has no id to give, and returning resolved
 * pieces is what keeps all three renderers era-blind.
 *
 * A deleted kit resolves to null rather than to kits[0] — a historical match
 * showing nothing is honest; showing the wrong kit is not.
 */
function resolveKitPieces(entry, kits) {
  if (!entry || Array.isArray(entry)) return null;
  const byId = (id) => (kits || []).find((k) => k && k.id === id) || null;
  if (entry.shirtId || entry.shortsId || entry.socksId) {
    const sh = byId(entry.shirtId);
    const sp = byId(entry.shortsId);
    const so = byId(entry.socksId);
    if (!sh && !sp && !so) return null;
    return {
      shirt: sh ? sh.shirt : null,
      shorts: sp ? sp.shorts : null,
      socks: so ? so.socks : null
    };
  }
  if (entry.jersey || entry.socks) {
    return {
      shirt: entry.jersey === 'yellow' ? '#FFD662' : '#FFFFFF',
      shorts: null,
      socks: entry.socks === 'yellow' ? '#FFD662' : 's|h|6|#ffffff|#222222'
    };
  }
  return null;
}

/** The board toolbar's {on,n,dir,c2} shape, normalised. Extracted from
    _stripeCfgOf so the kit editor shares one clamp with the board — the old
    inline `o.n || 2` happily accepted 9 bands. */
function normalizeStripeState(o) {
  const s = (o && typeof o === 'object') ? o : {};
  return {
    on: !!s.on,
    n: Math.min(STRIPE_MAX, Math.max(2, parseInt(s.n, 10) || 2)),
    dir: s.dir === 'h' ? 'h' : 'v',
    c2: s.c2 || '#ffffff'
  };
}

/** A fill value from a base colour plus a stripe config. The storage-only
    half of the board's teamFill(), which reads its c1 from a DOM input and
    is therefore unusable anywhere else. */
function fillFrom(c1, cfg) {
  const s = normalizeStripeState(cfg);
  return encodeFill(s.on, s.dir, s.n, c1 || '#ffffff', s.c2);
}

/**
 * A striped fill as CLIPPED RECTS, not a gradient.
 *
 * It was a <linearGradient> with hard stops, and at icon size the stripes
 * looked uneven — bands appearing to have different widths, with the gaps
 * between them varying. That is subpixel rounding: a gradient stop lands on
 * a FRACTIONAL device pixel, and the browser antialiases each boundary by a
 * different amount, so one edge renders sharp and the next renders as a
 * half-tone smear. At 56px with nine bands each band is barely three pixels,
 * which is exactly where that is most visible.
 *
 * Real rects with shape-rendering="crispEdges" snap every edge to the pixel
 * grid instead. Bands can still differ by at most ONE device pixel — that is
 * unavoidable when 28 pixels have to hold 9 stripes — but every edge is
 * sharp and evenly spaced, which is what the eye actually reads as regular.
 *
 * Only the alternating c2 bands are drawn, over a solid c1 base: half the
 * rects, and two adjacent same-coloured bands can never show a seam.
 *
 * Boundaries come from i/n each time rather than by accumulating a rounded
 * width, so the last band ends exactly on the edge instead of leaving a
 * hairline of the base colour.
 *
 * @param {string} v      the fill value
 * @param {string|number} uid  unique per document — several kits render at once
 * @param {string} pathD  the shape to fill, and to clip the bands to
 * @param {{x:number,y:number,w:number,h:number}} box  that shape's bounding box
 * @return {{defs: string, shapes: string}}
 */
function stripeSvg(v, uid, pathD, box) {
  const f = parseFill(v);
  const base = '<path d="' + pathD + '" fill="' + f.c1 + '" stroke="none"/>';
  if (!f.striped) return {defs: '', shapes: base};
  const id = 'ks' + String(uid == null ? '' : uid);
  const horiz = f.dir === 'h';
  const start = horiz ? box.y : box.x;
  const span = horiz ? box.h : box.w;
  const at = (i) => Math.round((start + (span * i) / f.n) * 1e6) / 1e6;
  let rects = '';
  for (let i = 1; i < f.n; i += 2) {
    const a = at(i);
    const b = at(i + 1);
    rects += horiz ?
      '<rect x="' + box.x + '" y="' + a + '" width="' + box.w +
        '" height="' + (Math.round((b - a) * 1e6) / 1e6) + '"' :
      '<rect x="' + a + '" y="' + box.y + '" width="' +
        (Math.round((b - a) * 1e6) / 1e6) + '" height="' + box.h + '"';
    rects += ' fill="' + f.c2 + '" shape-rendering="crispEdges"/>';
  }
  return {
    defs: '<defs><clipPath id="' + id + '"><path d="' + pathD + '"/></clipPath></defs>',
    shapes: base + '<g clip-path="url(#' + id + ')">' + rects + '</g>'
  };
}

// ---------- SVG Helpers ----------
function crSplinePath(pts, tension) {
  if (pts.length < 2) return '';
  var t = tension != null ? tension : 0.6;
  var d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
  for (var i = 0; i < pts.length - 1; i++) {
    var p0 = pts[i === 0 ? 0 : i - 1];
    var p1 = pts[i];
    var p2 = pts[i + 1];
    var p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1];
    var cp1x = p1.x + (p2.x - p0.x) * t / 3;
    var cp1y = p1.y + (p2.y - p0.y) * t / 3;
    var cp2x = p2.x - (p3.x - p1.x) * t / 3;
    var cp2y = p2.y - (p3.y - p1.y) * t / 3;
    d += ' C' + cp1x.toFixed(1) + ',' + cp1y.toFixed(1) + ' ' + cp2x.toFixed(1) + ',' + cp2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
  }
  return d;
}

// ---------- Sanitize (XSS-safe) ----------
/**
 * Escape a value for injection into HTML — between tags OR inside a
 * double-quoted attribute.
 *
 * ⚠ THE QUOTES ARE NOT DECORATION (v230). This used to be the two lines
 * below on their own: textContent in, innerHTML out, which is the browser's
 * own escaping and covers `&`, `<` and `>`. That is complete for text
 * BETWEEN TAGS and silently incomplete inside an attribute, because the
 * quote is what ends an attribute — no `<` is needed:
 *
 *     data-x="${sanitize(v)}"   with v = `" onclick="alert(1)`
 *     →  <div data-x="" onclick="alert(1)">
 *
 * The app emitted ~30 attributes this way. Most carry app-generated ids, but
 * a handful carry typed text — a coach's injury note, a session's focus and
 * location, a player's own name — so it was reachable, if only by someone
 * already inside the club. It also broke a plain form field: a location
 * typed as `Camp "El Nou"` truncated its own `value=""`.
 *
 * Escaping the quote is invisible everywhere it was already correct: between
 * tags `&quot;` RENDERS as `"`, and read back off an attribute (`dataset.x`,
 * `getAttribute`) the browser decodes it, so JSON round-tripped through an
 * attribute still parses. Both are pinned in test/utils.test.js.
 *
 * `&` first (textContent does it), then the quotes — the `&` in `&quot;`
 * must not be escaped again. That is why the replaces come after.
 */
function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- Tactical Formations ----------
const TACTIC_FORMATIONS = {
  '4-3-3':   [[5,50],[15,20],[15,40],[15,60],[15,80],[38,25],[38,50],[38,75],[62,15],[62,50],[62,85]],
  '4-4-2':   [[5,50],[15,20],[15,40],[15,60],[15,80],[40,20],[40,40],[40,60],[40,80],[65,35],[65,65]],
  '4-2-3-1': [[5,50],[15,20],[15,40],[15,60],[15,80],[32,35],[32,65],[55,20],[55,50],[55,80],[72,50]],
  '3-5-2':   [[5,50],[15,30],[15,50],[15,70],[35,15],[35,38],[35,62],[35,85],[50,50],[65,35],[65,65]],
  '3-4-3':   [[5,50],[15,30],[15,50],[15,70],[38,20],[38,40],[38,60],[38,80],[62,20],[62,50],[62,80]],
  '4-1-4-1': [[5,50],[15,20],[15,40],[15,60],[15,80],[30,50],[50,20],[50,40],[50,60],[50,80],[72,50]],
  '4-4-1-1': [[5,50],[15,20],[15,40],[15,60],[15,80],[38,20],[38,40],[38,60],[38,80],[58,50],[72,50]],
  '5-3-2':   [[5,50],[15,15],[15,35],[15,55],[15,75],[15,95],[40,30],[40,50],[40,70],[65,35],[65,65]],
  '4-5-1':   [[5,50],[15,20],[15,40],[15,60],[15,80],[38,10],[38,30],[38,50],[38,70],[38,90],[70,50]],
  '3-4-1-2': [[5,50],[15,30],[15,50],[15,70],[35,20],[35,40],[35,60],[35,80],[55,50],[68,35],[68,65]]
};

// ---------- Medical / Body Constants ----------
const BODY_REGIONS = {
  'Legs': {
    'Quadriceps': ['Rectus Femoris','Vastus Lateralis','Vastus Medialis','Vastus Intermedius'],
    'Hamstrings': ['Biceps Femoris','Semitendinosus','Semimembranosus'],
    'Adductors': ['Adductor Longus','Adductor Magnus','Adductor Brevis','Gracilis','Pectineus'],
    'Calves': ['Gastrocnemius','Soleus','Tibialis Anterior'],
    'Glutes': ['Gluteus Maximus','Gluteus Medius','Gluteus Minimus'],
    'Hip Flexors': ['Iliopsoas','Rectus Femoris','Sartorius','TFL'],
    'Knee': ['ACL','MCL','LCL','PCL','Meniscus','Patellar Tendon'],
    'Ankle': ['Lateral Ligament','Medial Ligament','Achilles Tendon','Peroneal Tendons'],
    'Groin': ['Inguinal','Pubic Symphysis']
  },
  'Upper Body': {
    'Chest': ['Pectoralis Major','Pectoralis Minor'],
    'Back': ['Latissimus Dorsi','Trapezius','Erector Spinae','Rhomboids'],
    'Abdominals': ['Rectus Abdominis','Obliques','Transverse Abdominis'],
    'Shoulders': ['Deltoid','Rotator Cuff','Supraspinatus','Infraspinatus']
  },
  'Arms': {
    'Biceps': ['Biceps Long Head','Biceps Short Head','Brachialis'],
    'Triceps': ['Triceps Long Head','Triceps Lateral Head','Triceps Medial Head'],
    'Forearm': ['Wrist Flexors','Wrist Extensors','Brachioradialis']
  }
};
const GROUP_SUBS = {};
for (const r in BODY_REGIONS) for (const g in BODY_REGIONS[r]) GROUP_SUBS[g] = BODY_REGIONS[r][g];

const BODY_ZONES = [
  // ===== FRONT VIEW =====
  {pts:'33.3,25.6 32.7,26.6 33.1,28 33.5,29.1 34.2,30.6 34.8,31.4 35.6,31.9 36.7,32.4 37.8,32.7 38.7,33.2 39,32.3 39.1,31.4 38.8,30.3 38.5,29.3 38.1,28.2 37.4,27.2 36.6,26.6 35.5,26.1 34.4,25.7', label:'Shoulder', groups:['Shoulders']},
  {pts:'13.8,33.3 13.8,32.1 13.7,31.2 13.9,30.3 14.2,29.3 14.6,28.2 15.1,27.4 15.7,26.7 16.6,26.3 17.6,26 18.5,25.8 19.5,25.7 19.9,26.6 19.7,27.6 19.3,28.7 18.7,29.9 18.2,30.9 17.8,31.6 16.7,32.1 15.1,32.8', label:'Shoulder', groups:['Shoulders']},
  {pts:'26.4,27.9 26.9,27.3 27.5,26.9 28.6,26.8 29.8,26.7 31.3,26.8 32.5,26.7 32.9,27.9 33.3,29 33.9,30.2 34.5,31 35,31.5 34.3,32.6 33.6,33.6 33.2,34.3 32.6,34.8 31.7,35 30.7,35 29.7,35.1 28.7,34.7 27.6,34.2 26.4,33.4', label:'Chest', groups:['Chest']},
  {pts:'26.4,28 25.9,27.4 25.1,27 23.8,26.8 22.5,26.7 21.3,26.7 20,26.8 19.5,27.7 19.3,28.7 18.7,29.8 18.2,30.7 17.8,31.5 18.3,32.6 18.9,33.6 19.5,34.5 20,35 21,35 22.2,35.1 23.2,35.1 24.3,34.5 25.3,33.9 26.1,33.4 26.3,32.6', label:'Chest', groups:['Chest']},
  {pts:'22.9,45.1 22.3,44.3 22.2,42.7 22.3,41.8 22.3,40.7 22.3,39.5 22.2,38.5 22.3,37.4 22.3,36.2 22.9,35.3 23.8,34.6 26.2,33.6 28.2,34.4 29.7,35.3 30.3,36 30.3,36.8 30.3,37.8 30.4,39 30.4,40.1 30.3,41.2 30.4,42.4 30.3,43.7 30.3,44.4 29.9,45.1', label:'Abs', groups:['Abdominals']},
  {pts:'29.9,35.3 31.4,35.3 32.6,35 33.5,34.4 33.9,35.2 34,36.2 34.2,37.2 34,38.9 33.9,39.9 33.4,41.5 32.7,42.9 32.2,44.2 31.8,45.4 31.3,46.4 30.7,47.2 30,47.6 30.3,46.3 30.2,45.1 30.4,44.2 30.5,42.8 30.5,41.2 30.4,39.8 30.6,38.5 30.5,36.9', label:'Oblique', groups:['Abdominals']},
  {pts:'22.8,47.8 22.5,45.6 22.5,44.8 22.2,44 22.2,42.7 22.2,41.4 22.2,40.1 22.3,38.7 22.3,37.3 22.2,36 23.2,35.1 21.9,35 20.6,35 19.9,35 19.2,34.1 18.5,37 18.5,38.4 18.8,39.8 19.2,41.1 19.8,42.8 19.4,41.9 20.4,43.7 20.7,45.1 21.3,46.3 21.8,47.4', label:'Oblique', groups:['Abdominals']},
  {pts:'35.4,32.1 35.5,33.7 35.6,35 35.9,36.2 36.3,37.4 37.1,38.6 38,39.6 38.8,40.4 39.3,41.1 39.5,39.8 39.8,38.5 39.9,37.1 39.9,35.8 39.4,34.6 38.9,33.7 38.2,33 36.8,32.4', label:'Bicep', groups:['Biceps']},
  {pts:'14,33.4 13.4,34.4 12.9,35.4 12.9,36.5 12.9,37.7 13.1,38.9 13.3,39.8 13.3,40.8 14.2,40.2 14.9,39.5 15.6,38.7 16.1,37.7 16.6,36.7 16.9,35.5 17.1,34.1 17.3,32.9 17.3,31.8 16.1,32.3 15,32.9', label:'Bicep', groups:['Biceps']},
  {pts:'40,39.2 40.9,40 41.5,41.1 41.9,42.4 42.4,43.9 42.8,45.2 43.1,46.4 43.5,47.5 43.9,48.5 44.2,49.2 41.5,50.3 41,49.3 40.1,48 39.2,47.3 38.4,46.2 37.5,45.1 37.1,44 36.6,42.7 36.3,41.5 36.1,40.1 37.1,40.2 38.2,40.4 39.3,41.3 39.7,40.3', label:'Forearm', groups:['Forearm']},
  {pts:'16.6,39.8 16.6,41 16.4,42.3 15.9,43.4 15.4,44.5 15,45.6 14.2,46.5 13.2,47.6 12.3,48.6 11.6,49.6 11.4,50.5 8.7,49.2 9.1,47.9 9.5,46.5 10,45.4 10.2,44 10.5,42.7 10.9,41.7 11.5,40.8 12,40 13,39 13.2,39.9 13.3,41.1 14.3,40.5 15.3,40.1', label:'Forearm', groups:['Forearm']},
  {pts:'19.7,42.7 19.3,43.9 19.1,45.1 19,46.4 19.1,47.5 19.6,48.6 20.5,49.6 21.3,50.5 22.3,51.2 23.2,52.3 24.2,53.2 25,54 25.8,54.9 26.6,55.1 27.3,54.5 28.2,53.5 29.1,52.5 29.9,51.6 30.8,50.9 31.6,50 32.4,49 33.3,48.1 33.8,47.1 33.8,45.9 33.6,44.6 33.3,43.7 33,42.8 32.5,44.1 31.8,45.4 31.4,46.5 30.8,47.4 29.7,48.1 30,47.1 30.1,46 29.8,45.2 29,45.1 27.9,45 26.8,45.1 25.6,45.1 24.4,45 22.9,45.1 22.5,45.6 22.6,46.3 22.7,47.1 23,48 22.3,47.7 21.6,47.1 21.2,46.1 20.7,45.1 20.3,43.8', label:'Hip / Groin', groups:['Hip Flexors','Groin']},
  {pts:'33.5,48.3 34,49.7 34.5,51 34.9,52.3 35.1,53.6 35.4,54.9 35.6,56.4 35.6,57.6 35.8,58.9 35.8,60.1 35.7,61.5 35.6,62.9 35.4,64.2 35.1,65.4 34.9,66.9 34.1,67.2 33.8,66.3 33.1,67.8 32.5,67 32,66 31.7,68.1 30.8,67.9 30.3,67.1 29.7,66.6 29,65.6 28.5,64.3 28.1,63.2 27.7,62.1 27.3,60.9 27.2,59.4 27,58.2 27,56.9 26.8,55.7 27,54.7 28.2,53.4 29.3,52.2 30.4,51.1 31.4,50.1 32.4,49.1', label:'Quad', groups:['Quadriceps','Adductors']},
  {pts:'25.9,55.2 25.8,56.5 25.7,57.8 25.6,58.9 25.5,60.3 25,61.4 24.6,62.7 24.2,64.3 23.7,65.4 23.2,66.5 22.2,67.3 21.2,68.2 20.9,67.4 20.8,66.3 19.8,67.6 19,66.4 18.7,67.3 17.8,67.4 17.6,66.2 17.4,64.9 17.3,63.6 17,62.7 17,61.8 17,60.7 16.9,59.4 16.9,58.3 17.2,57 17.4,55.8 17.5,54.6 17.7,53.6 18,52.5 18.2,51.5 18.4,50.4 18.9,49.1 19.2,48.1 20.2,49.4 21,50.5 22,51.5 23.1,52.6 24.2,53.6 25.1,54.3', label:'Quad', groups:['Quadriceps','Adductors']},
  {pts:'29.3,68.1 29.9,67.3 30.7,67.9 31.6,68.5 32.4,68.2 33.3,68 34.3,68.1 34.6,68.9 34.6,69.7 34.6,70.6 33.8,71.6 32.8,72.1 31.4,72.2 30.2,71.9 29.6,71.1 29.4,69.9 29.4,69.1', label:'Knee', groups:['Knee']},
  {pts:'23.4,67.7 22.6,67.3 21.7,68 20.9,68.3 20.2,68.1 19.5,67.8 18.7,67.7 17.9,68 18.1,68.8 17.9,69.6 17.8,70.5 18.4,71.2 19.2,71.6 20.2,71.7 21.1,71.8 22.1,71.8 22.8,71.3 23.1,70.5 23.4,69.6 23.5,68.6', label:'Knee', groups:['Knee']},
  {pts:'30.4,72.4 31.5,72.7 32.5,72.6 33.4,72.4 34.2,71.8 34.7,71.1 35.5,71.5 35.6,72.3 35.9,73.3 36.1,74.5 36.2,75.9 36.1,77.3 36.1,78.7 35.8,80.1 35.6,81.2 35.6,82.5 35.3,83.7 35.2,85 35.1,86 34.3,85.9 33.5,85.6 32.6,85.8 31.9,86.4 31.8,85.4 31.8,84.5 31.7,83.4 31.5,82.3 31.2,81.4 31,80.5 30.6,79.3 30.2,78.5 30,77.6 30.1,76.5 29.9,75.5 30,74.3 30.1,73.4', label:'Shin / Calf', groups:['Calves']},
  {pts:'18.1,71.1 17.3,71.5 17.1,72.4 16.8,73.5 16.6,74.4 16.5,75.5 16.6,76.7 16.7,78 16.9,79.3 17,80.5 17.2,81.7 17.3,82.8 17.5,83.8 17.6,84.7 18.6,84.4 19.4,84.4 20.2,84.9 20.9,85.4 21.1,84.4 21.1,83.4 21.3,82.2 21.7,81.1 21.9,80.1 22.2,79.1 22.6,78.2 22.8,77.1 22.8,75.9 22.7,74.9 22.6,73.9 22.7,72.7 22.1,72 20.8,71.9 19.5,72 18.8,71.7', label:'Shin / Calf', groups:['Calves']},
  {pts:'31.8,86.8 32.5,86.1 33.4,85.9 34.2,86.1 35,86.4 35.3,87.2 35.6,87.8 35.3,88.5 35.6,89.2 35.9,89.9 36.5,90.6 36.9,91.4 37.6,92.1 38.2,92.8 38.4,93.7 37.9,94.4 36.9,94.3 36.2,93.8 36.2,94.6 35.5,94.6 34.8,94.3 33.9,93.7 33.4,92.9 33.1,92.1 32.5,91.5 31.8,91 31.5,90.2 31.6,89.2 32,88.5 31.6,87.9', label:'Ankle', groups:['Ankle']},
  {pts:'20.2,85.2 19.5,84.8 18.7,84.6 17.7,85.2 17.7,86 17.8,86.7 17.4,87.3 17.3,88 17.5,88.6 17.1,89.3 16.5,90.4 15.9,91.5 15.3,92.3 14.7,92.9 14.3,93.6 14.7,94.2 15.5,94.3 16.5,94 16.9,94.7 17.7,94.5 18.4,94.2 19,93.7 19.4,92.9 19.8,92 20.7,91.2 21.3,90.6 21.5,89.9 21.3,89.1 20.8,88.2 21.2,87.6 21.1,86.7 20.9,85.8', label:'Ankle', groups:['Ankle']},
  // ===== BACK VIEW =====
  {pts:'67.3,28.1 66.7,27.3 66,26.8 65.3,26.2 64.5,25.9 63.8,25.6 62.7,26.1 61.8,26.4 61.2,27.4 60.8,28.2 60.4,29.1 60.2,30.3 60.1,31.3 60.2,32.3 60.3,33.1 61.4,32.7 62.7,32.5 63.7,31.9 64.4,31.2 65.2,30.5 66.2,29.6 66.8,28.8', label:'Shoulder', groups:['Shoulders']},
  {pts:'78.8,27.7 79.5,27 80.2,26.5 81.1,26 82.1,25.6 83.2,25.8 83.9,26.4 84.7,27.1 85.1,28 85.5,28.7 85.8,29.8 85.9,30.9 86,31.8 85.7,33.1 84.5,32.7 83.1,32.3 82.1,31.6 81.2,30.9 80.3,30.4 79.7,29.7 79.1,28.8', label:'Shoulder', groups:['Shoulders']},
  {pts:'71.5,16.8 72.9,16.5 74.3,16.7 74.8,18.4 75.2,20.1 75.6,21.7 80,25 81,25.1 81.9,25.4 80.7,26 79.7,26.7 78.8,27.5 78.7,28.3 79.2,29.2 79.8,30 80.5,30.8 81.2,31.3 81.2,32.3 80.9,33.1 80,33.7 79.2,34.2 78.2,34.4 76.9,34.1 76.5,35 76.2,36 75.9,37 75.4,38 74.8,38.9 74.3,39.8 73.8,40.7 73,41.7 72,40.5 71.6,39.6 71,38.7 70.5,37.7 69.9,36.6 69.7,35.6 69.4,34.7 69.2,33.7 68.4,34.1 67.7,34.5 66.9,34.4 66.1,33.8 65.3,33.2 64.8,32.6 64.6,31.1 65.3,30.5 66.1,29.7 66.7,28.9 67.2,27.9 66.7,27.3 65.9,26.4 65.3,25.9 64.5,25.6 65.1,25 66,24.9 70.1,21.6 70.6,20.2 71.1,18.4', label:'Upper Back', groups:['Back','Shoulders']},
  {pts:'69,45 69.4,44 70.2,42.9 70.7,42 71.3,40.9 71.8,40.1 70.8,38.2 70,36.7 69.5,35.2 69.1,33.8 68.2,34.1 67.5,34.6 66.7,34.2 65.8,33.6 64.9,32.8 65.1,34.1 65.2,35.3 64.7,36.5 65.1,37.3 65.3,38.3 65.4,39.4 65.7,40.5 65.9,41.5 66.2,42.4 66.9,43.2 67.8,43.9', label:'Lat', groups:['Back']},
  {pts:'74.2,40.3 74.7,41 75.3,41.8 75.9,42.5 76.2,43.3 76.5,44.2 76.9,44.9 77.5,44.5 78.1,43.9 78.8,43.3 79.4,42.6 80.1,42 80.4,41.1 80.6,40.1 80.8,39.1 80.9,38.1 80.9,37.2 81.3,36.6 81,35.7 81,34.9 81,34.1 81,33 80.2,33.6 79.5,34.1 78.7,34.4 77.7,34.3 76.9,33.6 76.5,34.8 76.2,35.8 76,36.8 75.6,37.7 75.2,38.6 74.7,39.3', label:'Lat', groups:['Back']},
  {pts:'69.1,45.2 69.4,44.2 69.7,43.5 70.2,42.6 70.6,41.7 71,41 71.8,40.2 72.3,40.8 73.1,41.7 73.4,40.8 74,40 74.6,40.9 75,41.5 75.6,42.2 76.1,43.1 76.4,43.8 76.7,44.7 76.6,45.4 75.9,45.8 75.1,46.4 74.5,46.9 74.1,47.6 73.8,48.4 73.3,49.2 73.1,50.1 72.5,49.1 72.2,48.2 71.8,47.3 71.2,46.6 70.5,46 69.8,45.5', label:'Lower Back', groups:['Back']},
  {pts:'62.1,32.8 61.4,33.7 60.9,34.7 60.5,35.8 60.5,36.7 60.5,37.8 60.6,39 60.7,40.6 61.6,40.1 62.4,39.5 63.2,38.8 63.8,38 64.4,37.1 64.7,36.2 65.1,35.3 65.1,34 64.8,32.8 64.6,31.1 63.8,32 63,32.5', label:'Tricep', groups:['Triceps']},
  {pts:'81.6,31.4 81.3,32.4 81.2,33.2 80.9,34.2 80.9,35 81.2,35.8 81.6,36.8 82,37.6 82.5,38.4 83.2,39.1 83.8,39.9 84.6,40.5 85.2,40.9 85.4,39.8 85.5,38.9 85.5,38 85.5,36.9 85.4,36 85.3,35.1 84.9,34.2 84.3,33.3 83.6,32.6 82.7,32', label:'Tricep', groups:['Triceps']},
  {pts:'60.2,39 59.4,39.6 58.5,40.1 57.7,40.7 57.4,41.8 56.8,43.1 56.5,44.1 56.2,45.3 55.8,46.4 55.4,47.6 55.1,48.6 55,49.4 57.5,50.6 58,49.5 58.6,48.7 59.1,47.8 59.9,47 60.6,46.2 61.1,45.3 61.7,44.1 62.3,43 62.5,41.9 62.7,40.6 63.1,39.1 62,39.8 60.7,40.7 60.5,39.8', label:'Forearm', groups:['Forearm']},
  {pts:'85.5,38.7 86.3,39.2 87,39.8 87.7,40.2 88.3,40.7 88.8,42.2 89.4,43.8 89.9,45.2 90.3,46.5 90.7,47.7 91.1,49.3 88.5,50.5 87.9,49.3 87.4,48.4 86.6,47.5 86,46.9 85.3,45.9 84.6,45 84.1,43.9 83.7,42.7 83.3,41.7 83.1,40.5 82.9,39.2 83.8,39.8 84.6,40.6 85.5,40.9 85.4,39.8', label:'Forearm', groups:['Forearm']},
  {pts:'65,50.7 65.3,50 65.8,48.4 66.3,47.7 67.2,47 67.8,46.5 68.5,45.6 69,44.9 69.7,45.5 70.5,46.1 71.3,46.9 71.8,47.5 72.3,48.3 72.6,49.2 73,50.2 73,54 72.5,54.8 71.9,55.5 71.2,55.9 70.4,56.1 69.5,56.2 68.6,56.2 67.5,56.2 66.2,56.4 66.1,55.6 66.2,54.7 66.6,53.7 66.7,52.8 66.5,51.9 65.9,51.2', label:'Glute', groups:['Glutes']},
  {pts:'77,45.2 77.5,45.8 78.2,46.6 78.9,47.3 79.6,47.8 80.3,48.2 80.6,49.2 81,50.7 80.2,50.8 79.7,51.5 79.3,52.2 79.3,52.9 79.5,53.6 79.8,54.5 79.8,55.3 79.9,56.3 79.1,56 78.3,56 77.5,56 76.6,56.1 75.9,56.2 75.2,56 74.5,55.6 73.8,55.1 73,54.2 72.9,50.2 73.3,49.5 73.7,48.6 74,47.8 74.4,47 75,46.4 75.8,45.7', label:'Glute', groups:['Glutes']},
  {pts:'66.1,56.3 65.2,57.5 64.7,59 64.2,60.5 64,62.2 63.8,64 63.9,65.3 64.1,66.7 64.4,68 64.6,69.1 65.3,71.2 66.1,69.8 66.8,68.3 67.4,66.4 67.7,67.2 68,68.3 68.1,69.4 68.2,71.3 69,70.2 69.5,69.1 69.9,67.9 70.1,66.7 70.5,65.4 70.9,64.2 70.9,62.8 70.7,61.4 70.4,60 70.2,58.7 70,57.5 69.5,56 67.7,56.1', label:'Hamstring', groups:['Hamstrings']},
  {pts:'76.4,56.1 77.7,56 78.7,55.9 79.9,56.3 80.5,57.5 80.9,58.6 81.4,59.6 81.8,60.8 81.9,61.7 81.9,62.9 82,64 82,65.3 82.1,66.4 81.6,67.6 81.3,68.6 81.1,69.5 80.6,70.6 80,69.4 79.5,68.4 78.6,66.4 78.2,67.5 77.9,68.8 77.7,70 77.5,71.2 76.9,70.2 76.4,68.9 76.2,67.7 75.8,66.5 75.6,65.3 75.4,64.3 75.2,63.1 75.1,61.7 75.4,60.4 75.7,58.8 76,57.4', label:'Hamstring', groups:['Hamstrings']},
  {pts:'66,70.3 65.4,71.2 64.7,72.4 64.1,73.3 63.6,74.3 63.1,75.3 62.9,76.9 63.1,78.1 63.2,79.4 63.3,80.7 63.6,82.2 63.7,83.7 64,85 64.1,86.3 64.3,87.5 64.9,88.2 66,88.6 66.8,88.3 67.2,87.2 67.4,85.8 67.6,84.4 67.9,83 68.3,81.7 68.7,80.4 69.1,79.1 69.2,77.7 69.2,76.4 69.2,74.9 68.7,73.3 68.6,72.4 68.2,69.9 67.7,71.1 66.9,72.6 66.6,71.3', label:'Calf', groups:['Calves']},
  {pts:'77.9,70 77.6,71.3 77.5,72.5 77.2,74 77,75.4 76.8,76.6 76.8,78 77.1,79.4 77.4,80.4 77.8,81.8 78.3,83.1 78.4,84.3 78.7,85.7 78.7,86.8 79.3,87.8 80.4,88.2 81.2,87.8 81.8,86.8 82,85.8 82.2,84.3 82.3,82.9 82.6,81.5 82.7,80 82.9,77.7 83.1,76.5 82.8,75 82.2,73.6 81.2,71.8 80,69.7 79.5,70.5 78.7,72.2 78.4,71', label:'Calf', groups:['Calves']},
  {pts:'64.2,88.2 63.6,89 63.9,90.2 63.2,91.1 62.1,92 61.1,92.4 60.2,92.8 60.9,93.2 61.9,93.8 63.9,93.7 65,94.1 65.9,94.4 66.8,94.5 67.7,94.1 67.9,93.2 67.9,92.2 67.7,91.2 67.4,90.3 67.6,89.4 67.3,88.5 66.4,88.9 65.7,89.1 64.7,88.7', label:'Ankle', groups:['Ankle']},
  {pts:'78.7,87.8 79.3,88.2 80,88.7 80.8,88.6 81.4,88 81.9,87.5 82.1,88.4 82.3,89.1 82.3,89.8 82.2,90.6 82.8,90.9 83.4,91.5 84.4,92.2 85.3,92.5 85.8,92.9 85.2,93.3 84.5,93.4 84,93.8 83.2,93.8 82,93.6 81.2,94.1 80.4,94.4 79.6,94.4 78.4,94.2 78.1,93.1 78.2,91.9 78.4,90.9 78.3,89.5 78.4,88.6', label:'Ankle', groups:['Ankle']}
];

/* ---------- Node export (tests only) ----------
   This file stays a plain classic script: app.js reads every one of the
   above as a global, so wrapping it in a UMD closure the way shard.js is
   wrapped would take them all out of scope. `module` is undefined in the
   browser, so the block below is skipped there and the file is unchanged;
   under `require()` the declarations are module-scoped and this exports
   the pure helpers worth testing. Nothing above touches the DOM at load
   time (`sanitize` uses `document`, but only when called). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    localDateStr,
    seasonStartStr,
    setSeasonBoundary,
    getSeasonBoundary,
    getSeasonWeek,
    // Calendar. Every one of these is date arithmetic with no DOM, which is
    // why they live here and not in app.js — see calendar.test.js.
    daysBetweenISO,
    monthGrid,
    scheduleSlots,
    freeSlots,
    hhmmMins,
    ghostSlots,
    matchdayOffset,
    matchdayLabel,
    leaguePosLabel,
    // Session load. The per-session band is real (a coach sets 1-10); the
    // WEEKLY figure is printed without a band on purpose — see loadBand.
    LOAD_LOW,
    LOAD_MID,
    LOAD_HIGH,
    loadBand,
    sessionMinutesOf,
    sessionAU,
    weekAU,
    mondayOf,
    isoWeek,
    chunkWeeks,
    DAY_TO_JS,
    DEFAULT_TRAINING_SLOTS,
    // Activities are fa_training rows with a `kind`. An ABSENT kind is a
    // training, which is what keeps every pre-existing row working.
    TRAINING_KIND,
    ACTIVITY_KIND,
    isActivity,
    activityTitleOf,
    safeHttpUrl,
    // FCF. Both are pure string/JSON work, and parseFcfClassificacio is the
    // only place the "played is two numbers glued together" trap is handled.
    fcfGrupId,
    parseFcfClassificacio,
    // Exported separately as well: the last-five strip is worth testing on
    // its own, empty pre-season array and unknown letters included.
    parseFcfForm,
    FCF_BADGE_BASE,
    // The rival's kit. fcfShirtFill is where FCF's pattern vocabulary meets
    // the app's fill encoding, and the only place that mapping exists.
    fcfBadgeOf,
    fcfRefereeSlug,
    refereeDivisionStats,
    ourResultFrom,
    refereeHistoryWithUs,
    refereeHistoryTally,
    REF_MIN_SAMPLE,
    parseFcfSanctions,
    banCoversJornada,
    bansForJornada,
    parseFcfScorers,
    splitFcfTally,
    FCF_SCORERS_RAW,
    fcfShirtFill,
    fcfShirtPattern,
    fcfKitPieces,
    FCF_SHIRT_PATTERNS,
    // Match legs. findFirstLeg is the whole of the anada/tornada detection —
    // the UI only asks it a question and stores the coach's answer.
    normTeamName,
    sameClubName,
    ourSideOf,
    opponentOf,
    findFirstLeg,
    CATEGORY_ORDER,
    CATEGORY_LABELS,
    CATEGORY_INITIALS,
    catSpanOf,
    catBadgeHtmlGlobal,
    POS_ORDER,
    // Exported so the briefing tests can assert the squad really is ordered
    // goalkeeper-first, against the REAL ranking rather than a stub that
    // would pass whatever order it was handed.
    posRankGlobal,
    DAY_VALUES,
    // Exported so seed-demo-club.js can build injuries against the real
    // zone indices: fa_injuries stores `bodyZone` as an index INTO this
    // array plus a matching `bodyZoneLabel`, and hard-coding either would
    // drift the moment a zone is added.
    BODY_ZONES,
    BODY_REGIONS,
    GROUP_SUBS,
    // Circle fills. Exported for tests — paintCircle needs a DOM and is not
    // among them; fillCss is the part worth pinning.
    parseFill,
    encodeFill,
    fillCss,
    STRIPE_MAX,
    // Club kits. stripeSvg is the SVG counterpart of fillCss — a CSS
    // gradient cannot be an SVG fill, so the two must be kept in step and
    // fills.test.js pins that they agree on direction.
    DEFAULT_KITS,
    kitsOf,
    resolveKitPieces,
    normalizeStripeState,
    fillFrom,
    stripeSvg
  };
}
