/**
 * DCC's maneuvers as the core plays them (its maneuvers.js): the Mighty Deeds that trip, blind, disarm and push back
 * ride a blow and name the core's maneuvers (a pushback the core's shove, chosen where a push does harm); a Grapple's
 * pin is the core's grip, held until broken; a fall is 1d6 for each 10 feet. The characters and creatures here are
 * made up for the tests; the field paths are the dcc system's own.
 */
import { describe, expect, test } from "vitest";
import { DccAdapter } from "../scripts/adapter.js";
import { dccRules } from "../scripts/rules.js";
import { deedsFrom } from "../scripts/deeds.js";
import { grappleAction } from "../scripts/moves.js";
import { parseFormula } from "../scripts/core.js";
import { MANEUVERS } from "../../FastFighting/scripts/engine/maneuvers.js";
import { MANEUVERS as STORY_MANEUVERS } from "../../FastFighting/scripts/story/master.js";
import { beginRun, beginRound, takeTurn, prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import { chooseDeed } from "../../FastFighting/scripts/engine/behavior/riders.js";
import { text } from "./foundry-i18n.js";

const traits = (tactical = 70) => ({ tactical: { base: tactical, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 40, fudge: 0 }, loyal: { base: 60, fudge: 0 } });
const at = (x, y = 0) => ({ position: { x, y, size: 5 } });
const sword = (extra = {}) => ({ id: "sword", name: "Longsword", kind: "strike", cost: 1, bonus: 4, melee: true, reach: 5, damage: [parseFormula("1d8", "slashing")], deedDie: 8, ...extra });

/** A 6th-level warrior: a longsword its d8 deed die rides, and the deeds. */
function warrior(extra = {}, blade = sword()) {
  return {
    id: "warrior", name: "Warrior", side: "friendly", kind: "pc", level: 6, hp: { value: 60, max: 60 }, hitDie: 12,
    defenses: { ac: 16, frt: 4, ref: 2, wil: 2 }, initiative: { mod: 1 }, speeds: { walk: 30 }, actions: [blade],
    deeds: deedsFrom(null), iwr: {}, traits: traits(), flags: {}, diesAtZero: false, actionDice: [20], resources: {}, ...at(0), ...extra
  };
}
function orc(x = 5, extra = {}) {
  return {
    id: "orc", name: "Orc", side: "hostile", kind: "npc", level: 2, hp: { value: 30, max: 30 }, hitDie: 8, defenses: { ac: 12, frt: 2, ref: 1, wil: 0 },
    initiative: { mod: 0 }, speeds: { walk: 30 }, actions: [sword({ id: "club", name: "Club", bonus: -20, deedDie: undefined, damage: [parseFormula("1d4", "bludgeoning")] })],
    iwr: {}, traits: traits(40), flags: { fearless: true }, diesAtZero: true, actionDice: [20], grapple: 0, ...at(x), ...extra
  };
}

/** A fight on a map, with the ground as given (cells: [[i, j, cell]]), at its first round. */
function fight(list, ground = null, seed = 1) {
  const spec = { combatants: list, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } }, options: { maxRounds: 4, positioning: true, aftermath: "none" } };
  if ( ground ) spec.ground = { size: 5, cells: ground };
  const run = beginRun(prepareBattle(spec, dccRules), seed, { log: true });
  beginRound(run, 1);
  for ( const u of run.units ) u.active = true;
  return run;
}
/** A ledge behind the orc: the ground falls away 20 feet from x = 10 on. */
const ledge = () => Array.from({ length: 6 }, (_, k) => [2 + k, 0, { g: -20 }]);

describe("the deeds that ride a blow, as the core's maneuvers", () => {
  test("each names its maneuver, one the story tells; trips lay it down, blinding attacks dazzle then blind, disarms disarm", () => {
    const deeds = Object.fromEntries(deedsFrom(null).map(d => [d.id, d]));
    expect(Object.fromEntries(Object.values(deeds).map(d => [d.id, d.maneuver]))).toEqual({ trip: "trip", blind: "blindFoe", disarm: "disarm", push: "shove", defend: "defend", rally: "rally" });
    for ( const d of Object.values(deeds) ) expect(STORY_MANEUVERS).toContain(d.maneuver);
    // (As the core's own do, by the deed die: from a 3, more the higher it shows.)
    expect(deeds.trip.tiers.map(x => [x.min, x.outcome.conditions])).toEqual([[3, MANEUVERS.trip.success.conditions], [5, MANEUVERS.trip.crit.conditions]]);
    expect(deeds.blind.tiers.map(x => [x.min, !!x.outcome.conditions?.blinded])).toEqual([[3, false], [5, true], [7, true]]);
    expect(deeds.blind.tiers[0].outcome.mods).toEqual({ attack: -2 });
    expect(deeds.disarm.tiers.every(x => x.outcome.conditions.disarmed === MANEUVERS.disarm.success.conditions.disarmed)).toBe(true);
    // (A book's rows keep the maneuver too.)
    const read = deedsFrom({ trip: [{ range: [3, 4], text: "The foe falls prone." }] }).find(d => d.id === "trip");
    expect(read).toMatchObject({ maneuver: "trip", tiers: [{ min: 3, outcome: { conditions: { prone: 1 } } }] });
  });
});

