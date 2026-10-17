/**
 * Players' damage in a live battle (core API 19): a dcc card's damage read (an attack's, a Roll Damage button's at its
 * attack's target, a roll typed healing; nothing from a miss or a check), applied the dcc system's way (its actor's
 * applyDamage, times the GM's multiplier; in a turn FastFighting plays, the engine's own sum, resistances counted) with
 * the hit points as they were for Rewind, and the dcc system's own Auto-apply damage, while it's on, named for the GM.
 */
import { afterEach, describe, expect, test } from "vitest";
import { DccAdapter } from "../scripts/adapter.js";

const was = { game: globalThis.game, canvas: globalThis.canvas };
afterEach(() => Object.assign(globalThis, was));

/** A dcc card as the system makes it: its flags, a speaker, its rolls. */
const card = ({ id = "m", token = "tokA", flags = {}, rolls = [], flavor = "" } = {}) => ({ id, speaker: { scene: "s", token, actor: "actA" }, flags: { dcc: flags }, rolls, flavor });
const roll = (total, { formula = "1d8", options = {} } = {}) => ({ total, formula, options, dice: [] });
const damageRoll = (total, formula = "1d8") => roll(total, { formula, options: { dcc: { isDamageRoll: true } } });
const attack = (flags = {}, rolls = [roll(16)]) => card({ id: "atk", flags: { isToHit: true, hasTarget: true, hitsTarget: true, ...flags }, rolls });

/** A scene with these tokens ({id: actorId}), as a Foundry collection is walked and looked up. */
function sceneWith(tokens) {
  const docs = new Map(Object.entries(tokens).map(([id, actorId]) => [id, { id, actorId }]));
  return { tokens: { get: id => docs.get(id), [Symbol.iterator]: () => docs.values() } };
}

/** The world: the chat so far, the scene the cards were made on. */
function world({ messages = [], tokens = { tokB: "actB", tokC: "actC" } } = {}) {
  const scene = sceneWith(tokens);
  Object.assign(globalThis.game, { messages: { contents: messages }, scenes: { get: id => (id === "s" ? scene : undefined) } });
  globalThis.canvas = { scene };
}

const ids = { tokA: "A", tokB: "B", tokC: "C" };
const read = message => new DccAdapter().damageCard(message, { ids });

describe("a dcc card's damage", () => {
  test("an attack that hit, its damage rolled with it: at the token the card names", () => {
    world();
    const m = attack({ targetUuid: "Scene.s.Token.tokB.Actor.actB" }, [roll(16), damageRoll(6)]);
    expect(read(m)).toEqual({ amount: 6, kind: "damage", targets: ["tokB"], save: false });
  });

  test("a linked target, named by its actor: its token in the battle", () => {
    world();
    expect(read(attack({ targetUuid: "Actor.actC" }, [roll(16), damageRoll(3)])).targets).toEqual(["tokC"]);
  });

  test("the Roll Damage button's card: at the target of the attack it was rolled for", () => {
    const hit = attack({ targetUuid: "Scene.s.Token.tokB.Actor.actB", automated: false });
    const dmg = card({ id: "dmg", flags: { RollType: "Damage" }, rolls: [roll(4)] });
    world({ messages: [hit, dmg] });
    expect(read(dmg)).toEqual({ amount: 4, kind: "damage", targets: ["tokB"], save: false });
  });

  test("the plain card's inline damage roll, with no attack before it: at no one (the GM picks)", () => {
    const dmg = card({ id: "dmg", rolls: [roll(5)], flavor: "Damage" });
    world({ messages: [dmg] });
    expect(read(dmg)).toEqual({ amount: 5, kind: "damage", targets: [], save: false });
  });

  test("damage is at least 1, as the system has it", () => {
    world();
    expect(read(attack({ targetUuid: "Scene.s.Token.tokB" }, [roll(16), damageRoll(0, "1d4-2")])).amount).toBe(1);
  });

  test("a roll typed healing is healing", () => {
    const heal = card({ id: "heal", rolls: [roll(7, { formula: "2d4[healing]+2" })] });
    world({ messages: [heal] });
    expect(read(heal)).toEqual({ amount: 7, kind: "healing", targets: [], save: false });
  });

  test("nothing from a miss, a fumble, a check, a crit roll, a plain roll, or one at someone not on the scene", () => {
    world();
    expect(read(attack({ hitsTarget: false, targetUuid: "Scene.s.Token.tokB" }, [roll(8), damageRoll(6)]))).toBeNull();
    expect(read(attack({ isFumble: true, hitsTarget: undefined }, [roll(1), damageRoll(6)]))).toBeNull();
    // (Damage left to the button: the attack card itself deals nothing yet.)
    expect(read(attack({ targetUuid: "Scene.s.Token.tokB" }))).toBeNull();
    expect(read(card({ flags: { isAbilityCheck: true, Ability: "per" }, rolls: [roll(13, { formula: "1d20+1" })] }))).toBeNull();
    expect(read(card({ flags: { RollType: "Crit" }, rolls: [roll(9)] }))).toBeNull();
    expect(read(card({ rolls: [roll(6, { formula: "1d6" })] }))).toBeNull();
    expect(read(attack({ targetUuid: "Actor.elsewhere" }, [roll(16), damageRoll(6)]))).toBeNull();
  });
});

