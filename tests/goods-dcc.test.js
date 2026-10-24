/**
 * Goods for the core's deals (goods.js): DCC's coins at what the system says they're worth, a treasure's worth written as
 * dice, money and things off one sheet and onto another (only what's carried put away, as many as asked), what a pile
 * holds, a player's checks and what a character could offer; and the core's settings as DCC has them. The characters
 * here are made up for the tests; the field paths are the dcc system's own.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { amountOf, copperOf, coinValues, coinsFor, takeDccGoods, putDccGoods, dccGoodsOf, dccPileContents, dccSkillsOf, dccGiveables } from "../scripts/goods.js";
import { DccAdapter } from "../scripts/adapter.js";

const item = (id, type, system = {}, name = id) => ({ id, name, type, img: `${id}.webp`, system: { quantity: 1, equipped: true, ...system } });

/** A dcc actor whose items and coins change as Foundry's would: what's done to it is on the actor. */
function sheet({ items = [], currency = {}, system = {} } = {}) {
  const actor = {
    id: "a1", uuid: "Actor.a1", type: "Player", statuses: new Set(), effects: [],
    system: {
      currency: { pp: 0, ep: 0, gp: 0, sp: 0, cp: 0, ...currency },
      abilities: { per: { mod: 2 }, str: { mod: 1 }, int: { mod: 1 } },
      skills: {},
      ...system
    },
    async update(change) {
      if ( change["system.currency"] ) actor.system.currency = { ...change["system.currency"] };
    },
    async createEmbeddedDocuments(_type, data) {
      const made = data.map((d, n) => live({ ...d, id: `new${actor.items.length + n}` }));
      actor.items.push(...made);
      return made;
    }
  };
  const live = d => {
    const i = { ...d, system: { ...d.system } };
    i.toObject = () => structuredClone({ ...i, _id: i.id, toObject: undefined, update: undefined, delete: undefined });
    i.update = async change => { if ( "system.quantity" in change ) i.system.quantity = change["system.quantity"]; };
    i.delete = async () => { actor.items.splice(actor.items.indexOf(i), 1); };
    return i;
  };
  actor.items = Object.assign(items.map(live), { get(id) { return this.find(i => i.id === id); } });
  return actor;
}
const token = actor => ({ uuid: "Scene.s.Token.t1", actor });

beforeEach(() => {
  globalThis.CONFIG = { DCC: { currencyValue: { pp: 10000, ep: 1000, gp: 100, sp: 10, cp: 1 }, abilities: { per: "DCC.AbilityPer", str: "DCC.AbilityStr" } } };
  globalThis.foundry = { utils: { deepClone: structuredClone } };
});

describe("DCC's coins", () => {
  test("worth what the system says: platinum 100 gold, electrum 10", () => {
    expect(copperOf({ pp: 1, ep: 1, gp: 1, sp: 1, cp: 1 })).toBe(10000 + 1000 + 100 + 10 + 1);
    delete globalThis.CONFIG.DCC.currencyValue;
    expect(coinValues()).toEqual({ pp: 10000, ep: 1000, gp: 100, sp: 10, cp: 1 });
  });

  test("a treasure's worth written as dice counts as its mean", () => {
    expect(amountOf("3d100")).toBe(151.5);
    expect(amountOf("2d6+3")).toBe(10);
    expect(amountOf("40")).toBe(40);
    expect(amountOf("")).toBe(0);
    expect(copperOf({ gp: "1d10" })).toBe(550);
  });

  test("copper as a pocket holds it: gold, silver, copper", () => {
    expect(coinsFor(1234)).toEqual({ gp: 12, sp: 3, cp: 4 });
  });
});

