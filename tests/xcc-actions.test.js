/**
 * XCC class actions: the Dungeon Hottie's Not in the Face and Too Cute to Die, the Jammer's Disrespect, the Athlete's
 * wrestling, and the Acrobat's acrobatics to get clear of a melee.
 */
import { describe, expect, test } from "vitest";
import { notInTheFace, disrespect, wrestling } from "../scripts/adapter.js";
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
    expect(d).toMatchObject({ kind: "control", save: { type: "wil", dc: 16 }, outcome: { mods: { attack: -2, checks: -2, damage: -2 }, rounds: 4 } });
    expect(dccRules.isImmune({ spec: { flags: { mindless: true }, iwr: {} } }, d)).toBe(true);
    expect(dccRules.isImmune({ spec: { flags: {}, iwr: {} } }, d)).toBe(false);
  });

  test("wrestling: a grapple with its training die rolled along; not with a shield in hand", () => {
    const [w] = wrestling(actor({ trainingDie: "d5", grappleCritRange: 19 }), { firstDie: 20, crit });
    expect(w).toMatchObject({ kind: "strike", melee: true, deedDie: 5, critOn: 19, effects: [{ kind: "grabbed" }] });
    const shield = actor({ trainingDie: "d5" }, { itemTypes: { armor: [{ name: "Shield", system: { equipped: true } }] } });
    expect(wrestling(shield, { firstDie: 20, crit })).toEqual([]);
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
