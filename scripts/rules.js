/**
 * Dungeon Crawl Classics rules for the FastFighting engine. Pure functions only: no Foundry globals.
 *
 * Each turn a move and one action for each action die (a d20 for most; a giant may roll a d24 and then a d16, a
 * high-level warrior a d20 and then a d14); an attack rolls the action die. A natural roll at the top of the die
 * always hits; a hit in the crit range (scaled to the die: 19-20 on a d20 is 23-24 on a d24) is a crit, which rolls
 * on a crit table instead of doubling anything; a natural 1 misses and, for a player character, rolls on the
 * fumble table. Saves (Fortitude, Reflex, Will) meet the DC or don't. A hit always does at least 1 damage.
 *
 * Dying: monsters and 0-level characters die at 0 hit points. A 1st-level or higher character bleeds out: healed
 * within (level) rounds it lives (a permanent point of Stamina lost, and a scar); otherwise it dies. After a fight a
 * dead character's friends may roll the body: a Luck check (a d20 at or under the character's Luck) finds them only
 * unconscious, at 1 hit point, groggy, with a permanent point of Strength, Agility or Stamina lost.
 *
 * Morale (creatures; characters are their players'): a group checks when its first falls and when half are down; a
 * creature alone, when it has lost half its hit points. One roll for the group, by whichever of it acts next: a d20 +
 * its Will (a retainer adds its employer's Personality) against DC 11; under, the whole group flees. The mindless and
 * the fearless never break.
 *
 * Withdrawing from a melee: every foe engaged with it gets one free attack. Firing into a melee: -1 to hit, and a shot
 * that misses goes toward a random friend of the shooter's in that melee half the time (the attack again, against it).
 */
import { DOWNED_MODELS, STATUS, MORALE, bestReactionStrike } from "./core.js";
import { t } from "./words.js";

const has = (u, key) => (u?.conds?.[key] ?? 0) > 0;
const ABILITY_LOSS = ["str", "agl", "sta"];

/** A morale check's DC. */
const MORALE_DC = 11;
const signed = n => (n >= 0 ? `+${n}` : String(n));
/** The group a creature checks morale with: its side's (a hostile group), or its friend group when it takes no side. */
const groupOf = u => `${u.homeSide ?? u.side}|${u.spec.group ?? ""}`;
/** A retainer: a creature on the party's side. */
const retainerOf = (run, u) => u.spec.kind !== "pc" && (u.homeSide ?? u.side) === "friendly";
/** The employer's Personality: the party's leader's, else the best of its characters'. */
function employerOf(run, u) {
  const head = run.byId.get(run.prep.command?.friendly?.[0]?.id);
  if ( head?.spec.kind === "pc" ) return Number(head.spec.personality) || 0;
  const pcs = run.units.filter(o => o.spec.kind === "pc" && o.side === u.side && o.status === STATUS.STANDING);
  return pcs.length ? Math.max(...pcs.map(o => Number(o.spec.personality) || 0)) : 0;
}

/** Damage-type imagery for the story. */
const STORY_TYPES = { electricity: "electricity", holy: "vitality", unholy: "void", force: "force" };

