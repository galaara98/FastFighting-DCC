/**
 * DCC's spell duels by the book's tables, where the book is installed (the core's rules.duelResult, API 34): the
 * spell check comparison (which die the exchange rolls, or a phlogiston disturbance), counterspell power (the die plus
 * the winner's momentum over the loser's: what becomes of each spell) and phlogiston disturbance. The rows are the
 * book's own, read at run time (tables.js duel) by reading/<lang>.json's `duel` words; nothing of them is copied here.
 * Momentum is each duellist's, 10 at first, one more for each exchange it wins, as the dcc system keeps it
 * (dcc-core-lib resolveCounterspellExchange). Without the book's tables the core compares the checks.
 * Pure: no Foundry globals; the tables reach a planner's worker as data (rules.js dccRulesFor).
 */
import { t } from "./words.js";

/** The comparison table's checks: below and above are read as its first and last. */
export const COMPARE_LOW = 12;
export const COMPARE_HIGH = 28;
/** Each duellist's momentum at the start. */
export const STARTING_MOMENTUM = 10;

/** A reading pattern, compiled (none, or a bad one, never matches). */
function pattern(source, flags = "i") {
  if ( typeof source !== "string" || !source ) return null;
  try {
    return new RegExp(source, flags);
  } catch ( err ) {
    return null;
  }
}
/** The tables as the world has them, once read (adapter.js): rules.js hands them to reckonDuel. */
let current = null;
export const setDuelTables = tables => { current = tables ?? null; };
export const currentDuelTables = () => current;

const plainRow = text => String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\[\[\/r(?:oll)?\s+([^\]]+)\]\]/gi, "$1").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** A row's name, as the book gives it ("Push-through d4"): the words before its first colon or full stop. */
function labelOf(text, re) {
  const m = re?.label ? plainRow(text).match(re.label) : null;
  return (m?.groups?.label ?? "").trim();
}

/**
 * One counterspell power row as what becomes of each spell: {min, max, label, faces (the die it rolls, or 0), spell,
 * counter}, each of spell and counter {cancel, lower, reflect}.
 */
export function powerRow(row, re) {
  const text = plainRow(row.text);
  const test = key => !!re?.[key]?.test(text);
  const dice = re?.dice ? text.match(re.dice) : null;
  const lowerSpell = test("lowerSpell");
  const lowerCounter = test("lowerCounter");
  return {
    min: Number(row.range?.[0]), max: Number(row.range?.[1] ?? row.range?.[0]), label: labelOf(row.text, re),
    faces: (lowerSpell || lowerCounter) && dice ? Number(dice.groups?.faces) || 0 : 0,
    spell: { cancel: test("spellCancelled"), lower: lowerSpell, reflect: test("spellReflected") },
    counter: { cancel: test("counterCancelled"), lower: lowerCounter, reflect: test("counterReflected") }
  };
}

/**
 * The book's three duel tables in the engine's terms, or null without them all: {compare: {defender: {attacker: die}},
 * attackerHigh, defenderHigh (power rows), disturbance: [{min, max, label, sitOut}], disturbanceFaces}.
 * @param {{compare, attackerHigh, defenderHigh, disturbance}} raw   each a table's rows, [{range, text}]
 * @param {object} words   the reading (reading/<lang>.json), its `duel` section
 */
export function duelTablesFrom(raw, words) {
  const d = words?.duel ?? {};
  const re = Object.fromEntries(["dice", "lowerSpell", "lowerCounter", "spellCancelled", "counterCancelled", "spellReflected", "counterReflected", "label", "sitOut", "compareCell"]
    .map(k => [k, pattern(d[k], k === "compareCell" ? "gi" : "i")]));
  if ( !raw?.compare?.length || !raw.attackerHigh?.length || !raw.defenderHigh?.length || !raw.disturbance?.length || !re.compareCell ) return null;
  const compare = {};
  for ( const row of raw.compare ) {
    const defender = Number(row.range?.[0]);
    if ( !Number.isFinite(defender) ) continue;
    const cells = {};
    for ( const m of plainRow(row.text).matchAll(re.compareCell) ) cells[Number(m.groups?.attacker)] = String(m.groups?.die ?? "").toLowerCase();
    if ( Object.keys(cells).length ) compare[defender] = cells;
  }
  if ( !Object.keys(compare).length ) return null;
  const disturbance = raw.disturbance.map(row => {
    const text = plainRow(row.text);
    const dice = re.sitOut?.test(text) && re.dice ? text.match(re.dice) : null;
    return { min: Number(row.range?.[0]), max: Number(row.range?.[1] ?? row.range?.[0]), label: labelOf(row.text, re), sitOut: dice ? { n: Number(dice.groups?.n) || 1, faces: Number(dice.groups?.faces) || 0 } : null };
  });
  return {
    compare,
    attackerHigh: raw.attackerHigh.map(r => powerRow(r, re)),
    defenderHigh: raw.defenderHigh.map(r => powerRow(r, re)),
    disturbance,
    disturbanceFaces: Math.max(...disturbance.map(r => r.max).filter(Number.isFinite))
  };
}

