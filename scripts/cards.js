/**
 * The damage cards FastFighting rolls in a live battle's turns (rollStrike's attack cards, rollDamage's Damage cards),
 * which it applies itself: each marked as its own (flags["fast-fighting-dcc"].rolled) and as applied (dcc.damageApplied,
 * so the system's Auto-apply damage leaves it be), so the chat menu's Apply Damage and Apply Healing, which would apply
 * it a second time to the tokens selected, are gone from it. The mark counts only on a card a GM made: anyone may put
 * any flag on their own card. A card whose damage the live battle applied itself, whoever made it (a player's damage
 * card applied for them), loses them too in the browser of the GM who plays the battle: by the ids the core noted as it
 * applied them (its damageApplied). A card the table settles itself after all (the core's leaveToTable, API 21: a
 * player's character's at another, Apply players' damage off) loses both marks (unmarkRolled), its Apply back.
 */
import { damageApplied } from "./core.js";

/** This module's id: its flags' scope. */
export const HELPER_ID = "fast-fighting-dcc";

/** The chat menu's entries that apply a card's total to the tokens selected (the dcc system's chat.js). */
const APPLY_ENTRIES = new Set(["DCC.ChatContextDamage", "DCC.ChatContextHealing"]);

/** Is this card one FastFighting rolled for its own turn? Its mark, on a card a GM made (FastFighting rolls as the GM). */
export const rolledHere = message => !!message?.flags?.[HELPER_ID]?.rolled && !!message?.author?.isGM;

/** Is FastFighting's the say on this card's damage: its own mark on a GM's card, or a card the live battle applied? */
export const handled = message => rolledHere(message) || damageApplied(message);

/**
 * A card of FastFighting's it won't apply after all, the table settling it: its marks off, so the system's Apply
 * entries, and its Auto-apply damage, are back for it. Only on a card a GM made and FastFighting marked.
 */
export async function unmarkRolled(message) {
  if ( !rolledHere(message) || typeof message?.unsetFlag !== "function" ) return;
  await message.unsetFlag(HELPER_ID, "rolled");
  await message.unsetFlag("dcc", "damageApplied");
}

/** The chat's menu (getChatMessageContextOptions): the system's Apply Damage and Apply Healing not on a card of FastFighting's. */
export function hideApplyMenu(app, options) {
  for ( const entry of Array.isArray(options) ? options : [] ) {
    if ( !APPLY_ENTRIES.has(entry?.label) || typeof entry.visible !== "function" ) continue;
    const visible = entry.visible;
    entry.visible = li => {
      const id = li?.dataset?.messageId ?? li?.closest?.("[data-message-id]")?.dataset?.messageId;
      return !handled(globalThis.game?.messages?.get?.(id)) && visible(li);
    };
  }
}
