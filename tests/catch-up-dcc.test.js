/**
 * What the core gained since API 19, as this helper takes it up: every die DCC's own rules roll is a table roll a live
 * battle shows (morale, a stray shot, a troll's last burst, rolling the body, breaking a grip, persistent damage's end),
 * the same dice as before; one hidden from a single foe at a time (the core's hiddenFrom); and what a creature is like
 * on the core's hidden scale (aptitudes, API 23).
 */
import { describe, expect, test } from "vitest";
import { dccRules } from "../scripts/rules.js";
import { aptitudeBand, aptitudesOf } from "../scripts/traits.js";
import { parseFormula, STATUS, APTITUDES } from "../scripts/core.js";
import { prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import { createRun } from "../../FastFighting/scripts/engine/battle-state.js";
import { createRng } from "../../FastFighting/scripts/engine/rng.js";
import { recordingRng } from "../../FastFighting/scripts/engine/table-rolls.js";
import { text } from "./foundry-i18n.js";

let n = 0;
const traits = () => ({ tactical: { base: 50, fudge: 0 }, brave: { base: 60, fudge: 0 }, selfish: { base: 40, fudge: 0 }, loyal: { base: 50, fudge: 0 } });
const blade = (extra = {}) => ({ id: `blade${++n}`, name: "Blade", kind: "strike", cost: 1, bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d6", "slashing")], ...extra });
const unit = (extra = {}) => ({
  id: `u${++n}`, name: "u", side: "hostile", kind: "npc", level: 1, hp: { value: 6, max: 6 }, hitDie: 6, defenses: { ac: 12, frt: 0, ref: 0, wil: 1 },
  initiative: { mod: 0 }, speeds: { walk: 30 }, actions: [blade()], iwr: {}, traits: traits(), flags: {}, diesAtZero: true, actionDice: [20], ...extra
});
const battle = combatants => ({ combatants, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } }, options: { positioning: false } });
/** A run whose dice record, as a live battle's turns do. */
function liveRun(list, seed = 3) {
  const run = createRun(prepareBattle(battle(list), dccRules));
  run.rng = recordingRng(createRng(seed));
  return run;
}
const rolls = rng => rng.tray.rolls;

describe("DCC's own dice, shown", () => {
  test("a morale check: a d20 and its Will against 11, by the creature that rolls it for its group", () => {
    const run = liveRun([unit({ id: "pc", side: "friendly", kind: "pc", diesAtZero: false }), unit({ id: "g1" }), unit({ id: "g2" })]);
    run.byId.get("g1").status = STATUS.DEAD;
    const g2 = run.byId.get("g2");
    const out = dccRules.morale(run, g2);
    const [roll] = rolls(run.rng);
    expect(roll).toMatchObject({ by: "g2", kind: "check", label: text("FFDCC.Rolls.Morale"), mod: 1, dc: 11, degree: out.said.data.holds ? 2 : 1 });
    expect(roll.total).toBe(out.said.data.total);
  });

  test("a shot into a melee that missed: its d2 for straying and its die for which friend, the same draws as before", () => {
    for ( let seed = 1; seed <= 20; seed++ ) {
      const run = liveRun([unit({ id: "archer", side: "friendly", kind: "pc" }), unit({ id: "pal", side: "friendly", kind: "pc" }), unit({ id: "pal2", side: "friendly", kind: "pc" }), unit({ id: "orc" })], seed);
      const [archer, orc] = [run.byId.get("archer"), run.byId.get("orc")];
      orc.adjacent.add("pal").add("pal2");
      const plain = createRng(seed);
      const friends = [run.byId.get("pal"), run.byId.get("pal2")];
      const was = plain.chance(0.5) ? plain.pick(friends) : null;
      const now = dccRules.strayShot(run, archer, orc, blade({ melee: false, range: { increment: 50 } }));
      expect(now).toBe(was);
      expect(rolls(run.rng)).toEqual([expect.objectContaining({ by: "archer", kind: "other", label: text("FFDCC.Rolls.Stray"), target: now?.id ?? null })]);
    }
  });

  test("rolling the body: the Luck check and the d3 for what it loses, each shown", () => {
    const rng = recordingRng({ die: faces => (faces === 20 ? 9 : 2), d20: () => 9 });
    const lucky = { id: "lucky", spec: { luck: 12 }, resources: { luck: 12 }, status: STATUS.DEAD };
    dccRules.recoverBody(lucky, rng);
    expect(rolls(rng)).toEqual([
      expect.objectContaining({ by: "lucky", kind: "check", what: "body", natural: 9, degree: 2 }),
      expect.objectContaining({ by: "lucky", kind: "other", what: "body" })
    ]);
    expect(lucky.bodyRecovered).toBe("agl");
  });

  test("persistent damage's end (DC 11), and breaking a bigger grabber's grip: shown", () => {
    const rng = recordingRng({ die: () => 12, d20: () => 12 });
    expect(dccRules.persistentFlatCheck(rng, { unit: "lem" })).toBe(true);
    expect(rolls(rng)[0]).toMatchObject({ by: "lem", kind: "flat", what: "persistentEnd", dc: 11, degree: 2 });
    const grabber = { id: "g", spec: { position: { size: 15 } } };
    const who = { id: "h", spec: { position: { size: 5 }, escapeWork: { mod: 2 } } };
    const run = { byId: new Map([["g", grabber]]), rng: recordingRng({ die: () => 15, d20: () => 15 }), prep: { rules: dccRules } };
    const out = dccRules.breakFree(run, who, { key: "grabbed", byId: "g", dc: 14 }, {});
    expect(out).toMatchObject({ natural: 15, mod: -6 }); // (three times its size: the grabber's +8)
    expect(rolls(run.rng)[0]).toMatchObject({ kind: "check", what: "escape", dc: 14 });
  });

  test("a troll's last burst of regeneration as it falls: its dice shown as healing", () => {
    const rng = recordingRng(createRng(5));
    const troll = { id: "troll", spec: { kind: "npc", diesAtZero: true, regen: { burst: true, dice: parseFormula("1d6", "healing") } }, status: STATUS.STANDING };
    dccRules.onDropped(troll, { overflow: 2, rng });
    expect(rolls(rng)).toEqual([expect.objectContaining({ by: "troll", kind: "healing", label: text("FFDCC.Rolls.Regeneration") })]);
  });
});

describe("hidden from one foe at a time", () => {
  test("a hidden striker catches its target open; once that target has found it, no longer", () => {
    const sneak = { id: "s", conds: { hidden: 1 }, spec: {} };
    const mark = { id: "m", conds: {}, spec: {} };
    expect(dccRules.modifiers.exposed({ target: mark, attacker: sneak })).toBe(true);
    sneak.foundBy = new Set(["m"]);
    expect(dccRules.modifiers.exposed({ target: mark, attacker: sneak })).toBe(false);
  });
});

describe("aptitudes", () => {
  test("DCC's modifiers (-3 to +3) banded: -3 is 0, -2 and -1 are 1, 0 is 2, +1 and +2 are 3, +3 is 4", () => {
    expect([-3, -2, -1, 0, 1, 2, 3].map(aptitudeBand)).toEqual([0, 1, 1, 2, 3, 3, 4]);
  });

  test("a character's all five (Personality both wise and charismatic); a creature only its wits, where known", () => {
    const pc = aptitudesOf({ pc: true, mods: { str: 2, agl: -1, sta: 0, per: 3, int: -3, lck: 1 } });
    expect(pc).toEqual({ smart: 0, strong: 3, fast: 1, wise: 4, charismatic: 4 });
    expect(Object.keys(pc).sort()).toEqual([...APTITUDES].sort());
    expect(aptitudesOf({ mindless: true, mods: { int: 2 } })).toEqual({ smart: 0 });
    expect(aptitudesOf({ beast: true })).toEqual({ smart: 1 });
    expect(aptitudesOf({ mods: { int: 1 } })).toEqual({ smart: 3 });
    expect(aptitudesOf({ mods: {} })).toEqual({});
  });
});
