/**
 * Saves and checks rolled the dcc system's way in a live battle (core API 19 rollSave, rollCheck): the actor's own
 * roller, no dialog, read off the card it posts; graded by the helper's rules on the die the card rolled. A check by
 * what it's for and the action's id: a spell check (the spell on the sheet), Lay on Hands and Turn Unholy, Personality
 * (Strength to intimidate, where better), a thief's and halfling's skills, XCC's Acrobatics; anything else, anyone
 * untrained and a monster casting at its stat line's spell check, null (the engine's dice). Every card it posts loses
 * its Fleeting Luck, and is for the GMs only when secret; a spell check's lost spell and disapproval stay off the sheet
 * (FastFighting writes them with the turn), the rest lands.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DccAdapter } from "../scripts/adapter.js";
import { checkFor, saveFor } from "../scripts/check-roll.js";

const was = { Hooks: globalThis.Hooks };
afterEach(() => Object.assign(globalThis, was));

/** Foundry's Hooks, as far as making a card and updating a document use them: a hook that returns false stops it. */
function hooks() {
  const on = new Map();
  let n = 0;
  return {
    on: (name, fn) => { on.set(++n, { name, fn }); return n; },
    off: (name, id) => on.delete(id),
    call: (name, ...args) => { for ( const h of [...on.values()] ) if ( h.name === name && h.fn(...args) === false ) return false; return true; },
    count: () => on.size
  };
}

/** A dotted path set on an object; null takes it off (as v14's _del would). */
function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const at = keys.reduce((o, k) => (o[k] ??= {}), obj);
  if ( value === null ) delete at[last];
  else at[last] = value;
}

/** An update's changes landing on a document. */
function merge(into, change) {
  for ( const [k, v] of Object.entries(change) ) {
    if ( v && typeof v === "object" && !Array.isArray(v) ) merge(into[k] ??= {}, v);
    else into[k] = v;
  }
}

/** A roll as Foundry evaluates it: its total and its dice. */
const roll = ({ natural = 12, total = 15, faces = 20 } = {}) => ({ total, formula: `1d${faces}`, dice: [{ total: natural, faces }] });

/** The Fleeting Luck the dcc system marks a card with: a 20 on a d20 earns it, a 1 on a d14 or bigger loses it all. */
const luck = r => (r.dice[0].faces === 20 && r.dice[0].total === 20 ? { FleetingLuckEffect: "Gain" } : r.dice[0].total === 1 ? { FleetingLuckEffect: "Lose" } : {});

/**
 * A dcc actor and its token, its rollers as the system's: each posts its card as the actor (preCreateChatMessage, the
 * card as Foundry builds it before it's made: `chat`, as made), the dice as `dice` says. A spell check that `fails`
 * also loses the spell and widens disapproval through the sheet's own updates (with a patron taint note in the same
 * update), and posts the system's line that the spell is lost. `table`: Lay on Hands and Turn Unholy have their tables.
 */
function character({ id = "actA", type = "Player", sheetClass = "Wizard", system = {}, dice = {}, fails = false, table = true } = {}) {
  const chat = [];
  const calls = [];
  const actor = {
    id, uuid: `Actor.${id}`, type, items: new Map(),
    system: {
      details: { sheetClass, notes: { value: "" } }, class: { spellCheck: "+3", disapproval: 1 },
      abilities: { str: { mod: 0 }, per: { mod: 1 }, agl: { mod: 1 } },
      saves: { frt: { value: "+1" }, ref: { value: "+2" }, wil: { value: "+0" } }, skills: {}, ...system
    },
    update(change) {
      if ( Hooks.call("preUpdateActor", actor, change, {}, "u1") !== false ) merge(actor, change);
    }
  };
  const spell = {
    id: "sp1", type: "spell", name: "a spell", parent: actor, system: { lost: false },
    update(change) {
      if ( Hooks.call("preUpdateItem", spell, change, {}, "u1") !== false ) merge(spell, change);
    }
  };
  actor.items.set("sp1", spell);
  actor.items.set("w1", { id: "w1", type: "weapon", name: "a blade", parent: actor });
  const post = (flags, r = null, speaker = actor.id) => {
    const message = {
      speaker: { actor: speaker, token: "tokA" }, flags: { dcc: { ...flags } }, rolls: r ? [r] : [], mode: null,
      updateSource(changes) { for ( const [path, v] of Object.entries(changes) ) setPath(message, path, v); },
      applyMode(mode) { message.mode = mode; }
    };
    if ( Hooks.call("preCreateChatMessage", message, {}, {}, "u1") !== false ) chat.push(message);
    return message;
  };
  const rolled = (how, id, options, flags) => {
    calls.push({ how, id, options });
    const r = roll(dice);
    post({ ...flags, libResult: { natural: r.dice[0].total, total: r.total }, ...luck(r) }, r);
    return r;
  };
  actor.rollSavingThrow = async (saveId, options) => rolled("save", saveId, options, { RollType: "SavingThrow", Save: saveId, isSave: true });
  actor.rollAbilityCheck = async (abilityId, options) => rolled("ability", abilityId, options, { RollType: "AbilityCheck", Ability: abilityId, isAbilityCheck: true });
  actor.rollSkillCheck = async (skillId, options) => rolled("skill", skillId, options, table && ["layOnHands", "turnUnholy"].includes(skillId)
    ? { RollType: "SpellCheck", SpellCheck: true } : { RollType: "SkillCheck", SkillId: skillId, isSkillCheck: true });
  actor.rollSpellCheck = async options => {
    const r = rolled("spell", options.spellItem?.id, options, { RollType: "SpellCheck", SpellCheck: true, ItemId: options.spellItem?.id });
    if ( fails ) {
      options.spellItem.update({ system: { lost: true } });
      actor.update({ system: { class: { disapproval: 2, patronTaintChance: "2%" } } });
      post({});
    }
    return r;
  };
  const token = { id: "tokA", uuid: `Scene.s.Token.tokA`, actor };
  return { token, actor, spell, chat, calls };
}

