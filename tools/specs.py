"""Class specializations for data/index/skills.json ("spec"): each class's mechanic, from PlayerClass/<Class>.pcl.json.

  Rogue        tRogueData.arRogueSpecData            Specializations: Combo Points / Inner Sight / Preparation (pick 1)
  Barbarian    tBarbData.arWeaponExpertiseData       Weapon Expertise per weapon type (+ rank 10 bonus); Technique slot
  Spiritborn   tSpiritbornData.arSpiritInfo          Spirit Hall: primary spirit (level 15) and secondary (level 30)
  Druid        tDruidData.tPassiveData.arPowers      Spirit Boons: 1 boon per spirit + 1 more from the bonded spirit
  Necromancer  tNecroData.arNecroArmyUnitTypes       Book of the Dead: per minion a specialization, then upgrade A / B or Sacrifice
  Sorcerer     tSorcererData.arEnchantSlotUnlocks    Enchantments: 2 slots (levels 15, 30), one skill each (Power/Sorcerer_Enchantment_*)
  Paladin      tPaladinData.arOathData               Oaths (pick 1)
  Warlock      tWarlockData.arSoulShards             Soul Shards: a shard (level 15), then one of its fragments (level 30)

Each class: {"t": title, "note": how it works, "slots": [{"id", "n", "lv", "dep"?, "uniq"?, "o": [option]}]}.
An option: {"id", "n", "p"?: power (text from skills[p]), "p2"?: second power (Barbarian rank 10 bonus),
"d"?: text when there's no power, "g"?: group (a "dep" slot lists only options whose g is the value chosen in slot dep),
"lv"?: unlock level, "ic"?: icon, "tags"?: skill tags it adds, "skill"?: the skill power those tags go to, "it"?: item types}.
Slots sharing a "uniq" key can't hold the same option id.
"""
import json
import os
import re


def _load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _strings(stl_dir, name):
    p = os.path.join(stl_dir, name + ".stl.json")
    if not os.path.exists(p):
        return {}
    return {e["szLabel"]: e["szText"] for e in _load(p).get("arStrings", [])}


def _sno(x):
    return (x or {}).get("name") if isinstance(x, dict) else None


def _level(cond):
    """nLevel from an inline player-level condition (dwType 1516041750), or None."""
    for c in ((cond or {}).get("ptInlineCondition") or []):
        if c.get("nLevel"):
            return c["nLevel"]
    return None


TAG_NAMES = {"Skill_Bone": "Bone", "Skill_Blood": "Blood", "Skill_Shadow": "Shadow"}


