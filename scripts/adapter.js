/**
 * Dungeon Crawl Classics adapter: reads dcc actors (Player and NPC) into CombatantSpecs and commits outcomes back.
 * Written against the dcc system 0.70 on Foundry v14, and the XCC module that rides on it.
 *
 * It works from the free system alone: weapons, action dice, deed dice, saves, Luck, hit dice, and a monster's stat
 * line. With the DCC or XCC core book installed it also reads their crit and fumble tables, Mighty Deeds, spell
 * results, Lay on Hands and Turn Unholy (see tables.js); without them, crits add the crit die, deeds and the
 * cleric's skills use rough built-in versions, and spells it can't read are left out.
 */
import { SystemAdapter, parseFormula, parseTypedFormula, part } from "./core.js";
import { dccRules } from "./rules.js";
import { plain, statLine, hitDice, actionDice, feet, critOnFor, outcomeIn, saveIn } from "./text.js";
import { classId, archetype } from "./classes.js";
import { DccTables } from "./tables.js";
import { deedsFrom } from "./deeds.js";
import { spellAction, layOnHandsAction, turnUnholyAction } from "./spells.js";
import { deriveDccTraits, speaksCommon, monsterKind } from "./traits.js";
import { rankDccLeaders } from "./leadership.js";
import { commitDccOutcome, describeDccOutcome, commitDccConcession, statusesOf } from "./commit.js";
import { loreBoost } from "./lore.js";
import { dccHints, dccTactics, plainText } from "./auto.js";
import { t, saysWord, englishWords } from "./words.js";
import { helpAction, grappleAction, hideAction, weakSpot } from "./moves.js";

/** A signed number from DCC's text fields ("+3", "-1", 4, "d5+3" -> 3 with the die left out). */
function flatOf(value) {
  const text = String(value ?? "").replace(/[+-]?\s*\d*d\d+/gi, "");
  let sum = 0;
  for ( const m of text.matchAll(/([+-]?)\s*(\d+)/g) ) sum += (m[1] === "-" ? -1 : 1) * Number(m[2]);
  return sum;
}
/** The die in a to-hit with a deed die ("+d5+3" -> 5), or null. */
const deedOf = toHit => {
  const m = String(toHit ?? "").match(/(?:^|[+\s])\d*d(\d+)/i);
  return m ? Number(m[1]) : null;
};

/** The kinds of harm a weapon's name can say it does, the first that fits first. */
const HARMS = ["piercing", "bludgeoning", "slashing"];

/**
 * A weapon's damage: the kind its formula names; where it names none (DCC's weapons don't say whether they cut, pierce
 * or crush), the kind its name says (the language file's words, FFDCC.Words.Damage), else untyped. A blow the system
 * marks as subdual is a subdual blow (the action says so), not a kind of harm.
 */
function harmOf(formula, name) {
  const named = HARMS.find(k => saysWord(`Damage.${k}`, name)) ?? "untyped";
  return parseTypedFormula(formula).map(p => (["untyped", "subdual"].includes(p.type) ? { ...p, type: named } : p));
}

const MODES = ["fly", "swim", "climb", "burrow"];
const COPPER = { pp: 1000, ep: 50, gp: 100, sp: 10, cp: 1 };
/** What a character carries that it could hand over (or ask for: its kind is the item type). */
const GOODS = ["weapon", "armor", "equipment", "treasure", "ammunition"];
/**
 * A shield: the armor with no fumble die (the system keeps none for one; every armor worn has its own, even going
 * unarmored). It's carried in hand, not worn.
 */
export const isShield = item => item?.type === "armor" && !/\d*d\d+/i.test(String(item.system?.fumbleDie ?? "1d4"));

/**
 * The die it rolls for initiative, as the system has it: its own (a d20), a two-handed weapon's in hand (a d16), or a
 * weapon in hand that sets its own (that one first).
 */
function initiativeDie(actor) {
  let formula = actor.system.attributes?.init?.die || "1d20";
  const held = actor.items.filter(i => i.type === "weapon" && i.system.equipped);
  const twoHanded = held.find(i => i.system.twoHanded);
  const custom = held.find(i => i.system.config?.initiativeDieOverride);
  if ( twoHanded ) formula = twoHanded.system.initiativeDie || "1d16";
  if ( custom ) formula = custom.system.initiativeDie || formula;
  return Number(String(formula).match(/d(\d+)/)?.[1]) || 20;
}

/**
 * Creeping up on a foe, for its side's initiative in an ambush: a thief's Sneak Silently (a halfling's Sneak and Hide),
 * and Agility. Anyone else isn't trained in it (an untrained check's d10 isn't an initiative roll): its initiative as
 * ever. Undefined for none.
 */
export function sneakOf(actor, kind) {
  const sys = actor.system;
  const skill = kind?.thief ? sys.skills?.sneakSilently?.value : kind?.halfling ? sys.skills?.sneakAndHide?.value : null;
  if ( skill === null || skill === undefined || String(skill).trim() === "" ) return undefined;
  return flatOf(skill) + (Number(sys.abilities?.agl?.mod) || 0);
}

/**
 * An XCC brawler's fists. Unarmed: two attacks together, a d16 each, a crit on a natural 16, and no fumble on one alone
 * (only double 1s, which the engine doesn't roll). Armed: a free unarmed attack, a d14, once a round besides its own.
 * To hit and damage: its attack bonus, Strength and Luck (when it helps), on its unarmed damage die. Armor too heavy
 * (a check penalty of -4 or worse): no crits.
 */
export function brawlerFists(actor, { armed, firstDie, crit }) {
  const sys = actor.system;
  const mod = flatOf(sys.details?.attackBonus) + (Number(sys.abilities?.str?.mod) || 0) + Math.max(0, Number(sys.abilities?.lck?.mod) || 0);
  const die = /\d*d\d+/.exec(String(sys.class?.unarmedDamage ?? ""))?.[0] ?? "1d3";
  const damage = [parseFormula(mod ? `${die}${mod > 0 ? "+" : "-"}${Math.abs(mod)}` : die, "bludgeoning")];
  const heavy = (actor.itemTypes?.armor ?? []).some(a => a.system.equipped && Number(a.system.checkPenalty) <= -4);
  const name = game.i18n.has("XCC.Brawler.UnarmedAttack") ? game.i18n.localize("XCC.Brawler.UnarmedAttack") : game.i18n.localize("FFDCC.Unarmed");
  const fist = (id, faces, extra = {}) => ({
    id: `${actor.id}.${id}`, name, kind: "strike", cost: 1, bonus: mod, melee: true, reach: 5, damage,
    die: faces !== firstDie ? faces : undefined, critOn: heavy ? 99 : undefined, crit, ...extra
  });
  if ( armed ) return [fist("fist-free", 14, { economy: "bonus" })];
  const one = fist("fist", 16, { fumbleOn: 0 });
  return [{ ...one, id: `${actor.id}.fists`, sequence: [one, { ...one, id: `${one.id}.2` }] }];
}

