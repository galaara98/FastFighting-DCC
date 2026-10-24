/**
 * Goods for the core's deals (API 26: behavior/deals.js, foundry/loot-drop.js): money and things taken off a sheet and
 * put on another (a creature's, a pile's), DCC's way; what a pile holds; a pile of its own on the ground (DCC has no loot
 * actor: an NPC that is only a pile, as the core's own is); and, for a player's dialog, a character's checks and what it
 * could hand over. Goods are {items: [item data], coins: {pp, ep, gp, sp, cp}} (null coins: none), and on the way in,
 * money (in copper: a team's purse's, on no sheet). Every change leaves undo records.
 */
import { undoRecord, payFrom, MODULE_ID } from "./core.js";
import { t } from "./words.js";

/** What DCC's coins are worth in copper, as the system says (CONFIG.DCC.currencyValue), else as the rules do. */
export const coinValues = () => {
  const said = globalThis.CONFIG?.DCC?.currencyValue;
  return said && Object.keys(said).length ? said : { pp: 10000, ep: 1000, gp: 100, sp: 10, cp: 1 };
};

/** DCC's coins, each with its worth in copper, smallest first (the core's payFrom). */
const coinList = () => Object.entries(coinValues()).sort((a, b) => a[1] - b[1]);

/** A coin's worth in copper: a number, or a formula's mean ("3d100": what a treasure's worth is sometimes written as). */
export function amountOf(value) {
  if ( Number.isFinite(Number(value)) ) return Number(value) || 0;
  let sum = 0;
  for ( const m of String(value ?? "").replace(/\s/g, "").matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gi) ) {
    if ( m[3] ) sum += (m[1] === "-" ? -1 : 1) * (Number(m[2]) || 1) * (Number(m[3]) + 1) / 2;
    else sum += (m[4] === "-" ? -1 : 1) * Number(m[5]);
  }
  return Math.max(0, sum);
}

/** Coins in copper. */
export const copperOf = coins => Math.round(Object.entries(coinValues()).reduce((s, [k, v]) => s + amountOf(coins?.[k]) * v, 0));

/** What one of an item is worth, in copper (its value in each coin). */
export const worthOf = item => copperOf(item?.system?.value);

/** Copper as coins a pocket would hold: gold, silver, copper. */
export function coinsFor(copper) {
  return { gp: Math.floor(copper / 100), sp: Math.floor((copper % 100) / 10), cp: copper % 10 };
}

/** DCC's things that can lie on the ground and change hands. */
export const PHYSICAL = new Set(["weapon", "ammunition", "armor", "container", "equipment", "mount", "treasure"]);

/** What changes hands in a deal: not a mount, and not a container (all in it would go too). */
const DEALT = new Set(["weapon", "ammunition", "armor", "equipment", "treasure"]);

/** How many of it. */
const countOf = item => Math.max(0, Number(item?.system?.quantity ?? 1) || 0);

/**
 * Carried put away: a weapon or armor not equipped, and anything else (DCC marks every item equipped unless it's set
 * aside: only a weapon in hand or armor worn is in use).
 */
export const stowed = item => !["weapon", "armor"].includes(item?.type) || item.system?.equipped === false;

/** Any coins at all. */
const anyCoins = coins => !!coins && Object.keys(coinValues()).some(k => (Number(coins[k]) || 0) > 0);

/** A thing as it lies on the ground or changes hands: loose, set aside, in no container. */
function loose(data, count = null) {
  delete data._id;
  if ( count !== null ) data.system.quantity = count;
  data.system.equipped = false;
  if ( "container" in data.system ) data.system.container = null;
  return data;
}

/** Coins added to a purse. */
const added = (purse, coins) => {
  const out = { ...purse };
  for ( const [k, n] of Object.entries(coins ?? {}) ) out[k] = (Number(out[k]) || 0) + (Number(n) || 0);
  return out;
};

