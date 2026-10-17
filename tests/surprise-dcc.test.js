/**
 * Surprise as DCC has it (the planner's Follow System, rules.surprise): those lying in wait as it starts (hidden
 * tokens) get a surprise round; nobody hidden, none.
 */
import { describe, expect, test } from "vitest";
import { dccRules } from "../scripts/rules.js";
import { beginRun, prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";

const unit = (id, side, over = {}) => ({ id, name: id, side, kind: "npc", level: 1, hp: { value: 10, max: 10 }, defenses: { ac: 12, fort: 1, ref: 1, will: 1 }, initiative: { mod: 1 }, speeds: { walk: 30 }, actions: [], iwr: {}, flags: { fearless: true }, diesAtZero: true, ...over });
const begin = combatants => beginRun(prepareBattle({ combatants, sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } }, options: { maxRounds: 2, surprise: "system" } }, dccRules), 1);

describe("DCC's surprise", () => {
  test("those lying in wait get a surprise round; nobody hidden, none", () => {
    expect(begin([unit("hero", "friendly"), unit("orc", "hostile", { hidden: true })]).surprise).toMatchObject({ by: ["hostile"], round: true, surprised: [] });
    expect(dccRules.surprise(begin([unit("hero", "friendly"), unit("orc", "hostile")]))).toBeNull();
  });
});