def extract_specs(meta_dir, stl_dir, skill_text, icons, skills):
    from skills_paragon import tag_display_names
    tag_names = tag_display_names(stl_dir)  # Shadow -> Darkness, as the game shows it
    ic = (lambda h: icons.for_handle(h) if icons and h else None)
    out = {}

    def opt(id_, n, p=None, **kw):
        o = {"id": id_, "n": n}
        if p:
            st = skill_text(p)
            o["p"] = p
            if not kw.get("ic") and st.get("ic"):
                o["ic"] = st["ic"]
        for k, v in kw.items():
            if v not in (None, "", []):
                o[k] = v
        return o

    def pcl(cls):
        p = os.path.join(meta_dir, "PlayerClass", cls + ".pcl.json")
        return _load(p) if os.path.exists(p) else {}

    # ---- Rogue: Specializations ----
    d = pcl("Rogue").get("tRogueData") or {}
    opts = []
    for x in d.get("arRogueSpecData") or []:
        p = _sno(x.get("snoSpecPower"))
        if p:
            opts.append(opt(skill_text(p)["n"], skill_text(p)["n"], p, lv=x.get("nUnlockLevel")))
    opts.sort(key=lambda o: o.get("lv") or 0)
    if opts:
        out["Rogue"] = {"t": "Specializations", "note": "Pick one Specialization; each unlocks at its level.",
                        "slots": [{"id": "spec", "n": "Specialization", "lv": min(o.get("lv") or 0 for o in opts), "o": opts}]}

    # ---- Barbarian: Weapon Expertise + Technique ----
    d = pcl("Barbarian").get("tBarbData") or {}
    names = _strings(stl_dir, "WeaponExpertise")
    opts = []
    for x in d.get("arWeaponExpertiseData") or []:
        p = _sno(x.get("snoPassivePower"))
        if not p:
            continue
        r10 = next((_sno(r.get("snoPassivePower")) for r in x.get("arRankRewards") or [] if r.get("nRequiredRank") == 10), None)
        if r10:
            skill_text(r10)
        its = [t for t in (_sno(x.get("snoItemType")), _sno(x.get("snoAdditionalItemType"))) if t]
        nm = skill_text(p)["n"].replace(" Expertise", "")
        opts.append(opt(p.replace("Barbarian_WeaponExpertise_", ""), nm, p, p2=r10, it=its))
    if opts:
        out["Barbarian"] = {"t": names.get("WeaponExpertiseHeader", "Weapon Expertise"),
                            "note": "Each weapon type has an Expertise that works when a skill uses that weapon (ranks 1–10 from using it; rank 10 adds a bonus). The Technique slot applies one Expertise to all your attacks, whatever weapon you use.",
                            "slots": [{"id": "tech", "n": names.get("TechniqueLabel", "Weapon Technique"), "lv": d.get("dwTechniqueUnlockLevel"), "o": opts}],
                            "expertise": True}

    # ---- Spiritborn: Spirit Hall ----
    d = pcl("Spiritborn").get("tSpiritbornData") or {}
    names = _strings(stl_dir, "SpiritbornMechanic")
    spirits = ["Jaguar", "Eagle", "Gorilla", "Centipede"]
    types = d.get("arSpiritTypeInfo") or []
    slots = []
    for ti, (sid, label) in enumerate([("primary", "Primary Spirit"), ("secondary", "Secondary Spirit")]):
        opts = []
        for si, sp in enumerate(d.get("arSpiritInfo") or []):
            tsd = (sp.get("arTypeSpecificData") or [])
            p = _sno(tsd[ti].get("snoPassivePower")) if ti < len(tsd) else None
            nm = names.get(spirits[si], spirits[si]) if si < len(spirits) else f"Spirit {si + 1}"
            if p:
                opts.append(opt(nm, nm, p, ic=ic((sp.get("hSpiritIcon") or {}).get("hImageHandle"))))
        slots.append({"id": sid, "n": label, "lv": (types[ti] if ti < len(types) else {}).get("nUnlockLevel"), "o": opts})
    if slots and slots[0]["o"]:
        out["Spiritborn"] = {"t": names.get("ClassMechanicHeader", "Spirit Hall"),
                             "note": "Pick a Spirit for each slot: the primary (level 15) and secondary (level 30) passives differ. Both slots can hold the same Spirit (Loyalty's Mantle rewards matching choices).",
                             "match": True,
                             "slots": slots}

    # ---- Druid: Spirit Boons ----
    d = pcl("Druid").get("tDruidData") or {}
    names = _strings(stl_dir, "DruidSpirit_Panel")
    by_spirit = {}
    for x in ((d.get("tPassiveData") or {}).get("arPowers") or []):
        p = _sno(x.get("snoPassivePower"))
        m = re.match(r"Druid_Passive_([A-Za-z]+)_\d+$", p or "")
        if m:
            by_spirit.setdefault(m[1], []).append(p)
    slots, all_boons = [], []
    for sp, ps in by_spirit.items():
        nm = names.get("Spirit_" + sp, sp)
        opts = [opt(p, skill_text(p)["n"], p, g=nm) for p in ps]
        all_boons += opts
        slots.append({"id": sp.lower(), "n": f"{nm} Spirit", "lv": d.get("dwUnlockLevel"), "uniq": "boon", "o": opts})
    if slots:
        spirit_names = [names.get("Spirit_" + sp, sp) for sp in by_spirit]
        slots.append({"id": "bond", "n": names.get("SpiritBonding", "Spirit Bonding"), "lv": d.get("dwUnlockLevel"),
                      "o": [{"id": nm, "n": nm} for nm in spirit_names]})
        slots.append({"id": "bond2", "n": "Bonded Boon", "lv": d.get("dwUnlockLevel"), "dep": "bond", "uniq": "boon", "o": all_boons})
        out["Druid"] = {"t": names.get("AssignSkills", "Spirit Boons").strip(),
                        "note": "Activate one Boon from each animal spirit. Spirit Bonding (after unlocking every Boon) activates one more Boon from the spirit you bond with.",
                        "slots": slots}

    # ---- Necromancer: Book of the Dead ----
    d = pcl("Necromancer").get("tNecroData") or {}
    names = _strings(stl_dir, "NecromancerArmy")
    slots = []
    for ui, u in enumerate(d.get("arNecroArmyUnitTypes") or []):
        key = ["Warrior", "Mage", "Golem"][ui] if ui < 3 else f"Unit{ui}"
        skill = _sno(u.get("snoSkillBarPower"))
        if skill:
            skill_text(skill)
        specs, ups = [], []
        for si, sp in enumerate(u.get("arSpecializations") or []):
            label = names.get(f"{key}Spec{si + 1}_Label") or _sno(sp.get("snoActor")) or f"Spec {si + 1}"
            tags = [tag_names.get(t[len("Skill_"):], TAG_NAMES[t]) for t in (_sno(g) for g in sp.get("arGainedSkillTags") or []) if t in TAG_NAMES]
            specs.append(opt(label, label, d=names.get(f"{key}Spec{si + 1}_Desc", ""), lv=_level(sp.get("tUnlockCondition")),
                             tags=tags, skill=skill))
            for ux, up in enumerate(sp.get("arUpgradeOptions") or []):
                p = _sno(up.get("snoUpgradePower"))
                if p:
                    ups.append(opt(p, f"Upgrade {'AB'[ux] if ux < 2 else ux + 1}", p, g=label))
            sac = _sno((sp.get("tSacrifice") or {}).get("snoSacrificePower"))
            if sac:
                ups.append(opt(sac, names.get("UnitTypeSacrifice", "Sacrifice"), sac, g=label))
        unit = names.get(f"UnitType_{key}" if key != "Golem" else "UnitType_Golem", key)
        slots.append({"id": key.lower(), "n": unit, "lv": d.get("nUnlockLevel"), "skill": skill, "o": specs})
        slots.append({"id": key.lower() + "_up", "n": f"{unit}: {names.get('Upgrades', 'Upgrades')[:-1]} or Sacrifice", "lv": d.get("nUnlockLevel"), "dep": key.lower(), "o": ups})
    if slots:
        out["Necromancer"] = {"t": names.get("ArmyHeader", "Book of the Dead"),
                              "note": "For each minion type pick a Specialization, then one Upgrade or Sacrifice the minions for a bonus of your own.",
                              "slots": slots}

    # ---- Sorcerer: Enchantments ----
    d = pcl("Sorcerer").get("tSorcererData") or {}
    norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
    sorc_skills = {norm(v["n"]): k for k, v in skills.items() if k.startswith("Sorcerer_") and "Enchantment" not in k}
    opts = []
    pdir = os.path.join(os.path.dirname(stl_dir), "Power")
    for f in sorted(os.listdir(pdir)) if os.path.isdir(pdir) else []:
        m = re.match(r"Sorcerer_Enchantment_([A-Za-z]+)\.pow\.json$", f)
        if not m:
            continue
        p = f[: -len(".pow.json")]
        if not skill_text(p).get("d"):
            continue
        sk = sorc_skills.get(norm(m[1])) or sorc_skills.get(norm(m[1]) + "s")
        nm = skills[sk]["n"] if sk else re.sub(r"(?<=[a-z])(?=[A-Z])", " ", m[1])
        opts.append(opt(m[1], nm, p, skill=sk, ic=(skills.get(sk) or {}).get("ic")))
    opts.sort(key=lambda o: o["n"])
    lvls = [_level(x.get("tUnlockCondition")) for x in d.get("arEnchantSlotUnlocks") or []]
    if opts:
        out["Sorcerer"] = {"t": "Enchantments", "note": _strings(stl_dir, "Tutorial_Class_Sorceress_EnchantSlot").get("simple_instruction", "") or "Put a skill in an Enchantment slot to gain its passive version.",
                           "slots": [{"id": f"ench{i + 1}", "n": f"Enchantment Slot {i + 1}", "lv": lv, "uniq": "ench", "o": opts} for i, lv in enumerate(lvls or [15, 30])]}

    # ---- Paladin: Oaths ----
    d = pcl("Paladin").get("tPaladinData") or {}
    names = _strings(stl_dir, "PaladinOath")
    opts = []
    for i, x in enumerate(d.get("arOathData") or []):
        p = _sno(x.get("snoOathPassivePower"))
        if p:
            nm = names.get(f"Oath{i + 1}Name") or p.split("_")[-1]
            opts.append(opt(nm, nm, p, f=names.get(f"Oath{i + 1}Flavor"), ic=ic(x.get("hOathIcon"))))
    if opts:
        out["Paladin"] = {"t": names.get("OathsTitle", "Oaths"), "note": "Swear one Oath.",
                          "slots": [{"id": "oath", "n": "Oath", "lv": d.get("dwUnlockLevel"), "o": opts}]}

    # ---- Warlock: Soul Shards ----
    d = pcl("Warlock").get("tWarlockData") or {}
    names = _strings(stl_dir, "WarlockMechanic")
    shards, frags = [], []
    for x in d.get("arSoulShards") or []:
        p = _sno(x.get("snoPassivePower"))
        if not p:
            continue
        key = p.split("_")[-1]
        nm = names.get("Warlock" + key) or names.get("WarlockManipulator" if key == "Mastermind" else "", key)
        summon = _sno(x.get("snoSummonPower"))
        stip = names.get("SummonTooltip_" + ("Manipulator" if key == "Mastermind" else key), "")
        sic = (skill_text(summon).get("ic") if summon else None)
        shards.append(opt(nm, nm, p, d2=stip, ic=sic or None))
        for fr in x.get("arShardFragments") or []:
            fp = _sno(fr.get("snoPassivePower"))
            if fp:
                frags.append(opt(fp, skill_text(fp)["n"], fp, g=nm))
    if shards:
        out["Warlock"] = {"t": names.get("WarlockHeader", "Soul Shards"),
                          "note": names.get("WarlockTutorial_ShardAndFragment", "Select a Shard and a Fragment."),
                          "slots": [{"id": "shard", "n": "Shard", "lv": d.get("nUnlockLevel"), "o": shards},
                                    {"id": "frag", "n": "Fragment", "lv": d.get("nFragmentUnlockLevel"), "dep": "shard", "o": frags}]}
    if icons:
        game_ui(out, meta_dir, icons)
    return out


