# FastFighting DCC

> **AI use:** This module used AI in its creation.
> - **Programming:** I am a skilled programmer by profession, but AI was used heavily as a co-pilot.
> - **Strings:** ALL initial strings were proposed by a LLM to get the concepts out, ALL strings were  tracked to make sure they were re-written (for simple or ttrpg/game specific phrases, approved by) a native speaker.

Dungeon Crawl Classics support for [FastFighting Core](https://github.com/galaara98/FastFighting). It works in Xcrawl Classics worlds too, since the XCC module runs on the same system.

FastFighting Core knows no game's rules. It offers a large but fixed set of options (conditions, maneuvers, holds, reactions, resources, outcomes, morale, dying), and each system's helper maps its system into them. This module maps DCC's: a Mighty Deed becomes one of the core's maneuvers, Luck one of its resources, a crit table's row one of its outcomes. [How DCC maps onto FastFighting](#how-dcc-maps-onto-fastfighting) goes through each.

- **Foundry:** v14
- **System:** `dcc` 0.70 or later
- **Requires:** FastFighting Core 0.3.0 or later (API 18)

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

Each weapon brings its to-hit, damage, range, action die, crit range, crit die and table, and fumble range. DCC doesn't say whether a weapon cuts, pierces or crushes, so the damage formula or the weapon's name does. A monster's stat line fills in what its sheet leaves out: attacks, damage kept in a description, "crit on 21+", immunities, infravision, fly and swim speeds, its real spell check.

Natural attacks (a bite, claws, a slam, a Brawler's fists) need no free hand, except fists, which need their own. A creature with no weapon in hand can't be disarmed, by a deed or a crit.

### Action dice: the core's turn

A creature gets one action for each action die: a giant its d24 then its d16, a high-level character its second die. Crit ranges scale to the die (19–20 on a d20 is 23–24 on a d24). Initiative rolls the system's die: a d20, a d16 with a two-handed weapon in hand, or a weapon's own. Springing an ambush (the core's stealth surprise), a thief rolls its Sneak Silently and Agility, a halfling its Sneak and Hide.

Two weapons set up as the primary hand and the off hand attack together for one action, on the dice the system steps down for each (Table 4-3), each hand with its own crit rule (no crits, or only on the die's highest face: a halfling's).

### Mighty Deeds: the core's maneuvers, riding the blow

Anyone whose attack bonus is a die (warriors, dwarves) rolls it with every attack, adding it to the roll and the damage, and first declares the deed that would help most: trip, blinding attack, disarm, pushback, defensive maneuver or rallying maneuver, each one of the core's maneuvers riding the blow. It lands on a hit with a 3 or more on the deed die, doing more the higher the die shows: a trip knocks the foe down; a pushback shoves it back 5 feet, or 10 on a 5 or more.

Deeds come from the world's Mighty Deed tables, else rough built-in versions. A pushback always uses the built-in distances, because a book's pushback rows measure by the warrior's movement and the foe's size. Warriors push where the push does harm (over a drop, into a hazard) and trip or blind on open ground.

A rally follows the world's rally table: so much to friends' morale checks, and a second check for a hireling whose group has broken. Without a table, friends nearby get a better next swing, more, and farther, at a higher deed.

### Crits and fumbles: the core's outcomes

A crit rolls the crit die plus Luck on the attacker's crit table, and the row becomes the core's outcomes: extra damage and a lasting effect (knocked down, stunned, blinded, disarmed, a penalty, sometimes death outright). A player character's Luck lessens a monster's crit against it. A player character's fumble rolls the fumble die (from its armor) on the fumble table.

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

A caster yet to act this round may answer a foe's spell that worked with one that counters it: the same spell, Dispel Magic, Fire Resistance against a fire spell, Magic Shield against Magic Missile, Invoke Patron against Invoke Patron (never one lost for the day). The spell checks are compared: higher, the spell is undone; a tie, neither stands; lower, or a failed check, the spell goes on. Answering costs the caster its next action.

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

DCC's morale is for creatures; a character's is its player's. A group checks when its first falls and when half of it is down; a creature alone, when it has lost half its hit points. Whichever of the group acts next rolls for all: a d20 + its Will against DC 11 (a retainer adds its employer's Personality: the party leader's, else the best in the party). Under, the whole group flees. A warrior's rallying deed can add to the roll, or give one whose group has broken a second check: made, it stays while the rest run. The mindless and the fearless never break. The Statistician shows each roll.

### Sizing a foe up: the core's Lore-Collector

A Lore-Collector with a mind (not the mindless or constructs) sizes a foe up with an Intelligence check against DC 10. When it works, its next rolls against every foe of that sort are far likelier to land, by the **Lore-Collector advantage** setting.

### Personality, leadership and talking: the core's traits and standoffs

A player character starts as the usual hero, and its sheet moves each trait a little: a 0-level funnel peasant starts lower (about 45 Tactical, 50 Brave, 35 Selfish, 55 Loyal), and its level, abilities, Will save, hit points, class, alignment, birth augur and party (DCC's Party sheets) each count. A monster's traits come from what its stat line and crit table say it is (the walking dead, a construct, a spellcaster), its name only where those say nothing, then its Will, alignment and any ability scores. The mindless never change. Each trait's tooltip in the planner lists every part that moved it.

DCC has no social skills and keeps no rank, so a leader is someone with Personality, a title in its name (king, thane, captain ...), a cleric's standing, or experience.

A creature persuades, intimidates (with Strength, when better) and deceives with Personality, against Will. A sheet with no languages listed speaks Common if it's a character, one of the people by its crit table (a humanoid's, a giant's, a dragon's or a demon's), or an un-dead or other monster whose name says it speaks (a centaur, a ghoul; never a beast); with a crit table the system doesn't file, anything but a beast or the mindless. To end an argument it can hand over its coins, what it carries, and the weapons and shield in its hands, never the armor it wears.

### XCC classes

The Messenger plays as a cleric (holy acts with disapproval, turning the unholy, healing), each Specialist (Acrobat, Commando, Scout, Criminal and the rest) as a thief (backstab, a luck die). Others bring their own:
- **Brawler:** unarmed, two attacks together on a d16 each (a crit on a natural 16; no fumble on one alone); armed, a free unarmed attack on a d14 once a round besides its own. Its attack bonus, Strength and Luck (when it helps) go on its to-hit and its unarmed damage die. No crits in armor too heavy (a check penalty of -4 or worse).
- **Dungeon Hottie:** Not in the Face (a round spent defending: its bonus to AC until its next turn); Too Cute to Die (a failed body roll passes for a point of Luck, once a level; Do it For Real Now marks it used).
- **Jammer:** Disrespect, a performance check (Personality, level and Luck) its foe saves against with Will (the DC the check's average), or takes the Jammer's penalty (a step down the dice chain, counted as -2) to attacks, checks and damage for level + Personality rounds.
- **Gnome:** Draw Agro, the core's taunt: a check (Personality, level, and Luck when it helps) a foe within 60 feet saves against with Will, or spends its next turn going for the gnome or pays a step down the dice chain (two from 5th level) on its rolls against anyone else. Each attack it draws earns the gnome a point of Mojo.
- **Athlete:** wrestling, a grapple for 1d4 + Strength, not with a shield in hand (the armor with no fumble die). Its training die rolls with it like a deed die, onto the roll and the damage; it has its own crit range (none in armor too heavy), and a hit grabs.
- **Acrobat and Half-Elf:** acrobatics to get clear of a melee: half its move and a check, 15 to slip one foe, 20 for several; missed, the free attacks come.

The mindless pay no heed to Disrespect or Draw Agro.

### Homebrew

Where the rules say nothing, the module keeps to DCC's own mechanics:
- **Help:** a step up the dice chain, counted as +2 (as the Jammer's step down is -2), on a friend's next attack or check, at the foe beside the helper.
- **Hide:** a thief's Hide in Shadows (a halfling's Sneak and Hide), anyone else's untrained check (a d10 and Agility), against the sharpest eyes among its foes, never with a foe beside it. Hidden, it's -4 to hit, and its next attack catches its foe unready (a thief's backstab); it stays hidden until it attacks.
- **Binding a bleeding friend's wound** (only healing saves one in the rules): an action beside it, and the friend's own Luck decides, once, as rolling the body would. Made, it stops bleeding, still out, a point of Stamina gone for good.
- **Subdual:** any blunt blow, bare hands, or a weapon the system marks as dealing subdual damage knocks a foe out instead of killing it.

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

## Do it For Real Now

In a live battle, each turn's changes go onto the tokens as the turn is played:
- hit points; death (and the combatant defeated); the fled hidden; a Surrendered effect on one that gave up;
- Luck and spellburn spent (spellburn from Strength, then Stamina, then Agility, none below 3), and Fleeting Luck or Mojo as the fight left it (on the player, or the crawler);
- spells lost for the day, and a cleric's disapproval range;
- the Stamina lost to bleeding out, or, for a body rolled after the fight and found alive, the ability lost, Groggy, and no longer dead (with the dcc system's Death Clock on, the system marks the dying, counts their rounds and scars the saved itself);
- statuses put on or taken off, by the fight or by the GM in the Battle Vantage: Prone, Stunned, Paralyzed, Asleep, Unconscious, Blind, Deaf, Silenced, Frightened, Restrained (DCC's held), Invisible, Poisoned, and Disarmed (the dcc system's palette) or Slowed and Grappled (XCC's). Each turn the token's statuses are read back, so one the GM takes off is gone from the fight too. FastFighting keeps what DCC has no status for (turned, hidden, can't move, can't act on its own);
- the disposition of a creature whose side changed (won over: its new side; talked out of the fight: Neutral; a neutral that turned on the party: Hostile);
- what a creature hands over (or has stolen): coins, or an item, unequipped and out of any container.

A player's damage roll at a creature FastFighting runs is applied at once or put before the GM in the Battle Vantage. **Apply players' damage** is greyed out while the dcc system's Auto-apply damage to target is on, as the system applies it then.

Rewind takes one turn back; Rewind This Encounter, all of it.

## Settings

- **Lore-Collector advantage** (1.25× to 3×): how much likelier a Lore-Collector's rolls against a foe it has sized up are to succeed, through its next turn. Default 2.25×: sizing up costs the whole turn, but deed dice and Luck already swing a fight hard. Ordinary attacks get all they can by about 1.75×; the rest helps long-shot rolls (a hard AC, a hard talk).
- **Tied up stops spells** (on by default): the rules don't say which spells need free hands, so this decides for all of them. On, a creature tied up can't cast; off, it can, and may cast instead of struggling against its bonds.

## Not played

- What the book's disarm rows do to claws and teeth.
- The book's spell duel tables, with momentum and phlogiston disturbance (the checks are compared instead).
- A book's pushback rows (the built-in distances stand in).
- A rally bonus that waits on a kill or a crit, and a rally that only steadies nerves (the core can't weigh it yet).
- Bones broken in a fall (on a roll of 6).
- Precision shots (a Mighty Deed).
- The Jammer's Lionize (its table is the XCC book's) and the Half-Orc's Wild Attack.
- Consumables in a fight.

## License

MIT for this module's code. Dungeon Crawl Classics is a trademark of Goodman Games; this module isn't affiliated with or endorsed by them.

---

Developer notes: [CODING_README.md](CODING_README.md). FastFighting itself: [FastFighting Core](https://github.com/galaara98/FastFighting) and its [developer docs](https://github.com/galaara98/FastFighting/blob/main/CODING_README.md). The numbers behind it all: [STATS_AND_FORMULAS_README](https://github.com/galaara98/FastFighting/blob/main/STATS_AND_FORMULAS_README.md).
