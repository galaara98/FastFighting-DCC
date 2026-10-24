/**
 * FastFighting's own damage cards (cards.js): the chat menu's Apply Damage and Apply Healing gone from a card it applies
 * (its mark on a GM's card), still there on anyone else's; and a card left to the table after all, its marks off.
 */
import { describe, expect, test } from "vitest";
import { hideApplyMenu, unmarkRolled, rolledHere } from "../scripts/cards.js";

const card = (id, { gm = true, rolled = true } = {}) => {
  const m = { id, author: { isGM: gm }, flags: rolled ? { "fast-fighting-dcc": { rolled: true }, dcc: { damageApplied: true } } : {} };
  m.unsetFlag = async (scope, key) => { delete m.flags[scope]?.[key]; };
  return m;
};

describe("FastFighting's damage cards in the chat menu", () => {
  test("Apply Damage and Apply Healing not on its own card; on a player's, and other entries, as before", () => {
    const cards = { a: card("a"), b: card("b", { gm: false }), c: card("c", { rolled: false }) };
    globalThis.game = { ...globalThis.game, messages: { get: id => cards[id] } };
    const options = [
      { label: "DCC.ChatContextDamage", visible: () => true },
      { label: "DCC.ChatContextHealing", visible: () => true },
      { label: "DCC.ChatContextBurnLuck", visible: () => true }
    ];
    hideApplyMenu(null, options);
    const li = id => ({ dataset: { messageId: id } });
    expect(options.map(o => o.visible(li("a")))).toEqual([false, false, true]);
    expect(options.map(o => o.visible(li("b")))).toEqual([true, true, true]);
    expect(options.map(o => o.visible(li("c")))).toEqual([true, true, true]);
  });

  test("left to the table: both marks off, the system's Apply back", async () => {
    const m = card("a");
    await unmarkRolled(m);
    expect(rolledHere(m)).toBe(false);
    expect(m.flags.dcc.damageApplied).toBeUndefined();
    const player = card("b", { gm: false });
    await unmarkRolled(player);
    expect(player.flags.dcc.damageApplied).toBe(true);
  });
});
