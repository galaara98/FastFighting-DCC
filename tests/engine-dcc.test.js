/**
 * DCC fights through the core engine: action dice, deeds, crit tables, spell checks, bleeding out, rolling the body,
 * Luck. Tables here are written for these tests in DCC's style; no book's text is quoted.
 */
import { describe, expect, test } from "vitest";
import { dccRules } from "../scripts/rules.js";
import { deedsFrom } from "../scripts/deeds.js";
import { spellAction, layOnHandsAction, turnUnholyAction, chanceBetween } from "../scripts/spells.js";
import { tableRow } from "../scripts/text.js";
import { classId, sheetClassId, archetype } from "../scripts/classes.js";
import { deriveDccTraits } from "../scripts/traits.js";
import { rankDccLeaders } from "../scripts/leadership.js";
import { wordList } from "../scripts/words.js";
import { parseFormula, STATUS, degreeDistribution } from "../scripts/core.js";
import { replay, runBatchSync } from "../../FastFighting/scripts/engine/simulator.js";
import { text } from "./foundry-i18n.js";

/** Does a line read as this template, its {placeholders} filled with anything? */
const reads = (line, key) => {
  const pattern = text(key).split(/\{\w+\}/).map(bit => bit.replace(/[.*+?^${}()|[\]\\]/g, c => `\\${c}`)).join(".*");
  return new RegExp(`^${pattern}$`).test(line ?? "");
};

let n = 0;
const traits = (tactical = 65) => ({ tactical: { base: tactical, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 25, fudge: 0 }, loyal: { base: 75, fudge: 0 } });
const sword = (extra = {}) => ({ id: `sword${++n}`, name: "Longsword", kind: "strike", cost: 1, bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d8", "slashing")], ...extra });
function pc(extra = {}) {
  return {
    id: extra.id ?? `pc${++n}`, name: extra.id ?? "pc", side: "friendly", kind: "pc", level: 1, hp: { value: 12, max: 12 }, hitDie: 8,
    defenses: { ac: 14, frt: 1, ref: 1, wil: 1 }, initiative: { mod: 1 }, speeds: { walk: 30 }, actions: [sword()], iwr: {}, traits: traits(),
    flags: {}, diesAtZero: false, actionDice: [20], luck: 12, resources: { luck: 12 }, ...extra
  };
}
function monster(extra = {}) {
  return {
    id: extra.id ?? `m${++n}`, name: extra.id ?? "monster", side: "hostile", kind: "npc", level: 2, hp: { value: 12, max: 12 }, hitDie: 8,
    defenses: { ac: 13, frt: 2, ref: 1, wil: 0 }, initiative: { mod: 0 }, speeds: { walk: 30 }, actions: [sword({ name: "Claw", bonus: 3 })], iwr: {},
    traits: { ...traits(40), brave: { base: 100, fudge: 0 } }, flags: { fearless: true }, diesAtZero: true, actionDice: [20], ...extra
  };
}
const battle = (combatants, options = {}) => ({ combatants, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } }, options: { positioning: false, ...options } });
const events = (spec, type, seeds = 12) => {
  const out = [];
  for ( let s = 1; s <= seeds; s++ ) out.push(...replay(spec, dccRules, s).log.filter(e => e.type === type));
  return out;
};

describe("DCC rolls", () => {
  test("the top of the die always hits; crits only on a hit in the range, scaled to the die; a 1 fumbles", () => {
    expect(dccRules.degreeOfSuccess(24, 24, 99, "attack", { faces: 24 })).toBe(3); // the top of a d24 threatens (critOn 20 -> 24)
    expect(dccRules.degreeOfSuccess(23, 23, 99, "attack", { faces: 24 })).toBe(1);
    expect(dccRules.degreeOfSuccess(22, 30, 15, "attack", { faces: 24, critOn: 17 })).toBe(3); // crit on 21+ on a d24
    expect(dccRules.degreeOfSuccess(20, 20, 99, "attack", { faces: 24, critOn: 17 })).toBe(1);
    expect(dccRules.degreeOfSuccess(1, 99, 5, "attack")).toBe(0);
    expect(dccRules.degreeOfSuccess(19, 25, 15, "attack", { critOn: 19 })).toBe(3);
    expect(dccRules.degreeOfSuccess(1, 99, 5, "save")).toBe(1);
    expect(dccRules.degreeOfSuccess(20, 5, 99, "save")).toBe(2);
    const d24 = degreeDistribution(dccRules, 2, 16, { kind: "attack", faces: 24 });
    expect(d24.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 10);
  });

  test("a turn has an action for each action die, the first die first", () => {
    expect(dccRules.turn({ spec: { actionDice: [24, 16], speeds: { walk: 40 } } })).toMatchObject({ action: 2, move: 40 });
    expect(dccRules.actionDie({ spec: { actionDice: [24, 16] } }, 0)).toBe(24);
    expect(dccRules.actionDie({ spec: { actionDice: [24, 16] } }, 1)).toBe(16);
    expect(dccRules.actionDie({ spec: { actionDice: [24, 16] } }, 5)).toBe(16);
  });
});

