#!/bin/bash
# silent Keynote export: no activate, window hidden, closes after export
PPT="$1"; OUT="$2"
osascript <<APPLESCRIPT
tell application "System Events"
  if exists process "Keynote" then set visible of process "Keynote" to false
end tell
tell application "Keynote"
  set theDoc to open POSIX file "$PPT"
  delay 2
  export theDoc to POSIX file "$OUT" as slide images with properties {image format:JPEG}
  close theDoc saving no
end tell
tell application "System Events"
  if exists process "Keynote" then set visible of process "Keynote" to false
end tell
APPLESCRIPT
