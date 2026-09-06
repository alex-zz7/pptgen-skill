#!/usr/bin/env python3
"""Pack 客户文件夹 + 客户压缩包 + 小红书运营资料文件夹 into one outer zip."""

from __future__ import annotations

import argparse
import io
import zipfile
from pathlib import Path

SKIP_NAMES = {".DS_Store", "使用说明.txt", "README.txt"}
SKIP_SUFFIXES = {".mp4", ".zip"}
OPS_NAME = "小红书运营资料"


def add_folder(z: zipfile.ZipFile, folder: Path, prefix: str = "") -> None:
    for f in sorted(folder.rglob("*")):
        if f.name in SKIP_NAMES or f.suffix.lower() in SKIP_SUFFIXES:
            continue
        rel = f.relative_to(folder).as_posix()
        arc = f"{prefix}/{rel}" if prefix else rel
        if f.is_dir():
            info = zipfile.ZipInfo(arc + "/")
            info.flag_bits |= 0x800
            z.writestr(info, b"")
            continue
        info = zipfile.ZipInfo.from_file(f, arc)
        info.flag_bits |= 0x800
        z.writestr(info, f.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)


SHOWCASE_DIR = "展示图"


def add_ops_flat(z: zipfile.ZipFile, folder: Path, prefix: str) -> None:
    """Ops zip entries are one level: 小红书运营资料/filename.
    The only allowed sub-folder is 展示图/ (classroom-screen showcase images), kept one level deep."""
    files = [
        f
        for f in sorted(folder.rglob("*"))
        if f.is_file() and f.name not in SKIP_NAMES and f.suffix.lower() not in SKIP_SUFFIXES
    ]
    seen: set[str] = set()
    for f in files:
        rel = f.relative_to(folder)
        name = f"{SHOWCASE_DIR}/{f.name}" if rel.parts[0] == SHOWCASE_DIR else f.name
        if name in seen:
            raise SystemExit(f"duplicate ops filename after flatten: {name}")
        seen.add(name)
        arc = f"{prefix}/{name}"
        info = zipfile.ZipInfo.from_file(f, arc)
        info.flag_bits |= 0x800
        z.writestr(info, f.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)


def folder_to_zip_bytes(folder: Path) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        add_folder(z, folder)
    return buf.getvalue()


def resolve_ops(proj: Path) -> Path:
    ops = proj / OPS_NAME
    legacy = proj / "商品运营包"
    if ops.is_dir():
        return ops
    if legacy.is_dir():
        return legacy
    raise SystemExit(f"missing {OPS_NAME}/ in {proj}")


def pack(proj: Path, ppt_name: str, short_name: str) -> Path:
    teacher = proj / ppt_name
    ops = resolve_ops(proj)
    if not teacher.is_dir():
        raise SystemExit(f"missing customer folder: {teacher}")
    out = proj.parent / f"{short_name}-输出全套.zip"
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        add_folder(z, teacher, ppt_name)
        add_ops_flat(z, ops, OPS_NAME)
        info = zipfile.ZipInfo(f"{ppt_name}.zip")
        info.flag_bits |= 0x800
        z.writestr(info, folder_to_zip_bytes(teacher), compress_type=zipfile.ZIP_STORED)
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--proj", required=True, type=Path)
    p.add_argument("--ppt-name", required=True)
    p.add_argument("--short-name", required=True)
    args = p.parse_args()
    out = pack(args.proj.resolve(), args.ppt_name, args.short_name)
    print(out)


if __name__ == "__main__":
    main()
