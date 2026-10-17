/**
 * DCC personality defaults. Every number here is a starting point the GM can fudge.
 * Pure: takes plain values, unit-testable.
 *
 * A player character starts as the usual hero (the core's PC_BASELINE) and everything on its sheet moves it a little,
 * each part shown in the trait's reason: a 0-level funnel peasant is no hardened hero; its six abilities (Intelligence
 * and Agility for Tactical; Strength, Stamina and Luck for Brave; Personality's charm for Loyal, its force of will being
 * in its Will save); its Will save against the usual at its level; its hit points against the usual for its level and
 * hit die; its level; its class (the class sheet's id, DCC's and XCC's; a class from another book by what it does: a
 * deed die, spells); its alignment (a cleric's counts half again: it serves its side's god); its birth augur, by what
 * the lucky sign governs; and whether it's in one of the world's parties.
 *
 * DCC monsters rarely carry ability scores, so a monster's mind is read from what its stat line says it is (the walking
 * dead, a construct, a spellcaster) and the kind the system files it as (its crit table), and only where those say
 * nothing from its name (the language file's word lists: a beast, the mindless, a cunning or commanding mind); its Will
 * save and its alignment; then what else its stat line says (immune to fear, a demon or devil) and whatever ability
 * scores it does have move it from there. The mindless never change.
 */
import { clamp, traitsFromParts, partsOf, signedNumber, PC_BASELINE } from "./core.js";
import { archetype } from "./classes.js";
import { t, saysWord } from "./words.js";

/** The level the usual hero plays at (most DCC play runs 1st to 5th): its level moves it from there. */
const USUAL_LEVEL = 3;

/** A 0-level funnel peasant is no hardened hero: a typical one stands about 45 tactical, 50 brave, 35 selfish, 55 loyal. */
const ZERO = Object.freeze({ tactical: -20, brave: -25, selfish: 10, loyal: -25 });

/**
 * The usual Will save at each level, 0 to 10, from the class alone (the usual Personality's modifier is 0): the
 * average of DCC's seven classes (the warrior's and thief's +0 to +3, the dwarf's +1 to +4, the others' +1 to +6),
 * rounded. A 0-level's is 0.
 */
const USUAL_WILL = [0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5];
export const usualWill = level => (level <= 0 ? 0 : USUAL_WILL[level] ?? Math.round(level / 2));

/** The usual maximum hit points at a level: a 0-level's d4, then its hit die each level, with Stamina on each. */
export const usualHp = (level, faces, sta = 0) => 2.5 + sta + Math.max(0, level) * ((faces + 1) / 2 + sta);

/** How each ability's modifier (-3 to +3; the usual hero's is 0) moves a trait, a point at a time. */
const ABILITY_LEANS = Object.freeze({
  int: { tactical: 3 }, // a good head
  agl: { tactical: 1 }, // quick to read a fight as it moves
  str: { brave: 1 }, // a strong arm
  sta: { brave: 1.5 }, // it can take a blow
  lck: { brave: 1.5 }, // fortune favors it, and it knows it
  per: { loyal: 2 } // charm: it makes friends and keeps them (its force of will is in its Will save)
});

/** What a class leans toward, by its class sheet's id (DCC's and XCC's). */
const CLASS_LEANS = Object.freeze({
  warrior: { brave: 5 },
  dwarf: { brave: 4, loyal: 3 }, "xcc-dwarf": { brave: 4, loyal: 3 },
  thief: { selfish: 5, tactical: 2, loyal: -2 },
  halfling: { brave: -3, selfish: -3, loyal: 3 },
  elf: { tactical: 3, loyal: -3 },
  wizard: { tactical: 5, brave: -3, selfish: 3 },
  cleric: { selfish: -5, loyal: 4, brave: 2 }, messenger: { selfish: -5, loyal: 4, brave: 2 },
  // XCC's own.
  athlete: { brave: 3, loyal: 2 }, blaster: { tactical: 4, brave: -2 }, brawler: { brave: 5, tactical: -3 },
  gnome: { selfish: -4, loyal: 4, brave: 2 }, "half-elf": { tactical: 2, loyal: 2 }, "half-orc": { brave: 4, tactical: -3 },
  jammer: { loyal: 3, brave: 2 }, "dungeon-hottie": { selfish: 4, brave: -2 },
  "sp-acrobat": { brave: 2, selfish: 2 }, "sp-commando": { brave: 3, tactical: 3 }, "sp-criminal": { selfish: 6, loyal: -3 },
  "sp-crypt-raider": { selfish: 4, tactical: 2 }, "sp-dwarf-mechanic": { tactical: 4, loyal: 2 },
  "sp-elf-trickster": { selfish: 3, tactical: 2, loyal: -2 }, "sp-half-orc-slayer": { brave: 4, tactical: -2 },
  "sp-halfling-rogue": { selfish: 2, loyal: 2 }, "sp-scout": { tactical: 3 }
});
/** Any other XCC Specialist: a thief's leaning, lighter. */
const SPECIALIST = Object.freeze({ selfish: 3, tactical: 2 });

