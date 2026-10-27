/**
 * Saves and checks in a live battle (core API 19 rollSave, rollCheck), rolled the dcc system's way: every save and
 * check in a turn FastFighting plays that the system has a roll for, as its player would roll it from the sheet, no
 * dialog, its card in the chat. FastFighting plays the turn with what the card says: the natural die, the total, and
 * how it went by this helper's rules (rules.js degreeOfSuccess, on the die the card rolled).
 *   - A save: Fortitude, Reflex or Will (the rules' frt, ref, wil), with the actor's rollSavingThrow.
 *   - A check, by what it's for and the action's id (the skill a DCC spec names is a word for the log, not an id):
 *       cast       a spell on the sheet (the adapter's "<actor id>.<item id>"): rollSpellCheck with the item, its
 *                  results card and all; a cleric's Lay on Hands or Turn Unholy: rollSkillCheck.
 *       talk       a Personality check; Strength's, to intimidate, where that's the better (as the spec has it).
 *       aid        Hide: a thief's Hide in Shadows, a halfling's Sneak and Hide.
 *       theft      a thief's Pick Pockets.
 *       disengage  XCC's Acrobatics.
 *       bribe, extort, scare, toll  a deal (the core's behavior/deals.js, API 26): the check the player picked in their
 *                  deal dialog (`skill`: Personality, Strength, or a skill on the sheet, as goods.js dccSkillsOf
 *                  offers them); else a bribe is XCC's Bribery expert where the sheet has it, else Personality, and a
 *                  demand the better of Personality and Strength.
 *     Anything else is the engine's to roll (null): a grapple or breaking free (opposed attack rolls, which the system
 *     doesn't roll), binding a wound (the friend's Luck: homebrew), anyone untrained (the rules' d10), a monster whose
 *     sheet keeps the default spell check while its stat line gives another (the adapter casts at the stat line's).
 *     Nothing needs a GM's call ({gm: true}): what the system can't roll, the engine can.
 *   - Every card the roll posts as the actor (a spell lost, disapproval too) earns or costs no Fleeting Luck (Mojo)
 *     itself, as with a strike: FastFighting's rules count it (rules.js afterRoll). It's for the GMs only when secret.
 *   - A spell check's own bookkeeping that FastFighting writes with the turn (commit.js), the spell lost and a
 *     cleric's disapproval, is kept off the sheet while it rolls: it would count twice, and Rewind would miss it. The
 *     rest is the system's (the disapproval roll, mercurial magic, patron taint, action dice).
 */
import { dccRules } from "./rules.js";
import { statLine } from "./text.js";
import { flag, naturalOf } from "./read-turn.js";

/** DCC's saves, as the rules key them (frt, ref, wil) and as the core may name them. */
const SAVES = { frt: "frt", ref: "ref", wil: "wil", fort: "frt", fortitude: "frt", reflex: "ref", will: "wil" };

/** The actor's roller for each kind of roll, and the cards it posts (the dcc system's dcc.RollType). */
const ROLLERS = {
  save: { method: "rollSavingThrow", cards: ["SavingThrow"] },
  ability: { method: "rollAbilityCheck", cards: ["AbilityCheck"] },
  // (A skill with a results table, Lay on Hands or Turn Unholy, posts a spell check's card.)
  skill: { method: "rollSkillCheck", cards: ["SkillCheck", "SpellCheck"] },
  spell: { method: "rollSpellCheck", cards: ["SpellCheck"] }
};

/** A cleric's own checks, by the adapter's action ids ("<actor id>.layOnHands"): the dcc system's skill for each. */
const CLERIC = { layOnHands: "layOnHands", turnUnholy: "turnUnholy" };

/** Foundry's mark for a key to delete (v14's _del); a null flag is none to the system's hooks too. */
const gone = () => globalThis._del ?? null;

/** The DCC save a save key names, or null (none, or several different ones). */
export function saveFor(save) {
  const ids = new Set([].concat(save ?? []).map(k => SAVES[String(k).toLowerCase()]).filter(Boolean));
  return ids.size === 1 ? [...ids][0] : null;
}

