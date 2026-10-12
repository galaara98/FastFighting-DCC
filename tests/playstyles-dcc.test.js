/**
 * Playstyle perks in DCC's terms: Help (a step up the dice chain), Grapple (opposed attack rolls), Hide (a thief's
 * skill, or an untrained d10); a blow that subdues; binding a bleeding friend's wound (its Luck decides, once); a charge
 * for one in a hurry; deeds by playstyle; half damage, and the weak spot it leaves.
 */
import { describe, expect, test } from "vitest";
import { dccRules } from "../scripts/rules.js";
import { helpAction, grappleAction, hideAction, harmKinds, weakSpot } from "../scripts/moves.js";
import { deedsFrom } from "../scripts/deeds.js";
import { statLine } from "../scripts/text.js";
import { parseFormula, STATUS } from "../scripts/core.js";
import { replay } from "../../FastFighting/scripts/engine/simulator.js";

const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
const weapon = (name, type) => ({ id: name, name, kind: "strike", cost: 1, bonus: 30, melee: true, reach: 5, damage: [parseFormula("20", type)] });
const unit = extra => ({
  side: "friendly", kind: "pc", level: 1, hp: { value: 30, max: 30 }, hitDie: 8, defenses: { ac: 13, frt: 1, ref: 1, wil: 1 }, initiative: { mod: 0 },
  speeds: { walk: 30 }, actions: [weapon("Sword", "slashing")], iwr: {}, traits, flags: { fearless: true }, diesAtZero: false, actionDice: [20], ...extra
});
const battle = (combatants, options = {}) => ({ combatants, sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } }, options: { positioning: false, maxRounds: 2, ...options } });

describe("what anyone can try", () => {
  test("Help: a step up the dice chain (+2) on a friend's next attack or check, at the foe beside the helper", () => {
    expect(helpAction("a")).toMatchObject({ kind: "buff", besideFoe: 5, includeSelf: false, special: false, outcome: { mods: { attack: 2, checks: 2 }, uses: 1, vsFocus: true } });
  });

  test("Grapple: its attack bonus and the better of Strength and Agility against the foe's, as a DC", () => {
    expect(grappleAction("a", 3)).toMatchObject({ kind: "control", check: { mod: 3, against: "grapple" }, melee: true });
    expect(dccRules.defenseDc({ spec: { grapple: 4 } }, "grapple")).toBe(14);
    expect(dccRules.defenseDc({ spec: {} }, "will")).toBe(null);
  });

  test("Hide: a thief's skill on the d20, anyone else's a d10; against the sharpest eyes; not beside a foe", () => {
    expect(hideAction("a", { mod: 5, trained: true }).check).toMatchObject({ mod: 5, against: "perception", faces: undefined });
    expect(hideAction("a", { mod: 1 }).check).toMatchObject({ mod: 1, faces: 10 });
    expect(hideAction("a", { mod: 1 })).toMatchObject({ setup: true, leans: ["lowProfile"], hide: true });
    const foe = { id: "f", side: "hostile", status: STATUS.STANDING };
    const run = { byId: new Map([["f", foe]]), prep: { sides: { friendly: { enemies: new Set(["hostile"]) } } } };
    expect(dccRules.usable(run, { side: "friendly", adjacent: new Set(["f"]) }, { hide: true })).toBe(false);
    expect(dccRules.usable(run, { side: "friendly", adjacent: new Set() }, { hide: true })).toBe(true);
  });

  test("hidden: harder to hit; its attack catches its foe unready (a backstab); it ends when it attacks", () => {
    expect(dccRules.conditionMods("hidden")).toEqual({ ac: 4 });
    expect(dccRules.modifiers.exposed({ target: {}, flanked: false, attacker: { conds: { hidden: 1 } } })).toBe(true);
    expect(dccRules.modifiers.exposed({ target: {}, flanked: false, attacker: { conds: {} } })).toBe(false);
    const u = { conds: { hidden: 1 }, baseConds: { hidden: 1 }, effects: [], baseMods: [], spec: { iwr: {}, kind: "npc" } };
    dccRules.afterRoll({ sharedPools: {} }, u, null, { kind: "attack", action: weapon("Sword", "slashing") });
    expect(u.conds.hidden).toBeFalsy();
  });
});

