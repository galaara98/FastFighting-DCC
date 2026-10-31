/**
 * What the dcc system added since 0.70.74, as FastFighting meets it: an NPC its sheet marks as never checking morale
 * (0.70.77), the system's half-HP morale prompt left out of a live battle, and its Death Clock's cards taken with
 * their character's turn (core API 40 systemTurnCard). The Death Clock's words here are written for these tests.
 */
import { describe, expect, test } from "vitest";
import { dccRules } from "../scripts/rules.js";
import { deriveDccTraits } from "../scripts/traits.js";
import { dccTactics } from "../scripts/auto.js";
import { inLiveBattle, quietMoralePrompt, deathClockCard } from "../scripts/system-cards.js";
import { DccAdapter } from "../scripts/adapter.js";
import { MORALE } from "../scripts/core.js";
import { prepareBattle } from "../../FastFighting/scripts/engine/simulator.js";
import { createRun } from "../../FastFighting/scripts/engine/battle-state.js";
import { text } from "./foundry-i18n.js";

const unit = (extra = {}) => ({
  id: "u", side: "hostile", kind: "npc", level: 1, hp: { value: 6, max: 6 }, hitDie: 6, defenses: { ac: 12, frt: 0, ref: 0, wil: 0 },
  initiative: { mod: 0 }, speeds: { walk: 30 }, actions: [], iwr: {}, flags: {}, diesAtZero: true, actionDice: [20], ...extra
});
const battle = combatants => ({ combatants, sides: { friendly: { label: "Party", enemies: ["hostile"] }, hostile: { label: "Foes", enemies: ["friendly"] } }, options: { positioning: false, maxRounds: 3 } });

describe("never checks morale (the sheet's mark)", () => {
  test("read off the sheet as a flag; its morale always holds", () => {
    expect(deriveDccTraits({ pc: false, level: 2, will: 0, noMorale: true }).flags.noMorale).toBe(true);
    expect(deriveDccTraits({ pc: false, level: 2, will: 0 }).flags.noMorale).toBeUndefined();
    const run = createRun(prepareBattle(battle([unit({ id: "a", side: "friendly", kind: "pc" }), unit({ id: "o", hp: { value: 2, max: 20 }, flags: { noMorale: true } })]), dccRules));
    expect(dccRules.morale(run, run.byId.get("o"))).toBe(MORALE.HOLD);
  });

  test("set up never to flee, saying why", () => {
    expect(dccTactics({ name: "Bandit", noMorale: true, will: 0, level: 1 }).retreat).toEqual({ value: "never", why: text("FFDCC.Reason.NoMorale") });
  });
});

describe("the system's half-HP morale prompt", () => {
  const combat = (live, actors) => ({ getFlag: (scope, key) => (scope === "fast-fighting" && key === "live" ? { active: live } : undefined), combatants: actors.map(actor => ({ actor })) });
  const orc = { uuid: "Scene.s.Token.t.Actor.orc", type: "NPC" };
  const hero = { uuid: "Actor.hero", type: "Player" };

  test("an NPC in a live battle: no prompt (the option the system compares by is taken off)", () => {
    globalThis.game.combats = [combat(true, [orc, hero])];
    const options = { dccMoraleHpBefore: 10, diff: true };
    quietMoralePrompt(orc, { system: { attributes: { hp: { value: 4 } } } }, options);
    expect(options).toEqual({ diff: true });
  });

  test("otherwise left as the system set it: no live battle, or one it isn't in, or a character", () => {
    globalThis.game.combats = [combat(false, [orc])];
    const options = { dccMoraleHpBefore: 10 };
    quietMoralePrompt(orc, {}, options);
    expect(options.dccMoraleHpBefore).toBe(10);
    globalThis.game.combats = [combat(true, [hero])];
    expect(inLiveBattle(orc)).toBe(false);
    quietMoralePrompt(orc, {}, options);
    expect(options.dccMoraleHpBefore).toBe(10);
    const theirs = { dccMoraleHpBefore: 3 };
    quietMoralePrompt(hero, {}, theirs);
    expect(theirs.dccMoraleHpBefore).toBe(3);
  });
});

describe("the Death Clock's cards, taken with their character's turn", () => {
  const words = {
    "DCC.DeathClockStarted": "{name} falls, bleeding: {rounds} round(s) left.",
    "DCC.DeathClockLastChance": "{name} has one round left to be healed.",
    "DCC.DeathClockExpired": "{name} has bled to death.",
    "DCC.DeathClockSaved": "{name} lives, scarred: {scar}"
  };
  const fill = (s, data) => s.replace(/\{(\w+)\}/g, (m, k) => (k in data ? String(data[k]) : m));
  const setUp = () => {
    globalThis.game.i18n = { ...globalThis.game.i18n, has: k => k in words, format: (k, data) => fill(words[k] ?? k, data) };
    globalThis.game.actors = new Map([["hero", { id: "hero", name: "Dwarf", type: "Player" }], ["orc", { id: "orc", name: "Orc", type: "NPC" }]]);
  };
  const card = (content, { actor = "hero", rolls = [] } = {}) => ({ content, rolls, speaker: { actor } });

  test("each of its cards, for the character it speaks for", () => {
    setUp();
    expect(deathClockCard(card("Dwarf falls, bleeding: 3 round(s) left."))).toBe(true);
    expect(deathClockCard(card("<p>Dwarf has one round left to be healed.</p>"))).toBe(true);
    expect(deathClockCard(card("Dwarf has bled to death.<div class=\"dcc-death-clock-actions\"><button type=\"button\">Roll</button></div>"))).toBe(true);
    expect(deathClockCard(card("Dwarf lives, scarred: a long scar across the face"))).toBe(true);
    expect(new DccAdapter().systemTurnCard(card("Dwarf has bled to death."))).toBe(true);
  });

  test("nothing else: another's words, a roll, a creature, a card of words alone", () => {
    setUp();
    expect(deathClockCard(card("Elf has bled to death."))).toBe(false);
    expect(deathClockCard(card("Dwarf has bled to death.", { rolls: [{ total: 3 }] }))).toBe(false);
    expect(deathClockCard(card("Orc has bled to death.", { actor: "orc" }))).toBe(false);
    expect(deathClockCard(card("Hold the line!"))).toBe(false);
    expect(deathClockCard(card(""))).toBe(false);
  });
});
