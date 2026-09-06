#!/usr/bin/env bash
# Copy pptgen + xhs-banhui-scan into agent skill directories.
# Default: Cursor AND Claude Code. --cursor / --claude = one of them.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

DEST_CURSOR="${HOME}/.cursor/skills"
DEST_CLAUDE="${HOME}/.claude/skills"

mode="${1:-}"
targets=()
case "$mode" in
  --cursor) targets=("$DEST_CURSOR") ;;
  --claude) targets=("$DEST_CLAUDE") ;;
  "") targets=("$DEST_CURSOR" "$DEST_CLAUDE") ;;
  *)
    echo "usage: $0 [--cursor|--claude]" >&2
    exit 2
    ;;
esac

install_one() {
  local target="$1"
  mkdir -p "$target"
  for name in pptgen xhs-banhui-scan; do
    mkdir -p "$target/$name"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete --exclude '.git' "$ROOT/$name/" "$target/$name/"
    else
      rm -rf "$target/$name"
      cp -R "$ROOT/$name" "$target/$name"
    fi
    echo "installed $target/$name"
  done
}

for t in "${targets[@]}"; do
  install_one "$t"
done
echo "done. New chat: 用 pptgen 做一套…   (Claude Code: /pptgen)"
