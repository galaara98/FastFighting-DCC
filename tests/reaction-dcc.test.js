/**
 * A reaction's strike rolled the dcc system's way in a live battle (core API 19 rollReaction): the weapon the engine's
 * strike names, rolled with the actor's rollWeaponAttack at the strike's target (the user's target for the roll, theirs
 * put back after), no dialog; the attack read off the card (a critical hit, a hit, a miss, a fumble), a hit's damage by
 * kind as rolled, a critical's as its crit row has it (double damage; its damage buttons rolled as they would roll); the
 * card kept from the system's own
 * Auto-apply damage and Fleeting Luck. Null where the strike isn't a weapon on the sheet, or its target isn't on the
 * scene.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DccAdapter } from "../scripts/adapter.js";
import { damageByKind, tableDamageRolls } from "../scripts/reaction.js";
import { wordList } from "../scripts/words.js";

const was = { Hooks: globalThis.Hooks, canvas: globalThis.canvas, Roll: globalThis.Roll };
afterEach(() => Object.assign(globalThis, was));

/** Foundry's Hooks, as far as the system's attack card uses them. */
function hooks() {
  const on = new Map();
  let n = 0;
  return {
    on: (name, fn) => { on.set(++n, { name, fn }); return n; },
    off: (name, id) => on.delete(id),
    callAll: (name, ...args) => { for ( const h of [...on.values()] ) if ( h.name === name ) h.fn(...args); return true; },
    count: () => on.size
  };
}

/** A roll as Foundry evaluates it: its total, formula, dice and options. */
const roll = (total, { formula = "1d20+2", dice = [], options = {} } = {}) => ({ total, formula, dice, options });

/** Rolls made the way an inline roll's button makes them, each posted. */
function dice(...totals) {
  const posted = [];
  globalThis.Roll = {
    create: (formula, data) => ({
      formula, data, total: null,
      async evaluate() { this.total = totals.shift() ?? 0; return this; },
      async toMessage(message) { posted.push({ formula, total: this.total, ...message }); return message; }
    })
  };
  return posted;
}

/** The scene this user is looking at, its tokens, and the user's own targets. */
function scene({ tokens = ["tokA", "tokB", "tokC"], targets = ["tokC"], viewing = "s" } = {}) {
  const placed = new Map(tokens.map(id => [id, { id }]));
  const sets = [];
  game.user = { id: "u1", targets: new Set(targets.map(id => placed.get(id))) };
  globalThis.canvas = {
    scene: { id: viewing },
    tokens: {
      get: id => placed.get(id),
      setTargets(ids, { mode }) {
        sets.push({ ids: [...ids], mode });
        game.user.targets = new Set([...ids].map(id => placed.get(id)).filter(Boolean));
      }
    }
  };
  return { sets };
}

/**
 * A dcc actor with weapons, its rollWeaponAttack as the system's: the user's targets read for the roll, the card's
 * flags and rolls, the dcc.rollWeaponAttack hook, then the card posted (`cards`, as created). `outcome` is what the
 * dice gave.
 */
function fighter(outcome = {}, { weapons = [{ id: "w1", name: wordList("Damage.slashing")[0] }] } = {}) {
  const calls = [];
  const cards = [];
  const items = new Map(weapons.map(w => [w.id, { type: "weapon", system: { melee: true }, ...w }]));
  items.set("e1", { id: "e1", type: "equipment", name: "Rope" });
  const actor = {
    id: "actA", type: "Player", items, getRollData: () => ({ lck: 1 }),
    async rollWeaponAttack(weaponId, options = {}) {
      const weapon = items.get(weaponId);
      const targets = game.user.targets;
      calls.push({ weaponId, options, targets: [...targets].map(t => t.id) });
      const o = { natural: 15, total: 17, hitsTarget: true, damage: roll(6, { formula: "1d8+1", options: { dcc: { isDamageRoll: true } } }), ...outcome };
      const attackRoll = roll(o.total, { dice: [{ total: o.natural, faces: 20 }] });
      const flags = {
        "dcc.isToHit": true, "dcc.automated": true, "dcc.isFumble": !!o.isFumble, "dcc.isCrit": !!o.isCrit, "dcc.isNaturalCrit": !!o.isCrit,
        "dcc.critNeedsHit": false, "dcc.isMelee": true, "dcc.libResult": { natural: o.natural, total: o.total }
      };
      if ( targets.size && o.hitsTarget !== undefined ) Object.assign(flags, { "dcc.hasTarget": true, "dcc.hitsTarget": o.hitsTarget, "dcc.targetUuid": "Scene.s.Token.tokB.Actor.actB" });
      if ( o.natural === 20 ) flags["dcc.FleetingLuckEffect"] = "Gain";
      if ( o.isFumble ) flags["dcc.FleetingLuckEffect"] = "Lose";
      const rolls = [attackRoll, ...(o.damage ? [o.damage] : [])];
      const messageData = {
        user: game.user.id, speaker: { scene: "s", token: "tokA", actor: "actA" }, flags, rolls,
        system: { actorId: this.id, weaponId, weaponName: weapon.name, hitsAc: o.total, damageRoll: o.damage ?? undefined, critResult: o.critResult ?? "" }
      };
      await Hooks.callAll("dcc.rollWeaponAttack", rolls, messageData);
      delete messageData.system.damageRoll;
      cards.push(structuredClone({ flags: messageData.flags, speaker: messageData.speaker }));
    }
  };
  const token = { id: "tokA", uuid: "Scene.s.Token.tokA", parent: { id: "s" }, actor };
  return { token, actor, calls, cards };
}

