/**
 * The Lore-Collector's payoff for sizing a foe up in DCC: how much likelier its next rolls are to succeed, a
 * world setting from 1.25× to 3×. The default: an Intelligence check takes the whole turn, though deed dice and Luck already swing a fight hard.
 */
import { numberSetting } from "./core.js";

export const LORE_BOOST = Object.freeze({ min: 1.25, max: 3, step: 0.05, default: 2.25 });
const MODULE_ID = "fast-fighting-dcc";

const setting = numberSetting(MODULE_ID, "loreBoost", {
  ...LORE_BOOST, name: "FFDCC.Settings.loreBoost.Name", hint: "FFDCC.Settings.loreBoost.Hint"
});

/** Register the setting (on init). */
export const registerLoreBoost = setting.register;

/** The world's setting, within its bounds (the default if there's none to read). */
export const loreBoost = setting.read;
