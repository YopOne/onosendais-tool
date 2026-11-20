"""
Runes, runewords and crafting recipes for the codex (used by build_index.py).

Everything structural comes from the datamine:
  data/Item/(S15_)Rune_*.itm.json         rune stats (Offering, rarity, season flag)
  data/StringList/Item_<rune>.stl.json    rune name, effect text, runeword name part
  d4data/json/base/meta/Recipe            recipes: ingredients, crafter, gold cost

Only facts the game files don't carry come from data/sources/runes_maxroll.json:
which runes drop in each boss lair, other rune sources, and which runes are
still in the game ("current").

Recipe outputs are often a TreasureClass whose name isn't resolved in the
datamine; those outputs are derived from the recipe's own name and say so.
"""

import glob
import json
import os
import re
import sys

CRAFTERS = {0: "Blacksmith", 1: "Alchemist", 2: "Occultist", 3: "Jeweler", 10: "Horadric Cube"}
RUNE_RARITY = {0: "Magic", 1: "Rare", 2: "Legendary", 3: "Seasonal"}
MYTHIC_SLOT = {"1HWeapon": "1H Weapon", "2HWeapon": "2H Weapon", "Amulet": "Amulet", "Boots": "Boots", "Chest": "Chest",
               "Gloves": "Gloves", "Helm": "Helm", "Legs": "Pants", "Rings": "Ring"}
RUNE_FILE = re.compile(r"^(S15_)?Rune_(Condition|Effect)_")

# Item type id -> base label shown for runeword bases
BASE_LABEL = {
    "ChestArmor": "Chest Armor", "Helm": "Helm", "Legs": "Pants",
    "Axe": "Axe", "Sword": "Sword", "Mace": "Mace", "Dagger": "Dagger", "Wand": "Wand", "Scythe": "Scythe", "Flail": "Flail",
    "Axe_Berserker_Axe": "Axe", "Sword_Phase_Blade": "Sword",
    "Axe2H": "2H Axe", "Sword2H": "2H Sword", "Mace2H": "2H Mace", "Scythe2H": "2H Scythe", "Polearm": "Polearm",
    "Glaive": "Glaive", "Staff": "Staff", "Quarterstaff": "Quarterstaff", "Bow": "Bow", "Crossbow2H": "Crossbow",
    "Shield": "Shield", "Focus": "Focus", "FocusBookOffHand": "Focus (Tome)", "OffHandTotem": "Totem",
}


def _load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def _num(v):
    """5.0 -> '5', 0.33000001 -> '0.33'."""
    return f"{round(v, 2):g}"


