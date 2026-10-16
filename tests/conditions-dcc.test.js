/**
 * The engine's conditions and the dcc system's statuses, in a live battle: each condition a dcc sheet carries is
 * written as its status (on, and off again) and read back as the same condition, with what it brings (asleep, paralyzed
 * or out cold can't act; held can't move); what the token palette has no status for isn't written, and the core keeps
 * it. The palettes here are the dcc system's (Foundry's statuses and its own) and XCC's (its status effects on), as far
 * as their ids and names go.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { DccAdapter } from "../scripts/adapter.js";
import { commitDccChanges, conditionsOf } from "../scripts/commit.js";

const status = (id, name) => ({ id, name, img: "" });
/** The dcc system's palette: Foundry's statuses, then the system's own. */
const DCC_PALETTE = [
  ...["dead", "unconscious", "sleep", "stun", "prone", "restrain", "paralysis", "fly", "blind", "deaf", "silence", "fear", "burning", "frozen", "shock",
    "corrode", "bleeding", "disease", "poison", "curse", "regen", "degen", "hover", "burrow", "upgrade", "downgrade", "invisible", "target", "eye", "bless"]
    .map(id => status(id, `EFFECT.Status.${id}`)),
  ...["armor-seized", "battle-rage", "disarmed", "dying", "grip-disrupted", "groggy", "kneecapped", "off-balance", "stumbling", "turtled",
    "weapon-tangled-armor", "weapon-damaged"].map(id => status(id, `DCC.Status.${id}`))
];
/** XCC's in its place: no disarmed, and its own grappled and slowed. */
const XCC_PALETTE = ["prone", "stun", "unconscious", "dying", "dead", "bleeding", "grappled", "restrain", "paralysis", "slowed", "sleep", "fear", "blind",
  "deaf", "silence", "poison", "disease", "curse", "burning", "invisible", "fly", "groggy", "off-balance", "battle-rage", "disrespected", "agro", "lionized", "bless"]
  .map(id => status(id, `XCC.Status.${id}`));

/** The conditions each palette lets a sheet carry. */
const CARRIED = ["prone", "stunned", "paralyzed", "asleep", "unconscious", "blinded", "deafened", "silenced", "frightened", "held", "invisible", "poisoned"];
const DCC_CARRIED = [...CARRIED, "disarmed"];
const XCC_CARRIED = [...CARRIED, "slowed"];

/** A world with the system and a palette; the system's names for its statuses, in a language of its own. */
function world(palette) {
  globalThis.CONFIG = { DCC: {}, Item: { typeLabels: {} }, statusEffects: palette };
  globalThis.foundry = { utils: { getProperty: (o, path) => path.split(".").reduce((v, k) => v?.[k], o) } };
  const words = game.i18n;
  game.i18n = { ...words, localize: k => (/^(EFFECT|DCC|XCC)\.Status\./.test(k) ? `«${k.split(".").pop()}»` : words.localize(k)) };
  Object.assign(globalThis.game, {
    packs: Object.assign([], { get: () => undefined }),
    tables: [],
    actors: { filter: () => [] },
    users: { get: () => null },
    modules: { get: () => undefined },
    settings: { get: () => { throw new Error("no such setting"); } }
  });
}

