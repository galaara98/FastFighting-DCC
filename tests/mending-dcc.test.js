/**
 * A creature's mending of its own, from its stat line (or the entry in a book it links to): regeneration, so much each
 * round, stopped for a turn by what it can't regenerate from, and dead at 0 as any DCC monster unless it regenerates
 * even the round it's killed (a last burst: taken far enough below 0, it stays down for good); and healing each round.
 * The wording here is made up for the tests, in DCC's style; the field paths are the dcc system's own.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { DccAdapter } from "../scripts/adapter.js";
import { dccRules } from "../scripts/rules.js";
import { mendingIn, statLine, linksIn } from "../scripts/text.js";
import { STATUS, parseFormula } from "../scripts/core.js";
import { replay } from "../../FastFighting/scripts/engine/simulator.js";

describe("what a creature's words say it mends each round", () => {
  test("healing each round: so much, every round, whatever hurt it", () => {
    expect(mendingIn("SP infravision 60', heal 3 hp per round")).toMatchObject({ fastHealing: 3, regen: null, named: false });
    expect(mendingIn("heal 1 hp/round per head still standing")).toMatchObject({ fastHealing: 1 });
    expect(mendingIn("Its wounds heal at a rate of 2 hit points each round.").fastHealing).toBe(2);
    expect(mendingIn("It heals damage at the rate of 2 hp per round.").fastHealing).toBe(2);
    // (A spell that heals is no mending of its own.)
    expect(mendingIn("casts a spell that heals 1d6 hp").fastHealing).toBe(null);
  });

  test("regeneration: so much (the dice's average), and what stops it, as far as the words speak of it", () => {
    const r = mendingIn("SP regenerates 1d6 hp per round (but not from fire or acid), immune to cold").regen;
    expect(r).toMatchObject({ amount: 4, stoppedBy: ["fire", "acid"], burst: false });
    expect(r.dice).toEqual(parseFormula("1d6"));
    expect(mendingIn("regeneration 2/round, immune to cold, fire stops its regeneration").regen).toMatchObject({ amount: 2, stoppedBy: ["fire"] });
    expect(mendingIn("regenerates 3 hp per round").regen.stoppedBy).toEqual([]);
  });

  test("regenerating even the round it's killed: a last burst", () => {
    const words = "The mire-thing knits itself together, regenerating 1d4 hit points at the end of each round, even the round it is slain. "
      + "Its one weakness is acid, from which it does not regenerate.";
    expect(mendingIn(words).regen).toMatchObject({ amount: 3, burst: true, stoppedBy: ["acid"] });
  });

  test("long words a player wrote (a character's Notes) are read a sentence at a time, at once", () => {
    const start = Date.now();
    expect(statLine(`Regenerates 1 hp per round. ${"the troll, from which it does not ".repeat(3000)}`).regen).toMatchObject({ amount: 1, stoppedBy: [] });
    expect(statLine(`Regenerates 1d8 hp per round ${"regenerating even ".repeat(3000)}`).regen).toMatchObject({ burst: false });
    expect(Date.now() - start).toBeLessThan(1000);
  });

  test("regeneration only named (how much is in the book), and a regeneration that isn't of its hit points", () => {
    expect(mendingIn("SP stench, regeneration, immune to critical hits, vulnerable to fire")).toEqual({ regen: null, fastHealing: null, named: true });
    expect(mendingIn("SP regeneration of lost heads, heal 1 hp/round")).toEqual({ regen: null, fastHealing: 1, named: false });
    expect(statLine("Atk claw +3 melee (1d6); SP regenerates 2 hp per round; SV Fort +4, Ref +1, Will +0; AL C.")).toMatchObject({ regen: { amount: 2 }, regenNamed: false });
  });

  test("the documents a stat line links to", () => {
    expect(linksIn("Troll: Init +6 ... AL C.<br>@UUID[Compendium.book.creatures.JournalEntry.abc]{Troll} @Compendium[book.old.def]{Old}"))
      .toEqual(["Compendium.book.creatures.JournalEntry.abc", "Compendium.book.old.def"]);
  });
});

/** A world with nothing installed but the system; `entries`, the documents a stat line may link to. */
function world(entries = null) {
  globalThis.CONFIG = { DCC: {}, Item: { typeLabels: {} } };
  Object.assign(globalThis.game, {
    packs: Object.assign([], { get: () => undefined }), tables: [], actors: { filter: () => [] }, users: [],
    modules: { get: () => undefined }, settings: { get: () => { throw new Error("no such setting"); } }
  });
  if ( entries ) globalThis.fromUuid = async uuid => entries[uuid] ?? null;
  else delete globalThis.fromUuid;
}
function npc(notes) {
  const actor = {
    id: "n1", uuid: "Actor.n1", name: "Mire-thing", img: "", type: "NPC", items: [], effects: [], statuses: new Set(), flags: {},
    getFlag: () => undefined, testUserPermission: () => true, getRollData: () => ({}),
    system: {
      abilities: Object.fromEntries(["str", "agl", "sta", "per", "int", "lck"].map(k => [k, { value: 10, mod: 0 }])),
      saves: { frt: { value: "+4" }, ref: { value: "+1" }, wil: { value: "+0" } },
      attributes: { hp: { value: 30, max: 30 }, hitDice: { value: "5d8" }, speed: { value: "30'" }, init: { value: "+1" }, ac: { value: 14 }, critical: { table: "M", die: "1d8" } },
      details: { level: { value: 0 }, alignment: "c", notes: { value: notes } },
      class: {}, skills: {}, currency: {}
    }
  };
  actor.itemTypes = { weapon: [], armor: [], spell: [] };
  return actor;
}
const token = actor => ({ id: "t1", name: actor.name, actor, texture: {} });