describe("a pushback: a deed that rides the blow, the core's shove", () => {
  test("pushed back 5 feet from a 3, 10 from a 5 (as the core's shove, and its crit); in melee only; leaning on nothing; a book's rows don't replace it", () => {
    const push = deedsFrom(null).find(d => d.id === "push");
    expect(push).toMatchObject({ maneuver: "shove", label: text("FFDCC.Deed.Pushback"), melee: true });
    expect(push.leans).toBeUndefined();
    const pushed = feet => ({ move: { kind: "push", feet }, label: text("FFDCC.Deed.PushedBack") });
    expect(push.tiers).toEqual([{ min: 3, outcome: pushed(5) }, { min: 5, outcome: pushed(10) }]);
    expect(push.tiers.map(x => x.outcome.move)).toEqual([MANEUVERS.shove.success.move, MANEUVERS.shove.crit.move]);
    // (A book's pushback rows measure by the warrior's movement and the foe's size: the built-in tiers stand.)
    const read = deedsFrom({ push: [{ range: [3, 7], text: "The foe falls prone." }] }).find(d => d.id === "push");
    expect(read.tiers).toEqual(push.tiers);
  });

  test("a warrior's sheet: the pushback among its deeds, no attack of its own", async () => {
    globalThis.CONFIG = { DCC: {}, Item: { typeLabels: {} } };
    Object.assign(globalThis.game, { packs: Object.assign([], { get: () => undefined }), tables: [], actors: { filter: () => [] }, users: [], modules: { get: () => undefined },
      settings: { get: () => { throw new Error("no such setting"); } } });
    const weapon = (id, name, system) => ({ id, name, type: "weapon", system: { equipped: true, damage: "1d8", toHit: "+d4+1", ...system } });
    const items = [weapon("blade", "Longsword", { melee: true }), weapon("bow", "Shortbow", { melee: false, range: "50/100/150", damage: "1d6" })];
    const actor = {
      id: "a1", uuid: "Actor.a1", name: "Brakka", img: "", type: "Player", items, effects: [], statuses: new Set(), flags: {},
      getFlag: () => undefined, testUserPermission: () => true, getRollData: () => ({}),
      system: {
        abilities: Object.fromEntries(["str", "agl", "sta", "per", "int", "lck"].map(k => [k, { value: 10, mod: k === "str" ? 1 : 0 }])),
        saves: { frt: { value: "+1" }, ref: { value: "+1" }, wil: { value: "+0" } },
        attributes: { hp: { value: 14, max: 14 }, hitDice: { value: "2d12" }, speed: { value: "30'" }, init: { value: "+2" }, ac: { value: 15 } },
        details: { level: { value: 2 }, alignment: "l", attackBonus: "+d4", sheetClass: "Warrior", notes: { value: "" }, occupation: { value: "" } },
        class: { className: "Warrior" }, skills: {}, currency: {}
      }
    };
    actor.itemTypes = { weapon: items, armor: [], spell: [] };
    const spec = await new DccAdapter().toCombatantSpec({ id: "t1", name: actor.name, actor, texture: {} });
    expect(spec.actions.filter(a => a.maneuver === "shove")).toEqual([]);
    expect(spec.actions.filter(a => a.kind === "strike").map(a => a.deedDie)).toEqual([4, 4]);
    expect(spec.deeds.map(d => d.maneuver)).toEqual(expect.arrayContaining(["trip", "shove"]));
  });
});