/**
 * Goods off a creature's sheet: the money (in coins, change made), and each thing, as many as asked (the core's
 * concessions: {kind: "money", amount} in copper, {kind: "item", item: {id}, count}). {goods, records}.
 */
export async function takeDccGoods(tokenDoc, goods = []) {
  const actor = tokenDoc?.actor;
  if ( !actor?.system ) return { goods: null, records: [] };
  const records = [];
  let coins = null;
  const items = [];
  const purse = { ...(actor.system.currency ?? {}) };
  const money = goods.filter(g => g?.kind === "money").reduce((s, g) => s + (Number(g.amount) || 0), 0);
  const amount = Math.min(money, copperOf(purse));
  if ( amount > 0 ) {
    const paid = payFrom(purse, amount, coinList());
    if ( paid ) {
      const undo = undoRecord(tokenDoc, actor);
      undo.actorUpdate["system.currency"] = purse;
      await actor.update({ "system.currency": paid });
      records.push(undo);
      coins = coinsFor(amount);
    }
  }
  for ( const g of goods.filter(x => x?.kind === "item") ) {
    const item = actor.items.get(g.item?.id);
    // (Only what it carries put away: nothing held or worn changes hands, but off a fallen foe robbed.)
    if ( !item || !PHYSICAL.has(item.type) || (g.how !== "loot" && !stowed(item)) ) continue;
    const have = Math.max(1, countOf(item) || 1);
    const n = Math.max(1, Math.min(have, Number(g.count) || 1));
    const undo = undoRecord(tokenDoc, actor);
    items.push(loose(item.toObject(), n));
    if ( n < have ) {
      undo.itemUpdates.push({ id: item.id, update: { "system.quantity": have } });
      await item.update({ "system.quantity": have - n });
    } else {
      undo.deletedItems.push(item.toObject());
      await item.delete();
    }
    records.push(undo);
  }
  return { goods: items.length || coins ? { items, coins } : null, records };
}

/** Goods onto a sheet (a creature's, a pile's): each thing a new item, the coins added to its own. Undo records. */
export async function putDccGoods(tokenDoc, goods) {
  const actor = tokenDoc?.actor;
  if ( !actor?.system || !goods ) return [];
  const records = [];
  let coins = goods.coins ?? null;
  // (Money in the smallest coin, a team's purse's: the coins people hand over, added to any given.)
  if ( Number(goods.money) > 0 ) coins = added(coins ?? {}, coinsFor(Math.round(Number(goods.money))));
  if ( goods.items?.length ) {
    const undo = undoRecord(tokenDoc, actor);
    const made = await actor.createEmbeddedDocuments("Item", goods.items.map(d => loose(foundry.utils.deepClone(d))));
    undo.createdItems.push(...made.map(i => i.id));
    records.push(undo);
  }
  if ( anyCoins(coins) ) {
    const purse = { ...(actor.system.currency ?? {}) };
    const undo = undoRecord(tokenDoc, actor);
    undo.actorUpdate["system.currency"] = purse;
    await actor.update({ "system.currency": added(purse, coins) });
    records.push(undo);
  }
  return records;
}

/** Everything a pile holds, as goods: its things and its coins. Null: nothing to hold anything. */
export function dccGoodsOf(tokenDoc) {
  const actor = tokenDoc?.actor;
  if ( !actor?.system ) return null;
  const items = actor.items.filter(i => PHYSICAL.has(i.type)).map(i => loose(i.toObject()));
  const c = actor.system.currency ?? {};
  const coins = Object.fromEntries(Object.keys(coinValues()).map(k => [k, Number(c[k]) || 0]));
  return { items, coins: anyCoins(coins) ? coins : null };
}

/**
 * A pile of DCC's on the ground: an NPC that is only a pile (the system has no loot actor), FastFighting's (so a battle
 * never takes it for a creature and Rewind takes it away), anyone able to look in, its token at x, y, holding the goods,
 * named and looking as the core asks (a chest, a bag). {tokenUuid, records}.
 */