# ---- The game's own panel art (UI/<Panel>.ui.json -> 2DUI atlas frames), so the view looks like the game ----
# Frame indexes were read from the UI layouts: RogueSpecializations, WeaponExpertise, SpiritbornMechanic,
# DruidSpirit_Panel, NecromancerMechanic, PaladinMechanic, WarlockMechanic.
# Per class "ui": {"frame", "frameOn": option frame (normal / chosen), "banner", "bg": panel art, "tile": tiled texture,
#   "deco": {slot id: art}}; per option "ic" (lit icon), "ic0" (dim icon, not chosen), "bg" (panel art when chosen),
#   "orn" (ornament).
GAME_ICONS = {
    "Rogue": ("2DUI_Rogue_Specializations", {"Combo Points": (1, 0), "Inner Sight": (3, 2), "Preparation": (5, 4)}),
    "Barbarian": ("2DUI_WeaponExpertise", {"One-Handed Axe": 0, "Two-Handed Axe": 1, "One-Handed Mace": 2, "Two-Handed Mace": 3,
                                           "Polearm": 4, "One-Handed Sword": 6, "Two-Handed Sword": 7}),
    "Spiritborn": ("2DUI_SpiritbornMechanic", {"Jaguar": 3, "Eagle": 1, "Gorilla": 2, "Centipede": 0}),
    "Paladin": ("2DUI_PaladinOaths_Icons", {"Zealot": (1, 7), "Juggernaut": (0, 11), "Judicator": (2, 15), "Disciple": (3, 19)}),
    "Warlock": ("2DUI_Warlock", {"Legion": 8, "Vanguard": 9, "Mastermind": 10, "Ritualist": 11}),
}
NECRO_ICONS = {"Defenders": 0, "Reapers": 1, "Skirmishers": 2, "Golem:Bone": 3, "Blood": 4, "Iron": 5, "Cold": 6, "Mage:Bone": 7, "Shadow": 8}
DRUID_SPIRITS = {"Deer": (4, 15), "Eagle": (5, 16), "Snake": (6, 17), "Wolf": (7, 18)}  # head art, glyph
WARLOCK_FRAGMENTS = {"Legion": (25, 26, 27), "Mastermind": (22, 23, 24), "Ritualist": (19, 20, 21), "Vanguard": (16, 17, 18)}
WARLOCK_BG = {"Legion": 1, "Vanguard": 2, "Mastermind": 3, "Ritualist": 4}
PALADIN_BG = {"Zealot": "Zealot", "Juggernaut": "Juggernaut", "Judicator": "Judicator", "Disciple": "Arbiter"}
SPIRIT_ORN = {"Jaguar": 12, "Eagle": 10, "Gorilla": 13, "Centipede": 14}


