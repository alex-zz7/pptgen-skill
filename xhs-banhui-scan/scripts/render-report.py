#!/usr/bin/env python3
"""Render report.md to HTML + PDF. Chinese via Chrome print-to-pdf."""

from __future__ import annotations

import argparse
import html
import subprocess
import sys
from pathlib import Path

CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def md_to_html(md: str, title: str) -> str:
    try:
        proc = subprocess.run(
            ["pandoc", "-f", "gfm", "-t", "html", "--standalone"],
            input=md,
            text=True,
            capture_output=True,
            check=True,
        )
        body = proc.stdout
        if "<style>" not in body:
            body = body.replace(
                "</head>",
                "<style>body{font-family:-apple-system,BlinkMacSystemFont,PingFang SC,sans-serif;"
                "max-width:800px;margin:32px auto;padding:0 20px;line-height:1.55;}"
                "table{border-collapse:collapse;width:100%;font-size:14px}"
                "th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}</style></head>",
                1,
            )
        return body
    except (FileNotFoundError, subprocess.CalledProcessError):
        escaped = html.escape(md)
        return (
            "<!doctype html><html><head><meta charset='utf-8'><title>"
            f"{html.escape(title)}</title>"
            "<style>body{font-family:-apple-system,BlinkMacSystemFont,PingFang SC,sans-serif;"
            "max-width:800px;margin:32px auto;padding:0 20px;line-height:1.55;white-space:pre-wrap}"
            "</style></head><body>"
            f"<pre>{escaped}</pre></body></html>"
        )


def chrome_pdf(html_path: Path, pdf_path: Path) -> None:
    if not CHROME.exists():
        raise SystemExit("Google Chrome not found; cannot print PDF")
    subprocess.run(
        [
            str(CHROME),
            "--headless=new",
            "--disable-gpu",
            f"--print-to-pdf={pdf_path}",
            "--no-pdf-header-footer",
            html_path.as_uri(),
        ],
        check=True,
        capture_output=True,
    )


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--md", required=True)
    p.add_argument("--html", required=True)
    p.add_argument("--pdf", required=True)
    p.add_argument("--title", default="小红书班会课件检索")
    args = p.parse_args()

    md_path = Path(args.md).expanduser()
    html_path = Path(args.html).expanduser()
    pdf_path = Path(args.pdf).expanduser()
    if not md_path.is_file():
        print(f"missing markdown: {md_path}", file=sys.stderr)
        return 2

    html_path.parent.mkdir(parents=True, exist_ok=True)
    html_path.write_text(md_to_html(md_path.read_text(), args.title), encoding="utf-8")
    chrome_pdf(html_path, pdf_path)
    print(html_path)
    print(pdf_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
