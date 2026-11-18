"""
Class figures for the Sandbox paperdoll: original silhouette art (not game assets), one SVG per class.

The game has no 2D class figure (its paperdoll is a live 3D scene), so these are drawn here:
a dark figure with a coloured rim light, built from thick stroked limbs and filled shapes, with
each class's archetypal gear (horned helm and great axe, wolf pelt and staff, hood and scythe ...).

    python3 tools/figures.py        -> data/figures/<class>.svg  (viewBox 0 0 300 600)

The Sandbox prefers game art when it's available: build_index.py calls portraits(), which cuts each
class from its shop armor bundle art (2DUI/ sheets) into data/figures/<class>.webp. The SVGs
are the fallback (and the "no class" wanderer).
"""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "figures")

ACCENT = {
    "Barbarian": "#d0503a", "Druid": "#7fb85a", "Necromancer": "#7fd6c8", "Rogue": "#d8b866",
    "Sorcerer": "#6aa8ff", "Spiritborn": "#e8a640", "Paladin": "#f0d27a", "Warlock": "#b65ae0",
    "any": "#b8aa90",
}


def pts(p):
    return " ".join(f"{x:g},{y:g}" for x, y in p)


def limb(p, w):
    return f'<polyline class="s" points="{pts(p)}" stroke-width="{w}"/>'


def poly(p):
    return f'<polygon points="{pts(p)}"/>'


def path(d):
    return f'<path d="{d}"/>'


def ell(cx, cy, rx, ry=None):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry or rx}"/>'


def line(p, w=1.6, op=0.18):
    """Light detail line drawn over the silhouette."""
    return f'<polyline class="d" points="{pts(p)}" stroke-width="{w}" opacity="{op}"/>'


