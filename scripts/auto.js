/**
 * What DCC says about a character, for the one time FastFighting sets it up by itself (the core's
 * foundry/auto-config.js): the playstyles that fit it and its own answers to the tactics questions ("Let this character
 * decide"), from its class (the class sheet's id: DCC's and XCC's), its level, its weapons, its alignment, its Luck,
 * and a monster's stat line and Will; and the sheet's HTML as plain text, for its biography's keywords (the adapter's
 * biography). Pure (its words through the language files).
 */
import { listItems, signedNumber } from "./core.js";
import { archetype } from "./classes.js";
import { t } from "./words.js";

/** What each class leans toward, by the class sheet's id. */
const CLASSES = Object.freeze({
  warrior: { brawler: 0.4, tank: 0.2 },
  dwarf: { tank: 0.4, relentless: 0.2 }, "xcc-dwarf": { tank: 0.4, relentless: 0.2 },
  thief: { thief: 0.5, wallflower: 0.1 },
  halfling: { wallflower: 0.3 },
  elf: { unmundane: 0.4, loreCollector: 0.2 },
  wizard: { unmundane: 0.5, loreCollector: 0.3 },
  cleric: { enabler: 0.4 }, messenger: { enabler: 0.4 },
  "zero-level": { fragile: 0.3, chicken: 0.1 }, "0-level": { fragile: 0.3, chicken: 0.1 }, zero: { fragile: 0.3, chicken: 0.1 },
  // XCC's own.
  brawler: { brawler: 0.7 }, "dungeon-hottie": { peoplePleaser: 0.3 }, jammer: { instigator: 0.4 }, gnome: { tank: 0.5 },
  athlete: { brawler: 0.3, speedRunner: 0.2 }, "sp-acrobat": { speedRunner: 0.3 }
});

/** What an alignment leans toward (l, n, c). */
const ALIGNMENTS = Object.freeze({ l: { moralist: 0.15 }, c: { cruel: 0.15, wildcard: 0.2 } });

/** The playstyles that fit: {id: -1 to 1}. */
export function dccHints({ cls = null, alignment = null, undead = false, unholy = false, mindless = false, beast = false } = {}) {
  const out = {};
  const add = map => { for ( const [k, v] of Object.entries(map ?? {}) ) out[k] = (out[k] ?? 0) + v; };
  // (Each Specialist, sp-scout and the rest, is a thief.)
  add(CLASSES[cls] ?? (String(cls ?? "").startsWith("sp-") ? CLASSES.thief : null));
  add(ALIGNMENTS[alignment]);
  if ( undead ) add({ relentless: 0.4 });
  if ( unholy ) add({ cruel: 0.4 });
  if ( mindless ) add({ relentless: 0.3 });
  if ( beast ) add({ brawler: 0.3 });
  for ( const k of Object.keys(out) ) out[k] = Math.max(-1, Math.min(1, out[k]));
  return out;
}

/**
 * A class's fighting style, by the class sheet's id: DCC's (a cleric in armor with its mace, a thief's backstab, a
 * halfling's two weapons) and XCC's (a Messenger as a cleric, a Specialist as a thief, a Half-Elf's acrobatics, a Gnome
 * drawing the foe's eye).
 */
const CLASS_STYLE = Object.freeze({
  warrior: "frontline", dwarf: "frontline", "xcc-dwarf": "frontline", brawler: "frontline", athlete: "frontline", cleric: "frontline",
  messenger: "frontline", "half-orc": "frontline",
  thief: "skirmisher", halfling: "skirmisher", "sp-acrobat": "skirmisher", "dungeon-hottie": "skirmisher", "half-elf": "skirmisher",
  wizard: "caster", elf: "caster", blaster: "caster", gnome: "protector"
});

/**
 * How strongly a class reaches for its magic and its own (what the adapter marks special): a wizard (or XCC's Blaster)
 * lives by its spells, an elf fights in armor too; a cleric's spells, Lay on Hands and Turn Unholy; a Brawler's fists,
 * a Jammer's Disrespect, a Gnome's Draw Agro, an Athlete's wrestling.
 */
const CLASS_SPECIALTY = Object.freeze({
  wizard: "strong", blaster: "strong", brawler: "strong",
  elf: "some", cleric: "some", messenger: "some", jammer: "some", gnome: "some", athlete: "some"
});

/** Talking: XCC's Dungeon Hottie wins people over (Persuade, Allure); a Jammer is a performer. */
const CLASS_TALK = Object.freeze({ "dungeon-hottie": "first", jammer: "opportune" });

/** The weapons a class sheet marks as its own, best first: a warrior's lucky weapon, XCC's deed, chosen and favored weapons. */
const MARKS = ["lucky", "deed", "chosen", "favored"];

