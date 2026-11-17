# PowerShell Restart Script for Sankalp SSO
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Restarting Sankalp SSO Services" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

& "$PSScriptRoot/stop.ps1"
Start-Sleep -Seconds 1
& "$PSScriptRoot/start.ps1"
