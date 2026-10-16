/**
 * Breaking free in DCC (the core's holds.js): each creature's way out, the grapple roll on its action die; how hard its
 * own grip is to break; the statuses an action breaks (Restrained, XCC's Grappled) and bonds tied with whatever was to
 * hand, a hard check; what a status brought going with it; and the world's word on spells while tied up. The characters
 * and creatures here are made up for the tests; the field paths are the dcc system's own.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DccAdapter } from "../scripts/adapter.js";
import { dccRules, sizeEdge } from "../scripts/rules.js";
import { leftBehind } from "../scripts/commit.js";
import { registerTiedStopsSpells } from "../scripts/tied.js";
import { parseFormula } from "../scripts/core.js";
import { beginRun, beginRound, takeTurn, prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import { holdsOf, tryHold, freeable, escapeCost, untieCost } from "../../FastFighting/scripts/engine/behavior/holds.js";
import { text } from "./foundry-i18n.js";

/** A dcc actor, as far as the adapter reads one. */
function sheet({ type = "Player", system = {} } = {}) {
  const actor = {
    id: "a1", uuid: "Actor.a1", name: "Wenna", img: "", type, items: [], effects: [], statuses: new Set(), flags: {},
    getFlag: () => undefined, testUserPermission: () => true, getRollData: () => ({}),
    system: {
      abilities: Object.fromEntries(["str", "agl", "sta", "per", "int", "lck"].map(k => [k, { value: 10, mod: { str: 2, agl: 1 }[k] ?? 0 }])),
      saves: { frt: { value: "+1" }, ref: { value: "+1" }, wil: { value: "+1" } },
      attributes: { hp: { value: 8, max: 8 }, hitDice: { value: "1d8" }, speed: { value: "30'" }, init: { value: "+1" }, ac: { value: 12 } },
      details: { level: { value: 1 }, alignment: "l", attackBonus: "+1", sheetClass: "Cleric", notes: { value: "" }, occupation: { value: "" } },
      class: { className: "Cleric" },
      skills: {},
      currency: {},
      ...system
    }
  };
  actor.itemTypes = { weapon: [], armor: [], spell: [] };
  return actor;
}
const token = actor => ({ id: "t1", name: actor.name, actor, texture: {} });
/** A creature's sheet: its stat line, its Hit Dice and action dice. */
const npc = (notes, { hitDice = "3d8", actionDice = "1d20" } = {}) => sheet({ type: "NPC", system: {
  details: { level: { value: 0 }, alignment: "c", notes: { value: notes } },
  attributes: { hp: { value: 15, max: 15 }, hitDice: { value: hitDice }, speed: { value: "30'" }, init: { value: "+0" }, ac: { value: 13 }, actionDice: { value: actionDice } }
} });

/** A world with nothing installed but the system. */
function world() {
  globalThis.CONFIG = { DCC: {}, Item: { typeLabels: {} } };
  Object.assign(globalThis.game, {
    packs: Object.assign([], { get: () => undefined }),
    tables: [],
    actors: { filter: () => [] },
    users: [],
    modules: { get: () => undefined },
    settings: { get: () => { throw new Error("no such setting"); } }
  });
}

describe("a creature's way out, and how hard its own grip is to break", () => {
  beforeEach(() => world());

  test("a character's: its grapple (attack bonus and the better of Strength and Agility), on its action die; its grip, 10 + that", async () => {
    const pc = await new DccAdapter().toCombatantSpec(token(sheet()));
    expect(pc.grapple).toBe(3);
    expect(pc.escapeWork).toEqual({ mod: 3, faces: undefined });
    expect(pc.escapeDC).toBe(13);
    // (The same roll its own Grapple makes, and the same DC one at it rolls against.)
    expect(pc.actions.find(a => a.id.endsWith(".grapple")).check.mod).toBe(pc.escapeWork.mod);
    expect(dccRules.defenseDc({ spec: pc }, "grapple")).toBe(pc.escapeDC);
  });

  test("a monster's: its best melee attack and its Hit Dice in place of abilities; a giant's d24", async () => {
    const adapter = new DccAdapter();
    const ghoul = await adapter.toCombatantSpec(token(npc("Atk claw +3 melee (1d6) or bite +1 melee (1d4); SV Fort +2, Ref +1, Will +1; AL C.")));
    expect(ghoul.escapeWork).toEqual({ mod: 6, faces: undefined });
    expect(ghoul.escapeDC).toBe(16);
    const giant = await adapter.toCombatantSpec(token(npc("Atk club +8 melee (2d8); SV Fort +8, Ref +2, Will +4; AL C.", { hitDice: "8d10", actionDice: "1d24" })));
    expect(giant.escapeWork).toEqual({ mod: 16, faces: 24 });
    expect(giant.escapeDC).toBe(26);
  });
});