describe("goods changing hands", () => {
  test("money comes off in coins, change made; what was handed over is gold, silver, copper", async () => {
    const actor = sheet({ currency: { pp: 1, sp: 2 } });
    const { goods, records } = await takeDccGoods(token(actor), [{ kind: "money", amount: 150 }]);
    expect(goods.coins).toEqual({ gp: 1, sp: 5, cp: 0 });
    expect(copperOf(actor.system.currency)).toBe(10020 - 150);
    expect(records[0].actorUpdate["system.currency"]).toMatchObject({ pp: 1, sp: 2 });
  });

  test("only what's carried put away, as many as asked; never the sword in hand or the armor worn", async () => {
    const actor = sheet({ items: [
      item("arrows", "ammunition", { quantity: 20 }),
      item("sword", "weapon", { equipped: true }),
      item("mail", "armor", { equipped: true, fumbleDie: "1d12" }),
      item("gem", "treasure")
    ] });
    const { goods } = await takeDccGoods(token(actor), [
      { kind: "item", item: { id: "arrows" }, count: 5 },
      { kind: "item", item: { id: "sword" } },
      { kind: "item", item: { id: "mail" } },
      { kind: "item", item: { id: "gem" } }
    ]);
    expect(goods.items.map(i => [i.name, i.system.quantity, i.system.equipped])).toEqual([["arrows", 5, false], ["gem", 1, false]]);
    expect(actor.items.map(i => [i.id, i.system.quantity])).toEqual([["arrows", 15], ["sword", 1], ["mail", 1]]);
  });

  test("a fallen foe robbed gives up what it holds too", async () => {
    const actor = sheet({ items: [item("sword", "weapon", { equipped: true })] });
    const { goods } = await takeDccGoods(token(actor), [{ kind: "item", item: { id: "sword" }, how: "loot" }]);
    expect(goods.items).toHaveLength(1);
  });

  test("onto another sheet: things as new items, coins and a purse's money added to its own", async () => {
    const actor = sheet({ currency: { gp: 2 } });
    const records = await putDccGoods(token(actor), { items: [item("gem", "treasure")], coins: { gp: 1 }, money: 25 });
    expect(actor.items.map(i => i.name)).toEqual(["gem"]);
    expect(actor.system.currency).toMatchObject({ gp: 3, sp: 2, cp: 5 });
    expect(records.flatMap(r => r.createdItems)).toEqual(["new0"]);
  });

  test("a pile: all it holds, and what each is worth", () => {
    const actor = sheet({ currency: { gp: 1 }, items: [item("arrows", "ammunition", { quantity: 20, value: { cp: "1" } }), item("sack", "container")] });
    expect(dccPileContents(token(actor))).toEqual({ money: 100, items: [{ id: "arrows", name: "arrows", value: 1, quantity: 20 }] });
    expect(dccGoodsOf(token(actor)).items.map(i => i.name)).toEqual(["arrows", "sack"]);
  });
});

describe("a player's deal", () => {
  test("Personality and Strength, then each skill on the sheet; Bribery expert is a way to persuade", () => {
    const actor = sheet({ system: { skills: {
      briberyExpert: { label: "DCC.system.skills.briberyExpert.value", ability: "int", value: "+3" },
      pickPockets: { label: "DCC.PickPockets", ability: "agl", value: "" }
    } } });
    expect(dccSkillsOf(actor).map(s => [s.key, s.mod, s.talk])).toEqual([["per", 2, "persuade"], ["str", 1, "intimidate"], ["briberyExpert", 4, "persuade"]]);
  });

  test("what it could offer: its money, and what it carries put away", () => {
    const actor = sheet({ currency: { ep: 1 }, items: [item("gem", "treasure", { value: { gp: "5" } }), item("sword", "weapon", { equipped: true }), item("pony", "mount")] });
    const g = dccGiveables(actor);
    expect(g.money).toBe(1000);
    expect(g.denominations.map(d => d.key)).toEqual(["pp", "ep", "gp", "sp", "cp"]);
    expect(g.items).toEqual([{ id: "gem", name: "gem", img: "gem.webp", quantity: 1, value: 500 }]);
  });
});

describe("the core's settings as DCC has them", () => {
  test("short, deadly fights; the Lore-Collector's advantage in DCC's words; gold as the main coin", () => {
    const a = new DccAdapter();
    expect(a.settingDefaults()).toEqual({
      maxRounds: { min: 4, max: 12, default: 10 },
      loreBoost: { default: 2.25, name: "FFDCC.Settings.loreBoost.Name", hint: "FFDCC.Settings.loreBoost.Hint" }
    });
    expect(a.mainCoin()).toMatchObject({ key: "gp", value: 100 });
    expect(a.supportsLoot).toBe(true);
  });
});
