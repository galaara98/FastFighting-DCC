/**
 * A special a stat line names without stats (a breath weapon), read from the creature's entry in the book (text.js
 * limitedIn) and played as a save over its area, so many times a fight (adapter.js limitedAction). The stat lines and
 * entries here are written for these tests in DCC's style; no book's text is quoted.
 */
import { describe, expect, test } from "vitest";
import { limitedIn } from "../scripts/text.js";
import { limitedAction } from "../scripts/adapter.js";

const hound = "Fire dog: Init +2; Atk bite +3 melee (1d6) or breath weapon; AC 13; HD 2d8; MV 40'; Act 1d20; SP immune to fire; SV Fort +2, Ref +2, Will +0; AL C.";
const houndEntry = "<p>Fire dogs hunt in packs. They bite, and once per hour one can loose its breath weapon. The breath weapon is a cone 10' wide at its end and 20' long. Anyone caught in the breath weapon must make a DC 13 Ref save or take [[/roll 2d6]] fire damage.</p>";
const beast = "Three-headed beast: Init +0; Atk bite +4 melee (1d8) or breathe fire; AC 16; HD 5d8; MV 30'; Act 2d20; SP breathe fire 2/day; SV Fort +4, Ref +1, Will +1; AL C.";
const beastEntry = "Its middle head can breathe fire in a cone measuring 40' x 20', dealing [[/roll 3d6]] damage (DC 14 Ref save for half).";

describe("a breath weapon named without stats, from the book's entry", () => {
  test("its save, damage, area and how often", () => {
    expect(limitedIn(hound, houndEntry)).toMatchObject({
      name: "breath weapon", save: { type: "ref", dc: 13, half: false }, uses: 1,
      area: { shape: "cone", feet: 20 }
    });
    expect(limitedIn(hound, houndEntry).damage[0]).toMatchObject({ type: "fire" });
    // (So many a day, from the stat line; half on a save, from the entry.)
    expect(limitedIn(beast, beastEntry)).toMatchObject({ name: "breathe fire", save: { dc: 14, half: true }, uses: 2, area: { shape: "cone", feet: 40 } });
  });

  test("every so many rounds: once, and back after a roll of the die", () => {
    const entry = "Every 1d4 rounds it may breathe fire in a 30' cone; those caught make a DC 12 Ref save or take [[/roll 2d6]] damage.";
    expect(limitedIn("Wyrmling: Atk bite +2 melee (1d6) or breathe fire; SP none.", entry)).toMatchObject({ uses: 1, cooldown: { n: 1, faces: 4 } });
  });

  test("nothing where the entry doesn't say it plainly, or the stat line names none", () => {
    expect(limitedIn(hound, "<p>Fire dogs hunt in packs and fear water.</p>")).toBeNull();
    expect(limitedIn(hound, null)).toBeNull();
    expect(limitedIn("Giant: Atk club +8 melee (2d8); SP able to breathe underwater.", houndEntry)).toBeNull();
  });

  test("played as a save over its area, from the creature, so many times", () => {
    const action = limitedAction("dog", limitedIn(hound, houndEntry));
    expect(action).toMatchObject({ id: "dog.limited", kind: "save", save: { type: "ref", dc: 13, basic: false }, uses: 1, melee: false, range: { increment: 20, max: 20 } });
    // (DCC's cone: 10 wide at its 20-foot end, about 28 degrees, not another system's quarter turn.)
    expect(action.area).toMatchObject({ shape: "cone", feet: 20, targets: 3 });
    expect(action.area.angle).toBeCloseTo(28.07, 1);
  });
});
