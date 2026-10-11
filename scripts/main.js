/**
 * FastFighting DCC: teaches FastFighting Core how Dungeon Crawl Classics (and Xcrawl Classics, which rides on the
 * same system) works. Registers the dcc adapter (actor data, rules, personality defaults, leadership, Make it So)
 * through the core's public API.
 */
import { DccAdapter } from "./adapter.js";
import { registerLoreBoost } from "./lore.js";

export const MODULE_ID = "fast-fighting-dcc";

/** The core API this helper is written against (older cores have no api.version: that is 1). */
const NEEDS_API = 8;

Hooks.once("init", () => {
  // How much a Lore-Collector's sizing a foe up pays off (lore.js).
  registerLoreBoost();
});

Hooks.once("fastFighting.init", api => {
  // module.json limits this module to dcc worlds; this guard covers anything that slips past.
  if ( game.system.id !== "dcc" ) {
    console.warn(`${MODULE_ID} | not a Dungeon Crawl Classics world (${game.system.id}); FastFighting DCC stays inactive.`);
    return;
  }
  if ( (api.version ?? 1) < NEEDS_API ) {
    console.error(`${MODULE_ID} | FastFighting Core is too old for this version of FastFighting DCC; update it.`);
    ui.notifications?.error(game.i18n.localize("FFDCC.CoreTooOld"), { permanent: true });
    return;
  }
  api.registerAdapter("dcc", DccAdapter, { priority: 10, source: MODULE_ID });
});

Hooks.once("ready", () => {
  if ( !game.modules.get("fast-fighting")?.active && game.user.isGM ) {
    ui.notifications.warn(game.i18n.localize("FFDCC.NeedsCore"));
  }
});
