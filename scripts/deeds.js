/**
 * Mighty Deeds of Arms: what a warrior (or dwarf, or anyone with a deed die) can try with each attack. A deed works
 * when the attack hits and the deed die shows 3 or more, and the higher the better.
 *
 * Read from the world's Mighty Deed tables when a book has them (trips and throws, blinding attacks, disarming
 * attacks, defensive maneuvers, rallying maneuvers: the ones that change a fight), else rough built-in versions of
 * the same. A rally puts heart into the warrior's friends nearby: a better swing next, more at a higher deed. A
 * pushback shoves the foe back 5 feet, 10 at a 5 or more: off a ledge, into a fire, out of reach (the core weighs
 * where it ends up). Its tiers are the built-in ones only: a book's pushback rows measure by the warrior's movement
 * and the foe's size, which aren't read. Each names the core's maneuver it is (maneuvers.js and the story's: trip,
 * blindFoe, disarm, shove, defend, rally). A disarm is only for a foe with a weapon in hand: claws, fangs and horns
 * can't be knocked away (what a book's rows do to a natural weapon instead isn't played). Precision shots don't show
 * in this kind of fight and aren't tried.
 * Pure.
 */
import { outcomeIn, modsWords, affected, plain } from "./text.js";
import { listItems } from "./core.js";
import { t } from "./words.js";

/**
 * A creature with a weapon in hand, something to knock away (its creatureTraits: what a disarming deed goes for). One
 * with only natural attacks (claws, fangs, a slam: adapter.js naturalOf) can't be disarmed.
 */
export const ARMED = "armed";
/** Does it fight with a weapon in hand: any blow that isn't a natural attack? */
export const holdsWeapon = actions => (actions ?? []).some(a => a.kind === "strike" && !a.natural);

/** The kinds of deed (their names and what they leave a foe, in the reader's language: worked out when asked for). */
// (What playstyles lean on: a spoiler trips, blinds and disarms; one who'd lead or rally rallies; a defensive maneuver
// goes as the shield answer says, a DCC shield being in the AC already. A pushback leans on nothing here: the core
// already counts a shove for more to those who like shoving, Brawlers and the Cruel. A disarm only at a foe with a
// weapon in hand.)
const kinds = () => ({
  trip: { id: "trip", maneuver: "trip", label: t("Deed.Trip"), melee: true, condition: { prone: 1 }, label2: t("Deed.KnockedDown"), leans: ["hinders"] },
  blind: { id: "blind", maneuver: "blindFoe", label: t("Deed.Blind"), leans: ["hinders"] },
  disarm: { id: "disarm", maneuver: "disarm", label: t("Deed.Disarm"), melee: true, condition: { disarmed: 1 }, label2: t("Deed.Disarmed"), leans: ["hinders"], vs: [ARMED] },
  push: { id: "push", maneuver: "shove", label: t("Deed.Pushback"), melee: true, push: true },
  defend: { id: "defend", maneuver: "defend", label: t("Deed.Defend"), self: true, guard: true },
  rally: { id: "rally", maneuver: "rally", label: t("Deed.Rally"), allies: 10, leans: ["rally"] },
  // (A missile weapon's deed: what the book's precision shot table says it does to the foe. Only from a table: there's
  // no rough built-in version.)
  precision: { id: "precision", maneuver: "precision", label: t("Deed.Precision"), ranged: true, leans: ["hinders"], tableOnly: true }
});

/** Rough versions for when no book's tables are installed. */
const builtIn = () => {
  const ac = n => t("Deed.Ac", { n });
  const push = feet => ({ move: { kind: "push", feet }, label: t("Deed.PushedBack") });
  return {
    trip: [{ min: 3, outcome: { conditions: { prone: 1 }, rounds: 1, label: t("Deed.KnockedDown") } }, { min: 5, outcome: { conditions: { prone: 1 }, mods: { attack: -2 }, rounds: 2, label: t("Deed.ThrownDown") } }],
    blind: [{ min: 3, outcome: { mods: { attack: -2 }, rounds: 1, label: t("Deed.Dazzled2") } }, { min: 5, outcome: { conditions: { blinded: 1 }, rounds: 2, label: t("Deed.Blinded") } }, { min: 7, outcome: { conditions: { blinded: 1 }, rounds: 5, label: t("Deed.Blinded") } }],
    disarm: [{ min: 4, outcome: { conditions: { disarmed: 1 }, rounds: 1, label: t("Deed.Disarmed") } }, { min: 6, outcome: { conditions: { disarmed: 1 }, rounds: 3, label: t("Deed.Disarmed") } }],
    push: [{ min: 3, outcome: push(5) }, { min: 5, outcome: push(10) }],
    defend: [{ min: 3, outcome: { mods: { ac: 1 }, rounds: 1, label: ac(1), self: true } }, { min: 5, outcome: { mods: { ac: 2 }, rounds: 1, label: ac(2), self: true } }, { min: 7, outcome: { mods: { ac: 3 }, rounds: 1, label: ac(3), self: true } }],
    rally: [
      { min: 3, outcome: { mods: { attack: 1 }, uses: 1, rounds: 1, label: t("Deed.Rallied1"), allies: 10 } },
      { min: 5, outcome: { mods: { attack: 2 }, uses: 1, rounds: 1, label: t("Deed.Rallied2"), allies: 20 } },
      { min: 7, outcome: { mods: { attack: 2, saves: 2 }, rounds: 1, label: t("Deed.Rallied3"), allies: 30 } }
    ]
  };
};

