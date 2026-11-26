# PowerShell Start Script for Sankalp SSO
[CmdletBinding()]
param(
    [switch]$Background,
    [switch]$Foreground,
    [switch]$Windowed
)

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Sankalp SSO & Digital Identity System" -ForegroundColor Cyan
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

# Pre-flight: Clean up existing instances if ports are already occupied
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

if ($Foreground) {
    & $PyDirect "$RootDir/scripts/manager.py" start --fg
} elseif ($Background) {
    & $PyDirect "$RootDir/scripts/manager.py" start
} else {
    # Default / Windowed mode: launches in live interactive windows with live logs
    Write-Host "Launching services in live interactive windows..." -ForegroundColor Yellow
    
    # 1. Seed database first
    & $PyDirect "$RootDir/backend/seed.py"

    # 2. Backend Server (FastAPI on Port 8001)
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.ui.RawUI.WindowTitle = 'Sankalp SSO - Backend API (Port 8001)'; cd '$RootDir/backend'; $PyCmd -m uvicorn app.main:app --reload --reload-dir app --port 8001"
    
    # 3. 5 Connected Campus Clubs (Ports 5174 through 5178)
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.ui.RawUI.WindowTitle = 'Sankalp SSO - Campus Clubs (Ports 5174-5178)'; cd '$RootDir/demo-apps'; $PyCmd serve_demo_apps.py"
    
    # 4. Central Login & Clubs Hub (Vite on Port 5180)
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.ui.RawUI.WindowTitle = 'Sankalp SSO - Central Login Portal (Port 5180)'; cd '$RootDir/frontend'; npm run dev"

    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  🎉 All services launched successfully!" -ForegroundColor Green
    Write-Host "  • Central Login & Clubs Hub : http://localhost:5180" -ForegroundColor Green
    Write-Host "  • Backend API & Docs        : http://localhost:8001/docs" -ForegroundColor Green
    Write-Host "  • 1. Photography Club       : http://localhost:5174" -ForegroundColor Green
    Write-Host "  • 2. Robotics Lab           : http://localhost:5175" -ForegroundColor Green
    Write-Host "  • 3. Coding & AI Club       : http://localhost:5176" -ForegroundColor Green
    Write-Host "  • 4. Chess Club             : http://localhost:5177" -ForegroundColor Green
    Write-Host "  • 5. Athletics Club         : http://localhost:5178" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "To stop all services later, run: .\scripts\stop.ps1" -ForegroundColor Cyan
}
