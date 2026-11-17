# Stable local HQ preview when the repo lives under OneDrive.
# Next exits if stdin closes; OneDrive also corrupts .next — use a junction + detached process.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $env:LOCALAPPDATA 'ee-hq-next'
New-Item -ItemType Directory -Force -Path $dist | Out-Null

# Free port 3000
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Set-Location $root
if (Test-Path '.next') {
  $rp = cmd /c "fsutil reparsepoint query .next 2>nul"
  if ($LASTEXITCODE -ne 0) { Remove-Item -Recurse -Force '.next' }
  else { cmd /c "rmdir .next" | Out-Null }
}
if (-not (Test-Path '.next')) {
  cmd /c "mklink /J .next `"$dist`"" | Out-Null
}

$out = Join-Path $dist 'dev-out.log'
$err = Join-Path $dist 'dev-err.log'
Start-Process -FilePath 'node' `
  -ArgumentList './node_modules/next/dist/bin/next','dev','-H','127.0.0.1','-p','3000' `
  -WorkingDirectory $root -WindowStyle Hidden `
  -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
Write-Host "HQ preview starting at http://127.0.0.1:3000/hq/login"
Write-Host "Logs: $out / $err"
