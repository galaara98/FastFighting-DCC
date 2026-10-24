/**
 * What a dcc sheet gives the core, where fairness is at stake: Fleeting Luck and Mojo counted within reason (a player
 * owns the flag that holds them), what a character could hand over in a fight (the weapons and shield in its hands,
 * what it carries, the armor it wears), sizing a foe up (not for the mindless), and creeping up for an ambush (a thief's Sneak
 * Silently); and what the system's data says, its name only where that says nothing: a weapon's harm, a shield bash, who
 * speaks Common. The characters and creatures here are made up for the tests; the field paths are the dcc system's own.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { DccAdapter, fleetingPoints, isShield, isShieldBash, sneakOf, valuablesOf } from "../scripts/adapter.js";
import { archetype } from "../scripts/classes.js";
import { wordList } from "../scripts/words.js";
import { dccRules } from "../scripts/rules.js";
import { readFileSync } from "fs";

/**
 * A reader in another language, with Foundry's English to fall back on (game.i18n._fallback): the module's en.json.
 * For every test here: the core reads each word list once (its wordList), as Foundry has its languages before then.
 */
function withEnglish() {
  game.i18n._fallback = JSON.parse(readFileSync(new URL("../languages/en.json", import.meta.url), "utf8"));
  globalThis.foundry = { utils: { getProperty: (o, key) => key.split(".").reduce((x, k) => x?.[k], o) } };
}
beforeEach(withEnglish);
/** A word of a list that a stat line can carry (plain letters): English's, at least. */
const plainWord = key => wordList(key).find(w => /^[a-z]+$/.test(w));

const item = (id, type, system = {}, name = id) => ({ id, name, type, system });
const gp = n => ({ value: { gp: String(n) } });

/** A dcc actor, as far as the adapter reads one. */
function sheet({ type = "Player", system = {}, items = [], flags = {} } = {}) {
  const actor = {
    id: "a1", uuid: "Actor.a1", name: "Wenna", img: "", type, items, effects: [], statuses: new Set(), flags,
    getFlag: (scope, key) => flags[scope]?.[key], testUserPermission: () => true, getRollData: () => ({}),
    system: {
      abilities: Object.fromEntries(["str", "agl", "sta", "per", "int", "lck"].map(k => [k, { value: 10, mod: k === "agl" ? 1 : 0 }])),
      saves: { frt: { value: "+1" }, ref: { value: "+1" }, wil: { value: "+1" } },
      attributes: { hp: { value: 8, max: 8 }, hitDice: { value: "1d6" }, speed: { value: "30'" }, init: { value: "+1" }, ac: { value: 12 } },
      details: { level: { value: 1 }, alignment: "n", attackBonus: "+0", sheetClass: "Thief", notes: { value: "" }, occupation: { value: "" } },
      class: { className: "Thief", luckDie: "1d3" },
      skills: { sneakSilently: { value: "+3" }, hideInShadows: { value: "+2" } },
      currency: {},
      ...system
    }
  };
  actor.itemTypes = { weapon: items.filter(i => i.type === "weapon"), armor: items.filter(i => i.type === "armor"), spell: [] };
  return actor;
}
const token = actor => ({ id: "t1", name: actor.name, actor, texture: {} });

/** A world with nothing installed but the system: no packs, no tables; XCC on or off, Fleeting Luck on or off. */
function world({ xcc = false, fleeting = false, users = [] } = {}) {
  globalThis.CONFIG = { DCC: {}, Item: { typeLabels: {} } };
  Object.assign(globalThis.game, {
    packs: Object.assign([], { get: () => undefined }),
    tables: [],
    actors: { filter: () => [] },
    users,
    modules: { get: id => (id === "xcc" && xcc ? { active: true } : undefined) },
    settings: {
      get: (scope, key) => {
        if ( scope === "dcc" && key === "enableFleetingLuck" ) return fleeting;
        throw new Error("no such setting");
      }
    }
  });
}

