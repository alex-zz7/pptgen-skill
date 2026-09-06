#!/usr/bin/env python3
"""Choreograph entrance animations from shape objectName.

Names:
  stay | stay-*
  fade:N | rise:N | wipe:N | zoom:N
Fallback: cluster leftover shapes and fade them by row.
"""

from __future__ import annotations

import argparse
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
EMU = 914400
NSMAP = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
NAMED = re.compile(r"^(fade|rise|wipe|zoom):(\d+)$")

PRESET = {
    "fade": (10, 0, "fade", 480),
    "rise": (10, 0, "fade", 560),
    "wipe": (21, 8, "wipe(left)", 500),
    "zoom": (22, 16, "circle", 520),
}


def emu(inches: float) -> int:
    return int(inches * EMU)


def cnv_pr(el: ET.Element):
    for path in (
        f"{P}nvSpPr/{P}cNvPr",
        f"{P}nvPicPr/{P}cNvPr",
        f"{P}nvCxnSpPr/{P}cNvPr",
        f"{P}nvGrpSpPr/{P}cNvPr",
    ):
        found = el.find(path)
        if found is not None:
            return found
    return None


def shape_box(el: ET.Element):
    xfrm = el.find(f".//{A}xfrm")
    if xfrm is None:
        return None
    off = xfrm.find(f"{A}off")
    ext = xfrm.find(f"{A}ext")
    if off is None or ext is None:
        return None
    return int(off.get("x", 0)), int(off.get("y", 0)), int(ext.get("cx", 0)), int(ext.get("cy", 0))


def collect_shapes(root: ET.Element) -> list[dict]:
    tree = root.find(f"{P}cSld/{P}spTree")
    if tree is None:
        return []
    out = []
    for el in list(tree):
        if el.tag in {f"{P}nvGrpSpPr", f"{P}grpSpPr"}:
            continue
        meta = cnv_pr(el)
        box = shape_box(el)
        if meta is None or box is None:
            continue
        sid = meta.get("id")
        if not sid or sid == "1":
            continue
        x, y, w, h = box
        out.append(
            {
                "id": sid,
                "name": meta.get("name") or "",
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "kind": "pic" if el.tag == f"{P}pic" else "sp",
            }
        )
    return out


def chrome(sh: dict) -> bool:
    name = sh["name"].lower()
    if name.startswith("stay"):
        return True
    x, y, w, h = sh["x"], sh["y"], sh["w"], sh["h"]
    if sh["kind"] == "pic" and w >= emu(11.4) and h >= emu(6.1):
        return True
    if w >= emu(12.8) and h >= emu(6.9):
        return True
    if y >= emu(7.0) and w <= emu(1.2):
        return True
    if w <= emu(0.4) and h <= emu(0.4):
        return True
    return False


def parse_named(shapes: list[dict]) -> dict[int, list[tuple[str, str]]]:
    groups: dict[int, list[tuple[str, str]]] = {}
    for sh in shapes:
        m = NAMED.match(sh["name"])
        if not m:
            continue
        kind, n = m.group(1), int(m.group(2))
        groups.setdefault(n, []).append((kind, sh["id"]))
    return groups