/** A dcc creature, and its token; toggling a status works as Foundry's does (one the palette doesn't have throws). */
function creature() {
  const statuses = new Set();
  const toggled = [];
  const actor = {
    id: "a1", uuid: "Actor.a1", name: "Grue", img: "", type: "NPC", items: Object.assign([], { get: () => null }), effects: [], statuses, flags: {},
    getFlag: () => undefined, testUserPermission: () => true, getRollData: () => ({}),
    system: {
      abilities: Object.fromEntries(["str", "agl", "sta", "per", "int", "lck"].map(k => [k, { value: 10, mod: 0 }])),
      saves: { frt: { value: "+1" }, ref: { value: "+1" }, wil: { value: "+1" } },
      attributes: { hp: { value: 10, max: 10 }, hitDice: { value: "2d8" }, speed: { value: "30'" }, init: { value: "+0" }, ac: { value: 12 } },
      details: { level: { value: 0 }, alignment: "n", notes: { value: "Atk claw +2 melee (1d6); SV Fort +1, Ref +1, Will +1; AL N." } },
      currency: {}
    },
    toggleStatusEffect: async (id, { active }) => {
      if ( !CONFIG.statusEffects.some(s => s.id === id) ) throw new Error(`Invalid status ID "${id}"`);
      toggled.push([id, active]);
      if ( active ) statuses.add(id);
      else statuses.delete(id);
    },
    update: async () => {}
  };
  actor.itemTypes = { weapon: [], armor: [], spell: [] };
  return { actor, toggled, token: { id: "t1", uuid: "Token.t1", name: "Grue", actor, texture: {}, hidden: false } };
}

const standing = { status: "standing", system: {} };
/** One turn's changes for a condition: put on, or taken off (prone as the core sends it, apart). */
const turnOn = key => (key === "prone" ? { prone: { from: false, to: true } } : { conditions: { set: { [key]: 1 }, cleared: [] } });
const turnOff = key => (key === "prone" ? { prone: { from: true, to: false } } : { conditions: { set: {}, cleared: [key] } });

describe.each([["the dcc system's palette", DCC_PALETTE, DCC_CARRIED], ["XCC's palette", XCC_PALETTE, XCC_CARRIED]])("conditions on a dcc sheet: %s", (_, palette, carried) => {
  beforeEach(() => world(palette));

  test("the sheet carries exactly those it writes and reads back; they come first among the choices, none counted", () => {
    const adapter = new DccAdapter();
    const choices = adapter.conditionChoices();
    // (The Battle Interface takes each key's first.)
    const first = choices.filter((c, i) => choices.findIndex(o => o.key === c.key) === i);
    expect(first.filter(c => adapter.sheetCarries(c.key)).map(c => c.key).sort()).toEqual([...carried].sort());
    expect(first.slice(0, carried.length).map(c => c.key).sort()).toEqual([...carried].sort());
    expect(first.slice(0, carried.length).some(c => c.valued)).toBe(false);
    // (The core's follow: but not its restrained, which DCC's held is.)
    expect(first.map(c => c.key)).toEqual(expect.arrayContaining(["offGuard", "incapacitated", "immobilized", "turned", "hidden"]));
    expect(first.some(c => c.key === "restrained")).toBe(false);
  });

  test("each one it carries, put on, is read back as itself; taken off, it's gone, and what it brought with it", async () => {
    const adapter = new DccAdapter();
    for ( const key of carried ) {
      const { actor, token, toggled } = creature();
      await adapter.commitChanges(token, { actions: [] }, turnOn(key), standing, {});
      expect([key, toggled.length]).toEqual([key, 1]);
      expect([key, !!(await adapter.readLiveState(token)).conditions[key]]).toEqual([key, true]);
      const undo = await adapter.commitChanges(token, { actions: [] }, turnOff(key), standing, {});
      expect([key, (await adapter.readLiveState(token)).conditions]).toEqual([key, {}]);
      expect([key, actor.statuses.size]).toEqual([key, 0]);
      // (And Rewind Turn knows how to put it back.)
      expect(undo.statuses).toEqual([{ id: toggled[0][0], active: true, overlay: false }]);
    }
  });

  test("one it doesn't carry isn't written: the core keeps it", async () => {
    const adapter = new DccAdapter();
    const others = [...new Set(adapter.conditionChoices().map(c => c.key))].filter(k => !carried.includes(k));
    expect(others).toContain("offGuard");
    for ( const key of others ) {
      const { token, toggled } = creature();
      expect([key, adapter.sheetCarries(key)]).toEqual([key, false]);
      await adapter.commitChanges(token, { actions: [] }, turnOn(key), standing, {});
      await adapter.commitChanges(token, { actions: [] }, turnOff(key), standing, {});
      expect([key, toggled]).toEqual([key, []]);
    }
  });

  test("its names: the palette's for the status (Restrained for held), else none, and the core's stand", () => {
    const adapter = new DccAdapter();
    expect(adapter.conditionLabel("held")).toBe(game.i18n.localize(palette.find(s => s.id === "restrain").name));
    expect(adapter.conditionLabel("stunned")).toBe(game.i18n.localize(palette.find(s => s.id === "stun").name));
    expect(adapter.conditionLabel("offGuard")).toBeNull();
    expect(adapter.conditionLabel("incapacitated")).toBeNull();
    const slowed = palette.find(s => s.id === "slowed");
    expect(adapter.conditionLabel("slowed")).toBe(slowed ? game.i18n.localize(slowed.name) : null);
  });
});

