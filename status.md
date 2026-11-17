# Onosendai's Tool: Project Status

_Last updated: 17 Nov 2026_

## Overview

A vanilla HTML/CSS/JS single-page app: a searchable Diablo 4 database of uniques and legendary aspects, built from datamined game files. It needs no frameworks or build tools and is ready for GitHub Pages.

**Data version:** Season 15, game build **3.2.4.74043** (d4data commit of 29 Oct 2026). There is no Season 16 data yet.

## How it works

```
data/Item, data/Power, data/StringList  (+ d4data/json/base/meta/Affix for roll values)
        │
        ▼  python3 tools/build_index.py   (~3s, standard library only)
data/index/codex.json   (~1 MB: raw templates, formulas, static values)
        │
        ▼  app.js (in the browser)
evaluates formulas · resolves Power script formulas · renders game text · filters · UI
```

- **Run locally:** `python3 -m http.server`, then open http://localhost:8000.
- **After replacing the `/data` folders:** run `python3 tools/build_index.py` again.
- **For GitHub Pages:** the site only needs `index.html`, `style.css`, `app.js` and `data/index/`. The raw folders (~575 MB) are only used by the Sandbox's "raw source files" viewer.

## Built so far ✅

**Data pipeline**
- `tools/build_index.py` connects item files to their names and descriptions (StringList), their roll formulas (Affix files) and Power script formulas.
- Class restrictions come from `fUsableByClass`. The 8-entry order was checked against item filenames.
- QA/TEST fixtures and placeholder items are dropped.
- Charm copies are kept as separate entries, so they can no longer replace the real gear item.

**Formula and text engine (`app.js`)**
- Evaluates `Affix_Value_N` rolls, static values, links to other affixes, `PowerTag` / `SF_N` script formulas and legendary rank scaling.
- Renders colour tags, conditionals and plural forms in the game text, plus `[expr|fmt|]` number formatting (e.g. `x[30 - 50]%`).
- 1,366 of 1,368 text lines render cleanly. The other 2 have typos in the game data itself.

**UI**
- **Navigation:** Database, Aspect Codex and Theorycraft Sandbox, switched instantly via hash routing.
- **Live search** over names and rendered effect text.
- **Filter buttons:** Class (8 classes), Rarity and Slot.
- **Tooltips:** in-game style on hover, keyboard focus and tap.
- **Slot mapping:** a `SLOT_MAP` dictionary in `app.js` turns item type IDs into Helm, Chest, Gloves, Pants, Boots, Amulet, Ring, 1H Weapon, 2H Weapon and Off-Hand.
- **Curation:** 363 uniques are visible; 632 entries are hidden:
  - 147 charm copies
  - 406 Season 10 slot swaps
  - 74 duplicate bases (e.g. Runewords)
  - 5 non-gear types
- **Theorycraft Sandbox:** pinned items with roll-quality and aspect-rank sliders, share links, and a viewer for the raw source JSON.
- **Crafted Mythic support:**
  - A Standard / Mythic view switch in the Database and a MYTHIC toggle per Sandbox entry.
  - Unique power gets +30% Unique Potency (`S14_Mythic_UniquePotency`, value read from the data) and keeps its roll. Values that ignore affix bonuses aren't boosted, and items that already apply potency in their own formula aren't boosted twice.
  - Base stats are set to max roll, and the three Mythic bonus lines are shown.

