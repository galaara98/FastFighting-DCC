/**
 * Charging (+2 to hit, -2 AC until its next turn) and spell duels (a spell answered with a spell, the checks
 * compared). Tables are written for these tests in DCC's style; no book's text is quoted.
 */
import { describe, expect, test } from "vitest";
import { dccRules } from "../scripts/rules.js";
import { spellAction } from "../scripts/spells.js";
import { parseFormula } from "../scripts/core.js";
import { prepareBattle, replay } from "../../FastFighting/scripts/engine/simulator.js";
import { createRun } from "../../FastFighting/scripts/engine/battle-state.js";

const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
const sword = { id: "sword", name: "Sword", kind: "strike", cost: 1, bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d8", "slashing")] };
const bolt = [
  { range: [1, 11], text: "Lost. Failure." },
  { range: [12, 99], text: "A single bolt strikes for [[/roll 1d6]] damage. It never misses." }
];
const unit = extra => ({
  side: "friendly", kind: "pc", level: 1, hp: { value: 30, max: 30 }, hitDie: 8, defenses: { ac: 13, frt: 1, ref: 1, wil: 1 }, initiative: { mod: 0 },
  speeds: { walk: 30 }, actions: [sword], iwr: {}, traits, flags: { fearless: true }, diesAtZero: false, actionDice: [20], ...extra
});
const battle = (combatants, options = {}) => ({ combatants, sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } }, options: { positioning: false, maxRounds: 4, ...options } });

describe("charging", () => {
  const ctx = (moved, action = sword) => ({ attacker: { feetMoved: moved, turnFeet: 0, spec: { speeds: { walk: 30 } } }, target: {}, action, distance: 5, positioning: true, alliesAdjacent: 0 });

  test("a melee attack after moving at least half its speed: +2 to hit", () => {
    expect(dccRules.modifiers.attack(ctx(15)).bonus).toBe(2);
    expect(dccRules.modifiers.attack(ctx(10)).bonus).toBe(0);
    expect(dccRules.modifiers.attack(ctx(30, { ...sword, melee: false, range: { increment: 50 } })).bonus).toBe(0);
  });

  test("and -2 AC until its next turn", () => {
    const u = { feetMoved: 20, turnFeet: 0, spec: { speeds: { walk: 30 }, kind: "npc" } };
    dccRules.afterRoll({ sharedPools: {} }, u, { natural: 9, total: 12 }, { kind: "attack", action: sword });
    expect(dccRules.modifiers.defense({ target: u })).toBe(-2);
    dccRules.startTurn({ round: 2 }, u);
    expect(dccRules.modifiers.defense({ target: u })).toBe(0);
  });
});

describe("spell duels", () => {
  const caster = (id, side, name, mod = 4) => unit({ id, name: id, side, kind: side === "friendly" ? "pc" : "npc",
    actions: [spellAction({ id: `${id}.spell`, name, rows: bolt, mod, casterLevel: 1 })] });

  test("a caster yet to act this round answers with the same spell, Dispel Magic, or the counters the rules name; once a round", () => {
    const run = createRun(prepareBattle(battle([caster("wiz", "friendly", "Magic Missile"), caster("hag", "hostile", "Magic Shield"), caster("imp", "hostile", "Choking Cloud")]), dccRules));
    const [wiz, hag] = [run.byId.get("wiz"), run.byId.get("hag")];
    const missile = wiz.spec.actions[0];
    expect(dccRules.duel(run, wiz, missile)).toMatchObject({ by: hag });
    // (Answered once this round already.)
    expect(dccRules.duel(run, wiz, missile)).toBe(null);
    // (Already acted this round: too late.)
    hag.dueled = false;
    hag.turnRound = run.round;
    expect(dccRules.duel(run, wiz, missile)).toBe(null);
    // A fire spell isn't a Magic Shield's to answer (nor a Choking Cloud's).
    hag.turnRound = null;
    expect(dccRules.duel(run, wiz, { name: "Fireball" })).toBe(null);
  });

  test("in a fight: the checks compared, the higher stands; answering costs the next action", () => {
    let duels = 0;
    for ( let seed = 1; seed <= 40; seed++ ) {
      const spec = battle([caster("wiz", "friendly", "Magic Missile", 6), caster("hag", "hostile", "Magic Missile", 6)]);
      spec.combatants[1].initiative = { mod: -20 }; // (always later: it can answer)
      const r = replay(spec, dccRules, seed);
      for ( const d of r.log.filter(e => e.type === "duel") ) {
        duels++;
        expect(d.actorId).toBe("hag");
        expect(["wins", "both", "loses", "fails"]).toContain(d.outcome);
        if ( d.outcome === "wins" ) expect(d.total).toBeGreaterThan(d.against);
        if ( d.outcome === "loses" ) expect(d.total).toBeLessThan(d.against);
      }
    }
    expect(duels).toBeGreaterThan(0);
  });
});
