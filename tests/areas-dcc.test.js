/**
 * A spell result's area as the core's (API 32): a cone or a line from the caster, a radius a burst where it's aimed
 * (from a grid corner, the core's) or an emanation round the caster, a diameter a burst of half of it; friends caught
 * in it too, unless it spares them (text.js areaShapeIn, reading/en.json's targets). Results are written for these
 * tests in DCC's style; no book's text is quoted.
 */
import { describe, expect, test } from "vitest";
import { areaShapeIn, spellResult } from "../scripts/text.js";
import { spellAction } from "../scripts/spells.js";

describe("an area's shape, from a result's words", () => {
  test("a cone, a line, a radius, a diameter", () => {
    expect(areaShapeIn("Flame pours out in a cone 40' long; all within take 2d6 damage.")).toEqual({ shape: "cone", feet: 40 });
    expect(areaShapeIn("A 30' cone of frost.")).toEqual({ shape: "cone", feet: 30 });
    expect(areaShapeIn("A bolt in a line 60' long strikes everyone in it.")).toEqual({ shape: "line", feet: 60 });
    expect(areaShapeIn("A ball of fire bursts, and all creatures within a 20' radius take 4d6 damage.")).toEqual({ shape: "burst", feet: 20, center: "target" });
    expect(areaShapeIn("Everything in a 10’-diameter circle takes 1d6 damage.")).toEqual({ shape: "burst", feet: 5, center: "target" });
    expect(areaShapeIn("Shards fly in a 15' radius around him; each creature takes 1d4.")).toEqual({ shape: "emanation", feet: 15 });
  });

  test("DCC's own measures: a cone as wide at its end as it says, a line as wide; a burst on its target, no grid corner", () => {
    // (30 long and 10 wide at its end: 2 atan(5/30), about 18.9 degrees, not a quarter turn.)
    expect(areaShapeIn("The breath is a cone 10' wide at its end and 30' long.")).toEqual({ shape: "cone", feet: 30, angle: 18.92 });
    expect(areaShapeIn("Fire pours out in a cone measuring 60' x 30'.")).toMatchObject({ shape: "cone", feet: 60, angle: 28.07 });
    expect(areaShapeIn("A line 60' long and 10' wide crackles with lightning.")).toEqual({ shape: "line", feet: 60, width: 10 });
    // (A cone whose width DCC's text doesn't give: no angle of our own, the core's default.)
    expect(areaShapeIn("A 30' cone of frost.").angle).toBeUndefined();
    expect(areaShapeIn("All creatures within a 20' radius of the target take 2d6 damage.").center).toBe("target");
  });

  test("none named: no shape (a single target, or an area without one)", () => {
    expect(areaShapeIn("The target within line of sight takes 1d6 damage.")).toBeNull();
    expect(areaShapeIn("Up to three targets must make a Will save.")).toBeNull();
  });

  test("DCC's \"all targets within 20'\": round the caster; \"of the target\", on it", () => {
    expect(areaShapeIn("A blast of fire centered on himself: all targets within 20' take 1d12 damage.")).toEqual({ shape: "emanation", feet: 20 });
    expect(areaShapeIn("All creatures within 10' of the target are knocked down.")).toEqual({ shape: "burst", feet: 10, center: "target" });
    expect(areaShapeIn("The caster can frighten all enemies within 30'.")).toEqual({ shape: "emanation", feet: 30, selective: true });
  });

  test("selective where it spares friends; not where it says it catches them too", () => {
    expect(areaShapeIn("All enemies within a 20' radius must save or flee.")).toMatchObject({ selective: true });
    expect(areaShapeIn("A cone 30' long; the caster may have it strike only enemies.")).toMatchObject({ selective: true });
    expect(areaShapeIn("Creatures of the caster's choice within a 10' radius are slowed.")).toMatchObject({ selective: true });
    expect(areaShapeIn("All targets, including allies, within the cone 30' long take 3d6 damage.").selective).toBeUndefined();
    expect(areaShapeIn("A 20' radius of flame engulfs everyone.").selective).toBeUndefined();
  });

  test("a spell's tier carries it as the core's area", () => {
    const rows = [
      { range: [1, 11], text: "Lost. Failure." },
      { range: [12, 99], text: "A ball of flame bursts: all creatures within a 20' radius take [[/roll 3d6]] damage (Ref save for half)." }
    ];
    expect(spellResult(rows[1].text)).toMatchObject({ area: true, areaShape: { shape: "burst", feet: 20 } });
    const action = spellAction({ id: "fb", name: "Fire Burst", rows, mod: 4, casterLevel: 3 });
    expect(action.tiers[0].area).toMatchObject({ shape: "burst", feet: 20, targets: 3, center: "target" });
  });
});