const clampCheck = n => Math.max(COMPARE_LOW, Math.min(COMPARE_HIGH, Math.round(Number(n) || 0)));
const rowFor = (rows, n) => rows.find(r => n >= r.min && n <= r.max) ?? (n > Math.max(...rows.map(r => r.max)) ? rows.at(-1) : rows[0]);

/** The die an exchange rolls: "d3" ... "d16", or "pd" (a phlogiston disturbance). By the defender's row, then the attacker's. */
export function comparisonDie(tables, attacker, defender) {
  return tables?.compare?.[clampCheck(defender)]?.[clampCheck(attacker)] ?? (clampCheck(attacker) === clampCheck(defender) ? "pd" : null);
}

/** A die rolled for the duel, as a table roll a live battle shows (the core's recording rng). */
function rolled(run, faces, n, { by, target, label }) {
  const at = run.rng.mark?.();
  let total = 0;
  for ( let i = 0; i < Math.max(1, n); i++ ) total += run.rng.die(faces);
  if ( at !== undefined ) run.rng.record(at, { by, target, kind: "other", label });
  return total;
}

/** Each duellist's momentum (10 at first), kept on it for the rest of the fight. */
const momentumOf = u => u.dccMomentum ?? STARTING_MOMENTUM;

/**
 * One exchange of a spell duel by the book's tables (rules.js duelResult): the caster's spell (`total`) answered by
 * `by`'s (`answer`). Null where the core's comparison stands: no tables, or the answer's own check failed.
 * Invocations of the same patron cancel each other (`samePatron`, the caller's to tell).
 * @returns {{spell, counter, effects, label, disturbance}|null}
 */
export function reckonDuel(run, { caster, by, total, answer, samePatron = false }, tables) {
  if ( !tables || !Number.isFinite(answer) ) return null;
  const roll = (faces, n, label) => rolled(run, faces, n, { by, target: caster, label });
  if ( samePatron ) {
    return { spell: { total: null }, counter: { total: null }, label: t("Duel.SamePatron") };
  }
  const die = comparisonDie(tables, total, answer);
  if ( !die ) return null;
  // (The higher check wins the exchange: a point of momentum. The same check, nobody.)
  if ( total > answer ) caster.dccMomentum = momentumOf(caster) + 1;
  else if ( answer > total ) by.dccMomentum = momentumOf(by) + 1;
  if ( die === "pd" ) {
    const n = roll(tables.disturbanceFaces, 1, t("Rolls.Disturbance"));
    const row = rowFor(tables.disturbance, n);
    const effects = [];
    if ( row?.sitOut?.faces ) {
      // (Both caught out of time: so many rounds go by before either can act again.)
      const rounds = roll(row.sitOut.faces, row.sitOut.n, t("Rolls.Disturbance"));
      for ( const u of [caster, by] ) effects.push({ unitId: u.id, outcome: { conditions: { incapacitated: 1 }, rounds, label: row.label } });
    }
    return { spell: { total: null }, counter: { total: null }, effects, label: row?.label ?? "", disturbance: true };
  }
  const attackerHigh = total >= answer;
  const faces = Number(die.replace(/^d/, "")) || 3;
  const edge = attackerHigh ? momentumOf(caster) - momentumOf(by) : momentumOf(by) - momentumOf(caster);
  const n = Math.max(1, roll(faces, 1, t("Rolls.CounterspellPower")) + edge);
  const row = rowFor(attackerHigh ? tables.attackerHigh : tables.defenderHigh, n);
  if ( !row ) return null;
  const less = row.faces && (row.spell.lower || row.counter.lower) ? roll(row.faces, 1, t("Rolls.CounterspellPower")) : 0;
  const fate = (own, at) => (own.cancel ? { total: null } : { total: at - (own.lower ? less : 0), ...(own.reflect ? { reflect: true } : {}) });
  return { spell: fate(row.spell, total), counter: fate(row.counter, answer), label: row.label };
}
