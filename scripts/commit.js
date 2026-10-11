/**
 * DCC "Make it So": write one simulated outcome onto a token's actor, returning an undo record.
 *
 * Undo record shape (consumed by the core's make-it-so.js):
 *   { tokenUuid, actorUuid, actorUpdate, itemUpdates: [{id, update}], createdItems: [id], deletedItems: [data],
 *     createdEffects: [id], tokenUpdate, createdActors, createdTokens, deletedTokens, statuses: [{id, active}], combatant }
 */
import { MODULE_ID, STATUS } from "./core.js";

/** Engine conditions -> the dcc system's statuses, for whatever's still on a creature when it's over. */
const LINGERING = { stunned: "stun", paralyzed: "paralysis", asleep: "sleep", unconscious: "unconscious", blinded: "blind", frightened: "fear", held: "restrain", slowed: "slowed" };
const ABILITY_NAMES = { str: "Strength", agl: "Agility", sta: "Stamina" };

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
 * Whose side the token is on after the fight, when words (or a quarrel) changed it: won over (switched sides), talked
 * out of the fight (it takes no side now), or a neutral that turned on the party. Null when nothing changed.
 * @returns {"friendly"|"hostile"|"neutral"|null}
 */
export function sideChange(final) {
  if ( final.swayed === "switched" ) return final.side === "friendly" ? "friendly" : "hostile";
  if ( final.side !== "neutralParty" || final.status === STATUS.DEAD ) return null;
  if ( final.against?.includes("friendly") ) return "hostile";
  return final.swayed === "neutral" ? "neutral" : null;
}
const SIDE_LINES = { friendly: "Switches sides (now friendly)", hostile: "Turned on the party (now hostile)", neutral: "Stands aside (now neutral)" };
const DISPOSITIONS = { friendly: "FRIENDLY", hostile: "HOSTILE", neutral: "NEUTRAL" };

/** Human-readable list of what will change, for the confirmation dialog. */
export function describeDccOutcome(spec, final) {
  const lines = [];
  const s = final.system ?? {};
  if ( final.hp !== spec.hp.value ) lines.push(`HP ${spec.hp.value} → ${final.hp}`);
  if ( final.status === STATUS.DEAD ) lines.push(spec.kind === "pc" ? "DIES" : "Dead");
  else if ( final.status === STATUS.FLED ) lines.push(spec.kind === "pc" ? "Retreated from the battle" : final.swayed ? "Talked into fleeing (token hidden)" : "Fled the battle (token hidden)");
  else if ( final.status === STATUS.SURRENDERED ) lines.push("Surrenders");
  else if ( final.status === STATUS.STOOD_DOWN ) lines.push("Stands down (talked out of fighting)");
  else if ( final.status === STATUS.DOWN ) lines.push(final.stable ? "Unconscious" : `Bleeding out (${s.bleed ?? 0} round${s.bleed === 1 ? "" : "s"} left)`);
  const changed = sideChange(final);
  if ( changed ) lines.push(final.swayed === "switched" ? `Switches sides (now ${changed})` : SIDE_LINES[changed]);
  const alive = final.status !== STATUS.DEAD;
  if ( s.bledOut && alive ) lines.push("Saved from bleeding out: -1 Stamina for good, and a scar");
  if ( s.body ) lines.push(`Rolled the body: alive at 1 HP, groggy, -1 ${ABILITY_NAMES[s.body] ?? s.body} for good`);
  const luck = spent(spec, final, "luck");
  if ( luck ) lines.push(`Burns ${luck} Luck`);
  const burn = spent(spec, final, "spellburn");
  if ( burn ) lines.push(`Spellburns ${burn} (Strength, Stamina, Agility)`);
  for ( const id of s.lost ?? [] ) {
    const a = spec.actions.find(x => x.id === id);
    if ( a ) lines.push(`Loses ${a.name} for the day`);
  }
  if ( s.disapproval ) lines.push(`Disapproval range ${s.disapproval}`);
  for ( const k of Object.keys(final.conditions ?? {}) ) if ( LINGERING[k] && final.status !== STATUS.DEAD ) lines.push(k);
  return lines;
}

async function setStatus(actor, id, active, undo, { overlay = false } = {}) {
  if ( statusesOf(actor).has(id) === active ) return;
  await actor.toggleStatusEffect(id, { active, overlay });
  undo.statuses.push({ id, active: !active, overlay });
}

