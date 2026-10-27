/**
 * Spell duels by the book's tables (duel.js, the core's rules.duelResult, API 34): the check comparison's die, momentum,
 * counterspell power and phlogiston disturbance, read from rows by reading/en.json's `duel` words; a caster delaying to
 * answer a foe's spell (rules.delay.waitFor); hearing a fight at DCC's difficulties, a character listening with Luck.
 * The tables here are written for these tests in DCC's style; no book's text is quoted.
 */
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import { dccRules, dccRulesFor } from "../scripts/rules.js";
import { spellAction } from "../scripts/spells.js";
import { duelTablesFrom, reckonDuel, comparisonDie, powerRow, STARTING_MOMENTUM } from "../scripts/duel.js";
import { prepareBattle, replay } from "../../FastFighting/scripts/engine/simulator.js";
import { createRun } from "../../FastFighting/scripts/engine/battle-state.js";
import { delayFor } from "../../FastFighting/scripts/engine/behavior/waiting.js";

const words = JSON.parse(fs.readFileSync(new URL("../reading/en.json", import.meta.url), "utf8"));
const roll = expr => `[[/roll ${expr}]]`;

/** The comparison: by the defender's check (its row), then the attacker's; the nearer the two, the smaller the die. */
const compare = [];
for ( let d = 12; d <= 28; d++ ) {
  const cells = [];
  for ( let a = 12; a <= 28; a++ ) {
    const gap = Math.abs(a - d);
    cells.push(`${a}: ${gap === 0 ? "PD" : gap <= 2 ? "d3" : gap <= 6 ? "d5" : "d8"}`);
  }
  compare.push({ range: [d, d], text: `<strong>Defender ${d}:</strong> ${cells.join(", ")}` });
}
const attackerHigh = [
  { range: [1, 2], text: `Grind d4: roll ${roll("1d4")} and subtract it from the defender's spell check. Both spells land, the defender's at that lower check.` },
  { range: [3, 6], text: "Crush: the attacker's spell lands and the defender's spell is cancelled." },
  { range: [7, 10], text: `Crush and return d6: roll ${roll("1d6")} and subtract it from the defender's spell check. The attacker's spell lands, and the defender's spell check is reflected back at that lower check.` }
];
const defenderHigh = [
  { range: [1, 3], text: `Blunt d6: roll ${roll("1d6")} and subtract it from the attacker's spell check. The attacker's spell lands at that lower check; the defender's spell is cancelled.` },
  { range: [4, 5], text: "Snuffed: both the attacker's and the defender's spells are cancelled." },
  { range: [6, 8], text: "Smother: the attacker's spell is cancelled, and the defender's spell lands." },
  { range: [9, 10], text: "Mirror: the defender's spell is cancelled, and the attacker's spell reflects back on its caster." }
];
const disturbance = [
  { range: [1, 2], text: "Rift. Both casters vanish for a while; the judge decides." },
  { range: [3, 4], text: `Stillness. Roll ${roll("1d3")} and resolve that many rounds of combat among other combatants before either caster acts again.` }
];
const raw = { compare, attackerHigh, defenderHigh, disturbance };
const tables = duelTablesFrom(raw, words);

/** A run whose dice say what they're told, in order. */
const fixed = (...faces) => {
  const queue = [...faces];
  return { rng: { die: () => queue.shift() ?? 1, chance: () => false } };
};
const duellist = (id, extra = {}) => ({ id, spec: { name: id }, ...extra });

