/**
 * DCC spells (and the cleric's Lay on Hands and Turn Unholy) as the engine's actions with a spell check: the check's
 * total picks the result, from the spell's own results table as read by text.js.
 *
 * One kind of thing per spell, from what its results do: healing, a hold on foes (control), damage with a save,
 * damage that simply lands, or a blessing for friends. A result that does something else (Paralysis's charged hands,
 * at low results) succeeds and does nothing the fight would notice. Wizards lose a spell on a failed check (for the
 * rest of the day); clerics widen their disapproval. Monsters do neither.
 * Pure: no Foundry globals.
 */
import { spellResult, plain } from "./text.js";
import { meanPart } from "./core.js";

/** Chance a check (die + mod, a natural 1 fails) lands from lo to hi. */
export function chanceBetween(mod, faces, lo, hi = Infinity) {
  let p = 0;
  for ( let natural = 2; natural <= faces; natural++ ) {
    const total = natural + mod;
    if ( total >= lo && total <= hi ) p += 1 / faces;
  }
  return p;
}

/** What the action does at one result, as the fields of its kind. */
function tierFields(kind, r) {
  const area = r.targets > 1 ? { targets: r.targets } : null;
  const nothing = { damage: [], outcome: null, onSave: null, heal: [], healDice: 0 };
  switch ( kind ) {
    case "heal": return { ...nothing, heal: r.heal ?? [], healDice: r.healDice ?? 0 };
    case "buff": return r.buff ? { ...nothing, outcome: { ...r.buff }, aura: r.area ? 30 : null, area: r.area ? null : area } : nothing;
    case "auto": return r.damage ? { ...nothing, damage: r.damage, repeat: r.repeat ?? null, area } : nothing;
    case "save": return r.damage ? { ...nothing, damage: r.damage, repeat: r.repeat ?? null, area, save: { type: r.save?.type ?? "wil", dc: "check", basic: !!r.save?.half } } : nothing;
    case "control": {
      if ( !r.outcome && !r.damage ) return nothing;
      const base = { ...nothing, damage: r.damage ?? [], repeat: r.repeat ?? null, area };
      if ( r.auto || !r.save ) return { ...base, auto: true, save: null, outcome: r.outcome ?? null };
      const o = r.outcome ?? null;
      return { ...base, auto: false, outcome: null, save: { type: r.save.type, dc: "check", basic: !!r.save.half }, onSave: [o, o, null, null] };
    }
    default: return nothing;
  }
}

/** The kind a spell is, from what its results do. */
function kindOf(results) {
  if ( results.some(r => r.heal?.length || r.healDice) ) return "heal";
  if ( results.some(r => r.outcome) ) return "control";
  if ( results.some(r => r.damage?.length) ) return results.some(r => r.damage?.length && !r.auto && r.save) ? "save" : "auto";
  if ( results.some(r => r.buff) ) return "buff";
  return null;
}

/** What a tier is worth, roughly, for picking the one a success most often does. */
const tierWorth = t => (t.damage ?? []).reduce((s, p) => s + meanPart(p), 0) * (t.repeat ? meanPart(t.repeat) : 1) + (t.heal ?? []).reduce((s, p) => s + meanPart(p), 0) + (t.healDice ?? 0) * 3.5
  + (t.outcome || t.onSave ? 5 : 0);

/**
 * A spell as an action, or null when nothing it does would show in a fight (or nothing could be read).
 * @param {object} s
 * @param {string} s.id
 * @param {string} s.name
 * @param {number} s.level         spell level (for the lowest success when the table doesn't say)
 * @param {object[]} s.rows        its results table: [{range: [lo, hi], text}]
 * @param {number} s.mod           spell check modifier
 * @param {number} [s.faces=20]    the die it's cast with
 * @param {string} [s.mode]        "wizard" (lost on a failure) or "cleric" (disapproval)
 * @param {number} [s.disapproval] a cleric's disapproval range now
 * @param {boolean} [s.monster]    a monster's casting: nothing lost, no disapproval
 * @param {number} [s.casterLevel]
 * @param {string} [s.save]        the spell's own save line
 * @param {string} [s.rangeText]   its range ("60'", "Touch", "Self")
 */
export function spellAction({ id, name, level = 1, rows, mod = 0, faces = 20, mode = "wizard", disapproval = 1, monster = false, casterLevel = 0, save = "", rangeText = "" }) {
  if ( !rows?.length ) return null;
  const read = rows.map(row => ({ lo: Number(row.range?.[0] ?? -Infinity), hi: Number(row.range?.[1] ?? Infinity), ...spellResult(row.text, { casterLevel, save }) }))
    .sort((a, b) => a.lo - b.lo);
  const wins = read.filter(r => !r.fail);
  if ( !wins.length ) return null;
  const kind = kindOf(wins.filter(r => !r.nothing));
  if ( !kind ) return null;
  const { self, ...where } = reachOf(rangeText, kind);
  const tiers = wins.map(r => ({ min: Math.max(r.lo, -99), max: r.hi, ...tierFields(kind, r) }));
  // How often a check does something worth doing, and what it most often does then.
  const chances = tiers.map(t => (tierWorth(t) > 0 ? chanceBetween(mod, faces, t.min, t.max) : 0));
  const castChance = chances.reduce((s, p) => s + p, 0);
  if ( !(castChance > 0) ) return null;
  const typical = tiers[chances.indexOf(Math.max(...chances))];
  // Its save DC is the check itself: the typical one, for behavior's estimates.
  const typicalDc = Math.round((typical.min + Math.min(typical.max, mod + faces)) / 2);
  const { min, max, ...shown } = typical;
  if ( shown.save ) shown.save = { ...shown.save, dc: typicalDc };
  return {
    id, name, kind, cost: 1, ...where, ...shown,
    targets: kind === "buff" && self ? "self" : undefined,
    casting: {
      mod, faces, label: "spell check",
      lostOnFail: !monster && mode === "wizard",
      disapproval: !monster && mode === "cleric" ? Math.max(1, Number(disapproval) || 1) : null
    },
    tiers,
    castChance,
    spellLevel: level
  };
}

