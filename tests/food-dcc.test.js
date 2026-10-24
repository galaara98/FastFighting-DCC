/**
 * Food in DCC (food.js): who eats what, by what the system and the stat line say of a creature (no diet, size or type
 * of DCC's own); what a body leaves by its token's size; and what counts as food, by name. The creatures here are made
 * up for the tests; the field paths are the dcc system's own.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { dccAppetite, dccMeatFor, dccIsFood, HUNGER } from "../scripts/food.js";

const creature = ({ name = "Thing", type = "NPC", notes = "", weapons = [], table = "M", width = 1 } = {}) => ({
  name, type, flags: {}, prototypeToken: { width },
  system: { details: { notes: { value: notes } }, attributes: { critical: { table } } },
  items: weapons.map(w => ({ type: "weapon", name: w }))
});

beforeEach(() => {
  globalThis.CONFIG = { DCC: { monsterCriticalHits: { "1": { demon: { table: "DN" }, humanoid: { table: "III" }, other: { table: "M" } } } } };
});

describe("who eats what", () => {
  test("a beast that bites eats meat; another beast anything; anyone else anything, rarely hungry", () => {
    expect(dccAppetite(creature({ name: "Wolf", weapons: ["Bite"] }))).toEqual({ diet: "meat", hunger: HUNGER.biter, cannibal: false });
    expect(dccAppetite(creature({ name: "Goat", weapons: ["Horns"] }))).toEqual({ diet: "any", hunger: HUNGER.beast, cannibal: false });
    expect(dccAppetite(creature({ name: "Orc", table: "III", weapons: ["Spear"] }))).toEqual({ diet: "any", hunger: HUNGER.living, cannibal: false });
  });

  test("the un-dead, constructs, the mindless and demons eat nothing", () => {
    for ( const c of [creature({ name: "Skeleton", notes: "Un-dead traits" }), creature({ name: "Devil frog", table: "DN" })] ) {
      expect(dccAppetite(c)).toEqual({ diet: null, hunger: 0, cannibal: false });
    }
    expect(dccAppetite(creature(), { flags: { mindless: true } }).diet).toBeNull();
  });

  test("a pile, or a party, isn't a creature", () => {
    expect(dccAppetite({ ...creature(), flags: { "fast-fighting": { pile: true } } })).toBeNull();
    expect(dccAppetite({ ...creature(), type: "Party" })).toBeNull();
  });
});

describe("what a body leaves", () => {
  test("meat by its size; none from a body of no flesh", () => {
    expect(dccMeatFor(creature({ name: "Rat", width: 0.5 })).quantity).toBe(1);
    expect(dccMeatFor(creature({ name: "Ogre", width: 2 })).quantity).toBe(8);
    expect(dccMeatFor(creature(), { position: { size: 3 } }).quantity).toBe(16);
    expect(dccMeatFor(creature({ name: "Primeval slime" }))).toBeNull();
    expect(dccMeatFor(creature({ name: "Zombie", notes: "Un-dead traits" }))).toBeNull();
    const meat = dccMeatFor(creature());
    expect(meat.item).toMatchObject({ type: "equipment", system: { quantity: 4 }, flags: { "fast-fighting": { food: "meat" } } });
    expect(dccIsFood(meat.item)).toEqual({ portions: 4, meat: true });
  });
});

describe("what counts as food", () => {
  test("rations by name; anything else isn't", () => {
    expect(dccIsFood({ type: "equipment", name: "Rations, per day", system: { quantity: 3 } })).toEqual({ portions: 3, meat: false });
    expect(dccIsFood({ type: "equipment", name: "Rope, 50'", system: { quantity: 1 } })).toBeNull();
    expect(dccIsFood({ type: "weapon", name: "Food fork", system: {} })).toBeNull();
  });
});
