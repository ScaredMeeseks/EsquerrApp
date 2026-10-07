/* The invented people the acta-event fixtures are rewritten to (v278).
 *
 * capture-acta-events.js replaces every real name on a captured acta —
 * players, coaches, referees — with the next one of these, and the
 * anonymity test in fcf-acta-events.test.js accepts no other person's name
 * in a committed fixture. Deterministic, so a re-capture of the same actas
 * produces the same file. Accents and a particle are in there on purpose:
 * the parser and the display-name rules are tested on them.
 */
const SURNAMES = ["PUIG", "FERRER", "SOLER", "VIDAL", "ROCA", "SERRA", "FONT",
  "PRAT", "RIERA", "COLL", "VILA", "PONS", "SALA", "CODINA", "BADIA", "GRAU",
  "MARTÍ", "NÚÑEZ", "GARCÍA", "LÓPEZ", "ROMERO", "DÍAZ", "MORENO", "MUÑOZ",
  "ALONSO", "GUTIÉRREZ", "NAVARRO", "TORRES", "DOMÍNGUEZ", "VÁZQUEZ",
  "RAMOS", "GIL", "SERRANO", "BLANCO", "MOLINA", "MORALES", "SUÁREZ",
  "ORTEGA", "DELGADO", "CASTRO", "ORTIZ", "RUBIO", "MARÍN", "SANZ", "IGLESIAS",
  "MEDINA", "GARRIDO", "CORTÉS", "CASTILLO", "SANTOS", "LOZANO", "GUERRERO",
  "CANO", "PRIETO", "MÉNDEZ", "CRUZ", "CALVO", "GALLEGO", "VIDAL", "LEÓN",
  "DE LA TORRE", "HERRERA", "PEÑA", "FLORES", "CABRERA", "CAMPOS", "VEGA"];
const GIVEN = ["ARNAU", "POL", "MARC", "JAN", "NIL", "BIEL", "ORIOL", "ÀLEX",
  "ÈRIC", "JOAN", "PAU", "GERARD", "ADRIÀ", "SERGI", "DAVID", "ROGER", "BERNAT",
  "QUIM", "IAN", "LEO", "HUGO", "MARTÍ", "ÓSCAR", "IKER", "TONI", "JORDI",
  "XAVIER", "ENRIC", "ALBERT", "FERRAN", "JAUME", "GUILLEM", "ISMAEL", "NICO",
  "JOSEP MARIA", "JUAN CARLOS", "LUIS-MIGUEL"];

/** The n-th invented "COGNOM1 COGNOM2, NOM" (0-based), all distinct. */
function fakeName(n) {
  const s1 = SURNAMES[n % SURNAMES.length];
  const s2 = SURNAMES[(n * 7 + 3) % SURNAMES.length];
  const g = GIVEN[(n * 5 + Math.floor(n / SURNAMES.length)) % GIVEN.length];
  return s1 + " " + (s2 === s1 ? "BOSCH" : s2) + ", " + g;
}

const FAKE_NAMES = Array.from({length: 400}, (_, i) => fakeName(i));

/* Some players are registered under ONE name, with no comma ("IVÁN" —
   five of them on 4119510). They are rewritten to one of these, so the
   fixture keeps the shape the parser has to cope with. */
const FAKE_SINGLE = ["TEO", "ROC", "GAEL", "LUCA", "ALEIX", "BRUNO", "DÍDAC",
  "EIDAN", "ÍKER", "LIAM", "MATEO", "NOAH", "OLIVER", "PAULO", "QUIQUE"];

module.exports = {fakeName, FAKE_NAMES, FAKE_SINGLE};
