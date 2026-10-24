/**
 * Reading DCC's tables in the engine's terms: crit and fumble results, Mighty Deeds, spell check results, and the
 * specials in a monster's stat line.
 *
 * The free system ships none of these tables; they come from whatever books a world has installed (the DCC and
 * XCC core books, adventures, homebrew). They're read at run time, so nothing of their text lives in this module.
 * What can't be read is left out, never guessed into something it isn't.
 * The words they're read by, and the patterns, are in reading/en.json (reading.js); here only what they mean.
 * Pure: no Foundry globals.
 */
import { parseFormula, part, meanPart, listJoin, listItems, localize, signedNumber } from "./core.js";
import { harmKinds } from "./moves.js";
import { currentReading } from "./reading.js";
// (Its texts are `t` here: this module's words are `say`.)
import { t as say } from "./words.js";

/* -------------------------------------------- */
/*  The reading                                 */
/* -------------------------------------------- */

/** The pieces a pattern takes from the code, not the reading: dice notation ({dice} "1d6", "2d4+1", "5"; {formula}). */
const NOTATION = {
  dice: "(?<dice>\\d*d\\d+(?:\\s*[+-]\\s*\\d+(?!\\s*d))?|\\d+)",
  formula: "\\d*d\\d+(?:\\s*[+-]\\s*\\d+(?!\\s*d))?"
};

/** A pattern from the reading, its {pieces} put in, compiled (one missing or bad never matches). */
function compile(source, flags, parts) {
  if ( typeof source !== "string" ) return new RegExp("(?!)", flags);
  try {
    return new RegExp(source.replace(/\{([A-Za-z]+)\}/g, (m, k) => (typeof parts[k] === "string" ? `(?:${parts[k]})` : m)), flags);
  } catch ( err ) {
    return new RegExp("(?!)", flags);
  }
}

/** Each section's patterns compiled with these flags (any it doesn't name, none). */
const FLAGS = {
  damage: { equalTo: "g", dealt: "g", loses: "g" },
  mods: { bonus: "g", ac: "g" },
  spell: { failure: "i" },
  statLine: { immune: "g", halfFrom: "g", doubleFrom: "g", attack: "gi", savesAgainst: "g", melee: "i", attackLead: "i", riderLead: "i", riderPlus: "i" },
  riders: { range: "g" }
};
const SECTIONS = ["conditions", "outcome", "saveVs", "damage", "rounds", "targets", "save", "mods", "fumble", "spell", "mending", "statLine", "auras", "followUps", "riders", "thrown"];

/** A reading's words and its patterns, compiled. */
function compileReading(words) {
  const parts = { ...(words.parts ?? {}), ...NOTATION };
  const out = {
    numbers: words.numbers ?? {},
    saveNames: words.saveNames ?? {},
    damageTypes: words.damageTypes ?? {},
    notDamageTypes: new Set(words.notDamageTypes ?? []),
    kindJoiners: new Set(words.kindJoiners ?? []),
    immunities: words.immunities ?? {},
    rendCounts: words.rendCounts ?? {},
    entryStopWords: new Set(words.entryStopWords ?? []),
    wordBreak: compile(parts.wordBreak, "", parts),
    materials: Object.entries(words.materials ?? {}).map(([tag, p]) => [tag, compile(p, "", parts)]),
    riderTraits: Object.entries(words.riderTraits ?? {}).map(([tag, p]) => [tag, compile(p, "", parts)]),
    // (The attacks as written, their names' capitals kept.)
    attacksAnyCase: compile(words.statLine?.attacks, "i", parts),
    regenStops: (words.regenStops ?? []).map(s => ({ re: compile(s?.pattern, "g", parts), before: !!s?.before })),
    movement: Object.entries(words.movement ?? {}).map(([mode, p]) => {
      const own = { ...parts, mode: p };
      return [mode, compile(words.statLine?.moveAfter, "", own), compile(words.statLine?.moveBefore, "", own)];
    })
  };
  // (A section's patterns compiled as they're first asked for; one it hasn't never matches.)
  for ( const section of SECTIONS ) {
    const flags = FLAGS[section] ?? {};
    out[section] = new Proxy({}, { get: (cache, key) => (cache[key] ??= compile(words[section]?.[key], flags[key] ?? "", parts)) });
  }
  return out;
}

