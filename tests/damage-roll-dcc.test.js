/**
 * A spell's damage rolled the dcc system's way in a live battle (core API 19 rollDamage): the result the spell check
 * reached (the core's "<actor id>.<item id>@<n>"), its damage as the spell's table reads, rolled once with the system's
 * damage roller, no dialog, its Damage card in the chat as the Roll Damage button makes it; several missiles, their
 * count rolled first; by kind as rolled; for the GMs only when secret. Null for anything that isn't a spell's result
 * with damage. The card applied (applyDamageCard): each target's share by the multiplier, rounded down, and what its
 * stat line says it takes none, half or double of. No useAction: a spell's card is its spell check's.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DccAdapter } from "../scripts/adapter.js";
import { SystemAdapter } from "../scripts/core.js";
import { byKind, damageFormula, rollDccDamage, spellTier } from "../scripts/damage-roll.js";

const was = { game: globalThis.game, Roll: globalThis.Roll, ChatMessage: globalThis.ChatMessage };
afterEach(() => Object.assign(globalThis, was));

/** A made-up spell's results, in the books' style: a spray of embers, and at higher results bolts of flame. */
const EMBERS = [
  { range: [1, 11], text: "Lost. Failure." },
  { range: [12, 15], text: "A spray of embers burns one target for [[/roll 2d6]] fire damage. Reflex save for half." },
  { range: [16, 99], text: "The caster hurls [[/roll 1d4+1]] bolts of flame, each dealing [[/roll 1d6]] + caster level fire damage. Reflex save for half." }
];

/**
 * Rolls as Foundry evaluates them, each die term the next of `dice` (its total), posted to `chat` with the visibility
 * asked for; the system's damage roller (game.dcc.DCCRoll), its calls in `made`. `system: false`: no such roller.
 */
function dice(values = [], { system = true } = {}) {
  const chat = [];
  const made = [];
  const roll = formula => ({
    formula, dice: [], _total: null,
    get total() { return this._total; },
    async evaluate() {
      let sum = 0;
      for ( const [, sign, n, faces, flat] of formula.matchAll(/([+-]?)\s*(?:(\d+)d(\d+)|(\d+))/g) ) {
        const v = flat !== undefined ? Number(flat) : (values.shift() ?? 1);
        if ( flat === undefined ) this.dice.push({ total: v, faces: Number(faces), number: Number(n) });
        sum += sign === "-" ? -v : v;
      }
      this._total = sum;
      return this;
    },
    async toMessage(data, options = {}) {
      const message = { id: `m${chat.length + 1}`, ...data, rolls: [this], mode: options.messageMode ?? null };
      chat.push(message);
      return message;
    }
  });
  globalThis.Roll = { create: formula => roll(formula) };
  globalThis.game.dcc = system ? { DCCRoll: { createRoll: (terms, data, options) => { made.push({ terms, options }); return roll(terms[0].formula); } } } : undefined;
  return { chat, made };
}

/** A wizard with the spell on its sheet (and a dagger), its results table in the world's tables. */
function wizard({ level = 3, table = true } = {}) {
  const spell = { id: "sp1", type: "spell", name: "Ember Spray", system: { results: {}, spellCheck: { value: "+2", die: "1d20" }, level: 1, save: "", range: "60'" } };
  const items = new Map([["sp1", spell], ["w1", { id: "w1", type: "weapon", name: "a dagger", system: {} }]]);
  const actor = {
    id: "actA", type: "Player", name: "Wenna", items, itemTypes: { spell: [spell] }, flags: {}, getRollData: () => ({}),
    system: { details: { level: { value: level }, sheetClass: "Wizard", notes: { value: "" } }, class: { spellCheck: "+2" }, attributes: { hitDice: { value: "3d4" } }, config: {} }
  };
  Object.assign(globalThis.game, {
    packs: Object.assign([], { get: () => undefined }),
    tables: table ? [{ name: "Ember Spray", results: EMBERS.map(r => ({ range: r.range, description: r.text })) }] : []
  });
  return { token: { id: "tokA", actor }, actor };
}

/** The system's words, as their keys and what's filled in. */
function systemWords() {
  const words = game.i18n;
  game.i18n = { ...words, format: (key, data) => (key.startsWith("DCC.") ? `«${key}:${data?.weapon}»` : words.format(key, data)) };
}

