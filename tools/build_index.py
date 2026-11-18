#!/usr/bin/env python3
"""
Onosendai's Tool: codex index builder.

Browsers can't list directories, and data/ holds ~84,000 raw datamined files,
so the SPA can't crawl data/Item, data/Power and data/StringList at runtime.
This script (Python 3 standard library only, no installs) collects just the
records the site needs into one file, data/index/codex.json.

It does NOT evaluate formulas or render text. It copies the raw template
strings, formulas and static values out of the source files. app.js does the
cross-referencing at runtime: it evaluates Affix_Value_N formulas, resolves
PowerTag script formulas and renders the localized templates.

Sources:
  data/Item/*.itm.json             unique/mythic item definitions
  data/StringList/*.stl.json       names, flavor, effect templates, stat templates
  data/Power/*.pow.json            script formulas referenced by PowerTag.X."Script Formula N"
  d4data/json/base/meta/Affix      roll formulas, static values and ranks (not in data/)
  d4data/json/base/meta/Aspect     authoritative list of legendary aspects
  d4data/json/CoreTOC_flat.json    SNO id -> name lookup (resolves skill names on stat lines)
  d4data/json/base/meta/GameBalance/AttributeFormulas.gam.json
                                   stat roll formulas by item power (gbidFormula on affix attributes)
  data/sources/boss_loot.json      which boss drops each unique (hand-maintained from Maxroll)
  d4data/json/base/meta/Recipe     runeword, rune and Mythic crafting recipes (see runes_recipes.py)
  data/sources/runes_maxroll.json  rune drop locations + which runes are current (from Maxroll)
  webp_icons/ + d4data Texture, Actor  inventory icons -> data/icons/ (see icons.py; optional)

Usage:
  python3 tools/build_index.py                 # defaults below
  python3 tools/build_index.py --d4data PATH   # if d4data lives elsewhere
"""

import argparse
import glob
import json
import os
import re
import sys
import time
import unicodedata

from runes_recipes import extract as extract_runes
from icons import Icons

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Order of fUsableByClass / fAllowedForPlayerClass, verified against item file names.
CLASSES = ["Sorcerer", "Druid", "Barbarian", "Rogue", "Necromancer", "Spiritborn", "Paladin", "Warlock"]

MAGIC_TYPES = {1: "Legendary", 2: "Unique", 4: "Mythic"}

EXCLUDED_TYPES = re.compile(r"^(Fish|CollectiblePower|ReputationCache|Quest.*|Cache.*|Junk|.*Bad Data)$")
# QA fixtures (can share names with real items): QA_/TEST_/DEBUG_/zz prefixes, PACTTEST_, *_test_*, *Debug*
TEST_ID = re.compile(r"^(QA|TEST|DEBUG)_|^zz|TEST_|_test(_|$)|Debug", re.I)
JUNK_NAME = re.compile(r"\[(PH|WIP)\]|^\[ph_|\((PH|DEBUG|DNS)\)|^\[PH\]|Performance Test|^Boost |^Legendary .+ \d+$|^Something Super Cool$|^\s*$", re.I)

# Dev placeholder text: "WIP", "(WIP) ...", "{c_red}(REDESIGN)...", "{c_red}NEEDS REDESIGN"
WIP_TEXT = re.compile(r"^\s*(\{c_\w+\})?\(?(WIP|PH|NEEDS REDESIGN|REDESIGN)\b|I need a new design")

