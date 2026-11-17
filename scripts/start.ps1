# PowerShell Start Script for Sankalp SSO
[CmdletBinding()]
param(
    [switch]$Background,
    [switch]$Foreground
)

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Sankalp SSO & Digital Identity System" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if ($Background) {
    python scripts/manager.py start
} elseif ($Foreground) {
    python scripts/manager.py start --fg
} else {
    Write-Host "Launching services in live interactive windows..." -ForegroundColor Yellow
    python backend/seed.py
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/backend'; python -m uvicorn app.main:app --reload --port 8000"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/demo-apps'; python serve_demo_apps.py"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/frontend'; npm run dev"

    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  🎉 All services launched successfully!" -ForegroundColor Green
    Write-Host "  • Central Login & Admin : http://localhost:5173" -ForegroundColor Green
    Write-Host "  • Backend API & Docs    : http://localhost:8000/docs" -ForegroundColor Green
    Write-Host "  • Demo App A (Photo)    : http://localhost:5174" -ForegroundColor Green
    Write-Host "  • Demo App B (Robotics) : http://localhost:5175" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "To stop all services later, run: .\scripts\stop.ps1" -ForegroundColor Cyan
}