/** A skill on the sheet with something in it (a thief's, a halfling's: what the adapter counts as trained). */
const trained = (actor, id) => String(actor.system?.skills?.[id]?.value ?? "").trim() !== "";

/** A stat line's spell check, read once for each stat line (text.js statLine), not again at every cast. */
const SPELL_CHECKS = new Map();
function lineSpellCheck(text) {
  if ( !SPELL_CHECKS.has(text) ) {
    if ( SPELL_CHECKS.size >= 200 ) SPELL_CHECKS.delete(SPELL_CHECKS.keys().next().value);
    SPELL_CHECKS.set(text, statLine(text).spellCheck);
  }
  return SPELL_CHECKS.get(text);
}

/**
 * What the dcc system rolls for a check: {how: "spell", item} or {how: "skill"|"ability", id}; null where it has no
 * roll for it (the engine's dice).
 * @param {Actor} actor
 * @param {object} options
 * @param {string} options.purpose  what the check is for (the core's)
 * @param {object} [options.action] {id, name}: the action's id as the adapter gave it; talk's, its kind of pitch
 * @param {object} [options.kind]   the character's class, as classes.js archetype has it ({} for a monster)
 */
export function checkFor(actor, { purpose, action = null, kind = {}, skill: picked = null } = {}) {
  const sys = actor?.system ?? {};
  const prefix = `${actor?.id}.`;
  const own = String(action?.id ?? "").startsWith(prefix) ? String(action.id).slice(prefix.length) : null;
  // (A skill the sheet has: the system only warns about one it hasn't.)
  const skill = id => (id && sys.skills?.[id] ? { how: "skill", id } : null);
  switch ( purpose ) {
    case "cast": {
      if ( Object.hasOwn(CLERIC, own ?? "") ) return skill(CLERIC[own]);
      const item = own ? actor.items?.get?.(own) : null;
      if ( item?.type !== "spell" ) return null;
      // (A monster whose sheet keeps the default casts at its stat line's spell check: adapter.js #spells.)
      if ( actor.type !== "Player" && (Number(sys.class?.spellCheck) || 1) === 1 && Number.isFinite(lineSpellCheck(sys.details?.notes?.value ?? "")) ) return null;
      return { how: "spell", item };
    }
    case "talk": {
      // (Words with no action of their own name their kind of pitch; a taunt, Personality's.)
      const str = Number(sys.abilities?.str?.mod) || 0;
      const per = Number(sys.abilities?.per?.mod) || 0;
      return { how: "ability", id: !action?.id && action?.name === "intimidate" && str > per ? "str" : "per" };
    }
    case "aid": {
      const id = own === "hide" ? (kind.thief ? "hideInShadows" : kind.halfling ? "sneakAndHide" : null) : null;
      return id && trained(actor, id) ? skill(id) : null;
    }
    case "theft":
      return kind.thief ? skill("pickPockets") : null;
    case "disengage":
      return kind.acrobat ? skill("acrobatics") : null;
    case "bribe":
    case "extort":
    case "scare":
    case "toll": {
      if ( ["per", "str"].includes(picked) ) return { how: "ability", id: picked };
      if ( picked && trained(actor, picked) ) return skill(picked);
      if ( purpose === "bribe" ) return trained(actor, "briberyExpert") ? skill("briberyExpert") : { how: "ability", id: "per" };
      const str = Number(sys.abilities?.str?.mod) || 0;
      const per = Number(sys.abilities?.per?.mod) || 0;
      return { how: "ability", id: str > per ? "str" : "per" };
    }
    default:
      return null;
  }
}

/** Takes one change out of an update (nested, or a dotted key), and lets the rest go through. */
function drop(change, path) {
  if ( !change || typeof change !== "object" ) return;
  if ( path in change ) delete change[path];
  const keys = path.split(".");
  const last = keys.pop();
  const parent = keys.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), change);
  if ( parent && typeof parent === "object" ) delete parent[last];
}

/**
 * Rolls with the dcc system's roller and reads its card: the first card of `cards` it posts as the actor, or null
 * (none: cancelled, refused). While it rolls, every card posted as the actor loses its Fleeting Luck and, `secret`, is
 * for the GMs only (as Foundry sets a GM roll's); `cast`, the sheet keeps none of the bookkeeping the turn writes.
 */
