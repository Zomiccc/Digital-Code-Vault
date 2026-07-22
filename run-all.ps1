$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Kill anything on ports 3000, 5173, 5174, 5175
foreach ($port in @(3000, 5173, 5174, 5175)) {
  try {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction Stop
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
  } catch {}
}

Write-Host "Installing dependencies..."
Push-Location (Join-Path $root "apps/api"); npm install --silent 2>&1 | Out-Null; Pop-Location
Push-Location (Join-Path $root "apps/admin"); npm install --silent 2>&1 | Out-Null; Pop-Location
Push-Location (Join-Path $root "apps/merchant"); npm install --silent 2>&1 | Out-Null; Pop-Location
Push-Location (Join-Path $root "apps/portal"); npm install --silent 2>&1 | Out-Null; Pop-Location
Write-Host "Dependencies installed."

Write-Host "Building API..."
Push-Location (Join-Path $root "apps/api"); npx nest build 2>&1 | Out-Null; Pop-Location
Write-Host "API built."

Write-Host "Starting all servers..."

$apiRoot = Join-Path $root "apps/api"
$adminRoot = Join-Path $root "apps/admin"
$merchantRoot = Join-Path $root "apps/merchant"
$portalRoot = Join-Path $root "apps/portal"

# Start each service as a persistent top-level PowerShell process so they survive this script exiting
$apiCmd = "Set-Location `"$apiRoot`"; node start.js"
$adminCmd = "Set-Location `"$adminRoot`"; npx vite --port 5173"
$merchantCmd = "Set-Location `"$merchantRoot`"; npx vite --port 5174"
$portalCmd = "Set-Location `"$portalRoot`"; npx vite --port 5175"

Start-Process -WindowStyle Hidden -FilePath "powershell" -ArgumentList "-NoProfile -Command `"$apiCmd`""
Start-Process -WindowStyle Hidden -FilePath "powershell" -ArgumentList "-NoProfile -Command `"$adminCmd`""
Start-Process -WindowStyle Hidden -FilePath "powershell" -ArgumentList "-NoProfile -Command `"$merchantCmd`""
Start-Process -WindowStyle Hidden -FilePath "powershell" -ArgumentList "-NoProfile -Command `"$portalCmd`""

Start-Sleep -Seconds 6

Write-Host ""
Write-Host "========================================="
Write-Host "  All servers starting!"
Write-Host "  API:      http://localhost:3000/api/v1"
Write-Host "  Admin:    http://localhost:5173"
Write-Host "  Merchant: http://localhost:5174"
Write-Host "  Portal:   http://localhost:5175"
Write-Host "========================================="
Write-Host ""
Write-Host "Admin login: admin@digitalcode.local / Admin123!@#"
Write-Host "Merchant login: merchant@test.com / Merchant123!@#"
