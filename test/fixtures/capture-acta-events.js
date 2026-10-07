/* Regenerates the acta-EVENT fixtures next to this file (v278).
 *
 *   node test/fixtures/capture-acta-events.js
 *
 * parseFcfActaEvents reads the React Server Component payload of an acta,
 * not its HTML, so that is all that is kept: the `self.__next_f.push` rows
 * reachable from the root, re-serialised and re-wrapped. Everything the
 * parser does not walk (module rows, the site chrome's unreachable rows)
 * is dropped.
 *
 * ⚠ THIS REPO IS PUBLIC. Unlike capture-acta.js's windows, these fixtures
 * must contain whole line-ups — that is what is being parsed — so every
 * PERSON on them is rewritten: players (`nombre` and the same string as
 * text), coaches and referees, each consistently to the next invented name
 * in fake-names.js, and every federation player id to an invented id. Team
 * names, the ground and the date are the federation's public fixture list
 * and stay. fcf-acta-events.test.js fails if a fixture holds a person's
 * name that is not an invented one.
 *
 * The rewritten payload is re-split into several push() chunks at
 * arbitrary points, so rows straddle chunks the way they do live, and
 * text rows get their byte lengths recomputed after the rewrite.
 */
const fs = require("fs");
const path = require("path");
const {FAKE_NAMES, FAKE_SINGLE} = require("./fake-names");
const {fcfRscPayload} = require("../../functions/fcf");

const WANTED = [
  ["acta-events-own-goal.html", 4119501,
    "Tercera 2026-27 J1, 1-0: an own goal decides it; a hidden player's yellow; 5+5 subs."],
  ["acta-events-penalty-red.html", 4119504,
    "Tercera 2026-27 J1, 2-3: a penalty, a direct red, two yellows in the same minute, " +
    "a yellow at '(Final)', a coach's red."],
  ["acta-events-double.html", 4119510,
    "Tercera 2026-27 J1, 1-1: a second yellow eighteen minutes after the first; five players " +
    "registered under one name."],
  ["acta-events-suspended.html", 4119507, "Tercera 2026-27 J1: SUSPÈS — not closed."],
  ["acta-events-pending.html", 4119640, "Tercera 2026-27, not yet played: PENDENT."],
  ["acta-events-old.html", 3833222,
    "Tercera 2025-26: two double yellows; staff cards; no substitutions published."],
  ["acta-events-awarded.html", 3833178,
    "Tercera 2025-26: 0-3 over 'No hi ha gols registrats' — a result awarded, not scored."],
  ["acta-events-unplayed.html", 4119514,
    "Tercera 2026-27: 'Acta Tancada' with '- - -' and no line-ups — closed, never played."],
];

/* `node capture-acta-events.js <file> …` captures only those — a fixture of
   a match not yet played must not be refreshed into a different one by
   re-running the whole list. */
const ONLY = process.argv.slice(2);

/** Rows in order, raw: {id, kind: 'json'|'text'|'skip', value}. */
function splitRows(payload) {
  const buf = Buffer.from(payload, "utf8");
  const rows = [];
  let i = 0;
  while (i < buf.length) {
    const colon = buf.indexOf(0x3a, i);
    if (colon === -1) break;
    const id = buf.toString("utf8", i, colon);
    if (!/^[0-9a-f]{1,8}$/.test(id)) {
      const nl = buf.indexOf(0x0a, i);
      if (nl === -1) break;
      i = nl + 1;
      continue;
    }
    const head = buf.toString("latin1", colon + 1, Math.min(buf.length, colon + 24));
    const t = /^T([0-9a-f]{1,8}),/.exec(head);
    if (t) {
      const start = colon + 1 + t[0].length;
      const len = parseInt(t[1], 16);
      rows.push({id, kind: "text", value: buf.toString("utf8", start, start + len)});
      i = start + len;
      continue;
    }
    const nl = buf.indexOf(0x0a, colon + 1);
    const end = nl === -1 ? buf.length : nl;
    const line = buf.toString("utf8", colon + 1, end);
    i = end + 1;
    let value;
    try {
      value = JSON.parse(line);
    } catch (e) {
      rows.push({id, kind: "skip"});
      continue;
    }
    rows.push({id, kind: /^[A-Z]{1,2}\[/.test(line) ? "skip" : "json", value});
  }
  return rows;
}

/** Ids reachable from row 0 through "$L…", "$@…", "$…" and "$…:path" refs. */
function reachable(rows) {
  const byId = {};
  rows.forEach((r) => {
    byId[r.id] = r;
  });
  const seen = new Set(["0"]);
  const todo = ["0"];
  const scan = (v) => {
    if (typeof v === "string") {
      const m = /^\$[L@]?([0-9a-f]{1,8})(?::|$)/.exec(v);
      if (m && byId[m[1]] && !seen.has(m[1])) {
        seen.add(m[1]);
        todo.push(m[1]);
      }
      return;
    }
    if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === "object") Object.keys(v).forEach((k) => scan(v[k]));
  };
  while (todo.length) {
    const r = byId[todo.pop()];
    if (r && r.kind === "json") scan(r.value);
  }
  return seen;
}

