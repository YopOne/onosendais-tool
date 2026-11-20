# Onosendai's Tool

A fast, searchable Diablo IV database built from datamined game files: uniques, legendary aspects, runes, runewords and crafting recipes, with in-game item art, in-game style tooltips and a theorycraft sandbox.

Plain HTML, CSS and JavaScript. No frameworks, no build step for the site itself.

**Live:** https://onosendaistool.com

## Views

- **Home:** the landing page: live counts, a tile for each section, a card per class (its specialization and class-only uniques and aspects, with links to its items and skill tree) and recent updates.
- **Database:** every unique and Season 15 Soul Splinter with live search (the search also finds skills, Paragon boards and glyphs); class, rarity, slot, drop source and availability filters (obtainable now or legacy); and Standard (item power 850), Ancestral (900) and crafted-Mythic views.
- **Aspect Codex:** every legendary aspect, with how imprinting works (Codex of Power, amulet 150%, 2H weapon 200%).
- **Runes & Recipes:** all runes, a socket-runeword builder, Season 15 classic runewords and crafting recipes, including the Horadric Cube chain from a white item to a unique to a Mythic.
- **Skills & Paragon:** your class's skill tree, its specialization (Spirit Hall, Book of the Dead, Weapon Expertise…) with the game's layout, icons and text: spend points in skills and their upgrades (level gates, pick-one groups, rank caps), linked to the Sandbox build and its DAMAGE panel. Paragon boards too: attach boards at gates with rotation, path nodes from the start, rare-node thresholds and totals. Glyphs in each board's socket, with level, radius and their bonuses.
- **Theorycraft Sandbox:** pin items and aspects; set roll quality, aspect rank and item power; try aspects on an amulet or 2H weapon and uniques as crafted Mythics; modify uniques with Greater Affixes, rolled affixes, tempering, masterworking (to 25 + capstone) and Horadric Cube Transfiguration; socket gems, runes and splinters; a 6-slot skill bar; share a link.

Base stats come from the game's own balance tables, so values shown are the real in-game numbers for the chosen item power. Values that depend on your character (weapon damage, health-scaled Thorns and Life) show `#`.

## Updates

**20 Nov 2026**
- Skill tree drawn like the game: square skill icons in round sockets with a `0/15 +N` rank counter (gear ranks in blue) instead of names, round upgrade nodes, diamond variant nodes, small junctions, connectors in straight runs and 45° forks that turn red as you buy, a red trunk joining the clusters one by one down to the Ultimate, and each cluster root shows its category emblem from the game (eye = Basic, star = Core…). Laid out with the game's proportions, so nothing overlaps.
- Two kinds of Mythic: dropped, bought or made from 3 of the same Mythic (no equip limit) vs upgraded in the Horadric Cube from a 900 unique (only 1 can be equipped); set it under MYTHIC in the ⚒ item editor. New recipes: Horadric Cube 3 Mythics → 1 and Occultist Enchanting; ENCHANT in the item editor replaces one affix.
- Plain uniques get the slot bonus too (amulet ×1.5, 2H ×2; checked in game: Moloch's Beating Flame 30%, Red Sermon 120%). Unique charms can be Mythic quality (**M** on the charm socket) and get no slot bonus as a charm.
- Sandbox ↔ Skills links: SKILL BAR ↓ and TALISMAN ↓ jumps, buttons to the Skill Tree, Paragon and specialization tabs, ← SANDBOX in Skills & Paragon; hover the seal for its tooltip.
- Specialization tooltips follow your gear: Loyalty's Mantle with matching Spirit Hall choices, Spirit Potency tempers, The Hemat Stone on the Ritualist shard and similar boosts are in the numbers and listed; gear that mentions an Oath, Shard, Enchantment, etc. is shown with it.
- Shorter Sandbox share links, plus COPY FOR DISCORD: a tidy named link ("Onosendai build: Barbarian · …") instead of a long URL.
- Sandbox keeps one build per class in your browser: switch class and your build for that class comes back. Home class pictures open the Sandbox as that class.
- Class specialization panels use the game's own art and icons (Soul Shard crystals, Oath cards, Book of the Dead sigils, Spirit crests, Weapon Expertise disks…).
- New Home page: section tiles with game art, class cards and a What's New list. Fixed garbled characters in the page title and search box.
- Class specializations in Skills & Paragon: Rogue Specializations (Combo Points, Inner Sight, Preparation), Barbarian Weapon Expertise and Technique, Spiritborn Spirit Hall, Druid Spirit Boons and Spirit Bonding, Necromancer Book of the Dead, Sorcerer Enchantments, Paladin Oaths and Warlock Soul Shards, with game text, unlock levels, share links and the DAMAGE panel.
- Skill tags use the game's names (Judicator, Pyromancy, Darkness, Jaguar…), so "+N to Judicator Skills" and similar gear lines count; Oath and Spirit cards list their skills.
- Sandbox PARAMETERS: COPY LINK, COPY FOR DISCORD and CLEAR at the top, shorter hints, and the panel scrolls on its own if it's taller than the window.
- Sandbox: the Class picker is under the character sheet; the list of slots beside it is gone. On wide screens the Talisman sits beside the character sheet and the Skill Bar under it. Skill Bar slots use the controller buttons (A, X, Y, RB, LT, RT).
- The Sandbox title shows the class: its sigil and "Druid Builder" (etc.).
- Home lists the classes first, above the section tiles. Opening another page starts at its top.
- Sandbox on phones: the character sheet, Skill Bar and Talisman come first, above the sliders; Sockets (gem quality) has its own panel further down; tap an equipped item (gear or Talisman) for its tooltip, tap again to change it, hold to remove it (with UNDO).
- Fixes: tooltips open with a tap on iPhone (tap again or anywhere else to close); choosing a class in Skills & Paragon works on a page opened there; the data build gives identical files when nothing changed.

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
