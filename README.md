# Onosendai's Tool

A fast, searchable Diablo IV database built from datamined game files: uniques, legendary aspects, runes, runewords and crafting recipes, with in-game style tooltips and a theorycraft sandbox.

Plain HTML, CSS and JavaScript. No frameworks, no build step for the site itself.

## Views

- **Database:** every unique with live search; class, rarity, slot, drop source and availability filters (obtainable now or legacy); and Standard (item power 850), Ancestral (900) and crafted-Mythic views.
- **Aspect Codex:** every legendary aspect, with how imprinting works (Codex of Power, amulet 150%, 2H weapon 200%).
- **Runes & Recipes:** all runes, a socket-runeword builder, Season 15 classic runewords and crafting recipes, including the Horadric Cube chain from a white item to a unique to a Mythic.
- **Theorycraft Sandbox:** pin items and aspects; set roll quality, aspect rank and item power; try aspects on an amulet or 2H weapon and uniques as crafted Mythics; share a link.

Base stats come from the game's own balance tables, so values shown are the real in-game numbers for the chosen item power. Values that depend on your character (weapon damage, health-scaled Thorns and Life) show `#`.

## Run locally

```sh
python3 -m http.server
# open http://localhost:8000
```

## Rebuilding the data

The site reads one prebuilt file, `data/index/codex.json`. To rebuild it after a game patch:

1. Get the datamine ([d4data](https://github.com/DiabloTools/d4data)) into `d4data/`, and copy its `Item`, `Power` and `StringList` JSON folders into `data/`. The build also reads `d4data/json/base/meta/` Affix, Aspect, Recipe, GameBalance and Global files.
2. Update the hand-maintained sources in `data/sources/` if needed (boss drops and rune locations from Maxroll).
3. Run `python3 tools/build_index.py` (standard library only), then commit the new `data/index/codex.json`.

See `status.md` for current progress and known issues, and `blueprint.md` for the original spec.

## Credits

Fan-made and not affiliated with Blizzard Entertainment. Diablo IV game text and data © Blizzard Entertainment. Boss drop and rune location data from the [Maxroll](https://maxroll.gg/d4) cheat sheets.
