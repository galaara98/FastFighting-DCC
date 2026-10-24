/**
 * Food in DCC, for the core (API 27: its foundry/food.js). What DCC's creatures eat, how likely they come to a fight
 * hungry, what a body leaves when it dies, and what counts as food. DCC keeps no diet, size or creature type, so:
 *   - Eats nothing: the mindless and constructs, the un-dead, and demons (the crit table the system gave it: traits.js
 *     monsterKind). A beast (traits.js: by its name) that bites (a weapon on its sheet named as the language file's
 *     FFDCC.Words.Bite says) eats meat; any other beast eats anything; anyone else too, rarely hungry in a fight.
 *   - Corpses (core API 30): a body leaves one, equipment (DCC has no food type): the un-dead's a Rotten Corpse, never
 *     food; none from a construct, a demon, or a body its name says has no flesh (FFDCC.Words.NoFlesh: an ooze, a mist,
 *     a statue; DCC has no creature of metal or a machine, so no Scrap Corpse); else a Fresh Corpse, food, its portions
 *     by its token's size (DCC's only size), 1 for a small one to 32 for a gargantuan one, in the core's portions flag,
 *     eaten a portion at a time.
 *   - Food: a fresh corpse (or the "Uncooked meat" of before), and anything named as rations are (FFDCC.Words.Rations:
 *     DCC's items have no kind of their own).
 * The core weighs the rest: wisdom against hunger, and the chance any creature that eats is famished.
 */
import { MODULE_ID } from "./core.js";
import { statLine } from "./text.js";
import { monsterKind } from "./traits.js";
import { t, saysWord } from "./words.js";

/** How likely each kind comes to a fight hungry (the core's chance, before wisdom). */
export const HUNGER = Object.freeze({ biter: 0.4, beast: 0.3, living: 0.1 });
export const MEAT_ICON = "icons/consumables/meat/steak-raw-red-pink.webp";
/** Each kind of corpse: its name's key (and its hint's, with Hint) and icon. */
export const CORPSES = Object.freeze({
  fresh: { key: "FreshCorpse", img: MEAT_ICON },
  rotten: { key: "RottenCorpse", img: "icons/commodities/bones/bones-stack-worn-brown.webp" }
});

/** Portions of meat a body leaves, by its token's size in squares across. */
const meatBySize = size => (size <= 0.5 ? 1 : size <= 1 ? 4 : size <= 2 ? 8 : size <= 3 ? 16 : 32);

/** A creature, as far as its food goes: {eats, flesh, beast, bites}, from its spec where there is one, else its sheet. */
function natureOf(actor, spec) {
  if ( !actor || !["Player", "NPC"].includes(actor.type) || actor.flags?.[MODULE_ID]?.pile ) return null;
  const sys = actor.system ?? {};
  const line = statLine(sys.details?.notes?.value ?? "");
  const kind = actor.type === "Player" ? null : monsterKind(sys.attributes?.critical?.table, globalThis.CONFIG?.DCC?.monsterCriticalHits);
  const undead = !!line.undead || (spec?.creatureTraits ?? []).includes("undead");
  const mindless = !!line.construct || !!spec?.flags?.mindless;
  const demon = kind === "demon";
  const beast = spec ? !!spec.flags?.beast : actor.type === "NPC" && saysWord("Beast", actor.name);
  const weapons = actor.items?.filter?.(i => i.type === "weapon") ?? [];
  const bites = weapons.some(w => saysWord("Bite", w.name));
  return {
    eats: !(undead || mindless || demon),
    flesh: !(undead || !!line.construct || demon || saysWord("NoFlesh", actor.name)),
    undead, beast, bites
  };
}

/** What it eats, and how likely it comes to a fight hungry. */
export function dccAppetite(actor, spec = null) {
  const n = natureOf(actor, spec);
  if ( !n ) return null;
  if ( !n.eats ) return { diet: null, hunger: 0, cannibal: false };
  if ( n.beast ) return n.bites ? { diet: "meat", hunger: HUNGER.biter, cannibal: false } : { diet: "any", hunger: HUNGER.beast, cannibal: false };
  return { diet: "any", hunger: HUNGER.living, cannibal: false };
}

/** The kind of corpse its body leaves (CORPSES): the un-dead's rotten, a body of flesh fresh; else none. */
export function dccCorpseKind(actor, spec = null) {
  const n = natureOf(actor, spec);
  if ( !n ) return null;
  if ( n.undead && !saysWord("NoFlesh", actor.name) ) return "rotten";
  return n.flesh ? "fresh" : null;
}

/** The corpse its body leaves when it dies (core API 30): {item, quantity: its portions, 0 for no food}, or null. */
export function dccMeatFor(actor, spec = null) {
  const kind = dccCorpseKind(actor, spec);
  if ( !kind ) return null;
  const size = Number(spec?.position?.size) || Number(actor.token?.width ?? actor.prototypeToken?.width) || 1;
  const portions = kind === "fresh" ? meatBySize(size) : 0;
  const { key, img } = CORPSES[kind];
  return {
    quantity: portions,
    item: {
      name: t(key),
      type: "equipment",
      img,
      system: { quantity: 1, equipped: false, description: { value: `<p>${t(`${key}Hint`)}</p>` } },
      flags: { [MODULE_ID]: { corpse: kind, ...(portions ? { food: "meat", portions } : {}) } }
    }
  };
}

/** Whether a thing can be eaten: {portions, meat}, or null. Our meat, and rations by their name. */
export function dccIsFood(item) {
  if ( !item ) return null;
  const quantity = Math.max(1, Number(item.system?.quantity ?? item.quantity ?? 1) || 1);
  const flags = item.flags?.[MODULE_ID] ?? (typeof item.getFlag === "function" ? { food: item.getFlag(MODULE_ID, "food"), portions: item.getFlag(MODULE_ID, "portions") } : {});
  if ( flags?.food === "meat" ) {
    // (A fresh corpse: its portions left, none once they're eaten. The meat of before: its quantity.)
    const portions = flags.portions ?? null;
    if ( portions === null ) return { portions: quantity, meat: true };
    return Number(portions) > 0 ? { portions: Math.round(Number(portions)), meat: true } : null;
  }
  if ( ["equipment", "treasure"].includes(item.type) && saysWord("Rations", item.name) ) return { portions: quantity, meat: false };
  return null;
}
