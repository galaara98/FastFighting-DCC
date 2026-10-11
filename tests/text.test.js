/**
 * The table reader against lines written for these tests in the style of DCC tables (Foundry inline rolls and
 * all). No book's text is quoted here.
 */
import { describe, expect, test } from "vitest";
import { plain, damageIn, damageMultiple, roundsIn, targetsIn, saveIn, outcomeIn, modsIn, tableRow, spellResult, statLine, hitDice, actionDice, critOnFor, lowestSuccess } from "../scripts/text.js";
import { meanPart } from "../scripts/core.js";
import { text } from "./foundry-i18n.js";

const total = parts => parts.reduce((s, p) => s + meanPart(p), 0);

describe("reading table text", () => {
  test("inline rolls become plain dice", () => {
    expect(plain("Deal +[[/roll 1d6]] damage, <b>ouch</b>.")).toBe("Deal +1d6 damage, ouch .");
    expect(plain("for [[/r 2d4+1 # rounds]] rounds")).toBe("for 2d4+1 rounds");
    expect(plain("See @UUID[Compendium.x.y.Item.z]{the other spell}.")).toBe("See the other spell.");
  });

  test("damage: extra dice, flat points, caster level, per level, lost hit points", () => {
    expect(total(damageIn("A nasty gash. Inflict +[[/roll 1d6]] damage with this strike."))).toBe(3.5);
    expect(total(damageIn("The bolt does damage equal to [[/roll 1d4]] + caster level.", { casterLevel: 3 }))).toBe(5.5);
    expect(total(damageIn("A single spark that deals 1 point of damage."))).toBe(1);
    expect(total(damageIn("Flames lick out for 1d6 damage per caster level.", { casterLevel: 2 }))).toBe(7);
    expect(total(damageIn("Life drains away; the character permanently loses 2 hit points."))).toBe(2);
    expect(damageIn("A wave of [[/roll 2d6]] fire damage.")[0].type).toBe("fire");
    expect(damageIn("Their wounds close: heals 1d6 damage.")).toEqual([]);
    expect(damageIn("The foe stumbles away.")).toEqual([]);
  });

  test("double and triple damage", () => {
    expect(damageMultiple("A perfect blow deals double damage.")).toBe(2);
    expect(damageMultiple("Triple damage!")).toBe(3);
    expect(damageMultiple("Plain hit.")).toBe(1);
  });

  test("how long", () => {
    expect(roundsIn("blinded for [[/roll 1d4]] rounds")).toBe(3);
    expect(roundsIn("held for 1d4+CL rounds", { casterLevel: 2 })).toBe(5);
    expect(roundsIn("asleep for [[/roll 1d6]] turns")).toBe(100);
    expect(roundsIn("a -2 penalty on its next attack roll")).toBe(1);
    expect(roundsIn("prone for the rest of the fight")).toBe(100);
    expect(roundsIn("nothing about time")).toBeNull();
  });

  test("how many, and which save", () => {
    expect(targetsIn("Up to three targets within range")).toEqual({ targets: 3, area: true });
    expect(targetsIn("A single target")).toEqual({ targets: 1, area: false });
    expect(targetsIn("Everything in a 20' radius burns").area).toBe(true);
    expect(saveIn("The target must make a Will save or obey.")).toMatchObject({ type: "wil", dc: null, half: false });
    expect(saveIn("A DC 14 Fort save negates.")).toMatchObject({ type: "frt", dc: 14 });
    expect(saveIn("Ref save for half.")).toMatchObject({ type: "ref", half: true });
    expect(saveIn("It simply happens.")).toBeNull();
  });

  test("conditions and penalties", () => {
    expect(outcomeIn("Legs swept out: the foe is knocked prone.")).toMatchObject({ conditions: { prone: 1 } });
    expect(outcomeIn("Stunning crack: it falls to the bottom of the initiative count next round.")).toMatchObject({ conditions: { stunned: 1 }, rounds: 1 });
    expect(outcomeIn("Dust in the eyes: blinded for [[/roll 1d4]] rounds.")).toMatchObject({ conditions: { blinded: 1 }, rounds: 3 });
    expect(outcomeIn("The target must save or fall asleep.")).toMatchObject({ conditions: { incapacitated: 1 }, endsOnDamage: true });
    expect(outcomeIn("Its weapon is knocked from its hand.")).toMatchObject({ conditions: { disarmed: 1 } });
    expect(modsIn("They suffer a -4 penalty to their next attack roll.")).toEqual({ attack: -4 });
    expect(outcomeIn("They suffer a -4 penalty to their next attack roll.").label).toBe(text("FFDCC.Mods.Hampered", { what: text("FFDCC.Mods.attack", { n: "-4" }) }));
    expect(modsIn("A +2 bonus to AC for the round.")).toEqual({ ac: 2 });
    expect(modsIn("-1 to all rolls")).toEqual({ attack: -1, saves: -1, checks: -1 });
    expect(outcomeIn("If it fails its save, it must obey the command for one round.")).toMatchObject({ conditions: { stunned: 1 }, label: text("FFDCC.Told.obeying") });
    expect(outcomeIn("Fail the save and it falls under the caster's complete control, as if it were his friend.")).toMatchObject({ conditions: { controlled: 1 } });
    expect(outcomeIn("A clean hit.")).toBeNull();
    expect(outcomeIn("The foe is decapitated and dies instantly.").slay).toBe(true);
    expect(outcomeIn("If it has 1 HD or less, it dies instantly.")?.slay).toBeUndefined();
  });

  test("crit and fumble rows", () => {
    const crit = tableRow({ range: [3, 4], text: "Smash to the knee: inflict +[[/roll 1d8]] damage and the foe is knocked prone." });
    expect(crit).toMatchObject({ lo: 3, hi: 4, outcome: { conditions: { prone: 1 } } });
    expect(total(crit.damage)).toBe(4.5);
    expect(tableRow({ range: [20, 24], text: "Brutal. Double damage." }).multiply).toBe(2);
    const fumble = tableRow({ range: [2, 2], text: "You trip over your own feet and must spend the next round prone." }, { fumble: true });
    expect(fumble.outcome).toMatchObject({ conditions: { prone: 1 } });
    expect(tableRow({ range: [1, 1], text: "You miss but no harm is done." }, { fumble: true }).outcome).toBeNull();
    expect(tableRow({ range: [5, 5], text: "You hit an ally for 1d4 damage." }, { fumble: true }).damage).toBeUndefined();
  });
});

