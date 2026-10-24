/**
 * More of a monster's stat line read (text.js): attack riders with a save (death, damage, a condition), extra damage
 * and damage each round; saves it's better at; auras with a save and an outcome; rend and constriction; harmed only by
 * magic or silver; damage reduction; never surprised; words broken across a printed line. And how the rules play what
 * only magic harms and damage reduction. The lines here are made up in DCC's format, not any book's.
 */
import { describe, expect, test } from "vitest";
import { ridersIn, saveVsIn, aurasIn, followUpsIn, statLine, plain } from "../scripts/text.js";
import { followUpActions } from "../scripts/adapter.js";
import { dccRules } from "../scripts/rules.js";

describe("attack riders", () => {
  test("a poison's save: death, damage, or a condition; its kind for immunity", () => {
    const [death] = ridersIn("poison (DC 15 Fort save or death)").effects;
    expect(death).toMatchObject({ kind: "save", save: { type: "frt", dc: 15 }, slay: true, traits: ["poison"] });
    const [hurt] = ridersIn("disease (DC 7 Fort save or additional 1d6 damage)").effects;
    expect(hurt).toMatchObject({ save: { dc: 7 }, traits: ["disease"] });
    expect(hurt.damage[0].dice[0]).toMatchObject({ n: 1, faces: 6 });
    const [held] = ridersIn("paralysis (DC 16 Fort or paralyzed 1d4 rounds)").effects;
    expect(held.conditions.paralyzed).toBe(1);
  });

  test("extra damage with the blow, a grab, damage each round; a range isn't a rider, a name alone is nothing", () => {
    const r = ridersIn("+1d6 acid plus grab");
    expect(r.damage[0]).toMatchObject({ type: "acid" });
    expect(r.effects).toEqual([{ kind: "grabbed" }]);
    expect(ridersIn("blood drain (automatic 1d4 dmg per round)").damage[0].persistent).toBe(true);
    expect(ridersIn(", range 100'")).toEqual({ effects: [], damage: [] });
    expect(ridersIn("slime")).toEqual({ effects: [], damage: [] });
  });
});

describe("specials", () => {
  test("saves it's better at, by what they're against", () => {
    expect(saveVsIn("+4 to saves vs. magic")).toEqual([{ bonus: 4, vs: ["magical"] }]);
    expect(saveVsIn("+2 to Fort saves against poison")).toEqual([{ bonus: 2, vs: ["poison"], saves: ["frt"] }]);
  });

  test("an aura with its save and what a failure does; one that names no outcome isn't one", () => {
    const [stench] = aurasIn("stench 20' (DC 12 Fort or -2 to attacks)");
    expect(stench).toMatchObject({ label: "stench 20'", range: 20, save: { type: "frt", dc: 12 } });
    expect(stench.outcome.mods.attack).toBe(-2);
    expect(aurasIn("gaze (DC 14 Will)")).toEqual([]);
  });

  test("rend after so many hits with the attack it names; constriction on one it holds", () => {
    expect(followUpsIn("rend for additional 1d8 damage if more than 2 slam attacks hit")).toEqual([{ kind: "rend", damage: "1d8", n: 3, with: "slam" }]);
    expect(followUpsIn("constriction 1d6")).toEqual([{ kind: "hold", damage: "1d6" }]);
    const acts = followUpActions("a", [{ kind: "rend", damage: "1d8", n: 2, with: "claw" }, { kind: "hold", damage: "1d6" }], [{ id: "a.claw", name: "Claws", kind: "strike", melee: true }]);
    expect(acts.map(a => a.requires)).toEqual([{ hits: { n: 2, with: ["a.claw"] } }, { holding: true }]);
  });

  test("harmed only by magic or silver, damage reduction, never surprised; a broken word read whole; demonic is unholy", () => {
    expect(statLine("SP immune to non-magical weapons; SV").harmedOnlyBy).toEqual({ magic: true, materials: [], half: false });
    expect(statLine("SP harmed only by silver or magic weapons; SV").harmedOnlyBy).toEqual({ magic: true, materials: ["silver"], half: false });
    expect(statLine("SP resistant to non-magical weapons; SV").harmedOnlyBy.half).toBe(true);
    expect(statLine("SP damage reduction 5, never surprised; SV")).toMatchObject({ reduction: 5, neverSurprised: true });
    expect(plain("infravi- sion 60'")).toBe("infravision 60'");
    expect(statLine("SP infravi- sion 60'; SV").infravision).toBe(60);
    expect(statLine("SP demonic traits; SV").unholy).toBe(true);
  });
});

describe("the rules: what only magic harms, damage reduction", () => {
  const target = spec => ({ spec });
  test("a mundane blow does nothing (or half); a magic one, or silver, harms", () => {
    const only = { harmedOnlyBy: { magic: true, materials: ["silver"], half: false } };
    expect(dccRules.applyIwr({}, { slashing: 8 }, target(only), {})).toBe(0);
    expect(dccRules.applyIwr({}, { slashing: 8 }, target(only), { magical: true })).toBe(8);
    expect(dccRules.applyIwr({}, { slashing: 8 }, target(only), { materials: ["silver"] })).toBe(8);
    expect(dccRules.applyIwr({}, { slashing: 8 }, target({ harmedOnlyBy: { magic: true, materials: [], half: true } }), {})).toBe(4);
  });

  test("damage reduction comes off physical harm, once a blow", () => {
    expect(dccRules.applyIwr({}, { slashing: 4, fire: 6 }, target({ reduction: 5 }), {})).toBe(6);
  });
});

describe("a rider the stat line only names, from the book's entry", () => {
  test("the sentence with a DC that speaks of it, or of the attack", async () => {
    const { entryRider } = await import("../scripts/text.js");
    const entry = "<p>A thing bitten by the beast must make a DC 13 Will save or be paralyzed for 1d4 rounds.</p><p>It hides in a DC 20 crevice.</p>";
    const [e] = entryRider(["paralysis", "bite"], entry).effects;
    expect(e).toMatchObject({ kind: "save", save: { type: "wil", dc: 13 } });
    expect(e.conditions.paralyzed).toBe(1);
    expect(entryRider(["slime"], entry).effects).toEqual([]);
  });
});