async function cardOf(actor, cards, roll, { secret = false, cast = false } = {}) {
  let card = null;
  const hooks = [["preCreateChatMessage", message => {
    if ( message?.speaker?.actor !== actor.id ) return;
    // (FastFighting counts it: not the system's Fleeting Luck, nor XCC's Mojo.)
    if ( flag(message, "FleetingLuckEffect") !== undefined ) message.updateSource({ "flags.dcc.FleetingLuckEffect": gone() });
    if ( secret ) message.applyMode?.("gm");
    if ( !card && cards.includes(flag(message, "RollType")) && message.rolls?.length ) card = message;
  }]];
  // (The spell lost and a cleric's disapproval: FastFighting writes them with the turn, with their undo. Only those
  // changes: a hook that returns false would stop the whole update.)
  if ( cast ) {
    hooks.push(["preUpdateActor", (doc, change) => {
      if ( doc?.uuid === actor.uuid ) drop(change, "system.class.disapproval");
    }]);
    hooks.push(["preUpdateItem", (item, change) => {
      if ( item?.parent?.uuid === actor.uuid ) drop(change, "system.lost");
    }]);
  }
  const ids = hooks.map(([name, fn]) => [name, Hooks.on(name, fn)]);
  try {
    await roll();
  } finally {
    for ( const [name, id] of ids ) Hooks.off(name, id);
  }
  return card;
}

/** A card's roll, graded by the rules on the die it rolled: {degree, natural, total}, or null where it can't be read. */
function graded(card, dc, kind) {
  const roll = card?.rolls?.[0];
  const natural = roll ? naturalOf(card, roll) : null;
  const total = roll?.total;
  if ( !Number.isFinite(natural) || !Number.isFinite(total) ) return null;
  const faces = Number(roll.dice?.[0]?.faces) || 20;
  return { degree: dccRules.degreeOfSuccess(natural, total, dc, kind, { faces }), natural, total };
}

/**
 * A save rolled with the dcc system's own roller, its card in the chat: {degree, natural, total}, or null where it
 * can't be rolled here or read (the engine rolls it).
 * @param {TokenDocument} token  the one who saves
 * @param {object} options
 * @param {string|string[]} options.save  the save's key, as the rules name it
 * @param {number} options.dc
 * @param {boolean} [options.secret]      for the GMs only
 */
export async function rollDccSave(token, { save, dc, secret = false } = {}) {
  const actor = token?.actor;
  const id = saveFor(save);
  const { method, cards } = ROLLERS.save;
  if ( !id || !actor?.system?.saves?.[id] || !Number.isFinite(dc) || typeof actor[method] !== "function" ) return null;
  const card = await cardOf(actor, cards, () => actor[method](id, { showModifierDialog: false }), { secret });
  return graded(card, dc, "save");
}

/**
 * A check rolled with the dcc system's own roller, its card in the chat (checkFor says which): {degree, natural,
 * total}, or null where the system has no roll for it, or it can't be rolled here or read (the engine rolls it).
 * @param {TokenDocument} token  the one who makes it
 * @param {object} options
 * @param {string} options.purpose
 * @param {object} [options.action]  {id, name}
 * @param {number} options.dc        a spell check's: its lowest result's
 * @param {boolean} [options.secret] for the GMs only
 * @param {object} [options.kind]    the character's class (classes.js archetype)
 * @param {string} [options.skill]   a deal's check, as the player picked it (goods.js dccSkillsOf's key)
 */
export async function rollDccCheck(token, { purpose, action = null, dc, secret = false, kind = {}, skill = null } = {}) {
  const actor = token?.actor;
  const what = actor && Number.isFinite(dc) ? checkFor(actor, { purpose, action, kind, skill }) : null;
  const { method, cards } = ROLLERS[what?.how] ?? {};
  if ( !what || typeof actor[method] !== "function" ) return null;
  const options = { showModifierDialog: false };
  const roll = what.how === "spell" ? () => actor[method]({ ...options, spellItem: what.item }) : () => actor[method](what.id, options);
  const card = await cardOf(actor, cards, roll, { secret, cast: purpose === "cast" });
  return graded(card, dc, "check");
}
