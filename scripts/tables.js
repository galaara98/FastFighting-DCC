/**
 * DCC's tables at run time: crit and fumble tables, Mighty Deeds, spell results, Lay on Hands and Turn Unholy,
 * wherever the world keeps them. It looks where the dcc system itself looks (the packs and tables set in its
 * settings, which the DCC and XCC core books fill in), then in any installed book's packs, then in the world's own
 * tables. Also a creature's entry in a book, that its stat line links to. Each is read once a session; nothing is
 * copied anywhere.
 */
import { tableRow } from "./text.js";

/** A table's rows: [{range: [lo, hi], text}]. */
const rowsOf = table => Array.from(table?.results ?? []).map(r => ({ range: [...(r.range ?? [])], text: r.description || r.name || r.text || "" }));

/** "Crit Table III" matches "Crit Table III" and "Crit Table III: Clerics ...", never "Crit Table IV". */
const named = (name, wanted) => {
  const n = String(name ?? "");
  return n === wanted || n.startsWith(`${wanted}:`) || n.startsWith(`${wanted} (`);
};
const originalName = e => e?.flags?.babele?.originalName ?? e?.originalName ?? e?.name;

/** The RollTable packs worth searching: the system's chosen ones first, then every other installed one. */
function tablePacks(first = []) {
  const seen = new Set();
  const out = [];
  for ( const id of first ) if ( id && !seen.has(id) && game.packs.get(id) ) { seen.add(id); out.push(game.packs.get(id)); }
  for ( const pack of game.packs ) if ( pack.documentName === "RollTable" && !seen.has(pack.collection) ) { seen.add(pack.collection); out.push(pack); }
  return out;
}

async function findTable(match, packs) {
  for ( const pack of packs ) {
    const index = await pack.getIndex({ fields: ["flags.babele.originalName"] });
    const entry = index.find(e => match(originalName(e)) || match(e.name));
    if ( entry ) return pack.getDocument(entry._id);
  }
  return game.tables?.find(t => match(t.name)) ?? null;
}

/** A spell's name for matching: "Neutralize Poison/Disease" and "Neutralize Poison or Disease" are the same spell. */
export function spellKey(name) {
  return String(name ?? "").toLowerCase().replace(/\s*\/\s*/g, " or ").replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
}

/** The same spell in an installed book's spell packs, by name. */
async function findSpell(name) {
  const wanted = spellKey(name);
  if ( !wanted ) return null;
  for ( const pack of game.packs ) {
    if ( pack.documentName !== "Item" || !/spell/i.test(pack.collection) ) continue;
    const index = await pack.getIndex({ fields: ["type", "flags.babele.originalName"] });
    const entry = index.find(e => e.type === "spell" && (spellKey(e.name) === wanted || spellKey(originalName(e)) === wanted));
    if ( entry ) return pack.getDocument(entry._id);
  }
  return null;
}

/** "pack.collection.Table Name" (how the dcc system's settings name a table) -> the table. */
async function fromSetting(value) {
  const text = String(value ?? "");
  if ( !text ) return null;
  const parts = text.split(".");
  if ( parts.length >= 3 ) {
    const pack = game.packs.get(`${parts[0]}.${parts[1]}`);
    const name = parts.slice(2).join(".");
    if ( pack ) {
      const index = await pack.getIndex({ fields: ["flags.babele.originalName"] });
      const entry = index.find(e => e.name === name || originalName(e) === name);
      if ( entry ) return pack.getDocument(entry._id);
    }
  }
  return game.tables?.getName?.(text) ?? null;
}

export class DccTables {
  #cache = new Map();

