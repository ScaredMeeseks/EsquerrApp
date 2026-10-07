/* =========================================================
   Turning a closed FCF acta into a match's events (v278)
   =========================================================

   Everything here is PURE: no firebase-admin, no network, no clock beyond
   what a caller passes in — the same rule as fcf.js and weather.js, for the
   same reason. test/acta.test.js requires this file directly.

   The acta is FINAL. Once it is imported, its goals, cards and substitutions
   are the match's, and the coach can only add what the federation does not
   record: the assist, and whether a goal came from open play or a direct
   free kick. That is why the merge below is "FCF wins", and why it carries a
   hand-entered goal's assist across when it can tell the two are the same
   goal.

   Players are joined by NAME ONLY. Shirt numbers change from game to game,
   so a dorsal is never evidence of who someone is; and the app keeps one
   free-text `name` while the federation writes "COGNOM1 COGNOM2, NOM". A
   link is made silently only when it cannot be anyone else — anything less
   is a suggestion for the coach to confirm, and a confirmed link is
   remembered (clubs/{id}/fcfPlayers) so it is asked once per player, ever.
   ========================================================= */

/** The event types an acta owns. Everything else (penal_fallat, pal) is the
 *  coach's and survives every import untouched. */
const ACTA_EVENT_TYPES = ["goal", "own_goal", "yellow", "red", "change"];

/** A hand event this many minutes from the acta's is the same event. */
const ADOPT_MINUTES = 3;

/* Particles: part of a surname for display ("de la Fuente"), noise for
   matching — "Pablo Fuente" is the same man. */
const NAME_PARTICLES = new Set(["de", "del", "la", "las", "los", "el", "i", "y",
  "d", "da", "das", "dos", "di", "du", "van", "von", "le"]);

/* First names that are the same person in Catalan, Spanish and common short
   forms. Only ever a SUGGESTION (tier 1): "Joan" in the app and "JUAN" on the
   acta is very probably one boy, but a squad with a Joan and a Juan exists. */
const NAME_ALIASES = [
  ["joan", "juan"], ["josep", "jose", "pep", "pepe"], ["jordi", "jorge"],
  ["xavier", "javier", "xavi", "javi"], ["pau", "pablo"], ["marc", "marcos"],
  ["joaquim", "joaquin", "quim"], ["pere", "pedro"], ["miquel", "miguel"],
  ["lluis", "luis"], ["enric", "enrique", "quique"], ["andreu", "andres"],
  ["guillem", "guillermo", "guille"], ["ferran", "fernando", "fer"],
  ["albert", "alberto"], ["alexandre", "alejandro", "alex", "alexander"],
  ["daniel", "dani"], ["eduard", "eduardo", "edu"], ["ignasi", "ignacio", "nacho"],
  ["antoni", "antonio", "toni"], ["sergi", "sergio"], ["carles", "carlos"],
  ["francesc", "francisco", "fran", "cesc", "xisco"], ["ramon", "raimon"],
  ["adria", "adrian", "adri"], ["victor", "victor"], ["nicolau", "nicolas", "nico"],
  ["manel", "manuel", "manu"], ["gerard", "gerardo"], ["arnau", "arnaldo"],
  ["oscar", "oscar"], ["ismael", "isma"], ["roger", "rogelio"], ["jaume", "jaime"],
  ["marti", "martin"], ["bernat", "bernardo"], ["esteve", "esteban"],
];
const ALIAS_OF = (() => {
  const out = {};
  NAME_ALIASES.forEach((group, i) => group.forEach((n) => {
    out[n] = i;
  }));
  return out;
})();

/** Lower-case, accents folded, punctuation to spaces. "Núñez-Sáez d'Ors"
 *  → "nunez saez d ors". */
function foldName(s) {
  return String(s === undefined || s === null ? "" : s)
      .toLowerCase()
      .replace(/l·l/g, "ll").replace(/l\.l/g, "ll")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
}

/** Tokens that identify a person: folded, particles dropped. */
function nameTokens(s) {
  return foldName(s).split(" ").filter((t) => t && !NAME_PARTICLES.has(t));
}

/** "DE LA FUENTE" → "de la Fuente"; "JULEN-MARIA" → "Julen-Maria"; "D'ALMEIDA"
 *  → "d'Almeida". The first word is capitalised even if it is a particle
 *  only when it starts the whole display string. */
