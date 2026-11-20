# PowerShell Status Check for Sankalp SSO
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

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

& $PyDirect "$RootDir/scripts/manager.py" status
