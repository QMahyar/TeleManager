@echo off
cd /d "%~dp0"
python -m uvicorn telemanager.main:app --app-dir src --reload
if errorlevel 1 pause