/** XCC's own words where its module has them, else this module's. */
const xccWord = (key, own) => (game.i18n.has(key) ? game.i18n.localize(key) : game.i18n.localize(own));

/** An XCC Dungeon Hottie's Not in the Face: a round spent defending, its bonus to AC until its next turn. */
export function notInTheFace(actor) {
  const ac = flatOf(actor.system.class?.notInTheFace);
  if ( !(ac > 0) ) return [];
  return [{ id: `${actor.id}.notInTheFace`, name: xccWord("XCC.DungeonHottie.NotInTheFace", "FFDCC.NotInTheFace"), kind: "buff", targets: "self", cost: 1,
    outcome: { mods: { ac }, rounds: 1, label: xccWord("XCC.DungeonHottie.NotInTheFace", "FFDCC.NotInTheFace") } }];
}

/**
 * An XCC Jammer's Disrespect: a performance check (Personality, level and Luck) its foe saves against with Will, or it
 * suffers the Jammer's penalty (a step down the dice chain counted as -2) to attacks, checks and damage for level +
 * Personality rounds. (Its save DC is the check: here, the check's average. The mindless pay it no heed.)
 */
export function disrespect(actor) {
  const sys = actor.system;
  const level = Number(sys.details?.level?.value) || 1;
  const per = Number(sys.abilities?.per?.mod) || 0;
  const bonus = per + level + (Number(sys.abilities?.lck?.mod) || 0);
  const raw = String(sys.class?.disrespectPenalty ?? "-1d");
  const steps = /(-?\d+)\s*d/i.exec(raw);
  const penalty = steps ? Math.abs(Number(steps[1])) * 2 : Math.abs(flatOf(raw)) || 2;
  const label = xccWord("XCC.Jammer.Disrespected", "FFDCC.Disrespected");
  const disrespected = { mods: { attack: -penalty, checks: -penalty, damage: -penalty }, rounds: Math.max(1, level + per), label };
  return [{ id: `${actor.id}.disrespect`, name: xccWord("XCC.Jammer.Disrespect", "FFDCC.Disrespect"), kind: "control", cost: 1, range: { increment: 60 },
    disrespect: true, save: { type: "wil", dc: Math.round(10.5 + bonus) }, onSave: [disrespected, disrespected, null, null] }];
}

/** How badly a foe that fails to resist a Gnome's Draw Agro wants the gnome: past anything but an obsession of its own. */
const AGRO = 80;

/**
 * An XCC Gnome's Draw Agro: a check (Personality, level, and Luck when it helps) its foe saves against with Will,
 * within 60 feet. Failed, the foe spends its next turn going for the gnome, or pays a step down the dice chain (two from
 * 5th level; a step counted as -2) on its rolls against anyone else (a taunt: the core's). Its save DC is the check:
 * here, the check's average. Only a thinking creature takes the bait.
 */
export function drawAgro(actor) {
  const sys = actor.system;
  const level = Number(sys.details?.level?.value) || 1;
  const bonus = (Number(sys.abilities?.per?.mod) || 0) + level + Math.max(0, Number(sys.abilities?.lck?.mod) || 0);
  const penalty = level >= 5 ? 4 : 2;
  const agro = { taunt: AGRO, defy: { attack: -penalty, checks: -penalty }, rounds: 1, label: xccWord("XCC.Status.Agro", "FFDCC.Agro") };
  return [{ id: `${actor.id}.drawAgro`, name: xccWord("XCC.Gnome.DrawAgro", "FFDCC.DrawAgro"), kind: "control", cost: 1, range: { increment: 60 },
    drawAgro: true, save: { type: "wil", dc: Math.round(10.5 + bonus) }, onSave: [agro, agro, null, null] }];
}

/**
 * An XCC Athlete's wrestling: a grapple (not with a shield in hand), its training die rolled with it like a deed die
 * (onto the roll, and the damage: a d4 and Strength), its own crit range; no crits in armor too heavy.
 */
export function wrestling(actor, { firstDie, crit }) {
  const sys = actor.system;
  if ( (actor.itemTypes?.armor ?? []).some(a => a.system.equipped && isShield(a)) ) return [];
  const str = Number(sys.abilities?.str?.mod) || 0;
  const training = Number(/d(\d+)/.exec(String(sys.class?.trainingDie ?? ""))?.[1]) || undefined;
  const heavy = (actor.itemTypes?.armor ?? []).some(a => a.system.equipped && Number(a.system.checkPenalty) <= -4);
  const range = Number(sys.class?.grappleCritRange) || 20;
  return [{ id: `${actor.id}.wrestle`, name: xccWord("XCC.Athlete.Grapple", "FFDCC.Grapple"), kind: "strike", cost: 1, bonus: str, melee: true, reach: 5,
    damage: [parseFormula(str ? `1d4${str > 0 ? "+" : "-"}${Math.abs(str)}` : "1d4", "bludgeoning")], deedDie: training,
    critOn: heavy ? 99 : (range < 20 ? range : undefined), crit, effects: [{ kind: "grabbed" }] }];
}

/** An XCC brawler's Toughness: so much off every melee blow (a reaction it always has). */
export function toughnessOf(actor) {
  const value = String(actor.system.class?.toughness ?? "").trim();
  const reduce = /d\d+/.test(value) ? parseFormula(value, "untyped") : (flatOf(value) > 0 ? part([], flatOf(value), "untyped") : null);
  if ( !reduce ) return undefined;
  const label = game.i18n.has("XCC.Brawler.Toughness") ? game.i18n.localize("XCC.Brawler.Toughness") : game.i18n.localize("FFDCC.Toughness");
  return [{ id: "toughness", label, on: "hit", reduce, melee: true }];
}

/**
 * The most Fleeting Luck or Mojo counted. Its points come one at a time (a natural 20; XCC's Mojo also for a class's
 * own feats, a few at once from a Gnome's Team Mascot die), and any natural 1 on a d14 or bigger at the table takes
 * everyone's, so a pool past twenty was typed in, not earned. (Its player owns the flag that holds it, and can write
 * anything there.)
 */
const FLEETING_MAX = 20;

/** A Fleeting Luck or Mojo flag's points, as counted: a whole number, 0 to FLEETING_MAX (anything else, none). */
export function fleetingPoints(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(FLEETING_MAX, n)) : 0;
}

/**
 * A character's Fleeting Luck or Mojo: XCC's Mojo (the XCC module on: the crawler's own, a flag on it), else DCC's
 * Fleeting Luck when the world has it on (its player's, for all its characters: a flag on the player). Null for none.
 * @returns {{kind: "actor"|"user", id: string, key: string, points: number, label: string}|null}
 */
