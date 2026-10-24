/**
 * Things carried that are thrown to harm (text.js thrownIn, adapter.js thrownActions): read from their descriptions, a
 * missile attack each with its count as its resource; holy water harming only the unholy (rules.js applyIwr); and the
 * sheet's count spent as they're thrown (commit.js). The descriptions here are made up for the tests, in the books' style.
 */
import { describe, expect, test } from "vitest";
import { thrownIn } from "../scripts/text.js";
import { thrownActions } from "../scripts/adapter.js";
import { dccRules } from "../scripts/rules.js";
import { commitDccChanges } from "../scripts/commit.js";

const HOLY = "A vial of holy water can be thrown 10' and does 1d4 damage to un-dead creatures.";
const OIL = "A flask of oil, lit and thrown up to 20', does 1d6 fire damage.";

describe("reading what's thrown", () => {
  test("damage, its kind, range, and whether it harms only the unholy; anything else isn't", () => {
    expect(thrownIn(HOLY)).toMatchObject({ unholyOnly: true, range: 10 });
    const oil = thrownIn(OIL);
    expect(oil).toMatchObject({ unholyOnly: false, range: 20 });
    expect(oil.damage[0]).toMatchObject({ type: "fire" });
    expect(thrownIn("Fifty feet of hemp rope.")).toBeNull();
  });

  test("a missile attack each, its count the resource; holy water does nothing to the living", () => {
    const actor = {
      id: "a",
      system: { details: { attackBonus: "+1" }, abilities: { agl: { mod: 1 } } },
      items: [
        { id: "h", type: "equipment", name: "Holy water", system: { quantity: 2, description: { value: HOLY } } },
        { id: "r", type: "equipment", name: "Rope", system: { quantity: 1, description: { value: "Fifty feet of rope." } } }
      ]
    };
    const [holy] = thrownActions(actor);
    expect(holy).toMatchObject({ id: "a.thrown.h", bonus: 2, melee: false, thrown: true, resource: "item:h", pool: 2, unholyOnly: true });
    expect(thrownActions(actor)).toHaveLength(1);
    expect(dccRules.applyIwr({}, { untyped: 3 }, { spec: {} }, { action: holy })).toBe(0);
    expect(dccRules.applyIwr({}, { untyped: 3 }, { spec: { unholy: true } }, { action: holy })).toBe(3);
  });
});

describe("thrown in a live battle", () => {
  test("the sheet's count down by as many; the item gone at none", async () => {
    const done = [];
    const item = id => ({ id, system: { quantity: 2 }, toObject: () => ({ _id: id }), update: async u => done.push([id, u]), delete: async () => done.push([id, "deleted"]) });
    const items = new Map([["h", item("h")], ["o", item("o")]]);
    const actor = { uuid: "Actor.a", type: "Player", statuses: new Set(), effects: [], items, system: { abilities: {}, attributes: { hp: { value: 5 } } }, update: async () => {} };
    globalThis.foundry = { utils: { getProperty: (o, k) => k.split(".").reduce((x, p) => x?.[p], o), deepClone: structuredClone } };
    globalThis.game = { ...globalThis.game, settings: { get: () => false }, combat: null, users: { get: () => null } };
    const undo = await commitDccChanges({ uuid: "Token.t", actor }, { actions: [] }, { resources: { "item:h": { from: 2, to: 1 }, "item:o": { from: 2, to: 0 } } }, { status: "standing", system: {} }, { before: { system: {} } });
    expect(done).toEqual([["h", { "system.quantity": 1 }], ["o", "deleted"]]);
    expect(undo.itemUpdates).toEqual([{ id: "h", update: { "system.quantity": 2 } }]);
    expect(undo.deletedItems).toEqual([{ _id: "o" }]);
  });
});
