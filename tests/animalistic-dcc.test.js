/**
 * Whether a DCC creature fights as an animal (the core's spec.animalistic): a beast, or animal wits (Intelligence 11
 * or less where the sheet says) with no language; never a mindless one or a character.
 */
import { expect, test } from "vitest";
import { animalisticOf } from "../scripts/traits.js";

test("a beast; or dim wits and no language", () => {
  expect(animalisticOf({ beast: true })).toBe(true);
  expect(animalisticOf({ int: 4, languages: [] })).toBe(true);
  expect(animalisticOf({ int: 4, languages: ["common"] })).toBe(false);
  expect(animalisticOf({ int: 14, languages: [] })).toBe(false);
  expect(animalisticOf({ languages: [] })).toBe(false); // (no Intelligence on its sheet: no telling)
});

test("never a mindless one, never a character", () => {
  expect(animalisticOf({ beast: true, mindless: true })).toBe(false);
  expect(animalisticOf({ pc: true, beast: true })).toBe(false);
});
