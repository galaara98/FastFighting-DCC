/**
 * Dungeon Crawl Classics rules for the FastFighting engine. Pure functions only: no Foundry globals (but one world
 * setting, read through tied.js).
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
 * A charge: a melee attack after moving at least half its speed this turn, +2 to hit and -2 AC until its next turn.
 * A spell duel: a caster yet to act this round may answer a foe's spell that worked (the same spell, Dispel Magic, Fire
 * Resistance against fire, Magic Shield against Magic Missile, Invoke Patron against Invoke Patron); the two checks are
 * compared, and answering costs it its next action.
 *
 * Withdrawing from a melee: every foe engaged with it gets one free attack. Firing into a melee: -1 to hit, and a shot
 * that misses goes toward a random friend of the shooter's in that melee half the time (the attack again, against it).
 * A foe behind cover (the walls hiding any of it) is -2 to hit, melee or missile; cover does nothing for saves.
 *
 * Breaking free (of a grip, bonds, a web) is the grapple roll again, an action on its action die (adapter.js
 * escapeWork): against a grip, 10 + the grabber's grapple, as a Grapple at it is; against anything else, a hard check.
 * In a grapple the bigger of the two adds its size's edge: twice the other's size, +4; three times, +8; four, +16.
 * A fall (shoved off a ledge) is 1d6 for each 10 feet.
 */
import { DOWNED_MODELS, STATUS, MORALE, bestReactionStrike, behaviorOf, dropCondition, parseFormula, samplePart, rollD20, hiddenSides } from "./core.js";
import { t } from "./words.js";
import { leftBehind } from "./commit.js";
import { tiedStopsSpells } from "./tied.js";
import { holdsWeapon } from "./deeds.js";

const has = (u, key) => (u?.conds?.[key] ?? 0) > 0;
const ABILITY_LOSS = ["str", "agl", "sta"];

/** What the world calls Fleeting Luck (XCC: Mojo), as the character's boost names it. */
const labelOf = u => (u.spec.boosts ?? []).find(b => b.pool === "fleeting")?.label ?? "";

/** Is this a charge: a melee attack after moving at least half its speed this turn? */
const charging = (u, action) => !!action?.melee && !!u && (u.feetMoved ?? 0) - (u.turnFeet ?? 0) >= (u.spec?.speeds?.walk ?? 30) / 2;

/** Can a spell (its name) answer another: the same spell, Dispel Magic, or the counters the rules name. */
function counters(own, spell, fire) {
  if ( own === spell ) return true;
  if ( /dispel magic/.test(own) ) return true;
  if ( /fire resistance/.test(own) && fire ) return true;
  if ( /magic shield/.test(own) && /magic missile/.test(spell) ) return true;
  return /invoke patron/.test(own) && /invoke patron/.test(spell);
}

/** A morale check's DC. */
const MORALE_DC = 11;
/** What attacking a foe behind cover costs, melee or missile (DCC has no degrees of it, and nothing for saves). */
const COVER_PENALTY = 2;

/**
 * What size gives `a` in a grapple with `b`: twice b's size, +4 to its roll; three times, +8; four times, +16; and so on,
 * doubling. Size is the token's (the core's spec.position.size, in feet: the only size a DCC world keeps). 0 when
 * either size isn't known.
 */
export function sizeEdge(a, b) {
  const big = Number(a?.spec?.position?.size);
  const small = Number(b?.spec?.position?.size);
  if ( !(big > 0) || !(small > 0) ) return 0;
  const times = Math.floor(big / small + 1e-9);
  return times >= 2 ? 4 * 2 ** (times - 2) : 0;
}
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

/**
 * A regeneration that goes on the round it's killed (spec.regen.burst: a troll's, adapter.js): a last burst, rolled.
 * Taken below 0 by as much or more, it's put down for good (its regeneration stopped); otherwise the core's
 * regeneration holds it there, mending, to get up again (unless what it can't regenerate from finds it first).
 */
function lastBurst(c, overflow, rng) {
  const regen = c.spec.regen;
  if ( !regen?.burst || c.regenStopped ) return;
  const burst = rng && regen.dice ? samplePart(regen.dice, rng) : Number(regen.amount) || 0;
  if ( burst <= (Number(overflow) || 0) ) c.regenStopped = true;
}