describe("what holds one, by DCC's rules", () => {
  test("Restrained (held) and Grappled (XCC's: grabbed) an action breaks, a hard check; a friend can tear one free of Restrained", () => {
    expect(dccRules.escapeFrom(null, null, "held")).toEqual({ dc: 15, others: "check" });
    expect(dccRules.escapeFrom(null, null, "grabbed")).toEqual({ dc: 15, others: null });
    for ( const key of ["immobilized", "paralyzed", "asleep", "stunned", "prone"] ) expect([key, dccRules.escapeFrom(null, null, key)]).toEqual([key, null]);
    // (Each its own: changing one changes nothing for the next.)
    dccRules.escapeFrom(null, null, "held").dc = 99;
    expect(dccRules.escapeFrom(null, null, "held").dc).toBe(15);
  });

  test("bonds tied with whatever was to hand: the same hard check", () => {
    expect(dccRules.bondsDC({ spec: { level: 0 } })).toBe(15);
    expect(dccRules.bondsDC({ spec: { level: 9 } })).toBe(15);
  });

  test("the core's plain check is DCC's: a natural 1 fails, a natural 20 (or a d24's top) succeeds; a try is an action", () => {
    // (Its own try only where size tells: between two of a size, the core's.)
    const one = id => ({ id, spec: { position: { size: 5 }, escapeWork: { mod: 2 } } });
    const run = { byId: new Map([["g", one("g")]]) };
    expect(dccRules.breakFree(run, one("h"), { key: "grabbed", byId: "g", dc: 14 }, {})).toBeNull();
    expect(dccRules.breakFree(run, one("h"), { key: "held", dc: 15 }, {})).toBeNull();
    expect(dccRules.degreeOfSuccess(1, 99, 15, "check")).toBe(1);
    expect(dccRules.degreeOfSuccess(20, 5, 99, "check")).toBe(2);
    expect(dccRules.degreeOfSuccess(24, 5, 99, "check", { faces: 24 })).toBe(2);
    expect(dccRules.degreeOfSuccess(16, 5, 99, "check", { faces: 16 })).toBe(1);
    expect(escapeCost(dccRules, {}, { key: "held" })).toEqual({ action: 1 });
    expect(untieCost(dccRules, {}, {}, { key: "bound" })).toEqual({ action: 1 });
  });
});

describe("what a status brought goes with it", () => {
  test("immobilized and incapacitated stay while a status that brings them is on (the sheet's, or an effect's), and only then", () => {
    expect(leftBehind({ held: 1, immobilized: 1 }, { held: 1, immobilized: 1 })).toEqual([]);
    expect(leftBehind({ immobilized: 1 }, { immobilized: 1 })).toEqual(["immobilized"]);
    // (Restrained in a live battle: the engine's own hold answers for the sheet's held.)
    expect(leftBehind({ immobilized: 1 }, { held: 1, immobilized: 1 })).toEqual([]);
    expect(leftBehind({ grabbed: 1, immobilized: 1 }, { grabbed: 1, immobilized: 1 })).toEqual([]);
    expect(leftBehind({ incapacitated: 1 }, { asleep: 1, incapacitated: 1 })).toEqual([]);
    expect(leftBehind({ incapacitated: 1, stunned: 1 }, { incapacitated: 1, stunned: 1 })).toEqual(["incapacitated"]);
    expect(leftBehind(null, null)).toEqual([]);
  });

  test("at the start of its turn: gone, unless an effect of its own still says so (a pin)", () => {
    const unit = effects => ({ spec: {}, baseConds: { immobilized: 1 }, conds: { immobilized: 1 }, effects });
    const free = unit([]);
    dccRules.startTurn({ round: 2 }, free);
    expect([free.baseConds, free.conds.immobilized ?? 0]).toEqual([{}, 0]);
    const pinned = unit([{ key: "pin", conditions: { immobilized: 1 }, rounds: 1 }]);
    dccRules.startTurn({ round: 2 }, pinned);
    expect([pinned.baseConds, pinned.conds.immobilized, pinned.effects.length]).toEqual([{}, 1, 1]);
  });
});

