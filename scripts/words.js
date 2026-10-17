/**
 * Words for the table, in its language: this module's (FFDCC in languages/). The words are in the language files,
 * never here. (What the DCC books say, their tables' rows, is read in whatever language the installed books are.)
 */
import { localize, hasWords, parseTypedFormula, wordList as coreWordList, saysWord as coreSaysWord } from "./core.js";

/** This module's words. */
export const t = (key, data = null) => localize(`FFDCC.${key}`, data);

/**
 * A condition's name: this module's word for it, lower case ("blinded"); else `other` (the system's name for its
 * status, say), else its identifier.
 */
export const conditionName = (key, other = null) => (hasWords(`FFDCC.Cond.${key}`) ? t(`Cond.${key}`) : other ?? key);

/**
 * One of this module's word lists (FFDCC.Words.<key>), in the reader's language and in English too: a name may be in
 * either, as a book is often read untranslated (the core's wordList). Empty when there's none.
 */
export const wordList = key => coreWordList(`FFDCC.Words.${key}`);

/**
 * Does this text (a name, where the system says nothing else) hold one of a word list's words, whole, in any case?
 * @param {string} key    the list (FFDCC.Words.<key>)
 * @param {string} text
 */
export const saysWord = (key, text) => coreSaysWord(wordList(key), text);

/** The kinds of harm a weapon's name can say it does, the first that fits first. */
const HARMS = ["piercing", "bludgeoning", "slashing"];

/** The kind of harm a weapon's name says it does (the language file's words, FFDCC.Words.Damage), else untyped. */
export const harmNamed = name => HARMS.find(k => saysWord(`Damage.${k}`, name)) ?? "untyped";

/**
 * A weapon's damage: the kind its formula names; where it names none (DCC's weapons don't say whether they cut, pierce
 * or crush), the kind its name says (harmNamed). A blow the system marks as subdual is a subdual blow (the action says
 * so), not a kind of harm.
 */
export function harmOf(formula, name) {
  const named = harmNamed(name);
  return parseTypedFormula(formula).map(p => (["untyped", "subdual"].includes(p.type) ? { ...p, type: named } : p));
}
