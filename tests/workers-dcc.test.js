/**
 * The planner's fights on background workers (the core's API 22): this helper opens its rules to them
 * (adapter.workerRules: rules.js's dccRulesFor, the world's "tied up stops spells" given as data), and rules.js loads and
 * plays with nothing of Foundry's, as a worker has it. On real threads (node's worker_threads,
 * tests/fixtures/batch-thread.js), a batch of DCC fights split among workers and put back in order is exactly what the
 * main thread's runBatchSync gives.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { Worker as NodeWorker } from "node:worker_threads";
import { runBatchSync } from "../../FastFighting/scripts/engine/simulator.js";
import { openPool } from "../../FastFighting/scripts/engine/batch-pool.js";
import { parseFormula } from "../scripts/core.js";
import { dccRules, dccRulesFor } from "../scripts/rules.js";
import { DccAdapter } from "../scripts/adapter.js";

const RULES = new DccAdapter().workerRules();
const SCRIPTS = fileURLToPath(new URL("../scripts/", import.meta.url));

const threads = [];
/** A worker thread running the core's batch-worker.js, shaped like a browser's Worker. */
function thread(workerData = null) {
  const t = new NodeWorker(new URL("./fixtures/batch-thread.js", import.meta.url), { workerData });
  threads.push(t);
  const w = { onmessage: null, onerror: null, onmessageerror: null };
  t.on("message", data => w.onmessage?.({ data }));
  t.on("error", err => w.onerror?.({ message: err.message }));
  w.postMessage = message => t.postMessage(message);
  w.terminate = () => { t.terminate(); };
  return w;
}
afterAll(async () => { await Promise.all(threads.map(t => t.terminate())); });

let n = 0;
const at = (x, y = 0) => ({ x, y, size: 5 });
const traits = (tactical = 65) => ({ tactical: { base: tactical, fudge: 0 }, brave: { base: 80, fudge: 0 }, selfish: { base: 25, fudge: 0 }, loyal: { base: 75, fudge: 0 } });
const sword = (extra = {}) => ({ id: `sword${++n}`, name: "Longsword", kind: "strike", cost: 1, bonus: 2, melee: true, reach: 5, damage: [parseFormula("1d8", "slashing")], ...extra });
const bow = () => sword({ name: "Shortbow", melee: false, reach: undefined, range: { increment: 50, max: 150 }, damage: [parseFormula("1d6", "piercing")] });
function pc(id, position, extra = {}) {
  return {
    id, name: id, side: "friendly", kind: "pc", level: 1, hp: { value: 12, max: 12 }, hitDie: 8, defenses: { ac: 14, frt: 1, ref: 1, wil: 1 },
    initiative: { mod: 1 }, speeds: { walk: 30 }, actions: [sword()], iwr: {}, traits: traits(), flags: {}, diesAtZero: false, actionDice: [20],
    luck: 12, resources: { luck: 12 }, position, ...extra
  };
}
function monster(id, position, extra = {}) {
  return {
    id, name: id, side: "hostile", kind: "npc", level: 2, hp: { value: 12, max: 12 }, hitDie: 8, defenses: { ac: 13, frt: 2, ref: 1, wil: 0 },
    initiative: { mod: 0 }, speeds: { walk: 30 }, actions: [sword({ name: "Claw", bonus: 3 })], iwr: {}, traits: traits(40), flags: {}, diesAtZero: true,
    actionDice: [20], position, ...extra
  };
}
const battle = (combatants, options = {}) => ({
  combatants, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } },
  options: { positioning: true, maxRounds: 8, ...options }
});

/** Twelve creatures, two blocks 40 feet apart, some shooting, a wall across part of the field. */
function twelve() {
  const list = [];
  for ( let i = 0; i < 6; i++ ) {
    const shoots = i % 3 === 2;
    list.push(pc(`pc${i}`, at(Math.floor(i / 3) * 5, (i % 3) * 5), shoots ? { actions: [bow(), sword()] } : {}));
    list.push(monster(`foe${i}`, at(45 + Math.floor(i / 3) * 5, (i % 3) * 5), shoots ? { actions: [bow()] } : {}));
  }
  const spec = battle(list);
  spec.walls = [{ a: [22.5, 2.5], b: [22.5, 30], s: 20, d: 0, door: null, open: false }];
  return spec;
}

/** What DCC plays its own way: a giant's two action dice, morale, bleeding out, a shot into a melee, Luck. */
function dccFeatures() {
  return battle([
    pc("warrior", at(0), { level: 3, hp: { value: 20, max: 20 } }),
    pc("thief", at(0, 10), { actions: [bow(), sword()] }),
    monster("giant", at(25), { level: 6, hp: { value: 40, max: 40 }, actionDice: [24, 16], actions: [sword({ name: "Club", bonus: 6, damage: [parseFormula("2d8", "bludgeoning")] })] }),
    monster("orc1", at(30, 10)), monster("orc2", at(30, 15)), monster("orc3", at(35, 5))
  ]);
}

describe("this helper's rules for the planner's workers", () => {
  test("workerRules: rules.js beside the adapter, its dccRulesFor, the world's setting as data", async () => {
    expect(RULES).toEqual({ url: new URL("../scripts/rules.js", import.meta.url).href, exportName: "dccRulesFor", data: { tiedStopsSpells: true, duelTables: null } });
    const made = (await import(RULES.url))[RULES.exportName](RULES.data);
    expect(Object.keys(made).sort()).toEqual(Object.keys(dccRules).sort());
    expect(made.tiedStopsSpells).toBe(true);
    expect(dccRulesFor({ tiedStopsSpells: false }).tiedStopsSpells).toBe(false);
    expect(made.degreeOfSuccess).toBe(dccRules.degreeOfSuccess);
  });

  test("rules.js imports nothing of the Foundry side (no sheets, cards or chat)", () => {
    const seen = new Set();
    const walk = file => {
      if ( seen.has(file) ) return;
      seen.add(file);
      const src = fs.readFileSync(file, "utf8");
      for ( const m of src.matchAll(/(?:import|export)\s[^;]*?from\s+"(\.\/[^"]+)"/g) ) walk(path.join(path.dirname(file), m[1]));
    };
    walk(path.join(SCRIPTS, "rules.js"));
    const names = [...seen].map(f => path.basename(f)).sort();
    for ( const foundrySide of ["adapter.js", "commit.js", "read-turn.js", "main.js", "strike-roll.js", "check-roll.js", "damage-roll.js", "tables.js", "lore.js"] ) {
      expect(names).not.toContain(foundrySide);
    }
  });

  test("loaded on a thread with nothing of Foundry's, it reads none of Foundry's globals", async () => {
    const w = thread({ trap: RULES.url });
    const said = await new Promise((resolve, reject) => { w.onmessage = e => resolve(e.data); w.onerror = reject; });
    expect(said).toEqual({ type: "touched", names: [] });
  }, 30000);
});

describe("DCC fights on real threads: what runBatchSync gives", () => {
  for ( const [name, make, runs] of [["twelve creatures on a walled field", twelve, 24], ["a giant's two action dice, morale, bleeding out, shots into a melee", dccFeatures, 80]] ) {
    test(name, async () => {
      const warn = vi.spyOn(console, "warn");
      const spec = make();
      const pool = openPool(RULES, { size: 4, makeWorker: () => thread() });
      const r = await pool.run(spec, dccRules, { runs, seed: 17 });
      pool.close();
      expect(pool.used).toBe(4);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
      expect(r).toEqual(runBatchSync(spec, dccRules, { runs, seed: 17 }));
    }, 60000);
  }
});
