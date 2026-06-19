@echo off
python -m uvicorn telemanager.main:app --app-dir src --reload
