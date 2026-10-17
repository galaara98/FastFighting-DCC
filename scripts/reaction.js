/**
 * A reaction's strike in a live battle (core API 19 rollReaction), rolled the dcc system's way: the free attack a foe
 * gets as someone withdraws, as its player would roll it from the sheet, its card in the chat. FastFighting plays the
 * strike with what the card says.
 *   - The weapon: the one the engine's strike names (the adapter's action id, "<actor id>.<item id>"). A strike that
 *     isn't a weapon on the sheet (a stat line's attack, a Brawler's fists) is left to the engine's dice.
 *   - The target: the system reads it from the user's targets, so the user's target is set to it for the roll and the
 *     user's own put back after. Not on the scene this user is looking at: nothing is rolled.
 *   - Rolled with the actor's rollWeaponAttack, no dialog, and read off the card as the system makes it (its
 *     dcc.rollWeaponAttack hook, before the card is posted): the attack (read-turn.js attackOf) and, a hit, its damage
 *     by kind as rolled. A critical's as its crit table's row on the card has it: a double or triple damage row
 *     multiplies it, and the row's damage rolls (buttons on the card) are rolled as their buttons would roll them. The
 *     engine adds nothing of its own to a blow the system rolled.
 *   - The card is marked as its damage already applied (dcc.damageApplied), so the system's Auto-apply damage leaves
 *     it be, and it earns or costs no Fleeting Luck (Mojo) itself: FastFighting deals the blow, and its rules count a
 *     natural 20 or a fumble (rules.js afterRoll), written back with the turn.
 */
import { attackOf, rollMarked } from "./read-turn.js";
import { harmOf, harmNamed } from "./words.js";
import { damageMultiple } from "./text.js";

/** The dcc system's hook as it posts a weapon attack's card: (rolls, messageData), the card still to be made. */
const ATTACK_HOOK = "dcc.rollWeaponAttack";

/**
 * The flavor the dcc system gives a crit or fumble table's damage roll (utilities.js addDamageFlavorToRolls, "#damage").
 * A mark, not words: the same in every language.
 */
const TABLE_DAMAGE = "damage";

/** The weapon on the actor's sheet that a strike the adapter built names ("<actor id>.<item id>"), or null. */
export function weaponFor(actor, action) {
  const id = String(action?.id ?? "");
  const prefix = `${actor?.id}.`;
  if ( !actor?.items?.get || !id.startsWith(prefix) ) return null;
  const item = actor.items.get(id.slice(prefix.length));
  return item?.type === "weapon" ? item : null;
}

/**
 * This user's target set to a token for a roll: a function that puts the user's own targets back, or null where the
 * token isn't on the scene this user is looking at (the system would read no target).
 * @param {TokenDocument} target
 */
function aimAt(target) {
  const layer = globalThis.canvas?.tokens;
  if ( !target?.id || typeof layer?.setTargets !== "function" ) return null;
  if ( globalThis.canvas.scene?.id !== target.parent?.id || !layer.get?.(target.id) ) return null;
  const before = [...(game.user?.targets ?? [])].map(t => t.id);
  layer.setTargets([target.id], { mode: "replace" });
  return () => layer.setTargets(before, { mode: "replace" });
}

/**
 * A damage roll by kind, as rolled (at least 1, as the system has it): the kinds its formula names, else the kind the
 * weapon's name says (words.js harmOf, as the adapter reads the weapon). Several kinds, each its own dice and bonus
 * ("1d8+1d6[fire]"); where those don't add up to the roll's total, all of it the first kind.
 * @param {Roll} roll
 * @param {string} name   the weapon's
 */
export function damageByKind(roll, name) {
  const total = Math.max(1, Math.round(Number(roll?.total) || 0));
  const parts = harmOf(roll?.formula ?? "", name);
  const kinds = [...new Set(parts.map(p => p.type))];
  if ( kinds.length < 2 ) return { [kinds[0] ?? harmNamed(name)]: total };
  const out = {};
  let die = 0;
  for ( const p of parts ) {
    let v = Number(p.flat) || 0;
    for ( const d of p.dice ) v += (Number(roll.dice?.[die++]?.total) || 0) * (d.mult ?? 1);
    out[p.type] = (out[p.type] ?? 0) + v;
  }
  const values = Object.values(out);
  if ( values.some(v => v < 0) || values.reduce((s, v) => s + v, 0) !== total ) return { [kinds[0]]: total };
  return out;
}