describe("spell check results", () => {
  test("a failure row", () => {
    expect(spellResult("Lost. Failure.")).toEqual({ fail: true });
    expect(spellResult("Failure.")).toEqual({ fail: true });
  });

  test("missiles: so many of so much each", () => {
    const r = spellResult("The caster hurls [[/roll 1d4+1]] missiles that each deal [[/roll 1d6]] + caster level damage. They never miss.", { casterLevel: 2 });
    expect(meanPart(r.repeat)).toBe(3.5);
    expect(total(r.damage)).toBe(5.5);
    expect(r.auto).toBe(true);
  });

  test("a save-or-sleep on several targets", () => {
    const r = spellResult("Up to two targets must make a Will save or fall asleep for [[/roll 1d6]] turns.", { save: "Will vs. spell check DC" });
    expect(r).toMatchObject({ targets: 2, area: true, auto: false, save: { type: "wil" }, outcome: { conditions: { incapacitated: 1 }, rounds: 100 } });
  });

  test("healing, and a share of hit dice", () => {
    expect(total(spellResult("The touch heals [[/roll 2d6]] hit points.").heal)).toBe(7);
    expect(spellResult("Restores two hit dice to the target.").healDice).toBe(2);
  });

  test("a blessing helps the caster's side", () => {
    const r = spellResult("The cleric and allies within 20' gain +1 to attack rolls for 1d4 rounds.");
    expect(r.buff).toMatchObject({ mods: { attack: 1 } });
    expect(r.outcome).toBeUndefined();
  });

  test("nothing a fight would notice", () => {
    expect(spellResult("The caster learns the name of a distant star.").nothing).toBe(true);
    expect(lowestSuccess(1)).toBe(12);
    expect(lowestSuccess(3)).toBe(16);
  });
});

describe("stat lines", () => {
  const line = "Ice Wight: Init +2; Atk claw +3 melee (1d4) or icy spear +5 missile fire (1d8+2 plus paralysis); AC 14; HD 3d12; MV 30' or fly 40'; Act 1d24 + 1d16; SP infravision 60', un-dead traits, immune to cold, crit on 21+, spellcasting (spell check +4); SV Fort +2, Ref +1, Will +3; AL C.";

  test("specials", () => {
    const s = statLine(line);
    expect(s.immune).toEqual(expect.arrayContaining(["cold", "controlled", "asleep", "paralyzed", "frightened"]));
    expect(s.undead).toBe(true);
    expect(s.critNatural).toBe(21);
    expect(s.infravision).toBe(60);
    expect(s.fly).toBe(40);
    expect(s.spellCheck).toBe(4);
  });

  test("attacks", () => {
    const { attacks } = statLine(line);
    expect(attacks).toHaveLength(2);
    expect(attacks[0]).toMatchObject({ name: "claw", bonus: 3, melee: true, damage: "1d4" });
    expect(attacks[1]).toMatchObject({ name: "icy spear", bonus: 5, melee: false, damage: "1d8+2", rider: "paralysis" });
  });

  test("dice: hit dice, action dice, crit ranges", () => {
    expect(hitDice("6d12+5")).toEqual({ level: 6, faces: 12 });
    expect(hitDice("1d16")).toEqual({ level: 1, faces: 16 });
    expect(actionDice("1d24 + 1d16")).toEqual([24, 16]);
    expect(actionDice("2d20")).toEqual([20, 20]);
    expect(actionDice("")).toEqual([20]);
    expect(critOnFor(21, 24)).toBe(17);
    expect(critOnFor(19, 20)).toBe(19);
  });
});
