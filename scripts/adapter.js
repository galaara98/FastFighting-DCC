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
import { deriveDccTraits } from "./traits.js";
import { rankDccLeaders } from "./leadership.js";
import { commitDccOutcome, describeDccOutcome, commitDccConcession, statusesOf } from "./commit.js";

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

/** Damage-type imagery from a weapon's name (DCC weapons don't say). */
function weaponType(name) {
  const n = String(name ?? "").toLowerCase();
  if ( /bow|arrow|bolt|spear|lance|javelin|dart|dagger|rapier|pick|bite|fang|horn|tusk|sting|trident|pike/.test(n) ) return "piercing";
  if ( /mace|club|hammer|staff|flail|maul|fist|punch|slam|sling|morningstar|shield|tail|stomp|rock|boulder/.test(n) ) return "bludgeoning";
  return "slashing";
}

const MODES = ["fly", "swim", "climb", "burrow"];
const COPPER = { pp: 1000, ep: 50, gp: 100, sp: 10, cp: 1 };

export class DccAdapter extends SystemAdapter {
  static systemId = "dcc";

  #tables = new DccTables();

  get label() {
    return game.modules.get("xcc")?.active ? "DCC / XCC" : "DCC";
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
    const { actions, shieldBash } = await this.#actions(actor, { pc, kind, level, dice, luckMod, line, deeds: !!deeds });
    const resources = {};
    const boosts = [];
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
      initiative: { mod: flatOf(sys.attributes?.init?.value) },
      speeds,
      actions,
      actionDice: dice,
      shieldBash,
      deeds,
      fumble,
      iwr: { immune, resist: {}, weak: {} },
      resources,
      boosts: boosts.length ? boosts : null,
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
          persuade: { dc: 10 + defenses.wil, label: "Will" },
          intimidate: { dc: 10 + defenses.wil, label: "Will" },
          deceive: { dc: 10 + Math.max(defenses.wil, Number(sys.abilities?.int?.mod) || 0), label: "Will" },
          steal: { dc: 10 + Math.max(defenses.ref, Number(sys.abilities?.int?.mod) || 0), label: "Reflex" }
        },
        resolve: defenses.wil - (Math.floor(level / 2) + 1),
        languages: String(sys.details?.languages ?? "").split(/[,;/]/).map(s => s.trim().toLowerCase()).filter(Boolean),
        mindless: !!derived.flags.mindless
      },
      theft: kind.thief ? { skill: game.i18n.localize("FFDCC.PickPockets"), mod: flatOf(sys.skills?.pickPockets?.value) + (Number(sys.abilities?.agl?.mod) || 0) } : null,
      doorWork: {
        force: { mod: Number(sys.abilities?.str?.mod) || 0 },
        pick: kind.thief ? { mod: flatOf(sys.skills?.pickLock?.value) + (Number(sys.abilities?.agl?.mod) || 0) } : null
      },
      valuables: this.#valuables(actor),
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
      if ( kind.dwarf && /shield.?bash/i.test(`${w.name} ${w.img ?? ""}`) ) {
        action.economy = "bonus";
        shieldBash = true;
      }
      actions.push(action);
    }
    // Fighting with both: an attack with each hand, together.
    if ( hands.primary && hands.offHand ) {
      const { primary, offHand } = hands;
      actions.push({ ...primary, id: `${actor.id}.two-weapons`, name: `${primary.name} & ${offHand.name}`, itemId: undefined,
        sequence: [primary, offHand].map(a => ({ ...a, id: `${a.id}.two-weapons` })) });
    }
    // A monster with no weapons on its sheet: its stat line's attacks.
    if ( !pc && !actions.length ) {
      for ( const [i, a] of line.attacks.entries() ) {
        if ( !a.damage ) continue;
        actions.push({
          id: `${actor.id}.atk${i}`, name: a.name, kind: "strike", cost: 1, bonus: a.bonus, melee: a.melee, reach: a.melee ? 5 : undefined,
          range: a.melee ? null : { increment: 60 }, damage: [parseFormula(a.damage, weaponType(a.name))],
          critOn: critOnFor(line.critNatural, firstDie) ?? undefined, crit: await this.#crit(sys, null, 0),
          effects: this.#riders(a.rider)
        });
      }
    }
    actions.push(...await this.#spells(actor, { pc, kind, level, dice, line }));
    if ( pc && kind.cleric ) actions.push(...await this.#clericSkills(actor, dice));
    return { actions, shieldBash };
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
    const damage = parseTypedFormula(formula, weaponType(w.name)).map(p => ({ ...p, type: ["untyped", "subdual"].includes(p.type) ? weaponType(w.name) : p.type }));
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
      crit: await this.#crit(actor.system, w, pc ? luckMod : 0)
    };
    // A thief striking a foe who can't defend itself: the backstab (its bonus, and a far worse wound).
    if ( pc && kind.thief && s.melee ) {
      const extra = s.backstabDamage ? parseFormula(String(s.backstabDamage), weaponType(w.name)) : null;
      const bonus = flatOf(actor.system.class?.backstab);
      const parts = [];
      if ( extra && (extra.dice.length || extra.flat) ) parts.push(extra);
      if ( bonus > 0 ) parts.push(part([], Math.round(bonus / 2), weaponType(w.name))); // its to-hit bonus, as the hits it makes
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

  /** What it could be talked (or robbed) out of: coins, and what it carries. */
  #valuables(actor) {
    const c = actor.system.currency ?? {};
    const money = Object.entries(COPPER).reduce((s, [k, v]) => s + (Number(c[k]) || 0) * v, 0);
    const worth = i => Object.entries(COPPER).reduce((s, [k, v]) => s + (Number(i.system?.value?.[k]) || 0) * v, 0);
    const things = actor.items.filter(i => ["weapon", "armor", "equipment", "treasure", "ammunition"].includes(i.type)).map(i => ({ id: i.id, name: i.name, value: worth(i), equipped: i.system.equipped !== false && ["weapon", "armor"].includes(i.type) }));
    return {
      money,
      denominations: [{ label: "gp", value: 100 }, { label: "sp", value: 10 }, { label: "cp", value: 1 }],
      stowed: things.filter(t => !t.equipped && t.value > 0).map(({ equipped, ...t }) => t),
      wielded: things.filter(t => t.equipped && t.value > 0).map(({ equipped, ...t }) => t)
    };
  }

  #leadershipEntry(actor, id, level, kind) {
    return { id, name: actor.name, level, personality: Number(actor.system.abilities?.per?.mod) || 0, cleric: !!kind?.cleric };
  }

  deriveTraits(actor, { line = null, casts = false, level = null } = {}) {
    const sys = actor.system;
    const read = line ?? statLine(sys.details?.notes?.value ?? "");
    const hd = hitDice(sys.attributes?.hitDice?.value);
    const pc = actor.type === "Player";
    const intScore = Number(sys.abilities?.int?.value);
    return deriveDccTraits({
      pc,
      level: level ?? (pc ? Number(sys.details?.level?.value) || 0 : hd.level),
      alignment: sys.details?.alignment,
      will: flatOf(sys.saves?.wil?.value),
      int: pc ? undefined : intScore,
      name: actor.name,
      notes: plain(sys.details?.notes?.value ?? ""),
      undead: !!read.undead,
      casts
    });
  }

  detectLeaders(specs) {
    return rankDccLeaders(specs.map(s => s.leadership).filter(Boolean));
  }

  /** DCC has no encounter budget to compare with. */
  difficultyCrossCheck() {
    return null;
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