/** Who a class goes for: a Gnome guards its friends; XCC's Blaster earns its Mojo bringing down magic users. */
const CLASS_TARGET = Object.freeze({ gnome: "protect", blaster: "casters" });

/**
 * A Luck this low (a modifier of -2 or worse) gives little hope when its body is rolled (a d20 at or under its Luck),
 * so it gets out while it still can.
 */
const LUCKLESS = 5;

/** Morale (DCC's: d20 + Will against DC 11): a Will this high never breaks. */
const UNBREAKABLE_WILL = 10;

/**
 * DCC's own answers to the tactics questions and to what it offers and expects to end an argument, where its data
 * says something: {key: {value, why}} (why: in the reader's language, the system's own words where it has them; an
 * answer with no reason to show isn't given). Anything left out is the core's reading of its hidden scores.
 *
 * A player character (its build, leaving the rest to its player):
 *  - its signature attack: its two weapons set up together (two-weapon fighting), else the weapon its sheet marks as its
 *    own (a warrior's lucky weapon; XCC's deed, chosen or favored weapon), else a Brawler's bare fists, else, beside an
 *    untrained one, the one weapon it's trained in (a funnel peasant's, its occupation's);
 *  - its class: its style, how strongly it reaches for its specialties, who it goes for (a Gnome guards its friends, a
 *    Blaster goes for magic users), a Hottie's or Jammer's words; a thief's, halfling's or Specialist's Luck comes back
 *    each day, so it spends it freely; a thief casts from scrolls and handles poison, so it makes the most of them;
 *  - a cleric (or Messenger) heals: Lay on Hands readily, on the dying, on itself first when it gets back up (a
 *    chaotic one less readily: each for itself);
 *  - a deed die: its defensive Mighty Deed, as it would anyway (a DCC shield is already in the AC, so the core would
 *    otherwise say never);
 *  - a Luck too low to count on when its body is rolled: it gets out when hurt;
 *  - a 0-level funnel peasant runs when hurt (it dies at 0), and would gladly just leave, unharmed.
 * A creature (its stat line and Will):
 *  - the un-dead never flee; the mindless and constructs neither, nor talk, nor bargain, nor use up anything, and they
 *    go for whoever's nearest, stay with the fight and hold the line; one immune to fear, or with a Will no morale
 *    check can break, never flees; a beast flees when hurt, talks and bargains not, and has no use for potions or
 *    scrolls; anyone else checks morale when the fight turns against it;
 *  - a spellcaster leads with its spells; a flier strikes and wheels away; pack tactics: it gangs up on the weakest
 *    and hunts down the rest.
 * Never its name: what it's called says nothing the system knows. What its notes say of it, a highwayman's greed for
 * one, reaches the core as its biography's keywords, and the core's offer and expectation follow from those.
 * @param {object} f
 * @param {boolean} [f.pc]          a player character (default: whether it has a class)
 * @param {string} [f.cls]          its class sheet's id
 * @param {number} [f.level]
 * @param {string} [f.alignment]    "l", "n" or "c"
 * @param {number} [f.luck]         its Luck score
 * @param {{id, name, trained, mark}[]} [f.weapons]   its weapons' actions; mark: "lucky", "deed", "chosen", "favored"
 * @param {string} [f.twoWeapons]   its two-weapon action's id, set up
 * @param {string} [f.fists]        a Brawler's unarmed attacks' id
 * @param {string} [f.occupation]   its occupation, as the sheet says it
 * @param {boolean} [f.deedDie]     its attack bonus is a deed die
 * A creature's:
 * @param {boolean} [f.undead]  @param {boolean} [f.mindless]  @param {boolean} [f.construct]  @param {boolean} [f.beast]
 * @param {boolean} [f.fearless]   immune to fear   @param {boolean} [f.casts]   @param {boolean} [f.flies]   @param {boolean} [f.pack]
 * @param {number} [f.will]        its Will save
 * @param {object} [f.names]       the words shown: {cls, alignment, will, luck, lucky, deed, chosen, favored, trained, twoWeapons, deeds, layOnHands, scroll, poison}
 * @returns {Record<string, {value, why}>}
 */
export function dccTactics(f = {}) {
  const out = {};
  const set = (key, value, why) => {
    if ( key in out || value === undefined || value === null || !why ) return;
    out[key] = { value, why: String(why) };
  };
  if ( f.pc ?? !!f.cls ) characterTactics(f, set);
  else creatureTactics(f, set);
  return out;
}

