# FastFighting DCC

> **AI use:** This module used AI in its creation.
> - **Programming:** I am a skilled programmer by profession, but AI was used heavily as a co-pilot.
> - **Strings:** ALL initial strings were proposed by a LLM to get the concepts out, ALL strings were  tracked to make sure they were re-written (for simple or ttrpg/game specific phrases, approved by) a native speaker.

Dungeon Crawl Classics support for [FastFighting Core](https://github.com/galaara98/FastFighting), the Foundry VTT battle estimator, storyteller and resolver. Xcrawl Classics worlds work too.

The core plays every system with one fixed set of options: conditions, maneuvers, holds, reactions, resources and outcomes. This module maps DCC onto them: a Mighty Deed is a maneuver riding the blow, Luck a resource, a crit table's row an outcome.

- **Foundry:** v14
- **System:** `dcc` 0.70 or later
- **Requires:** FastFighting Core 0.15.0 or later

## With and without the books

It works from the free system alone. With the DCC or XCC core book installed, it reads the book's tables at run time (crits, fumbles, Mighty Deeds, spell results, spell duels, Lay on Hands, Turn Unholy) and copies nothing. Without a book, a crit adds the crit die as damage, deeds and cleric abilities use rough built-in versions, and spells it can't read are left out.

## What plays

**Characters and monsters.** The class comes from the actor's character sheet, the rest from its numbers, so other books' classes work. A monster's stat line fills what its sheet leaves out: attacks, crit ranges, immunities, poisons, auras, rend, magic or silver to harm. A special it only names ("breath weapon") is read from the book's entry. [docs/coverage.md](docs/coverage.md) counts how much it reads.

**Action dice.** One action per die, each with its crit range scaled to the die (per the system's **Strict critical hits** setting). Two-weapon fighting follows Table 4-3.

**Mighty Deeds.** The deed die rolls with every attack. The warrior declares the deed that helps most (trip, blind, disarm, pushback, defend, rally, precision shot), landing on a hit with a 3 or more.

**Crits and fumbles.** A crit rolls on the attacker's crit table, Luck added. A PC's fumble rolls its armor's fumble die on the fumble table, or on the weapon's own table where it names one (dcc 0.70.76 and Core 0.20.0).

**Combat.** DCC's penalties for prone, blinded, frightened, cover and the rest; charges; firing into melee, with misses that hit friends; falling damage; free attacks on a withdrawing foe; grapples as opposed rolls with size's edge.

**Luck and spellburn.** PCs burn Luck when a roll falls short, more readily the more is at stake: thieves with their luck die, halflings double and for friends. Wizards and elves spellburn. Fleeting Luck and XCC's Mojo are spent first.

**Spells.** Spell checks read each spell's results table. Wizards lose spells, clerics gain disapproval. Casters can counter a foe's spell, played by the book's spell duel tables when installed.

**Dying and morale.** Bleeding out, rolling the body after the fight, and DCC's morale checks in place of the core's. An NPC marked "Never checks morale" never breaks.

**XCC classes.** The Messenger plays as a cleric, Specialists as thieves, and the Brawler, Dungeon Hottie, Jammer, Half-Orc, Gnome, Athlete, Acrobat and Half-Elf use their own abilities.

## Homebrew

Where the rules are silent:
- **Help:** a step up the dice chain on a friend's next roll.
- **Hide:** a thief's Hide in Shadows, else an untrained check.
- **Binding a wound:** stops a friend's bleeding on that friend's Luck check.
- **Subdual:** blunt blows and bare hands can knock out instead of kill.

## Live battles

Each turn writes to the sheets: HP, statuses, Luck, spellburn, spells lost, disapproval, Stamina lost to bleeding, and side changes. The dcc system rolls the attacks, saves and checks with its own cards; FastFighting applies the damage. **Apply players' damage** is greyed out while the system's Auto-apply damage is on. With the Death Clock on, Rewind puts the clock and the Stamina back.

## Settings

It sets two core settings: **Max rounds** (4 to 12, 10 at first) and **Lore-Collector advantage** (2.25×). Its own: **Tied up stops spells** (on by default): whether a creature tied up can cast.

## What isn't played

- What DCC doesn't have: reactions beyond the free attack, rerolls, ammunition, recharges, Ready, spell slots.
- What's the judge's call: most phlogiston disturbances, broken bones, potions.
- Specials a stat line names without saying what they do, and spell-like specials ("charm 1/day").

## License

MIT for this module's code. Dungeon Crawl Classics is a trademark of Goodman Games; this module isn't affiliated with or endorsed by them.

Developers: [CODING_README.md](CODING_README.md) and [FastFighting Core](https://github.com/galaara98/FastFighting).

## Installation

Install **FastFighting Core** first, then this module, and enable both in a DCC world:

```
https://github.com/galaara98/FastFighting-DCC/releases/latest/download/module.json
```
