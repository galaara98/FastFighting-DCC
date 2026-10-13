/**
 * DCC morale: creatures check at set moments, one roll for the group (a d20 + Will, DC 11); under, the group flees.
 */
import { describe, expect, test } from "vitest";
import { dccRules } from "../scripts/rules.js";
import { parseFormula, MORALE } from "../scripts/core.js";
import { replay, prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import { createRun } from "../../FastFighting/scripts/engine/battle-state.js";

let n = 0;
const traits = (brave = 60) => ({ tactical: { base: 50, fudge: 0 }, brave: { base: brave, fudge: 0 }, selfish: { base: 40, fudge: 0 }, loyal: { base: 50, fudge: 0 } });
const blade = (bonus = 2, dmg = "1d8") => ({ id: `blade${++n}`, name: "Blade", kind: "strike", cost: 1, bonus, melee: true, reach: 5, damage: [parseFormula(dmg, "slashing")] });
const unit = (extra = {}) => ({
  id: `u${++n}`, side: "hostile", kind: "npc", level: 1, hp: { value: 6, max: 6 }, hitDie: 6, defenses: { ac: 12, frt: 0, ref: 0, wil: 0 },
  initiative: { mod: 0 }, speeds: { walk: 30 }, actions: [blade(1, "1d6")], iwr: {}, traits: traits(), flags: {}, diesAtZero: true, actionDice: [20], ...extra
});
const hero = (extra = {}) => unit({ side: "friendly", kind: "pc", hp: { value: 40, max: 40 }, defenses: { ac: 16, frt: 3, ref: 3, wil: 3 }, actions: [blade(6, "2d8")], traits: traits(95), flags: { fearless: true }, diesAtZero: false, ...extra });
const battle = (combatants, options = {}) => ({ combatants, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } }, options: { positioning: false, maxRounds: 10, ...options } });
const goblins = (extra = {}) => [1, 2, 3, 4].map(i => unit({ id: `g${i}`, name: `Goblin ${i}`, ...extra }));

describe("DCC morale", () => {
  test("a group checks when its first falls and when half are down, once each; failing, the whole group flees", () => {
    let broke = 0;
    for ( let seed = 1; seed <= 40; seed++ ) {
      const r = replay(battle([hero({ id: "a", name: "Ana" }), hero({ id: "b", name: "Bo" }), ...goblins()]), dccRules, seed);
      const checks = r.log.filter(e => e.type === "morale");
      expect(checks.filter(e => e.trigger === "first").length).toBeLessThanOrEqual(1);
      expect(checks.filter(e => e.trigger === "half").length).toBeLessThanOrEqual(1);
      for ( const e of checks ) expect(e.total).toBe(e.natural); // (Will 0)
      const failed = checks.find(e => !e.holds);
      if ( failed ) {
        broke++;
        // Nobody of the group fights on: whoever was still up ran.
        const after = r.log.filter(e => e.type === "attack" && /^g/.test(e.actorId) && (e.round > failed.round));
        expect(after.length).toBe(0);
      }
    }
    expect(broke).toBeGreaterThan(0);
  });

  test("the mindless and the fearless never check; a character is its player's", () => {
    const run = createRun(prepareBattle(battle([hero({ id: "a" }), unit({ id: "z", flags: { mindless: true } }), unit({ id: "f", flags: { fearless: true } })]), dccRules));
    expect(dccRules.morale(run, run.byId.get("z"))).toBe(MORALE.HOLD);
    expect(dccRules.morale(run, run.byId.get("f"))).toBe(MORALE.HOLD);
    expect(dccRules.morale(run, run.byId.get("a"))).toBe(null);
  });

  test("one alone checks when it has lost half its hit points, once", () => {
    const run = createRun(prepareBattle(battle([hero({ id: "a" }), unit({ id: "ogre", hp: { value: 20, max: 20 } })]), dccRules));
    const ogre = run.byId.get("ogre");
    run.rng = { die: () => 15, next: () => 0.5, chance: () => false, pick: l => l[0] };
    expect(dccRules.morale(run, ogre)).toBe(MORALE.HOLD);
    ogre.hp = 9;
    expect(dccRules.morale(run, ogre).said.data).toMatchObject({ trigger: "hurt", holds: true });
    expect(dccRules.morale(run, ogre)).toBe(MORALE.HOLD);
  });

  test("a retainer adds its employer's Personality", () => {
    const spec = battle([hero({ id: "boss", personality: 3 }), unit({ id: "hireling", side: "friendly" }), unit({ id: "hireling2", side: "friendly" }), unit({ id: "orc" })]);
    spec.command = { friendly: [{ id: "boss", role: "leader", leadership: {} }] };
    const run = createRun(prepareBattle(spec, dccRules));
    run.rng = { die: () => 8, next: () => 0.5, chance: () => false, pick: l => l[0] };
    run.byId.get("hireling2").status = "dead";
    const said = dccRules.morale(run, run.byId.get("hireling")).said;
    expect(said.data).toMatchObject({ natural: 8, total: 11, holds: true });
  });
});

describe("those that never flee, by their stat line", () => {
  test("a construct and one immune to fear itself hold, as their tactics say", async () => {
    const { deriveDccTraits } = await import("../scripts/traits.js");
    const golem = deriveDccTraits({ pc: false, level: 4, alignment: "n", will: 0, name: "Iron Sentinel", construct: true });
    expect(golem.flags.mindless).toBe(true);
    const unshaken = deriveDccTraits({ pc: false, level: 4, alignment: "n", will: 0, name: "Knight", fearImmune: true, immune: ["frightened", "fear"] });
    expect(unshaken.flags.fearless).toBe(true);
    expect(deriveDccTraits({ pc: false, level: 4, alignment: "n", will: 0, name: "Knight" }).flags.fearless).toBeUndefined();
  });
});