function titleWord(w) {
  return w.toLowerCase().replace(/(^|[-\s])(\p{L})/gu, (all, sep, ch) => sep + ch.toUpperCase());
}
function displaySurname(raw) {
  const words = String(raw || "").trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) {
    const apos = /^([a-z])['’](.+)$/i.exec(w);
    if (apos && NAME_PARTICLES.has(apos[1].toLowerCase())) {
      out.push(apos[1].toLowerCase() + "'" + titleWord(apos[2]));
      break;
    }
    if (NAME_PARTICLES.has(foldName(w)) && foldName(w).length <= 3) {
      out.push(w.toLowerCase());
      continue;
    }
    out.push(titleWord(w));
    break;
  }
  return out.join(" ");
}

/**
 * One acta name, taken apart.
 *
 * `display` is what a coach reads on the timeline: every given name plus the
 * first surname ("CASANOVAS GARCIA, JOSUÉ" → "Josué Casanovas"), cut to the
 * first given name when that runs long. A hidden player ("Jugador/a") has
 * no name to show or match.
 */
function fcfPersonName(raw) {
  const s = String(raw === undefined || raw === null ? "" : raw).replace(/\s+/g, " ").trim();
  if (!s || /^jugador(\s*\/\s*a)?$/i.test(s)) return {surnames: [], given: [], hidden: true, display: ""};
  const ci = s.indexOf(",");
  /* Registered under one name, or with no comma at all ("IVÁN"): the first
     word is taken as the given name and the rest as surnames. A single word
     can therefore never reach tier 2 — it is always a suggestion. */
  if (ci === -1) {
    const words = s.split(" ");
    return {given: nameTokens(words[0]), surnames: nameTokens(words.slice(1).join(" ")),
      hidden: false, display: words.map(titleWord).join(" ")};
  }
  const sur = s.slice(0, ci).trim();
  const giv = s.slice(ci + 1).trim();
  const givenWords = giv.split(/\s+/).filter(Boolean).map(titleWord);
  const first = displaySurname(sur);
  let display = (givenWords.join(" ") + " " + first).trim();
  if (display.length > 22 && givenWords.length > 1) display = (givenWords[0] + " " + first).trim();
  return {surnames: nameTokens(sur), given: nameTokens(giv), hidden: false, display};
}

/**
 * How well an app player's name fits an acta name.
 *
 *   3  every word of the app name is in the acta name, and they cover at
 *      least one given name AND one surname ("Pol Bernat" ⊆ BERNAT QUIROGA,
 *      POL). Two words minimum: "Pol" alone is everyone called Pol.
 *   2  a given name and a surname both match exactly, but the app name also
 *      has a word the acta lacks (a nickname, a misspelt second surname).
 *   1  only a hint — a shared surname, a shortened or aliased first name
 *      ("Guille" for GUILLERMO, "Juan" for JOAN), a first name alone.
 *   0  nothing.
 *
 * Only 2 and 3 can link without asking; 1 orders the picker.
 */
function scoreCandidate(fcf, appName) {
  if (!fcf || fcf.hidden) return 0;
  const app = nameTokens(appName);
  if (!app.length) return 0;
  const G = fcf.given;
  const S = fcf.surnames;
  const isG = (t) => G.indexOf(t) !== -1;
  const isS = (t) => S.indexOf(t) !== -1;
  // A given name and a surname from two DIFFERENT app words: "Martí" can be
  // both a first name and a surname, and one word must not count twice.
  let pair = false;
  app.forEach((a, i) => app.forEach((b, j) => {
    if (i !== j && isG(a) && isS(b)) pair = true;
  }));
  if (pair && app.every((t) => isG(t) || isS(t))) return 3;
  if (pair) return 2;
  const looseGiven = app.some((a) => G.some((g) =>
    (a.length >= 4 && g.length >= 4 && (g.indexOf(a) === 0 || a.indexOf(g) === 0)) ||
    (ALIAS_OF[a] !== undefined && ALIAS_OF[a] === ALIAS_OF[g])));
  if (app.some((t) => isG(t) || isS(t)) || looseGiven) return 1;
  return 0;
}