function fleetingOf(actor) {
  if ( game.modules?.get("xcc")?.active ) {
    return { kind: "actor", id: actor.id, key: `actor:${actor.id}`, points: fleetingPoints(actor.getFlag("xcc", "mojo")),
      label: game.i18n.has("XCC.MojoTitle") ? game.i18n.localize("XCC.MojoTitle") : game.i18n.localize("DCC.FleetingLuck") };
  }
  let on = false;
  try {
    on = !!game.settings.get("dcc", "enableFleetingLuck");
  } catch ( err ) { /* no such setting */ }
  if ( !on ) return null;
  const player = game.users?.find(u => !u.isGM && actor.testUserPermission?.(u, "OWNER"));
  if ( !player ) return null;
  return { kind: "user", id: player.id, key: `user:${player.id}`, points: fleetingPoints(player.getFlag("dcc", "fleetingLuckValue")), label: game.i18n.localize("DCC.FleetingLuck") };
}

/** What kind of creature the system files it as, by its crit table (traits.js monsterKind); null for a character. */
const kindOf = actor => (actor.type === "Player" ? null : monsterKind(actor.system.attributes?.critical?.table, CONFIG.DCC?.monsterCriticalHits));

/**
 * The languages it speaks: its sheet's; with none listed, Common for every character and any creature the system files
 * as one of the people (by its crit table), else as its name says (traits.js speaksCommon).
 */
