#!/usr/bin/env python3
"""Export a PPTX to one JPEG per slide. Cross-platform, no windows on the user's desktop.

    python3 export-slides.py {pptx} {out_dir}

Tries, in order:
  macOS   : Keynote (silent AppleScript) → LibreOffice + PDF raster
  Windows : PowerPoint COM (window hidden) → LibreOffice + PDF raster
  Linux   : LibreOffice + PDF raster

Writes ``s.001.jpeg`` … into out_dir (created). Existing files in out_dir are removed.
Never calls ``activate`` / never opens Terminal. On macOS, Keynote is hidden and quit
after the last export of a batch (pass --keep-app to leave it running between decks).
"""
from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
KEYNOTE_SH = HERE / "keynote-export.sh"


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def which(name: str):
    return shutil.which(name)


def soffice_bin():
    found = which("soffice") or which("libreoffice")
    if found:
        return found
    for p in (
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/local/bin/soffice",
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ):
        if Path(p).exists():
            return p
    return None


def reset_dir(d: Path):
    if d.exists():
        for f in d.iterdir():
            if f.is_file():
                f.unlink()
    d.mkdir(parents=True, exist_ok=True)


def normalize(src: Path, dest: Path) -> int:
    """Copy exported images into dest as s.001.jpeg … sorted by trailing number."""
    imgs = [p for p in src.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"} and p.is_file()]
    if not imgs:
        return 0

    def key(p: Path):
        digits = "".join(ch for ch in p.stem if ch.isdigit())
        return (int(digits) if digits else 10**9, p.name.lower())

    imgs.sort(key=key)
    reset_dir(dest)
    for i, p in enumerate(imgs, 1):
        out = dest / f"s.{i:03d}.jpeg"
        if p.suffix.lower() in {".jpg", ".jpeg"}:
            shutil.copy2(p, out)
        else:
            from PIL import Image
            Image.open(p).convert("RGB").save(out, quality=90)
    return len(imgs)


def export_keynote(pptx: Path, dest: Path, keep_app: bool) -> bool:
    if platform.system() != "Darwin" or not KEYNOTE_SH.exists() or not which("osascript"):
        return False
    if not Path("/Applications/Keynote.app").exists() and not Path.home().joinpath("Applications/Keynote.app").exists():
        return False
    tmp = Path(tempfile.mkdtemp(prefix="pptgen-kn-"))
    try:
        run(["/bin/bash", str(KEYNOTE_SH), str(pptx), str(tmp / "s")], check=True)
        n = normalize(tmp, dest)
        if n == 0:
            return False
        print(f"export-slides: Keynote → {n} pages", flush=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"export-slides: Keynote failed ({e})", file=sys.stderr, flush=True)
        return False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        if not keep_app:
            subprocess.run(["osascript", "-e", 'tell application "Keynote" to quit'], check=False)


def export_powerpoint(pptx: Path, dest: Path) -> bool:
    if platform.system() != "Windows":
        return False
    tmp = Path(tempfile.mkdtemp(prefix="pptgen-pp-"))
    # 17 = ppSaveAsJPG. WithWindow=$false keeps the app off the desktop.
    ps = rf"""
$ErrorActionPreference = 'Stop'
$ppt = New-Object -ComObject PowerPoint.Application
try {{
  $pres = $ppt.Presentations.Open('{pptx}', $true, $false, $false)
  $pres.SaveAs('{tmp}', 17)
  $pres.Close()
}} finally {{
  $ppt.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
}}
"""
    try:
        run(["powershell", "-NoProfile", "-Command", ps], check=True, capture_output=True)
        n = normalize(tmp, dest)
        if n == 0:
            return False
        print(f"export-slides: PowerPoint → {n} pages", flush=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"export-slides: PowerPoint COM failed ({e})", file=sys.stderr, flush=True)
        return False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def raster_pdf(pdf: Path, dest: Path) -> int:
    work = Path(tempfile.mkdtemp(prefix="pptgen-pdf-"))
    try:
        try:
            import pypdfium2 as pdfium
            doc = pdfium.PdfDocument(str(pdf))
            for i, page in enumerate(doc, 1):
                # 144 dpi-ish: 1920 px on the long side of 16:9
                pil = page.render(scale=1920 / max(page.get_width(), 1)).to_pil()
                pil.convert("RGB").save(work / f"s.{i:03d}.jpeg", quality=90)
                page.close()
            doc.close()
            return normalize(work, dest)
        except ImportError:
            pass
        pdftoppm = which("pdftoppm")
        if pdftoppm:
            run([pdftoppm, "-jpeg", "-r", "144", str(pdf), str(work / "s")], check=True)
            return normalize(work, dest)
        raise RuntimeError(
            "PDF 已转出，但没有光栅化工具。pip install pypdfium2  或安装 poppler（pdftoppm）"
        )
    finally:
        shutil.rmtree(work, ignore_errors=True)


def export_libreoffice(pptx: Path, dest: Path) -> bool:
    bin_ = soffice_bin()
    if not bin_:
        return False
    tmp = Path(tempfile.mkdtemp(prefix="pptgen-lo-"))
    try:
        env = os.environ.copy()
        env.setdefault("SAL_USE_VCLPLUGIN", "svp")  # headless, no window
        run([bin_, "--headless", "--nologo", "--nofirststartwizard",
             "--convert-to", "pdf", "--outdir", str(tmp), str(pptx)],
            check=True, env=env, capture_output=True)
        pdfs = list(tmp.glob("*.pdf"))
        if not pdfs:
            return False
        n = raster_pdf(pdfs[0], dest)
        if n == 0:
            return False
        print(f"export-slides: LibreOffice → {n} pages", flush=True)
        return True
    except (subprocess.CalledProcessError, RuntimeError) as e:
        print(f"export-slides: LibreOffice failed ({e})", file=sys.stderr, flush=True)
        return False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pptx", type=Path)
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--keep-app", action="store_true", help="don't quit Keynote after export")
    ap.add_argument("--engine", choices=["auto", "keynote", "powerpoint", "libreoffice"], default="auto")
    a = ap.parse_args()
    pptx = a.pptx.resolve()
    dest = a.out_dir.resolve()
    if not pptx.is_file():
        raise SystemExit(f"pptx not found: {pptx}")
    dest.mkdir(parents=True, exist_ok=True)

    engines = {
        "keynote": lambda: export_keynote(pptx, dest, a.keep_app),
        "powerpoint": lambda: export_powerpoint(pptx, dest),
        "libreoffice": lambda: export_libreoffice(pptx, dest),
    }
    order = [a.engine] if a.engine != "auto" else (
        ["keynote", "libreoffice"] if platform.system() == "Darwin"
        else ["powerpoint", "libreoffice"] if platform.system() == "Windows"
        else ["libreoffice"]
    )
    for name in order:
        if engines[name]():
            return
    sys.exit(
        "export-slides: 没有可用的导出引擎。\n"
        "  macOS   : 安装 Keynote，或 LibreOffice + `pip install pypdfium2`\n"
        "  Windows : 安装 Microsoft PowerPoint，或 LibreOffice + `pip install pypdfium2`\n"
        "  Linux   : 安装 LibreOffice + `pip install pypdfium2`\n"
        "导出前先把客户包 `字体/` 里的思源字体装进系统，否则光栅化会错位。"
    )


if __name__ == "__main__":
    main()