/**
 * Who each of OUR acta players is in the app.
 *
 * `ours`     — the acta's players on our side.
 * `roster`   — `[{uid, name, called}]`, the match's category plus anyone in
 *              this match's call-up; `called` only orders suggestions.
 * `registry` — `{fcfId: {uid, status}}` from clubs/{id}/fcfPlayers.
 *
 * → `{fcfId: {uid, how:'link'|'auto'|'', ignored, cand:[uid…]}}`.
 *
 * A silent ('auto') link needs ALL of: tier ≥ 2; no other roster player at
 * tier ≥ 2; no other acta player reaching tier ≥ 2 on the same uid; the uid
 * not already linked to a different FCF id; and a visible name. Anything
 * else goes to the coach with suggestions.
 */
function resolveActaPlayers(ours, roster, registry) {
  const reg = registry || {};
  const linkedUid = {};
  Object.keys(reg).forEach((f) => {
    const r = reg[f] || {};
    if (r.status === "linked" && r.uid) linkedUid[String(r.uid)] = String(f);
  });
  const people = (roster || []).filter((p) => p && p.uid);
  const parsed = {};
  (ours || []).forEach((p) => {
    parsed[p.id] = fcfPersonName(p.name);
  });
  const tiers = {};
  (ours || []).forEach((p) => {
    tiers[p.id] = people.map((r) => ({uid: String(r.uid), called: !!r.called,
      tier: scoreCandidate(parsed[p.id], r.name)}));
  });
  const out = {};
  (ours || []).forEach((p) => {
    const r = reg[p.id] || {};
    if (r.status === "linked" && r.uid) {
      out[p.id] = {uid: String(r.uid), how: "link", source: r.source || "", ignored: false, cand: []};
      return;
    }
    const ignored = r.status === "ignored";
    const free = tiers[p.id].filter((c) => !linkedUid[c.uid] || linkedUid[c.uid] === p.id);
    const cand = free.filter((c) => c.tier >= 1)
        .sort((a, b) => (b.tier - a.tier) || (Number(b.called) - Number(a.called)))
        .slice(0, 5).map((c) => c.uid);
    let uid = "";
    const strong = free.filter((c) => c.tier >= 2);
    if (!ignored && !parsed[p.id].hidden && strong.length === 1) {
      const u = strong[0].uid;
      const rivals = (ours || []).filter((q) => q.id !== p.id &&
        !(reg[q.id] && reg[q.id].status === "linked") &&
        tiers[q.id].some((c) => c.uid === u && c.tier >= 2));
      if (!rivals.length) uid = u;
    }
    out[p.id] = {uid, how: uid ? "auto" : "", ignored, cand};
  });
  return out;
}

/** "45+2" → 45.02 for sorting; no minute sorts last. */
function minuteValue(min) {
  if (!min) return 999;
  const parts = String(min).split("+");
  return (Number(parts[0]) || 0) + (Number(parts[1]) || 0) * 0.01;
}
/** Minutes apart, with added time counted as minutes ("45+2" is 47). */
function minuteGap(a, b) {
  const v = (m) => {
    const p = String(m || "").split("+");
    return (Number(p[0]) || 0) + (Number(p[1]) || 0);
  };
  return Math.abs(v(a) - v(b));
}

/** The assist exists only for an open-play goal — ptSecondField in js/app.js
 *  (test/acta.test.js runs one table through both). */
function assistAllowed(goalType) {
  return (goalType || "jugada_oberta") === "jugada_oberta";
}

/** Which side of a fixture row is us — ptOurSide in js/app.js. */
function ourSideOfRow(row, clubName) {
  if (!row) return "home";
  if (row.home === clubName) return "home";
  if (row.away === clubName) return "away";
  return "home";
}

/** The app's score from a list of events — calcMatchScore in js/app.js. */
function scoreOfEvents(events) {
  let home = 0;
  let away = 0;
  (events || []).forEach((e) => {
    if (!e) return;
    if (e.type === "goal") {
      if (e.side === "home") home++; else away++;
    }
    if (e.type === "own_goal") {
      if (e.side === "home") away++; else home++;
    }
  });
  return {home, away};
}

/**
 * The acta as app events.
 *
 * Every event carries `src:'fcf'` and a stable `fcfKey`, which is how a
 * re-import recognises its own events and how the guard checks nothing was
 * altered. Our players get `playerId` when linked ('' when not) and always
 * an `fcfPlayerId` and a name snapshot, so an unlinked scorer still reads
 * as a name. Our unlinked events get NO `playerNumber`: the archive keys a
 * player on `playerId || playerNumber`, and an acta dorsal there would merge
 * our player with the rival who wore the same number.
 */