/** Range and reach from a spell's range line. */
function reachOf(text, kind) {
  const t = plain(text).toLowerCase();
  if ( /^self\b/.test(t) && !/touch|or more/.test(t) ) return { self: true, reach: 0 };
  if ( /touch/.test(t) && !/\d/.test(t) ) return { reach: 5 };
  const feet = Number(t.match(/\d+/)?.[0]);
  if ( Number.isFinite(feet) && feet > 5 ) return { range: { increment: feet } };
  if ( /sight|line of sight/.test(t) ) return { range: { increment: 120 } };
  return kind === "heal" ? { reach: 5 } : { range: { increment: 30 } };
}

/* -------------------------------------------- */
/*  The cleric's own                            */
/* -------------------------------------------- */

/**
 * Lay on Hands from its table: so many of the target's hit dice by the check, the counts depending on how the
 * cleric's and the target's alignments agree (same, adjacent, opposed). The engine can't tell whose alignment is
 * whose in the middle of a heal, so the middle column stands for all. Without the table, a rough guess.
 */
export function layOnHandsAction({ id = "lay-on-hands", name = "Lay on Hands", rows = null, mod = 0, faces = 20, disapproval = 1 } = {}) {
  let tiers = [];
  for ( const row of rows ?? [] ) {
    const t = plain(row.text).toLowerCase();
    const m = t.match(/adjacent\s+(\d+)\s*di(?:c)?e/) ?? t.match(/(\d+)\s*di(?:c)?e/);
    if ( !m ) continue;
    tiers.push({ min: Number(row.range?.[0]), max: Number(row.range?.[1] ?? Infinity), healDice: Number(m[1]) });
  }
  const guessed = !tiers.length;
  if ( guessed ) tiers = [{ min: 12, max: 15, healDice: 1 }, { min: 16, max: 19, healDice: 2 }, { min: 20, max: Infinity, healDice: 3 }];
  tiers.sort((a, b) => a.min - b.min);
  const chances = tiers.map(t => chanceBetween(mod, faces, t.min, t.max));
  const castChance = chances.reduce((s, p) => s + p, 0);
  const typical = tiers[chances.indexOf(Math.max(...chances))];
  return {
    id, name, kind: "heal", cost: 1, reach: 5, heal: [], healDice: typical?.healDice ?? 1,
    casting: { mod, faces, label: "spell check", disapproval: Math.max(1, Number(disapproval) || 1) },
    tiers, castChance, guessed
  };
}

/**
 * Turn Unholy from its table: at each result, the most hit dice of unholy creature (un-dead, demons, devils) it
 * turns. Turned, they cower. Without the table, a rough guess.
 */
export function turnUnholyAction({ id = "turn-unholy", name = "Turn Unholy", rows = null, mod = 0, faces = 20, disapproval = 1 } = {}) {
  let tiers = [];
  for ( const row of rows ?? [] ) {
    const t = plain(row.text).replace(/\s+/g, " ");
    let most = 0;
    for ( const m of t.matchAll(/(\d+)(?:\s*-\s*(\d+))?\s*HD\s+([TKD])/gi) ) most = Math.max(most, Number(m[2] ?? m[1]));
    if ( most > 0 ) tiers.push({ min: Number(row.range?.[0]), max: Number(row.range?.[1] ?? Infinity), turns: most });
  }
  const guessed = !tiers.length;
  if ( guessed ) tiers = [{ min: 12, max: 17, turns: 1 }, { min: 18, max: 23, turns: 2 }, { min: 24, max: Infinity, turns: 4 }];
  tiers.sort((a, b) => a.min - b.min);
  const chances = tiers.map(t => chanceBetween(mod, faces, t.min, t.max));
  const castChance = chances.reduce((s, p) => s + p, 0);
  const typical = tiers[chances.indexOf(Math.max(...chances))];
  return {
    id, name, kind: "control", cost: 1, range: { increment: 30 }, auto: true, area: { targets: 3 },
    outcome: { conditions: { incapacitated: 1, turned: 1 }, rounds: 3, label: "turned" },
    turns: typical?.turns ?? 1,
    casting: { mod, faces, label: "turn unholy", disapproval: Math.max(1, Number(disapproval) || 1) },
    tiers, castChance, guessed
  };
}

