@echo off
cd /d "%~dp0\.."
echo ==========================================================
echo   Stopping Sankalp SSO Services
echo ==========================================================
python scripts\manager.py stop