describe("Fleeting Luck and Mojo, counted within reason", () => {
  test("a whole number from 0 to 20; anything else, none", () => {
    expect(fleetingPoints(3)).toBe(3);
    expect(fleetingPoints("2")).toBe(2);
    expect(fleetingPoints(2.9)).toBe(2);
    expect(fleetingPoints(1e9)).toBe(20);
    expect(fleetingPoints(Infinity)).toBe(0);
    expect(fleetingPoints(-5)).toBe(0);
    expect(fleetingPoints("lots")).toBe(0);
    expect(fleetingPoints(undefined)).toBe(0);
  });

  beforeEach(() => world());

  test("a crawler that wrote itself a billion Mojo, or a player a billion Fleeting Luck, has twenty to spend", async () => {
    world({ xcc: true });
    const crawler = await new DccAdapter().toCombatantSpec(token(sheet({ flags: { xcc: { mojo: 1e9 } } })));
    expect(crawler.resources.fleeting).toBe(20);
    expect(crawler.fleeting.points).toBe(20);
    const player = { id: "u1", isGM: false, getFlag: (scope, key) => (scope === "dcc" && key === "fleetingLuckValue" ? 1e9 : undefined) };
    world({ fleeting: true, users: [player] });
    const pc = await new DccAdapter().toCombatantSpec(token(sheet()));
    expect(pc.resources.fleeting).toBe(20);
    expect(pc.fleeting).toMatchObject({ kind: "user", id: "u1", points: 20 });
  });
});

describe("what a character could hand over in a fight", () => {
  beforeEach(() => world());

  test("the weapons and shield in its hands, what it carries put away, and the armor it wears", () => {
    const actor = sheet({
      items: [
        item("sword", "weapon", { equipped: true, ...gp(10) }),
        item("dagger", "weapon", { equipped: false, ...gp(3) }),
        item("mail", "armor", { equipped: true, fumbleDie: "1d12", ...gp(150) }),
        item("spare", "armor", { equipped: false, fumbleDie: "1d8", ...gp(20) }),
        // (A shield, whatever it's called: the armor with no fumble die. The system's own reads "-" as none.)
        item("round", "armor", { equipped: true, fumbleDie: "", ...gp(10) }, "Round thing"),
        item("gem", "treasure", gp(50)),
        item("rope", "equipment", {})
      ]
    });
    const v = valuablesOf(actor);
    expect(v.wielded.map(i => i.id).sort()).toEqual(["round", "sword"]);
    expect(v.stowed.map(i => i.id).sort()).toEqual(["dagger", "gem", "spare"]);
    expect(v.worn.map(i => i.id)).toEqual(["mail"]);
    expect(v.wielded.find(i => i.id === "round")).toEqual({ id: "round", name: "Round thing", value: 1000, quantity: 1, category: "armor" });
  });

  test("a shield is the armor with no fumble die, not one called a shield", () => {
    expect(isShield(item("s", "armor", { fumbleDie: "" }))).toBe(true);
    expect(isShield(item("s", "armor", { fumbleDie: "-" }))).toBe(true);
    expect(isShield(item("s", "armor", { fumbleDie: "d8" }, "Shield"))).toBe(false);
    expect(isShield(item("s", "armor", {}))).toBe(false);
    expect(isShield(item("s", "weapon", { fumbleDie: "" }))).toBe(false);
  });
});

describe("sizing a foe up, and creeping up on one", () => {
  beforeEach(() => world());

  test("a creature with a mind sizes a foe up; the mindless and constructs don't", async () => {
    const npc = notes => sheet({ type: "NPC", system: { details: { level: { value: 0 }, alignment: "c", notes: { value: notes } }, attributes: { hp: { value: 10, max: 10 }, hitDice: { value: "2d8" }, speed: { value: "30'" }, init: { value: "+0" }, ac: { value: 12 } } } });
    const adapter = new DccAdapter();
    const giant = await adapter.toCombatantSpec(token(npc("Atk club +5 melee (1d8+3); AC 15; HD 4d10; SV Fort +5, Ref +1, Will +2; AL C.")));
    expect(giant.sizeUp).toMatchObject({ dc: 10 });
    const golem = await adapter.toCombatantSpec(token(npc("Atk fist +6 melee (2d6); SP construct traits; SV Fort +8, Ref -2, Will +0; AL N.")));
    expect(golem.sizeUp).toBeUndefined();
    expect(golem.social.mindless).toBe(true);
  });

  test("an ambush: a thief's Sneak Silently and Agility, a halfling's Sneak and Hide; anyone else, its initiative", async () => {
    expect(sneakOf(sheet(), archetype("thief"))).toBe(4);
    expect(sneakOf(sheet({ system: { skills: { sneakAndHide: { value: "+3" } } } }), archetype("halfling"))).toBe(4);
    expect(sneakOf(sheet(), archetype("warrior"))).toBeUndefined();
    expect(sneakOf(sheet({ system: { skills: { sneakSilently: { value: "" } } } }), archetype("thief"))).toBeUndefined();
    const thief = await new DccAdapter().toCombatantSpec(token(sheet()));
    expect(thief.initiative).toMatchObject({ mod: 1, stealth: 4 });
    const warrior = await new DccAdapter().toCombatantSpec(token(sheet({ system: { details: { level: { value: 1 }, alignment: "l", attackBonus: "+1", sheetClass: "Warrior", notes: { value: "" } }, class: { className: "Warrior" } } })));
    expect(warrior.initiative.stealth).toBeUndefined();
  });
});