def game_ui(out, meta_dir, icons):
    cache = {}

    def art(atlas, i, size=None):
        if atlas not in cache:
            p = os.path.join(meta_dir, "Texture", atlas + ".tex.json")
            cache[atlas] = [f["hImageHandle"] for f in (_load(p).get("ptFrame") or [])] if os.path.exists(p) else []
        fr = cache[atlas]
        return icons.for_handle(fr[i], size) if i < len(fr) else None

    def put(o, k, v):
        if v:
            o[k] = v

    for cls, (atlas, m) in GAME_ICONS.items():
        for slot in (out.get(cls) or {}).get("slots", []):
            for o in slot["o"]:
                v = m.get(o["n"])
                if v is None:
                    continue
                lit, dim = v if isinstance(v, tuple) else (v, None)
                put(o, "ic", art(atlas, lit, 160))
                if dim is not None:
                    put(o, "ic0", art(atlas, dim, 160))
    ui = {}
    ui["Rogue"] = {"frame": art("2DUI_Rogue_Specializations", 6, 180), "banner": art("2DUI_Rogue_Specializations", 7)}
    ui["Barbarian"] = {"frame": art("2DUI_WeaponExpertise", 10, 190), "frameOn": art("2DUI_WeaponExpertise", 9, 190),
                       "tech": art("2DUI_WeaponExpertise", 11, 240), "techOff": art("2DUI_WeaponExpertise", 12, 240),
                       "sigil": art("2DUI_WeaponExpertise", 13, 320), "sigilOff": art("2DUI_WeaponExpertise", 14, 320)}
    ui["Spiritborn"] = {"frame": art("2DUI_SpiritbornMechanic", 17, 200), "frameOn": art("2DUI_SpiritbornMechanic", 18, 200),
                        "deco": {"primary": art("2DUI_SpiritbornMechanic", 5, 160), "secondary": art("2DUI_SpiritbornMechanic", 4, 160)},
                        "banner": art("2DUI_SpiritbornMechanic", 20, 256)}
    for o in ((out.get("Spiritborn") or {}).get("slots") or [{}])[0].get("o", []):
        put(o, "orn", art("2DUI_SpiritbornMechanic", SPIRIT_ORN.get(o["n"], 99), 300))
    ui["Druid"] = {"frame": art("2DUI_DruidSpiritPanel_Icons", 12, 150), "frameOn": art("2DUI_DruidSpiritPanel_Icons", 19, 150),
                   "ring": art("2DUI_DruidSpiritPanel_Icons", 10, 180), "banner": art("2DUI_DruidSpirit_Panel", 4, 900), "deco": {}}
    for slot in (out.get("Druid") or {}).get("slots", []):
        sp = slot["n"].replace(" Spirit", "")
        if sp in DRUID_SPIRITS:
            ui["Druid"]["deco"][slot["id"]] = art("2DUI_DruidSpiritPanel_Icons", DRUID_SPIRITS[sp][0], 190)
        if slot["id"] == "bond":
            for o in slot["o"]:
                if o["n"] in DRUID_SPIRITS:
                    put(o, "ic", art("2DUI_DruidSpiritPanel_Icons", DRUID_SPIRITS[o["n"]][1], 142))
    ui["Necromancer"] = {"frame": art("2DUI_NecromancerArmy", 8, 223), "tile": art("2DUI_NecromancerArmy", 12),
                         "banner": art("2DUI_NecromancerArmy", 4, 398)}
    spec_ic = {}
    for slot in (out.get("Necromancer") or {}).get("slots", []):
        for o in slot["o"]:
            if slot.get("dep"):
                if o["n"] == "Sacrifice" or "Sacrifice" in o["id"]:
                    put(o, "ic", art("2DUI_NecromancerArmy", 25, 208))
                    put(o, "ic0", art("2DUI_NecromancerArmy", 23, 208))
                elif spec_ic.get(o.get("g")):
                    o["ic"] = spec_ic[o["g"]]
                continue
            unit = "Golem" if slot["id"] == "golem" else "Mage" if slot["id"] == "mage" else ""
            i = NECRO_ICONS.get(f"{unit}:{o['n']}", NECRO_ICONS.get(o["n"]))
            if i is not None:
                put(o, "ic", art("2DUI_NecromancerArmy_02", i, 177))
                spec_ic[o["n"]] = o.get("ic")
    ui["Paladin"] = {"frame": art("2DUI_PaladinOaths_Icons", 20, 330), "frameOn": art("2DUI_PaladinOaths_Icons", 21, 330),
                     "bg": art("2DUI_PaladinOaths_GenericBG", 0, 720)}
    for o in ((out.get("Paladin") or {}).get("slots") or [{}])[0].get("o", []):
        put(o, "bg", art(f"2DUI_PaladinOaths_{PALADIN_BG.get(o['n'], 'Generic')}OathBG", 0, 720))
    ui["Warlock"] = {"frame": art("2DUI_Warlock", 34, 200), "frameOn": art("2DUI_Warlock", 29, 200),
                     "frag": art("2DUI_Warlock", 31, 128), "fragOn": art("2DUI_Warlock", 32, 128),
                     "bg": art("2DUI_Warlock_Background", 0, 640)}
    for slot in (out.get("Warlock") or {}).get("slots", []):
        seen = {}
        for o in slot["o"]:
            if slot["id"] == "shard":
                put(o, "bg", art("2DUI_Warlock_Background", WARLOCK_BG.get(o["n"], 0), 640))
            elif o.get("g") in WARLOCK_FRAGMENTS:
                k = seen[o["g"]] = seen.get(o["g"], -1) + 1
                if k < 3:
                    put(o, "ic", art("2DUI_Warlock", WARLOCK_FRAGMENTS[o["g"]][k], 120))
    for cls, u in ui.items():
        if cls in out:
            out[cls]["ui"] = {k: v for k, v in u.items() if v}
