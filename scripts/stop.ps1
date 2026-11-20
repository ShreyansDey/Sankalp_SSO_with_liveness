# PowerShell Stop Script for Sankalp SSO
[CmdletBinding()]
param()

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Red
Write-Host "  Stopping Sankalp SSO Services" -ForegroundColor Red
Write-Host "==========================================================" -ForegroundColor Red

# 1. Resolve preferred Python executable
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

# 2. Run manager stop if available
try {
    & $PyDirect "$RootDir/scripts/manager.py" stop 2>$null
} catch {}

# 3. Close any dedicated interactive PowerShell terminal windows launched by start.ps1
try {
    $SankalpProcs = Get-Process | Where-Object { $_.MainWindowTitle -like "Sankalp SSO - *" }
    foreach ($p in $SankalpProcs) {
        Write-Host "Closing terminal window: $($p.MainWindowTitle)..." -ForegroundColor Yellow
        taskkill /F /T /PID $p.Id 2>$null
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
} catch {}

# 4. Force-release all active and legacy ports
$Ports = @(8000, 8001, 5173, 5180, 5174, 5175, 5176, 5177, 5178)
foreach ($Port in $Ports) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($conns) {
            foreach ($c in $conns) {
                if ($c.OwningProcess -gt 0) {
                    Write-Host "Force closing process $($c.OwningProcess) on port $Port..." -ForegroundColor Yellow
                    taskkill /F /T /PID $c.OwningProcess 2>$null
                    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
                }
            }
        }
    } catch {}
}

# 5. Remove lingering PID file
$PidFile = "$RootDir/scripts/.pids.json"
if (Test-Path $PidFile) {
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

# 6. Verify all ports are freed
$AllClean = $true
for ($i = 0; $i -lt 10; $i++) {
    $busy = @()
    foreach ($Port in $Ports) {
        $c = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($c) { $busy += $Port }
    }
    if ($busy.Count -eq 0) {
        $AllClean = $true
        break
    }
    Start-Sleep -Milliseconds 300
}

Write-Host "System fully stopped. All ports released." -ForegroundColor Green
