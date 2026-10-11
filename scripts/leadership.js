/**
 * DCC leadership: who leads a side, and what that's worth. DCC has no social skills: a leader is someone with
 * presence (Personality), standing (a title such as king, thane or captain, or a cleric of the side's faith) and
 * experience (level or hit dice).
 * Pure.
 */
import { t } from "./words.js";
const TITLE = /\b(?:king|queen|thane|jarl|chief(?:tain)?|captain|lord|lady|prince(?:ss)?|duke|baron|commander|general|high priest(?:ess)?|leader|boss|master|mistress|sergeant)\b/i;

/**
 * @param {object[]} entries  [{id, name, level, personality (modifier), cleric}]
 * @returns {{id, score, reason, bonus}[]} best first
 */
export function rankDccLeaders(entries) {
  const out = [];
  for ( const e of entries ) {
    if ( !e ) continue;
    const reasons = [];
    let score = (e.personality ?? 0) + Math.floor((e.level ?? 0) / 3);
    if ( e.personality ) reasons.push(t("Lead.Personality", { n: `${e.personality >= 0 ? "+" : ""}${e.personality}` }));
    if ( TITLE.test(e.name ?? "") ) {
      score += 3;
      reasons.push(t("Lead.Title"));
    }
    if ( e.cleric ) {
      score += 1;
      reasons.push(t("Lead.Cleric"));
    }
    if ( (e.level ?? 0) >= 3 ) reasons.push(t("Lead.Level", { n: e.level }));
    out.push({ id: e.id, score, reason: reasons.join("; ") || t("Lead.Nobody"), bonus: leaderBonus(score) });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function leaderBonus(score) {
  if ( score >= 5 ) return { brave: 20, tacticalFloor: 55, attack: 0, ac: 0 };
  if ( score >= 3 ) return { brave: 15, tacticalFloor: 45, attack: 0, ac: 0 };
  if ( score >= 1 ) return { brave: 10, tacticalFloor: 35, attack: 0, ac: 0 };
  return { brave: 5, tacticalFloor: 0, attack: 0, ac: 0 };
}
