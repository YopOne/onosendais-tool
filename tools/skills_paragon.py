"""Skill trees (and later Paragon boards and glyphs) for data/index/skills.json.

Called by build_index.py. Sources (d4data json/base/meta + data/):
  SkillKit/<Class>.skl.json            tree nodes: vPosition, arConnections, gbidReward, nExclusiveGroupId,
                                       dwNodeRequiredPlayerLevel, eRootNodeType (1 = cluster root, 2 = hub, 0 = reward)
  GameBalance/SkillTreeRewards.gam     reward -> eType 0 unlock a skill (snoPower, dwMaxTalentRanks),
                                       1 a skill upgrade (snoPower + szPowerMod hash)
  Power/<power>.pow.json (data/Power)  arMods[].szName (hash) -> dwModId; ptScriptFormulas (SF_n); hIconNormal
  StringList/Power_<power>             name, desc, Mod<dwModId>_Name / _Description
  GameBalance/PowerFormulaTables       Table(n, sLevel): n = index (34 = SkillRankBonus)
"""
import json
import os
import re

TREE_FILES = {"Barbarian": "Barbarian", "Druid": "Druid", "Necromancer": "Necromancer", "Paladin": "Paladin_NEW",
              "Rogue": "Rogue", "Sorcerer": "Sorcerer", "Spiritborn": "Spiritborn", "Warlock": "Warlock"}
POWERTAG_RE = re.compile(r'PowerTag\.([A-Za-z0-9_]+)\.')


def _load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _strings(stl_dir, name):
    p = os.path.join(stl_dir, name + ".stl.json")
    if not os.path.exists(p):
        return {}
    return {e["szLabel"]: e["szText"] for e in _load(p).get("arStrings", [])}


BOARD_PREFIX = {"Barbarian": "Barb", "Druid": "Druid", "Necromancer": "Necro", "Paladin": "Paladin", "Rogue": "Rogue",
                "Sorcerer": "Sorc", "Spiritborn": "Spirit", "Warlock": "Warlock"}
RARITY = {0: "normal", 1: "magic", 2: "magic", 3: "rare", 4: "legendary"}


