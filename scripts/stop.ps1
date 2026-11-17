# PowerShell Stop Script for Sankalp SSO
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Red
Write-Host "  Stopping Sankalp SSO Services" -ForegroundColor Red
Write-Host "==========================================================" -ForegroundColor Red

# Run python manager stop
python scripts/manager.py stop

# Double-check and force-release any lingering ports
$Ports = @(8000, 5173, 5174, 5175)
foreach ($Port in $Ports) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($conns) {
            foreach ($c in $conns) {
                if ($c.OwningProcess -gt 0) {
                    Write-Host "Force closing process $($c.OwningProcess) on port $Port..." -ForegroundColor Yellow
                    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
                }
            }
        }
    } catch {}
}

Write-Host "System fully stopped. All ports released." -ForegroundColor Green
