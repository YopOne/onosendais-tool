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
        //   Unique powers: Mythic Unique Potency, Item_Affix_Bonus_Per_Magic_Type(2) = x1.3,
        //   unless the formula applies it itself.
        if (v === UNKNOWN || (a.nb && a.nb.includes(head))) return v;
        if (a.lg) return v * (1 + (ctx.world.slotBonus || 0));
        if (!a.u) return v;
        const p = /UniquePotency/.test(formula) ? 0 : ctx.world.potency || 0;
        return v * (1 + p);
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
    filters: { q: "", tokens: [], cls: "all", rarity: "all", slot: "all", source: "all", avail: "all" },
    mode: null,
    activeCard: null,
    pins: [],
    sandbox: { t: 1, rank: 16, ip: 850, mythic: [], slot: {} }, // slot: aspect key -> "amulet" | "2h"
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

  function renderItem(it, base, crafted) {
    const orig = it.rarity === "Mythic";
    const c = Boolean(crafted && !orig);
    // Mythics are always item power 900. A crafted Mythic is made in the Cube from the same unique at 900
    // (Ancestral); it keeps every affix, promoted to its maximum value.
    // Crafted: every affix, including the unique power, is promoted to its maximum value.
    const pw = { ...base, mythic: orig, crafted: c, forceMax: c, potency: c ? Engine.mythicPotency() : 0, ip: orig || c ? IP.mythic : base.ip };
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
        flavor: "",
        power, imp: [], stats: [], mythicLines: [], crafted: false,
        raw: asp,
      });
    }

    for (const r of records) {
      const effectPlain = [r.power && r.power.plain, ...r.imp.map((x) => x.plain), ...r.stats.map((x) => x.plain)].filter(Boolean).join(" ");
      r.search = [r.name, r.type, r.slot, r.rarity, r.classes.length ? r.classes.join(" ") : "all classes", r.drop && r.drop.text, effectPlain]
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
    rowRarity: $("row-rarity"), rowSlot: $("row-slot"), rowView: $("row-view"),
    rowSource: $("row-source"), filterSource: $("filter-source"), rowAvail: $("row-avail"), filterAvail: $("filter-avail"), sourceNote: $("source-note"),
    viewRunes: $("view-runes"), runeTabs: $("rune-tabs"), rowRuneKind: $("row-rune-kind"), runesBody: $("runes-body"),
    runesCount: $("runes-count"), runesSource: $("runes-source"),
    count: $("result-count"), reset: $("filter-reset"), grid: $("catalog-grid"), empty: $("catalog-empty"),
    tooltip: $("tooltip"),
    sbRoll: $("sb-roll"), sbRollOut: $("sb-roll-out"), sbRank: $("sb-rank"), sbRankOut: $("sb-rank-out"), sbIp: $("sb-ip"), sbIpOut: $("sb-ip-out"),
    sbAdd: $("sb-add"), sbOptions: $("sb-options"), sbList: $("sb-list"), sbShare: $("sb-share"), sbClear: $("sb-clear"),
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
    const meta = r.kind === "aspect" ? "Legendary Aspect" : `${r.crafted ? "Mythic (crafted)" : r.rarity} · ${r.slot}`;
    const pinned = state.pins.includes(r.key);
    return `
      <article class="card card--${rarityClass(shownRarity(r))}" tabindex="0" data-key="${esc(r.key)}" aria-describedby="tooltip">
        <span class="card__meta">${r.kind === "item" ? slotIcon(r.slot) : ""}${esc(meta)}</span>
        <span class="card__name">${esc(r.name)}</span>
        <span class="card__effect">${cardSummaryHTML(r)}</span>
        <span class="card__foot">
          <span class="tag tag--cls">${esc(r.classLabel)}</span>
          ${r.kind === "item" ? `<span class="tag">${esc(r.type)}</span>` : r.maxRank ? `<span class="tag">Rank 1–${r.maxRank}</span>` : ""}
          ${r.drop ? `<span class="tag tag--drop" title="${esc(r.drop.text)}">${esc(r.drop.tag)}</span>` : ""}
        </span>
        <button type="button" class="pin" data-pin="${esc(r.key)}" aria-pressed="${pinned}" title="${pinned ? "Remove from" : "Add to"} Theorycraft Sandbox" aria-label="${pinned ? "Remove from" : "Add to"} sandbox">${pinned ? "✓" : "+"}</button>
      </article>`;
  }

  /* ---------- Tooltip ---------- */
  function tooltipInner(r, rendered = r) {
    const typeLine = r.kind === "aspect"
      ? `Legendary Aspect${r.classes.length ? " · " + r.classLabel : ""}`
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
      r.kind === "aspect" ? ["SLOT", "Amulet 150% · 2H weapon 200% (set it in the Sandbox)"] : null,
      rendered.crafted ? ["MYTHIC", "Crafted: base stats at max, unique power +Unique Potency"] : null,
      ["ID", r.id],
    ].filter(Boolean);

    return `
      <div class="tt__head">
        <div>
          <p class="tt__name">${esc(r.name)}</p>
          <p class="tt__type">${esc(typeLine)}</p>
        </div>
        ${rendered.tools || ""}
      </div>
      <div class="tt__body">${parts.join('<div class="tt__sep"></div>') || `<span class="gt-unk">No effect text in source data.</span>`}</div>
      <dl class="tt__foot">${foot.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  }

  function showTooltip(card) {
    const r = state.byId.get(card.dataset.key);
    if (!r) return;
    if (state.activeCard && state.activeCard !== card) state.activeCard.classList.remove("is-active");
    state.activeCard = card;
    card.classList.add("is-active");
    els.tooltip.className = `tooltip tooltip--${rarityClass(shownRarity(r))}`;
    els.tooltip.innerHTML = tooltipInner(r);
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
    els.rowRarity.hidden = mode === "codex";
    els.rowSlot.hidden = mode === "codex";
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
    for (const r of recs) if (r.slot) slotCounts[r.slot] = (slotCounts[r.slot] || 0) + 1;
    const slots = [...SLOT_ORDER.filter((s) => slotCounts[s]), ...Object.keys(slotCounts).filter((s) => !SLOT_ORDER.includes(s)).sort()];
    els.filterSlot.innerHTML = pill("slot", "all", "All", recs.length) + slots.map((s) => pill("slot", s, s, slotCounts[s], false, "", slotIcon(s))).join("");
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
    if (state.mode !== "codex") {
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
    const fromHash = /[?&]pins=([^&]+)/.exec(location.hash);
    if (fromHash) {
      state.pins = decodeURIComponent(fromHash[1]).split(",").filter((k) => state.byId.has(k));
      savePins();
      return;
    }
    try { state.pins = (JSON.parse(localStorage.getItem(PIN_KEY)) || []).filter((k) => state.byId.has(k)); } catch { state.pins = []; }
    try { Object.assign(state.sandbox, JSON.parse(localStorage.getItem(SB_KEY)) || {}); } catch { /* ignore */ }
    if (!Array.isArray(state.sandbox.mythic)) state.sandbox.mythic = [];
    if (!state.sandbox.slot || typeof state.sandbox.slot !== "object") state.sandbox.slot = {};
  }

  function savePins() {
    try { localStorage.setItem(PIN_KEY, JSON.stringify(state.pins)); } catch { /* ignore */ }
    updatePinBadge();
  }

  function updatePinBadge() {
    els.pinCount.textContent = state.pins.length;
    els.pinCount.hidden = !state.pins.length;
  }

  function togglePin(key) {
    const i = state.pins.indexOf(key);
    if (i >= 0) state.pins.splice(i, 1); else state.pins.push(key);
    savePins();
    document.querySelectorAll(`.pin[data-pin="${CSS.escape(key)}"]`).forEach((b) => {
      const on = state.pins.includes(key);
      b.setAttribute("aria-pressed", String(on));
      b.textContent = on ? "✓" : "+";
      b.title = `${on ? "Remove from" : "Add to"} Theorycraft Sandbox`;
    });
    if (!els.viewSandbox.hidden) renderSandbox();
  }

  function renderedAt(r, world) {
    if (r.kind === "aspect") {
      const slotBonus = aspectSlotBonus(state.sandbox.slot[r.key]);
      return { power: Engine.renderAffix(r.id, { ...world, slotBonus })[0] || null, imp: [], stats: [], mythicLines: [], crafted: false };
    }
    return renderItem(r.raw, world, state.sandbox.mythic.includes(r.key) && canCraftMythic(r));
  }

  const rawCache = new Map(); // key -> rendered raw-files HTML

  function renderSandbox() {
    const { t, rank } = state.sandbox;
    const ip = state.sandbox.ip || Engine.DEFAULT_IP;
    const openRaw = new Set([...els.sbList.querySelectorAll("details[data-raw][open]")].map((d) => d.dataset.raw));
    els.sbRoll.value = Math.round(t * 100);
    els.sbRank.value = rank;
    els.sbRollOut.textContent = `${Math.round(t * 100)}%`;
    els.sbRankOut.textContent = rank;
    els.sbIp.value = ip;
    els.sbIpOut.textContent = ip;

    if (!state.pins.length) {
      els.sbList.innerHTML = `<div class="sb-empty">NO ENTRIES PINNED<br>// press + on a card in the Database or Aspect Codex, or add one by name</div>`;
      return;
    }

    els.sbList.innerHTML = state.pins.map((key) => {
      const r = state.byId.get(key);
      if (!r) return "";
      const rendered = renderedAt(r, { t, rank, ip });
      const mythicBtn = canCraftMythic(r)
        ? `<button type="button" class="btn btn--mythic mono" data-mythic="${esc(key)}" aria-pressed="${rendered.crafted}" title="View the crafted Mythic version">MYTHIC</button>`
        : "";
      const slotBtns = r.kind === "aspect"
        ? Object.entries(ASPECT_SLOTS).map(([s, [label]]) => `<button type="button" class="btn btn--ghost mono" data-aslot="${s}" data-akey="${esc(key)}" aria-pressed="${state.sandbox.slot[key] === s}" title="Imprinted on ${s === "amulet" ? "an amulet (150%)" : "a two-handed weapon (200%)"}">${label}</button>`).join("")
        : "";
      rendered.tools = `<div class="sb-entry__tools">${slotBtns}${mythicBtn}<button type="button" class="btn btn--ghost mono" data-unpin="${esc(key)}">REMOVE</button></div>`;
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
    return `<button type="button" class="rchip ${cls}${r.season ? " rchip--s15" : ""}" data-rune="${esc(id)}" title="${esc(r.kind)} · ${esc(r.rarity)}${r.season ? " · " + esc(r.season) : ""}">${q > 1 ? `<span class="rchip__q">${q}×</span>` : ""}${esc(r.name)}</button>`;
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
      <span class="card__meta">${esc(meta)}</span>
      <span class="rcard__name">${esc(r.name)}</span>
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
      Object.assign(state.filters, { q: "", tokens: [], cls: "all", rarity: "all", slot: "all", source: "all", avail: "all" });
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
      if (card && card !== state.activeCard) showTooltip(card);
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
      if (e.target.closest("[data-pin]")) return;
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
      const r = state.records.find((x) => optionLabel(x) === v) || state.records.find((x) => x.name.toLowerCase() === v.toLowerCase());
      if (r && !state.pins.includes(r.key)) togglePin(r.key);
      els.sbAdd.value = "";
    });
    els.sbClear.addEventListener("click", () => { state.pins = []; savePins(); renderSandbox(); state.mode = null; });
    els.sbShare.addEventListener("click", async () => {
      const url = `${location.origin}${location.pathname}#/sandbox?pins=${encodeURIComponent(state.pins.join(","))}`;
      try { await navigator.clipboard.writeText(url); els.sbShare.textContent = "COPIED"; }
      catch { window.prompt("Copy this link:", url); }
      setTimeout(() => (els.sbShare.textContent = "COPY LINK"), 1400);
    });
    els.sbList.addEventListener("toggle", (e) => {
      if (e.target.matches("details[data-raw]") && e.target.open) loadRaw(e.target);
    }, true);
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
    els.sbOptions.innerHTML = state.records.map((r) => `<option value="${esc(optionLabel(r))}">`).join("");
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