POWERTAG_RE = re.compile(r'PowerTag\.([A-Za-z0-9_]+)\."Script Formula \d+"')
DAMAGE_TYPES = ["Physical", "Fire", "Lightning", "Cold", "Poison", "Shadow"]
DAMAGE_TYPE_ATTRS = ("Damage_Type", "Resistance", "Proc_Flat_Element_Damage_On_Hit", "Bucketed_Multiplicative_Damage_Type")
# nParam enums with no name table in the data. Values read off affix ids that name them,
# e.g. S04_Resource_Per_Second_Fury = 1, UNIQUE_Generic_LuckyHit_Stun = 2, UNIQUE_CritChance_Against_CCd_Fear = 13.
RESOURCES = {0: "Mana", 1: "Fury", 6: "Essence", 7: "Vigor"}
DOT_STATES = {0: "Bleeding", 1: "Burning", 4: "Poisoned"}
PARAM_ENUMS = {
    "Resource_Regen_Per_Second": RESOURCES, "Resource_Max_Bonus": RESOURCES,
    "Resource_On_Kill": RESOURCES, "Resource_Cost_Reduction_Percent": RESOURCES,
    "Damage_Percent_Bonus_Against_Dot_Type": DOT_STATES, "Damage_Percent_Reduction_From_Dotted_Enemy": DOT_STATES,
    "On_Hit_CC_Proc_Chance": {2: "Stun", 7: "Daze", 13: "Fear"},
    "Crit_Percent_Bonus_Vs_CC_Target": {2: "Stunned", 7: "Dazed", 13: "Feared"},
    "Damage_Percent_Bonus_Vs_CC_Target": {2: "Stunned", 7: "Dazed", 13: "Feared"},
}
POWER_GROUP = 29


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def strings(stl_dir, name):
    """Return {label: text} for StringList/<name>.stl.json, or {} if absent."""
    p = os.path.join(stl_dir, name + ".stl.json")
    if not os.path.exists(p):
        return {}
    return {e["szLabel"]: e["szText"] for e in load(p).get("arStrings", [])}


def class_list(flags):
    flags = flags or []
    picked = [CLASSES[i] for i, v in enumerate(flags[: len(CLASSES)]) if v]
    return picked if picked and len(picked) < len(CLASSES) else []  # [] = all classes


