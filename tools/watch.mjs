#!/usr/bin/env node
/**
 * What a new dcc or xcc release changed for this helper: every name it relies on in the system (review/names.json: card
 * flags, roll types, hooks, settings, CONFIG.DCC keys, data fields, actor methods, language keys), looked for in that
 * release's source. A name no longer found is a place the helper may now read nothing; each is listed for a person to
 * check. For the coders only (the weekly System watch workflow): nothing here is in the module.
 *
 *   node tools/watch.mjs --dcc <its source folder> [--xcc <its source folder>] [--out report.md] [--issue issue.md]
 *     [--versions "dcc 0.70.75, xcc 0.5.7"]
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const READ = new Set([".js", ".mjs", ".json", ".hbs", ".html"]);

function options(argv) {
  const out = { dcc: null, xcc: null, out: null, issue: null, versions: "" };
  for ( let i = 0; i < argv.length; i++ ) {
    const key = argv[i].replace(/^--/, "");
    if ( !(key in out) || argv[i + 1] === undefined ) throw new Error(`unknown option or missing value: ${argv[i]}`);
    out[key] = argv[++i];
  }
  return out;
}

/** Every source file's text under a folder (not node_modules, packs or .git), joined. */
function sourceOf(dir) {
  const parts = [];
  const walk = d => {
    for ( const name of readdirSync(d) ) {
      if ( ["node_modules", "packs", ".git"].includes(name) ) continue;
      const path = join(d, name);
      if ( statSync(path).isDirectory() ) walk(path);
      else if ( READ.has(extname(name)) ) parts.push(readFileSync(path, "utf8"));
    }
  };
  walk(dir);
  return parts.join("\n");
}

/** A name as the system's files hold it; a language key dotted in code, or nested in lang/*.json (its last part a key). */
const found = (source, name) => source.includes(name) || (/^[A-Z]+\./.test(name) && source.includes(`"${name.split(".").pop()}"`));

function main() {
  const o = options(process.argv.slice(2));
  const { names } = JSON.parse(readFileSync(join(REPO, "review", "names.json"), "utf8"));
  const lines = [];
  let missing = 0;
  for ( const [system, groups] of Object.entries(names) ) {
    const dir = o[system];
    if ( !dir ) continue;
    if ( !existsSync(dir) ) throw new Error(`no ${system} source at ${dir}`);
    const source = sourceOf(dir);
    for ( const [group, list] of Object.entries(groups) ) {
      const gone = list.filter(n => !found(source, n));
      missing += gone.length;
      lines.push(`| ${system} | ${group} | ${list.length - gone.length} of ${list.length} | ${gone.map(n => `\`${n}\``).join(", ") || "none"} |`);
    }
  }
  const report = [
    `# System watch: ${o.versions || "dcc / xcc"}`,
    "",
    missing
      ? `${missing} names this helper relies on are no longer found. Check each against the release notes, then update the helper and review/names.json (its \`checked\` versions too).`
      : "Every name this helper relies on is still there. Read the release notes for changes in meaning, then set review/names.json's `checked` versions.",
    "",
    "| System | Kind | Found | Not found |",
    "| --- | --- | --- | --- |",
    ...lines,
    ""
  ].join("\n");
  if ( o.out ) writeFileSync(o.out, report);
  else console.log(report);
  if ( o.issue ) writeFileSync(o.issue, report);
}

main();