describe("a creature's mending, given to the core", () => {
  beforeEach(() => world());

  test("its stat line's regeneration (at 0 it's dead, as any DCC monster), and its healing each round", async () => {
    const adapter = new DccAdapter();
    const regen = await adapter.toCombatantSpec(token(npc("Atk claw +3 melee (1d6); SP regenerates 1d6 hp per round, except from fire; SV Fort +4, Ref +1, Will +0; AL C.")));
    expect(regen.regen).toEqual({ amount: 4, stoppedBy: ["fire"], needsHp: true });
    expect(regen.fastHealing).toBeUndefined();
    const heals = await adapter.toCombatantSpec(token(npc("Atk sword +2 melee (1d8); SP heal 2 hp per round; SV Fort +5, Ref -2, Will +6; AL N.")));
    expect(heals).toMatchObject({ fastHealing: 2, regen: undefined });
    const none = await adapter.toCombatantSpec(token(npc("Atk bite +1 melee (1d4); SV Fort +1, Ref +1, Will +0; AL N.")));
    expect([none.regen, none.fastHealing]).toEqual([undefined, undefined]);
  });

  test("its regeneration only named: how much from its entry in a book, when that's installed; else none", async () => {
    const notes = "Atk claw +6 melee (2d6); SP regeneration, vulnerable to fire; SV Fort +8, Ref +3, Will +5; AL C.<br>@UUID[Compendium.book.creatures.JournalEntry.mire]{Mire-thing}";
    const words = "<p>It regenerates [[/roll 1d8]] hit points at the end of each round, even the round it is killed. Fire it does not regenerate from: does not regenerate damage from fire.</p>";
    world({ "Compendium.book.creatures.JournalEntry.mire": { pages: [{ text: { content: "<p>A thing of the bogs.</p>" } }, { text: { content: words } }] } });
    const read = await new DccAdapter().toCombatantSpec(token(npc(notes)));
    expect(read.regen).toEqual({ amount: 5, stoppedBy: ["fire"], burst: true, dice: parseFormula("1d8") });
    world();
    expect((await new DccAdapter().toCombatantSpec(token(npc(notes)))).regen).toBeUndefined();
  });
});

