/**
 * Setting a character up by itself, as DCC reads it: the playstyles that fit, and its own answers to the tactics
 * questions and to what it offers and expects ("Let this character decide"), each with its reason. The characters and
 * creatures here are made up for the tests; the field paths are the dcc system's own.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { dccHints, dccTactics, roleOf } from "../scripts/auto.js";
import { DccAdapter } from "../scripts/adapter.js";
import { TACTIC_CHOICES, TACTIC_KEYS } from "../../fast-fighting/scripts/engine/tactics.js";
import { validLet, validMotive } from "../../fast-fighting/scripts/foundry/auto-config.js";
import { text } from "./foundry-i18n.js";

/** The answers, without their reasons. */
const values = hints => Object.fromEntries(Object.entries(hints).map(([k, v]) => [k, v.value]));

/** Every answer is one the core takes (one of its question's choices; an offer or expectation as the survey stores one), with a reason. */
function expectFair(hints, actions = []) {
  const spec = { actions: actions.map(id => ({ id })) };
  for ( const [k, { value, why }] of Object.entries(hints) ) {
    if ( ["offer", "expect"].includes(k) ) expect([k, validMotive(k, value)]).toEqual([k, true]);
    else {
      expect(TACTIC_KEYS).toContain(k);
      if ( k !== "preferredAction" ) expect(TACTIC_CHOICES[k]).toContain(value);
      expect([k, validLet(k, value, spec)]).toEqual([k, true]);
    }
    expect([k, typeof why === "string" && why.length > 0]).toEqual([k, true]);
  }
}

const NAMES = { will: "Will", lucky: "Lucky Weapon", deeds: "Mighty Deeds of Arms", layOnHands: "Lay on Hands", twoWeapons: "Two-Weapon Fighting", alignment: "Chaotic" };

describe("the playstyles DCC says fit", () => {
  test("a class, by the class sheet (XCC's too; every Specialist a thief)", () => {
    expect(dccHints({ cls: "warrior" })).toMatchObject({ brawler: 0.4, tank: 0.2 });
    expect(dccHints({ cls: "sp-scout" }).thief).toBe(0.5);
    expect(dccHints({ cls: "gnome" }).tank).toBe(0.5);
    // (The core book's 0-level pregens are filed under the class "Zero".)
    expect(dccHints({ cls: "zero" })).toEqual(dccHints({ cls: "zero-level" }));
    expect(dccHints({ cls: "zero-level" }).fragile).toBe(0.3);
  });

  test("an alignment; a monster's stat line: un-dead, demons and devils", () => {
    expect(dccHints({ alignment: "c" })).toMatchObject({ cruel: 0.15, wildcard: 0.2 });
    expect(dccHints({ undead: true, mindless: true }).relentless).toBeCloseTo(0.7);
    expect(dccHints({ unholy: true }).cruel).toBe(0.4);
    expect(dccHints({ alignment: "n" })).toEqual({});
  });
});

