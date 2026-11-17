@echo off
cd /d "%~dp0\.."
echo ==========================================================
echo   Restarting Sankalp SSO Services
echo ==========================================================
python scripts\manager.py restart