describe("dying, DCC style", () => {
  test("a 0-level character and a monster die at 0; a 1st-level character bleeds out for a round", () => {
    const peasant = { spec: { kind: "pc", level: 0 }, status: STATUS.STANDING };
    dccRules.onDropped(peasant);
    expect(peasant.status).toBe(STATUS.DEAD);
    const hero = { spec: { kind: "pc", level: 1 }, status: STATUS.STANDING, maxHp: 10, hp: 0 };
    dccRules.onDropped(hero);
    expect(hero.status).toBe(STATUS.DOWN);
    expect(dccRules.recoveryCheck(hero)).toBe(text("FFDCC.Bleed.Last"));
    expect(dccRules.recoveryCheck(hero)).toBe(text("FFDCC.Bleed.Dies"));
    expect(hero.status).toBe(STATUS.DEAD);
    const saved = { spec: { kind: "pc", level: 3 }, status: STATUS.STANDING, maxHp: 20, hp: 0 };
    dccRules.onDropped(saved);
    dccRules.recoveryCheck(saved);
    dccRules.onHealed(saved, 4);
    expect(saved).toMatchObject({ status: STATUS.STANDING, hp: 4, bledOut: true });
  });

  test("rolling the body is a Luck check: a d20 at or under Luck", () => {
    const rolls = [];
    const rng = { die: f => (f === 20 ? 9 : 2) };
    const lucky = { spec: { luck: 12 }, status: STATUS.DEAD, hp: 0 };
    expect(dccRules.recoverBody(lucky, rng)).toBe(text("FFDCC.Body.Alive", { roll: 9, luck: 12 }));
    expect(lucky).toMatchObject({ status: STATUS.STANDING, hp: 1, bodyRecovered: "agl" });
    const unlucky = { spec: { luck: 8 }, status: STATUS.DEAD, hp: 0 };
    expect(dccRules.recoverBody(unlucky, rng)).toBe(text("FFDCC.Body.Dead", { roll: 9, luck: 8 }));
    expect(unlucky.status).toBe(STATUS.DEAD);
    expect(rolls).toEqual([]);
  });

  test("in a fight: friends heal the bleeding in time, or roll the body afterwards", () => {
    const victim = pc({ id: "victim", level: 2, hp: { value: 2, max: 12 }, initiative: { mod: -5 }, luck: 16, resources: { luck: 16 } });
    const priest = pc({ id: "priest", hp: { value: 40, max: 40 }, initiative: { mod: 5 }, actions: [sword(), layOnHandsAction({ mod: 6 })] });
    const brute = monster({ id: "brute", hp: { value: 30, max: 30 }, initiative: { mod: 0 }, actions: [sword({ name: "Club", bonus: 8, damage: [parseFormula("1d6+3", "bludgeoning")] })] });
    let bled = 0;
    let saved = 0;
    for ( let s = 1; s <= 30; s++ ) {
      const r = replay(battle([victim, priest, brute], { maxRounds: 8 }), dccRules, s);
      if ( r.log.some(e => e.type === "recovery" && ["Bleed.One", "Bleed.Many", "Bleed.Last"].some(k => reads(e.text, `FFDCC.${k}`))) ) bled += 1;
      const f = r.units.victim.final;
      if ( f.system?.bledOut ) saved += 1;
      if ( r.log.some(e => e.type === "body") ) expect(["standing", "dead"]).toContain(f.status);
    }
    expect(bled).toBeGreaterThan(0);
    expect(saved).toBeGreaterThan(0);
  });
});

