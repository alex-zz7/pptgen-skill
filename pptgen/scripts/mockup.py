#!/usr/bin/env python3
"""Composite exported slide images into a classroom-screen mockup for 小红书 note images.

Input
  --scene   PNG/JPG of a classroom with an interactive whiteboard whose screen is a
            flat dark (near-black) rectangle — generate it once per deck (see generate.md).
  --slides  folder of slide JPEG/PNG exported from Keynote (check.001.jpeg ...)
  --out     output folder; writes 01.jpg, 02.jpg ... at 3:4 (1242x1656) by default
  --quad    optional "x1,y1 x2,y2 x3,y3 x4,y4" screen corners (TL TR BR BL) to skip detection
  --pick    optional comma list of slide numbers to render (default: all)
  --ratio   3:4 (default) | 1:1 | 4:3 — crop of the scene around the screen

The screen is found as the largest dark blob; its extreme corners become the
destination quad. Each slide is perspective-warped onto it with a soft inner
shadow so it reads as a lit display.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def find_screen_quad(scene: Image.Image, dark: int = 60, sat: int = 9, shrink: float = 0.012):
    """Largest near-black, low-saturation blob = the blank display.
    Saturation filter keeps dark-green chalkboards out; the quad is shrunk a little so the
    slide sits inside the bezel."""
    rgb = np.array(scene.convert("RGB")).astype(np.int16)
    g = rgb.mean(axis=2)
    s = rgb.max(axis=2) - rgb.min(axis=2)
    mask = (g < dark) & (s <= sat)
    h, w = mask.shape
    # remove thin noise
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
    mask = np.array(m) > 0
    # largest connected component via flood fill on a downscaled grid
    scale = 4
    small = mask[::scale, ::scale]
    sh, sw = small.shape
    labels = np.zeros_like(small, dtype=np.int32)
    cur = 0
    best = (0, None)
    for y in range(sh):
        for x in range(sw):
            if small[y, x] and labels[y, x] == 0:
                cur += 1
                stack = [(y, x)]
                labels[y, x] = cur
                cnt = 0
                while stack:
                    cy, cx = stack.pop()
                    cnt += 1
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < sh and 0 <= nx < sw and small[ny, nx] and labels[ny, nx] == 0:
                            labels[ny, nx] = cur
                            stack.append((ny, nx))
                if cnt > best[0]:
                    best = (cnt, cur)
    if best[1] is None:
        raise SystemExit("no dark screen found; pass --quad")
    ys, xs = np.where(labels == best[1])
    xs = xs * scale
    ys = ys * scale
    pts = np.stack([xs, ys], axis=1).astype(np.float64)
    s = pts.sum(axis=1)
    d = pts[:, 0] - pts[:, 1]
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmax(d)]
    bl = pts[np.argmin(d)]
    quad = [tl, tr, br, bl]
    area = best[0] * scale * scale
    if area < 0.04 * w * h:
        raise SystemExit(f"dark region too small ({area/(w*h):.1%} of scene); pass --quad")
    # shrink toward the centroid so the slide clears the bezel
    c = np.mean(np.array(quad), axis=0)
    quad = [tuple(c + (p - c) * (1 - shrink * 2)) for p in quad]
    return quad


def perspective_coeffs(src_pts, dst_pts):
    """Coefficients for PIL Image.transform(PERSPECTIVE) mapping dst → src."""
    matrix = []
    for (x, y), (X, Y) in zip(dst_pts, src_pts):
        matrix.append([x, y, 1, 0, 0, 0, -X * x, -X * y])
        matrix.append([0, 0, 0, x, y, 1, -Y * x, -Y * y])
    A = np.array(matrix, dtype=np.float64)
    B = np.array(src_pts, dtype=np.float64).reshape(8)
    res = np.linalg.solve(A, B)
    return res.tolist()


def fit_quad(quad, slide_aspect):
    """Letterbox: shrink the destination quad along one axis so the slide keeps its aspect."""
    tl, tr, br, bl = [np.array(p, dtype=float) for p in quad]
    avg_w = (np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2
    avg_h = (np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2
    qa = avg_w / avg_h
    # never stretch: always letterbox/pillarbox to the slide aspect (scenes must be frontal 16:9-ish)
    if abs(qa - slide_aspect) / slide_aspect < 0.02:
        return quad
    if qa < slide_aspect:  # screen is taller than the slide → bars top/bottom
        k = qa / slide_aspect
        t = (1 - k) / 2
        ntl = tl + (bl - tl) * t; nbl = bl + (tl - bl) * t
        ntr = tr + (br - tr) * t; nbr = br + (tr - br) * t
        return [tuple(ntl), tuple(ntr), tuple(nbr), tuple(nbl)]
    k = slide_aspect / qa  # screen is wider → bars left/right
    t = (1 - k) / 2
    ntl = tl + (tr - tl) * t; ntr = tr + (tl - tr) * t
    nbl = bl + (br - bl) * t; nbr = br + (bl - br) * t
    return [tuple(ntl), tuple(ntr), tuple(nbr), tuple(nbl)]


def warp_slide(slide: Image.Image, quad, canvas_size):
    W, H = canvas_size
    sw, sh = slide.size
    quad = fit_quad(quad, sw / sh)
    src = [(0, 0), (sw, 0), (sw, sh), (0, sh)]
    coeffs = perspective_coeffs(src, quad)
    warped = slide.convert("RGBA").transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    # alpha mask from the quad polygon
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon([tuple(map(float, p)) for p in quad], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))
    warped.putalpha(mask)
    return warped, mask


def add_glass(canvas: Image.Image, mask: Image.Image, quad):
    """Soft inner shadow at the screen edge + a faint top glare."""
    W, H = canvas.size
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).polygon([tuple(map(float, p)) for p in quad], fill=255)
    inner = shadow.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(10))
    edge = Image.fromarray(np.clip(np.array(shadow).astype(int) - np.array(inner).astype(int), 0, 255).astype(np.uint8))
    dark = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dark.putalpha(edge.point(lambda v: int(v * 0.35)))
    canvas.alpha_composite(dark)
    glare = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    gd = ImageDraw.Draw(glare)
    (x1, y1), (x2, y2), (x3, y3), (x4, y4) = quad
    gd.polygon([(x1, y1), (x2, y2), ((x2 + x3) / 2, (y2 + y3) / 2), ((x1 + x4) / 2, (y1 + y4) / 2)], fill=(255, 255, 255, 18))
    glare = glare.filter(ImageFilter.GaussianBlur(25))
    glare.putalpha(Image.fromarray((np.array(glare.split()[3]).astype(float) * (np.array(mask) / 255.0)).astype(np.uint8)))
    canvas.alpha_composite(glare)
    return canvas


def crop_ratio(img: Image.Image, quad, ratio: str):
    rw, rh = {"3:4": (3, 4), "1:1": (1, 1), "4:3": (4, 3)}[ratio]
    W, H = img.size
    cx = sum(p[0] for p in quad) / 4
    cy = sum(p[1] for p in quad) / 4
    qw = max(p[0] for p in quad) - min(p[0] for p in quad)
    # screen should occupy ~78% of crop width
    cw = min(W, qw / 0.78)
    ch = cw * rh / rw
    if ch > H:
        ch = H
        cw = ch * rw / rh
    x0 = int(np.clip(cx - cw / 2, 0, W - cw))
    # bias the crop so the screen sits in the upper-middle third
    y0 = int(np.clip(cy - ch * 0.42, 0, H - ch))
    return img.crop((x0, y0, int(x0 + cw), int(y0 + ch)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", required=True, type=Path)
    ap.add_argument("--slides", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--quad")
    ap.add_argument("--pick")
    ap.add_argument("--ratio", default="3:4", choices=["3:4", "1:1", "4:3"])
    ap.add_argument("--width", type=int, default=1242)
    ap.add_argument("--dark", type=int, default=60, help="max mean RGB for screen pixels")
    ap.add_argument("--sat", type=int, default=9, help="max (max-min) RGB spread for screen pixels")
    ap.add_argument("--debug", type=Path, help="write the scene with the detected quad drawn")
    args = ap.parse_args()

    scene = Image.open(args.scene).convert("RGBA")
    if args.quad:
        quad = [tuple(map(float, p.split(","))) for p in args.quad.split()]
    else:
        quad = find_screen_quad(scene, dark=args.dark, sat=args.sat)
    print("screen quad:", [tuple(int(v) for v in p) for p in quad])
    if args.debug:
        dbg = scene.copy()
        ImageDraw.Draw(dbg).polygon([tuple(map(float, p)) for p in quad], outline=(255, 0, 0, 255), width=6)
        dbg.convert("RGB").save(args.debug)

    files = sorted(
        [p for p in args.slides.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png")],
        key=lambda p: int(re.findall(r"\d+", p.stem)[-1]) if re.findall(r"\d+", p.stem) else 0,
    )
    if args.pick:
        want = {int(x) for x in args.pick.split(",")}
        files = [f for f in files if int(re.findall(r"\d+", f.stem)[-1]) in want]
    args.out.mkdir(parents=True, exist_ok=True)
    rw, rh = {"3:4": (3, 4), "1:1": (1, 1), "4:3": (4, 3)}[args.ratio]
    for i, f in enumerate(files, 1):
        slide = Image.open(f)
        warped, mask = warp_slide(slide, quad, scene.size)
        canvas = scene.copy()
        canvas.alpha_composite(warped)
        canvas = add_glass(canvas, mask, quad)
        out = crop_ratio(canvas, quad, args.ratio).convert("RGB")
        out = out.resize((args.width, int(args.width * rh / rw)), Image.LANCZOS)
        num = int(re.findall(r"\d+", f.stem)[-1]) if re.findall(r"\d+", f.stem) else i
        dest = args.out / f"{num:02d}.jpg"
        out.save(dest, quality=90)
        print("wrote", dest)


if __name__ == "__main__":
    main()
