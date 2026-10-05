# MEK Sales Hub - start everything on this laptop (Windows PowerShell).
# Usage:  right-click > Run with PowerShell, or:  powershell -ExecutionPolicy Bypass -File .\start.ps1
#         .\start.ps1 -Dev      (development mode with hot reload instead of the faster production build)
param([switch]$Dev)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:Path = "C:\Program Files\nodejs;$env:Path"

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

Step 'Docker Desktop'
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Start-Process "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe" -ErrorAction SilentlyContinue
  Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
  Write-Host 'Waiting for Docker...'
  for ($i = 0; $i -lt 90; $i++) { Start-Sleep 2; docker info *> $null; if ($LASTEXITCODE -eq 0) { break } }
}

Step 'Database (Supabase)'
npx supabase start | Out-Null
Write-Host 'Supabase is running (Studio: http://localhost:54323)'

Step 'n8n'
$state = docker inspect -f '{{.State.Status}}' mek-n8n 2>$null
if ($state -and $state -ne 'running') { docker start mek-n8n | Out-Null }
if ($state) { Write-Host 'n8n is running (http://localhost:5678)' } else { Write-Host 'n8n is not installed yet: run  npm run n8n:setup  (see README)' -ForegroundColor Yellow }

if (-not (Test-Path node_modules)) { Step 'Installing packages'; npm install }

if ($Dev) {
  Step 'App (development) on http://localhost:3000'
  npm run dev
} else {
  Step 'Building the app (takes about a minute)'
  npm run build
  Step 'App on http://localhost:3000'
  $ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback|Docker' -and $_.IPAddress -notlike '169.254*' } | Select-Object -ExpandProperty IPAddress
  foreach ($ip in $ips) { Write-Host "Colleagues on the network: http://$($ip):3000" -ForegroundColor Green }
  npm start
}
