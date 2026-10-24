/**
 * Food in DCC, for the core (API 27: its foundry/food.js). What DCC's creatures eat, how likely they come to a fight
 * hungry, what a body leaves when it dies, and what counts as food. DCC keeps no diet, size or creature type, so:
 *   - Eats nothing: the mindless and constructs, the un-dead, and demons (the crit table the system gave it: traits.js
 *     monsterKind). A beast (traits.js: by its name) that bites (a weapon on its sheet named as the language file's
 *     FFDCC.Words.Bite says) eats meat; any other beast eats anything; anyone else too, rarely hungry in a fight.
 *   - Meat: none from the un-dead, constructs, demons, or a body its name says has no flesh (FFDCC.Words.NoFlesh: an
 *     ooze, a mist, a statue); else by its token's size (DCC's only size), 1 for a small one to 32 for a gargantuan one,
 *     as our own "Uncooked meat" (DCC has no such item).
 *   - Food: our meat, and anything named as rations are (FFDCC.Words.Rations: DCC's items have no kind of their own).
 * The core weighs the rest: wisdom against hunger, and the chance any creature that eats is famished.
 */
import { MODULE_ID } from "./core.js";
import { statLine } from "./text.js";
import { monsterKind } from "./traits.js";
import { t, saysWord } from "./words.js";

/** How likely each kind comes to a fight hungry (the core's chance, before wisdom). */
export const HUNGER = Object.freeze({ biter: 0.4, beast: 0.3, living: 0.1 });
export const MEAT_ICON = "icons/consumables/meat/steak-raw-red-pink.webp";

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
    beast, bites
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

/** What its body leaves when it dies: our "Uncooked meat", by its size; null for a body of no flesh. */
export function dccMeatFor(actor, spec = null) {
  const n = natureOf(actor, spec);
  if ( !n?.flesh ) return null;
  const size = Number(spec?.position?.size) || Number(actor.token?.width ?? actor.prototypeToken?.width) || 1;
  const quantity = meatBySize(size);
  return {
    quantity,
    item: {
      name: t("Meat"),
      type: "equipment",
      img: MEAT_ICON,
      system: { quantity, equipped: false, description: { value: `<p>${t("MeatHint")}</p>` } },
      flags: { [MODULE_ID]: { food: "meat" } }
    }
  };
}

/** Whether a thing can be eaten: {portions, meat}, or null. Our meat, and rations by their name. */
export function dccIsFood(item) {
  if ( !item ) return null;
  const quantity = Math.max(1, Number(item.system?.quantity ?? item.quantity ?? 1) || 1);
  const flags = item.flags?.[MODULE_ID] ?? (typeof item.getFlag === "function" ? { food: item.getFlag(MODULE_ID, "food") } : {});
  if ( flags?.food === "meat" ) return { portions: quantity, meat: true };
  if ( ["equipment", "treasure"].includes(item.type) && saysWord("Rations", item.name) ) return { portions: quantity, meat: false };
  return null;
}
