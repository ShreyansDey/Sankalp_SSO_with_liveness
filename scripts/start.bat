@echo off
cd /d "%~dp0\.."
echo ==========================================================
echo   Starting Sankalp SSO Services
echo ==========================================================
python scripts\manager.py start %*
