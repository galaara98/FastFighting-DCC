# FastFighting DCC

> **AI use:** This module used AI in its creation.
> - **Programming:** I am a skilled programmer by profession, but AI was used heavily as a co-pilot.
> - **Strings:** ALL initial strings were created by AI. An AI-made Spanish translation was used to test localization and has since been removed.

Dungeon Crawl Classics support for [FastFighting Core](https://github.com/galaara98/FastFighting), the Foundry VTT module that resolves a battle by simulating it thousands of times, tells the story of one fight, and commits it with **Make it So**. It works in Xcrawl Classics worlds too (the XCC module rides on the same system).

- **Foundry:** v14
- **System:** `dcc` 0.70 or later
- **Requires:** FastFighting Core (API 14 or later)

## Installation

Install FastFighting Core first, then this module from its manifest URL:

```
https://github.com/galaara98/FastFighting-DCC/releases/latest/download/module.json
```

Enable both in a DCC world.

## What it reads

**Works from the free system alone,** and reads more when a book is installed. Without the DCC or XCC core book, crits add the crit die as extra damage, Mighty Deeds and the cleric's Lay on Hands and Turn Unholy use rough built-in versions (marked as guesses), and spells it can't read are left out. With a book installed, it reads that book's tables at run time, wherever the dcc system's own settings point. Nothing from a book is copied into this module.

- **Class:** the character sheet chosen for the actor or its token, which is how DCC and XCC pick a class. A sheet that has been opened records the class itself. For one that hasn't (an imported pregen), the class is read from the sheet chosen, then from the class name. Everything else comes from the character's own numbers (a deed die, spells and how they're cast), so classes from other books still work.
- **Attacks:** each weapon's to-hit, damage (untyped: DCC's weapons don't say whether they cut, pierce or crush, and a name is no way to tell), range, action die, crit range, crit die and crit table, and fumble range. A monster's stat line fills in anything its sheet leaves out (attacks, damage kept in a description, "crit on 21+", immunities, infravision, fly and swim speeds, its real spell check).
- **Action dice:** one action for each (a giant's d24 then d16, a high-level character's second die). Crit ranges scale to the die.
- **Initiative:** the system's own die: a d20, a d16 with a two-handed weapon in hand, or a weapon's own. Springing an ambush (the core's stealth surprise), a thief rolls its Sneak Silently and Agility instead, a halfling its Sneak and Hide; anyone else, its initiative as ever.
- **Withdrawing and shooting into a melee:** a creature that withdraws from a melee gives every foe engaged with it a free attack. A shot into a melee is at -1; when it misses, half the time it goes toward a random friend of the shooter's in that melee, and the attack is made again against it.
- **Charging:** a melee attack after moving at least half its speed that turn is a charge: +2 to hit, and -2 AC until its next turn.
- **Spell duels:** a caster yet to act this round may answer a foe's spell that worked with one of its own that can counter it (the same spell, Dispel Magic, Fire Resistance against a fire spell, Magic Shield against Magic Missile, Invoke Patron against Invoke Patron; not one lost for the day). Its spell check against the caster's: higher, the spell is undone; the same, neither stands; lower, or its own check failing, the spell goes on. Answering costs it its next action. (The book's duel tables, with momentum and phlogiston disturbance, aren't played: the checks are compared.)
- **Two-weapon fighting:** a weapon set up as the primary hand and one as the off hand attack together, one action for both, on the dice the system steps down for each (Table 4-3), with each hand's crit rule (no crits, or only on the die's highest face: a halfling's).
- **XCC classes:** the Messenger plays as a cleric (holy acts with disapproval, turning the unholy, healing), each Specialist (Acrobat, Commando, Scout, Criminal and the rest) as a thief (backstab, a luck die). The Brawler fights with its fists: unarmed, two attacks together on a d16 each (a crit on a natural 16; no fumble on one alone), or, armed, a free unarmed attack on a d14 once a round besides its own; its attack bonus, Strength and Luck (when it helps) on its unarmed damage die; no crits in armor too heavy (a check penalty of -4 or worse). Its Toughness takes so much off every melee blow. More of XCC's classes' own:
  - **Dungeon Hottie:** Not in the Face (a round spent defending: its bonus to AC until its next turn), and Too Cute to Die (a failed body roll passes for a point of Luck, once a level; Make it So marks it used).
  - **Jammer:** Disrespect (a performance check, Personality, level and Luck, its foe saves against with Will, or takes the Jammer's penalty, a step down the dice chain counted as -2, to attacks, checks and damage for level + Personality rounds; the save's DC is the check's average; the mindless pay it no heed).
  - **Gnome:** Draw Agro (a check, Personality, level and Luck when it helps, its foe saves against with Will, within 60 feet; failed, the foe spends its next turn going for the gnome, or pays a step down the dice chain, two from 5th level, on its rolls against anyone else; the core's taunt. A point of Mojo each time it draws an attack; the mindless pay it no heed).
  - **Athlete:** wrestling (a grapple, not with a shield in hand, a shield being the armor with no fumble die: its training die rolled with it like a deed die, onto the roll and the damage, a d4 and Strength; its own crit range; a hit grabs).
  - **Acrobat and Half-Elf:** acrobatics to get clear of a melee: half its move and a check, 15 to slip one foe, 20 for several; missed, the free attacks come.
  - Not yet: the Jammer's Lionize (its table is the XCC book's) and the Half-Orc's Wild Attack.
- **Deed dice and Mighty Deeds:** warriors and dwarves (anyone whose attack bonus is a die) roll it with every attack, adding it to the roll and the damage. Before the roll they declare the deed that would help most:
  - trip;
  - blinding attack;
  - disarm;
  - defensive maneuver;
  - rallying maneuver: friends nearby take heart (a better next swing; more, and farther, at a higher deed).

  The deed lands on a hit when the die shows 3 or more, and does more the higher it shows. The deeds come from the world's Mighty Deed tables, else rough built-in versions.
- **Gaining an edge:** besides deeds, Luck (a halfling's for friends too), spellburn and blessings, a Lore-Collector sizes a foe up with an Intelligence check against DC 10 (anyone with a mind: not the mindless or constructs); when it works, its next rolls against that foe are far likelier to land, by the **Lore-Collector advantage** setting (1.25× to 3×; default 2.25×: it costs the whole turn, but deed dice and Luck already swing a fight; ordinary attacks get all they can by about 1.75×, the rest helps long-shot rolls). What it learns holds for every foe of the same sort.
- **Crits and fumbles:** a crit rolls the crit die plus Luck on the attacker's crit table for extra damage and a lasting effect (knocked down, stunned, blinded, disarmed, a penalty, sometimes death outright). A monster's crit against a player character is lessened by that character's Luck. A player character's fumble rolls the fumble die (from its armor) on the fumble table.
- **Spells:** a spell check with the action die, its results table read into what each result does:
  - damage, including so many missiles of so much each;
  - a save or a hold (sleep, paralysis, a charm that turns the target to the caster's side, a command that costs it its turn);
  - healing;
  - a blessing.

  A save's DC is the spell check, as in the rules. A wizard or elf loses the spell on a failure. A cleric's failures widen its disapproval, and a natural roll inside the range fails. Monsters lose nothing. Spells from a stat-block importer that name no table are found by name in the installed books.
- **The cleric's own:** Lay on Hands (so many of the target's hit dice) and Turn Unholy (un-dead, demons and devils up to so many hit dice cower), by their tables.
- **Luck:** a player character burns Luck on a roll that falls short, more readily the more is at stake (a save against death, a spell, a friend bleeding out). A thief rolls its luck die for each point burned. A halfling's points count double, and it can spend them on a friend's roll within 30 feet. Wizards and elves spellburn Strength, Stamina and Agility on spell checks.
- **Fleeting Luck and Mojo:** with DCC's Fleeting Luck on in the world (each player's, for all its characters), or XCC's Mojo (each crawler's own, always on), a character spends it before its Luck on a roll that falls short, a point for +1 (at most 20 counted: points come one at a time and a natural 1 takes them all, so more was typed in, not earned). A character's natural 20 earns its pool a point; a natural 1 on a d14 or bigger takes every pool there is. Make it So writes what's left back (on the player, or the crawler), and Undo puts it back.
- **Dying:** monsters and 0-level characters die at 0 hit points. Anyone else bleeds out for as many rounds as their level, and if healed in time loses a point of Stamina for good. After the fight, friends who hold the field roll the body of each fallen player character: a Luck check (a d20 at or under their Luck) finds them only unconscious, at 1 hit point, groggy, a point of Strength, Agility or Stamina gone for good.
- **Morale:** DCC's own, for creatures (a character's is its player's, as FastFighting plays it). A group checks when its first falls and when half of it is down; a creature alone, when it has lost half its hit points. One roll decides for the group, by whichever of it acts next: a d20 + its Will (a retainer adds its employer's Personality: the party leader's, else the best of the party's) against DC 11. Under, the whole group flees. The mindless and the fearless never break. The Statistician shows each roll.
- **Personality:** a player character starts as the usual hero (bold, loyal, unselfish, a good head) and everything on its sheet moves it a little:
  - a 0-level funnel peasant is no hardened hero (about 45 Tactical, 50 Brave, 35 Selfish, 55 Loyal before the rest); past that, its level;
  - its abilities: Intelligence (and Agility) for Tactical; Strength, Stamina and Luck for Brave; Personality's charm for Loyal (its force of will is in its Will save);
  - its Will save against the usual at its level, and its hit points against the usual for its level and hit die;
  - its class, by the class sheet (a cleric selfless, a thief or an XCC Criminal less so, a wizard a planner, a warrior or a Brawler bold, a Gnome its friends' shield); a class from another book by what it does (a deed die, spells);
  - its alignment (Law's fellowship, Chaos's each for itself; a cleric's or Messenger's counts half again: it serves that side's god);
  - its birth augur, by what the lucky sign governs (its effect on the sheet, or the core book's for that sign): a sign on attacks, damage, Armor Class or Fortitude for Brave; on traps, secret doors, spell checks or initiative for Tactical; on turning the unholy, a selfless calling; its Luck modifier at birth says how much, and which way;
  - whether it's in one of the world's parties (DCC's Party sheets), when the world keeps any.

  Monsters are read from what their stat line says they are (the walking dead, constructs, spellcasters), their Will save and their alignment, then what their stat line says (immune to fear, a demon or devil) and any ability scores they have. The mindless (constructs) never change. Never a monster's name: what it's called says nothing the system knows. Each trait's tooltip in the planner lists where it started and every part that moved it.
- **Leadership:** Personality, a title (king, thane, captain ...), a cleric's standing, and experience.
- **Talking:** Personality for persuading, intimidating and deceiving, against Will. A sheet with no languages listed speaks Common (every character; any creature the system files as one of the people, by the crit table it gave it: a humanoid's, a giant's, a dragon's or a demon's. The un-dead and other monsters speak only what their sheet lists). What it could hand over to end an argument: its coins, what it carries, and the weapons and shield in its hands; never the armor it wears.

## Playstyles in DCC

Every perk a playstyle (or a tactics answer) can switch on does something here. Most play as they do in any system (who a character goes for, when it loses heart, whom it listens to, how it talks). These lean on DCC's own:

| Perk (playstyles) | In DCC |
| --- | --- |
| Hard to spot (Chicken, Fragile, Wallflower) | Foes' attention slides off it, and it would rather **Hide**: a thief's Hide in Shadows (a halfling's Sneak and Hide); anyone else's an untrained check, a d10 and Agility; against the sharpest eyes among its foes, not with a foe beside it. Hidden, it's harder to hit (-4, as against what it can't see), and its next attack catches its foe unready (a thief's backstab), until it attacks. |
| Spoiling (Instigator most; Cruel, Wants to Lead, Wallflower, Puzzle-Maniac) | A warrior's or dwarf's **Mighty Deed**: it would rather trip, blind or disarm. Anyone else can **Grapple**: the rules' opposed attack rolls (its attack bonus and the better of Strength and Agility against the foe's), and won, the foe is pinned. |
| Helping (Enabler, People-Pleaser, Moralist, Martyr, Redeem-Seeker, Tank) | **Help**, a step up the dice chain (+2) on a friend's next attack or check, at the foe beside the helper; a cleric's Lay on Hands; a halfling's Luck for a friend. |
| Rallying (Wants to Lead, Martyr) | A warrior's rallying deed, more readily. |
| In a hurry (Impatient, Speed-Runner) | It **charges** in (a melee attack it moves for: +2 to hit, -2 AC), rather than shooting; it doesn't stop to hide or slip a melee with acrobatics. |
| Acting first (Instigator) | Its initiative. |
| Lore-Collector | An Intelligence check against DC 10. |
| Weak spots (Puzzle-Maniac) | A monster's stat line: "half damage from piercing and slashing weapons" (a skeleton) leaves blunt harm a weak spot; "vulnerable to fire", double damage. Weapons' harm is untyped, so only harm that says what it is (a Brawler's fists, a spell's fire) meets these. |
| Thief | A thief's Pick Pockets; anyone else's an untrained check (a d10 and Agility). The same for a lock. |
| Trap avoiders | A token the GM marks as a hazard. |
| Finishing the fallen (Cruel) | A character bleeding out; a foe knocked out, after the fight. |
| Sparing the fallen (Moralist, Peacekeeper, a Diplomat now and then) | **Subdual:** bare hands, or a weapon the system marks as dealing subdual damage, knocks a foe out instead of killing it; and it leaves the fallen be. |
| Mending, healing, rescue | A cleric's Lay on Hands and healing spells; **binding the wound** of a friend bleeding out. |
| Locked doors | Strength to force it; a thief's Pick Lock (anyone else's untrained). |

Tactics answers:

- **Shields:** a DCC shield is already in the AC; a warrior's or dwarf's defensive Mighty Deed goes as the answer says: half again as readily; as it would anyway; never.
- **Resources:** how freely it burns Luck (and Fleeting Luck or Mojo) and spellburns: conserving, half as readily; all out, half again.
- **Magic and specialties** (an Un-Mundane character leans on them): spells, a cleric's Lay on Hands and Turn Unholy, and XCC classes' own (a Brawler's fists, a Hottie's Not in the Face, a Jammer's Disrespect, a Gnome's Draw Agro, an Athlete's wrestling). Its weapons, Help, Grapple and Hide are what anyone could do; a warrior's deeds go with every blow it strikes.

**Homebrew** (the rules don't say; this module's reading, kept to DCC's own mechanics where it could):
- Help: a step up the dice chain, counted as +2, as the Jammer's step down counts as -2.
- Hide's DC (the foes' sharpest eyes), and what hidden does.
- Binding a bleeding friend's wound (only healing saves one in the rules): an action beside it, and its own Luck decides as rolling the body would (a d20 at or under its Luck), once. Made, it stops bleeding, still out, a point of Stamina gone for good, as if healed in time.
- Subdual by bare hands.

## Set up by itself

When FastFighting sets a character up by itself (the first time it sees it: see the core's README), DCC has its say:
- **Class, by the class sheet** (DCC's and XCC's):
  - a Warrior a Brawler or a Tank; a Dwarf a Tank, relentless; a Thief (and every XCC Specialist) a Thief; a Halfling a Wallflower; an Elf or Wizard Un-Mundane and a Lore-Collector; a Cleric or Messenger an Enabler; a funnel peasant Fragile;
  - XCC: a Brawler a Brawler; a Dungeon Hottie a People-Pleaser; a Jammer an Instigator; a Gnome a Tank; an Athlete a Brawler; an Acrobat a Speed-Runner.
- **Alignment:** Lawful leans Moralist; Chaotic, Cruel and Wildcard.
- **A monster's stat line:** the un-dead and constructs Relentless; demons and devils Cruel.
- **Keywords:** its occupation, title (XCC's casting), birth augur and a wizard's corruption, and a monster's notes, as what's said of it; a player character's notes (and XCC's rewards notes) as its story, counted a little. Never its patron, god, contacts or entourage: those are others.

### Let this character decide

What "Let this character decide" stands for (the GM sees each answer and why, in orange under the question) comes from the sheet wherever DCC says something; the core's reading of the hidden scores answers the rest.

A player character, by what its build clearly implies (the rest is its player's):
- **Its signature attack:** two weapons set up together (two-weapon fighting); else the weapon its class sheet names (a Warrior's Lucky Weapon; XCC's deed weapon, chosen weapon or favored weapon), when it carries it; else a Brawler's bare fists; else, beside a weapon it isn't trained in, the one weapon it is (a funnel peasant's, its occupation's).
- **Its class:** its fighting style (the front line for a Warrior, Dwarf, Cleric, Messenger, Brawler, Athlete or Half-Orc; a skirmisher for a Thief, Specialist, Halfling, Dungeon Hottie or Half-Elf; a caster for a Wizard, Elf or Blaster; a Gnome guards its friends); a Blaster goes for casters (it earns its Mojo bringing down magic users); how strongly it reaches for its own (spells first for a Wizard or Blaster, and a Brawler's fists; a little more often for an Elf, a Cleric or Messenger, a Jammer, a Gnome or an Athlete); a Dungeon Hottie talks first, a Jammer when it could work; a Thief, trained to cast from scrolls and handle poison, uses consumables freely.
- **Luck:** a Thief's, a Halfling's and a Specialist's comes back each day, so they spend it (and Fleeting Luck or Mojo) freely. Anyone else's burned Luck is gone for good: how freely is left to its nerve.
- **A Cleric or Messenger** keeps everyone topped up with Lay on Hands, drops everything for a friend bleeding out, and heals itself first when it gets back up. A chaotic one heals those who are hurting and keeps fighting: each for itself.
- **A deed die:** its defensive Mighty Deed as it would anyway (a DCC shield is already in the AC, so the core alone would say never).
- **A Luck of 5 or less:** it gets out when hurt (a body roll under its Luck would rarely save it).
- **A 0-level funnel peasant** runs when it's badly hurt: it dies at 0. To end an argument it offers to leave, and wants only not to be harmed.

A creature, by its stat line and Will:
- **The un-dead** never flee. **Constructs** (construct traits) don't either, and never talk, offer and want nothing, go for whoever's nearest, hold the line, stay with the fight, and use up nothing. One **immune to fear**, or with a Will no morale check can break (+10), never flees.
- **Pack tactics:** it gangs up on the weakest, and hunts down the rest.
- **Anyone else** checks DCC's morale when the fight turns against it (its Will shown).
- **A spellcaster** (spellcasting, a spell check, "Atk spells or ...") leads with its spells; **a flier** strikes and wheels away.
- **Not its name:** DCC keeps no creature types or roles, and a name says nothing the system knows (a wolf by its name is any creature: it checks morale, and has no words unless its sheet lists some). What its notes say of it, a highwayman's greed for one, reaches the core as its biography's keywords, and the core's offer and expectation follow from those.

Left to the core: anything the sheet doesn't speak to. (DCC's fights use no consumables yet: that answer is for the survey.)

## Make it So

Writes the drawn fight onto the tokens, as the confirmation dialog lists:
- hit points, death (and the combatant defeated), the fled hidden;
- Luck and spellburn spent, and Fleeting Luck or Mojo as the fight left it;
- spells lost for the day, a cleric's disapproval range;
- the Stamina lost to bleeding out, or the ability lost and Groggy when the body was rolled;
- statuses still on a creature (stunned, paralyzed, asleep, blinded, frightened, held, slowed, prone);
- the disposition of a creature whose side changed (won over: its new side; talked out of the fight: Neutral; a neutral that turned on the party: Hostile).

Undo puts it all back.

## Development

The tests import FastFighting Core from a checkout beside this one (`../FastFighting`; override with `FASTFIGHTING_CORE`):

```
npm install
npm test
```

The tables in the tests are written for them in DCC's style; no book's text is quoted.

Every word this module shows is in `languages/en.json`: the code holds keys, never the English. Translating it takes only a copy of that file (see **Translating** in the core README). `npm run test:reworded` runs the tests again with every word in the language files reworded, so they never depend on the wording.

`hardcoded-toEN.json` lists words that stay in English for now, whatever the reader's language: keys of `languages/en.json` (or a group, `"FFDCC.Cond"`) whose translation would contradict a game system that isn't translated yet. It has the date it was last updated (`lastUpdated`) and the list (`keys`). It's plain JSON, edited like the language files.

## License

MIT for this module's code. Dungeon Crawl Classics is a trademark of Goodman Games; this module isn't affiliated with or endorsed by them.