/** What an alignment says (DCC's cosmic sides): Law's order and fellowship, Chaos's each for itself. */
const ALIGNMENT_LEANS = Object.freeze({ l: { selfish: -6, loyal: 5 }, c: { selfish: 12, loyal: -8 } });

/** Being in none of the world's parties (when it keeps any). */
const NO_PARTY = -8;

/**
 * The rolls a birth augur's lucky sign governs, by the fields its effect changes, and the trait they speak to (in
 * order: the first that matches counts). Its Will save already has it, so a sign on Will says nothing more.
 */
const AUGUR_GOVERNS = [
  [/^system\.skills\.turnUnholy\b/, "selfish", -1],
  [/^system\.(?:details\.attack|attributes\.ac\b|saves\.frt\b)/, "brave", 1],
  [/^system\.(?:skills\.|class\.spellCheck|attributes\.init\b)/, "tactical", 1]
];

/**
 * What a birth augur says of who was born under it: its Luck modifier at birth, half again, on the trait the rolls its
 * sign governs speak to: fighting (attacks, damage, Armor Class, Fortitude) Brave; a sharp eye or mind (traps and
 * secret doors, spell checks, initiative) Tactical; turning the unholy, a selfless calling.
 * @param {string[]} keys   the fields its effect changes ("system.saves.frt.otherBonus" ...)
 * @param {number} mod      its Luck modifier at birth
 * @returns {{trait: string, n: number}|null}
 */
export function augurLean(keys = [], mod = 0) {
  const luck = Number(mod) || 0;
  if ( !luck ) return null;
  for ( const key of keys ?? [] ) {
    const hit = AUGUR_GOVERNS.find(([re]) => re.test(String(key)));
    if ( hit ) return { trait: hit[1], n: luck * 1.5 * hit[2] };
  }
  return null;
}

/** Parts from its ability modifiers. */
function abilityParts(mods = {}, names = {}) {
  const parts = [];
  for ( const [k, lean] of Object.entries(ABILITY_LEANS) ) {
    const mod = Number(mods?.[k]) || 0;
    if ( mod ) parts.push(...partsOf(lean, t("Reason.Ability", { name: names[k] ?? k, n: signedNumber(mod) }), mod));
  }
  return parts;
}

function alignmentName(a) {
  return { l: t("Lawful"), c: t("Chaotic") }[a] ?? t("Neutral");
}

/**
 * A player character's parts: everything on its sheet that moves it from the usual hero.
 * @param {object} d   see deriveDccTraits
 */
export function pcParts(d) {
  const names = d.names ?? {};
  const level = Math.max(0, Number(d.level) || 0);
  const zero = level <= 0;
  const a = String(d.alignment ?? "n").toLowerCase()[0];
  const cls = d.cls ?? null;
  const sta = Number(d.mods?.sta) || 0;
  const parts = [];
  const add = (trait, n, why) => parts.push({ trait, n, why });

  // Where it stands: a 0-level funnel peasant is no hardened hero; past that, experience.
  if ( zero ) parts.push(...partsOf(ZERO, t("Reason.Zero")));
  else {
    const why = t("Reason.Level", { n: level });
    add("tactical", level - USUAL_LEVEL, why);
    add("brave", (level - USUAL_LEVEL) / 2, why);
  }

  // Its abilities.
  parts.push(...abilityParts(d.mods, names.abilities));

  // Nerve: its Will against the usual at its level, and its hit points against the usual for its level and hit die.
  if ( Number.isFinite(d.will) ) {
    const delta = d.will - usualWill(level);
    add("brave", delta * 3, t("Reason.Will", { name: names.will ?? t("Will"), n: signedNumber(delta) }));
  }
  if ( Number(d.hp) > 0 && Number(d.hitDie) > 0 ) {
    const usual = usualHp(level, Number(d.hitDie), sta);
    add("brave", clamp((d.hp - usual) / Math.max(usual, 1) * 8, -4, 4), t("Reason.HitPoints", { name: names.hp ?? t("Hp"), n: d.hp, usual: Math.round(usual) }));
  }

  // Its class; one this module doesn't know (another book's), by what it does.
  const lean = CLASS_LEANS[cls] ?? (String(cls ?? "").startsWith("sp-") ? SPECIALIST : null);
  if ( lean ) parts.push(...partsOf(lean, names.cls ?? cls));
  else if ( !zero ) {
    if ( d.deedDie ) add("brave", 3, t("Reason.DeedDie"));
    if ( d.casts ) add("tactical", 3, t("Reason.Caster"));
  }

  // Its side: a cleric's (or a Messenger's) counts half again, for it serves that side's god.
  parts.push(...partsOf(ALIGNMENT_LEANS[a], names.alignment ?? alignmentName(a), archetype(cls).cleric ? 1.5 : 1));

  // The sign it was born under.
  const augur = augurLean(d.augur?.keys, d.augur?.mod);
  if ( augur ) add(augur.trait, augur.n, t("Reason.Ability", { name: d.augur.name ?? "", n: signedNumber(d.augur.mod) }));

  // Its friends: one in none of the world's parties is less bound to the others.
  if ( d.inParty === false ) add("loyal", NO_PARTY, t("Reason.NoParty"));
  return parts;
}

