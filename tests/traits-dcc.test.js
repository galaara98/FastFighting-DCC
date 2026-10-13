/**
 * A DCC (or XCC) character's personality from its whole sheet, and a monster's from what it is. The characters here
 * are made up for the tests; the field paths are the dcc system's own.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { deriveDccTraits, augurLean, usualWill, usualHp } from "../scripts/traits.js";
import { DccAdapter } from "../scripts/adapter.js";
import { wordList } from "../scripts/words.js";
import { PC_BASELINE } from "../../FastFighting/scripts/constants.js";

const ZERO_MODS = { str: 0, agl: 0, sta: 0, per: 0, int: 0, lck: 0 };
/** A 3rd-level character: the usual hero's numbers unless told otherwise. */
const pc = extra => deriveDccTraits({ pc: true, level: 3, alignment: "n", will: usualWill(3), mods: ZERO_MODS, cls: null, inParty: true, ...extra });
const near = (a, b, by = 3) => Math.abs(a - b) <= by;

// What birth augur effects change (the dcc system's fields; the signs here are made up).
const ON_MELEE = ["system.details.attackHitBonus.melee.adjustment"];
const ON_SPELLS = ["system.class.spellCheckOtherMod"];
const ON_WILL = ["system.saves.wil.otherBonus"];
const ON_SAVES = ["system.saves.frt.otherBonus", "system.saves.ref.otherBonus", "system.saves.wil.otherBonus"];
const ON_TURNING = ["system.skills.turnUnholy.otherMod"];