describe("the book's duel tables, read", () => {
  test("the comparison by both checks, clamped to the table", () => {
    expect(tables).not.toBeNull();
    expect(comparisonDie(tables, 15, 15)).toBe("pd");
    expect(comparisonDie(tables, 16, 15)).toBe("d3");
    expect(comparisonDie(tables, 22, 15)).toBe("d8");
    expect(comparisonDie(tables, 40, 9)).toBe("d8"); // (28 against 12)
    expect(comparisonDie(tables, 31, 29)).toBe("pd"); // (both past the table: 28 against 28)
  });

  test("a power row: its die, whose check it lowers, which spell it cancels or turns back", () => {
    expect(tables.attackerHigh[0]).toMatchObject({ label: "Grind d4", faces: 4, spell: { cancel: false, lower: false }, counter: { cancel: false, lower: true, reflect: false } });
    expect(tables.attackerHigh[2]).toMatchObject({ counter: { lower: true, reflect: true }, spell: { cancel: false } });
    expect(tables.defenderHigh[1]).toMatchObject({ spell: { cancel: true }, counter: { cancel: true } });
    expect(tables.defenderHigh[3]).toMatchObject({ spell: { reflect: true, cancel: false }, counter: { cancel: true } });
    expect(powerRow({ range: [1, 1], text: "Nothing it understands." }, null)).toMatchObject({ faces: 0, spell: { cancel: false }, counter: { cancel: false } });
  });

  test("a disturbance row that has the casters sit out rounds, with its die", () => {
    expect(tables.disturbance[1]).toMatchObject({ label: "Stillness", sitOut: { n: 1, faces: 3 } });
    expect(tables.disturbance[0].sitOut).toBeNull();
    expect(tables.disturbanceFaces).toBe(4);
  });

  test("none without every table", () => {
    expect(duelTablesFrom({ ...raw, disturbance: [] }, words)).toBeNull();
    expect(duelTablesFrom(null, words)).toBeNull();
  });
});

describe("an exchange (reckonDuel)", () => {
  test("the attacker high: momentum to it, the die plus its edge picks the row", () => {
    const caster = duellist("wiz");
    const by = duellist("hag");
    // (17 against 15: a d3; it rolls 2, +1 momentum over the hag's: row 3, Crush.)
    const out = reckonDuel(fixed(2), { caster, by, total: 17, answer: 15 }, tables);
    expect(caster.dccMomentum).toBe(STARTING_MOMENTUM + 1);
    expect(by.dccMomentum ?? STARTING_MOMENTUM).toBe(STARTING_MOMENTUM);
    expect(out).toMatchObject({ spell: { total: 17 }, counter: { total: null }, label: "Crush" });
  });

  test("a check lowered by the row's die; a spell turned back", () => {
    const caster = duellist("wiz", { dccMomentum: 14 });
    const by = duellist("hag");
    // (20 against 14: a d5; 3 + (15 - 10) = 8, Crush and return: the hag's check less a d6 roll of 4, turned back.)
    const out = reckonDuel(fixed(3, 4), { caster, by, total: 20, answer: 14 }, tables);
    expect(out).toMatchObject({ spell: { total: 20 }, counter: { total: 10, reflect: true } });
  });

  test("the defender high: its column; the loser's momentum lead can bring the roll to 1", () => {
    const caster = duellist("wiz", { dccMomentum: 15 });
    const by = duellist("hag");
    // (14 against 16: a d3 of 3, the hag's 11 against the wizard's 15: -1, so 1, Blunt: the wizard's check less 5.)
    const out = reckonDuel(fixed(3, 5), { caster, by, total: 14, answer: 16 }, tables);
    expect(out).toMatchObject({ spell: { total: 9 }, counter: { total: null }, label: "Blunt d6" });
  });

  test("the same check: a phlogiston disturbance, both spells lost, the casters sitting out where the row says", () => {
    const caster = duellist("wiz");
    const by = duellist("hag");
    const out = reckonDuel(fixed(3, 2), { caster, by, total: 15, answer: 15 }, tables);
    expect(out).toMatchObject({ disturbance: true, label: "Stillness", spell: { total: null }, counter: { total: null } });
    expect(out.effects).toEqual([
      { unitId: "wiz", outcome: { conditions: { incapacitated: 1 }, rounds: 2, label: "Stillness" } },
      { unitId: "hag", outcome: { conditions: { incapacitated: 1 }, rounds: 2, label: "Stillness" } }
    ]);
    expect(caster.dccMomentum ?? 10).toBe(10);
  });

  test("the same patron invoked twice: both cancel; no tables, or the answer failed: the core's comparison", () => {
    expect(reckonDuel(fixed(), { caster: duellist("a"), by: duellist("b"), total: 18, answer: 14, samePatron: true }, tables)).toMatchObject({ spell: { total: null }, counter: { total: null } });
    expect(reckonDuel(fixed(), { caster: duellist("a"), by: duellist("b"), total: 18, answer: 14 }, null)).toBeNull();
    expect(reckonDuel(fixed(), { caster: duellist("a"), by: duellist("b"), total: 18, answer: null }, tables)).toBeNull();
  });
});

