/**
 * A player's turn in a live battle, read from the chat cards the dcc system made for it (its flags: dcc.isToHit and
 * the rest): what FastFighting's engine would have logged, so the turn is told like any other.
 *   - An attack roll: at whom (the target the card names), with what, a hit, a critical, a fumble or a miss; its
 *     damage, rolled with it or from the card's Damage button (the sheets settle how much).
 *   - A Personality check: words, for the GM to confirm (whether it was talk at all, at whom and how well).
 * Each event says whether it's `sure`.
 */
import { tokenIdIn as tokenIdOf } from "./core.js";

/** A flag on a dcc card, as the system wrote it ("dcc.isToHit"), however it was stored. */
const flag = (m, key) => m.flags?.dcc?.[key] ?? m.flags?.[`dcc.${key}`];

/** The actor id at the end of a world actor's uuid ("Actor.z"), or null. */
const actorIdOf = uuid => (typeof uuid === "string" && uuid.startsWith("Actor.") ? uuid.split(".")[1] : null);

/** The natural roll of the action die (a d20, or whatever die the dice chain gave). */
function naturalOf(m, roll) {
  const n = flag(m, "libResult")?.natural;
  return Number.isFinite(n) ? n : (roll?.dice?.[0]?.total ?? null);
}

/** One of a card's rolls by the dcc system's mark on it ("dcc.isDamageRoll"). */
const rollMarked = (m, key) => (m.rolls ?? []).find(r => r?.options?.[key] || r?.options?.dcc?.[key.slice(4)]);

/**
 * @param {ChatMessage[]} messages  the cards made during the turn, oldest first
 * @param {object} context          {tokenId, actorId, ids: {tokenId: battle id}, actors: {actorId: battle id}}
 * @returns {object[]} engine log events, each with `sure`
 */
export function readDccTurn(messages, { tokenId, actorId = null, ids = {}, actors = {} } = {}) {
  const events = [];
  const mine = m => m.speaker?.token === tokenId || (!m.speaker?.token && actorId && m.speaker?.actor === actorId);
  const whom = uuid => ids[tokenIdOf(uuid)] ?? actors[actorIdOf(uuid)] ?? null;
  for ( const m of messages ) {
    if ( !mine(m) ) continue;
    const roll = m.rolls?.[0] ?? null;
    if ( flag(m, "isToHit") ) {
      // (At no one the card names: nothing to tell.)
      const target = whom(flag(m, "targetUuid"));
      if ( !target ) continue;
      const known = flag(m, "hitsTarget") !== undefined && flag(m, "hitsTarget") !== null;
      const fumble = !!flag(m, "isFumble");
      // (A critical hits, unless its die's range needs a hit too.)
      const crit = !!flag(m, "isCrit") && (!flag(m, "critNeedsHit") || !!flag(m, "hitsTarget"));
      const hit = !fumble && (crit || !!flag(m, "hitsTarget"));
      const melee = flag(m, "isMelee") !== false;
      const weapon = m.system?.weaponId ? globalThis.game?.actors?.get?.(m.system.actorId ?? "")?.items?.get?.(m.system.weaponId) : null;
      const thrown = !melee && !!weapon?.system?.thrown;
      const damage = rollMarked(m, "dcc.isDamageRoll");
      events.push({
        type: "attack", targetId: target, action: m.system?.weaponName ?? "", degree: crit ? 3 : hit ? 2 : fumble ? 0 : 1,
        natural: naturalOf(m, roll), total: roll?.total ?? null, dc: null, margin: 0, melee, ranged: !melee, launched: !melee && !thrown, thrown,
        damage: hit && damage ? Math.max(1, Number(damage.total) || 0) : 0, crit, sure: known
      });
    } else if ( flag(m, "RollType") === "Damage" ) {
      // (The card's Damage button: the last hit with no damage yet.)
      const strike = [...events].reverse().find(e => e.type === "attack" && e.degree >= 2 && !e.damage);
      if ( strike ) strike.damage = Math.max(1, Number(roll?.total) || 0);
    } else if ( flag(m, "isAbilityCheck") && flag(m, "Ability") === "per" ) {
      // (Words: whether it was talk at all, at whom and how well, the GM says.)
      events.push({ type: "talk", targetId: null, kind: "persuade", skill: m.flavor ?? "", degree: null, natural: naturalOf(m, roll), total: roll?.total ?? null, sure: false });
    }
  }
  return events;
}
