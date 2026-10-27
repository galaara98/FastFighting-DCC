/**
 * A review's findings: a player's Fleeting Luck written once for all its characters; spellburn taken as its pool counts
 * it; a spell's results table by its id as well as its name, and a blank one not shared; a stat line read once for its
 * spell check; XCC's Mojo put back by Rewind.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { burnable, commitDccChanges } from "../scripts/commit.js";
import { DccTables } from "../scripts/tables.js";
import { checkFor } from "../scripts/check-roll.js";
import * as text from "../scripts/text.js";
import { DccAdapter } from "../scripts/adapter.js";
import { actorData, rewindScopes } from "../../fast-fighting/scripts/foundry/make-it-so.js";

vi.mock("../scripts/text.js", async original => {
  const real = await original();
  return { ...real, statLine: vi.fn(real.statLine) };
});

const was = { foundry: globalThis.foundry, game: globalThis.game };
afterEach(() => Object.assign(globalThis, was));

const getProperty = (o, path) => path.split(".").reduce((v, k) => v?.[k], o);

/** A character, its sheet's updates kept; the world's users `users`. */
function character(id, abilities = {}, users = []) {
  const updates = [];
  const actor = {
    id, uuid: `Actor.${id}`, type: "Player", statuses: new Set(), effects: [], items: { get: () => null }, flags: {},
    system: { abilities, attributes: { hp: { value: 5 } } },
    toggleStatusEffect: async () => {},
    update: async d => updates.push(d)
  };
  globalThis.foundry = { utils: { getProperty } };
  globalThis.game = { ...was.game, combat: null, settings: { get: () => false }, users: { get: uid => users.find(u => u.id === uid) ?? null } };
  return { actor, updates };
}

describe("Fleeting Luck, one pool for all a player's characters", () => {
  test("a natural 20 among four of them: the player's pool one more, not four", async () => {
    const flags = { fleetingLuckValue: 2 };
    const player = { id: "p1", getFlag: (scope, key) => flags[key], setFlag: async (scope, key, v) => { flags[key] = v; } };
    const spec = { actions: [], fleeting: { kind: "user", id: "p1", key: "user:p1" } };
    const undos = [];
    for ( const id of ["a", "b", "c", "d"] ) {
      const { actor } = character(id, {}, [player]);
      undos.push(await commitDccChanges({ uuid: `Token.${id}`, actor }, spec, { system: { from: {}, to: {} } }, { status: "standing", system: { fleeting: 3 } },
        { before: { system: { fleeting: 2 } } }));
    }
    expect(flags.fleetingLuckValue).toBe(3);
    // (The first wrote it, and puts it back; the rest found it so.)
    expect(undos.map(u => u.userUpdate ?? null)).toEqual([{ "flags.dcc.fleetingLuckValue": 2 }, null, null, null]);
  });
});

describe("spellburn", () => {
  test("taken as its pool counts it: Strength, then Stamina, then Agility, none below 8", async () => {
    const abilities = { str: { value: 16 }, sta: { value: 12 }, agl: { value: 10 } };
    expect(burnable(abilities)).toBe(14);
    const { actor, updates } = character("w", abilities);
    await commitDccChanges({ uuid: "Token.w", actor }, { actions: [] }, { resources: { spellburn: { from: 14, to: 4 } } }, { status: "standing" }, { before: { system: {} } });
    expect(updates[0]).toMatchObject({ "system.abilities.str.value": 8, "system.abilities.sta.value": 10 });
    expect(updates[0]).not.toHaveProperty(["system.abilities.agl.value"]);
  });
});

describe("a spell's results table", () => {
  const rows = label => [{ range: [1, 20], description: label }];
  const spell = (name, results) => ({ name, type: "spell", system: { results } });
  const world = (tables, packs = []) => {
    globalThis.game = { ...was.game, packs: Object.assign(packs, { get: id => packs.find(p => p.collection === id) }), tables: Object.assign(tables, { getName: n => tables.find(t => t.name === n) }) };
  };

  test("by the id the dcc system stores (bare, or RollTable.<id>), in the world's tables or its pack", async () => {
    world([{ id: "t1", name: "Results, renamed", results: rows("from t1") }]);
    expect((await new DccTables().spell(spell("Ember Spray", { table: "RollTable.t1" })))?.rows[0].text).toBe("from t1");
    expect((await new DccTables().spell(spell("Ember Spray", { table: "t1" })))?.rows[0].text).toBe("from t1");
    const pack = {
      collection: "book.spells", documentName: "RollTable",
      getIndex: async () => [{ _id: "t2", name: "Renamed in the book" }],
      getDocument: async id => (id === "t2" ? { name: "Renamed in the book", results: rows("from t2") } : null)
    };
    world([], [pack]);
    expect((await new DccTables().spell(spell("Ember Spray", { table: "RollTable.t2", collection: "book.spells" })))?.rows[0].text).toBe("from t2");
  });

  test("two spells with a blank table each: each its own, by its name", async () => {
    world([{ id: "a", name: "Ember Spray", results: rows("embers") }, { id: "b", name: "Frost Lance", results: rows("frost") }]);
    const tables = new DccTables();
    expect((await tables.spell(spell("Ember Spray", { table: "" })))?.rows[0].text).toBe("embers");
    expect((await tables.spell(spell("Frost Lance", { table: "" })))?.rows[0].text).toBe("frost");
  });
});

describe("a monster's spell check", () => {
  test("its stat line read once, not at every cast; a character's not at all", () => {
    const sp = { id: "sp1", type: "spell" };
    const caster = type => ({ id: "m", type, items: { get: id => (id === "sp1" ? sp : null) }, system: { class: { spellCheck: 1 }, details: { notes: { value: "Init +1; Atk claw +2; SP spell check +5" } } } });
    text.statLine.mockClear();
    const cast = { purpose: "cast", action: { id: "m.sp1", name: "a spell" } };
    expect(checkFor(caster("NPC"), cast)).toBeNull();
    expect(checkFor(caster("NPC"), cast)).toBeNull();
    expect(text.statLine).toHaveBeenCalledTimes(1);
    expect(checkFor(caster("Player"), cast)).toEqual({ how: "spell", item: sp });
    expect(text.statLine).toHaveBeenCalledTimes(1);
  });
});

describe("XCC's Mojo, on Rewind", () => {
  test("the helper names XCC's flags for the core to put back (API 36): Mojo kept, another module's not", () => {
    globalThis.foundry = { utils: { flattenObject: o => o } };
    const scopes = rewindScopes("dcc", new DccAdapter().rewindFlagScopes);
    expect(actorData({ "flags.xcc.mojo": 2, "flags.dcc.x": 1, "flags.other.y": 3, "system.attributes.hp.value": 4 }, scopes))
      .toEqual({ "flags.xcc.mojo": 2, "flags.dcc.x": 1, "system.attributes.hp.value": 4 });
  });
});
