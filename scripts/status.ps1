# PowerShell Status Check for Sankalp SSO
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir
python scripts/manager.py status
