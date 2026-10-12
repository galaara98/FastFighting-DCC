/**
 * Which class a DCC (or XCC) character is.
 *
 * In this system a character's class is the character sheet chosen for it, for the actor or just its token. The
 * class sheet writes system.details.sheetClass the first time it opens ("Warrior", "blaster", "sp-acrobat",
 * "xcc-dwarf"); a sheet chosen but never opened (an imported pregen) is read from the sheet itself; failing both,
 * the class name. Rules that matter here are kept to what a class plainly is (a thief's luck die, a halfling's luck,
 * a cleric's own skills, a dwarf's shield bash); everything else comes from the character's own numbers (a deed
 * die, spells and how they're cast), so classes from other books still work.
 * Pure: no Foundry globals.
 */

/** "dcc.DCCActorSheetWarrior" or "XCCActorSheetSpAcrobat" -> "warrior", "sp-acrobat"; null for the plain sheets. */
export function sheetClassId(sheetName) {
  const m = String(sheetName ?? "").match(/(?:^|\.)(?:DCC|XCC)ActorSheet([A-Z]\w*)$/);
  if ( !m ) return null;
  const id = m[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return id === "generic" ? null : id;
}

const KNOWN = ["warrior", "cleric", "thief", "wizard", "elf", "dwarf", "halfling"];

/**
 * The class id: the sheet's own record, else the sheet chosen, else the class name ("Zero-Level" for a funnel
 * character). Lower case.
 */
export function classId({ sheetClass = "", sheetName = "", className = "" } = {}) {
  const own = String(sheetClass ?? "").trim().toLowerCase();
  if ( own && own !== "generic" ) return own;
  const fromSheet = sheetClassId(sheetName);
  if ( fromSheet ) return fromSheet;
  const name = String(className ?? "").trim().toLowerCase();
  if ( !name || name === "generic" ) return null;
  return KNOWN.find(k => name.includes(k)) ?? name.replace(/\s+/g, "-");
}

/**
 * What a class plainly is, for the few rules that go by class. XCC's: the Messenger is a cleric (holy acts, disapproval,
 * turning the unholy, healing), each Specialist ("sp-scout", "sp-commando" ...) a thief (backstab, a luck die), the
 * Brawler fights with its fists.
 */
export function archetype(id) {
  const c = String(id ?? "");
  return {
    thief: c === "thief" || c.startsWith("sp-"),
    halfling: c === "halfling" || /halfling/.test(c),
    cleric: c === "cleric" || c === "messenger",
    brawler: c === "brawler",
    hottie: c === "dungeon-hottie",
    jammer: c === "jammer",
    gnome: c === "gnome",
    athlete: c === "athlete",
    acrobat: c === "sp-acrobat" || c === "half-elf",
    dwarf: c === "dwarf" || c === "xcc-dwarf",
    elf: c === "elf",
    zero: c === "zero-level" || c === "0-level" || c === "zero"
  };
}