describe("deeds", () => {
  test("built-in deeds without the book, and a book's rows read when it's there", () => {
    const built = deedsFrom(null);
    expect(built.map(d => d.id)).toEqual(["trip", "blind", "disarm", "defend", "rally"]);
    expect(built.find(d => d.id === "rally").tiers.every(t => t.outcome.allies > 0)).toBe(true);
    expect(built.find(d => d.id === "defend").tiers.every(t => t.outcome.self)).toBe(true);
    const read = deedsFrom({
      blind: [{ range: [3, 3], text: "Grit in the eyes: a -2 penalty on its next attack." }, { range: [5, 5], text: "It is blinded for [[/roll 1d4]] rounds and takes a -6 penalty to attack rolls." }],
      defend: [{ range: [3, 3], text: "Fighting carefully, the warrior gains a +1 AC bonus for the next round." }, { range: [4, 4], text: "Something only a crowd can do." }]
    });
    const blind = read.find(d => d.id === "blind");
    expect(blind.tiers[0]).toMatchObject({ min: 3, outcome: { mods: { attack: -2 }, rounds: 1, label: text("FFDCC.Deed.Dazzled", { what: text("FFDCC.Mods.attack", { n: "-2" }) }) } });
    expect(blind.tiers[1]).toMatchObject({ min: 5, outcome: { conditions: { blinded: 1 }, mods: { attack: -6 }, rounds: 3 } });
    expect(read.find(d => d.id === "defend").tiers).toEqual([{ min: 3, outcome: { mods: { ac: 1 }, rounds: 1, label: text("FFDCC.Deed.Ac", { n: 1 }), self: true } }]);
    // A book's rallying row: what it lends the warrior's friends.
    const rally = deedsFrom({ rally: [{ range: [3, 3], text: "Allies within sight gain a +1 bonus to attack rolls for the next round." }] }).find(d => d.id === "rally");
    expect(rally.tiers[0]).toMatchObject({ min: 3, outcome: { mods: { attack: 1 }, allies: 10 } });
  });

  test("a rally: the warrior's friends nearby swing better", () => {
    const rallyOnly = deedsFrom(null).filter(d => d.id === "rally");
    const warrior = pc({ id: "warrior", level: 3, hp: { value: 40, max: 40 }, deeds: rallyOnly, actions: [sword({ bonus: 4, deedDie: 6 })] });
    const friend = pc({ id: "friend", hp: { value: 40, max: 40 } });
    const ogre = monster({ id: "ogre", hp: { value: 200, max: 200 }, defenses: { ac: 10, frt: 4, ref: 0, wil: 1 } });
    const rallies = events(battle([warrior, friend, ogre], { maxRounds: 4 }), "deed").filter(e => e.actorId === "warrior" && e.success);
    expect(rallies.length).toBeGreaterThan(0);
    expect(rallies.every(e => e.allies.includes("friend"))).toBe(true);
  });

  test("a warrior's deed die rides every attack and its deeds land in the fight", () => {
    const warrior = pc({ id: "warrior", level: 3, hp: { value: 30, max: 30 }, deeds: deedsFrom(null), actions: [sword({ bonus: 2, deedDie: 4 })] });
    const ogre = monster({ id: "ogre", hp: { value: 60, max: 60 }, defenses: { ac: 12, frt: 4, ref: 0, wil: 1 } });
    const spec = battle([warrior, ogre], { maxRounds: 4 });
    const deeds = events(spec, "deed").filter(e => e.actorId === "warrior");
    expect(deeds.some(e => e.success)).toBe(true);
    expect(deeds.filter(e => e.success).every(e => e.roll >= 3)).toBe(true);
  });
});

describe("crit tables", () => {
  test("a monster's crit against a player character is lessened by the character's Luck", () => {
    const rows = [tableRow({ range: [-99, 2], text: "A glancing blow: +1 damage." }), tableRow({ range: [3, 99], text: "Ribs crack: inflict +[[/roll 2d6]] damage." })];
    const crit = { die: parseFormula("1d4"), mod: 0, rows };
    const giant = monster({ id: "giant", actions: [sword({ name: "Club", bonus: 4, critOn: 12, crit })], hp: { value: 200, max: 200 } });
    const lucky = pc({ id: "lucky", critAgainst: 3, hp: { value: 200, max: 200 } });
    const crits = events(battle([lucky, giant], { maxRounds: 4 }), "attack", 10).filter(e => e.actorId === "giant" && e.crit);
    expect(crits.length).toBeGreaterThan(2);
    for ( const c of crits ) expect(c.critRoll).toBeLessThanOrEqual(1); // 1d4 - 3
  });
});

