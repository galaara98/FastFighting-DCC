/**
 * What anyone can try in a DCC fight besides a blow, for what the playstyles lean on. Pure.
 *  - Help (homebrew: the rules have no aid): an action, the friend's foe beside the helper; the friend's next attack or
 *    check goes a step up the dice chain, counted as +2 (as the Jammer's step down is -2).
 *  - Grapple: the rules' opposed attack rolls, each with its attack bonus and the better of Strength and Agility (the
 *    defender's as a DC, rules.defenseDc "grapple"); won, the foe is pinned until its next turn.
 *  - Hide: a thief's Hide in Shadows (a halfling's Sneak and Hide); anyone else's an untrained check, a d10, and
 *    Agility; against the sharpest eyes among its foes. Hidden, it's harder to hit (-4, as against what it can't see),
 *    and its next attack catches its foe unready (a thief's backstab), until it attacks. Not with a foe beside it.
 */
import { t } from "./words.js";

/** Help a friend: a step up the dice chain on its next attack or check, at the foe beside the helper. */
export function helpAction(id) {
  return {
    id: `${id}.help`, name: t("Help"), kind: "buff", cost: 1, traits: [], includeSelf: false, besideFoe: 5, special: false,
    // (The friend can be anywhere; the foe has to be beside the helper.)
    range: { increment: 600, max: 600, noPenalty: true },
    outcome: { mods: { attack: 2, checks: 2 }, uses: 1, vsFocus: true, rounds: 1, label: t("Helped") }
  };
}

/** Grapple: opposed attack rolls (its own against the foe's, as a DC); won, the foe is pinned. */
export function grappleAction(id, mod) {
  const pinned = { conditions: { immobilized: 1 }, rounds: 1, label: t("Pinned") };
  return {
    id: `${id}.grapple`, name: t("Grapple"), kind: "control", cost: 1, traits: [], melee: true, reach: 5, special: false,
    check: { mod, against: "grapple" }, onHit: [null, null, pinned, pinned]
  };
}

/**
 * Hide: its skill (trained, on the d20) or Agility on a d10 (untrained), against the foes' sharpest eyes; what one
 * keeping a low profile goes for, and one in a hurry doesn't stop for.
 */
export function hideAction(id, { mod, trained = false, label = "" }) {
  const hidden = { conditions: { hidden: 1 }, rounds: 10, label: t("Hidden") };
  return {
    id: `${id}.hide`, name: label, kind: "buff", targets: "self", cost: 1, traits: [], hide: true, setup: true, leans: ["lowProfile"], special: false,
    check: { mod, against: "perception", faces: trained ? undefined : 10, label }, onDegree: [null, null, hidden, hidden]
  };
}

/** The kinds of physical harm, and what a stat line's words for them are. */
const PHYSICAL = ["slashing", "piercing", "bludgeoning"];
const KINDS = { slashing: "slashing", edged: "slashing", piercing: "piercing", bludgeoning: "bludgeoning", blunt: "bludgeoning", crushing: "bludgeoning",
  fire: "fire", cold: "cold", acid: "acid", electricity: "electricity", lightning: "electricity" };

/** Words that go with the kinds of harm in a stat line ("non-magical weapons"). */
const JOINERS = new Set(["and", "or", "weapons", "weapon", "attacks", "damage", "non", "nonmagical", "magical", "mundane", "normal", "all"]);

/**
 * The kinds of harm a stat line's phrase names ("piercing and slashing weapons"; "weapons" alone, all three), up to
 * the first part (between commas) that says something else ("..., vulnerable to fire").
 */
export function harmKinds(phrase) {
  const named = [];
  let weapons = false;
  for ( const part of String(phrase ?? "").toLowerCase().split(",") ) {
    const words = part.split(/[^a-z]+/).filter(Boolean);
    if ( !words.length || !words.every(w => KINDS[w] || JOINERS.has(w)) ) break;
    for ( const w of words ) if ( KINDS[w] ) named.push(KINDS[w]);
    if ( words.includes("weapons") || words.includes("weapon") ) weapons = true;
  }
  if ( named.length ) return [...new Set(named)];
  return weapons ? [...PHYSICAL] : [];
}

/**
 * A weak spot: the kinds of physical harm a creature doesn't resist when it resists others (a skeleton, half damage
 * from piercing and slashing: a mace finds it). {kind: 1}, or {} for none.
 */
export function weakSpot(resist) {
  const guarded = PHYSICAL.filter(k => resist?.[k]);
  if ( !guarded.length || guarded.length === PHYSICAL.length ) return {};
  return Object.fromEntries(PHYSICAL.filter(k => !resist[k]).map(k => [k, 1]));
}
