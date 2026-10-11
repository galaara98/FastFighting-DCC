/**
 * DCC personality defaults. DCC monsters rarely carry ability scores, so a monster's mind is read from what it is
 * (a beast, the walking dead, a giant, a spellcaster), its Will save and its alignment; a character's from its level
 * (a 0-level peasant in the funnel is no hardened adventurer) and alignment.
 * Pure: takes plain values, unit-testable.
 */
import { t } from "./words.js";
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const BEAST = /\b(?:wolf|wolves|hound|dog|bear|boar|rat|snake|serpent|owl|toad|frog|bat|spider|stag|goat|vulture|hawk|eagle|cat|lion|tiger|ape|horse|mule|shark|crab|beetle|ant|worm|lizard|crocodile|leech|insect|swarm)\b/i;
const MINDLESS = /\b(?:zombie|skeleton|ooze|jelly|slime|golem|automaton|statue|mist|plant|fungus|mold)\b/i;
const CLEVER = /\b(?:wizard|sorcer|witch|warlock|cleric|priest|acolyte|shaman|mage|lich|dragon|demon|devil|vampire|king|queen|thane|lord|lady|captain|chief)\b/i;

/**
 * @param {object} d
 * @param {boolean} d.pc         a player character
 * @param {number} d.level       level, or hit dice
 * @param {string} d.alignment   "l", "n" or "c"
 * @param {number} d.will        Will save
 * @param {number} [d.int]       Intelligence score, when it has one
 * @param {string} [d.name]
 * @param {string} [d.notes]     the stat line and notes
 * @param {boolean} [d.undead]
 * @param {boolean} [d.casts]    it casts spells
 * @returns {{traits, flags, reasons}}
 */
export function deriveDccTraits(d) {
  const reasons = {};
  const flags = {};
  const a = String(d.alignment ?? "n").toLowerCase()[0];
  const lawful = a === "l";
  const chaotic = a === "c";
  if ( d.pc ) {
    const zero = (d.level ?? 0) <= 0;
    const why = zero ? t("Reason.Zero") : t("Reason.Pc");
    return {
      traits: {
        tactical: zero ? 45 : 65,
        brave: zero ? 50 : 75,
        selfish: clamp((zero ? 35 : 25) + (chaotic ? 15 : lawful ? -5 : 0), 0, 100),
        loyal: clamp((zero ? 55 : 75) + (lawful ? 5 : chaotic ? -10 : 0), 0, 100)
      },
      flags,
      reasons: { tactical: why, brave: why, selfish: `${why}, ${alignmentName(a)}`, loyal: `${why}, ${alignmentName(a)}` }
    };
  }
  const what = `${d.name ?? ""} ${d.notes ?? ""}`;
  const beast = BEAST.test(d.name ?? "");
  const mindless = !!d.undead && MINDLESS.test(what) || MINDLESS.test(d.name ?? "");
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
  } else if ( d.casts || CLEVER.test(d.name ?? "") ) {
    tactical = 60;
    reasons.tactical = d.casts ? t("Reason.Caster") : t("Reason.LeaderMind");
  }
  const typicalWill = Math.floor((d.level ?? 1) / 2) + 1;
  let brave = clamp(50 + ((d.will ?? 0) - typicalWill) * 5, 10, 90);
  reasons.brave = t("Reason.WillSave");
  if ( d.undead || mindless ) {
    brave = 100;
    flags.fearless = true;
    reasons.brave = d.undead ? t("Reason.UndeadNeverFlees") : t("Reason.NeverFlees");
  } else if ( beast ) {
    brave = Math.min(brave, 45);
    reasons.brave = t("Reason.BeastFlees");
  }
  if ( mindless ) flags.mindless = true;
  if ( /\bpack\b/i.test(d.notes ?? "") && beast ) flags.packTactics = true;
  return {
    traits: {
      tactical,
      brave,
      selfish: chaotic ? 60 : lawful ? 35 : 50,
      loyal: lawful ? 60 : chaotic ? 40 : 50
    },
    flags,
    reasons: { ...reasons, selfish: alignmentName(a), loyal: alignmentName(a) }
  };
}

function alignmentName(a) {
  return { l: t("Lawful"), c: t("Chaotic") }[a] ?? t("Neutral");
}
