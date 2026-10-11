# FastFighting DCC

Dungeon Crawl Classics support for [FastFighting Core](https://github.com/galaara98/FastFighting), the Foundry VTT module that resolves a battle by simulating it thousands of times, tells the story of one fight, and commits it with **Make it So**. It works in Xcrawl Classics worlds too (the XCC module rides on the same system).

- **Foundry:** v14
- **System:** `dcc` 0.70 or later
- **Requires:** FastFighting Core (API 5 or later)

## Installation

Install FastFighting Core first, then this module from its manifest URL:

```
https://github.com/galaara98/FastFighting-DCC/releases/latest/download/module.json
```

Enable both in a DCC world.

## What it reads

**Works from the free system alone,** and reads more when a book is installed. Without the DCC or XCC core book, crits add the crit die as extra damage, Mighty Deeds and the cleric's Lay on Hands and Turn Unholy use rough built-in versions (marked as guesses), and spells it can't read are left out. With a book installed, it reads that book's tables at run time, wherever the dcc system's own settings point. Nothing from a book is copied into this module.

- **Class:** the character sheet chosen for the actor or its token, which is how DCC and XCC pick a class. A sheet that has been opened records the class itself. For one that hasn't (an imported pregen), the class is read from the sheet chosen, then from the class name. Everything else comes from the character's own numbers (a deed die, spells and how they're cast), so classes from other books still work.
- **Attacks:** each weapon's to-hit, damage, range, action die, crit range, crit die and crit table, and fumble range. A monster's stat line fills in anything its sheet leaves out (attacks, damage kept in a description, "crit on 21+", immunities, infravision, fly and swim speeds, its real spell check).
- **Action dice:** one action for each (a giant's d24 then d16, a high-level character's second die). Crit ranges scale to the die.
- **Two-weapon fighting:** a weapon set up as the primary hand and one as the off hand attack together, one action for both, on the dice the system steps down for each (Table 4-3), with each hand's crit rule (no crits, or only on the die's highest face: a halfling's).
- **Deed dice and Mighty Deeds:** warriors and dwarves (anyone whose attack bonus is a die) roll it with every attack, adding it to the roll and the damage. Before the roll they declare the deed that would help most:
  - trip;
  - blinding attack;
  - disarm;
  - defensive maneuver;
  - rallying maneuver: friends nearby take heart (a better next swing; more, and farther, at a higher deed).

  The deed lands on a hit when the die shows 3 or more, and does more the higher it shows. The deeds come from the world's Mighty Deed tables, else rough built-in versions.
- **Gaining an edge:** besides deeds, Luck (a halfling's for friends too), spellburn and blessings, a Lore-Collector sizes a foe up with an Intelligence check against DC 10; when it works, its next rolls against that foe are far likelier to land, by the **Lore-Collector advantage** setting (1.25× to 3×; default 2.25×: it costs the whole turn, but deed dice and Luck already swing a fight).
- **Crits and fumbles:** a crit rolls the crit die plus Luck on the attacker's crit table for extra damage and a lasting effect (knocked down, stunned, blinded, disarmed, a penalty, sometimes death outright). A monster's crit against a player character is lessened by that character's Luck. A player character's fumble rolls the fumble die (from its armor) on the fumble table.
- **Spells:** a spell check with the action die, its results table read into what each result does:
  - damage, including so many missiles of so much each;
  - a save or a hold (sleep, paralysis, a charm that turns the target to the caster's side, a command that costs it its turn);
  - healing;
  - a blessing.

  A save's DC is the spell check, as in the rules. A wizard or elf loses the spell on a failure. A cleric's failures widen its disapproval, and a natural roll inside the range fails. Monsters lose nothing. Spells from a stat-block importer that name no table are found by name in the installed books.
- **The cleric's own:** Lay on Hands (so many of the target's hit dice) and Turn Unholy (un-dead, demons and devils up to so many hit dice cower), by their tables.
- **Luck:** a player character burns Luck on a roll that falls short, more readily the more is at stake (a save against death, a spell, a friend bleeding out). A thief rolls its luck die for each point burned. A halfling's points count double, and it can spend them on a friend's roll within 30 feet. Wizards and elves spellburn Strength, Stamina and Agility on spell checks.
- **Dying:** monsters and 0-level characters die at 0 hit points. Anyone else bleeds out for as many rounds as their level, and if healed in time loses a point of Stamina for good. After the fight, friends who hold the field roll the body of each fallen player character: a Luck check (a d20 at or under their Luck) finds them only unconscious, at 1 hit point, groggy, a point of Strength, Agility or Stamina gone for good.
- **Personality:** a funnel peasant isn't a veteran. Monsters are read from what they are (beasts, the walking dead, giants, spellcasters), their Will save and their alignment.
- **Leadership:** Personality, a title (king, thane, captain ...), a cleric's standing, and experience.
- **Talking:** Personality for persuading, intimidating and deceiving, against Will.

## Make it So

Writes the drawn fight onto the tokens, as the confirmation dialog lists:
- hit points, death (and the combatant defeated), the fled hidden;
- Luck and spellburn spent;
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

## License

MIT for this module's code. Dungeon Crawl Classics is a trademark of Goodman Games; this module isn't affiliated with or endorsed by them.
