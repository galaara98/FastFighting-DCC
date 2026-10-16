/**
 * The body rolled after a live battle, written onto the sheet: found alive, a point of the ability the roll took gone
 * for good, no longer dead, groggy, and back in the tracker; all of it in the undo record.
 */
import { afterEach, describe, expect, test } from "vitest";
import { commitDccChanges } from "../scripts/commit.js";

const before = { foundry: globalThis.foundry, game: globalThis.game };
afterEach(() => Object.assign(globalThis, before));

function setUp() {
  const toggled = [];
  const updates = [];
  const combatant = { uuid: "Combatant.c", defeated: true, update: async d => Object.assign(combatant, d) };
  const statuses = new Set(["dead"]);
  const actor = {
    uuid: "Actor.a", type: "Player", statuses, effects: [], items: { get: () => null },
    system: { abilities: { agl: { value: 12, max: 12 } }, attributes: { hp: { value: 0 } } },
    toggleStatusEffect: async (id, { active }) => { toggled.push([id, active]); if ( active ) statuses.add(id); else statuses.delete(id); },
    update: async d => updates.push(d)
  };
  const getProperty = (o, path) => path.split(".").reduce((v, k) => v?.[k], o);
  globalThis.foundry = { utils: { getProperty } };
  globalThis.game = { ...before.game, combat: { getCombatantsByToken: () => [combatant] }, settings: { get: () => false }, users: { get: () => null } };
  return { actor, toggled, updates, combatant };
}

describe("the body rolled, in a live battle", () => {
  test("found alive: the ability point, not dead, groggy, back in the tracker", async () => {
    const { actor, toggled, updates, combatant } = setUp();
    const changes = { hp: { from: 0, to: 1 }, revived: true, status: { from: "dead", to: "standing" } };
    const final = { status: "standing", system: { body: "agl" } };
    const undo = await commitDccChanges({ uuid: "Token.t", actor }, { actions: [] }, changes, final, { before: { system: { body: null } } });
    expect(updates[0]).toMatchObject({ "system.abilities.agl.value": 11, "system.abilities.agl.max": 11, "system.attributes.hp.value": 1 });
    expect(toggled).toContainEqual(["dead", false]);
    expect(toggled).toContainEqual(["groggy", true]);
    expect(combatant.defeated).toBe(false);
    expect(undo.combatant).toEqual({ uuid: "Combatant.c", defeated: true });
    expect(undo.statuses).toContainEqual({ id: "dead", active: true, overlay: true });
  });

  test("already found before this turn: nothing more taken", async () => {
    const { actor, toggled, updates } = setUp();
    actor.statuses.delete("dead");
    await commitDccChanges({ uuid: "Token.t", actor }, { actions: [] }, {}, { status: "standing", system: { body: "agl" } }, { before: { system: { body: "agl" } } });
    expect(updates).toHaveLength(0);
    expect(toggled).toHaveLength(0);
  });
});