const target = { id: "tokB", uuid: "Scene.s.Token.tokB", parent: { id: "s" } };
const strike = (id = "actA.w1") => ({ id, name: "a blade" });
const react = (token, action = strike(), at = target) => new DccAdapter().rollReaction(token, { action, target: at });

beforeEach(() => {
  globalThis.Hooks = hooks();
  dice();
});

describe("a reaction's strike, rolled the dcc system's way", () => {
  test("the weapon the engine's strike names, rolled with no dialog at the strike's target; the user's own targets put back", async () => {
    const { sets } = scene({ targets: ["tokC"] });
    const { token, calls } = fighter();
    await react(token);
    expect(calls).toHaveLength(1);
    expect(calls[0].weaponId).toBe("w1");
    expect(calls[0].options).toMatchObject({ showModifierDialog: false, token });
    expect(calls[0].targets).toEqual(["tokB"]);
    expect(sets.at(-1)).toEqual({ ids: ["tokC"], mode: "replace" });
    expect([...game.user.targets].map(t => t.id)).toEqual(["tokC"]);
    expect(Hooks.count()).toBe(0);
  });

  test("a hit: the attack as the card has it, and its damage by kind as rolled", async () => {
    scene();
    const { token } = fighter({ natural: 15, total: 17 });
    expect(await react(token)).toEqual({ attack: { degree: 2, natural: 15, total: 17 }, damage: { byType: { slashing: 6 } } });
  });

  test("a critical hit is degree 3; its crit table's damage, still a button on the card, rolled as the button would and added", async () => {
    scene();
    const posted = dice(5);
    const critResult = "<p>Broken ribs. <a class=\"inline-roll roll\" data-mode=\"roll\" data-flavor=\"damage\" data-formula=\"1d6\" data-tooltip-text=\"/roll 1d6 #damage\"><i class=\"fa-solid fa-dice-d20\"></i>1d6</a> damage.</p>";
    const { token } = fighter({ natural: 20, total: 22, isCrit: true, critResult });
    expect(await react(token)).toEqual({ attack: { degree: 3, natural: 20, total: 22 }, damage: { byType: { slashing: 11 } } });
    expect(posted).toEqual([{ formula: "1d6", total: 5, flavor: "damage", speaker: { scene: "s", token: "tokA", actor: "actA" } }]);
  });

  test("a critical whose row deals double damage: the blow's damage doubled", async () => {
    scene();
    const posted = dice();
    const { token } = fighter({ natural: 20, total: 22, isCrit: true, critResult: "<p>A crushing blow: double damage.</p>" });
    expect((await react(token)).damage).toEqual({ byType: { slashing: 12 } });
    expect(posted).toEqual([]);
  });

  test("a miss is degree 1 and a fumble 0, with no damage", async () => {
    scene();
    expect(await react(fighter({ natural: 7, total: 9, hitsTarget: false }).token)).toEqual({ attack: { degree: 1, natural: 7, total: 9 }, damage: null });
    expect(await react(fighter({ natural: 1, total: 3, hitsTarget: false, isFumble: true }).token)).toEqual({ attack: { degree: 0, natural: 1, total: 3 }, damage: null });
  });

  test("a hit with no damage rolled on the card (the system's automation off): the attack, its damage left to the engine", async () => {
    scene();
    expect(await react(fighter({ damage: null }).token)).toEqual({ attack: { degree: 2, natural: 15, total: 17 }, damage: null });
  });

  test("the card is kept from the system's Auto-apply damage and its Fleeting Luck: FastFighting deals the blow", async () => {
    scene();
    const { token, cards } = fighter({ natural: 20, total: 22, isCrit: true });
    await react(token);
    expect(cards[0].flags["dcc.damageApplied"]).toBe(true);
    expect(cards[0].flags).not.toHaveProperty("dcc.FleetingLuckEffect");
    expect(cards[0].flags["dcc.isToHit"]).toBe(true);
  });

  test("no weapon on the sheet by the strike's id (a stat line's attack, fists, another item, another's): null, nothing rolled", async () => {
    scene();
    const { token, calls } = fighter();
    for ( const id of ["actA.atk0", "actA.fist-free", "actA.e1", "actZ.w1", "w1"] ) expect(await react(token, strike(id))).toBeNull();
    expect(calls).toEqual([]);
  });

  test("a target not on the scene this user is looking at, or none: null, nothing rolled, the user's targets untouched", async () => {
    const { sets } = scene({ viewing: "elsewhere" });
    const { token, calls } = fighter();
    expect(await react(token)).toBeNull();
    expect(await react(token, strike(), null)).toBeNull();
    scene({ tokens: ["tokA"] });
    expect(await react(token)).toBeNull();
    expect(calls).toEqual([]);
    expect(sets).toEqual([]);
  });

  test("whether it hit unknown (the target's AC unread): null, for the engine's dice", async () => {
    scene();
    expect(await react(fighter({ hitsTarget: undefined }).token)).toBeNull();
  });

  test("the system cancelling the roll, or failing: null, or its error, and the user's targets put back either way", async () => {
    scene({ targets: ["tokC"] });
    const { token, actor } = fighter();
    actor.rollWeaponAttack = async () => undefined;
    expect(await react(token)).toBeNull();
    actor.rollWeaponAttack = async () => { throw new Error("no"); };
    await expect(react(token)).rejects.toThrow("no");
    expect([...game.user.targets].map(t => t.id)).toEqual(["tokC"]);
    expect(Hooks.count()).toBe(0);
  });
});