/**
 * The deeds a creature can try.
 * @param {Record<string, {range, text}[]>|null} tables  the world's deed tables by kind, if any
 * @param {object} [warrior]   what a pushback row measures by: {speed (feet), body (its token's size, feet)}
 * @returns {object[]} deeds for spec.deeds (see the core's riders.js)
 */
export function deedsFrom(tables, warrior = {}) {
  const out = [];
  const fallback = builtIn();
  for ( const [kind, base] of Object.entries(kinds()) ) {
    const rows = tables?.[kind];
    let tiers = rows?.length ? rows.map(r => tierFrom(base, r, warrior)).filter(Boolean) : [];
    if ( !tiers.length && !base.tableOnly ) tiers = fallback[kind].map(tier => ({ ...tier, outcome: { ...tier.outcome } }));
    if ( !tiers.length ) continue;
    out.push({ id: base.id, maneuver: base.maneuver, label: base.label, melee: base.melee, ranged: base.ranged, leans: base.leans, guard: base.guard, vs: base.vs, tiers: tiers.sort((a, b) => a.min - b.min) });
  }
  return out;
}

/** One deed table row as a tier: what it does to the foe (or, for a defensive deed, for the warrior). */
function tierFrom(base, row, warrior = {}) {
  const min = Number(row.range?.[0]);
  if ( !Number.isFinite(min) ) return null;
  if ( base.allies ) return rallyTier(base, row, min);
  if ( base.push ) return pushTier(row, min, warrior);
  const read = outcomeIn(row.text, { defaultRounds: 1 });
  let outcome = read ? { ...read } : null;
  delete outcome?.slay;
  // A trip is a fall, a disarm a dropped weapon, whatever else the row adds.
  if ( base.condition ) outcome = { rounds: 1, ...(outcome ?? {}), conditions: { ...(outcome?.conditions ?? {}), ...base.condition }, label: outcome?.label && outcome.label !== affected() ? outcome.label : base.label2 };
  if ( !outcome ) return null;
  // Not quite blind yet: dust and blood in the eyes.
  if ( base.id === "blind" && !outcome.conditions?.blinded ) outcome.label = t("Deed.Dazzled", { what: modsWords(outcome.mods) || outcome.label });
  if ( base.self ) {
    // Defensive: only the bonus to AC, for the warrior.
    if ( !(outcome.mods?.ac > 0) ) return null;
    outcome = { mods: { ac: outcome.mods.ac }, rounds: outcome.rounds ?? 1, label: t("Deed.Ac", { n: outcome.mods.ac }), self: true };
  }
  return { min, outcome };
}

/** "+1 to morale checks", "a +2 morale bonus": what a rally adds to its friends' morale checks. */
const MORALE_BONUS = [/([+-]\s*\d+)\s*(?:bonus\s+|penalty\s+)?(?:to|on)\s+(?:(?:their|its|his|her|all|any)\s+)?morale\b/, /([+-]\s*\d+)\s+morale\b/];
/** "Those that failed a morale check get a second check", "reroll a failed morale check", "recover their wits". */
const MORALE_AGAIN = /\b(?:second|another|new|fresh)\s+(?:morale\s+)?(?:check|save|roll)\b|\bre-?roll\w*\b[^.;]*\bmorale\b|\brecover\w*\s+(?:their|its|his|her)\s+(?:wits|nerve|courage)\b/;

/**
 * A pushback row as a tier, measured by the warrior as the rows do: how far ("up to 10 feet", "half the warrior's
 * movement", "a few feet": 5) and how big a foe ("the same size as the warrior", "up to twice their size"), the most
 * a foe's token can be across (maxBody, feet: rules.js isImmune) where the warrior's own token is known; knocked down
 * too where it says so. Null for a row that names no distance (one that throws back a crowd: the built-in stands).
 */
