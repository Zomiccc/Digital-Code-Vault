<#
.SYNOPSIS
  Prepares a deployment-ready zip for Hostinger Node.js App.

.DESCRIPTION
  This script:
  1. Builds the TypeScript (shared package + API)
  2. Sets the Prisma provider to postgresql
  3. Generates the Prisma client with Linux binary targets (for Hostinger)
  4. Creates a zip with everything needed, including the pre-generated Prisma client

  The resulting zip can be uploaded to Hostinger's Node.js App without
  needing `npx prisma generate` to run on the server.

.PARAMETER DatabaseUrl
  The PostgreSQL connection string (e.g. postgresql://user:pass@host:5432/db)
  If not provided, reads from DATABASE_URL env var or apps/api/.env

.PARAMETER OutputDir
  Where to save the zip. Defaults to ./deploy-output

.EXAMPLE
  .\prepare-deploy.ps1 -DatabaseUrl "postgresql://user:pass@host:5432/db"
  .\prepare-deploy.ps1  # reads DATABASE_URL from env or .env
#>

param(
  [string]$DatabaseUrl = "",
  [string]$OutputDir = "./deploy-output"
)

$ErrorActionPreference = "Stop"

Write-Host "=== prepare-deploy.ps1 ===" -ForegroundColor Cyan

# --- Step 0: Resolve DATABASE_URL ---
if (-not $DatabaseUrl) {
  $DatabaseUrl = $env:DATABASE_URL
}
if (-not $DatabaseUrl) {
  $envPath = "apps/api/.env"
  if (Test-Path $envPath) {
    $envContent = Get-Content $envPath
    foreach ($line in $envContent) {
      if ($line -match '^DATABASE_URL\s*=\s*(.+)$') {
        $DatabaseUrl = $matches[1].Trim('"').Trim("'")
        break
      }
    }
  }
}
if (-not $DatabaseUrl) {
  Write-Host "ERROR: DATABASE_URL not provided." -ForegroundColor Red
  Write-Host "Usage: .\prepare-deploy.ps1 -DatabaseUrl `"postgresql://user:pass@host:5432/db`"" -ForegroundColor Yellow
  Write-Host "Or set DATABASE_URL env var, or create apps/api/.env with DATABASE_URL" -ForegroundColor Yellow
  exit 1
}

if ($DatabaseUrl -notmatch '^postgresql://|^postgres://') {
  Write-Host "ERROR: DATABASE_URL must be a PostgreSQL connection string (got: $DatabaseUrl)" -ForegroundColor Red
  exit 1
}

Write-Host "DATABASE_URL: $($DatabaseUrl -replace '://([^:]+):([^@]+)@', '://$1:****@')" -ForegroundColor Green

# --- Step 1: Install dependencies ---
Write-Host "`n--- Step 1: Installing dependencies ---" -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed" -ForegroundColor Red; exit 1 }

# --- Step 2: Build shared package ---
Write-Host "`n--- Step 2: Building shared package ---" -ForegroundColor Cyan
npm run build:shared
if ($LASTEXITCODE -ne 0) { Write-Host "build:shared failed" -ForegroundColor Red; exit 1 }

# --- Step 3: Build API ---
Write-Host "`n--- Step 3: Building API ---" -ForegroundColor Cyan
npm run build:api
if ($LASTEXITCODE -ne 0) { Write-Host "build:api failed" -ForegroundColor Red; exit 1 }

# --- Step 4: Set Prisma provider to postgresql ---
Write-Host "`n--- Step 4: Setting Prisma provider ---" -ForegroundColor Cyan
$env:DATABASE_URL = $DatabaseUrl
Push-Location apps/api
node prisma/set-provider.js
if ($LASTEXITCODE -ne 0) { Write-Host "set-provider.js failed" -ForegroundColor Red; Pop-Location; exit 1 }

# --- Step 5: Generate Prisma client (with Linux binary targets) ---
Write-Host "`n--- Step 5: Generating Prisma client ---" -ForegroundColor Cyan
npx prisma generate --schema=prisma/schema.prisma
if ($LASTEXITCODE -ne 0) { Write-Host "prisma generate failed" -ForegroundColor Red; Pop-Location; exit 1 }

# Verify generation
$prismaClientPath = "node_modules/.prisma/client"
$hoistedPrismaPath = "../../node_modules/.prisma/client"
if (Test-Path $prismaClientPath) {
  Write-Host "OK: Prisma client generated at $prismaClientPath" -ForegroundColor Green
} elseif (Test-Path $hoistedPrismaPath) {
  Write-Host "OK: Prisma client generated at $hoistedPrismaPath (hoisted)" -ForegroundColor Green
} else {
  Write-Host "WARNING: Prisma client not found in expected locations" -ForegroundColor Yellow
}

Pop-Location

# --- Step 6: Create deployment zip ---
Write-Host "`n--- Step 6: Creating deployment zip ---" -ForegroundColor Cyan

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$zipPath = Join-Path $OutputDir "deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss').zip"

# Define what to include in the zip
$includePatterns = @(
  "apps/api/dist",
  "apps/api/prisma",
  "apps/api/package.json",
  "apps/api/deploy-build.sh",
  "apps/api/nodemailer.d.ts",
  "packages/shared/dist",
  "packages/shared/package.json",
  "package.json",
  "package-lock.json"
)

# Also include node_modules/.prisma and node_modules/@prisma/client (generated output)
# These are the pre-generated Prisma client files
$prismaNodeModules = @(
  "node_modules/.prisma",
  "node_modules/@prisma/client"
)

# Check which Prisma paths exist
$prismaPaths = @()
foreach ($p in $prismaNodeModules) {
  if (Test-Path $p) {
    $prismaPaths += $p
    Write-Host "Including: $p" -ForegroundColor Gray
  }
}
# Also check apps/api/node_modules/.prisma
if (Test-Path "apps/api/node_modules/.prisma") {
  $prismaPaths += "apps/api/node_modules/.prisma"
  Write-Host "Including: apps/api/node_modules/.prisma" -ForegroundColor Gray
}
if (Test-Path "apps/api/node_modules/@prisma/client") {
  $prismaPaths += "apps/api/node_modules/@prisma/client"
  Write-Host "Including: apps/api/node_modules/@prisma/client" -ForegroundColor Gray
}

Write-Host "`nCreating zip: $zipPath" -ForegroundColor Green

# Use Compress-Archive to create the zip
$filesToZip = @()
foreach ($pattern in $includePatterns) {
  if (Test-Path $pattern) {
    $filesToZip += $pattern
    Write-Host "Including: $pattern" -ForegroundColor Gray
  }
}
foreach ($p in $prismaPaths) {
  $filesToZip += $p
}

# Create the zip
Compress-Archive -Path $filesToZip -DestinationPath $zipPath -Force

$zipSize = (Get-Item $zipPath).Length / 1MB
Write-Host "`nZip created: $zipPath ($('{0:N1}' -f $zipSize) MB)" -ForegroundColor Green

# --- Step 7: Restore local dev state ---
Write-Host "`n--- Step 7: Restoring local dev state ---" -ForegroundColor Cyan
Push-Location apps/api
$env:DATABASE_URL = ""  # Clear so set-provider defaults to sqlite
node prisma/set-provider.js 2>$null  # This will try to read .env for local DATABASE_URL
Pop-Location

Write-Host "`n=== Done! ===" -ForegroundColor Cyan
Write-Host @"
Next steps:
1. Upload $zipPath to Hostinger Node.js App
2. Set these env vars in Hostinger dashboard:
   - DATABASE_URL=$($DatabaseUrl -replace '://([^:]+):([^@]+)@', '://$1:****@')
   - NODE_ENV=production
   - JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, etc.
3. Set Build command to: bash apps/api/deploy-build.sh
4. Set Entry file to: apps/api/dist/main.js (or apps/api/dist/src/main.js)
5. The pre-generated Prisma client is included in the zip,
   so `prisma generate` on the server is optional (but recommended
   as a fallback via deploy-build.sh)
"@ -ForegroundColor Yellow
