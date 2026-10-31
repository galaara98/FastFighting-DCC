/**
 * The dcc system's own cards, as a live battle meets them:
 *   - Its half-HP morale prompt (dcc 0.70.77, morale.mjs): an NPC in a live battle has its morale played by
 *     FastFighting (rules.js morale), so the system isn't asked to prompt the GM for it. The system carries the HP before
 *     an update on the update's options (`dccMoraleHpBefore`, set in its preUpdateActor, which it registers as it
 *     loads, before any module's); taken off again here, there's nothing for its updateActor to compare.
 *   - Its Death Clock's cards (death-clock.mjs: started, last chance, bled out, saved, revived): posted by itself as
 *     rounds go and hit points change, a plain announcement with no roll or flavor. The core takes them with their
 *     character's turn for Rewind (systemTurnCard, core API 40). Known by the system's own words for its character,
 *     in whatever language the world is in.
 */
import { MODULE_ID } from "./core.js";

/** The option the dcc system's half-HP morale prompt reads its HP before from (morale.mjs HP_BEFORE_OPTION). */
const HP_BEFORE_OPTION = "dccMoraleHpBefore";

/** The Death Clock's cards, by their language keys in the dcc system (death-clock.mjs postDeathClockCard). */
const DEATH_CLOCK_CARDS = Object.freeze(["DCC.DeathClockStarted", "DCC.DeathClockLastChance", "DCC.DeathClockExpired",
  "DCC.DeathClockInstantDeath", "DCC.DeathClockSaved", "DCC.DeathClockStopped", "DCC.DeathClockRevived"]);

/** Is a combat a live battle of FastFighting's? (Its flag, the core's liveOn.) */
const liveCombat = combat => !!combat?.getFlag?.("fast-fighting", "live")?.active;

/** Is an actor in a live battle: one of a live combat's combatants (a token's own actor, or a linked one)? */
export function inLiveBattle(actor, combats = globalThis.game?.combats) {
  const uuid = actor?.uuid;
  if ( !uuid ) return false;
  for ( const combat of combats ?? [] ) {
    if ( !liveCombat(combat) ) continue;
    if ( combat.combatants?.some?.(c => c.actor?.uuid === uuid) ) return true;
  }
  return false;
}

/**
 * preUpdateActor: an NPC in a live battle gets no half-HP morale prompt from the system (FastFighting plays its
 * morale). Anything else is left as the system set it.
 */
export function quietMoralePrompt(actor, changes, options) {
  if ( actor?.type !== "NPC" || !options || !(HP_BEFORE_OPTION in options) ) return;
  try {
    if ( inLiveBattle(actor) ) delete options[HP_BEFORE_OPTION];
  } catch ( err ) {
    console.warn(`${MODULE_ID} | couldn't check the system's morale prompt`, err);
  }
}

/** A card's words, without its markup: the text the reader sees. */
function plainOf(html) {
  const text = String(html ?? "");
  if ( typeof DOMParser === "function" ) return new DOMParser().parseFromString(text, "text/html").body.textContent ?? "";
  return text.replace(/<[^>]*>/g, "");
}

/**
 * Is a chat card one of the Death Clock's, for the character it speaks for? No roll, a Player speaking, its words
 * opening as the system's own for that character's name do (the key's other values, its rounds or scar, come after
 * the name, so the words up to the first of them are compared).
 * @param {ChatMessage} message
 */
export function deathClockCard(message) {
  if ( !message || message.rolls?.length ) return false;
  const actor = message.speakerActor ?? globalThis.game?.actors?.get?.(message.speaker?.actor ?? "") ?? null;
  if ( actor?.type !== "Player" ) return false;
  const said = plainOf(message.content).trim();
  if ( !said ) return false;
  const i18n = globalThis.game?.i18n;
  const escape = globalThis.foundry?.utils?.escapeHTML ?? (s => s);
  for ( const key of DEATH_CLOCK_CARDS ) {
    if ( !i18n?.has?.(key) ) continue;
    const words = plainOf(i18n.format(key, { name: escape(actor.name), rounds: "\u0000", scar: "\u0000" }));
    const opening = words.split("\u0000")[0].trim();
    if ( opening && said.startsWith(opening) ) return true;
  }
  return false;
}
