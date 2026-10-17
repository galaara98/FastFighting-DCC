/**
 * A player's turn in a live battle, read from the chat cards the dcc system made for it (its flags: dcc.isToHit and
 * the rest): what FastFighting's engine would have logged, so the turn is told like any other.
 *   - An attack roll: at whom (the target the card names), with what, a hit, a critical, a fumble or a miss; its
 *     damage, rolled with it or from the card's Damage button or inline damage roll (the sheets settle how much).
 *   - A Personality check: words, for the GM to confirm (whether it was talk at all, at whom and how well).
 * Each event says whether it's `sure`.
 *
 * And one card's damage as it's made (readDccDamage), for the core to apply in a live battle or put before a GM.
 */
import { tokenIdIn as tokenIdOf, parseTypedFormula } from "./core.js";

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
 * The flavor the dcc system gives an attack card's inline damage roll (its DAMAGE_INLINE_FLAVOR). A mark, not words:
 * the same in every language.
 */
const INLINE_DAMAGE = "Damage";

/** A damage roll on a card of its own: an attack card's Roll Damage button (dcc.RollType "Damage") or its inline damage roll. */
const laterDamage = m => flag(m, "RollType") === "Damage" || m.flavor === INLINE_DAMAGE;

/** A card that carries an attack (or a stray shot into melee) and, rolled with it, maybe its damage. */
const attackCard = m => !!(flag(m, "isToHit") || flag(m, "isFriendlyFire"));

/** An attack that lands nothing: a miss the card knows of, a fumble, a natural 1 of two-weapon fighting. */
const missed = m => flag(m, "hitsTarget") === false || !!flag(m, "isFumble") || !!flag(m, "twoWeaponFumble");

/**
 * A healing roll, by its formula: typed healing ("2d6[healing]"), with nothing typed otherwise. DCC marks no roll as
 * healing (its Apply Healing is the GM's choice), so a healing roll says so itself.
 */
function healing(roll) {
  const parts = parseTypedFormula(roll?.formula ?? "");
  return parts.some(p => p.type === "healing") && parts.every(p => ["healing", "untyped"].includes(p.type));
}

/** What a roll deals: {amount, kind}; damage at least 1, as the system has it. Null for nothing. */
function dealtBy(roll) {
  if ( !roll ) return null;
  const total = Number(roll.total) || 0;
  const kind = healing(roll) ? "healing" : "damage";
  const amount = kind === "damage" ? Math.max(1, total) : total;
  return amount > 0 ? { amount, kind } : null;
}

/**
 * What a card deals, as the dcc system marks it: an attack's (or a stray shot's) damage rolled with it, unless it
 * missed; the attack card's Roll Damage button or inline damage roll; or a roll typed healing. {amount, kind}, or null.
 * @param {ChatMessage} m
 */
export function damageOf(m) {
  if ( !m ) return null;
  if ( attackCard(m) ) return missed(m) ? null : dealtBy(rollMarked(m, "dcc.isDamageRoll"));
  const roll = m.rolls?.[0];
  if ( laterDamage(m) ) return dealtBy(roll);
  return roll && healing(roll) ? dealtBy(roll) : null;
}

/** Whether two cards are one speaker's: the same token, or, where either names none, the same actor. */
function sameSpeaker(a, b) {
  const [x, y] = [a.speaker ?? {}, b.speaker ?? {}];
  if ( x.token && y.token ) return x.token === y.token;
  return !!x.actor && x.actor === y.actor;
}

/** How many cards back a damage card's attack is looked for. */
const LOOKBACK = 30;

/**
 * The attack card a later damage roll was rolled for: the same speaker's last attack before it that may have hit and
 * has no damage of its own yet (its damage left to the button), or null.
 */
function attackBefore(m, messages) {
  const at = messages.findIndex(x => x === m || (!!m.id && x.id === m.id));
  const earlier = (at >= 0 ? messages.slice(0, at) : messages).slice(-LOOKBACK).reverse();
  return earlier.find(x => flag(x, "isToHit") && sameSpeaker(x, m) && !missed(x) && !rollMarked(x, "dcc.isDamageRoll")) ?? null;
}

/**
 * The token on the scene an actor's uuid names: an unlinked token's own (its uuid has it); a linked actor's token,
 * one of the battle's first. Null when it isn't on the scene.
 */
function tokenFor(uuid, ids, scene) {
  const own = tokenIdOf(uuid);
  if ( own ) return own;
  const actorId = actorIdOf(uuid);
  if ( !actorId || !scene?.tokens ) return null;
  const ofActor = id => scene.tokens.get?.(id)?.actorId === actorId;
  return Object.keys(ids).find(ofActor) ?? [...scene.tokens].find(t => t.actorId === actorId)?.id ?? null;
}

/**
 * A card's damage, for a live battle: {amount, kind: "damage"|"healing", targets: [tokenId], save}, or null. The target
 * is the one the attack card names (for a later damage roll, its attack's); none when it names none. Null when it
 * names one who isn't on the scene. DCC's damage rolls come with no save.
 * @param {ChatMessage} message
 * @param {object} context     {ids: {tokenId: unit id}, messages: the chat, oldest first, scene}
 */
export function readDccDamage(message, { ids = {}, messages = [], scene = null } = {}) {
  const dealt = damageOf(message);
  if ( !dealt ) return null;
  const attack = attackCard(message) ? message : laterDamage(message) ? attackBefore(message, messages) : null;
  const uuid = attack ? flag(attack, "targetUuid") : null;
  const target = uuid ? tokenFor(uuid, ids, scene) : null;
  if ( uuid && !target ) return null;
  return { ...dealt, targets: target ? [target] : [], save: false };
}

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
    } else if ( laterDamage(m) ) {
      // (The card's Damage button, or its inline damage roll: the last hit with no damage yet.)
      const strike = [...events].reverse().find(e => e.type === "attack" && e.degree >= 2 && !e.damage);
      if ( strike ) strike.damage = Math.max(1, Number(roll?.total) || 0);
    } else if ( flag(m, "isAbilityCheck") && flag(m, "Ability") === "per" ) {
      // (Words: whether it was talk at all, at whom and how well, the GM says.)
      events.push({ type: "talk", targetId: null, kind: "persuade", skill: m.flavor ?? "", degree: null, natural: naturalOf(m, roll), total: roll?.total ?? null, sure: false });
    }
  }
  return events;
}
