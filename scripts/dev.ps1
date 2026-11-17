# PowerShell Development Launcher for Windows
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Sankalp SSO Development Environment" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Run database seed
Write-Host "Checking seed data..." -ForegroundColor Yellow
python backend/seed.py

# Start Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; python -m uvicorn app.main:app --reload --port 8000"

# Start Demo Apps
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd demo-apps; python serve_demo_apps.py"

# Start Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "All processes started in separate windows." -ForegroundColor Green
Write-Host "Backend: http://localhost:8000"
Write-Host "Frontend: http://localhost:5173"
Write-Host "App A: http://localhost:5174"
Write-Host "App B: http://localhost:5175"
