# MEK Sales Hub - start everything on this laptop (Windows PowerShell): database, n8n, app.
# Usage:  right-click > Run with PowerShell, or:  powershell -ExecutionPolicy Bypass -File .\start.ps1
#         .\start.ps1 -Dev      (development mode with hot reload instead of the faster production build)
#         .\start.ps1 -Rebuild  (force a fresh production build)
# Or double-click "Start MEK Sales Hub.cmd" in the repo root: same as .\start.ps1, and the browser opens when the app is ready.
param([switch]$Dev, [switch]$Rebuild)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:Path = "C:\Program Files\nodejs;$env:Path"
$AppUrl = 'http://localhost:3000'

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

# Any HTTP answer (also 401/500) means the app is listening
function AppIsUp {
  try { Invoke-WebRequest "$AppUrl/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null; $true } catch { [bool]$_.Exception.Response }
}

# Opens the browser from a hidden helper as soon as the app answers (npm start keeps this window busy)
function OpenBrowserWhenReady {
  $wait = "for (`$i = 0; `$i -lt 300; `$i++) { try { Invoke-WebRequest $AppUrl/api/health -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { if (`$_.Exception.Response) { break }; Start-Sleep 1 } }; Start-Process $AppUrl"
  Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -Command `"$wait`""
}

# Production build only when the code changed since the last build (a fresh clone or git pull triggers one)
function NeedsBuild {
  if ($Rebuild -or -not (Test-Path '.next\BUILD_ID')) { return $true }
  $built = (Get-Item '.next\BUILD_ID').LastWriteTime
  $newer = Get-ChildItem src, public, package-lock.json, next.config.ts, .env.local -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -gt $built } | Select-Object -First 1
  return [bool]$newer
}

if (AppIsUp) {
  Write-Host "MEK Sales Hub is already running: $AppUrl" -ForegroundColor Green
  Start-Process $AppUrl
  exit 0
}

Step 'Docker Desktop'
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Start-Process "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe" -ErrorAction SilentlyContinue
  Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
  Write-Host 'Waiting for Docker...'
  for ($i = 0; $i -lt 90; $i++) { Start-Sleep 2; docker info *> $null; if ($LASTEXITCODE -eq 0) { break } }
}

$installed = 'node_modules\.package-lock.json'
if (-not (Test-Path $installed) -or (Get-Item package-lock.json).LastWriteTime -gt (Get-Item $installed).LastWriteTime) {
  Step 'Installing packages (first start takes a few minutes)'
  npm install
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed (see the messages above)' }
}

Step 'Database (PostgreSQL + PostgREST)'
node scripts/db.mjs start
if ($LASTEXITCODE -ne 0) { throw 'Database did not start (see the messages above)' }

Step 'n8n'
$state = docker inspect -f '{{.State.Status}}' mek-n8n 2>$null
if ($state -and $state -ne 'running') { docker start mek-n8n | Out-Null }
if ($state) { Write-Host 'n8n is running (http://localhost:5678)' } else { Write-Host 'n8n is not installed yet: run  npm run n8n:setup  (see README)' -ForegroundColor Yellow }

if ($Dev) {
  Step "App (development) on $AppUrl"
  OpenBrowserWhenReady
  npm run dev
} else {
  if (NeedsBuild) {
    Step 'Building the app (takes about a minute)'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed (see the messages above)' }
  } else {
    Step 'App is up to date, no build needed (.\start.ps1 -Rebuild forces one)'
  }
  Step "App on $AppUrl (keep this window open; closing it stops the app)"
  OpenBrowserWhenReady
  $ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback|Docker' -and $_.IPAddress -notlike '169.254*' } | Select-Object -ExpandProperty IPAddress
  foreach ($ip in $ips) { Write-Host "Colleagues on the network: http://$($ip):3000" -ForegroundColor Green }
  npm start
}