def leftover_clusters(shapes: list[dict], taken: set[str]) -> dict[int, list[tuple[str, str]]]:
    rest = [s for s in shapes if s["id"] not in taken and not chrome(s)]
    if not rest:
        return {}
    rest.sort(key=lambda s: (s["y"], s["x"]))
    pad = emu(0.1)
    parent = list(range(len(rest)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        a, b = find(i), find(j)
        if a != b:
            parent[b] = a

    for i, a in enumerate(rest):
        for j, b in enumerate(rest[i + 1 :], i + 1):
            ax2, ay2 = a["x"] + a["w"] + pad, a["y"] + a["h"] + pad
            bx2, by2 = b["x"] + b["w"], b["y"] + b["h"]
            overlap = a["x"] - pad <= bx2 and ax2 >= b["x"] and a["y"] - pad <= by2 and ay2 >= b["y"]
            same_row = abs((a["y"] + a["h"] / 2) - (b["y"] + b["h"] / 2)) <= emu(0.38)
            if overlap or same_row:
                union(i, j)
    buckets: dict[int, list[dict]] = {}
    for i, sh in enumerate(rest):
        buckets.setdefault(find(i), []).append(sh)
    ordered = sorted(buckets.values(), key=lambda items: min(s["y"] for s in items))
    return {i + 1: [("fade", s["id"]) for s in items] for i, items in enumerate(ordered)}


def effect_xml(tid: int, kind: str, spid: str, node: str, delay: int) -> tuple[str, int]:
    preset, subtype, filtr, dur = PRESET[kind]
    parts = [
        f'<p:par><p:cTn id="{tid}" presetID="{preset}" presetClass="entr" presetSubtype="{subtype}" '
        f'dur="{dur}" fill="hold" grpId="0" nodeType="{node}">'
        f'<p:stCondLst><p:cond delay="{delay}"/></p:stCondLst><p:childTnLst>'
        f"<p:set><p:cBhvr>"
        f'<p:cTn id="{tid + 1}" dur="1" fill="hold">'
        f'<p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
        f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'
        f"<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>"
        f'</p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>'
        f'<p:animEffect transition="in" filter="{filtr}">'
        f'<p:cBhvr><p:cTn id="{tid + 2}" dur="{dur}"/>'
        f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:animEffect>'
    ]
    tid += 3
    if kind == "rise":
        parts.append(
            f'<p:anim calcmode="lin" valueType="num">'
            f'<p:cBhvr additive="base"><p:cTn id="{tid}" dur="{dur}"/>'
            f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'
            f"<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr>"
            f'<p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_y+0.055"/></p:val></p:tav>'
            f'<p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav></p:tavLst></p:anim>'
        )
        tid += 1
    if kind == "zoom":
        parts.append(
            f'<p:anim calcmode="lin" valueType="num">'
            f'<p:cBhvr additive="base"><p:cTn id="{tid}" dur="{dur}"/>'
            f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'
            f"<p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr>"
            f'<p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_w*0.92"/></p:val></p:tav>'
            f'<p:tav tm="100000"><p:val><p:strVal val="#ppt_w"/></p:val></p:tav></p:tavLst></p:anim>'
        )
        tid += 1
    parts.append("</p:childTnLst></p:cTn></p:par>")
    return "".join(parts), tid


def timing_xml(groups: dict[int, list[tuple[str, str]]]) -> str:
    tid = 3
    clicks = []
    blds = []
    for n in sorted(groups):
        items = groups[n]
        inner = []
        for i, (kind, spid) in enumerate(items):
            node = "clickEffect" if i == 0 else "withEffect"
            delay = 0 if i == 0 else 90 * i
            chunk, tid = effect_xml(tid, kind, spid, node, delay)
            inner.append(chunk)
            blds.append(f'<p:bldP spid="{spid}" grpId="0"/>')
        clicks.append(
            f'<p:par><p:cTn id="{tid}" fill="hold">'
            f'<p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>'
            f'<p:childTnLst><p:par><p:cTn id="{tid + 1}" fill="hold">'
            f'<p:stCondLst><p:cond delay="0"/></p:stCondLst>'
            f'<p:childTnLst>{"".join(inner)}</p:childTnLst>'
            f"</p:cTn></p:par></p:childTnLst></p:cTn></p:par>"
        )
        tid += 2
    return (
        "<p:timing><p:tnLst><p:par>"
        '<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
        '<p:seq concurrent="1" nextAc="seek">'
        '<p:cTn id="2" dur="indefinite" nodeType="mainSeq">'
        f'<p:childTnLst>{"".join(clicks)}</p:childTnLst></p:cTn>'
        '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
        '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>'
        "</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>"
        f'<p:bldLst>{"".join(blds)}</p:bldLst></p:timing>'
    )


def inject_slide(xml_path: Path) -> int:
    raw = xml_path.read_text(encoding="utf-8")
    root = ET.fromstring(raw)
    shapes = collect_shapes(root)
    named = parse_named(shapes)
    taken = {spid for items in named.values() for _, spid in items}
    if not named:
        named = leftover_clusters(shapes, set())
    else:
        extra = leftover_clusters(shapes, taken)
        start = max(named) + 1 if named else 1
        for i, items in enumerate(extra.values()):
            named[start + i] = items
    if not named:
        return 0
    timing = timing_xml(named)
    cleaned = re.sub(r"<p:timing\b.*?</p:timing>", "", raw, flags=re.S)
    xml_path.write_text(cleaned.replace("</p:sld>", timing + "</p:sld>", 1), encoding="utf-8")
    return len(named)


def add_animations(pptx_path: Path) -> None:
    tmp = Path(tempfile.mkdtemp(prefix="ppt-anim-"))
    try:
        with zipfile.ZipFile(pptx_path) as z:
            z.extractall(tmp)
        slides = sorted(
            (tmp / "ppt" / "slides").glob("slide*.xml"),
            key=lambda p: int(re.search(r"\d+", p.name).group()),
        )
        counts = [inject_slide(slide) for slide in slides]
        out_tmp = pptx_path.with_suffix(".anim-tmp.pptx")
        with zipfile.ZipFile(out_tmp, "w", compression=zipfile.ZIP_DEFLATED) as z:
            for f in sorted(tmp.rglob("*")):
                if f.is_file():
                    z.write(f, f.relative_to(tmp).as_posix())
        out_tmp.replace(pptx_path)
        print("animations", sum(1 for c in counts if c), "/", len(counts), "clicks", counts)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> None:
    for prefix, uri in NSMAP.items():
        ET.register_namespace(prefix, uri)
    p = argparse.ArgumentParser()
    p.add_argument("pptx", type=Path)
    args = p.parse_args()
    add_animations(args.pptx.resolve())


if __name__ == "__main__":
    main()
