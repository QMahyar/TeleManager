#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
python -m uvicorn telemanager.main:app --app-dir src --reload