const save = (token, options) => new DccAdapter().rollSave(token, { dc: 12, action: { id: null, name: "" }, ...options });
const check = (token, options) => new DccAdapter().rollCheck(token, { dc: 12, action: { id: null, name: "" }, ...options });

beforeEach(() => {
  globalThis.Hooks = hooks();
});

describe("a save, rolled the dcc system's way", () => {
  test("the save the rules name, rolled with no dialog; how it went by the helper's rules", async () => {
    const { token, calls } = character({ dice: { natural: 12, total: 15 } });
    expect(await save(token, { save: "wil" })).toEqual({ degree: 2, natural: 12, total: 15 });
    expect(calls).toEqual([{ how: "save", id: "wil", options: { showModifierDialog: false } }]);
    expect(Hooks.count()).toBe(0);
  });

  test("short of the DC fails; a natural 1 fails and a natural 20 succeeds, whatever the total", async () => {
    expect(await save(character({ dice: { natural: 5, total: 8 } }).token, { save: "ref" })).toMatchObject({ degree: 1 });
    expect(await save(character({ dice: { natural: 1, total: 14 } }).token, { save: "ref" })).toMatchObject({ degree: 1, natural: 1 });
    expect(await save(character({ dice: { natural: 20, total: 18 } }).token, { save: "ref", dc: 25 })).toMatchObject({ degree: 2, natural: 20 });
  });

  test("the core's names for DCC's saves are DCC's; anything else, or none, or no DC: null, nothing rolled", async () => {
    expect(saveFor("fortitude")).toBe("frt");
    expect(saveFor("Reflex")).toBe("ref");
    expect(saveFor(["will", "wil"])).toBe("wil");
    expect(saveFor(["frt", "ref"])).toBeNull();
    const { token, calls } = character();
    expect(await save(token, { save: "dex" })).toBeNull();
    expect(await save(token, { save: null })).toBeNull();
    expect(await save(token, { save: "frt", dc: null })).toBeNull();
    expect(calls).toEqual([]);
  });

  test("its card loses its Fleeting Luck (FastFighting's rules count it), and is for the GMs only when secret", async () => {
    const one = character({ dice: { natural: 20, total: 20 } });
    await save(one.token, { save: "frt", secret: true });
    expect(one.chat[0].flags.dcc).not.toHaveProperty("FleetingLuckEffect");
    expect(one.chat[0].flags.dcc.isSave).toBe(true);
    expect(one.chat[0].mode).toBe("gm");
    const two = character({ dice: { natural: 1, total: 3 } });
    await save(two.token, { save: "frt" });
    expect(two.chat[0].flags.dcc).not.toHaveProperty("FleetingLuckEffect");
    expect(two.chat[0].mode).toBeNull();
  });

  test("no card (cancelled, or refused): null; the system failing: its error; the hooks gone either way", async () => {
    const { token, actor } = character();
    actor.rollSavingThrow = async () => undefined;
    expect(await save(token, { save: "frt" })).toBeNull();
    actor.rollSavingThrow = async () => { throw new Error("no"); };
    await expect(save(token, { save: "frt" })).rejects.toThrow("no");
    expect(Hooks.count()).toBe(0);
  });
});

