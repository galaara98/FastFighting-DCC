/**
 * What DCC says about a character, for the one time FastFighting sets it up by itself (the core's
 * foundry/auto-config.js): the playstyles that fit it and its own answers to the tactics questions, from its class (the
 * class sheet's id: DCC's and XCC's), its alignment, and a monster's stat line (un-dead, demons and devils); and the
 * sheet's HTML as plain text, for its biography's keywords (the adapter's biography). Pure.
 */

/** What each class leans toward, by the class sheet's id. */
const CLASSES = Object.freeze({
  warrior: { brawler: 0.4, tank: 0.2 },
  dwarf: { tank: 0.4, relentless: 0.2 }, "xcc-dwarf": { tank: 0.4, relentless: 0.2 },
  thief: { thief: 0.5, wallflower: 0.1 },
  halfling: { wallflower: 0.3 },
  elf: { unmundane: 0.4, loreCollector: 0.2 },
  wizard: { unmundane: 0.5, loreCollector: 0.3 },
  cleric: { enabler: 0.4 }, messenger: { enabler: 0.4 },
  "zero-level": { fragile: 0.3, chicken: 0.1 }, "0-level": { fragile: 0.3, chicken: 0.1 }, zero: { fragile: 0.3, chicken: 0.1 },
  // XCC's own.
  brawler: { brawler: 0.7 }, "dungeon-hottie": { peoplePleaser: 0.3 }, jammer: { instigator: 0.4 }, gnome: { tank: 0.5 },
  athlete: { brawler: 0.3, speedRunner: 0.2 }, "sp-acrobat": { speedRunner: 0.3 }
});

/** What an alignment leans toward (l, n, c). */
const ALIGNMENTS = Object.freeze({ l: { moralist: 0.15 }, c: { cruel: 0.15, wildcard: 0.2 } });

/** The playstyles that fit: {id: -1 to 1}. */
export function dccHints({ cls = null, alignment = null, undead = false, unholy = false, mindless = false, beast = false } = {}) {
  const out = {};
  const add = map => { for ( const [k, v] of Object.entries(map ?? {}) ) out[k] = (out[k] ?? 0) + v; };
  // (Each Specialist, sp-scout and the rest, is a thief.)
  add(CLASSES[cls] ?? (String(cls ?? "").startsWith("sp-") ? CLASSES.thief : null));
  add(ALIGNMENTS[alignment]);
  if ( undead ) add({ relentless: 0.4 });
  if ( unholy ) add({ cruel: 0.4 });
  if ( mindless ) add({ relentless: 0.3 });
  if ( beast ) add({ brawler: 0.3 });
  for ( const k of Object.keys(out) ) out[k] = Math.max(-1, Math.min(1, out[k]));
  return out;
}

/** A class's fighting style. */
const CLASS_STYLE = Object.freeze({
  warrior: "frontline", dwarf: "frontline", "xcc-dwarf": "frontline", brawler: "frontline", athlete: "frontline", cleric: "frontline",
  thief: "skirmisher", halfling: "skirmisher", "sp-acrobat": "skirmisher", wizard: "caster", elf: "caster", gnome: "protector"
});

/** DCC's own answers to the tactics questions, where it knows better than the numbers: {key: answer}. */
export function dccTactics({ cls = null, undead = false, mindless = false } = {}) {
  const out = {};
  const style = CLASS_STYLE[cls] ?? (String(cls ?? "").startsWith("sp-") ? "skirmisher" : null);
  if ( style ) out.style = style;
  // (A gnome draws the foe's eye from its friends; a cleric lays on hands readily; a funnel peasant runs when hurt.)
  if ( cls === "gnome" ) out.target = "protect";
  if ( cls === "cleric" || cls === "messenger" ) out.healAggro = "aggressive";
  if ( ["zero-level", "0-level", "zero"].includes(cls) ) out.retreat = "hurt";
  if ( undead || mindless ) out.retreat = "never";
  return out;
}

/** Text from the sheet's HTML. */
export function plainText(html) {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
}
