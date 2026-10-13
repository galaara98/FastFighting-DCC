/**
 * What a dcc sheet gives the core, where fairness is at stake: Fleeting Luck and Mojo counted within reason (a player
 * owns the flag that holds them), what a character could hand over in a fight (the weapons and shield in its hands,
 * not the armor it wears), sizing a foe up (not for the mindless), and creeping up for an ambush (a thief's Sneak
 * Silently); and what the system's data says where a name would only guess: a weapon's harm, a dwarf's shield bash, who
 * speaks Common. The characters and creatures here are made up for the tests; the field paths are the dcc system's own.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { DccAdapter, fleetingPoints, isShield, isShieldBash, sneakOf, valuablesOf } from "../scripts/adapter.js";
import { archetype } from "../scripts/classes.js";

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

  test("the weapons and shield in its hands, what it carries; never the armor it wears", () => {
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
    expect(v.wielded.find(i => i.id === "round")).toEqual({ id: "round", name: "Round thing", value: 1000, category: "armor" });
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

describe("what the system's data says, not a name", () => {
  beforeEach(() => world());
  const npc = (notes, table = "M", items = []) => sheet({ type: "NPC", items, system: { details: { level: { value: 0 }, alignment: "n", notes: { value: notes } },
    attributes: { hp: { value: 10, max: 10 }, hitDice: { value: "2d8" }, speed: { value: "30'" }, init: { value: "+0" }, ac: { value: 12 }, critical: { table, die: "1d6" } } } });

  test("a weapon's harm is untyped, whatever it's called; one the system marks as subdual knocks out", async () => {
    const adapter = new DccAdapter();
    const mace = item("mace", "weapon", { equipped: true, melee: true, damage: "1d6", toHit: "+2" }, "Mace");
    const sap = item("sap", "weapon", { equipped: true, melee: true, damage: "1d4[subdual]", toHit: "+2", subdual: true }, "Sap");
    const armed = await adapter.toCombatantSpec(token(npc("SV Fort +1, Ref +1, Will +1; AL N.", "III", [mace, sap])));
    const by = id => armed.actions.find(a => a.itemId === id);
    expect(by("mace").damage.map(p => p.type)).toEqual(["untyped"]);
    expect(by("sap")).toMatchObject({ subdual: true, damage: [{ type: "untyped" }] });
    const beast = await adapter.toCombatantSpec(token(npc("Atk bite +3 melee (1d6), claw +2 melee (1d4); SV Fort +1, Ref +1, Will +1; AL N.")));
    expect(beast.actions.flatMap(a => a.damage.map(p => p.type))).toEqual(["untyped", "untyped"]);
  });

  test("a dwarf's shield bash: the system's name for it, in the reader's language, or its picture", () => {
    const words = game.i18n;
    game.i18n = { ...words, has: k => k === "DCC.ShieldBash" || words.has(k), localize: k => (k === "DCC.ShieldBash" ? "Schildstoß" : words.localize(k)) };
    globalThis.CONFIG.DCC.macroImages = { shieldBash: "systems/dcc/styles/images/game-icons-net/shield-bash.svg" };
    expect(isShieldBash({ name: " schildstoß " })).toBe(true);
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
  });
});
