# Onosendai's Tool: Project Status

_Last updated: 18 Nov 2026. Everything below is pushed and live._

## Overview

A vanilla HTML/CSS/JS single-page app: a searchable Diablo 4 database of uniques, legendary aspects, runes, runewords and crafting recipes, built from datamined game files. It needs no frameworks or build tools and runs on GitHub Pages.

**Data version:** Season 15, game build **3.2.4.74043** (d4data commit of 29 Oct 2026). There is no Season 16 data yet.

## How it works

```
data/Item, data/Power, data/StringList
  + d4data: Affix roll values, Aspect list, Recipes, GameBalance (stat formulas, skill tags), Global (constants)
  + data/sources: boss drops and rune locations (hand-maintained from Maxroll)
  + webp_icons/ (exported inventory art) + d4data Texture, Actor → data/icons/
        │
        ▼  python3 tools/build_index.py   (~3s, standard library only)
data/index/codex.json   (~1.1 MB: raw templates, formulas, static values, recipes)
        │
        ▼  app.js (in the browser)
evaluates formulas · renders game text · applies game rules · filters · UI
```

- **Run locally:** `python3 -m http.server`, then open http://localhost:8000.
- **After replacing the `/data` folders or updating `data/sources/`:** run `python3 tools/build_index.py` again.
- **For GitHub Pages:** the site only needs `index.html`, `style.css`, `app.js`, `data/index/` and `data/icons/`. The raw folders (~575 MB) are only used by the Sandbox's "raw source files" viewer, which hides itself when they're missing.

## Deployment 🚀