/** Each reading compiled once. */
const compiled = new WeakMap();
/** The current reading, compiled. */
function R() {
  const words = currentReading();
  if ( !compiled.has(words) ) compiled.set(words, compileReading(words));
  return compiled.get(words);
}

/** A named group of a match ("what"), or its second place ("what2"). */
const got = (m, name) => m?.groups?.[name] ?? m?.groups?.[`${name}2`];

/** A save's name ("fort", "reflex") as DCC's ("frt", "ref", "wil"). */
const saveOf = word => R().saveNames[word] ?? null;

/* -------------------------------------------- */

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
  const numbers = R().numbers;
  if ( numbers[t] ) return part([], numbers[t], type);
  if ( !/\d/.test(t) ) return null;
  const p = parseFormula(t, type);
  return p.dice.length || p.flat ? p : null;
}

/** The damage type a phrase names, if any. */
function typeIn(words) {
  const { wordBreak, damageTypes } = R();
  for ( const w of String(words ?? "").toLowerCase().split(wordBreak) ) if ( damageTypes[w] ) return damageTypes[w];
  return null;
}

/**
 * Damage a result deals: "+1d6 damage", "an additional 1d8 damage", "1 point of damage", "damage equal to 1d4 +
 * caster level", "2d6 fire damage", "1d6 damage per caster level", "permanently loses 2 hit points".
 * @returns {object[]} DamageParts (empty if it names none)
 */
export function damageIn(text, { casterLevel = 0, type = "untyped" } = {}) {
  const { damage: re, damageTypes, notDamageTypes } = R();
  const out = [];
  for ( const s of sentences(text) ) {
    if ( re.heals.test(s) ) continue;
    if ( re.toAllies.test(s) && !re.toFoes.test(s) ) continue;
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
    for ( const m of s.matchAll(re.equalTo) ) add(m, got(m, "dice"), got(m, "level"));
    for ( const m of s.matchAll(re.dealt) ) {
      const word = got(m, "kind");
      const kind = word ? damageTypes[word] : null;
      if ( word && !kind && !notDamageTypes.has(word) ) continue; // "+2 to damage"? not a sum of damage
      add(m, got(m, "dice"), got(m, "level"), !!got(m, "perLevel"), kind);
    }
    for ( const m of s.matchAll(re.loses) ) add(m, got(m, "dice"));
  }
  return out;
}

/** "triple damage" and the like: how many times the blow's own damage it deals (1: no such thing). */
export function damageMultiple(text) {
  const t = plain(text).toLowerCase();
  const re = R().damage;
  if ( re.quadruple.test(t) ) return 4;
  if ( re.triple.test(t) ) return 3;
  if ( re.double.test(t) ) return 2;
  return 1;
}

/**
 * How long something lasts, in rounds: "for 1d4 rounds", "1d6+CL rounds", "next round", "until the end of the
 * battle", "for 1 turn" (ten minutes: the rest of the fight). Null if it doesn't say.
 */
export function roundsIn(text, { casterLevel = 0 } = {}) {
  const t = plain(text).toLowerCase();
  const re = R().rounds;
  if ( re.whole.test(t) ) return 100;
  const m = t.match(re.lasts);
  if ( m ) {
    if ( !got(m, "rounds") ) return 100;
    const p = dicePart(got(m, "dice"));
    return Math.max(1, Math.round((p ? meanPart(p) : 1) + (got(m, "level") ? casterLevel : 0)));
  }
  if ( re.one.test(t) ) return 1;
  return null;
}

