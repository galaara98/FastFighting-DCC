/**
 * A rallying deed, by the world's rally table where it has one (else the built-in rough version): what each row does
 * for the warrior's friends who see it. The bonuses it lends outright (not one that waits on a kill or a crit), so much
 * to their morale checks, and a second check for one whose group has broken, which DCC's morale plays: made, it holds
 * while the rest run. The rows here are made up for the tests, in DCC's style; no book's text is quoted.
 */
import { describe, expect, test } from "vitest";
import { deedsFrom } from "../scripts/deeds.js";
import { DccTables } from "../scripts/tables.js";
import { dccRules } from "../scripts/rules.js";
import { parseFormula, MORALE, applyOutcome } from "../scripts/core.js";
import { prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import { createRun } from "../../FastFighting/scripts/engine/battle-state.js";
import { text } from "./foundry-i18n.js";

const ROWS = [
  { range: [3, 3], text: "With a bellow the warrior steadies the hirelings nearby: any that have failed a morale check get a second check." },
  { range: [4, 4], text: "Allies who see the deed gain a +1 bonus to morale checks for the rest of the round." },
  { range: [5, 5], text: "Allies gain a +1 bonus to morale checks this round. If the warrior slays its foe, allies also gain a +1 attack bonus next round." },
  { range: [6, 99], text: "As above, and it reaches every follower who can see the warrior." }
];

describe("a rally table's rows", () => {
  test("a second check, so much to morale checks; no bonus that waits on a kill; a row that's only 'as above' leaves the one below it", () => {
    const rally = deedsFrom({ rally: ROWS }).find(d => d.id === "rally");
    expect(rally.maneuver).toBe("rally");
    expect(rally.tiers.map(x => [x.min, x.outcome.mods, x.outcome.allies])).toEqual([[3, { moraleAgain: 1 }, 10], [4, { morale: 1 }, 10], [5, { morale: 1 }, 10]]);
    expect(rally.tiers[0].outcome.label).toBe(text("FFDCC.Deed.Rallied", { what: text("FFDCC.Deed.MoraleAgain") }));
    expect(rally.tiers[1].outcome.label).toBe(text("FFDCC.Deed.Rallied", { what: text("FFDCC.Deed.Morale", { n: "+1" }) }));
  });

  test("a bonus lent outright, and farther at a higher deed; rows that do none of it leave the built-in rally", () => {
    const lent = deedsFrom({ rally: [{ range: [6, 7], text: "Allies gain +2 to attack rolls and a +1 bonus to morale checks next round." }] }).find(d => d.id === "rally");
    expect(lent.tiers).toEqual([{ min: 6, outcome: expect.objectContaining({ mods: { attack: 2, morale: 1 }, allies: 20 }) }]);
    const built = deedsFrom(null).find(d => d.id === "rally");
    expect(deedsFrom({ rally: [{ range: [3, 99], text: "The warrior looks splendid." }] }).find(d => d.id === "rally").tiers).toEqual(built.tiers);
  });

  test("read from the world's deed tables: the rallying maneuver's with the rest", async () => {
    const table = (name, rows) => ({ name, results: rows.map(r => ({ range: r.range, description: r.text })) });
    const docs = { trip: table("Deed: Trips and Throws", [{ range: [3, 3], text: "The foe falls prone." }]), rally: table("Deed: Rallying Maneuver", ROWS) };
    const pack = {
      collection: "book.deeds", documentName: "RollTable",
      getIndex: async () => Object.entries(docs).map(([id, d]) => ({ _id: id, name: d.name })),
      getDocument: async id => docs[id]
    };
    globalThis.CONFIG = { DCC: { mightyDeedsPacks: { packs: ["book.deeds"] } } };
    globalThis.game.packs = Object.assign([pack], { get: id => (id === "book.deeds" ? pack : undefined) });
    const read = await new DccTables().deeds();
    expect(Object.keys(read).sort()).toEqual(["rally", "trip"]);
    expect(read.rally.map(r => r.range)).toEqual(ROWS.map(r => r.range));
  });
});

describe("a rally, in DCC's morale", () => {
  let n = 0;
  const traits = { tactical: { base: 50, fudge: 0 }, brave: { base: 60, fudge: 0 }, selfish: { base: 40, fudge: 0 }, loyal: { base: 50, fudge: 0 } };
  const unit = (extra = {}) => ({
    id: `u${++n}`, side: "friendly", kind: "npc", level: 1, hp: { value: 6, max: 6 }, hitDie: 6, defenses: { ac: 12, frt: 0, ref: 0, wil: 0 }, initiative: { mod: 0 },
    speeds: { walk: 30 }, actions: [{ id: `b${++n}`, name: "Spear", kind: "strike", cost: 1, bonus: 1, melee: true, reach: 5, damage: [parseFormula("1d6", "piercing")] }],
    iwr: {}, traits, flags: {}, diesAtZero: true, actionDice: [20], ...extra
  });
  /** Three hirelings and a warrior against an orc; the first hireling down. */
  function fight(roll) {
    const spec = { combatants: [unit({ id: "w", kind: "pc", flags: { fearless: true } }), unit({ id: "h1" }), unit({ id: "h2" }), unit({ id: "h3" }), unit({ id: "orc", side: "hostile" })],
      sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } }, options: { positioning: false } };
    const run = createRun(prepareBattle(spec, dccRules));
    run.rng = { die: () => roll(), next: () => 0.5, chance: () => false, pick: l => l[0] };
    run.byId.get("h1").status = "dead";
    return run;
  }
  const rally = mods => ({ mods, rounds: 1, label: "", allies: 10 });

  test("so much to the next morale check", () => {
    const run = fight(() => 9);
    applyOutcome(run.byId.get("h2"), rally({ morale: 2 }), "w", { id: "deed:rally" });
    expect(dccRules.morale(run, run.byId.get("h2")).said.data).toMatchObject({ trigger: "first", natural: 9, total: 11, holds: true });
  });

  test("broken, a hireling with a second check makes it and holds, once; the rest run; without one, it runs", () => {
    const rolls = [5, 14];
    const run = fight(() => rolls.shift() ?? 1);
    const [h2, h3] = ["h2", "h3"].map(id => run.byId.get(id));
    expect(dccRules.morale(run, h3).result).toBe(MORALE.ROUT);
    applyOutcome(h2, rally({ moraleAgain: 1 }), "w", { id: "deed:rally" });
    const again = dccRules.morale(run, h2);
    expect(again.result).toBe(MORALE.HOLD);
    expect(again.said.data).toMatchObject({ trigger: "rallied", natural: 14, holds: true });
    expect(again.said.text).toContain(text("FFDCC.MoraleWhy.rallied"));
    // (Made, it stays steady; its fellows still run.)
    expect(dccRules.morale(run, h2)).toBe(MORALE.HOLD);
    expect(dccRules.morale(run, h3)).toBe(MORALE.ROUT);
  });

  test("a second check missed: it runs with the rest, and the same rally gives no third", () => {
    const run = fight(() => 2);
    const h2 = run.byId.get("h2");
    dccRules.morale(run, run.byId.get("h3"));
    applyOutcome(h2, rally({ moraleAgain: 1 }), "w", { id: "deed:rally" });
    expect(dccRules.morale(run, h2).result).toBe(MORALE.ROUT);
    expect(dccRules.morale(run, h2)).toBe(MORALE.ROUT);
  });
});