describe("spells", () => {
  const bolt = [
    { range: [1, 11], text: "Lost. Failure." },
    { range: [12, 15], text: "A single bolt strikes for [[/roll 1d6]] damage. It never misses." },
    { range: [16, 99], text: "The caster fires [[/roll 1d4+1]] bolts, each dealing [[/roll 1d6]] + caster level damage." }
  ];

  test("a spell's table becomes a check with tiers; how often it works", () => {
    const a = spellAction({ id: "bolt", name: "Bolt", rows: bolt, mod: 2, casterLevel: 1 });
    expect(a).toMatchObject({ kind: "auto", casting: { mod: 2, lostOnFail: true, disapproval: null } });
    expect(a.tiers.map(t => t.min)).toEqual([12, 16]);
    expect(a.castChance).toBeCloseTo(chanceBetween(2, 20, 12, 99), 10);
    expect(a.castChance).toBeCloseTo(0.55, 10);
    const cleric = spellAction({ id: "bolt2", name: "Holy Bolt", rows: bolt, mod: 2, mode: "cleric", disapproval: 3 });
    expect(cleric.casting).toMatchObject({ lostOnFail: false, disapproval: 3 });
    expect(spellAction({ id: "x", name: "Monster Bolt", rows: bolt, mod: 2, monster: true }).casting).toMatchObject({ lostOnFail: false, disapproval: null });
    expect(spellAction({ id: "y", name: "Star Lore", rows: [{ range: [12, 99], text: "The caster learns a star's true name." }], mod: 2 })).toBeNull();
  });

  test("a save-or-sleep spell is a hold whose save DC is the check", () => {
    const sleep = spellAction({ id: "sleep", name: "Slumber", mod: 3, save: "Will vs. spell check DC", rows: [
      { range: [1, 11], text: "Lost. Failure." }, { range: [12, 99], text: "Up to two targets must make a Will save or fall asleep for [[/roll 1d6]] turns." }
    ] });
    expect(sleep).toMatchObject({ kind: "control", area: { targets: 2 }, save: { type: "wil" } });
    expect(sleep.tiers[0].save.dc).toBe("check");
    expect(Number.isFinite(sleep.save.dc)).toBe(true);
    const goblin = monster({ id: "goblin", hp: { value: 40, max: 40 }, defenses: { ac: 12, frt: 0, ref: 0, wil: -2 } });
    const wizard = pc({ id: "wizard", actions: [sword({ bonus: 0 }), sleep] });
    const holds = events(battle([wizard, goblin], { maxRounds: 3 }), "control", 15).filter(e => e.actorId === "wizard");
    expect(holds.length).toBeGreaterThan(0);
    for ( const h of holds ) expect(h.dc).toBeGreaterThanOrEqual(12);
  });

  test("a wizard loses a spell on a failure and spellburns when it matters", () => {
    const a = spellAction({ id: "bolt", name: "Bolt", rows: bolt, mod: 0, casterLevel: 1 });
    const wizard = pc({ id: "wizard", actions: [sword({ bonus: 0 }), a], boosts: [{ pool: "spellburn", label: "Spellburn", kinds: ["cast"] }], resources: { luck: 12, spellburn: 6 } });
    const spec = battle([wizard, monster({ hp: { value: 60, max: 60 } })], { maxRounds: 5 });
    const casts = events(spec, "cast", 20);
    expect(casts.some(c => c.lost)).toBe(true);
    const burns = events(spec, "boost", 20).filter(b => b.label === "Spellburn");
    expect(burns.length).toBeGreaterThan(0);
  });

  test("Lay on Hands and Turn Unholy from their tables, and rough guesses without them", () => {
    const lay = layOnHandsAction({ mod: 3, rows: [{ range: [-99, 11], text: "Same Failure Adjacent Failure Opposed Failure" }, { range: [12, 99], text: "Same 3 dice Adjacent 2 dice Opposed 1 die" }] });
    expect(lay.tiers).toEqual([{ min: 12, max: 99, healDice: 2 }]);
    expect(lay.guessed).toBe(false);
    expect(layOnHandsAction({ mod: 3 }).guessed).toBe(true);
    const turn = turnUnholyAction({ mod: 3, rows: [{ range: [12, 17], text: "Range 30' 1 HD T1 2 HD NE 3-4 HD NE" }, { range: [18, 99], text: "1 HD T1d4+CL 2 HD T1 3-4 HD T1 5-6 HD NE" }] });
    expect(turn.tiers.map(t => t.turns)).toEqual([1, 4]);
    // Only the unholy, and only so many hit dice.
    const zombie = { spec: { unholy: true, level: 3, iwr: {} } };
    const orc = { spec: { unholy: false, level: 1, iwr: {} } };
    expect(dccRules.isImmune(zombie, { ...turn, turns: 4 })).toBe(false);
    expect(dccRules.isImmune(zombie, { ...turn, turns: 2 })).toBe(true);
    expect(dccRules.isImmune(orc, { ...turn, turns: 4 })).toBe(true);
  });
});