describe("DCC's answers for a player character: what its build clearly implies", () => {
  test("a warrior: its lucky weapon, the front line, its defensive deed as it would anyway", () => {
    const weapons = [{ id: "w.axe", name: "Handaxe", trained: true, mark: "lucky" }, { id: "w.lance", name: "Lance", trained: true, mark: null }];
    const h = dccTactics({ pc: true, cls: "warrior", level: 3, alignment: "n", weapons, deedDie: true, names: { ...NAMES, cls: "Warrior" } });
    expect(values(h)).toEqual({ preferredAction: "w.axe", style: "frontline", shield: "spare" });
    expect(h.preferredAction.why).toBe("Lucky Weapon");
    expect(h.style.why).toBe("Warrior");
    expect(h.shield.why).toBe("Mighty Deeds of Arms");
    expectFair(h, ["w.axe", "w.lance"]);
    // (Without the system's words: its class's, and this module's.)
    const bare = dccTactics({ pc: true, cls: "warrior", level: 3, weapons, deedDie: true });
    expect(bare.preferredAction.why).toBe("warrior");
    expect(bare.shield.why).toBe(text("FFDCC.Reason.DeedDie"));
  });

  test("a cleric heals readily, rescues the dying, and lays hands on itself first; a chaotic one less readily", () => {
    const lawful = dccTactics({ pc: true, cls: "cleric", level: 3, alignment: "l", names: { ...NAMES, cls: "Cleric" } });
    expect(values(lawful)).toEqual({ style: "frontline", specialty: "some", healAggro: "aggressive", allyDying: "rescue", selfRevived: "healSelf" });
    expect(lawful.allyDying.why).toBe("Lay on Hands");
    expectFair(lawful);
    const chaotic = dccTactics({ pc: true, cls: "cleric", level: 3, alignment: "c", names: { ...NAMES, cls: "Cleric" } });
    expect(values(chaotic)).toMatchObject({ healAggro: "balanced", allyDying: "fight", selfRevived: "healSelf" });
    expect(chaotic.healAggro.why).toContain("Cleric");
    expect(chaotic.healAggro.why).toContain("Chaotic");
    // (XCC's Messenger is a cleric.)
    expect(values(dccTactics({ pc: true, cls: "messenger", level: 2 }))).toMatchObject({ healAggro: "aggressive", allyDying: "rescue" });
  });

  test("a thief, a halfling, a Specialist: their Luck comes back, so they spend it; a wizard lives by its spells, an elf less so", () => {
    expect(values(dccTactics({ pc: true, cls: "thief", level: 3 }))).toEqual({ style: "skirmisher", resourceUse: "nova" });
    expect(values(dccTactics({ pc: true, cls: "halfling", level: 3 }))).toEqual({ style: "skirmisher", resourceUse: "nova" });
    expect(values(dccTactics({ pc: true, cls: "sp-scout", level: 1 }))).toEqual({ style: "skirmisher", resourceUse: "nova" });
    expect(values(dccTactics({ pc: true, cls: "wizard", level: 3 }))).toEqual({ style: "caster", specialty: "strong" });
    expect(values(dccTactics({ pc: true, cls: "elf", level: 3 }))).toEqual({ style: "caster", specialty: "some" });
    // (A warrior's burned Luck is gone for good: how freely it spends it is its own.)
    expect(dccTactics({ pc: true, cls: "warrior", level: 3 }).resourceUse).toBeUndefined();
  });

  test("its two weapons together, set up on the sheet, are its signature attack (a halfling's)", () => {
    const weapons = [{ id: "h.axe", name: "Handaxe", trained: true }, { id: "h.sword", name: "Short sword", trained: true }];
    const h = dccTactics({ pc: true, cls: "halfling", level: 3, weapons, twoWeapons: "h.two-weapons", names: NAMES });
    expect(h.preferredAction).toEqual({ value: "h.two-weapons", why: "Two-Weapon Fighting" });
    expectFair(h, ["h.axe", "h.sword", "h.two-weapons"]);
  });

  test("XCC's classes: a Brawler's fists, a Gnome guards its friends, a Hottie talks first, a Jammer's chosen weapon", () => {
    const brawler = dccTactics({ pc: true, cls: "brawler", level: 1, fists: "b.fists", names: { cls: "Brawler" } });
    expect(values(brawler)).toEqual({ preferredAction: "b.fists", style: "frontline", specialty: "strong" });
    expect(values(dccTactics({ pc: true, cls: "gnome", level: 1 }))).toEqual({ style: "protector", target: "protect", specialty: "some" });
    expect(values(dccTactics({ pc: true, cls: "dungeon-hottie", level: 1 }))).toEqual({ style: "skirmisher", talk: "first" });
    const jammer = dccTactics({ pc: true, cls: "jammer", level: 1, weapons: [{ id: "j.lute", name: "Lute", trained: true, mark: "chosen" }], names: { chosen: "Chosen Weapon" } });
    expect(jammer.preferredAction).toEqual({ value: "j.lute", why: "Chosen Weapon" });
    expect(jammer.talk.value).toBe("opportune");
  });

  test("a 0-level funnel peasant: its occupation's weapon over one it isn't trained in, and it runs when hurt", () => {
    const weapons = [{ id: "z.fork", name: "Pitchfork (as spear)", trained: true }, { id: "z.sword", name: "Longsword", trained: false }];
    const h = dccTactics({ pc: true, cls: "zero", level: 0, weapons, occupation: "Corn farmer", names: { cls: "Zero-Level" } });
    expect(values(h)).toEqual({ preferredAction: "z.fork", retreat: "hurt" });
    expect(h.preferredAction.why).toBe("Corn farmer");
    expect(h.retreat.why).toBe(text("FFDCC.Reason.Zero"));
    expectFair(h, ["z.fork", "z.sword"]);
    // (One weapon, or all trained: nothing marks one over another.)
    expect(dccTactics({ pc: true, cls: "zero", level: 0, weapons: weapons.slice(0, 1) }).preferredAction).toBeUndefined();
    // (A level-0 character of any class is still a funnel peasant.)
    expect(values(dccTactics({ pc: true, cls: "cleric", level: 0 }))).toEqual({ retreat: "hurt" });
  });

  test("what its build doesn't speak to is left to the core and its player", () => {
    const h = dccTactics({ pc: true, cls: "warrior", level: 3, alignment: "l" });
    for ( const k of ["target", "consumables", "potionThreshold", "talk", "healAggro", "allyDying", "selfRevived", "retreat", "beyond", "offer", "expect"] ) expect(h[k]).toBeUndefined();
    // (A class from another book: nothing by class.)
    expect(dccTactics({ pc: true, cls: "sorcerer-of-zhar", level: 2 })).toEqual({});
  });
});

