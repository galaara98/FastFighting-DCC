/**
 * Live-battle pieces (core API 19-21): the engine's own damage shown as the dcc system's Damage card and read back as
 * the damage (or healing) it is; a token's sheet read cheaply mid-fight (hit points, statuses, Luck and spellburn left);
 * and DCC's one reaction, the free attack, for a player to choose. The creatures here are made up for the tests.
 */
import { afterEach, describe, expect, test } from "vitest";
import { showDccTableRoll } from "../scripts/table-cards.js";
import { damageOf } from "../scripts/read-turn.js";
import { DccAdapter } from "../scripts/adapter.js";

const was = { Roll: globalThis.Roll, ChatMessage: globalThis.ChatMessage };
afterEach(() => Object.assign(globalThis, was));

/** A stand-in Foundry: a Roll made from data posts a message that's kept here. */
function chat() {
  const posted = [];
  globalThis.Roll = { fromData: data => ({ ...data, toMessage: async (msg, options) => {
    const m = { id: `m${posted.length}`, ...msg, options, rolls: [{ total: data.total, formula: data.formula }], author: { isGM: true } };
    posted.push(m);
    return m;
  } }) };
  globalThis.ChatMessage = { getSpeaker: ({ token }) => ({ token: token.id }) };
  return posted;
}
const roll = (kind, total) => ({ kind, total, mod: 0, groups: [{ faces: 6, results: [{ result: total }] }] });

describe("the engine's own damage, as the dcc system's Damage card", () => {
  test("damage and healing get a card, marked FastFighting's; anything else is the core's plain roll", async () => {
    const posted = chat();
    const token = { id: "t1", actor: { id: "a1" } };
    expect(await showDccTableRoll(roll("damage", 4), { token, flavor: "Stray shot", audience: "gm", flags: { "fast-fighting": { turn: 1 } } })).toEqual(["m0"]);
    expect(posted[0]).toMatchObject({ flavor: "Stray shot", options: { messageMode: "gm" }, flags: { dcc: { RollType: "Damage", damageApplied: true }, "fast-fighting-dcc": { rolled: true }, "fast-fighting": { turn: 1 } } });
    expect(damageOf(posted[0])).toEqual({ amount: 4, kind: "damage" });
    await showDccTableRoll(roll("healing", 3), { token });
    expect(damageOf(posted[1])).toEqual({ amount: 3, kind: "healing" });
    expect(await showDccTableRoll(roll("save", 12), { token })).toBeNull();
    expect(await showDccTableRoll(roll("damage", 4), { token: { id: "t2" } })).toBeNull();
  });
});

describe("a token's sheet mid-fight", () => {
  test("hit points, statuses and what's left of the resources the engine counts; dead by its status or at 0 for a monster", async () => {
    const a = new DccAdapter();
    const actor = {
      type: "Player", statuses: new Set(["prone"]), effects: [],
      system: { attributes: { hp: { value: 3, max: 9 } }, abilities: { lck: { value: 11 }, str: { value: 14 }, agl: { value: 9 }, sta: { value: 7 } } }
    };
    const state = await a.readLiveState({ actor }, { unit: { resources: { luck: 12, spellburn: 7 } } });
    expect(state).toMatchObject({ hp: 3, maxHp: 9, status: "standing", resources: { luck: 11, spellburn: 7 } });
    expect(state.conditions.prone).toBe(1);
    const monster = { ...actor, type: "NPC", statuses: new Set(), system: { ...actor.system, attributes: { hp: { value: 0, max: 9 } } } };
    expect((await a.readLiveState({ actor: monster }, { unit: { resources: {} } })).status).toBe("dead");
  });
});

describe("DCC's reaction, for a player to choose", () => {
  test("the free attack at a foe withdrawing, for one with a melee attack", () => {
    const a = new DccAdapter();
    expect(a.reactionsOf({ actions: [{ kind: "strike", melee: true }] }).map(r => r.id)).toEqual(["opportunity"]);
    expect(a.reactionsOf({ actions: [{ kind: "strike", melee: false }] })).toEqual([]);
  });
});
