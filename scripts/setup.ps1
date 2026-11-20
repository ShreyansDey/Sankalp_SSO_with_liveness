# PowerShell Setup Script for Sankalp SSO
[CmdletBinding()]
param()

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  🛠️  Sankalp SSO System Environment Setup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Python
Write-Host "`n[1/4] Checking Python environment..." -ForegroundColor Yellow
$PythonCmd = "python"
try {
    $pyVersion = & $PythonCmd --version 2>&1
    Write-Host "   Detected: $pyVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Python is not found in PATH! Please install Python 3.9+." -ForegroundColor Red
    exit 1
}

# 2. Install/Verify Python Requirements
Write-Host "`n[2/4] Installing / verifying backend Python dependencies..." -ForegroundColor Yellow
& $PythonCmd -m pip install -r backend/requirements.txt --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Python dependencies installed successfully." -ForegroundColor Green
} else {
    Write-Host "   ⚠️ Pip reported a warning or error. Continuing..." -ForegroundColor Yellow
}

# 3. Check Node.js and Install Frontend Packages
Write-Host "`n[3/4] Checking Node.js & installing frontend dependencies..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>&1
    $npmVersion = npm --version 2>&1
    Write-Host "   Detected Node.js: $nodeVersion (npm: $npmVersion)" -ForegroundColor Green
    
    Set-Location "$RootDir/frontend"
    npm install --quiet
    Set-Location $RootDir
    Write-Host "   ✅ Frontend dependencies installed successfully." -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js or npm not found in PATH! Please install Node.js (v18+ recommended)." -ForegroundColor Red
    exit 1
}

# 4. Seed Database
Write-Host "`n[4/4] Seeding database schema and demo accounts..." -ForegroundColor Yellow
& $PythonCmd "$RootDir/backend/seed.py"

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  🎉 System setup complete and ready to run!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  To launch the whole setup, run:" -ForegroundColor White
Write-Host "    .\scripts\start.ps1" -ForegroundColor Yellow
Write-Host "  or:" -ForegroundColor White
Write-Host "    scripts\start.bat" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
