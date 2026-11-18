# Stable local HQ/Field preview when the repo lives under OneDrive.
# Next exits if stdin closes; OneDrive also corrupts .next — use a junction
# into %LOCALAPPDATA% and keep the process detached from the terminal.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $env:LOCALAPPDATA 'ee-hq-next'
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
  Where-Object { $_.Name -notin @('dev-out.log', 'dev-err.log') } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

$out = Join-Path $dist 'dev-out.log'
$err = Join-Path $dist 'dev-err.log'
'' | Set-Content -Path $out
'' | Set-Content -Path $err

New-Item -ItemType Junction -Path (Join-Path $root '.next') -Target $dist | Out-Null

# Start via PowerShell so stdin is not tied to an interactive shell.
$node = (Get-Command node).Source
$nextBin = Join-Path $root 'node_modules\next\dist\bin\next'
Start-Process -FilePath $node `
  -ArgumentList "`"$nextBin`"", 'dev', '-H', '127.0.0.1', '-p', '3000' `
  -WorkingDirectory $root -WindowStyle Hidden `
  -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null

Write-Host "HQ preview starting at http://127.0.0.1:3000/hq/login"
Write-Host "Field: http://127.0.0.1:3000/field"
Write-Host "Logs: $out / $err"
