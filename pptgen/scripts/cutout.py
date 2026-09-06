#!/usr/bin/env python3
"""Turn white-background character illustrations into transparent PNG cut-outs.

  python3 cutout.py --in assets/v2 --glob "*-mascot-*.png" --out assets/v2/cut [--trim] [--soft 18]

Pixels close to white become transparent (soft ramp so anti-aliased edges keep a light fringe
instead of a hard halo); the image is trimmed to the character's bounding box and a small
margin. Works for flat-vector art on a pure white background; not for photos.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def cut(src: Path, dst: Path, soft: int, trim: bool, margin: int = 12) -> None:
    im = Image.open(src).convert("RGB")
    a = np.array(im).astype(np.int16)
    h, w, _ = a.shape
    # background colour = median of the four corner patches (models sometimes return black instead of white)
    pad = 6
    corners = np.concatenate([a[:pad, :pad].reshape(-1, 3), a[:pad, -pad:].reshape(-1, 3), a[-pad:, :pad].reshape(-1, 3), a[-pad:, -pad:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    dist = np.abs(a - bg).max(axis=2)                     # 0 = exactly background colour
    ramp = np.clip((dist - soft * 0.6) / float(soft * 1.4), 0, 1)   # 0 → transparent, 1 → opaque
    alpha = (ramp * 255)
    al = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.MedianFilter(3))
    al_np = np.array(al)
    # only background CONNECTED TO THE BORDER is removed, so white shirts / dark trousers inside stay opaque
    mask_bg = al_np < 40
    from collections import deque
    seen = np.zeros_like(mask_bg, dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if mask_bg[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if mask_bg[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and mask_bg[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    # grow the removed region by one soft step so the anti-aliased rim fades instead of leaving a fringe
    seen_img = Image.fromarray((seen * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    rim = (np.array(seen_img) > 0) & (~seen)
    final_alpha = np.where(seen, 0, 255).astype(np.uint8)
    final_alpha = np.where(rim, np.minimum(final_alpha, al_np), final_alpha).astype(np.uint8)
    # de-fringe: pull rim pixel colours away from the background colour
    rgb = a.copy()
    rgb[rim] = np.clip(rgb[rim] + (rgb[rim] - bg) * 0.5, 0, 255)
    rgba = np.dstack([rgb.astype(np.uint8), final_alpha])
    out = Image.fromarray(rgba, "RGBA")
    if trim:
        bbox = Image.fromarray(final_alpha).point(lambda v: 255 if v > 10 else 0).getbbox()
        if bbox:
            x0, y0, x1, y1 = bbox
            out = out.crop((max(0, x0 - margin), max(0, y0 - margin), min(w, x1 + margin), min(h, y1 + margin)))
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, "PNG")
    print(f"cut {src.name} bg={tuple(int(v) for v in bg)} -> {dst.name} {out.size}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True, type=Path)
    ap.add_argument("--glob", default="*.png")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--soft", type=int, default=18)
    ap.add_argument("--trim", action="store_true")
    args = ap.parse_args()
    for f in sorted(args.src.glob(args.glob)):
        cut(f, args.out / f.name, args.soft, args.trim)


if __name__ == "__main__":
    main()
