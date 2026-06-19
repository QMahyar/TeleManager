from __future__ import annotations

import multiprocessing
import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def main() -> None:
    root = app_dir()
    os.environ.setdefault("TELEMANAGER_DATA_DIR", str(root / "data"))
    os.environ.setdefault("TELEMANAGER_SESSIONS_DIR", str(root / "sessions"))
    os.environ.setdefault("TELEMANAGER_FRONTEND_DIST_DIR", str(root / "web"))

    def open_browser() -> None:
        time.sleep(1)
        webbrowser.open("http://127.0.0.1:8000")

    threading.Thread(target=open_browser, daemon=True).start()

    from telemanager.main import app

    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False, workers=1)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
