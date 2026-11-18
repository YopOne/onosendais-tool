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


def extract(meta_dir, stl_dir, power_dir, icons=None):
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
                        mid = next((m.get("dwModId") for m in (pow_json(pname) or {}).get("arMods") or [] if m.get("szName") == rw.get("szPowerMod")), None)
                        if mid is not None:
                            node["m"] = str(mid)
                        node["rw"] = rn
            nodes.append(node)
        # Default skill (always unlocked): the class's basic loadout.
        default = [(x or {}).get("name") for x in k.get("arDefaultSkillLoadout") or []]
        trees[cls] = {"nodes": nodes, "default": [d for d in default if d]}

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

    return {"trees": trees, "skills": skills, "powers": powers, "tables": tables}