/**
 * What a creature's conditions add to one kind of its rolls ("attack", "ac", "saves"): DCC's as bonuses and penalties
 * (dccRules.conditionMods), as they're weighed; prone apart (modifiers.attack has it), and a disarmed creature's claws
 * and fangs unhampered.
 */
function conditionsOn(u, kind, action = null) {
  let n = 0;
  for ( const [key, v] of Object.entries(u?.conds ?? {}) ) {
    if ( !(v === true || Number(v) > 0) || key === "prone" || (key === "disarmed" && action?.natural) ) continue;
    n += Number(dccRules.conditionMods(key)?.[kind]) || 0;
  }
  return n;
}

/** A morale check: a d20 and its Will (and the rest: morale's mod) against MORALE_DC, and the words for the log. */
function moraleCheck(run, why, mod) {
  const natural = run.rng.die(20);
  const total = natural + mod;
  const holds = total >= MORALE_DC;
  const said = { text: t("Morale", { why: t(`MoraleWhy.${why}`), natural, mod: signed(mod), total, dc: MORALE_DC, result: t(holds ? "MoraleHolds" : "MoraleBreaks") }),
    data: { trigger: why, natural, total, dc: MORALE_DC, holds } };
  return { holds, said };
}

/**
 * What a warrior's rally lends a creature's nerve (deeds.js rallyTier: its effects' mods.morale and mods.moraleAgain,
 * which only DCC's morale reads; the core leaves keys it doesn't know alone): the best bonus to its morale checks, and
 * a second check it hasn't tried yet.
 */
function rallyOf(u) {
  let bonus = 0;
  let again = null;
  for ( const e of u.effects ?? [] ) {
    bonus = Math.max(bonus, Number(e.mods?.morale) || 0);
    if ( e.mods?.moraleAgain && u.moraleAgainOf !== e ) again ??= e;
  }
  return { bonus, again };
}

/** Damage-type imagery for the story. */
const STORY_TYPES = { electricity: "electricity", holy: "radiant", unholy: "unholy", force: "force" };

/**
 * How hard a hold is to break where nothing says (the judge's call in DCC): a hard check, as forcing a stout door is.
 * FastFighting's improvised bonds, a sheet's Restrained, and its Grappled with no grabber known.
 */
const ESCAPE_DC = 15;
/**
 * The statuses an action breaks (commit.js SHEET_STATUSES, by their conditions): Restrained (held: a web, a net, ropes),
 * which a friend beside it can tear or cut loose with the same roll; Grappled (XCC's), someone's grip, only its own.
 */
const SHEET_HOLDS = Object.freeze({ held: Object.freeze({ dc: ESCAPE_DC, others: "check" }), grabbed: Object.freeze({ dc: ESCAPE_DC, others: null }) });

