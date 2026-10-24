/**
 * More of XCC's classes: a Jammer's Lionize (a performance check read on the book's Lionization table: one friend,
 * the Jammer's level in rounds; none without the table) and a Half-Orc's Wild Attack (the wild crit range, Luck on the
 * roll and the damage, laying it open to every foe in reach). The rows here are made up for the tests, in the table's
 * style; no book's text is quoted.
 */
import { describe, expect, test } from "vitest";
import { lionize, lionizeMods, wildAttacks } from "../scripts/adapter.js";

const jammer = { id: "j", system: { details: { level: { value: 3 } }, abilities: { per: { mod: 1 }, lck: { mod: 1 } } } };
const ROWS = [
  { range: [-100, 1], text: "The crowd jeers; a foe of the judge's choosing gains a die on its next action." },
  { range: [2, 11], text: "No effect" },
  { range: [12, 19], text: "+1 attack rolls and Willpower saves" },
  { range: [20, 100], text: "+2 attack rolls, Reflex saves, and skill checks; +1 spell checks and AC" }
];

describe("a Jammer's Lionize", () => {
  test("each row's bonuses, all it names", () => {
    expect(lionizeMods(ROWS[3].text)).toEqual({ attack: 2, saves: 2, checks: 2, ac: 1 });
    expect(lionizeMods("No effect")).toEqual({});
  });

  test("a buff for one friend, the check its tiers, the Jammer's level in rounds; none without the table", () => {
    const [a] = lionize(jammer, ROWS);
    expect(a).toMatchObject({ id: "j.lionize", kind: "buff", includeSelf: false, casting: { mod: 5, faces: 20 } });
    expect(a.tiers.map(x => [x.min, x.outcome.mods, x.outcome.rounds])).toEqual([[12, { attack: 1, saves: 1 }, 3], [20, { attack: 2, saves: 2, checks: 2, ac: 1 }, 3]]);
    expect(a.castChance).toBeGreaterThan(0.5);
    expect(lionize(jammer, null)).toEqual([]);
  });
});

describe("a Half-Orc's Wild Attack", () => {
  test("each melee weapon's: its wild crit range, Luck on the roll and the damage; it provokes; the engine rolls it", () => {
    const actor = {
      id: "o", items: { get: id => ({ axe: { system: { critRange: 20 } } })[id] },
      system: { abilities: { lck: { mod: 2 } }, class: { wildCritRange: 18 } }
    };
    const axe = { id: "o.axe", itemId: "axe", name: "Axe", kind: "strike", melee: true, bonus: 3, damage: [{ dice: [{ n: 1, faces: 8 }], flat: 0, type: "slashing" }] };
    const bow = { id: "o.bow", itemId: "bow", name: "Bow", kind: "strike", melee: false, bonus: 2, damage: [] };
    const [wild] = wildAttacks(actor, [axe, bow]);
    expect(wild).toMatchObject({ id: "o.axe.wild", itemId: undefined, bonus: 5, critOn: 18, provokes: true });
    expect(wild.damage.at(-1)).toMatchObject({ flat: 2, type: "slashing" });
    expect(wildAttacks(actor, [bow])).toEqual([]);
  });
});