describe("breaking free, in a fight", () => {
  let n = 0;
  const traits = () => ({ tactical: { base: 60, fudge: 0 }, brave: { base: 95, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 75, fudge: 0 } });
  const fighter = (id, side, x, extra = {}) => ({
    id, name: id, side, kind: side === "friendly" ? "pc" : "npc", level: 1, hp: { value: 300, max: 300 }, hitDie: 8,
    defenses: { ac: 14, frt: 1, ref: 1, wil: 1 }, initiative: { mod: 0 }, speeds: { walk: 30 }, iwr: {}, traits: traits(), flags: { fearless: true },
    diesAtZero: false, actionDice: [20], position: { x, y: 0, size: 5 },
    actions: [{ id: `blade${++n}`, name: "Longsword", kind: "strike", cost: 1, bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d8", "slashing")] }],
    ...extra
  });
  function fight(list, seed = 3) {
    const spec = { combatants: list, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } }, options: { positioning: true, maxRounds: 6 } };
    const run = beginRun(prepareBattle(spec, dccRules), seed, { log: true });
    beginRound(run, 1);
    return run;
  }

  test("Restrained on its sheet: it breaks free with an action, and from its next turn it can move again", () => {
    const run = fight([fighter("hero", "friendly", 0, { escapeWork: { mod: 60 }, conditions: { held: 1, immobilized: 1 } }), fighter("orc", "hostile", 150)]);
    const hero = run.byId.get("hero");
    expect(holdsOf(run, hero)).toEqual([expect.objectContaining({ key: "held", dc: 15, others: "check", sheet: true })]);
    takeTurn(run, hero);
    expect(run.log.find(e => e.actorId === "hero" && e.type === "escape")).toMatchObject({ hold: "held", success: true, dc: 15 });
    expect(hero.baseConds.held).toBeUndefined();
    beginRound(run, 2);
    takeTurn(run, hero);
    expect(hero.conds.immobilized ?? 0).toBe(0);
    expect(run.log.some(e => e.round === 2 && e.actorId === "hero" && e.type === "move")).toBe(true);
  });

  test("a friend tears one free of Restrained with its own roll; XCC's Grappled is someone's grip, only its own to break", () => {
    const run = fight([fighter("hero", "friendly", 0, { escapeWork: { mod: 60 } }), fighter("kyra", "friendly", 5, { conditions: { held: 1, immobilized: 1 } }),
      fighter("vex", "friendly", 10, { conditions: { grabbed: 1, immobilized: 1 } }), fighter("orc", "hostile", 150)]);
    const hold = freeable(run, run.byId.get("kyra"));
    expect(hold).toMatchObject({ key: "held", others: "check" });
    expect(tryHold(run, run.byId.get("hero"), hold, { freeing: true })).toMatchObject({ success: true, dc: 15 });
    expect(holdsOf(run, run.byId.get("vex"))).toEqual([expect.objectContaining({ key: "grabbed", dc: 15, others: null })]);
    expect(freeable(run, run.byId.get("vex"))).toBeNull();
  });

  test("a monster's grip is as hard to break as its escapeDC; bonds, 15", () => {
    const run = fight([fighter("hero", "friendly", 0, { escapeWork: { mod: 1 } }), fighter("ghoul", "hostile", 5, { escapeDC: 16 })]);
    const hero = run.byId.get("hero");
    hero.grabbedBy = "ghoul";
    expect(holdsOf(run, hero)).toEqual([expect.objectContaining({ key: "grabbed", byId: "ghoul", dc: 16 })]);
    Object.assign(hero, { grabbedBy: null, bound: true, boundBy: "ghoul", status: "bound" });
    expect(holdsOf(run, hero)).toEqual([expect.objectContaining({ key: "bound", dc: 15, others: "untie" })]);
  });
});