def extract(item_dir, stl_dir, recipe_dir, src_path, items):
    if not os.path.isdir(recipe_dir):
        print(f"note: {recipe_dir} not found, skipping runes and recipes", file=sys.stderr)
        return None
    src = _load(src_path) if os.path.exists(src_path) else {}
    current = {k: set(v) for k, v in (src.get("current") or {}).items()}

    name_cache = {}

    def item_name(sno_id):
        if sno_id not in name_cache:
            p = os.path.join(stl_dir, f"Item_{sno_id}.stl.json")
            name_cache[sno_id] = None
            if os.path.exists(p):
                for e in _load(p).get("arStrings", []):
                    if e["szLabel"] == "Name":
                        name_cache[sno_id] = re.sub(r"\{icon:[^}]*\}\s*", "", e["szText"]).strip()
        return name_cache[sno_id]

    # ---------- Runes ----------
    runes = {}
    for f in sorted(glob.glob(os.path.join(item_dir, "*.itm.json"))):
        rid = os.path.basename(f)[:-9]
        if not RUNE_FILE.match(rid):
            continue
        d = _load(f)
        s = {}
        p = os.path.join(stl_dir, f"Item_{rid}.stl.json")
        if os.path.exists(p):
            s = {e["szLabel"]: e["szText"] for e in _load(p).get("arStrings", [])}
        kind = "Ritual" if "_Condition_" in rid else "Invocation"
        dyn = d.get("flDynamicRuneValue") or 0
        text = s.get("RuneDescription", "").replace("{s1}", _num(dyn))
        name = s.get("Name") or rid
        seasonal = bool(d.get("bSeasonItem"))
        runes[rid] = {
            "id": rid, "name": name, "kind": kind,
            "rarity": RUNE_RARITY.get(d.get("eRuneRarity"), "Magic"),
            "offering": d.get("dwRunicPowerAmount") or 0,
            "cd": d.get("flICDOverrideSeconds") or 0,
            "t": text,
            "overflow": s.get("RuneOverflowBehavior", ""),
            "phrase": s.get("RunewordPhrasePrefix") or s.get("RunewordPhraseSuffix") or "",
            "season": "Season 15" if seasonal else "",
            "legacy": bool(current) and name not in current.get(kind, set()),
            "drops": [], "made": [], "uses": [],
        }

    def rune_by_name(name, prefer_seasonal=None):
        c = [r for r in runes.values() if r["name"] == name and not r["legacy"]] or [r for r in runes.values() if r["name"] == name]
        if prefer_seasonal is not None and len(c) > 1:
            c = [r for r in c if bool(r["season"]) == prefer_seasonal] or c
        return c[0]["id"] if c else None

    for boss_id, names in (src.get("lairRunes") or {}).items():
        for n in names:
            rid = rune_by_name(n)
            if rid:
                runes[rid]["drops"].append(boss_id)
            else:
                print(f"warning: lair rune {n!r} matches no rune", file=sys.stderr)

    # ---------- Recipe parsing ----------
    def parse(rcp_id):
        d = _load(os.path.join(recipe_dir, rcp_id + ".rcp.json"))
        ins = []
        for ing in d.get("arIngredients", []):
            sno = ing.get("snoItem") or {}
            req = ing["tItemDescription"]["tRequirements"]
            e = {"q": ing.get("nQuantity", 1)}
            if sno.get("name"):
                e["ref"] = sno["name"]
                e["n"] = item_name(sno["name"]) or sno["name"]
            elif req.get("bDefineRuneRarityRequirement"):
                e["n"] = f"any {RUNE_RARITY.get(req.get('eMinRuneRarity'), '')} rune".replace("  ", " ")
            else:
                e["n"] = None  # generic item (base), named by the caller
            ins.append(e)
        out = (d.get("tSpecificItem") or {}).get("snoItemToDrop") or d.get("snoItem") or {}
        cond = (d.get("snoActiveCondition") or {}).get("name") or ""
        return {
            "id": rcp_id,
            "station": CRAFTERS.get(d.get("eCrafterType"), f"Crafter {d.get('eCrafterType')}"),
            "gold": d.get("nCost") or 0,
            "hidden": bool(d.get("bRecipeIsHidden")),
            "cond": cond,
            "ins": ins,
            "out": {"ref": out["name"], "n": item_name(out["name"]) or out["name"]} if out.get("name") else None,
        }

    all_ids = sorted(os.path.basename(f)[:-9] for f in glob.glob(os.path.join(recipe_dir, "*.rcp.json")))
    s15_rune_ids = {r for r in runes if runes[r]["season"]}
    recipes = {"runeUpgrades": [], "legendaryRunes": [], "mythic": [], "unique": [], "splinters": [], "wirt": None}

    # Season 15 rune chain: Runecraft_<In>_<Out>. The output is a TreasureClass, so it's named from the file.
    chain = [parse(r) for r in all_ids if r.startswith("Runecraft_")]
    consumed = {}  # rune name -> rune id actually consumed by a chain recipe
    for r in chain:
        for i in r["ins"]:
            if i.get("ref") in runes:
                consumed.setdefault(runes[i["ref"]]["name"], i["ref"])
    for r in chain:
        out_name = r["id"].split("_")[-1]
        out_id = consumed.get(out_name) or rune_by_name(out_name, prefer_seasonal=True)
        r["out"] = {"ref": out_id, "n": out_name, "derived": True}
        recipes["runeUpgrades"].append(r)
        if out_id:
            runes[out_id]["made"].append(r["id"])
        for i in r["ins"]:
            if i.get("ref") in runes:
                runes[i["ref"]]["uses"].append(r["id"])
    # order the chain by input -> output
    order = {r["ins"][0].get("ref"): r for r in recipes["runeUpgrades"]}
    start = [r for r in recipes["runeUpgrades"] if r["ins"][0].get("ref") not in {x["out"]["ref"] for x in recipes["runeUpgrades"]}]
    ordered = []
    for s in start:
        cur = s
        while cur and cur not in ordered:
            ordered.append(cur)
            cur = order.get(cur["out"]["ref"])
    recipes["runeUpgrades"] = ordered + [r for r in recipes["runeUpgrades"] if r not in ordered]

    # Horadric Cube: 1 specific rune + 5 Rare + 5 Legendary -> a chosen rune
    for rid in all_ids:
        if rid.startswith("X2_Recipe_HoradricCube_Rune_"):
            r = parse(rid)
            recipes["legendaryRunes"].append(r)
            if r["out"] and r["out"]["ref"] in runes:
                runes[r["out"]["ref"]]["made"].append(rid)

    # Jeweler: 3 of a rune -> random rune. Kept on the rune itself.
    reroll = {}
    for rid in all_ids:
        if rid.startswith("Recipe_Jeweler_Random_Rune_From_"):
            r = parse(rid)
            src_rune = r["ins"][0].get("ref") if r["ins"] else None
            if src_rune in runes:
                runes[src_rune]["reroll"] = {"q": r["ins"][0]["q"], "out": r["out"]["n"] if r["out"] else "Random rune", "gold": r["gold"]}
                reroll[rid] = True

    # Mythic crafting
    for rid in all_ids:
        if rid.startswith("Recipe_Jeweler_RuneCrafting_") or rid.startswith("Recipe_Blacksmith_MythicCrafting"):
            r = parse(rid)
            slot = MYTHIC_SLOT.get(rid.rsplit("_", 1)[-1])
            if slot and r["out"]:
                r["out"]["n"] = f"Random Mythic {slot}"
            recipes["mythic"].append(r)
            for i in r["ins"]:
                if i.get("ref") in runes:
                    runes[i["ref"]]["uses"].append(rid)

    # Specific unique crafts (e.g. Shroud of False Death at the Jeweler)
    for rid in all_ids:
        if re.match(r"^Recipe_(Jeweler|Blacksmith)_.+_Unique_", rid):
            r = parse(rid)
            if r["out"]:
                recipes["unique"].append(r)
                for i in r["ins"]:
                    if i.get("ref") in runes:
                        runes[i["ref"]]["uses"].append(rid)

    # Horadric Cube: white base -> Unique of that type, then a 900 Unique -> its Mythic.
    # Every base / slot uses the same materials, so each step is one summary entry listing the bases.
    def summarize(ids, label_of):
        parsed = [parse(rid) for rid in ids]
        mats = [[(i["q"], i.get("ref")) for i in r["ins"] if i.get("ref")] for r in parsed]
        if any(m != mats[0] for m in mats):
            print(f"warning: {ids[0].rsplit('_', 1)[0]} recipes use different materials per base", file=sys.stderr)
        r = parsed[0]
        r["bases"] = sorted({label_of(rid) for rid in ids})
        return r
    uniq_ids = [rid for rid in all_ids if rid.startswith("X2_HoradricCube_UpgradeToUnique_")]
    # Current upgrade: X2_HoradricCube_Bundle_UpgradeToMythic (Ancestral Unique + 5 Resplendent Sparks, any slot).
    # The S14_HoradricCube_UpgradeToMythic_* recipes (Pandemonium Fragments) are Season 14 leftovers.
    cube = {}
    if uniq_ids:
        base_of = lambda rid: re.sub(r"^([12]H)", r"\1 ", re.sub(r"_(Ancestral|SorcOffhand)", "", rid[len("X2_HoradricCube_UpgradeToUnique_"):]))
        r = summarize(uniq_ids, base_of)
        r["ins"][0]["n"] = "white base, no affixes"
        r["out"] = {"n": "Unique of that base", "derived": True}
        r["ancestral"] = any(rid.endswith("_Ancestral") or "_Ancestral_" in rid for rid in uniq_ids)
        cube["unique"] = r
    if "X2_HoradricCube_Bundle_UpgradeToMythic" in all_ids:
        r = parse("X2_HoradricCube_Bundle_UpgradeToMythic")
        r["bases"] = []  # one recipe for every slot
        r["ins"][0]["n"] = "Ancestral Unique (item power 900)"
        r["out"] = {"n": "Mythic version of that Unique", "derived": True}
        cube["mythic"] = r
    # 3 Mythics -> 1 (X2_HoradricCube_RecycleMythicUnique; _IQM takes upgraded Mythics: quality 6 + modifier 5):
    # a new Mythic of that item with a new random affix structure (user, 20 Nov).
    if "X2_HoradricCube_RecycleMythicUnique" in all_ids:
        d = _load(os.path.join(recipe_dir, "X2_HoradricCube_RecycleMythicUnique.rcp.json"))
        q = ((d.get("tItemRecycleDescription") or {}).get("dwQuantity")) or 3
        cube["recycle"] = {"id": "X2_HoradricCube_RecycleMythicUnique", "station": "Horadric Cube", "gold": d.get("nCost") or 0, "hidden": False, "cond": "",
                           "ins": [{"q": q, "n": "of the same Mythic (dropped, bought or upgraded)"}],
                           "out": {"n": "That Mythic with a new random affix structure", "derived": True},
                           "upgraded": "X2_HoradricCube_RecycleMythicUnique_IQM" in all_ids, "bases": []}
    # Occultist: Enchanting (Recipe_Enchant): replace 1 affix from the slot's pool; materials by item kind and power.
    if "Recipe_Enchant" in all_ids:
        d = _load(os.path.join(recipe_dir, "Recipe_Enchant.rcp.json"))
        by = {}
        for ing in d.get("arIngredients", []):
            c = (ing.get("snoCondition") or {}).get("name") or ""
            it = (ing.get("snoItem") or {}).get("name") or ""
            by.setdefault(c, []).append({"q": ing.get("nQuantity", 1), "ref": it, "n": item_name(it) or it})
        g = lambda *cs: [x for c in cs for x in by.get(c, [])]
        # Each item pays every ingredient whose condition it meets: an 800+ armor piece pays the "800+" Veiled
        # Crystals and the "Armor 800+" Baleful Fragments.
        recipes["enchant"] = {"id": "Recipe_Enchant", "station": "Occultist", "rows": [
            {"when": "Item power below 800", "one": g("Item_Is_NonAncestral_And_LT800"), "two": g("Item_Is_2HNonAncestral_And_LT800")},
            {"when": "Item power 800+ (not Ancestral)", "one": g("Item_Is_NonAncestral_And_GTE800", "Item_Is_Armor_And_NonAncestral_And_GTE800"),
             "two": g("Item_Is_2HNonAncestral_And_GTE800")},
            {"when": "Ancestral", "one": g("Item_Is_ArmorOr1HWeaponOrJewelry_Ancestral"), "two": g("Item_Is_2HAncestral")}],
            "steps": [{"from": x.get("nEnchantCountMin", 0), "delta": x.get("flDelta")} for x in d.get("arEnchantCostScalarDeltas") or []]}
    # Rerolls (always available): Affix Value Reroll (all base affixes of equipment / Talisman items) and Unique Power Reroll.
    rerolls = []
    for rid, first in (("X2_HoradricCube_Bundle_RerollAffixValues", "Equipment or Talisman item"),
                       ("X2_HoradricCube_Bundle_RerollUniquePower", "Unique item or charm")):
        if rid not in all_ids:
            continue
        r = parse(rid)
        r["ins"][0]["n"], r["ins"][0]["q"] = first, 1
        # Per roll: 1 Attuned + 100 Raw Primordial Dust (user, 18 Nov). The data's extra unnamed ingredient isn't a cost.
        r["ins"] = r["ins"][:1] + [e for e in r["ins"][1:] if e.get("ref")]
        st = {}
        sp = os.path.join(stl_dir, f"Recipe_{rid}.stl.json")
        if os.path.exists(sp):
            st = {e["szLabel"]: e["szText"] for e in _load(sp).get("arStrings", [])}
        r["out"] = {"n": "Same item, values rerolled", "derived": True}
        r["name"] = re.sub(r"\{[^}]*\}", "", st.get("Name", rid)).strip()
        r["desc"] = st.get("Description", "")
        rerolls.append(r)
    cube["rerolls"] = rerolls
    recipes["cube"] = cube

    # Season 15 Soul Splinters: 5 of a tier -> next tier, per Prime/Lesser Evil
    chains = {}
    for rid in all_ids:
        m = re.match(r"^X2_HoradricCube_SoulSplinter_(.+)_0(\d)$", rid)
        if m:
            chains.setdefault(m.group(1), []).append(parse(rid))
    for boss, steps in sorted(chains.items()):
        steps.sort(key=lambda r: r["id"])
        tiers = [steps[0]["ins"][0]["n"]] + [s["out"]["n"] for s in steps if s["out"]]
        recipes["splinters"].append({"boss": boss, "q": steps[0]["ins"][0]["q"], "tiers": tiers, "station": steps[0]["station"]})
    if "S15_WirtsCoinRecipe" in all_ids:
        r = parse("S15_WirtsCoinRecipe")
        coin = item_name("S15_WirtsCoins")
        r["out"] = {"ref": "S15_WirtsCoins", "n": coin or "Wirt's Coins", "derived": True}
        recipes["wirt"] = r

    # ---------- Classic runewords (Horadric Cube) ----------
    rw_items = {}
    for it in items:
        if it["id"].startswith("Runeword_"):
            rw_items.setdefault(it["name"], []).append(it)
    key_of = {re.sub(r"[^a-z]", "", n.lower()): n for n in rw_items}
    runewords = {}
    for rid in all_ids:
        m = re.match(r"^(?:X2_HoradricCube_Craft_Runeword_|Runeword_)(.+)$", rid)
        if not m or rid.endswith("_Ancestral") or "Bundle" in rid:
            continue
        rest = re.sub(r"[^a-z]", "", m.group(1).lower())
        fam = max((k for k in key_of if rest.startswith(k)), key=len, default=None)
        if not fam:
            print(f"warning: runeword recipe {rid} matches no runeword item", file=sys.stderr)
            continue
        name = key_of[fam]
        r = parse(rid)
        rune_refs = []
        for i in r["ins"]:
            if i.get("ref") in runes:
                rune_refs += [i["ref"]] * i["q"]
        rw = runewords.setdefault(name, {
            "name": name, "runes": rune_refs, "station": r["station"],
            "items": [it["id"] for it in rw_items[name]],
            "bases": sorted({BASE_LABEL.get(it["typeId"], it["type"]) for it in rw_items[name]}),
            "season": "Season 15" if (set(rune_refs) & s15_rune_ids or "Season15" in r["cond"]) else "",
            "recipes": 0, "ancestral": f"{rid}_Ancestral" in all_ids,
        })
        rw["recipes"] += 1
        if rw["runes"] != rune_refs:
            print(f"warning: {rid} uses different runes than other {name} recipes", file=sys.stderr)
        for ref in set(rune_refs):
            if name not in runes[ref]["uses"]:
                runes[ref]["uses"].append(name)

    # Tag items with how they're crafted (shown next to boss drops in the UI)
    by_id = {it["id"]: it for it in items}
    for rw in runewords.values():
        txt = "Horadric Cube: a normal-quality base + " + " + ".join(runes[r]["name"] for r in rw["runes"])
        if rw["ancestral"]:
            txt += " (Ancestral base → Ancestral runeword)"
        for iid in rw["items"]:
            by_id[iid]["craft"] = txt + (f". {rw['season']} runes." if rw["season"] else ".")
    for r in recipes["unique"]:
        it = by_id.get(r["out"]["ref"])
        if it:
            parts = [f"{i['q']}× {i['n']}" for i in r["ins"]]
            it["craft"] = f"{r['station']}: " + " + ".join(parts) + (f" + {r['gold']:,} gold" if r["gold"] else "")

    return {
        "source": src.get("source"), "sourceName": src.get("sourceName"), "sourceUpdated": src.get("sourceUpdated"),
        "notes": src.get("notes", []), "otherSources": src.get("otherSources", []),
        "runes": sorted(runes.values(), key=lambda r: (r["legacy"], r["kind"] != "Ritual", r["name"])),
        "runewords": sorted(runewords.values(), key=lambda r: r["name"]),
        "recipes": recipes,
    }