describe("a damage roll by kind", () => {
  const name = wordList("Damage.slashing")[0];

  test("one kind: all of it, at least 1; the kind its formula names, else the weapon's", () => {
    expect(damageByKind(roll(7, { formula: "1d8+2" }), name)).toEqual({ slashing: 7 });
    expect(damageByKind(roll(1, { formula: "1d4-2" }), name)).toEqual({ slashing: 1 });
    expect(damageByKind(roll(5, { formula: "1d6[fire]" }), name)).toEqual({ fire: 5 });
  });

  test("several kinds: each its own dice; where they don't add up, all of it the first kind", () => {
    // (A kind names what comes before it: the d6 is fire, the d8 and the 1 the weapon's.)
    const two = roll(10, { formula: "1d6[fire] + 1d8 + 1", dice: [{ total: 4 }, { total: 5 }] });
    expect(damageByKind(two, name)).toEqual({ fire: 4, slashing: 6 });
    expect(damageByKind({ ...two, total: 12 }, name)).toEqual({ fire: 12 });
  });
});

describe("a crit table's damage rolls on the card", () => {
  test("its deferred rolls with the system's damage flavor; not an inline result, nor a roll of another flavor", () => {
    const html = [
      "<a class=\"inline-roll roll\" data-flavor=\"damage\" data-formula=\"2d4+1\">2d4+1</a>",
      "<a class=\"inline-roll inline-result\" data-flavor=\"damage\" data-roll=\"%7B%7D\">3</a>",
      "<a class=\"inline-roll roll\" data-flavor=\"\" data-formula=\"1d3\">1d3</a>",
      "<a class=\"content-link\" data-uuid=\"x\">a link</a>"
    ].join(" ");
    expect(tableDamageRolls(html)).toEqual([{ formula: "2d4+1", flavor: "damage" }]);
    expect(tableDamageRolls("")).toEqual([]);
  });
});