export async function dropDccValuables(scene, { x, y }, goods, { name = "", img = null } = {}) {
  const pile = await Actor.create({
    name: name || t("DroppedGoods"),
    type: "NPC",
    img: img || "icons/containers/bags/sack-leather-brown.webp",
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
    flags: { [MODULE_ID]: { pile: true } }
  });
  const [token] = await scene.createEmbeddedDocuments("Token", [{
    ...(await pile.getTokenDocument({ x, y })).toObject(),
    actorLink: true,
    disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL
  }]);
  await putDccGoods(token, goods);
  return { tokenUuid: token.uuid, records: [{ createdActors: [pile.uuid], createdTokens: [token.uuid] }] };
}

/**
 * What a pile holds, for the core's engine (API 27: a thief's, a scavenger's, a hungry creature's to go for): its money
 * (in copper) and each thing in it, containers and mounts aside, with how many and what each is worth (copper). However
 * it's carried: a pile's things are all there for the taking. {money, items: [{id, name, value, quantity}]}.
 */
export function dccPileContents(tokenDoc) {
  const actor = tokenDoc?.actor;
  if ( !actor?.system ) return null;
  const items = actor.items.filter(i => DEALT.has(i.type) && countOf(i) > 0)
    .map(i => ({ id: i.id, name: i.name, value: worthOf(i), quantity: countOf(i) }));
  return { money: copperOf(actor.system.currency), items };
}

/** An ability's or a skill's modifier on the sheet: its value ("+3", "d5+1": the flat part), and its ability's. */
const flat = v => {
  const text = String(v ?? "").replace(/[+-]?\s*\d*d\d+/gi, "");
  let sum = 0;
  for ( const m of text.matchAll(/([+-]?)\s*(\d+)/g) ) sum += (m[1] === "-" ? -1 : 1) * Number(m[2]);
  return sum;
};

/** The abilities a deal can be made with, and the kind of pitch each makes (the spec's pitches: adapter.js #social). */
const DEAL_ABILITIES = [["per", "persuade"], ["str", "intimidate"]];

/** A sheet skill a deal could be made with: one with something in it, and a name. */
const skillUsable = s => s && typeof s === "object" && String(s.value ?? "").trim() !== "" && !!s.label;

/**
 * Its checks, for a player's deal: Personality (to persuade or deceive) and Strength (to intimidate), then every skill on
 * its sheet with something in it (a thief's, XCC's Bribery expert), as the sheet rolls them. {key, label, mod, talk}.
 */
export function dccSkillsOf(actor) {
  const sys = actor?.system ?? {};
  const out = DEAL_ABILITIES.map(([key, talk]) => ({
    key, talk,
    label: game.i18n.localize(CONFIG.DCC?.abilities?.[key] ?? key),
    mod: Number(sys.abilities?.[key]?.mod) || 0
  }));
  for ( const [key, s] of Object.entries(sys.skills ?? {}) ) {
    if ( !skillUsable(s) ) continue;
    const ability = Number(sys.abilities?.[s.ability]?.mod) || 0;
    out.push({ key, label: game.i18n.localize(s.label), mod: flat(s.value) + ability, talk: key === "briberyExpert" ? "persuade" : null });
  }
  return out;
}

/**
 * What a character could hand over in a deal: its money (in copper), and each thing it carries put away (stowed) that
 * isn't a container or a mount, with how many and what each is worth (copper).
 */
export function dccGiveables(actor) {
  const values = coinValues();
  const denominations = Object.entries(values).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, label: t(`Coin.${key}`), value }));
  if ( !actor?.system ) return { money: 0, denominations, items: [] };
  const items = actor.items.filter(i => DEALT.has(i.type) && countOf(i) > 0 && stowed(i))
    .map(i => ({ id: i.id, name: i.name, img: i.img, quantity: countOf(i), value: worthOf(i) }));
  return { money: copperOf(actor.system.currency), denominations, items };
}