const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 90, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
const bolt = [
  { range: [1, 11], text: "Lost. Failure." },
  { range: [12, 99], text: "A single bolt strikes for [[/roll 1d6]] damage. It never misses." }
];
const caster = (id, side, name, mod = 6, extra = {}) => ({
  id, name: id, side, kind: side === "friendly" ? "pc" : "npc", level: 1, hp: { value: 60, max: 60 }, hitDie: 8, defenses: { ac: 13, frt: 1, ref: 1, wil: 1 },
  initiative: { mod: 0 }, speeds: { walk: 30 }, iwr: {}, traits, flags: { fearless: true }, diesAtZero: false, actionDice: [20],
  actions: [spellAction({ id: `${id}.spell`, name, rows: bolt, mod, casterLevel: 1 })], ...extra
});
const battle = (combatants, options = {}) => ({ combatants, sides: { friendly: { label: "P", enemies: ["hostile"] }, hostile: { label: "F", enemies: ["friendly"] } }, options: { positioning: false, maxRounds: 3, ...options } });

describe("in a fight, by the tables", () => {
  test("each duel names its row and what became of each spell", () => {
    const rules = dccRulesFor({ duelTables: tables });
    const fates = new Set();
    for ( let seed = 1; seed <= 40; seed++ ) {
      const spec = battle([caster("wiz", "friendly", "Magic Missile"), caster("hag", "hostile", "Magic Missile", 6, { initiative: { mod: -20 } })]);
      for ( const d of replay(spec, rules, seed).log.filter(e => e.type === "duel") ) {
        if ( d.outcome === "fails" ) continue;
        expect(d.spell).toBeDefined();
        expect(d.effect).toBeTypeOf("string");
        fates.add(d.spell);
      }
    }
    expect(fates.size).toBeGreaterThan(1);
  });

  test("without the tables, the checks are compared", () => {
    expect(dccRulesFor({}).duelTables).toBeNull();
    const spec = battle([caster("wiz", "friendly", "Magic Missile"), caster("hag", "hostile", "Magic Missile", 6, { initiative: { mod: -20 } })]);
    const d = replay(spec, dccRulesFor({}), 3).log.find(e => e.type === "duel");
    if ( d ) expect(d.spell).toBeUndefined();
  });
});

describe("Delay: only to answer a foe's spell", () => {
  const run = specs => {
    const r = createRun(prepareBattle(battle(specs), dccRules));
    r.round = 1;
    r.order = [...r.units];
    return r;
  };

  test("a caster first in the order waits for a foe's spell it could answer", () => {
    const r = run([caster("wiz", "friendly", "Magic Missile"), caster("hag", "hostile", "Magic Missile")]);
    expect(delayFor(r, r.byId.get("wiz"))).toEqual({ why: "counter", afterId: "hag", forId: "hag" });
  });

  test("nothing to answer, or no spell of its own: no delay; and nothing readied", () => {
    const r = run([caster("wiz", "friendly", "Magic Missile"), caster("hag", "hostile", "Choking Cloud")]);
    expect(delayFor(r, r.byId.get("wiz"))).toBeNull();
    const s = run([{ ...caster("brute", "friendly", "Magic Missile"), actions: [] }, caster("hag", "hostile", "Magic Missile")]);
    expect(delayFor(s, s.byId.get("brute"))).toBeNull();
    expect(dccRules.ready).toBeUndefined();
  });
});

describe("hearing a fight", () => {
  test("DCC's difficulties: child's play near, harder with distance and walls, beyond a hero's work not at all", () => {
    expect(dccRules.hearDC({ feet: 20 })).toBe(5);
    expect(dccRules.hearDC({ feet: 50 })).toBe(10);
    expect(dccRules.hearDC({ feet: 100, walls: 1 })).toBe(20);
    expect(dccRules.hearDC({ feet: 200, walls: 1 })).toBeNull();
    expect(dccRules.hearDC({ feet: 20, talk: true })).toBe(10);
    expect(dccRules.hearDC({ feet: 20, walls: 1, talk: true })).toBeNull();
    expect(dccRules.hearDC({ feet: 20, walls: 3 })).toBeNull();
  });

  test("a character listens with its Luck; spotting stays its wits", () => {
    const unit = { spec: { perception: 1, listen: 3 } };
    expect(dccRules.modifiers.check({ unit, purpose: "notice", sense: "sound" }).bonus).toBe(2);
    expect(dccRules.modifiers.check({ unit, purpose: "notice", sense: "sight" }).bonus).toBe(0);
    expect(dccRules.modifiers.check({ unit: { spec: { perception: 1 } }, purpose: "notice", sense: "sound" }).bonus).toBe(0);
  });
});
