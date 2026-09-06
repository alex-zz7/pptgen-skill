# Copy pptgen + xhs-banhui-scan into the local agent skills directory.
param(
  [switch]$Claude
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = if ($Claude) {
  Join-Path $env:USERPROFILE ".claude\skills"
} else {
  Join-Path $env:USERPROFILE ".cursor\skills"
}
New-Item -ItemType Directory -Force -Path $Target | Out-Null
foreach ($name in @("pptgen", "xhs-banhui-scan")) {
  $dest = Join-Path $Target $name
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Copy-Item -Recurse -Force (Join-Path $Root $name) $dest
  Write-Host "installed $dest"
}
Write-Host "done. In Cursor, start a chat and say: 用 pptgen 做一套…"