const at = (id, name = "Ember Spray") => ({ id, name });
const damage = (token, id, options = {}) => new DccAdapter().rollDamage(token, { action: at(id), card: null, ...options });

beforeEach(() => {
  systemWords();
  globalThis.ChatMessage = { getSpeaker: ({ actor, token }) => ({ actor: actor.id, token: token.id }) };
});

describe("a spell's damage, rolled the dcc system's way", () => {
  test("the result the check reached: its damage rolled once with the system's damage roller, no dialog, on its Damage card", async () => {
    const { token } = wizard();
    const { chat, made } = dice([9]);
    const out = await damage(token, "actA.sp1@0");
    expect(made).toEqual([{ terms: [{ type: "Compound", formula: "2d6" }], options: { showModifierDialog: false } }]);
    expect(out).toEqual({ damage: { byType: { fire: 9 } }, card: "m1" });
    expect(chat).toHaveLength(1);
    expect(chat[0]).toMatchObject({
      speaker: { actor: "actA", token: "tokA" }, flavor: "«DCC.RollsDamageWith:Ember Spray»", mode: null,
      flags: { dcc: { RollType: "Damage" }, "fast-fighting-dcc": { byType: { fire: 9 } } }
    });
  });

  test("several bolts: their count rolled first, its own card; each bolt's dice and caster level on the one Damage card", async () => {
    const { token } = wizard({ level: 3 });
    const { chat, made } = dice([2, 4, 1, 6]);
    const out = await damage(token, "actA.sp1@1");
    expect(chat.map(m => m.rolls[0].formula)).toEqual(["1d4+1", "1d6+3+1d6+3+1d6+3"]);
    expect(chat[0]).toMatchObject({ flavor: "Ember Spray", speaker: { actor: "actA" } });
    expect(chat[0].flags).toBeUndefined();
    expect(made).toHaveLength(1);
    expect(out).toEqual({ damage: { byType: { fire: 20 } }, card: "m2" });
  });

  test("for the GMs only when secret: every card it posts", async () => {
    const { token } = wizard();
    const { chat } = dice([2, 4, 1, 6]);
    await damage(token, "actA.sp1@1", { secret: true });
    expect(chat.map(m => m.mode)).toEqual(["gm", "gm"]);
  });

  test("anything but a spell's result with damage: null, nothing rolled", async () => {
    const { token } = wizard();
    const { chat } = dice([5]);
    expect(await damage(token, "actA.sp1")).toBeNull(); // the spell, at no result
    expect(await damage(token, "actB.sp1@0")).toBeNull(); // another's
    expect(await damage(token, "actA.w1@0")).toBeNull(); // a weapon
    expect(await damage(token, "actA.sp1@7")).toBeNull(); // no such result
    expect(await damage(token, null)).toBeNull();
    expect(await damage(wizard({ table: false }).token, "actA.sp1@0")).toBeNull(); // its results can't be read
    expect(chat).toEqual([]);
  });

  test("at least 1, as the Roll Damage button has it; without the system's roller, Foundry's", async () => {
    const { token } = wizard();
    const { chat } = dice([1], { system: false });
    const out = await rollDccDamage(token, { name: "Sting", damage: [{ dice: [{ n: 1, faces: 4 }], flat: -2, type: "untyped" }] });
    expect(chat[0].rolls[0].formula).toBe("1d4-2");
    expect(chat[0].rolls[0].total).toBe(1);
    expect(out.damage.byType).toEqual({ untyped: 1 });
  });

  test("the core's name for a spell at one of its results", () => {
    const actor = { id: "actA" };
    expect(spellTier(actor, at("actA.sp1@2"))).toEqual({ itemId: "sp1", tier: 2 });
    expect(spellTier(actor, at("actA.sp1"))).toBeNull();
    expect(spellTier(actor, at("actAB.sp1@0"))).toBeNull();
    expect(spellTier(null, at("actA.sp1@0"))).toBeNull();
  });
});