export const dccRules = {
  id: "dcc",

  /* Turn ------------------------------------------------------------------ */
  mainPool: "action",
  movement: "feet",
  /** A move and an action for each action die; a dwarf with a shield bashes too. */
  turn(u) {
    const dice = u.spec.actionDice?.length || 1;
    return { action: dice, bonus: u.spec.shieldBash ? 1 : 0, move: u.spec.speeds?.walk ?? Math.max(0, ...Object.values(u.spec.speeds ?? { walk: 30 })) };
  },
  costOf(action) {
    if ( action.economy === "free" ) return {};
    return action.economy === "bonus" ? { bonus: 1 } : { action: 1 };
  },
  /** The die for the creature's next action: its first action die, then its second ... (the last again after that). */
  actionDie(u, n) {
    const dice = u.spec.actionDice;
    if ( !dice?.length ) return 20;
    return dice[Math.min(n, dice.length - 1)];
  },
  basicAction: { action: 1 },
  talkCost: { action: 1 },
  stealCost: { action: 1 },
  feintCost: {},
  /** Standing up takes half a move. */
  standCost(u) {
    return { move: Math.ceil((u.spec.speeds?.walk ?? 30) / 2) };
  },
  /**
   * Withdrawing from a melee: each foe engaged with it gets one free attack (any that has a melee attack and can act),
   * at each foe that withdraws.
   */
  opportunity(reactor) {
    if ( has(reactor, "incapacitated") || has(reactor, "paralyzed") || has(reactor, "stunned") || has(reactor, "asleep") ) return null;
    return bestReactionStrike(reactor);
  },
  /** (A free attack at every foe that withdraws: no limit in a round.) */
  reactions() {
    return 99;
  },
  /**
   * A shot into a melee that missed: half the time it strays toward a random friend of the shooter's engaged with the
   * target. Returns that friend, or null.
   */
  strayShot(run, u, target, action) {
    if ( action?.melee ) return null;
    const friends = [...(target.adjacent ?? [])].map(id => run.byId.get(id))
      .filter(o => o && o !== u && o.side === u.side && o.status === STATUS.STANDING);
    if ( !friends.length || !run.rng.chance(0.5) ) return null;
    return run.rng.pick(friends);
  },
  /**
   * DCC morale, for creatures (null for a character: its player decides, as the core plays it). Once its group has a
   * new reason (its first fallen, half of it down; alone, half its hit points gone), one roll decides for the group.
   */
  morale(run, u) {
    if ( u.spec.kind === "pc" ) return null;
    if ( u.spec.flags?.mindless || u.spec.flags?.fearless ) return MORALE.HOLD;
    const key = groupOf(u);
    const groups = run.dccMorale ??= new Map();
    const g = groups.get(key) ?? { first: false, half: false, hurt: false, broke: false };
    groups.set(key, g);
    if ( g.broke ) return MORALE.ROUT;
    const members = run.units.filter(o => groupOf(o) === key && !o.spec.hazard);
    const down = members.filter(o => o.status !== STATUS.STANDING).length;
    let trigger = null;
    if ( members.length > 1 ) {
      if ( !g.half && down >= members.length / 2 ) trigger = "half";
      else if ( !g.first && down >= 1 ) trigger = "first";
      if ( trigger === "half" ) g.half = g.first = true;
      if ( trigger === "first" ) g.first = true;
    } else if ( !g.hurt && u.hp <= u.maxHp / 2 ) {
      trigger = "hurt";
      g.hurt = true;
    }
    if ( !trigger ) return MORALE.HOLD;
    const will = Number(u.spec.defenses?.wil) || 0;
    const employer = retainerOf(run, u) ? employerOf(run, u) : 0;
    const natural = run.rng.die(20);
    const total = natural + will + employer;
    const holds = total >= MORALE_DC;
    if ( !holds ) g.broke = true;
    const said = { text: t("Morale", { why: t(`MoraleWhy.${trigger}`), natural, mod: signed(will + employer), total, dc: MORALE_DC, result: t(holds ? "MoraleHolds" : "MoraleBreaks") }),
      data: { trigger, natural, total, dc: MORALE_DC, holds } };
    return { result: holds ? MORALE.HOLD : MORALE.ROUT, said };
  },
  /** A stout door: AC 15, about 15 hit points; forcing it is a Strength check against DC 15. */
  door: { ac: 15, hp: 15, threshold: 0, forceDC: 15, pickDC: 15 },
  doorCosts: { open: {}, force: { action: 1 }, pick: { action: 1 } },

  /* Rolls ----------------------------------------------------------------- */
  /**
   * Attacks: a natural at or under the fumble range misses (and fumbles); the top of the die always hits; a hit
   * whose natural is in the crit range crits. Saves and checks: a natural 1 fails, a natural 20 succeeds.
   * @param {object} [die]  {faces, critOn (d20-relative, scaled to the die), fumbleOn}
   */
  degreeOfSuccess(natural, total, dc, kind = "check", die = undefined) {
    const faces = die?.faces ?? 20;
    if ( kind === "attack" ) {
      if ( natural <= (die?.fumbleOn ?? 1) ) return 0;
      const hit = natural >= faces || total >= dc;
      if ( !hit ) return 1;
      const threat = natural >= Math.max(1, faces - (20 - (die?.critOn ?? 20)));
      return threat ? 3 : 2;
    }
    if ( natural <= 1 ) return 1;
    if ( natural >= faces && faces >= 20 ) return 2;
    return total >= dc ? 2 : 1;
  },
  attackPenalty() {
    return 0;
  },
  minimumDamage: 1,

  /** Half damage on a save that says so; most DCC saves simply negate. */
  saveMultiplier(degree, save) {
    if ( degree >= 2 ) return save?.basic ? 0.5 : 0;
    return 1;
  },
  /** Crits roll on a table (riders.js); the blow's own damage isn't doubled. */
  critical(parts) {
    return parts ?? [];
  },
  /** Immune ignores; resistance halves; vulnerability doubles. */
  applyIwr(iwr, byType) {
    let total = 0;
    for ( const [type, amount] of Object.entries(byType) ) {
      if ( amount <= 0 || iwr?.immune?.includes(type) ) continue;
      let value = amount;
      if ( iwr?.resist?.[type] ) value = Math.floor(value / 2);
      if ( iwr?.weak?.[type] ) value *= 2;
      total += value;
    }
    return total;
  },

  /* Dying ----------------------------------------------------------------- */
  /** Monsters and 0-level characters die at 0; anyone else bleeds out for as many rounds as their level. */
  onDropped(c, { model = DOWNED_MODELS.SIMULATE } = {}) {
    const level = Number(c.spec.level) || 0;
    if ( model === DOWNED_MODELS.DEAD || c.spec.diesAtZero || c.spec.kind !== "pc" || level <= 0 ) {
      c.status = STATUS.DEAD;
      return c.status;
    }
    if ( model === DOWNED_MODELS.OUT ) {
      c.status = STATUS.DOWN;
      c.stable = true;
      return c.status;
    }
    if ( c.status !== STATUS.DOWN ) {
      c.status = STATUS.DOWN;
      c.stable = false;
      c.bleed = level;
      c.dying = 1;
    }
    return c.status;
  },
  /** Healed while bleeding out: back up, scarred, a point of Stamina gone for good. */
  onHealed(c, amount) {
    const wasDown = c.status === STATUS.DOWN;
    c.hp = Math.min(c.maxHp, Math.max(0, c.hp) + amount);
    if ( wasDown && c.hp > 0 ) {
      if ( !c.stable && !c.knockedOut ) c.bledOut = true;
      c.status = STATUS.STANDING;
      c.stable = false;
      c.dying = 0;
      c.bleed = null;
    }
  },
  /** Each of its turns while bleeding out takes a round off what's left; past the last, it dies. */
  recoveryCheck(c) {
    if ( c.status !== STATUS.DOWN || c.stable ) return null;
    if ( (c.bleed ?? 0) <= 0 ) {
      c.status = STATUS.DEAD;
      c.dying = 0;
      return t("Bleed.Dies");
    }
    c.bleed -= 1;
    c.dying = Math.max(1, (Number(c.spec.level) || 1) + 1 - c.bleed);
    return c.bleed ? (c.bleed === 1 ? t("Bleed.One") : t("Bleed.Many", { n: c.bleed })) : t("Bleed.Last");
  },
  /** Knocked out by someone who never kills: down, but not bleeding. */
  knockOut(u) {
    u.bleed = null;
  },
  /** A dead character's friends reach the body: a Luck check (d20 at or under Luck) says they were only unconscious. */
  recoverBody(u, rng) {
    const luck = u.resources?.luck ?? u.spec.luck ?? 0;
    const roll = rng.die(20);
    if ( roll > luck ) return t("Body.Dead", { roll, luck });
    u.status = STATUS.STANDING;
    u.hp = 1;
    u.bleed = null;
    u.dying = 0;
    u.bodyRecovered = ABILITY_LOSS[rng.die(3) - 1];
    return t("Body.Alive", { roll, luck });
  },
  persistentFlatCheck(rng) {
    return rng.d20() >= 11;
  },

  /* What's typical, by level (hit dice) ------------------------------------ */
  typical: {
    ac: level => 11 + Math.floor(level / 2),
    save: level => Math.floor(level / 2) + 1,
    skill: level => Math.floor(level / 2) + 1,
    dc: level => 10 + level
  },

  /* Situations ------------------------------------------------------------ */
  modifiers: {
    /** Down, helpless or flanked: open to a thief's backstab and an easy hit. */
    exposed({ target, flanked }) {
      return !!(target.prone || flanked || has(target, "incapacitated") || has(target, "blinded") || has(target, "stunned"));
    },
    defense() {
      return 0;
    },
    attack({ attacker, target, action, distance, positioning, alliesAdjacent }) {
      let bonus = 0;
      // Firing into a melee (the target engaged with the shooter's friends): -1.
      if ( !action?.melee && action?.range && alliesAdjacent > 0 ) bonus -= 1;
      // Attacking a prone or helpless foe in melee: +2; a stunned or blind one too.
      if ( (target.prone || has(target, "incapacitated") || has(target, "stunned")) && action?.melee ) bonus += 2;
      if ( attacker.prone ) bonus -= 4;
      const ranged = !!action?.range && !action.melee;
      // Long range: -2 (medium), -4 beyond.
      if ( ranged && positioning && action.range.increment && distance > action.range.increment ) bonus -= distance > 2 * action.range.increment ? 4 : 2;
      return { bonus, advantage: 0 };
    },
    save() {
      return { bonus: 0, advantage: 0 };
    },
    check() {
      return { bonus: 0, advantage: 0 };
    },
    steal() {
      return { bonus: 0, advantage: 0 };
    },
    /** Stunned: it loses its next action; paralyzed, asleep or out cold: everything (the engine's incapacitated). */
    actionsLost(u) {
      return has(u, "stunned") ? 1 : 0;
    }
  },

  /** Immune to a control effect when it's immune to every condition it lays on, or the effect only takes some. */
  isImmune(target, action) {
    const immune = new Set(target.spec.iwr?.immune ?? []);
    if ( (action.traits ?? []).some(t => immune.has(t)) ) return true;
    // Turn Unholy: only the unholy, and only up to so many hit dice.
    if ( action.turns && (!target.spec.unholy || (Number(target.spec.level) || 0) > action.turns) ) return true;
    const outcomes = [...(action.onSave ?? []), ...(action.onHit ?? []), action.outcome].filter(o => o && !o.self);
    const keys = [...new Set(outcomes.flatMap(o => Object.keys(o.conditions ?? {})))];
    const alias = { incapacitated: ["asleep", "paralyzed", "unconscious"], controlled: ["charm"], frightened: ["fear"] };
    const covered = k => immune.has(k) || (alias[k] ?? []).some(a => outcomes.some(o => o.conditions?.[a]) && immune.has(a));
    return keys.length > 0 && keys.every(covered);
  },
  /** What a condition costs a creature each round (for behavior's estimates). */
  conditionWeight(key) {
    return { stunned: 0.6, paralyzed: 1, asleep: 1, unconscious: 1, held: 0.35, charm: 0.3 }[key];
  },
  /** DCC's conditions as bonuses and penalties. */
  conditionMods(key) {
    return {
      prone: { attack: -4, ac: -2 },
      blinded: { attack: -4, ac: -2 },
      frightened: { attack: -2, saves: -2 },
      disarmed: { attack: -4 },
      slowed: { attack: -2, ac: -2 }
    }[key] ?? null;
  },
  /** A share of a resistance's worth: DCC rarely has partial ones. */
  resistShare() {
    return 0.5;
  },

  /** What Make it So needs beyond the core's: bleeding out, the body, spells lost, disapproval. */
  capture(u) {
    return {
      bleed: u.status === STATUS.DOWN && !u.stable ? (u.bleed ?? 0) : null,
      bledOut: !!u.bledOut,
      body: u.bodyRecovered ?? null,
      lost: u.lost ? [...u.lost] : [],
      disapproval: u.disapproval ?? null
    };
  },

  secondsPerRound: 10,

  storyDamageType(type) {
    return STORY_TYPES[type] ?? type;
  }
};