/** The kinds of creature the system files as people (by the crit table it gives them): they have words. */
const PEOPLE = ["humanoid", "giant", "dragon", "demon"];

/**
 * What kind of creature the system takes it for, by the crit table it gave it (its stat block importer picks the table
 * by kind: CONFIG.DCC.monsterCriticalHits): "humanoid", "giant", "dragon", "demon", "undead" or "other"; null for a
 * table none of those use.
 * @param {string} table          its crit table ("III", "G", "M" ...)
 * @param {object} [critHits]     CONFIG.DCC.monsterCriticalHits: {hitDice: {kind: {table, die}}}
 */
export function monsterKind(table, critHits = {}) {
  const id = String(table ?? "").trim();
  if ( !id ) return null;
  for ( const row of Object.values(critHits ?? {}) ) {
    for ( const [kind, hit] of Object.entries(row ?? {}) ) if ( hit?.table === id ) return kind;
  }
  return null;
}

/**
 * Does a creature speak Common when its sheet lists no languages? Every character does; the mindless don't; any
 * creature the system files as one of the people (a humanoid, a giant, a dragon or a demon) does. Of the un-dead and
 * other monsters, only those whose name says they speak (FFDCC.Words.SpeaksCommon: a centaur, a ghoul), beasts not;
 * one with a crit table the system doesn't file, unless it's a beast.
 * @param {object} d
 * @param {boolean} [d.pc]
 * @param {string} [d.kind]       its monsterKind
 * @param {string} [d.name]
 * @param {boolean} [d.mindless]  @param {boolean} [d.beast]   as deriveDccTraits found it
 */
export function speaksCommon({ pc = false, kind = null, name = "", mindless = false, beast = false } = {}) {
  if ( pc ) return true;
  if ( mindless ) return false;
  if ( PEOPLE.includes(kind) ) return true;
  if ( kind ) return !beast && saysWord("SpeaksCommon", name);
  return !beast;
}

/**
 * Does it fight as an animal (the core's spec.animalistic)? A beast (deriveDccTraits: its name, unless it's one of the
 * people), or a creature of animal wits, Intelligence 11 or less where its sheet says, that speaks no language. Never
 * a mindless one, never a character.
 * @param {{pc?: boolean, beast?: boolean, mindless?: boolean, int?: number, languages?: string[]}} d
 */
export function animalisticOf({ pc = false, beast = false, mindless = false, int = NaN, languages = [] } = {}) {
  if ( pc || mindless ) return false;
  return beast || (!languages.length && Number.isFinite(int) && int <= 11);
}

/**
 * @param {object} d
 * @param {boolean} d.pc         a player character
 * @param {number} d.level       level, or hit dice
 * @param {string} d.alignment   "l", "n" or "c"
 * @param {number} d.will        Will save
 * @param {Record<string, number>} [d.mods]   ability modifiers: str, agl, sta, per, int, lck
 * @param {boolean} [d.casts]    it casts spells
 * A creature's own (what its stat line says, its kind by its crit table; its name and notes where they say nothing):
 * @param {number} [d.int]       Intelligence score, when it has one
 * @param {string} [d.kind]      its monsterKind
 * @param {string} [d.name]      @param {string} [d.notes]   its stat line and notes, as plain text
 * @param {boolean} [d.undead]
 * @param {boolean} [d.unholy]   a demon or devil
 * @param {boolean} [d.construct]   construct traits: no mind to speak of
 * @param {boolean} [d.fearImmune]  immune to fear itself
 * @param {boolean} [d.pack]     pack tactics
 * @param {string[]} [d.immune]  what it's immune to ("frightened", "charm" ...)
 * A player character's own:
 * @param {string} [d.cls]       the class sheet's id ("warrior", "sp-scout")
 * @param {number} [d.hp]        maximum hit points   @param {number} [d.hitDie]   its hit die's faces
 * @param {{name, mod, keys}} [d.augur]   its birth augur: its name, Luck modifier at birth, and the fields its effect changes
 * @param {boolean} [d.deedDie]  its attack bonus is a deed die
 * @param {boolean} [d.inParty]  in one of the world's parties (undefined: the world keeps none)
 * @param {object} [d.names]     the words shown: {abilities: {k: label}, will, hp, cls, alignment}
 * @returns {{traits, flags, reasons}}
 */
