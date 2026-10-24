/**
 * The reading files (reading.js): reading/en.json is sound, every pattern in it compiles, and a translation's words
 * are read over the English, the English filling whatever it lacks.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { mergeReading, setReading } from "../scripts/reading.js";
import { targetsIn, outcomeIn, statLine, saveIn } from "../scripts/text.js";

const english = JSON.parse(readFileSync(new URL("../reading/en.json", import.meta.url), "utf8"));

/** Every pattern string in the file: the sections' values, and regenStops' patterns. */
function patterns(words) {
  const out = [];
  for ( const [key, value] of Object.entries(words) ) {
    if ( key.startsWith("$") || typeof value !== "object" ) continue;
    if ( key === "regenStops" ) out.push(...value.map(s => s.pattern));
    else if ( !Array.isArray(value) ) out.push(...Object.values(value).filter(v => typeof v === "string"));
  }
  return out;
}

/** A pattern with its {pieces} put in, as text.js puts them in (the code's dice notation stood in for). */
const expand = p => p.replace(/\{([A-Za-z]+)\}/g, (m, k) => {
  if ( k === "dice" ) return "(?<dice>\\d+)";
  if ( k === "formula" || k === "mode" ) return "(?:x)";
  return english.parts[k] !== undefined ? `(?:${english.parts[k]})` : m;
});

describe("reading/en.json", () => {
  test("its sections, and every pattern compiles", () => {
    for ( const key of ["parts", "numbers", "saveNames", "damageTypes", "immunities", "conditions", "saveVs", "statLine", "riders"] ) expect(english[key], key).toBeTypeOf("object");
    expect(Array.isArray(english.regenStops)).toBe(true);
    const all = patterns(english);
    expect(all.length).toBeGreaterThan(100);
    for ( const p of all ) expect(() => new RegExp(expand(p)), p).not.toThrow();
  });
});

describe("mergeReading", () => {
  test("a list: the translation's first, then the English; an object: the English with the translation's on top", () => {
    const merged = mergeReading({ regenStops: [{ id: "en" }], numbers: { a: 1, b: 2 }, $comment: "x" }, { regenStops: [{ id: "de" }], numbers: { b: 3 } });
    expect(merged.regenStops.map(e => e.id)).toEqual(["de", "en"]);
    expect(merged.numbers).toEqual({ a: 1, b: 3 });
    expect(merged.$comment).toBeUndefined();
  });

  test("nothing read: nothing to read by", () => {
    expect(mergeReading()).toEqual({});
    expect(mergeReading({ kindJoiners: [] }).kindJoiners).toEqual([]);
  });
});

describe("a second language", () => {
  const local = {
    numbers: { zwei: 2 },
    conditions: { blinded: "\\bgeblendet\\b" },
    statLine: { crit: "(" }
  };

  test("its words are read, and the English fills what it lacks", () => {
    setReading(mergeReading(english, local));
    // A word it adds, beside the English ones.
    expect(targetsIn("up to zwei targets")).toEqual({ targets: 2, area: true });
    expect(targetsIn("up to two targets")).toEqual({ targets: 2, area: true });
    // A pattern it gives in place of the English one.
    expect(outcomeIn("the foe is geblendet")).toMatchObject({ conditions: { blinded: 1 } });
    expect(outcomeIn("the foe is blinded")).toBeNull();
    // What it doesn't give, the English.
    expect(outcomeIn("the foe falls prone")).toMatchObject({ conditions: { prone: 1 } });
    expect(saveIn("a DC 12 Fort save")).toMatchObject({ type: "frt", dc: 12 });
  });

  test("a pattern of its that doesn't compile never matches; the rest is read", () => {
    setReading(mergeReading(english, local));
    const line = statLine("Atk claw +3 melee (1d4); SP infravision 60', crit on 19-20; SV Fort +2");
    expect(line.critNatural).toBeUndefined();
    expect(line.infravision).toBe(60);
    expect(line.attacks).toHaveLength(1);
  });

  test("before anything is read, nothing is read and nothing fails", () => {
    setReading({});
    expect(statLine("Atk claw +3 melee (1d4); SP immune to cold")).toMatchObject({ immune: [], attacks: [] });
    expect(outcomeIn("the foe is blinded")).toBeNull();
  });
});
