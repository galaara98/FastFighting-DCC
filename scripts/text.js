/**
 * Reading DCC's tables in the engine's terms: crit and fumble results, Mighty Deeds, spell check results, and the
 * specials in a monster's stat line.
 *
 * The free system ships none of these tables; they come from whatever books a world has installed (the DCC and
 * XCC core books, adventures, homebrew). They're read at run time, so nothing of their text lives in this module.
 * What can't be read is left out, never guessed into something it isn't.
 * Pure: no Foundry globals.
 */
import { parseFormula, part, meanPart, listJoin, listItems, localize, signedNumber } from "./core.js";
import { harmKinds } from "./moves.js";
// (Its texts are `t` here: this module's words are `say`.)
import { t as say } from "./words.js";

const NUMBER_WORDS = { a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
/** "frt", "ref", "wil": DCC's saves. */
const SAVES = { fort: "frt", fortitude: "frt", ref: "ref", reflex: "ref", will: "wil" };
const TYPES = { fire: "fire", flame: "fire", cold: "cold", ice: "cold", frost: "cold", acid: "acid", electric: "electricity", electricity: "electricity", electrical: "electricity", lightning: "electricity", holy: "holy", unholy: "unholy", poison: "poison", sonic: "sonic", force: "force" };

/** A table row's words, with Foundry's inline rolls ("[[/roll 1d6]]") and links as plain text. */
export function plain(text) {
  return String(text ?? "")
    .replace(/\[\[\/?(?:publicroll|roll|gmr|br|r)?\s*([^\]#]*?)(?:\s*#[^\]]*)?\]\](?:\{([^}]*)\})?/gi, (m, f, label) => label ?? f.trim())
    .replace(/@\w+\[[^\]]*\](?:\{([^}]*)\})?/g, (m, label) => label ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&(?:r|l)squo;|[’‘]/g, "'").replace(/&(?:r|l)dquo;|[“”]/g, "\"").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    // (A word broken at the end of a printed line: "infravi- sion", "non- magical".)
    .replace(/(\p{L})- (\p{Ll})/gu, "$1$2")
    .trim();
}

/** The documents a text links to, by uuid ("@UUID[Compendium.x.y.JournalEntry.z]{Troll}"; the older "@Compendium[x.y.z]"). */
export function linksIn(text) {
  const out = [];
  for ( const m of String(text ?? "").matchAll(/@(UUID|Compendium)\[([^\]]+)\]/g) ) out.push(m[1] === "UUID" ? m[2] : `Compendium.${m[2]}`);
  return [...new Set(out)];
}

/** Sentences, lower case, for reading one claim at a time. */
const sentences = text => plain(text).toLowerCase().split(/(?<=[.!?;])\s+/).filter(Boolean);

/** A dice term ("1d6", "2d4+1", "d8", "5", "two") as a DamagePart, or null. */
export function dicePart(term, type = "untyped") {
  const t = String(term ?? "").trim().toLowerCase();
  if ( NUMBER_WORDS[t] ) return part([], NUMBER_WORDS[t], type);
  if ( !/\d/.test(t) ) return null;
  const p = parseFormula(t, type);
  return p.dice.length || p.flat ? p : null;
}

const DICE = "(\\d*d\\d+(?:\\s*[+-]\\s*\\d+(?!\\s*d))?|\\d+)";
const LEVEL = "(\\s*\\+\\s*(?:caster level|cl|the caster's level|his level|her level|level))?";

/** The damage type a phrase names, if any. */
function typeIn(words) {
  for ( const w of String(words ?? "").toLowerCase().split(/[^a-z]+/) ) if ( TYPES[w] ) return TYPES[w];
  return null;
}

/**
 * Damage a result deals: "+1d6 damage", "an additional 1d8 damage", "1 point of damage", "damage equal to 1d4 +
 * caster level", "2d6 fire damage", "1d6 damage per caster level", "permanently loses 2 hit points".
 * @returns {object[]} DamageParts (empty if it names none)
 */
export function damageIn(text, { casterLevel = 0, type = "untyped" } = {}) {
  const out = [];
  for ( const s of sentences(text) ) {
    if ( /\b(?:heal|heals|healed|restore|restores|cure|cures|regain)/.test(s) ) continue;
    if ( /\b(?:ally|allies|caster|you)\b[^.]*\b(?:also |is |are )?(?:hit|struck|takes?)\b/.test(s) && !/\b(?:foe|target|opponent|enemy|creature)\b/.test(s) ) continue;
    const found = [];
    const add = (m, dice, level, perLevel, kind) => {
      if ( found.some(f => m.index < f.end && m.index + m[0].length > f.start) ) return;
      const p = dicePart(dice, kind ?? typeIn(s) ?? type);
      if ( !p ) return;
      if ( perLevel ) { p.dice = p.dice.map(d => ({ ...d, n: d.n * Math.max(1, casterLevel) })); p.flat *= Math.max(1, casterLevel); }
      if ( level ) p.flat += casterLevel;
      found.push({ start: m.index, end: m.index + m[0].length });
      out.push(p);
    };
    for ( const m of s.matchAll(new RegExp(`damage (?:equal to|of) ${DICE}${LEVEL}`, "g")) ) add(m, m[1], m[2]);
    for ( const m of s.matchAll(new RegExp(`\\+?\\s*${DICE}${LEVEL}\\s+(?:additional |extra |more |bonus |points? of |hit points? of )*(?:([a-z]+) )?(?:points? of )?damage(\\s+per (?:caster )?level)?`, "g")) ) {
      const kind = m[3] ? TYPES[m[3]] : null;
      if ( m[3] && !kind && !["damage", "additional", "extra"].includes(m[3]) && !/^(?:subdual|weapon|normal|melee|missile|physical)$/.test(m[3]) ) continue; // "+2 to damage"? not a sum of damage
      add(m, m[1], m[2], !!m[4], kind);
    }
    for ( const m of s.matchAll(new RegExp(`loses? (?:an additional |another )?${DICE} (?:additional )?hit points?`, "g")) ) add(m, m[1]);
  }
  return out;
}

/** "triple damage" and the like: how many times the blow's own damage it deals (1: no such thing). */
export function damageMultiple(text) {
  const t = plain(text).toLowerCase();
  if ( /\bquadruple damage\b|\bfour times (?:the )?damage\b|\bx4 damage\b/.test(t) ) return 4;
  if ( /\btriple damage\b|\bthree times (?:the )?damage\b|\bx3 damage\b/.test(t) ) return 3;
  if ( /\bdouble damage\b|\btwice (?:the )?damage\b|\bx2 damage\b/.test(t) ) return 2;
  return 1;
}

/**
 * How long something lasts, in rounds: "for 1d4 rounds", "1d6+CL rounds", "next round", "until the end of the
 * battle", "for 1 turn" (ten minutes: the rest of the fight). Null if it doesn't say.
 */
export function roundsIn(text, { casterLevel = 0 } = {}) {
  const t = plain(text).toLowerCase();
  if ( /\b(?:remainder|rest|end) of (?:the )?(?:battle|combat|fight|encounter)|\bpermanent|\bforever\b|\bendless/.test(t) ) return 100;
  const m = t.match(new RegExp(`(?:for |lasts? |duration (?:is |of )?)?${DICE}${LEVEL}\\s+(rounds?|turns?|minutes?|hours?|days?|weeks?)`));
  if ( m ) {
    if ( !/^rounds?$/.test(m[3]) ) return 100;
    const p = dicePart(m[1]);
    return Math.max(1, Math.round((p ? meanPart(p) : 1) + (m[2] ? casterLevel : 0)));
  }
  if ( /\bnext (?:round|turn|attack|action|attack roll)\b|\bone round\b|\b1 round\b|\bthat round\b/.test(t) ) return 1;
  return null;
}

/** How many targets it takes: "up to two targets", "a single target", "all creatures within" (an area). */
export function targetsIn(text) {
  const t = plain(text).toLowerCase();
  if ( /\b(?:all|every|each) (?:\w+ ){0,2}(?:creatures?|targets?|enemies|foes|opponents)\b[^.]*\b(?:within|in|inside)\b|\b(?:cone|radius|burst|cloud|sphere|line|blast)\b/.test(t) ) return { targets: 3, area: true };
  const m = t.match(/\bup to (\w+|\d+) (?:\w+ ){0,2}(?:targets?|creatures?|enemies|foes|opponents)/) ?? t.match(/\b(\w+|\d+) (?:\w+ ){0,2}targets?\b/);
  if ( m ) {
    const n = NUMBER_WORDS[m[1]] ?? Number(m[1]);
    if ( Number.isFinite(n) && n > 0 ) return { targets: n, area: n > 1 };
  }
  return { targets: 1, area: false };
}

/** The save a result calls for ("must make a Will save", "a DC 12 Fort save", "Ref save for half"), or null. */
export function saveIn(text, fallback = null) {
  const t = plain(text).toLowerCase();
  const m = t.match(/\b(fort(?:itude)?|ref(?:lex)?|will)\b(?:\s+(?:save|saving throw|vs\.?))/) ?? t.match(/\b(?:save|saving throw)[^.]*?\b(fort(?:itude)?|ref(?:lex)?|will)\b/)
    // (A stat line's short way: "DC 12 Fort or ...".)
    ?? t.match(/\bdc \d+\s+(fort(?:itude)?|ref(?:lex)?|will)\b/);
  const dc = t.match(/\bdc (\d+)\b/);
  const type = m ? SAVES[m[1].startsWith("fort") ? "fort" : m[1].startsWith("ref") ? "ref" : "will"] : null;
  if ( !type && !/\bsave\b|\bsaving throw\b/.test(t) ) return null;
  if ( /\bno save\b|\bwithout (?:a )?save\b|\bautomatically\b/.test(t) && !type ) return null;
  return { type: type ?? fallback ?? "wil", dc: dc ? Number(dc[1]) : null, half: /\bhalf\b/.test(t) };
}

/** Does the result say it simply happens (no save)? */
export const automatic = text => /\bno save\b|\bwithout (?:a )?save\b|\bautomatically (?:affected|paralyzed|blinded|knocked|stunned|asleep|falls?|charmed)|\bwith no saving throw\b/.test(plain(text).toLowerCase());

/**
 * The conditions DCC tables name, as the engine and the DCC rules know them. Each: what to look for, the
 * conditions, the word for it (FFDCC.Told), and anything else the outcome needs.
 */
const CONDITIONS = [
  { re: /\bslay|\bdecapitat|\binstantly killed|\bdies instantly|\bkilled instantly|\bdies on the spot|\bis slain\b/, slay: true },
  { re: /\b(?:falls?|fall|put|placed|sent) (?:into (?:a )?)?(?:\w+ )?(?:asleep|sleep|slumber)|\bsleeps?\b/, conditions: { incapacitated: 1, asleep: 1 }, told: "asleep", extra: { endsOnDamage: true } },
  { re: /\bparaly[sz]/, conditions: { incapacitated: 1, paralyzed: 1 }, told: "paralyzed" },
  // (Not a weapon "knocked out of reach".)
  { re: /\b(?:knocked |falls? |is )?unconscious|\bknocked out\b(?!\s+of\b)|\bsenseless\b/, conditions: { incapacitated: 1, unconscious: 1 }, told: "knockedOut" },
  { re: /\bstun(?:ned|s)?\b|\bbottom of the initiative|\bloses? (?:his |her |its |their |the )?next (?:action|attack|round|turn)|\bdazed\b/, conditions: { stunned: 1 }, told: "stunned" },
  { re: /\b(?:knocked|falls?|thrown|sent|lands?|knocks? \w+|sweeps? \w+|tripped)\b(?: \w+){0,4} (?:prone|down|to the ground|off (?:his|her|its|their) feet)|\bprone\b/, conditions: { prone: 1 }, told: "knockedDown" },
  { re: /\bblind(?:ed|s)?\b/, conditions: { blinded: 1 }, told: "blinded" },
  // A one-word command costs it its turn; a charm turns it into the caster's friend.
  { re: /\bobeys? (?:the|a|his|her|its|their) (?:\w+ )?command\b|\bmust obey\b/, conditions: { stunned: 1 }, told: "obeying" },
  { re: /\bcharm(?:ed|s)?\b|\bunder (?:the caster's|his|her|your) (?:\w+ )?control\b|\bas if (?:it|he|she|they) (?:were|was) (?:his|her|the caster's) (?:friend|ally)/, conditions: { controlled: 1 }, told: "swayed" },
  { re: /\b(?:frightened|terrified|flees?|fleeing|in fear|cowers?|cowering|panics?)\b/, conditions: { frightened: 1 }, told: "terrified" },
  { re: /\b(?:entangled|held fast|webbed|stuck fast|immobil\w*|can(?:not|'t) move|pinned|restrained|grappled|grapple)\b/, conditions: { immobilized: 1, held: 1 }, told: "held" },
  { re: /\bdisarm\w*|\bdrops? (?:his |her |its |their )?weapon|\bweapon (?:is )?(?:knocked|shattered|sundered|broken|flies)/, conditions: { disarmed: 1 }, told: "disarmed" },
  { re: /\bslow(?:ed|s)?\b/, conditions: { slowed: 1 }, told: "slowed" }
];

/**
 * Bonuses and penalties a result names: "-2 to attack rolls", "a -4 penalty to their next attack roll", "+2 AC
 * bonus", "-1 to all rolls", "+1 to saving throws".
 */
export function modsIn(text) {
  const t = plain(text).toLowerCase();
  const mods = {};
  const add = (k, v) => { mods[k] = (mods[k] ?? 0) + v; };
  for ( const m of t.matchAll(/([+-]\s*\d+)\s*(?:penalty |bonus )?(?:to |on |in )?(?:(?:his|her|its|their|all|the|next|any) )*(attack rolls?|attacks?|to-hit|ac|armor class|saves|saving throws|all rolls|rolls|damage rolls|damage)\b/g) ) {
    const v = Number(m[1].replace(/\s+/g, ""));
    if ( !v ) continue;
    const what = m[2];
    if ( /^attack|to-hit/.test(what) ) add("attack", v);
    else if ( what === "ac" || what === "armor class" ) add("ac", v);
    else if ( /^sav/.test(what) ) add("saves", v);
    else if ( /^damage/.test(what) ) add("damage", v);
    else { add("attack", v); add("saves", v); add("checks", v); }
  }
  for ( const m of t.matchAll(/\b(?:ac|armor class) (?:bonus |penalty )?(?:of )?([+-]\s*\d+)/g) ) add("ac", Number(m[1].replace(/\s+/g, "")));
  return mods;
}

/**
 * Everything a table row says happens to the one it lands on, as an outcome: conditions, bonuses and penalties,
 * how long. Null when it names nothing the fight would notice. Also {slay: true} for a result that simply kills.
 */
export function outcomeIn(text, { casterLevel = 0, defaultRounds = 1 } = {}) {
  const t = plain(text).toLowerCase();
  if ( !t ) return null;
  const conditions = {};
  const labels = [];
  let slay = false;
  let extra = {};
  for ( const c of CONDITIONS ) {
    if ( !c.re.test(t) ) continue;
    // "If ... it dies" or "unless ...": only when it's said plainly.
    if ( c.slay ) {
      const plainly = sentences(text).some(s => c.re.test(s) && !/\bif\b|\bunless\b|\bsave\b|\bmay\b|\bchance\b/.test(s));
      if ( plainly ) slay = true;
      continue;
    }
    Object.assign(conditions, c.conditions);
    labels.push(say(`Told.${c.told}`));
    extra = { ...extra, ...(c.extra ?? {}) };
  }
  // A failed save's result that only comes on a second failure, a cure, and the like are past what a fight needs.
  const mods = modsIn(t);
  for ( const k of Object.keys(mods) ) if ( !mods[k] ) delete mods[k];
  if ( !Object.keys(conditions).length && !Object.keys(mods).length && !slay ) return null;
  const rounds = roundsIn(t, { casterLevel }) ?? defaultRounds;
  const out = { rounds, label: labels.length ? listJoin(labels.slice(0, 2)) : describe(mods), ...extra };
  if ( Object.keys(conditions).length ) out.conditions = conditions;
  if ( Object.keys(mods).length ) out.mods = mods;
  if ( slay ) out.slay = true;
  return out;
}

/** Bonuses and penalties in words ("-2 to attacks, +1 AC"; "" for none). */
export function modsWords(mods = {}) {
  return listItems(["attack", "ac", "saves", "damage"].filter(k => mods[k]).map(k => say(`Mods.${k}`, { n: signedNumber(mods[k]) })));
}

/** The core's word for an outcome it can't say more about ("affected"). */
export const affected = () => localize("FASTFIGHTING.Effect.affected");

/** A label for bonuses and penalties alone ("hampered (-2 to attacks)", "bolstered (+1 AC)"). */
function describe(mods) {
  const what = modsWords(mods);
  if ( !what ) return affected();
  // As something a creature can be: "hampered (-2 to attacks)", "bolstered (+1 AC)".
  const worse = Object.values(mods).some(v => v < 0);
  return say(worse ? "Mods.Hampered" : "Mods.Bolstered", { what });
}

/**
 * A crit (or fumble) table row as the engine's: {lo, hi, damage, multiply, outcome, slay, text}. For a fumble row,
 * the outcome lands on the fumbler (and only damage it says the fumbler takes counts).
 * @param {{range: number[], text: string}} row
 * @param {object} [options]
 * @param {boolean} [options.fumble]
 */
export function tableRow({ range, text }, { fumble = false } = {}) {
  const words = plain(text);
  const lower = words.toLowerCase();
  const row = { lo: Number(range?.[0] ?? -Infinity), hi: Number(range?.[1] ?? Infinity), text: words };
  if ( fumble ) {
    const self = /\byou\b|\byour\b|\bhim(?:self)?\b|\bthe character\b|\bthe attacker\b/.test(lower);
    const hurtsSelf = /\b(?:you|yourself|the attacker|the character) (?:\w+ ){0,3}(?:take|takes|suffer|suffers|hit|hits|strike|strikes)\b[^.]*\bdamage\b/.test(lower) && !/\ball(?:y|ies)\b/.test(lower);
    if ( hurtsSelf ) row.damage = damageIn(words);
    if ( self ) row.outcome = outcomeIn(words);
    if ( row.outcome?.slay ) delete row.outcome.slay;
    return row;
  }
  const damage = damageIn(words);
  if ( damage.length ) row.damage = damage;
  const times = damageMultiple(words);
  if ( times > 1 ) row.multiply = times;
  const outcome = outcomeIn(words);
  if ( outcome?.slay ) row.slay = true;
  if ( outcome && (outcome.conditions || outcome.mods) ) {
    delete outcome.slay;
    row.outcome = outcome;
  }
  return row;
}

/* -------------------------------------------- */
/*  Spell check results                         */
/* -------------------------------------------- */

const FAILURE = /^\s*(?:lost|failure|fails?|the spell fails|no effect)\b/i;

/**
 * One spell check result in the engine's terms: what it does at that total. {fail} for a failure row.
 *   {damage, repeat, heal, healDice, outcome (on its targets), buff (bonuses for the caster's side), save, auto,
 *    targets, area, nothing (success, but nothing a fight would notice)}
 * @param {string} text
 * @param {object} [ctx]  {casterLevel, save: the spell's own save line, e.g. "Will vs. spell check DC"}
 */
export function spellResult(text, { casterLevel = 0, save = "" } = {}) {
  const words = plain(text);
  const lower = words.toLowerCase();
  if ( !words || FAILURE.test(words) ) return { fail: true };
  const out = {};
  const spellSave = saveIn(save);
  // Missiles, bolts, rays: so many of so much each.
  const count = lower.match(new RegExp(`\\b(?:throws?|fires?|launch(?:es)?|creates?|hurls?|shoots?|conjures?)\\s+${DICE}\\s+(?:magic(?:al)?\\s+)?(?:missiles?|bolts?|rays?|darts?|arrows?|beams?|projectiles?|orbs?)`));
  const damage = damageIn(words, { casterLevel });
  if ( damage.length ) {
    out.damage = damage;
    if ( count ) {
      const n = dicePart(count[1]);
      if ( n && meanPart(n) > 1 ) out.repeat = n;
    }
  }
  const healing = lower.match(new RegExp(`\\b(?:heals?|restores?|cures?|regains?)\\s+(?:\\w+ ){0,3}?${DICE}${LEVEL}\\s+(?:hit points?|hp|points? of damage|damage)`));
  if ( healing ) {
    const p = dicePart(healing[1], "healing");
    if ( p ) {
      if ( healing[2] ) p.flat += casterLevel;
      out.heal = [p];
    }
  }
  const dice = lower.match(/\b(?:heals?|restores?)\s+(\w+|\d+)\s+(?:hit )?(?:dice|die|hd)\b/);
  if ( dice ) out.healDice = NUMBER_WORDS[dice[1]] ?? (Number(dice[1]) || 1);
  const effect = outcomeIn(words, { casterLevel, defaultRounds: 1 });
  // Bonuses that help the caster's side (Blessing, Enlarge) rather than hinder its foes.
  const helps = effect?.mods && !effect.conditions && Object.values(effect.mods).every(v => v > 0) && !/\bpenalty\b/.test(lower);
  if ( helps ) out.buff = { mods: effect.mods, rounds: roundsIn(words, { casterLevel }) ?? 10, label: effect.label };
  else if ( effect ) out.outcome = effect;
  const s = saveIn(words, spellSave?.type ?? null);
  out.auto = automatic(words) || (!s && !spellSave);
  if ( !out.auto ) out.save = { type: s?.type ?? spellSave?.type ?? "wil", half: !!(s?.half ?? spellSave?.half) };
  Object.assign(out, targetsIn(words));
  if ( !out.damage && !out.heal && !out.healDice && !out.outcome && !out.buff ) out.nothing = true;
  return out;
}

/* -------------------------------------------- */
/*  Mending                                     */
/* -------------------------------------------- */

/** "Per round": "per round", "/round", "each round", "at the end of each round", "every turn". */
const EACH_ROUND = "\\s*(?:\\/\\s*|per\\s+|each\\s+|every\\s+|a\\s+|at the (?:end|start|beginning) of (?:each|every|the)\\s+)(?:round|turn)";
const HP = "\\s*(?:hp|hit points?|points?(?: of damage)?)?";
/**
 * What stops a regeneration: the kinds of harm a phrase names, before "from which it does not regenerate" or "stops its
 * regeneration" (before: true), or after "does not regenerate from", "except", "prevented by".
 */
const STOPS = [
  { re: /\b(?:does not|doesn't|cannot|can't|won't|will not|never)\s+regenerate\s+(?:damage\s+|hit points\s+)?(?:from|dealt by|caused by|done by|inflicted by)\s+([a-z ,'-]+)/g },
  { re: /([a-z ,'-]+?)\s*,?\s*(?:from|against)\s+which\s+it\s+(?:does not|doesn't|cannot|can't|won't|will not|never)\s+regenerate/g, before: true },
  { re: /([a-z ,'-]+?)\s+(?:damage\s+)?(?:stops?|prevents?|halts?|suppress(?:es)?|negates?|blocks?)\s+(?:its\s+|the\s+|this\s+)?regenerat/g, before: true },
  { re: /\bregenerat\w*\b[^.;]*?\b(?:except|but not|save for|other than|not)\s+(?:against\s+|from\s+|by\s+)?([a-z ,'-]+)/g },
  { re: /\bregenerat\w*\b[^.;]*?\b(?:stopped|prevented|halted|suppressed|negated|blocked)\s+(?:only\s+)?by\s+([a-z ,'-]+)/g }
];
/**
 * The most of a sentence (up to a full stop or semicolon) these are read in: well past any of the books'. Read a
 * sentence at a time, they cost little however long the text; a longer "sentence" isn't one of theirs, and isn't read.
 */
const SENTENCE_MOST = 2000;

/** Words that go with a list of kinds of harm ("fire or acid damage"). */
const KIND_JOINERS = new Set(["and", "or", "damage", "attacks", "magical", "by"]);
/** Is this part of a phrase only kinds of harm ("acid or cold")? */
const onlyKinds = part => {
  const words = part.split(/[^a-z]+/).filter(Boolean);
  return words.length > 0 && words.every(w => TYPES[w] || KIND_JOINERS.has(w));
};
/**
 * The kinds of harm a phrase names, as far as it speaks of them: the part beside the words that say they stop it (the
 * last part before them, the first after), and those next to it that are only kinds of harm ("fire, acid or cold";
 * not the "immune to cold" in "immune to cold, fire stops its regeneration").
 */
function kindsNamed(phrase, before) {
  const parts = phrase.split(",");
  if ( before ) parts.reverse();
  const near = [parts[0]];
  for ( const p of parts.slice(1) ) {
    if ( !onlyKinds(p) ) break;
    near.push(p);
  }
  return near.join(" ").split(/[^a-z]+/).map(w => TYPES[w]).filter(Boolean);
}

/**
 * What a creature's words say it mends of itself each round: regeneration ("regenerates 1d6 hp per round",
 * "regenerating 1d8 points of damage at the end of each round, including the round it is killed"; what it doesn't
 * regenerate from, fire or acid, stops it) and plain healing ("heal 2 hp per round", "heal 1 hp/round"). Regeneration
 * that goes on the round it's killed is a last burst (burst: rules.js onDropped). Its name with no amount
 * ("regeneration", a troll's stat line: the book says how much) is only named.
 * @returns {{regen: {amount, dice, stoppedBy, burst}|null, fastHealing: number|null, named: boolean}}
 */
export function mendingIn(text) {
  const t = plain(text).toLowerCase();
  const out = { regen: null, fastHealing: null, named: false };
  if ( !/\bregenerat|\bheals?\b|\bregains?\b/.test(t) ) return out;
  const each = new RegExp(`\\bregenerat\\w*\\s*\\(?\\s*(?:at (?:a|the) rate of\\s+)?${DICE}${HP}${EACH_ROUND}`).exec(t);
  const heals = new RegExp(`\\b(?:heals?|regains?)\\s+(?:(?:damage\\s+)?at (?:a|the) rate of\\s+)?${DICE}${HP}${EACH_ROUND}`).exec(t);
  if ( heals ) {
    const p = dicePart(heals[1]);
    if ( p ) out.fastHealing = Math.max(1, Math.round(meanPart(p)));
  }
  if ( each ) {
    const dice = dicePart(each[1]);
    if ( dice ) {
      // (Sentence by sentence, those that speak of it: none of these crosses a full stop or a semicolon.)
      const said = t.split(/[.;]/).filter(x => x.length <= SENTENCE_MOST && x.includes("regenerat"));
      const stoppedBy = new Set();
      for ( const { re, before } of STOPS ) for ( const x of said ) for ( const m of x.matchAll(re) ) for ( const k of kindsNamed(m[1], before) ) stoppedBy.add(k);
      // (It regenerates even the round it's killed: a last burst that may lift it again.)
      const burst = said.some(x => /\bregenerat[^.;]*\b(?:including|even)\b[^.;]*\b(?:killed|slain|dies|death|dead)\b/.test(x));
      out.regen = { amount: Math.max(1, Math.round(meanPart(dice))), dice, stoppedBy: [...stoppedBy], burst };
    }
  }
  // ("Regeneration of heads": not of its hit points.)
  out.named = !out.regen && /\bregenerat(?:ion|es|ing)\b(?!\s+(?:of|its)\s+(?!hit|hp|damage|wounds))/.test(t);
  return out;
}

/* -------------------------------------------- */
/*  Stat lines                                  */
/* -------------------------------------------- */

const IMMUNITIES = {
  cold: ["cold"], fire: ["fire"], acid: ["acid"], electricity: ["electricity"], lightning: ["electricity"], poison: ["poison", "poisoned"], disease: ["disease"],
  charm: ["controlled", "charm"], "mind-affecting": ["controlled", "frightened", "charm", "mental"], "mind-altering": ["controlled", "frightened", "charm", "mental"], mental: ["controlled", "frightened", "mental"],
  sleep: ["asleep", "sleep"], paralysis: ["paralyzed", "paralysis"], fear: ["frightened", "fear"], "critical hits": ["crits"], crits: ["crits"]
};
/** What un-dead (and the mindless) shrug off. */
const UNDEAD = ["asleep", "sleep", "controlled", "charm", "paralyzed", "paralysis", "frightened", "fear", "mental"];

/**
 * The specials in a DCC stat line ("Init +2; Atk claw +3 melee (1d4); AC 13; HD 2d8; MV 30' or fly 40'; Act 1d20;
 * SP infravision 60', immune to cold, crit on 19-20, un-dead traits; SV Fort +2, Ref +1, Will +0; AL C."), as far as
 * a fight cares: {immune, critNatural, infravision, fly, swim, climb, spellCheck, undead, attacks: [{name, bonus,
 * melee, damage, rider}], regen, fastHealing, regenNamed (mendingIn)}; and what it says of how the creature fights:
 * fearless (immune to fear itself, not just to mind-affecting magic), construct (construct traits), spellcasting (it
 * casts: spellcasting, a spell check, harmful spells, "Atk spells or ..."), pack (pack tactics).
 */
export function statLine(text) {
  const t = plain(text);
  const lower = t.toLowerCase();
  const out = { immune: [], attacks: [] };
  const special = lower; // (specials belong after "SP", but some stat lines put them elsewhere)
  for ( const m of special.matchAll(/\bimmun\w*\s+(?:to\s+)?(?:damage from\s+)?([a-z ,'-]+?)(?=[^a-z ,'-]|\bsv\b|$)/g) ) {
    for ( const word of m[1].split(/,|\band\b|\bor\b/).map(w => w.trim().replace(/\s*(?:effects?|spells?|damage|attacks?)$/, "")) ) {
      for ( const [k, v] of Object.entries(IMMUNITIES) ) if ( word === k || word.startsWith(k) ) out.immune.push(...v);
      if ( word.startsWith("fear") ) out.fearless = true;
    }
  }
  if ( /\bconstruct (?:traits|qualities|characteristics)\b/.test(special) ) out.construct = true;
  if ( /\bpack tactics\b/.test(special) ) out.pack = true;
  const atkText = lower.match(/\batk\b\s*([^;]*)/)?.[1] ?? "";
  if ( /\bspellcasting\b|\bspell ?check\b|\bharmful spells?\b|\b(?:druidical|media) magic\b/.test(special) || /^\s*spells?\s+or\b/.test(atkText) ) out.spellcasting = true;
  if ( /\bun-?dead\b|\bundead traits\b/.test(special) ) {
    out.undead = true;
    out.immune.push(...UNDEAD);
  }
  if ( /\b(?:demon|devil)(?:s|ic|ish)?\b/.test(special) ) out.unholy = true;
  // Harmed only by magic (or silver): immune to weapons that aren't ("immune to non-magical weapons"), or taking half
  // from them ("resistant to non-magical weapons"): {magic, materials, half}.
  const magicOnly = special.match(/\b(immun\w*|resist\w*|half damage)\s+(?:to\s+|from\s+)?non-?magical\b/);
  const harmedOnly = special.match(/\bharmed only by ([a-z ,]+?)(?:weapons|attacks)\b|\bonly ([a-z ,]+?) weapons (?:can )?(?:harm|hurt|damage)\b/);
  if ( magicOnly || harmedOnly ) {
    const words = harmedOnly ? (harmedOnly[1] ?? harmedOnly[2]) : "magic";
    out.harmedOnlyBy = { magic: /\bmagic/.test(words), materials: ["silver", "iron"].filter(m => words.includes(m)), half: !!magicOnly && !/^immun/.test(magicOnly[1]) };
  }
  const reduction = special.match(/\bdamage reduction\s*(\d+)/);
  if ( reduction ) out.reduction = Number(reduction[1]);
  // Half damage from some kinds of harm ("half damage from piercing and slashing weapons"); double from others.
  out.resist = [];
  for ( const m of special.matchAll(/\bhalf damage from\s+([a-z ,'-]+?)(?=[^a-z ,'-]|\bsv\b|$)/g) ) out.resist.push(...harmKinds(m[1]));
  out.weak = [];
  for ( const m of special.matchAll(/\b(?:double damage from|vulnerab\w*\s+(?:to\s+)?)\s*([a-z ,'-]+?)(?=[^a-z ,'-]|\bsv\b|$)/g) ) out.weak.push(...harmKinds(m[1]));
  const crit = special.match(/\bcrits? (?:on|at)\s+(?:a\s+)?(?:natural\s+)?(\d+)(?:\s*[-–+]|\s+or (?:better|higher)|\+)/);
  if ( crit ) out.critNatural = Number(crit[1]);
  const infra = special.match(/\b(?:infravision|darkvision|(?:perfect )?night ?vision|true ?sight|see in (?:the )?dark(?:ness)?)\s*(\d+)?/);
  if ( infra ) out.infravision = Number(infra[1]) || 60;
  const mv = lower.match(/\bmv\b\s*([^;]*)/)?.[1] ?? "";
  for ( const mode of ["fly", "swim", "climb", "burrow"] ) {
    const m = mv.match(new RegExp(`${mode}\\w*\\s*(\\d+)`)) ?? mv.match(new RegExp(`(\\d+)'?\\s*${mode}`));
    if ( m ) out[mode] = Number(m[1]);
  }
  const check = special.match(/\bspell ?check\s*([+-]\s*\d+)/);
  if ( check ) out.spellCheck = Number(check[1].replace(/\s+/g, ""));
  // Mending of its own: regeneration ("regenerates 1d6 hp per round"), healing each round ("heal 2 hp per round"), or
  // its regeneration only named.
  const mending = mendingIn(t);
  out.regen = mending.regen;
  out.fastHealing = mending.fastHealing;
  out.regenNamed = mending.named;
  // Attacks: "claw +3 melee (1d4)" and "bite +5 melee (dmg 1d8 plus poison)", joined by "or".
  const atk = t.match(/\bAtk\b\s*([^;]*)/i)?.[1] ?? "";
  for ( const m of atk.matchAll(/([a-z][a-z' -]*?)\s+([+-]\s*\d+)\s+(melee|missile fire|missile|ranged)\s*(?:\(([^)]*)\))?/gi) ) {
    const inside = String(m[4] ?? "");
    const formula = inside.match(/(\d*d\d+(?:\s*[+-]\s*\d+(?!\s*d))?|\b\d+\b)/)?.[1] ?? null;
    out.attacks.push({
      name: m[1].replace(/^(?:spells? or |or )/i, "").trim(),
      bonus: Number(m[2].replace(/\s+/g, "")),
      melee: /^melee$/i.test(m[3]),
      damage: formula,
      rider: inside.replace(formula ?? "", "").replace(/^\s*(?:dmg\s*)?/i, "").replace(/^\s*plus\s+/i, "").trim() || null
    });
  }
  // What its specials add to how it fights: saves it's better (or worse) at, auras that make foes save, and what follows
  // a hit (rend, constriction).
  out.saveVs = saveVsIn(special);
  out.auras = aurasIn(t);
  out.followUps = followUpsIn(special);
  if ( /\bnever surprised\b|\bcan(?:not|'t) be surprised\b/.test(special) ) out.neverSurprised = true;
  const hide = special.match(/([+-]\s*\d+)\s*(?:bonus\s*)?(?:to|on)\s*(?:hide|hiding|stealth|sneak\w*|move silently)/);
  if ( hide ) out.stealth = Number(hide[1].replace(/\s+/g, ""));
  out.immune = [...new Set(out.immune)];
  return out;
}

/** The tags of what a "saves vs X" names, as the core's saveVs reads them (its traits and the engine's own). */
const SAVE_VS = [
  [/\bmagic(?:al)?\b|\bspells?\b/, ["magical"]], [/\bpoison/, ["poison"]], [/\bdisease/, ["disease"]],
  [/\bfear\b|\bfright/, ["inflicts:frightened"]], [/\bcharm|\bmind/, ["inflicts:controlled"]], [/\bsleep/, ["inflicts:asleep"]],
  [/\bparaly/, ["inflicts:paralyzed"]], [/\bpetrif/, ["petrification"]], [/\bbreath/, ["breath"]], [/\btraps?\b/, ["trap"]]
];

/**
 * Saves a special says it's better (or worse) at ("+4 to saves vs. magic", "+2 on all saves against poison"): the
 * core's saveVs, [{bonus, saves?, vs}]; its saves alone where it names one ("+2 to Fort saves vs. poison").
 */
export function saveVsIn(text) {
  const out = [];
  const t = plain(text).toLowerCase();
  for ( const m of t.matchAll(/([+-]\s*\d+)\s*(?:bonus\s*)?(?:to|on)\s*(?:all\s+)?((?:fort(?:itude)?|ref(?:lex)?|will)\s+)?sav(?:es|ing throws?)\s*(?:vs\.?|versus|against)\s*([a-z ,'-]+)/g) ) {
    const vs = SAVE_VS.filter(([re]) => re.test(m[3])).flatMap(([, tags]) => tags);
    if ( !vs.length ) continue;
    const save = m[2]?.trim();
    out.push({ bonus: Number(m[1].replace(/\s+/g, "")), vs, ...(save ? { saves: [SAVES[save.startsWith("fort") ? "fort" : save.startsWith("ref") ? "ref" : "will"]] } : {}) });
  }
  return out;
}

/** A stat line's specials one by one: split at commas and semicolons outside brackets. */
const clausesOf = text => plain(text).split(/[;,](?![^(]*\))/).map(c => c.trim()).filter(Boolean);

/**
 * Auras a special describes with their save and what a failure does ("stench (DC 12 Fort or -2 to attacks)", "fear
 * aura 30' (DC 14 Will or flee)"): [{label, range, save: {type, dc}, outcome}], within 30 feet where it says no range.
 * Only what it says plainly: a gaze or a song with no outcome named isn't one.
 */
export function aurasIn(text) {
  const out = [];
  for ( const clause of clausesOf(text) ) {
    const t = clause.toLowerCase();
    if ( !/\b(?:aura|stench|stink\w*|presence|gaze|song|wail\w*|cloud)\b/.test(t) ) continue;
    const save = saveIn(t);
    const outcome = outcomeIn(t.replace(/\bdc \d+\b/, ""));
    if ( !save?.dc || !outcome ) continue;
    const range = Number(t.match(/(\d+)\s*(?:'|ft|feet)/)?.[1]) || 30;
    out.push({ label: clause.replace(/\s*\(.*$/, "").trim(), range, save: { type: save.type, dc: save.dc }, outcome });
  }
  return out;
}

/**
 * What follows a hit, as a special says it: rend ("rend for additional 1d8 damage if more than 2 slam attacks hit";
 * "if both claws hit"), constriction or a hug ("constriction 1d6", "bear hug 2d6": on one it holds). [{kind: "rend" |
 * "hold", damage, n, with}]: `with`, the attack it names ("claw"), where it does.
 */
export function followUpsIn(text) {
  const out = [];
  const dice = s => s.match(/(\d*d\d+(?:\s*[+-]\s*\d+(?!\s*d))?)/)?.[1]?.replace(/\s+/g, "") ?? null;
  for ( const clause of clausesOf(text).map(c => c.toLowerCase()) ) {
    const formula = dice(clause);
    if ( !formula ) continue;
    if ( /\brend|\btear\b/.test(clause) ) {
      const many = clause.match(/\bif\s+(?:more than\s+)?(both|two|three|\d+)\s+([a-z]+?)s?\s+(?:attacks?\s+)?hit/);
      let n = many ? (many[1] === "both" ? 2 : NUMBER_WORDS[many[1]] ?? Number(many[1])) : 2;
      if ( /\bmore than\b/.test(clause) ) n += 1;
      out.push({ kind: "rend", damage: formula, n: Math.max(2, n || 2), with: many?.[2] && many[2] !== "attack" ? many[2] : null });
    } else if ( /\bconstrict|\bhug\b|\bcrush|\bsqueez/.test(clause) ) out.push({ kind: "hold", damage: formula });
  }
  return out;
}

/**
 * What an attack's rider says happens on a hit ("plus poison (DC 15 Fort save or death)", "+1d6 acid plus grab",
 * "plus disease (DC 7 Fort save or additional 1d6 damage)", "blood drain (automatic 1d4 dmg per round)"), in the
 * engine's terms: {effects: the core's on-hit effects, damage: extra damage parts on the blow}. What it says only by
 * name ("plus slime": the book's entry has the rest) is left out, never guessed.
 *   - a grab: a grab, constriction or a hold;
 *   - a save with what a failure does: conditions, damage, death; its own kinds (poison, disease) for immunity;
 *   - extra damage with the blow ("+1d6 acid"), and damage each round after it (persistent, as DCC's ends).
 * A range a stat line puts in its parentheses (", range 100'") is no rider.
 */
export function ridersIn(text) {
  const out = { effects: [], damage: [] };
  const t = plain(text).toLowerCase().replace(/,?\s*range\s*[\d']+'?/g, "").trim();
  if ( !t ) return out;
  if ( /\bgrab|\bgrapple|\bconstrict|\bhold\b/.test(t) ) out.effects.push({ kind: "grabbed" });
  const extra = t.match(/^\+\s*(\d*d\d+(?:\s*[+-]\s*\d+(?!\s*d))?)\s*([a-z]+)?/);
  if ( extra ) out.damage.push(parseFormula(extra[1].replace(/\s+/g, ""), typeIn(extra[2] ?? "") ?? "untyped"));
  const perRound = t.match(/(\d*d\d+)\s*(?:dmg|damage|hp)?\s*(?:per|each|every)\s*round/);
  if ( perRound ) out.damage.push({ ...parseFormula(perRound[1], typeIn(t) ?? "untyped"), persistent: true });
  const save = saveIn(t);
  if ( save?.dc ) {
    const failure = t.slice(t.search(/\bdc \d+/));
    const kinds = ["poison", "disease"].filter(k => t.includes(k));
    const effect = { kind: "save", label: plain(text), save: { type: save.type, dc: save.dc }, ...(kinds.length ? { traits: kinds } : {}) };
    if ( /\bor (?:\w+ )?death\b|\bor die\b|\bdies\b/.test(failure) ) effect.slay = true;
    const hurt = failure.match(/\bor (?:take |an? )?(?:additional |extra )?(\d*d\d+(?:\s*[+-]\s*\d+(?!\s*d))?)\s*(?:damage|dmg|hp)\b/);
    if ( hurt ) effect.damage = [parseFormula(hurt[1].replace(/\s+/g, ""), typeIn(failure) ?? "untyped")];
    const outcome = outcomeIn(failure.replace(/\bdc \d+\b/, ""));
    if ( outcome?.conditions ) Object.assign(effect, { conditions: outcome.conditions, rounds: outcome.rounds });
    if ( effect.slay || effect.damage || effect.conditions ) out.effects.push(effect);
  }
  return out;
}

/** What a stat line (statLine) says harms it not at all, half and double, as the engine's iwr: {immune, resist, weak}. */
export const iwrIn = line => ({
  immune: [...(line?.immune ?? [])],
  resist: Object.fromEntries((line?.resist ?? []).map(k => [k, 1])),
  weak: Object.fromEntries((line?.weak ?? []).map(k => [k, 1]))
});

/** Hit dice as a level ("4d12" -> 4, "6d12+5" -> 6) and their size (12). */
export function hitDice(hd) {
  const m = String(hd ?? "").match(/(\d*)d(\d+)/i);
  if ( !m ) return { level: Math.max(0, Number(String(hd ?? "").match(/\d+/)?.[0]) || 0), faces: 6 };
  return { level: Number(m[1] || 1), faces: Number(m[2]) };
}

/** Action dice as a list of faces ("1d20" -> [20], "1d24 + 1d16" -> [24, 16], "2d20" -> [20, 20], "1d20,1d14"). */
export function actionDice(text) {
  const out = [];
  for ( const m of String(text ?? "").matchAll(/(\d*)d(\d+)/gi) ) {
    for ( let i = 0; i < Math.max(1, Number(m[1] || 1)); i++ ) out.push(Number(m[2]));
  }
  return out.length ? out : [20];
}

/** Feet in a DCC distance ("30'", "40' or fly 60'", "25/50/100"): the first number. */
export function feet(text) {
  const n = Number(String(text ?? "").match(/\d+/)?.[0]);
  return Number.isFinite(n) ? n : null;
}

/** A crit natural (on the die rolled) as the engine's d20-relative threat: 21+ on a d24 is 17+ on a d20. */
export const critOnFor = (natural, faces = 20) => (natural ? 20 - (faces - natural) : null);

/**
 * A rider the stat line only names ("plus disease", "plus paralysis"), read from the creature's entry in the book: the
 * first sentence with a DC that speaks of it (its words, or the attack's: "bitten by a ghoul must make a DC 14 Will
 * save or be paralyzed"), read as ridersIn reads a rider. Nothing where no sentence says it plainly.
 * @param {string[]} names   the rider's words and the attack's name
 * @param {string} entry     the entry's text (its HTML is fine)
 */
export function entryRider(names, entry) {
  const stems = [...new Set(names.flatMap(n => String(n ?? "").toLowerCase().split(/[^a-z]+/))
    .filter(w => w.length >= 3 && !["plus", "and", "the", "with", "dmg", "damage", "see", "below"].includes(w))
    .map(w => w.slice(0, Math.min(5, Math.max(3, w.length - 1)))))];
  if ( !stems.length || !entry ) return { effects: [], damage: [] };
  for ( const s of sentences(entry) ) {
    if ( !/\bdc \d+/.test(s) || !stems.some(stem => s.includes(stem)) ) continue;
    const read = ridersIn(s);
    if ( read.effects.some(e => e.kind === "save") ) return { effects: read.effects.filter(e => e.kind === "save"), damage: [] };
  }
  return { effects: [], damage: [] };
}
