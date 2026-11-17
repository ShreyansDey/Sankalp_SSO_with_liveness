@echo off
cd /d "%~dp0\.."
echo ==========================================================
echo   Starting Sankalp SSO Services
echo ==========================================================
powershell -ExecutionPolicy Bypass -File scripts\start.ps1 %*
