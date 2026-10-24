import { describe, expect, it } from "vitest";
import { readDccTurn } from "../scripts/read-turn.js";

/** A dcc card as the system makes it: dotted flags, a speaker, its rolls. */
const card = ({ token = "tokA", flags = {}, rolls = [], system = {}, flavor = "" } = {}) => ({
  speaker: { token, actor: "actA" },
  flags: { dcc: Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, v])) },
  rolls, system, flavor
});
const roll = (total, natural, options = {}) => ({ total, dice: [{ faces: 20, total: natural }], options });
const context = { tokenId: "tokA", actorId: "actA", ids: { tokA: "A", tokB: "B" }, actors: { actC: "C" } };

describe("a player's turn read from the dcc system's cards", () => {
  it("reads an attack that hit, its damage rolled with it", () => {
    const [e] = readDccTurn([card({
      flags: { isToHit: true, hasTarget: true, hitsTarget: true, isMelee: true, targetUuid: "Scene.s.Token.tokB.Actor.x" },
      rolls: [roll(17, 14), roll(6, 4, { "dcc.isDamageRoll": true })],
      system: { weaponName: "Longsword" }
    })], context);
    expect(e).toMatchObject({ type: "attack", targetId: "B", action: "Longsword", degree: 2, natural: 14, total: 17, melee: true, damage: 6, sure: true });
  });

  it("finds a linked target by its actor, and a later Damage card's damage", () => {
    const events = readDccTurn([
      card({ flags: { isToHit: true, hasTarget: true, hitsTarget: true, isMelee: false, targetUuid: "Actor.actC" }, rolls: [roll(15, 12)], system: { weaponName: "Shortbow" } }),
      card({ flags: { RollType: "Damage" }, rolls: [roll(4, 4)] })
    ], context);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ targetId: "C", degree: 2, ranged: true, launched: true, damage: 4 });
  });

  it("credits a plain card's inline damage roll to the hit", () => {
    const [e] = readDccTurn([
      card({ flags: { isToHit: true, hasTarget: true, hitsTarget: true, targetUuid: "Scene.s.Token.tokB" }, rolls: [roll(15, 12)] }),
      card({ rolls: [roll(5, 5)], flavor: "Damage" })
    ], context);
    expect(e.damage).toBe(5);
  });

  it("Luck burned after the roll: added to its total, a miss graded again at its target's AC; unsure where that can't be read", () => {
    const miss = { ...card({ flags: { isToHit: true, hitsTarget: false, isMelee: true, targetUuid: "Scene.s.Token.tokB" }, rolls: [roll(13, 10)] }), id: "m1" };
    const burn = bonus => card({ flags: { RollType: "LuckBurn", luckBurnFor: "m1", luckBurnBonus: bonus } });
    const ac = { "Scene.s.Token.tokB": { actor: { system: { attributes: { ac: { value: 15 } } } } } };
    globalThis.fromUuidSync = uuid => ac[uuid] ?? null;
    try {
      expect(readDccTurn([miss, burn(1), burn(1)], context)[0]).toMatchObject({ degree: 2, total: 15, sure: true });
      expect(readDccTurn([miss, burn(1)], context)[0]).toMatchObject({ degree: 1, total: 14, sure: true });
      delete ac["Scene.s.Token.tokB"];
      expect(readDccTurn([miss, burn(3)], context)[0]).toMatchObject({ degree: 1, total: 16, sure: false });
    } finally {
      delete globalThis.fromUuidSync;
    }
  });

  it("tells a critical, a fumble and a miss apart", () => {
    const at = flags => readDccTurn([card({ flags: { isToHit: true, hasTarget: true, targetUuid: "Scene.s.Token.tokB", ...flags }, rolls: [roll(10, 10)] })], context)[0];
    expect(at({ hitsTarget: true, isCrit: true }).degree).toBe(3);
    // (A critical whose die's range needs a hit too, that missed: a miss.)
    expect(at({ hitsTarget: false, isCrit: true, critNeedsHit: true }).degree).toBe(1);
    expect(at({ hitsTarget: false, isFumble: true }).degree).toBe(0);
    expect(at({ hitsTarget: false }).degree).toBe(1);
  });

  it("leaves out an attack at no one, and another creature's cards", () => {
    expect(readDccTurn([card({ flags: { isToHit: true }, rolls: [roll(12, 9)] })], context)).toEqual([]);
    expect(readDccTurn([card({ token: "tokB", flags: { isToHit: true, hitsTarget: true, targetUuid: "Scene.s.Token.tokA" }, rolls: [roll(12, 9)] })], context)).toEqual([]);
  });

  it("reads a Personality check as words for the GM to confirm", () => {
    const [e] = readDccTurn([card({ flags: { isAbilityCheck: true, Ability: "per" }, rolls: [roll(13, 11)], flavor: "Personality Check" })], context);
    expect(e).toMatchObject({ type: "talk", targetId: null, degree: null, natural: 11, total: 13, sure: false });
  });
});