function fcfActaToEvents(acta, opts) {
  const o = opts || {};
  const actaId = String(o.actaId || "");
  const ourSide = o.ourSide === "away" ? "away" : "home";
  const resolve = o.resolve || {};
  const byId = {};
  (acta.players || []).forEach((p) => {
    byId[p.id] = p;
  });
  const shown = (id) => {
    const p = byId[id];
    if (!p) return "";
    if (p.hidden) return "Jugador/a" + (p.dorsal ? " #" + p.dorsal : "");
    return fcfPersonName(p.name).display;
  };
  const uidOf = (id) => (resolve[id] && resolve[id].uid) || "";
  const seen = {};
  const keyed = (base) => {
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] > 1 ? base + ":" + seen[base] : base;
  };
  const make = (type, side, minute, keyTail) => {
    const fcfKey = keyed(type + ":" + side + ":" + keyTail + ":" + (minute || "F"));
    return {
      id: "fcf_" + actaId + "_" + fcfKey.replace(/[^a-z0-9]+/gi, "_"),
      src: "fcf", fcfKey, side, type, minute: minute || "",
    };
  };
  const who = (ev, id, side) => {
    ev.fcfPlayerId = id;
    ev.playerName = shown(id);
    if (side === ourSide) ev.playerId = uidOf(id);
    else ev.playerNumber = (byId[id] && byId[id].dorsal) || "";
  };
  const out = [];
  (acta.goals || []).forEach((g) => {
    const type = g.kind === "own" ? "own_goal" : "goal";
    const ev = make(type, g.side, g.minute, g.id);
    who(ev, g.id, g.side);
    if (g.kind === "penalty") ev.goalType = "penal";
    out.push(ev);
  });
  (acta.cards || []).forEach((c) => {
    const ev = make(c.kind === "red" ? "red" : "yellow", c.side, c.minute, c.id);
    who(ev, c.id, c.side);
    out.push(ev);
  });
  (acta.subs || []).forEach((s) => {
    const ev = make("change", s.side, s.minute, s.inId + ">" + s.outId);
    ev.fcfPlayerInId = s.inId;
    ev.fcfPlayerOutId = s.outId;
    ev.playerInName = shown(s.inId);
    ev.playerOutName = shown(s.outId);
    if (s.side === ourSide) {
      ev.playerInId = uidOf(s.inId);
      ev.playerOutId = uidOf(s.outId);
    } else {
      ev.playerInNumber = (byId[s.inId] && byId[s.inId].dorsal) || "";
      ev.playerOutNumber = (byId[s.outId] && byId[s.outId].dorsal) || "";
    }
    out.push(ev);
  });
  return out;
}

const TYPE_ORDER = {goal: 0, own_goal: 1, penal_fallat: 2, pal: 3, yellow: 4, red: 5, change: 6};
function sortEvents(list) {
  return list.slice().sort((a, b) =>
    (minuteValue(a.minute) - minuteValue(b.minute)) ||
    ((TYPE_ORDER[a.type] === undefined ? 9 : TYPE_ORDER[a.type]) -
     (TYPE_ORDER[b.type] === undefined ? 9 : TYPE_ORDER[b.type])) ||
    String(a.fcfKey || a.id || "").localeCompare(String(b.fcfKey || b.id || "")));
}

/** The coach's additions to a goal, which the acta does not record. */
const ENRICHMENT = ["goalType", "goalDetail", "assistPlayerId", "assistPlayerName"];

/** Carry the enrichment bundle from `from` onto the acta event `to`, as one
 *  unit, then re-apply the acta's own say: a penalty is a penalty and has no
 *  assist, and an assist exists only on an open-play goal. */
function carryEnrichment(to, from) {
  if (to.type !== "goal" || !from) return to;
  const pen = to.goalType === "penal";
  ENRICHMENT.forEach((k) => {
    if (from[k] !== undefined && from[k] !== null && from[k] !== "") to[k] = from[k];
  });
  if (pen) to.goalType = "penal";
  else if (to.goalType === "penal") delete to.goalType;   // the acta says GOL
  if (!assistAllowed(to.goalType)) {
    delete to.goalDetail;
    delete to.assistPlayerId;
    delete to.assistPlayerName;
  } else if (!to.assistPlayerId) {
    if (to.goalDetail === "assistencia") delete to.goalDetail;
    delete to.assistPlayerName;
  } else {
    to.goalDetail = "assistencia";
  }
  return to;
}

