/**
 * A spell's damage in a live battle (core API 19 rollDamage), rolled the dcc system's way: a spell a save resists, or
 * one that simply lands, in a turn FastFighting plays, its damage rolled once for all it catches, as the attack card's
 * Roll Damage button rolls a weapon's (the system's DCCRoll, no dialog, its Damage card in the chat). FastFighting then
 * applies each target's share with applyDamageCard.
 *   - Which damage: the result the spell check reached. The core names it by the spell's id and the result's place
 *     among the spell's results ("<actor id>.<item id>@<n>", the core's casting.js tierActionsOf); the adapter reads
 *     the spell's table again, as it did for the spell, and takes that result's damage (text.js spellResult): the dice
 *     and caster level its row says. Nothing to read there (not a spell on the sheet, no table): null, the engine's dice.
 *   - Several missiles, bolts or rays, so many of so much each: a count with dice is rolled first, its own card (the
 *     spell's name on it), and every missile's damage is on the one Damage card.
 *   - By kind as rolled (each part's dice and bonus), keyed as the helper's rules key them (fire, cold ...; untyped).
 *   - The card carries that by kind for this helper (its flags), so applying it (harmTo) counts what the target's stat
 *     line says it takes none, half or double of, as the engine counts it: the dcc system's applyDamage counts none.
 * Nothing is applied here, and nothing earns or costs Fleeting Luck. It's for the GMs only when secret.
 */
import { dccRules } from "./rules.js";
import { statLine, iwrIn } from "./text.js";

/** This helper's flags on a card (the module's id). */
const SCOPE = "fast-fighting-dcc";

/**
 * The spell and the result the core names: {itemId, tier} for "<actor id>.<item id>@<n>" (the core's id for a spell
 * at one of its results), or null.
 * @param {Actor} actor
 * @param {object} action  {id, name}
 */
export function spellTier(actor, action) {
  const m = String(action?.id ?? "").match(/^(.+)@(\d+)$/);
  const prefix = `${actor?.id}.`;
  if ( !m || !actor?.id || !m[1].startsWith(prefix) ) return null;
  return { itemId: m[1].slice(prefix.length), tier: Number(m[2]) };
}

/**
 * Damage parts as a formula the dcc system rolls, `times` over (each missile its own dice and bonus): "1d6+3+1d6+3".
 * @param {object[]} parts  the engine's DamageParts ({dice: [{n, faces}], flat, type})
 */
export function damageFormula(parts, times = 1) {
  const terms = [];
  for ( let i = 0; i < times; i++ ) {
    for ( const p of parts ) {
      for ( const d of p.dice ?? [] ) if ( d.n ) terms.push(`${d.n < 0 ? "-" : "+"}${Math.abs(d.n)}d${d.faces}`);
      if ( p.flat ) terms.push(`${p.flat < 0 ? "-" : "+"}${Math.abs(p.flat)}`);
    }
  }
  return terms.join("").replace(/^\+/, "");
}

/**
 * A roll of damageFormula's by kind: each part's dice (the roll's, in order) and bonus; all of it the first kind where
 * there's only one, or the parts don't add up to the roll's total (at least 1, as the system has it).
 * @param {Roll} roll
 * @param {object[]} parts
 */
export function byKind(roll, parts, times = 1) {
  const total = Math.max(1, Math.round(Number(roll?.total) || 0));
  const kinds = [...new Set(parts.map(p => p.type ?? "untyped"))];
  if ( kinds.length < 2 ) return { [kinds[0] ?? "untyped"]: total };
  const out = {};
  let die = 0;
  for ( let i = 0; i < times; i++ ) {
    for ( const p of parts ) {
      let v = Number(p.flat) || 0;
      for ( const d of p.dice ?? [] ) if ( d.n ) v += Math.sign(d.n) * (Number(roll.dice?.[die++]?.total) || 0);
      out[p.type ?? "untyped"] = (out[p.type ?? "untyped"] ?? 0) + v;
    }
  }
  const values = Object.values(out);
  if ( values.some(v => v < 0) || values.reduce((s, v) => s + v, 0) !== total ) return { [kinds[0]]: total };
  return out;
}

/** The speaker of a card the actor makes, as Foundry names it. */
const speakerOf = (actor, token) => globalThis.ChatMessage?.getSpeaker?.({ actor, token }) ?? { actor: actor.id, token: token?.id ?? null };

/** A card's visibility: the GMs' mode when secret, else the user's own. */
const modeOf = secret => (secret ? { messageMode: "gm" } : {});

/**
 * Damage rolled the dcc system's way, its card in the chat (the Damage card the Roll Damage button makes): {damage:
 * {byType}, card: its id}, or null where there's nothing to roll or no card was made (the engine's dice).
 * @param {TokenDocument} token  the one whose spell it is
 * @param {object} options
 * @param {string} options.name       the spell's
 * @param {object[]} options.damage   its DamageParts
 * @param {object} [options.repeat]   how many of it (a DamagePart: missiles, bolts), where it's several
 * @param {boolean} [options.secret]  for the GMs only
 */
export async function rollDccDamage(token, { name, damage, repeat = null, secret = false } = {}) {
  const actor = token?.actor;
  if ( !actor || !damage?.length ) return null;
  const data = actor.getRollData?.() ?? {};
  const speaker = speakerOf(actor, token);
  // (How many: a count with dice is rolled, as an inline roll's button rolls it.)
  let times = 1;
  if ( repeat ) {
    if ( repeat.dice?.length ) {
      const count = Roll.create(damageFormula([repeat]), data);
      await count.evaluate();
      await count.toMessage({ speaker, flavor: name }, modeOf(secret));
      times = Number(count.total);
    } else times = Number(repeat.flat);
    times = Math.max(1, Math.round(times) || 1);
  }
  const formula = damageFormula(damage, times);
  if ( !formula ) return null;
  const roll = game.dcc?.DCCRoll
    ? await game.dcc.DCCRoll.createRoll([{ type: "Compound", formula }], data, { showModifierDialog: false })
    : Roll.create(formula, data);
  await roll.evaluate();
  // (At least 1, as the Roll Damage button has it.)
  if ( roll.total < 1 ) roll._total = 1;
  const byType = byKind(roll, damage, times);
  const card = await roll.toMessage({
    speaker, flavor: game.i18n.format("DCC.RollsDamageWith", { weapon: name }),
    flags: { dcc: { RollType: "Damage" }, [SCOPE]: { byType } }
  }, modeOf(secret));
  return card?.id ? { damage: { byType }, card: card.id } : null;
}

/**
 * What a damage card of this helper's (rollDccDamage: its damage by kind on it) deals a target: each kind's share by
 * the multiplier, rounded down, as the engine reckons a save's share; then what the target's stat line says it takes
 * none, half or double of (the rules' applyIwr, as for its spec), which the dcc system's applyDamage doesn't count.
 * Null for any other card.
 * @param {ChatMessage} message
 * @param {Actor} actor       the target's
 * @param {number} [multiplier]
 */
export function harmTo(message, actor, multiplier = 1) {
  const kinds = message?.flags?.[SCOPE]?.byType;
  if ( !kinds || typeof kinds !== "object" ) return null;
  const times = Math.max(0, Number(multiplier) || 0);
  const share = Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, Math.floor((Number(v) || 0) * times)]));
  return dccRules.applyIwr(iwrIn(statLine(actor?.system?.details?.notes?.value ?? "")), share);
}
