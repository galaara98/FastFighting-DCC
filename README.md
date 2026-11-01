# FastFighting DCC

> **AI use:** This module used AI in its creation.
> - **Programming:** I am a skilled programmer by profession, but AI was used heavily as a co-pilot.
> - **Strings:** ALL initial strings were proposed by a LLM to get the concepts out, ALL strings were  tracked to make sure they were re-written (for simple or ttrpg/game specific phrases, approved by) a native speaker.

Dungeon Crawl Classics support for [FastFighting Core](https://github.com/galaara98/FastFighting), the Foundry VTT battle estimator, storyteller and resolver. Xcrawl Classics worlds work too.

## What it does

FastFighting predicts how a fight will go, plays the creatures you don't want to run by hand, and writes every turn back onto the sheets. This module teaches it DCC: action dice, Mighty Deeds, Luck and spellburn, crit and fumble tables, spell checks and disapproval, spell duels, bleeding out and rolling the body, and DCC's morale. XCC's classes, Fleeting Luck and Mojo are played too.

It works from the free system alone. With the DCC or XCC core book installed, it reads the book's tables as the system does and copies nothing from them.

## Why you'd want it

- **Before the fight:** see whether an encounter is a cakewalk or a funnel massacre.
- **During it:** let FastFighting run the monsters, or anyone whose player is away, rolled with the dcc system's own cards.
- **After it:** Rewind a turn or the whole encounter, sheets, chat and Death Clock included.

Where the rules leave a call to the judge, it uses DCC's own mechanics. [How DCC plays](docs/how-dcc-plays.md) has every rule and number.

## Requirements

- Foundry v14
- The `dcc` system, 0.70 or later
- FastFighting Core 0.15.0 or later

## License

MIT for this module's code. Dungeon Crawl Classics is a trademark of Goodman Games; this module isn't affiliated with or endorsed by them.

Developers: [CODING_README.md](CODING_README.md) and [FastFighting Core](https://github.com/galaara98/FastFighting).

## Installation

Install **FastFighting Core** first, then this module, and enable both in a DCC world:

```
https://github.com/galaara98/FastFighting-DCC/releases/latest/download/module.json
```
