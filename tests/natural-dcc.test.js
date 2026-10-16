/**
 * Natural attacks in DCC (a bite, claws, a slam): told by their names, the language file's words, where the system says
 * nothing else of them, and never one that was bought. They need no hand free (claws and fists their own), and there's
 * nothing in hand to knock away: a disarming deed goes only for a foe with a weapon, and a deed or a crit that would
 * disarm one with none does nothing. The characters and creatures here are made up for the tests; the field paths are
 * the dcc system's own.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { DccAdapter, naturalOf } from "../scripts/adapter.js";
import { dccRules } from "../scripts/rules.js";
import { deedsFrom, holdsWeapon, ARMED } from "../scripts/deeds.js";
import { wordList } from "../scripts/words.js";
import { parseFormula } from "../scripts/core.js";
import { needsHands } from "../../FastFighting/scripts/engine/behavior/holds.js";
import { beginRun, beginRound, prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import { chooseDeed } from "../../FastFighting/scripts/engine/behavior/riders.js";

/** A reader in another language, with Foundry's English to fall back on (game.i18n._fallback): the module's en.json. */
function withEnglish() {
  game.i18n._fallback = JSON.parse(readFileSync(new URL("../languages/en.json", import.meta.url), "utf8"));
  globalThis.foundry = { utils: { getProperty: (o, key) => key.split(".").reduce((x, k) => x?.[k], o) } };
}
/** A word of a list (plain letters): English's, at least. */
const plainWord = (key, not = []) => wordList(key).find(w => /^[a-z]+$/.test(w) && !not.includes(w));

/** A world with nothing installed but the system. */
function world() {
  globalThis.CONFIG = { DCC: {}, Item: { typeLabels: {} } };
  Object.assign(globalThis.game, {
    packs: Object.assign([], { get: () => undefined }), tables: [], actors: { filter: () => [] }, users: [],
    modules: { get: () => undefined }, settings: { get: () => { throw new Error("no such setting"); } }
  });
}

const weapon = (id, name, system = {}) => ({ id, name, type: "weapon", system: { equipped: true, melee: true, damage: "1d6", toHit: "+3", ...system } });
/** A creature's sheet: its stat line, and any weapons on it. */
function npc(notes, items = []) {
  const actor = {
    id: "n1", uuid: "Actor.n1", name: "Hoogabungaroo", img: "", type: "NPC", items, effects: [], statuses: new Set(), flags: {},
    getFlag: () => undefined, testUserPermission: () => true, getRollData: () => ({}),
    system: {
      abilities: Object.fromEntries(["str", "agl", "sta", "per", "int", "lck"].map(k => [k, { value: 10, mod: 0 }])),
      saves: { frt: { value: "+2" }, ref: { value: "+1" }, wil: { value: "+0" } },
      attributes: { hp: { value: 18, max: 18 }, hitDice: { value: "3d8" }, speed: { value: "40'" }, init: { value: "+1" }, ac: { value: 13 }, critical: { table: "M", die: "1d8" } },
      details: { level: { value: 0 }, alignment: "n", notes: { value: notes } },
      class: {}, skills: {}, currency: {}
    }
  };
  actor.itemTypes = { weapon: items, armor: [], spell: [] };
  return actor;
}
const token = actor => ({ id: "t1", name: actor.name, actor, texture: {} });

describe("a natural attack, by its name where the system says nothing else", () => {
  beforeEach(() => {
    world();
    withEnglish();
  });

  test("a bite needs no hand, claws their own; a weapon is no natural attack, nor one that was bought", () => {
    const hand = plainWord("NaturalHand");
    const body = plainWord("Natural", wordList("NaturalHand"));
    expect(naturalOf(`Savage ${body}`)).toEqual({ natural: true, hands: 0 });
    expect(naturalOf(`${hand} rake`)).toEqual({ natural: true, hands: 1 });
    expect(naturalOf("Thingamajig")).toEqual({});
    // (Paid for: a weapon, whatever it's called.)
    expect(naturalOf(`${body} of the deep`, 500)).toEqual({});
  });

  test("a creature's weapons and its stat line's attacks: a bite and claws natural, a spear in hand; it's armed only with the spear", async () => {
    const adapter = new DccAdapter();
    const [hand, body] = [plainWord("NaturalHand"), plainWord("Natural", wordList("NaturalHand"))];
    const beast = await adapter.toCombatantSpec(token(npc("SV Fort +2, Ref +1, Will +0; AL N.", [weapon("b", body), weapon("c", hand)])));
    expect(beast.actions.filter(a => a.kind === "strike").map(a => [a.itemId, a.natural, a.hands])).toEqual([["b", true, 0], ["c", true, 1]]);
    expect(beast.creatureTraits).not.toContain(ARMED);
    const orc = await adapter.toCombatantSpec(token(npc("SV Fort +2, Ref +1, Will +0; AL C.", [weapon("s", "Spear"), weapon("b", body)])));
    expect(orc.actions.find(a => a.itemId === "s").natural).toBeUndefined();
    expect(orc.creatureTraits).toContain(ARMED);
    // (A stat line with no weapons on the sheet: its attacks, told the same way.)
    const lined = await adapter.toCombatantSpec(token(npc(`Atk ${body} +4 melee (1d8) or ${hand} +2 melee (1d4); AC 13; SV Fort +2, Ref +1, Will +0; AL N.`)));
    expect(lined.actions.filter(a => a.kind === "strike").map(a => [a.natural, a.hands])).toEqual([[true, 0], [true, 1]]);
    expect(holdsWeapon(lined.actions)).toBe(false);
  });

  test("tied up, a bite still bites; claws and a sword need their hands", () => {
    const [hand, body] = [plainWord("NaturalHand"), plainWord("Natural", wordList("NaturalHand"))];
    const strike = (name, extra = {}) => ({ id: name, name, kind: "strike", melee: true, damage: [parseFormula("1d6")], ...naturalOf(name), ...extra });
    expect(needsHands(dccRules, strike(body))).toBe(false);
    expect(needsHands(dccRules, strike(hand))).toBe(true);
    expect(needsHands(dccRules, strike("Longsword"))).toBe(true);
  });
});

