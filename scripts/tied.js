/**
 * Tied up, and spells: a world setting. DCC doesn't say which spells need free hands, so this says it for all of them:
 * on (the default), a creature tied up can't cast; off, it can, and may cast rather than struggle against its bonds.
 * The core reads it as rules.tiedStopsSpells (rules.js).
 */

const MODULE_ID = "fast-fighting-dcc";

/** Register the setting (on init). */
export function registerTiedStopsSpells() {
  game.settings.register(MODULE_ID, "tiedStopsSpells", {
    name: "FFDCC.Settings.tiedStopsSpells.Name",
    hint: "FFDCC.Settings.tiedStopsSpells.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}

/** The world's setting (on if there's none to read). */
export function tiedStopsSpells() {
  try {
    return game.settings.get(MODULE_ID, "tiedStopsSpells") !== false;
  } catch ( err ) {
    return true;
  }
}
