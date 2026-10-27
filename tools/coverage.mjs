#!/usr/bin/env node
/**
 * How much of DCC's monsters this helper reads: every NPC in the installed books' packs (any module for the dcc
 * system with Actor packs: the DCC and XCC core books, adventures), its stat line read as the helper reads it
 * (text.js statLine, ridersIn on an attack's rider), and each special in its SP and each rider sorted into what the
 * helper understands and what it doesn't, by kind. Run locally (the books are paid content: nothing of their text is
 * written; docs/coverage.md holds counts only):
 *
 *   node tools/coverage.mjs [--out docs/coverage.md] [--detail true]
 *
 * --detail prints each special and rider name not understood, with how often it comes, to the console only (for
 * deciding what to read next; never into the repository). Options: --data (Foundry's Data folder), --foundry (its app
 * folder, for classic-level), --core (FastFighting Core's scripts folder).
 */
import { register, createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const LOCAL = process.env.LOCALAPPDATA ?? "";

function options(argv) {
  const out = {
    out: null, detail: "false",
    data: process.env.FOUNDRY_DATA ?? join(LOCAL, "FoundryVTT", "Data"),
    foundry: process.env.FOUNDRY_APP ?? join(LOCAL, "Programs", "FoundryVirtualTabletop", "Foundry Virtual Tabletop", "resources", "app"),
    core: process.env.FASTFIGHTING_CORE ?? join(REPO, "..", "FastFighting", "scripts")
  };
  for ( let i = 0; i < argv.length; i++ ) {
    const key = argv[i].replace(/^--/, "");
    if ( !(key in out) || argv[i + 1] === undefined ) throw new Error(`unknown option or missing value: ${argv[i]}`);
    out[key] = argv[++i];
  }
  return out;
}

/** Every document in one LevelDB pack, read from a copy (Foundry may hold the pack open). */
async function readPack(dir, ClassicLevel) {
  const temp = mkdtempSync(join(tmpdir(), "ff-dcc-coverage-"));
  const copy = join(temp, "pack");
  mkdirSync(copy);
  try {
    for ( const file of readdirSync(dir) ) if ( file !== "LOCK" ) copyFileSync(join(dir, file), join(copy, file));
    const db = new ClassicLevel(copy, { valueEncoding: "json" });
    await db.open();
    const out = [];
    try {
      for await ( const [key, value] of db.iterator() ) out.push({ key, value });
    } finally {
      await db.close();
    }
    return out;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/** The installed modules for the dcc system with packs of a type ("Actor", "JournalEntry"): [{module, label, path}]. */
function actorPacks(data, type = "Actor") {
  const out = [];
  const root = join(data, "modules");
  for ( const id of existsSync(root) ? readdirSync(root) : [] ) {
    const file = join(root, id, "module.json");
    if ( !existsSync(file) || id.startsWith("fast-fighting") ) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(file, "utf8"));
    } catch ( err ) {
      continue;
    }
    const systems = [...(manifest.relationships?.systems ?? []), ...(manifest.systems ?? [])].map(s => s?.id ?? s);
    if ( !systems.includes("dcc") && !(manifest.packs ?? []).some(p => p.system === "dcc") ) continue;
    for ( const p of manifest.packs ?? [] ) {
      if ( (p.type ?? p.entity) !== type ) continue;
      const path = join(root, id, p.path ?? `packs/${p.name}`);
      if ( existsSync(path) ) out.push({ module: id, label: p.label ?? p.name, path });
    }
  }
  return out;
}

/** The helper's own readers, with the core's path made to work outside Foundry and English words to read by. */
async function readers(core) {
  const base = pathToFileURL(core.endsWith("/") || core.endsWith("\\") ? core : `${core}/`).href;
  const hook = `export async function resolve(specifier, context, next) {
    const m = /^(?:\\.\\.\\/)+(?:fast-fighting|FastFighting)\\/scripts\\/(.*)$/.exec(specifier);
    return m ? next(new URL(m[1], ${JSON.stringify(base)}).href, context) : next(specifier, context);
  }`;
  register(`data:text/javascript,${encodeURIComponent(hook)}`);
  process.env.FASTFIGHTING_CORE = core;
  const { fakeI18n } = await import(pathToFileURL(join(REPO, "tests", "foundry-i18n.js")).href);
  globalThis.game = { i18n: fakeI18n() };
  // (The words the books are read by: reading/en.json, as the module loads it at startup.)
  const { setReading } = await import(pathToFileURL(join(REPO, "scripts", "reading.js")).href);
  setReading(JSON.parse(readFileSync(join(REPO, "reading", "en.json"), "utf8")));
  return import(pathToFileURL(join(REPO, "scripts", "text.js")).href);
}

/** A stat line's specials (its SP, up to the next field), one by one: split at commas and semicolons outside brackets. */
function specialsOf(plainText) {
  const sp = plainText.match(/\bSP\b\s*([^;]*(?:;(?!\s*(?:SV|AL|AC|HD|MV|Act|Init|Atk)\b)[^;]*)*)/)?.[1] ?? "";
  const out = [];
  let depth = 0;
  let word = "";
  for ( const ch of sp ) {
    if ( ch === "(" ) depth++;
    if ( ch === ")" ) depth = Math.max(0, depth - 1);
    if ( (ch === "," || ch === ";") && !depth ) {
      out.push(word);
      word = "";
    } else word += ch;
  }
  out.push(word);
  return out.map(s => s.trim().replace(/\.$/, "")).filter(Boolean);
}

/** What kind of special this is, by what the helper reads of it (statLine's own fields), else by its words. */
function kindOf(special, text, { limitedRead = false } = {}) {
  const s = special.toLowerCase();
  const line = text.statLine(`SP ${special}; SV`);
  if ( line.immune.length || line.fearless ) return ["immunity", true];
  if ( line.resist.length || line.weak.length ) return ["half or double damage", true];
  if ( line.critNatural ) return ["crit range", true];
  if ( line.infravision ) return ["infravision", true];
  if ( line.construct || line.undead || line.unholy ) return ["construct, un-dead, demon", true];
  if ( line.pack ) return ["pack tactics", true];
  if ( line.spellcasting || line.spellCheck !== undefined ) return ["spellcasting", true];
  if ( line.regen || line.fastHealing || line.regenNamed ) return ["regeneration", true];
  if ( line.auras?.length ) return ["aura or gaze", true];
  if ( line.saveVs?.length ) return ["bonus to saves", true];
  if ( line.followUps?.length ) return ["follow-up on a hit (swallow, rend, drain, grab)", true];
  if ( line.harmedOnlyBy ) return ["harmed only by magic or silver", true];
  if ( line.reduction ) return ["damage reduction", true];
  if ( line.neverSurprised || line.stealth !== undefined ) return ["hiding or surprise", true];
  if ( /\baura\b|\bstench\b|\bpresence\b|\bgaze\b|\bstink/.test(s) ) return ["aura or gaze", false];
  if ( /\bsaves?\b.*\b(?:vs|against)\b|[+-]\d+\s*(?:to|on)\s*saves?/.test(s) ) return ["bonus to saves", false];
  // (A breath read where the helper reads the special its stat line names without stats from the book: limitedIn.)
  if ( /\bbreath|\/\s*day\b|\bper day\b|\btimes (?:a|per)\b|\bonce\b/.test(s) ) return ["limited use (breath, x/day)", limitedRead && /\bbreath/.test(s)];
  if ( /\bswallow|\bengulf|\bconstrict|\brend\b|\bhug\b|\bdrain|\bgrab|\bgrapple|\bhold\b|\bentangle|\bweb\b/.test(s) ) return ["follow-up on a hit (swallow, rend, drain, grab)", false];
  if ( /\bpoison|\bparaly|\bdisease|\bslime|\bacid|\bcorrosi|\bpetrif|\bcharm|\bsleep|\bfear\b|\bcurse|\bblind/.test(s) ) return ["named rider or affliction", false];
  if ( /\bmagic\b.*\bweapon|\bsilver|\bnon-?magical|\bcold iron/.test(s) ) return ["harmed only by magic or silver", false];
  if ( /\bspines|\bthorns|\bspikes|\bwhen hit|\bwhoever (?:hits|touches)/.test(s) ) return ["harm to an attacker", false];
  if ( /\bsummon|\bcall\b/.test(s) ) return ["summoning", false];
  if ( /\binvisib|\bcamoufl|\bstealth|\bambush|\bsurprise/.test(s) ) return ["hiding or surprise", false];
  return ["other", false];
}

/**
 * What a rider adds, read as the helper reads one (text.js ridersIn; one it only names, from the creature's entry in
 * the book, entryRider): something, or nothing.
 */
function riderRead(text, attack, entries) {
  const r = text.ridersIn(attack.rider);
  if ( r.effects.length > 0 || r.damage.length > 0 ) return true;
  return entries.some(e => text.entryRider([attack.rider, attack.name], e).effects.length > 0);
}

/** Every journal entry's text in the books, by the last part of its uuid (its id), its pages joined. */
async function journalTexts(data, ClassicLevel) {
  const out = new Map();
  for ( const p of actorPacks(data, "JournalEntry") ) {
    for ( const { key, value } of await readPack(p.path, ClassicLevel) ) {
      if ( !key.startsWith("!journal.pages!") ) continue;
      const entryId = key.slice("!journal.pages!".length).split(".")[0];
      out.set(entryId, `${out.get(entryId) ?? ""} ${value?.text?.content ?? ""}`);
    }
  }
  return out;
}

/** A stat line's parentheses that only give a range (", range 100'"): no rider at all. */
const onlyRange = rider => /^[\s,]*range\s*[\d']+'?\s*$/i.test(rider);

async function main() {
  const o = options(process.argv.slice(2));
  const { ClassicLevel } = createRequire(join(o.foundry, "package.json"))("classic-level");
  const text = await readers(o.core);
  const packs = actorPacks(o.data);
  const journals = await journalTexts(o.data, ClassicLevel);
  const kinds = new Map();
  const unread = new Map();
  let creatures = 0;
  let withSpecials = 0;
  let riders = 0;
  let ridersRead = 0;
  let named = 0;
  let namedRead = 0;
  const packsRead = [];
  for ( const p of packs ) {
    const docs = await readPack(p.path, ClassicLevel);
    let n = 0;
    for ( const { key, value } of docs ) {
      if ( !key.startsWith("!actors!") || value?.type !== "NPC" ) continue;
      n++;
      creatures++;
      const plainText = text.plain(value.system?.details?.notes?.value ?? "");
      const line = text.statLine(plainText);
      const notes = value.system?.details?.notes?.value ?? "";
      const entries = text.linksIn(notes).map(uuid => journals.get(uuid.split(".").pop())).filter(Boolean);
      for ( const a of line.attacks ) {
        if ( !a.rider || onlyRange(a.rider) ) continue;
        riders++;
        if ( riderRead(text, a, entries) ) ridersRead++;
        else unread.set(`rider: ${a.rider.toLowerCase()}`, (unread.get(`rider: ${a.rider.toLowerCase()}`) ?? 0) + 1);
      }
      // (A breath weapon named without stats: read from its entry in the book, text.js limitedIn.)
      const limitedRead = entries.some(e => text.limitedIn(notes, e));
      if ( /\bbreath weapon\b|\bbreathes? (?:fire|frost|cold|ice|acid|lightning|poison|gas|flame)/i.test(plainText) ) {
        named++;
        if ( limitedRead ) namedRead++;
      }
      const specials = specialsOf(plainText);
      if ( specials.length ) withSpecials++;
      for ( const s of specials ) {
        const [kind, read] = kindOf(s, text, { limitedRead });
        const k = kinds.get(kind) ?? { read: 0, unread: 0 };
        k[read ? "read" : "unread"]++;
        kinds.set(kind, k);
        if ( !read ) unread.set(`${kind}: ${s.toLowerCase()}`, (unread.get(`${kind}: ${s.toLowerCase()}`) ?? 0) + 1);
      }
    }
    packsRead.push(`${p.module}: ${p.label} (${n})`);
  }
  const rows = [...kinds].sort((a, b) => (b[1].read + b[1].unread) - (a[1].read + a[1].unread));
  const md = [
    "# Coverage: DCC's monsters",
    "",
    "What this helper reads of the monsters in the installed books' packs (`node tools/coverage.mjs --out docs/coverage.md`, run locally: the books are paid content, so this holds counts only).",
    "",
    `- **Creatures:** ${creatures}, ${withSpecials} with specials in their stat line.`,
    `- **Packs:** ${packsRead.join("; ") || "none installed"}.`,
    `- **Attack riders** ("plus poison"): ${ridersRead} of ${riders} read.`,
    `- **Breath weapons named without stats** ("or breath weapon"): ${namedRead} of ${named} read from the creature's entry in the book.`,
    "",
    "| Kind of special | Read | Not read |",
    "| --- | --- | --- |",
    ...rows.map(([kind, k]) => `| ${kind} | ${k.read} | ${k.unread} |`),
    ""
  ].join("\n");
  if ( o.out ) writeFileSync(resolve(REPO, o.out), md);
  else console.log(md);
  if ( o.detail === "true" ) {
    console.log("\nNot read, most often first (console only):");
    for ( const [s, n] of [...unread].sort((a, b) => b[1] - a[1]) ) console.log(`${String(n).padStart(4)}  ${s}`);
  }
}

await main();
