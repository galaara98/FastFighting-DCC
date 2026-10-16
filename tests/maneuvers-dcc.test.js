/**
 * DCC's maneuvers as the core plays them (its maneuvers.js): the Mighty Deeds that trip, blind and disarm ride a blow
 * and name the core's maneuvers; a pushback is an attack of its own, the core's shove, the deed die folded into its
 * roll; a Grapple's pin is the core's grip, held until broken; a fall is 1d6 for each 10 feet. The characters and
 * creatures here are made up for the tests; the field paths are the dcc system's own.
 */
import { describe, expect, test } from "vitest";
import { DccAdapter } from "../scripts/adapter.js";
import { dccRules } from "../scripts/rules.js";
import { deedsFrom, pushbackAction } from "../scripts/deeds.js";
import { grappleAction } from "../scripts/moves.js";
import { parseFormula, degreeDistribution } from "../scripts/core.js";
import { MANEUVERS } from "../../FastFighting/scripts/engine/maneuvers.js";
import { MANEUVERS as STORY_MANEUVERS } from "../../FastFighting/scripts/story/master.js";
import { beginRun, beginRound, takeTurn, prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import { text } from "./foundry-i18n.js";

const traits = (tactical = 70) => ({ tactical: { base: tactical, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 40, fudge: 0 }, loyal: { base: 60, fudge: 0 } });
const at = (x, y = 0) => ({ position: { x, y, size: 5 } });
const sword = (extra = {}) => ({ id: "sword", name: "Longsword", kind: "strike", cost: 1, bonus: 4, melee: true, reach: 5, damage: [parseFormula("1d8", "slashing")], deedDie: 8, ...extra });

/** A 6th-level warrior: a longsword its d8 deed die rides, the deeds, and a pushback with the sword. */
function warrior(extra = {}, blade = sword()) {
  return {
    id: "warrior", name: "Warrior", side: "friendly", kind: "pc", level: 6, hp: { value: 60, max: 60 }, hitDie: 12,
    defenses: { ac: 16, frt: 4, ref: 2, wil: 2 }, initiative: { mod: 1 }, speeds: { walk: 30 }, actions: [blade, pushbackAction(blade)],
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
    expect(Object.fromEntries(Object.values(deeds).map(d => [d.id, d.maneuver]))).toEqual({ trip: "trip", blind: "blindFoe", disarm: "disarm", defend: "defend", rally: "rally" });
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

describe("a pushback: an attack of its own, the core's shove", () => {
  test("the deed die folded into the roll; the weapon's damage; 5 feet, 10 from a d7 up; no pushback without a deed die, or at range", () => {
    const d3 = pushbackAction(sword({ bonus: 1, deedDie: 3 }));
    expect(d3).toMatchObject({ id: "sword.pushback", kind: "control", maneuver: "shove", melee: true, reach: 5, name: text("FFDCC.Deed.Pushback", { weapon: "Longsword" }) });
    // (A d3: +3 when it works, less 20 / 3 for the two times in three it doesn't.)
    expect(d3.bonus).toBe(1 + Math.round(3 - 20 / 3));
    expect(d3.onHit).toEqual([null, null, { move: { kind: "push", feet: 5 }, label: text("FFDCC.Deed.PushedBack") }, { move: { kind: "push", feet: 5 }, label: text("FFDCC.Deed.PushedBack") }]);
    // (What the die would add to the blow stands for the deed a blow would have carried instead.)
    expect(d3.damage).toEqual(sword().damage);
    expect(pushbackAction(sword({ deedDie: 6 })).onHit[2].move.feet).toBe(5);
    expect(pushbackAction(sword({ deedDie: 7 })).onHit[2].move.feet).toBe(10);
    expect(pushbackAction(sword({ bonus: 4, deedDie: 8 }))).toMatchObject({ bonus: 7, onHit: [null, null, { move: { feet: 10 } }, { move: { feet: 10 } }] });
    expect(pushbackAction(sword({ deedDie: undefined }))).toBeNull();
    expect(pushbackAction(sword({ melee: false, range: { increment: 50 } }))).toBeNull();
  });

  test("at an even chance to hit, the folded roll comes off about as often as a hit with the deed die showing 3 or more", () => {
    const hits = (mod, ac) => { const d = degreeDistribution(dccRules, mod, ac, { kind: "attack" }); return d[2] + d[3]; };
    for ( const faces of [3, 4, 5, 6, 7, 8, 10] ) {
      const bonus = 2;
      const ac = Math.round(11 + bonus + (faces + 3) / 2);
      let real = 0;
      for ( let x = 3; x <= faces; x++ ) real += hits(bonus + x, ac) / faces;
      const folded = hits(pushbackAction(sword({ bonus, deedDie: faces })).bonus, ac);
      expect([faces, Math.abs(folded - real) <= 0.06]).toEqual([faces, true]);
    }
  });

  test("a warrior's sheet: a pushback with each melee weapon its deed die rides, none with a bow", async () => {
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
    const pushes = spec.actions.filter(a => a.maneuver === "shove");
    expect(pushes.map(a => a.id)).toEqual(["a1.blade.pushback"]);
    // (A d4 deed die: +3.5 when it works, less 5.)
    expect(pushes[0].bonus).toBe(1 + Math.round(3.5 - 5));
    expect(spec.deeds.map(d => d.maneuver)).toContain("trip");
  });
});

describe("a shove deed by a ledge, in a fight", () => {
  test("pushed over: it falls 20 feet (2d6), lands prone, and the story tells the push", () => {
    let pushed = 0;
    for ( let seed = 1; seed <= 8; seed++ ) {
      const run = fight([warrior(), orc(5)], ledge(), seed);
      const o = run.byId.get("orc");
      takeTurn(run, run.byId.get("warrior"));
      const control = run.log.find(e => e.type === "control" && e.actorId === "warrior");
      expect(control).toMatchObject({ maneuver: "shove" });
      if ( control.degree < 2 ) continue;
      pushed += 1;
      expect(run.log.find(e => e.type === "forced" && e.targetId === "orc")).toMatchObject({ how: "push", fall: 20 });
      const fell = run.log.find(e => e.type === "fall" && e.actorId === "orc");
      expect(fell.feet).toBe(20);
      expect(fell.amount).toBeGreaterThanOrEqual(2);
      expect(fell.amount).toBeLessThanOrEqual(12);
      expect(o.prone).toBe(true);
      expect(o.hp).toBeLessThan(30);
    }
    expect(pushed).toBeGreaterThan(3);
  });

  test("on flat ground the warrior strikes, its deed die riding the blow", () => {
    const run = fight([warrior(), orc(5)]);
    takeTurn(run, run.byId.get("warrior"));
    expect(run.log.some(e => e.type === "attack" && e.actorId === "warrior" && e.deed !== null)).toBe(true);
    expect(run.log.some(e => e.type === "forced")).toBe(false);
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