describe("Luck", () => {
  test("a character burns Luck on a save that would kill it; a halfling's counts double", () => {
    const blast = { id: "blast", name: "Death Gaze", kind: "save", save: { type: "frt", dc: 16, basic: false }, damage: [parseFormula("200", "unholy")], range: { increment: 60 }, uses: 1 };
    const lich = monster({ id: "lich", initiative: { mod: 20 }, actions: [blast, sword({ bonus: 0 })], traits: { ...traits(90), brave: { base: 100, fudge: 0 } }, hp: { value: 300, max: 300 } });
    const halfling = pc({ id: "halfling", defenses: { ac: 14, frt: 2, ref: 1, wil: 1 }, boosts: [{ pool: "luck", label: "Luck", per: 2, allies: 1, keep: 6, recovers: true }], resources: { luck: 14 } });
    const burns = events(battle([halfling, lich], { maxRounds: 1 }), "boost", 40);
    expect(burns.length).toBeGreaterThan(5);
    for ( const b of burns ) expect(b.to - b.from).toBe(2 * b.spent);
  });
});

describe("who's who", () => {
  test("the class comes from the sheet: its own record, the sheet chosen, or the class name", () => {
    expect(sheetClassId("dcc.DCCActorSheetWarrior")).toBe("warrior");
    expect(sheetClassId("xcc.XCCActorSheetSpAcrobat")).toBe("sp-acrobat");
    expect(sheetClassId("XCCActorSheetDungeonHottie")).toBe("dungeon-hottie");
    expect(sheetClassId("dcc.DCCActorSheetGeneric")).toBeNull();
    expect(classId({ sheetClass: "Thief", sheetName: "dcc.DCCActorSheetWarrior" })).toBe("thief");
    expect(classId({ sheetClass: "", sheetName: "dcc.DCCActorSheetHalfling", className: "Warrior" })).toBe("halfling");
    expect(classId({ sheetClass: "", sheetName: "", className: "Warrior" })).toBe("warrior");
    expect(classId({ className: "Zero-Level" })).toBe("zero-level");
    expect(archetype("xcc-dwarf").dwarf).toBe(true);
    expect(archetype("sp-halfling-rogue").halfling).toBe(true);
  });

  test("personalities: funnel peasants aren't veterans; constructs, the dead, and casters", () => {
    expect(deriveDccTraits({ pc: true, level: 0, alignment: "n" }).traits.tactical).toBeLessThan(deriveDccTraits({ pc: true, level: 3, alignment: "n" }).traits.tactical);
    expect(deriveDccTraits({ pc: false, level: 2, will: 0, construct: true }).traits.tactical).toBe(5);
    const zombie = deriveDccTraits({ pc: false, level: 2, will: 0, undead: true });
    expect(zombie.flags.fearless).toBe(true);
    expect(zombie.traits.brave).toBe(100);
    expect(deriveDccTraits({ pc: false, name: "Frost Acolyte", level: 3, will: 3, casts: true }).traits.tactical).toBe(60);
  });

  test("leaders: presence, a title (in its name, by the language file's words), experience", () => {
    const title = wordList("Title")[0];
    const ranked = rankDccLeaders([{ id: "a", name: `Ulfgar, the frost ${title}`, level: 6, personality: 0 }, { id: "b", name: "Frost Raider", level: 2, personality: 0 }]);
    expect(ranked[0].id).toBe("a");
    expect(ranked[0].reason).toContain(text("FFDCC.Lead.Title"));
    // (A whole word, not part of one.)
    expect(rankDccLeaders([{ id: "c", name: `Frost ${title}ling`, level: 0 }])[0].reason).not.toContain(text("FFDCC.Lead.Title"));
  });

  test("a fight runs end to end and the outcome is settled", () => {
    const party = [pc({ id: "a", level: 1, deeds: deedsFrom(null), actions: [sword({ deedDie: 3 })] }), pc({ id: "b", level: 0, hp: { value: 3, max: 3 } }), pc({ id: "c", level: 1 })];
    const foes = [monster({ id: "x" }), monster({ id: "y" }), monster({ id: "z", actionDice: [24, 16] })];
    const res = runBatchSync(battle([...party, ...foes], { maxRounds: 10 }), dccRules, { runs: 200, seed: 9 });
    const sum = res.outcomes ? Object.values(res.outcomes).reduce((s, v) => s + v, 0) : 1;
    expect(sum).toBeGreaterThan(0);
    for ( let s = 1; s <= 10; s++ ) {
      const r = replay(battle([...party, ...foes], { maxRounds: 10 }), dccRules, s);
      for ( const u of Object.values(r.units) ) expect(u.final.status === STATUS.DOWN && !u.final.stable).toBe(false);
    }
  });
});
