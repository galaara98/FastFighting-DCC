/**
 * Mighty Deeds of Arms: what a warrior (or dwarf, or anyone with a deed die) can try with each attack. A deed works
 * when the attack hits and the deed die shows 3 or more, and the higher the better.
 *
 * Read from the world's Mighty Deed tables when a book has them (trips and throws, blinding attacks, disarming
 * attacks, defensive maneuvers, rallying maneuvers: the ones that change a fight), else rough built-in versions of
 * the same. A rally puts heart into the warrior's friends nearby: a better swing next, more at a higher deed.
 * Pushbacks and precision shots don't show in this kind of fight and aren't tried.
 * Pure.
 */
import { outcomeIn } from "./text.js";

const KINDS = {
  trip: { id: "trip", label: "Trip", melee: true, condition: { prone: 1 }, label2: "knocked down" },
  blind: { id: "blind", label: "Blinding attack" },
  disarm: { id: "disarm", label: "Disarming attack", melee: true, condition: { disarmed: 1 }, label2: "disarmed" },
  defend: { id: "defend", label: "Defensive maneuver", self: true },
  rally: { id: "rally", label: "Rallying maneuver", allies: 10 }
};

/** Rough versions for when no book's tables are installed. */
const BUILT_IN = {
  trip: [{ min: 3, outcome: { conditions: { prone: 1 }, rounds: 1, label: "knocked down" } }, { min: 5, outcome: { conditions: { prone: 1 }, mods: { attack: -2 }, rounds: 2, label: "thrown down" } }],
  blind: [{ min: 3, outcome: { mods: { attack: -2 }, rounds: 1, label: "dazzled (-2 to attacks)" } }, { min: 5, outcome: { conditions: { blinded: 1 }, rounds: 2, label: "blinded" } }, { min: 7, outcome: { conditions: { blinded: 1 }, rounds: 5, label: "blinded" } }],
  disarm: [{ min: 4, outcome: { conditions: { disarmed: 1 }, rounds: 1, label: "disarmed" } }, { min: 6, outcome: { conditions: { disarmed: 1 }, rounds: 3, label: "disarmed" } }],
  defend: [{ min: 3, outcome: { mods: { ac: 1 }, rounds: 1, label: "+1 AC", self: true } }, { min: 5, outcome: { mods: { ac: 2 }, rounds: 1, label: "+2 AC", self: true } }, { min: 7, outcome: { mods: { ac: 3 }, rounds: 1, label: "+3 AC", self: true } }],
  rally: [
    { min: 3, outcome: { mods: { attack: 1 }, uses: 1, rounds: 1, label: "rallied (+1 to the next attack)", allies: 10 } },
    { min: 5, outcome: { mods: { attack: 2 }, uses: 1, rounds: 1, label: "rallied (+2 to the next attack)", allies: 20 } },
    { min: 7, outcome: { mods: { attack: 2, saves: 2 }, rounds: 1, label: "rallied (+2 to attacks and saves)", allies: 30 } }
  ]
};

/**
 * The deeds a creature can try.
 * @param {Record<string, {range, text}[]>|null} tables  the world's deed tables by kind, if any
 * @returns {object[]} deeds for spec.deeds (see the core's riders.js)
 */
export function deedsFrom(tables) {
  const out = [];
  for ( const [kind, base] of Object.entries(KINDS) ) {
    const rows = tables?.[kind];
    let tiers = rows?.length ? rows.map(r => tierFrom(base, r)).filter(Boolean) : [];
    if ( !tiers.length ) tiers = BUILT_IN[kind].map(t => ({ ...t, outcome: { ...t.outcome } }));
    out.push({ id: base.id, label: base.label, melee: base.melee, tiers: tiers.sort((a, b) => a.min - b.min) });
  }
  return out;
}

/** One deed table row as a tier: what it does to the foe (or, for a defensive deed, for the warrior). */
function tierFrom(base, row) {
  const min = Number(row.range?.[0]);
  if ( !Number.isFinite(min) ) return null;
  const read = outcomeIn(row.text, { defaultRounds: 1 });
  let outcome = read ? { ...read } : null;
  delete outcome?.slay;
  // A trip is a fall, a disarm a dropped weapon, whatever else the row adds.
  if ( base.condition ) outcome = { rounds: 1, ...(outcome ?? {}), conditions: { ...(outcome?.conditions ?? {}), ...base.condition }, label: outcome?.label && outcome.label !== "affected" ? outcome.label : base.label2 };
  if ( !outcome ) return null;
  // Not quite blind yet: dust and blood in the eyes.
  if ( base.id === "blind" && !outcome.conditions?.blinded ) outcome.label = `dazzled (${outcome.label.replace(/^\w+ \(|\)$/g, "")})`;
  if ( base.allies ) {
    // A rally: the bonuses it lends the warrior's friends (to attacks, saves or AC), for those near enough.
    const lent = Object.fromEntries(Object.entries(outcome.mods ?? {}).filter(([k, v]) => ["attack", "saves", "ac"].includes(k) && v > 0));
    if ( !Object.keys(lent).length ) return null;
    return { min, outcome: { mods: lent, rounds: outcome.rounds ?? 1, label: `rallied (${Object.entries(lent).map(([k, v]) => `+${v} ${k === "ac" ? "AC" : k}`).join(", ")})`, allies: base.allies * Math.max(1, Math.floor(min / 3)) } };
  }
  if ( base.self ) {
    // Defensive: only the bonus to AC, for the warrior.
    if ( !(outcome.mods?.ac > 0) ) return null;
    outcome = { mods: { ac: outcome.mods.ac }, rounds: outcome.rounds ?? 1, label: `+${outcome.mods.ac} AC`, self: true };
  }
  return { min, outcome };
}
