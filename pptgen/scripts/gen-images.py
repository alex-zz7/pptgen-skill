#!/usr/bin/env python3
"""Illustration kit generator (gpt-image-2 via ai-proxy). Reads a jobs JSON, writes PNGs.

    python3 gen-images.py {项目}/src/jobs.json [--only id,id] [--styles {项目}/风格提示词.md]

jobs.json = [{ "id": "el-cover", "style": "竞选大会", "size": "16:9", "res": "2k",
               "anchor": true, "prompt": "{STYLE}\\n\\nWide 16:9 poster cover ... {NO_TEXT}",
               "out": "assets/v2/el-cover.png" }, ...]

  - style   : `## <title>` section of 风格提示词.md, substituted for {STYLE}
  - anchor  : generated first; every other job of the same `style` gets it as --ref (unless "noref")
  - prompts may use {STYLE} {BG_RULE} {SPOT_RULE} {MASCOT_RULE} {SCENE_RULE} {NO_TEXT}
  - out     : relative to the project root (parent of the jobs file's folder); existing files are skipped
Never print the API key. Run in the tool's background mode, never in a Terminal window.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

NO_TEXT = "No Chinese characters, no letters, no numbers, no watermark, no logo."
BG_RULE = ("Wide 16:9 slide background. The CENTER 72% (a wide horizontal band from 12% to 84% of the height) must be a plain, "
           "very light, evenly lit area with no objects, reserved for text cards. Decorative elements only along the top edge, "
           "bottom edge and outer corners. No people in the center. ")
SPOT_RULE = ("4:3 character illustration ONLY: one to three people doing one clear action, on a plain pure white background, "
             "subject centered with generous margin. Do NOT draw a notebook, paper sheet, panels, tags, badges, icons, frames or any layout. "
             "Absolutely no text, no letters, no words of any language. ")
MASCOT_RULE = ("Character cut-out for a slide: full-body, one to three Chinese primary students (white shirt, red scarf, dark trousers or skirt) "
               "optionally with a kind female teacher, on a PURE WHITE background, no ground shadow, no scenery, no furniture, no frame, "
               "no panels, no text of any language. Clean edges, flat-vector poster style consistent with the reference. ")
SCENE_RULE = ("Photo-realistic Chinese primary school classroom, camera exactly perpendicular to the front wall, a large wall-mounted "
              "interactive flat panel display whose screen is completely black and blank, screen aspect ratio exactly 16:9, screen edges "
              "parallel to the image edges, thin dark bezel, wooden teacher's desk in the foreground, warm daylight from a side window, "
              "no people, no text anywhere. ")

API = "https://ai-proxy.cc/v1"


def load_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return key
    cfg = Path.home() / ".claude" / "config.json"
    if cfg.exists():
        env = (json.loads(cfg.read_text()).get("env") or {})
        key = env.get("OPENAI_API_KEY") or env.get("ANTHROPIC_API_KEY") or ""
    if not key:
        raise SystemExit("API key missing (OPENAI_API_KEY)")
    return key


def sections(md: str) -> dict[str, str]:
    out = {}
    for m in re.finditer(r"^## ([^\n]+)\n\n(.+?)(?=\n\n## |\Z)", md, re.S | re.M):
        title = m.group(1).strip()
        out[title] = m.group(2).strip()
        out[title.split()[0].split("·")[0].strip()] = m.group(2).strip()
    return out


class Client:
    def __init__(self):
        self.key = load_key()

    def req(self, method, url, body=None):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
        r = urllib.request.Request(url, data=data, method=method,
                                   headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(r, timeout=180) as resp:
            return json.loads(resp.read().decode())

    def submit(self, prompt, size, res, refs=None):
        body = {"model": "gpt-image-2", "prompt": prompt, "n": 1, "size": size, "resolution": res}
        if refs:
            body["image_urls"] = ["data:image/png;base64," + base64.b64encode(p.read_bytes()).decode() for p in refs]
        out = self.req("POST", f"{API}/images/generations", body)
        try:
            return out["data"][0]["task_id"]
        except Exception as e:
            raise RuntimeError(f"submit failed: {out}") from e

    def poll(self, task_id, label):
        time.sleep(10)
        for i in range(80):
            r = self.req("GET", f"{API}/tasks/{task_id}")
            d = r.get("data") if isinstance(r.get("data"), dict) else {}
            st = d.get("status")
            print(f"  [{label}] {i + 1} {st}", flush=True)
            if st == "completed":
                return d["result"]["images"][0]["url"][0]
            if st == "failed":
                raise RuntimeError(f"{label} failed: {(d.get('error') or {}).get('message', r)}")
            time.sleep(4)
        raise RuntimeError(f"{label} timeout {task_id}")


def download(url, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    print(f"  saved {dest} ({dest.stat().st_size / 1024:.0f}KB)", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs", type=Path)
    ap.add_argument("--only", default="")
    ap.add_argument("--styles", type=Path, default=None, help="风格提示词.md (default: project root)")
    a = ap.parse_args()

    root = a.jobs.resolve().parent.parent
    styles_md = a.styles or (root / "风格提示词.md")
    styles = sections(styles_md.read_text(encoding="utf-8")) if styles_md.exists() else {}
    jobs = json.loads(a.jobs.read_text(encoding="utf-8"))
    only = {s for s in a.only.split(",") if s}

    for j in jobs:
        style = styles.get(j.get("style", ""), "")
        if j.get("style") and not style:
            raise SystemExit(f"style section not found: {j['style']}")
        j["prompt"] = j["prompt"].format(STYLE=style, BG_RULE=BG_RULE, SPOT_RULE=SPOT_RULE, MASCOT_RULE=MASCOT_RULE,
                                         SCENE_RULE=SCENE_RULE, NO_TEXT=NO_TEXT)
        j["out"] = (root / j.get("out", f"assets/{j['id']}.png")).resolve()

    c = Client()
    anchors = {j["style"]: j for j in jobs if j.get("anchor")}
    for st, aj in anchors.items():
        if not aj["out"].exists():
            print("== anchor", aj["id"], flush=True)
            download(c.poll(c.submit(aj["prompt"], aj["size"], aj["res"]), aj["id"]), aj["out"])

    pending = []
    for j in jobs:
        if j.get("anchor") or j["out"].exists() or (only and j["id"] not in only):
            continue
        refs = None
        if not j.get("noref") and j.get("style") in anchors:
            refs = [anchors[j["style"]]["out"]]
        print("== submit", j["id"], flush=True)
        pending.append((j, c.submit(j["prompt"], j["size"], j["res"], refs=refs)))
        time.sleep(1.0)
    for j, tid in pending:
        download(c.poll(tid, j["id"]), j["out"])
    print("done", len(pending), "images", flush=True)


if __name__ == "__main__":
    main()
