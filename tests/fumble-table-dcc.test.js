/**
 * A weapon's own fumble table (dcc 0.70.76's `config.fumbleTableOverride`, core API 41): found by name among the
 * world's tables, given to the weapon's action as its `fumbleTable`, and rolled when that weapon fumbles; a name that
 * matches no table leaves the usual one. The tables and the character here are made up for the tests; no book's text is
 * quoted.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { DccAdapter } from "../scripts/adapter.js";
import { dccRules } from "../scripts/rules.js";
import { parseFormula } from "../scripts/core.js";
import { replay } from "../../FastFighting/scripts/engine/simulator.js";

const table = (name, text) => ({ id: name, name, results: [{ range: [-99, 99], description: text }] });

function world() {
  globalThis.CONFIG = { DCC: {}, Item: { typeLabels: {} } };
  Object.assign(globalThis.game, {
    packs: Object.assign([], { get: () => undefined }),
    tables: [table("Table 4-2: Fumbles", "The usual stumble."), table("Lash Mishaps", "The lash snaps back.")],
    actors: { filter: () => [] },
    users: [],
    modules: { get: () => undefined },
    settings: { get: () => { throw new Error("no such setting"); } }
  });
}

const weapon = (id, override) => ({
  id, name: id, type: "weapon",
  system: { equipped: true, melee: true, toHit: "+0", damage: "1d4", actionDie: "1d20", fumbleRange: 6, config: override === undefined ? {} : { fumbleTableOverride: override } }
});

function sheet(items) {
  const actor = {
    id: "a1", uuid: "Actor.a1", name: "Wenna", img: "", type: "Player", items, effects: [], statuses: new Set(), flags: {},
    getFlag: () => undefined, testUserPermission: () => true, getRollData: () => ({}),
    system: {
      abilities: Object.fromEntries(["str", "agl", "sta", "per", "int", "lck"].map(k => [k, { value: 10, mod: 0 }])),
      saves: { frt: { value: "+1" }, ref: { value: "+1" }, wil: { value: "+1" } },
      attributes: { hp: { value: 30, max: 30 }, hitDice: { value: "1d6" }, speed: { value: "30'" }, init: { value: "+1" }, ac: { value: 12 }, fumble: { die: "1d4" } },
      details: { level: { value: 1 }, alignment: "n", attackBonus: "+0", sheetClass: "Warrior", notes: { value: "" }, occupation: { value: "" } },
      class: { className: "Warrior" },
      skills: {},
      currency: {}
    }
  };
  actor.itemTypes = { weapon: items.filter(i => i.type === "weapon"), armor: [], spell: [] };
  return actor;
}
const specOf = async items => new DccAdapter().toCombatantSpec({ id: "t1", name: "Wenna", actor: sheet(items), texture: {} });
const strikeNamed = (spec, name) => spec.actions.find(a => a.kind === "strike" && a.name === name);

describe("a weapon's own fumble table", () => {
  beforeEach(world);

  test("an override naming a table gives the weapon's action its rows; one naming none, or none, leaves the usual table", async () => {
    const spec = await specOf([weapon("Lash", "Lash Mishaps"), weapon("Club", "No Such Table"), weapon("Axe")]);
    expect(spec.fumble.rows.map(r => r.text)).toEqual(["The usual stumble."]);
    expect(strikeNamed(spec, "Lash").fumbleTable.rows.map(r => r.text)).toEqual(["The lash snaps back."]);
    expect(strikeNamed(spec, "Club").fumbleTable).toBeUndefined();
    expect(strikeNamed(spec, "Axe").fumbleTable).toBeUndefined();
  });

  test("in a fight, the weapon fumbles on its own rows, on the character's fumble die", async () => {
    const spec = await specOf([weapon("Lash", "Lash Mishaps")]);
    const wenna = { ...spec, id: "wenna", side: "friendly", actions: [strikeNamed(spec, "Lash")] };
    const foe = {
      id: "foe", name: "Foe", side: "hostile", kind: "npc", level: 1, hp: { value: 500, max: 500 }, hitDie: 8, defenses: { ac: 30, frt: 0, ref: 0, wil: 0 },
      initiative: { mod: 0 }, speeds: { walk: 30 }, iwr: {}, flags: { fearless: true }, diesAtZero: true, actionDice: [20],
      traits: { tactical: { base: 40, fudge: 0 }, brave: { base: 100, fudge: 0 }, selfish: { base: 25, fudge: 0 }, loyal: { base: 75, fudge: 0 } },
      actions: [{ id: "poke", name: "Poke", kind: "strike", cost: 1, bonus: -50, melee: true, reach: 5, damage: [parseFormula("1", "bludgeoning")] }]
    };
    const fight = { combatants: [wenna, foe], sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } }, options: { positioning: false, maxRounds: 4 } };
    const rows = [];
    for ( let seed = 1; seed <= 12; seed++ ) rows.push(...replay(fight, dccRules, seed).log.filter(e => e.type === "fumble" && e.actor === "Wenna").map(e => e.rowText));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows)).toEqual(new Set(["The lash snaps back."]));
  });
});
