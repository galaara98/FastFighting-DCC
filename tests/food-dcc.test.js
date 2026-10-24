/**
 * Food in DCC (food.js): who eats what, by what the system and the stat line say of a creature (no diet, size or type
 * of DCC's own); what a body leaves by its token's size; and what counts as food, by name. The creatures here are made
 * up for the tests; the field paths are the dcc system's own.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { dccAppetite, dccMeatFor, dccIsFood, dccCorpseKind, CORPSES, HUNGER } from "../scripts/food.js";
import { wordList } from "../scripts/words.js";

/** A word of a list a name can carry (plain letters), English's at least: the names here whatever the wording. */
const word = key => wordList(key).find(w => /^[a-z]+$/.test(w));
const name = key => word(key).replace(/^./, c => c.toUpperCase());

const creature = ({ name = "Thing", type = "NPC", notes = "", weapons = [], table = "M", width = 1 } = {}) => ({
  name, type, flags: {}, prototypeToken: { width },
  system: { details: { notes: { value: notes } }, attributes: { critical: { table } } },
  items: weapons.map(w => ({ type: "weapon", name: w }))
});

beforeEach(() => {
  game.i18n._fallback = JSON.parse(readFileSync(new URL("../languages/en.json", import.meta.url), "utf8"));
  globalThis.foundry = { utils: { getProperty: (o, key) => key.split(".").reduce((x, k) => x?.[k], o) } };
  globalThis.CONFIG = { DCC: { monsterCriticalHits: { "1": { demon: { table: "DN" }, humanoid: { table: "III" }, other: { table: "M" } } } } };
});

describe("who eats what", () => {
  test("a beast that bites eats meat; another beast anything; anyone else anything, rarely hungry", () => {
    expect(dccAppetite(creature({ name: name("Beast"), weapons: [name("Bite")] }))).toEqual({ diet: "meat", hunger: HUNGER.biter, cannibal: false });
    expect(dccAppetite(creature({ name: name("Beast"), weapons: ["Horns"] }))).toEqual({ diet: "any", hunger: HUNGER.beast, cannibal: false });
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
  test("a Fresh Corpse: one item, its portions by its size, food; none from a body of no flesh", () => {
    expect(dccMeatFor(creature({ name: "Rat", width: 0.5 })).quantity).toBe(1);
    expect(dccMeatFor(creature({ name: "Ogre", width: 2 })).quantity).toBe(8);
    expect(dccMeatFor(creature(), { position: { size: 3 } }).quantity).toBe(16);
    expect(dccMeatFor(creature({ name: name("NoFlesh") }))).toBeNull();
    const meat = dccMeatFor(creature());
    expect(meat.item).toMatchObject({ type: "equipment", img: CORPSES.fresh.img, system: { quantity: 1 }, flags: { "fast-fighting": { corpse: "fresh", food: "meat", portions: 4 } } });
    expect(dccIsFood(meat.item)).toEqual({ portions: 4, meat: true });
    expect(dccIsFood({ ...meat.item, flags: { "fast-fighting": { corpse: "fresh", food: "meat", portions: 0 } } })).toBeNull();
  });

  test("the un-dead's a Rotten Corpse, never food; a construct's, a demon's, none", () => {
    const zombie = creature({ name: "Zombie", notes: "Un-dead traits" });
    expect(dccCorpseKind(zombie)).toBe("rotten");
    const rotten = dccMeatFor(zombie);
    expect(rotten.quantity).toBe(0);
    expect(rotten.item).toMatchObject({ type: "equipment", img: CORPSES.rotten.img, flags: { "fast-fighting": { corpse: "rotten" } } });
    expect(dccIsFood(rotten.item)).toBeNull();
    expect(dccMeatFor(creature({ name: "Statue", notes: "Construct" }))).toBeNull();
    expect(dccMeatFor(creature({ name: "Imp", table: "DN" }))).toBeNull();
  });

  test("the meat of before still eats as its quantity", () => {
    expect(dccIsFood({ type: "equipment", system: { quantity: 3 }, flags: { "fast-fighting": { food: "meat" } } })).toEqual({ portions: 3, meat: true });
  });
});

describe("what counts as food", () => {
  test("rations by name; anything else isn't", () => {
    expect(dccIsFood({ type: "equipment", name: `${name("Rations")}, per day`, system: { quantity: 3 } })).toEqual({ portions: 3, meat: false });
    expect(dccIsFood({ type: "equipment", name: "Rope, 50'", system: { quantity: 1 } })).toBeNull();
    expect(dccIsFood({ type: "weapon", name: "Food fork", system: {} })).toBeNull();
  });
});