def norm_name(s):
    """Loose name key: accents, case and punctuation ignored (Mjölnic == Mjolnic)."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def attach_drops(items, path):
    """Tag items with where they drop, from data/sources/boss_loot.json
    (hand-maintained from the Maxroll boss loot cheat sheet; not in the datamine).
    Matches by item name. Returns the codex "drops" block, or None if the file is missing."""
    if not os.path.exists(path):
        print(f"note: {os.path.relpath(path, ROOT)} not found, skipping boss drops", file=sys.stderr)
        return None
    src = load(path)
    tags = {}  # norm name -> drop info
    def tag(name):
        return tags.setdefault(norm_name(name), {})
    for b in src["bosses"]:
        for n in b["items"]:
            tag(n).setdefault("bosses", []).append(b["id"])
    for n, tier in src["capstone"]["items"].items():
        tag(n)["capstone"] = tier
    for n in src["iconicMythics"]:
        tag(n)["iconic"] = True
    for n in src["noBoss"]:
        tag(n)["noBoss"] = True

    item_names = {norm_name(it["name"]) for it in items}
    unmatched = [k for k in tags if k not in item_names]
    if unmatched:
        print(f"warning: {len(unmatched)} boss-loot names match no item: {unmatched}", file=sys.stderr)
    for it in items:
        d = tags.get(norm_name(it["name"]))
        if d:
            it["drop"] = d
    return {
        "source": src["source"], "sourceName": src["sourceName"], "season": src["season"],
        "sourceUpdated": src["sourceUpdated"], "rules": src["rules"],
        "bosses": [{k: b[k] for k in ("id", "name", "key", "location", "trophy")} for b in src["bosses"]],
        "capstone": {"name": src["capstone"]["name"], "note": src["capstone"]["note"]},
    }


def load_skill_tags(path, stl_dir):
    """Skill tag hash (nParam on "per skill tag" stats) -> display name.
    GameBalance/SkillTags gives hash -> internal name (Skill_Grenade, Skill_Primary_Basic, Tag_Earthquake);
    the display text is in StringList/SkillTagNames (SKILL_TAG_GRENADE, PRIMARY_TAG_BASIC) or SkillTags (Tag_X_TagName).
    Falls back to the internal name made readable (Skill_Demonology -> Demonology)."""
    if not os.path.exists(path):
        print("! GameBalance/SkillTags.gam.json not found: skill tags on stat lines will be generic.")
        return {}
    names = strings(stl_dir, "SkillTagNames")
    tags = strings(stl_dir, "SkillTags")
    out = {}
    for e in load(path)["ptData"][0]["tEntries"]:
        h = e["tHeader"]
        n = h["szName"]
        core = re.sub(r"^(Skill_Primary_|Skill_|Tag_|Subpower_)", "", n)
        text = (names.get("PRIMARY_TAG_" + core.upper()) if n.startswith("Skill_Primary_") else None) \
            or names.get("SKILL_TAG_" + core.upper()) or names.get("PRIMARY_TAG_" + core.upper()) \
            or tags.get(f"Tag_{core}_TagName") or tags.get(f"Keyword_{core}_TagName")
        if not text:
            text = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", core).replace("_", " ")
        out[h["szNameGBIDHash"] & 0xFFFFFFFF] = text
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=os.path.join(ROOT, "data"))
    ap.add_argument("--d4data", default=os.path.join(ROOT, "d4data"))
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "index", "codex.json"))
    ap.add_argument("--icons", default=os.path.join(ROOT, "webp_icons"), help="folder of exported .webp atlas frames")
    args = ap.parse_args()

    item_dir = os.path.join(args.data, "Item")
    power_dir = os.path.join(args.data, "Power")
    stl_dir = os.path.join(args.data, "StringList")
    affix_dir = os.path.join(args.d4data, "json", "base", "meta", "Affix")
    aspect_dir = os.path.join(args.d4data, "json", "base", "meta", "Aspect")
    toc_path = os.path.join(args.d4data, "json", "CoreTOC_flat.json")

    for d in (item_dir, power_dir, stl_dir):
        if not os.path.isdir(d):
            sys.exit(f"Missing folder: {d}")
    have_affix = os.path.isdir(affix_dir)
    if not have_affix:
        print(f"! {affix_dir} not found: roll ranges will be missing (values shown as #).")

    t0 = time.time()
    meta_dir = os.path.join(args.d4data, "json", "base", "meta")
    icons = None
    if os.path.isdir(args.icons) and os.path.isdir(os.path.join(meta_dir, "Texture")):
        icons = Icons(meta_dir, args.icons, os.path.join(ROOT, "data", "icons"), CLASSES)
    else:
        print("! webp_icons/ or d4data Texture folder not found: data/icons/ left as is, items keep their last icons.")
    attr_desc = strings(stl_dir, "AttributeDescriptions")
    skill_tags = load_skill_tags(os.path.join(args.d4data, "json", "base", "meta", "GameBalance", "SkillTags.gam.json"), stl_dir)
    toc = load(toc_path) if os.path.exists(toc_path) else {}
    if not toc:
        print("! CoreTOC_flat.json not found: skill names on stat lines will be generic.")

    affixes = {}
    gb_used = set()
    powertags = set()
    power_name_cache = {}

    def power_display_name(sno):
        entry = toc.get(str(sno))
        if not entry or entry[1] != POWER_GROUP:
            return None
        pname = entry[0]
        if pname not in power_name_cache:
            s = strings(stl_dir, "Power_" + pname)
            power_name_cache[pname] = s.get("name") or s.get("Name")
        return power_name_cache[pname]

    def add_affix(name):
        """Collect one affix's strings + raw formulas. Returns True if it has displayable text."""
        if name in affixes:
            return affixes[name] is not None
        s = strings(stl_dir, "Affix_" + name)
        raw = load(os.path.join(affix_dir, name + ".aff.json")) if have_affix and os.path.exists(os.path.join(affix_dir, name + ".aff.json")) else {}

        rec = {}
        if s.get("Name"):
            rec["n"] = s["Name"]
        desc = s.get("Desc") or s.get("CodexDesc")
        if desc:
            rec["t"] = desc

        values, lines, no_bonus = {}, [], []
        for at in raw.get("ptItemAffixAttributes", []):
            spec = at.get("tAttribute", {})
            attr = spec.get("__eAttribute_name__", "")
            formula = (spec.get("szAttributeFormula") or {}).get("value", "")
            if attr.startswith("Affix_Value") or attr.startswith("Affix_Flat_Value"):
                values[attr] = formula
                if at.get("bIgnoreAffixBonuses"):
                    no_bonus.append(attr)  # immune to Mythic Unique Potency
                continue
            if desc or attr not in attr_desc:
                continue
            # Generic stat line (implicits / forced stats on uniques)
            param = spec.get("nParam", -1)
            label = None
            if attr in PARAM_ENUMS:
                label = PARAM_ENUMS[attr].get(param)
            elif attr.startswith(DAMAGE_TYPE_ATTRS) and 0 <= param < len(DAMAGE_TYPES):
                label = DAMAGE_TYPES[param]
            elif param not in (-1, 0):
                label = power_display_name(param) or skill_tags.get(param & 0xFFFFFFFF)
            line = {"t": attr_desc[attr], "a": attr}
            if label:
                line["p"] = label
            # gbidFormula = value comes from a GameBalance AttributeFormulas entry (per item power range)
            gbid = (spec.get("gbidFormula") or {}).get("name")
            if attr + "_Unscaled_By_Player_Health" in attr_desc:
                # Stats with an "_Unscaled_By_Player_Health" twin (Thorns_Flat, Flat_Hitpoints_Max_Bonus,
                # Flat_Hitpoints_On_Hit) store a fraction the game scales with player health at runtime.
                line["s"] = 1
            elif gbid:
                line["g"] = gbid
                gb_used.add(gbid)
            elif formula not in ("", "0"):
                line["f"] = formula
            lines.append(line)

        if values:
            rec["v"] = values
        if lines:
            rec["l"] = lines
        if no_bonus:
            rec["nb"] = no_bonus
        if raw.get("eMagicType") == 2:
            rec["u"] = 1  # Unique-type affix: boosted by Item_Affix_Bonus_Per_Magic_Type(2)
        elif raw.get("eMagicType") == 1:
            rec["lg"] = 1  # Legendary affix (aspect): amulet x1.5 / 2H weapon x2 (flLegendaryAffix*Bonus)
        sv = raw.get("arStaticValues") or []
        if sv:
            rec["sv"] = sv
        ranks = [r for r in raw.get("arMaxLegendaryRanks") or [] if r]
        if ranks:
            rec["rk"] = max(ranks)
        cls = class_list(raw.get("fAllowedForPlayerClass"))
        if cls:
            rec["c"] = cls

        for text in [rec.get("t", "")] + list(values.values()) + [l.get("t", "") + l.get("f", "") for l in lines]:
            powertags.update(POWERTAG_RE.findall(text))

        has_text = bool(rec.get("t") or rec.get("l"))
        affixes[name] = rec if has_text else None
        return has_text

    # ---------- Unique / Mythic items ----------
    items_by_name = {}
    scanned = 0
    for path in glob.glob(os.path.join(item_dir, "*.itm.json")):
        scanned += 1
        j = load(path)
        rarity = MAGIC_TYPES.get(j.get("eMagicType"))
        if rarity not in ("Unique", "Mythic"):
            continue
        item_id = os.path.basename(path)[: -len(".itm.json")]
        type_id = (j.get("snoItemType") or {}).get("name") or ""
        if EXCLUDED_TYPES.match(type_id):
            continue
        s = strings(stl_dir, "Item_" + item_id)
        name = s.get("Name", "")
        if JUNK_NAME.search(name) or JUNK_NAME.search(item_id) or "Boost" in item_id or TEST_ID.search(item_id):
            continue

        type_name = strings(stl_dir, "ItemType_" + type_id).get("Name") or type_id
        # Talisman charm copies of uniques: same name + power as the real gear piece.
        # Flagged (not dropped) so app.js decides what to show; gear slots are mapped in app.js.
        is_charm = type_id == "Charm" or item_id.startswith("Talisman_Charm") or bool(j.get("eCharmRarity"))

        implicit = [a["name"] for a in j.get("arInherentAffixes", []) if a and add_affix(a["name"])]
        forced = [a["name"] for a in j.get("arForcedAffixes", []) if a and add_affix(a["name"])]
        power = next((a for a in forced if affixes[a].get("t")), None)
        stats = [a for a in forced if a != power]
        if not (power or stats or implicit):
            continue  # empty template / placeholder item with no text at all

        rec = {"id": item_id, "name": name, "type": type_name, "typeId": type_id, "rarity": rarity}
        if is_charm:
            rec["charm"] = True
        if s.get("Flavor"):
            rec["flavor"] = s["Flavor"]
        cls = class_list(j.get("fUsableByClass"))
        if cls:
            rec["c"] = cls
        ic = icons and icons.for_item(j, cls or (), item_dir)
        if ic:
            rec["ic"] = ic
        if implicit:
            rec["imp"] = implicit
        if stats:
            rec["stats"] = stats
        if power:
            rec["power"] = power

        # Duplicate names (old/new versions of the same piece): prefer entries with a power, then _x2.
        # Keyed by type too, so a charm copy can never displace the real gear item.
        key = (name, rarity, type_id)
        prev = items_by_name.get(key)
        # Tie-break prefers canonical ids over seasonal/runeword re-issues.
        score = (bool(power), not re.match(r"^(S\d+|Runeword|Talisman)_", item_id), "_x2" in item_id.lower(), item_id)
        if not prev or score > prev[0]:
            items_by_name[key] = (score, rec)

    items = sorted((r for _, r in items_by_name.values()), key=lambda r: r["name"])

    # Items whose unique power is dev placeholder text ("(PH) I need a new design!"), plus their
    # Season 10 slot-swap copies (S10_<id>_<slot>), which would otherwise stand in on a random slot.
    wip_ids = {r["id"] for r in items if r.get("power") and WIP_TEXT.search(affixes[r["power"]].get("t", ""))}
    if wip_ids:
        swap_of = re.compile(r"^S10_(" + "|".join(map(re.escape, wip_ids)) + r")_")
        items = [r for r in items if r["id"] not in wip_ids and not swap_of.match(r["id"])]

    # ---------- Legendary aspects ----------
    if os.path.isdir(aspect_dir):
        aspect_affixes = []
        aspect_icon = {}
        for p in glob.glob(os.path.join(aspect_dir, "*.asp.json")):
            asp = load(p)
            ref = asp.get("snoAffix") or {}
            if ref.get("name"):
                aspect_affixes.append(ref["name"])
                aspect_icon[ref["name"]] = asp.get("hIconOverride")
    else:
        print("! Aspect folder not found: falling back to StringList/Affix_legendary_*.")
        aspect_icon = {}
        aspect_affixes = [os.path.basename(p)[len("Affix_"): -len(".stl.json")]
                          for p in glob.glob(os.path.join(stl_dir, "Affix_legendary_*.stl.json"))]

    aspects_by_name = {}
    for a in aspect_affixes:
        if not add_affix(a):
            continue
        rec = affixes[a]
        raw_name = rec.get("n")
        if not raw_name or not rec.get("t") or JUNK_NAME.search(raw_name) or WIP_TEXT.search(rec["t"]):
            continue
        name = f"Aspect {raw_name}" if raw_name.lower().startswith("of ") else f"{raw_name} Aspect"
        key = (name, tuple(rec.get("c", [])))
        score = ("_x2" in a.lower(), a)
        prev = aspects_by_name.get(key)
        if not prev or score > prev[0]:
            arec = {"id": a, "name": name}
            ic = icons and icons.for_handle(aspect_icon.get(a))
            if ic:
                arec["ic"] = ic
            aspects_by_name[key] = (score, arec)
    aspects = sorted((r for _, r in aspects_by_name.values()), key=lambda r: r["name"])

    # ---------- Power script formulas (PowerTag refs) ----------
    powers = {}
    pending = set(powertags)
    while pending:
        pname = pending.pop()
        if pname in powers:
            continue
        p = os.path.join(power_dir, pname + ".pow.json")
        if not os.path.exists(p):
            continue
        sfs = [(sf.get("tFormula") or {}).get("value", "") for sf in load(p).get("ptScriptFormulas", [])]
        powers[pname] = sfs
        for f in sfs:
            pending.update(POWERTAG_RE.findall(f))

    used = {a for r in items for a in r.get("imp", []) + r.get("stats", []) + ([r["power"]] if r.get("power") else [])}
    used |= {a["id"] for a in aspects}
    out_affixes = {k: v for k, v in affixes.items() if v and k in used}

    # ---------- Mythic bonus affixes (S14_Mythic_*: Unique Potency, CDR, +All Skills) ----------
    mythic = []
    for p in sorted(glob.glob(os.path.join(affix_dir, "S*_Mythic_*.aff.json"))) if have_affix else []:
        mid = os.path.basename(p)[: -len(".aff.json")]
        for at in load(p).get("ptItemAffixAttributes", []):
            spec = at.get("tAttribute", {})
            attr = spec.get("__eAttribute_name__", "")
            tmpl = attr_desc.get(mid) or attr_desc.get(attr)
            if not tmpl:
                continue
            entry = {"id": mid, "attr": attr, "param": spec.get("nParam", -1),
                     "t": tmpl.replace("{VALUE1}", "{VALUE}"),
                     "f": (spec.get("szAttributeFormula") or {}).get("value", "")}
            if not entry["t"].lstrip().startswith("{c_mythic}"):
                entry["t"] = "{c_mythic}{i}Mythic:{/i}{/c} " + entry["t"]
            mythic.append(entry)

    # ---------- GameBalance stat formulas (gbidFormula -> [[item power start, formula], ...]) ----------
    gb = {}
    gb_path = os.path.join(args.d4data, "json", "base", "meta", "GameBalance", "AttributeFormulas.gam.json")
    if os.path.exists(gb_path):
        used_gb = {l["g"] for a in out_affixes.values() for l in a.get("l", []) if l.get("g")}
        for e in load(gb_path)["ptData"][0]["tEntries"]:
            name = e["tHeader"]["szName"]
            if name in used_gb:
                gb[name] = sorted([r["nItemPowerRangeStart"], r["tFormula"]["value"]] for r in e.get("arRanges", []))
        missing = used_gb - gb.keys()
        if missing:
            print(f"warning: {len(missing)} gbid formulas not found: {sorted(missing)[:5]}", file=sys.stderr)
    else:
        print("! GameBalance/AttributeFormulas.gam.json not found: base stat values will show as #.")

    # ---------- Global affix constants (Global/globals.glo.json) ----------
    # flLegendaryAffixAmuletBonus 0.5 (amulet x1.5), flLegendaryAffixTwoHandBonus 1 (2H x2),
    # flSacred/AncestralAffixScalarOffense (used by some stat formulas).
    globals_out = {}
    glo_path = os.path.join(args.d4data, "json", "base", "meta", "Global", "globals.glo.json")
    if os.path.exists(glo_path):
        txt = open(glo_path, encoding="utf-8").read()
        for key in ("flLegendaryAffixAmuletBonus", "flLegendaryAffixTwoHandBonus", "flSacredAffixScalarOffense",
                    "flAncestralAffixScalarOffense", "flSacredAffixScalarDefense", "flAncestralAffixScalarDefense"):
            m = re.search(r'"%s":\s*([-0-9.eE]+)' % key, txt)
            if m:
                globals_out[key] = float(m.group(1))

    drops = attach_drops(items, os.path.join(ROOT, "data", "sources", "boss_loot.json"))
    runes = extract_runes(item_dir, stl_dir, os.path.join(args.d4data, "json", "base", "meta", "Recipe"),
                          os.path.join(ROOT, "data", "sources", "runes_maxroll.json"), items)

    if icons:
        # Same-name copies whose own files have no art (e.g. Runeword bases) borrow it.
        by_name = {}
        for it in items:
            if it.get("ic"):
                by_name.setdefault((it["name"], it.get("charm", False)), it["ic"])
        for it in items:
            if not it.get("ic") and (it["name"], it.get("charm", False)) in by_name:
                it["ic"] = by_name[(it["name"], it.get("charm", False))]
        for r in runes.get("runes", []):
            p = os.path.join(item_dir, r["id"] + ".itm.json")
            ic = os.path.exists(p) and icons.for_item(load(p))
            if ic:
                r["ic"] = ic
        # Icons used only by aspect/item entries dropped later still get written; that's harmless.
        n, kb = icons.write()
        print(f"Icons: {n} files ({kb:,.0f} KB) in data/icons/ | items {sum(1 for i in items if i.get('ic'))}/{len(items)}, "
              f"aspects {sum(1 for a in aspects if a.get('ic'))}/{len(aspects)}, "
              f"runes {sum(1 for r in runes.get('runes', []) if r.get('ic'))}/{len(runes.get('runes', []))}")

    codex = {
        "meta": {
            "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "classes": CLASSES,
            "counts": {"items": len(items), "aspects": len(aspects), "affixes": len(out_affixes), "powers": len(powers), "item_files_scanned": scanned},
            "sources": ["data/Item", "data/Power", "data/StringList"] + (["d4data/json/base/meta/Affix"] if have_affix else []),
        },
        "items": items,
        "aspects": aspects,
        "affixes": out_affixes,
        "powers": powers,
        "mythic": mythic,
        "gb": gb,
        "globals": globals_out,
        "drops": drops,
        "runes": runes,
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(codex, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(args.out) / 1024
    print(f"Wrote {os.path.relpath(args.out, ROOT)} ({size:,.0f} KB) in {time.time() - t0:.1f}s")
    print(json.dumps(codex["meta"]["counts"]))


if __name__ == "__main__":
    main()
