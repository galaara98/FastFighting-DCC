/**
 * DCC write-back: a live battle's turn written onto a token's actor, and a player's damage card applied, each returning
 * undo records (what a creature gives up is goods.js's); and what a fight changes on a creature, in words, for
 * the core's planner.
 *
 * Undo record shape (consumed by the core's Rewind Turn and Rewind This Encounter):
 *   { tokenUuid, actorUuid, actorUpdate, itemUpdates: [{id, update}], createdItems: [id], deletedItems: [data],
 *     createdEffects: [id], tokenUpdate, createdActors, createdTokens, deletedTokens, statuses: [{id, active}], combatant,
 *     statusesBefore: [id] }
 */
import { MODULE_ID, STATUS, commonOutcome, statusesOf, statusEntry, toggleStatus, undoRecord } from "./core.js";
import { t, conditionName } from "./words.js";
import { damageOf } from "./read-turn.js";
import { SHEET_STATUSES, leftBehind } from "./statuses.js";

export { leftBehind };

const abilityName = k => ({ str: t("Ability.str"), agl: t("Ability.agl"), sta: t("Ability.sta") }[k] ?? k);

/* -------------------------------------------- */
/*  Statuses and conditions                     */
/* -------------------------------------------- */

/**
 * The status an engine condition is written as, where the token palette has one (the dcc system's, or XCC's in its
 * place: the core's statusEntry); null for a condition the sheet can't carry (the core keeps it).
 */
export function statusFor(key) {
  const entry = SHEET_STATUSES.find(s => s.key === key);
  return entry && statusEntry(entry.id) ? entry.id : null;
}

/** Every engine condition a dcc sheet carries here: written as its status and read back as the same. */
export function sheetConditions() {
  return SHEET_STATUSES.filter(s => s.key && statusEntry(s.id)).map(s => s.key);
}

/** The engine's conditions a dcc actor's statuses say, each with what it brings (SHEET_STATUSES). */
export function conditionsOf(actor) {
  const on = statusesOf(actor);
  const out = {};
  for ( const s of SHEET_STATUSES ) {
    if ( !on.has(s.id) ) continue;
    for ( const k of [s.key, ...(s.also ?? [])] ) if ( k ) out[k] = 1;
  }
  return out;
}

/** The system's name for the status a condition is written as, in the table's language; null for none. */
export function statusName(key) {
  const id = statusFor(key);
  const name = id ? statusEntry(id)?.name ?? statusEntry(id)?.label : null;
  return name ? game.i18n.localize(name) : null;
}

/** Luck and spellburn spent, by the numbers. */
function spent(spec, final, key) {
  const start = spec.resources?.[key];
  if ( !Number.isFinite(start) ) return 0;
  return Math.max(0, start - (final.resources?.[key] ?? start));
}

/** Human-readable list of what a fight changes on a creature, for the planner's summary. */
export function describeDccOutcome(spec, final) {
  // (Hit points, its fate and a change of side: the core's words.)
  const lines = commonOutcome(spec, final);
  const s = final.system ?? {};
  if ( final.status === STATUS.DOWN ) lines.push(final.stable ? t("Out.Unconscious") : (s.bleed === 1 ? t("Out.BleedOne") : t("Out.Bleed", { n: s.bleed ?? 0 })));
  const alive = final.status !== STATUS.DEAD;
  if ( s.bledOut && alive ) lines.push(t("Out.Saved"));
  if ( s.body ) lines.push(t("Out.Body", { ability: abilityName(s.body) }));
  const luck = spent(spec, final, "luck");
  if ( luck ) lines.push(t("Out.Luck", { n: luck }));
  // Fleeting Luck (Mojo), as the fight left it.
  if ( spec.fleeting && Number.isFinite(s.fleeting) && s.fleeting !== spec.fleeting.points ) {
    lines.push(t("Out.Fleeting", { label: (spec.boosts ?? []).find(b => b.pool === "fleeting")?.label ?? "", from: spec.fleeting.points, to: s.fleeting }));
  }
  const burn = spent(spec, final, "spellburn");
  if ( burn ) lines.push(t("Out.Spellburn", { n: burn }));
  for ( const id of s.lost ?? [] ) {
    const a = spec.actions.find(x => x.id === id);
    if ( a ) lines.push(t("Out.Lost", { name: a.name }));
  }
  if ( s.disapproval ) lines.push(t("Out.Disapproval", { n: s.disapproval }));
  // (The statuses it keeps on its sheet.)
  for ( const k of Object.keys(final.conditions ?? {}) ) if ( statusFor(k) && final.status !== STATUS.DEAD ) lines.push(conditionName(k, statusName(k)));
  return lines;
}

