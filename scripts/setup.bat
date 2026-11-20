@echo off
cd /d "%~dp0\.."
echo ==========================================================
echo   Setting up Sankalp SSO Environment
echo ==========================================================
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 %*