const COMMA_PERSON = /^[A-ZÀ-ÝÑÇ][A-ZÀ-ÝÑÇ'’·.\- ]*\s*,\s*[A-ZÀ-ÝÑÇ][A-ZÀ-ÝÑÇ'’·.\- ]*$/;
const ROLE_LABELS = new Set(["PREPARADOR FÍSIC, MERGE O A.T.S"]);

function anonymise(rows) {
  const teams = new Set();
  const people = [];
  const ids = [];
  const walk = (v, fn) => {
    if (Array.isArray(v)) return v.map((x) => walk(x, fn));
    if (v && typeof v === "object") {
      const out = {};
      Object.keys(v).forEach((k) => {
        out[k] = walk(v[k], fn);
      });
      return fn(out);
    }
    return fn(v);
  };
  // Pass 1: who is on the sheet.
  rows.forEach((r) => {
    if (r.kind !== "json") return;
    walk(r.value, (v) => {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        ["localName", "visitorName", "teamName"].forEach((k) => {
          if (typeof v[k] === "string") teams.add(v[k]);
        });
        if (v.player && typeof v.player === "object") {
          if (v.player.nombre && v.player.nombre !== "Jugador/a" && people.indexOf(v.player.nombre) === -1) {
            people.push(v.player.nombre);
          }
          if (v.player.id && ids.indexOf(String(v.player.id)) === -1) ids.push(String(v.player.id));
        }
      }
      return v;
    });
  });
  rows.forEach((r) => {
    if (r.kind !== "json") return;
    walk(r.value, (v) => {
      if (typeof v === "string") {
        const s = v.trim();
        if (COMMA_PERSON.test(s) && !teams.has(s) && !ROLE_LABELS.has(s) &&
            !/\b(F\.?C|C\.?F|U\.?D|U\.?E|C\.?E|A\.?E|S\.?D|C\.?D|E\.?F|A\.?D)\.?$/.test(s) &&
            people.indexOf(s) === -1) {
          people.push(s);
        }
      }
      return v;
    });
  });
  const nameMap = {};
  let full = 0;
  let single = 0;
  people.forEach((p) => {
    nameMap[p] = p.indexOf(",") === -1 ? FAKE_SINGLE[single++] : FAKE_NAMES[full++];
  });
  const idMap = {};
  ids.forEach((id, i) => {
    idMap[id] = String(800001 + i);
  });
  // Pass 2: rewrite.
  rows.forEach((r) => {
    if (r.kind === "text") {
      Object.keys(nameMap).forEach((p) => {
        r.value = r.value.split(p).join(nameMap[p]);
      });
      return;
    }
    if (r.kind !== "json") return;
    r.value = walk(r.value, (v) => {
      if (typeof v === "string") {
        const s = v.trim();
        return nameMap[s] !== undefined ? v.replace(s, nameMap[s]) : v;
      }
      if (v && typeof v === "object" && !Array.isArray(v) && v.player && typeof v.player === "object") {
        const p = Object.assign({}, v.player);
        if (idMap[String(p.id)]) p.id = idMap[String(p.id)];
        v.player = p;
      }
      return v;
    });
  });
  return {people: people.length, ids: ids.length};
}