/**
 * Fold the acta into a match's existing events — "FCF wins".
 *
 *  1. An event already imported (same `fcfKey`) takes the acta's fields and
 *     keeps its id and the coach's enrichments.
 *  2. Otherwise a HAND event of the same type, side and player within
 *     ADOPT_MINUTES is the same event: the acta's version replaces it, the
 *     hand event's id and enrichments are kept. "Same player" is the uid for
 *     us (or, for an acta player not yet linked, any of his suggested uids)
 *     and the shirt number for the rival — that number is from this very
 *     match, which is the one place a dorsal identifies anyone.
 *  3. Every other hand goal, own goal, card and substitution is removed, as
 *     is any earlier acta event the acta no longer lists. Hand-only types
 *     (penal fallat, pal) are kept.
 *
 * `opts.resolve` is resolveActaPlayers' output. Returns
 * `{events, summary:{added, adopted, refreshed, removed, kept}}`, sorted.
 */
function mergeActaEvents(existing, imported, opts) {
  const o = opts || {};
  const ourSide = o.ourSide === "away" ? "away" : "home";
  const resolve = o.resolve || {};
  const prev = (existing || []).filter(Boolean);
  const summary = {added: 0, adopted: 0, refreshed: 0, removed: 0, kept: 0};
  const used = new Set();
  const out = [];

  const byKey = {};
  prev.forEach((e) => {
    if (e.src === "fcf" && e.fcfKey) byKey[e.fcfKey] = e;
  });
  const hand = prev.filter((e) => e.src !== "fcf" && ACTA_EVENT_TYPES.indexOf(e.type) !== -1);

  const uidsFor = (fcfId, uid) => {
    if (uid) return [String(uid)];
    const r = resolve[fcfId];
    return r && r.cand ? r.cand.map(String) : [];
  };
  const samePlayer = (imp, h) => {
    if (imp.type === "change") {
      if (imp.side === ourSide) {
        const ins = uidsFor(imp.fcfPlayerInId, imp.playerInId);
        const outs = uidsFor(imp.fcfPlayerOutId, imp.playerOutId);
        if (!h.playerInId && !h.playerOutId) return true;
        return ins.indexOf(String(h.playerInId || "")) !== -1 &&
          outs.indexOf(String(h.playerOutId || "")) !== -1;
      }
      if (!h.playerInNumber && !h.playerOutNumber) return true;
      return String(h.playerInNumber || "") === String(imp.playerInNumber || "") &&
        String(h.playerOutNumber || "") === String(imp.playerOutNumber || "");
    }
    if (imp.side === ourSide) {
      if (!h.playerId) return true;
      return uidsFor(imp.fcfPlayerId, imp.playerId).indexOf(String(h.playerId)) !== -1;
    }
    if (!h.playerNumber) return true;
    return String(h.playerNumber) === String(imp.playerNumber || "");
  };

  // Pass 1: our own earlier imports, by key.
  const pending = [];
  imported.forEach((imp) => {
    const old = byKey[imp.fcfKey];
    if (old) {
      used.add(old);
      const ev = Object.assign({}, imp, {id: old.id || imp.id});
      carryEnrichment(ev, old);
      out.push(ev);
      summary.refreshed++;
    } else {
      pending.push(imp);
    }
  });
  // Pass 2: hand events, nearest first, each adopted at most once.
  const pairs = [];
  pending.forEach((imp, i) => {
    hand.forEach((h, j) => {
      if (h.type !== imp.type || h.side !== imp.side) return;
      if (!samePlayer(imp, h)) return;
      const gap = h.minute ? minuteGap(h.minute, imp.minute) : null;
      if (gap !== null && gap > ADOPT_MINUTES) return;
      pairs.push({i, j, gap: gap === null ? ADOPT_MINUTES + 1 : gap});
    });
  });
  pairs.sort((a, b) => (a.gap - b.gap) || (a.i - b.i) || (a.j - b.j));
  const takenImp = new Set();
  const takenHand = new Set();
  // A hand event with no minute is adopted only when it is the one candidate.
  const noMinuteCount = {};
  pairs.forEach((p) => {
    if (p.gap > ADOPT_MINUTES) noMinuteCount[p.j] = (noMinuteCount[p.j] || 0) + 1;
  });
  pairs.forEach((p) => {
    if (takenImp.has(p.i) || takenHand.has(p.j)) return;
    if (p.gap > ADOPT_MINUTES && noMinuteCount[p.j] > 1) return;
    takenImp.add(p.i);
    takenHand.add(p.j);
    const h = hand[p.j];
    used.add(h);
    const ev = Object.assign({}, pending[p.i], {id: h.id || pending[p.i].id});
    carryEnrichment(ev, h);
    out.push(ev);
    summary.adopted++;
  });
  pending.forEach((imp, i) => {
    if (takenImp.has(i)) return;
    out.push(Object.assign({}, imp));
    summary.added++;
  });
  prev.forEach((e) => {
    if (used.has(e)) return;
    if (e.src === "fcf" || ACTA_EVENT_TYPES.indexOf(e.type) !== -1) {
      summary.removed++;
      return;
    }
    out.push(e);
    summary.kept++;
  });
  return {events: sortEvents(out), summary};
}

