# PowerShell wrapper for creating new implementation plans
param(
    [string]$Title = "Next Generation Multi-Modal Identity Pipeline"
)

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

python scripts/create_plan.py "$Title"
