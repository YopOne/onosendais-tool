# Onosendai's Tool

A fast, searchable Diablo IV database built from datamined game files: uniques, legendary aspects, runes, runewords and crafting recipes, with in-game style tooltips and a theorycraft sandbox.

Plain HTML, CSS and JavaScript. No frameworks, no build step for the site itself.

## Views

- **Database:** every unique with live search, class/rarity/slot filters, boss drop sources and a crafted-Mythic view.
- **Aspect Codex:** every legendary aspect.
- **Runes & Recipes:** all runes, a socket-runeword builder, Season 15 classic runewords and crafting recipes.
- **Theorycraft Sandbox:** pin items, set roll quality and aspect rank, and share a link.

## Run locally

```sh
python3 -m http.server
# open http://localhost:8000
```

## Rebuilding the data

The site reads one prebuilt file, `data/index/codex.json`. To rebuild it after a game patch:

1. Get the datamine ([d4data](https://github.com/DiabloTools/d4data)) into `d4data/`, and copy its `Item`, `Power` and `StringList` JSON folders into `data/`.
2. Update the hand-maintained sources in `data/sources/` if needed (boss drops and rune locations from Maxroll).
3. Run `python3 tools/build_index.py` (standard library only).

See `status.md` for current progress and known issues, and `blueprint.md` for the original spec.

## Credits

Fan-made and not affiliated with Blizzard Entertainment. Diablo IV game text and data © Blizzard Entertainment. Boss drop and rune location data from the [Maxroll](https://maxroll.gg/d4) cheat sheets.
