#!/usr/bin/env python3
"""check-design.py - drift between the source tree and the DESIGN.md token block.

Narrow on purpose: only what is mechanically unambiguous. Stdlib only, Python 3.8+.

  python3 check-design.py [--root DIR] [--json] [--quiet]
  python3 check-design.py --init [--root DIR]   draft a token block from the code

Exit: 0 clean, 1 drift, 2 no paper / no or empty token block.

Token block, an HTML comment anywhere in DESIGN.md. Values are whitespace-separated,
quotes keep font names whole, // starts a comment. Every colour in any key is part
of the palette; alpha variants of a palette colour are allowed.

  <!-- TOKENS
  ground:  #F7F7F5 #FFFFFF          // backgrounds (audit.py contrast pairs ink x ground)
  ink:     #14161A #5B6068          // text colours
  accent:  #8C5A3C
  color:   #EDEDED                  // any other allowed colour
  radius:  0 4 8 12 9999
  spacing: 0 2 4 8 12 16 24 32 48 64 96 128
  fonts:   Inter "Instrument Serif"
  tailwind: stone                   // optional: default Tailwind colour families allowed
  allow:   gradient-text            // optional: rules the paper deliberately switches off
  legacy:  #8C5A3C 6                // optional: retrofit leftovers, tolerated and counted, not failed
  skip:    app/archive demo.css     // optional: folders (name or path) or files that are not the product
  -->
"""

import argparse
import colorsys
import json
import math
import os
import re
import sys
from collections import Counter
from pathlib import Path

SOURCE_EXT = {".css", ".scss", ".sass", ".less", ".html", ".htm",
              ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".astro"}
MARKUP_EXT = {".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro"}
SLASH_COMMENT_EXT = {".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".astro",
                     ".scss", ".sass", ".less"}
SKIP_DIRS = {"node_modules", "dist", "build", "out", "coverage", "vendor",
             "public/assets", "public/build"}
EXTRA_SKIP = set()  # --skip: archives, demos, video projects that are not the product
SKIP_FILE = re.compile(r"\.(min|test|spec|stories|d)\.[a-z]+$")
NOT_A_COLOR = re.compile(r"(?:href|to|id|for)=[\"']$|url\($")  # #add, #fade are anchors

COLOR_RE = re.compile(
    r"(?<![\w&#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])"
    r"|\b(?:rgba?|hsla?|oklch)\([^()]*\)")
RADIUS_RE = re.compile(
    r"(?<![\w-])(?:border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius"
    r"|border(?:Top|Bottom|Start|End)?(?:Left|Right|Start|End)?Radius)\s*:\s*([^;}\n]+)")
SPACING_RE = re.compile(
    r"(?<![\w-])(?:padding|margin|gap|row-gap|column-gap|rowGap|columnGap)"
    r"(?:-?(?:top|right|bottom|left|inline|block|Top|Right|Bottom|Left|Inline|Block)"
    r"(?:-?(?:start|end|Start|End))?)?\s*:\s*([^;}\n]+)")
# font-family declarations, plus any custom property whose value is a font stack
FONT_RE = re.compile(r"(?<![\w-])(?:font-family|fontFamily|--[\w-]+(?=\s*:[^;}\n]*,[^;}\n]*"
                     r"\b(?:serif|sans-serif|monospace|system-ui|cursive)\b))\s*:\s*([^;}\n]+)")
FONT_FACE_RE = re.compile(r"@font-face\s*\{[^}]*\}")  # declaring a face is not using it
TW_RADIUS_RE = re.compile(r"\brounded(?:-[a-z]{1,2})?-\[([^\]\s]+)\]")
TW_SPACING_RE = re.compile(r"(?<![\w-])-?(?:[pm][trblxyse]?|gap(?:-[xy])?|space-[xy])-\[([^\]\s]+)\]")
TW_COLOR_RE = re.compile(
    r"(?<![\w-])(?:bg|text|border(?:-[trblxy])?|ring|outline|fill|stroke|from|via|to|shadow"
    r"|accent|caret|decoration|divide|placeholder)-(slate|gray|zinc|neutral|stone|red|orange"
    r"|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink"
    r"|rose)-(?:50|[1-9]00|950)\b")
GRADIENT_TEXT_RE = re.compile(
    r"background-clip\s*:\s*text|backgroundClip\s*:\s*['\"]text|\bbg-clip-text\b")
EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F2FF]")
ANIM_RE = re.compile(r"@keyframes|(?<![\w-])animation\s*:\s*(?!none)|\banimate-(?!none\b)[a-z]")
GATE_RE = re.compile(r"prefers-reduced-motion|\bmotion-(?:reduce|safe):|useReducedMotion|reducedMotion")

NEUTRAL_WORDS = {"0", "auto", "inherit", "initial", "unset", "none", "revert",
                 "revert-layer", "transparent", "currentcolor", "!important"}
# A fallback stack is not a brand decision; it keeps text on screen when the webfont fails.
GENERIC_FONTS = {
    "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "math",
    "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica",
    "helvetica neue", "arial", "georgia", "times new roman", "times", "courier",
    "courier new", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded",
    "menlo", "monaco", "consolas", "sf mono", "dejavu sans", "liberation sans",
    "liberation mono", "noto sans", "noto color emoji", "emoji", "apple color emoji",
    "segoe ui emoji", "segoe ui symbol", "oxygen", "ubuntu", "cantarell", "fira sans",
    "droid sans", "liberation serif", "sfmono-regular", "dejavu sans mono", "dejavu serif"}

SEVERITY = {"gradient-text": "P0", "hex-outside-palette": "P1", "tailwind-palette": "P1",
            "font-outside-paper": "P1", "emoji-ui": "P1", "motion-ungated": "P1",
            "radius-outside-scale": "P2", "spacing-outside-scale": "P2"}
FIX = {
    "hex-outside-palette": "use a palette colour from DESIGN.md §2, or amend the palette",
    "tailwind-palette": "use the project's colour tokens, or list the family under tailwind:",
    "radius-outside-scale": "use a radius from DESIGN.md §6",
    "spacing-outside-scale": "use a step from DESIGN.md §4, or amend the scale",
    "font-outside-paper": "use a face from DESIGN.md §3",
    "gradient-text": "solid ink; emphasis via size or weight",
    "emoji-ui": "a drawn icon from one set, or no icon",
    "motion-ungated": "add @media (prefers-reduced-motion: reduce): strip transform, keep opacity",
}


# ---------------------------------------------------------------- colour maths

def _lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gam(c):
    c = max(0.0, min(1.0, c))
    return 255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)


def _num(tok, scale=1.0):
    tok = tok.strip()
    if tok in ("none", ""):
        return 0.0
    if tok.endswith("%"):
        return float(tok[:-1]) / 100 * scale
    return float(re.sub(r"(deg|turn|rad)$", "", tok))