describe("a dcc sheet's statuses, read", () => {
  test("each as its condition, and what it brings: no acting asleep, paralyzed or out cold; no moving held or grappled", () => {
    const read = (...ids) => conditionsOf({ statuses: new Set(ids), effects: [] });
    expect(read("sleep")).toEqual({ asleep: 1, incapacitated: 1 });
    expect(read("paralysis")).toEqual({ paralyzed: 1, incapacitated: 1 });
    expect(read("unconscious")).toEqual({ unconscious: 1, incapacitated: 1 });
    expect(read("restrain")).toEqual({ held: 1, immobilized: 1 });
    expect(read("grappled")).toEqual({ immobilized: 1 });
    expect(read("stun", "fear", "blind", "prone")).toEqual({ stunned: 1, frightened: 1, blinded: 1, prone: 1 });
    // (The dcc system's way: statuses on its effects, not on the actor; a disabled effect's don't count.)
    expect(conditionsOf({ statuses: new Set(), effects: [{ statuses: new Set(["slowed"]) }, { disabled: true, statuses: new Set(["deaf"]) }] })).toEqual({ slowed: 1 });
  });
});

describe("a fall, its steadying and its revival keep their own say over unconscious", () => {
  beforeEach(() => world(DCC_PALETTE));

  test("knocked out and falling: out once, prone; not undone by the same turn", async () => {
    const { actor, token, toggled } = creature();
    actor.system.attributes.hp.value = 0;
    const changes = { fell: true, status: { from: "standing", to: "down" }, conditions: { set: { unconscious: 1, incapacitated: 1 }, cleared: [] } };
    await commitDccChanges(token, { actions: [] }, changes, { status: "down", stable: true, system: {} }, {});
    expect(toggled.filter(([id]) => id === "unconscious")).toEqual([["unconscious", true]]);
    expect([...actor.statuses].sort()).toEqual(["prone", "unconscious"]);
    await commitDccChanges(token, { actions: [] }, { stable: { from: false, to: true }, conditions: { set: {}, cleared: ["unconscious"] } }, { status: "down", stable: true, system: {} }, {});
    expect(actor.statuses.has("unconscious")).toBe(true);
  });

  test("up again: no longer out, whatever else the turn said of it", async () => {
    const { actor, token } = creature();
    actor.statuses.add("unconscious");
    await commitDccChanges(token, { actions: [] }, { revived: true, conditions: { set: { unconscious: 1 }, cleared: [] } }, standing, {});
    expect(actor.statuses.has("unconscious")).toBe(false);
  });

  test("dead: nothing else written", async () => {
    const { actor, token, toggled } = creature();
    globalThis.game.combat = null;
    await commitDccChanges(token, { actions: [] }, { died: true, conditions: { set: { stunned: 1 }, cleared: [] } }, { status: "dead", system: {} }, {});
    expect(actor.statuses.has("stun")).toBe(false);
    expect(toggled).toEqual([["dead", true]]);
  });
});