describe("a DCC player character's traits, from its sheet", () => {
  test("the usual hero's numbers make the usual hero", () => {
    expect(pc().traits).toEqual(PC_BASELINE);
    expect(pc({ hp: usualHp(3, 8), hitDie: 8 }).traits).toEqual(PC_BASELINE);
    expect(pc({ inParty: undefined }).traits).toEqual(PC_BASELINE);
  });

  test("a 0-level funnel peasant is no hardened hero", () => {
    const peasant = { level: 0, will: 0, cls: "zero-level" };
    expect(pc(peasant).traits).toEqual({ tactical: 45, brave: 50, selfish: 35, loyal: 55 });
    // (With hit points of its own, a d4's worth: near that.)
    for ( const hp of [2, 3] ) {
      const t = pc({ ...peasant, hp, hitDie: 4 }).traits;
      expect(near(t.brave, 50)).toBe(true);
    }
    expect(pc(peasant).traits.tactical).toBeLessThan(pc({ level: 1, will: usualWill(1) }).traits.tactical);
  });

  test("no two alike: a wizard thinks ahead, a cleric's faith steadies and binds her, a warrior stands, a thief looks out for itself", () => {
    const wizard = pc({ cls: "wizard", mods: { ...ZERO_MODS, int: 3, sta: -1 }, will: 2, alignment: "c", hp: 7, hitDie: 4 }).traits;
    const cleric = pc({ cls: "cleric", mods: { ...ZERO_MODS, per: 2, sta: 1 }, will: 4, alignment: "l", hp: 20, hitDie: 8 }).traits;
    const warrior = pc({ cls: "warrior", mods: { ...ZERO_MODS, str: 2, sta: 2, int: -1 }, will: 1, deedDie: true, hp: 34, hitDie: 12 }).traits;
    const thief = pc({ cls: "thief", mods: { ...ZERO_MODS, agl: 2, lck: 2 }, will: 1, alignment: "c", hp: 13, hitDie: 6 }).traits;
    const peasant = pc({ level: 0, will: -1, mods: { ...ZERO_MODS, per: -1 }, hp: 1, hitDie: 4 }).traits;
    expect(wizard.tactical).toBeGreaterThan(Math.max(cleric.tactical, warrior.tactical, thief.tactical));
    expect(warrior.brave).toBeGreaterThan(Math.max(wizard.brave, thief.brave));
    expect(cleric.brave).toBeGreaterThan(wizard.brave);
    expect(cleric.selfish).toBeLessThan(PC_BASELINE.selfish - 10);
    expect(cleric.loyal).toBeGreaterThan(PC_BASELINE.loyal + 5);
    expect(thief.selfish).toBeGreaterThan(warrior.selfish + 10);
    expect(thief.loyal).toBeLessThan(cleric.loyal - 15);
    for ( const k of ["tactical", "brave"] ) expect(peasant[k]).toBeLessThan(Math.min(wizard[k], cleric[k], warrior[k], thief[k]));
    expect(new Set([wizard, cleric, warrior, thief, peasant].map(x => JSON.stringify(x))).size).toBe(5);
  });

  test("each ability says something: Intelligence and Agility a good head, Strength, Stamina and Luck nerve, Personality friends", () => {
    const moved = mods => {
      const t = pc({ mods: { ...ZERO_MODS, ...mods } }).traits;
      return Object.fromEntries(Object.entries(t).filter(([k, v]) => v !== PC_BASELINE[k]).map(([k, v]) => [k, Math.sign(v - PC_BASELINE[k])]));
    };
    expect(moved({ int: 2 })).toEqual({ tactical: 1 });
    expect(moved({ agl: 2 })).toEqual({ tactical: 1 });
    for ( const k of ["str", "sta", "lck"] ) expect(moved({ [k]: 2 })).toEqual({ brave: 1 });
    expect(moved({ per: 2 })).toEqual({ loyal: 1 });
    expect(moved({ int: -3 })).toEqual({ tactical: -1 });
  });

  test("its Will against the usual at its level; its hit points against the usual for its level and hit die", () => {
    expect([1, 3, 5, 10].map(usualWill)).toEqual([1, 2, 2, 5]);
    expect(usualWill(0)).toBe(0);
    expect(pc({ will: usualWill(3) + 2 }).traits.brave).toBe(PC_BASELINE.brave + 6);
    expect(pc({ level: 0, will: 0 }).traits.brave).toBe(pc({ level: 0, will: 1 }).traits.brave - 3);
    // A 1st-level warrior: a d4 and a d12 (9 usually). A big roll emboldens, a little; a poor one doesn't.
    expect(usualHp(1, 12)).toBe(9);
    const tough = pc({ level: 1, will: 1, hp: 20, hitDie: 12 }).traits.brave;
    const usual = pc({ level: 1, will: 1, hp: 9, hitDie: 12 }).traits.brave;
    const frail = pc({ level: 1, will: 1, hp: 4, hitDie: 12 }).traits.brave;
    expect(tough - usual).toBe(4);
    expect(frail).toBeLessThan(usual);
  });

  test("its class, by the class sheet's id (XCC's too); a class from another book, by what it does", () => {
    expect(pc({ cls: "warrior" }).traits.brave).toBeGreaterThan(PC_BASELINE.brave);
    expect(pc({ cls: "gnome" }).traits.selfish).toBeLessThan(PC_BASELINE.selfish);
    expect(pc({ cls: "sp-criminal" }).traits.selfish).toBeGreaterThan(pc({ cls: "sp-scout" }).traits.selfish);
    expect(pc({ cls: "sp-new-specialist" }).traits.selfish).toBeGreaterThan(PC_BASELINE.selfish);
    const fighter = pc({ cls: "reaver", deedDie: true }).traits;
    const caster = pc({ cls: "reaver", casts: true }).traits;
    expect(fighter.brave).toBe(PC_BASELINE.brave + 3);
    expect(caster.tactical).toBe(PC_BASELINE.tactical + 3);
    // (A class it knows says it all: a wizard's spells aren't counted again.)
    expect(pc({ cls: "wizard", casts: true }).traits.tactical).toBe(pc({ cls: "wizard" }).traits.tactical);
  });

  test("its alignment: Law's fellowship, Chaos's each for itself; a cleric's god makes it count half again", () => {
    const lawful = pc({ alignment: "l" }).traits;
    const chaotic = pc({ alignment: "c" }).traits;
    expect(lawful.selfish).toBeLessThan(PC_BASELINE.selfish);
    expect(lawful.loyal).toBeGreaterThan(PC_BASELINE.loyal);
    expect(chaotic.selfish).toBeGreaterThan(PC_BASELINE.selfish + 10);
    expect(chaotic.loyal).toBeLessThan(PC_BASELINE.loyal);
    const shift = cls => pc({ cls, alignment: "c" }).traits.selfish - pc({ cls }).traits.selfish;
    expect(shift("cleric")).toBeGreaterThan(shift("warrior"));
    expect(shift("messenger")).toBe(shift("cleric"));
  });

  test("its birth augur, by what the sign governs", () => {
    expect(augurLean(ON_MELEE, 2)).toEqual({ trait: "brave", n: 3 });
    expect(augurLean(ON_SPELLS, -1)).toEqual({ trait: "tactical", n: -1.5 });
    expect(augurLean(ON_TURNING, 2)).toEqual({ trait: "selfish", n: -3 });
    expect(augurLean(ON_SAVES, 1)).toEqual({ trait: "brave", n: 1.5 });
    // (On Will alone, its Will save already has it; a sign worth nothing says nothing.)
    expect(augurLean(ON_WILL, 3)).toBeNull();
    expect(augurLean(ON_MELEE, 0)).toBeNull();
    const born = pc({ augur: { name: "Born under a red moon", mod: 2, keys: ON_MELEE } });
    expect(born.traits.brave).toBe(PC_BASELINE.brave + 3);
    expect(born.reasons.brave).toContain("Born under a red moon");
  });

  test("one in none of the world's parties is less bound to the others", () => {
    expect(pc({ inParty: false }).traits.loyal).toBeLessThan(PC_BASELINE.loyal);
    expect(pc({ inParty: true }).traits.loyal).toBe(PC_BASELINE.loyal);
  });

  test("each trait's reason says where it started and what moved it, in the sheet's own words", () => {
    const { reasons } = pc({ cls: "cleric", alignment: "l", mods: { ...ZERO_MODS, int: 2 }, names: { cls: "Priestess", alignment: "Orderly", abilities: { int: "Smarts" } } });
    expect(reasons.selfish).toContain("Priestess");
    expect(reasons.loyal).toContain("Orderly");
    expect(reasons.tactical).toContain("Smarts");
    expect(reasons.tactical).toContain(String(PC_BASELINE.tactical));
  });
});

