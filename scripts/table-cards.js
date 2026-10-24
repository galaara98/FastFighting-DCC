/**
 * The engine's own damage and healing rolls in a live battle (the core's showTableRoll, API 20: a stray shot's, a
 * fall's, a crit row's extra, persistent damage's ...), shown as the dcc system's Damage card, the engine's dice in it:
 * marked as FastFighting's (cards.js), so the system's Apply entries and Auto-apply leave it be, and applied through
 * applyDamageCard (the core's `card` roll kind). DCC's other cards (attack, save, check) are drawn from what the system
 * rolled itself; the engine's own of those stay the core's plain roll. Styling only: the dice and the result are the
 * engine's.
 */
import { rollJson } from "./core.js";
import { HELPER_ID } from "./cards.js";

/**
 * The roll as the dcc system's Damage card, posted. Its message's id, in a list; or null for the core's plain roll
 * (anything but damage or healing, a roll with no token, or one it couldn't make).
 * @param {object} roll      the core's table roll
 * @param {object} options   {token, target: TokenDocuments; audience: "public" | "gm"; flavor: the core's words;
 *                            flags: FastFighting's own, put on the card}
 * @returns {Promise<string[]|null>}
 */
export async function showDccTableRoll(roll, { token = null, audience = "public", flavor = "", flags = {} } = {}) {
  if ( !roll || !token?.actor || !["damage", "healing"].includes(roll.kind) ) return null;
  const json = rollJson(roll, { flavor });
  const Roller = globalThis.Roll;
  if ( !json || typeof Roller?.fromData !== "function" ) return null;
  const dice = Roller.fromData(json);
  const Message = globalThis.CONFIG?.ChatMessage?.documentClass ?? globalThis.ChatMessage;
  const message = await dice.toMessage({
    speaker: Message?.getSpeaker?.({ token, actor: token.actor }) ?? { token: token.id, actor: token.actor.id },
    flavor,
    flags: { ...flags, dcc: { RollType: "Damage", damageApplied: true }, [HELPER_ID]: { rolled: true, ...(roll.kind === "healing" ? { healing: true } : {}) } }
  }, { messageMode: audience === "gm" ? "gm" : "public" });
  return message?.id ? [message.id] : null;
}
