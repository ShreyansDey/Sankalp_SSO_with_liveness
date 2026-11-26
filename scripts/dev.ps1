# PowerShell Development Launcher for Windows
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Sankalp SSO Development Environment" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Resolve Python command (venv if exists, otherwise system python)
$PythonCandidates = @(
    "$RootDir/venv/Scripts/python.exe",
    "$RootDir/san_venv/Scripts/python.exe",
    "$RootDir/.venv/Scripts/python.exe",
    "$RootDir/backend/.venv/Scripts/python.exe"
)
$PyDirect = "python"
foreach ($cand in $PythonCandidates) {
    if (Test-Path $cand) {
        $PyDirect = $cand
        break
    }
}
$PyCmd = if ($PyDirect -eq "python") { "python" } else { "& '$PyDirect'" }

# Pre-flight port check
$TargetPorts = @(8001, 5180, 5174, 5175, 5176, 5177, 5178)
$inUse = @()
foreach ($Port in $TargetPorts) {
    $c = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($c) { $inUse += $Port }
}
if ($inUse.Count -gt 0) {
    Write-Host "⚠️ Ports in use: $($inUse -join ', '). Releasing old processes..." -ForegroundColor Yellow
    & "$PSScriptRoot/stop.ps1"
    Start-Sleep -Seconds 1
}

# Run database seed
Write-Host "Checking seed data..." -ForegroundColor Yellow
& $PyDirect "$RootDir/backend/seed.py"

# Start Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.ui.RawUI.WindowTitle = 'Sankalp SSO - Backend API (Port 8001)'; cd '$RootDir/backend'; $PyCmd -m uvicorn app.main:app --reload --reload-dir app --port 8001"

# Start Demo Apps
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.ui.RawUI.WindowTitle = 'Sankalp SSO - Campus Clubs (Ports 5174-5178)'; cd '$RootDir/demo-apps'; $PyCmd serve_demo_apps.py"

# Start Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.ui.RawUI.WindowTitle = 'Sankalp SSO - Central Login Portal (Port 5180)'; cd '$RootDir/frontend'; npm run dev"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "All processes started in separate interactive windows." -ForegroundColor Green
Write-Host "• Central Login: http://localhost:5180"
Write-Host "• Backend Docs : http://localhost:8001/docs"
Write-Host "• Demo App A   : http://localhost:5174"
Write-Host "• Demo App B   : http://localhost:5175"
Write-Host "==========================================================" -ForegroundColor Green
