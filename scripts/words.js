/**
 * Words for the table, in its language: this module's (FFDCC in languages/). The words are in the language files,
 * never here. (What the DCC books say, their tables' rows, is read in whatever language the installed books are.)
 */
import { localize, hasWords } from "./core.js";

/** This module's words. */
export const t = (key, data = null) => localize(`FFDCC.${key}`, data);

/** A condition's name, lower case ("blinded"): this module's word for it, else its identifier. */
export const conditionName = key => (hasWords(`FFDCC.Cond.${key}`) ? t(`Cond.${key}`) : key);

/**
 * Foundry's English for a key when the reader's language is another (its fallback, as Foundry itself reads it); null
 * when the reader's language is English, or there's none.
 */
export function englishWords(key) {
  const text = globalThis.foundry?.utils?.getProperty?.(globalThis.game?.i18n?._fallback ?? {}, key);
  return typeof text === "string" ? text : null;
}

/** The words of a list in the language file (split at commas; anything but letters and digits trimmed), lower case. */
const listed = text => String(text ?? "").split(",").map(w => w.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase()).filter(Boolean);

/**
 * One of this module's word lists (FFDCC.Words.<key>), in the reader's language and in English too: a name may be in
 * either, as a book is often read untranslated (as the core reads its keywords). Empty when there's none.
 */
export function wordList(key) {
  const id = `FFDCC.Words.${key}`;
  return [...new Set([...(hasWords(id) ? listed(localize(id)) : []), ...listed(englishWords(id))])];
}

const escaped = w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does this text (a name, where the system says nothing else) hold one of a word list's words, whole, in any case?
 * @param {string} key    the list (FFDCC.Words.<key>)
 * @param {string} text
 */
export function saysWord(key, text) {
  const words = wordList(key);
  if ( !words.length || !text ) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map(escaped).join("|")})(?![\\p{L}\\p{N}])`, "iu").test(String(text));
}
