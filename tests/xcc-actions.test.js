/**
 * XCC class actions: the Dungeon Hottie's Not in the Face and Too Cute to Die, the Jammer's Disrespect, the Gnome's
 * Draw Agro, the Athlete's wrestling, and the Acrobat's acrobatics to get clear of a melee.
 */
import { describe, expect, test } from "vitest";
import { notInTheFace, disrespect, drawAgro, wrestling } from "../scripts/adapter.js";
import { grappleAction } from "../scripts/moves.js";
import { dccRules } from "../scripts/rules.js";
import { archetype } from "../scripts/classes.js";
import { parseFormula } from "../scripts/core.js";
import { replay } from "../../FastFighting/scripts/engine/simulator.js";

const crit = { die: { dice: [{ count: 1, faces: 4 }], flat: 0 }, rows: [] };
const actor = (cls = {}, extra = {}) => ({ id: "x", system: { abilities: { per: { mod: 2 }, lck: { mod: 1 }, str: { mod: 1 }, agl: { mod: 1 } }, details: { level: { value: 2 } }, class: cls }, itemTypes: { armor: [] }, ...extra });
const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
const sword = { id: "sword", name: "Sword", kind: "strike", cost: 1, bonus: 4, melee: true, reach: 5, damage: [parseFormula("1d8", "slashing")] };
const unit = extra => ({ side: "friendly", kind: "pc", level: 1, hp: { value: 30, max: 30 }, hitDie: 8, defenses: { ac: 12, frt: 1, ref: 1, wil: 1 }, initiative: { mod: 0 },
  speeds: { walk: 30 }, actions: [sword], iwr: {}, traits, flags: { fearless: true }, diesAtZero: false, actionDice: [20], ...extra });
const battle = (combatants, options = {}) => ({ combatants, sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } }, options: { positioning: false, maxRounds: 4, ...options } });

