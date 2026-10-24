# FastFighting DCC: developer notes

How this helper plugs into FastFighting Core, what it hands the core, and how to test it. What it does at the table is in [README.md](README.md). The core's helper API (the adapter, the rules object, the hooks) is in the core's [CODING_README.md](https://github.com/galaara98/FastFighting/blob/main/CODING_README.md).

## Plugging into the core

`scripts/main.js`:
- **`init`:** registers the world setting `tiedStopsSpells` (tied.js, Boolean, default on), and starts reading `reading/en.json` (reading.js `loadReading`; `toCombatantSpec` waits for it).
- **`fastFighting.init`:** stays inactive outside a `dcc` world (module.json already limits it to one). Checks the core's API version (below), then `api.registerAdapter("dcc", DccAdapter, { priority: 10, source: MODULE_ID })`, `api.adviseTranslation(MODULE_ID, game.system.title, KNOWN_TRANSLATIONS)` (no translation module known yet) and `api.keepEnglish(MODULE_ID)` (hardcoded-toEN.json).
- **`ready`:** warns the GM (`FFDCC.NeedsCore`) when the core isn't active, and moves a value set on this module's old `loreBoost` setting to the core's (lore-move.js; temporary, until 0.10.0: tests/temporary/lore-move.test.js).

**The API gate.** The core's API version is `major.bug` (`api.version` "28.0", `api.major` 28, `api.bug` 0). The helper decides compatibility; the core never refuses it. `KNOWN_API` in main.js lists the API majors this helper is known to work with, currently `[24, 25, 26, 27, 28, 29]`. Below the oldest major listed, it doesn't register and tells the GM the core is too old (`FFDCC.CoreTooOld`). On any other major it isn't known to work with, it registers and warns the GM once that it hasn't been tried with that core (`FFDCC.CoreUntested`). When a new core major arrives, test the helper with it and add the major to `KNOWN_API`.

`scripts/core.js` re-exports `../../fast-fighting/scripts/core-api.js`: everything this module takes from the core goes through that one file (both modules sit side by side in `Data/modules`). The tests alias the path to the core repository.

What it takes up of the core since API 19:
- **20:** hidden from one creature at a time (core-api `hiddenFrom`: `modifiers.exposed`); every die DCC's own rules roll is a table roll a live battle shows (the core's recording rng, `rng.mark` and `rng.record`, or its `rollCheck`): a morale check (`FFDCC.Rolls.Morale`), a stray shot's d2 and die (`FFDCC.Rolls.Stray`, the same draws as `chance(0.5)` and `pick`), a last burst of regeneration (healing), rolling the body (the Luck check and the d3, `what: "body"`), breaking a bigger grabber's grip (`what: "escape"`), persistent damage's end (DC 11).
- **22:** `workerRules()` gives the planner's background workers `rules.js`'s `dccRulesFor(data)`, the rules with the world's `tiedStopsSpells` given as data (a worker reads no settings); `rules.js` imports nothing of Foundry's (`statuses.js` holds the status table and `leftBehind`, which `commit.js` re-exports). `tests/workers-dcc.test.js` plays batches on real threads.
- **26:** deals (goods.js): `takeGoods`, `putGoods`, `goodsOf`, `dropValuables` (an NPC sheet that is only a pile, flagged `fast-fighting.pile`: DCC has no loot actor), `commitConcession` through take and put (as many as the concession's `count`), `mainCoin` (gold), `skillsOf` (Personality, Strength, then each sheet skill with a value; XCC's `briberyExpert` a way to persuade), `giveables`; `valuables` with `quantity` and `worn`; coins at `CONFIG.DCC.currencyValue` (pp 10000, ep 1000), a worth written as dice its mean (`amountOf`); `supportsLoot`. check-roll.js rolls a deal's check (`bribe`, `extort`, `scare`, `toll`): the player's pick, else Bribery expert or Personality for a bribe, the better of Personality and Strength for a demand.
- **27:** food (food.js): `appetite`, `meatFor`, `isFood`, from the stat line, the crit table's kind and `FFDCC.Words.Beast`, `Bite`, `NoFlesh` and `Rations`; meat portions by token size; `pileContents`.
- **19-21 (live polish):** `readLiveState` reads only hit points, statuses (`conditionsOf`) and the resources the engine counts (Luck, spellburn headroom, Fleeting Luck), not a whole spec; `reactionsOf` offers the free attack (`opportunity`, `FFDCC.FreeAttack`) to one with a melee attack; `leaveToTable` and cards.js: FastFighting's damage cards (attack cards from `rollStrike`, Damage cards from `rollDamage` and `showTableRoll`) carry `flags.fast-fighting-dcc.rolled` and `dcc.damageApplied`, and the chat menu's `DCC.ChatContextDamage`/`Healing` entries are hidden on them (a GM-made card, or one the core's `damageApplied` names); `showTableRoll` (table-cards.js) shows the engine's damage and healing as a Damage card (`rollJson`, the engine's dice), healing marked `healing: true`; commit.js names buffs no card names (`FFDCC.Given`, `GivenWaits`) and writes XCC's `disrespected` and `agro` with the Jammer's and Gnome's effects; read-turn.js adds Luck burned after a roll (dcc 0.70.72's `LuckBurn` cards, `luckBurnFor`, `luckBurnBonus`) to the card it names and grades a miss again at the target's AC as its sheet has it now (`fromUuidSync`), unsure where that can't be read.
- **Upstream (dcc 0.70.74, xcc 0.5.6):** crits honour `strictCriticalHits` (adapter.js `critOnAt`: off, a weapon's range keeps its number, capped at the die, given as the d20-relative range that comes to the same); `#crit` adds `attributes.critical.otherMod`, `#fumble` subtracts `attributes.fumble.otherMod`; Disrespect's label is XCC's `XCC.Status.Disrespected`; ability losses go into the Ability Score Log (`enableAbilityScoreLog`) as the system writes entries (`luckSpend`, `spellburn`, `bleedOut`, `rollTheBody`), the update and its restore marked `{dcc: {abilityLogged: true}}` (the undo record's `systemOptions`, core API 29).
- **29:** stat lines read further (text.js): `ridersIn` (an attack's rider: a save rider with `traits` poison or disease and `slay` for "or death", core API 29; extra damage; persistent damage each round; a grab; a range in the parentheses is none), `entryRider` (a rider only named, from the sentence with a DC in the creature's linked book entry), `saveVsIn` (spec.saveVs), `aurasIn` (spec.auras, with a save and an outcome), `followUpsIn` (rend: an auto, free, once-a-turn action with `requires.hits`; constriction: `requires.holding`; adapter.js `followUpActions`), `harmedOnlyBy` and `reduction` (rules.applyIwr reads them off the target's spec with `ctx.magical` and `ctx.materials`: a weapon is magical with its own `attackBonusWeapon` or `FFDCC.Words.Magic`, silver by `FFDCC.Words.Silver`), `neverSurprised` (spec.alert, core API 29), a hide bonus (initiative.stealth); plain() joins a word broken across a printed line. `tools/coverage.mjs` measures it against the installed books (counts only, docs/coverage.md). The weekly System watch (`.github/workflows/system-watch.yml`, `tools/watch.mjs`) looks for every system name the helper relies on (`review/names.json`: card flags, roll types, hooks, settings, CONFIG.DCC keys, data fields, actor methods, language keys) in each new dcc or xcc release's source, and opens an issue for those versions; once checked, set `checked` there. DCC has no slugs, so names stand in for PF2e's review ledger.
- **29, more:** `augurSaves` (a birth augur whose words the sheet keeps, "(Saving throws to escape traps)", `FFDCC.Words.AugurTrapSaves`: its Luck modifier on saves `vs: ["trap"]`, the core tagging what a hazard sets off); a halfling's two-weapon action `fumble: "all"`; `partyMembers` (the Party sheets' `dcc.partyMembers`).
- **29, rally:** a rally row's bonus that waits on a kill or a crit (deeds.js `waitsOn`) is an outcome with `armedBy` and `armedFrom` ("bearer": the friend's own, "allies who slay"; "source": the warrior's, "if the warrior slays its foe").
- **Deeds:** pushback rows read (deeds.js `pushTier`: feet, half the warrior's speed, "a few feet"; the size limit as `maxBody`, the warrior's token across times so much, which rules.js `isImmune` checks against the foe's `position.size`); the precision shot table (`Deed: Precision Shot`) as a missile weapon's deed, table only.
- **XCC:** a Jammer's Lionize (`lionize`, the book's `Table 1-10: Jammer Lionization` via tables.js `lionize()`, `lionizeMods`: a buff with a check and tiers, as a spell's), a Half-Orc's Wild Attack (`wildAttacks`: `class.wildCritRange`, Luck on the roll and damage, `provokes: true`, core API 29; no `itemId`, so the engine rolls it).
- **28:** `settingDefaults()`: Max rounds 4 to 12 (10), Lore-Collector advantage 2.25 in this module's words; `sizeUp` carries no `boost` (a fight has the core's value).
- **23:** `spec.aptitudes` (traits.js `aptitudesOf`: a character's from its modifiers, -3 to +3 banded 0 to 4, Personality both wise and charismatic; a creature only its wits, none when mindless, a beast's, else its Intelligence where its sheet has one).

When new work needs something the core can't handle in a close-enough way with what it already offers, ask for a new core hook rather than forcing a poor fit or working around the core.

## Files

| File | What it does |
| --- | --- |
| `adapter.js` | `DccAdapter`: reads dcc actors (Player, NPC) into CombatantSpecs; the class's own actions (XCC's included); live-battle methods. |
| `rules.js` | `dccRules`, the pure rules object (below). Reads one world setting, through tied.js. |
| `classes.js` | The class id from the sheet, and `archetype(id)` (what a class plainly is: XCC's Messenger a cleric, each `sp-*` Specialist a thief). |
| `deeds.js` | Mighty Deeds from the world's tables, else built-in tiers; each names the core maneuver it is (`trip`, `blindFoe`, `disarm`, `shove`, `defend`, `rally`). |
| `spells.js` | Spells, Lay on Hands and Turn Unholy as engine actions with a spell check; one kind per spell (healing, control, damage with a save, damage, blessing). |
| `text.js` | Reads table rows and a monster's stat line into engine terms (damage, saves, conditions, mods, mending, immunities, hit dice, action dice), by the reading's words and patterns (below), compiled once per reading. Pure. |
| `reading.js` | The words the books are read by (`reading/en.json`, and the reader's language's `reading/<lang>.json` over it): `loadReading` at startup, `reading`, `currentReading`, `setReading` for tests and tools. |
| `tables.js` | `DccTables`: finds the books' tables at run time, each read once a session (below). |
| `commit.js` | Live write-back, the planner's outcome lines; the status mapping. |
| `cards.js` | FastFighting's own damage cards: the mark, the chat menu's Apply entries hidden on them, `leaveToTable`. |
| `table-cards.js` | The engine's damage and healing as the system's Damage card (`showTableRoll`). |
| `goods.js` | Deals, piles and money (API 26-27): goods on and off a sheet, DCC's own pile, what a pile holds, a player's checks and offers; DCC's coin values. |
| `food.js` | Food (API 27): who eats what, the meat a body leaves, rations by name. |
| `read-turn.js` | A player's turn read from the dcc system's chat cards (`dcc.isToHit` and the rest): attacks, damage, Personality checks, each marked `sure` or not. |
| `strike-roll.js` | A strike rolled as the dcc system's attack card (`rollStrike`): a live battle's turns and reactions. |
| `check-roll.js` | Saves and checks rolled as the dcc system's cards (`rollSave`, `rollCheck`): a live battle's turns. |
| `damage-roll.js` | A spell's damage rolled as the dcc system's Damage card (`rollDamage`): a live battle's turns. |
| `traits.js` | Personality defaults (below); `animalisticOf`, the core's `spec.animalistic` (a beast, or Intelligence 11 or less where the sheet says and no language; never a mindless one or a character). Pure. |
| `auto.js` | Setting a character up by itself: `dccHints` (playstyles), `dccTactics` ("Let this character decide"). Pure. |
| `leadership.js` | `rankDccLeaders`: Personality, a title (`FFDCC.Words.Title`), a cleric, level or Hit Dice. |
| `moves.js` | Help, Grapple and Hide actions; weak spots from a stat line's resistances. |
| `tied.js` | The module's setting. |
| `lore-move.js` | Temporary: the old Lore-Collector setting's value moved to the core's. |
| `statuses.js` | The dcc system's statuses as the engine's conditions (`SHEET_STATUSES`), and `leftBehind`. Pure. |
| `words.js` | `t(key)` for `FFDCC.*`, `conditionName`, the word lists (`wordList`, `saysWord`, over the core's), and `harmOf` (a weapon's damage kinds, by its formula and name). |

## Recognising things

DCC items carry no slugs or identifiers, so:
- **a class** is the class sheet's id: `system.details.sheetClass` (written the first time the sheet opens: "Warrior", "blaster", "sp-acrobat", "xcc-dwarf"), else the sheet chosen (`flags.core.sheetClass`, such as `dcc.DCCActorSheetWarrior`, for a pregen never opened), else the class name (classes.js);
- **a spell's results** are the table its item names (`system.results`), else the same spell by name in an installed book's spell packs (`spellKey`: "Neutralize Poison/Disease" is "Neutralize Poison or Disease"), else any results table of that name;
- **natural attacks, damage kinds, beasts, the mindless, cunning minds, titles and who speaks Common** go by name, through the word lists in `languages/en.json` (`FFDCC.Words.*`, each matched in the reader's language and in English): `Natural` and `NaturalHand` (a natural attack, and one that needs its hand), `Damage.piercing`, `.bludgeoning`, `.slashing`, `Beast`, `Mindless`, `Clever`, `Title`, `SpeaksCommon`, and for food `Bite`, `NoFlesh`, `Rations`. A natural attack that cost anything was bought, so it isn't one. The un-dead are also mindless when their notes say a `Mindless` word.

## The CombatantSpec

Beyond the core's usual fields, `toCombatantSpec` sets:
- `actionDice` (the first die also on `escapeWork.faces` when it isn't a d20), `deeds` (deeds.js, when the attack bonus is a die), `shieldBash` (a dwarf's) and `freeAttack` (an armed Brawler's), both a bonus action;
- `boosts`: `fleeting` (Fleeting Luck on the player's `flags.dcc.fleetingLuckValue`, or XCC's Mojo on the actor's `flags.xcc.mojo`; at most 20 counted), `luck` (`keep` up to 6; `per` 2 for a halfling; `faces` the thief's luck die; `allies` and `range` 30 for a halfling; `recovers` for a thief or halfling) and `spellburn` (for a caster that loses spells, from Strength, Agility and Stamina above 8);
- `sizeUp: {mod: Int, dc: 10}` (none for the mindless), `critAgainst` (a PC's Luck modifier), `diesAtZero` (any non-PC);
- `grapple` (attack bonus + the better of Strength and Agility; a monster's best melee bonus + Hit Dice), `escapeWork: {mod: grapple}`, `escapeDC: 10 + grapple`;
- `firstAid` (a PC: binding the wound), `fumble` (a PC's fumble die and table), `tooCute` (a Dungeon Hottie not yet saved this level), `acrobatics` (an Acrobat or Half-Elf), `reactions` (a Brawler's Toughness, a passive reduction on melee hits), `regen` and `fastHealing` (a monster's mending; `regen.burst` for a troll's);
- `iwr` with `exploit` (the weak spot), `social` (Personality pitches; intimidate takes the better of Personality and Strength; resisted at 10 + Will, deceive 10 + the better of Will and Intelligence, theft 10 + the better of Reflex and Intelligence), `theft` and `doorWork` (a thief's skills, else a PC's d10 and Agility), `initiative: {mod, die, stealth}`, `senses.lowlight` (infravision), `shield: null` (a DCC shield is in the AC), `conditions` (from the token's statuses), `creatureTraits` (`undead` or `humanoid`, and `armed` with a weapon in hand).

The adapter also gives `label` ("DCC", or "DCC / XCC" with the xcc module on), `canHandle` (Player and NPC actors), `term` (AC, HP), `resourceLabel` (Luck, Spellburn), `itemCatalog` (DCC's item types; no materials or rarities), `detectLeaders`, `deriveTraits`, `playstyleHints`, `tacticHints` and `biography` (`about`: occupation, title, XCC's casting, birth augur, a wizard's corruption, a monster's notes; `story`: a PC's notes and XCC's rewards notes; never patron, god, contacts or entourage).

## The rules (rules.js)

`dccRules` supplies:
- **Turn:** `mainPool` "action", `movement` "feet"; `turn(u)` (an action per action die, a bonus for a shield bash or a Brawler's free attack, its walk speed); `costOf`; `actionDie(u, n)`; `basicAction`, `talkCost`, `tauntCost`, `stealCost` and `firstAidCost` an action; `feintCost` nothing; `standCost` half a move.
- **Rolls:** `degreeOfSuccess` with `{faces, critOn, fumbleOn}` (the top of the die always hits; the crit range scales to the die; checks: a natural 1 fails, the top face of a d20 or bigger succeeds); `attackPenalty` 0; `minimumDamage` 1; `saveMultiplier` (a basic save halves, others negate); `critical` (parts unchanged: crits roll on a table); `applyIwr`; `fallDamage` (1d6 each 10 feet, uncapped); `resistShare` 0.5; `typical` (AC 11 + level/2, saves and skills level/2 + 1, DC 10 + level).
- **Situations:** `modifiers.attack` (conditions, charge +2, cover -2, firing into melee -1, +2 in melee at the prone, stunned or helpless, -4 when prone, range -2 and -4), `defense` (a charger -2, conditions), `save`, `check`, `steal`, `exposed`, `actionsLost` (stunned; an action spent on a duel); `handlesCover: true`; `conditionMods`, `conditionWeight`, `isImmune` (Disrespect and Draw Agro against the mindless, Turn Unholy's Hit Dice cap, no disarming a creature without a weapon); `optionWeight` (one in a hurry charges); `pullsBlow` (subdual); `usable` (no hiding beside a foe).
- **Reactions:** `opportunity` (a free attack at each foe that withdraws), `reactions` 99, `strayShot`, `duel`, `disengage` (acrobatics: half a move, DC 15, 20 for several).
- **Holds:** `defenseDc(target, "grapple", by)` (10 + its grapple, with `sizeEdge` both ways), `breakFree` (a grip whose grabber is known and of another size: the size edge on the roll; otherwise the core's own try), `bondsDC` 15, `escapeFrom` (Restrained: DC 15, a friend frees it with a check; XCC's Grappled: DC 15, only its own), `tiedStopsSpells` (the setting).
- **Dying and after:** `onDropped`, `onHealed`, `recoveryCheck`, `knockOut`, `recoverBody` (and Too Cute to Die), `firstAidDC` (21 - the patient's Luck), `canFirstAid` (a PC, once), `firstAid`, `persistentFlatCheck`.
- **Morale:** `morale(run, u)` (DC 11; groups by side and friend group). A rally's `mods.morale` and `mods.moraleAgain` are read only here: the core leaves mods keys it doesn't know alone.
- **Turn hooks:** `startTurn` (charge bookkeeping, duel cost, what a lifted sheet status brought), `afterRoll` (hidden ends on an attack; Fleeting Luck and Mojo; a Gnome's Mojo when its taunt lands).
- **Doors:** `door` (AC 15, 15 hit points, force and pick DC 15), `doorCosts`.
- **Write-back:** `capture(u)` (fleeting, tooCuteUsed, bleed, bledOut, body, lost, disapproval), `storyDamageType`.

## The books at run time (tables.js)

`DccTables` looks where the dcc system looks (`CONFIG.DCC.criticalHitPacks`, `mightyDeedsPacks`, `fumbleTable`, `layOnHandsTable`, `turnUnholyTable`, which the core books fill in), then every installed RollTable pack, then the world's tables; Babele's `originalName` counts. Mighty Deeds take one book's set. `entry(uuid)` reads a book entry a stat line links to (a troll's regeneration). Each lookup is cached for the session; a failure logs a warning and counts as none. Nothing is copied. The tests' tables are written for them in DCC's style; no book's text is quoted.

## Live battles (commit.js)

`SHEET_STATUSES` maps dcc statuses to engine conditions one for one, written and read back: `prone`, `stun` stunned, `paralysis` paralyzed, `sleep` asleep, `unconscious` (those three also incapacitated), `blind` blinded, `deaf` deafened, `silence` silenced, `fear` frightened, `restrain` held (also immobilized), `slowed` (XCC's palette), `disarmed` (the dcc system's), `invisible`, `poison` poisoned, `grappled` grabbed (also immobilized). A status missing from the palette isn't carried (`sheetCarries`), and the core keeps it. `conditionChoices` lists the sheet's conditions, then the core's without its `restrained` (DCC's is held).

`commitDccChanges` writes hit points, Luck, spellburn (Strength, then Stamina, then Agility, none below 3), Stamina lost to bleeding out, the ability lost when a body is found alive, disapproval, `system.class.tooCuteUsed`, Fleeting Luck or Mojo by this turn's change, statuses, death (and the combatant defeated), the fled hidden, a Surrendered effect, and spells lost (`system.lost`). With the dcc system's Death Clock on (`enableDeathClock`), `liveOwnership` returns `{recovery: true}` and the system marks the dying, counts their rounds and scars the saved itself. `commitConcession` (goods.js) pays in DCC's coins, change made, or hands over as many of a thing as agreed, set aside and out of any container. Every write returns an undo record for Rewind and Rewind This Encounter; its shape is at the top of commit.js.

Players' damage (API 19): `damageCard` (read-turn.js `readDccDamage`: an attack's damage roll, a Roll Damage button's or inline damage roll at its attack's target, a roll typed `[healing]`), `applyDamageCard` (commit.js `applyDccDamage`: the actor's `applyDamage`, times the multiplier, rounded down, damage at least 1; in a turn FastFighting plays, a strike's or a spell's card deals exactly the core's `amount`, the engine's sum after the target's stat line's immunities, half and double damage and its share of a save's, nothing at 0, as the system's `applyDamage` counts no resistances; the HP and combatant defeated in the undo record) and `appliesPlayerDamage` (the system's `autoApplyDamage`, unless dcc-qol is active).

Strikes (API 19): `rollStrike` (strike-roll.js `rollDccStrike`), every strike in a turn FastFighting plays and a reaction's: the weapon the strike's id names, through the actor's `rollWeaponAttack` with no dialog and the user's target set to the strike's target for the roll (theirs put back), read off the card in the `dcc.rollWeaponAttack` hook; the card is marked `dcc.damageApplied` and loses its `dcc.FleetingLuckEffect`, so the system's Auto-apply damage and Fleeting Luck leave it to FastFighting; `secret` puts it in the GMs' mode (`ChatMessage.applyMode`). A critical whose row multiplies the blow or rolls more damage returns `card: null`, so the core deals the sum rather than applying the attack card's own damage.

Saves and checks (API 19): `rollSave` and `rollCheck` (check-roll.js), every save and check in a turn FastFighting plays that the system has a roll for: the actor's own roller with no dialog, read off its card (`preCreateChatMessage`) and graded by `degreeOfSuccess` on the card's die. A save is `rollSavingThrow` (`frt`, `ref`, `wil`; the core's `fortitude`, `reflex`, `will` too). A check goes by `purpose` and the action's id, never the spec's `skill` (a label): `cast` is the spell's `rollSpellCheck` (`spellItem`) or the cleric's `rollSkillCheck("layOnHands" | "turnUnholy")`; `talk` is `rollAbilityCheck("per")`, `"str"` to intimidate where it's the better; `aid` (Hide) is a thief's `hideInShadows` or a halfling's `sneakAndHide`; `theft` a thief's `pickPockets`; `disengage` XCC's `acrobatics`. The rest is null, for the engine's dice: grapples and breaking free (opposed attack rolls), binding a wound (homebrew), anyone untrained, and a monster whose sheet keeps the default spell check while its stat line gives another. Never `{gm: true}`. While it rolls, the actor's cards lose `dcc.FleetingLuckEffect` and go to the GMs when `secret`; a cast's `system.lost` and `system.class.disapproval` updates are dropped (`preUpdateItem`, `preUpdateActor`), as commit.js writes both with the turn. The disapproval roll, mercurial magic, patron taint and action dice stay the system's.

A spell's damage (API 19): `rollDamage` (damage-roll.js `rollDccDamage`), for a spell a save resists or one that simply lands, once for all it catches. The core names the result the spell check reached as `"<actor id>.<item id>@<n>"` (its `casting.js` `tierActionsOf`); the adapter reads the spell's table again (`#spell`, with `#caster`, as for its spec) and takes that result's damage and missile count. A count with dice is rolled first (`Roll.create`, its own card, the spell's name on it); the damage, each missile's dice and caster level, through `game.dcc.DCCRoll.createRoll([{type: "Compound", formula}], rollData, {showModifierDialog: false})`, at least 1, posted as the Roll Damage button posts a weapon's (`dcc.RollType: "Damage"`, flavor `DCC.RollsDamageWith`); `byType` as rolled. Anything else is null: the engine's dice. Each target's share is applied with `applyDamageCard` and the core's `amount` (above). No `useAction`: the actions the core would ask about (spells, save and auto actions, buffs and heals with no check of their own) are spells, Lay on Hands, Help and XCC's Not in the Face. A spell or Lay on Hands shows on its check's results card; the dcc system has no card for Help or for an item that rolls nothing, Not in the Face is a toggle on the XCC sheet, and a monster's breath weapon is a weapon on its sheet (struck) or words in its stat line. Offered, it would only stop a turn to say so.

Surprise (API 19): `rules.surprise` (rules.js, the planner's Follow System): a side with hidden tokens lying in wait gets a surprise round (`by`, `round`).

## Personality (traits.js)

A player character starts from the core's `PC_BASELINE`, the usual hero at level 3 (`USUAL_LEVEL`), and each part moves it, shown in the trait's reason:
- a 0-level funnel peasant: `ZERO` (about 45 Tactical, 50 Brave, 35 Selfish, 55 Loyal); past that, its level;
- ability modifiers (`ABILITY_LEANS`): Intelligence and Agility for Tactical; Strength, Stamina and Luck for Brave; Personality's charm for Loyal (its force of will is in its Will save);
- its Will save against `usualWill(level)`, and its hit points against `usualHp(level, hit die, Stamina)`;
- its class by the class sheet's id (`CLASS_LEANS`, DCC's and XCC's: a cleric selfless, a thief or an XCC Criminal less so, a wizard a planner, a warrior or a Brawler bold, a Gnome its friends' shield; any other Specialist `SPECIALIST`); a class from another book by what it does (a deed die, spells);
- its alignment (`ALIGNMENT_LEANS`: Law's fellowship, Chaos's each for itself; a cleric's or Messenger's counts half again);
- its birth augur (`augurLean`): its Luck modifier at birth, × 1.5, on the trait its sign's rolls speak to: attacks, damage, AC or Fortitude Brave; skills (traps, secret doors), spell checks or initiative Tactical; turning the unholy, a selfless calling. A sign on Will says nothing more (the save has it). Its effect on the sheet, or the core book's for that sign;
- being in none of the world's parties (DCC's Party sheets), when the world keeps any: `NO_PARTY` (-8).

A monster: what its stat line says it is (the walking dead, a construct, a spellcaster), the kind the system files it as by its crit table (`monsterKind`; a humanoid's, giant's, dragon's or demon's table makes it one of the people, never a beast), its name only where those say nothing (`Beast`, `Mindless`, `Clever`); its Will save and alignment; what its stat line says (immune to fear, a demon or devil); any ability scores. The mindless never change.

## Set up by itself

`dccHints` (auto.js), by the class sheet's id, adds playstyle leanings: a Warrior Brawler and Tank; a Dwarf Tank and Relentless; a Thief (and each Specialist but the Acrobat) Thief, a little Wallflower; a Halfling Wallflower; an Elf or Wizard Un-Mundane and Lore-Collector; a Cleric or Messenger Enabler; a 0-level Fragile, a little Chicken. XCC: a Brawler Brawler; a Dungeon Hottie People-Pleaser; a Jammer Instigator; a Gnome Tank; an Athlete Brawler and DPS; an Acrobat Kiter. Lawful leans Moralist; Chaotic, Cruel and Wildcard. A stat line: the un-dead and the mindless Relentless, demons and devils Cruel, beasts Brawler.

### Let this character decide

`dccTactics` answers only where DCC says something, each with its reason (the system's words where it has them); the core reads the hidden scores for the rest.

A player character, by what its build clearly implies:
- **signature attack:** its two-weapon pair; else the weapon its class sheet marks (a Warrior's Lucky Weapon; XCC's deed, chosen or favored weapon), when it carries it; else a Brawler's fists; else, beside an untrained weapon, the one it's trained in (a funnel peasant's, its occupation's);
- **class:** its style (front line: Warrior, Dwarf, Cleric, Messenger, Brawler, Athlete, Half-Orc; skirmisher: Thief, Specialist, Halfling, Dungeon Hottie, Half-Elf; caster: Wizard, Elf, Blaster; a Gnome protects); its target (a Blaster goes for casters, a Gnome guards its friends); its specialty (strong for a Wizard, Blaster or Brawler; some for an Elf, Cleric, Messenger, Jammer, Gnome or Athlete); talk (a Dungeon Hottie first, a Jammer when it could work); a Thief uses consumables freely (it casts from scrolls and handles poison);
- **Luck:** a Thief's, Halfling's and Specialist's comes back each day: resources all out. Anyone else's is left to its nerve;
- **a Cleric or Messenger:** heals aggressively, rescues the dying, heals itself first when it gets back up; a chaotic one heals in balance and keeps fighting;
- **a deed die:** the shield answer "as it would anyway" (a DCC shield is in the AC, so the core alone would say never);
- **a Luck of 5 or less:** retreats when hurt;
- **a 0-level funnel peasant:** retreats when hurt, offers to leave, wants only not to be harmed.

A creature, by its stat line and Will:
- a spellcaster (spellcasting, a spell check, "Atk spells or ...") leads with spells; a flier skirmishes; the mindless and constructs hold the front line;
- the mindless and constructs go for the nearest, never talk, stay with the fight; with pack tactics, it goes for the weakest and hunts the rest;
- the un-dead, the mindless, constructs, the fearless and a Will of +10 or more (`UNBREAKABLE_WILL`) never flee; a beast flees when hurt; anyone else when losing (its Will shown);
- the mindless and beasts offer and want nothing, and avoid consumables; a beast never talks.

Its name counts only as far as the adapter read it where the system said nothing. It never gives a role: what its notes say (a highwayman's greed) reaches the core as biography keywords.

## Strings

Every word this module shows is in `languages/en.json`; the code holds keys, never the English. Translating takes only a copy of that file (see the core's docs on translating). The word lists (`FFDCC.Words.*`) are lists to translate, not prose.

`hardcoded-toEN.json` lists words that stay in English for now, whatever the reader's language: keys of `languages/en.json` (or a group, `"FFDCC.Cond"`) whose translation would contradict a game system that isn't translated yet. It has the date it was last updated (`lastUpdated`) and the list (`keys`), and is edited like the language files. The core applies it (`api.keepEnglish`).

## The reading (reading/en.json)

`reading/en.json` holds the words and patterns text.js reads the books' English by: a monster's stat line, the rows of crit, fumble and spell tables, a rider in a book's entry. text.js holds only what they mean (the engine's conditions, tags and numbers). The word lists for names (`FFDCC.Words.*`, words.js) stay in `languages/en.json`. Its sections:
- word tables: `numbers` (count words), `saveNames` (to DCC's `frt`, `ref`, `wil`), `damageTypes`, `notDamageTypes` (words before "damage" that aren't a kind of it), `kindJoiners`, `immunities` (a word, or its start, to the engine's tags), `rendCounts`, `entryStopWords`; `movement`, `materials` and `riderTraits` give a pattern for each of the engine's keys;
- patterns, by reader: `conditions` (by the condition's `FFDCC.Told` key, and `slay`), `outcome`, `saveVs` (by tag), `regenStops` (`[{pattern, before?}]`), `damage`, `rounds`, `targets`, `save`, `mods`, `fumble`, `spell`, `mending`, `statLine`, `auras`, `followUps`, `riders`;
- `parts`: pieces the patterns share, put in where a pattern says `{level}`, `{hp}`, `{eachRound}` or `{save}`; `wordBreak` splits a phrase into words. `{dice}` and `{formula}` are the code's (dice notation, `1d6`); `{mode}` is a `movement` pattern.

Patterns run on lower-case text (a few, such as `statLine.attack`, in any case); text.js gives the flags. What a pattern captures is named (`(?<dice>...)`, `(?<what>...)`; a name ending in `2` is a second place for it), so a translation may put the words in any order. A pattern that is missing, or doesn't compile, never matches.

**Translating:** copy the file to `reading/<lang>.json` (`de.json`) and change what reads differently; whatever it leaves out is the English. The files are merged section by section (reading.js `mergeReading`): in an object, the translation's entry replaces the English one of that name and adds any new one (so `numbers` reads both languages' words, and a pattern given replaces the English one); a list holds the translation's entries, then the English ones. `tests/reading-dcc.test.js` checks that every pattern compiles.

## Development

The tests import FastFighting Core from a checkout beside this one (`../FastFighting`; override with `FASTFIGHTING_CORE`, see vitest.config.js):

```
npm install
npm test
npm run test:reworded
```

`npm run test:reworded` (`vitest run --mode reworded`) runs every test with every word in the language files reworded (accented, in ⟦brackets⟧, placeholders and markup kept: tests/foundry-i18n.js), so no test depends on the wording. `tests/setup.js` gives each test a `game.i18n` that reads this module's and the core's `languages/en.json`, and reads the books by `reading/en.json` (`setReading`), as `tools/coverage.mjs` does.

CI (`.github/workflows/test.yml`) runs both on every push to main and every pull request, with the core checked out beside this repo. Pushing a `v*` tag (`release.yml`) tests, sets `version` and `download` in module.json, zips `module.json`, `scripts`, `languages`, `reading`, `hardcoded-toEN.json`, `README.md` and `LICENSE`, and publishes the release.
