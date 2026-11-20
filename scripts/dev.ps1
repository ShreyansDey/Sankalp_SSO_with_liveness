# PowerShell Development Launcher for Windows
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Sankalp SSO Development Environment" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Resolve Python command (venv if exists, otherwise system python)
$VenvPath = "$RootDir/backend/.venv/Scripts/python.exe"
if (Test-Path $VenvPath) {
    $PyCmd = "& '$VenvPath'"
    $PyDirect = $VenvPath
} else {
    $PyCmd = "python"
    $PyDirect = "python"
}

# Run database seed
Write-Host "Checking seed data..." -ForegroundColor Yellow
& $PyDirect "$RootDir/backend/seed.py"

# Start Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/backend'; $PyCmd -m uvicorn app.main:app --reload --port 8001"

# Start Demo Apps
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/demo-apps'; $PyCmd serve_demo_apps.py"

# Start Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/frontend'; npm run dev"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "All processes started in separate interactive windows." -ForegroundColor Green
Write-Host "• Central Login: http://localhost:5180"
Write-Host "• Backend Docs : http://localhost:8001/docs"
Write-Host "• Demo App A   : http://localhost:5174"
Write-Host "• Demo App B   : http://localhost:5175"
Write-Host "==========================================================" -ForegroundColor Green
