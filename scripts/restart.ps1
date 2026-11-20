# PowerShell Restart Script for Sankalp SSO
[CmdletBinding()]
param(
    [switch]$Background,
    [switch]$Foreground,
    [switch]$Windowed
)

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Restarting Sankalp SSO Services" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Fully stop all services
& "$PSScriptRoot/stop.ps1"
Start-Sleep -Seconds 1

# 2. Start all services forwarding flags
$startArgs = @()
if ($Background) { $startArgs += "-Background" }
if ($Foreground) { $startArgs += "-Foreground" }
if ($Windowed) { $startArgs += "-Windowed" }

& "$PSScriptRoot/start.ps1" @startArgs