/** An HTML attribute's value as the text it stands for. */
const unentity = s => s.replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'" })[e]);

/**
 * The damage rolls a crit table's result on the card holds, still to be rolled (Foundry's deferred inline rolls, a
 * button each, the system's damage flavor on them): [{formula, flavor}].
 * @param {string} html   the card's crit result (system.critResult)
 */
export function tableDamageRolls(html) {
  const out = [];
  for ( const [tag] of String(html ?? "").matchAll(/<a\b[^>]*>/gi) ) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map(([, k, v]) => [k.toLowerCase(), unentity(v)]));
    const classes = String(attrs.class ?? "").split(/\s+/);
    const flavor = String(attrs["data-flavor"] ?? "").trim();
    if ( classes.includes("inline-roll") && !classes.includes("inline-result") && flavor.toLowerCase() === TABLE_DAMAGE && attrs["data-formula"] ) {
      out.push({ formula: attrs["data-formula"], flavor });
    }
  }
  return out;
}

/** Those rolls rolled as their buttons roll them (each its own card, as the attacker), their total. */
async function rollTableDamage(rolls, actor, speaker) {
  let sum = 0;
  for ( const { formula, flavor } of rolls ) {
    const roll = Roll.create(formula, actor.getRollData?.() ?? {});
    await roll.evaluate();
    await roll.toMessage({ flavor, speaker });
    sum += Math.max(0, Math.round(Number(roll.total) || 0));
  }
  return sum;
}

/**
 * A reaction's strike rolled with the dcc system's own roller, its card in the chat: {attack: {degree, natural, total},
 * damage: {byType} | null} (damage null on a miss, or where the card rolled none: the system's automation off), or
 * null where it can't be rolled here or read (the engine rolls it).
 * @param {TokenDocument} token    the one who strikes
 * @param {object} options
 * @param {object} options.action  the engine's strike, {id, name}
 * @param {TokenDocument} options.target
 */
export async function rollDccReaction(token, { action, target } = {}) {
  const actor = token?.actor;
  const weapon = weaponFor(actor, action);
  if ( !weapon || typeof actor.rollWeaponAttack !== "function" ) return null;
  const restore = aimAt(target);
  if ( !restore ) return null;
  let card = null;
  const hook = Hooks.on(ATTACK_HOOK, (rolls, data) => {
    if ( card || data?.system?.actorId !== actor.id || data.system.weaponId !== weapon.id ) return;
    // (FastFighting deals this blow, and counts its Fleeting Luck: not the system's Auto-apply damage, nor its tracker.)
    const flags = data.flags ??= {};
    flags["dcc.damageApplied"] = true;
    delete flags["dcc.FleetingLuckEffect"];
    if ( flags.dcc && typeof flags.dcc === "object" ) delete flags.dcc.FleetingLuckEffect;
    card = { flags: { ...flags }, rolls: [...(rolls ?? [])], system: { ...data.system }, speaker: data.speaker };
  });
  try {
    await actor.rollWeaponAttack(weapon.id, { showModifierDialog: false, token });
  } finally {
    Hooks.off(ATTACK_HOOK, hook);
    restore();
  }
  if ( !card ) return null;
  const { degree, natural, total, known } = attackOf(card);
  // (Whether it hit unknown, the target's AC unread: the engine's dice. A fumble, or a critical on the die's top, is sure.)
  if ( !known && degree !== 0 && degree !== 3 ) return null;
  const attack = { degree, natural, total };
  const rolled = degree >= 2 ? card.system.damageRoll ?? rollMarked(card, "dcc.isDamageRoll") : null;
  if ( !rolled ) return { attack, damage: null };
  const byType = damageByKind(rolled, weapon.name);
  if ( degree === 3 ) {
    // (The crit table's row: so many times the blow's own damage, as text.js reads a row, and its damage rolls on top.)
    const times = damageMultiple(card.system.critResult ?? "");
    if ( times > 1 ) for ( const k of Object.keys(byType) ) byType[k] *= times;
    const extra = await rollTableDamage(tableDamageRolls(card.system.critResult), actor, card.speaker);
    if ( extra > 0 ) {
      const kind = Object.keys(byType)[0];
      byType[kind] += extra;
    }
  }
  return { attack, damage: { byType } };
}
