/**
 * DCC's own combat rules the engine plays: withdrawing from a melee, firing into one, a two-handed weapon's
 * initiative die, and who speaks Common.
 */
import { describe, expect, test } from "vitest";
import { dccRules } from "../scripts/rules.js";
import { speaksCommon, monsterKind } from "../scripts/traits.js";
import { parseFormula } from "../scripts/core.js";
import { replay } from "../../FastFighting/scripts/engine/simulator.js";
import { createRun } from "../../FastFighting/scripts/engine/battle-state.js";
import { prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import { createRng } from "../../FastFighting/scripts/engine/rng.js";

let n = 0;
const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 25, fudge: 0 }, loyal: { base: 75, fudge: 0 } };
const sword = (extra = {}) => ({ id: `sword${++n}`, name: "Longsword", kind: "strike", cost: 1, bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d8", "slashing")], ...extra });
const bow = (extra = {}) => ({ id: `bow${++n}`, name: "Shortbow", kind: "strike", cost: 1, bonus: 1, melee: false, range: { increment: 50, max: 150 }, damage: [parseFormula("1d6", "piercing")], ...extra });
const unit = (extra = {}) => ({
  id: `u${++n}`, side: "friendly", kind: "pc", level: 1, hp: { value: 14, max: 14 }, hitDie: 8, defenses: { ac: 13, frt: 1, ref: 1, wil: 1 },
  initiative: { mod: 0 }, speeds: { walk: 30 }, actions: [sword()], iwr: {}, traits, flags: { fearless: true }, diesAtZero: false, actionDice: [20], ...extra
});
const battle = (combatants, options = {}) => ({ combatants, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } }, options: { positioning: false, ...options } });

describe("withdrawing from a melee", () => {
  test("every foe engaged with it gets a free attack, at each foe that withdraws; not one that can't act", () => {
    const orc = { conds: {}, spec: { actions: [sword()] }, prep: { offense: [sword()] } };
    expect(dccRules.opportunity({ ...orc, prep: { offense: orc.spec.actions } })).toBeTruthy();
    expect(dccRules.opportunity({ ...orc, conds: { stunned: 1 } })).toBe(null);
    expect(dccRules.reactions()).toBeGreaterThan(10);
  });
});

describe("firing into a melee", () => {
  test("-1 to hit when the target is engaged with the shooter's friends; nothing for a melee attack", () => {
    const base = { attacker: {}, target: {}, distance: 10, positioning: false };
    expect(dccRules.modifiers.attack({ ...base, action: bow(), alliesAdjacent: 1 }).bonus).toBe(-1);
    expect(dccRules.modifiers.attack({ ...base, action: bow(), alliesAdjacent: 0 }).bonus).toBe(0);
    expect(dccRules.modifiers.attack({ ...base, action: sword(), alliesAdjacent: 1 }).bonus).toBe(0);
  });

  test("a miss strays toward a friend in that melee half the time, and the attack is made again against it", () => {
    const archer = unit({ id: "archer", name: "Archer", actions: [bow({ bonus: -6 })] });
    const fighter = unit({ id: "fighter", name: "Fighter" });
    const orc = unit({ id: "orc", name: "Orc", side: "hostile", kind: "npc", diesAtZero: true, hp: { value: 60, max: 60 } });
    let strays = 0;
    let wild = 0;
    for ( let seed = 1; seed <= 40; seed++ ) {
      const r = replay(battle([archer, fighter, orc], { maxRounds: 4 }), dccRules, seed);
      for ( const e of r.log.filter(x => x.type === "stray") ) {
        strays++;
        expect(e.actorId).toBe("archer");
        expect(e.targetId).toBe("fighter");
        if ( e.hit ) expect(e.damage).toBeGreaterThan(0);
      }
      wild += r.log.filter(x => x.type === "attack" && x.actorId === "archer" && x.degree < 2).length;
    }
    expect(strays).toBeGreaterThan(0);
    expect(strays).toBeLessThan(wild);
  });

  test("no friend in the melee, or a melee attack: nothing strays", () => {
    const run = createRun(prepareBattle(battle([unit({ id: "a" }), unit({ id: "o", side: "hostile", kind: "npc" })]), dccRules));
    run.rng = createRng(1);
    const [a, o] = [run.byId.get("a"), run.byId.get("o")];
    expect(dccRules.strayShot(run, a, o, bow())).toBe(null);
    o.adjacent.add("a");
    expect(dccRules.strayShot(run, a, o, sword())).toBe(null);
  });
});

describe("initiative", () => {
  test("a creature's own initiative die: a d16 two-handing comes up lower than a d20", () => {
    let behind = 0;
    for ( let seed = 1; seed <= 200; seed++ ) {
      const r = replay(battle([unit({ id: "great", name: "Great", initiative: { mod: 0, die: 16 } }), unit({ id: "orc", name: "Orc", side: "hostile", kind: "npc" })], { maxRounds: 1 }), dccRules, seed);
      const order = r.log.find(e => e.type === "initiative").order;
      if ( order[0] === "Orc" ) behind++;
    }
    // (d16 against d20: behind a little more often than not.)
    expect(behind).toBeGreaterThan(100);
  });
});

describe("languages", () => {
  test("with none listed: every character speaks Common, and any creature the system files as one of the people", () => {
    // (The system's importer gives a creature its crit table by kind: CONFIG.DCC.monsterCriticalHits, in part.)
    const critHits = { 1: { humanoid: { table: "III" }, dragon: { table: "DR" }, demon: { table: "DN" }, giant: { table: "G" }, undead: { table: "U" }, other: { table: "M" } },
      7: { humanoid: { table: "IV" }, giant: { table: "G" } } };
    expect(monsterKind("IV", critHits)).toBe("humanoid");
    expect(monsterKind("U", critHits)).toBe("undead");
    expect(monsterKind("II", critHits)).toBeNull();
    expect(monsterKind("", critHits)).toBeNull();
    expect(speaksCommon({ pc: true })).toBe(true);
    for ( const table of ["III", "IV", "G", "DR", "DN"] ) expect(speaksCommon({ kind: monsterKind(table, critHits) })).toBe(true);
    for ( const table of ["U", "M", "II", ""] ) expect(speaksCommon({ kind: monsterKind(table, critHits) })).toBe(false);
  });
});
