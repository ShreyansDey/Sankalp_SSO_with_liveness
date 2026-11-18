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
    $VenvPython = "$RootDir/backend/.venv/Scripts/python.exe"
    & "$VenvPython" "$RootDir/backend/seed.py"

    # 1. Backend Server (FastAPI on Port 8000)
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/backend'; & '$VenvPython' -m uvicorn app.main:app --reload --port 8000"
    
    # 2. 5 Connected Campus Clubs (Ports 5174 through 5178)
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/demo-apps'; & '$VenvPython' serve_demo_apps.py"
    
    # 3. Central Login & Clubs Hub (Vite on Port 5173)
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/frontend'; npm run dev"

    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  🎉 All services launched successfully!" -ForegroundColor Green
    Write-Host "  • Central Login & Clubs Hub : http://localhost:5173" -ForegroundColor Green
    Write-Host "  • Backend API & Docs        : http://localhost:8000/docs" -ForegroundColor Green
    Write-Host "  • 1. Photography Club       : http://localhost:5174" -ForegroundColor Green
    Write-Host "  • 2. Robotics Lab           : http://localhost:5175" -ForegroundColor Green
    Write-Host "  • 3. Coding & AI Club       : http://localhost:5176" -ForegroundColor Green
    Write-Host "  • 4. Chess Club             : http://localhost:5177" -ForegroundColor Green
    Write-Host "  • 5. Athletics Club         : http://localhost:5178" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "To stop all services later, run: .\scripts\stop.ps1" -ForegroundColor Cyan
}