describe("XCC class actions", () => {
  test("the classes as the rules see them", () => {
    expect(archetype("dungeon-hottie").hottie).toBe(true);
    expect(archetype("jammer").jammer).toBe(true);
    expect(archetype("gnome").gnome).toBe(true);
    expect(archetype("athlete").athlete).toBe(true);
    expect(archetype("sp-acrobat").acrobat && archetype("half-elf").acrobat).toBe(true);
  });

  test("Not in the Face: a round defending, its bonus to AC; none without one", () => {
    expect(notInTheFace(actor({ notInTheFace: 3 }))).toEqual([expect.objectContaining({ kind: "buff", targets: "self", outcome: expect.objectContaining({ mods: { ac: 3 }, rounds: 1 }) })]);
    expect(notInTheFace(actor({}))).toEqual([]);
  });

  test("Too Cute to Die: a failed body roll passes, for a point of Luck, once", () => {
    const u = { spec: { tooCute: true, luck: 5 }, resources: { luck: 5 }, status: "dead" };
    dccRules.recoverBody(u, { die: faces => (faces === 20 ? 18 : 1) });
    expect(u).toMatchObject({ status: "standing", hp: 1, tooCuteUsed: true, resources: { luck: 4 } });
    const again = { spec: { tooCute: true, luck: 5 }, resources: { luck: 5 }, status: "dead", tooCuteUsed: true };
    dccRules.recoverBody(again, { die: () => 18 });
    expect(again.status).toBe("dead");
  });

  test("Disrespect: a Will save against its performance, or its penalty for level + Personality rounds; the mindless pay it no heed", () => {
    const [d] = disrespect(actor({ disrespectPenalty: "-1d" }));
    const disrespected = { mods: { attack: -2, checks: -2, damage: -2 }, rounds: 4 };
    expect(d).toMatchObject({ kind: "control", save: { type: "wil", dc: 16 }, onSave: [disrespected, disrespected, null, null] });
    expect(dccRules.isImmune({ spec: { flags: { mindless: true }, iwr: {} } }, d)).toBe(true);
    expect(dccRules.isImmune({ spec: { flags: {}, iwr: {} } }, d)).toBe(false);
  });

  test("Disrespect lands in a fight: a foe that fails its save fights at the penalty", () => {
    let landed = 0;
    for ( let seed = 1; seed <= 10; seed++ ) {
      const jammer = unit({ id: "jam", name: "Jammer", actions: [{ ...sword, bonus: -20 }, ...disrespect(actor({ disrespectPenalty: "-1d" }))] });
      const r = replay(battle([jammer, unit({ id: "o", name: "Orc", side: "hostile", kind: "npc", diesAtZero: true, defenses: { ac: 12, frt: 1, ref: 1, wil: -5 } })]), dccRules, seed);
      landed += r.log.filter(e => e.type === "control" && e.took).length;
    }
    expect(landed).toBeGreaterThan(0);
  });

  test("Draw Agro: a Will save, or the foe goes for the gnome, or pays a step down the dice chain against anyone else", () => {
    const [g] = drawAgro(actor());
    const agro = { taunt: 80, defy: { attack: -2, checks: -2 }, rounds: 1 };
    // (Personality 2, level 2, Luck 1: a check of 10.5 + 5 on average.)
    expect(g).toMatchObject({ kind: "control", drawAgro: true, save: { type: "wil", dc: 16 }, onSave: [agro, agro, null, null] });
    const fifth = actor();
    fifth.system.details.level.value = 5;
    expect(drawAgro(fifth)[0].onSave[1].defy).toEqual({ attack: -4, checks: -4 });
    const unlucky = actor();
    unlucky.system.abilities.lck.mod = -2;
    expect(drawAgro(unlucky)[0].save.dc).toBe(15);
    expect(dccRules.isImmune({ spec: { flags: { mindless: true }, iwr: {} } }, g)).toBe(true);
  });

  test("Draw Agro in a fight: the orc that was after the elf comes at the gnome, and the gnome's pool gains Mojo", () => {
    let atGnome = 0;
    let atElf = 0;
    let mojo = 0;
    for ( let seed = 1; seed <= 20; seed++ ) {
      const gnome = unit({ id: "gnome", name: "Gnome", hp: { value: 200, max: 200 }, defenses: { ac: 18, frt: 1, ref: 1, wil: 1 }, resources: { fleeting: 0 }, boosts: [{ pool: "fleeting", shared: "actor:gnome", label: "Mojo", per: 1, recovers: true }], fleeting: { key: "actor:gnome", kind: "actor", id: "gnome", points: 0 },
        traits: { ...traits, tactical: { base: 70, fudge: 0 } }, actions: [{ ...sword, bonus: -20 }, ...drawAgro(actor())] });
      const elf = unit({ id: "elf", name: "Elf", hp: { value: 200, max: 200 }, actions: [{ ...sword, bonus: -20 }] });
      const orc = unit({ id: "o", name: "Orc", side: "hostile", kind: "npc", diesAtZero: true, hp: { value: 200, max: 200 }, defenses: { ac: 12, frt: 1, ref: 1, wil: -5 },
        desires: [{ kind: "hurt", targetId: "elf", level: 50 }] });
      const spec = battle([gnome, elf, orc], { maxRounds: 3 });
      const r = replay(spec, dccRules, seed);
      atGnome += r.log.filter(e => e.type === "attack" && e.actorId === "o" && e.targetId === "gnome").length;
      atElf += r.log.filter(e => e.type === "attack" && e.actorId === "o" && e.targetId === "elf").length;
      mojo += r.log.filter(e => e.type === "fleeting" && e.actorId === "gnome" && e.gained).length;
    }
    expect(atGnome).toBeGreaterThan(atElf);
    expect(mojo).toBeGreaterThan(0);
  });

  test("wrestling: a grapple with its training die rolled along; not with a shield in hand", () => {
    const [w] = wrestling(actor({ trainingDie: "d5", grappleCritRange: 19 }), { firstDie: 20, crit });
    expect(w).toMatchObject({ kind: "strike", melee: true, deedDie: 5, critOn: 19, effects: [{ kind: "grabbed" }] });
    // (A shield is the armor with no fumble die, whatever it's called; the armor it wears doesn't stop it.)
    const shield = actor({ trainingDie: "d5" }, { itemTypes: { armor: [{ name: "Buckler", type: "armor", system: { equipped: true, fumbleDie: "" } }] } });
    expect(wrestling(shield, { firstDie: 20, crit })).toEqual([]);
    const worn = actor({ trainingDie: "d5" }, { itemTypes: { armor: [{ name: "Shield", type: "armor", system: { equipped: true, fumbleDie: "1d8" } }] } });
    expect(wrestling(worn, { firstDie: 20, crit })).toHaveLength(1);
  });

  test("its name is the Athlete's own; everyone else's grapple is still a Grapple", () => {
    const [w] = wrestling(actor({ trainingDie: "d5" }), { firstDie: 20, crit });
    expect(w.name).toBe(game.i18n.localize("FFDCC.Wrestling"));
    expect(grappleAction("pc", 2).name).toBe(game.i18n.localize("FFDCC.Grapple"));
    expect(w.name).not.toBe(grappleAction("pc", 2).name);
  });

  test("in a fight: the Athlete grabs what it wrestles; the Acrobat rolls to get clear, and only a miss draws the blows", () => {
    let grabbed = 0;
    for ( let seed = 1; seed <= 20; seed++ ) {
      const athlete = unit({ id: "ath", name: "Athlete", actions: wrestling(actor({ trainingDie: "d5" }), { firstDie: 20, crit }) });
      const r = replay(battle([athlete, unit({ id: "o", name: "Orc", side: "hostile", kind: "npc", diesAtZero: true })]), dccRules, seed);
      grabbed += r.log.filter(e => e.type === "grabbed").length;
    }
    expect(grabbed).toBeGreaterThan(0);
    expect(dccRules.disengage({ spec: { acrobatics: { mod: 3 }, speeds: { walk: 30 } } })).toMatchObject({ cost: { move: 15 }, check: { mod: 3, dc: 15, dcMany: 20 } });
    expect(dccRules.disengage({ spec: { speeds: { walk: 30 } } })).toBe(null);
  });
});
