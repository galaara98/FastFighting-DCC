# FastFighting DCC

> **AI use:** This module used AI in its creation.
> - **Programming:** I am a skilled programmer by profession, but AI was used heavily as a co-pilot.
> - **Strings:** ALL initial strings were proposed by a LLM to get the concepts out, ALL strings were  tracked to make sure they were re-written (for simple or ttrpg/game specific phrases, approved by) a native speaker.

Dungeon Crawl Classics support for [FastFighting Core](https://github.com/galaara98/FastFighting). It works in Xcrawl Classics worlds too, since the XCC module runs on the same system.

FastFighting Core knows no game's rules. It offers a large but fixed set of options (conditions, maneuvers, holds, reactions, resources, outcomes, morale, dying), and each system's helper maps its system into them. This module maps DCC's: a Mighty Deed becomes one of the core's maneuvers, Luck one of its resources, a crit table's row one of its outcomes. [How DCC maps onto FastFighting](#how-dcc-maps-onto-fastfighting) goes through each.

- **Foundry:** v14
- **System:** `dcc` 0.70 or later
- **Requires:** FastFighting Core 0.11.0 or later (API 31); the spell duel tables, Delay to counterspell, hearing a fight with Luck and bursts centered on their target need Core API 34

## Installation

Install FastFighting Core first, then this module from its manifest URL:

```
https://github.com/galaara98/FastFighting-DCC/releases/latest/download/module.json
```

Enable both in a DCC world.

## With and without the books

The module works from the free system alone. With the DCC or XCC core book installed, it reads the book's tables at run time (crits, fumbles, Mighty Deeds, spell results, Lay on Hands, Turn Unholy), wherever the dcc system's settings point, and copies nothing from it. Without a book, a crit adds the crit die as extra damage; Mighty Deeds, Lay on Hands and Turn Unholy use rough built-in versions, marked as guesses; and spells it can't read are left out.

Where DCC marks nothing (whether a weapon cuts or crushes, whether an attack is a bite), the module goes by name, using word lists in its language file.

## How DCC maps onto FastFighting

### Characters and monsters

The class is the character sheet chosen for the actor or its token, as in DCC and XCC; the rest comes from the character's own numbers (a deed die, its spells), so classes from other books work too.

Each weapon brings its to-hit, damage, range, action die, crit range, crit die and table, and fumble range. DCC doesn't say whether a weapon cuts, pierces or crushes, so the damage formula or the weapon's name does. A monster's stat line fills in what its sheet leaves out: attacks, damage kept in a description, "crit on 21+", immunities, infravision, fly and swim speeds, its real spell check. Its specials and its attacks' riders count too, where they say what they do: a poison's or a disease's save and what a failure costs (damage, a condition, death), extra damage with the blow, damage each round after it, a grab; saves it's better at; an aura with a save; rend after so many hits, constriction on one it holds; harm only from magic or silver weapons (a weapon with a bonus of its own, or a name that says so); damage reduction; never surprised. A rider it only names ("plus disease") is read from the creature's entry in the book, where the stat line links one. [docs/coverage.md](docs/coverage.md) counts how much of the books' monsters it reads.

Things carried that are thrown to harm, as their descriptions say (holy water, a lit flask of oil), are missile attacks, as many as the sheet has; holy water harms only the un-dead, demons and devils.

A special a monster's stat line names without stats ("or breath weapon", "breathe fire 3/day") is read from the creature's entry in the installed book: the save and its DC, the damage, the area and how often (so many a day; once an hour, which is once a fight; every so many rounds). One the entry doesn't spell out isn't used.

Natural attacks (a bite, claws, a slam, a Brawler's fists) need no free hand, except fists, which need their own. A creature with no weapon in hand can't be disarmed, by a deed or a crit.

### Action dice: the core's turn

A creature gets one action for each action die: a giant its d24 then its d16, a high-level character its second die. Crit ranges scale to the die (19–20 on a d20 is 23–24 on a d24). Initiative rolls the system's die: a d20, a d16 with a two-handed weapon in hand, or a weapon's own. Springing an ambush (the core's stealth surprise), a thief rolls its Sneak Silently and Agility, a halfling its Sneak and Hide.

Two weapons set up as the primary hand and the off hand attack together for one action, on the dice the system steps down for each (Table 4-3), each hand with its own crit rule (no crits, or only on the die's highest face: a halfling's). A halfling fumbles only when both hands roll a 1.

### Mighty Deeds: the core's maneuvers, riding the blow

Anyone whose attack bonus is a die (warriors, dwarves) rolls it with every attack, adding it to the roll and the damage, and first declares the deed that would help most: trip, blinding attack, disarm, pushback, defensive maneuver or rallying maneuver, each one of the core's maneuvers riding the blow. It lands on a hit with a 3 or more on the deed die, doing more the higher the die shows: a trip knocks the foe down; a pushback shoves it back 5 feet, or 10 on a 5 or more.

Deeds come from the world's Mighty Deed tables, else rough built-in versions. A book's pushback rows are measured by the warrior: how far (so many feet, half its movement, a few feet) and how big a foe (as big as its token, or twice), and a foe too big isn't moved; a row that names no distance leaves the built-in one. With a missile weapon, a precision shot does what the book's table says (there's no built-in version). Warriors push where the push does harm (over a drop, into a hazard) and trip or blind on open ground.

A rally follows the world's rally table: so much to friends' morale checks, a second check for a hireling whose group has broken, and a bonus that waits on a kill or a crit (the friend's own, or the warrior's, as the row says). Without a table, friends nearby get a better next swing, more, and farther, at a higher deed.

### Crits and fumbles: the core's outcomes

A crit rolls the crit die plus Luck (and any crit adjustment its effects give, such as the Warrior's Arm) on the attacker's crit table, and the row becomes the core's outcomes: extra damage and a lasting effect (knocked down, stunned, blinded, disarmed, a penalty, sometimes death outright). A player character's Luck lessens a monster's crit against it. A player character's fumble rolls the fumble die (from its armor) on the fumble table, less any fumble adjustment (the Broken Star). Crit ranges follow the system's **Strict critical hits** setting: off, a range keeps its number on a bigger die (20-24 on a d24).

### Conditions and position: the core's, with DCC's numbers

| Condition | What it costs |
| --- | --- |
| Prone | -4 to its attacks; +2 to a melee attack at it |
| Blinded | -4 to its attacks, -2 AC |
| Frightened | -2 to its attacks and saves |
| Slowed | -2 to its attacks and AC |
| Disarmed | -4 to its weapons' blows (not its claws or fangs) |
| Hidden | +4 AC |
| Behind cover (walls hide any of it) | -2 to hit it, melee or missile; DCC has no degrees of cover, and cover adds nothing to saves |

A charge (a melee attack after moving at least half its speed that turn) is +2 to hit, and -2 AC until its next turn. A shot into a melee is at -1, and half its misses go toward a random friend of the shooter's in that melee, attacked again. A creature pushed over a drop takes 1d6 for each 10 feet, with no upper limit, and lands prone.

### Free attacks, spell duels and Toughness: the core's reactions

A creature that withdraws from a melee gives every foe engaged with it a free attack. An XCC Brawler's Toughness takes so much off every melee blow.

A caster yet to act this round may answer a foe's spell that worked with one that counters it: the same spell, Dispel Magic, Fire Resistance against a fire spell, Magic Shield against Magic Missile, Invoke Patron against Invoke Patron (never one lost for the day). Answering costs the caster its next action. A caster first in the order with such a spell delays until after the foe's caster, as the book allows, to be able to answer; nothing else delays, and DCC has no Ready.

With the core book installed, the duel is played by its tables, read at run time: the two checks pick the die (Spell Duel Check Comparison), the winner of the exchange gains a point of momentum (each caster starts at 10), and the die plus the winner's momentum over the loser's picks the Counterspell Power row. Each spell then goes on at its check, at a lower one where the row subtracts a die (a weaker result from its own table, or nothing below its lowest), turned back on its caster where the row reflects it, or is cancelled. The answer lands at once, at the caster it answered. The same check is a Phlogiston Disturbance: both spells fail, and where the row says the casters lose rounds, they sit them out. The rest of a disturbance (planes, summonings, corruption) is the judge's: its row shows in chat. Two invocations of the same patron cancel. Without the book the checks are compared: higher, the spell is undone; a tie, neither stands; lower, or a failed check, the spell goes on.

### Grapples and bonds: the core's holds

A Grapple is DCC's opposed attack rolls: the attack bonus plus the better of Strength and Agility (a monster's best melee attack bonus plus its Hit Dice). The winner pins the foe in its grip. Breaking free is the same roll, an action on the action die, against 10 + the grabber's grapple. In both, the bigger adds its size's edge, by the tokens' sizes: twice the other's size, +4; three times, +8; four times, +16, and so on.

Bonds tied with whatever was to hand, Restrained (a web, a net, ropes) and XCC's Grappled with no grabber known are DC 15 to break. A friend beside a Restrained creature can tear it loose with the same roll. The **Tied up stops spells** setting says whether a creature tied up can still cast.

### Luck, spellburn, Fleeting Luck and Mojo: the core's resources

A player character burns Luck on a roll that falls short, more readily the more is at stake (a save against death, a spell, a friend bleeding out). A thief rolls its luck die for each point. A halfling's points count double, and it can spend them on a friend's roll within 30 feet. Wizards and elves spellburn Strength, Stamina and Agility on spell checks.

DCC's Fleeting Luck (when the world has it on: each player's, for all its characters) and XCC's Mojo (each crawler's own) are spent before Luck, a point for +1. A character's natural 20 earns its pool a point; a natural 1 on a d14 or bigger empties every pool. At most 20 points count: points come one at a time and a natural 1 takes them all, so a bigger pool was typed in.

### Spells: the core's spell actions

A spell check rolls the action die, and the spell's results table says what each result does: damage (so many missiles of so much each, too), a save or a hold (sleep, paralysis, a charm that turns the target to the caster's side, a command that costs it its turn), healing, or a blessing. A save's DC is the spell check. A wizard or elf loses the spell for the day on a failure; a cleric's failures widen its disapproval, and a natural roll inside the range fails. Monsters lose nothing. A spell from a stat-block importer that names no table is found by name in the installed books. A cleric's Lay on Hands (so many of the target's hit dice) and Turn Unholy (un-dead, demons and devils up to so many hit dice cower) follow their tables.

