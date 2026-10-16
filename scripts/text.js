/**
 * Reading DCC's tables in the engine's terms: crit and fumble results, Mighty Deeds, spell check results, and the
 * specials in a monster's stat line.
 *
 * The free system ships none of these tables; they come from whatever books a world has installed (the DCC and
 * XCC core books, adventures, homebrew). They're read at run time, so nothing of their text lives in this module.
 * What can't be read is left out, never guessed into something it isn't.
 * Pure: no Foundry globals.
 */
import { parseFormula, part, meanPart, listJoin, listItems, localize } from "./core.js";
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
    .replace(/\s+/g, " ").trim();
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
  const p = parseFormula(t.replace(/^d/, "1d"), type);
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
  const m = t.match(/\b(fort(?:itude)?|ref(?:lex)?|will)\b(?:\s+(?:save|saving throw|vs\.?))/) ?? t.match(/\b(?:save|saving throw)[^.]*?\b(fort(?:itude)?|ref(?:lex)?|will)\b/);
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
  const signed = n => `${n > 0 ? "+" : ""}${n}`;
  return listItems(["attack", "ac", "saves", "damage"].filter(k => mods[k]).map(k => say(`Mods.${k}`, { n: signed(mods[k]) })));
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
      const stoppedBy = new Set();
      for ( const { re, before } of STOPS ) for ( const m of t.matchAll(re) ) for ( const k of kindsNamed(m[1], before) ) stoppedBy.add(k);
      // (It regenerates even the round it's killed: a last burst that may lift it again.)
      const burst = /\bregenerat[^.;]*\b(?:including|even)\b[^.;]*\b(?:killed|slain|dies|death|dead)\b/.test(t);
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
  for ( const m of special.matchAll(/\bimmun\w*\s+(?:to\s+)?([a-z ,'-]+?)(?=[^a-z ,'-]|\bsv\b|$)/g) ) {
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
  if ( /\b(?:demon|devil)\b/.test(special) ) out.unholy = true;
  // Half damage from some kinds of harm ("half damage from piercing and slashing weapons"); double from others.
  out.resist = [];
  for ( const m of special.matchAll(/\bhalf damage from\s+([a-z ,'-]+?)(?=[^a-z ,'-]|\bsv\b|$)/g) ) out.resist.push(...harmKinds(m[1]));
  out.weak = [];
  for ( const m of special.matchAll(/\b(?:double damage from|vulnerab\w*\s+(?:to\s+)?)\s*([a-z ,'-]+?)(?=[^a-z ,'-]|\bsv\b|$)/g) ) out.weak.push(...harmKinds(m[1]));
  const crit = special.match(/\bcrits? (?:on|at)\s+(?:a\s+)?(?:natural\s+)?(\d+)(?:\s*[-–+]|\s+or (?:better|higher)|\+)/);
  if ( crit ) out.critNatural = Number(crit[1]);
  const infra = special.match(/\b(?:infravision|darkvision|see in (?:the )?dark(?:ness)?)\s*(\d+)?/);
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
  out.immune = [...new Set(out.immune)];
  return out;
}

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