/**
 * @param {TokenDocument} tokenDoc
 * @param {object} spec
 * @param {object} final
 * @param {object} options  {lootMode, corpseMode, fledMode}
 */
export async function commitDccOutcome(tokenDoc, spec, final, options = {}) {
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
  const ability = (key, change, { max = false } = {}) => {
    const now = update[`system.abilities.${key}.value`] ?? (Number(sys.abilities?.[key]?.value) || 0);
    set(`system.abilities.${key}.value`, Math.max(0, now + change));
    if ( max ) set(`system.abilities.${key}.max`, Math.max(0, (Number(sys.abilities?.[key]?.max) || now) + change));
  };

  set("system.attributes.hp.value", final.hp);
  if ( (final.temp ?? 0) !== (Number(sys.attributes?.hp?.temp) || 0) ) set("system.attributes.hp.temp", final.temp ?? 0);

  // Luck burned (thieves and halflings get theirs back with rest, but it's spent for now).
  const luck = spent(spec, final, "luck");
  if ( luck ) ability("lck", -luck);
  // Spellburn: from Strength first, then Stamina, then Agility, none below 3.
  let burn = spent(spec, final, "spellburn");
  for ( const key of ["str", "sta", "agl"] ) {
    if ( burn <= 0 ) break;
    const have = Number(sys.abilities?.[key]?.value) || 0;
    const take = Math.min(burn, Math.max(0, have - 3));
    if ( take > 0 ) ability(key, -take);
    burn -= take;
  }
  // Saved from bleeding out: a point of Stamina gone for good. Found alive when the body was rolled: a point of
  // Strength, Agility or Stamina.
  // (Only for the living: whoever died after all has no use for a scar.)
  if ( s.bledOut && final.status !== STATUS.DEAD ) ability("sta", -1, { max: true });
  if ( s.body && final.status !== STATUS.DEAD ) ability(s.body, -1, { max: true });
  if ( Number.isFinite(s.disapproval) && s.disapproval !== sys.class?.disapproval ) set("system.class.disapproval", s.disapproval);

  // Conditions first, HP last (a status change and an HP change at once can overwrite each other on unlinked tokens).
  if ( final.status === STATUS.DOWN ) {
    await setStatus(actor, final.stable ? "unconscious" : "dying", true, undo);
    await setStatus(actor, "prone", true, undo);
  } else if ( final.status === STATUS.STANDING && final.prone ) {
    await setStatus(actor, "prone", true, undo);
  }
  if ( s.body && final.status === STATUS.STANDING ) await setStatus(actor, "groggy", true, undo);
  if ( final.status !== STATUS.DEAD ) {
    for ( const k of Object.keys(final.conditions ?? {}) ) if ( LINGERING[k] ) await setStatus(actor, LINGERING[k], true, undo);
  }

  if ( final.status === STATUS.DEAD ) {
    await setStatus(actor, "dead", true, undo, { overlay: true });
    const combatant = game.combat?.getCombatantsByToken?.(tokenDoc)?.[0];
    if ( combatant && !combatant.defeated ) {
      await combatant.update({ defeated: true });
      undo.combatant = { uuid: combatant.uuid, defeated: false };
    }
  } else if ( final.status === STATUS.FLED && options.fledMode !== "leave" && spec.kind !== "pc" ) {
    undo.tokenUpdate = { hidden: tokenDoc.hidden };
    await tokenDoc.update({ hidden: true });
  } else if ( final.status === STATUS.SURRENDERED ) {
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.localize("FFDCC.Surrendered"),
      img: "icons/svg/cancel.svg",
      description: game.i18n.localize("FFDCC.SurrenderedHint"),
      flags: { [MODULE_ID]: { surrendered: true } }
    }]);
    if ( effect ) undo.createdEffects.push(effect.id);
  }
  const changed = sideChange(final);
  if ( changed ) {
    undo.tokenUpdate = { ...(undo.tokenUpdate ?? {}), disposition: tokenDoc.disposition };
    await tokenDoc.update({ disposition: CONST.TOKEN_DISPOSITIONS[DISPOSITIONS[changed]] });
  }
  // Spells lost to a failed check stay lost for the day.
  for ( const id of s.lost ?? [] ) {
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
