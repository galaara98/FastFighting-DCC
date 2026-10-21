/**
 * The dcc system's statuses as the engine's conditions (commit.js writes and reads them; rules.js lets go of what a
 * status brought once it's gone). Pure: no Foundry globals, so the rules load on the planner's background workers.
 */

/**
 * The dcc system's statuses and the engine's conditions, one for one (the core's key where it has one, DCC's own where
 * not: held): a live battle writes the condition as the status, on and off, and reads the status back as the same
 * condition. Read, a status also brings what its condition means to the engine and the DCC rules (`also`): asleep,
 * paralyzed or out cold, it can't act at all (the engine's incapacitated); held, it can't move (immobilized).
 * Some are in one palette only: slowed in XCC's (its status effects on), disarmed in the dcc system's (XCC's leaves it
 * out). XCC's grappled is the core's grabbed (someone's grip on it: written and read as that), and it can't move; but
 * not everything that holds one still is a grapple (a web, a spell), so immobilized alone isn't written as one.
 */
export const SHEET_STATUSES = Object.freeze([
  { id: "prone", key: "prone" },
  { id: "stun", key: "stunned" },
  { id: "paralysis", key: "paralyzed", also: ["incapacitated"] },
  { id: "sleep", key: "asleep", also: ["incapacitated"] },
  { id: "unconscious", key: "unconscious", also: ["incapacitated"] },
  { id: "blind", key: "blinded" },
  { id: "deaf", key: "deafened" },
  { id: "silence", key: "silenced" },
  { id: "fear", key: "frightened" },
  { id: "restrain", key: "held", also: ["immobilized"] },
  { id: "slowed", key: "slowed" },
  { id: "disarmed", key: "disarmed" },
  { id: "invisible", key: "invisible" },
  { id: "poison", key: "poisoned" },
  { id: "grappled", key: "grabbed", also: ["immobilized"] }
].map(Object.freeze));

/** What the statuses bring (SHEET_STATUSES `also`), never a status's own condition. */
export const BROUGHT = [...new Set(SHEET_STATUSES.flatMap(s => s.also ?? []))];

/**
 * What a status brought that it no longer stands behind: a condition the sheet gave only with a status (`base`, the
 * conditions the sheet gave as the engine keeps them) while none of the statuses that bring it is on the creature now
 * (`conds`, from the sheet or anything else). Broken free of Restrained, nothing holds it still.
 */
export function leftBehind(base, conds) {
  const on = k => (Number(conds?.[k]) || 0) > 0;
  return BROUGHT.filter(k => (Number(base?.[k]) || 0) > 0 && !SHEET_STATUSES.some(s => s.key && s.also?.includes(k) && on(s.key)));
}