function pushTier(row, min, { speed = 30, body = null } = {}) {
  const words = plain(row.text).toLowerCase();
  const feet = Number(words.match(/(\d+)\s*(?:feet|ft\.?|')/)?.[1])
    || (/\bhalf (?:the warrior's|its|his|her|their) (?:movement|speed|move)\b/.test(words) ? Math.floor((Number(speed) || 30) / 2 / 5) * 5 : 0)
    || (/\ba few feet\b/.test(words) ? 5 : 0);
  if ( !feet ) return null;
  const times = /\bthree times\b/.test(words) ? 3 : /\btwice\b/.test(words) ? 2 : 1;
  const down = /\bknock\w* (?:\w+ )?down\b|\bprone\b/.test(words);
  const outcome = {
    move: { kind: "push", feet }, rounds: 1, label: down ? t("Deed.ThrownDown") : t("Deed.PushedBack"),
    ...(down ? { conditions: { prone: 1 } } : {}),
    ...(Number(body) > 0 ? { maxBody: times * Number(body) } : {})
  };
  return { min, outcome };
}

/** A sentence that waits on a kill or a crit: "if the warrior slays its foe ...", "allies who slay a foe gain ...". */
const waitsOn = s => /\b(?:if|when|once|who|that|after)\b/i.test(s) && /\b(?:kill\w*|slay\w*|slain|crit\w*|critical)\b/i.test(s);
/** The words for a bonus that waits, by what it waits on and whose. */
const AFTER = {
  kill: { bearer: "Deed.AfterKill", source: "Deed.AfterKillTheirs" },
  crit: { bearer: "Deed.AfterCrit", source: "Deed.AfterCritTheirs" }
};

/**
 * A rally row as a tier: what it does for the warrior's friends who see it, those near enough (more, and farther, at a
 * higher deed). The bonuses it lends them outright (to attacks, saves or AC), or once a kill or a crit is scored (its
 * friend's own, or the warrior's: armedBy, armedFrom), and its say on their nerve, which DCC's morale plays (rules.js morale): so much to
 * their morale checks (mods.morale), a second check for any whose nerve has broken (mods.moraleAgain). Null when it
 * does none of these (a row that only says "as above" leaves the one below it to stand).
 */
function rallyTier(base, row, min) {
  const words = plain(row.text);
  const sure = words.split(/(?<=[.!?;])\s+/).filter(s => !/\b(?:if|unless)\b/i.test(s) && !waitsOn(s)).join(" ");
  const read = outcomeIn(sure, { defaultRounds: 1 });
  const lent = Object.fromEntries(Object.entries(read?.mods ?? {}).filter(([k, v]) => ["attack", "saves", "ac"].includes(k) && v > 0));
  const said = Object.entries(lent).map(([k, v]) => t("Deed.Lent", { n: `+${v}`, stat: k === "ac" ? t("Ac") : k === "attack" ? t("Attack") : t("Saves") }));
  const mods = { ...lent };
  // (Its say on their nerve, whatever it hangs on: "a second check, and they recover if they make it".)
  const lower = words.toLowerCase();
  const bonus = Number(MORALE_BONUS.map(re => re.exec(lower)?.[1]).find(Boolean)?.replace(/\s+/g, ""));
  if ( bonus > 0 ) {
    mods.morale = bonus;
    said.push(t("Deed.Morale", { n: `+${bonus}` }));
  }
  if ( MORALE_AGAIN.test(lower) ) {
    mods.moraleAgain = 1;
    said.push(t("Deed.MoraleAgain"));
  }
  // (A bonus that waits on a kill or a crit, "if they kill a foe, +2 to attacks", and nothing else lent outright: it
  // works once one scores it: the friend itself ("allies who slay a foe"), else the warrior ("if the warrior slays its
  // foe"). Core API 29, armedBy and armedFrom.)
  let armedBy = null;
  let armedFrom = null;
  if ( !Object.keys(lent).length ) {
    const waits = words.split(/(?<=[.!?;])\s+/).find(waitsOn);
    const later = waits ? outcomeIn(waits, { defaultRounds: 1 }) : null;
    const after = Object.fromEntries(Object.entries(later?.mods ?? {}).filter(([k, v]) => ["attack", "saves", "ac", "damage"].includes(k) && v > 0));
    if ( Object.keys(after).length ) {
      armedBy = /\bcrit\w*|\bcritical\b/i.test(waits) ? "crit" : "kill";
      armedFrom = /\b(?:all(?:y|ies)|they|followers?|friends?|hirelings?)\b[^.;]*\b(?:kill|slay|slain|crit)/i.test(waits) ? "bearer" : "source";
      Object.assign(mods, after);
      said.push(t(AFTER[armedBy][armedFrom], { what: listItems(Object.entries(after).map(([k, v]) => t("Deed.Lent", { n: `+${v}`, stat: k === "ac" ? t("Ac") : k === "attack" ? t("Attack") : k === "damage" ? t("DamageWord") : t("Saves") }))) }));
    }
  }
  if ( !said.length ) return null;
  return { min, outcome: { mods, rounds: read?.rounds ?? 1, label: t("Deed.Rallied", { what: listItems(said) }), allies: base.allies * Math.max(1, Math.floor(min / 3)), ...(armedBy ? { armedBy, armedFrom } : {}) } };
}