/** How many targets it takes: "up to two targets", "a single target", "all creatures within" (an area). */
export function targetsIn(text) {
  const t = plain(text).toLowerCase();
  const { targets: re, numbers } = R();
  if ( re.area.test(t) ) return { targets: 3, area: true };
  const m = t.match(re.upTo) ?? t.match(re.count);
  if ( m ) {
    const n = numbers[got(m, "n")] ?? Number(got(m, "n"));
    if ( Number.isFinite(n) && n > 0 ) return { targets: n, area: n > 1 };
  }
  return { targets: 1, area: false };
}

/** The save a result calls for ("must make a Will save", "a DC 12 Fort save", "Ref save for half"), or null. */
export function saveIn(text, fallback = null) {
  const t = plain(text).toLowerCase();
  const re = R().save;
  const m = t.match(re.after) ?? t.match(re.before)
    // (A stat line's short way: "DC 12 Fort or ...".)
    ?? t.match(re.short);
  const dc = t.match(re.dc);
  const type = m ? saveOf(got(m, "save")) : null;
  if ( !type && !re.asked.test(t) ) return null;
  if ( re.none.test(t) && !type ) return null;
  return { type: type ?? fallback ?? "wil", dc: dc ? Number(got(dc, "n")) : null, half: re.half.test(t) };
}

/** Does the result say it simply happens (no save)? */
export const automatic = text => R().save.automatic.test(plain(text).toLowerCase());

/**
 * The conditions DCC tables name, as the engine and the DCC rules know them. Each: its words (the reading's
 * "conditions"), the conditions, the word for it (FFDCC.Told), and anything else the outcome needs.
 */
const CONDITIONS = [
  { id: "slay", slay: true },
  { id: "asleep", conditions: { incapacitated: 1, asleep: 1 }, told: "asleep", extra: { endsOnDamage: true } },
  { id: "paralyzed", conditions: { incapacitated: 1, paralyzed: 1 }, told: "paralyzed" },
  // (Not a weapon "knocked out of reach".)
  { id: "knockedOut", conditions: { incapacitated: 1, unconscious: 1 }, told: "knockedOut" },
  { id: "stunned", conditions: { stunned: 1 }, told: "stunned" },
  { id: "knockedDown", conditions: { prone: 1 }, told: "knockedDown" },
  { id: "blinded", conditions: { blinded: 1 }, told: "blinded" },
  // A one-word command costs it its turn; a charm turns it into the caster's friend.
  { id: "obeying", conditions: { stunned: 1 }, told: "obeying" },
  { id: "swayed", conditions: { controlled: 1 }, told: "swayed" },
  { id: "terrified", conditions: { frightened: 1 }, told: "terrified" },
  { id: "held", conditions: { immobilized: 1, held: 1 }, told: "held" },
  { id: "disarmed", conditions: { disarmed: 1 }, told: "disarmed" },
  { id: "slowed", conditions: { slowed: 1 }, told: "slowed" }
];

/**
 * Bonuses and penalties a result names: "-2 to attack rolls", "a -4 penalty to their next attack roll", "+2 AC
 * bonus", "-1 to all rolls", "+1 to saving throws".
 */
export function modsIn(text) {
  const t = plain(text).toLowerCase();
  const re = R().mods;
  const mods = {};
  const add = (k, v) => { mods[k] = (mods[k] ?? 0) + v; };
  for ( const m of t.matchAll(re.bonus) ) {
    const v = Number(got(m, "n").replace(/\s+/g, ""));
    if ( !v ) continue;
    // (What it's to: the group that matched; "all", or none, all of them.)
    const what = ["attack", "ac", "saves", "damage"].find(k => got(m, k) !== undefined);
    if ( what ) add(what, v);
    else { add("attack", v); add("saves", v); add("checks", v); }
  }
  for ( const m of t.matchAll(re.ac) ) add("ac", Number(got(m, "n").replace(/\s+/g, "")));
  return mods;
}