describe("DCC's answers for a creature: its stat line, its Will, its name", () => {
  test("the walking dead never flee, talk or bargain, and go for whoever's nearest", () => {
    const zombie = dccTactics({ name: "Zombie", undead: true, mindless: true, will: 0, level: 2 });
    expect(values(zombie)).toEqual({
      style: "frontline", target: "nearest", talk: "never", retreat: "never", beyond: "stay", offer: { kind: "" }, expect: { kind: "" }
    });
    expect(zombie.retreat.why).toBe(text("FFDCC.Reason.UndeadNeverFlees"));
    expect(zombie.target.why).toBe(text("FFDCC.Why.Mindless"));
    expectFair(zombie);
    // (A vampire thinks: it only never runs.)
    expect(values(dccTactics({ name: "Vampire", undead: true, will: 4, level: 6 }))).toEqual({ retreat: "never" });
    expect(dccTactics({ name: "Iron Golem", construct: true, will: 0 }).retreat.why).toBe(text("FFDCC.Why.Construct"));
  });

  test("a giant thane checks morale when the fight turns, a Will no check can break never does; one immune to fear never flees", () => {
    const thane = dccTactics({ name: "Asmundr, the Ice Giant thane", will: 6, level: 6, names: NAMES });
    expect(values(thane)).toEqual({ retreat: "losing" });
    expect(thane.retreat.why).toBe(text("FFDCC.Why.Morale", { name: "Will", n: "+6" }));
    expect(dccTactics({ name: "Demon lord", will: 10, names: NAMES }).retreat.value).toBe("never");
    expect(dccTactics({ name: "Hellhound", fearless: true, will: 2 }).retreat).toEqual({ value: "never", why: text("FFDCC.Reason.ImmuneFear") });
    expectFair(thane);
  });

  test("a beast flees when hurt, has no words, offers and wants nothing; pack hunters gang up on the weakest and hunt", () => {
    const bear = dccTactics({ name: "Polar Bear", beast: true, will: 2, level: 4 });
    expect(values(bear)).toEqual({ talk: "never", retreat: "hurt", offer: { kind: "" }, expect: { kind: "" } });
    expect(bear.retreat.why).toBe(text("FFDCC.Reason.BeastFlees"));
    const hounds = dccTactics({ name: "Black Hound", beast: true, pack: true, will: 2, level: 3 });
    expect(values(hounds)).toMatchObject({ target: "weakest", beyond: "hunt" });
    expect(hounds.beyond.why).toBe(text("FFDCC.Why.PackTactics"));
    expectFair(hounds);
  });

  test("a spellcaster leads with its spells; a flier strikes and wheels away", () => {
    const acolyte = dccTactics({ name: "Giant Acolyte", casts: true, will: 3, level: 3 });
    expect(values(acolyte)).toMatchObject({ style: "caster", specialty: "strong" });
    expect(acolyte.style.why).toBe(text("FFDCC.Reason.Caster"));
    const owl = dccTactics({ name: "Owl", beast: true, flies: true, will: 0, level: 1 });
    expect(owl.style).toEqual({ value: "skirmisher", why: text("FFDCC.Why.Flies") });
  });

  test("its name, where nothing else says: a highwayman, a sellsword, a sentry, a hunting party, a noble", () => {
    expect(roleOf("Bandit captain")).toBe("bandit");
    expect(roleOf("Giantling Guards (3)")).toBe("guard");
    expect(roleOf("Giant Hunting Party")).toBe("hunter");
    expect(roleOf("Wolf")).toBeNull();
    const bandit = dccTactics({ name: "Bandit captain", will: 2, level: 3, gold: true });
    expect(values(bandit)).toMatchObject({ offer: { kind: "passage" }, expect: { kind: "money", amount: 30, coin: 100 } });
    expect(bandit.expect.why).toBe("Bandit captain");
    expect(values(dccTactics({ name: "Mercenary", will: 1, level: 1, gold: true }))).toMatchObject({ offer: { kind: "leave" }, expect: { kind: "money", amount: 10 } });
    const sentry = dccTactics({ name: "Giant Sentry", will: 2, level: 4, gold: true });
    expect(values(sentry)).toMatchObject({ beyond: "seekHelp", offer: { kind: "noHarm" }, expect: { kind: "leave" } });
    expect(values(dccTactics({ name: "Giant Hunting Party", will: 1, level: 3 }))).toMatchObject({ beyond: "hunt" });
    // A noble buys its way out with a tenth of its purse; one with an empty purse, nothing.
    expect(dccTactics({ name: "Noble", will: 2, level: 2, gold: true, money: 50000 }).offer.value).toEqual({ kind: "money", amount: 50, coin: 100 });
    expect(dccTactics({ name: "Noble", will: 2, level: 2, gold: true, money: 0 }).offer).toBeUndefined();
    // (No coin worth a hundred: nothing asked in money.)
    expect(dccTactics({ name: "Bandit", will: 0, level: 1, gold: false }).expect).toBeUndefined();
    for ( const h of [bandit, sentry] ) expectFair(h);
  });

  test("what its stat line doesn't speak to is left to the core", () => {
    expect(values(dccTactics({ name: "Mendax the Mad", will: 0, level: 3 }))).toEqual({ retreat: "losing" });
    expect(dccTactics({ name: "Mendax the Mad" })).toEqual({});
  });
});

