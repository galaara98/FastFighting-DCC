/**
 * DCC write-back: a live battle's turn written onto a token's actor, and what a creature gives up handed over, each
 * returning undo records; and what a fight changes on a creature, in words, for the core's planner.
 *
 * Undo record shape (consumed by the core's Rewind Turn and Rewind This Encounter):
 *   { tokenUuid, actorUuid, actorUpdate, itemUpdates: [{id, update}], createdItems: [id], deletedItems: [data],
 *     createdEffects: [id], tokenUpdate, createdActors, createdTokens, deletedTokens, statuses: [{id, active}], combatant }
 */
import { MODULE_ID, STATUS, commonOutcome } from "./core.js";
import { t, conditionName } from "./words.js";

/** Engine conditions -> the dcc system's statuses, for the ones a dcc sheet carries. */
const LINGERING = { stunned: "stun", paralyzed: "paralysis", asleep: "sleep", unconscious: "unconscious", blinded: "blind", frightened: "fear", held: "restrain", slowed: "slowed" };
const abilityName = k => ({ str: t("Ability.str"), agl: t("Ability.agl"), sta: t("Ability.sta") }[k] ?? k);

/**
 * The statuses on a dcc actor, read from its effects: the dcc system applies effects its own way and leaves
 * actor.statuses empty.
 */
export function statusesOf(actor) {
  const out = new Set(actor?.statuses ?? []);
  for ( const e of actor?.effects ?? [] ) if ( !e.disabled ) for ( const s of e.statuses ?? [] ) out.add(s);
  return out;
}

const emptyRecord = (tokenDoc, actor) => ({
  tokenUuid: tokenDoc?.uuid ?? null, actorUuid: actor.uuid, actorUpdate: {}, itemUpdates: [], createdItems: [], deletedItems: [], createdEffects: [],
  tokenUpdate: null, createdActors: [], createdTokens: [], deletedTokens: [], statuses: [],
  statusesBefore: [...statusesOf(actor)]
});

/** Luck and spellburn spent, by the numbers. */
function spent(spec, final, key) {
  const start = spec.resources?.[key];
  if ( !Number.isFinite(start) ) return 0;
  return Math.max(0, start - (final.resources?.[key] ?? start));
}

/**
 * Whose side the token is on now, when words (or a quarrel) changed it: won over (switched sides), talked
 * out of the fight (it takes no side now), or a neutral that turned on the party. Null when nothing changed.
 * @returns {"friendly"|"hostile"|"neutral"|null}
 */
export function sideChange(final) {
  if ( final.swayed === "switched" ) return final.side === "friendly" ? "friendly" : "hostile";
  if ( final.side !== "neutralParty" || final.status === STATUS.DEAD ) return null;
  if ( final.against?.includes("friendly") ) return "hostile";
  return final.swayed === "neutral" ? "neutral" : null;
}
const DISPOSITIONS = { friendly: "FRIENDLY", hostile: "HOSTILE", neutral: "NEUTRAL" };

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
  for ( const k of Object.keys(final.conditions ?? {}) ) if ( LINGERING[k] && final.status !== STATUS.DEAD ) lines.push(conditionName(k));
  return lines;
}