/**
 * What the acta fixes, per event — the ledger the guard compares against.
 * FCF ids and numbers, NEVER `playerId`: linking a player later fills uids
 * in, and deleteMember blanks them, and neither is an edit to the acta.
 */
function actaFacts(events) {
  return (events || []).filter((e) => e && e.src === "fcf").map((e) => ({
    k: e.fcfKey,
    type: e.type,
    side: e.side,
    minute: e.minute || "",
    ids: e.type === "change" ? [e.fcfPlayerInId || "", e.fcfPlayerOutId || ""] : [e.fcfPlayerId || ""],
    pen: e.goalType === "penal",
  })).sort((a, b) => String(a.k).localeCompare(String(b.k)));
}

/** True when `events` still say exactly what the ledger's facts say, and no
 *  hand-entered goal, card or substitution has crept back in. */
function actaFactsIntact(events, facts) {
  const now = actaFacts(events);
  if (now.length !== (facts || []).length) return false;
  if ((events || []).some((e) => e && e.src !== "fcf" && ACTA_EVENT_TYPES.indexOf(e.type) !== -1)) {
    return false;
  }
  return JSON.stringify(now) === JSON.stringify(facts);
}

/**
 * Our acta players, compact, for the match row (`fcfActa.lineup`).
 *
 * The Partit page reads it as the "link players" list, and linkFcfPlayer
 * reads it back to put a newly linked player where the acta says he was.
 * `{f: fcfId, n: display name ('' hidden), d: dorsal, t: 1 starter,
 *   on: minute he came on, u: uid ('' unlinked), x: 1 ignored, a: 1 linked by
 *   the import itself (not a person), c: [uid]}`;
 * `c` (suggestions) only while unlinked.
 */
function actaLineup(acta, opts) {
  const o = opts || {};
  const ourSide = o.ourSide === "away" ? "away" : "home";
  const resolve = o.resolve || {};
  const onAt = {};
  (acta.subs || []).forEach((s) => {
    if (s.side === ourSide && onAt[s.inId] === undefined) onAt[s.inId] = s.minute;
  });
  return (acta.players || []).filter((p) => p.side === ourSide).map((p) => {
    const r = resolve[p.id] || {};
    const row = {
      f: p.id,
      n: p.hidden ? "" : fcfPersonName(p.name).display,
      d: p.dorsal || "",
      t: p.titular ? 1 : 0,
      on: onAt[p.id] === undefined ? "" : onAt[p.id],
      u: r.uid || "",
      x: r.ignored ? 1 : 0,
      a: r.how === "auto" || r.source === "auto" ? 1 : 0,
    };
    if (!row.u) row.c = (r.cand || []).slice(0, 5);
    return row;
  });
}

/**
 * Fill a match's convocatòria entry from the acta line-up, where the coach
 * left a gap:
 *
 *  - `startingXI`: the linked starters, only when it is empty.
 *  - `players` (the call-up): every linked acta player when it is empty;
 *    otherwise the linked players who actually PLAYED and are missing —
 *    a starter the coach forgot to call up would otherwise show "NC" and
 *    no minutes, because minutes are only counted for the call-up.
 *
 * `fcfFill` remembers which of those the import did, so a later link may
 * add to them too. Returns a NEW entry, or null when there is nothing to
 * write — an entry is never created empty, because the app reads the mere
 * existence of one as "call-up sent".
 */