/* Attributes the parser never reads, and the class tokens it does. A live
   payload is ~250 KB, a third of it the site's translation table and most of
   the rest Tailwind classes and SVG path data; trimmed, the line-ups are
   still exactly the federation's structure, at a fraction of the size. */
const KEEP_CLASS = /^(bg-\[#[0-9A-Fa-f]{6}\]|rounded-\[2px\]|w-\[\d+px\]|h-\[\d+px\])$/;
const DROP_PROPS = new Set(["style", "d", "viewBox", "xmlns", "fill", "strokeLinecap",
  "strokeLinejoin", "width", "height", "src", "alt", "sizes", "loading", "href",
  "competitionName", "codgrupo", "temporada", "localShield", "visitorShield"]);

function trim(v) {
  if (Array.isArray(v)) {
    if (v[0] === "$" && typeof v[1] === "string" && v[3] && typeof v[3] === "object" &&
        !Array.isArray(v[3])) {
      const props = {};
      Object.keys(v[3]).forEach((k) => {
        if (DROP_PROPS.has(k)) return;
        if (k === "messages") {
          props[k] = {};
          return;
        }
        if (k === "className") {
          const keep = String(v[3][k]).split(/\s+/).filter((c) => KEEP_CLASS.test(c));
          if (keep.length) props[k] = keep.join(" ");
          return;
        }
        props[k] = trim(v[3][k]);
      });
      return [v[0], v[1], v[2], props].concat(v.slice(4));
    }
    return v.map(trim);
  }
  if (v && typeof v === "object") {
    const out = {};
    Object.keys(v).forEach((k) => {
      out[k] = trim(v[k]);
    });
    return out;
  }
  return v;
}

function serialise(rows, keep) {
  let out = "";
  rows.forEach((r) => {
    if (!keep.has(r.id) || r.kind === "skip") return;
    if (r.kind === "text") {
      out += r.id + ":T" + Buffer.byteLength(r.value, "utf8").toString(16) + "," + r.value;
    } else {
      out += r.id + ":" + JSON.stringify(trim(r.value)) + "\n";
    }
  });
  return out;
}

function wrap(payload, note) {
  // Five chunks at fixed fractions — inside rows, as live pages split them.
  const cuts = [0, 0.13, 0.37, 0.61, 0.86, 1].map((f) => Math.floor(payload.length * f));
  const chunks = [];
  for (let k = 0; k + 1 < cuts.length; k++) chunks.push(payload.slice(cuts[k], cuts[k + 1]));
  return "<!DOCTYPE html><!-- " + note.replace(/--/g, "—") + " -->\n<html><body>\n" +
    chunks.map((c) => "<script>self.__next_f.push([1," +
      JSON.stringify(c).replace(/<\//g, "<\\/") + "])</script>").join("\n") +
    "\n</body></html>\n";
}

async function main() {
  for (const [name, actaId, note] of WANTED) {
    if (ONLY.length && ONLY.indexOf(name) === -1) continue;
    const res = await fetch("https://www.fcf.cat/ca/competicio/acta/" + actaId,
        {headers: {"User-Agent": "EsquerrApp fixture capture"}});
    const html = await res.text();
    const payload = fcfRscPayload(html);
    if (!payload) throw new Error("no RSC payload in " + actaId);
    const rows = splitRows(payload);
    const keep = reachable(rows);
    const n = anonymise(rows);
    const out = wrap(serialise(rows, keep), "acta " + actaId + " — " + note +
      " Names and player ids rewritten by capture-acta-events.js.");
    fs.writeFileSync(path.join(__dirname, name), out);
    console.log(name, (out.length / 1024).toFixed(0) + " KB", n);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {splitRows, reachable, anonymise, serialise, wrap};