describe("what the system's data says, and a name where it says nothing", () => {
  beforeEach(() => world());
  const npc = (notes, table = "M", items = []) => sheet({ type: "NPC", items, system: { details: { level: { value: 0 }, alignment: "n", notes: { value: notes } },
    attributes: { hp: { value: 10, max: 10 }, hitDice: { value: "2d8" }, speed: { value: "30'" }, init: { value: "+0" }, ac: { value: 12 }, critical: { table, die: "1d6" } } } });

  test("a weapon's harm: what its formula names, else what its name says (the language file's words), else untyped", async () => {
    const adapter = new DccAdapter();
    const [blunt, sharp] = ["bludgeoning", "slashing"].map(k => wordList(`Damage.${k}`)[0]);
    const weapon = (id, name, damage, extra = {}) => item(id, "weapon", { equipped: true, melee: true, damage, toHit: "+2", ...extra }, name);
    const armed = await adapter.toCombatantSpec(token(npc("SV Fort +1, Ref +1, Will +1; AL N.", "III", [
      weapon("blunt", `Great ${blunt}`, "1d6"), weapon("sharp", sharp, "1d8"), weapon("odd", "Thingamajig", "1d4"),
      // (Its formula's own kind wins over its name; one the system marks as subdual knocks out, and its harm is its name's.)
      weapon("fiery", sharp, "1d6[fire]"), weapon("sap", blunt, "1d4[subdual]", { subdual: true })
    ])));
    const by = id => armed.actions.find(a => a.itemId === id);
    expect(by("blunt").damage.map(p => p.type)).toEqual(["bludgeoning"]);
    expect(by("sharp").damage.map(p => p.type)).toEqual(["slashing"]);
    expect(by("odd").damage.map(p => p.type)).toEqual(["untyped"]);
    expect(by("fiery").damage.map(p => p.type)).toEqual(["fire"]);
    expect(by("sap")).toMatchObject({ subdual: true, damage: [{ type: "bludgeoning" }] });
    expect(dccRules.pullsBlow({}, by("blunt"))).toBe(true);
    expect(dccRules.pullsBlow({}, by("sharp"))).toBe(false);
    const beast = await adapter.toCombatantSpec(token(npc(`Atk ${plainWord("Damage.piercing")} +3 melee (1d6), wiggle +2 melee (1d4); SV Fort +1, Ref +1, Will +1; AL N.`)));
    expect(beast.actions.flatMap(a => a.damage.map(p => p.type))).toEqual(["piercing", "untyped"]);
  });

  test("a dwarf's shield bash: the system's name for it, in the reader's language, or its picture", () => {
    const words = game.i18n;
    game.i18n = { ...words, has: k => k === "DCC.ShieldBash" || words.has(k), localize: k => (k === "DCC.ShieldBash" ? "Schildstoß" : words.localize(k)) };
    globalThis.CONFIG.DCC.macroImages = { shieldBash: "systems/dcc/styles/images/game-icons-net/shield-bash.svg" };
    expect(isShieldBash({ name: " schildstoß " })).toBe(true);
    // (An untranslated book's: the system's English for it.)
    game.i18n._fallback = { DCC: { ShieldBash: "Shield Bash" } };
    expect(isShieldBash({ name: "Shield Bash" })).toBe(true);
    game.i18n._fallback = {};
    expect(isShieldBash({ name: "Shield Bash" })).toBe(false);
    expect(isShieldBash({ name: "Bonk", img: "systems/dcc/styles/images/game-icons-net/shield-bash.svg" })).toBe(true);
    expect(isShieldBash({ name: "Bonk", img: "icons/svg/shield.svg" })).toBe(false);
  });

  test("Common, with no languages listed: a creature the system files as one of the people (its crit table), not other monsters", async () => {
    globalThis.CONFIG.DCC.monsterCriticalHits = { 2: { humanoid: { table: "III" }, giant: { table: "G" }, undead: { table: "U" }, other: { table: "M" } } };
    const adapter = new DccAdapter();
    const line = "Atk club +2 melee (1d6); SV Fort +1, Ref +1, Will +1; AL N.";
    expect((await adapter.toCombatantSpec(token(npc(line, "III")))).social.languages).toEqual(["common"]);
    expect((await adapter.toCombatantSpec(token(npc(line, "G")))).social.languages).toEqual(["common"]);
    expect((await adapter.toCombatantSpec(token(npc(line, "M")))).social.languages).toEqual([]);
    expect((await adapter.toCombatantSpec(token(npc(line, "U")))).social.languages).toEqual([]);
    // (What its sheet lists, it speaks.)
    const listed = npc(line, "M");
    listed.system.details.languages = "Common, Goblin";
    expect((await adapter.toCombatantSpec(token(listed))).social.languages).toEqual(["common", "goblin"]);
    expect((await adapter.toCombatantSpec(token(listed))).social.anyLanguage).toBeUndefined();
    // (Telepathy, or every language: it talks with anyone who has a language, the core's anyLanguage.)
    listed.system.details.languages = "Demonic, telepathy";
    expect((await adapter.toCombatantSpec(token(listed))).social.anyLanguage).toBe(true);
    // Where the crit table says nothing of words, its name: one the language file says speaks, not a beast; with a
    // table the system doesn't file, any but a beast; never the mindless, whatever its table.
    const named = (name, table) => Object.assign(npc(line, table), { name });
    const speaks = async (name, table) => (await adapter.toCombatantSpec(token(named(name, table)))).social.languages.length > 0;
    const [talker, beast, mindless] = ["SpeaksCommon", "Beast", "Mindless"].map(k => wordList(k)[0]);
    expect(await speaks(`Old ${talker}`, "M")).toBe(true);
    expect(await speaks(`${talker} ${beast}`, "M")).toBe(false);
    expect(await speaks("Grimhold", "II")).toBe(true);
    expect(await speaks(`Dire ${beast}`, "II")).toBe(false);
    expect(await speaks(`${mindless} soldier`, "III")).toBe(false);
  });

  test("a beast or the mindless by name, where the stat line and crit table say nothing; one of the people is no beast", async () => {
    globalThis.CONFIG.DCC.monsterCriticalHits = { 2: { humanoid: { table: "III" }, other: { table: "M" } } };
    const adapter = new DccAdapter();
    const line = "Atk bite +2 melee (1d6); SV Fort +1, Ref +1, Will +1; AL N.";
    const flags = async (name, table) => (await adapter.toCombatantSpec(token(Object.assign(npc(line, table), { name })))).flags;
    const [beast, mindless] = ["Beast", "Mindless"].map(k => wordList(k)[0]);
    expect(await flags(`Dire ${beast}`, "M")).toMatchObject({ beast: true });
    expect((await flags(`${beast}-man`, "III")).beast).toBeUndefined();
    expect(await flags(`Rotting ${mindless}`, "III")).toMatchObject({ mindless: true, fearless: true });
    expect(await flags("Hoogabungaroo", "M")).toEqual({});
  });
});

