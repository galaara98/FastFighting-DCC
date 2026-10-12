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
import { outcomeIn, modsWords, affected } from "./text.js";
import { listItems } from "./core.js";
import { t } from "./words.js";

/** The kinds of deed (their names and what they leave a foe, in the reader's language: worked out when asked for). */
// (What playstyles lean on: a spoiler trips, blinds and disarms; one who'd lead or rally rallies; a defensive maneuver
// goes as the shield answer says, a DCC shield being in the AC already.)
const kinds = () => ({
  trip: { id: "trip", label: t("Deed.Trip"), melee: true, condition: { prone: 1 }, label2: t("Deed.KnockedDown"), leans: ["hinders"] },
  blind: { id: "blind", label: t("Deed.Blind"), leans: ["hinders"] },
  disarm: { id: "disarm", label: t("Deed.Disarm"), melee: true, condition: { disarmed: 1 }, label2: t("Deed.Disarmed"), leans: ["hinders"] },
  defend: { id: "defend", label: t("Deed.Defend"), self: true, guard: true },
  rally: { id: "rally", label: t("Deed.Rally"), allies: 10, leans: ["rally"] }
});

/** Rough versions for when no book's tables are installed. */
const builtIn = () => {
  const ac = n => t("Deed.Ac", { n });
  return {
    trip: [{ min: 3, outcome: { conditions: { prone: 1 }, rounds: 1, label: t("Deed.KnockedDown") } }, { min: 5, outcome: { conditions: { prone: 1 }, mods: { attack: -2 }, rounds: 2, label: t("Deed.ThrownDown") } }],
    blind: [{ min: 3, outcome: { mods: { attack: -2 }, rounds: 1, label: t("Deed.Dazzled2") } }, { min: 5, outcome: { conditions: { blinded: 1 }, rounds: 2, label: t("Deed.Blinded") } }, { min: 7, outcome: { conditions: { blinded: 1 }, rounds: 5, label: t("Deed.Blinded") } }],
    disarm: [{ min: 4, outcome: { conditions: { disarmed: 1 }, rounds: 1, label: t("Deed.Disarmed") } }, { min: 6, outcome: { conditions: { disarmed: 1 }, rounds: 3, label: t("Deed.Disarmed") } }],
    defend: [{ min: 3, outcome: { mods: { ac: 1 }, rounds: 1, label: ac(1), self: true } }, { min: 5, outcome: { mods: { ac: 2 }, rounds: 1, label: ac(2), self: true } }, { min: 7, outcome: { mods: { ac: 3 }, rounds: 1, label: ac(3), self: true } }],
    rally: [
      { min: 3, outcome: { mods: { attack: 1 }, uses: 1, rounds: 1, label: t("Deed.Rallied1"), allies: 10 } },
      { min: 5, outcome: { mods: { attack: 2 }, uses: 1, rounds: 1, label: t("Deed.Rallied2"), allies: 20 } },
      { min: 7, outcome: { mods: { attack: 2, saves: 2 }, rounds: 1, label: t("Deed.Rallied3"), allies: 30 } }
    ]
  };
};

/**
 * The deeds a creature can try.
 * @param {Record<string, {range, text}[]>|null} tables  the world's deed tables by kind, if any
 * @returns {object[]} deeds for spec.deeds (see the core's riders.js)
 */
export function deedsFrom(tables) {
  const out = [];
  const fallback = builtIn();
  for ( const [kind, base] of Object.entries(kinds()) ) {
    const rows = tables?.[kind];
    let tiers = rows?.length ? rows.map(r => tierFrom(base, r)).filter(Boolean) : [];
    if ( !tiers.length ) tiers = fallback[kind].map(tier => ({ ...tier, outcome: { ...tier.outcome } }));
    out.push({ id: base.id, label: base.label, melee: base.melee, leans: base.leans, guard: base.guard, tiers: tiers.sort((a, b) => a.min - b.min) });
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
  if ( base.condition ) outcome = { rounds: 1, ...(outcome ?? {}), conditions: { ...(outcome?.conditions ?? {}), ...base.condition }, label: outcome?.label && outcome.label !== affected() ? outcome.label : base.label2 };
  if ( !outcome ) return null;
  // Not quite blind yet: dust and blood in the eyes.
  if ( base.id === "blind" && !outcome.conditions?.blinded ) outcome.label = t("Deed.Dazzled", { what: modsWords(outcome.mods) || outcome.label });
  if ( base.allies ) {
    // A rally: the bonuses it lends the warrior's friends (to attacks, saves or AC), for those near enough.
    const lent = Object.fromEntries(Object.entries(outcome.mods ?? {}).filter(([k, v]) => ["attack", "saves", "ac"].includes(k) && v > 0));
    if ( !Object.keys(lent).length ) return null;
    return { min, outcome: { mods: lent, rounds: outcome.rounds ?? 1, label: t("Deed.Rallied", { what: listItems(Object.entries(lent).map(([k, v]) => t("Deed.Lent", { n: `+${v}`, stat: k === "ac" ? t("Ac") : k === "attack" ? t("Attack") : t("Saves") }))) }), allies: base.allies * Math.max(1, Math.floor(min / 3)) } };
  }
  if ( base.self ) {
    // Defensive: only the bonus to AC, for the warrior.
    if ( !(outcome.mods?.ac > 0) ) return null;
    outcome = { mods: { ac: outcome.mods.ac }, rounds: outcome.rounds ?? 1, label: t("Deed.Ac", { n: outcome.mods.ac }), self: true };
  }
  return { min, outcome };
}
