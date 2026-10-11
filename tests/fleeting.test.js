/**
 * Fleeting Luck (DCC's, a player's for all its characters) and Mojo (XCC's, each crawler's own): spent first on a
 * roll that falls short; a natural 20 earns a point; a natural 1 on a d14 or bigger takes every pool.
 */
import { describe, expect, test } from "vitest";
import { dccRules } from "../scripts/rules.js";
import { parseFormula } from "../scripts/core.js";
import { prepareBattle, replay } from "../../FastFighting/scripts/engine/simulator.js";
import { createRun } from "../../FastFighting/scripts/engine/battle-state.js";

const traits = { tactical: { base: 50, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
const sword = { id: "sword", name: "Sword", kind: "strike", cost: 1, bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d8", "slashing")] };
const pc = (id, key, points = 2, extra = {}) => ({
  id, name: id, side: "friendly", kind: "pc", level: 1, hp: { value: 20, max: 20 }, hitDie: 8, defenses: { ac: 13, frt: 1, ref: 1, wil: 1 },
  initiative: { mod: 0 }, speeds: { walk: 30 }, actions: [sword], iwr: {}, traits, flags: { fearless: true }, diesAtZero: false, actionDice: [20],
  resources: { fleeting: points }, boosts: [{ pool: "fleeting", shared: key, label: "Mojo", per: 1, recovers: true }],
  fleeting: { key, kind: key.split(":")[0], id, points }, ...extra
});
const orc = { id: "orc", name: "Orc", side: "hostile", kind: "npc", level: 2, hp: { value: 30, max: 30 }, hitDie: 8, defenses: { ac: 15, frt: 2, ref: 1, wil: 0 },
  initiative: { mod: 0 }, speeds: { walk: 30 }, actions: [{ ...sword, id: "claw", name: "Claw", bonus: 3 }], iwr: {}, traits, flags: { fearless: true }, diesAtZero: true, actionDice: [20] };
const battle = combatants => ({ combatants, sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } }, options: { positioning: false, maxRounds: 6 } });

describe("Fleeting Luck and Mojo", () => {
  test("a player's characters draw on one pool; a crawler on its own", () => {
    const run = createRun(prepareBattle(battle([pc("a", "user:p1", 3), pc("b", "user:p1", 3), pc("c", "actor:c", 1), orc]), dccRules));
    expect(run.sharedPools).toEqual({ "user:p1": 3, "actor:c": 1 });
    run.sharedPools["user:p1"] -= 2;
    expect(dccRules.capture(run.byId.get("b")).fleeting).toBe(1);
  });

  test("a character's natural 20 earns its pool a point; a natural 1 on a d14 or bigger takes every pool; a smaller die's doesn't", () => {
    const run = createRun(prepareBattle(battle([pc("a", "user:p1", 1), pc("c", "actor:c", 2), orc]), dccRules));
    run.log = [];
    const [a, c] = [run.byId.get("a"), run.byId.get("c")];
    dccRules.afterRoll(run, a, { natural: 20, total: 21 }, { kind: "attack", faces: 20 });
    expect(run.sharedPools["user:p1"]).toBe(2);
    dccRules.afterRoll(run, c, { natural: 1, total: 2 }, { kind: "cast", faces: 10 });
    expect(run.sharedPools).toEqual({ "user:p1": 2, "actor:c": 2 });
    dccRules.afterRoll(run, c, { natural: 1, total: 2 }, { kind: "attack", faces: 16 });
    expect(run.sharedPools).toEqual({ "user:p1": 0, "actor:c": 0 });
    // (A creature's roll counts for nothing.)
    run.sharedPools["user:p1"] = 1;
    dccRules.afterRoll(run, run.byId.get("orc"), { natural: 1, total: 1 }, { kind: "attack", faces: 20 });
    expect(run.sharedPools["user:p1"]).toBe(1);
    expect(run.log.filter(e => e.type === "fleeting")).toHaveLength(2);
  });

  test("in a fight, it goes on rolls that fall short, before Luck", () => {
    let spent = 0;
    for ( let seed = 1; seed <= 30; seed++ ) {
      const r = replay(battle([pc("a", "user:p1", 3, { resources: { fleeting: 3, luck: 10 }, boosts: [{ pool: "fleeting", shared: "user:p1", label: "Mojo", per: 1, recovers: true }, { pool: "luck", label: "Luck", per: 1, keep: 6 }] }), orc]), dccRules, seed);
      spent += r.log.filter(e => e.type === "boost" && e.label === "Mojo").reduce((s, e) => s + e.spent, 0);
      expect(r.units.a.final.system.fleeting).toBeGreaterThanOrEqual(0);
    }
    expect(spent).toBeGreaterThan(0);
  });
});
