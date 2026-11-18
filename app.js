/* ==========================================================
   Onosendai's Tool: D4 Codex engine + UI (vanilla ES6)

   Data: data/index/codex.json, produced by tools/build_index.py from
   data/Item, data/Power and data/StringList (+ d4data Affix rolls).
   The index stores the RAW game strings and formulas. Everything below
   does the cross-referencing at runtime:

     Affix_Value_N            -> roll formula on the affix   (evaluated)
     Affix."Static Value N"   -> affix static values         (looked up)
     Affix_Value_N#Other      -> another affix's roll        (cross-ref)
     PowerTag.P."Script Formula N" / SF_N -> Power script formulas
     CurrentLegendaryRank()   -> aspect rank (1..max)
     {c_*} {u} {if:SF.IsMythic} [expr|fmt|] -> rendered game text
   ========================================================== */

(() => {
  "use strict";

  const INDEX_URL = "data/index/codex.json";
  const RAW = { item: "data/Item/", stl: "data/StringList/", power: "data/Power/" };

  const CLASS_FILTERS = ["Barbarian", "Druid", "Necromancer", "Paladin", "Rogue", "Sorcerer", "Spiritborn", "Warlock"];
  const RARITY_FILTERS = ["Unique", "Mythic", "Legendary"]; // Ancestral is a View (item power 900), not a rarity
  // Aspect categories (FILTER_Legendary_* tags) and the slots aspects can be imprinted on (arAllowedItemLabels).
  const ASPECT_CATS = ["Offensive", "Defensive", "Utility", "Resource", "Mobility"];
  const ASPECT_SLOTS_ORDER = ["Weapon", "Helm", "Chest", "Gloves", "Pants", "Boots", "Amulet", "Ring", "Shield"];
  const ASPECT_SLOT_ICON = { Weapon: "1H Weapon", Shield: "Off-Hand" };
  const SLOT_ORDER = ["Helm", "Chest", "Gloves", "Pants", "Boots", "Amulet", "Ring", "1H Weapon", "2H Weapon", "Off-Hand"];

  /**
   * Original line-art slot icons (16x16, stroked with currentColor so they
   * inherit rarity / pill colours). Hand-drawn, no game assets.
   */
  const SLOT_ICONS = {
    "Helm": '<path d="M3 11V8.5a5 5 0 0 1 10 0V11"/><path d="M3 11h10v2.5H3z"/><path d="M8 3.5V7"/>',
    "Chest": '<path d="M5.5 2.5 8 4l2.5-1.5L14 5l-1.5 2.5V14h-9V7.5L2 5z"/><path d="M8 4v10"/>',
    "Gloves": '<path d="M4.5 14V8l-1.5-2.2a1 1 0 0 1 1.7-1.1L6 6.5V3a1 1 0 0 1 2 0v3.5V2.5a1 1 0 0 1 2 0v4V3.5a1 1 0 0 1 2 0V10l-1 4z"/><path d="M4.5 11.5h6.8"/>',
    "Pants": '<path d="M3.5 2.5h9l1 11.5h-3.8L8 7.5 6.3 14H2.5z"/><path d="M3.5 5h9"/>',
    "Boots": '<path d="M5 2.5h4.5v7l3.5 1.8V14H3v-3.5l2-1z"/><path d="M5 6h4.5"/>',
    "Amulet": '<path d="M3 2.5 8 8.5l5-6"/><path d="M8 8.5l2.2 2.7L8 14l-2.2-2.8z"/>',
    "Ring": '<circle cx="8" cy="10" r="4"/><path d="M6.3 3.5h3.4L8 6z"/>',
    "1H Weapon": '<path d="M13.5 2.5 12.9 5.3 6.6 11.6 4.4 9.4 10.7 3.1z"/><path d="M3.6 8.2l4.2 4.2"/><path d="M5.2 10.8l-2.7 2.7"/>',
    "2H Weapon": '<path d="M13.5 2.5 5.5 10.5M2.5 2.5l8 8"/><path d="M3.8 9l3.2 3.2M12.2 9 9 12.2"/><path d="M4.5 11.5l-2 2M11.5 11.5l2 2"/>',
    "Off-Hand": '<path d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z"/><path d="M8 4.5v7"/>',
  };
  /* In-game inventory art: data/icons/<image handle>.webp, linked by "ic" in the codex (tools/icons.py). */
  const itemIcon = (ic, cls = "") => ic
    ? `<img class="ico${cls ? " " + cls : ""}" src="data/icons/${ic}.webp" alt="" loading="lazy" decoding="async" draggable="false">`
    : "";
  const slotIcon = (slot) => SLOT_ICONS[slot]
    ? `<svg class="slot-ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${SLOT_ICONS[slot]}</svg>`
    : "";

  /**
   * Blizzard's internal ItemType IDs (Item/*.itm.json -> snoItemType.name)
   * -> player-facing gear slots. Any ItemType not listed here is treated as
   * an internal / non-gear type and hidden (e.g. Charm, HoradricSeal,
   * Axe_Berserker_Axe, Sword_Phase_Blade).
   */
  const SLOT_MAP = {
    // Armor
    Helm: "Helm",
    ChestArmor: "Chest",
    Gloves: "Gloves",
    Legs: "Pants",
    Boots: "Boots",
    // Jewelry
    Amulet: "Amulet",
    Ring: "Ring",
    // One-handed weapons
    Sword: "1H Weapon",
    Axe: "1H Weapon",
    Mace: "1H Weapon",
    Dagger: "1H Weapon",
    Wand: "1H Weapon",
    Scythe: "1H Weapon",
    Flail: "1H Weapon",
    // Two-handed weapons
    Sword2H: "2H Weapon",
    Axe2H: "2H Weapon",
    Mace2H: "2H Weapon",
    Scythe2H: "2H Weapon",
    Polearm: "2H Weapon",
    Glaive: "2H Weapon",
    Staff: "2H Weapon",
    Quarterstaff: "2H Weapon",
    Bow: "2H Weapon",
    Crossbow2H: "2H Weapon",
    // Off-hands (real equippable gear, kept as their own slot)
    Shield: "Off-Hand",
    Focus: "Off-Hand",
    FocusBookOffHand: "Off-Hand",
    OffHandTotem: "Off-Hand",
    // Special bases only used by the Grief runeword
    Axe_Berserker_Axe: "1H Weapon",
    Sword_Phase_Blade: "1H Weapon",
  };

  // Item IDs that are QA/test fixtures rather than real loot.
  const INTERNAL_ID_RE = /^(QA|TEST|DEBUG)_/i;
  const INTERNAL_NAME_RE = /^\((TEST|QA|DEBUG)\)|^QA\s/i;
  // Season 10 "Chaos" slot swaps: S10_<original item id>_<Helm|Chest|Gloves|Legs|Boots>[_V2]
  const SLOT_SWAP_RE = /^S10_(.+)_(Helm|Chests?|Gloves|Legs|Boots)(_V2)?$/;
  const ORIGIN_SLOT_TYPE = { Helm: "Helm", Chest: "ChestArmor", Gloves: "Gloves", Pants: "Legs", Legs: "Legs", Boots: "Boots", Amulet: "Amulet", Ring: "Ring" };

  /* ==========================================================
     1. Formula engine
     ========================================================== */

  const Engine = (() => {
    let codex = null;
    const UNKNOWN = null;
    // Item power for GameBalance stat formulas (gbid tables switch formula at 590/700/750/800/850/900).
    // At max level: normal uniques 850, Ancestral 900, Mythics (original or crafted) always 900.
    const DEFAULT_IP = 850;

    // ---- Tokenizer ----
    const TOKEN_RE = /\s*(?:(\d+\.?\d*|\.\d+)|("[^"]*")|([A-Za-z_][A-Za-z0-9_]*)|(>=|<=|==|!=|&&|\|\||[-+*/(),.?:#<>!]))/y;

    function tokenize(src) {
      const out = [];
      TOKEN_RE.lastIndex = 0;
      let m;
      while (TOKEN_RE.lastIndex < src.length) {
        const start = TOKEN_RE.lastIndex;
        m = TOKEN_RE.exec(src);
        if (!m) {
          if (/^\s*$/.test(src.slice(start))) break;
          throw new Error("bad token at " + start);
        }
        if (m[1] !== undefined) out.push({ t: "num", v: parseFloat(m[1]) });
        else if (m[2] !== undefined) out.push({ t: "str", v: m[2].slice(1, -1) });
        else if (m[3] !== undefined) out.push({ t: "id", v: m[3] });
        else if (m[4] !== undefined) out.push({ t: "op", v: m[4] });
      }
      return out;
    }

    // ---- Parser (recursive descent -> AST) ----
    const astCache = new Map();

    function parse(src) {
      if (astCache.has(src)) return astCache.get(src);
      let ast;
      try {
        const toks = tokenize(src);
        let i = 0;
        const peek = () => toks[i];
        const isOp = (v) => toks[i] && toks[i].t === "op" && toks[i].v === v;
        const eat = (v) => { if (!isOp(v)) throw new Error("expected " + v); i++; };

        const ternary = () => {
          const cond = logic();
          if (isOp("?")) { i++; const a = ternary(); eat(":"); const b = ternary(); return { k: "?", cond, a, b }; }
          return cond;
        };
        const logic = () => {
          let l = compare();
          while (isOp("&&") || isOp("||")) { const op = toks[i++].v; l = { k: "bin", op, l, r: compare() }; }
          return l;
        };
        const compare = () => {
          let l = additive();
          while (["<", ">", "<=", ">=", "==", "!="].some(isOp)) { const op = toks[i++].v; l = { k: "bin", op, l, r: additive() }; }
          return l;
        };
        const additive = () => {
          let l = term();
          while (isOp("+") || isOp("-")) { const op = toks[i++].v; l = { k: "bin", op, l, r: term() }; }
          return l;
        };
        const term = () => {
          let l = unary();
          while (isOp("*") || isOp("/")) { const op = toks[i++].v; l = { k: "bin", op, l, r: unary() }; }
          return l;
        };
        const unary = () => {
          if (isOp("-")) { i++; return { k: "neg", e: unary() }; }
          if (isOp("+")) { i++; return unary(); }
          if (isOp("!")) { i++; return { k: "not", e: unary() }; }
          return primary();
        };
        const primary = () => {
          const tk = peek();
          if (!tk) throw new Error("unexpected end");
          if (tk.t === "num") { i++; return { k: "num", v: tk.v }; }
          if (isOp("(")) { i++; const e = ternary(); eat(")"); return e; }
          if (tk.t === "id") {
            i++;
            const path = [tk.v];
            // dotted path: Affix."Static Value 0", PowerTag.X."Script Formula 1", Owner.Foo
            while (isOp(".") && toks[i + 1] && (toks[i + 1].t === "id" || toks[i + 1].t === "str")) { i++; path.push(toks[i++].v); }
            let ref = null;
            if (isOp("#") && toks[i + 1] && toks[i + 1].t === "id") { i++; ref = toks[i++].v; }
            if (isOp("(")) {
              i++;
              const args = [];
              if (!isOp(")")) { args.push(ternary()); while (isOp(",")) { i++; args.push(ternary()); } }
              eat(")");
              return { k: "call", name: path.join("."), args };
            }
            return { k: "ref", path, ref };
          }
          throw new Error("unexpected " + JSON.stringify(tk));
        };

        ast = ternary();
        if (i < toks.length) throw new Error("trailing tokens");
      } catch (e) {
        ast = { k: "bad" };
      }
      astCache.set(src, ast);
      return ast;
    }

    // ---- Evaluator ----
    // ctx: { affix: id, power: name, world: { t: 0..1 roll, rank: n, mythic: bool }, depth }
    // world: { t, rank, range, mythic, forceMax, crafted, potency, ip }
    //   mythic   = original Mythic unique (eMagicType 4): always perfect rolls
    //   forceMax = crafted mythic base stats: perfect rolls
    //   crafted  = crafted Mythic version of a normal unique: shows mythic text + Unique Potency
    const rollT = (w) => (w.mythic || w.forceMax ? 1 : w.t);
    const roll = (ctx, lo, hi) => (lo === UNKNOWN || hi === UNKNOWN ? UNKNOWN : lo + (hi - lo) * rollT(ctx.world));

    const glob = (k) => { const v = codex.globals && codex.globals[k]; return typeof v === "number" ? v : UNKNOWN; };

    const FUNCS = {
      FloatRandomRangeWithIntervalUniqueAffixPityBonus: (c, a) => roll(c, a[1], a[2]),
      FloatRangeWithIntervalUniqueAffixPityBonus: (c, a) => roll(c, a[2], a[3]),
      FloatRandomRangeWithInterval: (c, a) => roll(c, a[1], a[2]),
      FloatRandomRange: (c, a) => roll(c, a[0], a[1]),
      RandomFloat: (c, a) => roll(c, a[0], a[1]),
      RandomInt: (c, a) => { const v = roll(c, a[0], a[1]); return v === UNKNOWN ? v : Math.round(v); },
      SharedRandomFloat: (c) => rollT(c.world),
      IPower: (c) => c.world.ip || DEFAULT_IP,
      // Greater-affix / masterwork multipliers on a roll: a plain drop has none.
      GetTotalAffixBonus: () => 1,
      SacredAffixScalarOffense: () => glob("flSacredAffixScalarOffense"),
      AncestralAffixScalarOffense: () => glob("flAncestralAffixScalarOffense"),
      SacredAffixScalarDefense: () => glob("flSacredAffixScalarDefense"),
      AncestralAffixScalarDefense: () => glob("flAncestralAffixScalarDefense"),
      CurrentLegendaryRank: (c) => {
        const max = (codex.affixes[c.affix] || {}).rk || c.world.rank;
        return Math.max(1, Math.min(c.world.rank, max));
      },
      Min: (c, a) => (a.includes(UNKNOWN) ? UNKNOWN : Math.min(...a)),
      Max: (c, a) => (a.includes(UNKNOWN) ? UNKNOWN : Math.max(...a)),
      Floor: (c, a) => (a[0] === UNKNOWN ? UNKNOWN : Math.floor(a[0])),
      Ceil: (c, a) => (a[0] === UNKNOWN ? UNKNOWN : Math.ceil(a[0])),
      Round: (c, a) => (a[0] === UNKNOWN ? UNKNOWN : Math.round(a[0])),
      Abs: (c, a) => (a[0] === UNKNOWN ? UNKNOWN : Math.abs(a[0])),
      Pow: (c, a) => (a.includes(UNKNOWN) ? UNKNOWN : Math.pow(a[0], a[1])),
      POW: (c, a) => (a.includes(UNKNOWN) ? UNKNOWN : Math.pow(a[0], a[1])),
    };

    const FUNCS_LC = Object.fromEntries(Object.entries(FUNCS).map(([k, v]) => [k.toLowerCase(), v]));

    function evalFormula(src, ctx) {
      if (src == null || src === "") return UNKNOWN;
      if (ctx.depth > 24) return UNKNOWN;
      return evalNode(parse(String(src)), { ...ctx, depth: ctx.depth + 1 });
    }

    function evalNode(n, ctx) {
      switch (n.k) {
        case "num": return n.v;
        case "neg": { const v = evalNode(n.e, ctx); return v === UNKNOWN ? v : -v; }
        case "not": { const v = evalNode(n.e, ctx); return v === UNKNOWN ? v : (v ? 0 : 1); }
        case "?": {
          const c = evalNode(n.cond, ctx);
          return c === UNKNOWN ? UNKNOWN : evalNode(c ? n.a : n.b, ctx);
        }
        case "bin": {
          const l = evalNode(n.l, ctx), r = evalNode(n.r, ctx);
          if (l === UNKNOWN || r === UNKNOWN) return UNKNOWN;
          switch (n.op) {
            case "+": return l + r;
            case "-": return l - r;
            case "*": return l * r;
            case "/": return r === 0 ? UNKNOWN : l / r;
            case "<": return +(l < r);
            case ">": return +(l > r);
            case "<=": return +(l <= r);
            case ">=": return +(l >= r);
            case "==": return +(l === r);
            case "!=": return +(l !== r);
            case "&&": return +(l && r);
            case "||": return +(l || r);
          }
          return UNKNOWN;
        }
        case "call": {
          const f = FUNCS[n.name] || FUNCS_LC[n.name.toLowerCase()];
          if (!f) return UNKNOWN;
          return f(ctx, n.args.map((a) => evalNode(a, ctx)));
        }
        case "ref": return resolveRef(n, ctx);
        default: return UNKNOWN;
      }
    }

    const STATIC_RE = /^Static[ _]Value[ _](\d+)$/;

    function resolveRef(n, ctx) {
      const [head, ...rest] = n.path;

      // Affix_Value_N  /  Affix_Value_N#OtherAffix
      if (/^Affix_(Flat_)?Value_\d+$/.test(head) && !rest.length) {
        const id = n.ref || ctx.affix;
        const a = codex.affixes[id];
        if (!a || !a.v || a.v[head] == null) return UNKNOWN;
        const formula = a.v[head];
        const v = evalFormula(formula, { ...ctx, affix: id });
        // Affix bonuses (never on values flagged bIgnoreAffixBonuses):
        //   Legendary aspects: slot bonus, amulet +50% / 2H weapon +100% (flLegendaryAffix*Bonus)
        //   Unique powers on a Mythic: the same slot bonus (confirmed in game: Moloch's Beating Flame amulet
        //   15-20% as a unique, 39% = 20 x 1.5 x 1.3 as a crafted Mythic; Red Sermon 2H 156% = 60 x 2 x 1.3),
        //   times Mythic Unique Potency,
        //   Item_Affix_Bonus_Per_Magic_Type(2) = x1.3 (Elegy 50% -> 65%), unless the formula applies it itself.
        if (v === UNKNOWN || (a.nb && a.nb.includes(head))) return v;
        if (a.lg) return v * (1 + (ctx.world.slotBonus || 0));
        if (!a.u) return v;
        const p = /UniquePotency/.test(formula) ? 0 : ctx.world.potency || 0;
        return v * (1 + (ctx.world.slotBonus || 0)) * (1 + p);
      }

      // S14_Mythic_UniquePotency referenced directly in a formula (e.g. Mantle of the Grey)
      if (/_Mythic_UniquePotency$/.test(head) && !rest.length) return ctx.world.potency || 0;

      // Affix."Static Value N"  /  Affix.Static_Value_N  /  Affix.OtherAffix."Static Value N"
      if (head === "Affix" && rest.length) {
        const last = rest[rest.length - 1];
        const m = STATIC_RE.exec(last);
        if (!m) return UNKNOWN;
        const id = rest.length > 1 ? rest[0] : ctx.affix;
        const a = codex.affixes[id];
        const v = a && a.sv ? a.sv[+m[1]] : undefined;
        return typeof v === "number" ? v : UNKNOWN;
      }

      // PowerTag.Power."Script Formula N"
      if (head === "PowerTag" && rest.length === 2) {
        const m = /^Script Formula (\d+)$/.exec(rest[1]);
        const sfs = codex.powers[rest[0]];
        if (!m || !sfs) return UNKNOWN;
        return evalFormula(sfs[+m[1]], { ...ctx, power: rest[0] });
      }

      // SF_N inside a power's script formulas
      const sf = /^SF_(\d+)$/.exec(head);
      if (sf && ctx.power && codex.powers[ctx.power]) {
        return evalFormula(codex.powers[ctx.power][+sf[1]], ctx);
      }

      // Owner.*, Mod.*, live character attributes: not knowable offline
      return UNKNOWN;
    }

    // ---- Number formatting ([expr|fmt|]) ----
    function formatNumber(v, fmt) {
      const dec = /(\d)/.exec(fmt);
      const decimals = dec ? +dec[1] : 0;
      let s = (Math.round(v * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
      if (s.includes(".")) s = s.replace(/\.?0+$/, "");
      if (s === "-0") s = "0";
      return s;
    }

    function decorate(core, fmt, positive) {
      let out = core;
      if (fmt.includes("%")) out += "%";
      if (fmt.includes("x")) out = "x" + out;
      if (fmt.includes("+") && positive) out = "+" + out;
      return out;
    }

    /**
     * Evaluate one [expr|fmt|] token in a world spec.
     * world: { range: true, rank: [lo, hi] } -> min/max across rolls & ranks
     *        { t, rank }                     -> one exact value
     */
    function evalToken(expr, fmt, ctx) {
      if (ctx.world.range) {
        const lo = evalFormula(expr, { ...ctx, world: { ...ctx.world, range: false, t: 0, rank: 1 } });
        const hi = evalFormula(expr, { ...ctx, world: { ...ctx.world, range: false, t: 1, rank: ctx.world.maxRank || 99 } });
        if (lo === UNKNOWN || hi === UNKNOWN) return { text: "#", unknown: true };
        const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
        const fa = formatNumber(a, fmt), fb = formatNumber(b, fmt);
        if (fa === fb) return { text: decorate(fa, fmt, a >= 0) };
        return { text: decorate(`[${fa} - ${fb}]`, fmt, a >= 0), range: true };
      }
      const v = evalFormula(expr, ctx);
      if (v === UNKNOWN) return { text: "#", unknown: true };
      return { text: decorate(formatNumber(v, fmt), fmt, v >= 0) };
    }

    // ---- Template renderer ----
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    const IF_RE = /\{if:([^}]*)\}((?:(?!\{\/if\}|\{else\})[\s\S])*)(?:\{else\}((?:(?!\{\/if\})[\s\S])*))?\{\/if\}/g;
    const PLURAL_RE = /\|\d*([^:|;\]]*):([^;|\]]*);/g;
    const PIECE_RE = /(\{[^{}]*\}|\[[^\[\]]*\])/;

    const COLOR_CLASS = {
      c_important: "gt-important", c_number: "gt-number", c_random: "gt-random", c_mythic: "gt-mythic",
      c_set: "gt-set", c_label: "gt-label", c_red: "gt-red", c_gold: "gt-gold", c_yellow: "gt-gold",
      c_legendary: "gt-important", c_unique: "gt-important", c_green: "gt-set",
      c_runecondition: "gt-rune-ritual", c_runeeffect: "gt-rune-invoke",
    };

    function applyConditions(text, flags) {
      let prev;
      do {
        prev = text;
        text = text.replace(IF_RE, (_, cond, a, b) => (flags[cond.trim()] ? a : b || ""));
      } while (text !== prev);
      return text;
    }

    /** Render a game template to { html, plain }. */
    function render(template, ctx) {
      const flags = { "SF.IsMythic": !!(ctx.world.mythic || ctx.world.crafted) };
      let text = applyConditions(String(template || ""), flags).replace(PLURAL_RE, (_, one, many) => many);

      const parts = text.split(PIECE_RE);
      let html = "", plain = "";
      const stack = [];

      for (const p of parts) {
        if (!p) continue;
        if (p[0] === "{" && p[p.length - 1] === "}") {
          const tag = p.slice(1, -1).trim();
          if (tag[0] === "/") {
            if (stack.length) { html += "</span>"; stack.pop(); }
          } else if (tag === "u" || tag === "b" || tag === "i") {
            html += `<span class="gt-${tag === "i" ? "u" : tag}">`; stack.push(tag);
          } else if (/^c[_:]/i.test(tag)) {
            const cls = COLOR_CLASS[tag.toLowerCase()];
            if (/^c:/i.test(tag)) {
              const hex = tag.slice(2).replace(/^FF/i, "").slice(0, 6);
              html += /^[0-9a-f]{6}$/i.test(hex) ? `<span style="color:#${hex}">` : "<span>";
            } else {
              html += `<span class="${cls || "gt-important"}">`;
            }
            stack.push(tag);
          } else if (/^icon:bullet/i.test(tag)) {
            html += "• "; plain += "• ";
          } else if (/^icon:arrow/i.test(tag)) {
            html += "→ "; plain += "→ ";
          }
          // other tags ({icon:*}, unknown) are dropped
          continue;
        }
        if (p[0] === "[" && p[p.length - 1] === "]") {
          const inner = p.slice(1, -1);
          const [expr, fmt = ""] = inner.split("|");
          const res = evalToken(expr.trim(), fmt, ctx);
          const cls = res.unknown ? "gt-unk" : res.range ? "gt-val gt-val--range" : "gt-val";
          const title = res.unknown ? ` title="Depends on live character stats, or the game data has no value for it."` : "";
          html += `<span class="${cls}"${title}>${esc(res.text)}</span>`;
          plain += res.text;
          continue;
        }
        html += esc(p).replace(/\r?\n/g, "<br>");
        plain += p.replace(/\r?\n/g, " ");
      }
      while (stack.length) { html += "</span>"; stack.pop(); }
      return { html, plain: plain.replace(/\s+/g, " ").trim() };
    }

    /** Expand an AttributeDescriptions stat line into a template we can render. */
    function statLineTemplate(line, ip) {
      const f = line.s ? null : line.f || gbFormula(line.g, ip); // s: scaled by player health in game
      const val = f ? `(${f})` : "__unknown__";
      const label = line.p || "Skill";
      // Inside [..] any {VALUE}/{VALUE1}/{VALUE2} is the number (the data also spells it {vALUE});
      // outside, {VALUE1} is the skill/tag label.
      let t = line.t.replace(/\[([^\[\]]*)\]/g, (m) => m.replace(/\{VALUE[12]?\}/gi, val));
      t = t.replace(/\{VALUE2?\}/gi, `[${val}]`).replace(/\{VALUE1\}/gi, label);
      return t;
    }

    /** GameBalance formula for a stat line at an item power: the last range starting at or below it. */
    function gbFormula(name, ip) {
      const ranges = name && codex.gb && codex.gb[name];
      if (!ranges) return null;
      const at = ip || DEFAULT_IP;
      let f = null;
      for (const [start, formula] of ranges) if (start <= at) f = formula;
      return f;
    }

    function maxRankOf(affixId) {
      return (codex.affixes[affixId] || {}).rk || 1;
    }

    /** Render all text for an affix (desc or stat lines). */
    function renderAffix(affixId, world) {
      const a = codex.affixes[affixId];
      if (!a) return [];
      const ctx = { affix: affixId, world: { ...world, maxRank: maxRankOf(affixId) }, depth: 0 };
      if (a.t) return [render(a.t, ctx)];
      return (a.l || []).map((l) => render(statLineTemplate(l, world.ip), ctx));
    }

    /** The Mythic bonus lines (Unique Potency, CDR, +All Skills) from S14_Mythic_* affixes. */
    function renderMythicBonuses() {
      return (codex.mythic || []).map((m) => render(statLineTemplate(m), { affix: m.id, world: { t: 1, rank: 1 }, depth: 0 }));
    }

    /** Unique Potency granted by the Mythic upgrade (from data; 0.3 in 3.2.4). */
    function mythicPotency() {
      const m = (codex.mythic || []).find((x) => x.attr === "Item_Affix_Bonus_Per_Magic_Type" && x.param === 2);
      const v = m ? parseFloat(m.f) : NaN;
      return Number.isFinite(v) ? v : 0;
    }

    return {
      load(json) { codex = json; },
      get codex() { return codex; },
      renderAffix,
      renderMythicBonuses,
      mythicPotency,
      /** Render a plain game-text template (no affix context), e.g. rune descriptions. */
      renderText: (t) => render(t, { affix: null, world: { t: 1, rank: 1 }, depth: 0 }),
      maxRankOf,
      DEFAULT_IP,
      esc,
    };
  })();

  /* ==========================================================
     1b. Item curation: slot mapping + hiding internal entries
     ========================================================== */

  /**
   * Splits raw index items into what the player should see vs. hidden clutter.
   * Returns { visible: [...items with .slot], hidden: { reason: count } }.
   *
   * Hidden:
   *   charm      Talisman charm copies of uniques (same name/power as the real piece)
   *   internal   QA/TEST fixtures
   *   nonGear    ItemTypes with no player gear slot (see SLOT_MAP)
   *   slotSwap   Season 10 copies of a unique moved onto another slot
   *   duplicate  same item on several bases of one slot (e.g. Runewords)
   */
  function curateItems(items) {
    const hidden = { charm: 0, internal: 0, nonGear: 0, slotSwap: 0, duplicate: 0 };
    const kept = [];

    for (const it of items) {
      if (it.charm || it.typeId === "Charm") { hidden.charm++; continue; }
      if (INTERNAL_ID_RE.test(it.id) || INTERNAL_NAME_RE.test(it.name)) { hidden.internal++; continue; }
      const slot = SLOT_MAP[it.typeId];
      if (!slot) { hidden.nonGear++; continue; }
      kept.push({ ...it, slot, swap: SLOT_SWAP_RE.exec(it.id) });
    }

    // Season 10 slot swaps: hide when the real piece exists. If only swaps exist,
    // keep the one sitting in the original item's own slot (e.g. Gloves_..._Gloves).
    const canonicalNames = new Set(kept.filter((it) => !it.swap).map((it) => it.name));
    const swapGroups = new Map();
    for (const it of kept) {
      if (!it.swap) continue;
      if (!swapGroups.has(it.name)) swapGroups.set(it.name, []);
      swapGroups.get(it.name).push(it);
    }
    const keepSwap = new Set();
    for (const [name, group] of swapGroups) {
      if (canonicalNames.has(name)) continue;
      const originType = (it) => ORIGIN_SLOT_TYPE[it.swap[1].replace(/^S\d+_BSK_/, "").split("_")[0]];
      const best = group.find((it) => originType(it) === it.typeId && !it.swap[3]) || group.find((it) => originType(it) === it.typeId) || group[0];
      keepSwap.add(best);
    }

    // One card per (name, slot): collapses Runewords made on several weapon bases.
    const score = (it) => [it.power ? 1 : 0, it.swap ? 0 : 1, /^S\d+_|^Runeword_/.test(it.id) ? 0 : 1, /_x2$/i.test(it.id) ? 1 : 0];
    const better = (a, b) => { const sa = score(a), sb = score(b); for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] > sb[i]; return a.id < b.id; };
    const bySlotName = new Map();
    for (const it of kept) {
      if (it.swap && !keepSwap.has(it)) { hidden.slotSwap++; continue; }
      const k = it.name + "|" + it.slot;
      const prev = bySlotName.get(k);
      if (!prev) bySlotName.set(k, it);
      else { hidden.duplicate++; if (better(it, prev)) bySlotName.set(k, it); }
    }

    const visible = [...bySlotName.values()].map(({ swap, ...it }) => it);
    return { visible, hidden };
  }

  // Export for headless testing; skip UI when there's no DOM.
  if (typeof document === "undefined") { globalThis.OnoEngine = Engine; globalThis.OnoCurate = { curateItems, SLOT_MAP }; return; }

  /* ==========================================================
     2. Records (items + aspects -> searchable cards)
     ========================================================== */

  // Item power at max level: normal unique 850, Ancestral 900, Mythic (original or crafted) 900.
  const IP = { standard: 850, ancestral: 900, mythic: 900 };
  const RANGE_WORLD = { range: true };
  const state = {
    records: [],
    byId: new Map(),
    filters: { q: "", tokens: [], cls: "all", rarity: "all", slot: "all", source: "all", avail: "all", cat: "all" },
    mode: null,
    activeCard: null,
    pins: [],
    sandbox: { t: 1, rank: 16, ip: 850, mythic: [], slot: {}, charms: [], sets: [], leg: {}, sock: {}, gt: 9 }, // slot: aspect key -> "amulet" | "2h"
    view: { mythic: false, ip: IP.standard }, // Database view: Standard 850 / Ancestral 900 / crafted Mythic
    curation: null,
  };

  /** Normal uniques can be upgraded to a crafted Mythic (Horadric Cube). Original Mythics already are. */
  const canCraftMythic = (it) => it.kind !== "aspect" && it.rarity === "Unique";

  /**
   * Render an item's text in a given world.
   * crafted = view it as the crafted Mythic version:
   *   unique power  -> +Unique Potency (from S14_Mythic_UniquePotency), roll kept
   *   base stats    -> max rolls
   *   + the Mythic bonus lines
   */
  /** Aspect slot bonus from game globals: amulet +50% (150%), 2H weapon +100% (200%). */
  const ASPECT_SLOTS = { amulet: ["AMULET ×1.5", "flLegendaryAffixAmuletBonus"], "2h": ["2H ×2", "flLegendaryAffixTwoHandBonus"] };
  function aspectSlotBonus(slot) {
    const g = (Engine.codex.globals || {})[(ASPECT_SLOTS[slot] || [])[1]];
    return typeof g === "number" ? g : 0;
  }

  /** "amulet" | "2h" | null: which aspect slot bonus an item's slot gets. */
  const bonusSlot = (it) => ({ Amulet: "amulet", "2H Weapon": "2h" })[it.slot || SLOT_MAP[it.typeId]] || null;

  function renderItem(it, base, crafted) {
    const orig = it.rarity === "Mythic";
    const c = Boolean(crafted && !orig);
    // Mythics are always item power 900. A crafted Mythic is made in the Cube from the same unique at 900
    // (Ancestral); it keeps every affix, promoted to its maximum value.
    // Crafted: every affix, including the unique power, is promoted to its maximum value.
    // A Mythic's unique power gets the aspect slot bonus: amulet x1.5, 2H weapon x2. Plain uniques don't
    // (in game: Moloch's Beating Flame 15-20% as a unique, 39% as a Mythic; Red Sermon 156% as a Mythic).
    const slotBonus = orig || c ? aspectSlotBonus(bonusSlot(it)) : 0;
    const pw = { ...base, mythic: orig, crafted: c, forceMax: c, potency: c ? Engine.mythicPotency() : 0, slotBonus, ip: orig || c ? IP.mythic : base.ip };
    const sw = pw;
    return {
      crafted: c,
      power: it.power ? Engine.renderAffix(it.power, pw)[0] : null,
      imp: (it.imp || []).flatMap((a) => Engine.renderAffix(a, sw)),
      stats: (it.stats || []).flatMap((a) => Engine.renderAffix(a, sw)),
      mythicLines: c ? Engine.renderMythicBonuses() : [],
    };
  }

  const shownRarity = (r, rendered = r) => (rendered.crafted ? "Mythic" : r.rarity);

  /* ---------- Drop sources (data/sources/boss_loot.json via build_index.py) ---------- */
  const CAPSTONE_RATE = { common: "common, ~15%", uncommon: "uncommon, ~10%", rare: "rare, ~5%" };
  const bossShort = (b) => b.name.split(",")[0];

  /**
   * Where an item drops. Returns { keys, tag, text } or null when the source
   * data has no entry for it.
   *   keys  filter values it matches: boss ids, "capstone", "world"
   *         (Iconic Mythics match every boss: they drop from all of them)
   *   tag   short label for the card
   *   text  full sentence for the tooltip
   */
  function dropInfo(it, drops) {
    const d = it.drop || {};
    if (!drops) return null;
    const bosses = (d.bosses || []).map((id) => drops.byId[id]).filter(Boolean);
    const keys = [];
    const tags = [];
    const parts = [];
    if (bosses.length) {
      keys.push(...bosses.map((b) => b.id));
      tags.push(bosses.map(bossShort).join(" / "));
      parts.push(bosses.map((b) => `${b.name} (${b.key}, ${b.location}; trophy: ${b.trophy})`).join("; ") + ". Also from Belial when he mirrors this boss");
    }
    if (d.iconic) {
      for (const b of drops.bosses) if (!keys.includes(b.id)) keys.push(b.id);
      tags.push(bosses.length ? "+ any boss" : "Any boss");
      parts.push("Iconic Mythic: can drop from every boss");
    }
    if (d.capstone) {
      keys.push("capstone");
      tags.push("Capstone");
      parts.push(`Season 15 capstone dungeons: Baal, Mephisto or Diablo (${CAPSTONE_RATE[d.capstone] || d.capstone})`);
    }
    if (d.noBoss) {
      keys.push("world");
      tags.push("World drop");
      parts.push("No dedicated boss: random world drop or Horadric Cube conversion");
    }
    if (it.craft) {
      keys.push("crafted");
      tags.push(bosses.length || d.capstone ? "+ craftable" : "Craftable");
      parts.push(`Craft: ${it.craft.replace(/\.$/, "")}`);
    }
    return keys.length ? { keys, tag: tags.join(" "), text: parts.join(". ") + "." } : null;
  }

  function buildRecords(codex) {
    const records = [];
    state.byId.clear();
    state.curation = state.curation || curateItems(codex.items);
    if (codex.drops && !codex.drops.byId) codex.drops.byId = Object.fromEntries(codex.drops.bosses.map((b) => [b.id, b]));

    for (const it of state.curation.visible) {
      const { power, imp, stats, mythicLines, crafted } = renderItem(it, { ...RANGE_WORLD, ip: state.view.ip }, state.view.mythic && canCraftMythic(it));
      records.push({
        crafted, mythicLines,
        key: "i:" + it.id,
        kind: "item",
        id: it.id,
        name: it.name,
        rarity: it.rarity,
        slot: it.slot,
        type: it.type,
        classes: it.c || [],
        flavor: it.flavor || "",
        icon: it.ic || "",
        power, imp, stats,
        drop: dropInfo(it, codex.drops),
        raw: it,
      });
    }

    for (const asp of codex.aspects) {
      const a = codex.affixes[asp.id] || {};
      const power = Engine.renderAffix(asp.id, RANGE_WORLD)[0] || null;
      records.push({
        key: "a:" + asp.id,
        kind: "aspect",
        id: asp.id,
        name: asp.name,
        rarity: "Legendary",
        slot: null,
        type: "Legendary Aspect",
        classes: a.c || [],
        maxRank: a.rk || null,
        cats: asp.cat || [],
        aslots: asp.sl || [],
        flavor: "",
        icon: asp.ic || "",
        power, imp: [], stats: [], mythicLines: [], crafted: false,
        raw: asp,
      });
    }

    for (const r of records) {
      const effectPlain = [r.power && r.power.plain, ...r.imp.map((x) => x.plain), ...r.stats.map((x) => x.plain)].filter(Boolean).join(" ");
      r.search = [r.name, r.type, r.slot, r.rarity, ...(r.cats || []), ...(r.aslots || []), r.classes.length ? r.classes.join(" ") : "all classes", r.drop && r.drop.text, effectPlain]
        .filter(Boolean).join(" ").toLowerCase();
      r.classLabel = r.classes.length ? r.classes.join(" / ") : "All classes";
    }

    records.sort((a, b) => a.name.localeCompare(b.name));
    records.forEach((r, i) => { r.idx = i; state.byId.set(r.key, r); });
    state.records = records;
  }

  /* ==========================================================
     3. DOM
     ========================================================== */

  const $ = (id) => document.getElementById(id);
  const els = {
    hudStatus: $("hud-status"), alert: $("alert"), search: $("search"), pinCount: $("pin-count"),
    viewCatalog: $("view-catalog"), viewSandbox: $("view-sandbox"),
    catalogEyebrow: $("catalog-eyebrow"), catalogTitle: $("catalog-title"),
    filterClass: $("filter-class"), filterRarity: $("filter-rarity"), filterSlot: $("filter-slot"),
    rowRarity: $("row-rarity"), rowSlot: $("row-slot"), rowView: $("row-view"), rowCat: $("row-cat"), filterCat: $("filter-cat"),
    rowSource: $("row-source"), filterSource: $("filter-source"), rowAvail: $("row-avail"), filterAvail: $("filter-avail"), sourceNote: $("source-note"),
    viewRunes: $("view-runes"), runeTabs: $("rune-tabs"), rowRuneKind: $("row-rune-kind"), runesBody: $("runes-body"),
    runesCount: $("runes-count"), runesSource: $("runes-source"),
    count: $("result-count"), reset: $("filter-reset"), grid: $("catalog-grid"), empty: $("catalog-empty"),
    tooltip: $("tooltip"),
    sbRoll: $("sb-roll"), sbRollOut: $("sb-roll-out"), sbRank: $("sb-rank"), sbRankOut: $("sb-rank-out"), sbIp: $("sb-ip"), sbIpOut: $("sb-ip-out"),
    sbAdd: $("sb-add"), sbOptions: $("sb-options"), sbList: $("sb-list"), sbShare: $("sb-share"), sbClear: $("sb-clear"), sbClass: $("sb-class"),
  };
  const esc = Engine.esc;
  const rarityClass = (r) => String(r || "unique").toLowerCase();

  /* ---------- Cards ---------- */
  function cardSummaryHTML(r) {
    if (r.power) return r.power.html;
    const lines = [...r.imp, ...r.stats];
    return lines.length ? lines.map((l) => l.html).join(" · ") : `<span class="gt-unk">No effect text in source data.</span>`;
  }

  function cardHTML(r) {
    const meta = r.kind === "aspect" ? `Legendary Aspect${r.cats.length ? " · " + r.cats.join(" / ") : ""}` : `${r.crafted ? "Mythic (crafted)" : r.rarity} · ${r.slot}`;
    const pinned = state.pins.includes(r.key);
    const blocked = !pinned && state.byId.size && classBlock(r);
    return `
      <article class="card card--${rarityClass(shownRarity(r))}" tabindex="0" data-key="${esc(r.key)}" aria-describedby="tooltip">
        <span class="card__meta">${r.kind === "item" ? slotIcon(r.slot) : ""}${esc(meta)}</span>
        <span class="card__main">
          <span class="card__text">
            <span class="card__name">${esc(r.name)}</span>
            <span class="card__effect">${cardSummaryHTML(r)}</span>
          </span>
          ${r.icon ? `<span class="ico-well">${itemIcon(r.icon)}</span>` : ""}
        </span>
        <span class="card__foot">
          <span class="tag tag--cls">${esc(r.classLabel)}</span>
          ${r.kind === "item" ? `<span class="tag">${esc(r.type)}</span>` : r.maxRank ? `<span class="tag">Rank 1–${r.maxRank}</span>` : ""}
          ${r.kind === "aspect" && r.aslots.length ? `<span class="tag" title="Can be imprinted on: ${esc(r.aslots.join(", "))}">${esc(aspectSlotsShort(r.aslots))}</span>` : ""}
          ${r.drop ? `<span class="tag tag--drop" title="${esc(r.drop.text)}">${esc(r.drop.tag)}</span>` : ""}
        </span>
        <button type="button" class="pin${blocked ? " pin--blocked" : ""}" data-pin="${esc(r.key)}" aria-pressed="${pinned}" title="${esc(blocked || `${pinned ? "Remove from" : "Add to"} Theorycraft Sandbox`)}" aria-label="${pinned ? "Remove from sandbox" : blocked ? esc(blocked) : "Add to sandbox"}">${pinned ? "✓" : blocked ? "⊘" : "+"}</button>
      </article>`;
  }

  /** Short label for an aspect's imprint slots, e.g. "Weapon · Gloves · Ring · Amulet". */
  const aspectSlotsShort = (sl) => sl.join(" · ");

  /* ---------- Tooltip ---------- */
  function tooltipInner(r, rendered = r) {
    const typeLine = r.kind === "aspect"
      ? `${(r.cats || []).length ? r.cats.join(" / ") + " " : ""}Legendary Aspect${r.classes.length ? " · " + r.classLabel : ""}`
      : `${r.classes.length === 1 ? r.classes[0] + " " : ""}${rendered.crafted ? "Mythic Unique" : r.rarity} ${r.type}`;
    const parts = [];
    if (rendered.imp.length) parts.push(`<ul class="tt__lines tt__lines--imp">${rendered.imp.map((l) => `<li>${l.html}</li>`).join("")}</ul>`);
    if (rendered.stats.length) parts.push(`<ul class="tt__lines">${rendered.stats.map((l) => `<li>${l.html}</li>`).join("")}</ul>`);
    if (rendered.mythicLines && rendered.mythicLines.length) parts.push(`<ul class="tt__lines tt__lines--mythic">${rendered.mythicLines.map((l) => `<li>${l.html}</li>`).join("")}</ul>`);
    if (rendered.power) parts.push(`<div class="tt__power-wrap"><p class="tt__power">${rendered.power.html}</p></div>`);
    if (r.flavor) parts.push(`<p class="tt__flavor">${esc(r.flavor)}</p>`);

    const foot = [
      ["CLASS", r.classLabel],
      r.kind === "item" ? ["SLOT", r.slot] : null,
      r.kind === "item" ? ["SOURCE", r.drop ? r.drop.text : "Unknown: not in the boss loot table or any recipe"] : null,
      r.maxRank ? ["RANKS", `1–${r.maxRank}`] : null,
      r.kind === "item" && bonusSlot(r.raw) && r.raw.power && (rendered.crafted || r.rarity === "Mythic")
        ? ["SLOT BONUS", `Mythic ${bonusSlot(r.raw) === "2h" ? "2H weapon: unique power ×2" : "amulet: unique power ×1.5"}, included above`] : null,
      r.kind === "aspect" && (r.aslots || []).length ? ["SLOTS", r.aslots.join(", ") + (r.aslots.includes("Weapon") ? " (2H weapon ×2)" : "") + (r.aslots.includes("Amulet") ? " · amulet ×1.5" : "")] : null,
      r.kind === "aspect" ? ["IMPRINT", "On a rare item in an allowed slot via the Codex of Power (salvage a legendary at the Blacksmith to save it), or over the aspect of a legendary in that slot"] : null,
      rendered.crafted ? ["MYTHIC", "Crafted: base stats at max, unique power +Unique Potency. Only 1 crafted Mythic can be equipped at a time"] : null,
      r.kind === "item" && r.rarity === "Mythic" ? ["EQUIP", "Doesn't count toward the 1 crafted Mythic limit (dropped Iconic Mythics and random Mythics from the Blacksmith or Jeweler don't)"] : null,
      ["ID", r.id],
    ].filter(Boolean);

    return `
      <div class="tt__head">
        ${r.icon ? `<span class="ico-well ico-well--tt">${itemIcon(r.icon)}</span>` : ""}
        <div class="tt__title">
          <p class="tt__name">${esc(r.name)}</p>
          <p class="tt__type">${esc(typeLine)}</p>
        </div>
        ${rendered.tools || ""}
      </div>
      <div class="tt__body">${parts.join('<div class="tt__sep"></div>') || `<span class="gt-unk">No effect text in source data.</span>`}</div>
      <dl class="tt__foot">${foot.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  }

  /** Tooltip for a set charm: its set, type, rolled affixes and the set's bonus tiers. */
  function setCharmTooltip(piece, affixes) {
    const st = piece.set, world = { t: state.sandbox.t, rank: 1, ip: 850 };
    const have = new Set(state.sandbox.sets.map((x) => talismanIdx().piece.get(x.p)).filter((p) => p && p.set.id === st.id).map((p) => p.type));
    const aff = (affixes || []).filter(Boolean).map((id) => Engine.renderAffix(id, world).map((l) => `<li>${l.html}</li>`).join("")).join("");
    const tiers = st.tiers.map((tr) => `<li class="${have.size >= setNeed(tr.n) ? "tt__set-on" : "tt__set-off"}"><span class="mono">(${setNeed(tr.n)})</span> ${(Engine.renderAffix(tr.a, world)[0] || { html: "" }).html}</li>`).join("");
    const parts = [];
    if (aff) parts.push(`<ul class="tt__lines">${aff}</ul>`);
    parts.push(`<p class="tt__setname">${esc(st.name)} <span class="mono">${have.size} / ${st.pieces.length}</span></p><ul class="tt__lines tt__lines--set">${tiers}</ul>`);
    if (piece.flavor) parts.push(`<p class="tt__flavor">${esc(piece.flavor)}</p>`);
    return `<div class="tt__head">${piece.ic ? `<span class="ico-well ico-well--tt">${itemIcon(piece.ic)}</span>` : ""}<div class="tt__title"><p class="tt__name">${esc(piece.name)}</p><p class="tt__type">${esc((st.c.length === 1 ? st.c[0] + " " : "") + "Set Charm · " + piece.type)}</p></div></div>
      <div class="tt__body">${parts.join('<div class="tt__sep"></div>')}</div>
      <dl class="tt__foot"><dt>SET</dt><dd>${esc(st.name)}: bonuses at ${st.tiers.map((t) => setNeed(t.n)).join(" / ")} different types</dd>${aff ? "" : "<dt>AFFIXES</dt><dd>Pick 2 in the Talisman panel</dd>"}<dt>ID</dt><dd>${esc(piece.id)}</dd></dl>`;
  }

  /** Tooltip HTML + rarity for any data-key: a record key, "charm:<key>", "set:<i>", "piece:<id>" or "torch". */
  function tooltipFor(key, inSandbox) {
    const world = { t: state.sandbox.t, rank: state.sandbox.rank, ip: state.sandbox.ip || Engine.DEFAULT_IP };
    const [kind, ...rest] = key.split(":");
    const id = rest.join(":");
    if (kind === "gem") { const [type, tg] = id.split("|"); const h = gemTooltip(type, tg === "" || tg == null ? null : +tg); return h && { html: h, rarity: "gem" }; }
    if (kind === "rune") { const h = runeTooltip(id); return h && { html: h, rarity: "rune" }; }
    if (kind === "set") { const x = state.sandbox.sets[+id], p = x && talismanIdx().piece.get(x.p); return p && { html: setCharmTooltip(p, x.a), rarity: "set" }; }
    if (kind === "piece") { const p = talismanIdx().piece.get(id); return p && { html: setCharmTooltip(p, []), rarity: "set" }; }
    if (kind === "leg") {
      const e = state.sandbox.leg[id], r = e && state.byId.get(e.a);
      if (!r) return null;
      return { html: tooltipInner({ ...r, type: `Legendary ${slotNameOf(id)}` }, renderLegAspect(r.key, id)), rarity: "legendary" };
    }
    if (kind === "legpick") {
      const [spec, akey] = id.split("|"), r = state.byId.get(akey);
      if (!r) return null;
      const world = { t: state.sandbox.t, rank: state.sandbox.rank, ip: state.sandbox.ip || Engine.DEFAULT_IP, slotBonus: aspectSlotBonus(legBonusSlot(spec, null)) };
      return { html: tooltipInner(r, { power: Engine.renderAffix(r.id, world)[0] || null, imp: [], stats: [], mythicLines: [], crafted: false }), rarity: "legendary" };
    }
    if (kind === "torch") {
      const it = codexItem(TORCH_ID);
      if (!it) return null;
      const r = { kind: "item", name: it.name, rarity: "Mythic", type: "Charm", slot: "Talisman (charm)", classes: [], classLabel: "All classes", flavor: it.flavor || "", id: it.id, icon: it.ic, raw: it, drop: null };
      return { html: tooltipInner(r, renderItem(it, { ...world, ip: 900 }, false)), rarity: "mythic" };
    }
    if (kind === "charm") {
      const r0 = state.byId.get(id), ch = r0 && charmOf(r0);
      if (!ch) return null;
      const r = { ...r0, type: "Charm", slot: "Talisman (charm: unique power only)" };
      return { html: tooltipInner(r, renderItem(ch, world, false)), rarity: rarityClass(r0.rarity) };
    }
    const r = state.byId.get(key);
    if (!r) return null;
    if (!inSandbox) return { html: tooltipInner(r), rarity: rarityClass(shownRarity(r)) };
    const rendered = renderedAt(r, world);
    return { html: tooltipInner(r, rendered), rarity: rarityClass(shownRarity(r, rendered)) };
  }

  function showTooltip(card) {
    const tt = tooltipFor(card.dataset.key, Boolean(card.closest("#view-sandbox, #picker")));
    if (!tt) return;
    if (state.activeCard && state.activeCard !== card) state.activeCard.classList.remove("is-active");
    state.activeCard = card;
    card.classList.add("is-active");
    els.tooltip.className = `tooltip tooltip--${tt.rarity}`;
    els.tooltip.innerHTML = tt.html;
    els.tooltip.hidden = false;
    positionTooltip(card);
  }

  function hideTooltip() {
    els.tooltip.hidden = true;
    if (state.activeCard) state.activeCard.classList.remove("is-active");
    state.activeCard = null;
  }

  function positionTooltip(card) {
    const r = card.getBoundingClientRect();
    const gap = 12, pad = 8;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const tip = els.tooltip;
    // Clear below the HUD when there's room; tall tooltips may cover it (it's transient).
    const hud = document.querySelector(".hud").offsetHeight + pad;
    tip.classList.remove("tooltip--compact", "tooltip--clipped");
    if (tip.scrollHeight > vh - 2 * pad) tip.classList.add("tooltip--compact"); // wider, smaller text, no flavor
    if (tip.scrollHeight > vh - 2 * pad) tip.classList.add("tooltip--clipped"); // still too tall: fade the cut
    const t = tip.getBoundingClientRect();
    const top0 = t.height <= vh - hud - pad ? hud : pad;

    let left = r.right + gap;
    let top = r.top;
    if (left + t.width > vw - pad) left = r.left - t.width - gap;
    if (left < pad) {
      left = Math.min(Math.max(pad, r.left), vw - t.width - pad);
      top = r.bottom + gap;
      if (top + t.height > vh - pad) top = r.top - t.height - gap;
    }
    top = Math.max(top0, Math.min(top, vh - t.height - pad));
    els.tooltip.style.left = `${Math.max(pad, left)}px`;
    els.tooltip.style.top = `${top}px`;
  }

  /* ---------- Catalog (Database + Aspect Codex) ---------- */
  function modeRecords(mode) {
    return mode === "codex" ? state.records.filter((r) => r.kind === "aspect") : state.records;
  }

  function renderCatalog(mode) {
    const changed = state.mode !== mode;
    state.mode = mode;
    els.catalogEyebrow.textContent = mode === "codex" ? "// ASPECT CODEX" : "// DATABASE";
    els.catalogTitle.textContent = mode === "codex" ? "Aspect Codex" : "Database";
    $("catalog-sub").textContent = mode === "codex"
      ? "Legendary aspects. Salvage a legendary at the Blacksmith to save its aspect to the Codex of Power, then imprint it on a rare item, or over the aspect of a legendary. Each aspect has a type (Offensive, Defensive, Utility, Resource, Mobility) that decides its slots: Offensive on weapons, gloves, rings and amulets; Defensive on helm, chest, pants, amulet and shield; Utility on armor, amulet and shield; Resource on rings and amulet; Mobility on boots and amulet. Amulet 150%, two-handed weapon 200%. Unique powers can't be imprinted."
      : "Uniques, Mythics and legendary aspects. A unique's power stays on that unique; only legendary aspects can be saved to the Codex of Power and imprinted on other gear.";
    els.rowRarity.hidden = mode === "codex";
    els.rowSlot.hidden = false;
    els.rowCat.hidden = mode !== "codex";
    els.rowView.hidden = mode === "codex";
    els.rowView.querySelectorAll("[data-view]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.view === viewName()));
    });

    if (changed) {
      const recs = modeRecords(mode);
      els.grid.innerHTML = recs.map(cardHTML).join("");
      renderFilterPills(recs);
    }
    applyFilters();
  }

  function renderFilterPills(recs) {
    const f = state.filters;
    const count = (pred) => recs.reduce((n, r) => n + (pred(r) ? 1 : 0), 0);

    els.filterClass.innerHTML =
      pill("cls", "all", "All", recs.length) +
      CLASS_FILTERS.map((c) => pill("cls", c, c, count((r) => !r.classes.length || r.classes.includes(c)))).join("");

    els.filterRarity.innerHTML =
      pill("rarity", "all", "All", recs.length) +
      RARITY_FILTERS.map((x) => pill("rarity", x, x, count((r) => r.rarity === x))).join("");

    const slotCounts = {};
    if (state.mode === "codex") {
      // Aspect Codex: Slot = where an aspect can be imprinted.
      for (const r of recs) for (const s of r.aslots || []) slotCounts[s] = (slotCounts[s] || 0) + 1;
      els.filterSlot.innerHTML = pill("slot", "all", "All", recs.length) + ASPECT_SLOTS_ORDER.filter((s) => slotCounts[s])
        .map((s) => pill("slot", s, s, slotCounts[s], false, `Aspects that can be imprinted on ${s === "Weapon" ? "a weapon" : "a " + s}`, slotIcon(ASPECT_SLOT_ICON[s] || s))).join("");
      els.filterCat.innerHTML = pill("cat", "all", "All", recs.length) + ASPECT_CATS.map((c) => pill("cat", c, c, count((r) => (r.cats || []).includes(c)))).join("");
    } else {
      for (const r of recs) if (r.slot) slotCounts[r.slot] = (slotCounts[r.slot] || 0) + 1;
      const slots = [...SLOT_ORDER.filter((s) => slotCounts[s]), ...Object.keys(slotCounts).filter((s) => !SLOT_ORDER.includes(s)).sort()];
      els.filterSlot.innerHTML = pill("slot", "all", "All", recs.length) + slots.map((s) => pill("slot", s, s, slotCounts[s], false, "", slotIcon(s))).join("");
    }
    if (f.slot !== "all" && !slotCounts[f.slot]) f.slot = "all";

    const drops = Engine.codex && Engine.codex.drops;
    els.rowSource.hidden = state.mode === "codex" || !drops;
    if (drops) {
      const has = (k) => (r) => r.drop && r.drop.keys.includes(k);
      const opts = [
        ...drops.bosses.map((b) => [b.id, bossShort(b), `${b.name} · ${b.key} · ${b.location}`]),
        ["capstone", "S15 Capstone", "Season 15 uniques: Baal, Mephisto and Diablo capstone dungeons"],
        ["world", "World drop", "No dedicated boss: random drop or Horadric Cube"],
        ["crafted", "Craftable", "Has a specific crafting recipe (runewords, Shroud of False Death)"],
        ["unknown", "Unlisted", "Not in the boss loot table (often old or seasonal items)"],
      ];
      els.filterSource.innerHTML = pill("source", "all", "All", recs.length) +
        opts.map(([k, label, title]) => pill("source", k, label, count(k === "unknown" ? (r) => !r.drop : has(k)), false, title)).join("");
      els.sourceNote.textContent = `Source: ${drops.sourceName}, updated ${drops.sourceUpdated} (${drops.season}). Belial mirrors the boss you pick.`;
    }

    // Availability: a unique is "obtainable now" when the current drop table or a recipe lists it.
    els.rowAvail.hidden = state.mode === "codex" || !drops;
    if (drops) {
      els.filterAvail.innerHTML = pill("avail", "all", "All", recs.length) +
        pill("avail", "current", "Obtainable now", count((r) => !isLegacy(r)), false, `Uniques in the ${drops.season} drop table or a recipe, plus all aspects`) +
        pill("avail", "legacy", "Legacy", count(isLegacy), false, "Uniques no current source lists: old seasonal copies (Crucible, Runewords), event items, retired pieces");
    }
  }

  function pill(group, value, label, n, disabled = false, title = "", icon = "") {
    return `<button type="button" class="pill" data-filter="${group}" data-value="${esc(value)}" aria-pressed="false"${disabled ? " disabled" : ""}${title ? ` title="${esc(title)}"` : ""}>${icon}${esc(label)}<span class="pill__n">${n}</span></button>`;
  }

  /** A unique that neither the drop table nor a recipe lists. Aspects are never legacy. */
  const isLegacy = (r) => r.kind === "item" && !r.drop;

  function matches(r) {
    const f = state.filters;
    if (f.cls !== "all" && r.classes.length && !r.classes.includes(f.cls)) return false;
    if (state.mode === "codex") {
      if (f.slot !== "all" && !(r.aslots || []).includes(f.slot)) return false;
      if (f.cat !== "all" && !(r.cats || []).includes(f.cat)) return false;
    } else {
      if (f.rarity !== "all" && r.rarity !== f.rarity) return false;
      if (f.slot !== "all" && r.slot !== f.slot) return false;
      if (f.source !== "all" && (f.source === "unknown" ? r.drop : !(r.drop && r.drop.keys.includes(f.source)))) return false;
      if (f.avail !== "all" && (f.avail === "legacy") !== isLegacy(r)) return false;
    }
    for (const t of f.tokens) if (!r.search.includes(t)) return false;
    return true;
  }

  function applyFilters() {
    if (!state.mode) return;
    let shown = 0;
    const cards = els.grid.children;
    for (const card of cards) {
      const ok = matches(state.byId.get(card.dataset.key));
      card.hidden = !ok;
      if (ok) shown++;
    }
    els.count.innerHTML = `<b>${shown}</b> / ${cards.length} RECORDS${state.filters.q ? ` // QUERY "${esc(state.filters.q)}"` : ""}`;
    els.empty.hidden = shown > 0;
    els.viewCatalog.querySelectorAll(".pill[data-filter]").forEach((p) => {
      p.setAttribute("aria-pressed", String(state.filters[p.dataset.filter] === p.dataset.value));
    });
  }

  /* ---------- Sandbox ---------- */
  const PIN_KEY = "onosendai.pins";
  const SB_KEY = "onosendai.sandbox";

  function loadPins() {
    const fromHash = /[?&]pins=([^&]*)/.exec(location.hash);
    if (fromHash) {
      state.pins = decodeURIComponent(fromHash[1]).split(",").filter((k) => k && state.byId.has(k));
      const cls = /[?&]cls=([^&]+)/.exec(location.hash);
      try { Object.assign(state.sandbox, JSON.parse(localStorage.getItem(SB_KEY)) || {}); } catch { /* ignore */ }
      if (!Array.isArray(state.sandbox.mythic)) state.sandbox.mythic = [];
      if (!state.sandbox.slot || typeof state.sandbox.slot !== "object") state.sandbox.slot = {};
      const ch = /[?&]charms=([^&]+)/.exec(location.hash), seal = /[?&]seal=([^&]+)/.exec(location.hash);
      state.sandbox.charms = ch ? decodeURIComponent(ch[1]).split(",").filter((k) => state.pins.includes(k)) : [];
      state.sandbox.seal = seal && SEALS[seal[1]] ? seal[1] : "";
      state.sandbox.torch = /[?&]torch=1/.test(location.hash);
      const lg = /[?&]leg=([^&]+)/.exec(location.hash);
      state.sandbox.leg = {};
      if (lg) for (const x of decodeURIComponent(lg[1]).split(",")) { const [sp, ak, two] = x.split("~"); if (sp && state.byId.has(ak)) state.sandbox.leg[sp] = { a: ak, two: two === "1" }; }
      const sc = /[?&]sets=([^&]+)/.exec(location.hash);
      state.sandbox.sets = sc ? decodeURIComponent(sc[1]).split(",").map((x) => { const [p, a1, a2] = x.split("~"); return { p, a: [a1 || "", a2 || ""] }; }).filter((x) => talismanIdx().piece.has(x.p)) : [];
      state.sandbox.cls = cls && Engine.codex.meta.classes.includes(decodeURIComponent(cls[1])) ? decodeURIComponent(cls[1]) : "";
      if (state.sandbox.cls) {
        const keep = (k) => classOk(state.byId.get(k), state.sandbox.cls);
        state.pins = state.pins.filter(keep);
        state.sandbox.charms = state.sandbox.charms.filter(keep);
        for (const [sp, e] of Object.entries(state.sandbox.leg)) if (!keep(e.a)) delete state.sandbox.leg[sp];
      }
      const so = /[?&]sock=([^&]+)/.exec(location.hash), gt = /[?&]gt=(\d)/.exec(location.hash);
      state.sandbox.sock = {};
      if (so) for (const x of decodeURIComponent(so[1]).split(",")) { const [sp, ...v] = x.split("~"); if (/^(g|w):/.test(sp)) state.sandbox.sock[sp] = v.map((y) => (/^(g|r):/.test(y) ? y : "")); }
      state.sandbox.gt = gt ? +gt[1] : 9;
      saveSandbox();
      savePins();
      return;
    }
    try { state.pins = (JSON.parse(localStorage.getItem(PIN_KEY)) || []).filter((k) => state.byId.has(k)); } catch { state.pins = []; }
    try { Object.assign(state.sandbox, JSON.parse(localStorage.getItem(SB_KEY)) || {}); } catch { /* ignore */ }
    if (!Array.isArray(state.sandbox.mythic)) state.sandbox.mythic = [];
    if (!state.sandbox.slot || typeof state.sandbox.slot !== "object") state.sandbox.slot = {};
    if (!Array.isArray(state.sandbox.charms)) state.sandbox.charms = [];
    if (!Array.isArray(state.sandbox.sets)) state.sandbox.sets = [];
    if (!state.sandbox.leg || typeof state.sandbox.leg !== "object") state.sandbox.leg = {};
    if (!state.sandbox.sock || typeof state.sandbox.sock !== "object") state.sandbox.sock = {};
    if (!(state.sandbox.gt >= 1 && state.sandbox.gt <= 9)) state.sandbox.gt = 9;
    state.sandbox.sets = state.sandbox.sets.filter((x) => x && talismanIdx().piece.has(x.p));
    state.sandbox.charms = state.sandbox.charms.filter((k) => state.pins.includes(k));
  }

  function saveSandbox() {
    try { localStorage.setItem(SB_KEY, JSON.stringify(state.sandbox)); } catch { /* ignore */ }
  }

  function savePins() {
    try { localStorage.setItem(PIN_KEY, JSON.stringify(state.pins)); } catch { /* ignore */ }
    updatePinBadge();
  }

  function updatePinBadge() {
    els.pinCount.textContent = state.pins.length;
    els.pinCount.hidden = !state.pins.length;
  }

  /* ---------- Weapon loadout rules ----------
   * Barbarian (Arsenal): a 2H bludgeoning + a 2H slashing weapon + two 1H weapons (dual wield).
   * Rogue: a bow or crossbow + two daggers or swords.
   * Every other class: a 2H weapon, or a 1H weapon + an off-hand (shield, focus, totem).
   * Each weapon type lists the slot sets it can fill; a 2H weapon fills both hands.
   */
  const W1H = new Set(["Sword", "Axe", "Mace", "Dagger", "Wand", "Scythe", "Flail", "Axe_Berserker_Axe", "Sword_Phase_Blade"]);
  const WOFF = new Set(["Shield", "Focus", "FocusBookOffHand", "OffHandTotem"]);
  const WEAPON_RULES = {
    Barbarian: {
      text: "Barbarian: a 2H bludgeoning weapon, a 2H slashing weapon and two 1H weapons (dual wield)",
      slots: { blunt: "2H Bludgeoning", slash: "2H Slashing", main: "Dual Wield 1", off: "Dual Wield 2" },
      fits: (t) => (t === "Mace2H" ? [["blunt"]] : ["Axe2H", "Sword2H", "Polearm"].includes(t) ? [["slash"]]
        : ["Sword", "Axe", "Mace", "Axe_Berserker_Axe", "Sword_Phase_Blade"].includes(t) ? [["main"], ["off"]] : null),
    },
    Rogue: {
      text: "Rogue: a bow or crossbow and two daggers or swords",
      slots: { ranged: "Ranged", main: "Melee 1", off: "Melee 2" },
      fits: (t) => (["Bow", "Crossbow2H"].includes(t) ? [["ranged"]] : ["Dagger", "Sword", "Sword_Phase_Blade"].includes(t) ? [["main"], ["off"]] : null),
    },
    any: {
      text: "a 2H weapon, or a 1H weapon and an off-hand",
      slots: { main: "Main Hand", off: "Off-Hand" },
      fits: (t) => (W1H.has(t) ? [["main"]] : WOFF.has(t) ? [["off"]] : [["main", "off"]]),
    },
  };
  const isWeapon = (r) => r && r.kind === "item" && ["1H Weapon", "2H Weapon", "Off-Hand"].includes(r.slot);

  /** The build's class: the Sandbox's Class setting, or (Auto) the one class every class-locked pin allows. */
  function sandboxClass(pins = state.pins) {
    if (state.sandbox.cls) return state.sandbox.cls;
    let common = null;
    for (const k of pins) {
      const r = state.byId.get(k);
      if (!r || r.kind !== "item" || !r.classes.length) continue;
      common = common ? common.filter((c) => r.classes.includes(c)) : [...r.classes];
    }
    return common && common.length === 1 ? common[0] : "";
  }
  /* Class weapon types from the game data (ItemType fUsableByClass, codex.itemTypes). */
  const TYPE_NAMES = { Sword: "sword", Axe: "axe", Mace: "mace", Dagger: "dagger", Wand: "wand", Scythe: "scythe", Flail: "flail",
    Sword2H: "2H sword", Axe2H: "2H axe", Mace2H: "2H mace", Scythe2H: "2H scythe", Polearm: "polearm", Glaive: "glaive", Staff: "staff",
    Quarterstaff: "quarterstaff", Bow: "bow", Crossbow2H: "crossbow", Shield: "shield", Focus: "focus", FocusBookOffHand: "book", OffHandTotem: "totem" };
  const W2H = new Set(["Sword2H", "Axe2H", "Mace2H", "Scythe2H", "Polearm", "Glaive", "Staff", "Quarterstaff", "Bow", "Crossbow2H"]);
  /** Can `cls` use item type `t`? Unknown types or no class: yes. */
  function typeAllowed(t, cls) {
    const T = Engine.codex && Engine.codex.itemTypes;
    return !cls || !T || !T[t] || T[t].c.includes(cls);
  }
  const classTypes = (cls, set) => Object.keys(TYPE_NAMES).filter((t) => set.has(t) && typeAllowed(t, cls));
  /** Off-hand types the class can hold, and 1H weapons (generic rule only). */
  const classOffhands = (cls) => classTypes(cls, WOFF);
  const class1H = (cls) => classTypes(cls, W1H);
  const listOr = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(", ") + " or " + xs[xs.length - 1] : xs[0] || "");
  const weaponRuleCache = new Map();
  /** The class's weapon rule, limited to the item types that class can use. */
  function weaponRule(cls) {
    if (weaponRuleCache.has(cls) && Engine.codex) return weaponRuleCache.get(cls);
    const base = WEAPON_RULES[cls] || WEAPON_RULES.any;
    if (!cls || !Engine.codex) return base;
    const rule = { ...base, fits: (t) => (typeAllowed(t, cls) ? base.fits(t) : null) };
    if (base === WEAPON_RULES.any) {
      const n = (ts) => ts.map((t) => TYPE_NAMES[t]);
      const one = class1H(cls), off = classOffhands(cls), two = classTypes(cls, W2H);
      rule.text = `${cls}: a ${listOr(n(two))}` + (one.length ? `, or a ${listOr(n(one))}${off.length ? ` and a ${listOr(n(off))}` : ""}` : "");
      if (!off.length) rule.slots = { main: base.slots.main };
    }
    weaponRuleCache.set(cls, rule);
    return rule;
  }

  /** Place weapons in priority order. Returns { slot: key } and the keys that don't fit. */
  function fitWeapons(keys, cls) {
    const rule = weaponRule(cls), used = {}, unfit = [];
    for (const k of keys) {
      const choices = rule.fits(state.byId.get(k).raw.typeId) || [];
      const pick = choices.find((set) => set.every((sl) => !used[sl]));
      if (pick) pick.forEach((sl) => (used[sl] = k)); else unfit.push(k);
    }
    return { used, unfit };
  }

  let toastTimer = 0;
  /** Brief message at the bottom; with action = [label, fn] it gets a button (e.g. UNDO) and stays a little longer. */
  function toast(msg, action) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast mono"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg;
    if (action) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "toast__btn mono"; b.textContent = action[0];
      b.addEventListener("click", () => { el.hidden = true; action[1](); });
      el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), action ? 8000 : 5000);
  }

  /* ---------- Gear slots and the Talisman ----------
   * Gear: 1 each of Helm, Chest, Gloves, Pants, Boots, Amulet, and 2 Rings (weapons: WEAPON_RULES).
   * Talisman: a seal in the centre unlocks charm slots (max 6). A unique with a charm version can sit in
   * a charm slot instead of its gear slot; as a charm it carries only its unique power.
   */
  const GEAR_LIMIT = { Helm: 1, Chest: 1, Gloves: 1, Pants: 1, Boots: 1, Amulet: 1, Ring: 2 };
  // [label, charm slots, { uniques: unique charms allowed, setReduce: fewer charms per set tier, item: seal item id }]
  // Mythic seal powers from Talisman_SealAffix_Ancestral_0N: Diamond Mind -1 charm per set bonus (min 2),
  // Golden Epiphany 3 unique charms, Severed Finger 2 unique charms but at most 5 slots. Others allow 1.
  const SEALS = {
    magic: ["Magic seal", 3, { uniques: 1, icon: "Talisman_Seal_Magic" }],
    rare: ["Rare seal", 4, { uniques: 1, icon: "Talisman_Seal_Rare" }],
    legendary: ["Legendary seal", 5, { uniques: 1, icon: "Talisman_Seal_Legendary" }],
    legendary6: ["Legendary seal + extra charm slot", 6, { uniques: 1, icon: "Talisman_Seal_Legendary" }],
    annihilus: ["Annihilus (Season 15)", 6, { uniques: 1, item: "S15_Charm_Unique_Annihilus" }],
    mythic1: ["Seal of the Diamond Mind (Mythic)", 6, { uniques: 1, setReduce: 1, item: "Talisman_Seal_MythicUnique_03" }],
    mythic2: ["Seal of the Golden Epiphany (Mythic)", 6, { uniques: 3, item: "Talisman_Seal_MythicUnique_02" }],
    mythic3: ["Seal of the Severed Finger (Mythic)", 5, { uniques: 2, item: "Talisman_Seal_MythicUnique_01" }],
  };
  const sealOf = () => SEALS[state.sandbox.seal] || SEALS.legendary;
  // Hellfire Torch (S15 Mythic charm): a unique charm that also grants +1 Unique Charm (Unique_Charm_Count_Bonus).
  const TORCH_ID = "S15_Charm_Unique_HellfireTorch";
  const codexItem = (id) => Engine.codex.items.find((x) => x.id === id);
  const uniqueCount = () => state.sandbox.charms.length + (state.sandbox.torch ? 1 : 0);
  const uniqueLimit = () => sealOf()[2].uniques + (state.sandbox.torch ? 1 : 0);
  /** Room for one more unique charm: a free slot and under the seal's unique charm limit. */
  const uniqueRoom = () => talismanUsed() < charmSlots() && uniqueCount() < uniqueLimit();
  const setNeed = (n) => Math.max(2, n - (sealOf()[2].setReduce || 0));
  const charmSlots = () => sealOf()[1];
  let charmIdx = null;
  /** The charm version of a unique (same name, Talisman_Charm_*): unique power only. */
  function charmOf(r) {
    if (!charmIdx) {
      charmIdx = new Map();
      for (const it of Engine.codex.items) if (it.charm && it.power) charmIdx.set(it.name, it);
    }
    return r && r.kind === "item" ? charmIdx.get(r.name) || null : null;
  }
  const isCharm = (k) => state.sandbox.charms.includes(k);
  /** Charm slots in use: unique charms + set charms. */
  const talismanUsed = () => state.sandbox.charms.length + state.sandbox.sets.length + (state.sandbox.torch ? 1 : 0);

  /* Set charms: 5 types per set (Phoba, Fer, Mlor, Linta, Berú); bonuses at 2 / 3 / 5 different types.
   * Each set charm rolls 2 affixes from the charm pool (skill ranks, experience, resistances...). */
  let setIdx = null;
  function talismanIdx() {
    if (!setIdx) {
      const t = Engine.codex.talisman || { sets: [], pool: [] };
      setIdx = { sets: t.sets, pool: t.pool, piece: new Map() };
      for (const st of t.sets) for (const p of st.pieces) setIdx.piece.set(p.id, { ...p, set: st });
    }
    return setIdx;
  }
  /** Pool affixes a charm for `cls` can roll ("" = any class): generic ones + that class's. */
  function poolFor(cls) {
    return talismanIdx().pool.filter((id) => {
      const c = (Engine.codex.affixes[id] || {}).c || [];
      return !c.length || !cls || c.includes(cls);
    });
  }
  const plainAffix = (id) => Engine.renderAffix(id, { t: state.sandbox.t, rank: 1, ip: 850 }).map((l) => l.plain).join(" · ");
  const isGear = (r) => r && r.kind === "item" && GEAR_LIMIT[r.slot] != null;

  function unpinQuiet(keys) {
    state.pins = state.pins.filter((k) => !keys.includes(k));
    state.sandbox.charms = state.sandbox.charms.filter((k) => !keys.includes(k));
    document.querySelectorAll(".pin[data-pin]").forEach((b) => {
      if (keys.includes(b.dataset.pin)) { b.setAttribute("aria-pressed", "false"); b.textContent = "+"; b.title = "Add to Theorycraft Sandbox"; }
    });
  }

  /** Items pushed out of their gear slot: into the Talisman when they have a charm and there's room, else unequipped. */
  function displace(keys, why) {
    const toCharm = [], gone = [];
    for (const k of keys) {
      if (charmOf(state.byId.get(k)) && uniqueRoom()) { state.sandbox.charms.push(k); toCharm.push(k); }
      else gone.push(k);
    }
    unpinQuiet(gone);
    const names = (ks) => ks.map((k) => state.byId.get(k).name).join(", ");
    const msg = [toCharm.length ? `Moved ${names(toCharm)} to the Talisman as a charm` : "", gone.length ? `Unequipped ${names(gone)}` : ""].filter(Boolean).join(". ");
    if (msg) toast(`${msg}: ${why}.`);
  }

  /** Put `key` in its gear or weapon slot. preferCharm: if that slot is full, try the Talisman first. */
  /** Why a record can't join the Sandbox build: its class tags (fUsableByClass) exclude the build's class
   * (the Class setting, or in Auto the class the other items imply). null when it fits. */
  function classBlock(r, cls = sandboxClass()) {
    if (!r || !cls || !r.classes.length || r.classes.includes(cls)) return null;
    const what = r.kind === "aspect" ? "aspect" : r.slot ? r.slot.replace(/Weapon|Helm|Chest|Gloves|Pants|Boots|Amulet|Ring|Off-Hand/, (m) => m.toLowerCase()) : "item";
    return `${r.name} is a ${r.classLabel} ${what}: it can't go in a ${cls} build.${state.sandbox.cls ? "" : " (Class is Auto: set it to start a different class.)"}`;
  }

  function equip(key, preferCharm) {
    const r = state.byId.get(key);
    const blocked = classBlock(r);
    if (blocked) { toast(blocked); return false; }
    if (isWeapon(r)) {
      const current = sandboxClass();
      const cls = current || sandboxClass([...state.pins, key]);
      const rule = weaponRule(cls);
      if (!rule.fits(r.raw.typeId)) { toast(`${r.name} can't be equipped: ${rule.text}.`); return false; }
      const others = state.pins.filter((k) => k !== key && !isCharm(k) && isWeapon(state.byId.get(k))).reverse();
      const { unfit } = fitWeapons([key, ...others], cls);
      if (unfit.length && preferCharm && charmOf(r) && uniqueRoom()) {
        state.sandbox.charms.push(key);
        toast(`${r.name} went to the Talisman as a charm: ${rule.text}.`);
        return true;
      }
      if (unfit.length) displace(unfit, rule.text);
      return true;
    }
    if (isGear(r)) {
      const legs = Object.keys(state.sandbox.leg).filter((sp) => sp.startsWith(`g:${r.slot}:`));
      const limit = GEAR_LIMIT[r.slot] - legs.length;
      const inSlot = state.pins.filter((k) => k !== key && !isCharm(k) && (state.byId.get(k) || {}).slot === r.slot);
      if (inSlot.length < limit) return true;
      if (legs.length && !(preferCharm && charmOf(r) && uniqueRoom())) {
        const sp = legs[legs.length - 1], a = state.byId.get(state.sandbox.leg[sp].a);
        delete state.sandbox.leg[sp];
        toast(`Replaced the legendary ${r.slot}${a ? " (" + a.name + ")" : ""} with ${r.name}.`);
        return true;
      }
      if (preferCharm && charmOf(r) && uniqueRoom()) {
        state.sandbox.charms.push(key);
        toast(`${r.name} went to the Talisman as a charm (${r.slot} slot taken).`);
        return true;
      }
      displace(inSlot.slice(0, inSlot.length - limit + 1), `only ${limit} ${r.slot}${limit > 1 ? "s" : ""} can be equipped`);
    }
    return true;
  }

  /* ---------- Build editor: slots, picker ---------- */

  /* Legendary items: a non-unique slot holding a legendary with an imprinted aspect.
   * state.sandbox.leg = { "<slot spec>": { a: aspect record key, two: 2H (generic main hand only) } }. */
  const INHERENT_2H = new Set(["w:blunt", "w:slash", "w:ranged"]);
  /** Generic-rule classes with no 1H weapons (Spiritborn): the main hand is always 2H. */
  const only2H = () => { const c = sandboxClass(); return Boolean(c && !WEAPON_RULES[c] && Engine.codex && !class1H(c).length); };

  /* ---------- Sockets: gems and runes ----------
   * Sockets per slot (game rules): Helm, Chest, Pants and 2H weapons 2; 1H weapons, off-hands, Amulet and
   * Rings 1; Gloves and Boots none. A gem's effect depends on the socket target (codex.gems, from
   * ptSocketedEffects): 0 weapon, 1 armor, 2 jewelry. Off-hands follow their item type (focus, totem, book:
   * weapon; shield: armor). Runes: one Ritual + one Invocation in a 2-socket item make a runeword.
   * state.sandbox.sock: { slot spec: ["g:Ruby" | "r:<rune id>" | "", …] }, gem quality state.sandbox.gt (1-9). */
  const GEM_TARGETS = ["Weapon", "Armor", "Jewelry"];
  const gemTypes = () => ((Engine.codex && Engine.codex.gems) || {}).types || [];
  function gemOf(type) {
    const t = gemTypes().find((x) => x.type === type);
    if (!t) return null;
    if (t.tiers.length === 1) return t.tiers[0];
    return t.tiers.find((x) => x.id.endsWith("_0" + state.sandbox.gt)) || t.tiers[t.tiers.length - 1];
  }
  const runeById = (id) => ((Engine.codex.runes || {}).runes || []).find((r) => r.id === id);
  /** Sockets on a build slot: { n, target } (n 0 when the slot is empty or can't hold sockets). */
  function socketInfo(spec, L) {
    const [kind, a, b] = spec.split(":");
    const leg = state.sandbox.leg[spec];
    if (kind === "g") {
      if (!L.gear[a] || (!L.gear[a][+b] && !leg)) return { n: 0 };
      return { n: { Helm: 2, Chest: 2, Pants: 2, Amulet: 1, Ring: 1 }[a] || 0, target: a === "Amulet" || a === "Ring" ? 2 : 1 };
    }
    const k = L.weapons[a];
    const twoHand = Boolean(k) && Object.values(L.weapons).filter((x) => x === k).length > 1;
    if (twoHand && a !== "main") return { n: 0 };
    if (!k && !leg) return { n: 0 };
    const cls = sandboxClass();
    const is2H = twoHand || INHERENT_2H.has(spec) || (leg && leg.two) || (a === "main" && only2H())
      || (k && W2H.has(state.byId.get(k).raw.typeId));
    let target = 0;
    if (a === "off") {
      const t = k && Engine.codex.itemTypes[state.byId.get(k).raw.typeId];
      target = t ? (t.g ?? 0) : (cls && classOffhands(cls).every((x) => /Shield/.test(x)) ? 1 : 0);
    }
    return { n: is2H ? 2 : 1, target };
  }
  /** The slot's socket contents, trimmed to its socket count. */
  function socketsOf(spec, L) {
    const { n } = socketInfo(spec, L);
    const cur = (state.sandbox.sock[spec] || []).slice(0, n);
    while (cur.length < n) cur.push("");
    return cur;
  }
  /** One socket's effect line(s) for a target. */
  function socketLine(v, target) {
    if (v.startsWith("g:")) { const g = gemOf(v.slice(2)); return g ? { name: g.name, ic: g.ic, text: g.eff[target] || "" } : null; }
    if (v.startsWith("r:")) { const r = runeById(v.slice(2)); return r ? { name: `${r.name} (${r.kind})`, ic: r.ic, rune: r } : null; }
    return null;
  }
  function gemTooltip(type, target) {
    const t = gemTypes().find((x) => x.type === type), g = gemOf(type);
    if (!g) return null;
    const lines = [0, 1, 2].map((i) => `<li class="${target === i ? "tt__set-on" : target == null ? "" : "tt__set-off"}"><span class="mono">${GEM_TARGETS[i].toUpperCase()}</span> ${Engine.renderText(g.eff[i] || "").html}</li>`).join("");
    return `<div class="tt__head">${g.ic ? `<span class="ico-well ico-well--tt">${itemIcon(g.ic)}</span>` : ""}<div class="tt__title"><p class="tt__name">${esc(g.name)}</p><p class="tt__type">Gem${t.tiers.length > 1 ? "" : " · Mythic"}</p></div></div>
      <div class="tt__body"><ul class="tt__lines tt__lines--set">${lines}</ul></div>
      <dl class="tt__foot"><dt>SOCKET</dt><dd>The effect depends on the item: weapon, armor or jewelry${target != null ? ` (this one: ${GEM_TARGETS[target].toLowerCase()})` : ""}</dd><dt>ID</dt><dd>${esc(g.id)}</dd></dl>`;
  }
  function runeTooltip(id) {
    const r = runeById(id);
    if (!r) return null;
    return `<div class="tt__head">${r.ic ? `<span class="ico-well ico-well--tt">${itemIcon(r.ic)}</span>` : ""}<div class="tt__title"><p class="tt__name">${esc(r.name)}</p><p class="tt__type">${esc(r.rarity)} Rune of ${esc(r.kind)}${r.season ? " · " + esc(r.season) : ""}</p></div></div>
      <div class="tt__body"><ul class="tt__lines"><li>${Engine.renderText(r.t || "").html}</li></ul></div>
      <dl class="tt__foot"><dt>OFFERING</dt><dd>${r.kind === "Ritual" ? `Gains ${r.offering}` : `Needs ${r.offering}${r.cd ? `, ${r.cd}s cooldown` : ""}`}</dd><dt>RUNEWORD</dt><dd>One Ritual + one Invocation in a 2-socket Helm, Chest, Pants or 2H weapon</dd></dl>`;
  }
  /** Aspect slot bonus for a legendary in `spec`: amulet x1.5, 2H weapon x2. */
  function legBonusSlot(spec, e) {
    if (spec.startsWith("g:Amulet")) return "amulet";
    if (INHERENT_2H.has(spec) || (spec === "w:main" && ((e && e.two) || only2H()))) return "2h";
    return null;
  }
  /** Which aspect slot (ASPECT_SLOTS_ORDER) a slot spec accepts. */
  function legAspectSlots(spec) {
    if (spec.startsWith("g:")) return [spec.split(":")[1]];
    if (spec === "w:off" && !["Barbarian", "Rogue"].includes(sandboxClass())) {
      // Shields take shield aspects; a focus, book or totem counts as a weapon (item label 0).
      const off = classOffhands(sandboxClass()), T = Engine.codex.itemTypes || {};
      const out = [];
      if (off.includes("Shield")) out.push("Shield");
      if (off.some((t) => T[t] && T[t].w)) out.push("Weapon");
      return out.length ? out : ["Shield", "Weapon"];
    }
    return ["Weapon"];
  }
  function renderLegAspect(key, spec) {
    const r = state.byId.get(key), e = state.sandbox.leg[spec];
    if (!r) return null;
    const world = { t: state.sandbox.t, rank: state.sandbox.rank, ip: state.sandbox.ip || Engine.DEFAULT_IP, slotBonus: aspectSlotBonus(legBonusSlot(spec, e)) };
    return { power: Engine.renderAffix(r.id, world)[0] || null, imp: [], stats: [], mythicLines: [], crafted: false };
  }
  const slotNameOf = (spec) => (spec.startsWith("g:") ? spec.split(":")[1] + (spec.startsWith("g:Ring") ? " " + (+spec.split(":")[2] + 1) : "")
    : (weaponRule(sandboxClass()).slots[spec.slice(2)] || spec.slice(2)));

  /** Which pinned item is in which slot: { weapons: {slot: key}, unfitWeapons, gear: {Helm: [keys]}, overGear }. */
  function sbLayout() {
    const cls = sandboxClass();
    const weapons = state.pins.filter((k) => !isCharm(k) && isWeapon(state.byId.get(k)));
    const { used, unfit } = fitWeapons(weapons, cls);
    const gear = {}, overGear = [], leg = state.sandbox.leg;
    for (const slot of Object.keys(GEAR_LIMIT)) {
      // Uniques fill the slots that don't hold a legendary (aspect) item.
      const ks = state.pins.filter((k) => !isCharm(k) && (state.byId.get(k) || {}).slot === slot);
      gear[slot] = Array.from({ length: GEAR_LIMIT[slot] }, (_, i) => (leg[`g:${slot}:${i}`] ? null : ks.shift() || null));
      overGear.push(...ks);
    }
    return { weapons: used, unfitWeapons: unfit, gear, overGear };
  }

  const classOk = (r, cls) => !cls || !r.classes.length || r.classes.includes(cls);

  /** Candidates for a slot spec: "w:<slot>", "g:<Slot>:<i>", "c:<i>" (charm), "aspect". */
  function pickCandidates(spec) {
    if (spec.startsWith("s|")) {
      const [, slot] = spec.split("|"), L = sbLayout(), { n, target } = socketInfo(slot, L);
      const gems = gemTypes().map((t) => { const g = gemOf(t.type); return { value: "g:" + t.type, name: g.name, sub: `Gem · ${GEM_TARGETS[target]}: ${Engine.renderText(g.eff[target] || "").plain}`, icon: g.ic, rarity: t.tiers.length > 1 ? "gem" : "mythic", tip: `gem:${t.type}|${target}` }; });
      const runes = n === 2 ? ((Engine.codex.runes || {}).runes || []).filter((r) => !r.legacy).map((r) => ({ value: "r:" + r.id, name: r.name, sub: `Rune of ${r.kind} · ${r.kind === "Ritual" ? "+" : "needs "}${r.offering} Offering · ${Engine.renderText(r.t || "").plain}`, icon: r.ic, rarity: "rune", tip: "rune:" + r.id })) : [];
      return [{ value: "x", name: "Empty socket", sub: "Remove what's in this socket", icon: "", rarity: "common" }, ...gems, ...runes];
    }
    const cls = sandboxClass();
    const [kind, a] = spec.split(":");
    const item = (r, sub) => ({ value: r.key, name: r.name, sub, icon: r.icon, rarity: rarityClass(r.rarity) });
    const legOpts = () => {
      const want = legAspectSlots(spec), bonus = legBonusSlot(spec, null);
      const what = spec.startsWith("g:") ? a : spec === "w:off" ? (cls && !WEAPON_RULES[cls] ? listOr(classOffhands(cls).map((t) => TYPE_NAMES[t])) || "off-hand" : "off-hand") : bonus === "2h" ? "2H weapon" : "weapon";
      return state.records.filter((r) => r.kind === "aspect" && classOk(r, cls) && (r.aslots || []).some((x) => want.includes(x)))
        .map((r) => ({ value: "L:" + r.key, name: r.name, sub: `Legendary ${what} with this aspect · ${(r.cats || []).join(" / ")}${bonus === "amulet" ? " · ×1.5" : bonus === "2h" ? " · ×2" : ""}`, icon: "", rarity: "legendary", tip: "legpick:" + spec + "|" + r.key }));
    };
    if (kind === "w") {
      const rule = weaponRule(cls);
      // A 2H fills both hands: list it under the main hand only, not the off-hand.
      return [...state.records.filter((r) => r.kind === "item" && isWeapon(r) && classOk(r, cls) && (rule.fits(r.raw.typeId) || []).some((set) => set.includes(a) && !(a === "off" && set.includes("main"))))
        .map((r) => item(r, `${r.rarity} ${r.type}${r.classes.length ? " · " + r.classLabel : ""}`)), ...legOpts()];
    }
    if (kind === "g") {
      return [...state.records.filter((r) => r.kind === "item" && r.slot === a && classOk(r, cls))
        .map((r) => item(r, `${r.rarity} ${r.type}${r.classes.length ? " · " + r.classLabel : ""}`)), ...legOpts()];
    }
    if (kind === "c") {
      const T = talismanIdx();
      const sets = T.sets.filter((st) => !cls || !st.c.length || st.c.includes(cls));
      const torch = codexItem(TORCH_ID);
      return [
        ...(torch && !state.sandbox.torch ? [{ value: "t:torch", name: torch.name, sub: "Mythic charm (Season 15): +1 Unique Charm, All Stats, All Resistance, +All Skills", icon: torch.ic, rarity: "mythic" }] : []),
        ...sets.flatMap((st) => st.pieces.map((p) => ({ value: "s:" + p.id, name: p.name, sub: `Set charm · ${st.name} · ${p.type}${st.c.length === 1 ? " · " + st.c[0] : ""}`, icon: p.ic, rarity: "set" }))),
        ...state.records.filter((r) => r.kind === "item" && charmOf(r) && classOk(r, cls))
          .map((r) => ({ value: "u:" + r.key, name: r.name, sub: `Unique charm (${r.slot}): unique power only`, icon: r.icon, rarity: rarityClass(r.rarity) })),
      ];
    }
    return state.records.filter((r) => r.kind === "aspect" && classOk(r, cls)).map((r) => item(r, `Legendary Aspect · ${r.classLabel}`));
  }

  function syncPinButtons() {
    const cls = sandboxClass();
    document.querySelectorAll(".pin[data-pin]").forEach((b) => {
      const on = state.pins.includes(b.dataset.pin);
      const blocked = !on && classBlock(state.byId.get(b.dataset.pin), cls);
      b.setAttribute("aria-pressed", String(on));
      b.classList.toggle("pin--blocked", Boolean(blocked));
      b.textContent = on ? "✓" : blocked ? "⊘" : "+";
      b.title = blocked || `${on ? "Remove from" : "Add to"} Theorycraft Sandbox`;
    });
  }

  /** Remove `old` keys and put `key` where the first of them was (keeps slot order), else at the end. */
  function replacePins(old, key) {
    const pos = Math.min(...old.map((k) => state.pins.indexOf(k)).filter((i) => i >= 0), Infinity);
    state.pins = state.pins.filter((k) => k !== key && !old.includes(k));
    state.sandbox.charms = state.sandbox.charms.filter((k) => k !== key && !old.includes(k));
    if (Number.isFinite(pos)) state.pins.splice(Math.min(pos, state.pins.length), 0, key); else state.pins.push(key);
  }

  /** Talisman slot order: Hellfire Torch, unique charms, set charms. */
  const talismanOccupants = () => [...(state.sandbox.torch ? [{ torch: true }] : []), ...state.sandbox.charms.map((k) => ({ k })), ...state.sandbox.sets.map((x) => ({ x }))];

  function applyPick(spec, value) {
    if (spec.startsWith("s|")) {
      const [, slot, i] = spec.split("|"), L = sbLayout();
      const cur = socketsOf(slot, L);
      cur[+i] = value === "x" ? "" : value;
      state.sandbox.sock[slot] = cur;
      if (!cur.some(Boolean)) delete state.sandbox.sock[slot];
      saveSandbox(); renderSandbox();
      return;
    }
    const [kind, a, b] = spec.split(":");
    const L = sbLayout();
    const leg = state.sandbox.leg;
    const pickedKey = value.startsWith("L:") || value.startsWith("u:") ? value.slice(2) : value;
    const blocked = state.byId.has(pickedKey) && classBlock(state.byId.get(pickedKey));
    if (blocked) { toast(blocked); return; }
    if (value.startsWith("L:") && (kind === "g" || kind === "w")) {
      // Legendary item with an aspect: clear the unique(s) in that slot.
      const key = value.slice(2);
      if (kind === "g") {
        const occ = L.gear[a][+b];
        if (occ) unpinQuiet([occ]);
      } else {
        const occ = [L.weapons[a]];
        if (a === "off") { if (leg["w:main"]) leg["w:main"].two = false; }
        if (a === "main" && L.weapons.main && L.weapons.main === L.weapons.off) occ.push(L.weapons.off);
        unpinQuiet(occ.filter(Boolean));
      }
      leg[spec] = { a: key, two: INHERENT_2H.has(spec) };
    } else if (kind === "g") {
      const occ = L.gear[a][+b];
      delete leg[spec];
      if (occ !== value) replacePins(occ ? [occ] : [], value);
    } else if (kind === "w") {
      const r = state.byId.get(value), cls = sandboxClass();
      if (cls && r.classes.length && !r.classes.includes(cls)) { toast(`${r.name} can't be equipped by a ${cls}.`); return; }
      const choice = (weaponRule(cls).fits(r.raw.typeId) || []).find((set) => set.includes(a)) || [a];
      replacePins([...new Set(choice.map((sl) => L.weapons[sl]).filter(Boolean))], value);
      for (const sl of choice) delete leg["w:" + sl];
      if (a === "off" && leg["w:main"]) leg["w:main"].two = false;
    } else if (kind === "c") {
      const i = +a, occ = talismanOccupants()[i];
      if (occ && occ.torch) state.sandbox.torch = false;
      if (occ && occ.k) { state.sandbox.charms = state.sandbox.charms.filter((k) => k !== occ.k); state.pins = state.pins.filter((k) => k !== occ.k); }
      if (occ && occ.x) state.sandbox.sets.splice(state.sandbox.sets.indexOf(occ.x), 1);
      const isUnique = !value.startsWith("s:");
      if (talismanUsed() >= charmSlots()) toast(`The Talisman is full (${charmSlots()} charm slots).`);
      else if (value === "t:torch") {
        if (uniqueCount() >= uniqueLimit() + 1) toast(`Only ${uniqueLimit()} unique charms with a ${sealOf()[0]}.`);
        else state.sandbox.torch = true;
      } else if (isUnique && !uniqueRoom()) toast(`Only ${uniqueLimit()} unique charm${uniqueLimit() > 1 ? "s" : ""} with a ${sealOf()[0]}${state.sandbox.torch ? " and the Hellfire Torch" : ""}. A Seal of the Golden Epiphany allows 3, the Severed Finger 2, the Hellfire Torch +1.`);
      else if (value.startsWith("s:")) state.sandbox.sets.push({ p: value.slice(2), a: ["", ""] });
      else {
        const key = value.slice(2);
        if (!state.pins.includes(key)) state.pins.push(key);
        if (!state.sandbox.charms.includes(key)) state.sandbox.charms.push(key);
      }
    } else if (kind === "aspect" && !state.pins.includes(value)) state.pins.push(value);
    savePins(); saveSandbox(); syncPinButtons(); renderSandbox();
  }

  /** Tooltip key for a picker value: record keys as-is, u:<key> → charm:<key>, s:<piece> → piece:<piece>, t:torch → torch. */
  const pickTipKey = (v) => (v.startsWith("u:") ? "charm:" + v.slice(2) : v.startsWith("s:") ? "piece:" + v.slice(2) : v === "t:torch" ? "torch" : v);

  const PICK_TITLES = { aspect: "Add a legendary aspect" };
  let pickerSpec = "";
  function openPicker(spec, label) {
    let el = document.getElementById("picker");
    if (!el) {
      el = document.createElement("div");
      el.id = "picker"; el.className = "picker"; el.hidden = true;
      el.innerHTML = `<div class="picker__panel" role="dialog" aria-modal="true" aria-labelledby="picker-title">
        <div class="picker__head"><h3 id="picker-title" class="picker__title"></h3><button type="button" class="btn btn--ghost mono" data-pclose aria-label="Close">×</button></div>
        <input class="input mono picker__search" type="search" placeholder="search name, set, type…" aria-label="Search">
        <ul class="picker__list" role="listbox"></ul></div>`;
      document.body.appendChild(el);
      const list = el.querySelector(".picker__list"), search = el.querySelector(".picker__search");
      const draw = () => {
        const q = search.value.trim().toLowerCase();
        const all = el._items || [];
        const hits = (q ? all.filter((c) => (c.name + " " + c.sub).toLowerCase().includes(q)) : all).slice(0, 800);
        list.innerHTML = hits.length ? hits.map((c) => `<li><button type="button" class="picker__item picker__item--${esc(c.rarity)}" data-pval="${esc(c.value)}" data-key="${esc(c.tip || pickTipKey(c.value))}">
            <span class="picker__ico">${itemIcon(c.icon)}</span><span class="picker__text"><span class="picker__name">${esc(c.name)}</span><span class="picker__sub">${esc(c.sub)}</span></span></button></li>`).join("")
          : `<li class="hint" style="padding:12px">Nothing fits this slot${sandboxClass() ? " for a " + esc(sandboxClass()) : ""}.</li>`;
      };
      el._draw = draw;
      search.addEventListener("input", draw);
      el.addEventListener("click", (e) => {
        const v = e.target.closest("[data-pval]");
        if (v) { closePicker(); applyPick(pickerSpec, v.dataset.pval); return; }
        if (e.target === el || e.target.closest("[data-pclose]")) closePicker();
      });
      el.addEventListener("keydown", (e) => { if (e.key === "Escape") closePicker(); });
    }
    hideTooltip();
    pickerSpec = spec;
    el._items = pickCandidates(spec);
    if (!spec.startsWith("s|")) el._items.sort((x, y) => x.name.localeCompare(y.name));
    el.querySelector(".picker__title").textContent = PICK_TITLES[spec] || `Choose: ${label}`;
    const search = el.querySelector(".picker__search");
    search.value = "";
    el._draw();
    el.hidden = false;
    search.focus();
  }
  function closePicker() {
    const el = document.getElementById("picker");
    if (el) el.hidden = true;
    hideTooltip();
  }

  function togglePin(key) {
    const i = state.pins.indexOf(key);
    if (i >= 0) { state.pins.splice(i, 1); state.sandbox.charms = state.sandbox.charms.filter((k) => k !== key); saveSandbox(); }
    else if (equip(key, true)) { state.pins.push(key); saveSandbox(); }
    savePins();
    syncPinButtons();
    if (!els.viewSandbox.hidden) renderSandbox();
  }

  function renderedAt(r, world) {
    if (r.kind === "aspect") {
      const slotBonus = aspectSlotBonus(state.sandbox.slot[r.key]);
      return { power: Engine.renderAffix(r.id, { ...world, slotBonus })[0] || null, imp: [], stats: [], mythicLines: [], crafted: false };
    }
    if (isCharm(r.key) && charmOf(r)) return renderItem(charmOf(r), world, false); // charm: unique power only
    return renderItem(r.raw, world, state.sandbox.mythic.includes(r.key) && canCraftMythic(r));
  }

  const rawCache = new Map(); // key -> rendered raw-files HTML

  function renderSandbox() {
    fillQuickAdd();
    syncPinButtons();
    const { t, rank } = state.sandbox;
    const ip = state.sandbox.ip || Engine.DEFAULT_IP;
    const openRaw = new Set([...els.sbList.querySelectorAll("details[data-raw][open]")].map((d) => d.dataset.raw));
    els.sbRoll.value = Math.round(t * 100);
    els.sbRank.value = rank;
    els.sbRollOut.textContent = `${Math.round(t * 100)}%`;
    els.sbRankOut.textContent = rank;
    els.sbIp.value = ip;
    els.sbIpOut.textContent = ip;
    if (!els.sbClass.options.length) {
      els.sbClass.innerHTML = `<option value="">Auto</option>` + Engine.codex.meta.classes.slice().sort().map((c) => `<option>${esc(c)}</option>`).join("");
    }
    els.sbClass.value = state.sandbox.cls || "";
    const auto = !state.sandbox.cls && sandboxClass();
    els.sbClass.options[0].textContent = auto ? `Auto (${auto})` : "Auto";

    // Only 1 crafted Mythic can be equipped; dropped Iconic Mythics and bought random Mythics don't count.
    const craftedN = state.pins.filter((k) => !isCharm(k) && state.sandbox.mythic.includes(k) && canCraftMythic(state.byId.get(k) || {})).length;
    const limitNote = craftedN > 1
      ? `<p class="sb-note mono">${craftedN} CRAFTED MYTHICS // only 1 can be equipped at a time. Iconic Mythics (boss drops) and random Mythics from the Blacksmith or Jeweler don't count toward the limit.</p>`
      : "";
    const cls = sandboxClass();
    const rule = weaponRule(cls);
    const L = sbLayout();
    const cell = (slot, label, k, extra = "", emptyText = "choose…") => {
      const r = k && state.byId.get(k);
      const tkey = r ? (isCharm(k) ? "charm:" + k : k) : "";
      return `<div class="sb-cell${r ? " sb-cell--" + rarityClass(shownRarity(r, { crafted: !isCharm(k) && state.sandbox.mythic.includes(k) && canCraftMythic(r) })) : " sb-cell--empty"}"${tkey ? ` data-key="${esc(tkey)}"` : ""}>
        <button type="button" class="sb-cell__pick" data-pick="${esc(slot)}" title="${r ? "Change" : "Choose"} ${esc(label)}">
          <span class="sb-cell__ico">${r && r.icon ? itemIcon(r.icon) : '<span class="sb-cell__plus" aria-hidden="true">+</span>'}</span>
          <span class="sb-cell__text"><span class="sb-cell__label mono">${esc(label)}${extra}</span><span class="sb-cell__name">${r ? esc(r.name) : esc(emptyText)}</span></span>
        </button>
        ${r ? `<button type="button" class="sb-cell__clear" data-unpin="${esc(k)}" aria-label="Remove ${esc(r.name)}" title="Remove">×</button>` : ""}
      </div>`;
    };

    // A legendary item (non-unique) holding an imprinted aspect.
    const legCell = (spec, label) => {
      const e = state.sandbox.leg[spec], r = e && state.byId.get(e.a);
      if (!r) return null;
      const bonus = legBonusSlot(spec, e);
      const toggle2h = spec === "w:main" && !INHERENT_2H.has(spec) && !WEAPON_RULES[cls] && !only2H()
        ? `<button type="button" class="sb-cell__toggle mono" data-leg2h="${spec}" aria-pressed="${Boolean(e.two)}" title="Two-handed weapon: aspect ×2, no off-hand">2H</button>` : "";
      return `<div class="sb-cell sb-cell--legendary" data-key="leg:${esc(spec)}">
        <button type="button" class="sb-cell__pick" data-pick="${esc(spec)}" title="Change ${esc(label)}">
          <span class="sb-cell__ico"><span class="sb-cell__plus" aria-hidden="true">◈</span></span>
          <span class="sb-cell__text"><span class="sb-cell__label mono">${esc(label)}${(e.two || only2H()) && spec === "w:main" ? " (2H)" : ""} · Legendary${bonus === "amulet" ? " ×1.5" : bonus === "2h" ? " ×2" : ""}</span><span class="sb-cell__name">${esc(r.name)}</span></span></button>
        ${toggle2h}<button type="button" class="sb-cell__clear" data-legremove="${esc(spec)}" aria-label="Remove ${esc(r.name)}" title="Remove">×</button></div>`;
    };
    // Weapons (class rules), armor, jewelry.
    const mainLeg2h = state.sandbox.leg["w:main"] && state.sandbox.leg["w:main"].two && !L.weapons.main;
    const wCells = Object.entries(rule.slots).map(([sl, label]) => {
      const k = L.weapons[sl];
      const twoHand = k && Object.entries(L.weapons).filter(([, x]) => x === k).length > 1;
      // The off-hand stays clickable under a 2H: picking a 1H or off-hand there swaps the 2H out.
      if ((twoHand || (mainLeg2h && !WEAPON_RULES[cls])) && sl !== "main") return cell("w:" + sl, label, null, "", "held by the 2H weapon");
      if (!k) { const lc = legCell("w:" + sl, label); if (lc) return lc; }
      return cell("w:" + sl, twoHand ? `${label} (2H)` : label, k);
    }).join("");
    const gCells = Object.entries(GEAR_LIMIT).flatMap(([slot, n]) =>
      Array.from({ length: n }, (_, i) => {
        const spec = `g:${slot}:${i}`, label = n > 1 ? `${slot} ${i + 1}` : slot;
        return (!L.gear[slot][i] && legCell(spec, label)) || cell(spec, label, L.gear[slot][i]);
      })).join("");
    const overflow = [...L.unfitWeapons, ...L.overGear];

    // Paperdoll: the game's slot frames and empty-slot icons around an original class figure.
    // Panel units 600×860: armor down the left, jewelry down the right, weapons along the bottom.
    const PD = Engine.codex.paperdoll || {};
    const slotData = (spec, label, k, blocked) => {
      if (blocked) return { blocked: true, label };
      if (!k) {
        const e = state.sandbox.leg[spec], r = e && state.byId.get(e.a);
        if (r) {
          const bonus = legBonusSlot(spec, e);
          const t2 = spec === "w:main" && !INHERENT_2H.has(spec) && !WEAPON_RULES[cls] && !only2H()
            ? `<button type="button" class="sb-cell__toggle mono pd__toggle" data-leg2h="${spec}" aria-pressed="${Boolean(e.two)}" title="Two-handed weapon: aspect ×2, no off-hand">2H</button>` : "";
          return { label, key: "leg:" + spec, ic: r.icon, name: r.name, rar: "legendary", sub: "Legendary · " + r.name + (bonus === "amulet" ? " ×1.5" : bonus === "2h" ? " ×2" : ""),
            clear: `data-legremove="${esc(spec)}"`, extra: t2 };
        }
        return { label };
      }
      const r = state.byId.get(k);
      if (!r) return { label };
      const crafted = !isCharm(k) && state.sandbox.mythic.includes(k) && canCraftMythic(r);
      return { label, key: isCharm(k) ? "charm:" + k : k, ic: r.icon, name: r.name, rar: rarityClass(shownRarity(r, { crafted })), clear: `data-unpin="${esc(k)}"` };
    };
    const offIsShield = classOffhands(cls).some((t) => /Shield/.test(t));
    const emptyFor = (slot) => ({ ranged: "Bow", off: WEAPON_RULES[cls] ? "Weapon" : offIsShield ? "Shield" : "Weapon" })[slot] || "Weapon";
    const pdSlots = [];
    [["Helm", 90], ["Chest", 230], ["Gloves", 370], ["Pants", 510], ["Boots", 650]].forEach(([slot, y]) =>
      pdSlots.push({ spec: `g:${slot}:0`, x: 66, y, w: 96, h: 128, empty: slot, ...slotData(`g:${slot}:0`, slot, L.gear[slot][0]) }));
    [["Amulet", 0, 100], ["Ring", 0, 214], ["Ring", 1, 328]].forEach(([slot, i, y]) =>
      pdSlots.push({ spec: `g:${slot}:${i}`, x: 534, y, w: 86, h: 96, small: true, empty: slot, ...slotData(`g:${slot}:${i}`, slot === "Ring" ? `Ring ${i + 1}` : slot, L.gear[slot][i]) }));
    const wEntries = Object.entries(rule.slots);
    wEntries.forEach(([sl, label], i) => {
      const k = L.weapons[sl];
      const twoHand = k && Object.entries(L.weapons).filter(([, x]) => x === k).length > 1;
      const blocked = (twoHand || (mainLeg2h && !WEAPON_RULES[cls])) && sl !== "main";
      pdSlots.push({ spec: "w:" + sl, x: 300 + (i - (wEntries.length - 1) / 2) * 112, y: 790, w: 96, h: 128, empty: emptyFor(sl), weapon: true,
        ...slotData("w:" + sl, twoHand && sl === "main" ? `${label} (2H)` : label, blocked ? null : k, blocked) });
    });
    const figCls = (cls || "any").toLowerCase();
    const pdHTML = PD.frames && PD.frames.slot ? (() => {
      const u = (v, total) => ((v / total) * 100).toFixed(3) + "%";
      const cellHTML = (d) => {
        const pos = `left:${u(d.x, 600)};top:${u(d.y, 860)};width:${u(d.w, 600)};height:${u(d.h, 860)}`;
        const frame = d.blocked ? PD.frames.blocked : d.name ? (PD.frames.gold && ["unique", "mythic", "legendary"].includes(d.rar) ? PD.frames.gold : PD.frames.slot) : d.small ? PD.frames.small || PD.frames.slot : PD.frames.slot;
        const emptyIc = (PD.empty || {})[d.empty];
        if (d.blocked) return `<div class="pd__slot is-blocked" style="${pos}" title="${esc(d.label)}: held by the 2H weapon">${itemIcon(frame, "pd__frame")}</div>`;
        return `<div class="pd__slot${d.name ? " is-full pd__slot--" + d.rar : ""}${d.weapon ? " pd__slot--weapon" : ""}" style="${pos}"${d.key ? ` data-key="${esc(d.key)}"` : ""}>
          <button type="button" class="pd__pick" data-pick="${esc(d.spec)}" data-label="${esc(d.label)}" aria-label="${esc(d.label)}: ${d.name ? esc(d.name) + ". Change" : "empty. Choose an item"}">${itemIcon(frame, "pd__frame")}${d.ic ? itemIcon(d.ic, "pd__item") : emptyIc ? itemIcon(emptyIc, "pd__empty") : ""}</button>
          ${d.name ? `<button type="button" class="sb-cell__clear pd__clear" ${d.clear} aria-label="Remove ${esc(d.name)}" title="Remove">×</button>` : ""}${d.extra || ""}${socketPips(d)}</div>`;
      };
      // Socket pips along the bottom of a filled slot: the game's round socket frame, the gem / rune inside.
      const socketPips = (d) => {
        const si = socketInfo(d.spec, L);
        if (!si.n) return "";
        return `<span class="pd__socks">${socketsOf(d.spec, L).map((v, i) => {
          const ln = v && socketLine(v, si.target);
          const tip = v ? (v.startsWith("g:") ? `gem:${v.slice(2)}|${si.target}` : "rune:" + v.slice(2)) : "";
          return `<button type="button" class="pd__sock${v ? " is-full" : ""}" data-pick="s|${esc(d.spec)}|${i}" data-label="${esc(d.label)} socket ${i + 1}"${tip ? ` data-key="${esc(tip)}"` : ""} aria-label="${esc(d.label)} socket ${i + 1}: ${ln ? esc(ln.name) : "empty"}">${PD.frames.socket ? itemIcon(PD.frames.socket, "pd__sockframe") : ""}${ln && ln.ic ? itemIcon(ln.ic, "pd__sockic") : ""}</button>`;
        }).join("")}</span>`;
      };
      const sigil = cls && (PD.sigil || {})[cls];
      const photo = (PD.portrait || {})[cls || "any"];
      return `<div class="pd-wrap"><div class="pd pd--${esc(figCls)}">
          ${photo ? `<img class="pd__photo${cls ? "" : " pd__photo--group"}" src="${esc(photo)}" alt="${esc(cls || "All classes")} in shop / battle pass armor" draggable="false">`
            : `${sigil ? `<img class="pd__sigil" src="data/icons/${sigil}.webp" alt="" draggable="false">` : ""}
          <img class="pd__fig" src="data/figures/${esc(figCls)}.svg" alt="${esc(cls || "Wanderer")} figure" draggable="false">`}
          ${photo && sigil ? `<img class="pd__badge" src="data/icons/${sigil}.webp" alt="" draggable="false">` : ""}
          ${pdSlots.map(cellHTML).join("")}</div>
        <ul class="pd__list">${pdSlots.map((d) => `<li class="${d.blocked ? "is-blocked" : d.name ? "pd__li--" + d.rar : "is-empty"}"><span class="mono">${esc(d.label)}</span> ${d.blocked ? "held by the 2H weapon" : d.name ? esc(d.name) : "empty"}</li>`).join("")}</ul></div>`;
    })() : "";
    // Sockets panel: gem quality, each socketed slot's gems / runeword, and gem totals.
    function socketsHTML() {
      const ruby = (gemTypes().find((t) => t.type === "Ruby") || { tiers: [] }).tiers;
      const tierName = (g) => g.name.replace(/\s*Ruby$/, "") || "Normal";
      const seen = new Set();
      const tierOpts = ruby.map((g, i) => ({ n: i + 1, label: tierName(g) })).reverse().filter((o) => !seen.has(o.label) && seen.add(o.label)).reverse()
        .map((o) => `<option value="${o.n}"${state.sandbox.gt === o.n ? " selected" : ""}>${esc(o.label)}</option>`).join("");
      const totals = new Map();
      const rows = pdSlots.filter((d) => !d.blocked).map((d) => {
        const si = socketInfo(d.spec, L);
        if (!si.n) return "";
        const socks = socketsOf(d.spec, L), lines = socks.map((v) => (v ? socketLine(v, si.target) : null));
        const gemLis = lines.filter((x) => x && !x.rune).map((x) => {
          totals.set(x.text, (totals.get(x.text) || 0) + 1);
          return `<li><span class="sk__name">${esc(x.name)}</span> ${Engine.renderText(x.text).html}</li>`;
        }).join("");
        const runes = lines.filter((x) => x && x.rune).map((x) => x.rune);
        const rit = runes.filter((r) => r.kind === "Ritual"), inv = runes.filter((r) => r.kind === "Invocation");
        let rw = "";
        if (rit.length === 1 && inv.length === 1) {
          const a = rit[0], b = inv[0];
          rw = `<li class="sk__rw"><span class="sk__name">Runeword: ${esc(a.phrase || a.name)} ${esc(b.phrase || b.name)}</span>
            <span class="gt-rune-ritual">When:</span> ${Engine.renderText(a.t).html} <span class="mono hint">(+${a.offering})</span>
            <span class="gt-rune-invoke">Then:</span> ${Engine.renderText(b.t).html} <span class="mono hint">(needs ${b.offering})</span></li>`;
        } else if (runes.length) {
          rw = `<li class="sk__warn mono">${runes.length === 1 ? `${esc(runes[0].name)} does nothing alone: add a ${runes[0].kind === "Ritual" ? "Rune of Invocation" : "Rune of Ritual"} in the other socket` : "A runeword needs one Rune of Ritual and one Rune of Invocation"}</li>`;
        }
        const used = socks.filter(Boolean).length;
        return `<li class="sk__slot"><span class="mono sk__label">${esc(d.label)} <span class="sk__tg">${GEM_TARGETS[si.target]} · ${used}/${si.n}</span></span>
          ${gemLis || rw ? `<ul class="sk__lines">${gemLis}${rw}</ul>` : `<span class="sk__empty">empty: click a socket on the item</span>`}</li>`;
      }).filter(Boolean).join("");
      // Weapon gem bonuses are damage multipliers ("x"): they multiply, so 2 × x32% is x74.2%, not x64%.
      // Other gem bonuses (stats, resistance, barrier, healing) add up.
      const MULT = /^x([\d.]+)% (.+ Damage Multiplier)$/;
      const fmtPct = (v) => (Math.round(v * 1000) / 10).toString();
      const mults = new Map(), adds = [];
      for (const [t, q] of totals) {
        const m = MULT.exec(t);
        if (m) mults.set(m[2], [...(mults.get(m[2]) || []), ...Array(q).fill(+m[1] / 100)]);
        else {
          const n = /^([+-]?)([\d,.]+)(%?) (.+)$/.exec(t);
          adds.push(n && q > 1 ? `${n[1] || "+"}${(+n[2].replace(/,/g, "") * q).toLocaleString("en-US")}${n[3]} ${n[4]} <span class="mono sk__x">${q} gems</span>` : esc(t));
        }
      }
      const multLis = [...mults].map(([what, vs]) => {
        const prod = vs.reduce((p, v) => p * (1 + v), 1) - 1;
        return `<li><span class="gt-mult">x${fmtPct(prod)}%</span> ${esc(what)}${vs.length > 1 ? ` <span class="mono sk__x">${vs.map((v) => (1 + v).toFixed(2)).join(" × ")}</span>` : ""}</li>`;
      });
      // Every elemental multiplier also stacks with the All Damage one.
      const all = mults.get("All Damage Multiplier");
      const combo = all ? [...mults].filter(([w]) => w !== "All Damage Multiplier").map(([what, vs]) => {
        const prod = [...vs, ...all].reduce((p, v) => p * (1 + v), 1) - 1;
        return `<li class="sk__combo"><span class="gt-mult">x${fmtPct(prod)}%</span> ${esc(what.replace(" Multiplier", ""))} in total (with All Damage)</li>`;
      }) : [];
      const tot = [...multLis, ...combo, ...adds.map((h) => `<li>${h.includes("<span") ? h : Engine.renderText(h).html}</li>`)].join("");
      return `<div class="sk"><div class="sk__head"><h4 class="sb-build__sub mono">SOCKETS</h4>
          <label class="sk__gt"><span class="mono">GEM QUALITY</span><select class="input mono" data-gt aria-label="Gem quality">${tierOpts}</select></label></div>
        ${rows ? `<ul class="sk__slots">${rows}</ul>` : `<p class="hint">Equip an item to socket it.</p>`}
        ${tot ? `<p class="sb-build__sub mono">GEM TOTALS</p><ul class="sk__tot">${tot}</ul>` : ""}
        <p class="hint">Click a socket under an item to add a gem or rune. Helm, Chest, Pants and 2H weapons have 2 sockets; 1H weapons, off-hands, the Amulet and Rings 1; Gloves and Boots none. A gem's bonus depends on the item: weapon (an x damage multiplier: these multiply with each other), armor, including shields (a main stat, barrier, healing) or jewelry (resistance). Runes need a 2-socket item: one Rune of Ritual plus one Rune of Invocation make a runeword (see Runes &amp; Recipes).</p></div>`;
    }
    const build = `<section class="sb-build">
      <div class="sb-build__head"><h3 class="sb-loadout__title mono">BUILD // ${esc(cls || "any class")}</h3>
        <span class="hint">${esc(rule.text.replace(/^[a-z]/, (c) => c.toUpperCase()))}.${state.sandbox.cls ? "" : cls ? " Class taken from your items." : " Set a class to use its weapon rules."}</span></div>
      ${pdHTML || `<h4 class="sb-build__sub mono">WEAPONS</h4><div class="sb-cells">${wCells}</div>
      <h4 class="sb-build__sub mono">ARMOR &amp; JEWELRY</h4><div class="sb-cells">${gCells}</div>`}
      ${overflow.length ? `<p class="sb-note mono">NOT EQUIPPED // ${overflow.map((k) => esc(state.byId.get(k).name)).join(", ")}: no free slot. Remove it, or press CHARM below to move it to the Talisman.</p>` : ""}
      ${pdHTML ? socketsHTML() : ""}
    </section>`;

    const nameOf = (k) => esc(state.byId.get(k).name);
    const [sealName, nSlots] = sealOf();
    const charms = state.sandbox.charms;
    const T = talismanIdx();
    const setCh = state.sandbox.sets.map((x, i) => ({ ...x, i, piece: T.piece.get(x.p) }));
    const sealOpts = Object.entries(SEALS).map(([id, [label, n]]) => `<option value="${id}"${(state.sandbox.seal || "legendary") === id ? " selected" : ""}>${esc(label)} · ${n} slots</option>`).join("");
    const occupants = talismanOccupants().map((o) => (o.x ? { x: setCh.find((y) => y.p === o.x.p && y.i === state.sandbox.sets.indexOf(o.x)) } : o));
    const charmCells = Array.from({ length: 6 }, (_, i) => {
      if (i >= nSlots) return `<div class="sb-cell sb-cell--locked"><span class="sb-cell__pick" aria-disabled="true"><span class="sb-cell__ico"></span><span class="sb-cell__text"><span class="sb-cell__label mono">Charm ${i + 1}</span><span class="sb-cell__name">locked by seal</span></span></span></div>`;
      const o = occupants[i];
      if (o && o.torch) {
        const torch = codexItem(TORCH_ID);
        return `<div class="sb-cell sb-cell--mythic" data-key="torch"><button type="button" class="sb-cell__pick" data-pick="c:${i}" title="Change charm ${i + 1}">
          <span class="sb-cell__ico">${torch && torch.ic ? itemIcon(torch.ic) : '<span class="sb-cell__plus" aria-hidden="true">✦</span>'}</span>
          <span class="sb-cell__text"><span class="sb-cell__label mono">Charm ${i + 1} · Mythic</span><span class="sb-cell__name">Hellfire Torch</span></span></button>
          <button type="button" class="sb-cell__clear" data-torchremove aria-label="Remove Hellfire Torch" title="Remove">×</button></div>`;
      }
      if (o && o.x) {
        return `<div class="sb-cell sb-cell--set" data-key="set:${o.x.i}"><button type="button" class="sb-cell__pick" data-pick="c:${i}" title="Change charm ${i + 1}">
          <span class="sb-cell__ico">${o.x.piece.ic ? itemIcon(o.x.piece.ic) : '<span class="sb-cell__plus" aria-hidden="true">◆</span>'}</span>
          <span class="sb-cell__text"><span class="sb-cell__label mono">Charm ${i + 1} · ${esc(o.x.piece.type)}</span><span class="sb-cell__name">${esc(o.x.piece.name)}</span></span></button>
          <button type="button" class="sb-cell__clear" data-setremove="${o.x.i}" aria-label="Remove ${esc(o.x.piece.name)}" title="Remove">×</button></div>`;
      }
      return cell(`c:${i}`, `Charm ${i + 1}${o ? " · unique" : ""}`, o ? o.k : null);
    }).join("");

    // Set bonuses: count different types per set; a duplicate type (same set) doesn't count.
    const bySet = new Map();
    for (const x of setCh) {
      const b = bySet.get(x.piece.set.id) || { set: x.piece.set, types: new Map() };
      b.types.set(x.piece.type, (b.types.get(x.piece.type) || 0) + 1);
      bySet.set(x.piece.set.id, b);
    }
    const world = { t: state.sandbox.t, rank: 1, ip: 850 };
    const bonusHTML = [...bySet.values()].map(({ set: st, types }) => {
      const n = types.size, total = st.pieces.length;
      const dups = [...types].filter(([, q]) => q > 1).map(([ty]) => ty);
      return `<div class="sb-set"><p class="sb-set__name">${esc(st.name)} <span class="mono">${n} / ${total}</span>${st.c.length === 1 ? ` <span class="sb-set__cls mono">${esc(st.c[0])}</span>` : ""}</p>
        <p class="sb-set__types mono">${st.pieces.map((p) => `<span class="${types.has(p.type) ? "on" : ""}">${esc(p.type)}</span>`).join("")}</p>
        <ul class="sb-set__tiers">${st.tiers.map((tr) => `<li class="${n >= setNeed(tr.n) ? "is-on" : ""}"><span class="mono">(${setNeed(tr.n)}${setNeed(tr.n) !== tr.n ? ` <s>${tr.n}</s>` : ""})</span> ${(Engine.renderAffix(tr.a, world)[0] || { html: "" }).html}</li>`).join("")}</ul>
        ${dups.length ? `<p class="sb-note mono">DUPLICATE ${esc(dups.join(", ").toUpperCase())} // only one of each type counts per set. Reroll the duplicate in the Horadric Cube to look for a missing type.</p>` : ""}</div>`;
    }).join("");
    const setRows = setCh.map((x) => {
      const pool = poolFor(x.piece.set.c.length === 1 ? x.piece.set.c[0] : cls);
      const sel = (j) => `<select class="input mono" data-setaffix="${x.i}" data-slot="${j}" aria-label="${esc(x.piece.name)} affix ${j + 1}"><option value="">— affix ${j + 1} —</option>${pool.map((id) => `<option value="${esc(id)}"${x.a[j] === id ? " selected" : ""}>${esc(plainAffix(id))}</option>`).join("")}</select>`;
      const dup = (bySet.get(x.piece.set.id).types.get(x.piece.type) || 0) > 1;
      return `<div class="sb-setcharm${dup ? " is-dup" : ""}">
        <div class="sb-setcharm__head"><span class="sb-setcharm__name">${esc(x.piece.name)}</span><span class="mono sb-setcharm__type">${esc(x.piece.type)}${dup ? " · DUPLICATE" : ""}</span></div>
        <div class="sb-setcharm__affixes">${sel(0)}${sel(1)}</div></div>`;
    }).join("");

    const sealItem = sealOf()[2].item && codexItem(sealOf()[2].item);
    const sealIc = (sealItem && sealItem.ic) || ((Engine.codex.talisman || {}).seals || {})[sealOf()[2].icon];
    const linesOf = (it) => { if (!it) return []; const r = renderItem(it, { t: state.sandbox.t, rank: 1, ip: 900 }, false); return [r.power, ...r.imp, ...r.stats].filter(Boolean); };
    const powerBlock = (title, it) => { const ls = linesOf(it); return ls.length ? `<div class="sb-sealpower"><span class="mono">${esc(title)}</span><ul>${ls.map((l) => `<li>${l.html}</li>`).join("")}</ul></div>` : ""; };
    const sealPowers = powerBlock(sealName, sealItem) + (state.sandbox.torch ? powerBlock("Hellfire Torch", codexItem(TORCH_ID)) : "");
    // In-game Talisman panel (UI/InventoryGrid Template_Talisman, 720×720 units): six charm sockets
    // in a hexagon around the seal. Offsets are the game's, from the panel centre.
    const TUI = (Engine.codex.talisman || {}).ui || {};
    const HEX = [[0, -165], [-148, 83], [148, 83], [-148, -83], [148, -83], [0, 165]];
    const pct = (v) => (50 + (v / 720) * 100).toFixed(2) + "%";
    const socketOf = (i) => {
      const o = occupants[i];
      if (i >= nSlots) return { locked: true };
      if (o && o.torch) { const t = codexItem(TORCH_ID); return { key: "torch", ic: t && t.ic, name: "Hellfire Torch", sub: "Mythic charm", rar: "mythic", clear: "data-torchremove" }; }
      if (o && o.x) return { key: "set:" + o.x.i, ic: o.x.piece.ic, name: o.x.piece.name, sub: o.x.piece.type + " · " + o.x.piece.set.name, rar: "set", clear: `data-setremove="${o.x.i}"` };
      if (o && o.k) { const r = state.byId.get(o.k); if (r) return { key: "charm:" + o.k, ic: (charmOf(r) || {}).ic || r.icon, name: r.name, sub: "Unique charm", rar: rarityClass(shownRarity(r, {})), clear: `data-unpin="${esc(o.k)}"` }; }
      return {};
    };
    const sockets = HEX.map(([x, y], i) => {
      const k = socketOf(i), frame = k.locked ? TUI.locked : k.name ? TUI.active : TUI.socket;
      const pos = `left:${pct(x)};top:${pct(y)}`;
      if (k.locked) return `<div class="tal__sock is-locked" style="${pos}" title="Charm ${i + 1}: locked by the ${esc(sealName)}">${itemIcon(frame, "tal__frame")}</div>`;
      return `<div class="tal__sock${k.name ? " is-full tal__sock--" + k.rar : ""}" style="${pos}"${k.key ? ` data-key="${esc(k.key)}"` : ""}>
        <button type="button" class="tal__pick" data-pick="c:${i}" aria-label="${k.name ? `Charm ${i + 1}: ${esc(k.name)}. Change` : `Charm ${i + 1}: empty. Choose a charm`}">${itemIcon(frame, "tal__frame")}${k.ic ? itemIcon(k.ic, "tal__item") : k.name ? "" : '<span class="tal__plus" aria-hidden="true">+</span>'}</button>
        ${k.name ? `<button type="button" class="sb-cell__clear tal__clear" ${k.clear} aria-label="Remove ${esc(k.name)}" title="Remove">×</button>` : ""}</div>`;
    }).join("");
    const sealKey = sealItem && state.byId.has(sealItem.id) ? sealItem.id : "";
    const hexPanel = TUI.bg && TUI.socket ? `<div class="tal" style="background-image:url('data/icons/${TUI.bg}.webp')">
        <div class="tal__seal" style="left:${pct(0)};top:${pct(4)}"${sealKey ? ` data-key="${esc(sealKey)}"` : ""} title="${esc(sealName)}">${itemIcon(TUI.seal, "tal__frame")}${sealIc ? itemIcon(sealIc, "tal__item") : ""}${TUI.sealActive ? itemIcon(TUI.sealActive, "tal__frame") : ""}</div>
        ${sockets}</div>
      <ol class="tal__list">${HEX.map((_, i) => { const k = socketOf(i); return `<li class="${k.locked ? "is-locked" : k.name ? "tal__li--" + k.rar : "is-empty"}"><span class="mono">${i + 1}</span> ${k.locked ? "locked" : k.name ? esc(k.name) + ` <span class="tal__sub">${esc(k.sub)}</span>` : "empty"}</li>`; }).join("")}</ol>` : "";
    const talisman = `<section class="sb-build">
      <div class="sb-build__head"><h3 class="sb-loadout__title mono">TALISMAN // ${talismanUsed()} / ${nSlots} CHARMS</h3>
        <label class="sb-seal"><span class="mono">SEAL</span>${sealIc && !hexPanel ? `<span class="ico-well sb-seal__ico">${itemIcon(sealIc)}</span>` : ""}<select class="input mono" data-seal aria-label="Talisman seal">${sealOpts}</select></label></div>
      ${sealPowers}
      ${hexPanel ? `<div class="tal-wrap">${hexPanel}</div>` : `<div class="sb-cells">${charmCells}</div>`}
      <p class="hint mono sb-uniq">UNIQUE CHARMS ${uniqueCount()} / ${uniqueLimit()}${sealOf()[2].setReduce ? " // SET BONUSES NEED 1 FEWER CHARM (MIN 2)" : ""}</p>
      ${uniqueCount() > uniqueLimit() ? `<p class="sb-note mono">TOO MANY UNIQUE CHARMS // the ${esc(sealName)} allows ${uniqueLimit()}. Remove one, or use a Seal of the Golden Epiphany (3), the Severed Finger (2) or the Hellfire Torch (+1).</p>` : ""}
      ${talismanUsed() > nSlots ? `<p class="sb-note mono">TALISMAN FULL // ${talismanUsed() - nSlots} charm${talismanUsed() - nSlots > 1 ? "s" : ""} don't fit the ${esc(sealName)}.</p>` : ""}
      ${setRows ? `<h4 class="sb-build__sub mono">SET CHARM AFFIXES</h4><div class="sb-setcharms">${setRows}</div>` : ""}
      ${bonusHTML ? `<div class="sb-sets"><h4 class="sb-build__sub mono">SET BONUSES</h4>${bonusHTML}</div>` : ""}
      <p class="hint">Click a charm slot to add a set charm (5 types per set: Phoba, Fer, Mlor, Linta, Berú; bonuses at 2, 3 and 5; sets can be mixed) or a unique's charm (unique power only). The seal sets the slots: Magic 3, Rare 4, Legendary 5 (6 with the extra slot affix), Annihilus 6, Mythic seals 6 (Severed Finger 5). One unique charm is allowed, 2 with the Severed Finger, 3 with the Golden Epiphany, +1 with the Hellfire Torch; the Diamond Mind lowers every set bonus by 1 charm (min 2).</p>
    </section>`;

    const damage = damageHTML();
    /* ---------- Damage model ----------
     * Diablo IV: every "+N% … Damage" bonus adds into one additive bucket; every "xN%" bonus (affixes,
     * aspects, unique powers, gems, set bonuses) multiplies the result. Crits: base 5% chance and +50%
     * damage (assumed), plus the build's crit chance / crit damage lines; "x" bonuses to Critical Strike
     * Damage multiply only crits. Many lines are conditional: each one can be switched off.
     * state.sandbox.dmgOff: ids of switched-off lines. */
    function damageHTML() {
      const W = { t: state.sandbox.t, rank: state.sandbox.rank, ip: state.sandbox.ip || Engine.DEFAULT_IP };
      const src = [];
      const add = (id, name, r) => { if (r) src.push({ id, name, lines: [r.power, ...(r.imp || []), ...(r.stats || []), ...(r.mythicLines || [])].filter(Boolean).map((l) => l.plain || "") }); };
      const eq = new Set([...Object.values(L.weapons), ...Object.values(L.gear).flat()].filter(Boolean));
      for (const k of eq) { const r = state.byId.get(k); add(k, r.name, renderedAt(r, W)); }
      for (const [sp, e] of Object.entries(state.sandbox.leg)) {
        const free = sp.startsWith("g:") ? L.gear[sp.split(":")[1]] && !L.gear[sp.split(":")[1]][+sp.split(":")[2]] : rule.slots[sp.slice(2)] && !L.weapons[sp.slice(2)];
        const r = state.byId.get(e.a);
        if (free && r) add("leg:" + sp, `${r.name} (${slotNameOf(sp)})`, renderLegAspect(r.key, sp));
      }
      for (const k of state.sandbox.charms) { const r = state.byId.get(k), ch = r && charmOf(r); if (ch) add("charm:" + k, r.name + " (charm)", renderItem(ch, W, false)); }
      if (state.sandbox.torch && codexItem(TORCH_ID)) add("torch", "Hellfire Torch", renderItem(codexItem(TORCH_ID), { ...W, ip: 900 }, false));
      if (sealItem) add("seal", sealName, renderItem(sealItem, { ...W, ip: 900 }, false));
      const W850 = { t: state.sandbox.t, rank: 1, ip: 850 };
      setCh.forEach((x) => x.a.filter(Boolean).forEach((id, j) => src.push({ id: `setaff:${x.i}:${j}`, name: x.piece.name, lines: Engine.renderAffix(id, W850).map((l) => l.plain) })));
      for (const { set: st, types } of bySet.values())
        st.tiers.filter((tr) => types.size >= setNeed(tr.n)).forEach((tr) => src.push({ id: `setbonus:${st.id}:${tr.n}`, name: `${st.name} (${setNeed(tr.n)})`, lines: Engine.renderAffix(tr.a, W850).map((l) => l.plain) }));
      for (const d of pdSlots) {
        const si = socketInfo(d.spec, L);
        if (!si.n) continue;
        socketsOf(d.spec, L).forEach((v, i) => { const ln = v && v.startsWith("g:") && socketLine(v, si.target); if (ln && ln.text) src.push({ id: `gem:${d.spec}:${i}`, name: `${ln.name} (${d.label})`, lines: [ln.text] }); });
      }
      // Classify every number.
      const off = new Set(state.sandbox.dmgOff || []);
      const ent = { add: [], mult: [], cc: [], cd: [], cm: [], ccm: [] };
      const num = (x) => parseFloat(x.replace(/,/g, "")) / 100;
      for (const sc of src) sc.lines.forEach((line, li) => {
        let mi = 0;
        const push = (bucket, v, m, idx) => {
          const id = `${sc.id}#${li}#${mi++}`;
          const at = Math.max(0, idx - 50), ctx = line.slice(at, idx + m.length + 70).trim();
          ent[bucket].push({ id, v, src: sc.name, ctx: (at ? "…" : "") + ctx + (idx + m.length + 70 < line.length ? "…" : ""), on: !off.has(id) });
        };
        // What an x bonus multiplies: the nearest "Critical Strike Chance / Damage" mention in its sentence
        // (before the number first, e.g. "Critical Strike Damage is increased by x75%", else after it).
        const CRIT = /Critical Strikes?'?s? (Chance|Damage)/gi;
        for (const m of line.matchAll(/x(\d[\d,]*(?:\.\d+)?)%/g)) {
          const head = line.slice(0, m.index), cut = Math.max(head.lastIndexOf(". "), head.lastIndexOf("; "), head.lastIndexOf("•"));
          const before = [...head.slice(cut + 1).matchAll(CRIT)].pop();
          const tail = line.slice(m.index + m[0].length), end = tail.search(/\. |; |•|$/);
          const after = before ? null : tail.slice(0, end).match(/^\s*(?:increased\s+|more\s+|bonus\s+)?(?:\w+\s+){0,3}?Critical Strikes?'?s? (Chance|Damage)/i);
          const what = (before || after || [])[1];
          push(!what ? "mult" : /chance/i.test(what) ? "ccm" : "cm", num(m[1]), m[0], m.index);
        }
        for (const m of line.matchAll(/\+(\d[\d,]*(?:\.\d+)?)%\s+([A-Za-z' ]{0,60}?)(Critical Strike Chance|Critical Strike Damage|Damage)\b/g)) {
          if (/Reduction|Taken|Resist/i.test(line.slice(m.index, m.index + m[0].length + 12))) continue;
          push(m[3] === "Critical Strike Chance" ? "cc" : m[3] === "Critical Strike Damage" ? "cd" : "add", num(m[1]), m[0], m.index);
        }
      });
      const sum = (a) => a.filter((e) => e.on).reduce((p, e) => p + e.v, 0);
      const prod = (a) => a.filter((e) => e.on).reduce((p, e) => p * (1 + e.v), 1);
      const A = sum(ent.add), M = prod(ent.mult), base = (1 + A) * M;
      const cc = Math.min(1, (0.05 + sum(ent.cc)) * prod(ent.ccm)), cd = 0.5 + sum(ent.cd), cm = prod(ent.cm);
      const onCrit = base * (1 + cd) * cm, avg = base * (1 + cc * ((1 + cd) * cm - 1));
      const pct = (x) => `${(Math.round(x * 1000) / 10).toLocaleString("en-US")}%`;
      const times = (x) => `×${x >= 100 ? Math.round(x).toLocaleString("en-US") : x.toFixed(2)}`;
      const row = (e, kind) => `<li class="${e.on ? "" : "is-off"}"><label><input type="checkbox" data-dmg="${esc(e.id)}"${e.on ? " checked" : ""}>
          <span class="dm__v ${kind === "mult" || kind === "cm" ? "gt-mult" : ""}">${kind === "mult" || kind === "cm" ? "x" : "+"}${pct(e.v)}</span>
          <span class="dm__src">${esc(e.src)}</span><span class="dm__ctx">${esc(e.ctx)}</span></label></li>`;
      const block = (title, arr, kind, total) => arr.length ? `<div class="dm__blk"><p class="sb-build__sub mono">${title} <span class="dm__tot">${total}</span></p><ul class="dm__list">${arr.map((e) => row(e, kind)).join("")}</ul></div>` : "";
      if (!src.length) return "";
      return `<section class="sb-build dm">
        <div class="sb-build__head"><h3 class="sb-loadout__title mono">DAMAGE // ADDITIVE × MULTIPLIERS</h3>
          ${off.size ? `<button type="button" class="btn btn--ghost mono" data-dmgall>ALL ON</button>` : ""}</div>
        <div class="dm__sum">
          <div><span class="mono">ADDITIVE BUCKET</span><b>+${pct(A)}</b></div>
          <div><span class="mono">MULTIPLIERS (${ent.mult.filter((e) => e.on).length})</span><b class="gt-mult">x${pct(M - 1)}</b></div>
          <div><span class="mono">DAMAGE</span><b>${times(base)}</b><i>+${pct(base - 1)}</i></div>
          <div><span class="mono">ON CRIT</span><b>${times(onCrit)}</b><i>${pct(cc)} chance · +${pct(cd)} crit dmg${ent.cm.some((e) => e.on) ? ` · x${pct(cm - 1)}` : ""}</i></div>
          <div class="dm__avg"><span class="mono">AVERAGE WITH CRITS</span><b>${times(avg)}</b><i>+${pct(avg - 1)}</i></div>
        </div>
        ${block("ADDITIVE (+%) — these add together", ent.add, "add", "+" + pct(A))}
        ${block("MULTIPLIERS (x%) — each multiplies the total", ent.mult, "mult", "x" + pct(M - 1))}
        ${block("CRITICAL STRIKE CHANCE", ent.cc, "add", pct(cc) + " incl. 5% base")}
        ${block("CRITICAL STRIKE CHANCE MULTIPLIERS", ent.ccm, "cm", "x" + pct(prod(ent.ccm) - 1))}
        ${block("CRITICAL STRIKE DAMAGE", ent.cd, "add", "+" + pct(cd) + " incl. 50% base")}
        ${block("CRITICAL STRIKE DAMAGE MULTIPLIERS", ent.cm, "cm", "x" + pct(cm - 1))}
        <p class="hint">Diablo IV adds every +% damage bonus into one bucket, then multiplies it by every x% bonus (affixes, aspects, unique powers, gems, set bonuses), so x bonuses grow the total fast. That's why the game's own all-damage figure, which also folds in weapon damage, main stat and crits, can reach 100,000%. These numbers come from your build's lines at the current roll quality. Many only apply in some situations (vs Vulnerable, while Healthy, after a skill): untick the ones that don't apply to your rotation. Base crit: 5% chance, +50% damage (assumed). Main stat, weapon damage and skill ranks aren't counted.</p>
      </section>`;
    }

    const aspectKeys = state.pins.filter((k) => (state.byId.get(k) || {}).kind === "aspect");
    const aspects = `<section class="sb-build">
      <div class="sb-build__head"><h3 class="sb-loadout__title mono">ASPECTS TO COMPARE // ${aspectKeys.length}</h3>
        <button type="button" class="btn mono" data-pick="aspect">+ ADD ASPECT</button></div>
      ${aspectKeys.length ? "" : '<p class="hint">To equip an aspect, click a slot in the build and pick it from the Legendary entries (only aspects allowed in that slot are listed; amulet ×1.5, 2H weapon ×2 apply automatically). Aspects added here are just for side-by-side comparison.</p>'}
    </section>`;

    const details = true ? `<h3 class="sb-details mono">DETAILS // tooltips at your roll quality and item power</h3>` : "";
    const legSpecs = Object.keys(state.sandbox.leg).filter((sp) => state.byId.has(state.sandbox.leg[sp].a) &&
      (sp.startsWith("g:") ? !L.gear[sp.split(":")[1]][+sp.split(":")[2]] : rule.slots[sp.slice(2)] && !L.weapons[sp.slice(2)]));
    const legDetails = legSpecs.map((sp) => {
      const r = state.byId.get(state.sandbox.leg[sp].a), rendered = renderLegAspect(r.key, sp);
      const bonus = legBonusSlot(sp, state.sandbox.leg[sp]);
      rendered.tools = `<div class="sb-entry__tools"><button type="button" class="btn btn--ghost mono" data-legremove="${esc(sp)}">REMOVE</button></div>`;
      const rv = { ...r, name: `${r.name}`, type: `Legendary ${slotNameOf(sp)}` };
      return `<article class="sb-entry sb-entry--legendary">${tooltipInner(rv, rendered)}
        <p class="hint mono" style="padding:0 16px 10px">ON A LEGENDARY ${esc(slotNameOf(sp).toUpperCase())}${bonus === "amulet" ? " // AMULET ×1.5" : bonus === "2h" ? " // 2H WEAPON ×2" : ""} // RANK ${r.maxRank ? Math.min(state.sandbox.rank, r.maxRank) + " / " + r.maxRank : state.sandbox.rank}</p></article>`;
    }).join("");
    els.sbList.innerHTML = limitNote + build + talisman + damage + aspects + (state.pins.length || legDetails ? details : "") + legDetails + state.pins.map((key) => {
      const r0 = state.byId.get(key);
      if (!r0) return "";
      const asCharm = isCharm(key) && charmOf(r0);
      const r = asCharm ? { ...r0, type: "Charm", slot: "Talisman (charm: unique power only)" } : r0;
      const rendered = renderedAt(r0, { t, rank, ip });
      const charmBtn = charmOf(r0)
        ? `<button type="button" class="btn btn--ghost mono" data-charm="${esc(key)}" aria-pressed="${Boolean(asCharm)}" title="${asCharm ? "Move back to its gear slot" : "Put it in the Talisman as a charm (unique power only)"}">CHARM</button>`
        : "";
      const mythicBtn = !asCharm && canCraftMythic(r)
        ? `<button type="button" class="btn btn--mythic mono" data-mythic="${esc(key)}" aria-pressed="${rendered.crafted}" title="View the crafted Mythic version">MYTHIC</button>`
        : "";
      const slotBtns = r.kind === "aspect"
        ? Object.entries(ASPECT_SLOTS).map(([s, [label]]) => `<button type="button" class="btn btn--ghost mono" data-aslot="${s}" data-akey="${esc(key)}" aria-pressed="${state.sandbox.slot[key] === s}" title="Imprinted on a non-unique ${s === "amulet" ? "amulet (150%)" : "two-handed weapon (200%)"}">${label}</button>`).join("")
        : "";
      rendered.tools = `<div class="sb-entry__tools">${slotBtns}${charmBtn}${mythicBtn}<button type="button" class="btn btn--ghost mono" data-unpin="${esc(key)}">REMOVE</button></div>`;
      const rankNote = r.maxRank ? `<p class="hint mono" style="padding:0 16px 8px">RANK ${Math.min(rank, r.maxRank)} / ${r.maxRank}</p>` : "";
      return `
        <article class="sb-entry sb-entry--${rarityClass(shownRarity(r, rendered))}">
          ${tooltipInner(r, rendered)}
          ${rankNote}
          ${rawAvailable === false ? "" : `<details class="sb-entry__raw" data-raw="${esc(key)}"${openRaw.has(key) ? " open" : ""}${rawCache.has(key) ? ' data-loaded="1"' : ""}>
            <summary>RAW SOURCE FILES ▸</summary>
            <div class="raw">${rawCache.get(key) || '<p class="hint mono">loading…</p>'}</div>
          </details>`}
        </article>`;
    }).join("");
  }

  // Fetch the original datamined JSON straight from data/Item, data/StringList and data/Power.
  async function loadRaw(details) {
    if (details.dataset.loaded) return;
    details.dataset.loaded = "1";
    const r = state.byId.get(details.dataset.raw);
    const box = details.querySelector(".raw");
    const files = [];
    if (r.kind === "item") {
      files.push(RAW.item + r.id + ".itm.json", RAW.stl + "Item_" + r.id + ".stl.json");
      for (const a of [...(r.raw.imp || []), ...(r.raw.stats || []), ...(r.raw.power ? [r.raw.power] : [])]) {
        files.push(RAW.stl + "Affix_" + a + ".stl.json");
      }
    } else {
      files.push(RAW.stl + "Affix_" + r.id + ".stl.json");
    }
    const powers = new Set();
    const a = Engine.codex.affixes[r.raw.power || r.id];
    if (a) JSON.stringify(a).replace(/PowerTag\.([A-Za-z0-9_]+)\./g, (_, p) => powers.add(p));
    for (const p of powers) files.push(RAW.power + p + ".pow.json");

    const results = await Promise.all(files.map(async (f) => {
      try {
        const res = await fetch(f);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const text = JSON.stringify(await res.json(), null, 1);
        return `<div><h4>${esc(f)}</h4><pre>${esc(text.length > 20000 ? text.slice(0, 20000) + "\n… (truncated)" : text)}</pre></div>`;
      } catch (e) {
        return `<div><h4>${esc(f)}</h4><p class="hint mono">unavailable (${esc(e.message)}). Raw folders may not be deployed.</p></div>`;
      }
    }));
    rawCache.set(details.dataset.raw, results.join(""));
    box.innerHTML = rawCache.get(details.dataset.raw);
  }

  /* ==========================================================
     3b. Runes & Recipes view
     ========================================================== */

  const runeState = { tab: "runes", kind: "all", built: false, a: "", b: "" };
  let runeIdx = null;   // rune id -> rune
  let recipeIdx = null; // recipe id -> { label, html }

  const runeData = () => Engine.codex && Engine.codex.runes;
  const bossLabel = (id) => {
    const d = Engine.codex.drops;
    const b = d && d.byId && d.byId[id];
    return b ? bossShort(b) : id;
  };
  const fmtGold = (g) => (g ? `${g.toLocaleString("en-US")} gold` : "");

  function runeChip(id, q) {
    const r = runeIdx.get(id);
    if (!r) return esc(id);
    const cls = r.kind === "Ritual" ? "rchip--ritual" : "rchip--invoke";
    return `<button type="button" class="rchip ${cls}${r.season ? " rchip--s15" : ""}" data-rune="${esc(id)}" title="${esc(r.kind)} · ${esc(r.rarity)}${r.season ? " · " + esc(r.season) : ""}">${itemIcon(r.ic, "ico--chip")}${q > 1 ? `<span class="rchip__q">${q}×</span>` : ""}${esc(r.name)}</button>`;
  }

  function ingHTML(i) {
    if (i.ref && runeIdx.has(i.ref)) return runeChip(i.ref, i.q);
    return `<span class="ing">${i.q > 1 ? `<span class="rchip__q">${i.q}×</span>` : ""}${esc(i.n || "item")}</span>`;
  }

  function recipeHTML(r) {
    const ins = r.ins.map(ingHTML).join('<span class="rplus">+</span>');
    const out = r.out ? (r.out.ref && runeIdx.has(r.out.ref) ? runeChip(r.out.ref) : `<span class="ing ing--out">${esc(r.out.n)}</span>`) : `<span class="gt-unk">not named in data</span>`;
    const meta = [r.station, fmtGold(r.gold), r.hidden ? "hidden recipe" : "", /Season15/.test(r.cond) ? "Season 15" : ""].filter(Boolean).join(" · ");
    return `<div class="recipe" data-search="${esc([r.station, ...r.ins.map((i) => i.n), r.out && r.out.n].join(" ").toLowerCase())}">
      <div class="recipe__flow">${ins}<span class="rarrow" aria-label="makes">→</span>${out}</div>
      <div class="recipe__meta mono">${esc(meta)}${r.out && r.out.derived ? ' · <span title="The recipe outputs a loot table; the result is named from the recipe file">output from recipe name</span>' : ""}</div>
    </div>`;
  }

  function indexRunes() {
    const d = runeData();
    runeIdx = new Map(d.runes.map((r) => [r.id, r]));
    recipeIdx = new Map();
    const rc = d.recipes;
    for (const r of [...rc.runeUpgrades, ...rc.legendaryRunes, ...rc.mythic, ...rc.unique]) recipeIdx.set(r.id, r);
  }

  function runeCardHTML(r) {
    const text = Engine.renderText(r.t || "").html || '<span class="gt-unk">No description in source data.</span>';
    const facts = [];
    facts.push(["OFFERING", r.kind === "Ritual" ? `+${r.offering} per trigger` : `needs ${r.offering}`]);
    if (r.kind === "Invocation" && r.cd) facts.push(["COOLDOWN", `${r.cd}s`]);
    if (r.overflow) facts.push(["OVERFLOW", r.overflow]);
    if (r.phrase) facts.push([r.kind === "Ritual" ? "NAME PREFIX" : "NAME SUFFIX", r.phrase]);
    const src = [];
    if (r.drops.length) src.push(`Lairs: ${r.drops.map(bossLabel).join(", ")}`);
    if (r.made.length) src.push(...r.made.map((id) => recipeIdx.get(id)).filter(Boolean).map((x) => `<span class="rsrc">${recipeHTML(x)}</span>`));
    if (!r.drops.length && !r.made.length && !r.legacy) src.push(r.season ? "Season 15 drops" : `World: ${esc(runeData().otherSources.join(", "))}`);
    if (r.reroll) src.push(`Jeweler: ${r.reroll.q}× this → ${esc(r.reroll.out)}${r.reroll.gold ? ` (${fmtGold(r.reroll.gold)})` : ""}`);
    const chainIds = new Set(runeData().recipes.runeUpgrades.map((x) => x.id));
    const uses = r.uses.map((u) => (!recipeIdx.has(u) ? u : chainIds.has(u) ? `Upgrades to ${recipeIdx.get(u).out.n}` : recipeIdx.get(u).out.n));
    const meta = [r.kind, r.season || r.rarity, r.legacy ? "Legacy" : ""].filter(Boolean).join(" · ");
    const search = [r.name, r.kind, r.rarity, r.season, r.legacy ? "legacy" : "", r.phrase, Engine.renderText(r.t || "").plain, ...r.drops.map(bossLabel), ...uses].join(" ").toLowerCase();
    return `<article class="rcard rcard--${r.kind === "Ritual" ? "ritual" : "invoke"}${r.legacy ? " rcard--legacy" : ""}" id="rune-${esc(r.id)}" data-kind="${r.kind}" data-season="${r.season ? "s15" : r.legacy ? "legacy" : "core"}" data-search="${esc(search)}">
      <div class="rcard__head">
        ${r.ic ? `<span class="ico-well ico-well--rune">${itemIcon(r.ic)}</span>` : ""}
        <div><span class="card__meta">${esc(meta)}</span>
        <span class="rcard__name">${esc(r.name)}</span></div>
      </div>
      <p class="rcard__text">${text}</p>
      <dl class="rcard__facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(String(v))}</dd>`).join("")}</dl>
      ${src.length ? `<div class="rcard__block"><span class="rcard__label">GET IT</span>${src.map((x) => `<div class="rcard__line">${x}</div>`).join("")}</div>` : ""}
      ${uses.length ? `<div class="rcard__block"><span class="rcard__label">USED IN</span><div class="rcard__line">${esc(uses.join(" · "))}</div></div>` : ""}
    </article>`;
  }

  function runewordCardHTML(rw) {
    const key = rw.items.map((id) => "i:" + id).find((k) => state.byId.has(k));
    const rec = key && state.byId.get(key);
    const counts = {};
    for (const id of rw.runes) counts[id] = (counts[id] || 0) + 1;
    const chips = Object.entries(counts).map(([id, q]) => runeChip(id, q)).join('<span class="rplus">+</span>');
    const effect = rec ? cardSummaryHTML(rec) : '<span class="gt-unk">Effect not found in item data.</span>';
    const search = [rw.name, rw.season, ...rw.bases, ...rw.runes.map((id) => runeIdx.get(id).name), rec ? rec.search : ""].join(" ").toLowerCase();
    return `<article class="rcard rcard--word"${key ? ` data-key="${esc(key)}" tabindex="0"` : ""} data-search="${esc(search)}">
      <span class="card__meta">Classic Runeword · ${esc(rw.station)}${rw.season ? " · " + esc(rw.season) : ""}</span>
      <span class="rcard__name">${esc(rw.name)}</span>
      <div class="recipe__flow"><span class="ing">Base</span><span class="rplus">+</span>${chips}</div>
      <p class="rcard__text">${effect}</p>
      <dl class="rcard__facts"><dt>BASES</dt><dd>${esc(rw.bases.join(", "))}</dd>${rw.ancestral ? "<dt>ANCESTRAL</dt><dd>Use an Ancestral base for an Ancestral runeword</dd>" : ""}</dl>
      ${key ? '<span class="hint">Hover for the full tooltip.</span>' : ""}
    </article>`;
  }

  function builderHTML() {
    const cur = runeData().runes.filter((r) => !r.legacy);
    const opt = (kind, sel) => cur.filter((r) => r.kind === kind).map((r) => `<option value="${esc(r.id)}"${r.id === sel ? " selected" : ""}>${esc(r.name)}${r.season ? " (S15)" : ""} · ${r.kind === "Ritual" ? "+" : ""}${r.offering}</option>`).join("");
    const a = runeIdx.get(runeState.a) || cur.find((r) => r.kind === "Ritual");
    const b = runeIdx.get(runeState.b) || cur.find((r) => r.kind === "Invocation");
    runeState.a = a.id; runeState.b = b.id;
    const per = a.offering ? Math.ceil(b.offering / a.offering) : Infinity;
    return `<div class="panel builder">
      <h2 class="panel__title">SOCKET RUNEWORD BUILDER</h2>
      <p class="hint">Put one Rune of Ritual and one Rune of Invocation in a 2-socket Helm, Chest, Pants or 2H Weapon. The Ritual gains Offering when its condition happens; once there's enough, the Invocation fires.</p>
      <div class="builder__pick">
        <label class="field"><span>Ritual (condition)</span><select class="input" data-pick="a">${opt("Ritual", a.id)}</select></label>
        <label class="field"><span>Invocation (effect)</span><select class="input" data-pick="b">${opt("Invocation", b.id)}</select></label>
      </div>
      <div class="builder__out">
        <p class="builder__name">${esc(a.phrase || a.name)} ${esc(b.phrase || b.name)}</p>
        <p><span class="gt-rune-ritual">When:</span> ${Engine.renderText(a.t).html} <span class="mono hint">(+${a.offering} Offering)</span></p>
        <p><span class="gt-rune-invoke">Then:</span> ${Engine.renderText(b.t).html} <span class="mono hint">(needs ${b.offering}${b.cd ? `, ${b.cd}s cooldown` : ""})</span></p>
        <p class="mono hint">≈ ${Number.isFinite(per) ? per : "∞"} trigger${per === 1 ? "" : "s"} of ${esc(a.name)} per ${esc(b.name)} cast${b.overflow ? ` · overflow: ${esc(b.overflow)}` : ""}</p>
      </div>
    </div>`;
  }

  function cubeStepHTML(n, r, note) {
    const bases = r.bases.length ? `${r.bases.length} bases: ${r.bases.join(" · ")}` : "Any slot";
    return `<div class="cube-step"><p class="eyebrow">Step ${n}</p>${recipeHTML(r)}<p class="hint mono">${esc(bases)}${note ? ` // ${esc(note)}` : ""}</p></div>`;
  }

  function recipesTabHTML() {
    const rc = runeData().recipes;
    const sec = (title, sub, body) => `<section class="rsec"><h2 class="rsec__title">${title}</h2>${sub ? `<p class="hint">${sub}</p>` : ""}${body}</section>`;
    const splinters = rc.splinters.map((c) => `<div class="recipe" data-search="${esc(c.tiers.join(" ").toLowerCase())} splinter ${esc(c.boss.toLowerCase())}">
        <div class="recipe__flow">${c.tiers.map((t, i) => `<span class="ing${i === c.tiers.length - 1 ? " ing--out" : ""}">${i < c.tiers.length - 1 ? `<span class="rchip__q">${c.q}×</span>` : ""}${esc(t)}</span>`).join('<span class="rarrow">→</span>')}</div>
        <div class="recipe__meta mono">${esc(c.station)} · ${esc(c.boss)} · Season 15</div></div>`).join("");
    return [
      `<p class="rnote">No recipe crafts the Season 15 uniques. They drop from the Baal, Mephisto and Diablo capstone dungeons: <a href="#/database" data-source="capstone">see them in the Database</a>.</p>`,
      sec("Season 15 rune chain", "Horadric Cube, hidden recipes. Combine runes to climb the chain toward Jah, Ber, Lo and Sol.", rc.runeUpgrades.map(recipeHTML).join("")),
      sec("Legendary rune recipes", "Horadric Cube: one specific rune plus 5 Rare and 5 Legendary runes of any kind gives the rune you want.", rc.legendaryRunes.map(recipeHTML).join("")),
      sec("Mythic crafting", "Resplendent Sparks plus three runes per slot at the Jeweler, or a random Mythic at the Blacksmith (Torment only).", rc.mythic.map(recipeHTML).join("")),
      rc.cube && rc.cube.unique ? sec("Horadric Cube: Unique → Mythic",
        "Two steps. A white item with no affixes becomes a Unique of the same base; use an Ancestral (item power 900) base to get a 900 Unique. Only a 900 Unique can be upgraded to Mythic: it keeps all its affixes, promoted to their maximum values, and becomes item power 900.",
        cubeStepHTML("1", rc.cube.unique, rc.cube.unique.ancestral ? "Each base has a normal and an Ancestral recipe." : "") +
        (rc.cube.mythic ? cubeStepHTML("2", rc.cube.mythic, "") : "")) : "",
      sec("Unique crafting", "", rc.unique.map(recipeHTML).join("")),
      sec("Season 15 Soul Splinters", "Horadric Cube, hidden recipes: 5 of a tier make the next tier.", splinters + (rc.wirt ? recipeHTML(rc.wirt) : "")),
    ].join("");
  }

  function renderRunes() {
    const d = runeData();
    if (!d) { els.runesBody.innerHTML = '<p class="empty mono">NO RUNE DATA // run python3 tools/build_index.py</p>'; return; }
    if (!runeIdx) indexRunes();
    els.runeTabs.querySelectorAll("[data-rtab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.rtab === runeState.tab)));
    els.rowRuneKind.hidden = runeState.tab !== "runes";
    if (runeState.tab === "runes") {
      els.runesBody.innerHTML = `<div class="rgrid">${d.runes.map(runeCardHTML).join("")}</div>`;
    } else if (runeState.tab === "runewords") {
      els.runesBody.innerHTML = builderHTML() +
        `<h2 class="rsec__title">Classic runewords</h2><p class="hint">${esc(d.notes[2] || "")}</p>` +
        `<div class="rgrid">${d.runewords.map(runewordCardHTML).join("")}</div>`;
    } else {
      els.runesBody.innerHTML = recipesTabHTML();
    }
    els.runesSource.innerHTML = `Game data: d4data recipes and runes. Drop locations: <a href="${esc(d.source)}" target="_blank" rel="noopener">${esc(d.sourceName)}</a> (updated ${esc(d.sourceUpdated)}).`;
    applyRuneFilters();
  }

  function applyRuneFilters() {
    const tokens = state.filters.tokens;
    let shown = 0, total = 0;
    els.runesBody.querySelectorAll("[data-search]").forEach((el) => {
      if (el.parentElement.closest("[data-search]")) return; // recipe nested in a rune card
      total++;
      let ok = tokens.every((t) => el.dataset.search.includes(t));
      if (ok && runeState.tab === "runes" && runeState.kind !== "all") {
        const k = runeState.kind;
        ok = k === "s15" || k === "legacy" ? el.dataset.season === k : el.dataset.kind === k;
      }
      el.hidden = !ok;
      if (ok) shown++;
    });
    els.rowRuneKind.querySelectorAll("[data-rkind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.rkind === runeState.kind)));
    els.runesCount.innerHTML = `<b>${shown}</b> / ${total} ${runeState.tab.toUpperCase()}${state.filters.q ? ` // QUERY "${esc(state.filters.q)}"` : ""}`;
  }

  function bindRunes() {
    els.viewRunes.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-rtab]");
      if (tab) { runeState.tab = tab.dataset.rtab; renderRunes(); return; }
      const kind = e.target.closest("[data-rkind]");
      if (kind) { runeState.kind = kind.dataset.rkind; applyRuneFilters(); return; }
      const chip = e.target.closest("[data-rune]");
      if (chip) {
        runeState.tab = "runes"; runeState.kind = "all";
        els.search.value = ""; state.filters.q = ""; state.filters.tokens = [];
        renderRunes();
        const el = document.getElementById("rune-" + chip.dataset.rune);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("is-flash"); setTimeout(() => el.classList.remove("is-flash"), 1400); }
        return;
      }
      const src = e.target.closest("[data-source]");
      if (src) { state.filters.source = src.dataset.source; state.mode = null; }
    });
    els.viewRunes.addEventListener("change", (e) => {
      const sel = e.target.closest("[data-pick]");
      if (sel) { runeState[sel.dataset.pick] = sel.value; renderRunes(); }
    });
  }

  /* ==========================================================
     4. Router + events
     ========================================================== */

  function route() {
    const h = location.hash.replace(/^#\/?/, "").split("?")[0];
    return ["database", "codex", "runes", "sandbox"].includes(h) ? h : "database";
  }

  const viewName = () => (state.view.mythic ? "mythic" : state.view.ip === IP.ancestral ? "ancestral" : "standard");

  /** Database-wide switch: Standard (850), Ancestral (900) or every unique as its crafted Mythic. */
  function setView(name) {
    if (viewName() === name) return;
    state.view.mythic = name === "mythic";
    state.view.ip = IP[name] || IP.standard;
    hideTooltip();
    buildRecords(Engine.codex);
    state.mode = null; // force the grid to re-render with the new numbers
    render();
  }

  function render() {
    hideTooltip();
    const view = route();
    document.querySelectorAll("[data-nav]").forEach((a) => {
      if (a.dataset.nav === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    // On narrow screens the nav scrolls sideways: keep the active tab visible.
    setTimeout(() => {
      const nav = document.querySelector(".nav"), cur = nav && nav.querySelector('[aria-current="page"]');
      if (!nav || !cur || nav.scrollWidth <= nav.clientWidth) return;
      const n = nav.getBoundingClientRect(), c = cur.getBoundingClientRect();
      nav.scrollLeft += c.left - n.left - (n.width - c.width) / 2;
    }, 0);
    els.viewCatalog.hidden = view === "sandbox" || view === "runes";
    els.viewSandbox.hidden = view !== "sandbox";
    els.viewRunes.hidden = view !== "runes";
    if (view === "sandbox") renderSandbox(); else if (view === "runes") renderRunes(); else renderCatalog(view);
    document.title = `${{ database: "Database", codex: "Aspect Codex", runes: "Runes & Recipes", sandbox: "Theorycraft Sandbox" }[view]} · Onosendai's Tool`;
  }

  function bindEvents() {
    window.addEventListener("hashchange", render);
    bindRunes();

    els.search.addEventListener("input", () => {
      const q = els.search.value.trim().toLowerCase();
      state.filters.q = q;
      state.filters.tokens = q ? q.split(/\s+/) : [];
      const v = route();
      if (v === "sandbox") location.hash = "#/database"; else if (v === "runes") applyRuneFilters(); else applyFilters();
    });

    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(tag)) { e.preventDefault(); els.search.focus(); els.search.select(); }
      else if (e.key === "Escape") {
        hideTooltip();
        if (document.activeElement === els.search && els.search.value) { els.search.value = ""; els.search.dispatchEvent(new Event("input")); }
      }
    });

    els.viewCatalog.addEventListener("click", (e) => {
      const p = e.target.closest(".pill[data-filter]");
      if (p && !p.disabled) { state.filters[p.dataset.filter] = p.dataset.value; applyFilters(); }
    });
    els.reset.addEventListener("click", () => {
      Object.assign(state.filters, { q: "", tokens: [], cls: "all", rarity: "all", slot: "all", source: "all", avail: "all", cat: "all" });
      els.search.value = "";
      applyFilters();
    });

    // Pins (anywhere)
    document.addEventListener("click", (e) => {
      const pin = e.target.closest("[data-pin]");
      if (pin) { e.stopPropagation(); togglePin(pin.dataset.pin); return; }
      const unpin = e.target.closest("[data-unpin]");
      if (unpin) togglePin(unpin.dataset.unpin);
      const aslot = e.target.closest("[data-aslot]");
      if (aslot) {
        const k = aslot.dataset.akey, s = aslot.dataset.aslot;
        if (state.sandbox.slot[k] === s) delete state.sandbox.slot[k]; else state.sandbox.slot[k] = s;
        try { localStorage.setItem(SB_KEY, JSON.stringify(state.sandbox)); } catch { /* ignore */ }
        renderSandbox();
        return;
      }
      const pk = e.target.closest("[data-pick]");
      if (pk && !pk.closest("#picker")) {
        const label = pk.dataset.label || (pk.querySelector(".sb-cell__label") || pk).textContent.trim();
        openPicker(pk.dataset.pick, label);
        return;
      }
      const legRm = e.target.closest("[data-legremove]");
      if (legRm) { delete state.sandbox.leg[legRm.dataset.legremove]; saveSandbox(); hideTooltip(); renderSandbox(); return; }
      const leg2 = e.target.closest("[data-leg2h]");
      if (leg2) {
        const en = state.sandbox.leg[leg2.dataset.leg2h];
        if (en) {
          en.two = !en.two;
          if (en.two) { delete state.sandbox.leg["w:off"]; const L = sbLayout(); if (L.weapons.off) unpinQuiet([L.weapons.off]); savePins(); }
        }
        saveSandbox(); renderSandbox();
        return;
      }
      if (e.target.closest("[data-dmgall]")) { state.sandbox.dmgOff = []; saveSandbox(); renderSandbox(); return; }
      if (e.target.closest("[data-torchremove]")) { state.sandbox.torch = false; saveSandbox(); renderSandbox(); return; }
      const setRm = e.target.closest("[data-setremove]");
      if (setRm) { state.sandbox.sets.splice(+setRm.dataset.setremove, 1); saveSandbox(); renderSandbox(); return; }
      const charmB = e.target.closest("[data-charm]");
      if (charmB) {
        const k = charmB.dataset.charm, r = state.byId.get(k);
        if (isCharm(k)) {
          state.sandbox.charms = state.sandbox.charms.filter((x) => x !== k);
          if (!equip(k, false)) state.sandbox.charms.push(k); // class can't use it as gear: keep it a charm
        } else if (uniqueRoom()) state.sandbox.charms.push(k);
        else toast(talismanUsed() >= charmSlots() ? `The Talisman is full (${charmSlots()} charm slots with a ${sealOf()[0]}).`
          : `Only ${uniqueLimit()} unique charm${uniqueLimit() > 1 ? "s" : ""} with a ${sealOf()[0]}${state.sandbox.torch ? " and the Hellfire Torch" : ""}.`);
        savePins(); saveSandbox(); renderSandbox();
        return;
      }
      const myth = e.target.closest("[data-mythic]");
      if (myth) {
        const k = myth.dataset.mythic, list = state.sandbox.mythic, i = list.indexOf(k);
        if (i >= 0) list.splice(i, 1); else list.push(k);
        try { localStorage.setItem(SB_KEY, JSON.stringify(state.sandbox)); } catch { /* ignore */ }
        renderSandbox();
      }
      const view = e.target.closest("[data-view]");
      if (view) setView(view.dataset.view);
    });

    // Tooltips: hover, keyboard focus, tap
    document.addEventListener("mouseover", (e) => {
      const card = e.target.closest("[data-key]");
      if (card && (card !== state.activeCard || els.tooltip.hidden)) showTooltip(card);
    });
    document.addEventListener("mouseout", (e) => {
      const card = e.target.closest("[data-key]");
      if (card && !card.contains(e.relatedTarget)) hideTooltip();
    });
    document.addEventListener("focusin", (e) => {
      const card = e.target.closest("[data-key]");
      if (card) showTooltip(card);
    });
    document.addEventListener("focusout", (e) => {
      if (e.target.closest("[data-key]")) hideTooltip();
    });
    let tapWasOpen = false;
    document.addEventListener("pointerdown", (e) => {
      const card = e.target.closest("[data-key]");
      tapWasOpen = Boolean(card && card === state.activeCard && !els.tooltip.hidden);
    });
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-pin], [data-pick], [data-pval], .sb-cell__clear, .sb-cell__toggle")) return;
      const card = e.target.closest("[data-key]");
      if (!card) { hideTooltip(); return; }
      if (e.pointerType && e.pointerType !== "mouse" && tapWasOpen) hideTooltip(); else showTooltip(card);
    });
    window.addEventListener("scroll", () => state.activeCard && positionTooltip(state.activeCard), { passive: true });
    window.addEventListener("resize", () => state.activeCard && positionTooltip(state.activeCard));

    // Sandbox controls
    const saveSb = () => { try { localStorage.setItem(SB_KEY, JSON.stringify(state.sandbox)); } catch { /* ignore */ } };
    els.sbRoll.addEventListener("input", () => { state.sandbox.t = +els.sbRoll.value / 100; saveSb(); renderSandbox(); });
    els.sbRank.addEventListener("input", () => { state.sandbox.rank = +els.sbRank.value; saveSb(); renderSandbox(); });
    els.sbIp.addEventListener("input", () => { state.sandbox.ip = +els.sbIp.value; saveSb(); renderSandbox(); });
    els.sbAdd.addEventListener("change", () => {
      const v = els.sbAdd.value.trim();
      const cls = sandboxClass();
      const r = state.records.find((x) => optionLabel(x) === v) || state.records.find((x) => x.name.toLowerCase() === v.toLowerCase() && classOk(x, cls))
        || state.records.find((x) => x.name.toLowerCase() === v.toLowerCase());
      if (r && !state.pins.includes(r.key)) togglePin(r.key);
      els.sbAdd.value = "";
    });
    els.sbList.addEventListener("change", (e) => {
      const el = e.target;
      if (el.matches("[data-addset]")) {
        if (!el.value) return;
        if (talismanUsed() >= charmSlots()) toast(`The Talisman is full (${charmSlots()} charm slots with a ${sealOf()[0]}).`);
        else state.sandbox.sets.push({ p: el.value, a: ["", ""] });
        saveSandbox(); renderSandbox();
        return;
      }
      if (el.matches("[data-setaffix]")) {
        const x = state.sandbox.sets[+el.dataset.setaffix];
        if (x) x.a[+el.dataset.slot] = el.value;
        saveSandbox(); renderSandbox();
        return;
      }
      if (el.matches("[data-dmg]")) {
        const off = new Set(state.sandbox.dmgOff || []);
        if (el.checked) off.delete(el.dataset.dmg); else off.add(el.dataset.dmg);
        state.sandbox.dmgOff = [...off];
        saveSandbox(); renderSandbox();
        return;
      }
      if (el.matches("[data-gt]")) { state.sandbox.gt = +el.value; saveSandbox(); renderSandbox(); return; }
      if (!el.matches("[data-seal]")) return;
      state.sandbox.seal = el.value;
      saveSandbox();
      renderSandbox();
    });
    // A new class starts a new build: gear and charms from the old class are cleared (seal and the
    // roll / rank / item power settings stay). UNDO in the toast puts the old build back.
    els.sbClass.addEventListener("change", () => {
      const sb = state.sandbox;
      const had = state.pins.length || sb.charms.length || sb.sets.length || sb.torch || Object.keys(sb.leg).length || Object.keys(sb.sock || {}).length;
      const before = { pins: state.pins.slice(), sb: JSON.parse(JSON.stringify(sb)) };
      sb.cls = els.sbClass.value;
      if (had) {
        state.pins = [];
        Object.assign(sb, { charms: [], sets: [], torch: false, leg: {}, mythic: [], slot: {}, sock: {} });
        savePins();
        toast(`Class set to ${sb.cls || "Auto"}: gear and charms cleared.`, ["UNDO", () => {
          state.pins = before.pins; state.sandbox = before.sb;
          savePins(); saveSandbox(); renderSandbox();
        }]);
      }
      saveSandbox();
      renderSandbox();
    });
    els.sbClear.addEventListener("click", () => { state.pins = []; state.sandbox.charms = []; state.sandbox.sets = []; state.sandbox.torch = false; state.sandbox.leg = {}; state.sandbox.sock = {}; saveSandbox(); savePins(); renderSandbox(); state.mode = null; });
    els.sbShare.addEventListener("click", async () => {
      const url = `${location.origin}${location.pathname}#/sandbox?pins=${encodeURIComponent(state.pins.join(","))}${state.sandbox.cls ? "&cls=" + encodeURIComponent(state.sandbox.cls) : ""}${state.sandbox.charms.length ? "&charms=" + encodeURIComponent(state.sandbox.charms.join(",")) : ""}${state.sandbox.seal ? "&seal=" + state.sandbox.seal : ""}${state.sandbox.torch ? "&torch=1" : ""}${Object.keys(state.sandbox.leg).length ? "&leg=" + encodeURIComponent(Object.entries(state.sandbox.leg).map(([sp, e]) => [sp, e.a, e.two ? 1 : 0].join("~")).join(",")) : ""}${state.sandbox.sets.length ? "&sets=" + encodeURIComponent(state.sandbox.sets.map((x) => [x.p, ...x.a].join("~")).join(",")) : ""}${Object.keys(state.sandbox.sock).length ? "&sock=" + encodeURIComponent(Object.entries(state.sandbox.sock).map(([sp, v]) => [sp, ...v].join("~")).join(",")) + "&gt=" + state.sandbox.gt : ""}`;
      try { await navigator.clipboard.writeText(url); els.sbShare.textContent = "COPIED"; }
      catch { window.prompt("Copy this link:", url); }
      setTimeout(() => (els.sbShare.textContent = "COPY LINK"), 1400);
    });
    els.sbList.addEventListener("toggle", (e) => {
      if (e.target.matches("details[data-raw]") && e.target.open) loadRaw(e.target);
    }, true);
  }

  /** Quick-add suggestions: only what the build's class can use. */
  let quickAddCls = null;
  function fillQuickAdd() {
    const cls = sandboxClass();
    if (cls === quickAddCls) return;
    quickAddCls = cls;
    els.sbOptions.innerHTML = state.records.filter((r) => classOk(r, cls)).map((r) => `<option value="${esc(optionLabel(r))}">`).join("");
    els.sbAdd.placeholder = cls ? `type a name (${cls} and all-class items)…` : "type a name…";
  }
  const optionLabel = (r) => `${r.name} (${r.kind === "aspect" ? "Aspect" : r.rarity}${r.classes.length ? ", " + r.classLabel : ""})`;

  /* ==========================================================
     5. Boot
     ========================================================== */

  function showAlert(html) { els.alert.innerHTML = html; els.alert.hidden = false; }

  // The raw data/ folders (~575 MB) aren't deployed to GitHub Pages: probe once, hide the panels if absent.
  let rawAvailable = null; // null = unknown yet (panel shown), true/false after the probe
  function probeRaw() {
    fetch(RAW.stl + "AttributeDescriptions.stl.json", { method: "HEAD" })
      .then((res) => res.ok, () => false)
      .then((ok) => {
        rawAvailable = ok;
        if (!ok && !els.viewSandbox.hidden) renderSandbox();
      });
  }

  async function boot() {
    bindEvents();
    probeRaw();
    let codex;
    try {
      const res = await fetch(INDEX_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      codex = await res.json();
    } catch (err) {
      els.hudStatus.textContent = "DECK OFFLINE";
      showAlert(
        location.protocol === "file:"
          ? `Browsers block <code>fetch()</code> on <code>file://</code> pages. Serve the folder: <code>python3 -m http.server</code>, then open <code>http://localhost:8000</code>.`
          : `Couldn't load <code>${INDEX_URL}</code> (${esc(err.message)}). Build it with <code>python3 tools/build_index.py</code>.`
      );
      return;
    }

    const t0 = performance.now();
    Engine.load(codex);
    buildRecords(codex);
    loadPins();
    fillQuickAdd();
    const ms = Math.round(performance.now() - t0);

    const c = codex.meta.counts;
    const h = state.curation.hidden;
    const hiddenTotal = Object.values(h).reduce((a, b) => a + b, 0);
    els.hudStatus.innerHTML =
      `DECK ONLINE // <b>${state.curation.visible.length}</b> UNIQUES · <b>${c.aspects}</b> ASPECTS · <b>${c.affixes}</b> AFFIXES · <b>${c.powers}</b> POWER TABLES // FILTERED ${hiddenTotal} (${h.charm} CHARM · ${h.slotSwap} SLOT-SWAP · ${h.duplicate} DUP · ${h.nonGear} NON-GEAR · ${h.internal} QA) // INDEX ${esc(codex.meta.generated)} // MAPPED IN ${ms}MS`;
    updatePinBadge();
    render();
  }

  boot();
})();