/**
 * Everything a table row says happens to the one it lands on, as an outcome: conditions, bonuses and penalties,
 * how long. Null when it names nothing the fight would notice. Also {slay: true} for a result that simply kills.
 */
export function outcomeIn(text, { casterLevel = 0, defaultRounds = 1 } = {}) {
  const t = plain(text).toLowerCase();
  if ( !t ) return null;
  const { conditions: words, outcome: re } = R();
  const conditions = {};
  const labels = [];
  let slay = false;
  let extra = {};
  for ( const c of CONDITIONS ) {
    const said = words[c.id];
    if ( !said.test(t) ) continue;
    // "If ... it dies" or "unless ...": only when it's said plainly.
    if ( c.slay ) {
      const plainly = sentences(text).some(s => said.test(s) && !re.notPlainly.test(s));
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
    const re = R().fumble;
    const self = re.self.test(lower);
    const hurtsSelf = re.hurtsSelf.test(lower) && !re.allies.test(lower);
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
  const { spell: re, numbers } = R();
  if ( !words || re.failure.test(words) ) return { fail: true };
  const out = {};
  const spellSave = saveIn(save);
  // Missiles, bolts, rays: so many of so much each.
  const count = lower.match(re.count);
  const damage = damageIn(words, { casterLevel });
  if ( damage.length ) {
    out.damage = damage;
    if ( count ) {
      const n = dicePart(got(count, "dice"));
      if ( n && meanPart(n) > 1 ) out.repeat = n;
    }
  }
  const healing = lower.match(re.heals);
  if ( healing ) {
    const p = dicePart(got(healing, "dice"), "healing");
    if ( p ) {
      if ( got(healing, "level") ) p.flat += casterLevel;
      out.heal = [p];
    }
  }
  const dice = lower.match(re.healDice);
  if ( dice ) out.healDice = numbers[got(dice, "n")] ?? (Number(got(dice, "n")) || 1);
  const effect = outcomeIn(words, { casterLevel, defaultRounds: 1 });
  // Bonuses that help the caster's side (Blessing, Enlarge) rather than hinder its foes.
  const helps = effect?.mods && !effect.conditions && Object.values(effect.mods).every(v => v > 0) && !re.penalty.test(lower);
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

/**
 * The most of a sentence (up to a full stop or semicolon) these are read in: well past any of the books'. Read a
 * sentence at a time, they cost little however long the text; a longer "sentence" isn't one of theirs, and isn't read.
 */
const SENTENCE_MOST = 2000;

/** Is this part of a phrase only kinds of harm ("acid or cold"), or words that go with them ("fire or acid damage")? */
const onlyKinds = part => {
  const { wordBreak, damageTypes, kindJoiners } = R();
  const words = part.split(wordBreak).filter(Boolean);
  return words.length > 0 && words.every(w => damageTypes[w] || kindJoiners.has(w));
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
  const { wordBreak, damageTypes } = R();
  return near.join(" ").split(wordBreak).map(w => damageTypes[w]).filter(Boolean);
}

/**
 * What a creature's words say it mends of itself each round: regeneration ("regenerates 1d6 hp per round",
 * "regenerating 1d8 points of damage at the end of each round, including the round it is killed"; what it doesn't
 * regenerate from, fire or acid, stops it: the reading's "regenStops") and plain healing ("heal 2 hp per round", "heal
 * 1 hp/round"). Regeneration that goes on the round it's killed is a last burst (burst: rules.js onDropped). Its name
 * with no amount ("regeneration", a troll's stat line: the book says how much) is only named.
 * @returns {{regen: {amount, dice, stoppedBy, burst}|null, fastHealing: number|null, named: boolean}}
 */
export function mendingIn(text) {
  const t = plain(text).toLowerCase();
  const { mending: re, regenStops } = R();
  const out = { regen: null, fastHealing: null, named: false };
  if ( !re.any.test(t) ) return out;
  const each = re.regenerates.exec(t);
  const heals = re.heals.exec(t);
  if ( heals ) {
    const p = dicePart(got(heals, "dice"));
    if ( p ) out.fastHealing = Math.max(1, Math.round(meanPart(p)));
  }
  if ( each ) {
    const dice = dicePart(got(each, "dice"));
    if ( dice ) {
      // (Sentence by sentence, those that speak of it: none of these crosses a full stop or a semicolon.)
      const said = t.split(/[.;]/).filter(x => x.length <= SENTENCE_MOST && re.sentence.test(x));
      const stoppedBy = new Set();
      for ( const { re: stop, before } of regenStops ) for ( const x of said ) for ( const m of x.matchAll(stop) ) for ( const k of kindsNamed(got(m, "what") ?? "", before) ) stoppedBy.add(k);
      // (It regenerates even the round it's killed: a last burst that may lift it again.)
      const burst = said.some(x => re.burst.test(x));
      out.regen = { amount: Math.max(1, Math.round(meanPart(dice))), dice, stoppedBy: [...stoppedBy], burst };
    }
  }
  // ("Regeneration of heads": not of its hit points.)
  out.named = !out.regen && re.named.test(t);
  return out;
}

/* -------------------------------------------- */
/*  Stat lines                                  */
/* -------------------------------------------- */

/** What un-dead (and the mindless) shrug off: the engine's tags, not words. */
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
  const { statLine: re, immunities, materials, movement, attacksAnyCase } = R();
  const out = { immune: [], attacks: [] };
  const special = lower; // (specials belong after "SP", but some stat lines put them elsewhere)
  for ( const m of special.matchAll(re.immune) ) {
    for ( const word of (got(m, "what") ?? "").split(re.listSplit).map(w => w.trim().replace(re.trailing, "")) ) {
      for ( const [k, v] of Object.entries(immunities) ) if ( word === k || word.startsWith(k) ) out.immune.push(...v);
      if ( re.fear.test(word) ) out.fearless = true;
    }
  }
  if ( re.construct.test(special) ) out.construct = true;
  if ( re.pack.test(special) ) out.pack = true;
  const atkText = got(lower.match(re.attacks), "what") ?? "";
  if ( re.spellcasting.test(special) || re.spellsAttack.test(atkText) ) out.spellcasting = true;
  if ( re.undead.test(special) ) {
    out.undead = true;
    out.immune.push(...UNDEAD);
  }
  if ( re.unholy.test(special) ) out.unholy = true;
  // Harmed only by magic (or silver): immune to weapons that aren't ("immune to non-magical weapons"), or taking half
  // from them ("resistant to non-magical weapons"): {magic, materials, half}.
  const magicOnly = special.match(re.magicOnly);
  const harmedOnly = special.match(re.harmedOnly);
  if ( magicOnly || harmedOnly ) {
    // (Only by what it names; else by magic.)
    const by = harmedOnly ? got(harmedOnly, "what") ?? "" : null;
    out.harmedOnlyBy = {
      magic: by === null || re.magic.test(by),
      materials: by === null ? [] : materials.filter(([, p]) => p.test(by)).map(([tag]) => tag),
      half: !!magicOnly && !re.magicOnlyImmune.test(got(magicOnly, "how"))
    };
  }
  const reduction = special.match(re.reduction);
  if ( reduction ) out.reduction = Number(got(reduction, "n"));
  // Half damage from some kinds of harm ("half damage from piercing and slashing weapons"); double from others.
  out.resist = [];
  for ( const m of special.matchAll(re.halfFrom) ) out.resist.push(...harmKinds(got(m, "what")));
  out.weak = [];
  for ( const m of special.matchAll(re.doubleFrom) ) out.weak.push(...harmKinds(got(m, "what")));
  const crit = special.match(re.crit);
  if ( crit ) out.critNatural = Number(got(crit, "n"));
  const infra = special.match(re.infravision);
  if ( infra ) out.infravision = Number(got(infra, "feet")) || 60;
  const mv = got(lower.match(re.movement), "what") ?? "";
  for ( const [mode, after, before] of movement ) {
    const m = mv.match(after) ?? mv.match(before);
    if ( m ) out[mode] = Number(got(m, "feet"));
  }
  const check = special.match(re.spellCheck);
  if ( check ) out.spellCheck = Number(got(check, "n").replace(/\s+/g, ""));
  // Mending of its own: regeneration ("regenerates 1d6 hp per round"), healing each round ("heal 2 hp per round"), or
  // its regeneration only named.
  const mending = mendingIn(t);
  out.regen = mending.regen;
  out.fastHealing = mending.fastHealing;
  out.regenNamed = mending.named;
  // Attacks: "claw +3 melee (1d4)" and "bite +5 melee (dmg 1d8 plus poison)", joined by "or".
  const atk = got(t.match(attacksAnyCase), "what") ?? "";
  for ( const m of atk.matchAll(re.attack) ) {
    const inside = String(got(m, "rider") ?? "");
    const formula = inside.match(/(\d*d\d+(?:\s*[+-]\s*\d+(?!\s*d))?|\b\d+\b)/)?.[1] ?? null;
    out.attacks.push({
      name: got(m, "name").replace(re.attackLead, "").trim(),
      bonus: Number(got(m, "bonus").replace(/\s+/g, "")),
      melee: re.melee.test(got(m, "kind")),
      damage: formula,
      rider: inside.replace(formula ?? "", "").replace(re.riderLead, "").replace(re.riderPlus, "").trim() || null
    });
  }
  // What its specials add to how it fights: saves it's better (or worse) at, auras that make foes save, and what follows
  // a hit (rend, constriction).
  out.saveVs = saveVsIn(special);
  out.auras = aurasIn(t);
  out.followUps = followUpsIn(special);
  if ( re.neverSurprised.test(special) ) out.neverSurprised = true;
  const hide = special.match(re.hide);
  if ( hide ) out.stealth = Number(got(hide, "n").replace(/\s+/g, ""));
  out.immune = [...new Set(out.immune)];
  return out;
}

/** The tags of what a "saves vs X" names (its words, the reading's "saveVs"), as the core's saveVs reads them. */
const SAVE_VS = [
  ["magical", ["magical"]], ["poison", ["poison"]], ["disease", ["disease"]],
  ["frightened", ["inflicts:frightened"]], ["controlled", ["inflicts:controlled"]], ["asleep", ["inflicts:asleep"]],
  ["paralyzed", ["inflicts:paralyzed"]], ["petrification", ["petrification"]], ["breath", ["breath"]], ["trap", ["trap"]]
];

/**
 * Saves a special says it's better (or worse) at ("+4 to saves vs. magic", "+2 on all saves against poison"): the
 * core's saveVs, [{bonus, saves?, vs}]; its saves alone where it names one ("+2 to Fort saves vs. poison").
 */
export function saveVsIn(text) {
  const out = [];
  const t = plain(text).toLowerCase();
  const { saveVs: words, statLine: re } = R();
  for ( const m of t.matchAll(re.savesAgainst) ) {
    const what = got(m, "what") ?? "";
    const vs = SAVE_VS.filter(([id]) => words[id].test(what)).flatMap(([, tags]) => tags);
    if ( !vs.length ) continue;
    const save = got(m, "save");
    out.push({ bonus: Number(got(m, "n").replace(/\s+/g, "")), vs, ...(save ? { saves: [saveOf(save)] } : {}) });
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
  const { auras: re, save: saves } = R();
  for ( const clause of clausesOf(text) ) {
    const t = clause.toLowerCase();
    if ( !re.named.test(t) ) continue;
    const save = saveIn(t);
    const outcome = outcomeIn(t.replace(saves.dc, ""));
    if ( !save?.dc || !outcome ) continue;
    const range = Number(got(t.match(re.range), "feet")) || 30;
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
  const { followUps: re, numbers, rendCounts } = R();
  const dice = s => s.match(/(\d*d\d+(?:\s*[+-]\s*\d+(?!\s*d))?)/)?.[1]?.replace(/\s+/g, "") ?? null;
  for ( const clause of clausesOf(text).map(c => c.toLowerCase()) ) {
    const formula = dice(clause);
    if ( !formula ) continue;
    if ( re.rend.test(clause) ) {
      const many = clause.match(re.hits);
      const count = got(many, "n");
      let n = many ? (rendCounts[count] ?? numbers[count] ?? Number(count)) : 2;
      if ( re.moreThan.test(clause) ) n += 1;
      const by = got(many, "with");
      out.push({ kind: "rend", damage: formula, n: Math.max(2, n || 2), with: by && !re.attack.test(by) ? by : null });
    } else if ( re.hold.test(clause) ) out.push({ kind: "hold", damage: formula });
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
  const { riders: re, save: saves, riderTraits } = R();
  const t = plain(text).toLowerCase().replace(re.range, "").trim();
  if ( !t ) return out;
  if ( re.grab.test(t) ) out.effects.push({ kind: "grabbed" });
  const extra = t.match(re.extra);
  if ( extra ) out.damage.push(parseFormula(got(extra, "dice").replace(/\s+/g, ""), typeIn(got(extra, "kind") ?? "") ?? "untyped"));
  const perRound = t.match(re.perRound);
  if ( perRound ) out.damage.push({ ...parseFormula(got(perRound, "dice"), typeIn(t) ?? "untyped"), persistent: true });
  const save = saveIn(t);
  if ( save?.dc ) {
    const failure = t.slice(t.search(saves.dcStart));
    const kinds = riderTraits.filter(([, p]) => p.test(t)).map(([tag]) => tag);
    const effect = { kind: "save", label: plain(text), save: { type: save.type, dc: save.dc }, ...(kinds.length ? { traits: kinds } : {}) };
    if ( re.death.test(failure) ) effect.slay = true;
    const hurt = failure.match(re.hurt);
    if ( hurt ) effect.damage = [parseFormula(got(hurt, "dice").replace(/\s+/g, ""), typeIn(failure) ?? "untyped")];
    const outcome = outcomeIn(failure.replace(saves.dc, ""));
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
  const { wordBreak, entryStopWords, save: saves } = R();
  const stems = [...new Set(names.flatMap(n => String(n ?? "").toLowerCase().split(wordBreak))
    .filter(w => w.length >= 3 && !entryStopWords.has(w))
    .map(w => w.slice(0, Math.min(5, Math.max(3, w.length - 1)))))];
  if ( !stems.length || !entry ) return { effects: [], damage: [] };
  for ( const s of sentences(entry) ) {
    if ( !saves.dcStart.test(s) || !stems.some(stem => s.includes(stem)) ) continue;
    const read = ridersIn(s);
    if ( read.effects.some(e => e.kind === "save") ) return { effects: read.effects.filter(e => e.kind === "save"), damage: [] };
  }
  return { effects: [], damage: [] };
}

/**
 * Something carried that's thrown to harm, as its description says (the books' holy water and flask of oil): {damage:
 * DamageParts, unholyOnly (it harms only the un-dead, demons and devils), range (feet; 10 where it says none)}, or null
 * for anything else.
 */
export function thrownIn(text) {
  const t = plain(text).toLowerCase();
  const r = R().thrown;
  if ( !t || !r.thrown.test(t) ) return null;
  const m = t.match(r.damage);
  const formula = got(m, "dice");
  if ( !formula ) return null;
  const type = typeIn(got(m, "kind")) ?? typeIn(t) ?? "untyped";
  return { damage: [parseFormula(formula.replace(/\s+/g, ""), type)], unholyOnly: r.unholyOnly.test(t), range: Number(got(t.match(r.range), "feet")) || 10 };
}