/** Whether the dcc system's own Death Clock counts a dying character's rounds (its Enhanced Combat setting). */
export function deathClockOn() {
  try {
    return !!game.settings.get("dcc", "enableDeathClock");
  } catch ( err ) {
    return false;
  }
}

/**
 * A live battle: one turn's changes (the core's engine/changes.js) written onto a token. Hit points; Luck and
 * spellburn spent this turn; bleeding out and being saved from it (where the dcc system's Death Clock is on, it marks
 * the dying, counts their rounds and scars the saved itself); disapproval, Fleeting Luck and spells lost, by what this
 * turn changed (options.before); statuses set and lifted (the core's toggleStatus: nothing for a condition the sheet
 * can't carry); a death, running, surrendering. (A change of side: the core sets the token's disposition itself.)
 * @returns {Promise<object>} an undo record (its shape at the top of this file)
 */
export async function commitDccChanges(tokenDoc, spec, changes, final, options = {}) {
  const actor = tokenDoc.actor;
  const undo = undoRecord(tokenDoc, actor);
  const update = {};
  const set = (path, value) => {
    const before = foundry.utils.getProperty(actor, path);
    if ( before === value ) return;
    update[path] = value;
    undo.actorUpdate[path] = before ?? 0;
  };
  const sys = actor.system;
  const s = final.system ?? {};
  const was = options.before?.system ?? {};
  const ability = (key, change, { max = false } = {}) => {
    const now = update[`system.abilities.${key}.value`] ?? (Number(sys.abilities?.[key]?.value) || 0);
    set(`system.abilities.${key}.value`, Math.max(0, now + change));
    if ( max ) set(`system.abilities.${key}.max`, Math.max(0, (Number(sys.abilities?.[key]?.max) || now) + change));
  };
  const clock = actor.type === "Player" && deathClockOn();
  const dead = final.status === STATUS.DEAD;

  if ( changes.hp ) set("system.attributes.hp.value", changes.hp.to);
  if ( changes.temp ) set("system.attributes.hp.temp", changes.temp.to ?? 0);
  const spentOf = c => Math.max(0, (Number(c?.from) || 0) - (Number(c?.to) || 0));
  const luck = spentOf(changes.resources?.luck);
  if ( luck ) ability("lck", -luck);
  // Spellburn: from Strength first, then Stamina, then Agility, none below 3.
  let burn = spentOf(changes.resources?.spellburn);
  for ( const key of ["str", "sta", "agl"] ) {
    if ( burn <= 0 ) break;
    const have = update[`system.abilities.${key}.value`] ?? (Number(sys.abilities?.[key]?.value) || 0);
    const take = Math.min(burn, Math.max(0, have - 3));
    if ( take > 0 ) ability(key, -take);
    burn -= take;
  }
  // Saved from bleeding out this turn: a point of Stamina gone for good.
  if ( changes.revived && s.bledOut && !clock && !dead ) ability("sta", -1, { max: true });
  // Found alive when the body was rolled (after the fight): a point of Strength, Agility or Stamina gone for good.
  const found = !!s.body && !was.body && !dead;
  if ( found ) ability(s.body, -1, { max: true });
  // Disapproval as this turn moved it.
  if ( Number.isFinite(s.disapproval) && Number.isFinite(was.disapproval) && s.disapproval !== was.disapproval ) {
    set("system.class.disapproval", Math.max(1, (Number(sys.class?.disapproval) || 1) + s.disapproval - was.disapproval));
  }
  if ( s.tooCuteUsed && !was.tooCuteUsed ) set("system.class.tooCuteUsed", true);
  // Fleeting Luck (Mojo) as this turn moved it: XCC's on the crawler, DCC's on its player.
  const luckMoved = Number.isFinite(s.fleeting) && Number.isFinite(was.fleeting) ? s.fleeting - was.fleeting : 0;
  if ( spec.fleeting && luckMoved ) {
    if ( spec.fleeting.kind === "actor" ) set("flags.xcc.mojo", Math.max(0, (Number(foundry.utils.getProperty(actor, "flags.xcc.mojo")) || 0) + luckMoved));
    else {
      const player = game.users.get(spec.fleeting.id);
      const before = Number(player?.getFlag("dcc", "fleetingLuckValue")) || 0;
      if ( player ) {
        undo.userId = player.id;
        undo.userUpdate = { "flags.dcc.fleetingLuckValue": before };
        await player.setFlag("dcc", "fleetingLuckValue", Math.max(0, before + luckMoved));
      }
    }
  }

  // Statuses first, HP last (a status change and an HP change at once can overwrite each other on unlinked tokens).
  if ( !dead && (changes.fell || changes.status?.to === STATUS.DOWN) ) {
    // (Bleeding out: the Death Clock starts itself when the hit points reach 0.)
    if ( final.stable ) await toggleStatus(actor, "unconscious", true, undo);
    else if ( !clock ) await toggleStatus(actor, "dying", true, undo);
    await toggleStatus(actor, "prone", true, undo);
  } else if ( !dead && changes.stable?.to && final.status === STATUS.DOWN ) {
    // (No longer bleeding: out, and the clock stopped.)
    await toggleStatus(actor, "dying", false, undo);
    await toggleStatus(actor, "unconscious", true, undo);
  }
  if ( changes.revived ) {
    // (Healed: the Death Clock lifts its own Dying.)
    if ( !clock ) await toggleStatus(actor, "dying", false, undo);
    await toggleStatus(actor, "unconscious", false, undo);
  }
  if ( found ) {
    // (Not dead after all: up again, groggy, and back in the fight's tracker.)
    await toggleStatus(actor, "dead", false, undo, { overlay: true });
    if ( final.status === STATUS.STANDING ) await toggleStatus(actor, "groggy", true, undo);
    const combatant = game.combat?.getCombatantsByToken?.(tokenDoc)?.[0];
    if ( combatant?.defeated ) {
      await combatant.update({ defeated: false });
      undo.combatant = { uuid: combatant.uuid, defeated: true };
    }
  }
  if ( changes.prone && !dead && !changes.fell ) await toggleStatus(actor, "prone", !!changes.prone.to, undo);
  if ( changes.conditions && !dead ) {
    // Each condition set or cleared, as its status (statusFor): on or off. Not prone (changes.prone, above), nor
    // unconscious when this turn's fall, steadying or revival has already said (above).
    const said = k => k === "prone" || (k === "unconscious" && !!(changes.fell || changes.revived || changes.stable?.to));
    for ( const k of Object.keys(changes.conditions.set ?? {}) ) if ( !said(k) ) await toggleStatus(actor, statusFor(k), true, undo);
    for ( const k of changes.conditions.cleared ?? [] ) if ( !said(k) ) await toggleStatus(actor, statusFor(k), false, undo);
  }
  if ( changes.died ) {
    // (Dead: no longer dying, nor merely out.)
    await toggleStatus(actor, "dying", false, undo);
    await toggleStatus(actor, "unconscious", false, undo);
    await toggleStatus(actor, "dead", true, undo, { overlay: true });
    const combatant = game.combat?.getCombatantsByToken?.(tokenDoc)?.[0];
    if ( combatant && !combatant.defeated ) {
      await combatant.update({ defeated: true });
      undo.combatant = { uuid: combatant.uuid, defeated: false };
    }
  } else if ( changes.status?.to === STATUS.FLED && options.fledMode !== "leave" && spec.kind !== "pc" ) {
    undo.tokenUpdate = { hidden: tokenDoc.hidden };
    await tokenDoc.update({ hidden: true });
  } else if ( changes.status?.to === STATUS.SURRENDERED ) {
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.localize("FFDCC.Surrendered"),
      img: "icons/svg/cancel.svg",
      description: game.i18n.localize("FFDCC.SurrenderedHint"),
      flags: { [MODULE_ID]: { surrendered: true } }
    }]);
    if ( effect ) undo.createdEffects.push(effect.id);
  }
  // Spells lost to a failed check this turn stay lost for the day.
  for ( const id of (s.lost ?? []).filter(id => !(was.lost ?? []).includes(id)) ) {
    const item = actor.items.get(spec.actions.find(a => a.id === id)?.itemId);
    if ( !item || item.system.lost ) continue;
    undo.itemUpdates.push({ id: item.id, update: { "system.lost": false } });
    await item.update({ "system.lost": true });
  }
  if ( Object.keys(update).length ) await actor.update(update);
  return undo;
}