describe("a DCC monster's traits", () => {
  test("constructs and casters by their stat line; where it says nothing, a beast, the mindless or a sharp mind by name", () => {
    const typical = deriveDccTraits({ pc: false, name: "Hoogabungaroo", level: 2, will: 0 });
    expect(typical.traits.tactical).toBe(40);
    expect(typical.flags).toEqual({});
    expect(deriveDccTraits({ pc: false, level: 3, will: 3, casts: true }).traits.tactical).toBe(60);
    expect(deriveDccTraits({ pc: false, level: 3, will: 3, construct: true }).traits.tactical).toBe(5);
    // (Pack tactics, as its stat line says.)
    expect(deriveDccTraits({ pc: false, level: 2, will: 0, pack: true }).flags.packTactics).toBe(true);
    // Its name, by the language file's words (FFDCC.Words): a beast, the mindless (an un-dead's notes too), a sharp mind.
    const [beast, mindless, clever] = ["Beast", "Mindless", "Clever"].map(k => wordList(k)[0]);
    const wolf = deriveDccTraits({ pc: false, name: `Dire ${beast}`, level: 2, will: 0 });
    expect(wolf.traits.tactical).toBe(20);
    expect(wolf.flags.beast).toBe(true);
    expect(deriveDccTraits({ pc: false, name: `Dire ${beast}`, kind: "other", level: 2, will: 0 }).flags.beast).toBe(true);
    expect(deriveDccTraits({ pc: false, name: `Rotting ${mindless}`, level: 2, will: 0 }).flags).toEqual({ mindless: true, fearless: true });
    expect(deriveDccTraits({ pc: false, name: "Rotter", notes: `a shambling ${mindless}`, undead: true, level: 2, will: 0 }).flags.mindless).toBe(true);
    expect(deriveDccTraits({ pc: false, name: "Rotter", notes: `a shambling ${mindless}`, level: 2, will: 0 }).flags.mindless).toBeUndefined();
    expect(deriveDccTraits({ pc: false, name: `Frost ${clever}`, level: 2, will: 0 }).traits.tactical).toBe(60);
    // (Whole words only, in any case; and the system's kind wins: one it files as one of the people is no beast.)
    expect(deriveDccTraits({ pc: false, name: `${beast}x`, level: 2, will: 0 }).flags.beast).toBeUndefined();
    expect(deriveDccTraits({ pc: false, name: beast.toUpperCase(), level: 2, will: 0 }).flags.beast).toBe(true);
    expect(deriveDccTraits({ pc: false, name: `${beast}-man`, kind: "humanoid", level: 2, will: 0 }).flags.beast).toBeUndefined();
  });

  test("immune to fear, a bolder one; a demon or devil, a more selfish one", () => {
    const plain = deriveDccTraits({ pc: false, name: "Sentinel", level: 3, will: 2, alignment: "n" }).traits;
    const fearless = deriveDccTraits({ pc: false, name: "Sentinel", level: 3, will: 2, alignment: "n", immune: ["frightened", "fear"] }).traits;
    const fiend = deriveDccTraits({ pc: false, name: "Pit Thing", level: 3, will: 2, alignment: "c", unholy: true }).traits;
    const chaotic = deriveDccTraits({ pc: false, name: "Raider", level: 3, will: 2, alignment: "c" }).traits;
    expect(fearless.brave).toBe(plain.brave + 10);
    expect(fiend.selfish).toBeGreaterThan(chaotic.selfish);
  });

  test("whatever ability scores it has move it (most have none: all 10s)", () => {
    const base = { pc: false, name: "Captain", level: 3, will: 2, alignment: "n" };
    expect(deriveDccTraits({ ...base, mods: { per: 2 } }).traits.loyal).toBe(deriveDccTraits(base).traits.loyal + 4);
    expect(deriveDccTraits({ ...base, mods: ZERO_MODS }).traits).toEqual(deriveDccTraits(base).traits);
  });

  test("the mindless don't change, and nothing makes the un-dead flee", () => {
    const golem = { pc: false, level: 2, will: 0, construct: true, alignment: "c" };
    expect(deriveDccTraits({ ...golem, unholy: true, mods: { per: 3, lck: -3 } }).traits).toEqual(deriveDccTraits(golem).traits);
    expect(deriveDccTraits(golem).traits).toEqual({ tactical: 5, brave: 100, selfish: 60, loyal: 40 });
    const zombie = deriveDccTraits({ pc: false, level: 2, will: 0, undead: true, alignment: "c" });
    expect(zombie.traits.brave).toBe(100);
    expect(zombie.flags).toEqual({ fearless: true });
    const vampire = deriveDccTraits({ pc: false, name: "Vampire", level: 6, will: 4, undead: true, alignment: "c", mods: { lck: -3 } });
    expect(vampire.traits.brave).toBe(100);
    expect(vampire.flags.fearless).toBe(true);
  });
});