### Dying and mending: the core's downed creatures

Monsters and 0-level characters die at 0 hit points. Anyone else bleeds out for as many rounds as their level; healed in time, it loses a point of Stamina for good. After the fight, friends who hold the field roll the body of each fallen player character: a Luck check (a d20 at or under its Luck) finds it only unconscious, at 1 hit point, groggy, a point of Strength, Agility or Stamina gone for good.

A monster's stat line gives its regeneration ("regenerates 1d6 hp per round"; harm it doesn't regenerate from, such as fire, stops it for a turn) and its healing each round ("heal 2 hp per round"). At 0 hit points a regenerating monster is dead, unless its words say it regenerates even the round it's killed (a troll's): then it rolls a last burst, and if it was taken below 0 by less than that, it gets up again. A stat line that only names its regeneration (the core book's troll) takes the amount from the book entry it links to, when that book is installed.

### Morale: DCC's, in place of the core's

DCC's morale is for creatures; a character's is its player's. A group checks when its first falls and when half of it is down; a creature alone, when it has lost half its hit points. Whichever of the group acts next rolls for all: a d20 + its Will against DC 11 (a retainer adds its employer's Personality: the Friendly Team's leader's, else the best among the Friendlies). Under, the whole group flees. A warrior's rallying deed can add to the roll, or give one whose group has broken a second check: made, it stays while the rest run. The mindless and the fearless never break. The Statistician shows each roll.

