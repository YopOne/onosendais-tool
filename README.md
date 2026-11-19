# Onosendai's Tool

A fast, searchable Diablo IV database built from datamined game files: uniques, legendary aspects, runes, runewords and crafting recipes, with in-game item art, in-game style tooltips and a theorycraft sandbox.

Plain HTML, CSS and JavaScript. No frameworks, no build step for the site itself.

**Live:** https://onosendaistool.com

## Views

- **Database:** every unique and Season 15 Soul Splinter with live search (the search also finds skills, Paragon boards and glyphs); class, rarity, slot, drop source and availability filters (obtainable now or legacy); and Standard (item power 850), Ancestral (900) and crafted-Mythic views.
- **Aspect Codex:** every legendary aspect, with how imprinting works (Codex of Power, amulet 150%, 2H weapon 200%).
- **Runes & Recipes:** all runes, a socket-runeword builder, Season 15 classic runewords and crafting recipes, including the Horadric Cube chain from a white item to a unique to a Mythic.
- **Skills & Paragon:** your class's skill tree with the game's layout, icons and text: spend points in skills and their upgrades (level gates, pick-one groups, rank caps), linked to the Sandbox build and its DAMAGE panel. Paragon boards too: attach boards at gates with rotation, path nodes from the start, rare-node thresholds and totals. Glyphs in each board's socket, with level, radius and their bonuses.
- **Theorycraft Sandbox:** pin items and aspects; set roll quality, aspect rank and item power; try aspects on an amulet or 2H weapon and uniques as crafted Mythics; modify uniques with Greater Affixes, rolled affixes, tempering, masterworking (to 25 + capstone) and Horadric Cube Transfiguration; socket gems, runes and splinters; a 6-slot skill bar; share a link.

Base stats come from the game's own balance tables, so values shown are the real in-game numbers for the chosen item power. Values that depend on your character (weapon damage, health-scaled Thorns and Life) show `#`.

## Updates

**19 Nov 2026**
- Search also finds skills, upgrades, Paragon boards, rare nodes and glyphs.
- Skills: tags in tooltips (incl. ones gear and variants add), your chosen upgrades and variant in the tooltip, gear skill ranks (skill, category, All Skills) added to tree points, upgrades and variants take 1 point.
- Sandbox: 6-slot skill bar; **M** button on gear slots to switch a unique to its crafted Mythic.
- Season 15 Soul Splinters in the Database and Jewelry sockets (4 tiers; duplicates' powers don't stack).
- Leoric's Crown: helm sockets count as Jewelry; its gem boost and Transfiguration Gem Strength multiply gems and splinters (matches Maxroll).
- Masterwork = item quality: every affix +1% per point (masterwork level + Transfiguration item quality).
- Anathema of the Primes: stacking bonus counted once, Demonform variants become Core and cost Wrath.
- Fixes: readable dropdowns and a usable search box on Windows; share links keep Mythics and splinters.

**18 Nov 2026**
- Skills & Paragon view, Talisman, item editor, damage model, paperdoll and Season 15 data (see `status.md`).

## Run locally

```sh
python3 -m http.server
# open http://localhost:8000
```

## Rebuilding the data

The site reads one prebuilt file, `data/index/codex.json`. To rebuild it after a game patch:

1. Get the datamine ([d4data](https://github.com/DiabloTools/d4data)) into `d4data/`, and copy its `Item`, `Power` and `StringList` JSON folders into `data/`. The build also reads `d4data/json/base/meta/` Affix, Aspect, Recipe, GameBalance and Global files.
2. Update the hand-maintained sources in `data/sources/` if needed (boss drops and rune locations from Maxroll).
3. Optional, for icons: put the exported inventory atlases (`.webp` frames named `<atlas> [<snoID>] - <frame> <name>.webp`) in `webp_icons/`. The build copies the ones it uses to `data/icons/`. Whole atlas sheets (`<atlas> [<snoID>].png`, e.g. the `2DUI_Aspect_*` and `2DUI_Talisman*` sheets) go in `2DUI/`; the build cuts the frames it needs with `cwebp` (Homebrew `webp`, or `winget install Google.Libwebp` on Windows). The Sandbox's class figures are game art, cut from each class's shop armor bundle sheet in `2DUI/` and written to `data/figures/<class>.webp` by the build (only when missing; delete one to re-cut it). The original SVG silhouettes in `data/figures/` are only a fallback when the sheets are missing.
4. Run `python3 tools/build_index.py` (standard library only), then commit the new `data/index/codex.json` and `data/icons/`.

See `status.md` for current progress and known issues, and `blueprint.md` for the original spec.

## Credits

Fan-made and not affiliated with Blizzard Entertainment.

©2026 Blizzard Entertainment, Inc. All rights reserved. Diablo, Diablo IV, and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc. in the U.S. and/or other countries. All game assets, images, and data remain the property of Blizzard Entertainment. Boss drop and rune location data from the [Maxroll](https://maxroll.gg/d4) cheat sheets.
