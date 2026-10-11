/**
 * Xcrawl Classics: its classes as the rules that go by class see them, and the Brawler's fists and Toughness.
 */
import { describe, expect, test } from "vitest";
import { archetype } from "../scripts/classes.js";
import { brawlerFists, toughnessOf } from "../scripts/adapter.js";
import { dccRules } from "../scripts/rules.js";
import { parseFormula, meanPart } from "../scripts/core.js";
import { replay } from "../../FastFighting/scripts/engine/simulator.js";

const brawler = ({ armor = [], toughness = "2", attackBonus = "+1" } = {}) => ({
  id: "b1",
  system: { abilities: { str: { mod: 2 }, lck: { mod: 1 } }, details: { attackBonus }, class: { unarmedDamage: "1d6", toughness } },
  itemTypes: { armor }
});
const crit = { die: { dice: [{ count: 1, faces: 8 }], flat: 0 }, rows: [] };

describe("XCC classes", () => {
  test("the Messenger is a cleric; each Specialist a thief; the Brawler fights with its fists", () => {
    expect(archetype("messenger").cleric).toBe(true);
    for ( const sp of ["sp-scout", "sp-commando", "sp-acrobat", "sp-criminal"] ) expect(archetype(sp).thief).toBe(true);
    expect(archetype("brawler").brawler).toBe(true);
    expect(archetype("warrior")).toMatchObject({ thief: false, cleric: false, brawler: false });
  });
});

describe("the Brawler", () => {
  test("unarmed: two attacks together, a d16 each, no fumble on one alone; its bonus and damage from attack bonus, Strength and Luck", () => {
    const [fists] = brawlerFists(brawler(), { armed: false, firstDie: 20, crit });
    expect(fists.sequence).toHaveLength(2);
    expect(fists.sequence.every(a => a.die === 16 && a.fumbleOn === 0 && a.melee)).toBe(true);
    expect(fists.bonus).toBe(4);
    expect(meanPart(fists.damage[0])).toBeCloseTo(3.5 + 4, 5);
    expect(fists.crit).toBe(crit);
  });

  test("armed: a free unarmed attack (a d14) besides its own; armor too heavy: no crits", () => {
    const [free] = brawlerFists(brawler(), { armed: true, firstDie: 20, crit });
    expect(free).toMatchObject({ die: 14, economy: "bonus" });
    const heavy = brawlerFists(brawler({ armor: [{ system: { equipped: true, checkPenalty: -4 } }] }), { armed: true, firstDie: 20, crit })[0];
    expect(heavy.critOn).toBe(99);
  });

  test("Toughness: so much off every melee blow (not a ranged one); none, none", () => {
    expect(toughnessOf(brawler())).toEqual([expect.objectContaining({ on: "hit", melee: true, reduce: expect.objectContaining({ flat: 2 }) })]);
    expect(toughnessOf(brawler({ toughness: "" }))).toBeUndefined();
  });

  test("in a fight, Toughness takes something off the blows that land", () => {
    const traits = { tactical: { base: 50, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
    const unit = extra => ({ side: "friendly", kind: "pc", level: 1, hp: { value: 40, max: 40 }, hitDie: 8, defenses: { ac: 10, frt: 1, ref: 1, wil: 1 }, initiative: { mod: 0 }, speeds: { walk: 30 },
      iwr: {}, traits, flags: { fearless: true }, diesAtZero: false, actionDice: [20], ...extra });
    const club = { id: "club", name: "Club", kind: "strike", cost: 1, bonus: 6, melee: true, reach: 5, damage: [parseFormula("1d6+2", "bludgeoning")] };
    const spec = reactions => ({ combatants: [
      unit({ id: "b", name: "Brawler", actions: brawlerFists(brawler(), { armed: false, firstDie: 20, crit }), reactions }),
      unit({ id: "o", name: "Orc", side: "hostile", kind: "npc", diesAtZero: true, actions: [club] })
    ], sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } }, options: { positioning: false, maxRounds: 3 } });
    let lessened = 0;
    for ( let seed = 1; seed <= 20; seed++ ) {
      const r = replay(spec(toughnessOf(brawler())), dccRules, seed);
      lessened += r.log.filter(e => e.type === "attack" && e.actorId === "o" && e.lessened > 0).length;
      // (Its fists: two attacks an action.)
      const first = r.log.filter(e => e.type === "attack" && e.actorId === "b" && e.round === 1);
      if ( first.length ) expect(first.length % 2).toBe(0);
    }
    expect(lessened).toBeGreaterThan(0);
  });
});
