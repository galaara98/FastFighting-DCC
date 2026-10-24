/**
 * FastFighting DCC: teaches FastFighting Core how Dungeon Crawl Classics (and Xcrawl Classics, which rides on the
 * same system) works. Registers the dcc adapter (actor data, rules, personality defaults, leadership, live battles)
 * through the core's public API.
 */
import { DccAdapter } from "./adapter.js";
import { moveLoreBoost } from "./lore-move.js";
import { hideApplyMenu } from "./cards.js";
import { registerTiedStopsSpells } from "./tied.js";
import { loadReading } from "./reading.js";

export const MODULE_ID = "fast-fighting-dcc";

/**
 * The core API majors this helper is known to work with (the core's api.major). Its own call: the core never refuses a
 * helper. Older than the oldest, it doesn't run (it uses what came since); any other it doesn't know, it runs, and the
 * GM is told it hasn't been tried with that core yet. Add a major once this helper has been tried with it.
 */
const KNOWN_API = Object.freeze([24, 25, 26, 27, 28, 29, 30]);

/** The core's API major, when it's one this helper doesn't know: the GM is told when the world is ready. */
let untested = null;

/**
 * The last translation module we knew of for this game system, by language: in a language other than English, this
 * module's settings recommend it when it isn't on (FastFighting Core's api.adviseTranslation). None known yet.
 */
const KNOWN_TRANSLATIONS = {};

// The damage cards FastFighting applies itself: no Apply Damage on them in the chat menu, which would apply them again (cards.js).
Hooks.on("getChatMessageContextOptions", hideApplyMenu);

Hooks.once("init", () => {
  // Whether a creature tied up can still cast (tied.js).
  registerTiedStopsSpells();
  // The words the books' stat lines and tables are read by (reading.js).
  loadReading();
});

Hooks.once("fastFighting.init", api => {
  // module.json limits this module to dcc worlds; this guard covers anything that slips past.
  if ( game.system.id !== "dcc" ) {
    console.warn(`${MODULE_ID} | not a Dungeon Crawl Classics world (${game.system.id}); FastFighting DCC stays inactive.`);
    return;
  }
  const major = Number(api.major) || 0;
  if ( major < Math.min(...KNOWN_API) ) {
    console.error(`${MODULE_ID} | FastFighting Core is too old for this version of FastFighting DCC; update it.`);
    ui.notifications?.error(game.i18n.localize("FFDCC.CoreTooOld"), { permanent: true });
    return;
  }
  if ( !KNOWN_API.includes(major) ) untested = major;
  api.registerAdapter("dcc", DccAdapter, { priority: 10, source: MODULE_ID });
  api.adviseTranslation(MODULE_ID, game.system.title, KNOWN_TRANSLATIONS);
  // Words kept in English for now, while the system isn't translated (hardcoded-toEN.json).
  api.keepEnglish(MODULE_ID);
});

Hooks.once("ready", () => {
  if ( untested !== null && game.user.isGM ) ui.notifications.warn(game.i18n.format("FFDCC.CoreUntested", { major: untested }));
  moveLoreBoost();
  if ( !game.modules.get("fast-fighting")?.active && game.user.isGM ) {
    ui.notifications.warn(game.i18n.localize("FFDCC.NeedsCore"));
  }
});
