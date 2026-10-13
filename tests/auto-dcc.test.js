/**
 * Setting a character up by itself, as DCC reads it: the playstyles that fit, and its own answers to the tactics
 * questions and to what it offers and expects ("Let this character decide"), each with its reason. The characters and
 * creatures here are made up for the tests; the field paths are the dcc system's own.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { dccHints, dccTactics } from "../scripts/auto.js";
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
    expect(values(dccTactics({ pc: true, cls: "thief", level: 3 }))).toEqual({ style: "skirmisher", resourceUse: "nova", consumables: "freely" });
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
    expect(values(h)).toEqual({ preferredAction: "z.fork", retreat: "hurt", offer: { kind: "leave" }, expect: { kind: "noHarm" } });
    expect(h.preferredAction.why).toBe("Corn farmer");
    expect(h.retreat.why).toBe(text("FFDCC.Reason.Zero"));
    expect(h.offer.why).toBe(text("FFDCC.Reason.Zero"));
    expectFair(h, ["z.fork", "z.sword"]);
    // (One weapon, or all trained: nothing marks one over another.)
    expect(dccTactics({ pc: true, cls: "zero", level: 0, weapons: weapons.slice(0, 1) }).preferredAction).toBeUndefined();
    // (A level-0 character of any class is still a funnel peasant.)
    expect(values(dccTactics({ pc: true, cls: "cleric", level: 0 }))).toEqual({ retreat: "hurt", offer: { kind: "leave" }, expect: { kind: "noHarm" } });
  });

  test("XCC's Blaster goes for magic users; a thief makes the most of scrolls and poison", () => {
    const blaster = dccTactics({ pc: true, cls: "blaster", level: 2, names: { cls: "Blaster" } });
    expect(blaster.target).toEqual({ value: "casters", why: "Blaster" });
    expectFair(blaster);
    const thief = dccTactics({ pc: true, cls: "thief", level: 2, names: { cls: "Thief", scroll: "Cast spell from scroll", poison: "Handle poison" } });
    expect(thief.consumables.value).toBe("freely");
    expect(thief.consumables.why).toContain("Cast spell from scroll");
    expect(thief.consumables.why).toContain("Handle poison");
    expectFair(thief);
    // (A Specialist's skills are its own: nothing said of scrolls.)
    expect(dccTactics({ pc: true, cls: "sp-scout", level: 2 }).consumables).toBeUndefined();
  });

  test("a Luck too low to count on when its body is rolled: it gets out when hurt", () => {
    const h = dccTactics({ pc: true, cls: "warrior", level: 2, luck: 5, names: { luck: "Luck" } });
    expect(h.retreat).toEqual({ value: "hurt", why: text("FFDCC.Reason.Ability", { name: "Luck", n: 5 }) });
    expect(dccTactics({ pc: true, cls: "warrior", level: 2, luck: 6 }).retreat).toBeUndefined();
    expect(dccTactics({ pc: true, cls: "warrior", level: 2 }).retreat).toBeUndefined();
    // (A funnel peasant's reason is that it's one.)
    expect(dccTactics({ pc: true, cls: "zero", level: 0, luck: 4 }).retreat.why).toBe(text("FFDCC.Reason.Zero"));
  });

  test("what its build doesn't speak to is left to the core and its player", () => {
    const h = dccTactics({ pc: true, cls: "warrior", level: 3, alignment: "l" });
    for ( const k of ["target", "consumables", "potionThreshold", "talk", "healAggro", "allyDying", "selfRevived", "retreat", "beyond", "offer", "expect"] ) expect(h[k]).toBeUndefined();
    // (A class from another book: nothing by class.)
    expect(dccTactics({ pc: true, cls: "sorcerer-of-zhar", level: 2 })).toEqual({});
  });
});

describe("DCC's answers for a creature: its stat line and its Will", () => {
  test("the walking dead never flee, talk or bargain, and go for whoever's nearest", () => {
    const zombie = dccTactics({ name: "Zombie", undead: true, mindless: true, will: 0, level: 2 });
    expect(values(zombie)).toEqual({
      style: "frontline", target: "nearest", talk: "never", retreat: "never", beyond: "stay", offer: { kind: "" }, expect: { kind: "" }, consumables: "avoid"
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
    expect(values(bear)).toEqual({ talk: "never", retreat: "hurt", offer: { kind: "" }, expect: { kind: "" }, consumables: "avoid" });
    expect(bear.consumables.why).toBe(text("FFDCC.Reason.Beast"));
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

  test("its name says nothing: a bandit, a sentry or a noble by its name alone is left to the core (and its notes' keywords)", () => {
    for ( const name of ["Bandit captain", "Giant Sentry", "Giant Hunting Party", "Mercenary", "Noble"] ) {
      expect(values(dccTactics({ name, will: 2, level: 3 }))).toEqual({ retreat: "losing" });
    }
  });

  test("what its stat line doesn't speak to is left to the core", () => {
    expect(values(dccTactics({ name: "Mendax the Mad", will: 0, level: 3 }))).toEqual({ retreat: "losing" });
    expect(dccTactics({ name: "Mendax the Mad" })).toEqual({});
  });
});

describe("every answer DCC gives", () => {
  test("is one the core takes, with a reason, whatever the character (with the system's words or without)", () => {
    const classes = [null, "warrior", "cleric", "thief", "wizard", "elf", "dwarf", "halfling", "zero", "messenger", "brawler", "dungeon-hottie", "jammer",
      "gnome", "athlete", "blaster", "half-orc", "half-elf", "xcc-dwarf", "sp-acrobat", "sp-scout", "sp-criminal", "sorcerer-of-zhar"];
    const weapons = [
      [],
      [{ id: "w.a", name: "Axe", trained: true, mark: "lucky" }, { id: "w.b", name: "Bow", trained: true, mark: null }],
      [{ id: "w.a", name: "Axe", trained: true, mark: null }, { id: "w.b", name: "Bow", trained: false, mark: null }]
    ];
    let n = 0;
    for ( const cls of classes ) for ( const level of [0, 1, 4] ) for ( const alignment of ["l", "n", "c"] ) for ( const luck of [undefined, 3, 12] ) {
      for ( const [i, list] of weapons.entries() ) for ( const twoWeapons of [undefined, "w.two"] ) for ( const names of [{}, { ...NAMES, cls: "Class", luck: "Luck", scroll: "Scroll", poison: "Poison" }] ) {
        const extra = { twoWeapons, fists: cls === "brawler" ? "w.fists" : undefined, deedDie: level > 0 && i > 0, occupation: i === 2 ? "Farmer" : "" };
        const h = dccTactics({ pc: true, cls, level, alignment, luck, weapons: list, names, ...extra });
        expectFair(h, ["w.a", "w.b", "w.two", "w.fists"]);
        n += Object.keys(h).length;
      }
    }
    const flags = ["undead", "mindless", "construct", "beast", "fearless", "casts", "flies", "pack"];
    for ( let mask = 0; mask < 1 << flags.length; mask++ ) for ( const will of [undefined, -1, 3, 12] ) {
      const f = Object.fromEntries(flags.map((k, i) => [k, !!(mask & (1 << i))]));
      const h = dccTactics({ ...f, will, level: 3, name: "Bandit captain" });
      expectFair(h);
      n += Object.keys(h).length;
    }
    expect(n).toBeGreaterThan(1000);
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

  test("its Luck, as the sheet has it", () => {
    const luckless = sheet({ system: { abilities: { lck: { value: 4, mod: -2 } }, details: { level: { value: 2 }, alignment: "n", attackBonus: "+1", sheetClass: "Thief", notes: { value: "" } }, class: { className: "Thief" } } });
    const h = new DccAdapter().tacticHints(luckless, spec(luckless));
    expect(values(h)).toMatchObject({ style: "skirmisher", resourceUse: "nova", consumables: "freely", retreat: "hurt" });
    expectFair(h);
    // (None on the sheet: nothing said.)
    const blank = sheet({ system: { abilities: { lck: { value: "" } }, details: { level: { value: 2 }, alignment: "n", attackBonus: "+1", sheetClass: "Warrior", notes: { value: "" } }, class: { className: "Warrior" } } });
    expect(new DccAdapter().tacticHints(blank, spec(blank)).retreat).toBeUndefined();
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

  test("a monster's sheet: its stat line and Will (not its name)", () => {
    const notes = "Giant Sentry: Init +1; Atk morningstar +5 melee (1d12+4); AC 15; HD 4d12+3; MV 40'; Act 1d24; SP immune to cold, crit on 22+; SV Fort +5, Ref +1, Will +2; AL C.";
    const actor = sheet({ type: "NPC", name: "Giant Sentry", system: { details: { level: { value: 0 }, alignment: "c", notes: { value: notes } }, attributes: { hp: { max: 28 }, hitDice: { value: "4d12+3" }, speed: { value: "40'" } } } });
    const h = new DccAdapter().tacticHints(actor, spec(actor, { level: 4 }));
    expect(values(h)).toEqual({ retreat: "losing" });
    expectFair(h);
    const hounds = sheet({ type: "NPC", name: "Black Hound", system: { details: { level: { value: 0 }, alignment: "c", notes: { value: "Black Hounds: Atk bite +4 melee (1d8+4); SP pack tactics; SV Fort +3, Ref +2, Will +2; AL C." } } } });
    expect(values(new DccAdapter().tacticHints(hounds, spec(hounds, { flags: { beast: true, packTactics: true } })))).toMatchObject({ target: "weakest", beyond: "hunt", retreat: "hurt", talk: "never" });
  });
});
