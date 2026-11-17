# Onosendai's Tool: Project Status

_Last updated: 17 Nov 2026 (late evening)_

## Overview

A vanilla HTML/CSS/JS single-page app: a searchable Diablo 4 database of uniques and legendary aspects, built from datamined game files. It needs no frameworks or build tools and is ready for GitHub Pages.

**Data version:** Season 15, game build **3.2.4.74043** (d4data commit of 29 Oct 2026). There is no Season 16 data yet.

## How it works

```
data/Item, data/Power, data/StringList  (+ d4data Affix roll values, GameBalance stat formulas and skill tags)
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

## Deployment 🚀

- **Repo:** https://github.com/YopOne/onosendais-tool (public, branch `main`)
- **Live site:** https://yopone.github.io/onosendais-tool/ (GitHub Pages from `main` /, rebuilds about a minute after each push)
- **Publishing a change:** `git add -A && git commit -m "…" && git push`. `gh` is installed at `/opt/homebrew/bin/gh` and signed in as `YopOne`. Commits use the GitHub noreply email (set in this repo's git config).
- **What's uploaded:** site files, `data/index/`, `data/sources/`, `tools/` and the docs (~1.2 MB). `.gitignore` excludes `d4data/` (31 GB), raw `data/Item`, `data/Power`, `data/StringList`, and the old scraper files.
- **After a data rebuild:** commit the new `data/index/codex.json` too, or the live site keeps the old data.
- **Browser testing:** `tools/webshot.swift` is a headless WebKit tool that loads a page, reports JS errors and saves a screenshot. Usage notes are at the top of the file.

## Built so far ✅

**Data pipeline**
- `tools/build_index.py` connects item files to their names and descriptions (StringList), their roll formulas (Affix files) and Power script formulas.
- Class restrictions come from `fUsableByClass`. The 8-entry order was checked against item filenames.
- QA/TEST fixtures and placeholder items are dropped: `QA_`/`TEST_`/`zz` ids, `PACTTEST_`, `*_test_*`, `Debug`, `[ph_` names, and any aspect or unique whose text is dev placeholder (`WIP`, `REDESIGN`, "(PH) I need a new design!"), together with that unique's S10 slot-swap copies.
- **Base stat values** (`gbidFormula`) come from `GameBalance/AttributeFormulas.gam.json`: each stat line keeps its formula's item-power ranges in `codex.gb`, and `app.js` picks the range for the item power.
- **Stat line labels** ("+2 to {Grenade} Skills", "Cold Resistance", "Fury Regeneration", "Stunned Enemies"): skill tag hashes come from `GameBalance/SkillTags.gam.json` + `StringList/SkillTagNames`; damage type, resource, DoT and CC numbers use small tables in `build_index.py` read off affix ids (e.g. `S04_Resource_Per_Second_Fury` = 1).
- Charm copies are kept as separate entries, so they can no longer replace the real gear item.

**Formula and text engine (`app.js`)**
- Evaluates `Affix_Value_N` rolls, static values, links to other affixes, `PowerTag` / `SF_N` script formulas and legendary rank scaling.
- Evaluates GameBalance stat formulas, including `IPower()` (item power) and `GetTotalAffixBonus()` (= 1, a plain roll). **Item power rules (from the user, 17 Nov):** a max-level unique is 850, an Ancestral one 900, and Mythics are always 900. A Mythic is crafted in the Cube from the same unique at 900; it keeps every affix, promoted to its maximum value. The Database View row switches Standard 850 / Ancestral 900 / Mythic (crafted); the Sandbox has an Item Power slider (default 850; Mythics ignore it). The current Cube recipe (`X2_HoradricCube_Bundle_UpgradeToMythic`) requires an Ancestral Unique, i.e. the 900 copy.
- Renders colour tags, conditionals and plural forms in the game text, plus `[expr|fmt|]` number formatting (e.g. `x[30 - 50]%`).
- 1,366 of 1,368 text lines render cleanly. The other 2 have typos in the game data itself.

**UI**
- **Navigation:** Database, Aspect Codex and Theorycraft Sandbox, switched instantly via hash routing.
- **Live search** over names and rendered effect text.
- **Filter buttons:** Class (8 classes), Rarity and Slot.
- **Tooltips:** in-game style on hover, keyboard focus and tap.
- **Slot mapping:** a `SLOT_MAP` dictionary in `app.js` turns item type IDs into Helm, Chest, Gloves, Pants, Boots, Amulet, Ring, 1H Weapon, 2H Weapon and Off-Hand.
- **Curation:** 357 uniques and 554 aspects are visible; 623 item entries are hidden:
  - 147 charm copies
  - 398 Season 10 slot swaps
  - 75 duplicate bases (e.g. Runewords)
  - 3 non-gear types
- **Availability filter** (Database): All / Obtainable now (864) / Legacy (47). A unique is legacy when neither the boss loot table nor a recipe lists it; aspects are never legacy.
- **Phone layout:** each filter group is one swipeable row, the nav scrolls to the active tab, long values wrap. Checked at 390px on all four views with no horizontal scroll.
- **Tooltips** that don't fit the window switch to a compact layout (wider, smaller text, no flavor quote) and may cover the HUD; if still too tall, the bottom fades out.
- **Theorycraft Sandbox:** pinned items with roll-quality, aspect-rank and item-power sliders, share links, and a viewer for the raw source JSON (hidden automatically when the raw folders aren't deployed, e.g. on GitHub Pages).
- **Crafted Mythic support:**
  - A Standard / Mythic view switch in the Database and a MYTHIC toggle per Sandbox entry.
  - Unique power gets +30% Unique Potency (`S14_Mythic_UniquePotency`, value read from the data) and keeps its roll. Values that ignore affix bonuses aren't boosted, and items that already apply potency in their own formula aren't boosted twice.
  - Base stats are set to max roll, and the three Mythic bonus lines are shown.

**Boss drop sources** _(added 17 Nov 2026)_
- `data/sources/boss_loot.json` is maintained by hand from the [Maxroll boss loot cheat sheet](https://maxroll.gg/d4/resources/boss-loot-table-cheat-sheet). The current copy is from Season 15, last updated 14 Oct 2026. It covers 11 bosses, the S15 capstone items with drop rates, Iconic Mythics and world-drop uniques.
- `build_index.py` tags items by name and warns about any name that matches no item. When it was added, all 298 names matched.
- In the UI, cards get a drop tag, tooltips get a "DROPS" line (key, location, trophy, Belial note) and there's a **Source** filter row. Boss names are searchable.
- Coverage: 310 of 357 visible uniques (including Craftable). The 47 others are mostly items you can't currently get: Crucible copies, April Fools items and other old or seasonal items. They make up the "Legacy" availability filter.
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
- **Horadric Cube: Unique → Mythic** section (from `X2_HoradricCube_UpgradeToUnique_*` and `X2_HoradricCube_Bundle_UpgradeToMythic`). Step 1: a white base with no affixes + 1 Enhanced + 10 Raw Primordial Dust → a Unique of that base (25 bases, each with a normal and an Ancestral recipe; an Ancestral 900 base gives a 900 Unique). Step 2 (`X2_HoradricCube_Bundle_UpgradeToMythic`): an Ancestral (900) Unique + 5 Resplendent Sparks → its Mythic, any slot. The recipe requires the Ancestral quality modifier; "affixes promoted to max" comes from the user. The `S14_HoradricCube_UpgradeToMythic_*` recipes (Pandemonium Fragments, `nMinItemPower: 850`) are Season 14 leftovers and aren't shown.

**Theme:** a hybrid of Monolith Gaming (red `#ff3131`, near-black backgrounds, red grid, Gemunu Libre) and Diablo (Cinzel, rarity colours, in-game tooltips). Slot icons are original line-art SVGs.

**Recently fixed**
- Chest and other gear items showing up as "Charms": dedupe now keys on item type.
- Eaglehorn missing because a `TEST_` copy replaced it.
- Rare formula functions in lowercase (`min`/`max`) now evaluate.
- The Sandbox's raw-file panels no longer collapse when the sliders move.

## Suggested next steps

1. Push the latest commits so the live site gets them (see Deployment).
2. In game, compare one crafted Mythic tooltip with the Sandbox (#2: bonus lines, potency maths, unique power roll).
3. Optional: show what an `Owner.*` value depends on (e.g. "scales with weapon damage") instead of a bare `#` (#4).

## Known issues / open items 🔧

| # | Issue | Status |
|---|-------|--------|
| 1 | **Browser testing:** all four views checked headless at 1400px and 390px (no JS errors, no horizontal scroll), plus Sandbox sliders, Mythic toggle, share-link pins and tooltips. | Done (17 Nov) |
| 2 | **Mythic rules partly assumed:** item power (900) and affixes promoted to max are confirmed by the user. Still open: (b) whether a mythic gets all 3 bonus lines or 1 of them (the 3 affixes have equal weight 100, but Unique Potency is in a different category from the other two); (c) ×1.3 multiplying rather than adding is inferred from 2 explicit formulas; (d) whether the unique power is also promoted to max (currently it keeps its roll, then +30% potency). | Compare one crafted mythic's tooltip against the game |
| 3 | **Base stat `#` values:** filled from GameBalance AttributeFormulas. Stat lines showing `#` went from 474 to 6: Razorplate and Edge Thorns use `SacredAffixScalarOffense()`, which the data never defines, and `S04_OverpowerDamage` has no value in the data. | Done (17 Nov) |
| 4 | **About 50 effect values show `#`:** they depend on live character stats (`Owner.*`, e.g. weapon damage). | Expected: can't be computed offline |
| 5 | **Old and unobtainable items:** now behind the Availability filter (Legacy = 47). Not hidden by default. | Done (17 Nov) |
| 6 | **Skill-tag names on stat lines:** resolved (skill tags, elements, resources, DoT and CC states). | Done (17 Nov) |
| 7 | **Ancestral:** a quality on drops (item power 900), not a separate entry in the data. It's now a Database View option instead of an always-empty rarity filter. | Done (17 Nov) |
| 8 | **Tooltip height:** compact layout and full-window placement; checked with the tallest tooltip in a 560px window. | Done (17 Nov) |
| 9 | **Test and placeholder items:** removed, plus 16 placeholder aspects and 3 placeholder uniques found during testing. | Done (17 Nov) |
| 10 | **Raw source panels on the live site:** hidden when the raw folders aren't deployed (probe at startup). | Done (17 Nov) |
| 11 | **Item power:** 850 normal / 900 Ancestral / 900 Mythic, confirmed by the user. | Done (17 Nov) |

## Files

| Path | Purpose |
|------|---------|
| `index.html`, `style.css`, `app.js` | The site |
| `tools/build_index.py` | Builds `data/index/codex.json` |
| `data/Item`, `data/Power`, `data/StringList` | Raw datamined source (Season 15) |
| `d4data/` | Full datamine repo; Affix roll data and SNO lookup |
| `tools/webshot.swift` | Headless WebKit screenshot and JS-error check (macOS). Python's `http.server` lets WebKit cache `app.js`, so serve with `Cache-Control: no-store` when re-testing edits |
| `README.md`, `.gitignore` | GitHub readme, and what's kept out of the repo |
| `tools/runes_recipes.py` | Runes, runewords and recipes for the codex |
| `data/sources/runes_maxroll.json` | Rune lair drops + current rune list (from Maxroll) |
| `data/sources/boss_loot.json` | Boss drop table (from Maxroll; hand-maintained) |
| `blueprint.md` | Current spec |
| `maxroll-d4-scraper/`, `scraper.py`, `database1.json` | Earlier iterations, not used by the current site |