describe("by kind, as rolled", () => {
  const parts = [{ dice: [{ n: 2, faces: 6 }], flat: 0, type: "fire" }, { dice: [{ n: 1, faces: 6 }], flat: 1, type: "cold" }];

  test("each part its dice and bonus, in the formula's order; so many times over", () => {
    expect(damageFormula(parts)).toBe("2d6+1d6+1");
    expect(damageFormula(parts, 2)).toBe("2d6+1d6+1+2d6+1d6+1");
    expect(byKind({ total: 11, dice: [{ total: 7 }, { total: 3 }] }, parts)).toEqual({ fire: 7, cold: 4 });
    expect(byKind({ total: 18, dice: [{ total: 7 }, { total: 3 }, { total: 5 }, { total: 1 }] }, parts, 2)).toEqual({ fire: 12, cold: 6 });
  });

  test("one kind, or parts that don't add up to the total: all of it the first kind", () => {
    expect(byKind({ total: 6, dice: [{ total: 6 }] }, [parts[0]])).toEqual({ fire: 6 });
    expect(byKind({ total: 30, dice: [{ total: 7 }, { total: 3 }] }, parts)).toEqual({ fire: 30 });
  });
});

/** A dcc NPC on a token, its stat line as `notes`, its applyDamage as the system's. */
function npc(notes = "", hp = 30) {
  const applied = [];
  const actor = {
    uuid: "Scene.s.Token.tokB.Actor.actB", type: "NPC", statuses: new Set(), effects: [],
    system: { attributes: { hp: { value: hp, max: hp } }, details: { notes: { value: notes } } },
    applyDamage: async (amount, multiplier) => {
      applied.push([amount, multiplier]);
      actor.system.attributes.hp.value -= amount * multiplier;
    }
  };
  globalThis.game.combat = { getCombatantsByToken: () => [] };
  return { token: { uuid: "Scene.s.Token.tokB", id: "tokB", actor }, actor, applied };
}

describe("a spell's Damage card applied", () => {
  /** The card rollDamage posts, for so much of each kind. */
  async function card(parts, rolled) {
    const { token } = wizard();
    const { chat } = dice(rolled);
    await rollDccDamage(token, { name: "Ember Spray", damage: parts });
    return chat.at(-1);
  }
  const fire = [{ dice: [{ n: 2, faces: 6 }], flat: 0, type: "fire" }];
  const apply = (message, token, multiplier = 1) => new DccAdapter().applyDamageCard(message, token, { multiplier });

  test("its share by the multiplier, rounded down, through the system's applyDamage, the hit points kept for Rewind", async () => {
    const m = await card(fire, [9]);
    const { token, applied } = npc();
    const records = await apply(m, token, 0.5);
    expect(applied).toEqual([[4, 1]]);
    expect(records[0]).toMatchObject({ actorUpdate: { "system.attributes.hp.value": 30 } });
    await apply(m, token);
    expect(applied.at(-1)).toEqual([9, 1]);
  });

  test("what its stat line says: none of what it's immune to, half, double", async () => {
    const m = await card(fire, [9]);
    const immune = npc("Atk claw +2 melee (1d6); AC 14; HD 3d8; SP immune to fire; SV Fort +3, Ref +1, Will +0.");
    expect(await apply(m, immune.token)).toEqual([]);
    expect(immune.applied).toEqual([]);
    const half = npc("SP half damage from fire; SV Fort +3.");
    await apply(m, half.token);
    expect(half.applied).toEqual([[4, 1]]);
    const double = npc("SP double damage from fire; SV Fort +3.");
    await apply(m, double.token);
    expect(double.applied).toEqual([[18, 1]]);
  });

  test("each kind on its own: what it's immune to of two kinds", async () => {
    const m = await card([...fire, { dice: [{ n: 1, faces: 6 }], flat: 0, type: "cold" }], [7, 4]);
    expect(m.flags["fast-fighting-dcc"].byType).toEqual({ fire: 7, cold: 4 });
    const { token, applied } = npc("SP immune to cold; SV Fort +3.");
    await apply(m, token);
    expect(applied).toEqual([[7, 1]]);
  });
});

describe("an action's own card (useAction)", () => {
  test("not offered: a spell's or Lay on Hands' card is its check's; Help, Not in the Face and the rest have none", () => {
    expect(new DccAdapter().useAction).toBe(SystemAdapter.prototype.useAction);
  });
});