describe("tied up stops spells: the world's setting", () => {
  afterEach(() => { delete game.settings; });

  test("on by default, and as the world has it", () => {
    expect(dccRules.tiedStopsSpells).toBe(true); // (no settings to read)
    game.settings = { get: (scope, key) => (scope === "fast-fighting-dcc" && key === "tiedStopsSpells" ? false : undefined) };
    expect(dccRules.tiedStopsSpells).toBe(false);
    expect(new DccAdapter().rules.tiedStopsSpells).toBe(false);
    game.settings = { get: () => true };
    expect(dccRules.tiedStopsSpells).toBe(true);
    game.settings = { get: () => { throw new Error("not registered"); } };
    expect(dccRules.tiedStopsSpells).toBe(true);
  });

  test("a world setting, on, with its words in the language file", () => {
    const registered = [];
    game.settings = { register: (...args) => registered.push(args) };
    registerTiedStopsSpells();
    const [[scope, key, setting]] = registered;
    expect([scope, key]).toEqual(["fast-fighting-dcc", "tiedStopsSpells"]);
    expect(setting).toMatchObject({ scope: "world", config: true, type: Boolean, default: true });
    expect(text(setting.name)).toBeTruthy();
    expect(text(setting.hint)).toBeTruthy();
  });
});

describe("grappling by size", () => {
  const at = size => ({ spec: { position: { x: 0, y: 0, size }, grapple: 3, escapeWork: { mod: 3 } } });

  test("twice the other's size, +4; three times, +8; four times, +16; and on, doubling; the tokens' sizes, when known", () => {
    expect([10, 15, 20, 25].map(s => sizeEdge(at(s), at(5)))).toEqual([4, 8, 16, 32]);
    expect(sizeEdge(at(5), at(5))).toBe(0);
    expect(sizeEdge(at(7.5), at(5))).toBe(0);
    expect(sizeEdge(at(5), at(10))).toBe(0);
    expect(sizeEdge({ spec: {} }, at(5))).toBe(0);
    expect(sizeEdge(at(10), null)).toBe(0);
  });

  test("a grapple's DC: the bigger one's edge, when the core says who grapples; without, as ever", () => {
    expect(dccRules.defenseDc(at(5), "grapple")).toBe(13);
    expect(dccRules.defenseDc(at(5), "grapple", at(10))).toBe(9);
    expect(dccRules.defenseDc(at(15), "grapple", at(5))).toBe(21);
    expect(dccRules.defenseDc(at(5), "will", at(10))).toBeNull();
  });

  test("breaking a giant's grip: the grapple roll with the giant's edge against it, on its own die; a halfling's grip, the other way", () => {
    const traits = () => ({ tactical: { base: 60, fudge: 0 }, brave: { base: 95, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 75, fudge: 0 } });
    const one = (id, side, x, size, extra = {}) => ({
      id, name: id, side, kind: side === "friendly" ? "pc" : "npc", level: 1, hp: { value: 30, max: 30 }, hitDie: 8, defenses: { ac: 14, frt: 1, ref: 1, wil: 1 },
      initiative: { mod: 0 }, speeds: { walk: 30 }, iwr: {}, traits: traits(), flags: { fearless: true }, diesAtZero: false, actionDice: [20], position: { x, y: 0, size },
      actions: [{ id: `${id}-blade`, name: "Longsword", kind: "strike", cost: 1, bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d8", "slashing")] }], ...extra
    });
    const spec = list => ({ combatants: list, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } }, options: { positioning: true, maxRounds: 2 } });
    const run = beginRun(prepareBattle(spec([one("hero", "friendly", 0, 5, { escapeWork: { mod: 4, faces: 16 } }), one("giant", "hostile", 15, 15, { escapeDC: 20 })]), dccRules), 2, { log: true });
    beginRound(run, 1);
    const hero = run.byId.get("hero");
    hero.grabbedBy = "giant";
    const [hold] = holdsOf(run, hero);
    const tried = tryHold(run, hero, hold);
    expect(tried).toMatchObject({ mod: 4 - 8, dc: 20 });
    expect(tried.natural).toBeLessThanOrEqual(16);
    // (Held by a smaller one: its own edge.)
    const giant = run.byId.get("giant");
    giant.spec.escapeWork = { mod: 4 };
    giant.grabbedBy = "hero";
    hero.spec.escapeDC = 12;
    expect(tryHold(run, giant, holdsOf(run, giant)[0])).toMatchObject({ mod: 12, dc: 12 });
  });
});