export const dccRules = {
  /**
   * Surprise as DCC has it (the planner's Follow System): those lying in wait as it starts (a side with hidden tokens)
   * get a surprise round, the others none.
   */
  surprise(run) {
    const by = hiddenSides(run);
    return by.length ? { by, round: true } : null;
  },
  id: "dcc",

  /* Turn ------------------------------------------------------------------ */
  mainPool: "action",
  movement: "feet",
  /** A move and an action for each action die; a dwarf with a shield bashes too, and an armed brawler punches. */
  turn(u) {
    const dice = u.spec.actionDice?.length || 1;
    return { action: dice, bonus: u.spec.shieldBash || u.spec.freeAttack ? 1 : 0, move: u.spec.speeds?.walk ?? Math.max(0, ...Object.values(u.spec.speeds ?? { walk: 30 })) };
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
  /** A playstyle's taunt: an action (one action die), as an XCC Gnome's Draw Agro is. */
  tauntCost: { action: 1 },
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
   * The start of a turn: where it set out from (for a charge), its charge's opening closed, and an action spent on a
   * spell duel since its last turn taken from this one. What a status on its sheet brought goes once the status has
   * (commit.js leftBehind): broken free of Restrained, it can move again.
   */
  startTurn(run, u) {
    u.turnFeet = u.feetMoved ?? 0;
    u.charging = false;
    u.turnRound = run.round;
    u.duelCost = u.dueled ? 1 : 0;
    u.dueled = false;
    for ( const key of leftBehind(u.baseConds, u.conds) ) {
      delete u.baseConds[key];
      // (Counted again, unless an effect of its own still says so: a pin.)
      if ( !(u.effects ?? []).some(e => e.conditions?.[key]) ) dropCondition(u, key);
    }
    return null;
  },
  /**
   * A spell duel: a foe of the caster's, yet to act this round, able to act, answers a spell that worked with one of
   * its own that can counter it (and isn't lost for the day). Returns {by, counter}, or null.
   */
  duel(run, caster, action) {
    const spell = String(action?.name ?? "").toLowerCase();
    const fire = /\bfire|flam|burn|scorch|inferno/.test(spell);
    for ( const e of run.units ) {
      if ( e === caster || e.status !== STATUS.STANDING || !run.prep.sides[e.side]?.enemies?.has(caster.side) ) continue;
      if ( e.turnRound === run.round || e.dueled || has(e, "incapacitated") || has(e, "stunned") || has(e, "paralyzed") ) continue;
      const counter = (e.spec.actions ?? []).find(a => a.casting && !e.lost?.has(a.id) && counters(String(a.name ?? "").toLowerCase(), spell, fire));
      if ( !counter ) continue;
      e.dueled = true;
      return { by: e, counter };
    }
    return null;
  },
  /**
   * DCC morale, for creatures (null for a character: its player decides, as the core plays it). Once its group has a
   * new reason (its first fallen, half of it down; alone, half its hit points gone), one roll decides for the group.
   * A warrior's rally (deeds.js) adds to its friends' checks, and may give one whose group has broken a second check of
   * its own: made, it holds while the rest run.
   */
  morale(run, u) {
    if ( u.spec.kind === "pc" ) return null;
    if ( u.spec.flags?.mindless || u.spec.flags?.fearless ) return MORALE.HOLD;
    const key = groupOf(u);
    const groups = run.dccMorale ??= new Map();
    const g = groups.get(key) ?? { first: false, half: false, hurt: false, broke: false, breaks: 0 };
    groups.set(key, g);
    const rally = rallyOf(u);
    const mod = (Number(u.spec.defenses?.wil) || 0) + (retainerOf(run, u) ? employerOf(run, u) : 0) + rally.bonus;
    // (Broken: it runs with the rest, unless a rally gives it a second check, or gave it one it has made since.)
    if ( g.broke && u.dccRallied !== g.breaks ) {
      if ( !rally.again ) return MORALE.ROUT;
      u.moraleAgainOf = rally.again;
      const again = moraleCheck(run, "rallied", mod);
      if ( again.holds ) u.dccRallied = g.breaks;
      return { result: again.holds ? MORALE.HOLD : MORALE.ROUT, said: again.said };
    }
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
    const { holds, said } = moraleCheck(run, trigger, mod);
    if ( !holds ) {
      g.broke = true;
      g.breaks = (g.breaks ?? 0) + 1;
    }
    return { result: holds ? MORALE.HOLD : MORALE.ROUT, said };
  },
  /**
   * Grappling is opposed attack rolls: the defender's, as a DC; the bigger of the two adds its size's edge (sizeEdge),
   * when the core says who grapples (`by`).
   */
  defenseDc(target, against, by = null) {
    if ( against !== "grapple" ) return null;
    return 10 + (Number(target.spec.grapple) || 0) + sizeEdge(target, by) - sizeEdge(by, target);
  },
  /**
   * Breaking a grip, the grapple roll again (adapter.js escapeWork, against 10 + the grabber's grapple): the bigger of
   * the two adds its size's edge. Between two of a size, the core's own try (null), which is the same roll.
   */
  breakFree(run, who, hold, { freeing = false } = {}) {
    if ( freeing || hold?.key !== "grabbed" || hold.hazard || !hold.byId ) return null;
    const grabber = run.byId?.get(hold.byId);
    const edge = sizeEdge(who, grabber) - sizeEdge(grabber, who);
    const work = who.spec.escapeWork;
    if ( !edge || !Number.isFinite(work?.mod) || !Number.isFinite(hold.dc) ) return null;
    const mod = work.mod + edge;
    const roll = rollD20(dccRules, run.rng, mod, hold.dc, { kind: "check", faces: work.faces ?? 20 });
    return { success: roll.degree >= 2, degree: roll.degree, natural: roll.natural, mod, total: roll.total, dc: hold.dc };
  },
  /** Hiding takes not having a foe beside it. */
  usable(run, u, action) {
    if ( !action?.hide ) return true;
    return ![...(u.adjacent ?? [])].some(id => { const o = run.byId.get(id); return o && o.status === STATUS.STANDING && run.prep.sides[u.side]?.enemies.has(o.side); });
  },
  /** Cover is DCC's (a foe behind it is -2 to hit: modifiers.attack), not the core's. */
  handlesCover: true,
  /** One in a hurry (its playstyles' rush) would rather charge in: a melee attack it has to move for (+2 to hit). */
  optionWeight(run, u, action, t, moves) {
    const rush = Number(behaviorOf(u).rush) || 0;
    return rush > 0 && action.melee && moves > 0 ? 1 + rush : 1;
  },
  /**
   * Subdual: a blunt blow, bare hands, or a weapon the system marks as subduing, in melee, knocks a foe out (one who
   * spares the fallen pulls such a blow).
   */
  pullsBlow(u, action) {
    return !!action?.melee && (!!action.subdual || (action.damage ?? []).some(p => p.type === "bludgeoning"));
  },
  /**
   * Binding a friend's wound while it bleeds out (homebrew: only healing saves one in the rules): an action beside it,
   * and its own Luck decides, as rolling the body would (a d20 at or under its Luck: a DC of 21 less its Luck here).
   * Made, it stops bleeding, still out, a point of Stamina gone for good as if healed in time; missed, there's no
   * binding it. Once for each.
   */
  firstAidCost: { action: 1 },
  firstAidDC(c) {
    return 21 - (Number(c.resources?.luck ?? c.spec.luck) || 0);
  },
  canFirstAid(c) {
    return c.spec.kind === "pc" && !c.bindTried && !c.knockedOut;
  },
  firstAid(c, degree) {
    c.bindTried = true;
    if ( degree < 2 ) return;
    c.stable = true;
    c.bledOut = true;
    c.bleed = null;
  },
  /** A stout door: AC 15, about 15 hit points; forcing it is a Strength check against DC 15. */
  door: { ac: 15, hp: 15, threshold: 0, forceDC: 15, pickDC: 15 },
  doorCosts: { open: {}, force: { action: 1 }, pick: { action: 1 } },
  /**
   * Breaking free (the core's holds.js), each try an action: the creature's escapeWork against the hold's DC, the core's
   * plain check (a natural 1 fails and a natural 20 succeeds, degreeOfSuccess). Bonds tied with whatever was to hand,
   * and the statuses an action breaks (SHEET_HOLDS), are a hard check.
   */
  bondsDC() {
    return ESCAPE_DC;
  },
  escapeFrom(run, u, key) {
    return Object.hasOwn(SHEET_HOLDS, key) ? { ...SHEET_HOLDS[key] } : null;
  },
  /** Tied up, it can't cast: the world's setting (tied.js; DCC doesn't say which spells need hands), on by default. */
  get tiedStopsSpells() {
    return tiedStopsSpells();
  },

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
  /**
   * A fall (shoved off a ledge: the core's behavior/forced.js): 1d6 for each 10 feet, as far as it goes (the core's
   * 20d6 at most is another system's). A 6 rolled breaking a bone isn't played. It lands prone, as the core has it.
   */
  fallDamage(feet) {
    const dice = Math.floor((Number(feet) || 0) / 10);
    return dice > 0 ? [parseFormula(`${dice}d6`, "bludgeoning")] : [];
  },

  /* Dying ----------------------------------------------------------------- */
  /**
   * Monsters and 0-level characters die at 0; anyone else bleeds out for as many rounds as their level. A regeneration
   * that goes on the round it's killed (a troll's) has a last burst (lastBurst).
   */
  onDropped(c, { model = DOWNED_MODELS.SIMULATE, overflow = 0, rng = null } = {}) {
    const level = Number(c.spec.level) || 0;
    if ( model === DOWNED_MODELS.DEAD || c.spec.diesAtZero || c.spec.kind !== "pc" || level <= 0 ) {
      c.status = STATUS.DEAD;
      lastBurst(c, overflow, rng);
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
  /**
   * Healed while bleeding out: back up, scarred, a point of Stamina gone for good. (Not a troll getting up again: it
   * wasn't bleeding.)
   */
  onHealed(c, amount) {
    const wasDown = c.status === STATUS.DOWN;
    c.hp = Math.min(c.maxHp, Math.max(0, c.hp) + amount);
    if ( wasDown && c.hp > 0 ) {
      if ( !c.stable && !c.knockedOut && Number.isFinite(c.bleed) ) c.bledOut = true;
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
    // (An XCC Dungeon Hottie: too cute to die, for a point of Luck, once a level.)
    const cute = roll > luck && u.spec.tooCute && !u.tooCuteUsed && luck >= 1;
    if ( cute ) {
      u.resources.luck = luck - 1;
      u.tooCuteUsed = true;
    }
    if ( roll > luck && !cute ) return t("Body.Dead", { roll, luck });
    u.status = STATUS.STANDING;
    u.hp = 1;
    u.bleed = null;
    u.dying = 0;
    u.bodyRecovered = ABILITY_LOSS[rng.die(3) - 1];
    return cute ? t("Body.TooCute", { roll, luck }) : t("Body.Alive", { roll, luck });
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
    /** Down, helpless or flanked, or caught by one hidden: open to a thief's backstab and an easy hit. */
    exposed({ target, flanked, attacker }) {
      return !!(target.prone || flanked || has(target, "incapacitated") || has(target, "blinded") || has(target, "stunned") || has(attacker, "hidden"));
    },
    /** A charger, until its next turn: -2 AC; and what its conditions do to its AC (blinded, slowed, hidden). */
    defense({ target }) {
      return (target?.charging ? -2 : 0) + conditionsOn(target, "ac");
    },
    attack({ attacker, target, action, distance, positioning, alliesAdjacent, cover }) {
      // (What its conditions do to its blows: blinded, frightened, slowed, disarmed.)
      let bonus = conditionsOn(attacker, "attack", action);
      // A charge: +2.
      if ( charging(attacker, action) ) bonus += 2;
      // A foe behind cover (any of it hidden by the walls, the core's cover): -2, melee or missile.
      if ( cover && cover !== "none" ) bonus -= COVER_PENALTY;
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
    /** What its conditions do to its saves (frightened). */
    save({ unit } = {}) {
      return { bonus: conditionsOn(unit, "saves"), advantage: 0 };
    },
    check() {
      return { bonus: 0, advantage: 0 };
    },
    steal() {
      return { bonus: 0, advantage: 0 };
    },
    /** Stunned: it loses its next action; paralyzed, asleep or out cold: everything (the engine's incapacitated). */
    actionsLost(u) {
      return (has(u, "stunned") ? 1 : 0) + (u.duelCost ?? 0);
    }
  },

  /**
   * Getting clear of a melee with acrobatics (an XCC Acrobat's, or Half-Elf's): half its move, and a check, 15 to slip
   * one foe, 20 for several; missed, the free attacks come.
   */
  disengage(u) {
    if ( !u.spec.acrobatics ) return null;
    return { cost: { move: Math.floor((u.spec.speeds?.walk ?? 30) / 2) }, label: t("Acrobatics"), check: { mod: u.spec.acrobatics.mod, dc: 15, dcMany: 20 } };
  },
  /**
   * Immune to a control effect when it's immune to every condition it lays on, or the effect only takes some; disarmed,
   * when it has no weapon in hand (only natural attacks).
   */
  isImmune(target, action) {
    // (A Jammer's Disrespect, or a Gnome's Draw Agro, means nothing to the mindless: slimes, golems, the walking dead
    // that don't think.)
    if ( (action?.disrespect || action?.drawAgro) && target.spec.flags?.mindless ) return true;
    const immune = new Set(target.spec.iwr?.immune ?? []);
    if ( (action.traits ?? []).some(t => immune.has(t)) ) return true;
    // Turn Unholy: only the unholy, and only up to so many hit dice.
    if ( action.turns && (!target.spec.unholy || (Number(target.spec.level) || 0) > action.turns) ) return true;
    const outcomes = [...(action.onSave ?? []), ...(action.onHit ?? []), action.outcome].filter(o => o && !o.self);
    const keys = [...new Set(outcomes.flatMap(o => Object.keys(o.conditions ?? {})))];
    const alias = { incapacitated: ["asleep", "paralyzed", "unconscious"], controlled: ["charm"], frightened: ["fear"] };
    // (Nothing in hand to knock away: claws, fangs and horns can't be disarmed, by a deed or a crit.)
    const covered = k => immune.has(k) || (k === "disarmed" && !holdsWeapon(target.spec.actions))
      || (alias[k] ?? []).some(a => outcomes.some(o => o.conditions?.[a]) && immune.has(a));
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
      slowed: { attack: -2, ac: -2 },
      // (Hidden: harder to hit, as what it can't see is.)
      hidden: { ac: 4 }
    }[key] ?? null;
  },
  /** A share of a resistance's worth: DCC rarely has partial ones. */
  resistShare() {
    return 0.5;
  },

  /**
   * Fleeting Luck (Mojo): a character's natural 20 earns its pool a point; a natural 1 on a d14 or bigger takes every
   * pool there is. (Creatures' rolls don't count: it's the players'.) A Gnome's Draw Agro earns its pool a point when
   * the foe it goaded comes at it (once for each time it lands).
   */
  afterRoll(run, u, roll, ctx) {
    // (Hidden: no longer, once it attacks.)
    if ( ctx?.kind === "attack" && has(u, "hidden") ) dropCondition(u, "hidden");
    // (A charge, made: open to blows until its next turn.)
    if ( ctx?.kind === "attack" && charging(u, ctx.action) ) u.charging = true;
    const pools = run.sharedPools;
    const gnome = ctx?.kind === "attack" ? ctx.target : null;
    const goaded = gnome?.spec.fleeting ? (u.effects ?? []).find(e => e.taunt && !e.paid && e.sourceId === gnome.id && String(e.key).endsWith(".drawAgro")) : null;
    if ( goaded && pools && gnome.spec.fleeting.key in pools ) {
      goaded.paid = true;
      pools[gnome.spec.fleeting.key] += 1;
      run.log?.push({ round: run.round, actor: gnome.spec.name, actorId: gnome.id, side: gnome.side, type: "fleeting", text: t("FleetingGain", { label: labelOf(gnome) }), gained: 1 });
    }
    if ( u.spec.kind !== "pc" || !pools || !roll || !Number.isFinite(roll.natural) ) return;
    const faces = ctx?.faces ?? 20;
    const key = u.spec.fleeting?.key;
    if ( faces === 20 && roll.natural === 20 && key && key in pools ) {
      pools[key] += 1;
      run.log?.push({ round: run.round, actor: u.spec.name, actorId: u.id, side: u.side, type: "fleeting", text: t("FleetingGain", { label: u.spec.fleeting ? labelOf(u) : "" }), gained: 1 });
    } else if ( faces >= 14 && roll.natural === 1 && Object.values(pools).some(v => v > 0) ) {
      for ( const k of Object.keys(pools) ) pools[k] = 0;
      run.log?.push({ round: run.round, actor: u.spec.name, actorId: u.id, side: u.side, type: "fleeting", text: t("FleetingLost", { label: labelOf(u) }), lost: true });
    }
  },

  /**
   * What a turn's write-back (commit.js) and the planner's summary need beyond the core's: bleeding out, the body,
   * spells lost, disapproval, Fleeting Luck.
   */
  capture(u) {
    return {
      fleeting: u.spec.fleeting ? u.sharedPools?.[u.spec.fleeting.key] ?? null : null,
      tooCuteUsed: !!u.tooCuteUsed,
      bleed: u.status === STATUS.DOWN && !u.stable ? (u.bleed ?? 0) : null,
      bledOut: !!u.bledOut,
      body: u.bodyRecovered ?? null,
      lost: u.lost ? [...u.lost] : [],
      disapproval: u.disapproval ?? null
    };
  },

  storyDamageType(type) {
    return STORY_TYPES[type] ?? type;
  }
};
