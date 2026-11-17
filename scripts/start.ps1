# PowerShell Start Script for Sankalp SSO
[CmdletBinding()]
param(
    [switch]$Foreground,
    [switch]$Windowed
)

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Sankalp SSO & Digital Identity System" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if ($Windowed) {
    Write-Host "Launching services in separate interactive windows..." -ForegroundColor Yellow
    python backend/seed.py
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/backend'; python -m uvicorn app.main:app --reload --port 8000"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/demo-apps'; python serve_demo_apps.py"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/frontend'; npm run dev"
    Write-Host "All processes launched in dedicated windows." -ForegroundColor Green
} else {
    $fgArg = if ($Foreground) { "--fg" } else { "" }
    python scripts/manager.py start $fgArg
}
