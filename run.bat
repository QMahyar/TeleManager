@echo off
REM Use the py launcher pinned to 3.12 so a shadowed `python` on PATH
REM (e.g. another tool's venv) can't hijack the interpreter and hide deps.
py -3.12 -m uvicorn telemanager.main:app --app-dir src --reload
