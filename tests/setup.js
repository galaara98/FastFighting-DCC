/**
 * Every test runs as a Foundry client in English would: game.i18n reads this module's languages/en.json and
 * FastFighting Core's, fresh for each test (a test may add to globalThis.game, or replace it, as it needs); the books
 * are read by reading/en.json, as the module loads it at startup (a test may set other words, as it needs).
 */
import { beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fakeI18n } from "./foundry-i18n.js";
import { setReading } from "../scripts/reading.js";

const english = JSON.parse(readFileSync(new URL("../reading/en.json", import.meta.url), "utf8"));

const install = () => {
  globalThis.game = { i18n: fakeI18n() };
  setReading(english);
};
install();
beforeEach(install);