### Areas: as DCC's spells describe them

A result that names an area's shape is laid on the map as DCC describes it, and catches everyone in it, the caster's friends too, unless it says it spares them ("all enemies within", "creatures of the caster's choice"):
- a radius is centered on the target, not snapped to a grid corner (DCC has no grid rule); "around him", it's round the caster, who isn't caught;
- a cone is as long and as wide at its end as the result says ("30' long and 10' wide" is a narrow cone); where the result gives no width, it's a quarter turn wide;
- a line is as wide as it says (5 feet where it doesn't);
- a diameter is a radius of half of it.
A result that names no shape ("all creatures within 30'") takes foes only, up to its count.

### Hearing a fight

A bystander hears a fight at DCC's difficulties: child's play (5) within 30 feet, a man's deed (10) past it, derring-do (15) past 60, a hero's work (20) past 120; a wall one step harder, two walls two; talk with no blow struck starts at 10 and doesn't carry through walls. Past 20, nothing's heard. A character listens with its Luck, as DCC has it; a monster with its wits. Spotting is Intelligence.

### Sizing a foe up: the core's Lore-Collector

A Lore-Collector with a mind (not the mindless or constructs) sizes a foe up with an Intelligence check against DC 10. When it works, its rolls against every foe of that sort are far likelier to land through its next turn, by FastFighting's **Lore-Collector advantage** setting.

### Personality, leadership and talking: the core's traits and standoffs

The members of the world's Party sheets start on the Friendly Team, unless their token is Hostile. A character born under the Guardian angel adds its birth Luck modifier to saves against traps (a token the GM marks as a hazard).

A player character starts as the usual hero, and its sheet moves each trait a little: a 0-level funnel peasant starts lower (about 45 Tactical, 50 Brave, 35 Selfish, 55 Loyal), and its level, abilities, Will save, hit points, class, alignment, birth augur and party (DCC's Party sheets) each count. A monster's traits come from what its stat line and crit table say it is (the walking dead, a construct, a spellcaster), its name only where those say nothing, then its Will, alignment and any ability scores. The mindless never change. Each trait's tooltip in the planner lists every part that moved it.

DCC has no social skills and keeps no rank, so a leader is someone with Personality, a title in its name (king, thane, captain ...), a cleric's standing, or experience.

A creature persuades, intimidates (with Strength, when better) and deceives with Personality, against Will. A sheet with no languages listed speaks Common if it's a character, one of the people by its crit table (a humanoid's, a giant's, a dragon's or a demon's), or an un-dead or other monster whose name says it speaks (a centaur, a ghoul; never a beast); with a crit table the system doesn't file, anything but a beast or the mindless.

### Money, deals and food

Coins are worth what the system says: a platinum piece 100 gold, an electrum piece 10. A team's cash is in gold. In a deal a creature hands over coins and what it carries put away, as many as agreed, never the weapon in its hand or the armor it wears. A player's deal rolls the check they pick: Personality, Strength, or a skill on the sheet; left to FastFighting, a bribe is Personality (XCC's Bribery expert where the sheet has it) and a demand the better of Personality and Strength. Dropped goods and the fallen's belongings lie in an Item Piles pile when that module is on, else in a pile of DCC's own (an NPC sheet that holds them).

DCC keeps no diet or size, so a beast that bites (by its weapons' names) eats meat, other beasts and the people anything, and the un-dead, constructs and demons nothing. A creature that dies leaves a **Fresh Corpse** (food for the hungry, by its token's size), or a **Rotten Corpse** if it's un-dead; constructs, demons and bodies of no flesh leave none. Rations are food by name.

### XCC classes

The Messenger plays as a cleric (holy acts with disapproval, turning the unholy, healing), each Specialist (Acrobat, Commando, Scout, Criminal and the rest) as a thief (backstab, a luck die). Others bring their own:
- **Brawler:** unarmed, two attacks together on a d16 each (a crit on a natural 16; no fumble on one alone); armed, a free unarmed attack on a d14 once a round besides its own. Its attack bonus, Strength and Luck (when it helps) go on its to-hit and its unarmed damage die. No crits in armor too heavy (a check penalty of -4 or worse).
- **Dungeon Hottie:** Not in the Face (a round spent defending: its bonus to AC until its next turn); Too Cute to Die (a failed body roll passes for a point of Luck, once a level; a live battle marks it used).
- **Jammer:** Disrespect, a performance check (Personality, level and Luck) its foe saves against with Will (the DC the check's average), or takes the Jammer's penalty (a step down the dice chain, counted as -2) to attacks, checks and damage for level + Personality rounds.
- **Jammer, too:** Lionize, a performance check (Personality, level and Luck) read on the XCC book's Lionization table: its bonuses for one friend within 60 feet, for the Jammer's level in rounds. Without the book, none.
- **Half-Orc:** Wild Attack with a melee weapon: its crit range down to the Half-Orc's wild crit range, and its Luck modifier (when it helps) on the roll and the damage; every foe in reach gets a free attack as it swings, and FastFighting weighs that before choosing it.
- **Gnome:** Draw Agro, the core's taunt: a check (Personality, level, and Luck when it helps) a foe within 60 feet saves against with Will, or spends its next turn going for the gnome or pays a step down the dice chain (two from 5th level) on its rolls against anyone else. Each attack it draws earns the gnome a point of Mojo.
- **Athlete:** wrestling, a grapple for 1d4 + Strength, not with a shield in hand (the armor with no fumble die). Its training die rolls with it like a deed die, onto the roll and the damage; it has its own crit range (none in armor too heavy), and a hit grabs.
- **Acrobat and Half-Elf:** acrobatics to get clear of a melee: half its move and a check, 15 to slip one foe, 20 for several; missed, the free attacks come.

The mindless pay no heed to Disrespect or Draw Agro.

### Homebrew

Where the rules say nothing, the module keeps to DCC's own mechanics:
- **Help:** a step up the dice chain, counted as +2 (as the Jammer's step down is -2), on a friend's next attack or check, at the foe beside the helper.
- **Hide:** a thief's Hide in Shadows (a halfling's Sneak and Hide), anyone else's untrained check (a d10 and Agility), against the sharpest eyes among its foes, never with a foe beside it. Hidden, it's -4 to hit, and its next attack catches its foe unready (a thief's backstab); it stays hidden until it attacks.
- **Binding a bleeding friend's wound** (only healing saves one in the rules): an action beside it, and the friend's own Luck decides, once, as rolling the body would. Made, it stops bleeding, still out, a point of Stamina gone for good.
- **Subdual:** any blunt blow, bare hands, or a weapon the system marks as dealing subdual damage knocks a foe out instead of killing it. A monster knocked out lies unconscious at 0, not dead, until something hits it again.

## Playstyles in DCC

Every perk a playstyle (or a tactics answer) can switch on does something here. Most play as in any system; these lean on DCC's own:

| Perk | In DCC |
| --- | --- |
| Hard to spot | Foes' attention slides off it, and it would rather **Hide**. |
| Spoiling | A warrior's or dwarf's **Mighty Deed**: it would rather trip, blind or disarm. Anyone else can **Grapple**. |
| Helping | **Help**; a cleric's Lay on Hands; a halfling's Luck for a friend. |
| Rallying | A warrior's rallying deed, more readily. |
| In a hurry | It **charges** in rather than shooting, and doesn't stop to hide or to slip a melee with acrobatics. |
| Acting first | Its initiative. |
| Weak spots | A monster's stat line: "half damage from piercing and slashing weapons" (a skeleton) leaves blunt harm a weak spot; "vulnerable to fire", double damage. |
| Thief, locked doors | A thief's Pick Pockets and Pick Lock; anyone else's untrained check (a d10 and Agility). Strength forces a door (DC 15). |
| Trap avoiders | A token the GM marks as a hazard. |
| Finishing the fallen | A character bleeding out; a foe knocked out, after the fight. |
| Sparing the fallen | **Subdual**, and it leaves the fallen be. |
| Mending, healing, rescue | A cleric's Lay on Hands and healing spells; **binding the wound** of a friend bleeding out. |

Tactics answers:
- **Shield or defending:** a DCC shield is already in the AC, so the answer goes to a warrior's or dwarf's defensive Mighty Deed: half again as readily, as it would anyway, or never.
- **Spell slots, focus and limited abilities:** how freely it burns Luck (and Fleeting Luck or Mojo) and spellburns: conserving, half as readily; all out, half again.
- **Magic and specialties** (an Un-Mundane character leans on them): spells, a cleric's Lay on Hands and Turn Unholy, and XCC classes' own (a Brawler's fists, a Hottie's Not in the Face, a Jammer's Disrespect, a Gnome's Draw Agro, an Athlete's wrestling). Weapons, Help, Grapple and Hide are what anyone could do; a warrior's deeds go with every blow.

## Set up by itself

The first time FastFighting sets a character up by itself (see the [core's README](https://github.com/galaara98/FastFighting)), DCC's sheet has its say. The class sheet suggests playstyles (a Warrior Brawler and Tank, a Halfling Wallflower, a Wizard Un-Mundane and Lore-Collector), and so do alignment (Lawful leans Moralist; Chaotic, Cruel and Wildcard) and a monster's stat line (the un-dead Relentless, demons and devils Cruel). Where DCC says something, the sheet answers "Let this character decide" too: a Warrior's Lucky Weapon as its signature attack, a Thief spending Luck freely (it comes back each day), a beast fleeing when hurt. The GM sees each answer and why, in orange under the question. [CODING_README.md](CODING_README.md#set-up-by-itself) lists them all. DCC's fights use no consumables yet, so that answer only shows in the survey.

## Live battles

In a live battle, each turn's changes go onto the tokens as the turn is played:
- hit points; death (and the combatant defeated); the fled hidden; a Surrendered effect on one that gave up;
- Luck and spellburn spent (spellburn from Strength, then Stamina, then Agility, none below 3), and Fleeting Luck or Mojo as the fight left it (on the player, or the crawler). With the system's Ability Score Log on, each loss is logged as what it was (Luck spent, spellburn, bleeding out, rolling the body);
- spells lost for the day, and a cleric's disapproval range;
- things thrown: the sheet's count down, the item gone at none;
- the Stamina lost to bleeding out, or, for a body rolled after the fight and found alive, the ability lost, Groggy, and no longer dead (with the dcc system's Death Clock on, the system marks the dying, counts their rounds and scars the saved itself);
- statuses put on or taken off, by the fight or by the GM in the Battle Vantage: Prone, Stunned, Paralyzed, Asleep, Unconscious, Blind, Deaf, Silenced, Frightened, Restrained (DCC's held), Invisible, Poisoned, and Disarmed (the dcc system's palette) or Slowed and Grappled (XCC's). Each turn the token's statuses are read back, so one the GM takes off is gone from the fight too. FastFighting keeps what DCC has no status for (turned, hidden, can't move, can't act on its own);
- the disposition of a creature whose side changed (won over: its new side; talked out of the fight: Neutral; a neutral that turned on the Friendlies: Hostile);
- what a creature hands over (or has stolen): coins, or things, as many as the deal says, set aside and out of any container;
- XCC's Disrespected and Agro statuses on whoever a Jammer disrespects or a Gnome draws, off when they wear off;
- in the chat, who got a buff no card names (a Help, a rallying deed), or, for one a player's character gave another while **Apply players' damage** is off, that the table settles it.

A player's damage roll at a creature FastFighting runs is applied at once or put before the GM in the Battle Vantage. Luck a player burns after the roll (from the card's menu) counts: a miss it lifts to the target's AC is a hit. The free attack at a foe withdrawing is a reaction each player sets to always, ask or never. **Apply players' damage** is greyed out while the dcc system's Auto-apply damage to target is on, as the system applies it then.

Every attack FastFighting plays, a free attack too, is rolled from the sheet as the dcc system's own attack card, damage and crit included; FastFighting applies its damage, not the system, counting what the target's stat line says about immunity, half and double damage. Saves in the turns it plays are rolled from the sheet too, and so are the checks the system has a roll for: spell checks (with the spell's results card), Lay on Hands, Turn Unholy, Personality for words, a thief's Hide in Shadows and Pick Pockets, a halfling's Sneak and Hide, and an Acrobat's Acrobatics. FastFighting counts the spell lost, the disapproval and the Fleeting Luck, not the system. A spell's damage is rolled once for everyone it catches, as the system's Damage card (the number of missiles first); each target takes its share, halved by a save where the spell says so, its stat line counted the same way.

Damage FastFighting rolls itself (a stray shot, a fall, a crit row's extra) shows as the system's Damage card. The chat menu's Apply Damage and Apply Healing are gone from every card FastFighting applies, so nothing is applied twice.

Rewind takes one turn back; Rewind This Encounter, all of it.

## Settings

It sets two of FastFighting's: **Max rounds** (4 to 12, 10 at first: DCC's fights are short and deadly) and **Lore-Collector advantage** (2.25× at first: sizing up costs the whole turn, but deed dice and Luck already swing a fight hard). A value set on this module's old Lore-Collector setting moves there by itself. Its own:
- **Tied up stops spells** (on by default): the rules don't say which spells need free hands, so this decides for all of them. On, a creature tied up can't cast; off, it can, and may cast instead of struggling against its bonds.

## Not played

What DCC's rules or data don't give FastFighting to play:
- **Reactions beyond the free attack.** DCC has no reaction economy: no Shield Block or Riposte to choose, and nothing a blow disrupts (a spell is one check).
- **Rerolls.** Luck adds to a roll, before or after it; it never buys a reroll, so no Hero Point-like spending.
- **Reloading, drawing and ammunition.** DCC's weapons keep no reload, capacity or ammunition link, and the rules give drawing a weapon no cost.
- **Recharges.** Nothing in DCC recharges on a roll or a crit. (A special whose entry says "every 1d4 rounds" comes back after that roll.)
- **Ready, minions commanded, effects that end with the turn, prepared slots.** DCC has no Ready action, no action spent to command a familiar or a hireling, no spell that lasts only to the end of its caster's turn, and no spell slots (a wizard loses a spell on a failed check instead). Delay is played only as the book gives it: to be in a position to counterspell.
- **The rest of a phlogiston disturbance:** pocket dimensions, alignment rifts, time running fast or backward, merged spells, summoned creatures and corruption are the judge's; the row shows in chat.
- **Bones broken in a fall** (a 6 on the dice): the rules leave what a broken bone costs to the judge.
- **What the book's disarm rows do to claws and teeth:** nothing to disarm; a creature with only natural attacks is never disarmed.
- **Consumables beyond things thrown to harm:** DCC's items keep no stats of their own (a potion's effect is only words, the judge's to apply).
- **Specials a stat line names but doesn't explain** ("heightened senses", "slime creature", "see below"; an XCC dragon's breath weapon), where the book's entry says nothing a fight can play either. [docs/coverage.md](docs/coverage.md) counts them.

Possible, not played yet:
- **Spell-like specials** a stat line names with uses ("charm 1/day", "heal 2/day", "plane shift 2/day"): they could be cast as the spell of that name, so many times.

## License

MIT for this module's code. Dungeon Crawl Classics is a trademark of Goodman Games; this module isn't affiliated with or endorsed by them.

---

Developer notes: [CODING_README.md](CODING_README.md). FastFighting itself: [FastFighting Core](https://github.com/galaara98/FastFighting) and its [developer docs](https://github.com/galaara98/FastFighting/blob/main/CODING_README.md). The numbers behind it all: [STATS_AND_FORMULAS_README](https://github.com/galaara98/FastFighting/blob/main/STATS_AND_FORMULAS_README.md).