describe("a weapon's crit range on its die", () => {
  test("strict crits scale it to the die's top; off, it keeps its number, capped at the die", async () => {
    const { critOnAt } = await import("../scripts/adapter.js");
    expect(critOnAt(19, 20, true)).toBe(19);
    expect(critOnAt(20, 24, true)).toBeUndefined();
    // (Off: crit 20 on a d24 is 20-24, the d20-relative 16 the rules scale back to 20; on a d16, its top.)
    expect(critOnAt(20, 24, false)).toBe(16);
    expect(dccRules.degreeOfSuccess(20, 30, 10, "attack", { faces: 24, critOn: critOnAt(20, 24, false) })).toBe(3);
    expect(dccRules.degreeOfSuccess(19, 30, 10, "attack", { faces: 24, critOn: critOnAt(20, 24, false) })).toBe(2);
    expect(critOnAt(20, 16, false)).toBeUndefined();
  });
});

describe("a birth augur for saves against traps", () => {
  test("Guardian angel: its Luck modifier on saves against traps; any other augur nothing", async () => {
    const { augurSaves } = await import("../scripts/adapter.js");
    const pc = (augur, mod) => ({ system: { details: { birthAugur: augur, birthAugurLuckMod: mod }, abilities: { lck: { mod: 1 } } } });
    expect(augurSaves(pc("Guardian angel (Savings throws to escape traps) (-3)", -3))).toEqual([{ bonus: -3, vs: ["trap"] }]);
    expect(augurSaves(pc("Guardian angel (Saving throws to escape traps)", undefined))).toEqual([{ bonus: 1, vs: ["trap"] }]);
    expect(augurSaves(pc("Fox's cunning (Find/disable traps) (+1)", 1))).toEqual([]);
  });
});
