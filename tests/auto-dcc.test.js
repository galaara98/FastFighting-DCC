/** Setting a character up by itself, as DCC reads it: the class sheet, alignment, a monster's stat line. */
import { describe, expect, test } from "vitest";
import { dccHints, dccTactics } from "../scripts/auto.js";

describe("the playstyles DCC says fit", () => {
  test("a class, by the class sheet (XCC's too; every Specialist a thief)", () => {
    expect(dccHints({ cls: "warrior" })).toMatchObject({ brawler: 0.4, tank: 0.2 });
    expect(dccHints({ cls: "sp-scout" }).thief).toBe(0.5);
    expect(dccHints({ cls: "gnome" }).tank).toBe(0.5);
    expect(dccHints({ cls: "zero-level" }).fragile).toBe(0.3);
  });

  test("an alignment; a monster's stat line: un-dead, demons and devils", () => {
    expect(dccHints({ alignment: "c" })).toMatchObject({ cruel: 0.15, wildcard: 0.2 });
    expect(dccHints({ undead: true, mindless: true }).relentless).toBeCloseTo(0.7);
    expect(dccHints({ unholy: true }).cruel).toBe(0.4);
    expect(dccHints({ alignment: "n" })).toEqual({});
  });
});

describe("DCC's answers to the tactics questions", () => {
  test("a class's style; a gnome guards; a funnel peasant runs when hurt; the un-dead never", () => {
    expect(dccTactics({ cls: "wizard" }).style).toBe("caster");
    expect(dccTactics({ cls: "gnome" })).toMatchObject({ style: "protector", target: "protect" });
    expect(dccTactics({ cls: "zero-level" }).retreat).toBe("hurt");
    expect(dccTactics({ undead: true }).retreat).toBe("never");
  });
});
