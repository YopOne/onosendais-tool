"""
Inventory icons for items and runes.

webp_icons/ holds texture-atlas frames exported from the game, named
  "<atlas> [<atlas snoID>] - <frame index> <frame name>.webp"
(frame name is often blank). The game links an item to a frame by an image handle:

  item tInvImages[class].hDefaultImage / hFemaleImage   (per-class art, e.g. unique armor)
  -> Actor hDefaultImage                                (weapons, jewelry, runes)
  -> hash(actor name)                                   (handle = h*33 + c over the lowercased name)
  -> a webp whose frame name is the actor name          (frames missing from the Texture metadata)

and each Texture/<atlas>.tex.json lists its frames' hImageHandle in frame order.
Only the frames the codex uses are copied to data/icons/<handle hex>.webp, so the site
doesn't ship the whole 100+ MB export.

Aspect icons live in 2DUI_Aspect_* atlases (Aspect hIconOverride); they're used
automatically once those atlases are in webp_icons/.
"""

import glob
import json
import os
import re
import shutil

WEBP_NAME = re.compile(r" \[(\d+)\] - (\d+) ")


def name_hash(s):
    h = 0
    for c in s.lower().encode():
        h = (h * 33 + c) & 0xFFFFFFFF
    return h


def _find(o, key):
    """First non-zero value of `key` anywhere in a JSON tree."""
    if isinstance(o, dict):
        if o.get(key):
            return o[key]
        o = o.values()
    if isinstance(o, (list, type({}.values()))):
        for v in o:
            r = _find(v, key)
            if r:
                return r
    return None


class Icons:
    def __init__(self, meta_dir, webp_dir, out_dir, classes):
        self.meta_dir, self.out_dir, self.classes = meta_dir, out_dir, classes
        self.used = {}  # handle hex -> source webp path
        self._actor = {}
        files = {}
        self.by_name = {}  # lowercased frame name -> webp path
        for f in sorted(os.listdir(webp_dir)):
            m = WEBP_NAME.search(f)
            if m and f.endswith(".webp"):
                files[(int(m[1]), int(m[2]))] = os.path.join(webp_dir, f)
                frame = f[m.end():-5].strip().lower()
                if frame:
                    self.by_name.setdefault(frame, os.path.join(webp_dir, f))
        atlases = {s for s, _ in files}
        self.frames = {}  # image handle -> webp path
        for p in glob.glob(os.path.join(meta_dir, "Texture", "*.tex.json")):
            with open(p, encoding="utf-8") as fh:
                head = fh.read(400)
                m = re.search(r'"__snoID__":\s*(\d+)', head)
                if not m or int(m[1]) not in atlases:
                    continue
                fh.seek(0)
                d = json.load(fh)
            for i, fr in enumerate(d.get("ptFrame") or []):
                src = files.get((d["__snoID__"], i))
                if src:
                    self.frames.setdefault(fr["hImageHandle"], src)

    def _actor_image(self, name):
        if name not in self._actor:
            p = os.path.join(self.meta_dir, "Actor", name + ".acr.json")
            v = None
            if os.path.exists(p):
                with open(p, encoding="utf-8") as fh:
                    v = _find(json.load(fh), "hDefaultImage")
            self._actor[name] = v
        return self._actor[name]

    def _use(self, handle):
        if handle in self.frames:
            key = "%08x" % handle
            self.used[key] = self.frames[handle]
            return key
        return None

    def for_item(self, j, classes=(), item_dir=None, _depth=0):
        """Icon key for an item JSON (unique, mythic, rune), or None."""
        cands = []
        inv = j.get("tInvImages") or []
        order = [self.classes.index(c) for c in classes if c in self.classes] + list(range(len(inv)))
        for i in order:
            if i < len(inv):
                cands += [inv[i].get("hDefaultImage"), inv[i].get("hFemaleImage")]
        actor = (j.get("snoActor") or {}).get("name")
        if actor:
            cands += [self._actor_image(actor), name_hash(actor)]
        for h in cands:
            if h:
                key = self._use(h)
                if key:
                    return key
        if actor and actor.lower() in self.by_name:
            h = name_hash(actor)
            self.frames.setdefault(h, self.by_name[actor.lower()])
            return self._use(h)
        base = (j.get("snoBaseItem") or {}).get("name")
        if base and item_dir and _depth < 2:
            p = os.path.join(item_dir, base + ".itm.json")
            if os.path.exists(p):
                with open(p, encoding="utf-8") as fh:
                    return self.for_item(json.load(fh), classes, item_dir, _depth + 1)
        return None

    def for_handle(self, handle):
        return self._use(handle) if handle else None

    def write(self):
        """Copy used icons to out_dir; remove ones no longer used. Returns (count, KB)."""
        os.makedirs(self.out_dir, exist_ok=True)
        for f in os.listdir(self.out_dir):
            if f.endswith(".webp") and f[:-5] not in self.used:
                os.remove(os.path.join(self.out_dir, f))
        total = 0
        for key, src in self.used.items():
            dst = os.path.join(self.out_dir, key + ".webp")
            size = os.path.getsize(src)
            if not os.path.exists(dst) or os.path.getsize(dst) != size:
                shutil.copyfile(src, dst)
            total += size
        return len(self.used), total / 1024
