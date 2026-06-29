#Requires -Version 5.1
<#
.SYNOPSIS
  UCBS → Railway (all-in-one Docker deploy)

.EXAMPLE
  .\scripts\railway-deploy.ps1 -VarsOnly
  .\scripts\railway-deploy.ps1
#>
param(
  [switch]$VarsOnly,
  [switch]$SkipCheck,
  [switch]$FirebaseVarsOnly,
  [switch]$NoVarsPush
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$env:NODE_OPTIONS = '--use-system-ca'

Write-Host "UCBS Railway Deploy`n" -ForegroundColor Cyan

if (-not (Test-Path 'backend\.env.railway')) {
  Write-Host 'Create backend\.env.railway from backend\.env.railway.example first.' -ForegroundColor Yellow
  Copy-Item 'backend\.env.railway.example' 'backend\.env.railway'
  Write-Host 'Template copied — fill secrets, then re-run.' -ForegroundColor Yellow
  exit 1
}

if (-not $SkipCheck) {
  node --env-file=backend/.env.railway scripts/predeploy-check.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $NoVarsPush) {
  Write-Host "Syncing variables to Railway…" -ForegroundColor Cyan
  if ($FirebaseVarsOnly) {
    node scripts/push-railway-firebase-vars.mjs
  } else {
    node scripts/push-railway-vars.mjs
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Variable sync failed (SSL?). Keys may already be on Railway — continue in Dashboard.' -ForegroundColor Yellow
  }
}

if ($VarsOnly) {
  Write-Host 'Variables synced. Run: npm run railway:up' -ForegroundColor Green
  exit 0
}

Write-Host "Deploying (railway up)…" -ForegroundColor Cyan
railway up --detach -y
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nDeploy started. Open Railway dashboard for logs and public URL." -ForegroundColor Green
Write-Host "After URL is live: set FRONTEND_URL + FRONTEND_URLS, Firebase authorized domain, Stripe webhook."
