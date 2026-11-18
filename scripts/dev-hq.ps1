# Stable local HQ/Field preview when the repo lives under OneDrive.
# Next exits if stdin closes; OneDrive also corrupts .next — use a junction
# into %LOCALAPPDATA% and keep a minimized console so Next reaches Ready.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $env:LOCALAPPDATA 'ee-hq-next'
$nodeModules = Join-Path $root 'node_modules'
New-Item -ItemType Directory -Force -Path $dist | Out-Null

Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -match 'next' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Set-Location $root
Start-Sleep -Seconds 1

if (Test-Path -LiteralPath '.next') {
  $item = Get-Item -LiteralPath '.next' -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    cmd.exe /c "rmdir .next"
  } else {
    Remove-Item -LiteralPath '.next' -Recurse -Force
  }
}

Get-ChildItem -Force $dist |
  Where-Object { $_.Name -notin @('dev-out.log', 'dev-err.log', 'dev-hq-launch.cmd') } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

$out = Join-Path $dist 'dev-out.log'
$err = Join-Path $dist 'dev-err.log'
'' | Set-Content -Path $out
'' | Set-Content -Path $err

New-Item -ItemType Junction -Path (Join-Path $root '.next') -Target $dist | Out-Null

# Compiled files live under %LOCALAPPDATA%, so Node resolve() misses the repo
# node_modules. NODE_PATH must be quoted (path contains "Olympus OS").
# Use a minimized console — hidden/redirected launches hang or exit early.
$node = (Get-Command node).Source
$nextBin = Join-Path $root 'node_modules\next\dist\bin\next'
$launcher = Join-Path $dist 'dev-hq-launch.cmd'
$runLine = '"{0}" "{1}" dev -H 127.0.0.1 -p 3000' -f $node, $nextBin
@(
  '@echo off'
  'set WATCHPACK_POLLING=true'
  'set CHOKIDAR_USEPOLLING=true'
  'set NEXT_TELEMETRY_DISABLED=1'
  ('set "NODE_PATH={0}"' -f $nodeModules)
  ('cd /d "{0}"' -f $root)
  $runLine
) | Set-Content -Path $launcher -Encoding ASCII

Start-Process -FilePath $launcher `
  -WorkingDirectory $root `
  -WindowStyle Minimized | Out-Null

Write-Host "HQ preview starting at http://127.0.0.1:3000/hq/login"
Write-Host "Field: http://127.0.0.1:3000/field/login"
Write-Host "Launcher: $launcher (minimized console)"