export function deriveDccTraits(d) {
  const reasons = {};
  const flags = {};
  const a = String(d.alignment ?? "n").toLowerCase()[0];
  const lawful = a === "l";
  const chaotic = a === "c";
  const names = d.names ?? {};
  if ( d.pc ) {
    const built = traitsFromParts(PC_BASELINE, pcParts(d), { from: t("Reason.Pc") });
    return { traits: built.traits, flags, reasons: built.reasons };
  }
  // What it is: its stat line first (construct traits: no mind to break), then, where that says nothing, its name (the
  // language file's words: FFDCC.Words.Mindless, Beast, Clever; an un-dead's notes too, for the mindless). A creature
  // the system files as one of the people (its crit table) is no beast, whatever it's called.
  const mindless = !!d.construct || saysWord("Mindless", d.name) || (!!d.undead && saysWord("Mindless", d.notes));
  const beast = !PEOPLE.includes(d.kind) && saysWord("Beast", d.name);
  let tactical = 40;
  reasons.tactical = t("Reason.Typical");
  if ( Number.isFinite(d.int) && d.int !== 10 ) {
    tactical = clamp(35 + Math.floor((d.int - 10) / 2) * 8, 5, 95);
    reasons.tactical = t("Reason.Int", { n: d.int });
  } else if ( beast ) {
    tactical = 20;
    reasons.tactical = t("Reason.Beast");
  } else if ( mindless ) {
    tactical = 5;
    reasons.tactical = t("Reason.BarelyThinks");
  } else if ( d.casts || saysWord("Clever", d.name) ) {
    tactical = 60;
    reasons.tactical = d.casts ? t("Reason.Caster") : t("Reason.LeaderMind");
  }
  const typicalWill = Math.floor((d.level ?? 1) / 2) + 1;
  const delta = (d.will ?? 0) - typicalWill;
  let brave = clamp(50 + delta * 5, 10, 90);
  reasons.brave = t("Reason.Will", { name: names.will ?? t("Will"), n: signedNumber(delta) });
  if ( d.undead || mindless ) {
    brave = 100;
    flags.fearless = true;
    reasons.brave = d.undead ? t("Reason.UndeadNeverFlees") : t("Reason.NeverFlees");
  } else if ( beast ) {
    brave = Math.min(brave, 45);
    reasons.brave = t("Reason.BeastFlees");
  }
  if ( mindless ) flags.mindless = true;
  // (Immune to fear itself: its group's morale can't break it, as its "never flees" says.)
  if ( d.fearImmune ) flags.fearless = true;
  if ( beast ) flags.beast = true;
  if ( d.pack ) flags.packTactics = true;
  const side = names.alignment ?? alignmentName(a);
  Object.assign(reasons, { selfish: side, loyal: side });
  const base = { tactical, brave, selfish: chaotic ? 60 : lawful ? 35 : 50, loyal: lawful ? 60 : chaotic ? 40 : 50 };
  // The mindless don't change: nothing moves them.
  if ( mindless ) return { traits: base, flags, reasons };

  // What moves it from there: whatever ability scores it has (most monsters' are all 10s), what its stat line says.
  const parts = abilityParts({ ...d.mods, int: 0 }, names.abilities);
  const immune = new Set(d.immune ?? []);
  if ( !d.undead && immune.has("frightened") ) parts.push({ trait: "brave", n: 10, why: t("Reason.ImmuneFear") });
  if ( d.unholy ) parts.push({ trait: "selfish", n: 8, why: t("Reason.Fiend") });
  // (Each trait's reason first, then the parts that moved it.)
  const built = traitsFromParts(base, flags.fearless ? parts.filter(p => p.trait !== "brave") : parts, { lead: reasons, min: 0, max: 100 });
  return { traits: built.traits, flags, reasons: built.reasons };
}
