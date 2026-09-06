# Copy pptgen + xhs-banhui-scan into agent skill directories.
# Default: Cursor AND Claude Code.
param(
  [switch]$Claude,
  [switch]$CursorOnly
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$targets = @()
if ($Claude -and -not $CursorOnly) {
  $targets += (Join-Path $env:USERPROFILE ".claude\skills")
} elseif ($CursorOnly -and -not $Claude) {
  $targets += (Join-Path $env:USERPROFILE ".cursor\skills")
} else {
  $targets += (Join-Path $env:USERPROFILE ".cursor\skills")
  $targets += (Join-Path $env:USERPROFILE ".claude\skills")
}
foreach ($target in $targets) {
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  foreach ($name in @("pptgen", "xhs-banhui-scan")) {
    $dest = Join-Path $target $name
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Copy-Item -Recurse -Force (Join-Path $Root $name) $dest
    Write-Host "installed $dest"
  }
}
Write-Host "done. New chat: 用 pptgen 做一套…   (Claude Code: /pptgen)"
