/**
 * Words for the table, in its language: this module's (FFDCC in languages/). The words are in the language files,
 * never here. (What the DCC books say, their tables' rows, is read in whatever language the installed books are.)
 */
import { localize, hasWords } from "./core.js";

/** This module's words. */
export const t = (key, data = null) => localize(`FFDCC.${key}`, data);

/** A condition's name, lower case ("blinded"): this module's word for it, else its identifier. */
export const conditionName = key => (hasWords(`FFDCC.Cond.${key}`) ? t(`Cond.${key}`) : key);
