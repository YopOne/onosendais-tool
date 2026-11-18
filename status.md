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
- **Cache busting:** GitHub Pages sends `Cache-Control: max-age=600`, so browsers may keep an old `app.js`/`style.css` for 10 minutes. `index.html` loads them as `app.js?v=…` / `style.css?v=…`: **bump the `v=` value in `index.html` whenever `app.js` or `style.css` change.** (`codex.json` is fetched with `cache: "no-cache"`.)
- **Browser testing:** `tools/webshot.swift` is a headless WebKit tool that loads a page, runs JS, reports JS errors and saves a screenshot (usage at the top of the file). Python's `http.server` lets WebKit cache `app.js` between runs, so when re-testing edits serve with a `Cache-Control: no-store` header. `requestAnimationFrame` and CSS transitions don't run in its hidden window.

## Game rules used (confirmed by the user, 17–18 Nov)

| Rule | Where it shows |
|------|----------------|
| A max-level unique is item power **850**, an Ancestral one **900**, Mythics are always **900**. | Database View: Standard 850 / Ancestral 900 / Mythic. Sandbox item power slider (default 850; Mythics ignore it). |
| A 900 unique is made in the Horadric Cube from a **900 white item with no affixes** (+ 1 Enhanced, 10 Raw Primordial Dust). | Recipes tab, "Horadric Cube: Unique → Mythic", step 1 |
| Only a **900 unique** can become a Mythic: unique + **5 Resplendent Sparks** in the Cube. It keeps every affix, **promoted to its maximum value** (the unique power too), then gets +30% Unique Potency and the Mythic bonus lines. | Recipes tab step 2; crafted Mythic view in Database and Sandbox |
| A **legendary aspect** gets **150%** on an amulet and **200%** on a two-handed weapon. Matches `flLegendaryAffixAmuletBonus` 0.5 and `flLegendaryAffixTwoHandBonus` 1 in `Global/globals.glo.json`. | Sandbox AMULET ×1.5 / 2H ×2 buttons per aspect; IMPRINT line in aspect tooltips |
| **Two kinds of Mythic.** Every Mythic either is **crafted** as an upgrade from a 900 unique, or **drops** as an Iconic Mythic (boss cheat sheet). **Only 1 crafted Mythic can be equipped at a time.** Iconic Mythics and random Mythics bought from the Blacksmith or Jeweler don't count as crafted. | Crafted-Mythic tooltips (MYTHIC line), original Mythic tooltips (EQUIP line), View hint, Sandbox warning when 2+ crafted Mythics are toggled |
| **Talisman:** a seal in the centre unlocks up to 6 charm slots. Magic seal 3, Rare 4, Legendary 5 or 6 (the `Talisman_SealAffix_AdditionalCharmSlot` affix adds one), the Season 15 Annihilus charm 6, Mythic seals 6. Seals also roll power affixes and give charm set bonuses. A unique with a charm version (147 in the data, `Talisman_Charm_*`: unique power only) can go in a charm slot, so e.g. two helms can be used: one worn, one as a charm. | Sandbox GEAR and TALISMAN strips, seal picker, CHARM toggle |
| **Seal powers and unique charm limits** (from `Talisman_SealAffix_Ancestral_0N`, confirmed 18 Nov): **Seal of the Diamond Mind** reduces every set bonus by 1 charm (min 2: tiers 2/3/5 → 2/2/4). **Seal of the Golden Epiphany** allows 3 unique charms. **Seal of the Severed Finger** allows 2 unique charms but at most 5 slots. Other seals allow 1 unique charm (implied by those texts). **Hellfire Torch** (S15 Mythic charm): +1 Unique Charm, 10–20% All Stats, 10–20% All Resistance, +1–4 All Skills; it takes a slot and counts as a unique charm itself (assumed). **Annihilus** is a seal with All Stats, All Resistance, +5–10 All Skills, Bonus Experience. | Talisman: seal power box, UNIQUE CHARMS x / y, limit warnings, Torch in the charm picker, reduced tier counts shown with the original struck through |
| **Class weapon types** (ItemType `fUsableByClass`, in `codex.itemTypes`, 18 Nov): focus → Sorcerer, Necromancer, Warlock; book → Sorcerer, Necromancer; totem → Druid only; shield → Necromancer, Paladin; wand → Sorcerer, Necromancer; scythe (1H/2H) → Necromancer; staff → Sorcerer, Druid; glaive, quarterstaff → Spiritborn; polearm → Druid, Barbarian, Spiritborn; bow, crossbow → Rogue; 2H sword → Barbarian, Necromancer, Paladin, Warlock. Spiritborn has no 1H or off-hand (2H only). A focus, book or totem takes weapon aspects (item label 0); a shield takes shield aspects. | Sandbox weapon slots and pickers, per-class rule text, off-hand legendary aspects, Spiritborn single 2H slot |
| **Aspect types and slots** (from each aspect's `FILTER_Legendary_*` skill tag and `arAllowedItemLabels`, 18 Nov): Offensive → weapons, gloves, rings, amulet (some also shield); Defensive → helm, chest, pants, amulet, shield; Utility → helm, chest, gloves, pants, boots, amulet, shield; Resource → rings, amulet; Mobility (tag `Movement`) → boots, amulet. An aspect is imprinted on a **rare** item in an allowed slot, or **overwrites** the aspect on a legendary there. 14 aspects have no tag; their type is inferred from their slot set. Labels: 0 any weapon, 15 Shield, 16 Helm, 17 Chest, 19 Ring, 26 Amulet, 28 Gloves, 29 Boots, 30 Pants. | Aspect Codex TYPE and SLOT filters; type on cards and tooltips; SLOTS line in aspect tooltips; Sandbox legendary slots |
| **Charm sets:** each set (5 per class, e.g. Warlock's **Flesh of Abaddon** for Hellfire / Blazing Scream) has one charm of each of 5 types: **Phoba, Fer, Mlor, Linta, Berú**. Bonuses at **2, 3 and 5** different types; a duplicate type *within a set* doesn't count (reroll it in the Horadric Cube). The same type from different sets is fine, so sets can be mixed: 5 slots = a 3-set + a 2-set, 6 slots = three 2-sets (confirmed 18 Nov). Every set charm also rolls **2 affixes** (skill ranks, bonus experience %, resistances, Lucky Hit effects…). | Sandbox TALISMAN: ADD SET CHARM, 2 affix pickers per charm, SET BONUSES with active tiers and duplicate warnings |
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
- Only the icons in use are copied to `data/icons/<handle hex>.webp` (626 files, ~3.6 MB); the codex stores the handle as `ic`.
- **Charms and seals (18 Nov):** their art is linked by an unnamed item field, `unk_75d565b` (they have no `tInvImages` and share a generic actor). It's used only as the last fallback, because on other items it often points at a generic image. All 213 set charms and 147 unique charms have icons; seals use it too (all Mythic seals share one frame in the data). `codex.talisman.seals` holds the Magic/Rare/Legendary seal icons, shown beside the Sandbox's seal picker.
- Coverage: **all 357 visible uniques and all 64 runes.** Shown on cards (an icon well beside the name), in tooltips and the Sandbox (tooltip header), on rune cards and in rune chips.
- **Whole atlas sheets (18 Nov):** `2DUI/` (~5,100 PNGs, 15 GB, not in git) holds whole sheets named `<atlas> [<snoID>].png`. `icons.py` cuts a used frame out with `cwebp -crop`, using the Texture `ptFrame` UV rectangle (split webp frames win when both exist; a cut is made only when `data/icons/<handle>.webp` is missing). Build option `--atlases` (default `2DUI/`). **All 554 aspects have icons** (`2DUI_Aspect_*`, 415 distinct).
- **Paperdoll (18 Nov):** the Sandbox's Build panel is drawn like the inventory screen: armor down the left (Helm, Chest, Gloves, Pants, Boots), Amulet and Rings on the right, the class's weapon slots along the bottom (Barbarian 4, Rogue 3, others 2, Spiritborn 1). Slot frames come from `2DUI_InventoryGrid` (normal, gold when filled with a unique/mythic/legendary, crossed when a 2H holds the off-hand), empty slots show the game's `2DUI_PaperDoll_EmptySlotIcons`, and the class sigil (`2DUI_ClassIcons_Rendered`, Warlock `_X2_Rendered`, cut at 360 px) sits behind the figure. Handles are in `codex.paperdoll`. **The figure is game art** (18 Nov): `tools/figures.py` `PORTRAITS` cuts each class from its newest solo shop armor bundle art (`2DUI_Bundle_HArmor_<cls>_storNNN_background`: bar 265, dru 247, nec 275, pal 189, rog 278, sor 268, spi 218, war 175; crossover sets skipped); with no class the Season 15 battle pass armor group shot is shown. Written to `data/figures/<class>.webp` by `build_index.py` (only when missing: delete one to re-cut after changing its box or bundle). The game has no 2D class figure (its paperdoll is a live 3D scene); the original SVG silhouettes (`data/figures/<class>.svg`) are only the fallback when the sheets are missing. A list beside the panel names each slot's item. **Changing the class clears gear and charms** (seal and the roll / rank / item power settings stay), with UNDO in a toast. If `codex.paperdoll` is missing the old slot grid is shown.
- **Sockets: gems and runes (18 Nov):** `build_index.py` writes `codex.gems` (Ruby, Sapphire, Emerald, Topaz, Amethyst, Diamond, Skull: tiers 1-9 Crude ... Flawless Horadric; Mythic gem The Empyrean Eye) from `Item/Gem_<Type>_0N` `ptSocketedEffects`: one effect per socket target (0 weapon, 1 armor, 2 jewelry), text from `AttributeDescriptions` by the `tStringLabel` hash (the Mythic gem's label is the flat "All Stats" text, so its percent attribute's own label is used). Off-hand socket target comes from the item type's labels (`codex.itemTypes[t].g`): label 0 Weapon (focus, totem, book), 14 Armor (**Shield**: armor bonus, e.g. Ruby +150 Strength), 18 Jewelry. Weapon gem bonuses are x damage multipliers and the GEM TOTALS multiply them (2 × x32% = x74.2%), with a combined line per element when a Diamond's All Damage multiplier is present; other bonuses add. **Socket counts are game rules, not data** (no table found): Helm, Chest, Pants, 2H weapons 2; 1H weapons, off-hands, Amulet, Rings 1; Gloves, Boots 0. Sandbox: socket pips (game socket frame, `2DUI_InventoryGrid` frame 10) under each filled paperdoll slot; the picker offers 8 gems (at the GEM QUALITY setting, `state.sandbox.gt`) and, in 2-socket items, all current runes; the SOCKETS panel lists each slot's gems, the runeword (one Ritual + one Invocation: When/Then) or a warning, and gem totals. **Rune rules (Vessel of Hatred launch guides: Icy Veins, PC Gamer, Windows Central; re-check if a season changes them):** an item holds gems or a runeword, not both; a runeword is one Ritual + one Invocation (the picker then lists only the other kind); each rune can be socketed once in the whole build; at most 2 runewords (so not three). `runeRules()` filters the socket picker (with an info line saying why) and `applyPick` refuses violations; the Sockets panel flags old builds/links that break them. Rune tooltips (socketed pips and picker entries, key `rune:<id>|<slot spec>@<socket>`) add the runeword formed with the other socket's rune: name (the two runes' phrases, e.g. Amn "Thorned" + Eom "Adrenaline" = Thorned Adrenaline), When/Then with Offering, ≈ triggers per cast and overflow, or what's missing. State `state.sandbox.sock` {slot spec: ["g:Ruby" | "r:<rune id>" | ""]}; share link `sock=` and `gt=`; class change and CLEAR empty it. **Open:** jewelry resistances show the data value (+4,375 Fire Resistance for a Flawless Horadric Ruby); confirm how the game displays it.
- **Damage model (18 Nov, user's rule):** every +% damage bonus goes into one additive bucket; every x% bonus multiplies it (the game's all-damage figure also folds in weapon damage, main stat and crits, so it can reach 100,000%). The Sandbox's DAMAGE panel (`damageHTML()` in renderSandbox) reads the rendered lines of equipped uniques (incl. crafted Mythic lines), legendary aspects, unique charms, the Hellfire Torch, the seal, set charm affixes, active set bonuses and weapon gems at the current roll quality, and sorts each number: `+N% … Damage` → additive; `xN%` → multiplier, or a crit-damage / crit-chance multiplier when the nearest "Critical Strike Damage/Chance" in its sentence says so; `+N% Critical Strike Chance/Damage` → crit. Damage = (1 + Σ additive) × Π(1 + x); crits assume base 5% chance and +50% damage; average = damage × (1 + chance × ((1 + crit dmg) × Π crit x − 1)). Every line has a checkbox (conditional bonuses), saved in `state.sandbox.dmgOff`. Not counted: main stat, weapon damage, skill ranks, rare/legendary random affixes (not modelled).
- **Class lock (18 Nov):** nothing tagged for another class (fUsableByClass → `r.classes`) can enter the build: `classBlock(r)` (class = the Class setting, or in Auto the class the other items imply) is checked in `equip()` (Database + buttons, quick add) and `applyPick()` (slot picker, aspects, unique charms); blocked Database buttons show ⊘ with the reason. The quick-add list (`fillQuickAdd()`) only offers the class's and all-class items; slot pickers were already class-filtered. A share link with `cls=` drops other classes' items, charms and aspects.
- **Talisman panel (18 Nov):** the Sandbox draws the in-game Talisman from `UI/InventoryGrid` `Template_Talisman` (720×720 units): background `2DUI_Talisman_NonAlpha` frame 1, seal socket at (0, 4), six charm sockets in a hexagon at (0,−165) (∓148,83) (±148,83)… exactly as the game's offsets; charm frame 160×196 with an 84×128 item window (normal / gold active / locked frames from `2DUI_Talisman`), seal frame 170×188 + active ring. Handles are in `codex.talisman.ui`. Sockets unlock in the game's index order (0 top, 1–2 lower pair, 3–4 upper pair, 5 bottom); the seal's slot count locks the rest. The glowing connector lines between sockets are VFX materials and aren't drawn. Unique charms show their charm art, not the unique item's.
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
- **Build editor (18 Nov):** the Sandbox is built directly, no Database trip needed. Class first (Parameters), then a BUILD panel of clickable slots: weapon slots from the class rules (under a 2H the Off-Hand stays clickable and swaps the 2H out), Helm, Chest, Gloves, Pants, Boots, Amulet, Ring 1/2; a TALISMAN panel (seal + 6 charm slots; a slot takes a set charm or a unique's charm); an ASPECTS panel (+ ADD ASPECT). Clicking a slot opens a searchable picker with only what fits it (slot, class); picking replaces the occupant; × clears a slot. DETAILS below shows the full tooltips. The Database + button and "Quick add by name" still work. **Hover tooltips** (same in-game box as the Database) on every filled slot and on every picker entry: gear and weapons at the Sandbox's roll, Mythic toggle and item power; unique charms as their charm version (power only); set charms with their rolled affixes, set progress and bonus tiers (lit when active, Diamond Mind counts applied); the Hellfire Torch. `tooltipFor(key)` handles record keys plus `charm:`, `set:`, `piece:` and `torch` keys. Clicking a slot still opens the picker. **Legendary slots (18 Nov):** any weapon, armor or jewelry slot without a unique can hold a legendary with an aspect (picker lists only aspects allowed in that slot, after the uniques); amulet ×1.5 and 2H ×2 apply automatically (Barbarian 2H slots and Rogue ranged are 2H; the generic Main Hand has a 2H toggle that blocks the off-hand). Stored in `state.sandbox.leg` keyed by slot spec; share links carry `leg=`. Internally the build is still `state.pins` + `charms` + `sets` + `leg`; `sbLayout()` maps pins to slots, `applyPick()` replaces in place.
- Pin uniques and aspects; sliders for roll quality, aspect rank and item power; MYTHIC toggle per unique; AMULET / 2H toggles per aspect; share links (pins + class); raw source JSON viewer (local only).
- **Weapon loadout (18 Nov):** a Class picker (Auto = the one class all class-locked pins share) sets the weapon rules. **Barbarian:** 2H bludgeoning (Mace2H) + 2H slashing (Axe2H, Sword2H, Polearm) + two 1H (dual wield). **Rogue:** bow or crossbow + two daggers or swords. **Every other class:** a 2H, or a 1H + an off-hand (shield, focus, totem). Equipping a weapon unequips the ones it can't be used with (newest pins win) and shows a notice; a weapon the build's class can't use (wrong class, or a type with no slot, e.g. a shield for a Barbarian) is refused. A WEAPONS strip shows which pin is in which slot. Aspects aren't slot-checked.
- **Gear and Talisman (18 Nov):** gear slots are 1 each of Helm, Chest, Gloves, Pants, Boots, Amulet and 2 Rings. When a slot is full, a new unique goes into the Talisman as its charm (if it has one and there's room); otherwise the oldest item in that slot moves to the Talisman or is unequipped, with a notice. Seal picker (default Legendary, 5 slots); CHARM button per unique moves it between its gear slot and the Talisman; charms render power-only and don't count toward the crafted Mythic limit. Share links carry charms, seal and set charms. Not modelled yet: seal affixes.
- **Set charms (18 Nov):** `build_index.py` writes `codex.talisman`: 45 sets from `Talisman_Charm_Set_*` items + `SetItemBonus/*.set` (tiers → `Talisman_SetPower_*` affixes; 40 class sets of 5 pieces, plus small Generic sets of 2–3), and the 89-affix random pool (`Talisman_Charm_*` with item label 71, minus `_MagicOnly` and the unique charm powers `Talisman_Charm_Affix_*`). In the Sandbox, set charms share the seal's slots with unique charms; the set list shows the build's class sets + Generic; affix values use roll quality at item power 850 (charms are fixed 850). Duplicates are judged per set (same set, same type).

**Layout and theme**
- Phones: each filter group is one swipeable row, the nav scrolls to the active tab, long values wrap. All four views checked at 390px with no horizontal scroll.
- Theme: a hybrid of Monolith Gaming (red `#ff3131`, near-black backgrounds, red grid, Gemunu Libre) and Diablo (Cinzel, rarity colours, in-game tooltips). Slot icons are original line-art SVGs.

## Suggested next steps

1. Next for the Talisman: seal affixes (`Talisman_SealAffix_*`).
2. ~~Aspect icons~~ done 18 Nov (cut from `2DUI/` sheets).
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