def extract_paragon(meta_dir, stl_dir, icons, stat_line, attr_desc, skill_text, pending):
    """Paragon boards per class, node definitions, thresholds and the GameBalance formulas they use."""
    import glob
    pdir = os.path.join(meta_dir, "ParagonBoard")
    boards, node_names = {}, set()
    for cls, pre in BOARD_PREFIX.items():
        out = []
        for path in sorted(glob.glob(os.path.join(pdir, f"Paragon_{pre}_*.pbd.json"))):
            bid = os.path.basename(path)[: -len(".pbd.json")]
            b = _load(path)
            w = b.get("nWidth") or 21
            cells = [[i, e["name"]] for i, e in enumerate(b.get("arEntries") or []) if e and e.get("name")]
            if not cells:
                continue
            node_names.update(n for _, n in cells)
            out.append({"id": bid, "n": _strings(stl_dir, "ParagonBoard_" + bid).get("Name") or bid, "w": w,
                        "h": len(b.get("arEntries") or []) // w, "cells": cells, "start": bid.endswith("_00")})
        if out:
            boards[cls] = out
    nodes, thresholds, gb_names = {}, {}, set()
    for name in sorted(node_names):
        path = os.path.join(meta_dir, "ParagonNode", name + ".pgn.json")
        if not os.path.exists(path):
            continue
        d = _load(path)
        rec = {"r": RARITY.get(d.get("eRarityOverride") or 0, "normal")}
        nm = _strings(stl_dir, "ParagonNode_" + name).get("Name")
        if nm:
            rec["n"] = nm
        lines = []
        for at in d.get("ptAttributes") or []:
            if at.get("__eAttribute_name__") in attr_desc:
                ln = stat_line(at)
                if ln.get("g"):
                    gb_names.add(ln["g"])
                lines.append(ln)
        if lines:
            rec["l"] = lines
        if d.get("ptBonusAttributeIndices"):
            rec["b"] = d["ptBonusAttributeIndices"]
        th = [x.get("name") for x in d.get("arThresholdSelector") or [] if x]
        if th:
            rec["th"] = th
            for t in th:
                if t not in thresholds:
                    tp = os.path.join(meta_dir, "ParagonThreshold", t + ".pth.json")
                    if os.path.exists(tp):
                        thresholds[t] = [{"a": x["tThresholdAttribute"].get("__eAttribute_name__", ""), "f": x["tThresholdValueFormula"]["value"]}
                                         for x in _load(tp).get("ptThresholds") or []]
        pw = (d.get("snoPassivePower") or {}).get("name")
        if pw:
            rec["pw"] = pw
            skill_text(pw)
        if d.get("bHasSocket"):
            rec["sock"] = 1
        if d.get("bIsGate"):
            rec["gate"] = 1
        if name.startswith("StartNode"):
            rec["start"] = 1
        ic = icons and (icons.for_handle(d.get("hIcon")) or icons.for_handle(d.get("hIconMask")))
        if ic:
            rec["ic"] = ic
        nodes[name] = rec
    # GameBalance formulas the nodes use (ParagonNode*), per item power range like codex.gb.
    gb = {}
    gp = os.path.join(meta_dir, "GameBalance", "AttributeFormulas.gam.json")
    if os.path.exists(gp):
        for e in _load(gp)["ptData"][0]["tEntries"]:
            if e["tHeader"]["szName"] in gb_names:
                gb[e["tHeader"]["szName"]] = sorted([r["nItemPowerRangeStart"], r["tFormula"]["value"]] for r in e.get("arRanges", []))
    budget = []
    gl = os.path.join(meta_dir, "Global", "globals.glo.json")
    if os.path.exists(gl):
        m = re.search(r'"arParagonPowerBudgetMultiplier":\s*\[([^\]]*)\]', open(gl, encoding="utf-8").read())
        if m:
            budget = [float(x) for x in re.findall(r"[-0-9.eE]+", m.group(1))]
    # ---------- Glyphs (ParagonGlyph + ParagonGlyphAffix) ----------
    # eBonusOperation: 2 = per <per> source stat taken in range -> +dest attribute; 4 = bonus attribute (Legendary glyph);
    # 5 = passive power when a threshold of a stat is in range; 1 = +% bonus to nodes of a rarity in range.
    # Value ("GlyphAffixScalar") = (flStartingBonusScalar + flAddedBonusScalarPerLevel x (level - 1)) x formula x 100 (assumed).
    glyphs = {}
    gdir = os.path.join(meta_dir, "ParagonGlyph")
    from_classes = ["Sorcerer", "Druid", "Barbarian", "Rogue", "Necromancer", "Spiritborn", "Paladin", "Warlock"]
    for path in sorted(glob.glob(os.path.join(gdir, "*.gph.json"))):
        gid = os.path.basename(path)[: -len(".gph.json")]
        if not gid.startswith("Rare_"):
            continue
        g = _load(path)
        affs = []
        for a in g.get("arAffixes") or []:
            ap = os.path.join(meta_dir, "ParagonGlyphAffix", a["name"] + ".gaf.json")
            if not os.path.exists(ap):
                continue
            d = _load(ap)
            desc = _strings(stl_dir, "ParagonGlyphAffix_" + a["name"]).get("Desc", "")
            rec = {"id": a["name"], "op": d.get("eBonusOperation"), "req": d.get("eRequiredRarity") or 0,
                   "s0": d.get("flStartingBonusScalar") or 0, "s1": d.get("flAddedBonusScalarPerLevel") or 0}
            per = d.get("unk_12a5abd") or 100
            rec["per"] = per / 100
            if desc:
                rec["t"] = desc
            f = (d.get("gbidPowerBudgetFormula") or {}).get("name")
            if f:
                rec["f"] = f
                gb_names.add(f)
            pairs = d.get("unk_e80c332") or []
            if pairs:
                rec["src"] = pairs[0]["tSourceAttribute"].get("__eAttribute_name__", "")
                rec["dst"] = pairs[0]["tDestinationAttribute"].get("__eAttribute_name__", "")
                if attr_desc.get(rec["dst"]):
                    rec["dt"] = attr_desc[rec["dst"]]
            if d.get("eAffectedNodeRarity"):
                rec["rar"] = RARITY.get(d["eAffectedNodeRarity"], "")
            th = [x.get("name") for x in d.get("arThresholdSelector") or [] if x]
            if th:
                tp = os.path.join(meta_dir, "ParagonThreshold", th[0] + ".pth.json")
                if os.path.exists(tp):
                    rec["th"] = [{"a": x["tThresholdAttribute"].get("__eAttribute_name__", ""), "f": x["tThresholdValueFormula"]["value"]}
                                 for x in _load(tp).get("ptThresholds") or []]
            pw = (d.get("snoBonusPassivePower") or {}).get("name")
            if pw:
                rec["pw"] = pw
                skill_text(pw)
            affs.append(rec)
        flags = g.get("fUsableByClass") or []
        # fUsableByClass order here: same as items (Sorcerer, Druid, Barbarian, Rogue, Necromancer, Spiritborn, Paladin, Warlock)
        cls = [from_classes[i] for i, v in enumerate(flags) if v and i < len(from_classes)]
        rec = {"n": (_strings(stl_dir, "Item_ParagonGlyph_" + gid).get("Name") or gid).replace("Glyph: ", ""),
               "c": [] if len(cls) == len(from_classes) else cls, "a": affs}
        icons_h = [h for h in g.get("arIcons") or [] if h]
        ic = icons and next((icons.for_handle(h) for h in icons_h if icons.for_handle(h)), None)
        if ic:
            rec["ic"] = ic
        glyphs[gid] = rec
    # Re-read formulas now that the glyph ones are known.
    if os.path.exists(gp):
        for e in _load(gp)["ptData"][0]["tEntries"]:
            if e["tHeader"]["szName"] in gb_names:
                gb[e["tHeader"]["szName"]] = sorted([r["nItemPowerRangeStart"], r["tFormula"]["value"]] for r in e.get("arRanges", []))
    radius = []
    if os.path.exists(gl):
        m = re.search(r'"arGlyphRadiusLevels":\s*\[([^\]]*)\]', open(gl, encoding="utf-8").read())
        if m:
            radius = [int(float(x)) for x in re.findall(r"[-0-9.]+", m.group(1))]
    # Glyph upgrade chance by (Pit tier cleared - glyph level): [start delta, span, chance, levels per success].
    upgrade = []
    if os.path.exists(gl):
        gj = _load(gl)
        def _find(o, key):
            if isinstance(o, dict):
                for k, v in o.items():
                    if k == key:
                        return v
                    r = _find(v, key)
                    if r is not None:
                        return r
            if isinstance(o, list):
                for v in o:
                    r = _find(v, key)
                    if r is not None:
                        return r
            return None
        for e in _find(gj, "arGlyphChanceUpgradeEntries") or []:
            lo, span = e["tDeltaLevel"]["rangeValue1"], e["tDeltaLevel"]["rangeValue2"]
            if lo > -1000:
                upgrade.append([lo, span, round(e.get("flSuccessChance") or 0, 4), e.get("dwLevelsPerUpgrade") or 1])
    return {"boards": boards, "nodes": nodes, "thresholds": thresholds, "gb": gb, "budget": budget, "glyphs": glyphs, "radius": radius,
            "upgrade": upgrade}


def extract(meta_dir, stl_dir, power_dir, icons=None, stat_line=None, attr_desc=None):
    rewards = {e["tHeader"]["szName"]: e for e in _load(os.path.join(meta_dir, "GameBalance", "SkillTreeRewards.gam.json"))["ptData"][0]["tEntries"]}
    tables = [e.get("flValue") or [] for e in _load(os.path.join(meta_dir, "GameBalance", "PowerFormulaTables.gam.json"))["ptData"][0]["tEntries"]]

    powers, skills, pending = {}, {}, set()
    pow_cache = {}

    def pow_json(name):
        if name not in pow_cache:
            p = os.path.join(power_dir, name + ".pow.json")
            pow_cache[name] = _load(p) if os.path.exists(p) else None
        return pow_cache[name]

    def skill_text(pname):
        """Name, description, mods (by dwModId) and icon for one skill power."""
        if pname in skills:
            return skills[pname]
        s = _strings(stl_dir, "Power_" + pname)
        pj = pow_json(pname) or {}
        rec = {"n": s.get("name") or pname.split("_", 1)[-1], "d": s.get("desc", ""), "m": {}}
        # Skill categories from the power's tags (Skill_Primary_Core -> Core, Skill_Hellfire -> Hellfire, ...), used to
        # match gear text like "Your Archfiend Skills ...". Per-skill and search tags are skipped.
        tags = [(pj.get("tPrimaryTag") or {}).get("gbidSkillTag") or {}] + [t.get("gbidSkillTag") or {} for t in pj.get("arSkillTags") or []]
        cats = []
        for t in tags:
            nm = (t or {}).get("name") or ""
            if not nm.startswith("Skill_") or re.match(r"Skill_(Barbarian|Druid|Necro|Necromancer|Paladin|Rogue|Sorc|Sorcerer|Spiritborn|Warlock)_", nm):
                continue
            c = nm.replace("Skill_Primary_", "").replace("Skill_", "").replace("_", " ").strip()
            if c and c.lower() != rec["n"].lower().replace(" ", "") and c.lower() != rec["n"].lower() and c not in cats:
                cats.append(c)
        if cats:
            rec["tg"] = cats
        ic = icons and icons.for_handle(pj.get("hIconNormal"))
        if ic:
            rec["ic"] = ic
        for m in pj.get("arMods") or []:
            mid = m.get("dwModId")
            nm, ds = s.get(f"Mod{mid}_Name"), s.get(f"Mod{mid}_Description")
            if nm or ds:
                e = {"n": nm or "", "d": ds or "", "h": m.get("szName")}
                mic = icons and icons.for_handle(m.get("hIconNormalOverride"))
                if mic:
                    e["ic"] = mic
                rec["m"][str(mid)] = e
        skills[pname] = rec
        pending.add(pname)
        for text in [rec["d"]] + [x["d"] for x in rec["m"].values()]:
            pending.update(POWERTAG_RE.findall(text))
        return rec

    trees = {}
    for cls, fname in TREE_FILES.items():
        p = os.path.join(meta_dir, "SkillKit", fname + ".skl.json")
        if not os.path.exists(p):
            continue
        k = _load(p)
        nodes = []
        for n in k["arNodes"]:
            rn = (n.get("gbidReward") or {}).get("name")
            rw = rewards.get(rn) if rn else None
            node = {"id": n["dwID"], "x": round(n["vPosition"]["x"]), "y": round(n["vPosition"]["y"]),
                    "c": [c["nIndexNode"] for c in n.get("arConnections") or []]}
            lv = n.get("dwNodeRequiredPlayerLevel") or 0
            if lv:
                node["lv"] = lv
            if n.get("nExclusiveGroupId", -1) != -1:
                node["ex"] = n["nExclusiveGroupId"]
            root = n.get("eRootNodeType")
            if root == 1:
                node["k"] = "root"
            elif root == 2 or not rw:
                node["k"] = "hub"
            else:
                pname = (rw.get("snoPower") or {}).get("name")
                if not pname:
                    node["k"] = "hub"
                else:
                    st = skill_text(pname)
                    node["p"] = pname
                    node["max"] = rw.get("dwMaxTalentRanks") or 1
                    if rw.get("eType") == 0:
                        node["k"] = "skill"
                    else:
                        node["k"] = "mod"
                        # Upgrades and variants take one point (user, 19 Nov). The data's
                        # dwMaxTalentRanks of 3 or 5 on these rewards isn't how the game spends them.
                        node["max"] = 1
                        mid = next((m.get("dwModId") for m in (pow_json(pname) or {}).get("arMods") or [] if m.get("szName") == rw.get("szPowerMod")), None)
                        if mid is not None:
                            node["m"] = str(mid)
                        node["rw"] = rn
            nodes.append(node)
        # Default skill (always unlocked): the class's basic loadout.
        default = [(x or {}).get("name") for x in k.get("arDefaultSkillLoadout") or []]
        trees[cls] = {"nodes": nodes, "default": [d for d in default if d]}

    paragon = extract_paragon(meta_dir, stl_dir, icons, stat_line, attr_desc or {}, skill_text, pending) if stat_line else {}

    # Class specializations (Rogue Specializations, Barbarian Weapon Expertise, Spiritborn Spirit Hall, ...): tools/specs.py
    from specs import extract_specs
    spec = extract_specs(meta_dir, stl_dir, skill_text, icons, skills)

    # Script formulas of every referenced power (and PowerTag references, recursively).
    while pending:
        pname = pending.pop()
        if pname in powers:
            continue
        pj = pow_json(pname)
        if not pj:
            continue
        sfs = [(sf.get("tFormula") or {}).get("value", "") for sf in pj.get("ptScriptFormulas", [])]
        powers[pname] = sfs
        for f in sfs:
            pending.update(x for x in POWERTAG_RE.findall(f) if x not in powers)

    # Skill tree art (game sheets, cut by icons.py): node frames and each class's background panel.
    ui = {}
    if icons:
        V2 = {"rootOn": 1918231416, "rootOff": 2313016955, "modOn": 1829110042, "modOpen": 1986147116, "modOff": 3769819183,
              "hubOff": 2954744883, "hubOpen": 1700001041, "hubOn": 3494649535}
        ui = {k: icons.for_handle(h) for k, h in V2.items()}
        # 2DUI_SkillTree_ABCDFrames: 4 rows of skill diamonds x (taken, available, locked)
        abcd = [[678742091, 2026560377, 664866222], [2916187532, 3980872826, 1996494639],
                [858665677, 1640217979, 3328123056], [3096111118, 3594530428, 364784177]]
        ui["skill"] = [[icons.for_handle(h) for h in row] for row in abcd]
        ui = {k: v for k, v in ui.items() if v}
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    bg_dir, out_dir = os.path.join(root, "2DUI"), os.path.join(root, "data", "skilltree")
    bgs = {}
    if os.path.isdir(bg_dir):
        import glob as _glob
        import subprocess
        os.makedirs(out_dir, exist_ok=True)
        for cls in TREE_FILES:
            hits = sorted(_glob.glob(os.path.join(_glob.escape(bg_dir), _glob.escape(f"2DUI_SkillTreeBackgroundMiddle_{cls} [") + "*].png")))
            dst = os.path.join(out_dir, cls.lower() + ".webp")
            if hits and not os.path.exists(dst):
                # The stone-framed arch panel: the middle 54% of the 5120 px sheet, scaled to 1800 px tall.
                subprocess.run(["cwebp", "-quiet", "-q", "72", "-crop", "1178", "0", "2765", "5120", "-resize", "0", "1800", hits[0], "-o", dst], check=True)
            if os.path.exists(dst):
                bgs[cls] = "data/skilltree/" + cls.lower() + ".webp"
    ui["bg"] = bgs
    return {"trees": trees, "skills": skills, "powers": dict(sorted(powers.items())), "tables": tables, "paragon": paragon, "spec": spec, "ui": ui}