describe("the dcc sheet, read for its answers", () => {
  const sheet = ({ type = "Player", system = {}, items = [], id = "a1", name = "Wenna", flags = {} } = {}) => {
    const actor = {
      id, name, type, effects: [], items, flags, getFlag: (scope, key) => flags[scope]?.[key],
      system: {
        abilities: Object.fromEntries(["str", "agl", "sta", "per", "int", "lck"].map(k => [k, { value: 10, mod: 0 }])),
        saves: { wil: { value: "+2" } }, attributes: { hp: { max: 16 }, hitDice: { value: "1d8" }, speed: { value: "30'" } },
        details: { level: { value: 3 }, alignment: "n", attackBonus: "+2", sheetClass: "", notes: { value: "" }, occupation: { value: "" } },
        class: { className: "" }, currency: {},
        ...system
      }
    };
    actor.itemTypes = { weapon: items.filter(i => i.type === "weapon"), spell: items.filter(i => i.type === "spell"), armor: [] };
    return actor;
  };
  const weapon = (id, name, extra = {}) => ({ id, name, type: "weapon", system: { equipped: true, trained: true, melee: true, ...extra } });
  const spec = (actor, extra = {}) => ({
    actions: actor.itemTypes.weapon.map(w => ({ id: `${actor.id}.${w.id}` })), level: 3, defenses: { wil: 2 }, speeds: { walk: 30 }, flags: {},
    valuables: { money: 0, denominations: [{ label: "gp", value: 100 }, { label: "sp", value: 10 }, { label: "cp", value: 1 }] }, ...extra
  });
  beforeEach(() => {
    globalThis.CONFIG = { DCC: { abilities: {}, saves: { wil: "DCC.SavesWill" }, alignments: { l: "DCC.AlignmentL", n: "DCC.AlignmentN", c: "DCC.AlignmentC" } } };
    globalThis.game.actors = { filter: () => [] };
  });

  test("a warrior's sheet: the lucky weapon its class names, its deed die", () => {
    const actor = sheet({
      system: { details: { level: { value: 3 }, alignment: "l", attackBonus: "+d5+1", sheetClass: "Warrior", notes: { value: "" } }, class: { className: "Warrior", luckyWeapon: "Long Sword" } },
      items: [weapon("i1", "Mace"), weapon("i2", "Longsword")]
    });
    const h = new DccAdapter().tacticHints(actor, spec(actor));
    expect(values(h)).toEqual({ preferredAction: "a1.i2", style: "frontline", shield: "spare" });
    expectFair(h, ["a1.i1", "a1.i2"]);
  });

  test("a funnel peasant's sheet: its occupation's weapon, not the sword it picked up", () => {
    const actor = sheet({
      system: { details: { level: { value: 0 }, alignment: "n", attackBonus: "+0", sheetClass: "Zero", notes: { value: "" }, occupation: { value: "Gongfarmer" } }, class: { className: "Zero-Level" } },
      items: [weapon("i1", "Trowel (as dagger)"), weapon("i2", "Longsword", { trained: false })]
    });
    const h = new DccAdapter().tacticHints(actor, spec(actor, { level: 0 }));
    expect(h.preferredAction).toEqual({ value: "a1.i1", why: "Gongfarmer" });
    expect(h.retreat.value).toBe("hurt");
  });

  test("a monster's sheet: its stat line, Will and name", () => {
    const notes = "Giant Sentry: Init +1; Atk morningstar +5 melee (1d12+4); AC 15; HD 4d12+3; MV 40'; Act 1d24; SP immune to cold, crit on 22+; SV Fort +5, Ref +1, Will +2; AL C.";
    const actor = sheet({ type: "NPC", name: "Giant Sentry", system: { details: { level: { value: 0 }, alignment: "c", notes: { value: notes } }, attributes: { hp: { max: 28 }, hitDice: { value: "4d12+3" }, speed: { value: "40'" } } } });
    const h = new DccAdapter().tacticHints(actor, spec(actor, { level: 4 }));
    expect(values(h)).toEqual({ retreat: "losing", beyond: "seekHelp", offer: { kind: "noHarm" }, expect: { kind: "leave" } });
    expectFair(h);
    const hounds = sheet({ type: "NPC", name: "Black Hound", system: { details: { level: { value: 0 }, alignment: "c", notes: { value: "Black Hounds: Atk bite +4 melee (1d8+4); SP pack tactics; SV Fort +3, Ref +2, Will +2; AL C." } } } });
    expect(values(new DccAdapter().tacticHints(hounds, spec(hounds, { flags: { beast: true, packTactics: true } })))).toMatchObject({ target: "weakest", beyond: "hunt", retreat: "hurt", talk: "never" });
  });
});
