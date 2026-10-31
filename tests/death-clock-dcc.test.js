/**
 * The dcc system's Death Clock and Rewind: a character falling has its Dying laid by FastFighting, as the system lays
 * it, so Rewind can take it off before the hit points go back (the system would read that as being saved: a point of
 * Stamina for good and a scar); a dying one healed keeps its Dying and Stamina in the undo record, the system's loss
 * put back by Rewind.
 */
import { afterEach, describe, expect, test } from "vitest";
import { commitDccChanges, layDying, keepDying } from "../scripts/commit.js";

const before = { foundry: globalThis.foundry, game: globalThis.game, ChatMessage: globalThis.ChatMessage };
afterEach(() => Object.assign(globalThis, before));

function setUp({ level = 3, hp = 1, dying = false } = {}) {
  const created = [];
  const posted = [];
  const updates = [];
  const statuses = new Set();
  const effects = [];
  if ( dying ) effects.push({ id: "dy", statuses: new Set(["dying"]), flags: { dcc: { deathClock: { roundsRemaining: 2 } } }, toObject: () => ({ _id: "dy", name: "Dying", statuses: ["dying"], flags: { dcc: { deathClock: { roundsRemaining: 2 } } } }) });
  const actor = {
    uuid: "Actor.a", name: "Thief", type: "Player", statuses, effects, items: { get: () => null },
    system: { details: { level: { value: level } }, abilities: { sta: { value: 9, max: 9 } }, attributes: { hp: { value: hp, max: 7 } }, abilityLog: [{ id: "old" }] },
    toggleStatusEffect: async (id, { active }) => { if ( active ) statuses.add(id); else statuses.delete(id); },
    createEmbeddedDocuments: async (type, data) => { created.push(...data); return data.map((d, i) => ({ id: `fx${i}`, ...d })); },
    update: async d => updates.push(d)
  };
  const getProperty = (o, path) => path.split(".").reduce((v, k) => v?.[k], o);
  globalThis.foundry = { utils: { getProperty, deepClone: structuredClone } };
  globalThis.game = { ...before.game, combat: null, settings: { get: (scope, key) => scope === "dcc" && key === "enableDeathClock" }, users: { get: () => null } };
  globalThis.game.i18n = { ...before.game.i18n, localize: k => k, format: (k, d) => `${k}:${d.name}:${d.rounds}` };
  globalThis.ChatMessage = { create: async d => posted.push(d), getSpeaker: ({ actor: a }) => ({ actor: a.uuid }) };
  return { actor, created, posted, updates };
}
const blank = () => ({ actorUpdate: {}, createdEffects: [], deletedEffects: [] });

describe("the Death Clock, for Rewind", () => {
  test("falling: its Dying laid first (its level in rounds), kept in the undo record, the system's words in the chat", async () => {
    const { actor, created, posted, updates } = setUp();
    const undo = await commitDccChanges({ uuid: "Token.t", actor }, { actions: [] }, { hp: { from: 1, to: -2 }, fell: true, status: { from: "standing", to: "down" } }, { status: "down" }, {});
    expect(created[0]).toMatchObject({ statuses: ["dying"], flags: { dcc: { deathClock: { roundsRemaining: 3 } } } });
    expect(undo.createdEffects).toContain("fx0");
    expect(posted[0].content).toBe("DCC.DeathClockStarted:Thief:3");
    expect(updates.at(-1)["system.attributes.hp.value"]).toBe(-2);
  });

  test("falling at 0 level, or already bleeding: nothing laid (the system's own way)", async () => {
    const zero = setUp({ level: 0 });
    await layDying(zero.actor, blank());
    expect(zero.created).toHaveLength(0);
    const again = setUp({ dying: true });
    await layDying(again.actor, blank());
    expect(again.created).toHaveLength(0);
  });

  test("healed while bleeding out: its Dying and its Stamina as they were, in the undo record", async () => {
    const { actor } = setUp({ hp: -2, dying: true });
    const undo = await commitDccChanges({ uuid: "Token.t", actor }, { actions: [] }, { hp: { from: -2, to: 4 }, revived: true, status: { from: "down", to: "standing" } }, { status: "standing" }, {});
    expect(undo.deletedEffects).toEqual([expect.objectContaining({ _id: "dy", statuses: ["dying"] })]);
    expect(undo.actorUpdate).toMatchObject({ "system.attributes.hp.value": -2, "system.abilities.sta.value": 9, "system.abilities.sta.max": 9, "system.attributes.hp.max": 7, "system.abilityLog": [{ id: "old" }] });
    expect(undo.systemOptions).toEqual({ dcc: { abilityLogged: true } });
  });

  test("not bleeding out: nothing kept", () => {
    const { actor } = setUp();
    const undo = blank();
    keepDying(actor, undo);
    expect(undo).toEqual(blank());
  });
});
