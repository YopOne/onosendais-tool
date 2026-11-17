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
  data/sources/boss_loot.json      which boss drops each unique (hand-maintained from Maxroll)
  d4data/json/base/meta/Recipe     runeword, rune and Mythic crafting recipes (see runes_recipes.py)
  data/sources/runes_maxroll.json  rune drop locations + which runes are current (from Maxroll)

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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Order of fUsableByClass / fAllowedForPlayerClass, verified against item file names.
CLASSES = ["Sorcerer", "Druid", "Barbarian", "Rogue", "Necromancer", "Spiritborn", "Paladin", "Warlock"]

MAGIC_TYPES = {1: "Legendary", 2: "Unique", 4: "Mythic"}

EXCLUDED_TYPES = re.compile(r"^(Fish|CollectiblePower|ReputationCache|Quest.*|Cache.*|Junk|.*Bad Data)$")
TEST_ID = re.compile(r"^(QA|TEST|DEBUG)_", re.I)  # QA fixtures; can share names with real items
JUNK_NAME = re.compile(r"\[(PH|WIP)\]|\((PH|DEBUG|DNS)\)|^\[PH\]|Performance Test|^Boost |^Legendary .+ \d+$|^Something Super Cool$|^\s*$", re.I)

POWERTAG_RE = re.compile(r'PowerTag\.([A-Za-z0-9_]+)\."Script Formula \d+"')
DAMAGE_TYPES = ["Physical", "Fire", "Lightning", "Cold", "Poison", "Shadow"]
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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=os.path.join(ROOT, "data"))
    ap.add_argument("--d4data", default=os.path.join(ROOT, "d4data"))
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "index", "codex.json"))
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
    attr_desc = strings(stl_dir, "AttributeDescriptions")
    toc = load(toc_path) if os.path.exists(toc_path) else {}
    if not toc:
        print("! CoreTOC_flat.json not found: skill names on stat lines will be generic.")

    affixes = {}
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
            if param not in (-1, 0):
                label = power_display_name(param)
                if label is None and attr.startswith("Damage_Type") and 0 <= param < len(DAMAGE_TYPES):
                    label = DAMAGE_TYPES[param]
            line = {"t": attr_desc[attr], "a": attr}
            if label:
                line["p"] = label
            # gbidFormula = value comes from item-power balance tables we don't have
            if spec.get("gbidFormula") is None and formula not in ("", "0"):
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
        if JUNK_NAME.search(name) or JUNK_NAME.search(item_id) or "Boost" in item_id or TEST_ID.match(item_id):
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

    # ---------- Legendary aspects ----------
    if os.path.isdir(aspect_dir):
        aspect_affixes = []
        for p in glob.glob(os.path.join(aspect_dir, "*.asp.json")):
            ref = load(p).get("snoAffix") or {}
            if ref.get("name"):
                aspect_affixes.append(ref["name"])
    else:
        print("! Aspect folder not found: falling back to StringList/Affix_legendary_*.")
        aspect_affixes = [os.path.basename(p)[len("Affix_"): -len(".stl.json")]
                          for p in glob.glob(os.path.join(stl_dir, "Affix_legendary_*.stl.json"))]

    aspects_by_name = {}
    for a in aspect_affixes:
        if not add_affix(a):
            continue
        rec = affixes[a]
        raw_name = rec.get("n")
        if not raw_name or not rec.get("t") or JUNK_NAME.search(raw_name):
            continue
        name = f"Aspect {raw_name}" if raw_name.lower().startswith("of ") else f"{raw_name} Aspect"
        key = (name, tuple(rec.get("c", [])))
        score = ("_x2" in a.lower(), a)
        prev = aspects_by_name.get(key)
        if not prev or score > prev[0]:
            aspects_by_name[key] = (score, {"id": a, "name": name})
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

    drops = attach_drops(items, os.path.join(ROOT, "data", "sources", "boss_loot.json"))
    runes = extract_runes(item_dir, stl_dir, os.path.join(args.d4data, "json", "base", "meta", "Recipe"),
                          os.path.join(ROOT, "data", "sources", "runes_maxroll.json"), items)

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