  async #once(key, load) {
    if ( !this.#cache.has(key) ) this.#cache.set(key, load().catch(err => {
      console.warn(`fast-fighting-dcc | couldn't read ${key}`, err);
      return null;
    }));
    return this.#cache.get(key);
  }

  /** Crit table rows for a table id ("III", "M", "U" ...), in the engine's terms, or null. */
  crit(id) {
    return this.#once(`crit:${id}`, async () => {
      const wanted = `Crit Table ${id}`;
      const local = game.i18n?.localize?.("DCC.CritTable");
      const match = n => named(n, wanted) || (local && local !== "DCC.CritTable" && named(n, `${local} ${id}`));
      const table = await findTable(match, tablePacks(CONFIG.DCC?.criticalHitPacks?.packs ?? []));
      return table ? rowsOf(table).map(r => tableRow(r)) : null;
    });
  }

  /** The fumble table's rows (what befalls the fumbler), or null. */
  fumble() {
    return this.#once("fumble", async () => {
      const table = (await fromSetting(CONFIG.DCC?.fumbleTable)) ?? (await findTable(n => /\bfumbles?\b/i.test(n ?? "") && /^table 4-2/i.test(n ?? ""), tablePacks()));
      return table ? rowsOf(table).map(r => tableRow(r, { fumble: true })) : null;
    });
  }

  /** Mighty Deed tables by kind ({trip, blind, disarm, defend, rally}: rows), or null. */
  deeds() {
    return this.#once("deeds", async () => {
      const out = {};
      for ( const pack of tablePacks(CONFIG.DCC?.mightyDeedsPacks?.packs ?? []) ) {
        const index = await pack.getIndex({ fields: ["flags.babele.originalName"] });
        for ( const e of index ) {
          const name = String(originalName(e) ?? e.name ?? "");
          if ( !/^deed\b/i.test(name) ) continue;
          const kind = /trip|throw/i.test(name) ? "trip" : /blind/i.test(name) ? "blind" : /disarm/i.test(name) ? "disarm" : /defen/i.test(name) ? "defend"
            : /rally/i.test(name) ? "rally" : /precision|shot/i.test(name) ? "precision" : null;
          if ( !kind || out[kind] ) continue;
          out[kind] = rowsOf(await pack.getDocument(e._id));
        }
        if ( Object.keys(out).length ) break; // one book's set is enough
      }
      return Object.keys(out).length ? out : null;
    });
  }

  /**
   * A spell's results and what else a book says of it: {rows, range, save}, or null. A spell made by hand or by a
   * stat-block importer often names no table: then the same spell is looked for by name in the installed books (its
   * table, range and save), and failing that any results table with its name.
   */
  spell(item) {
    const ref = item?.system?.results ?? {};
    const key = `spell:${ref.collection ?? ""}:${ref.table ?? spellKey(item?.name)}`;
    return this.#once(key, async () => {
      let name = ref.table;
      let collection = ref.collection;
      let twin = null;
      if ( !name ) {
        twin = await findSpell(item?.name);
        name = twin?.system?.results?.table || null;
        collection = twin?.system?.results?.collection || null;
      }
      let table = null;
      if ( name && collection && game.packs.get(collection) ) table = await findTable(n => n === name, [game.packs.get(collection)]);
      const wanted = spellKey(name || item?.name);
      table ??= game.tables?.find(t => spellKey(t.name) === wanted) ?? null;
      table ??= await findTable(n => spellKey(n) === wanted, tablePacks().filter(p => /spell/i.test(p.collection)));
      if ( !table ) return null;
      return { rows: rowsOf(table), range: twin?.system?.range ?? null, save: twin?.system?.save ?? null, level: twin?.system?.level ?? null, mode: twin?.system?.config?.castingMode ?? null };
    });
  }

  /**
   * What a document a stat line links to says (a creature's entry in a book: its journal's pages), as its words, or
   * null when there's none to read.
   */
  entry(uuid) {
    return this.#once(`entry:${uuid}`, async () => {
      const doc = await globalThis.fromUuid?.(uuid);
      if ( !doc ) return null;
      const pages = doc.pages ? [...doc.pages] : [doc];
      return pages.map(p => p?.text?.content ?? p?.system?.description?.value ?? "").join(" ");
    });
  }

  /**
   * The book's spell duel tables (duel.js): {compare, attackerHigh, defenderHigh, disturbance}, each its rows, found by
   * the reading's names (reading/<lang>.json duel.tables), the core book's table pack first; null without them all.
   */
  duel(names) {
    return this.#once("duel", async () => {
      const out = {};
      for ( const [key, source] of Object.entries(names ?? {}) ) {
        let re = null;
        try {
          re = new RegExp(source, "i");
        } catch ( err ) {
          return null;
        }
        const table = await findTable(n => re.test(n ?? ""), tablePacks(["dcc-core-book.dcc-core-tables"]));
        if ( !table ) return null;
        out[key] = rowsOf(table);
      }
      return Object.keys(out).length ? out : null;
    });
  }

  layOnHands() {
    return this.#once("layOnHands", async () => {
      const table = (await fromSetting(CONFIG.DCC?.layOnHandsTable)) ?? (await findTable(n => /^lay on hands$/i.test(n ?? ""), tablePacks()));
      return table ? rowsOf(table) : null;
    });
  }

  /** XCC's Jammer Lionization table (the XCC book's), or null. */
  lionize() {
    return this.#once("lionize", async () => {
      const table = await findTable(n => /\blioniz/i.test(n ?? ""), tablePacks());
      return table ? rowsOf(table) : null;
    });
  }

  turnUnholy() {
    return this.#once("turnUnholy", async () => {
      const table = (await fromSetting(CONFIG.DCC?.turnUnholyTable)) ?? (await findTable(n => /^turn unholy$/i.test(n ?? ""), tablePacks()));
      return table ? rowsOf(table) : null;
    });
  }
}