describe("a pushback by a ledge, in a fight", () => {
  test("the deed the warrior declares: a pushback by the drop (the fall it would take weighed), a trip or a blinding on flat ground", () => {
    for ( const [ground, wanted] of [[ledge(), ["push"]], [null, ["trip", "blind"]]] ) {
      const run = fight([warrior(), orc(5)], ground);
      const u = run.byId.get("warrior");
      expect(wanted).toContain(chooseDeed(run, u, u.spec.actions[0], run.byId.get("orc"))?.id);
    }
  });

  test("pushed over: the deed, the push, then a fall of 20 feet (2d6); it lands prone", () => {
    let pushed = 0;
    for ( let seed = 1; seed <= 12; seed++ ) {
      const run = fight([warrior(), orc(5)], ledge(), seed);
      const o = run.byId.get("orc");
      takeTurn(run, run.byId.get("warrior"));
      const deeds = run.log.filter(e => e.type === "deed" && e.actorId === "warrior");
      // (Told whether the blow lands or not; on a hit, as the core's maneuver.)
      const hit = run.log.find(e => e.type === "attack" && e.actorId === "warrior").degree >= 2;
      expect(deeds.length).toBe(1);
      expect(deeds[0].deed).toBe(text("FFDCC.Deed.Pushback"));
      if ( hit ) expect(deeds[0].maneuver).toBe("shove");
      const at = type => run.log.findIndex(e => e.type === type && (e.targetId === "orc" || e.actorId === "orc") && (type !== "deed" || e.success));
      if ( !deeds.some(e => e.success) ) {
        expect(at("forced")).toBe(-1);
        continue;
      }
      pushed += 1;
      expect(deeds.find(e => e.success)).toMatchObject({ effect: text("FFDCC.Deed.PushedBack") });
      expect(deeds.find(e => e.success).roll).toBeGreaterThanOrEqual(3);
      expect(at("deed")).toBeLessThan(at("forced"));
      expect(at("forced")).toBeLessThan(at("fall"));
      expect(run.log[at("forced")]).toMatchObject({ how: "push", feet: 5, fall: 20 });
      const fell = run.log[at("fall")];
      expect(fell).toMatchObject({ actorId: "orc", feet: 20 });
      expect(fell.amount).toBeGreaterThanOrEqual(2);
      expect(fell.amount).toBeLessThanOrEqual(12);
      expect(o.prone).toBe(true);
    }
    expect(pushed).toBeGreaterThan(3);
  });

  test("on flat ground the warrior trips or blinds, its deed die riding the blow; no one is pushed", () => {
    for ( let seed = 1; seed <= 6; seed++ ) {
      const run = fight([warrior(), orc(5)], null, seed);
      takeTurn(run, run.byId.get("warrior"));
      expect(run.log.some(e => e.type === "attack" && e.actorId === "warrior" && e.deed !== null)).toBe(true);
      const deeds = run.log.filter(e => e.type === "deed");
      const hit = run.log.find(e => e.type === "attack" && e.actorId === "warrior").degree >= 2;
      expect(deeds.length).toBe(1);
      expect([text("FFDCC.Deed.Trip"), text("FFDCC.Deed.Blind")]).toContain(deeds[0].deed);
      if ( hit ) expect(["trip", "blindFoe"]).toContain(deeds[0].maneuver);
      expect(run.log.some(e => e.type === "forced")).toBe(false);
    }
  });
});

describe("a Grapple: the core's grip", () => {
  test("won, the foe is held by the grappler (no crit to grip harder, no botch); in a fight, it's in the grip", () => {
    const g = grappleAction("g", 3);
    expect(g).toMatchObject({ kind: "control", maneuver: "grapple", check: { mod: 3, against: "grapple" } });
    expect(g.onHit).toEqual([null, null, { grab: true, label: text("FFDCC.Pinned") }, { grab: true, label: text("FFDCC.Pinned") }]);
    let held = 0;
    for ( let seed = 1; seed <= 4; seed++ ) {
      const run = fight([warrior({ actions: [grappleAction("warrior", 30)] }), orc(5)], null, seed);
      takeTurn(run, run.byId.get("warrior"));
      const control = run.log.find(e => e.type === "control" && e.actorId === "warrior");
      if ( control?.degree >= 2 ) {
        held += 1;
        expect(run.byId.get("orc").grabbedBy).toBe("warrior");
      }
    }
    expect(held).toBeGreaterThan(0);
  });
});

describe("a fall, the DCC way", () => {
  test("1d6 for each 10 feet, however far; nothing short of 10", () => {
    expect(dccRules.fallDamage(5)).toEqual([]);
    expect(dccRules.fallDamage(10)).toEqual([parseFormula("1d6", "bludgeoning")]);
    expect(dccRules.fallDamage(25)).toEqual([parseFormula("2d6", "bludgeoning")]);
    // (Not the core's 20d6 at most.)
    expect(dccRules.fallDamage(300)).toEqual([parseFormula("30d6", "bludgeoning")]);
  });
});