/** A dcc NPC on a token, its applyDamage as the system's (amount × multiplier off its hit points; healing up to its max). */
function npc(hp = 10, max = 12) {
  const applied = [];
  const actor = {
    uuid: "Scene.s.Token.tokB.Actor.actB", type: "NPC", statuses: new Set(["prone"]), effects: [],
    system: { attributes: { hp: { value: hp, max } } },
    applyDamage: async (amount, multiplier) => {
      applied.push([amount, multiplier]);
      const a = amount * multiplier;
      const now = actor.system.attributes.hp.value;
      actor.system.attributes.hp.value = a > 0 ? now - a : Math.min(now - a, actor.system.attributes.hp.max);
    }
  };
  const combatant = { uuid: "Combat.c.Combatant.k", defeated: false };
  globalThis.game.combat = { getCombatantsByToken: () => [combatant] };
  return { token: { uuid: "Scene.s.Token.tokB", id: "tokB", actor }, actor, applied };
}

describe("a dcc card's damage applied", () => {
  const hit = total => attack({ targetUuid: "Scene.s.Token.tokB" }, [roll(16), damageRoll(total)]);

  test("doubled: the system's applyDamage, and the hit points as they were in the undo record", async () => {
    const { token, actor, applied } = npc(10);
    const records = await new DccAdapter().applyDamageCard(hit(6), token, { multiplier: 2 });
    expect(applied).toEqual([[12, 1]]);
    expect(actor.system.attributes.hp.value).toBe(-2);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      tokenUuid: "Scene.s.Token.tokB", actorUuid: actor.uuid, actorUpdate: { "system.attributes.hp.value": 10 },
      combatant: { uuid: "Combat.c.Combatant.k", defeated: false }, statusesBefore: ["prone"]
    });
  });

  test("halved: rounded down, at least 1", async () => {
    const { token, applied } = npc();
    await new DccAdapter().applyDamageCard(hit(7), token, { multiplier: 0.5 });
    await new DccAdapter().applyDamageCard(hit(1), token, { multiplier: 0.5 });
    expect(applied).toEqual([[3, 1], [1, 1]]);
  });

  test("healing: as the system's Apply Healing does it, no further than its max", async () => {
    const { token, actor, applied } = npc(4, 8);
    const records = await new DccAdapter().applyDamageCard(card({ rolls: [roll(9, { formula: "2d6[healing]" })] }), token);
    expect(applied).toEqual([[9, -1]]);
    expect(actor.system.attributes.hp.value).toBe(8);
    expect(records[0].actorUpdate).toEqual({ "system.attributes.hp.value": 4 });
  });

  test("a strike's card in a turn FastFighting plays: the engine's sum (a skeleton's half from piercing), exactly; 0, nothing", async () => {
    const { token, actor, applied } = npc(10);
    const records = await new DccAdapter().applyDamageCard(hit(7), token, { multiplier: 1, amount: 3 });
    expect(applied).toEqual([[3, 1]]);
    expect(actor.system.attributes.hp.value).toBe(7);
    expect(records[0].actorUpdate).toEqual({ "system.attributes.hp.value": 10 });
    expect(await new DccAdapter().applyDamageCard(hit(7), token, { multiplier: 1, amount: 0 })).toEqual([]);
    expect(applied).toHaveLength(1);
  });

  test("healing goes as the card has it, whatever sum comes with it", async () => {
    const { token, applied } = npc(4, 20);
    await new DccAdapter().applyDamageCard(card({ rolls: [roll(6, { formula: "1d6[healing]" })] }), token, { amount: 2 });
    expect(applied).toEqual([[6, -1]]);
  });

  test("a card that deals nothing: nothing applied, no records", async () => {
    const { token, applied } = npc();
    expect(await new DccAdapter().applyDamageCard(card({ flags: { RollType: "Crit" }, rolls: [roll(9)] }), token)).toEqual([]);
    expect(applied).toEqual([]);
  });
});

describe("the dcc system's own Auto-apply damage", () => {
  /** The world's settings, and whether dcc-qol is active. */
  function settings({ on, qol = false, registered = true }) {
    const words = game.i18n;
    game.i18n = { ...words, localize: k => (k.startsWith("DCC.") ? `«${k}»` : words.localize(k)) };
    game.modules = { get: id => (id === "dcc-qol" ? { active: qol } : undefined) };
    game.settings = {
      get: (scope, key) => {
        if ( !registered ) throw new Error(`${scope}.${key} is not a registered game setting`);
        return scope === "dcc" && key === "autoApplyDamage" ? on : undefined;
      }
    };
  }

  test("on: its name, as the GM sees it in the settings", () => {
    settings({ on: true });
    expect(new DccAdapter().appliesPlayerDamage()).toBe("«DCC.SettingAutoApplyDamage»");
  });

  test("off, inert under dcc-qol, or not in this version of the system: null", () => {
    settings({ on: false });
    expect(new DccAdapter().appliesPlayerDamage()).toBeNull();
    settings({ on: true, qol: true });
    expect(new DccAdapter().appliesPlayerDamage()).toBeNull();
    settings({ on: true, registered: false });
    expect(new DccAdapter().appliesPlayerDamage()).toBeNull();
  });
});