describe("a spell check, rolled the dcc system's way", () => {
  const cast = (id = "actA.sp1") => ({ purpose: "cast", action: { id, name: "a spell" } });

  test("the spell the action names, with its item and no dialog; the card's natural and total, on the card's die", async () => {
    const { token, calls, spell } = character({ dice: { natural: 14, total: 19, faces: 16 } });
    expect(await check(token, cast())).toEqual({ degree: 2, natural: 14, total: 19 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ how: "spell", id: "sp1", options: { showModifierDialog: false, spellItem: spell } });
    // (The top of a d16 is no sure success: only a d20's or bigger.)
    expect(await check(character({ dice: { natural: 16, total: 11, faces: 16 } }).token, cast())).toEqual({ degree: 1, natural: 16, total: 11 });
  });

  test("a failed check: the spell lost and the disapproval kept off the sheet (FastFighting writes them), the rest lands", async () => {
    const { token, actor, spell, chat } = character({ dice: { natural: 3, total: 6 }, fails: true });
    expect(await check(token, cast())).toEqual({ degree: 1, natural: 3, total: 6 });
    expect(spell.system.lost).toBe(false);
    expect(actor.system.class.disapproval).toBe(1);
    expect(actor.system.class.patronTaintChance).toBe("2%");
    expect(chat).toHaveLength(2);
    expect(Hooks.count()).toBe(0);
  });

  test("secret: every card it posts as the caster is for the GMs, the spell card's Fleeting Luck gone", async () => {
    const { token, chat } = character({ dice: { natural: 20, total: 25 }, fails: true });
    await check(token, { ...cast(), secret: true });
    expect(chat.map(m => m.mode)).toEqual(["gm", "gm"]);
    expect(chat[0].flags.dcc).not.toHaveProperty("FleetingLuckEffect");
  });

  test("outside a spell check, the sheet's updates are the system's", async () => {
    const { token, actor } = character({ sheetClass: "Thief", system: { skills: { pickPockets: { value: "+3" } } } });
    actor.rollSkillCheck = async () => { actor.update({ system: { class: { disapproval: 3 } } }); };
    await check(token, { purpose: "theft" });
    expect(actor.system.class.disapproval).toBe(3);
  });

  test("a cleric's Lay on Hands and Turn Unholy: its skills, read off the results card (or the plain one)", async () => {
    const skills = { layOnHands: { value: "+2" }, turnUnholy: { value: "+2" } };
    const { token, calls } = character({ sheetClass: "Cleric", system: { skills }, dice: { natural: 15, total: 18 } });
    expect(await check(token, cast("actA.layOnHands"))).toEqual({ degree: 2, natural: 15, total: 18 });
    expect(await check(character({ sheetClass: "Cleric", system: { skills }, table: false }).token, cast("actA.turnUnholy"))).toMatchObject({ degree: 2 });
    expect(calls).toEqual([{ how: "skill", id: "layOnHands", options: { showModifierDialog: false } }]);
    // (A skill the sheet doesn't have: nothing rolled, rather than the system's warning.)
    expect(await check(character({ sheetClass: "Cleric" }).token, cast("actA.layOnHands"))).toBeNull();
  });

  test("a monster casting at its stat line's spell check, its sheet's the default: null, nothing rolled; at its sheet's, rolled", async () => {
    const notes = { value: "Init +1; Atk claw +2 melee (1d4); SP spellcasting (spell check +6); SV Fort +1, Ref +1, Will +3" };
    const stat = character({ type: "NPC", sheetClass: "", system: { details: { notes }, class: { spellCheck: "+1" } } });
    expect(await check(stat.token, cast())).toBeNull();
    expect(stat.calls).toEqual([]);
    const own = character({ type: "NPC", sheetClass: "", system: { details: { notes }, class: { spellCheck: "+6" } } });
    expect(await check(own.token, cast())).toMatchObject({ degree: 2 });
  });

  test("anything that isn't a spell on the caster's sheet: null, nothing rolled", async () => {
    const { token, calls } = character();
    for ( const id of ["actA.w1", "actA.atk0", "actZ.sp1", "sp1", null] ) expect(await check(token, cast(id))).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("the other checks, by what they're for", () => {
  test("words: Personality; to intimidate, Strength where it's the better; a taunt, Personality", async () => {
    const { token, calls } = character({ system: { abilities: { str: { mod: 2 }, per: { mod: 1 } } } });
    expect(await check(token, { purpose: "talk", action: { id: null, name: "persuade" } })).toEqual({ degree: 2, natural: 12, total: 15 });
    await check(token, { purpose: "talk", action: { id: null, name: "intimidate" } });
    await check(token, { purpose: "talk", action: { id: "tokA.goad", name: "" } });
    expect(calls.map(c => c.id)).toEqual(["per", "str", "per"]);
    expect(checkFor(character().actor, { purpose: "talk", action: { id: null, name: "intimidate" } })).toEqual({ how: "ability", id: "per" });
  });

  test("a deal: the check the player picked; else a bribe is Bribery expert (XCC), or Personality, and a demand the better of Personality and Strength", () => {
    const strong = character({ system: { abilities: { str: { mod: 2 }, per: { mod: 1 } } } }).actor;
    expect(checkFor(strong, { purpose: "bribe" })).toEqual({ how: "ability", id: "per" });
    expect(checkFor(strong, { purpose: "extort" })).toEqual({ how: "ability", id: "str" });
    expect(checkFor(strong, { purpose: "toll", skill: "per" })).toEqual({ how: "ability", id: "per" });
    const briber = character({ system: { skills: { briberyExpert: { value: "+3", ability: "int" }, forgeDocument: { value: "" } } } }).actor;
    expect(checkFor(briber, { purpose: "bribe" })).toEqual({ how: "skill", id: "briberyExpert" });
    expect(checkFor(briber, { purpose: "scare" })).toEqual({ how: "ability", id: "per" });
    // (A skill with nothing in it isn't one to roll: the deal's own check instead.)
    expect(checkFor(briber, { purpose: "bribe", skill: "forgeDocument" })).toEqual({ how: "skill", id: "briberyExpert" });
  });

  test("Hide: a thief's Hide in Shadows, a halfling's Sneak and Hide; anyone else's (untrained), or nothing in the skill, null", () => {
    const hide = { purpose: "aid", action: { id: "actA.hide", name: "" } };
    const { actor } = character({ system: { skills: { hideInShadows: { value: "+5" }, sneakAndHide: { value: "+3" } } } });
    expect(checkFor(actor, { ...hide, kind: { thief: true } })).toEqual({ how: "skill", id: "hideInShadows" });
    expect(checkFor(actor, { ...hide, kind: { halfling: true } })).toEqual({ how: "skill", id: "sneakAndHide" });
    expect(checkFor(actor, { ...hide, kind: {} })).toBeNull();
    expect(checkFor(character().actor, { ...hide, kind: { thief: true } })).toBeNull();
    expect(checkFor(actor, { purpose: "aid", action: { id: "actA.help", name: "" }, kind: { thief: true } })).toBeNull();
  });

  test("by the character's class: a thief (an XCC Specialist too) picks pockets, an Acrobat tumbles clear", async () => {
    const thief = character({ sheetClass: "sp-scout", system: { skills: { pickPockets: { value: "+4" } } } });
    expect(await check(thief.token, { purpose: "theft" })).toMatchObject({ degree: 2 });
    expect(thief.calls.map(c => c.id)).toEqual(["pickPockets"]);
    const acrobat = character({ sheetClass: "sp-acrobat", system: { skills: { acrobatics: { value: "+3" } } } });
    expect(await check(acrobat.token, { purpose: "disengage", dc: 20 })).toMatchObject({ degree: 1 });
    expect(acrobat.calls.map(c => c.id)).toEqual(["acrobatics"]);
    const warrior = character({ sheetClass: "Warrior", system: { skills: { pickPockets: { value: "0" }, acrobatics: { value: "+0" } } } });
    expect(await check(warrior.token, { purpose: "theft" })).toBeNull();
    expect(await check(warrior.token, { purpose: "disengage" })).toBeNull();
    expect(warrior.calls).toEqual([]);
  });

  test("what the system rolls no check for (grapples, breaking free, binding a wound, healing): null, never a GM's call", async () => {
    const { token, calls } = character({ sheetClass: "Thief" });
    for ( const purpose of ["control", "escape", "firstAid", "heal", "aid", null] ) {
      expect(await check(token, { purpose, action: { id: "actA.grapple", name: "" }, against: "grapple" })).toBeNull();
    }
    expect(calls).toEqual([]);
  });

  test("another's card made while it rolls is left alone, and isn't read", async () => {
    const { token, actor, chat } = character({ dice: { natural: 20, total: 21 } });
    const own = actor.rollAbilityCheck;
    actor.rollAbilityCheck = async (id, options) => {
      const other = { speaker: { actor: "actZ" }, flags: { dcc: { RollType: "AbilityCheck", FleetingLuckEffect: "Gain" } }, rolls: [roll({ natural: 2, total: 2 })], applyMode() { other.mode = "gm"; }, updateSource() { other.touched = true; } };
      Hooks.call("preCreateChatMessage", other, {}, {}, "u1");
      expect(other).not.toHaveProperty("touched");
      expect(other).not.toHaveProperty("mode");
      return own(id, options);
    };
    expect(await check(token, { purpose: "talk", secret: true })).toEqual({ degree: 2, natural: 20, total: 21 });
    expect(chat[0].mode).toBe("gm");
  });
});