describe("the dcc sheet, read", () => {
  const sheet = ({ type = "Player", system = {}, effects = [], id = "a1", name = "Wenna" } = {}) => ({
    id, name, type, effects, items: [], itemTypes: { spell: [] }, flags: {}, getFlag: () => undefined,
    system: {
      abilities: Object.fromEntries(["str", "agl", "sta", "per", "int", "lck"].map(k => [k, { value: 10, mod: 0 }])),
      saves: { wil: { value: "+2" } }, attributes: { hp: { max: 16 }, hitDice: { value: "1d8" } },
      details: { level: { value: 3 }, alignment: "n", attackBonus: "+2", sheetClass: "", notes: { value: "" } }, class: { className: "" },
      ...system
    }
  });
  beforeEach(() => {
    globalThis.CONFIG = { DCC: { abilities: { int: "DCC.AbilityInt" }, saves: { wil: "DCC.SavesWill" }, alignments: { l: "DCC.AlignmentL" } } };
    globalThis.game.actors = { filter: () => [] };
  });

  test("the usual hero's sheet: the usual hero", () => {
    expect(new DccAdapter().deriveTraits(sheet()).traits).toEqual(PC_BASELINE);
  });

  test("its numbers, its class sheet, its birth augur's effect and its party, from where the system keeps them", () => {
    const s = sheet({
      system: { details: { level: { value: 3 }, alignment: "l", attackBonus: "+d4", sheetClass: "Cleric", birthAugur: "Born under a red moon (Melee attack rolls) (+2)", birthAugurLuckMod: 2, notes: { value: "" } } },
      effects: [{ name: "Born under a red moon: Melee attack rolls", system: { changes: [{ key: ON_MELEE[0], value: "@system.details.birthAugurLuckMod" }] } }]
    });
    s.system.abilities.int.mod = 2;
    const party = { type: "Party", getFlag: (scope, key) => (scope === "dcc" && key === "partyMembers" ? [{ id: "someone-else" }] : undefined) };
    game.actors = { filter: fn => [party].filter(fn) };
    const { traits, reasons } = new DccAdapter().deriveTraits(s);
    expect(traits.selfish).toBeLessThan(PC_BASELINE.selfish - 10);
    expect(traits.tactical).toBe(PC_BASELINE.tactical + 6);
    expect(traits.brave).toBeGreaterThan(PC_BASELINE.brave);
    expect(reasons.brave).toContain("Born under a red moon");
    expect(traits.loyal).toBeLessThan(new DccAdapter().deriveTraits({ ...s, id: "someone-else" }).traits.loyal);
  });

  test("its biography: what's said of it in full, a player's notes as its story, never its patron", () => {
    const pcSheet = sheet({ system: { details: { occupation: { value: "Weaver" }, title: { value: "Wanderer" }, birthAugur: "Born under a red moon (Melee attack rolls) (+2)", notes: { value: "<p>Swore to find her <b>brother</b>.</p>" }, xccnotes: "Fans love her." }, class: { patron: "The Grey Lady" } } });
    const bio = new DccAdapter().biography(pcSheet);
    expect(bio.about).toContain("Weaver");
    expect(bio.about).toContain("Wanderer");
    expect(bio.about).toContain("Born under a red moon");
    expect(bio.about).not.toContain("Melee attack rolls");
    expect(bio.story).toContain("Swore to find her brother");
    expect(bio.story).toContain("Fans love her");
    expect(JSON.stringify(bio)).not.toContain("Grey Lady");
    expect(bio.against).toBe("");
    const monster = new DccAdapter().biography(sheet({ type: "NPC", system: { details: { notes: { value: "A hungry, cowardly thing." } } } }));
    expect(monster.about).toContain("cowardly");
    expect(monster.story).toBe("");
  });
});