def parse_color(s):
    """CSS colour literal -> (r, g, b, a) with r,g,b 0..255 and a 0..1, or None."""
    s = s.strip().lower()
    try:
        if s.startswith("#"):
            h = s[1:]
            if len(h) in (3, 4):
                h = "".join(c * 2 for c in h)
            r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
            return r, g, b, (int(h[6:8], 16) / 255 if len(h) == 8 else 1.0)
        m = re.fullmatch(r"(rgba?|hsla?|oklch)\((.*)\)", s)
        if not m:
            return None
        fn, body = m.groups()
        if "var(" in body or "from " in body:
            return None
        main, _, alpha = body.partition("/")
        parts = [p for p in re.split(r"[\s,]+", main.strip()) if p]
        if len(parts) == 4 and not alpha:
            parts, alpha = parts[:3], parts[3]
        a = _num(alpha, 1.0) if alpha.strip() else 1.0
        if fn.startswith("rgb"):
            r, g, b = (_num(p, 255) for p in parts)
            return r, g, b, a
        if fn.startswith("hsl"):
            h = _num(parts[0]) / 360 % 1
            rr, gg, bb = colorsys.hls_to_rgb(h, _num(parts[2], 1), _num(parts[1], 1))
            return rr * 255, gg * 255, bb * 255, a
        L, C, H = _num(parts[0], 1.0), _num(parts[1], 0.4), math.radians(_num(parts[2]))
        if not parts[0].endswith("%") and L > 1:
            L /= 100
        A, B = C * math.cos(H), C * math.sin(H)
        l_, m_, s_ = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, \
                     (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, \
                     (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
        return (_gam(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
                _gam(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
                _gam(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_), a)
    except (ValueError, IndexError):
        return None


def to_hex(rgba):
    return "#%02x%02x%02x" % tuple(int(round(max(0, min(255, c)))) for c in rgba[:3])


def oklch(rgba):
    """(r, g, b, a) -> (L 0..1, C, H degrees)."""
    r, g, b = (_lin(c) for c in rgba[:3])
    l_ = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m_ = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s_ = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360


def luminance(rgba):
    r, g, b = (_lin(c) for c in rgba[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg):
    if fg[3] < 1:  # composite translucent text over its background
        fg = tuple(fg[i] * fg[3] + bg[i] * (1 - fg[3]) for i in range(3)) + (1.0,)
    a, b = sorted((luminance(fg), luminance(bg)), reverse=True)
    return (a + 0.05) / (b + 0.05)


def is_neutral_overlay(rgba):
    """Translucent pure black/white: shadows and scrims, not palette decisions."""
    return rgba[3] < 1 and (max(rgba[:3]) < 1 or min(rgba[:3]) > 254)


# ---------------------------------------------------------------- source walking

def iter_sources(root, exts=SOURCE_EXT):
    for dirpath, dirnames, filenames in os.walk(root):
        rel = Path(dirpath).relative_to(root).as_posix()
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".")
                             and d not in SKIP_DIRS and d not in EXTRA_SKIP
                             and (d if rel == "." else f"{rel}/{d}") not in EXTRA_SKIP
                             and (d if rel == "." else f"{rel}/{d}") not in SKIP_DIRS)
        for fn in sorted(filenames):
            p = Path(dirpath) / fn
            if p.suffix.lower() in exts and not SKIP_FILE.search(fn) \
                    and (fn if rel == "." else f"{rel}/{fn}") not in EXTRA_SKIP:
                yield p


def _blank(m):
    return re.sub(r"[^\n]", " ", m.group(0))


def read_clean(path):
    """File text with comments blanked out; line numbers stay intact."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    text = re.sub(r"/\*.*?\*/|<!--.*?-->", _blank, text, flags=re.S)
    if path.suffix.lower() in SLASH_COMMENT_EXT:
        text = re.sub(r"(?<![:\w\"'/\\])//[^\n]*", _blank, text)
    return text


def lengths(value):
    """Yield (raw, px or None) for each length in a CSS value; rem counts 16px."""
    for part in re.split(r"[\s,]+", value.replace("!important", " ")):
        part = part.strip("()'\"`{}")
        m = re.fullmatch(r"-?(\d*\.?\d+)(px|rem|)", part)
        if m:
            yield part, float(m.group(1)) * (16 if m.group(2) == "rem" else 1)
        elif part and part.lower() not in NEUTRAL_WORDS:
            yield part, None


def font_names(value):
    for raw in re.findall(r'"[^"]*"|\'[^\']*\'|[^,]+', value):
        name = raw.strip().strip("\"'`{}()").strip().strip("\"'").lower()
        if (len(name) >= 3 and name not in GENERIC_FONTS and name not in NEUTRAL_WORDS
                and "(" not in name and not name.startswith("--")
                and not re.fullmatch(r"[\d.]+(px|rem|em|%)?", name)):
            yield name


def extract(root):
    """One pass over the tree. Returns (records, n_files, anim_files, gated)."""
    records, anim, gated, n = [], set(), False, 0
    for path in iter_sources(root):
        n += 1
        text = read_clean(path)
        rel = path.relative_to(root).as_posix()
        markup = path.suffix.lower() in MARKUP_EXT
        if ANIM_RE.search(text):
            anim.add(rel)
        gated = gated or bool(GATE_RE.search(text))
        face_lines = {text.count("\n", 0, m.start()) + 1 + k for m in FONT_FACE_RE.finditer(text)
                      for k in range(m.group(0).count("\n") + 1)}
        for i, line in enumerate(text.splitlines(), 1):
            def rec(kind, raw, val=None):
                records.append({"kind": kind, "file": rel, "line": i, "raw": raw, "val": val})
            for m in COLOR_RE.finditer(line):
                c = parse_color(m.group(0))
                if c and not is_neutral_overlay(c) and not NOT_A_COLOR.search(line[:m.start()]):
                    rec("color", m.group(0), c)
            for m in TW_COLOR_RE.finditer(line):
                rec("tw-color", m.group(0), m.group(1))
            for rx, kind in ((RADIUS_RE, "radius"), (TW_RADIUS_RE, "radius"),
                             (SPACING_RE, "spacing"), (TW_SPACING_RE, "spacing")):
                for m in rx.finditer(line):
                    for raw, px in lengths(m.group(1)):
                        if px:  # 0 is never drift
                            rec(kind, raw, abs(px))
            for m in FONT_RE.finditer(line) if i not in face_lines else ():
                for name in font_names(m.group(1)):
                    rec("font", name)
            if GRADIENT_TEXT_RE.search(line):
                rec("gradient-text", "background-clip: text")
            if markup:
                for e in EMOJI_RE.findall(line):
                    rec("emoji", e)
    return records, n, anim, gated


# ---------------------------------------------------------------- the paper

def find_paper(root):
    for c in ("DESIGN.md", "docs/DESIGN.md", "design.md"):
        if (root / c).is_file():
            return root / c
    return None


def parse_tokens(text):
    m = re.search(r"<!--\s*TOKENS(.*?)-->", text, re.S)
    if not m:
        return None
    tokens = {}
    for line in m.group(1).splitlines():
        line = re.sub(r"(^|\s)//.*$", "", line).strip()
        key, sep, rest = line.partition(":")
        if sep and rest.strip():
            tokens[key.strip().lower()] = [p.strip("\"'") for p in
                                           re.findall(r'"[^"]*"|\'[^\']*\'|\S+', rest)]
    return tokens


def palette_of(tokens):
    return [c for k, v in tokens.items() if k != "legacy" for x in v if x.startswith("#")
            for c in [parse_color(x)] if c]


def check(records, anim, gated, tokens):
    legacy = {}
    palette = palette_of(tokens)
    radii = {px for v in tokens.get("radius", []) for _, px in lengths(v) if px is not None}
    spacing = {px for v in tokens.get("spacing", []) for _, px in lengths(v) if px is not None}
    fonts = {f.lower() for f in tokens.get("fonts", [])}
    tw_ok = {f.lower() for f in tokens.get("tailwind", [])}
    allow = set(tokens.get("allow", []))
    old = tokens.get("legacy", [])
    old_colors = [c for x in old if x.startswith("#") for c in [parse_color(x)] if c]
    old_nums = {px for v in old for _, px in lengths(v) if px is not None}
    old_fonts = {f.lower() for f in old if not f.startswith("#") and not re.match(r"[\d.]", f)}
    findings = []

    def add(rule, r, value=None):
        k = r.get("kind")
        if (k == "color" and any(max(abs(r["val"][i] - p[i]) for i in range(3)) <= 2 for p in old_colors)
                or k in ("radius", "spacing") and r["val"] in old_nums or k == "font" and r["raw"] in old_fonts):
            legacy[rule] = legacy.get(rule, 0) + 1
        elif rule not in allow:
            findings.append({"rule": rule, "severity": SEVERITY[rule], "file": r["file"],
                             "line": r["line"], "value": value or r["raw"], "fix": FIX[rule]})

    for r in records:
        k = r["kind"]
        if k == "color" and palette:
            if not any(max(abs(r["val"][i] - p[i]) for i in range(3)) <= 2 for p in palette):
                add("hex-outside-palette", r)
        elif k == "tw-color" and palette and r["val"] not in tw_ok:
            add("tailwind-palette", r)
        elif k == "radius" and radii and r["val"] not in radii:
            add("radius-outside-scale", r)
        elif k == "spacing" and spacing and r["val"] not in spacing:
            add("spacing-outside-scale", r)
        elif k == "font" and fonts and not any(f in r["raw"] or r["raw"] in f for f in fonts):
            add("font-outside-paper", r)
        elif k == "gradient-text":
            add("gradient-text", r)
        elif k == "emoji":
            add("emoji-ui", r)
    if anim and not gated:  # one global reduced-motion rule covers every file
        add("motion-ungated", {"file": ", ".join(sorted(anim)[:3]), "line": 0,
                               "raw": "no prefers-reduced-motion anywhere in the project"})
    check.legacy = legacy  # retrofit leftovers: counted, never failed
    return findings


def draft_tokens(records):
    """Token block from what the code uses: repeated values in, one-offs listed as suspects."""
    colors = Counter(to_hex(r["val"]) for r in records if r["kind"] == "color")
    radii = Counter(r["val"] for r in records if r["kind"] == "radius")
    space = Counter(r["val"] for r in records if r["kind"] == "spacing")
    fonts = Counter(r["raw"] for r in records if r["kind"] == "font")
    fmt = lambda v: ("%g" % v)  # noqa: E731
    out = ["<!-- TOKENS"]
    for key, cnt, sort in (("color", colors, lambda kv: -kv[1]),
                           ("radius", radii, lambda kv: kv[0]),
                           ("spacing", space, lambda kv: kv[0]),
                           ("fonts", fonts, lambda kv: -kv[1])):
        keep = [k for k, c in sorted(cnt.items(), key=sort) if c > 1]
        once = [k for k, c in sorted(cnt.items(), key=sort) if c == 1]
        show = (lambda k: fmt(k) if isinstance(k, float) else
                (f'"{k}"' if " " in k else k))
        out.append(f"{key}: " + " ".join(show(k) for k in keep))
        if once:
            out.append(f"// {key} used once, likely accidents: " + " ".join(show(k) for k in once))
    out.append("-->")
    return "\n".join(out)


DEFAULT_BLOCK = """<!-- TOKENS
ground:     // page and surface colours
ink:        // text colours, 3-4 derived steps
accent:     // the one accent
color:      // every other allowed colour: semantic, lines
radius:     // e.g. 0 4 8 12 9999
spacing:    // e.g. 0 4 8 12 16 24 32 48 64 96 128
fonts:      // quote names with spaces
-->"""


def main():
    ap = argparse.ArgumentParser(description="Report drift from the DESIGN.md token block.")
    ap.add_argument("--root", default=".")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--quiet", action="store_true", help="print only on findings")
    ap.add_argument("--init", action="store_true", help="draft a token block from the code")
    ap.add_argument("--skip", default="", help="comma-separated folder names to ignore (archives, demos)")
    args = ap.parse_args()
    EXTRA_SKIP.update(filter(None, args.skip.split(",")))
    root = Path(args.root).resolve()

    def bail(status, msg):
        if args.json:
            print(json.dumps({"status": status, "message": msg}, indent=2))
        elif not args.quiet:
            print(msg)
        return 2

    if args.init:
        records = extract(root)[0]
        print(draft_tokens(records) if records else DEFAULT_BLOCK)
        print("Review before pasting into DESIGN.md: delete accidents, sort colours into "
              "ground / ink / accent / color. Never paste it unreviewed: that blesses the drift.")
        return 0

    paper = find_paper(root)
    if not paper:
        return bail("no-paper", "No DESIGN.md. The guardrail has no contract to enforce. "
                    "Write one (do-design-new) or draft it from the code (--init).")
    tokens = parse_tokens(paper.read_text(encoding="utf-8", errors="replace"))
    if not tokens or not any(tokens.get(k) for k in ("color", "ground", "ink", "accent",
                                                      "radius", "spacing", "fonts")):
        return bail("no-tokens", f"{paper.relative_to(root)} has no filled <!-- TOKENS --> "
                    "block. Draft one: check-design.py --init")

    EXTRA_SKIP.update(tokens.get("skip", []))  # the paper decides what counts as the product
    records, n, anim, gated = extract(root)
    findings = check(records, anim, gated, tokens)
    where = paper.relative_to(root)
    if args.json:
        print(json.dumps({"status": "findings" if findings else "clean", "paper": str(where),
                          "files_scanned": n, "count": len(findings), "legacy": check.legacy,
                          "findings": findings},
                         indent=2))
    elif not findings:
        if not args.quiet:
            print(f"clean: {n} files, no drift from {where}")
            if check.legacy:
                print("legacy values still in use (tolerated by the paper): " +
                      ", ".join(f"{k} x{v}" for k, v in sorted(check.legacy.items())))
    else:
        print(f"design drift: {n} files scanned against {where}")
        for sev in ("P0", "P1", "P2"):
            group = [f for f in findings if f["severity"] == sev]
            if group:
                print(f"\n{sev} ({len(group)})")
            for f in group[:25]:
                loc = f"{f['file']}:{f['line']}" if f["line"] else f["file"]
                print(f"  {loc}  {f['rule']}  {f['value']}\n      -> {f['fix']}")
            if len(group) > 25:
                print(f"  ... and {len(group) - 25} more (--json for all)")
        if check.legacy:
            print("\nlegacy values still in use (tolerated by the paper): " +
                  ", ".join(f"{k} x{v}" for k, v in sorted(check.legacy.items())))
        print("\nFix the drift, or amend DESIGN.md (§12) with a reason. Never edit the tokens "
              "to match accidents.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