/* -------------------------------------------- */
/*  Players' damage                             */
/* -------------------------------------------- */

/** The DCC Quality of Life module: while it's active, the dcc system's own combat automation stands down. */
const QOL = "dcc-qol";

/**
 * The dcc system's own setting that applies a hit's damage to its target (players' hits too, through the GM), by its
 * name, while it's on; else null. Inert while dcc-qol is active, and dcc-qol's own setting isn't known here: null.
 */
export function systemAppliesDamage() {
  if ( game.modules?.get?.(QOL)?.active ) return null;
  try {
    return game.settings.get("dcc", "autoApplyDamage") ? game.i18n.localize("DCC.SettingAutoApplyDamage") : null;
  } catch ( err ) {
    return null;
  }
}

/**
 * A card's damage (read-turn.js damageOf) applied to a token the dcc system's way: its actor's applyDamage (healing as
 * the system's Apply Healing does it, times -1), times `multiplier`, rounded down, damage at least 1. Returns undo
 * records: the hit points as they were, and the combatant's defeated (the system's auto-applied dead status marks it);
 * a status the system adds along the way (dead, dying) comes off by the record's statusesBefore. `amount`: the
 * engine's own sum for this target, where the core gives it (a turn FastFighting plays: after its stat line's
 * immunities, half and double damage, and its share of a save's), dealt as it is instead, nothing at 0.
 * @returns {Promise<object[]>}
 */
export async function applyDccDamage(message, tokenDoc, { multiplier = 1, amount: reckoned = null } = {}) {
  const dealt = damageOf(message);
  const actor = tokenDoc?.actor;
  if ( !dealt || typeof actor?.applyDamage !== "function" || !(multiplier > 0) ) return [];
  const healing = dealt.kind === "healing";
  const scaled = Math.floor(dealt.amount * multiplier);
  const amount = Number.isFinite(reckoned) && !healing ? Math.floor(reckoned) : healing ? scaled : Math.max(1, scaled);
  if ( !(amount > 0) ) return [];
  const undo = undoRecord(tokenDoc, actor);
  undo.actorUpdate["system.attributes.hp.value"] = Number(actor.system?.attributes?.hp?.value) || 0;
  const combatant = game.combat?.getCombatantsByToken?.(tokenDoc)?.[0];
  if ( combatant ) undo.combatant = { uuid: combatant.uuid, defeated: !!combatant.defeated };
  await actor.applyDamage(amount, healing ? -1 : 1);
  return [undo];
}