async function setStatus(actor, id, active, undo, { overlay = false } = {}) {
  if ( statusesOf(actor).has(id) === active ) return;
  await actor.toggleStatusEffect(id, { active, overlay });
  undo.statuses.push({ id, active: !active, overlay });
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
 * turn changed (options.before); statuses set and lifted; a death, running, surrendering, a change of side.
 * @returns {Promise<object>} an undo record (its shape at the top of this file)
 */
export async function commitDccChanges(tokenDoc, spec, changes, final, options = {}) {
  const actor = tokenDoc.actor;
  const undo = emptyRecord(tokenDoc, actor);
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
    if ( final.stable ) await setStatus(actor, "unconscious", true, undo);
    else if ( !clock ) await setStatus(actor, "dying", true, undo);
    await setStatus(actor, "prone", true, undo);
  } else if ( !dead && changes.stable?.to && final.status === STATUS.DOWN ) {
    // (No longer bleeding: out, and the clock stopped.)
    await setStatus(actor, "dying", false, undo);
    await setStatus(actor, "unconscious", true, undo);
  }
  if ( changes.revived ) {
    // (Healed: the Death Clock lifts its own Dying.)
    if ( !clock ) await setStatus(actor, "dying", false, undo);
    await setStatus(actor, "unconscious", false, undo);
  }
  if ( found ) {
    // (Not dead after all: up again, groggy, and back in the fight's tracker.)
    await setStatus(actor, "dead", false, undo, { overlay: true });
    if ( final.status === STATUS.STANDING ) await setStatus(actor, "groggy", true, undo);
    const combatant = game.combat?.getCombatantsByToken?.(tokenDoc)?.[0];
    if ( combatant?.defeated ) {
      await combatant.update({ defeated: false });
      undo.combatant = { uuid: combatant.uuid, defeated: true };
    }
  }
  if ( changes.prone && !dead && !changes.fell ) await setStatus(actor, "prone", !!changes.prone.to, undo);
  if ( changes.conditions && !dead ) {
    for ( const k of Object.keys(changes.conditions.set) ) if ( LINGERING[k] ) await setStatus(actor, LINGERING[k], true, undo);
    for ( const k of changes.conditions.cleared ) if ( LINGERING[k] ) await setStatus(actor, LINGERING[k], false, undo);
  }
  if ( changes.died ) {
    // (Dead: no longer dying, nor merely out.)
    await setStatus(actor, "dying", false, undo);
    await setStatus(actor, "unconscious", false, undo);
    await setStatus(actor, "dead", true, undo, { overlay: true });
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
  const side = changes.side ? sideChange(final) : null;
  if ( side ) {
    undo.tokenUpdate = { ...(undo.tokenUpdate ?? {}), disposition: tokenDoc.disposition };
    await tokenDoc.update({ disposition: CONST.TOKEN_DISPOSITIONS[DISPOSITIONS[side]] });
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
/*  Giving something up                         */
/* -------------------------------------------- */

const COINS = [["cp", 1], ["sp", 10], ["ep", 50], ["gp", 100], ["pp", 1000]];

/** Pay `amount` copper from a purse: small coins first, breaking a bigger coin (and taking change) when needed. */
export function payFrom(currency, amount) {
  const purse = Object.fromEntries(COINS.map(([k]) => [k, Number(currency?.[k]) || 0]));
  let owed = amount;
  for ( const [k, v] of COINS ) {
    const n = Math.min(purse[k], Math.floor(owed / v));
    purse[k] -= n;
    owed -= n * v;
  }
  if ( owed > 0 ) {
    const coin = COINS.find(([k, v]) => purse[k] > 0 && v >= owed);
    if ( !coin ) return null;
    purse[coin[0]] -= 1;
    let change = coin[1] - owed;
    for ( const [k, v] of [...COINS].reverse() ) {
      if ( v >= coin[1] ) continue;
      const n = Math.floor(change / v);
      purse[k] += n;
      change -= n * v;
    }
  }
  return purse;
}

/** Copper as coins a pocket would hold: gold, silver, copper. */
function coinsFor(copper) {
  return { gp: Math.floor(copper / 100), sp: Math.floor((copper % 100) / 10), cp: copper % 10 };
}

/** Hand over what a creature was talked out of (or had stolen): coins, or one item. Returns undo records. */
export async function commitDccConcession(giverDoc, receiverDoc, concession) {
  const giver = giverDoc?.actor;
  if ( !giver ) return [];
  const receiver = receiverDoc?.actor ?? null;
  const records = [];
  if ( concession.kind === "money" ) {
    const before = { ...giver.system.currency };
    const paid = payFrom(before, concession.amount);
    if ( !paid ) return [];
    const giverUndo = emptyRecord(giverDoc, giver);
    giverUndo.actorUpdate["system.currency"] = before;
    await giver.update({ "system.currency": paid });
    records.push(giverUndo);
    if ( receiver ) {
      const got = { ...receiver.system.currency };
      const add = coinsFor(concession.amount);
      const receiverUndo = emptyRecord(receiverDoc, receiver);
      receiverUndo.actorUpdate["system.currency"] = got;
      await receiver.update({ "system.currency": { ...got, gp: (Number(got.gp) || 0) + add.gp, sp: (Number(got.sp) || 0) + add.sp, cp: (Number(got.cp) || 0) + add.cp } });
      records.push(receiverUndo);
    }
    return records;
  }
  const item = giver.items.get(concession.item?.id);
  if ( !item ) return [];
  const giverUndo = emptyRecord(giverDoc, giver);
  const data = item.toObject();
  delete data._id;
  data.system.quantity = 1;
  data.system.equipped = false;
  if ( "container" in data.system ) data.system.container = null;
  if ( (item.system.quantity ?? 1) > 1 ) {
    giverUndo.itemUpdates.push({ id: item.id, update: { "system.quantity": item.system.quantity } });
    await item.update({ "system.quantity": item.system.quantity - 1 });
  } else {
    giverUndo.deletedItems.push(item.toObject());
    await item.delete();
  }
  records.push(giverUndo);
  if ( receiver ) {
    const receiverUndo = emptyRecord(receiverDoc, receiver);
    const [created] = await receiver.createEmbeddedDocuments("Item", [data]);
    if ( created ) receiverUndo.createdItems.push(created.id);
    records.push(receiverUndo);
  }
  return records;
}