describe("a last burst, the round it's killed", () => {
  const troll = (overrides = {}) => ({ spec: { kind: "npc", level: 5, diesAtZero: true, regen: { amount: 5, stoppedBy: ["fire"], burst: true, dice: parseFormula("1d8") }, ...overrides }, status: STATUS.STANDING, hp: 0, maxHp: 40 });
  const rolling = n => ({ die: () => n });

  test("taken below 0 by less than the burst, its regeneration holds it; by as much or more, it's put down for good", () => {
    const close = troll();
    dccRules.onDropped(close, { overflow: 3, rng: rolling(6) });
    expect(close).toMatchObject({ status: STATUS.DEAD });
    expect(close.regenStopped).toBeUndefined();
    const far = troll();
    dccRules.onDropped(far, { overflow: 9, rng: rolling(6) });
    expect(far.regenStopped).toBe(true);
    // (One with no last burst: the core's regeneration as it says, nothing of the rules'.)
    const plain = troll({ regen: { amount: 2, stoppedBy: [], needsHp: true } });
    dccRules.onDropped(plain, { overflow: 0, rng: rolling(1) });
    expect(plain.regenStopped).toBeUndefined();
  });

  test("healed by its regeneration, a troll gets up again: no Stamina lost, as one bleeding out loses", () => {
    const up = { spec: { kind: "npc" }, status: STATUS.DOWN, hp: 0, maxHp: 40, held: true };
    dccRules.onHealed(up, 5);
    expect(up).toMatchObject({ status: STATUS.STANDING, hp: 5 });
    expect(up.bledOut).toBeUndefined();
  });

  test("in a fight: struck down, it may get up again; burned, it doesn't", () => {
    const traits = { tactical: { base: 60, fudge: 0 }, brave: { base: 95, fudge: 0 }, selfish: { base: 30, fudge: 0 }, loyal: { base: 70, fudge: 0 } };
    const blow = (type, n = 2) => ({ id: `blow-${type}`, name: "Blow", kind: "strike", cost: 1, bonus: 12, melee: true, reach: 5, damage: [parseFormula(`${n}d6+4`, type)] });
    const fighter = (type, n) => ({ id: "f", name: "Hero", side: "friendly", kind: "pc", level: 5, hp: { value: 200, max: 200 }, hitDie: 12, defenses: { ac: 30, frt: 6, ref: 4, wil: 4 },
      initiative: { mod: 10 }, speeds: { walk: 30 }, actions: [blow(type, n)], iwr: {}, traits, flags: { fearless: true }, diesAtZero: false, actionDice: [20], resources: {} });
    const thing = { id: "t", name: "Troll", side: "hostile", kind: "npc", level: 5, hp: { value: 12, max: 40 }, hitDie: 8, defenses: { ac: 10, frt: 4, ref: 1, wil: 0 },
      initiative: { mod: 0 }, speeds: { walk: 30 }, actions: [{ ...blow("slashing", 1), bonus: -20 }], iwr: {}, traits, flags: { fearless: true }, diesAtZero: true, actionDice: [20],
      regen: { amount: 5, stoppedBy: ["fire"], burst: true, dice: parseFormula("1d8") } };
    const battle = (type, n) => ({ combatants: [fighter(type, n), thing], sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } },
      options: { maxRounds: 3, positioning: false, aftermath: "none" } });
    let rose = 0;
    for ( let seed = 1; seed <= 20; seed++ ) {
      const { log } = replay(battle("slashing", 1), dccRules, seed);
      if ( log.some(e => e.type === "regen" && e.actorId === "t" && e.revived) ) rose += 1;
      const burned = replay(battle("fire", 1), dccRules, seed);
      expect(burned.log.some(e => e.type === "regen" && e.actorId === "t" && e.revived)).toBe(false);
    }
    expect(rose).toBeGreaterThan(0);
  });
});