def glow(cx, cy, r, color):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r * 2.2}" fill="{color}" opacity=".18" filter="url(#blur)"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}" opacity=".85" filter="url(#blur2)"/>')


def body(sw=54, ww=34, hw=36, armw=24, legw=28, robe=None, arms=True, left=None, right=None, head=True):
    """Standing figure, centre x=150, feet at y≈585. robe=(hem half-width) replaces the legs."""
    c = 150
    out = []
    if head:
        out.append(ell(c, 80, 20, 25))
    out.append(limb([(c, 98), (c, 118)], 22))
    # tapered torso: broad chest, narrow waist, hips
    out.append(path(f"M{c - sw + 10},120 Q{c},110 {c + sw - 10},120 Q{c + sw + 2},126 {c + sw - 2},150 "
                    f"Q{c + sw - 8},200 {c + ww},252 Q{c + ww + 2},290 {c + hw},330 L{c - hw},330 "
                    f"Q{c - ww - 2},290 {c - ww},252 Q{c - sw + 8},200 {c - sw + 2},150 Q{c - sw - 2},126 {c - sw + 10},120 Z"))
    out.append(ell(c - sw + 8, 134, 18, 16))
    out.append(ell(c + sw - 8, 134, 18, 16))
    if arms:
        lp = left or [(c - sw + 4, 140), (c - sw - 14, 232), (c - sw - 10, 318)]
        rp = right or [(c + sw - 4, 140), (c + sw + 14, 232), (c + sw + 10, 318)]
        for p in (lp, rp):
            out.append(limb(p, armw))
            out.append(ell(p[-1][0], p[-1][1], armw * 0.46, armw * 0.5))
    if robe:
        out.append(poly([(c - hw - 4, 300), (c + hw + 4, 300), (c + robe, 578), (c - robe, 578)]))
    else:
        for s in (-1, 1):
            out.append(limb([(c + s * (hw - 13), 322), (c + s * (hw - 6), 452), (c + s * (hw - 2), 562)], legw))
            out.append(poly([(c + s * (hw - 2) - 14, 556), (c + s * (hw - 2) + 14, 556),
                             (c + s * (hw + 12), 584), (c + s * (hw - 2) - 16, 584)]))
    return out


def barbarian():
    a = ACCENT["Barbarian"]
    s = body(sw=66, ww=42, hw=42, armw=32, legw=36,
             right=[(212, 140), (232, 232), (226, 312)])
    # great axe held in the right hand, rising behind the shoulder
    s += [limb([(222, 336), (262, 70)], 10),
          path("M256,58 C292,40 298,92 286,128 C276,112 266,100 252,96 Z"),
          path("M262,64 C232,44 222,86 234,110 C242,98 250,90 262,88 Z")]
    # horned helm
    s += [path("M134,66 C108,62 92,40 100,16 C108,36 120,48 140,54 Z"),
          path("M166,66 C192,62 208,40 200,16 C192,36 180,48 160,54 Z"),
          poly([(128, 66), (172, 66), (174, 92), (126, 92)])]
    # fur pauldrons and kilt
    s += [poly([(72, 150), (88, 118), (104, 128), (116, 114), (128, 132), (120, 166), (86, 170)]),
          poly([(228, 150), (212, 118), (196, 128), (184, 114), (172, 132), (180, 166), (214, 170)]),
          poly([(104, 300), (196, 300), (204, 372), (186, 360), (174, 382), (160, 362), (146, 384), (132, 362),
                (118, 380), (110, 360), (96, 372)])]
    s += [line([(110, 296), (190, 296)], 3, .22), line([(126, 76), (174, 76)], 2, .25),
          line([(150, 140), (150, 200)], 1.5, .12)]
    return s, a


def druid():
    a = ACCENT["Druid"]
    s = body(sw=58, ww=40, hw=40, armw=28, legw=32, left=[(98, 140), (80, 230), (84, 312)])
    # wolf-pelt hood with ears and muzzle over the head
    s += [path("M124,96 C118,64 128,46 150,42 C172,46 182,64 176,96 Z"),
          poly([(128, 58), (120, 24), (146, 48)]), poly([(172, 58), (180, 24), (154, 48)]),
          poly([(136, 54), (164, 54), (158, 70), (142, 70)])]
    # pelt mantle
    s += [poly([(84, 132), (150, 104), (216, 132), (226, 196), (210, 236), (198, 214), (186, 248), (170, 222),
                (150, 256), (130, 222), (114, 248), (102, 214), (90, 236), (74, 196)])]
    # gnarled staff in the left hand
    s += [limb([(70, 580), (82, 300), (76, 100)], 9),
          limb([(76, 104), (60, 74), (64, 50)], 6), limb([(78, 102), (96, 70), (92, 44)], 6),
          limb([(76, 96), (78, 60)], 5)]
    s += [glow(78, 70, 7, a), line([(118, 300), (182, 300)], 3, .2),
          line([(124, 410), (118, 412)], 4, .15), line([(176, 410), (182, 412)], 4, .15)]
    return s, a


def necromancer():
    a = ACCENT["Necromancer"]
    s = body(sw=50, ww=30, hw=34, armw=22, robe=82, right=[(196, 140), (214, 226), (212, 306)])
    # deep hood and high collar
    s += [path("M122,112 C116,70 128,40 150,30 C172,40 184,70 178,112 Z"),
          poly([(108, 128), (118, 98), (132, 122)]), poly([(192, 128), (182, 98), (168, 122)])]
    # tattered coat hem
    s += [poly([(68, 560), (232, 560), (240, 596), (222, 580), (206, 598), (190, 578), (172, 596), (156, 578),
                (140, 598), (124, 578), (108, 596), (92, 580), (76, 598)])]
    # scythe
    s += [limb([(214, 590), (218, 36)], 7),
          path("M218,44 C176,22 120,34 90,78 C128,56 176,52 216,66 Z")]
    # bone pauldron spikes
    s += [poly([(96, 140), (84, 116), (110, 132)]), poly([(204, 140), (216, 116), (190, 132)])]
    s += [ell(150, 84, 12, 14).replace("<ellipse", '<ellipse class="void"'),
          glow(143, 82, 2.5, a), glow(157, 82, 2.5, a),
          line([(150, 130), (150, 560)], 1.5, .1), line([(120, 300), (180, 300)], 3, .18)]
    return s, a


def rogue():
    a = ACCENT["Rogue"]
    s = body(sw=48, ww=30, hw=34, armw=22, legw=26,
             left=[(104, 140), (84, 226), (90, 300)], right=[(196, 140), (216, 226), (210, 300)])
    # bow on the back
    s += [f'<path class="s" d="M98,40 C40,150 40,260 98,360" stroke-width="7"/>',
          line([(98, 40), (98, 360)], 1.2, .35)]
    # quiver with arrows behind the right shoulder
    s += [poly([(186, 70), (202, 66), (214, 170), (198, 174)]),
          limb([(190, 70), (184, 44)], 3), limb([(196, 68), (194, 40)], 3), limb([(202, 66), (206, 42)], 3)]
    # hood and short cloak
    s += [path("M126,108 C120,72 130,46 150,38 C172,46 182,72 174,108 Z"),
          poly([(104, 132), (196, 132), (214, 250), (196, 238), (184, 262), (150, 246), (116, 262), (104, 238), (86, 250)])]
    # daggers held point-down
    s += [poly([(86, 306), (94, 306), (92, 376), (88, 384)]), poly([(206, 306), (214, 306), (212, 376), (208, 384)]),
          limb([(80, 304), (100, 304)], 4), limb([(200, 304), (220, 304)], 4)]
    s += [ell(150, 84, 11, 13).replace("<ellipse", '<ellipse class="void"'),
          line([(120, 296), (180, 296)], 3, .2), line([(136, 300), (130, 320)], 2, .2)]
    return s, a


def sorcerer():
    a = ACCENT["Sorcerer"]
    s = body(sw=46, ww=28, hw=32, armw=20, robe=96,
             left=[(108, 140), (78, 196), (64, 150)], right=[(192, 140), (212, 228), (214, 306)])
    # long hair and circlet
    s += [path("M128,78 C126,48 174,48 172,78 L178,150 L166,140 L164,100 L136,100 L134,140 L122,150 Z")]
    # flared robe hem, sash
    s += [poly([(54, 560), (246, 560), (252, 592), (48, 592)])]
    # staff with orb
    s += [limb([(218, 590), (222, 84)], 7), limb([(222, 92), (208, 70)], 4), limb([(222, 92), (236, 70)], 4)]
    s += [glow(222, 64, 11, a), glow(64, 136, 9, a),
          line([(126, 64), (174, 64)], 2.5, .35), line([(150, 230), (150, 560)], 1.5, .12),
          line([(122, 262), (178, 262)], 4, .2)]
    return s, a


def spiritborn():
    a = ACCENT["Spiritborn"]
    s = body(sw=56, ww=34, hw=36, armw=26, legw=30,
             left=[(98, 140), (82, 226), (100, 300)], right=[(202, 140), (220, 224), (196, 230)])
    # glaive held across the body
    s += [limb([(62, 520), (250, 112)], 7),
          path("M250,112 C262,80 276,60 292,46 C286,74 274,100 258,120 Z"),
          poly([(62, 520), (54, 548), (70, 528)])]
    # feather headdress (fan)
    import math
    for i in range(9):
        ang = math.radians(-150 + i * 15)
        x, y = 150 + 64 * math.cos(ang), 74 + 64 * math.sin(ang)
        bx, by = 150 + 20 * math.cos(ang), 74 + 20 * math.sin(ang)
        nx, ny = -math.sin(ang) * 6, math.cos(ang) * 6
        s.append(poly([(bx, by), (x + nx, y + ny), (x + 1.5 * math.cos(ang) * 6, y + 1.5 * math.sin(ang) * 6), (x - nx, y - ny)]))
    # mask, shoulder guard, loincloth
    s += [poly([(132, 70), (168, 70), (164, 100), (150, 110), (136, 100)]),
          poly([(178, 124), (222, 128), (230, 160), (206, 168), (184, 150)]),
          poly([(136, 300), (164, 300), (170, 410), (150, 400), (130, 410)])]
    s += [glow(142, 84, 2.5, a), glow(158, 84, 2.5, a),
          line([(116, 296), (184, 296)], 3, .22), line([(124, 180), (176, 180)], 1.5, .15),
          line([(112, 420), (122, 424)], 4, .2), line([(178, 424), (188, 420)], 4, .2)]
    return s, a


def paladin():
    a = ACCENT["Paladin"]
    s = body(sw=62, ww=40, hw=40, armw=30, legw=34,
             left=[(94, 140), (78, 226), (98, 280)], right=[(206, 140), (224, 230), (220, 310)])
    # great helm with plume
    s += [path("M126,108 L124,62 C124,46 176,46 176,62 L174,108 Z"),
          path("M150,48 C160,24 186,16 204,28 C186,30 172,40 162,58 Z")]
    # round pauldrons, tabard
    s += [ell(88, 146, 28, 22), ell(212, 146, 28, 22),
          poly([(128, 200), (172, 200), (176, 420), (150, 440), (124, 420)])]
    # kite shield on the left arm
    s += [path("M50,196 L132,196 L130,296 C126,342 104,370 90,388 C76,370 54,342 52,296 Z")]
    # sword in the right hand, point down
    s += [poly([(216, 322), (224, 322), (222, 480), (220, 492), (218, 480)]),
          limb([(204, 318), (236, 318)], 6), limb([(220, 312), (220, 296)], 6)]
    s += [line([(90, 210), (90, 370)], 3, .3), line([(58, 262), (124, 262)], 3, .3),
          line([(132, 82), (168, 82)], 3, .35), line([(150, 66), (150, 104)], 2, .25),
          line([(150, 210), (150, 420)], 1.5, .15), glow(90, 262, 4, a)]
    return s, a


def warlock():
    a = ACCENT["Warlock"]
    s = body(sw=50, ww=32, hw=34, armw=22, legw=26,
             left=[(104, 140), (80, 210), (72, 176)], right=[(196, 140), (214, 228), (210, 306)])
    # curled ram horns
    s += [path("M134,70 C104,64 92,38 112,26 C130,16 142,34 132,44 C126,36 116,40 120,50 C126,60 136,58 140,60 Z"),
          path("M166,70 C196,64 208,38 188,26 C170,16 158,34 168,44 C174,36 184,40 180,50 C174,60 164,58 160,60 Z")]
    # long coat with split skirt and spiked collar
    s += [poly([(112, 250), (188, 250), (214, 560), (176, 570), (156, 330), (144, 330), (124, 570), (86, 560)]),
          poly([(110, 130), (100, 96), (124, 118), (132, 92), (144, 120), (156, 120), (168, 92), (176, 118),
                (200, 96), (190, 130)])]
    # short sword in the right hand
    s += [poly([(206, 312), (214, 312), (212, 410), (210, 418), (208, 410)]), limb([(198, 308), (222, 308)], 5)]
    # floating focus (tome) above the left hand
    s += [glow(70, 140, 13, a), poly([(56, 128), (84, 124), (86, 150), (58, 154)])]
    s += [glow(143, 82, 2.5, a), glow(157, 82, 2.5, a),
          line([(120, 254), (180, 254)], 3, .22), line([(150, 130), (150, 250)], 1.5, .14)]
    return s, a


def wanderer():
    a = ACCENT["any"]
    s = body(sw=52, ww=34, hw=36, armw=24, legw=28)
    s += [path("M126,108 C120,72 130,46 150,38 C172,46 182,72 174,108 Z"),
          poly([(98, 132), (202, 132), (224, 470), (196, 450), (176, 480), (150, 460), (124, 480), (104, 450), (76, 470)])]
    s += [ell(150, 84, 11, 13).replace("<ellipse", '<ellipse class="void"'), line([(118, 296), (182, 296)], 3, .2)]
    return s, a


# Class portraits from shop art: the newest solo armor bundle per class (2DUI_Bundle_HArmor_<cls>_storNNN
# background, 5120×2160, the figure stands at x≈3400), skipping crossover sets. With no class picked the
# Season 15 battle pass armor catalog group shot is shown. class: (sheet, x, y, w, h) in sheet pixels.
S15 = "2DUI_BP_S15_Catalog_Armor_Background [2669461].png"
HA = "2DUI_Bundle_HArmor_{} [{}].png"
PORTRAITS = {
    "Barbarian": (HA.format("bar_stor265_background", 2660701), 2760, 0, 1300, 2160),
    "Druid": (HA.format("dru_stor247_background", 2611482), 2760, 0, 1300, 2160),
    "Necromancer": (HA.format("nec_stor275_background", 2673583), 2760, 0, 1300, 2160),
    "Paladin": (HA.format("pal_stor189_background", 2627400), 2690, 0, 1300, 2160),
    "Rogue": (HA.format("rog_stor278_background", 2652332), 2850, 0, 1300, 2160),
    "Sorcerer": (HA.format("sor_stor268_background", 2580746), 2760, 0, 1300, 2160),
    "Spiritborn": (HA.format("spi_stor218_background", 2647962), 2650, 0, 1300, 2160),
    "Warlock": (HA.format("war_stor175_background", 2626054), 2760, 0, 1300, 2160),
    "any": (S15, 2400, 400, 2160, 1400),  # no class picked: all eight in the S15 battle pass armor
}


def portraits(atlas_dir, height=900):
    """Cut the class portraits to data/figures/<class>.webp (only when missing). Returns {class: path}."""
    import subprocess
    os.makedirs(OUT, exist_ok=True)
    done = {}
    for cls, (sheet, x, y, w, h) in PORTRAITS.items():
        src = os.path.join(atlas_dir or "", sheet)
        dst = os.path.join(OUT, cls.lower() + ".webp")
        if not os.path.exists(dst):
            if not os.path.exists(src):
                continue
            subprocess.run(["cwebp", "-quiet", "-q", "80", "-crop", str(x), str(y), str(w), str(h),
                            "-resize", "0", str(min(height, h)), src, "-o", dst], check=True)
        done[cls] = "data/figures/" + cls.lower() + ".webp"
    return done


FIGURES = {"Barbarian": barbarian, "Druid": druid, "Necromancer": necromancer, "Rogue": rogue,
           "Sorcerer": sorcerer, "Spiritborn": spiritborn, "Paladin": paladin, "Warlock": warlock, "any": wanderer}


def svg(parts, accent):
    fill = "url(#g)"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 600" role="img">
<defs>
  <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="600">
    <stop offset="0" stop-color="#3a342d"/><stop offset=".45" stop-color="#1d1a17"/><stop offset="1" stop-color="#0b0a09"/>
  </linearGradient>
  <radialGradient id="floor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <filter id="rim" x="-20%" y="-20%" width="140%" height="140%">
    <feMorphology in="SourceAlpha" operator="dilate" radius="1.6" result="d"/>
    <feFlood flood-color="{accent}" flood-opacity=".5"/><feComposite in2="d" operator="in" result="edge"/>
    <feGaussianBlur in="edge" stdDeviation="2.4" result="glow"/>
    <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="blur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="blur2" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.4"/></filter>
  <style>
    .fig polygon, .fig path, .fig ellipse {{ fill: {fill}; }}
    .fig .s {{ fill: none; stroke: {fill}; stroke-linecap: round; stroke-linejoin: round; }}
    .fig .void {{ fill: #050505; }}
    .det .d {{ fill: none; stroke: #f3dfbd; stroke-linecap: round; stroke-linejoin: round; }}
  </style>
</defs>
<ellipse cx="150" cy="586" rx="110" ry="12" fill="url(#floor)"/>
<g class="fig" filter="url(#rim)">
{chr(10).join(p for p in parts if 'class="d"' not in p and 'filter="url(#blur' not in p)}
</g>
<g class="det">
{chr(10).join(p for p in parts if 'class="d"' in p or 'filter="url(#blur' in p)}
</g>
</svg>
'''


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in FIGURES.items():
        parts, accent = fn()
        with open(os.path.join(OUT, name.lower() + ".svg"), "w", encoding="utf-8") as fh:
            fh.write(svg(parts, accent))
    print(f"Wrote {len(FIGURES)} figures to {os.path.relpath(OUT, ROOT)}/")


if __name__ == "__main__":
    main()
