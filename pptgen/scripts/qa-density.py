#!/usr/bin/env python3
"""QA gate for a pptgen deck: one world, dense pages, readable type.

Checks every slide XML inside the .pptx and reports:
  units    text boxes with >=6 visible chars (a card, a step, a row, a banner...)
  chars    visible characters on the slide
  minpt    smallest font size used (pt)
  fonts    distinct typefaces on the slide
  frame    kicker/footer/badge present (by shape name or master use)
  offpage  shapes that leave the 13.333x7.5 canvas

Fails (exit 1) when a content slide has <3 units or <60 chars, when the deck
uses >2 typefaces overall, when body text goes below 12pt, or when a shape is
off-canvas. Cover / section / closing slides are exempt from density.

Usage:
  python3 qa-density.py deck.pptx [--min-units 3] [--min-chars 60] [--min-pt 12] [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
EMU = 914400
SLIDE_W = 12192000
SLIDE_H = 6858000

FRAME_HINTS = ("stay-badge", "stay-title", "fade:9-banner")
ROLE_HINTS = {
    "cover": ("cover",),
    "closing": ("closing", "谢谢", "感谢"),
}


def texts(el):
    return "".join(t.text or "" for t in el.findall(f".//{A}t"))


def box(el):
    xfrm = el.find(f".//{A}xfrm")
    if xfrm is None:
        return None
    off, ext = xfrm.find(f"{A}off"), xfrm.find(f"{A}ext")
    if off is None or ext is None:
        return None
    return int(off.get("x", 0)), int(off.get("y", 0)), int(ext.get("cx", 0)), int(ext.get("cy", 0))


def em_width(text: str) -> float:
    return sum(1.0 if "\u3000" <= ch <= "\u9fff" or "\uff00" <= ch <= "\uffef" else 0.55 for ch in text)


def estimate_overflow(sp) -> tuple[float, float] | None:
    """Rough (needed_height, box_height) in inches for a text shape; None when not applicable.
    Assumes line spacing 1.2 + 4pt paragraph space unless the XML says otherwise."""
    b = box(sp)
    if not b:
        return None
    _, _, cx, cy = b
    w_in, h_in = cx / EMU, cy / EMU
    if w_in <= 0.3 or h_in <= 0.15:
        return None
    body = sp.find(f"{P}txBody")
    if body is None:
        return None
    bp = body.find(f"{A}bodyPr")
    lins = rins = 91440
    tins = bins = 45720
    if bp is not None:
        lins = int(bp.get("lIns", lins)); rins = int(bp.get("rIns", rins)); tins = int(bp.get("tIns", tins)); bins = int(bp.get("bIns", bins))
        if bp.get("wrap") == "none":
            return None
    avail_w = w_in - (lins + rins) / EMU
    need = 0.0
    for para in body.findall(f"{A}p"):
        runs_ = para.findall(f".//{A}r")
        txt = "".join((r.findtext(f"{A}t") or "") for r in runs_)
        sizes = [int(r.find(f"{A}rPr").get("sz")) / 100 for r in runs_ if r.find(f"{A}rPr") is not None and r.find(f"{A}rPr").get("sz")]
        if not txt.strip():
            continue
        fs = max(sizes) if sizes else 18
        ppr = para.find(f"{A}pPr")
        ls = 1.2
        spc_after = 0
        para_w = avail_w
        if ppr is not None:
            lnspc = ppr.find(f"{A}lnSpc/{A}spcPct")
            if lnspc is not None:
                ls = int(lnspc.get("val")) / 100000
            spa = ppr.find(f"{A}spcAft/{A}spcPts")
            if spa is not None:
                spc_after = int(spa.get("val")) / 100
            marl = ppr.get("marL")
            if marl and marl.isdigit():
                para_w -= int(marl) / EMU
            elif ppr.find(f"{A}buChar") is not None:
                para_w -= 27 / 72
        em_per_line = max(1.0, (para_w * 72) / fs - 0.3)
        lines = max(1, int(-(-em_width(txt) // em_per_line)))
        need += lines * fs * ls / 72 + spc_after / 72
    if need == 0:
        return None
    return need, h_in - (tins + bins) / EMU


def cnv_name(el):
    for path in (f"{P}nvSpPr/{P}cNvPr", f"{P}nvPicPr/{P}cNvPr", f"{P}nvGraphicFramePr/{P}cNvPr"):
        m = el.find(path)
        if m is not None:
            return m.get("name") or ""
    return ""


def analyse(pptx: Path, min_units: int, min_chars: int, min_pt: int):
    z = zipfile.ZipFile(pptx)
    slides = sorted(
        (n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)),
        key=lambda n: int(re.search(r"\d+", n).group()),
    )
    deck_fonts = Counter()
    rows = []
    layouts_used = Counter()
    for name in slides:
        n = int(re.search(r"\d+", name).group())
        root = ET.fromstring(z.read(name))
        rels_name = f"ppt/slides/_rels/slide{n}.xml.rels"
        layout = ""
        if rels_name in z.namelist():
            rels = ET.fromstring(z.read(rels_name))
            for rel in rels:
                if rel.get("Type", "").endswith("/slideLayout"):
                    layout = Path(rel.get("Target", "")).name
        layouts_used[layout] += 1
        tree = root.find(f"{P}cSld/{P}spTree")
        units = 0
        chars = 0
        sizes = []
        fonts = Counter()
        offpage = []
        overflow = []
        names = []
        # banner top (if any) — content must end above it
        banner_top = None
        for el in list(tree):
            if "banner" in cnv_name(el):
                bb = box(el)
                if bb:
                    banner_top = bb[1] / EMU if banner_top is None else min(banner_top, bb[1] / EMU)
        for el in list(tree):
            tag = el.tag.split("}")[-1]
            if tag in ("nvGrpSpPr", "grpSpPr"):
                continue
            nm = cnv_name(el)
            names.append(nm)
            if tag == "sp":
                est = estimate_overflow(el)
                if est and est[0] > est[1] * 1.03 + 0.03:
                    overflow.append(f"{(texts(el).strip()[:14])}… need {est[0]:.2f}in / box {est[1]:.2f}in")
            b = box(el)
            if b and banner_top is not None and "banner" not in nm and "stay" not in nm and "badge" not in nm:
                y_top, y_bot = b[1] / EMU, (b[1] + b[3]) / EMU
                t_len = len(texts(el).strip())
                if t_len >= 4 and y_top < banner_top - 0.05 and y_bot > banner_top + 0.08:
                    overflow.append(f"{(texts(el).strip()[:14])}… runs under the banner (bottom {y_bot:.2f}in > banner {banner_top:.2f}in)")
            if b:
                x, y, w, h = b
                full_bleed_pic = tag == "pic" and w >= SLIDE_W * 0.98 and h >= SLIDE_H * 0.98
                if not full_bleed_pic and (x < -EMU * 0.05 or y < -EMU * 0.05 or x + w > SLIDE_W + EMU * 0.05 or y + h > SLIDE_H + EMU * 0.05):
                    offpage.append(nm or tag)
            t = texts(el).strip()
            if tag == "graphicFrame":
                # table: count rows as units
                trs = el.findall(f".//{A}tr")
                if trs:
                    units += max(0, len(trs) - 1)
                    chars += len(t)
            elif t and len(t) >= 6:
                units += 1
                chars += len(t)
            chrome = ("badge" in nm) or (len(t) < 12 and b is not None and b[1] > SLIDE_H * 0.9)
            for rPr in el.iter(f"{A}rPr"):
                sz = rPr.get("sz")
                if sz and sz.isdigit() and not chrome:
                    sizes.append(int(sz) / 100)
                for tagf in (f"{A}ea", f"{A}latin"):
                    f = rPr.find(tagf)
                    if f is not None and f.get("typeface"):
                        fonts[f.get("typeface")] += 1
        deck_fonts.update(fonts)
        joined = " ".join(names).lower()
        role = "content"
        all_text = texts(tree)
        if n == 1 or "cover" in joined:
            role = "cover"
        elif "closing" in joined or (n == len(slides) and any(h in all_text for h in ROLE_HINTS["closing"])):
            role = "closing"
        elif "section" in joined:
            role = "section"
        frame = any(h in joined for h in FRAME_HINTS)
        rows.append({
            "slide": n,
            "role": role,
            "units": units,
            "chars": chars,
            "minpt": min(sizes) if sizes else None,
            "fonts": sorted(fonts),
            "frame": frame,
            "offpage": offpage,
            "overflow": overflow,
            "layout": layout,
        })

    problems = []
    for r in rows:
        if r["role"] == "content":
            if r["units"] < min_units or r["chars"] < min_chars:
                problems.append(f"slide {r['slide']}: thin page (units={r['units']}, chars={r['chars']})")
            if not r["frame"]:
                problems.append(f"slide {r['slide']}: no frame badge/title — not on the deck master?")
        if r["minpt"] is not None and r["minpt"] < min_pt and r["role"] != "cover":
            problems.append(f"slide {r['slide']}: font {r['minpt']}pt < {min_pt}pt")
        if r["offpage"]:
            problems.append(f"slide {r['slide']}: off-canvas shapes {r['offpage'][:3]}")
        for ov in r["overflow"]:
            problems.append(f"slide {r['slide']}: text may overflow its box — {ov}")
    families = {f for f in deck_fonts}
    if len(families) > 2:
        problems.append(f"deck uses {len(families)} typefaces: {sorted(families)} (max 2)")
    return rows, problems, deck_fonts, layouts_used


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pptx", type=Path)
    ap.add_argument("--min-units", type=int, default=3)
    ap.add_argument("--min-chars", type=int, default=60)
    ap.add_argument("--min-pt", type=int, default=12)
    ap.add_argument("--json", type=Path)
    args = ap.parse_args()

    rows, problems, fonts, layouts = analyse(args.pptx, args.min_units, args.min_chars, args.min_pt)
    print(f"{'#':>3} {'role':8} {'units':>5} {'chars':>5} {'minpt':>5} {'frame':>5}  fonts")
    for r in rows:
        print(f"{r['slide']:>3} {r['role']:8} {r['units']:>5} {r['chars']:>5} {str(r['minpt'] or '-'):>5} {('Y' if r['frame'] else '-'):>5}  {','.join(r['fonts'])}")
    print(f"\ntypefaces: {dict(fonts)}")
    print(f"layouts: {dict(layouts)}")
    if args.json:
        args.json.write_text(json.dumps({"rows": rows, "problems": problems}, ensure_ascii=False, indent=1), encoding="utf-8")
    if problems:
        print("\nFAIL")
        for p in problems:
            print(" -", p)
        sys.exit(1)
    print("\nPASS")


if __name__ == "__main__":
    main()