**Boss drop sources** _(added 17 Nov 2026)_
- `data/sources/boss_loot.json` is maintained by hand from the [Maxroll boss loot cheat sheet](https://maxroll.gg/d4/resources/boss-loot-table-cheat-sheet). The current copy is from Season 15, last updated 14 Oct 2026. It covers 11 bosses, the S15 capstone items with drop rates, Iconic Mythics and world-drop uniques.
- `build_index.py` tags items by name and warns about any name that matches no item. When it was added, all 298 names matched.
- In the UI, cards get a drop tag, tooltips get a "DROPS" line (key, location, trophy, Belial note) and there's a **Source** filter row. Boss names are searchable.
- Coverage: 287 of 363 visible uniques. The 76 "Unlisted" are mostly items you can't currently get: Crucible copies, Runewords, April Fools items and other old or seasonal items.
- **When Maxroll updates:** edit `boss_loot.json`, then run `python3 tools/build_index.py` again.

**Runes & Recipes view** _(added 17 Nov 2026, nav `03`, `#/runes`)_
- `tools/runes_recipes.py` (called by `build_index.py`) reads every rune from the game files (64 runes: 44 current, 12 of them new in Season 15, plus 20 legacy) and the recipe files in `d4data/json/base/meta/Recipe`.
- **Runes tab:** effect text, Offering, cooldown, overflow, runeword name part, where to get it (boss lairs, Cube recipes, Jeweler reroll) and what it's used in.
- **Runewords tab:** a builder for socket runewords (pick a Ritual + Invocation to see the name, both effects and Offering maths), plus 19 classic Cube runewords, all using Season 15 runes, with runes, bases and hover tooltips.
- **Recipes tab:** Season 15 rune chain (14), Legendary rune Cube recipes (9), Mythic crafting (11), Shroud of False Death (Jeweler), Season 15 Soul Splinter chains (8) and Wirt's Coins.
- **Database:** runeword items and Shroud of False Death show their recipe in the tooltip, and there's a "Craftable" Source filter. Grief is now visible: its special bases `Axe_Berserker_Axe` and `Sword_Phase_Blade` were mapped to 1H Weapon.
- **Where the game data corrected Maxroll:** Yul = 1× Moni (not Ur); there are two different "Tal" runes (the Season 15 Ritual is current, the old Invocation is legacy); Shroud of False Death has a Jeweler recipe.
- **Assumptions:** some recipe outputs are a loot table without a name in the data. The Season 15 chain outputs and Wirt's Coins are named from the recipe file names and marked "output from recipe name". Which runes are "current" comes from Maxroll's list.
- No recipe crafts the Season 15 uniques; they only drop in the capstone dungeons.

**Theme:** a hybrid of Monolith Gaming (red `#ff3131`, near-black backgrounds, red grid, Gemunu Libre) and Diablo (Cinzel, rarity colours, in-game tooltips). Slot icons are original line-art SVGs.

**Recently fixed**
- Chest and other gear items showing up as "Charms": dedupe now keys on item type.
- Eaglehorn missing because a `TEST_` copy replaced it.
- Rare formula functions in lowercase (`min`/`max`) now evaluate.
- The Sandbox's raw-file panels no longer collapse when the sliders move.

## Known issues / open items 🔧

| # | Issue | Status |
|---|-------|--------|
| 1 | **Only partly tested in a browser.** A headless WebKit harness loaded the Runes & Recipes view (all 3 tabs), the Database Source filter and a hover tooltip with no JS errors. The Sandbox and phone layouts haven't been checked. | Partly done |
| 2 | **Mythic rules partly assumed:** (a) base stats at max is the user's rule and isn't stated in the data; (b) the data doesn't say whether a mythic gets all 3 bonus lines or 1 of them; (c) ×1.3 multiplying rather than adding is inferred from 2 explicit formulas. | Compare one crafted mythic's tooltip against the game |
| 3 | **About 314 stat lines show `#`:** their values come from GameBalance item-power tables (`gbidFormula`) that aren't extracted. | Open: needs GameBalance parsing |
| 4 | **About 106 effect lines show `#`:** they depend on live character stats (`Owner.*`, e.g. weapon damage). | Expected: can't be computed offline |
| 5 | **Old and unobtainable items are still listed** (e.g. S12 "(Crucible)", S05 Infernal Hordes items, Runewords). There's no "currently obtainable" flag in the data. | Proposed: optional season-prefix filter |
| 6 | **Skill-tag names on some stat lines** fall back to a generic "Skill", because tag hashes aren't resolved. | Open |
| 7 | **Ancestral filter is always empty:** Ancestral is a roll quality on drops, not a separate entry in the data. The button is disabled with an explanation. | By design |
| 9 | **Test and placeholder items still visible:** Elias mummified finger, PvP Refresher, Pact Amulet (`PACTTEST_`), `[ph_Hope's Respite]`. The "Unlisted" Source filter shows them. | Open: tighten curation |
| 8 | **Tooltip height:** very long tooltips are cut off at the bottom of the screen. | Minor |

## Files

| Path | Purpose |
|------|---------|
| `index.html`, `style.css`, `app.js` | The site |
| `tools/build_index.py` | Builds `data/index/codex.json` |
| `data/Item`, `data/Power`, `data/StringList` | Raw datamined source (Season 15) |
| `d4data/` | Full datamine repo; Affix roll data and SNO lookup |
| `tools/runes_recipes.py` | Runes, runewords and recipes for the codex |
| `data/sources/runes_maxroll.json` | Rune lair drops + current rune list (from Maxroll) |
| `data/sources/boss_loot.json` | Boss drop table (from Maxroll; hand-maintained) |
| `blueprint.md` | Current spec |
| `maxroll-d4-scraper/`, `scraper.py`, `database1.json` | Earlier iterations, not used by the current site |