describe("nothing in hand to knock away", () => {
  const traits = { tactical: { base: 80, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 40, fudge: 0 }, loyal: { base: 60, fudge: 0 } };
  const blow = (id, extra = {}) => ({ id, name: id, kind: "strike", cost: 1, bonus: 3, melee: true, reach: 5, damage: [parseFormula("1d8", "slashing")], ...extra });
  const foe = (actions, creatureTraits = []) => ({ spec: { actions, creatureTraits, iwr: {} } });
  const disarming = { id: "deed:disarm:4", onSave: [{ conditions: { disarmed: 1 }, mods: { attack: -2 }, rounds: 1 }] };

  test("a deed or a crit that disarms does nothing to a creature with only claws and fangs; one with a weapon is disarmed", () => {
    expect(dccRules.isImmune(foe([blow("bite", { natural: true, hands: 0 }), blow("claw", { natural: true, hands: 1 })]), disarming)).toBe(true);
    expect(dccRules.isImmune(foe([blow("spear"), blow("bite", { natural: true })]), disarming)).toBe(false);
    // (Anything else it lays still lands.)
    expect(dccRules.isImmune(foe([blow("bite", { natural: true })]), { onSave: [{ conditions: { disarmed: 1, prone: 1 } }] })).toBe(false);
  });

  test("a warrior never declares a disarm at a creature with no weapon; it does at one with one", () => {
    const warrior = {
      id: "w", name: "Warrior", side: "friendly", kind: "pc", level: 6, hp: { value: 60, max: 60 }, hitDie: 12, defenses: { ac: 16, frt: 4, ref: 2, wil: 2 },
      initiative: { mod: 1 }, speeds: { walk: 30 }, actions: [blow("sword", { deedDie: 8 })], iwr: {}, traits, flags: {}, diesAtZero: false, actionDice: [20], resources: {},
      // (Only the disarm to choose from.)
      deeds: deedsFrom(null).filter(d => d.id === "disarm"), position: { x: 0, y: 0, size: 5 }
    };
    const beast = (id, actions, creatureTraits) => ({
      id, name: id, side: "hostile", kind: "npc", level: 3, hp: { value: 30, max: 30 }, hitDie: 8, defenses: { ac: 12, frt: 2, ref: 1, wil: 0 }, initiative: { mod: 0 },
      speeds: { walk: 30 }, actions, creatureTraits, iwr: {}, traits, flags: { fearless: true }, diesAtZero: true, actionDice: [20], position: { x: 5, y: 0, size: 5 }
    });
    const declared = target => {
      const spec = { combatants: [warrior, target], sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } }, options: { maxRounds: 2, positioning: true, aftermath: "none" } };
      const run = beginRun(prepareBattle(spec, dccRules), 1, { log: true });
      beginRound(run, 1);
      const u = run.byId.get("w");
      return chooseDeed(run, u, u.spec.actions[0], run.byId.get(target.id))?.id ?? null;
    };
    expect(declared(beast("bear", [blow("bite", { natural: true, bonus: 5 })], []))).toBe(null);
    expect(declared(beast("orc", [blow("axe", { bonus: 5 })], [ARMED]))).toBe("disarm");
  });
});

describe("a condition does in the rolls what it's weighed as", () => {
  const strike = (extra = {}) => ({ id: "s", kind: "strike", melee: true, reach: 5, damage: [parseFormula("1d8")], ...extra });
  const attack = (conds, action = strike()) => dccRules.modifiers.attack({ attacker: { conds }, target: { conds: {} }, action, distance: 5, positioning: false, alliesAdjacent: 0 }).bonus;

  test("disarmed, its weapon's blows are -4; its claws and fangs aren't", () => {
    expect(attack({ disarmed: 1 })).toBe(dccRules.conditionMods("disarmed").attack);
    expect(attack({ disarmed: 1 }, strike({ natural: true, hands: 1 }))).toBe(0);
  });

  test("blinded, frightened, slowed and hidden: to its attacks, its AC and its saves, as their bonuses and penalties say", () => {
    for ( const key of ["blinded", "frightened", "slowed", "hidden"] ) {
      const m = dccRules.conditionMods(key);
      expect([key, attack({ [key]: 1 })]).toEqual([key, m.attack ?? 0]);
      expect([key, dccRules.modifiers.defense({ target: { conds: { [key]: 1 } } })]).toEqual([key, m.ac ?? 0]);
      expect([key, dccRules.modifiers.save({ unit: { conds: { [key]: 1 } }, type: "wil" }).bonus]).toEqual([key, m.saves ?? 0]);
    }
    // (None, or gone: nothing.)
    expect(attack({ blinded: 0 })).toBe(0);
    expect(dccRules.modifiers.defense({ target: { conds: {} } })).toBe(0);
  });
});