describe("the fallen", () => {
  test("a blunt blow (or a subduing weapon) knocks a foe out for one who spares the fallen; a blade still kills", () => {
    const fate = (behavior, w) => replay(battle([unit({ id: "pc", name: "pc", behavior, actions: [w] }),
      unit({ id: "gob", name: "gob", side: "hostile", kind: "npc", diesAtZero: true, hp: { value: 3, max: 3 }, defenses: { ac: 5, frt: 0, ref: 0, wil: 0 }, actions: [{ ...weapon("Claw", "slashing"), bonus: -30 }] })]), dccRules, 1).units.gob.status;
    expect(fate({ spareDowned: 1 }, weapon("Mace", "bludgeoning"))).toBe(STATUS.DOWN);
    expect(fate({ spareDowned: 1 }, { ...weapon("Sap", "slashing"), subdual: true })).toBe(STATUS.DOWN);
    expect(fate({ spareDowned: 1 }, weapon("Sword", "slashing"))).toBe(STATUS.DEAD);
    expect(fate({}, weapon("Mace", "bludgeoning"))).toBe(STATUS.DEAD);
  });

  test("binding a bleeding friend's wound: its Luck decides (21 less its Luck), once; made, it stops bleeding", () => {
    const pc = { spec: { kind: "pc", luck: 14 }, resources: { luck: 14 }, status: STATUS.DOWN, stable: false, bleed: 2 };
    expect(dccRules.firstAidDC(pc)).toBe(7);
    expect(dccRules.canFirstAid(pc)).toBe(true);
    dccRules.firstAid(pc, 2);
    expect(pc).toMatchObject({ stable: true, bledOut: true, bleed: null });
    expect(dccRules.canFirstAid(pc)).toBe(false);
    const unlucky = { spec: { kind: "pc", luck: 5 }, resources: { luck: 5 }, status: STATUS.DOWN, stable: false, bleed: 2 };
    dccRules.firstAid(unlucky, 1);
    expect(unlucky.stable).toBe(false);
    expect(dccRules.canFirstAid(unlucky)).toBe(false);
  });
});

describe("playstyles in the deeds and the charge", () => {
  test("a trip, a blinding and a disarm lean on spoiling; a rally on rallying; a defensive maneuver is a guard", () => {
    const deeds = Object.fromEntries(deedsFrom(null).map(d => [d.id, d]));
    expect(deeds.trip.leans).toEqual(["hinders"]);
    expect(deeds.blind.leans).toEqual(["hinders"]);
    expect(deeds.disarm.leans).toEqual(["hinders"]);
    expect(deeds.rally.leans).toEqual(["rally"]);
    expect(deeds.defend.guard).toBe(true);
  });

  test("one in a hurry would rather charge in: a melee attack it moves for", () => {
    const u = { spec: { behavior: { rush: 0.5 } } };
    expect(dccRules.optionWeight(null, u, { melee: true }, null, 1)).toBe(1.5);
    expect(dccRules.optionWeight(null, u, { melee: true }, null, 0)).toBe(1);
    expect(dccRules.optionWeight(null, u, { melee: false }, null, 1)).toBe(1);
    expect(dccRules.optionWeight(null, { spec: {} }, { melee: true }, null, 1)).toBe(1);
  });
});

describe("half damage, and the weak spot it leaves", () => {
  test("a stat line's half and double damage; a skeleton's blunt weak spot", () => {
    expect(harmKinds("piercing and slashing weapons")).toEqual(["piercing", "slashing"]);
    expect(harmKinds("non-magical weapons")).toEqual(["slashing", "piercing", "bludgeoning"]);
    const line = statLine("Init +0; Atk claw +0 melee (1d3); AC 9; HD 1d6; MV 30'; Act 1d20; SP un-dead traits, half damage from piercing and slashing weapons, vulnerable to fire; SV Fort +0, Ref +0, Will +0; AL C.");
    expect(line.resist).toEqual(["piercing", "slashing"]);
    expect(line.weak).toEqual(["fire"]);
    expect(weakSpot({ piercing: 1, slashing: 1 })).toEqual({ bludgeoning: 1 });
    expect(weakSpot({})).toEqual({});
    expect(weakSpot({ piercing: 1, slashing: 1, bludgeoning: 1 })).toEqual({});
  });
});