function languagesOf(actor, { pc, flags = {} }) {
  const listed = String(actor.system.details?.languages ?? "").split(/[,;/]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if ( listed.length ) return listed;
  return speaksCommon({ pc, kind: kindOf(actor), name: actor.name, mindless: !!flags.mindless, beast: !!flags.beast }) ? ["common"] : [];
}

/** DCC's abilities, by its keys. */
const ABILITIES = ["str", "agl", "sta", "per", "int", "lck"];

/** A word the system (or a module) has, in the reader's language; null when it has none. */
const word = key => (key && game.i18n.has(key) ? game.i18n.localize(key) : null);

/**
 * A dwarf's shield bash, as the system knows it: the weapon its dwarf sheet makes, with the system's name for it (in the
 * reader's language: it's how the system itself finds it again; or in English, as an untranslated book names it) or its
 * picture; or XCC's name for it.
 */
export function isShieldBash(w) {
  const named = String(w.name ?? "").trim().toLowerCase();
  const keys = ["DCC.ShieldBash", "XCC.Dwarf.ShieldBash"];
  if ( named && keys.flatMap(k => [word(k), englishWords(k)]).some(n => n && n.trim().toLowerCase() === named) ) return true;
  const img = CONFIG.DCC?.macroImages?.shieldBash;
  return !!img && w.img === img;
}

/** A sheet text field's text (the system keeps some as {value}, older data as the text itself). */
const textOf = v => String((v && typeof v === "object" ? v.value : v) ?? "").trim();

/** A weapon's name as a class sheet matches it to the one it names (XCC's way: letters only, no parentheses). */
const weaponKey = name => String(name ?? "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^\p{L}]/gu, "");

/** The fields an active effect changes with the birth augur's Luck modifier. */
const augurKeys = effect => (effect?.system?.changes ?? effect?.changes ?? [])
  .filter(c => /birthAugurLuckMod/.test(String(c?.value ?? ""))).map(c => String(c.key ?? ""));

/**
 * Whether it's in one of the world's parties (DCC's Party actors, whose members are a flag on them); undefined when
 * the world keeps none.
 */
function inPartyOf(actor) {
  const parties = game.actors?.filter?.(a => a.type === "Party") ?? [];
  if ( !parties.length ) return undefined;
  // (A token's own copy of an actor has its actor's id.)
  return parties.some(p => [p.getFlag?.("dcc", "partyMembers") ?? []].flat().some(m => m?.id === actor.id));
}

/**
 * What it could be talked (or robbed) out of: coins, what it carries, and the weapons and shield in its hands. Not the
 * armor it wears: that doesn't come off in a fight.
 */
export function valuablesOf(actor) {
  const c = actor.system.currency ?? {};
  const money = Object.entries(COPPER).reduce((s, [k, v]) => s + (Number(c[k]) || 0) * v, 0);
  const worth = i => Object.entries(COPPER).reduce((s, [k, v]) => s + (Number(i.system?.value?.[k]) || 0) * v, 0);
  const stowed = [];
  const wielded = [];
  for ( const i of actor.items ) {
    if ( !GOODS.includes(i.type) ) continue;
    const thing = { id: i.id, name: i.name, value: worth(i), category: i.type };
    if ( !(thing.value > 0) ) continue;
    if ( !["weapon", "armor"].includes(i.type) || i.system.equipped === false ) stowed.push(thing);
    else if ( i.type === "weapon" || isShield(i) ) wielded.push(thing);
  }
  return {
    money,
    denominations: [{ label: t("Coin.gp"), value: 100 }, { label: t("Coin.sp"), value: 10 }, { label: t("Coin.cp"), value: 1 }],
    stowed,
    wielded
  };
}

export class DccAdapter extends SystemAdapter {
  static systemId = "dcc";

  #tables = new DccTables();

  /** The system's birth augur effects (the core book's), once read: each one's name, lower case, and the fields it changes. */
  #augurs = null;

  get label() {
    return game.modules.get("xcc")?.active ? t("LabelXcc") : t("Label");
  }

  get rules() {
    return dccRules;
  }

  canHandle(actor) {
    return !!actor && ["Player", "NPC"].includes(actor.type);
  }

  /* -------------------------------------------- */

  async toCombatantSpec(tokenDoc) {
    const actor = tokenDoc.actor;
    if ( !this.canHandle(actor) ) return null;
    const sys = actor.system;
    const pc = actor.type === "Player";
    if ( pc ) await this.#loadAugurs();
    const line = statLine(sys.details?.notes?.value ?? "");
    const cls = pc ? this.#classOf(actor) : null;
    const kind = archetype(cls);
    const hd = hitDice(sys.attributes?.hitDice?.value);
    const level = pc ? (Number(sys.details?.level?.value) || 0) : Math.max(Number(sys.details?.level?.value) || 0, hd.level);
    const dice = actionDice(this.#actionDiceText(sys));
    const luck = Number(sys.abilities?.lck?.value) || 0;
    const luckMod = Number(sys.abilities?.lck?.mod) || 0;

    const speeds = { walk: feet(sys.attributes?.speed?.value) ?? 30 };
    if ( feet(sys.attributes?.speed?.swim) ) speeds.swim = feet(sys.attributes.speed.swim);
    if ( feet(sys.attributes?.speed?.fly) ) speeds.fly = feet(sys.attributes.speed.fly);
    for ( const mode of MODES ) if ( line[mode] && !speeds[mode] ) speeds[mode] = line[mode];

    const defenses = {
      ac: Number(sys.attributes?.ac?.value) || 10,
      frt: flatOf(sys.saves?.frt?.value),
      ref: flatOf(sys.saves?.ref?.value),
      wil: flatOf(sys.saves?.wil?.value)
    };

    const deeds = deedOf(sys.details?.attackBonus) ? deedsFrom(await this.#tables.deeds()) : null;
    const { actions, shieldBash, freeAttack } = await this.#actions(actor, { pc, kind, level, dice, luckMod, line, deeds: !!deeds });
    const resources = {};
    const boosts = [];
    // Fleeting Luck (DCC's, a player's) or Mojo (XCC's, the crawler's own): spent first, it's gone soon anyway.
    const fleeting = pc ? fleetingOf(actor) : null;
    if ( fleeting ) {
      resources.fleeting = fleeting.points;
      boosts.push({ pool: "fleeting", shared: fleeting.key, label: fleeting.label, per: 1, recovers: true });
    }
    if ( pc ) {
      // Luck burned on a roll (a halfling's counts double and can go to a friend; a thief rolls its luck die).
      resources.luck = luck;
      boosts.push({
        pool: "luck", label: game.i18n.localize("FFDCC.Luck"), keep: Math.min(6, luck),
        per: kind.halfling ? 2 : 1,
        faces: kind.thief ? (Number(String(sys.class?.luckDie ?? "").match(/d(\d+)/)?.[1]) || 3) : undefined,
        allies: kind.halfling ? 1 : 0, range: kind.halfling ? 30 : undefined,
        recovers: kind.thief || kind.halfling
      });
      // Spellburn: Strength, Agility and Stamina burned on a spell check (a wizard's or an elf's).
      if ( actions.some(a => a.casting?.lostOnFail) ) {
        const spare = ["str", "agl", "sta"].reduce((s, k) => s + Math.max(0, (Number(sys.abilities?.[k]?.value) || 0) - 8), 0);
        if ( spare > 0 ) {
          resources.spellburn = spare;
          boosts.push({ pool: "spellburn", label: game.i18n.localize("FFDCC.Spellburn"), kinds: ["cast"] });
        }
      }
    }

    const derived = this.deriveTraits(actor, { line, casts: actions.some(a => a.casting), level });
    const immune = [...line.immune];
    const fumble = pc ? await this.#fumble(sys, luckMod) : null;
    return {
      id: tokenDoc.id,
      tokenId: tokenDoc.id,
      actorId: actor.id,
      actorUuid: actor.uuid,
      name: tokenDoc.name ?? actor.name,
      img: tokenDoc.texture?.src ?? actor.img,
      kind: pc ? "pc" : "npc",
      className: cls,
      level,
      hp: { value: Number(sys.attributes?.hp?.value) || 0, max: Number(sys.attributes?.hp?.max) || 1, temp: Number(sys.attributes?.hp?.temp) || 0 },
      hitDie: hd.faces,
      defenses,
      shield: null, // a DCC shield is in the AC
      initiative: { mod: flatOf(sys.attributes?.init?.value), die: initiativeDie(actor), stealth: sneakOf(actor, kind) },
      speeds,
      actions,
      actionDice: dice,
      shieldBash,
      freeAttack,
      // (Whose Fleeting Luck or Mojo it is, for Make it So.)
      fleeting: fleeting ? { key: fleeting.key, kind: fleeting.kind, id: fleeting.id, points: fleeting.points } : undefined,
      deeds,
      // An XCC brawler's Toughness: so much off every melee blow.
      reactions: kind.brawler ? toughnessOf(actor) : undefined,
      // An XCC Dungeon Hottie's Too Cute to Die (not used yet this level); an Acrobat's (or Half-Elf's) acrobatics.
      tooCute: pc && kind.hottie && !sys.class?.tooCuteUsed ? true : undefined,
      acrobatics: pc && kind.acrobat ? { mod: flatOf(sys.skills?.acrobatics?.value) + (Number(sys.abilities?.agl?.mod) || 0) } : undefined,
      fumble,
      // (A stat line's half and double damage; and the weak spot a Puzzle-Maniac goes for: harm it guards less well.)
      iwr: { immune, resist: Object.fromEntries((line.resist ?? []).map(k => [k, 1])), weak: Object.fromEntries((line.weak ?? []).map(k => [k, 1])), exploit: weakSpot(Object.fromEntries((line.resist ?? []).map(k => [k, 1]))) },
      // Grappling: its attack bonus and the better of Strength and Agility (a monster's, its best melee attack's bonus).
      grapple: pc ? flatOf(sys.details?.attackBonus) + Math.max(Number(sys.abilities?.str?.mod) || 0, Number(sys.abilities?.agl?.mod) || 0)
        : Math.max(0, ...actions.filter(a => a.melee && a.kind === "strike").map(a => Number(a.bonus) || 0)),
      // Binding a friend's wound (homebrew; a player character): the friend's Luck decides (rules.firstAid).
      firstAid: pc ? { mod: 0, skill: t("BindWounds") } : null,
      resources,
      boosts: boosts.length ? boosts : null,
      // Sizing a foe up (a Lore-Collector): what it can recall or work out, an Intelligence check against DC 10. Not
      // for the mindless (constructs too): nothing in there to work anything out.
      sizeUp: derived.flags.mindless ? undefined : { mod: Number(sys.abilities?.int?.mod) || 0, dc: 10, label: game.i18n.localize("FFDCC.IntelligenceCheck"), boost: loreBoost() },
      luck,
      // A player character's Luck works against a monster's crits.
      critAgainst: pc ? luckMod : 0,
      unholy: !!(line.undead || line.unholy),
      alignment: String(sys.details?.alignment ?? "n").toLowerCase()[0],
      traits: Object.fromEntries(Object.entries(derived.traits).map(([k, v]) => [k, { base: v, fudge: 0 }])),
      traitReasons: derived.reasons,
      flags: { ...derived.flags },
      diesAtZero: !pc,
      conditions: this.#conditions(actor),
      perception: Math.max(Number(sys.abilities?.int?.mod) || 0, Number(sys.abilities?.per?.mod) || 0),
      // (An employer's Personality steadies its retainers.)
      personality: Number(sys.abilities?.per?.mod) || 0,
      darkvision: !!this.#infravision(kind, line),
      senses: this.#infravision(kind, line) ? [{ type: "infravision", range: this.#infravision(kind, line), dark: true }] : [],
      creatureTraits: [line.undead ? "undead" : pc ? "humanoid" : ""].filter(Boolean),
      social: {
        pitches: {
          persuade: { skill: game.i18n.localize("FFDCC.Personality"), mod: Number(sys.abilities?.per?.mod) || 0 },
          intimidate: { skill: game.i18n.localize("FFDCC.Personality"), mod: Math.max(Number(sys.abilities?.per?.mod) || 0, Number(sys.abilities?.str?.mod) || 0) },
          deceive: { skill: game.i18n.localize("FFDCC.Personality"), mod: Number(sys.abilities?.per?.mod) || 0 }
        },
        resist: {
          persuade: { dc: 10 + defenses.wil, label: t("Will") },
          intimidate: { dc: 10 + defenses.wil, label: t("Will") },
          deceive: { dc: 10 + Math.max(defenses.wil, Number(sys.abilities?.int?.mod) || 0), label: t("Will") },
          steal: { dc: 10 + Math.max(defenses.ref, Number(sys.abilities?.int?.mod) || 0), label: t("Reflex") }
        },
        resolve: defenses.wil - (Math.floor(level / 2) + 1),
        languages: languagesOf(actor, { pc, flags: derived.flags }),
        mindless: !!derived.flags.mindless
      },
      // A thief's skills; anyone else's an untrained check (a d10, and Agility), as the rules have it for skills.
      theft: kind.thief ? { skill: game.i18n.localize("FFDCC.PickPockets"), mod: flatOf(sys.skills?.pickPockets?.value) + (Number(sys.abilities?.agl?.mod) || 0) }
        : pc ? { skill: game.i18n.localize("FFDCC.PickPockets"), mod: Number(sys.abilities?.agl?.mod) || 0, faces: 10 } : null,
      doorWork: {
        force: { mod: Number(sys.abilities?.str?.mod) || 0 },
        pick: kind.thief ? { mod: flatOf(sys.skills?.pickLock?.value) + (Number(sys.abilities?.agl?.mod) || 0) } : pc ? { mod: Number(sys.abilities?.agl?.mod) || 0, faces: 10 } : null
      },
      valuables: valuablesOf(actor),
      leadership: this.#leadershipEntry(actor, tokenDoc.id, level, kind)
    };
  }

  /* -------------------------------------------- */

  /**
   * The class: the sheet's own record of it, else the sheet chosen for this actor or token (a pregen whose class
   * sheet hasn't been opened yet), else the class name.
   */
  #classOf(actor) {
    let sheetName = actor.getFlag?.("core", "sheetClass") ?? actor.flags?.core?.sheetClass ?? "";
    if ( !sheetName ) {
      try {
        sheetName = actor._getSheetClass?.()?.name ?? "";
      } catch ( err ) { /* no sheet to read */ }
    }
    return classId({ sheetClass: actor.system.details?.sheetClass, sheetName, className: actor.system.class?.className });
  }

  /** The class's name as its sheet shows it: XCC's in its own words, DCC's in the system's, else the sheet's text. */
  #className(actor, cls) {
    const c = actor.system.class ?? {};
    const path = String(c.localizationPath ?? "");
    const pascal = String(cls ?? "").replace(/(?:^|-)(\w)/g, (m, ch) => ch.toUpperCase());
    return word(path && `${path}.ActorSheet${path.split(".").pop()}`) ?? word(cls && `DCC.${pascal}`) ?? (textOf(c.className) || null);
  }

  /** Reads the system's birth augur effects once (the core book's, where the system's settings point). */
  async #loadAugurs() {
    if ( this.#augurs ) return;
    this.#augurs = [];
    const pack = game.packs?.get(CONFIG.DCC?.birthAugurEffectsPack ?? "");
    if ( !pack ) return;
    try {
      for ( const e of await pack.getDocuments() ) this.#augurs.push({ name: String(e.name ?? "").toLowerCase(), keys: augurKeys(e) });
    } catch ( err ) { /* none to read */ }
  }

  /**
   * Its birth augur: the sign's name, its Luck modifier at birth, and the fields its effect changes (the effect on the
   * character, else the system's own for that sign, found by name as the system's importer finds it). Null for none.
   */
  #augurOf(actor) {
    const d = actor.system.details ?? {};
    const effect = [...(actor.effects ?? [])].find(e => augurKeys(e).length);
    const name = String(d.birthAugur ?? "").replace(/\s*\(.*$/, "").trim() || String(effect?.name ?? "").replace(/\s*:.*$/, "").trim();
    if ( !name ) return null;
    const keys = effect ? augurKeys(effect) : this.#augurs?.find(a => a.name.startsWith(name.toLowerCase()))?.keys ?? [];
    return { name, mod: Number(d.birthAugurLuckMod) || 0, keys };
  }

  /**
   * The action dice the dcc system itself uses: its configured list, unless that still holds the default while the
   * stat block's own says more (an old or compendium monster).
   */
  #actionDiceText(sys) {
    const config = String(sys.config?.actionDice ?? "").trim();
    const value = String(sys.attributes?.actionDice?.value ?? "").trim();
    if ( !config ) return value;
    if ( config === "1d20" && value && value !== config ) return value;
    return config;
  }

  #infravision(kind, line) {
    if ( line.infravision ) return line.infravision;
    if ( kind.dwarf || kind.elf ) return 60;
    if ( kind.halfling ) return 30;
    return 0;
  }

  /** Statuses on the token that the fight would feel. */
  #conditions(actor) {
    const out = {};
    const s = statusesOf(actor);
    if ( s.has("prone") ) out.prone = true;
    if ( s.has("stun") ) out.stunned = 1;
    if ( s.has("paralysis") ) Object.assign(out, { paralyzed: 1, incapacitated: 1 });
    if ( s.has("sleep") || s.has("unconscious") ) out.incapacitated = 1;
    if ( s.has("blind") ) out.blinded = 1;
    if ( s.has("fear") ) out.frightened = 1;
    if ( s.has("restrain") || s.has("grappled") ) out.immobilized = 1;
    if ( s.has("slowed") ) out.slowed = 1;
    return out;
  }

  /** The fumble table a character rolls on, with its fumble die (from its armor) and Luck. */
  async #fumble(sys, luckMod) {
    const rows = await this.#tables.fumble();
    if ( !rows?.length ) return null;
    const die = parseFormula(String(sys.attributes?.fumble?.die || "1d4"));
    return { die, mod: -luckMod, rows };
  }

  /* -------------------------------------------- */

  async #actions(actor, { pc, kind, level, dice, luckMod, line, deeds }) {
    const sys = actor.system;
    const actions = [];
    let shieldBash = false;
    const firstDie = dice[0] ?? 20;
    const weapons = actor.itemTypes?.weapon ?? actor.items.filter(i => i.type === "weapon");
    const hands = { primary: null, offHand: null };
    for ( const w of weapons ) {
      if ( w.system.equipped === false ) continue;
      const action = await this.#weaponAction(actor, w, { pc, firstDie, luckMod, line, deeds, kind });
      if ( !action ) continue;
      // Two-weapon fighting (Table 4-3): the system has already stepped each hand's action die down the dice chain;
      // a hand that can't crit doesn't, and one that crits only on its die's highest face (a halfling's) does so.
      if ( w.system.twoWeaponPrimary || w.system.twoWeaponSecondary ) {
        const rule = String(w.system.twoWeaponCritRule ?? "");
        if ( rule && rule === game.i18n.localize("DCC.TwoWeaponCritNone") ) action.critOn = 21;
        else if ( rule ) action.critOn = 20;
        hands[w.system.twoWeaponPrimary ? "primary" : "offHand"] ??= action;
      }
      // A dwarf's shield bash: an extra attack with its own die, every round.
      if ( kind.dwarf && isShieldBash(w) ) {
        action.economy = "bonus";
        shieldBash = true;
      }
      actions.push(action);
    }
    // Fighting with both: an attack with each hand, together.
    if ( hands.primary && hands.offHand ) {
      const { primary, offHand } = hands;
      actions.push({ ...primary, id: `${actor.id}.two-weapons`, name: t("TwoWeapons", { main: primary.name, off: offHand.name }), itemId: undefined,
        sequence: [primary, offHand].map(a => ({ ...a, id: `${a.id}.two-weapons` })) });
    }
    // A monster with no weapons on its sheet: its stat line's attacks.
    if ( !pc && !actions.length ) {
      for ( const [i, a] of line.attacks.entries() ) {
        if ( !a.damage ) continue;
        actions.push({
          id: `${actor.id}.atk${i}`, name: a.name, kind: "strike", cost: 1, bonus: a.bonus, melee: a.melee, reach: a.melee ? 5 : undefined,
          range: a.melee ? null : { increment: 60 }, damage: harmOf(a.damage, a.name),
          critOn: critOnFor(line.critNatural, firstDie) ?? undefined, crit: await this.#crit(sys, null, 0),
          effects: this.#riders(a.rider)
        });
      }
    }
    // An XCC brawler's fists (fighting unarmed, or a free punch besides its weapon).
    const armed = actions.some(a => a.melee && a.kind === "strike");
    const fists = pc && kind.brawler ? brawlerFists(actor, { armed, firstDie, crit: await this.#crit(sys, null, luckMod) }) : [];
    actions.push(...fists);
    // The other XCC classes' own: a Hottie's round defending, a Jammer's Disrespect, a Gnome's Draw Agro, an Athlete's
    // wrestling.
    // (A class's own: what "magic and specialties" means, with spells.)
    const own = list => list.map(a => ({ ...a, special: true }));
    if ( pc && kind.hottie ) actions.push(...own(notInTheFace(actor)));
    if ( pc && kind.jammer ) actions.push(...own(disrespect(actor)));
    if ( pc && kind.gnome ) actions.push(...own(drawAgro(actor)));
    if ( pc && kind.athlete ) actions.push(...own(wrestling(actor, { firstDie, crit: await this.#crit(sys, null, luckMod) })));
    if ( fists.length ) actions.splice(actions.indexOf(fists[0]), fists.length, ...own(fists));
    // What anyone can try besides a blow (moves.js): Help, Grapple (an Athlete wrestles instead), Hide.
    if ( pc ) {
      const str = Number(sys.abilities?.str?.mod) || 0;
      const agl = Number(sys.abilities?.agl?.mod) || 0;
      actions.push(helpAction(actor.id));
      if ( !kind.athlete ) actions.push(grappleAction(actor.id, flatOf(sys.details?.attackBonus) + Math.max(str, agl)));
      const skill = kind.thief ? sys.skills?.hideInShadows?.value : kind.halfling ? sys.skills?.sneakAndHide?.value : null;
      const trained = skill !== null && skill !== undefined && String(skill).trim() !== "";
      actions.push(hideAction(actor.id, { mod: (trained ? flatOf(skill) : 0) + agl, trained, label: game.i18n.localize(kind.halfling && !kind.thief ? "DCC.SneakAndHide" : "DCC.HideInShadows") }));
    }
    actions.push(...await this.#spells(actor, { pc, kind, level, dice, line }));
    if ( pc && kind.cleric ) actions.push(...await this.#clericSkills(actor, dice));
    return { actions, shieldBash, freeAttack: fists.some(a => a.economy === "bonus") };
  }

  async #weaponAction(actor, w, { pc, firstDie, luckMod, line, deeds, kind }) {
    const s = w.system;
    const toHit = String(s.toHit ?? "+0");
    const deedDie = deeds ? deedOf(toHit) : null;
    let formula = String(s.damage ?? "");
    // Some monster weapons keep their damage in the description ("1d10+5") with "0" for the formula.
    if ( !/\d*d\d+/.test(formula) && !(flatOf(formula) > 0) ) {
      const said = plain(s.description?.value ?? "").match(/\d*d\d+(?:\s*[+-]\s*\d+(?!\s*d))?/)?.[0];
      if ( said ) formula = said;
    }
    // The deed die (and @ab, which stands for it) rolls with the attack: the engine adds the same roll to the damage.
    if ( deedDie ) formula = formula.replace(new RegExp(`[+-]\\s*\\d*d${deedDie}(?!\\d)`, "i"), "");
    formula = formula.replace(/[+-]?\s*@ab\b/gi, "");
    try {
      formula = Roll.replaceFormulaData(formula, actor.getRollData(), { missing: "0" });
    } catch ( err ) { /* left as it is */ }
    const damage = harmOf(formula, w.name);
    if ( !damage.length ) return null;
    const die = actionDice(s.actionDie)[0];
    const rangeFeet = feet(s.range);
    const ranged = !s.melee;
    const critNatural = line.critNatural;
    const critRange = Number(s.critRange) || 20;
    const action = {
      id: `${actor.id}.${w.id}`,
      itemId: w.id,
      name: w.name,
      kind: "strike",
      cost: 1,
      bonus: flatOf(toHit),
      melee: !ranged,
      reach: ranged ? undefined : 5,
      range: ranged || s.thrown ? { increment: rangeFeet ?? 30 } : null,
      damage,
      die: die && die !== firstDie ? die : undefined,
      critOn: critNatural ? critOnFor(critNatural, die || firstDie) : (critRange < 20 ? critRange : undefined),
      fumbleOn: Number(s.fumbleRange) > 1 ? Number(s.fumbleRange) : undefined,
      deedDie: deedDie ?? undefined,
      crit: await this.#crit(actor.system, w, pc ? luckMod : 0),
      // (A weapon the system marks as dealing subdual damage: a blow that knocks out.)
      subdual: !!s.subdual || undefined
    };
    // A thief striking a foe who can't defend itself: the backstab (its bonus, and a far worse wound).
    if ( pc && kind.thief && s.melee ) {
      const type = damage[0].type;
      const extra = s.backstabDamage ? parseFormula(String(s.backstabDamage), type) : null;
      const bonus = flatOf(actor.system.class?.backstab);
      const parts = [];
      if ( extra && (extra.dice.length || extra.flat) ) parts.push(extra);
      if ( bonus > 0 ) parts.push(part([], Math.round(bonus / 2), type)); // its to-hit bonus, as the hits it makes
      if ( parts.length ) action.bonusDamage = [{ id: "backstab", when: "exposed", parts }];
    }
    return action;
  }

  /** A crit table: the weapon's or the creature's, from the world's books; else the crit die as extra damage. */
  async #crit(sys, weapon, mod) {
    const id = String(weapon?.system?.critTable || sys.attributes?.critical?.table || "M").trim();
    const dieText = String(weapon?.system?.critDie || sys.attributes?.critical?.die || "1d4");
    const die = parseFormula(/^\d/.test(dieText) ? dieText : `1${dieText}`);
    const rows = await this.#tables.crit(id);
    if ( rows?.length ) return { die, mod, rows, table: id };
    return { die, mod: 0, rows: [{ lo: -Infinity, hi: Infinity, damage: [{ ...die, type: "untyped" }] }], table: id, guessed: true };
  }

  /** A stat line's attack rider ("plus grapple", "plus poison (DC 12 Fort or paralyzed 1d4 rounds)"). */
  #riders(text) {
    if ( !text ) return undefined;
    const t = plain(text).toLowerCase();
    const out = [];
    if ( /\bgrab|\bgrapple|\bconstrict|\bhold\b/.test(t) ) out.push({ kind: "grabbed" });
    const save = saveIn(t);
    const outcome = outcomeIn(t);
    if ( save?.dc && outcome?.conditions ) out.push({ kind: "save", label: text, save: { type: save.type, dc: save.dc }, conditions: outcome.conditions, rounds: outcome.rounds });
    return out.length ? out : undefined;
  }

  /** Spells it knows (and hasn't lost today), cast with a spell check. */
  async #spells(actor, { pc, kind, level, dice, line }) {
    const out = [];
    const sys = actor.system;
    const spells = actor.itemTypes?.spell ?? actor.items.filter(i => i.type === "spell");
    for ( const item of spells ) {
      if ( item.system.lost ) continue;
      const book = await this.#tables.spell(item);
      if ( !book?.rows?.length ) continue;
      const check = item.system.spellCheck ?? {};
      let mod = flatOf(check.value) + flatOf(check.penalty) + flatOf(check.otherBonus);
      // A monster's sheet often keeps the default; its stat line says what it really casts at.
      if ( !pc && Number.isFinite(line.spellCheck) && (Number(sys.class?.spellCheck) || 1) === 1 ) mod = line.spellCheck;
      const action = spellAction({
        id: `${actor.id}.${item.id}`, name: item.name, level: Number(item.system.level || book.level) || 1, rows: book.rows, mod,
        faces: actionDice(check.die)[0] ?? dice[0] ?? 20,
        // A cleric casts as a cleric whatever the item was left at (a stat-block importer leaves the default).
        mode: kind?.cleric ? "cleric" : (book.mode ?? item.system.config?.castingMode ?? "wizard"),
        disapproval: sys.class?.disapproval, monster: !pc, casterLevel: level,
        save: item.system.save || book.save || "", rangeText: item.system.range || book.range || ""
      });
      if ( action ) out.push({ ...action, itemId: item.id, spell: true });
    }
    return out;
  }

  /** A cleric's Lay on Hands and Turn Unholy, from their tables (or rough versions without them). */
  async #clericSkills(actor, dice) {
    const sys = actor.system;
    const faces = dice[0] ?? 20;
    const disapproval = sys.class?.disapproval ?? 1;
    const lay = layOnHandsAction({ id: `${actor.id}.layOnHands`, name: game.i18n.localize("FFDCC.LayOnHands"), rows: await this.#tables.layOnHands(), mod: flatOf(sys.skills?.layOnHands?.value ?? sys.class?.spellCheck), faces, disapproval });
    const turn = turnUnholyAction({ id: `${actor.id}.turnUnholy`, name: game.i18n.localize("FFDCC.TurnUnholy"), rows: await this.#tables.turnUnholy(), mod: flatOf(sys.skills?.turnUnholy?.value ?? sys.class?.spellCheck), faces, disapproval });
    return [lay, turn];
  }

  /* -------------------------------------------- */

  #leadershipEntry(actor, id, level, kind) {
    return { id, name: actor.name, level, personality: Number(actor.system.abilities?.per?.mod) || 0, cleric: !!kind?.cleric };
  }

  /** What a character's system says for setting it up by itself (auto.js): its class sheet, alignment, stat line. */
  #facts(actor) {
    const sys = actor.system ?? {};
    const pc = actor.type === "Player";
    const line = statLine(sys.details?.notes?.value ?? "");
    const derived = this.deriveTraits(actor, { line });
    return {
      cls: pc ? this.#classOf(actor) : null,
      alignment: String(sys.details?.alignment ?? "").toLowerCase()[0] ?? null,
      undead: !!line.undead, unholy: !!line.unholy, mindless: !!derived.flags?.mindless, beast: !!derived.flags?.beast
    };
  }

  /** The playstyles DCC says fit it (auto.js). */
  playstyleHints(actor) {
    return dccHints(this.#facts(actor));
  }

  /**
   * Its own answers to the tactics questions, and what it offers and expects (auto.js dccTactics), from what its sheet
   * and its CombatantSpec say: its class and level, the weapons it fights with and those its class sheet marks, a
   * deed die, its occupation, its Luck; a creature's stat line, Will, flight and pack tactics.
   */
  tacticHints(actor, spec) {
    return dccTactics(this.#tacticFacts(actor, spec));
  }

  /** What dccTactics reads (see there). */
  #tacticFacts(actor, spec = null) {
    const sys = actor.system ?? {};
    const pc = actor.type === "Player";
    const facts = this.#facts(actor);
    const line = statLine(sys.details?.notes?.value ?? "");
    const actions = spec?.actions ?? [];
    const own = id => (actions.some(a => a.id === id) ? id : null);
    const c = sys.class ?? {};
    // The weapons its class sheet marks as its own: a warrior's lucky weapon; XCC's deed weapon (a Hottie's One Move),
    // a Jammer's chosen weapon, a Messenger's favored weapon.
    const marks = { lucky: weaponKey(c.luckyWeapon), deed: c.oneMove === "deed" ? weaponKey(c.deedWeapon) : "", chosen: weaponKey(c.chosenWeapon), favored: weaponKey(c.favoredWeapon) };
    const weapons = (actor.itemTypes?.weapon ?? actor.items?.filter?.(i => i.type === "weapon") ?? [])
      .filter(w => w.system?.equipped !== false && own(`${actor.id}.${w.id}`))
      .map(w => ({
        id: `${actor.id}.${w.id}`, name: w.name, trained: w.system?.trained !== false,
        mark: Object.keys(marks).find(k => marks[k] && marks[k] === weaponKey(w.name)) ?? null
      }));
    const spells = actor.itemTypes?.spell ?? actor.items?.filter?.(i => i.type === "spell") ?? [];
    const level = Number(spec?.level ?? (pc ? sys.details?.level?.value : hitDice(sys.attributes?.hitDice?.value).level)) || 0;
    const luck = sys.abilities?.lck?.value;
    return {
      ...facts,
      pc,
      level,
      luck: pc && luck !== undefined && luck !== null && String(luck).trim() !== "" ? Number(luck) : undefined,
      weapons,
      twoWeapons: own(`${actor.id}.two-weapons`),
      fists: own(`${actor.id}.fists`),
      occupation: textOf(sys.details?.occupation),
      deedDie: pc && !!deedOf(sys.details?.attackBonus),
      construct: !!line.construct,
      fearless: !!line.fearless,
      casts: actions.some(a => a.casting || a.spell) || spells.length > 0 || !!line.spellcasting,
      flies: (Number(spec?.speeds?.fly) || feet(sys.attributes?.speed?.fly) || line.fly || 0) > 0,
      pack: !!(spec?.flags?.packTactics || line.pack),
      will: spec?.defenses?.wil ?? flatOf(sys.saves?.wil?.value),
      names: {
        cls: pc ? this.#className(actor, facts.cls) : null,
        alignment: word(CONFIG.DCC?.alignments?.[facts.alignment]),
        will: word(CONFIG.DCC?.saves?.wil),
        luck: word(CONFIG.DCC?.abilities?.lck),
        scroll: word("DCC.CastSpellFromScroll"),
        poison: word("DCC.HandlePoison"),
        lucky: word("DCC.LuckyWeapon"),
        deed: word("XCC.DungeonHottie.DeedWeapon"),
        chosen: word("XCC.Jammer.ChosenWeapon"),
        favored: word("XCC.Messenger.FavoredWeapon"),
        trained: word("DCC.WeaponPropertiesTrained"),
        twoWeapons: word("DCC.TwoWeaponFighting"),
        deeds: word("DCC.MightyDeedsOfArms"),
        layOnHands: (facts.cls === "messenger" ? word("XCC.Messenger.LayOnHands") : null) ?? word("DCC.LayOnHands")
      }
    };
  }

  /**
   * Its biography, for its keywords. What's said of the character itself, in full: its occupation and title (XCC's
   * casting), the sign it was born under, a wizard's corruption; a creature's notes (its stat line and description).
   * A player character's notes and XCC's rewards notes are its story, with others in it: a little. Never its patron,
   * god, contacts or entourage: those are others. DCC keeps no dislikes.
   */
  biography(actor) {
    const sys = actor.system ?? {};
    const d = sys.details ?? {};
    const pc = actor.type === "Player";
    const notes = plainText(d.notes?.value);
    const corruption = typeof sys.class?.corruption === "string" ? plainText(sys.class.corruption) : "";
    const about = [textOf(d.occupation), textOf(d.title), textOf(d.casting), String(d.birthAugur ?? "").replace(/\s*\(.*$/, "").trim(), corruption, pc ? "" : notes];
    const story = [pc ? notes : "", plainText(d.xccnotes)];
    const join = list => list.filter(Boolean).join(". ");
    return { about: join(about), story: join(story), against: "" };
  }

  deriveTraits(actor, { line = null, casts = false, level = null } = {}) {
    const sys = actor.system;
    const read = line ?? statLine(sys.details?.notes?.value ?? "");
    const hd = hitDice(sys.attributes?.hitDice?.value);
    const pc = actor.type === "Player";
    const intScore = Number(sys.abilities?.int?.value);
    const alignment = String(sys.details?.alignment ?? "n").toLowerCase()[0];
    // (It casts: spells the tables can read, or any spell it has.)
    const spells = actor.itemTypes?.spell ?? actor.items?.filter?.(i => i.type === "spell") ?? [];
    const cls = pc ? this.#classOf(actor) : null;
    return deriveDccTraits({
      pc,
      level: level ?? (pc ? Number(sys.details?.level?.value) || 0 : hd.level),
      alignment,
      will: flatOf(sys.saves?.wil?.value),
      mods: Object.fromEntries(ABILITIES.map(k => [k, Number(sys.abilities?.[k]?.mod) || 0])),
      int: pc ? undefined : intScore,
      kind: kindOf(actor),
      name: actor.name,
      notes: plain(sys.details?.notes?.value ?? ""),
      undead: !!read.undead,
      unholy: !!read.unholy,
      construct: !!read.construct,
      fearImmune: !!read.fearless,
      pack: !!read.pack,
      immune: read.immune ?? [],
      casts: casts || spells.length > 0,
      ...(pc ? {
        cls,
        hp: Number(sys.attributes?.hp?.max) || 0,
        hitDie: hd.faces,
        augur: this.#augurOf(actor),
        deedDie: !!deedOf(sys.details?.attackBonus),
        inParty: inPartyOf(actor)
      } : {}),
      names: {
        abilities: Object.fromEntries(ABILITIES.map(k => [k, word(CONFIG.DCC?.abilities?.[k]) ?? k])),
        will: word(CONFIG.DCC?.saves?.wil),
        hp: word("DCC.HitPoints"),
        alignment: word(CONFIG.DCC?.alignments?.[alignment]),
        cls: pc ? this.#className(actor, cls) : null
      }
    });
  }

  detectLeaders(specs) {
    return rankDccLeaders(specs.map(s => s.leadership).filter(Boolean));
  }

  /** The kinds of thing a character can ask for in a standoff: DCC's item types, in its own words (it has no materials or rarities). */
  itemCatalog() {
    return {
      categories: GOODS.filter(k => CONFIG.Item.typeLabels?.[k]).map(key => ({ key, label: game.i18n.localize(CONFIG.Item.typeLabels[key]) })),
      materials: [],
      rarities: []
    };
  }

  /** DCC's words for armor class and hit points: the helper's own (the system has only the long forms). */
  term(key) {
    return key === "ac" ? t("Ac") : key === "hp" ? t("Hp") : null;
  }

  resourceLabel(key) {
    if ( key === "luck" ) return game.i18n.localize("FFDCC.Luck");
    if ( key === "spellburn" ) return game.i18n.localize("FFDCC.Spellburn");
    return null;
  }

  async commitOutcome(tokenDoc, spec, final, options) {
    return commitDccOutcome(tokenDoc, spec, final, options);
  }

  describeOutcome(spec, final) {
    return describeDccOutcome(spec, final);
  }

  async commitConcession(giverDoc, receiverDoc, concession) {
    return commitDccConcession(giverDoc, receiverDoc, concession);
  }
}