- **Repo:** https://github.com/YopOne/onosendais-tool (public, branch `main`)
- **Live site:** https://yopone.github.io/onosendais-tool/ (GitHub Pages from `main` /, rebuilds about a minute after each push)
- **Publishing a change:** `git add -A && git commit -m "…" && git push`. `gh` is installed at `/opt/homebrew/bin/gh` and signed in as `YopOne`. Commits use the GitHub noreply email (set in this repo's git config). `gh api repos/YopOne/onosendais-tool/pages/builds/latest` shows the Pages build status.
- **What's uploaded:** site files, `data/index/`, `data/sources/`, `tools/` and the docs (~1.2 MB). `.gitignore` excludes `d4data/` (31 GB), raw `data/Item`, `data/Power`, `data/StringList`, and the old scraper files.
- **After a data rebuild:** commit the new `data/index/codex.json` too, or the live site keeps the old data.
- **Browser testing:** `tools/webshot.swift` is a headless WebKit tool that loads a page, runs JS, reports JS errors and saves a screenshot (usage at the top of the file). Python's `http.server` lets WebKit cache `app.js` between runs, so when re-testing edits serve with a `Cache-Control: no-store` header. `requestAnimationFrame` and CSS transitions don't run in its hidden window.

## Game rules used (confirmed by the user, 17–18 Nov)

| Rule | Where it shows |
|------|----------------|
| A max-level unique is item power **850**, an Ancestral one **900**, Mythics are always **900**. | Database View: Standard 850 / Ancestral 900 / Mythic. Sandbox item power slider (default 850; Mythics ignore it). |
| A 900 unique is made in the Horadric Cube from a **900 white item with no affixes** (+ 1 Enhanced, 10 Raw Primordial Dust). | Recipes tab, "Horadric Cube: Unique → Mythic", step 1 |
| Only a **900 unique** can become a Mythic: unique + **5 Resplendent Sparks** in the Cube. It keeps every affix, **promoted to its maximum value** (the unique power too), then gets +30% Unique Potency and the Mythic bonus lines. | Recipes tab step 2; crafted Mythic view in Database and Sandbox |
| A **legendary aspect** gets **150%** on an amulet and **200%** on a two-handed weapon. Matches `flLegendaryAffixAmuletBonus` 0.5 and `flLegendaryAffixTwoHandBonus` 1 in `Global/globals.glo.json`. | Sandbox AMULET ×1.5 / 2H ×2 buttons per aspect; IMPRINT line in aspect tooltips |
| **Two kinds of Mythic.** Every Mythic either is **crafted** as an upgrade from a 900 unique, or **drops** as an Iconic Mythic (boss cheat sheet). **Only 1 crafted Mythic can be equipped at a time.** Iconic Mythics and random Mythics bought from the Blacksmith or Jeweler don't count as crafted. | Crafted-Mythic tooltips (MYTHIC line), original Mythic tooltips (EQUIP line), View hint, Sandbox warning when 2+ crafted Mythics are toggled |
| A **Mythic's unique power** gets the aspect slot bonus (**amulet ×1.5, 2H weapon ×2**) times the ×1.3 Unique Potency; a plain unique gets neither. Confirmed in game (18 Nov): **Moloch's Beating Flame** (amulet) 15–20% as a unique, **39%** as a crafted Mythic (20 × 1.5 × 1.3); **Red Sermon** (2H sword) max 60% → **156%** (60 × 2 × 1.3); **Elegy** (1H sword) max 50% → **65%** (50 × 1.3). | Mythic (crafted) view and Sandbox MYTHIC; SLOT BONUS line in those tooltips. Original Mythics (Grandfather, Selig…) flag their power `bIgnoreAffixBonuses`, so they're unchanged |
| Only legendary aspects can be imprinted: salvage a legendary at the Blacksmith to save its aspect to the **Codex of Power**, then imprint it on any **non-unique** item. **Unique powers can't be imprinted.** | Database and Aspect Codex subtitles; aspect tooltips |

## Built so far ✅

**Data pipeline (`tools/build_index.py`)**
- Connects item files to their names and descriptions (StringList), roll formulas (Affix files) and Power script formulas.
- Class restrictions come from `fUsableByClass`. The 8-entry order was checked against item filenames.
- **Base stat values** (`gbidFormula`) come from `GameBalance/AttributeFormulas.gam.json`: each stat line keeps its formula's item-power ranges in `codex.gb` (161 formulas), and `app.js` picks the range for the item power.
- **Stat line labels** ("+2 to Grenade Skills", "Cold Resistance", "Fury Regeneration", "Stunned Enemies"): skill tag hashes come from `GameBalance/SkillTags.gam.json` + `StringList/SkillTagNames`; damage type, resource, DoT and CC numbers use small tables read off affix ids (e.g. `S04_Resource_Per_Second_Fury` = 1).
- **Global constants** (`codex.globals`) from `Global/globals.glo.json`: aspect slot bonuses and the Sacred / Ancestral affix scalars (1.25 / 1.5).
- **Health-scaled stats:** `Thorns_Flat`, `Flat_Hitpoints_Max_Bonus`, `Flat_Hitpoints_On_Hit` and other stats with an `_Unscaled_By_Player_Health` twin store a fraction that the game scales with player health. They're flagged and show `#`. The `_Unscaled_` versions are real numbers and are shown.
- **Curation:** drops QA/TEST fixtures (`QA_`/`TEST_`/`zz` ids, `PACTTEST_`, `*_test_*`, `Debug`, `[ph_` names) and any aspect or unique whose text is dev placeholder (`WIP`, `REDESIGN`, "(PH) I need a new design!"), with that unique's Season 10 slot-swap copies. Charm copies are kept as separate entries so they can't replace the real gear item.

**Inventory icons (`tools/icons.py`, added 18 Nov)**
- `webp_icons/` (~13,000 frames, 115 MB, not in git) holds the game's inventory art, exported as `<atlas> [<atlas snoID>] - <frame index> <frame name>.webp`.
- How an item finds its picture: item `tInvImages[class]` (per-class art, e.g. unique armor; same class order as `fUsableByClass`) → Actor `hDefaultImage` → hash of the actor name → a webp whose frame name is the actor name. Then the base item, then a same-named item. Handles are `h = h*33 + c` over the lowercased frame name; `Texture/<atlas>.tex.json` lists each frame's `hImageHandle` in frame order.
- Only the icons in use are copied to `data/icons/<handle hex>.webp` (406 files, ~2.5 MB); the codex stores the handle as `ic`.
- Coverage: **all 357 visible uniques and all 64 runes.** Shown on cards (an icon well beside the name), in tooltips and the Sandbox (tooltip header), on rune cards and in rune chips.
- **Aspects have no icons yet:** their `hIconOverride` points to `2DUI_Aspect_*` atlases, which aren't in the export (it only has `2DInventory_*`). Add those atlases to `webp_icons/` and rebuild; they'll be picked up automatically.
- The build now takes ~18 s (it scans the Texture metadata).

**Formula and text engine (`app.js`)**
- Evaluates `Affix_Value_N` rolls, static values, links to other affixes, `PowerTag` / `SF_N` script formulas and legendary rank scaling.
- Evaluates GameBalance stat formulas, including `IPower()` (item power), `GetTotalAffixBonus()` (= 1, a plain roll) and the Sacred / Ancestral scalars.
- **Affix bonuses:** legendary aspects get the slot bonus; unique powers on Mythics get the same slot bonus (amulet ×1.5, 2H ×2) times Unique Potency (×1.3). Values flagged `bIgnoreAffixBonuses` get neither, and formulas that already apply potency aren't boosted twice.
- Renders colour tags, conditionals, plural forms and `[expr|fmt|]` number formatting (e.g. `x[30 - 50]%`). Stat templates also accept the game's `{vALUE}` spelling and a bracketed `{VALUE1}`.
- 1,366 of 1,368 effect lines render cleanly. The other 2 have typos in the game data itself.

**Database and Aspect Codex**
- Live search over names, effect text and boss names.
- **Filters:** Class (8), Rarity (Unique, Mythic, Legendary), Slot, Source (boss, S15 capstone, world drop, craftable, unlisted) and **Availability**: All / Obtainable now (864) / Legacy (47). A unique is legacy when neither the boss loot table nor a recipe lists it; aspects are never legacy.
- **View:** Standard 850 / Ancestral 900 / Mythic (crafted).
- **Slot mapping:** `SLOT_MAP` in `app.js` turns item type IDs into Helm, Chest, Gloves, Pants, Boots, Amulet, Ring, 1H Weapon, 2H Weapon and Off-Hand.
- **Curation:** 357 uniques and 554 aspects are visible; 623 item entries are hidden: 147 charm copies, 398 Season 10 slot swaps, 75 duplicate bases (e.g. Runewords) and 3 non-gear types.
- **Tooltips:** in-game style on hover, keyboard focus and tap. Tooltips that don't fit the window switch to a compact layout (wider, smaller text, no flavor quote) and may cover the HUD; if still too tall, the bottom fades out.

**Boss drop sources**
- `data/sources/boss_loot.json` is maintained by hand from the [Maxroll boss loot cheat sheet](https://maxroll.gg/d4/resources/boss-loot-table-cheat-sheet) (Season 15, updated 14 Oct 2026): 11 bosses, the S15 capstone items with drop rates, Iconic Mythics and world-drop uniques.
- `build_index.py` tags items by name and warns about any name that matches no item.
- Cards get a drop tag, tooltips a "DROPS" line (key, location, trophy, Belial note).
- Coverage: 310 of 357 visible uniques (including Craftable). The other 47 are mostly items you can't currently get (Crucible copies, April Fools items, old seasonal items) and form the Legacy filter.
- **When Maxroll updates:** edit `boss_loot.json`, then run `python3 tools/build_index.py` again.

**Runes & Recipes view** (`#/runes`, built by `tools/runes_recipes.py`)
- **Runes tab:** all 64 runes (44 current, 12 of them new in Season 15, plus 20 legacy) with effect text, Offering, cooldown, overflow, runeword name part, where to get them and what they're used in.
- **Runewords tab:** a socket-runeword builder (Ritual + Invocation → name, both effects, Offering maths) and 19 classic Cube runewords with runes, bases and tooltips.
- **Recipes tab:** Season 15 rune chain (14), Legendary rune Cube recipes (9), Mythic crafting at the Jeweler / Blacksmith (11), **Horadric Cube: Unique → Mythic** (2 steps, see Game rules), Shroud of False Death (Jeweler), Season 15 Soul Splinter chains (8) and Wirt's Coins.
- The `S14_HoradricCube_UpgradeToMythic_*` recipes (Pandemonium Fragments) are Season 14 leftovers and aren't shown; the current one is `X2_HoradricCube_Bundle_UpgradeToMythic`.
- **Where the game data corrected Maxroll:** Yul = 1× Moni (not Ur); there are two different "Tal" runes (the Season 15 Ritual is current, the old Invocation is legacy); Shroud of False Death has a Jeweler recipe.
- **Assumptions:** some recipe outputs are a loot table without a name in the data; those are named from the recipe file and marked "output from recipe name". Which runes are "current" comes from Maxroll's list. No recipe crafts the Season 15 uniques; they only drop in the capstone dungeons.

**Theorycraft Sandbox** (`#/sandbox`)
- Pin uniques and aspects; sliders for roll quality, aspect rank and item power; MYTHIC toggle per unique; AMULET / 2H toggles per aspect; share links (pins + class); raw source JSON viewer (local only).
- **Weapon loadout (18 Nov):** a Class picker (Auto = the one class all class-locked pins share) sets the weapon rules. **Barbarian:** 2H bludgeoning (Mace2H) + 2H slashing (Axe2H, Sword2H, Polearm) + two 1H (dual wield). **Rogue:** bow or crossbow + two daggers or swords. **Every other class:** a 2H, or a 1H + an off-hand (shield, focus, totem). Equipping a weapon unequips the ones it can't be used with (newest pins win) and shows a notice; a weapon the build's class can't use (wrong class, or a type with no slot, e.g. a shield for a Barbarian) is refused. A WEAPONS strip shows which pin is in which slot. Armor, jewelry and aspects aren't slot-checked.

**Layout and theme**
- Phones: each filter group is one swipeable row, the nav scrolls to the active tab, long values wrap. All four views checked at 390px with no horizontal scroll.
- Theme: a hybrid of Monolith Gaming (red `#ff3131`, near-black backgrounds, red grid, Gemunu Libre) and Diablo (Cinzel, rarity colours, in-game tooltips). Slot icons are original line-art SVGs.

## Suggested next steps

1. Optional: per-class weapon types for the generic rule (e.g. Sorcerers can't use a 2H axe); today any 1H/2H/off-hand type fits, only Barbarian and Rogue are type-checked. Also optional: slot limits for armor and jewelry (1 helm, 2 rings…).
2. Export the `2DUI_Aspect_*` atlases into `webp_icons/` and rebuild for aspect icons.
3. In game, compare one crafted Mythic tooltip with the Sandbox (#2: bonus lines, potency maths).
4. Optional: say what an `Owner.*` or health-scaled value depends on (e.g. "scales with weapon damage") instead of a bare `#` (#4).
5. Optional: show aspect slot values (amulet / 2H) directly in the Aspect Codex tooltip, not only in the Sandbox.
6. When Season 16 data lands in d4data: refresh `data/` and `d4data/`, update `data/sources/` from Maxroll, rebuild and push.

## Known issues / open items 🔧

| # | Issue | Status |
|---|-------|--------|
| 2 | **Mythic rules partly assumed.** Confirmed: item power 900, all affixes (incl. the unique power) promoted to max, the 5 Resplendent Sparks recipe. Still open: (b) whether a Mythic gets all 3 bonus lines or 1 of them (the 3 affixes have equal weight 100, but Unique Potency is in a different category from the other two); Confirmed 18 Nov: ×1.3 multiplies, and the slot bonus applies to Mythic unique powers (Elegy, Moloch's Beating Flame, Red Sermon). | Check (b) on any crafted Mythic in game |
| 12 | **Unique power minimum may differ from the data.** Moloch's Beating Flame: data `FloatRandomRangeWithIntervalUniqueAffixPityBonus(10, 0.13, 0.2)` = 13–20%, game shows 15–20%. The "pity bonus" may raise the minimum. One more example (e.g. Elegy's in-game range vs the data's 30–50%) would show whether it's a rule. | Compare unique ranges in game |
| 3 | **16 stat lines show `#`:** health-scaled stats (Thorns, flat Maximum Life, Life On Hit, Life per 5 Seconds) and `S04_OverpowerDamage`, which has no value in the data. Down from 474 before GameBalance parsing. | Expected |
| 4 | **About 50 effect values show `#`:** they depend on live character stats (`Owner.*`, e.g. weapon damage). | Expected: can't be computed offline |

**Closed 17 Nov:** #1 browser pass (desktop + phone, all views), #5 old items (Availability filter), #6 skill-tag names, #7 Ancestral (now a View option), #8 tooltip height, #9 test/placeholder items (plus 16 placeholder aspects and 3 uniques), #10 raw panels on the live site, #11 item power rules.

## Files

| Path | Purpose |
|------|---------|
| `index.html`, `style.css`, `app.js` | The site |
| `tools/build_index.py` | Builds `data/index/codex.json` |
| `tools/runes_recipes.py` | Runes, runewords and recipes for the codex |
| `tools/icons.py` | Links items, runes (and aspects) to inventory art; copies used icons to `data/icons/` |
| `data/icons/` | The icons the site shows (`<image handle>.webp`) |
| `webp_icons/` | Raw icon export, all atlases (not in git) |
| `tools/webshot.swift` | Headless WebKit screenshot and JS-error check (macOS) |
| `data/index/codex.json` | The built index the site loads |
| `data/sources/boss_loot.json` | Boss drop table (from Maxroll; hand-maintained) |
| `data/sources/runes_maxroll.json` | Rune lair drops + current rune list (from Maxroll) |
| `data/Item`, `data/Power`, `data/StringList` | Raw datamined source (Season 15; not in git) |
| `d4data/` | Full datamine repo: Affix, Aspect, Recipe, GameBalance, Global (not in git) |
| `README.md`, `.gitignore` | GitHub readme, and what's kept out of the repo |
| `blueprint.md` | The original spec |
| `maxroll-d4-scraper/`, `scraper.py`, `database1.json` | Earlier iterations, not used by the current site |
