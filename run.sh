#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
# Prefer the Windows py launcher pinned to 3.12 (avoids a shadowed `python`
# from another tool's venv on PATH); fall back to plain python elsewhere.
if command -v py >/dev/null 2>&1; then
  py -3.12 -m uvicorn telemanager.main:app --app-dir src --reload
else
  python -m uvicorn telemanager.main:app --app-dir src --reload
fi