function applyActaLineup(entry, lineup) {
  let e = entry;
  if (Array.isArray(e)) e = {players: e.slice()};
  const existed = !!e;
  e = Object.assign({}, e || {});
  const players = Array.isArray(e.players) ? e.players.map(String) : [];
  const xi = Array.isArray(e.startingXI) ? e.startingXI.map(String) : [];
  const fill = Object.assign({xi: false, players: false, added: []}, e.fcfFill || {});
  const linked = (lineup || []).filter((r) => r.u);
  if (!existed && !linked.length) return null;
  const starters = linked.filter((r) => r.t).map((r) => r.u);
  // A list the import filled earlier is the import's to refill: a player
  // linked since belongs in it.
  if ((!xi.length || fill.xi) && starters.length) {
    e.startingXI = starters.slice(0, 11);
    fill.xi = true;
  } else {
    e.startingXI = xi;
  }
  if (!players.length || fill.players) {
    const add = linked.map((r) => r.u).filter((u) => players.indexOf(u) === -1);
    e.players = players.concat(add);
    fill.players = e.players.length > 0;
  } else {
    const played = linked.filter((r) => r.t || r.on !== "").map((r) => r.u);
    const add = played.filter((u) => players.indexOf(u) === -1);
    e.players = players.concat(add);
    fill.added = Array.from(new Set((fill.added || []).concat(add)));
  }
  e.fcfFill = fill;
  return e;
}

/* ── When to try ─────────────────────────────────────────────────────────
   First attempt 45 minutes after the match ends (kick-off + 120, the
   app's DEFAULT_MATCH_MINS). A referee closes the acta from his phone at
   the ground, usually within the hour, sometimes that night, occasionally
   days later; the gaps widen accordingly and give up 72 h after kick-off.
   The daily FCF sync re-arms anything still missing for ten days. */
const ACTA_FIRST_DELAY_MINS = 45;
const ACTA_RETRY_GAPS_MINS = [15, 15, 30, 30, 60, 60, 120, 240, 480];
const ACTA_RETRY_LATE_MINS = 720;
const ACTA_GIVE_UP_HOURS = 72;
const ACTA_REARM_DAYS = 10;

/** When attempt number `attempts` (0-based count of tries so far) is due,
 *  given the previous try at `lastMs`; null once past the give-up horizon. */
function nextActaAttemptMs(attempts, lastMs, kickoffMs) {
  const gap = attempts < ACTA_RETRY_GAPS_MINS.length ?
    ACTA_RETRY_GAPS_MINS[attempts] : ACTA_RETRY_LATE_MINS;
  const next = lastMs + gap * 60000;
  if (next > kickoffMs + ACTA_GIVE_UP_HOURS * 3600000) return null;
  return next;
}

/** Which of a squad's rows should be in the import queue, and from when.
 *  `kickoffMsOf(row)` / `endMsOf(row)` convert with the server's Madrid
 *  clock (index.js); rows they cannot time are skipped. */
function planActaQueue(rows, opts) {
  const o = opts || {};
  const now = Number(o.nowMs) || 0;
  const out = [];
  (rows || []).forEach((r) => {
    if (!r || !r.fcfActaId || r.fcfRemoved || r.fcfActa) return;
    const kick = o.kickoffMsOf(r);
    const end = o.endMsOf(r);
    if (!kick || !end) return;
    if (kick < now - ACTA_REARM_DAYS * 86400000 || kick > now + 8 * 86400000) return;
    out.push({matchId: r.id, actaId: String(r.fcfActaId), kickoffAt: kick,
      dueAt: end + ACTA_FIRST_DELAY_MINS * 60000});
  });
  return out;
}

module.exports = {
  ACTA_EVENT_TYPES,
  ADOPT_MINUTES,
  foldName,
  nameTokens,
  fcfPersonName,
  scoreCandidate,
  resolveActaPlayers,
  fcfActaToEvents,
  mergeActaEvents,
  carryEnrichment,
  actaFacts,
  actaFactsIntact,
  actaLineup,
  applyActaLineup,
  assistAllowed,
  ourSideOfRow,
  scoreOfEvents,
  minuteValue,
  minuteGap,
  nextActaAttemptMs,
  planActaQueue,
  ACTA_FIRST_DELAY_MINS,
  ACTA_GIVE_UP_HOURS,
  ACTA_REARM_DAYS,
};
