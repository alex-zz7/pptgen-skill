#!/usr/bin/env bash
# Copy pptgen + xhs-banhui-scan into the local agent skills directory.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

DEST_CURSOR="${HOME}/.cursor/skills"
DEST_CLAUDE="${HOME}/.claude/skills"
TARGET="$DEST_CURSOR"
if [[ "${1:-}" == "--claude" ]]; then
  TARGET="$DEST_CLAUDE"
fi

mkdir -p "$TARGET"
for name in pptgen xhs-banhui-scan; do
  mkdir -p "$TARGET/$name"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude '.git' "$ROOT/$name/" "$TARGET/$name/"
  else
    rm -rf "$TARGET/$name"
    cp -R "$ROOT/$name" "$TARGET/$name"
  fi
  echo "installed $TARGET/$name"
done
echo "done. In Cursor, start a chat and say: 用 pptgen 做一套…"
