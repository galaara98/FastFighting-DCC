/**
 * Words for the table, in its language: this module's (FFDCC in languages/), English without Foundry (the tests).
 * (What the DCC books say, their tables' rows, is read in whatever language the installed books are.)
 */
import { localize } from "./core.js";

/** This module's words. */
export const t = (key, english, data = null) => localize(`FFDCC.${key}`, english, data);

/** A condition's name, lower case ("blinded"). */
export const conditionName = key => t(`Cond.${key}`, key);