/** A player character's: what its build clearly implies. */
function characterTactics(f, set) {
  const names = f.names ?? {};
  const kind = archetype(f.cls);
  const zero = kind.zero || (Number.isFinite(f.level) && f.level <= 0);
  const cls = names.cls || f.cls || "";

  // Its signature attack.
  const weapons = f.weapons ?? [];
  const marked = MARKS.map(m => [m, weapons.find(w => w.mark === m)]).find(([, w]) => w);
  const trained = weapons.filter(w => w.trained);
  if ( f.twoWeapons ) set("preferredAction", f.twoWeapons, names.twoWeapons || t("Why.TwoWeapons"));
  else if ( marked ) set("preferredAction", marked[1].id, names[marked[0]] || cls);
  else if ( f.fists && !zero ) set("preferredAction", f.fists, cls);
  else if ( trained.length === 1 && weapons.some(w => !w.trained) ) {
    set("preferredAction", trained[0].id, zero ? (f.occupation || t("Reason.Zero")) : (names.trained || t("Why.Trained")));
  }

  // A funnel peasant has no class yet, and dies at 0: it would sooner walk away unharmed.
  if ( zero ) {
    set("retreat", "hurt", t("Reason.Zero"));
    set("offer", { kind: "leave" }, t("Reason.Zero"));
    set("expect", { kind: "noHarm" }, t("Reason.Zero"));
    return;
  }
  const id = String(f.cls ?? "");
  const style = CLASS_STYLE[id] ?? (kind.thief ? "skirmisher" : null);
  if ( style ) set("style", style, cls);
  set("target", CLASS_TARGET[id], cls);
  // (A thief's Luck, a halfling's and a Specialist's come back each day; anyone else's burned Luck is gone for good.)
  if ( kind.thief || kind.halfling ) set("resourceUse", "nova", cls);
  // (A thief is trained to cast spells from scrolls and to handle poison: it gets the most out of both.)
  if ( id === "thief" ) set("consumables", "freely", listItems([names.scroll, names.poison].filter(Boolean)) || cls);
  set("specialty", CLASS_SPECIALTY[id], cls);
  set("talk", CLASS_TALK[id], cls);
  const luck = Number(f.luck);
  if ( Number.isFinite(luck) && luck <= LUCKLESS ) set("retreat", "hurt", t("Reason.Ability", { name: names.luck || t("Luck"), n: luck }));
  if ( kind.cleric ) {
    const chaotic = f.alignment === "c";
    const why = chaotic ? listItems([cls, names.alignment || t("Chaotic")]) : cls;
    const hands = names.layOnHands || t("LayOnHands");
    set("healAggro", chaotic ? "balanced" : "aggressive", why);
    set("allyDying", chaotic ? "fight" : "rescue", chaotic ? why : hands);
    set("selfRevived", "healSelf", hands);
  }
  // (Its defensive deed goes as the shield answer says: never, unless the system speaks up.)
  if ( f.deedDie ) set("shield", "spare", names.deeds || t("Reason.DeedDie"));
}

/** A creature's: its stat line and its Will. */
function creatureTactics(f, set) {
  const names = f.names ?? {};
  const mindless = !!(f.mindless || f.construct);
  const plainly = f.construct ? t("Why.Construct") : t("Why.Mindless");
  const will = Number(f.will);
  const morale = Number.isFinite(will) ? t("Why.Morale", { name: names.will || t("Will"), n: signedNumber(will) }) : null;

  if ( f.casts ) {
    set("style", "caster", t("Reason.Caster"));
    set("specialty", "strong", t("Reason.Caster"));
  } else if ( f.flies ) set("style", "skirmisher", t("Why.Flies"));
  else if ( mindless ) set("style", "frontline", plainly);

  if ( mindless ) set("target", "nearest", plainly);
  else if ( f.pack ) set("target", "weakest", t("Why.PackTactics"));

  if ( mindless ) set("talk", "never", plainly);
  else if ( f.beast ) set("talk", "never", t("Reason.Beast"));

  // DCC's morale: d20 + Will against DC 11, when its first falls, when half are down, alone when half its hit points are gone.
  if ( f.undead ) set("retreat", "never", t("Reason.UndeadNeverFlees"));
  else if ( mindless ) set("retreat", "never", f.construct ? plainly : t("Reason.NeverFlees"));
  else if ( f.fearless ) set("retreat", "never", t("Reason.ImmuneFear"));
  else if ( morale && will >= UNBREAKABLE_WILL ) set("retreat", "never", morale);
  else if ( f.beast ) set("retreat", "hurt", t("Reason.BeastFlees"));
  else if ( morale ) set("retreat", "losing", morale);

  if ( f.pack ) set("beyond", "hunt", t("Why.PackTactics"));
  else if ( mindless ) set("beyond", "stay", plainly);

  // A thing with no mind, or a beast: nothing to offer or ask for, and no potion or scroll it would use.
  if ( mindless || f.beast ) {
    const why = mindless ? plainly : t("Reason.Beast");
    set("offer", { kind: "" }, why);
    set("expect", { kind: "" }, why);
    set("consumables", "avoid", why);
  }
}

/** Text from the sheet's HTML. */
export function plainText(html) {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
}
