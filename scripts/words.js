/**
 * Words for the table, in its language: this module's (FFDCC in languages/). The words are in the language files,
 * never here. (What the DCC books say, their tables' rows, is read in whatever language the installed books are.)
 */
import { localize, hasWords, wordList as coreWordList, saysWord as coreSaysWord } from "./core.js";

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
